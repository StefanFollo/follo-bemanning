// api/sjekklister.js — lagrer og henter fullstendige sjekklister på prosjektet
//
// GET  ?prosjektId=xxx                       → returnerer prosjekt.sjekklister[]
// POST { prosjektId, sjekklister: [...] }    → legger til sjekklister på prosjektet
// PUT  { prosjektId, sjekklisteId, punktId?, status, kommentar? }
//                                            → oppdaterer punkt-status eller sjekkliste-status
//
// Sjekklister lagres direkte på prosjekt-objektet i fbs_state (Redis),
// ikke i den separate fbs_ks_sjekklister-nøkkelen.

import { skrivStateOgBump } from './_stateCas.js'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export const config = {
  api: { bodyParser: { sizeLimit: '512kb' } },
}

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

function nyId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function beregnSjekklisteStatus(punkter) {
  const alleBehandlet = punkter.every(p => p.status !== 'ikke-utfort')
  if (!alleBehandlet) return punkter.some(p => p.status !== 'ikke-utfort') ? 'i-arbeid' : 'ikke-startet'
  return punkter.some(p => p.status === 'avvik') ? 'avvik' : 'fullfort'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const session = await getSession(req)
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  const state = (await redis.get('fbs_state')) || {}
  const prosjekter = Array.isArray(state.prosjekter) ? state.prosjekter : []

  // ── GET: hent sjekklister for et prosjekt ──────────────────────────────────
  if (req.method === 'GET') {
    const { prosjektId } = req.query
    if (!prosjektId) return res.status(400).json({ error: 'Mangler prosjektId' })
    const prosjekt = prosjekter.find(p => p.id === prosjektId)
    if (!prosjekt) return res.status(404).json({ error: 'Prosjekt ikke funnet' })
    return res.status(200).json(prosjekt.sjekklister || [])
  }

  // ── POST: legg til nye sjekklister på et prosjekt ─────────────────────────
  if (req.method === 'POST') {
    const { prosjektId, sjekklister: innkommende } = req.body || {}
    if (!prosjektId) return res.status(400).json({ error: 'Mangler prosjektId' })
    if (!Array.isArray(innkommende) || innkommende.length === 0) {
      return res.status(400).json({ error: 'Mangler sjekklister[] (tom liste)' })
    }

    const prosjektIdx = prosjekter.findIndex(p => p.id === prosjektId)
    if (prosjektIdx < 0) return res.status(404).json({ error: 'Prosjekt ikke funnet' })

    const prosjekt = prosjekter[prosjektIdx]
    const eksisterende = prosjekt.sjekklister || []

    const validerte = innkommende.map(sl => ({
      id: sl.id || nyId('sl'),
      navn: (sl.navn || 'Sjekkliste').trim(),
      fase: sl.fase || 'bygg',
      fag: sl.fag || 'alle',
      ikon: sl.ikon || '📋',
      opprettet: sl.opprettet || new Date().toISOString(),
      opprettetAv: session.navn || session.email || 'ukjent',
      status: 'ikke-startet',
      punkter: (sl.punkter || []).map(p => ({
        id: p.id || nyId('p'),
        tekst: (p.tekst || '').trim(),
        kritisk: !!p.kritisk,
        regelverk: p.regelverk || '',
        status: p.status || 'ikke-utfort',
        kommentar: '',
        utfortAv: null,
        utfortDato: null,
      })).filter(p => p.tekst),
    })).filter(sl => sl.navn && sl.punkter.length > 0)

    if (validerte.length === 0) {
      return res.status(400).json({ error: 'Ingen gyldige sjekklister (sjekk at navn og punkter er satt)' })
    }

    const merged = [...eksisterende, ...validerte]
    const nowTs = Date.now()

    await skrivStateOgBump(redis, {
      ...state,
      prosjekter: prosjekter.map((p, idx) =>
        idx === prosjektIdx ? { ...p, sjekklister: merged, _endret: nowTs } : p
      ),
      _fieldTs: { ...(state._fieldTs || {}), prosjekter: nowTs },
      _updatedAt: nowTs,
    })

    console.log(`[sjekklister] POST ${validerte.length} sjekklister → prosjekt:${prosjektId} av ${session.email || session.navn}`)
    return res.status(200).json({ ok: true, antall: validerte.length, ids: validerte.map(sl => sl.id) })
  }

  // ── PUT: oppdater punkt-status eller sjekkliste-status ─────────────────────
  if (req.method === 'PUT') {
    const { prosjektId, sjekklisteId, punktId, status, kommentar } = req.body || {}
    if (!prosjektId || !sjekklisteId) {
      return res.status(400).json({ error: 'Mangler prosjektId eller sjekklisteId' })
    }

    const oppdatertProsjekter = prosjekter.map(p => {
      if (p.id !== prosjektId) return p
      const sjekklister = (p.sjekklister || []).map(sl => {
        if (sl.id !== sjekklisteId) return sl

        if (punktId) {
          // Oppdater enkelt punkt
          const punkter = sl.punkter.map(pk => {
            if (pk.id !== punktId) return pk
            return {
              ...pk,
              status: status || pk.status,
              kommentar: kommentar !== undefined ? kommentar : pk.kommentar,
              utfortAv: session.navn || session.email || 'ukjent',
              utfortDato: new Date().toISOString(),
            }
          })
          return { ...sl, punkter, status: beregnSjekklisteStatus(punkter) }
        }

        // Oppdater sjekkliste-status direkte (f.eks. lukk/åpne)
        return { ...sl, status: status || sl.status }
      })
      return { ...p, sjekklister, _endret: Date.now() }
    })

    const nowTs = Date.now()
    await skrivStateOgBump(redis, {
      ...state,
      prosjekter: oppdatertProsjekter,
      _fieldTs: { ...(state._fieldTs || {}), prosjekter: nowTs },
      _updatedAt: nowTs,
    })

    return res.status(200).json({ ok: true })
  }

  // ── DELETE: fjern en sjekkliste fra prosjektet ────────────────────────────
  if (req.method === 'DELETE') {
    const { prosjektId, sjekklisteId } = req.query
    if (!prosjektId || !sjekklisteId) return res.status(400).json({ error: 'Mangler prosjektId eller sjekklisteId' })

    const nowTs = Date.now()
    await skrivStateOgBump(redis, {
      ...state,
      prosjekter: prosjekter.map(p =>
        p.id !== prosjektId ? p
          : { ...p, sjekklister: (p.sjekklister || []).filter(sl => sl.id !== sjekklisteId), _endret: nowTs }
      ),
      _fieldTs: { ...(state._fieldTs || {}), prosjekter: nowTs },
      _updatedAt: nowTs,
    })

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
