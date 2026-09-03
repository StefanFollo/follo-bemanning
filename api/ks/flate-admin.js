// ═══ /api/ks/flate-admin — administrasjon av KS-ansattlenker (PR1) ═══
// Admin/kontor: generer/regenerer personlig lenke per ansatt + status.
// Regenerering dreper gammel lenke og nullstiller sperre/verifisering.
// SMS-utsending kommer i PR2 — PR1 gir lenken til utklipp/manuell sending.
import { Redis } from '@upstash/redis'
import { randomBytes } from 'crypto'
import { TOKENS_NOKKEL } from './flate.js'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })

async function requireAdminEllerKontor(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  const session = await redis.get(`fbs_session:${token}`)
  if (!session || (session.role !== 'admin' && session.role !== 'kontor')) return null
  return session
}

export default async function handler(req, res) {
  const session = await requireAdminEllerKontor(req)
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  const tokens = (await redis.get(TOKENS_NOKKEL)) || {}

  if (req.method === 'GET') {
    // Status per ansatt — ALDRI selve tokenet (ingen opplisting)
    const perAnsatt = {}
    for (const [, info] of Object.entries(tokens)) {
      if (!info || !info.ansattId) continue
      perAnsatt[info.ansattId] = {
        harLenke: true, opprettet: info.opprettet || null, sistApnet: info.sistApnet || null,
        verifisert: !!info.verifisert, sperret: !!info.sperret,
      }
    }
    return res.status(200).json({ perAnsatt })
  }

  if (req.method !== 'POST') return res.status(405).end()

  let body = req.body
  if (typeof body === 'string') try { body = JSON.parse(body) } catch { body = {} }
  const { ansattId } = body || {}
  if (!ansattId) return res.status(400).json({ error: 'Mangler ansattId' })

  const state = (await redis.get('fbs_state')) || {}
  const ansatt = (state.ansatte || []).find(a => a && a.id === ansattId)
  if (!ansatt) return res.status(404).json({ error: 'Ansatt ikke funnet' })
  if (ansatt.arkivert) return res.status(409).json({ error: 'Ansatt er arkivert — gjenopprett først' })

  // Regenerering: gamle lenker for denne ansatte dør (spec §1)
  let fjernet = 0
  for (const [t, info] of Object.entries(tokens)) {
    if (info && info.ansattId === ansattId) { delete tokens[t]; fjernet++ }
  }
  const nyToken = randomBytes(24).toString('hex')
  tokens[nyToken] = {
    ansattId, opprettet: new Date().toISOString(), opprettetAv: session.navn || session.email,
    verifisert: false, feilForsok: 0, sperret: false,
  }
  await redis.set(TOKENS_NOKKEL, tokens)

  const base = process.env.APP_URL || 'https://follo-bemanning.vercel.app'
  console.log(`[ks/flate-admin] ${session.navn || session.email} ${fjernet ? 'regenererte' : 'opprettet'} KS-lenke for ${ansatt.navn}`)
  return res.status(200).json({
    ok: true, url: `${base}/ks/${nyToken}`, regenerert: fjernet > 0,
    manglerTelefon: !String(ansatt.telefon || '').replace(/\D/g, '').slice(-4),
  })
}
