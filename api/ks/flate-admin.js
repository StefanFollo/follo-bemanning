// ═══ /api/ks/flate-admin — administrasjon av KS-ansattlenker (PR1) ═══
// Admin/kontor: generer/regenerer personlig lenke per ansatt + status.
// Regenerering dreper gammel lenke og nullstiller sperre/verifisering.
// SMS-utsending kommer i PR2 — PR1 gir lenken til utklipp/manuell sending.
import { Redis } from '@upstash/redis'
import { randomBytes } from 'crypto'
import { TOKENS_NOKKEL } from './flate.js'
import { sendSms, normaliserNorskTlf } from '../_sms.js'

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
        sendtDato: info.sendtDato || null,
      }
    }
    return res.status(200).json({ perAnsatt })
  }

  if (req.method !== 'POST') return res.status(405).end()

  let body = req.body
  if (typeof body === 'string') try { body = JSON.parse(body) } catch { body = {} }
  // regenerer=false (PR2): behold eksisterende lenke (send/kopiér på nytt) —
  // sperret lenke regenereres alltid, det er PL-ens opplåsing.
  const { ansattId, sendSms: skalSendeSms, regenerer = true } = body || {}
  if (!ansattId) return res.status(400).json({ error: 'Mangler ansattId' })

  const state = (await redis.get('fbs_state')) || {}
  const ansatt = (state.ansatte || []).find(a => a && a.id === ansattId)
  if (!ansatt) return res.status(404).json({ error: 'Ansatt ikke funnet' })
  if (ansatt.arkivert) return res.status(409).json({ error: 'Ansatt er arkivert — gjenopprett først' })

  const eksisterende = Object.entries(tokens).find(([, i]) => i && i.ansattId === ansattId)
  let aktivToken
  let fjernet = 0
  if (!regenerer && eksisterende && !eksisterende[1].sperret) {
    aktivToken = eksisterende[0]
  } else {
    // Regenerering: gamle lenker for denne ansatte dør (spec §1)
    for (const [t, info] of Object.entries(tokens)) {
      if (info && info.ansattId === ansattId) { delete tokens[t]; fjernet++ }
    }
    aktivToken = randomBytes(24).toString('hex')
    tokens[aktivToken] = {
      ansattId, opprettet: new Date().toISOString(), opprettetAv: session.navn || session.email,
      verifisert: false, feilForsok: 0, sperret: false,
    }
  }

  const base = process.env.APP_URL || 'https://follo-bemanning.vercel.app'
  const url = `${base}/ks/${aktivToken}`

  // PR2: SMS-utsending («lagre denne meldingen — lenken er din faste inngang»)
  let sms = null
  if (skalSendeSms) {
    const fornavn = String(ansatt.navn || '').trim().split(/\s+/)[0]
    sms = await sendSms({
      til: ansatt.telefon,
      melding: `Hei ${fornavn}! Din personlige KS-lenke hos Follo Byggservice: ${url} — lagre denne meldingen, lenken er din faste inngang til sjekklistene.`,
    })
    // PR3: sendtDato kun ved FAKTISK sendt SMS — status-kolonnen på
    // Ansatte-siden skal ikke vise «sendt» når tjenesten hoppet over.
    if (sms.sent) {
      tokens[aktivToken] = { ...tokens[aktivToken], sendtDato: new Date().toISOString(), sendtTil: normaliserNorskTlf(ansatt.telefon), sendtAv: session.navn || session.email }
    }
  }
  await redis.set(TOKENS_NOKKEL, tokens)

  console.log(`[ks/flate-admin] ${session.navn || session.email} ${fjernet ? 'regenererte' : (eksisterende && !regenerer ? 'gjenbrukte' : 'opprettet')} KS-lenke for ${ansatt.navn}${sms ? (sms.sent ? ' + SMS sendt' : sms.ikkeKlar ? ' (SMS-tjeneste ikke klar)' : sms.skipped ? ' (SMS hoppet: env mangler)' : ' (SMS FEILET)') : ''}`)
  return res.status(200).json({
    ok: true, url, regenerert: fjernet > 0, gjenbrukt: !!(eksisterende && !regenerer && !fjernet),
    manglerTelefon: !String(ansatt.telefon || '').replace(/\D/g, '').slice(-4),
    sms: sms ? { sendt: !!sms.sent, hoppet: !!sms.skipped, ikkeKlar: !!sms.ikkeKlar, feil: sms.error || null } : null,
  })
}
