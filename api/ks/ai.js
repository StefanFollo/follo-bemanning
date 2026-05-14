// api/ks/ai.js — KS AI-endepunkt
//
// POST { action: 'fyll-beskrivelser', malId }
//   → Genererer beskrivelse + veiledning_kort + regelverkLenker for alle punkter i en mal
//
// POST { action: 'fyll-alle-beskrivelser' }
//   → Kjører fyll-beskrivelser for alle maler som mangler beskrivelser (admin)
//
// POST { action: 'lag-ny-mal', beskrivelse, kategori, fag }
//   → Returnerer ny mal som JSON (diff-visning, ikke lagret ennå)
//
// POST { action: 'endre-mal', malId, instruksjon }
//   → Returnerer endret mal som diff { leggTil, endre, fjern } (ikke lagret ennå)
//
// POST { action: 'velg-maler-for-prosjekt', poster, prosjektNavn }
//   → Kategoriserer poster og velger riktige maler
//
// POST { action: 'forklar-punkt', punktTekst, malNavn, kategori }
//   → Returnerer kort forklaring av et sjekkpunkt (for mobil-hjelp)

import Anthropic from '@anthropic-ai/sdk'
import { Redis } from '@upstash/redis'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-5'

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

async function aiKall(system, user, maxTokens = 2000) {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  })
  return msg.content[0].text
}

// ── Fyll beskrivelser for én mal ──────────────────────────────────────────────

async function fyllBeskrivelser(mal) {
  const system = `Du er ekspert på norsk byggebransje, TEK17, arbeidsmiljølov og NS-standarder.
Du skal skrive korte, presise faglige beskrivelser til sjekkpunkter i en kvalitetssikringssjekkliste.
Svar ALLTID med gyldig JSON.`

  const user = `Mal: "${mal.navn}" (kategori: ${mal.kategori}, gruppe: ${mal.gruppe || ''})

Sjekkpunkter:
${mal.punkter.map((p, i) => `${i + 1}. id="${p.id}" tekst="${p.tekst}"`).join('\n')}

For hvert sjekkpunkt, lag:
- beskrivelse: 2-4 setninger med teknisk krav, evt. måling, referanse til TEK17/NS/bransjenorm
- veiledning_kort: maks 12 ord — ett-setnings huskeregel for felt-bruk
- regelverkLenker: array med 0-2 relevante lenker [ { "tekst": "...", "url": "..." } ]
  (Bruk kun kjente, korrekte URL-er. Tving ikke inn lenker hvis du er usikker.)

Returner JSON:
{
  "punkter": [
    {
      "id": "...",
      "beskrivelse": "...",
      "veiledning_kort": "...",
      "regelverkLenker": []
    }
  ]
}`

  const raw = await aiKall(system, user, 3000)

  // Trekk ut JSON
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returnerte ikke gyldig JSON')
  const parsed = JSON.parse(jsonMatch[0])

  // Merge inn i mal-punktene
  const oppdatertePunkter = mal.punkter.map(p => {
    const ai = parsed.punkter?.find(a => a.id === p.id)
    if (!ai) return p
    return {
      ...p,
      beskrivelse: ai.beskrivelse || p.beskrivelse || '',
      veiledning_kort: ai.veiledning_kort || p.veiledning_kort || '',
      regelverkLenker: ai.regelverkLenker || p.regelverkLenker || [],
    }
  })

  return { ...mal, punkter: oppdatertePunkter, ai_beskrivelser_generert: new Date().toISOString() }
}

// ── Generer ny mal ────────────────────────────────────────────────────────────

async function lagNyMal(beskrivelse, kategori, fag) {
  const system = `Du er ekspert på norsk byggebransje. Du lager sjekkliste-maler for KS/HMS-systemer.
Svar ALLTID med gyldig JSON.`

  const user = `Lag en komplett sjekkliste-mal for: "${beskrivelse}"
Kategori: ${kategori}
Fag: ${fag.join(', ')}

Krav til malen:
- 6-14 sjekkpunkter (typisk 8-10)
- Hvert punkt har tekst (kort), beskrivelse (faglig), veiledning_kort (huskeregel)
- Marker krever_bilde: true for visuelt dokumenterbare punkter
- Marker krever_signering: true for kritiske/lovpålagte punkter
- Inkluder relevante TEK17/NS-lenker der du er sikker på URL

Returner JSON:
{
  "navn": "...",
  "gruppe": "...",
  "kategori": "${kategori}",
  "fag": ${JSON.stringify(fag)},
  "obligatorisk": false,
  "punkter": [
    {
      "id": "ny1",
      "tekst": "...",
      "beskrivelse": "...",
      "veiledning_kort": "...",
      "regelverkLenker": [],
      "krever_bilde": false,
      "krever_signering": false,
      "kommentar_pakrevd": false
    }
  ]
}`

  const raw = await aiKall(system, user, 3000)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returnerte ikke gyldig JSON')
  return JSON.parse(jsonMatch[0])
}

// ── Endre mal (returner diff) ─────────────────────────────────────────────────

async function endreMal(mal, instruksjon) {
  const system = `Du er ekspert på norsk byggebransje. Du endrer sjekkliste-maler.
Svar ALLTID med gyldig JSON.`

  const user = `Mal: "${mal.navn}"
Nåværende punkter:
${mal.punkter.map((p, i) => `${i + 1}. id="${p.id}" tekst="${p.tekst}"`).join('\n')}

Instruksjon fra bruker: "${instruksjon}"

Returner en diff med nøyaktig hva som skal endres:
{
  "leggTil": [
    { "etter_id": "p3", "tekst": "...", "beskrivelse": "...", "veiledning_kort": "...", "regelverkLenker": [], "krever_bilde": false, "krever_signering": false, "kommentar_pakrevd": false }
  ],
  "endre": [
    { "id": "p2", "felt": "tekst", "fra": "...", "til": "..." }
  ],
  "fjern": [
    { "id": "p5", "grunn": "..." }
  ],
  "forklaring": "Kort forklaring av hva AI endret og hvorfor"
}`

  const raw = await aiKall(system, user, 2000)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returnerte ikke gyldig JSON')
  return JSON.parse(jsonMatch[0])
}

// ── Velg maler for prosjekt ───────────────────────────────────────────────────

async function velgMalerForProsjekt(poster, prosjektNavn, alleMaler) {
  const system = `Du er ekspert på norsk byggebransje. Du kategoriserer byggeprosjekter og velger sjekkliste-maler.
Svar ALLTID med gyldig JSON.`

  const malListe = alleMaler
    .filter(m => !m.obligatorisk)
    .map(m => `id="${m.id}" navn="${m.navn}" gruppe="${m.gruppe}" kategori=${m.kategori}`)
    .join('\n')

  const user = `Prosjekt: "${prosjektNavn}"
Tilbudsposter:
${poster.map((p, i) => `${i + 1}. ${typeof p === 'string' ? p : p.beskrivelse || JSON.stringify(p)}`).join('\n')}

Tilgjengelige maler (ikke obligatoriske):
${malListe}

Velg hvilke maler som er relevante for dette prosjektet.
Returner JSON:
{
  "kategorier": ["bad-rehab", "maling", ...],
  "valgte_mal_ids": ["mal-id-1", "mal-id-2", ...],
  "begrunnelse": "Kort forklaring"
}`

  const raw = await aiKall(system, user, 1500)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returnerte ikke gyldig JSON')
  return JSON.parse(jsonMatch[0])
}

// ── Forklar et punkt ──────────────────────────────────────────────────────────

async function forklarPunkt(punktTekst, malNavn, kategori) {
  const system = `Du er en erfaren byggmester som forklarer faglige krav enkelt og tydelig for håndverkere.`
  const user = `Sjekkpunkt: "${punktTekst}"
Sjekkliste: "${malNavn}" (kategori: ${kategori})

Forklar dette punktet kort og konkret:
1. Hva betyr punktet i praksis?
2. Slik sjekker du det (1-3 steg)
3. Vanlige feil å unngå

Maks 120 ord. Skriv som om du snakker til en lærling.`

  return aiKall(system, user, 400)
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSession(req)
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  const isAdmin = session.role === 'admin'
  const kanSkrive = isAdmin || session.role === 'kontor'
  const { action, ...body } = req.body

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY ikke satt i Vercel' })
  }

  try {
    switch (action) {

      case 'fyll-beskrivelser': {
        if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
        const { malId } = body
        const maler = (await redis.get('fbs_ks_maler')) || []
        const mal = maler.find(m => m.id === malId)
        if (!mal) return res.status(404).json({ error: 'Mal ikke funnet' })
        const oppdatert = await fyllBeskrivelser(mal)
        const idx = maler.findIndex(m => m.id === malId)
        const ny = [...maler]; ny[idx] = oppdatert
        await redis.set('fbs_ks_maler', ny)
        return res.status(200).json({ ok: true, mal: oppdatert })
      }

      case 'fyll-alle-beskrivelser': {
        if (!isAdmin) return res.status(403).json({ error: 'Kun admin' })
        const maler = (await redis.get('fbs_ks_maler')) || []
        const mangler = maler.filter(m => m.punkter.some(p => !p.beskrivelse))
        const resultater = []
        for (const mal of mangler) {
          try {
            const oppdatert = await fyllBeskrivelser(mal)
            const idx = maler.findIndex(m => m.id === mal.id)
            maler[idx] = oppdatert
            resultater.push({ id: mal.id, ok: true })
          } catch (e) {
            resultater.push({ id: mal.id, ok: false, feil: e.message })
          }
        }
        await redis.set('fbs_ks_maler', maler)
        return res.status(200).json({ ok: true, behandlet: resultater.length, resultater })
      }

      case 'lag-ny-mal': {
        if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
        const forslag = await lagNyMal(body.beskrivelse, body.kategori || 'tomrer', body.fag || [])
        return res.status(200).json({ ok: true, forslag })
      }

      case 'endre-mal': {
        if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
        const maler = (await redis.get('fbs_ks_maler')) || []
        const mal = maler.find(m => m.id === body.malId)
        if (!mal) return res.status(404).json({ error: 'Mal ikke funnet' })
        const diff = await endreMal(mal, body.instruksjon)
        return res.status(200).json({ ok: true, diff, mal })
      }

      case 'velg-maler-for-prosjekt': {
        const alleMaler = (await redis.get('fbs_ks_maler')) || []
        const resultat = await velgMalerForProsjekt(body.poster || [], body.prosjektNavn || '', alleMaler)
        return res.status(200).json({ ok: true, ...resultat })
      }

      case 'forklar-punkt': {
        const tekst = await forklarPunkt(body.punktTekst, body.malNavn || '', body.kategori || '')
        return res.status(200).json({ ok: true, forklaring: tekst })
      }

      default:
        return res.status(400).json({ error: `Ukjent action: ${action}` })
    }
  } catch (e) {
    console.error('KS AI feil:', e)
    return res.status(500).json({ error: e.message })
  }
}
