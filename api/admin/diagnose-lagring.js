// GET /api/admin/diagnose-lagring
// KUN LESING (pluss additiv sikring av rullerende backuper — ingenting slettes/endres).
//
// Sammenligner dagens fbs_state mot:
//   1. Nattens blob-backup (fbs_siste_backup)
//   2. De rullerende backupene fbs_backup_1..5
// og rapporterer hvilke elementer som fantes i backup men mangler nå.
//
// Sikrer i tillegg kopier: fbs_backup_N → fbs_bevart_N (30 dager TTL),
// slik at de ikke ruller ut mens vi undersøker. Additivt — sletter ingenting.
//
// Auth: Bearer-token med role=admin

import { Redis } from '@upstash/redis'
import { lesBackupBlob } from '../_backupKrypto.js'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const ARRAYS = ['prosjekter', 'befaringer', 'tildelinger', 'oppgaver', 'ansatte', 'serviceJobber', 'reklamasjoner', 'biler', 'rorPlaner']

function tellArrays(state) {
  const c = {}
  for (const k of ARRAYS) c[k] = Array.isArray(state?.[k]) ? state[k].length : 0
  return c
}

function beskrivItem(k, item, oppslagState) {
  // Tildelinger/oppgaver har ikke navn — slå opp ansatt og prosjekt
  if (k === 'tildelinger' || k === 'oppgaver') {
    const ansatt = (oppslagState?.ansatte || []).find(a => a.id === item.ansattId)
    const prosjekt = (oppslagState?.prosjekter || []).find(p => p.id === item.prosjektId)
    return {
      id: item.id,
      navn: [ansatt?.navn, prosjekt?.navn || item.tittel].filter(Boolean).join(' → '),
      adresse: [item.startDato, item.sluttDato].filter(Boolean).join(' – '),
      status: item.status || '',
    }
  }
  return {
    id: item.id,
    navn: item.navn || item.kontaktNavn || item.tittel || item.modell || '',
    adresse: item.adresse || '',
    status: item.status || '',
  }
}

// Finn elementer som finnes i `foer` men mangler i `naa` (per id)
function finnManglende(foer, naa) {
  const naaIds = new Set((naa || []).map(x => x.id))
  return (foer || []).filter(x => !naaIds.has(x.id))
}

// Prosjekter: oppdag også tap av innhold (framdriftsplan/sjekklister) på samme id
function finnInnholdstap(foerProsjekter, naaProsjekter) {
  const naaById = {}
  for (const p of naaProsjekter || []) naaById[p.id] = p
  const tap = []
  for (const foer of foerProsjekter || []) {
    const naa = naaById[foer.id]
    if (!naa) continue // dekkes av finnManglende
    const foerFaser = foer.framdriftsplan?.faser?.length || 0
    const naaFaser = naa.framdriftsplan?.faser?.length || 0
    const foerSjekk = foer.sjekklister?.length || 0
    const naaSjekk = naa.sjekklister?.length || 0
    if (naaFaser < foerFaser || naaSjekk < foerSjekk) {
      tap.push({
        id: foer.id, navn: foer.navn,
        framdriftFaser: `${foerFaser} → ${naaFaser}`,
        sjekklister: `${foerSjekk} → ${naaSjekk}`,
      })
    }
  }
  return tap
}

async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  const session = await redis.get(`fbs_session:${token}`)
  if (!session || session.role !== 'admin') return null
  return session
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).end()

  const bruker = await requireAdmin(req)
  if (!bruker) return res.status(403).json({ error: 'Krever admin-rolle' })

  try {
    const [state, sisteBackup, b1, b2, b3, b4, b5, bevart1] = await Promise.all([
      redis.get('fbs_state'),
      redis.get('fbs_siste_backup'),
      redis.get('fbs_backup_1'),
      redis.get('fbs_backup_2'),
      redis.get('fbs_backup_3'),
      redis.get('fbs_backup_4'),
      redis.get('fbs_backup_5'),
      redis.get('fbs_bevart_1'),
    ])

    // ── Additiv sikring: bevar rullerende backuper (kun første gang) ──
    if (!bevart1) {
      const rull = [b1, b2, b3, b4, b5]
      for (let i = 0; i < rull.length; i++) {
        if (rull[i]) await redis.set(`fbs_bevart_${i + 1}`, rull[i], { ex: 30 * 24 * 3600 })
      }
    }

    const rapport = {
      naa: {
        _updatedAt: state?._updatedAt || null,
        _updatedAtLesbar: state?._updatedAt ? new Date(state._updatedAt).toLocaleString('no-NO') : null,
        antall: tellArrays(state),
        _fieldTs: Object.fromEntries(
          Object.entries(state?._fieldTs || {}).map(([k, v]) => [k, new Date(v).toLocaleString('no-NO')])
        ),
      },
      rullerendeBackuper: [b1, b2, b3, b4, b5].map((b, i) => b ? {
        nokkel: `fbs_backup_${i + 1}`,
        tattTidspunkt: b._backedUpAt ? new Date(b._backedUpAt).toLocaleString('no-NO') : null,
        antall: tellArrays(b),
      } : null).filter(Boolean),
      bevart: !bevart1 ? 'Rullerende backuper er nå sikret som fbs_bevart_1..5 (30 dager)' : 'Allerede sikret tidligere',
    }

    // ── Sammenlign mot nattens blob-backup ──
    if (sisteBackup?.url) {
      rapport.nattbackup = {
        tidspunkt: sisteBackup.tidspunkt,
        url: sisteBackup.url,
        statistikk: sisteBackup.statistikk,
      }
      try {
        const blob = await lesBackupBlob(sisteBackup.url)
        const foer = blob.state || {}
        rapport.nattbackup.antall = tellArrays(foer)

        const manglende = {}
        for (const k of ARRAYS) {
          const tapte = finnManglende(foer[k], state?.[k])
          if (tapte.length > 0) manglende[k] = tapte.slice(0, 50).map(x => beskrivItem(k, x, foer))
        }
        rapport.manglerSidenNatt = Object.keys(manglende).length ? manglende : 'Ingen elementer mangler siden nattens backup'

        const innholdstap = finnInnholdstap(foer.prosjekter, state?.prosjekter)
        rapport.prosjektInnholdstap = innholdstap.length ? innholdstap : 'Ingen prosjekter har mistet framdrift/sjekklister siden natten'
      } catch (e) {
        rapport.nattbackup.feil = `Kunne ikke lese blob: ${e.message}`
      }
    } else {
      rapport.nattbackup = 'Ingen fbs_siste_backup funnet'
    }

    // ── Sammenlign også mot eldste rullerende backup ──
    const eldste = b5 || b4 || b3 || b2 || b1
    if (eldste) {
      const manglende = {}
      for (const k of ARRAYS) {
        const tapte = finnManglende(eldste[k], state?.[k])
        if (tapte.length > 0) manglende[k] = tapte.slice(0, 50).map(x => beskrivItem(k, x, eldste))
      }
      rapport.manglerSidenEldsteRullerende = Object.keys(manglende).length ? manglende : 'Ingen'
    }

    return res.status(200).json({ ok: true, rapport })
  } catch (e) {
    console.error('[diagnose-lagring] feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
