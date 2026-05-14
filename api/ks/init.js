// api/ks/init.js — engangs-seeding av 34 sjekkliste-maler til Redis
// POST → kun admin, seeder maler hvis ingen finnes
// POST ?force=1 → tvinger re-seeding (admin only)

import { Redis } from '@upstash/redis'
import { KS_MALER } from '../../src/data/ks-maler.js'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const session = await getSession(req)
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Kun admin' })

  const eksisterende = (await redis.get('fbs_ks_maler')) || []
  const force = req.query.force === '1'

  if (eksisterende.length > 0 && !force) {
    return res.status(200).json({ ok: true, melding: `${eksisterende.length} maler finnes allerede. Bruk ?force=1 for å overskrive.` })
  }

  await redis.set('fbs_ks_maler', KS_MALER)
  return res.status(200).json({ ok: true, seeded: KS_MALER.length, melding: `${KS_MALER.length} sjekkliste-maler importert.` })
}
