// api/befaringer/planlagte.js — GET-endepunkt for Tilbuds-appen.
//
// Returnerer alle befaringer med status "planlagt" eller "tilbud_arbeid".
// Tilbuds-appen viser dem som valgmulighet når PL starter et nytt tilbud,
// og fyller inn kundedata automatisk.
//
// Auth: Bearer INTER_APP_TOKEN i Authorization-header.

import { Redis } from '@upstash/redis'
import { validerInterAppToken } from '../_interApp.js'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// Status-verdier som anses som "ledige til import"
const LEDIGE_STATUS = ['planlagt', 'tilbud_arbeid', 'tilbud_sendt']

function sammensetDato(dato, tid) {
  if (!dato) return null
  if (tid && /^\d{2}:\d{2}$/.test(tid)) return `${dato}T${tid}:00`
  return `${dato}T00:00:00`
}

export default async function handler(req, res) {
  // CORS — Tilbuds-appen kan kalle direkte fra serverless function (samme nettverk)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Inter-app-auth
  const valid = validerInterAppToken(req)
  if (!valid.ok) return res.status(valid.status).json({ error: valid.error })

  try {
    const state = await redis.get('fbs_state')
    const befaringer = state?.befaringer || []
    const ansatte = state?.ansatte || []
    const finnPlNavn = (id) => {
      if (!id) return null
      const a = ansatte.find(x => x.id === id)
      return a ? (a.navn || a.fornavn || null) : null
    }

    // Filtrér til "ledige" befaringer som ikke allerede er importert til et tilbud.
    // Bruker `importertTilTilbudId` for å unngå dobbel-import.
    const planlagte = befaringer
      .filter(b => LEDIGE_STATUS.includes(b.status))
      .filter(b => !b.importertTilTilbudId)
      .map(b => ({
        id: b.id,
        kundenavn: b.kontaktNavn || '',
        adresse: b.adresse || '',
        telefon: b.telefon || '',
        epost: b.epost || '',
        befaringsdato: sammensetDato(b.dato, b.tid),
        ansvarligPL: finnPlNavn(b.prosjektlederId),
        ansvarligPLId: b.prosjektlederId || null,
        notater: b.notat || b.kommentar || '',
        jobbType: b.jobbType || '',
        estimertBelop: b.estimertBelop || '',
        tilbudFrist: b.tilbudFrist || '',
        oensketOppstart: b.oensketOppstart || '',
        status: b.status,
      }))
      // Nyeste først (siste registrert øverst)
      .sort((a, b) => (b.befaringsdato || '').localeCompare(a.befaringsdato || ''))

    return res.status(200).json(planlagte)
  } catch (e) {
    console.error('befaringer/planlagte feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
