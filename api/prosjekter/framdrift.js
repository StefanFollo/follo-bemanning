// api/prosjekter/framdrift.js — AI-generert framdriftsplan for et prosjekt.
//
// POST { prosjektId, kontekst? }
// Auth: bruker-JWT (fbs_session:TOKEN i Redis)
//
// Henter kildeTilbudData fra prosjektet, kaller Claude claude-sonnet-4-6,
// og lagrer rikt framdriftsplan-objekt tilbake i Redis.

import { Redis } from '@upstash/redis'

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

const FAG_MAP = {
  tomrer: 'tomrer', tømrer: 'tomrer', snekker: 'tomrer',
  rive: 'tomrer', riving: 'tomrer', grunnarbeid: 'tomrer', konstruksjon: 'tomrer',
  flis: 'flis', flislegger: 'flis', membran: 'flis', murer: 'flis',
  rorlegger: 'rorlegger', rørlegger: 'rorlegger', ror: 'rorlegger',
  rør: 'rorlegger', sanitær: 'rorlegger', vvs: 'rorlegger',
  elektriker: 'elektriker', el: 'elektriker',
  maler: 'maling', maling: 'maling',
  ventilasjon: 'ventilasjon',
  ferdigstilling: 'ferdig', sluttrengjøring: 'ferdig', rengjøring: 'ferdig',
  listverk: 'tomrer', gulvlegging: 'tomrer',
}

function mapFag(f) { return FAG_MAP[(f || '').toLowerCase().trim()] || 'annet' }

function parseOppstartUke(oppstart) {
  if (!oppstart) return { uke: 31, aar: 2026 }
  const m = (oppstart + '').match(/\b(\d{1,2})\b/)
  const aarM = (oppstart + '').match(/\b(202\d)\b/)
  return { uke: m ? parseInt(m[1]) : 31, aar: aarM ? parseInt(aarM[1]) : 2026 }
}

// ISO-dato for mandag i uke N, år Y (ISO 8601 week)
function ukeTilDato(uke, aar) {
  const jan4 = new Date(aar, 0, 4)
  const dag = jan4.getDay() || 7
  const uke1Mandag = new Date(jan4.getTime() - (dag - 1) * 86400000)
  const d = new Date(uke1Mandag.getTime() + (uke - 1) * 7 * 86400000)
  return d.toISOString().slice(0, 10)
}

async function genererMedAI(tilbudData, prosjekt, kontekst, apiKey) {
  const { poster = [], timer = {}, oppstart = '', varighet = '' } = tilbudData
  const adresse = tilbudData.adresse || prosjekt.adresse || '(ukjent)'

  const oppstartRef = oppstart || prosjekt.startDato || ''
  const { uke, aar } = parseOppstartUke(oppstartRef)

  const FAG_LABEL = {
    tomrer: 'Tømrer', ror: 'Rørlegger', flis: 'Flislegger',
    el: 'Elektriker', maler: 'Maler', rive: 'Rivearbeider',
  }

  const timerLinjer = Object.entries(timer)
    .filter(([, v]) => parseFloat(v) > 0)
    .map(([k, v]) => `- ${FAG_LABEL[k] || k}: ${v} timer`)
    .join('\n') || '(ingen timer-data)'

  const posterLinjer = (poster || [])
    .filter(p => p && (p.navn || p.beskrivelse))
    .slice(0, 30)
    .map((p, i) => {
      const navn = (p.navn || p.beskrivelse || `Post ${i + 1}`).replace(/^\s*\d+[\s.)\-:]+\s*/, '').slice(0, 80)
      const kTimer = Array.isArray(p.kalkyle?.timer)
        ? Math.round(p.kalkyle.timer.reduce((s, r) => s + (parseFloat(r.antall) || 0), 0))
        : null
      const kFag = Array.isArray(p.kalkyle?.timer)
        ? [...new Set(p.kalkyle.timer.map(r => r.fag).filter(Boolean))].join(', ')
        : null
      return `${i + 1}. ${navn}${kTimer ? ` — ${kTimer} timer` : ''}${kFag ? ` [${kFag}]` : ''}`
    })
    .join('\n') || '(ingen poster)'

  const varighetN = parseInt((varighet + '').match(/(\d+)/)?.[1] || '12')

  const prompt = `Du er ekspert på byggeprosesser i Norge. Lag en realistisk framdriftsplan.

PROSJEKT:
- Adresse: ${adresse}
- Oppstart: uke ${uke} ${aar}
- Total varighet: ${varighet || `${varighetN} uker`}
- Mannskap tilgjengelig: 2-3 fagarbeidere${kontekst ? `\n\nEKSTRA KONTEKST FRA PL:\n${kontekst}` : ''}

TIMER PER FAG:
${timerLinjer}

POSTER FRA TILBUD:
${posterLinjer}

OBLIGATORISKE AVHENGIGHETER:
- Riving FØR alt annet
- Skjult rør/el FØR membran eller veggkledning
- Membran FØR fliser
- Fliser FØR sanitærutstyr
- Maling FØR listverk
- Alt teknisk FØR sluttrengjøring og befaring

REGLER:
- 1 fagarbeider = 8 timer/dag, 5 dager/uke
- Buffer: 15% generelt, 25% for våtrom (membran, flis) og kritiske faser
- Bruk kun disse fag-verdiene: "tomrer","flis","rorlegger","elektriker","maling","ventilasjon","ferdig","annet"
- Marker kritiske faser (membran, våtrom) med kritisk: true
- Lag 2-4 milepæler: materialvalg fra kunde, vannskade-stopp, sluttbefaring
- Faser starter aldri samme uke med mindre de kan gå parallelt

RETURNER KUN VALID JSON (ingen forklaringstekst):
{
  "startUke": ${uke},
  "startAar": ${aar},
  "totalUker": ${varighetN},
  "faser": [
    {
      "navn": "Riving",
      "fag": "tomrer",
      "startUke": ${uke},
      "varighetDager": 3,
      "timer": 24,
      "mannskap": 2,
      "kritisk": false,
      "beskrivelse": "Riving av eksisterende bad"
    }
  ],
  "milepaler": [
    {
      "navn": "Vannskade-stopp",
      "uke": ${uke + 1},
      "kritisk": true,
      "type": "teknisk",
      "beskrivelse": "Membran ferdig og godkjent"
    }
  ],
  "estimertSluttUke": ${uke + varighetN - 1},
  "advarsler": []
}`

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!r.ok) {
    const err = await r.text()
    throw new Error(`Claude ${r.status}: ${err.slice(0, 200)}`)
  }

  const d = await r.json()
  const rawText = d.content?.[0]?.text || ''
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returnerte ingen JSON')
  const plan = JSON.parse(jsonMatch[0])

  // Bygg rike faser med stabile ID-er
  const faser = (plan.faser || []).map((f, i) => ({
    id: `fase-${i + 1}`,
    navn: (f.navn || 'Fase').slice(0, 60),
    fag: [mapFag(f.fag)],
    startUke: Math.max(uke, parseInt(f.startUke) || uke),
    startDato: ukeTilDato(Math.max(uke, parseInt(f.startUke) || uke), aar),
    varighetDager: Math.max(1, parseInt(f.varighetDager) || 5),
    timer: parseInt(f.timer) || 0,
    mannskap: Math.max(1, parseInt(f.mannskap) || 2),
    ansvarlig: null,
    foreslattMannskap: [],
    kritisk: Boolean(f.kritisk),
    venterPaa: [],
    beskrivelse: (f.beskrivelse || '').slice(0, 200),
    status: 'planlagt',
  }))

  const milepaler = (plan.milepaler || []).slice(0, 6).map((m, i) => ({
    id: `mil-${i + 1}`,
    navn: (m.navn || 'Milepæl').slice(0, 60),
    uke: parseInt(m.uke) || uke,
    dato: ukeTilDato(parseInt(m.uke) || uke, aar),
    kritisk: Boolean(m.kritisk),
    type: m.type || 'teknisk',
    beskrivelse: (m.beskrivelse || '').slice(0, 200),
  }))

  const sluttUke = Math.max(
    parseInt(plan.estimertSluttUke) || (uke + varighetN - 1),
    faser.reduce((max, f) => {
      const slutt = f.startUke + Math.ceil(f.varighetDager / 5)
      return slutt > max ? slutt : max
    }, uke)
  )

  return {
    generertDato: new Date().toISOString(),
    generertAv: 'AI',
    versjon: 1,
    oppstartUke: uke,
    oppstartAar: aar,
    oppstartDato: ukeTilDato(uke, aar),
    estimertSluttUke: sluttUke,
    estimertSluttDato: ukeTilDato(sluttUke, aar),
    totalVarighetUker: parseInt(plan.totalUker) || varighetN,
    bufferProsent: 15,
    faser,
    milepaler,
    kritiskSti: faser.filter(f => f.kritisk).map(f => f.id),
    advarsler: plan.advarsler || [],
    sistRedigert: new Date().toISOString(),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSession(req)
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler i Vercel-env-vars' })

  const { prosjektId, kontekst } = req.body || {}
  if (!prosjektId) return res.status(400).json({ error: 'Mangler prosjektId' })

  try {
    const state = (await redis.get('fbs_state')) || {}
    const prosjekter = Array.isArray(state.prosjekter) ? state.prosjekter : []
    const prosjekt = prosjekter.find(p => p.id === prosjektId)
    if (!prosjekt) return res.status(404).json({ error: 'Prosjekt ikke funnet' })

    const tilbudData = prosjekt.kildeTilbudData
    if (!tilbudData || (!tilbudData.poster?.length && !Object.keys(tilbudData.timer || {}).length)) {
      return res.status(400).json({
        error: 'Ingen tilbudsdata på prosjektet. Prosjektet ble ikke opprettet fra tilbuds-appen med framdrift.',
      })
    }

    const framdriftsplan = await genererMedAI(tilbudData, prosjekt, kontekst, apiKey)

    // Behold versjonsnummer ved regenerering
    framdriftsplan.versjon = (prosjekt.framdriftsplan?.versjon || 0) + 1

    const nowTs = Date.now()
    const oppdatertState = {
      ...state,
      prosjekter: prosjekter.map(p =>
        p.id === prosjektId ? { ...p, framdriftsplan, _endret: nowTs } : p
      ),
      _fieldTs: { ...(state._fieldTs || {}), prosjekter: nowTs },
      _updatedAt: nowTs,
    }
    await redis.set('fbs_state', oppdatertState)

    console.log(
      `POST /api/prosjekter/framdrift prosjektId:${prosjektId}` +
      ` → ${framdriftsplan.faser.length} faser, v${framdriftsplan.versjon}`
    )
    return res.status(200).json({ ok: true, framdriftsplan })
  } catch (e) {
    console.error('prosjekter/framdrift feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
