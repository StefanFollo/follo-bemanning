// api/ks/varsle.js — E-post-varsling for KS-systemet
// POST { type: 'tildeling', sjekklisteId, prosjektNavn, ansvarlige: [] }
// POST { type: 'avvik', avvikId, prosjektNavn, ansvarlig }
// POST { type: 'frist-passert', sjekklisteId, prosjektNavn, ansvarlige: [], plEpost }

import { Resend } from 'resend'
import { Redis } from '@upstash/redis'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
const RESEND_FROM = process.env.RESEND_FROM || 'FBS <post@follobyggservice.no>'

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

async function hentBrukereEpost(navn) {
  // Finn e-post for ansatt basert på navn
  const brukere = (await redis.get('fbs_brukere')) || []
  const funnet = brukere.find(b => b.navn === navn || b.email?.split('@')[0] === navn.toLowerCase().replace(/ /g, '.'))
  return funnet?.email || null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSession(req)
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ ok: false, grunn: 'RESEND_API_KEY ikke satt' })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { type, ...body } = req.body
  const appUrl = process.env.APP_URL || 'https://follo-bemanning.vercel.app'

  try {
    if (type === 'tildeling') {
      const { sjekklisteNavn, prosjektNavn, ansvarlige = [], frist, tildeltAv } = body

      const epostListe = (await Promise.all(ansvarlige.map(navn => hentBrukereEpost(navn)))).filter(Boolean)
      if (!epostListe.length) return res.status(200).json({ ok: false, grunn: 'Ingen e-post funnet for ansvarlige' })

      await resend.emails.send({
        from: RESEND_FROM,
        to: epostListe,
        subject: `📋 Ny sjekkliste tildelt: ${sjekklisteNavn}`,
        html: `
          <h2>Du er tildelt en sjekkliste</h2>
          <p><strong>Prosjekt:</strong> ${prosjektNavn}</p>
          <p><strong>Sjekkliste:</strong> ${sjekklisteNavn}</p>
          ${frist ? `<p><strong>Frist:</strong> ${new Date(frist).toLocaleDateString('nb-NO')}</p>` : ''}
          <p><strong>Tildelt av:</strong> ${tildeltAv || 'ukjent'}</p>
          <br>
          <a href="${appUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
            Åpne i bemanningsplanleggeren →
          </a>
          <br><br>
          <small style="color:#94a3b8">Follo Byggservice · KS/HMS-system</small>
        `,
      })
      return res.status(200).json({ ok: true, sendt_til: epostListe.length })
    }

    if (type === 'avvik') {
      const { tittel, prosjektNavn, ansvarlig, alvorlighet, registrertAv } = body

      const epost = await hentBrukereEpost(ansvarlig)
      if (!epost) return res.status(200).json({ ok: false, grunn: 'Ingen e-post for ansvarlig' })

      const fargekart = { kritisk: '#dc2626', alvorlig: '#ea580c', mindre: '#f59e0b', info: '#0891b2' }
      await resend.emails.send({
        from: RESEND_FROM,
        to: [epost],
        subject: `⚠️ Avvik registrert: ${tittel} — ${prosjektNavn}`,
        html: `
          <h2>Avvik registrert</h2>
          <p><strong>Prosjekt:</strong> ${prosjektNavn}</p>
          <p><strong>Avvik:</strong> ${tittel}</p>
          <p><strong>Alvorlighet:</strong> <span style="color:${fargekart[alvorlighet] || '#f59e0b'};font-weight:700">${alvorlighet}</span></p>
          <p><strong>Registrert av:</strong> ${registrertAv}</p>
          <br>
          <a href="${appUrl}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
            Se avvik og iverksett tiltak →
          </a>
        `,
      })
      return res.status(200).json({ ok: true })
    }

    if (type === 'frist-passert') {
      const { sjekklisteNavn, prosjektNavn, ansvarlige = [], plEpost, dagerForsinket } = body

      const ansEpost = (await Promise.all(ansvarlige.map(n => hentBrukereEpost(n)))).filter(Boolean)
      const mottakere = [...new Set([...ansEpost, plEpost].filter(Boolean))]
      if (!mottakere.length) return res.status(200).json({ ok: false, grunn: 'Ingen mottakere' })

      await resend.emails.send({
        from: RESEND_FROM,
        to: mottakere,
        subject: `🔴 Forsinket sjekkliste: ${sjekklisteNavn} (${dagerForsinket || '?'} dager)`,
        html: `
          <h2>Sjekkliste er forsinket</h2>
          <p><strong>Prosjekt:</strong> ${prosjektNavn}</p>
          <p><strong>Sjekkliste:</strong> ${sjekklisteNavn}</p>
          <p style="color:#dc2626;font-weight:700">Fristen er passert med ${dagerForsinket || '?'} dager.</p>
          <br>
          <a href="${appUrl}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
            Gå til sjekklisten →
          </a>
        `,
      })
      return res.status(200).json({ ok: true, sendt_til: mottakere.length })
    }

    return res.status(400).json({ error: `Ukjent type: ${type}` })
  } catch (e) {
    console.error('Varsling-feil:', e)
    return res.status(500).json({ error: e.message })
  }
}
