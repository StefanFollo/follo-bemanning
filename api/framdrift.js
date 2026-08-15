// api/framdrift.js — Lagre og regenerer AI-framdriftsplan.
//
// POST (inter-app, Bearer INTER_APP_TOKEN):
//   { prosjektId, fdTasks, fdStartWeek, fdStartYear, fdTotalWeeks,
//     milepaler?, kildeTilbudData? }
//   → Oppdaterer prosjektet i Redis med framdriftsdata.
//
// POST (bruker-JWT, body.regenerer = true):
//   { prosjektId }
//   → Henter kildeTilbudData fra prosjektet, kaller Claude og oppdaterer fdTasks.

import { skrivStateOgBump } from './_stateCas.js'
import { Redis } from '@upstash/redis'
import { validerInterAppToken } from './_interApp.js'

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
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
  flis: 'flis', flislegger: 'flis', membran: 'flis', murer: 'flis',
  rorlegger: 'rorlegger', rørlegger: 'rorlegger', ror: 'rorlegger',
  rør: 'rorlegger', sanitær: 'rorlegger', vvs: 'rorlegger',
  elektriker: 'elektriker', el: 'elektriker',
  maler: 'maling', maling: 'maling',
  ventilasjon: 'ventilasjon',
  rive: 'tomrer', riving: 'tomrer',
  ferdigstilling: 'ferdig', sluttrengjøring: 'ferdig', rengjøring: 'ferdig',
}
function mapFag(f) { return FAG_MAP[(f || '').toLowerCase().trim()] || 'annet' }
function uid() { return `fd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }

function parseOppstartUke(oppstart) {
  if (!oppstart) return { uke: 31, aar: 2026 }
  const m = (oppstart + '').match(/\b(\d{1,2})\b/)
  const aarM = (oppstart + '').match(/\b(202\d)\b/)
  return { uke: m ? parseInt(m[1]) : 31, aar: aarM ? parseInt(aarM[1]) : 2026 }
}

const FAG_LABEL = {
  tomrer: 'Tømrer', ror: 'Rørlegger', flis: 'Flislegger',
  el: 'Elektriker', maler: 'Maler', rive: 'Rivearbeider',
}

async function genererMedAI(tilbudData, apiKey) {
  const { poster = [], timer = {}, oppstart = '', varighet = '', adresse = '', kundenavn = '' } = tilbudData

  const timerLinjer = Object.entries(timer)
    .filter(([, v]) => parseFloat(v) > 0)
    .map(([k, v]) => `- ${FAG_LABEL[k] || k}: ${v} timer`)
    .join('\n') || '(ingen timer-data)'

  const posterLinjer = (poster || [])
    .filter(p => p && (p.navn || p.beskrivelse))
    .slice(0, 25)
    .map((p, i) => {
      const navn = (p.navn || p.beskrivelse || `Post ${i + 1}`).replace(/^\s*\d+[\s.)\-:]+\s*/, '').slice(0, 80)
      const kTimer = Array.isArray(p.kalkyle?.timer)
        ? Math.round(p.kalkyle.timer.reduce((s, r) => s + (parseFloat(r.antall) || 0), 0))
        : null
      const kFag = Array.isArray(p.kalkyle?.timer)
        ? [...new Set(p.kalkyle.timer.map(r => r.fag).filter(Boolean))].join(', ')
        : null
      return `${i + 1}. ${navn}${kTimer ? ` — ${kTimer} timer` : ''}${kFag ? ` — ${kFag}` : ''}`
    })
    .join('\n') || '(ingen poster)'

  const { uke, aar } = parseOppstartUke(oppstart)
  const varighetN = (varighet + '').match(/(\d+)/)?.[1] || 12

  const prompt = `Du er ekspert på norske byggeprosesser. Lag realistisk framdriftsplan.

PROSJEKT:
- Adresse: ${adresse}
- Oppstart: ${oppstart || `uke ${uke} ${aar}`}
- Varighet: ${varighet || `${varighetN} uker`}

TIMER PER FAG:
${timerLinjer}

TILBUDSPOSTER:
${posterLinjer}

REGLER:
- Rekkefølge: riving → rør/el skjult → membran → flis → sanitær → maling → ferdigstilling
- Flis venter på membran; sanitær venter på flis; maling venter på lukkede overflater
- 1 fagarbeider ≈ 8 timer/dag. Inkluder 15% buffer (25% for våtrom).
- Bruk fag: "tomrer","flis","rorlegger","elektriker","maling","ventilasjon","ferdig","annet"

RETURNER KUN VALID JSON:
{
  "startUke": ${uke},"startAar": ${aar},"totalUker": ${varighetN},
  "faser": [{"navn":"Riving","fag":"tomrer","startDag":0,"varighetDager":3}],
  "milepaler": [{"navn":"Membran ferdig","dagFraStart":14}]
}`

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-5', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) throw new Error(`Claude ${r.status}`)
  const d = await r.json()
  const rawText = (d.content || []).map(c => c?.text || '').join('')
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returnerte ingen JSON')
  const plan = JSON.parse(jsonMatch[0])

  const fdTasks = (plan.faser || []).map(f => ({
    id: uid(),
    name: (f.navn || 'Fase').slice(0, 60),
    start: Math.max(0, parseInt(f.startDag) || 0),
    dur: Math.max(1, parseInt(f.varighetDager) || 5),
    pct: 0,
    fag: mapFag(f.fag),
  }))

  return {
    fdTasks,
    fdStartWeek: plan.startUke || uke,
    fdStartYear: plan.startAar || aar,
    fdTotalWeeks: plan.totalUker || parseInt(varighetN),
    milepaler: (plan.milepaler || []).slice(0, 10),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body || {}

  // Regenerer-modus: kallet kommer fra bemannings-appens frontend
  if (body.regenerer) {
    const session = await getSession(req)
    if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler i Vercel-env-vars' })

    if (!body.prosjektId) return res.status(400).json({ error: 'Mangler prosjektId' })

    try {
      const state = (await redis.get('fbs_state')) || {}
      const prosjekter = Array.isArray(state.prosjekter) ? state.prosjekter : []
      const prosjekt = prosjekter.find(p => p.id === body.prosjektId)
      if (!prosjekt) return res.status(404).json({ error: 'Prosjekt ikke funnet' })

      const tilbudData = prosjekt.kildeTilbudData
      if (!tilbudData || (!tilbudData.poster?.length && !Object.keys(tilbudData.timer || {}).length)) {
        return res.status(400).json({ error: 'Ingen tilbudsdata lagret på prosjektet. Framdrift ble ikke opprettet fra tilbuds-appen.' })
      }

      const generated = await genererMedAI({ ...tilbudData, adresse: prosjekt.adresse }, apiKey)

      const nowTs1 = Date.now()
      const oppdatertState = {
        ...state,
        prosjekter: prosjekter.map(p => p.id === body.prosjektId
          ? { ...p, ...generated, fdGenDato: new Date().toISOString(), fdGenAv: 'AI', _endret: nowTs1 }
          : p
        ),
        _fieldTs: { ...(state._fieldTs || {}), prosjekter: nowTs1 },
        _updatedAt: nowTs1,
      }
      await skrivStateOgBump(redis, oppdatertState)

      console.log(`POST /api/framdrift [regenerer] prosjektId:${body.prosjektId} → ${generated.fdTasks.length} faser`)
      return res.status(200).json({ ok: true, ...generated })
    } catch (e) {
      console.error('framdrift regenerer feil:', e.message)
      return res.status(500).json({ error: e.message })
    }
  }

  // Lagre-modus: kallet kommer fra tilbuds-appen via inter-app token
  const valid = validerInterAppToken(req)
  if (!valid.ok) return res.status(valid.status).json({ error: valid.error })

  const { prosjektId, fdTasks, fdStartWeek, fdStartYear, fdTotalWeeks, milepaler, kildeTilbudData } = body
  if (!prosjektId) return res.status(400).json({ error: 'Mangler prosjektId' })
  if (!Array.isArray(fdTasks)) return res.status(400).json({ error: 'fdTasks må være array' })

  try {
    const state = (await redis.get('fbs_state')) || {}
    const prosjekter = Array.isArray(state.prosjekter) ? state.prosjekter : []

    if (!prosjekter.find(p => p.id === prosjektId)) {
      return res.status(404).json({ error: 'Prosjekt ikke funnet' })
    }

    const nowTs2 = Date.now()
    const oppdatertState = {
      ...state,
      prosjekter: prosjekter.map(p => p.id === prosjektId
        ? {
            ...p,
            fdTasks,
            fdStartWeek: fdStartWeek || p.fdStartWeek,
            fdStartYear: fdStartYear || p.fdStartYear,
            fdTotalWeeks: fdTotalWeeks || p.fdTotalWeeks,
            fdMilepaler: milepaler || [],
            fdGenDato: new Date().toISOString(),
            fdGenAv: 'AI',
            ...(kildeTilbudData ? { kildeTilbudData } : {}),
            _endret: nowTs2,
          }
        : p
      ),
      _fieldTs: { ...(state._fieldTs || {}), prosjekter: nowTs2 },
      _updatedAt: nowTs2,
    }
    await skrivStateOgBump(redis, oppdatertState)

    console.log(`POST /api/framdrift [lagre] prosjektId:${prosjektId} → ${fdTasks.length} faser, uke ${fdStartWeek}`)
    return res.status(200).json({ ok: true, faser: fdTasks.length })
  } catch (e) {
    console.error('framdrift lagre feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
