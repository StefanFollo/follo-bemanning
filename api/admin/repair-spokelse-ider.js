// POST /api/admin/repair-spokelse-ider
// Etterpå-reparasjon av ghost kildeBefaringId-er i tilbuds-app.
//
// Body:
//   {
//     dry: false,          // true = forhåndsvisning, false = utfør reparasjon
//     items: [
//       { tilbudId, spokelse_id, adresse, kundenavn }
//     ]
//   }
//
// For hvert item: finner ekte befaring via normalisert adresse+kundenavn,
// og knytter tilbudId til den. Tilbuds-app-utvikler kan så oppdatere
// localStorage med korrekte kildeBefaringId-er.
//
// Auth: Bearer-token med role=admin

import { skrivStateOgBump } from '../_stateCas.js'
import { Redis } from '@upstash/redis'
import { appendAuditLog, byggAuditEntry } from '../_dataIntegritet.js'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

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

function normFn(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // fjern accents
    .replace(/[,\.]/g, ' ')                              // komma/punktum → space
    .replace(/\s+/g, ' ')                                // kollaps whitespace
    .trim()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const bruker = await requireAdmin(req)
  if (!bruker) return res.status(403).json({ error: 'Krever admin-rolle' })

  const { dry = true, items = [] } = req.body || {}

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Mangler items[]' })
  }

  try {
    const state = (await redis.get('fbs_state')) || {}
    const befaringer = Array.isArray(state.befaringer) ? state.befaringer : []

    const resultater = []
    let oppdatertBefaringer = [...befaringer]
    let antallRettet = 0

    for (const item of items) {
      const { tilbudId, spokelse_id, adresse, kundenavn } = item
      if (!adresse || !kundenavn) {
        resultater.push({ tilbudId, spokelse_id, status: 'feil', beskjed: 'Mangler adresse eller kundenavn' })
        continue
      }

      const kNorm = normFn(kundenavn)
      const aNorm = normFn(adresse)

      // Søk etter ekte befaring — hopp over arkiverte
      const matchBef = oppdatertBefaringer.find(b =>
        !['tapt', 'trukket'].includes(b.status) &&
        normFn(b.kontaktNavn) === kNorm &&
        normFn(b.adresse) === aNorm
      )

      if (!matchBef) {
        // Prøv også uten status-filter (bredere søk)
        const matchAlleStatuser = oppdatertBefaringer.find(b =>
          normFn(b.kontaktNavn) === kNorm && normFn(b.adresse) === aNorm
        )
        resultater.push({
          tilbudId, spokelse_id, adresse, kundenavn,
          status: matchAlleStatuser ? 'funnet-arkivert' : 'ikke-funnet',
          ekte_id: matchAlleStatuser?.id || null,
          ekte_status: matchAlleStatuser?.status || null,
          beskjed: matchAlleStatuser
            ? `Befaring funnet men status=${matchAlleStatuser.status} (arkivert?). Sjekk manuelt.`
            : `Ingen befaring funnet for "${kundenavn}" / "${adresse}"`,
        })
        continue
      }

      resultater.push({
        tilbudId, spokelse_id,
        adresse: matchBef.adresse,
        kundenavn: matchBef.kontaktNavn,
        status: dry ? 'ville-rettet' : 'rettet',
        ekte_id: matchBef.id,
        hadde_tilbudId: matchBef.tilbudId || null,
        ny_tilbudId: tilbudId,
        beskjed: dry
          ? `DRY RUN: Ville koblet tilbudId:${tilbudId} til ${matchBef.id}`
          : `Koblet tilbudId:${tilbudId} til ${matchBef.id}`,
      })

      if (!dry) {
        // Knytt tilbudId til ekte befaring
        oppdatertBefaringer = oppdatertBefaringer.map(b =>
          b.id === matchBef.id
            ? { ...b, tilbudId, tilbudId_reparert: spokelse_id }
            : b
        )
        antallRettet++
      }
    }

    if (!dry && antallRettet > 0) {
      const nowTs = Date.now()
      await skrivStateOgBump(redis, {
        ...state,
        befaringer: oppdatertBefaringer,
        _fieldTs: { ...(state._fieldTs || {}), befaringer: nowTs },
        _updatedAt: nowTs,
      })
      // Audit-log for hvert reparert par
      for (const r of resultater.filter(x => x.status === 'rettet')) {
        await appendAuditLog(redis, byggAuditEntry({
          objekt: 'befaring',
          objektId: r.ekte_id,
          felt: 'tilbudId',
          fraVerdi: r.hadde_tilbudId || null,
          tilVerdi: String(r.ny_tilbudId),
          endretAv: bruker.brukernavn || bruker.epost || 'admin',
          kilde: 'admin-repair-spokelse-ider',
          begrunnelse: `Ghost ID reparert: "${r.spokelse_id}" → ekte ${r.ekte_id}`,
        }))
      }
      console.log(`[repair-spokelse] ${bruker.epost || 'admin'} rettet ${antallRettet} ghost IDs`)
    }

    return res.status(200).json({
      ok: true,
      dry,
      antall_items: items.length,
      antall_rettet: dry ? 0 : antallRettet,
      antall_ikke_funnet: resultater.filter(r => r.status === 'ikke-funnet').length,
      resultater,
    })
  } catch (e) {
    console.error('[repair-spokelse] feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
