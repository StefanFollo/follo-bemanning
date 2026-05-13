// api/befaringer/event.js — samlet event-endepunkt for tilbuds-appen.
//
// Erstatter /api/prosjekter/opprett. Én endepunkt håndterer hele livssyklusen
// til en befaring/tilbud-kobling. Tilbuds-appen kaller dette ved hver statusendring.
//
// Auth: Bearer INTER_APP_TOKEN i header.
//
// Body:
//   {
//     type: 'tilbud-sendt' | 'vunnet' | 'tapt' | 'avvist',
//     kildeBefaringId: string | null,
//     tilbudId: number,
//     tilbudLink: string,
//     dato: ISO-string,
//     data: { kundenavn, adresse, telefon, epost, kontaktperson,
//             oppstart, varighet, estimertSum, pristype, fag[] }
//   }
//
// Effekt per type:
//   tilbud-sendt → befaring-status 'tilbud_sendt' + lagrer tilbudLink
//   vunnet       → befaring-status 'godkjent' + oppretter prosjekt + sender e-post
//   tapt         → befaring-status 'tapt' + logger dato
//   avvist       → befaring-status 'tapt' (samme som tapt for nå, men eventType lagres)

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

const FARGE_PALETT = ['#6b8fc4', '#a78bfa', '#fb923c', '#34d399', '#f472b6', '#facc15', '#60a5fa', '#fb7185']
const TILLATTE_TYPER = ['tilbud-sendt', 'vunnet', 'tapt', 'avvist']

// Type → ny befaring-status i bemanning-systemet
const TYPE_TIL_STATUS = {
  'tilbud-sendt': 'tilbud_sendt',
  'vunnet': 'godkjent',
  'tapt': 'tapt',
  'avvist': 'tapt',  // SPEC: samme som tapt for nå
}

function nyId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function fmt(n) {
  return Math.round(n).toLocaleString('no-NO')
}

async function sendProsjektVarsel(plKontakt, body, baseUrl) {
  const apiKey = process.env.RESEND_API_KEY
  const fraEpost = process.env.RESEND_FROM || 'FBS <noreply@follobyggservice.no>'
  // Hoved-varsel-epost (administrasjon) — env-styrt
  const adminEpost = process.env.INTEGRASJON_NOTIFIKASJON_EPOST || 'post@follobyggservice.no'
  if (!apiKey) return { sendt: false, grunn: 'mangler RESEND_API_KEY' }

  const mottakere = [adminEpost]
  if (plKontakt?.epost && plKontakt.epost !== adminEpost) mottakere.push(plKontakt.epost)

  const d = body.data || {}
  const fagListe = Array.isArray(d.fag) && d.fag.length > 0 ? d.fag.join(', ') : '–'
  const tilbudLenke = body.tilbudLink ? `<p style="margin-top:10px"><a href="${body.tilbudLink}" style="color:#2874a6">📄 Se tilbudet</a></p>` : ''
  const bemanningLenke = baseUrl ? `<p style="text-align:center;margin-top:16px"><a href="${baseUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Åpne bemanningsplanleggeren</a></p>` : ''

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;color:#1c1c1c;line-height:1.6">
      <div style="background:#16a34a;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0">
        <div style="font-size:11px;letter-spacing:0.1em;opacity:0.85;text-transform:uppercase;font-weight:600">PROSJEKT OPPRETTET</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;margin-top:4px">🎉 Nytt prosjekt klar for bemanning</div>
      </div>
      <div style="background:#fff;border:1px solid #e0e4ed;border-top:none;border-radius:0 0 8px 8px;padding:20px">
        <p>Et tilbud er akseptert av kunden og prosjektet er opprettet i bemanningsplanleggeren — klart til å bemannes.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:13px">
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Kunde:</td><td style="padding:6px 0;font-weight:600;text-align:right">${d.kundenavn || '–'}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Adresse:</td><td style="padding:6px 0;font-weight:600;text-align:right">${d.adresse || '–'}</td></tr>
          ${d.telefon ? `<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Tlf:</td><td style="padding:6px 0;font-weight:600;text-align:right">${d.telefon}</td></tr>` : ''}
          ${d.epost ? `<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">E-post:</td><td style="padding:6px 0;font-weight:600;text-align:right">${d.epost}</td></tr>` : ''}
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">PL:</td><td style="padding:6px 0;font-weight:600;text-align:right">${d.kontaktperson || '–'}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Oppstart:</td><td style="padding:6px 0;font-weight:600;text-align:right">${d.oppstart || '–'}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Varighet:</td><td style="padding:6px 0;font-weight:600;text-align:right">${d.varighet || '–'}</td></tr>
          <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px 0;color:#888">Fag:</td><td style="padding:6px 0;font-weight:600;text-align:right">${fagListe}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Estimert sum:</td><td style="padding:6px 0;font-weight:700;text-align:right;color:#e67e22">${fmt(d.estimertSum || 0)} kr</td></tr>
        </table>
        ${tilbudLenke}
        ${bemanningLenke}
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:18px 0">
        <div style="font-size:11px;color:#888">Automatisk varsel fra Follo Byggservice tilbudsystem · ${new Date(body.dato || Date.now()).toLocaleString('no-NO')}</div>
      </div>
    </div>
  `
  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: fraEpost,
      to: mottakere,
      subject: `🎉 Prosjekt opprettet: ${d.kundenavn || 'kunde'} — ${d.adresse || ''}`,
      html,
    })
    return { sendt: true, mottakere }
  } catch (e) {
    console.error('Prosjekt-varsel feilet:', e.message)
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
  const { type, kildeBefaringId, tilbudId, tilbudLink, dato, data } = body

  if (!TILLATTE_TYPER.includes(type)) {
    return res.status(400).json({ error: `Ugyldig type. Tillatte: ${TILLATTE_TYPER.join(', ')}` })
  }
  if (!tilbudId) return res.status(400).json({ error: 'Mangler tilbudId' })
  // For vunnet kreves kunde-info (skal opprette prosjekt)
  if (type === 'vunnet') {
    if (!data?.kundenavn?.trim()) return res.status(400).json({ error: 'vunnet: mangler data.kundenavn' })
    if (!data?.adresse?.trim()) return res.status(400).json({ error: 'vunnet: mangler data.adresse' })
  }

  try {
    const state = (await redis.get('fbs_state')) || {}
    const befaringer = Array.isArray(state.befaringer) ? state.befaringer : []
    const prosjekter = Array.isArray(state.prosjekter) ? state.prosjekter : []
    const ansatte = Array.isArray(state.ansatte) ? state.ansatte : []

    const nyStatus = TYPE_TIL_STATUS[type]
    const naa = dato || new Date().toISOString()

    // Oppdater kilde-befaring hvis ID er oppgitt og finnes
    let befaringFunnet = false
    let plKontakt = null
    let oppdatertBefaringer = befaringer
    if (kildeBefaringId) {
      oppdatertBefaringer = befaringer.map(b => {
        if (b.id !== kildeBefaringId) return b
        befaringFunnet = true
        // Slå opp PL-kontakt så vi kan varsle
        if (b.prosjektlederId) {
          const pl = ansatte.find(a => a.id === b.prosjektlederId)
          if (pl) plKontakt = { navn: pl.navn || pl.fornavn || null, epost: pl.epost || pl.email || null }
        }
        const oppdatert = { ...b, status: nyStatus, sistEvent: type, sistEventDato: naa }
        if (type === 'tilbud-sendt') {
          oppdatert.tilbudId = tilbudId
          if (tilbudLink) oppdatert.tilbudLink = tilbudLink
        }
        if (type === 'vunnet') {
          oppdatert.resultat = 'vunnet'
          oppdatert.importertTilTilbudId = tilbudId
        }
        if (type === 'tapt') {
          oppdatert.resultat = 'tapt'
          oppdatert.tapDato = naa
        }
        if (type === 'avvist') {
          oppdatert.resultat = 'avvist'
          oppdatert.tapDato = naa
        }
        return oppdatert
      })
    }

    // Fallback PL-lookup hvis ingen befaring/PL funnet, prøv via kontaktperson-navn
    if (!plKontakt && data?.kontaktperson) {
      const navnDel = (data.kontaktperson || '').toLowerCase().split(' ')[0]
      const pl = ansatte.find(a => (a.navn || '').toLowerCase().includes(navnDel))
      if (pl) plKontakt = { navn: pl.navn || null, epost: pl.epost || pl.email || null }
    }

    // Vunnet: opprett prosjekt (idempotent på tilbudId)
    let nyttProsjektId = null
    let varslingResultat = { sendt: false, grunn: 'ikke vunnet' }
    let alleredeOpprettet = false

    if (type === 'vunnet') {
      const eksisterende = prosjekter.find(p => p.kildeTilbudId === tilbudId)
      if (eksisterende) {
        nyttProsjektId = eksisterende.id
        alleredeOpprettet = true
      } else {
        const farge = FARGE_PALETT[prosjekter.length % FARGE_PALETT.length]
        const navn = `${data.kundenavn} — ${data.adresse}`.slice(0, 100)
        const beskrivelse = [
          data.pristype ? `Pristype: ${data.pristype}` : '',
          data.fag?.length ? `Fag: ${data.fag.join(', ')}` : '',
          data.estimertSum ? `Estimert: ${fmt(data.estimertSum)} kr` : '',
          tilbudLink ? `Tilbud: ${tilbudLink}` : '',
        ].filter(Boolean).join('\n')
        const nyttProsjekt = {
          id: nyId('p'),
          navn,
          adresse: data.adresse,
          startDato: '',
          sluttDato: '',
          status: 'aktiv',
          farge,
          beskrivelse,
          kildeTilbudId: tilbudId,
          kildeBefaringId: kildeBefaringId || null,
          kunde: {
            navn: data.kundenavn,
            adresse: data.adresse,
            telefon: data.telefon || '',
            epost: data.epost || '',
          },
          kontaktperson: data.kontaktperson || '',
          pristype: data.pristype || '',
          fag: Array.isArray(data.fag) ? data.fag : [],
          estimertSum: parseFloat(data.estimertSum) || 0,
          oppstartTekst: data.oppstart || '',
          varighetTekst: data.varighet || '',
          tilbudLink: tilbudLink || '',
          opprettet: naa,
          opprettetFra: 'tilbud-app',
        }
        nyttProsjektId = nyttProsjekt.id
        // Knytt prosjekt-ID på befaringen
        if (kildeBefaringId) {
          oppdatertBefaringer = oppdatertBefaringer.map(b =>
            b.id === kildeBefaringId ? { ...b, prosjektId: nyttProsjektId } : b
          )
        }
        const oppdatertState = {
          ...state,
          prosjekter: [...prosjekter, nyttProsjekt],
          befaringer: oppdatertBefaringer,
        }
        await redis.set('fbs_state', oppdatertState)
        // Send e-post-varsel
        const host = req.headers.host || 'follo-bemanning.vercel.app'
        const proto = host.startsWith('localhost') ? 'http' : 'https'
        varslingResultat = await sendProsjektVarsel(plKontakt, body, `${proto}://${host}`)
      }
    } else {
      // Ikke-vunnet: bare oppdater state med ny befaring-status
      if (befaringFunnet) {
        const oppdatertState = { ...state, befaringer: oppdatertBefaringer }
        await redis.set('fbs_state', oppdatertState)
      }
    }

    console.log(`POST /api/befaringer/event type:${type} tilbudId:${tilbudId} befaringId:${kildeBefaringId || '–'} → status:${nyStatus} prosjekt:${nyttProsjektId || '–'}`)

    return res.status(200).json({
      ok: true,
      befaringStatus: nyStatus,
      befaringFunnet,
      ...(nyttProsjektId ? { prosjektId: nyttProsjektId } : {}),
      ...(alleredeOpprettet ? { alleredeOpprettet: true } : {}),
      varsling: type === 'vunnet'
        ? (varslingResultat.sendt
            ? `E-post sendt til ${(varslingResultat.mottakere || []).join(', ')}`
            : `Ingen varsel: ${varslingResultat.grunn}`)
        : null,
    })
  } catch (e) {
    console.error('befaringer/event feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
