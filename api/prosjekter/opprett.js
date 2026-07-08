// api/prosjekter/opprett.js — POST-endepunkt for Tilbuds-appen.
//
// Kalles når et tilbud vinnes (salgsStatus = 'vunnet'). Oppretter et nytt
// prosjekt i bemanningsplanleggeren med kunde+tilbud-data. Markerer
// kilde-befaringen (hvis oppgitt) som "godkjent" så den ikke importeres på nytt.
//
// Auth: Bearer INTER_APP_TOKEN i Authorization-header.
//
// Body fra Tilbuds-appen:
//   {
//     tilbudId, kildeBefaringId?, kundenavn, adresse, telefon, epost,
//     kontaktperson, oppstart, varighet, estimertSum, pristype, fag,
//     tilbudLink
//   }
//
// Returnerer: { prosjektId, varsling, alleredeOpprettet? }

import { Redis } from '@upstash/redis'
import { Resend } from 'resend'
import { validerInterAppToken } from '../_interApp.js'

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// Norske mester-farger (følger PROSJEKT_PALETTE-mønsteret)
const FARGE_PALETT = ['#6b8fc4', '#a78bfa', '#fb923c', '#34d399', '#f472b6', '#facc15', '#60a5fa', '#fb7185']

function nyId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function fmt(n) {
  return Math.round(n).toLocaleString('no-NO')
}

async function sendPlVarsel(plNavn, plEpost, body, baseUrl) {
  const apiKey = process.env.RESEND_API_KEY
  const fraEpost = process.env.RESEND_FROM || 'FBS <noreply@follobyggservice.no>'
  if (!apiKey || !plEpost) return { sendt: false, grunn: 'mangler RESEND_API_KEY eller PL-epost' }

  const lenke = baseUrl ? `<p><a href="${baseUrl}" style="background:#1a3a5c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Åpne bemanningsplanleggeren</a></p>` : ''
  const fag = Array.isArray(body.fag) && body.fag.length > 0 ? body.fag.join(', ') : '–'

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;color:#1c1c1c;line-height:1.6">
      <div style="background:#16a34a;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0">
        <div style="font-size:11px;letter-spacing:0.1em;opacity:0.85;text-transform:uppercase;font-weight:600">PROSJEKT OPPRETTET</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;margin-top:4px">🎉 Nytt prosjekt klar for bemanning</div>
      </div>
      <div style="background:#fff;border:1px solid #e0e4ed;border-top:none;border-radius:0 0 8px 8px;padding:20px">
        <p>Hei ${plNavn ? plNavn.split(' ')[0] : ''},</p>
        <p>Et tilbud du var prosjektleder for er akseptert av kunden og prosjektet er
        opprettet i bemanningsplanleggeren. Du kan nå bemanne det.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:13px">
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Kunde:</td><td style="padding:6px 0;font-weight:600;text-align:right">${body.kundenavn || '–'}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Adresse:</td><td style="padding:6px 0;font-weight:600;text-align:right">${body.adresse || '–'}</td></tr>
          ${body.telefon ? `<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Tlf:</td><td style="padding:6px 0;font-weight:600;text-align:right">${body.telefon}</td></tr>` : ''}
          ${body.epost ? `<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">E-post:</td><td style="padding:6px 0;font-weight:600;text-align:right">${body.epost}</td></tr>` : ''}
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Oppstart:</td><td style="padding:6px 0;font-weight:600;text-align:right">${body.oppstart || '–'}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Varighet:</td><td style="padding:6px 0;font-weight:600;text-align:right">${body.varighet || '–'}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Fag:</td><td style="padding:6px 0;font-weight:600;text-align:right">${fag}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Estimert sum:</td><td style="padding:6px 0;font-weight:700;text-align:right;color:#e67e22">${fmt(body.estimertSum || 0)} kr</td></tr>
        </table>
        ${lenke}
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:18px 0">
        <div style="font-size:11px;color:#888">Automatisk varsel fra Follo Byggservice tilbudsystem</div>
      </div>
    </div>
  `

  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: fraEpost,
      to: [plEpost],
      subject: `🎉 Prosjekt opprettet: ${body.kundenavn || 'kunde'} — ${body.adresse || ''}`,
      html,
    })
    return { sendt: true }
  } catch (e) {
    console.error('PL-varsel feilet:', e.message)
    return { sendt: false, grunn: e.message }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const valid = validerInterAppToken(req)
  if (!valid.ok) return res.status(valid.status).json({ error: valid.error })

  const body = req.body || {}
  if (!body.kundenavn?.trim()) return res.status(400).json({ error: 'Mangler kundenavn' })
  if (!body.adresse?.trim()) return res.status(400).json({ error: 'Mangler adresse' })

  try {
    const state = (await redis.get('fbs_state')) || {}
    const befaringer = Array.isArray(state.befaringer) ? state.befaringer : []
    const prosjekter = Array.isArray(state.prosjekter) ? state.prosjekter : []
    const ansatte = Array.isArray(state.ansatte) ? state.ansatte : []

    // Idempotens: hvis et prosjekt allerede er opprettet for samme tilbudId,
    // ikke lag duplikat. Returner eksisterende.
    if (body.tilbudId) {
      const eksisterende = prosjekter.find(p => p.kildeTilbudId === body.tilbudId)
      if (eksisterende) {
        return res.status(200).json({
          prosjektId: eksisterende.id,
          alleredeOpprettet: true,
          varsling: 'allerede opprettet',
        })
      }
    }

    // Lag prosjekt
    const farge = FARGE_PALETT[prosjekter.length % FARGE_PALETT.length]
    const navn = `${body.kundenavn} — ${body.adresse}`.slice(0, 100)
    const beskrivelse = [
      body.pristype ? `Pristype: ${body.pristype}` : '',
      body.fag?.length ? `Fag: ${body.fag.join(', ')}` : '',
      body.estimertSum ? `Estimert: ${fmt(body.estimertSum)} kr` : '',
      body.tilbudLink ? `Tilbud: ${body.tilbudLink}` : '',
    ].filter(Boolean).join('\n')

    const nyttProsjekt = {
      id: nyId('p'),
      navn,
      adresse: body.adresse,
      startDato: '',
      sluttDato: '',
      status: 'aktiv',
      farge,
      beskrivelse,
      // Inter-app-referanser så vi kan se hvor prosjektet kom fra
      kildeTilbudId: body.tilbudId || null,
      kildeBefaringId: body.kildeBefaringId || null,
      // Kunde-info (bevares fra tilbud)
      kunde: {
        navn: body.kundenavn,
        adresse: body.adresse,
        telefon: body.telefon || '',
        epost: body.epost || '',
      },
      kontaktperson: body.kontaktperson || '',
      pristype: body.pristype || '',
      fag: Array.isArray(body.fag) ? body.fag : [],
      estimertSum: parseFloat(body.estimertSum) || 0,
      oppstartTekst: body.oppstart || '',
      varighetTekst: body.varighet || '',
      tilbudLink: body.tilbudLink || '',
      opprettet: new Date().toISOString(),
      opprettetFra: 'tilbud-app',
      _endret: Date.now(),
    }

    // Marker kilde-befaring som "godkjent" (tilsvarer 'vunnet' i bemanning-status-systemet)
    let oppdatertBefaringer = befaringer
    let plEpost = null
    let plNavn = null
    if (body.kildeBefaringId) {
      oppdatertBefaringer = befaringer.map(b => {
        if (b.id !== body.kildeBefaringId) return b
        // Slå opp PL-epost fra ansatt-listen
        if (b.prosjektlederId) {
          const pl = ansatte.find(a => a.id === b.prosjektlederId)
          if (pl) {
            plEpost = pl.epost || pl.email || null
            plNavn = pl.navn || pl.fornavn || null
          }
        }
        return {
          ...b,
          status: 'godkjent',
          importertTilTilbudId: body.tilbudId || true,
          prosjektId: nyttProsjekt.id,
          resultat: 'vunnet',
          _endret: Date.now(),
        }
      })
    }
    // Fallback: hvis ingen kilde-befaring (eller fant ikke PL der), prøv å matche
    // på kontaktperson i tilbud
    if (!plEpost && body.kontaktperson) {
      const pl = ansatte.find(a => (a.navn || '').toLowerCase().includes((body.kontaktperson || '').toLowerCase().split(' ')[0]))
      if (pl) { plEpost = pl.epost || pl.email || null; plNavn = pl.navn || null }
    }

    const opprettTs = Date.now()
    const oppdatertState = {
      ...state,
      prosjekter: [...prosjekter, nyttProsjekt],
      befaringer: oppdatertBefaringer,
      _fieldTs: { ...(state._fieldTs || {}), prosjekter: opprettTs, befaringer: opprettTs },
      _updatedAt: opprettTs,
    }

    await redis.set('fbs_state', oppdatertState)

    // Send PL-varsel i bakgrunnen (ikke-blokkerende — feil her stopper ikke respons)
    let varslingResultat = { sendt: false, grunn: 'ingen PL-epost' }
    if (plEpost) {
      const host = req.headers.host || 'follo-bemanning.vercel.app'
      const proto = host.startsWith('localhost') ? 'http' : 'https'
      varslingResultat = await sendPlVarsel(plNavn, plEpost, body, `${proto}://${host}`)
    }

    console.log(`POST /api/prosjekter/opprett OK — prosjektId:${nyttProsjekt.id} tilbudId:${body.tilbudId} befaringId:${body.kildeBefaringId} pl:${plNavn || '–'}`)

    return res.status(200).json({
      prosjektId: nyttProsjekt.id,
      varsling: varslingResultat.sendt
        ? `PL (${plNavn}) har fått e-post`
        : `Ingen varsel sendt: ${varslingResultat.grunn || 'ingen mottaker'}`,
    })
  } catch (e) {
    console.error('prosjekter/opprett feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
