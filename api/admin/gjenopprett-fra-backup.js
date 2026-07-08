// POST /api/admin/gjenopprett-fra-backup
// Gjenoppretter elementer som finnes i nattens blob-backup men mangler i
// dagens fbs_state. ADDITIVT: legger kun til manglende elementer — overskriver
// eller sletter ALDRI noe som finnes nå.
//
// Body:
//   { dry: true }                          → forhåndsvisning
//   { dry: false, felt: ['tildelinger'] }  → gjenopprett manglende i angitte felt
//   (uten felt: alle felt)
//
// Auth: Bearer-token med role=admin

import { Redis } from '@upstash/redis'
import { appendAuditLog, byggAuditEntry } from '../_dataIntegritet.js'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const ARRAYS = ['prosjekter', 'befaringer', 'tildelinger', 'oppgaver', 'ansatte', 'serviceJobber', 'reklamasjoner', 'biler', 'rorPlaner']

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

  const { dry = true, felt } = req.body || {}
  const feltListe = Array.isArray(felt) && felt.length ? felt.filter(f => ARRAYS.includes(f)) : ARRAYS

  try {
    const [state, sisteBackup] = await Promise.all([
      redis.get('fbs_state'),
      redis.get('fbs_siste_backup'),
    ])
    if (!state) return res.status(500).json({ error: 'Fant ikke fbs_state' })
    if (!sisteBackup?.url) return res.status(404).json({ error: 'Ingen nattbackup funnet (fbs_siste_backup mangler)' })

    const r = await fetch(sisteBackup.url)
    if (!r.ok) return res.status(502).json({ error: `Kunne ikke hente backup-blob: HTTP ${r.status}` })
    const blob = await r.json()
    const foer = blob.state || {}

    const nu = Date.now()
    const plan = {}
    let totalt = 0
    let nyState = { ...state }
    const nyFieldTs = { ...(state._fieldTs || {}) }

    for (const k of feltListe) {
      const foerArr = Array.isArray(foer[k]) ? foer[k] : []
      const naaArr = Array.isArray(state[k]) ? state[k] : []
      const naaIds = new Set(naaArr.map(x => x?.id))
      // Kun elementer som mangler HELT — aldri overskriv eksisterende
      const manglende = foerArr.filter(x => x && x.id != null && !naaIds.has(x.id))
      if (!manglende.length) continue
      plan[k] = manglende.map(x => ({ id: x.id, navn: x.navn || x.kontaktNavn || '', startDato: x.startDato || '', sluttDato: x.sluttDato || '' }))
      totalt += manglende.length
      if (!dry) {
        // Stemple _endret = nå slik at per-element-flettingen beholder dem
        // (vinner over ev. tombstones og utdaterte klient-kopier)
        nyState = { ...nyState, [k]: [...naaArr, ...manglende.map(x => ({ ...x, _endret: nu }))] }
        nyFieldTs[k] = nu
      }
    }

    if (dry || totalt === 0) {
      return res.status(200).json({
        ok: true, dry: true,
        backupTidspunkt: sisteBackup.tidspunkt,
        antallSomGjenopprettes: totalt,
        plan,
      })
    }

    nyState = { ...nyState, _fieldTs: nyFieldTs, _updatedAt: nu }
    await redis.set('fbs_state', nyState)

    const endretAv = bruker.brukernavn || bruker.epost || 'admin'
    for (const [k, items] of Object.entries(plan)) {
      await appendAuditLog(redis, byggAuditEntry({
        objekt: k, objektId: items.map(i => i.id).join(','),
        felt: 'gjenopprettet', fraVerdi: 'manglet', tilVerdi: `${items.length} elementer fra nattbackup`,
        endretAv, kilde: 'admin-gjenopprett',
        begrunnelse: `Gjenopprettet fra backup ${sisteBackup.tidspunkt} av ${endretAv}`,
      }))
    }

    console.log(`[gjenopprett] ${endretAv} gjenopprettet ${totalt} elementer fra ${sisteBackup.tidspunkt}`)

    return res.status(200).json({
      ok: true, dry: false,
      backupTidspunkt: sisteBackup.tidspunkt,
      gjenopprettet: totalt,
      plan,
    })
  } catch (e) {
    console.error('[gjenopprett] feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
