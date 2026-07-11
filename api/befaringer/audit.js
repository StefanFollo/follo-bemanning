// GET /api/befaringer/audit?befaringId=xxx&limit=50
// Returnerer audit-log-oppføringer for én befaring (eller alle)

import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // SIKKERHET: krever innlogget økt — loggen inneholder kundedata og
  // salgshistorikk. (Var tidligere helt åpen med CORS *.)
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  const session = token ? await redis.get(`fbs_session:${token}`) : null
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  const { befaringId, limit = '50' } = req.query
  try {
    const log = (await redis.get('fbs_audit_log')) || []
    const filtered = befaringId ? log.filter(e => e.objektId === befaringId) : log
    return res.status(200).json({ ok: true, entries: filtered.slice(-Math.min(parseInt(limit, 10), 200)) })
  } catch (e) {
    console.error('[audit] GET feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
