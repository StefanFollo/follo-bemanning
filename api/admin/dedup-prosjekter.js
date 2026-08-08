// POST /api/admin/dedup-prosjekter
// Finn og fjern duplikate prosjekter med samme normaliserte navn+adresse.
// Beholder den "rikeste" (flest tildelinger/oppgaver, har framdrift/tilbudId),
// sletter de andre og flytter alle referanser (tildelinger, oppgaver) til keeper.
//
// Body:
//   { dry: true }   → forhåndsvisning (ingen endringer)
//   { dry: false }  → utfør sletting + reassignering
//
// Auth: Bearer-token med role=admin

import { skrivStateOgBump } from '../_stateCas.js'
import { Redis } from '@upstash/redis'
import { appendAuditLog, appendSnapshot, byggAuditEntry } from '../_dataIntegritet.js'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

function norm(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Nøkkel: bruk adresse hvis satt, ellers fall tilbake på navn (som ofte er "Kunde — Adresse")
function dupNokkel(p) {
  const navn = norm(p.navn)
  const adr = norm(p.adresse)
  // Hvis navn inneholder "—" er adressen ofte siste del; bruk hele navnet som backup
  return adr ? `${navn}|${adr}` : navn
}

// Trekk ut Unix-ms fra id (13-sifret tall et sted i id-strengen)
function idTs(id) {
  const m = (id || '').match(/\d{13}/)
  return m ? parseInt(m[0], 10) : 0
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
    const prosjekter = Array.isArray(state.prosjekter) ? state.prosjekter : []
    const tildelinger = Array.isArray(state.tildelinger) ? state.tildelinger : []
    const oppgaver = Array.isArray(state.oppgaver) ? state.oppgaver : []

    // Tell referanser per prosjekt for å velge keeper
    const refTall = {}
    for (const t of tildelinger) refTall[t.prosjektId] = (refTall[t.prosjektId] || 0) + 1
    for (const o of oppgaver) refTall[o.prosjektId] = (refTall[o.prosjektId] || 0) + 1

    // "Rikhet" — keeper bør være den med mest data
    function rikhet(p) {
      let r = refTall[p.id] || 0
      if (Array.isArray(p.framdriftsplan?.faser) && p.framdriftsplan.faser.length) r += 100
      if (p.tilbudId) r += 50
      if (p.belop) r += 10
      if (Array.isArray(p.sjekklister) && p.sjekklister.length) r += 25
      return r
    }

    // Grupper etter normalisert navn+adresse
    const grupper = {}
    for (const p of prosjekter) {
      const key = dupNokkel(p)
      if (!key) continue
      ;(grupper[key] ||= []).push(p)
    }

    const duplikatGrupper = Object.values(grupper).filter(g => g.length > 1)

    if (duplikatGrupper.length === 0) {
      return res.status(200).json({ ok: true, funnetDuplikater: 0, beskjed: 'Ingen duplikater funnet' })
    }

    // Bygg plan: keeper = høyest rikhet, tie-break på eldste id-timestamp
    const skalSlettesIds = new Set()
    const keeperForId = {} // slettetId -> keeperId
    const plan = duplikatGrupper.map(gruppe => {
      const sortert = [...gruppe].sort((a, b) => {
        const dr = rikhet(b) - rikhet(a)
        if (dr !== 0) return dr
        return idTs(a.id) - idTs(b.id) // eldst først
      })
      const behold = sortert[0]
      const slett = sortert.slice(1)
      slett.forEach(p => { skalSlettesIds.add(p.id); keeperForId[p.id] = behold.id })

      return {
        behold: {
          id: behold.id, navn: behold.navn, adresse: behold.adresse,
          status: behold.status, refs: refTall[behold.id] || 0,
          harFramdrift: !!behold.framdriftsplan?.faser?.length,
          harTilbud: !!behold.tilbudId,
        },
        slett: slett.map(p => ({
          id: p.id, navn: p.navn, status: p.status,
          refs: refTall[p.id] || 0,
          harFramdrift: !!p.framdriftsplan?.faser?.length,
          harTilbud: !!p.tilbudId,
        })),
      }
    })

    if (dry) {
      return res.status(200).json({
        ok: true, dry: true,
        duplikatGrupper: duplikatGrupper.length,
        skalSlettes: skalSlettesIds.size,
        gjenværendeEtter: prosjekter.length - skalSlettesIds.size,
        refsSomFlyttes: tildelinger.filter(t => skalSlettesIds.has(t.prosjektId)).length
          + oppgaver.filter(o => skalSlettesIds.has(o.prosjektId)).length,
        plan,
      })
    }

    // ── Utfør ──
    // 1. Snapshot prosjekter som slettes
    for (const p of prosjekter.filter(p => skalSlettesIds.has(p.id))) {
      await appendSnapshot(redis, {
        objekt: 'prosjekt', objektId: p.id, dataFør: p, utløstAv: 'admin-dedup',
      })
    }

    // 2. Merge manglende felt fra slettede inn på keeper (framdrift/tilbud/belop/sjekklister/kunde)
    const keeperPatch = {}
    for (const gruppe of duplikatGrupper) {
      const sortert = [...gruppe].sort((a, b) => {
        const dr = rikhet(b) - rikhet(a)
        if (dr !== 0) return dr
        return idTs(a.id) - idTs(b.id)
      })
      const behold = sortert[0]
      const patch = {}
      for (const s of sortert.slice(1)) {
        if (!behold.framdriftsplan?.faser?.length && s.framdriftsplan?.faser?.length && !patch.framdriftsplan) patch.framdriftsplan = s.framdriftsplan
        if (!behold.tilbudId && s.tilbudId && !patch.tilbudId) { patch.tilbudId = s.tilbudId; if (s.tilbudLink) patch.tilbudLink = s.tilbudLink }
        if (!behold.belop && s.belop && !patch.belop) patch.belop = s.belop
        if (!(behold.sjekklister?.length) && s.sjekklister?.length && !patch.sjekklister) patch.sjekklister = s.sjekklister
        if (!behold.kunde && s.kunde && !patch.kunde) patch.kunde = s.kunde
      }
      if (Object.keys(patch).length) keeperPatch[behold.id] = patch
    }

    // 3. Ny prosjektliste: fjern duplikater + påfør patch på keeper
    const nyeProsjekter = prosjekter
      .filter(p => !skalSlettesIds.has(p.id))
      .map(p => keeperPatch[p.id] ? { ...p, ...keeperPatch[p.id] } : p)

    // 4. Flytt referanser (tildelinger + oppgaver) fra slettet → keeper
    const nyeTildelinger = tildelinger.map(t =>
      skalSlettesIds.has(t.prosjektId) ? { ...t, prosjektId: keeperForId[t.prosjektId] } : t
    )
    const nyeOppgaver = oppgaver.map(o =>
      skalSlettesIds.has(o.prosjektId) ? { ...o, prosjektId: keeperForId[o.prosjektId] } : o
    )

    const nowTs = Date.now()
    await skrivStateOgBump(redis, {
      ...state,
      prosjekter: nyeProsjekter,
      tildelinger: nyeTildelinger,
      oppgaver: nyeOppgaver,
      _fieldTs: { ...(state._fieldTs || {}), prosjekter: nowTs, tildelinger: nowTs, oppgaver: nowTs },
      _updatedAt: nowTs,
    })

    // 5. Audit-log
    const endretAv = bruker.brukernavn || bruker.epost || 'admin'
    for (const p of prosjekter.filter(p => skalSlettesIds.has(p.id))) {
      await appendAuditLog(redis, byggAuditEntry({
        objekt: 'prosjekt', objektId: p.id, felt: 'slettet',
        fraVerdi: p.status, tilVerdi: 'slettet-duplikat', endretAv,
        kilde: 'admin-dedup',
        begrunnelse: `Duplikat slettet av ${endretAv} — referanser flyttet til: ${keeperForId[p.id]}`,
      }))
    }

    console.log(`[dedup-prosjekter] ${endretAv} slettet ${skalSlettesIds.size} duplikater, ${nyeProsjekter.length} prosjekter igjen`)

    return res.status(200).json({
      ok: true, dry: false,
      slettet: skalSlettesIds.size,
      gjenværende: nyeProsjekter.length,
      plan,
    })
  } catch (e) {
    console.error('[dedup-prosjekter] feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
