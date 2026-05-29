// POST /api/admin/dedup-befaringer
// Finn og fjern duplikate befaringer med samme normaliserte adresse+kontaktNavn.
// Beholder eldste (lavest timestamp i id), sletter nyere.
//
// Body:
//   { dry: true }   → forhåndsvisning (ingen endringer)
//   { dry: false }  → utfør sletting
//
// Auth: Bearer-token med role=admin

import { Redis } from '@upstash/redis'
import { appendAuditLog, appendSnapshot, byggAuditEntry } from '../_dataIntegritet.js'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

function norm(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Trekk ut Unix-ms fra id på formen "bf-{timestamp}-{rand}"
function idTs(id) {
  const parts = (id || '').split('-')
  return parseInt(parts[1] || '0', 10) || 0
}

async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  const session = await redis.get(`fbs_session:${token}`)
  if (!session || session.role !== 'admin') return null
  return session
}

export const config = {
  api: { bodyParser: { sizeLimit: '64kb' } },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const bruker = await requireAdmin(req)
  if (!bruker) return res.status(403).json({ error: 'Krever admin-rolle' })

  const { dry = true } = req.body || {}

  try {
    const state = (await redis.get('fbs_state')) || {}
    const befaringer = Array.isArray(state.befaringer) ? state.befaringer : []

    // Grupper etter normalisert adresse + kontaktNavn
    const grupper = {}
    for (const b of befaringer) {
      const key = `${norm(b.adresse)}|${norm(b.kontaktNavn)}`
      if (!grupper[key]) grupper[key] = []
      grupper[key].push(b)
    }

    // Behold kun grupper med >1 befaring
    const duplikatGrupper = Object.values(grupper).filter(g => g.length > 1)

    if (duplikatGrupper.length === 0) {
      return res.status(200).json({ ok: true, funnetDuplikater: 0, beskjed: 'Ingen duplikater funnet' })
    }

    // Bygg plan: eldste (lavest id-timestamp) beholdes, resten slettes
    const skalSlettesIds = new Set()
    const plan = duplikatGrupper.map(gruppe => {
      const sortert = [...gruppe].sort((a, b) => idTs(a.id) - idTs(b.id))
      const behold = sortert[0]
      const slett = sortert.slice(1)
      slett.forEach(b => skalSlettesIds.add(b.id))

      // Overfør tilbudId/tilbudLink fra nyere dup til keeper hvis keeper mangler
      const mergeFra = slett.find(b => b.tilbudId && !behold.tilbudId)
      return {
        behold: {
          id: behold.id,
          adresse: behold.adresse,
          kontaktNavn: behold.kontaktNavn,
          dato: behold.dato,
          status: behold.status,
          hasTilbudId: !!behold.tilbudId,
        },
        slett: slett.map(b => ({
          id: b.id,
          dato: b.dato,
          status: b.status,
          kilde: b.kilde || null,
          hasTilbudId: !!b.tilbudId,
        })),
        ...(mergeFra ? { mergeTilbudId: mergeFra.tilbudId } : {}),
      }
    })

    if (dry) {
      return res.status(200).json({
        ok: true,
        dry: true,
        duplikatGrupper: duplikatGrupper.length,
        skalSlettes: skalSlettesIds.size,
        gjenværendeEtter: befaringer.length - skalSlettesIds.size,
        plan,
      })
    }

    // ── Utfør ──
    // 1. Snapshot alle som slettes
    for (const b of befaringer.filter(b => skalSlettesIds.has(b.id))) {
      await appendSnapshot(redis, {
        objekt: 'befaring',
        objektId: b.id,
        dataFør: b,
        utløstAv: 'admin-dedup',
      })
    }

    // 2. Bygg ny befaringer-liste: filtrer ut duplikater + merge tilbudId på keeper
    const mergeMap = {}
    for (const gruppe of duplikatGrupper) {
      const sortert = [...gruppe].sort((a, b) => idTs(a.id) - idTs(b.id))
      const behold = sortert[0]
      const slett = sortert.slice(1)
      const kilde = slett.find(b => b.tilbudId && !behold.tilbudId)
      if (kilde) mergeMap[behold.id] = { tilbudId: kilde.tilbudId, tilbudLink: kilde.tilbudLink || '' }
    }

    const nyeBefaringer = befaringer
      .filter(b => !skalSlettesIds.has(b.id))
      .map(b => mergeMap[b.id] ? { ...b, ...mergeMap[b.id] } : b)

    const nowTs = Date.now()
    await redis.set('fbs_state', {
      ...state,
      befaringer: nyeBefaringer,
      _fieldTs: { ...(state._fieldTs || {}), befaringer: nowTs },
      _updatedAt: nowTs,
    })

    // 3. Audit-log per slettet befaring
    const endretAv = bruker.brukernavn || bruker.epost || 'admin'
    for (const b of befaringer.filter(b => skalSlettesIds.has(b.id))) {
      // Finn keeperId for denne gruppen
      const keeperKey = `${norm(b.adresse)}|${norm(b.kontaktNavn)}`
      const keeperId = grupper[keeperKey]?.find(x => !skalSlettesIds.has(x.id))?.id || 'ukjent'
      await appendAuditLog(redis, byggAuditEntry({
        objekt: 'befaring',
        objektId: b.id,
        felt: 'slettet',
        fraVerdi: b.status,
        tilVerdi: 'slettet-duplikat',
        endretAv,
        kilde: 'admin-dedup',
        begrunnelse: `Duplikat slettet av ${endretAv} — beholder: ${keeperId}`,
      }))
    }

    console.log(`[dedup] ${endretAv} slettet ${skalSlettesIds.size} duplikater, ${nyeBefaringer.length} befaringer igjen`)

    return res.status(200).json({
      ok: true,
      dry: false,
      slettet: skalSlettesIds.size,
      gjenværende: nyeBefaringer.length,
      plan,
    })
  } catch (e) {
    console.error('[dedup] feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
