// POST /api/befaringer/audit-log
// Brukes av BefaringPlan.jsx for å logge manuelle statusendringer
// Ingen auth-krav (intern app, same-origin)

import { Redis } from '@upstash/redis'
import { appendAuditLog, byggAuditEntry } from '../_dataIntegritet.js'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export const config = {
  api: { bodyParser: { sizeLimit: '64kb' } },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // SIKKERHET: krever innlogget økt — ellers kan hvem som helst forfalske
  // eller fylle opp endringsloggen. (Var tidligere helt åpen med CORS *.)
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  const session = token ? await redis.get(`fbs_session:${token}`) : null
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  const { objektId, felt, fraVerdi, tilVerdi, endretAv, kilde, begrunnelse } = req.body || {}
  if (!objektId || !felt) return res.status(400).json({ error: 'Mangler objektId eller felt' })

  try {
    await appendAuditLog(redis, byggAuditEntry({
      objekt: 'befaring',
      objektId,
      felt,
      fraVerdi,
      tilVerdi,
      endretAv: endretAv || session.navn || session.email || 'manuell',
      kilde: kilde || 'bemannings-app',
      begrunnelse: begrunnelse || null,
    }))
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[audit-log] POST feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
