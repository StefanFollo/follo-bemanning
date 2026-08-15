// api/befaringer/koblinger.js — Fase 3: koblingsrapport tilbud↔befaring.
//
// Tilbuds-appen POSTer sin koblingsliste hit (knappetrykk der), og henter
// løsningene tilbake når Stefan har reparert. Bemannings-appens verktøy
// leser rapporten og skriver løsninger med bruker-JWT.
//
// KONTRAKT (koordinert med tilbuds-chatten):
//   POST  (Bearer INTER_APP_TOKEN)
//     { koblinger: [{ tilbudId, kildeBefaringId, salgsStatus,
//                     kundenavn?, adresse?, tilbudLink?, tilbudPayload? }] }
//     → lagrer rapporten (erstatter forrige liste, beholder løsninger)
//   GET   (Bearer INTER_APP_TOKEN) ?losninger=1
//     → { losninger: { [tilbudId]: { nyKildeBefaringId?, behold?, status?, avgjortAv, dato } } }
//   GET   (bruker-JWT)
//     → { mottattDato, koblinger, losninger }
//   POST  (bruker-JWT)
//     { losning: { tilbudId, nyKildeBefaringId?, behold?, status?, angret? } }
//     → registrerer/overskriver løsningen for det tilbudet
//
// Endepunktet SLETTER aldri noe — rapporten erstattes kun av ny POST fra
// tilbuds-appen, og løsninger akkumuleres.

import { Redis } from '@upstash/redis'
import { validerInterAppToken } from '../_interApp.js'

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const NØKKEL = 'fbs_koblinger_rapport'

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const interOk = validerInterAppToken(req).ok
  const session = interOk ? null : await getSession(req)
  if (!interOk && !session) return res.status(401).json({ error: 'Ikke autorisert' })

  const rapport = (await redis.get(NØKKEL)) || { mottattDato: null, koblinger: [], losninger: {} }

  if (req.method === 'GET') {
    if (interOk && req.query?.losninger) {
      return res.status(200).json({ losninger: rapport.losninger || {} })
    }
    return res.status(200).json(rapport)
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body || {}

  // Tilbuds-appen leverer/oppfrisker koblingslista
  if (interOk && Array.isArray(body.koblinger)) {
    const ny = {
      mottattDato: new Date().toISOString(),
      koblinger: body.koblinger.slice(0, 500).map(k => ({
        tilbudId: k.tilbudId,
        kildeBefaringId: k.kildeBefaringId || null,
        salgsStatus: k.salgsStatus || '',
        kundenavn: k.kundenavn || '',
        adresse: k.adresse || '',
        tilbudLink: k.tilbudLink || '',
        ...(k.tilbudPayload ? { tilbudPayload: k.tilbudPayload } : {}),
      })),
      losninger: rapport.losninger || {}, // løsninger overlever ny rapport
    }
    await redis.set(NØKKEL, ny)
    console.log(`POST /api/befaringer/koblinger [inter-app] ${ny.koblinger.length} koblinger mottatt`)
    return res.status(200).json({ ok: true, antall: ny.koblinger.length })
  }

  // Bemannings-appen registrerer en løsning (bruker-JWT)
  if (session && body.losning && body.losning.tilbudId !== undefined) {
    const l = body.losning
    const losninger = { ...(rapport.losninger || {}) }
    if (l.angret) {
      delete losninger[String(l.tilbudId)]
    } else {
      losninger[String(l.tilbudId)] = {
        ...(l.nyKildeBefaringId ? { nyKildeBefaringId: l.nyKildeBefaringId } : {}),
        ...(l.behold ? { behold: l.behold } : {}),
        ...(l.status ? { status: l.status } : {}),
        avgjortAv: session.navn || session.email || 'admin',
        dato: new Date().toISOString(),
      }
    }
    await redis.set(NØKKEL, { ...rapport, losninger })
    console.log(`POST /api/befaringer/koblinger [løsning] tilbudId:${l.tilbudId}${l.angret ? ' (angret)' : ''}`)
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'Ugyldig forespørsel' })
}
