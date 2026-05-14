// api/ks/maler.js — CRUD for sjekkliste-maler
// GET → hent alle maler
// POST → opprett ny mal (admin/kontor)
// PUT → oppdater mal (admin/kontor)
// DELETE → slett mal (admin only)

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
    const maler = (await redis.get('fbs_ks_maler')) || []
    return res.status(200).json(maler)
  }

  if (req.method === 'POST') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const maler = (await redis.get('fbs_ks_maler')) || []
    const ny = { ...req.body, sist_endret: new Date().toISOString(), endret_av: session.navn || session.email || 'ukjent' }
    await redis.set('fbs_ks_maler', [...maler, ny])
    return res.status(201).json(ny)
  }

  if (req.method === 'PUT') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const maler = (await redis.get('fbs_ks_maler')) || []
    const idx = maler.findIndex(m => m.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Mal ikke funnet' })
    const oppdatert = { ...maler[idx], ...req.body, id, sist_endret: new Date().toISOString(), endret_av: session.navn || session.email || 'ukjent', versjon: (maler[idx].versjon || 1) + 1 }
    const ny = [...maler]; ny[idx] = oppdatert
    await redis.set('fbs_ks_maler', ny)
    return res.status(200).json(oppdatert)
  }

  if (req.method === 'DELETE') {
    if (!isAdmin) return res.status(403).json({ error: 'Kun admin kan slette maler' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const maler = (await redis.get('fbs_ks_maler')) || []
    await redis.set('fbs_ks_maler', maler.filter(m => m.id !== id))
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
