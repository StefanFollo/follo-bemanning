// api/ks/bilder.js — Bilde-opplastning for KS-sjekklister
// POST (multipart) → laster opp bilde til Vercel Blob, returnerer URL + metadata
// DELETE ?url=xxx → slett bilde fra Blob

import { put, del } from '@vercel/blob'
import { Redis } from '@upstash/redis'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

export const config = { api: { bodyParser: false } }

async function parseBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Filename, X-Prosjekt-Id, X-Sjekkliste-Id, X-Punkt-Id, X-Gps-Lat, X-Gps-Lng')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const session = await getSession(req)
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  if (req.method === 'POST') {
    const body = await parseBody(req)
    const contentType = req.headers['content-type'] || 'image/jpeg'
    const filename = req.headers['x-filename'] || `bilde-${Date.now()}.jpg`
    const prosjektId = req.headers['x-prosjekt-id'] || 'ukjent'
    const sjekklisteId = req.headers['x-sjekkliste-id'] || 'ukjent'
    const punktId = req.headers['x-punkt-id'] || null
    const lat = req.headers['x-gps-lat'] ? parseFloat(req.headers['x-gps-lat']) : null
    const lng = req.headers['x-gps-lng'] ? parseFloat(req.headers['x-gps-lng']) : null

    const ext = filename.split('.').pop().toLowerCase() || 'jpg'
    const blobNavn = `ks-bilder/${prosjektId}/${sjekklisteId}/${Date.now()}-${Math.random().toString(36).slice(2,6)}.${ext}`

    const blob = await put(blobNavn, body, { access: 'public', contentType })

    const bildeObj = {
      url: blob.url,
      gps: lat && lng ? { lat, lng } : null,
      tatt: new Date().toISOString(),
      tatt_av: session.navn || session.email || 'Ukjent',
      punkt_id: punktId,
      filnavn: filename,
    }

    return res.status(201).json(bildeObj)
  }

  if (req.method === 'DELETE') {
    const url = req.query.url
    if (!url) return res.status(400).json({ error: 'Mangler url' })
    await del(url)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
