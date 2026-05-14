// api/ks/tegninger.js — Prosjekt-tegninger med pinpoints
// GET ?prosjektId=xxx → tegninger for prosjekt
// POST → last opp tegning (multipart, lagres i Vercel Blob)
// PUT ?id=xxx → oppdater pinpoints / tittel
// DELETE ?id=xxx → slett tegning

import { Redis } from '@upstash/redis'
import { put, del } from '@vercel/blob'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

export const config = { api: { bodyParser: false } }

async function parseMultipart(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks)

  const contentType = req.headers['content-type'] || ''
  const boundary = contentType.split('boundary=')[1]

  if (!boundary) {
    // JSON body (for pinpoint updates)
    try { return { json: JSON.parse(body.toString()) } } catch { return { json: {} } }
  }

  const parts = body.toString('binary').split(`--${boundary}`)
  const files = {}
  const fields = {}

  for (const part of parts) {
    if (!part.includes('Content-Disposition')) continue
    const [header, ...rest] = part.split('\r\n\r\n')
    const content = rest.join('\r\n\r\n').replace(/\r\n--$/, '')
    const nameMatch = header.match(/name="([^"]+)"/)
    const filenameMatch = header.match(/filename="([^"]+)"/)
    if (!nameMatch) continue
    const name = nameMatch[1]
    if (filenameMatch) {
      const contentTypeMatch = header.match(/Content-Type: ([^\r\n]+)/)
      files[name] = {
        filename: filenameMatch[1],
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
        data: Buffer.from(content, 'binary'),
      }
    } else {
      fields[name] = content.trim()
    }
  }
  return { files, fields }
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
    const alle = (await redis.get('fbs_ks_tegninger')) || []
    const { prosjektId } = req.query
    return res.status(200).json(prosjektId ? alle.filter(t => t.prosjektId === prosjektId) : alle)
  }

  if (req.method === 'POST') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const { files, fields, json } = await parseMultipart(req)

    if (json) {
      // JSON-only POST (opprett uten fil)
      const alle = (await redis.get('fbs_ks_tegninger')) || []
      const id = `teg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const ny = { id, ...json, pinpoints: json.pinpoints || [], opprettet: new Date().toISOString(), opprettet_av: session.navn || session.email }
      await redis.set('fbs_ks_tegninger', [...alle, ny])
      return res.status(201).json(ny)
    }

    if (!files?.fil) return res.status(400).json({ error: 'Ingen fil' })
    const { fil } = files
    const id = `teg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const ext = fil.filename.split('.').pop().toLowerCase()
    const blobNavn = `tegninger/${fields.prosjektId || 'ukjent'}/${id}.${ext}`

    const blob = await put(blobNavn, fil.data, { access: 'public', contentType: fil.contentType })

    const alle = (await redis.get('fbs_ks_tegninger')) || []
    const ny = {
      id,
      prosjektId: fields.prosjektId || null,
      tittel: fields.tittel || fil.filename,
      type: ext,
      url: blob.url,
      pinpoints: [],
      opprettet: new Date().toISOString(),
      opprettet_av: session.navn || session.email || 'Ukjent',
    }
    await redis.set('fbs_ks_tegninger', [...alle, ny])
    return res.status(201).json(ny)
  }

  if (req.method === 'PUT') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })

    // Parse JSON body direkte (PUT sender alltid JSON)
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())

    const alle = (await redis.get('fbs_ks_tegninger')) || []
    const idx = alle.findIndex(t => t.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Tegning ikke funnet' })
    const oppdatert = { ...alle[idx], ...body, id, sist_endret: new Date().toISOString() }
    const ny = [...alle]; ny[idx] = oppdatert
    await redis.set('fbs_ks_tegninger', ny)
    return res.status(200).json(oppdatert)
  }

  if (req.method === 'DELETE') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const alle = (await redis.get('fbs_ks_tegninger')) || []
    const teg = alle.find(t => t.id === id)
    if (teg?.url) {
      try { await del(teg.url) } catch { /* ignorer blob-feil */ }
    }
    await redis.set('fbs_ks_tegninger', alle.filter(t => t.id !== id))
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
