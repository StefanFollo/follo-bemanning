// api/ks/avvik.js — CRUD for avvik-objekter
// GET ?prosjektId=xxx → avvik for prosjekt
// GET ?sjekklisteId=xxx → avvik for sjekkliste
// POST → opprett avvik
// PUT ?id=xxx → oppdater (tildel ansvarlig, lukk, kommenter)
// DELETE ?id=xxx → slett (admin)

import { Redis } from '@upstash/redis'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const session = await getSession(req)
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  const isAdmin = session.role === 'admin'
  const kanSkrive = isAdmin || session.role === 'kontor'

  if (req.method === 'GET') {
    const alle = (await redis.get('fbs_ks_avvik')) || []
    const { prosjektId, sjekklisteId, id } = req.query
    if (id) return res.status(200).json(alle.find(a => a.id === id) || null)
    if (sjekklisteId) return res.status(200).json(alle.filter(a => a.sjekklisteId === sjekklisteId))
    if (prosjektId) return res.status(200).json(alle.filter(a => a.prosjektId === prosjektId))
    return res.status(200).json(alle)
  }

  if (req.method === 'POST') {
    const alle = (await redis.get('fbs_ks_avvik')) || []
    const id = `av-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const ny = {
      id,
      prosjektId: req.body.prosjektId,
      sjekklisteId: req.body.sjekklisteId,
      sjekkpunktId: req.body.sjekkpunktId || null,
      tittel: req.body.tittel || 'Avvik',
      beskrivelse: req.body.beskrivelse || '',
      alvorlighet: req.body.alvorlighet || 'mindre', // info | mindre | alvorlig | kritisk
      status: 'apen',
      registrert_av: session.navn || session.email || 'Ukjent',
      registrert_dato: new Date().toISOString(),
      ansvarlig_for_lukking: req.body.ansvarlig_for_lukking || null,
      frist: req.body.frist || null,
      tiltak_beskrivelse: req.body.tiltak_beskrivelse || '',
      bilder: [],
      kommentarer: [],
      lukket_av: null,
      lukket_dato: null,
    }
    await redis.set('fbs_ks_avvik', [...alle, ny])
    return res.status(201).json(ny)
  }

  if (req.method === 'PUT') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const alle = (await redis.get('fbs_ks_avvik')) || []
    const idx = alle.findIndex(a => a.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Avvik ikke funnet' })

    const gammel = alle[idx]
    const oppdatert = { ...gammel, ...req.body, id, sist_endret: new Date().toISOString() }

    // Lukke-logikk
    if (req.body.status === 'lukket' && gammel.status !== 'lukket') {
      oppdatert.lukket_av = session.navn || session.email || 'Ukjent'
      oppdatert.lukket_dato = new Date().toISOString()
    }

    const ny = [...alle]; ny[idx] = oppdatert
    await redis.set('fbs_ks_avvik', ny)
    return res.status(200).json(oppdatert)
  }

  if (req.method === 'DELETE') {
    if (!isAdmin) return res.status(403).json({ error: 'Kun admin kan slette avvik' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const alle = (await redis.get('fbs_ks_avvik')) || []
    await redis.set('fbs_ks_avvik', alle.filter(a => a.id !== id))
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
