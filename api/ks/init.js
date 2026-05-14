// api/ks/init.js — Engangs-seeding av 34 sjekkliste-maler + 7 standard-referanser
// POST → kun admin, seeder hvis ingen finnes
// POST ?force=1 → tvinger re-seeding (sletter eksisterende)

import { Redis } from '@upstash/redis'
import { KS_MALER } from '../../src/data/ks-maler.js'
import { STANDARD_REFERANSER } from './referanser.js'

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

  const force = req.query.force === '1'
  const eksisterende = (await redis.get('fbs_ks_maler')) || []

  if (eksisterende.length > 0 && !force) {
    return res.status(200).json({
      ok: true,
      melding: `${eksisterende.length} maler finnes allerede. Bruk ?force=1 for å overskrive.`,
    })
  }

  // Seed maler
  await redis.set('fbs_ks_maler', KS_MALER)

  // Seed referanser (kun hvis tomme eller force)
  const eksRef = (await redis.get('fbs_ks_referanser')) || []
  if (eksRef.length === 0 || force) {
    await redis.set('fbs_ks_referanser', STANDARD_REFERANSER)
  }

  // Nullstill sjekklister og avvik ved force
  if (force) {
    await redis.set('fbs_ks_sjekklister', [])
    await redis.set('fbs_ks_avvik', [])
    await redis.set('fbs_ks_tegninger', [])
  }

  return res.status(200).json({
    ok: true,
    seeded: KS_MALER.length,
    referanser: STANDARD_REFERANSER.length,
    melding: `${KS_MALER.length} maler og ${STANDARD_REFERANSER.length} referanser importert.`,
  })
}
