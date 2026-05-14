// api/ks/sjekklister.js — CRUD for prosjekt-sjekklister
// GET ?prosjektId=xxx → hent alle sjekklister for prosjekt
// GET (ingen prosjektId) → hent alle
// POST → opprett ny sjekkliste-instans
// PUT ?id=xxx → oppdater (fylle ut punkter, status, signering)
// DELETE ?id=xxx → slett (admin only)

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
  const kanSkrive = isAdmin || session.role === 'kontor' || session.role === 'ansatt'

  if (req.method === 'GET') {
    const alle = (await redis.get('fbs_ks_sjekklister')) || []
    const { prosjektId } = req.query
    return res.status(200).json(prosjektId ? alle.filter(s => s.prosjektId === prosjektId) : alle)
  }

  if (req.method === 'POST') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const alle = (await redis.get('fbs_ks_sjekklister')) || []
    const id = `psl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const ny = { ...req.body, id, opprettet: new Date().toISOString(), status: req.body.status || 'ikke-startet' }
    await redis.set('fbs_ks_sjekklister', [...alle, ny])
    return res.status(201).json(ny)
  }

  if (req.method === 'PUT') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const alle = (await redis.get('fbs_ks_sjekklister')) || []
    const idx = alle.findIndex(s => s.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Sjekkliste ikke funnet' })
    const oppdatert = { ...alle[idx], ...req.body, id, sist_endret: new Date().toISOString() }
    // Oppdater status basert på punkter
    if (oppdatert.punkter) {
      const alle_ok = oppdatert.punkter.every(p => p.status === 'ok' || p.status === 'ikke-aktuelt')
      const noen_utfort = oppdatert.punkter.some(p => p.status === 'ok' || p.status === 'avvik' || p.status === 'ikke-aktuelt')
      if (alle_ok) {
        oppdatert.status = 'ferdig'
        oppdatert.ferdigstilt = oppdatert.ferdigstilt || new Date().toISOString()
      } else if (noen_utfort) {
        oppdatert.status = 'pagar'
        oppdatert.ferdigstilt = null
      }
    }
    const ny = [...alle]; ny[idx] = oppdatert
    await redis.set('fbs_ks_sjekklister', ny)
    return res.status(200).json(oppdatert)
  }

  if (req.method === 'DELETE') {
    if (!isAdmin) return res.status(403).json({ error: 'Kun admin kan slette sjekklister' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const alle = (await redis.get('fbs_ks_sjekklister')) || []
    await redis.set('fbs_ks_sjekklister', alle.filter(s => s.id !== id))
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
