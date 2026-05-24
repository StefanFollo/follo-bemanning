// api/framdrift-gen.js — Proxy til tilbuds-appens AI-framdrift.
//
// Kaller follo-befaring.vercel.app/api/framdrift via INTER_APP_TOKEN.
// Støtter begge moduser:
//   { modus: 'fra-tilbud', poster, timer, oppstart, varighet, adresse, kundenavn }
//   { modus: 'fri-tekst', beskrivelse, oppstart, varighet, mannskap }
//
// Auth: bruker-JWT (Bearer fbs_session:token) fra frontend.
// Returnerer samme svar som tilbuds-appens endepunkt.

import { Redis } from '@upstash/redis'

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

const TILBUD_BASE = process.env.TILBUD_BASE_URL || 'https://follo-befaring.vercel.app'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSession(req)
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  const interToken = process.env.INTER_APP_TOKEN
  if (!interToken) return res.status(500).json({ error: 'INTER_APP_TOKEN mangler i Vercel-env' })

  const body = req.body || {}
  const modus = body.modus || 'fri-tekst'

  // Valider minimumskrav per modus
  if (modus === 'fri-tekst' && !String(body.beskrivelse || '').trim()) {
    return res.status(400).json({ error: 'Mangler beskrivelse for fri-tekst-modus' })
  }

  try {
    const r = await fetch(`${TILBUD_BASE}/api/framdrift`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${interToken}`,
      },
      body: JSON.stringify(body),
    })

    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error(`framdrift-gen: tilbuds-app svarte ${r.status}:`, data)
      return res.status(r.status).json({ error: data.error || `Tilbuds-app feil ${r.status}` })
    }

    console.log(`POST /api/framdrift-gen [${session.navn || session.role}] modus:${modus} → ${data.fdTasks?.length || 0} faser`)
    return res.status(200).json(data)
  } catch (e) {
    console.error('framdrift-gen exception:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
