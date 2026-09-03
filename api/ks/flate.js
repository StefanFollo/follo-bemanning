// ═══ /api/ks/flate — KS-ansattflaten (SPEC-ks-ansattflate.md PR1) ═══
// Token-basert mobil flate for de på byggeplassen. INGEN vanlig innlogging —
// personlig varig token i lenken (/ks/<token>), verifisert første gang med de
// 4 siste sifrene i eget telefonnummer. 5 feil → sperret til PL lager ny lenke.
//
// GET  ?token=            → maaVerifisere ELLER { fornavn, prosjekter[ {id,navn,sjekklister[]} ] }
// POST { token, handling:'verifiser', siffer }
// POST { token, handling:'punkt', sjekklisteId, punktId, status, kommentar }
//
// 🛑 Flaten ser KUN: eget fornavn, egne aktive prosjekter (id+navn) og
// sjekklister der ansatt står som ansvarlig. Aldri kunder, priser, tilbud,
// andre ansatte. Utfylling logges i fbs_ks_utfylling_historikk (ryddes aldri).

import { Redis } from '@upstash/redis'
import { put } from '@vercel/blob'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })

// Bilder sendes som dataURL i JSON (klient-komprimert til maks ~1600px/0.8):
// hev bodyParser-grensen — standard 1 MB er for lite for byggeplass-bilder.
export const config = { api: { bodyParser: { sizeLimit: '6mb' } } }

export const TOKENS_NOKKEL = 'fbs_ks_flate_tokens'
export const HISTORIKK_NOKKEL = 'fbs_ks_utfylling_historikk'
const MAKS_FEIL_SIFFER = 5
const GYLDIGE_STATUSER = ['ok', 'ikke-aktuelt', '']

function klientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean)
  return req.headers['x-real-ip'] || xff[xff.length - 1] || 'unknown'
}
async function rateLimit(nokkel, maks) {
  try {
    const key = `fbs_attempts:${nokkel}`
    const attempts = await redis.incr(key)
    if (attempts === 1) await redis.expire(key, 900)
    return attempts > maks
  } catch { return false }
}

function iDagIso() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function beregnStatus(punkter) {
  if (!punkter?.length) return 'ikke-startet'
  const alleOK = punkter.every(p => p.status === 'ok' || p.status === 'ikke-aktuelt')
  const noenUtfort = punkter.some(p => p.status === 'ok' || p.status === 'avvik' || p.status === 'ikke-aktuelt')
  if (alleOK) return 'ferdig'
  if (noenUtfort) return 'pagar'
  return 'ikke-startet'
}
function normNavn(s) { return String(s || '').trim().toLowerCase() }

// Sjekklister som tilhører ansatt (ansvarlig-lista holder NAVN, satt i TildelModal)
function erAnsvarlig(sl, ansattNavn) {
  return (sl.ansvarlig || []).some(n => normNavn(n) === normNavn(ansattNavn))
}

// Kundesynlig-sanitert punkt → ansatt-synlig punkt (alt unntatt interne AI-felter)
function punktUt(p) {
  return {
    id: p.id, tekst: p.tekst, beskrivelse: p.beskrivelse || '', veiledning_kort: p.veiledning_kort || '',
    krever_bilde: !!p.krever_bilde, krever_signering: !!p.krever_signering,
    status: p.status || '', kommentar: p.kommentar || '', utfort_av: p.utfort_av || null, utfort_dato: p.utfort_dato || null,
    signert_av: p.signert_av || null,
    bilder: (p.bilder || []).map(b => ({ url: b.url, opplastet: b.opplastet || null, av: b.av || null })),
  }
}

async function loggHistorikk(innslag) {
  try {
    const hist = (await redis.get(HISTORIKK_NOKKEL)) || []
    hist.push(innslag)
    await redis.set(HISTORIKK_NOKKEL, hist)
  } catch { /* historikk-feil skal aldri stoppe utfyllingen */ }
}

// Felles vern for skrivende handlinger: eierskap + lås. Returnerer
// { alle, idx, sl } eller skriver feilsvar og returnerer null.
async function hentSkrivbarSjekkliste(res, sjekklisteId, ansatt) {
  const alle = (await redis.get('fbs_ks_sjekklister')) || []
  const idx = alle.findIndex(s => s && s.id === sjekklisteId)
  if (idx < 0) { res.status(404).json({ error: 'Sjekklisten finnes ikke' }); return null }
  const sl = alle[idx]
  if (!erAnsvarlig(sl, ansatt.navn)) { res.status(403).json({ error: 'Du er ikke ansvarlig for denne sjekklisten' }); return null }
  if (sl.signert_av || sl.levert_dato) { res.status(409).json({ laast: true, error: 'Sjekklisten er levert og kan ikke endres. Kontakt prosjektleder.' }); return null }
  return { alle, idx, sl }
}

async function hentTokenInfo(token) {
  if (!token || !/^[a-f0-9]{32,64}$/.test(token)) return null
  const tokens = (await redis.get(TOKENS_NOKKEL)) || {}
  return tokens[token] ? { tokens, info: tokens[token] } : null
}

export default async function handler(req, res) {
  const ip = klientIp(req)
  if (await rateLimit(`ksflate-ip:${ip}`, 120)) {
    return res.status(429).json({ error: 'For mange forespørsler. Vent 15 minutter.' })
  }

  const token = String((req.method === 'GET' ? (req.query || {}).token : (req.body || {}).token) || '').trim()
  const funn = await hentTokenInfo(token)
  // Samme svar for ukjent og utgått token — ingen opplisting/probing
  if (!funn) return res.status(404).json({ utlopt: true, error: 'Lenken er utløpt eller ugyldig. Kontakt din prosjektleder for ny lenke.' })
  const { tokens, info } = funn

  const state = (await redis.get('fbs_state')) || {}
  const ansatt = (state.ansatte || []).find(a => a && a.id === info.ansattId)
  // Arkivert/slettet ansatt → lenken er død (spec §1)
  if (!ansatt || ansatt.arkivert) {
    return res.status(404).json({ utlopt: true, error: 'Lenken er utløpt eller ugyldig. Kontakt din prosjektleder for ny lenke.' })
  }
  if (info.sperret) {
    return res.status(423).json({ sperret: true, error: 'Lenken er sperret etter for mange feilforsøk. Be prosjektleder sende deg en ny.' })
  }

  const fornavn = String(ansatt.navn || '').trim().split(/\s+/)[0]

  // ── POST: verifisering eller punkt-utfylling ──
  if (req.method === 'POST') {
    let body = req.body
    if (typeof body === 'string') try { body = JSON.parse(body) } catch { body = {} }
    const handling = (body || {}).handling

    if (handling === 'verifiser') {
      if (await rateLimit(`ksflate-verifiser:${token}`, 10)) return res.status(429).json({ error: 'For mange forsøk. Vent 15 minutter.' })
      const riktige = String(ansatt.telefon || '').replace(/\D/g, '').slice(-4)
      const sendte = String(body.siffer || '').replace(/\D/g, '')
      if (!riktige || riktige.length < 4) {
        return res.status(409).json({ manglerTelefon: true, error: 'Telefonnummer mangler på ansattkortet ditt. Kontakt prosjektleder.' })
      }
      if (sendte !== riktige) {
        info.feilForsok = (info.feilForsok || 0) + 1
        if (info.feilForsok >= MAKS_FEIL_SIFFER) info.sperret = true
        tokens[token] = info
        await redis.set(TOKENS_NOKKEL, tokens)
        if (info.sperret) return res.status(423).json({ sperret: true, error: 'Lenken er sperret etter for mange feilforsøk. Be prosjektleder sende deg en ny.' })
        return res.status(401).json({ feilSiffer: true, igjen: MAKS_FEIL_SIFFER - info.feilForsok, error: 'Feil siffer. Prøv igjen.' })
      }
      info.verifisert = true
      info.feilForsok = 0
      info.verifisertDato = new Date().toISOString()
      tokens[token] = info
      await redis.set(TOKENS_NOKKEL, tokens)
      return res.status(200).json({ ok: true, verifisert: true })
    }

    if (handling === 'punkt') {
      if (!info.verifisert) return res.status(401).json({ maaVerifisere: true, error: 'Bekreft med de 4 siste sifrene i telefonnummeret ditt først.' })
      const { sjekklisteId, punktId, status, kommentar } = body || {}
      if (!sjekklisteId || !punktId) return res.status(400).json({ error: 'Mangler sjekklisteId eller punktId' })
      if (status !== undefined && !GYLDIGE_STATUSER.includes(status)) {
        // Avvik meldes via PL i PR1 — ansattflaten kan kun kvittere/ikke-aktuelt
        return res.status(400).json({ error: 'Ugyldig status for ansattflaten' })
      }
      const funn2 = await hentSkrivbarSjekkliste(res, sjekklisteId, ansatt)
      if (!funn2) return
      const { alle, idx, sl } = funn2
      const pIdx = (sl.punkter || []).findIndex(p => p && p.id === punktId)
      if (pIdx < 0) return res.status(404).json({ error: 'Punktet finnes ikke' })
      const punkt = sl.punkter[pIdx]
      if (punkt.signert_av) return res.status(409).json({ laast: true, error: 'Punktet er signert og låst.' })

      const foer = { status: punkt.status || '', kommentar: punkt.kommentar || '' }
      const ny = { ...punkt }
      if (status !== undefined) {
        ny.status = status
        ny.utfort_av = status ? ansatt.navn : null
        ny.utfort_dato = status ? new Date().toISOString() : null
      }
      if (kommentar !== undefined) ny.kommentar = String(kommentar).slice(0, 2000)
      sl.punkter = sl.punkter.map((p, i) => (i === pIdx ? ny : p))
      sl.status = beregnStatus(sl.punkter)
      alle[idx] = sl
      await redis.set('fbs_ks_sjekklister', alle)

      await loggHistorikk({ dato: new Date().toISOString(), ansattId: ansatt.id, navn: ansatt.navn, kilde: 'ansattflate',
        sjekklisteId, prosjektId: sl.prosjektId, punktId, foer, etter: { status: ny.status || '', kommentar: ny.kommentar || '' } })

      return res.status(200).json({ ok: true, punkt: punktUt(ny), sjekklisteStatus: sl.status })
    }

    // ── PR2: bilde per punkt (klient-komprimert dataURL → Vercel Blob) ──
    if (handling === 'bilde') {
      if (!info.verifisert) return res.status(401).json({ maaVerifisere: true, error: 'Bekreft med de 4 siste sifrene i telefonnummeret ditt først.' })
      const { sjekklisteId, punktId, bildeData } = body || {}
      if (!sjekklisteId || !punktId || !bildeData) return res.status(400).json({ error: 'Mangler sjekklisteId, punktId eller bildeData' })
      if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'Bildelagring er ikke konfigurert (BLOB_READ_WRITE_TOKEN mangler).' })
      const m = String(bildeData).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
      if (!m) return res.status(400).json({ error: 'bildeData må være en dataURL (jpeg/png/webp)' })
      if (m[2].length > 5_500_000) return res.status(413).json({ error: 'Bildet er for stort — prøv igjen (komprimeres automatisk).' })
      const funn3 = await hentSkrivbarSjekkliste(res, sjekklisteId, ansatt)
      if (!funn3) return
      const { alle, idx, sl } = funn3
      const pIdx = (sl.punkter || []).findIndex(p => p && p.id === punktId)
      if (pIdx < 0) return res.status(404).json({ error: 'Punktet finnes ikke' })
      const buf = Buffer.from(m[2], 'base64')
      const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg'
      const blobNavn = `ks-bilder/${sl.prosjektId}/${sjekklisteId}/flate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
      let blob
      try {
        blob = await put(blobNavn, buf, { access: 'public', contentType: m[1] })
      } catch (e) {
        return res.status(502).json({ error: 'Opplasting feilet: ' + e.message })
      }
      const bilde = { url: blob.url, opplastet: new Date().toISOString(), av: ansatt.navn, kilde: 'ansattflate' }
      const punkt = { ...sl.punkter[pIdx], bilder: [...(sl.punkter[pIdx].bilder || []), bilde] }
      sl.punkter = sl.punkter.map((p, i) => (i === pIdx ? punkt : p))
      alle[idx] = sl
      await redis.set('fbs_ks_sjekklister', alle)
      await loggHistorikk({ dato: bilde.opplastet, ansattId: ansatt.id, navn: ansatt.navn, kilde: 'ansattflate',
        sjekklisteId, prosjektId: sl.prosjektId, punktId, handling: 'bilde', bildeUrl: blob.url })
      return res.status(200).json({ ok: true, punkt: punktUt(punkt) })
    }

    // ── PR2: «Signer og lever» — låser lista for den ansatte ──
    if (handling === 'lever') {
      if (!info.verifisert) return res.status(401).json({ maaVerifisere: true, error: 'Bekreft med de 4 siste sifrene i telefonnummeret ditt først.' })
      const { sjekklisteId } = body || {}
      if (!sjekklisteId) return res.status(400).json({ error: 'Mangler sjekklisteId' })
      const funn4 = await hentSkrivbarSjekkliste(res, sjekklisteId, ansatt)
      if (!funn4) return
      const { alle, idx, sl } = funn4
      const uavklarte = (sl.punkter || []).filter(p => p && p.status !== 'ok' && p.status !== 'ikke-aktuelt')
      if (uavklarte.length) return res.status(400).json({ uavklarte: uavklarte.length, error: `${uavklarte.length} punkt${uavklarte.length === 1 ? '' : 'er'} er ikke avklart ennå — kvitter eller marker «ikke aktuelt» først.` })
      const navn = String((body.navn || '')).trim() || ansatt.navn
      const naa = new Date().toISOString()
      alle[idx] = { ...sl, signert_av: navn, signert_dato: naa, levert_dato: naa, status: 'ferdig' }
      await redis.set('fbs_ks_sjekklister', alle)
      await loggHistorikk({ dato: naa, ansattId: ansatt.id, navn: ansatt.navn, kilde: 'ansattflate',
        sjekklisteId, prosjektId: sl.prosjektId, handling: 'levert', signertAv: navn })
      return res.status(200).json({ ok: true, levert: true, signert_av: navn, signert_dato: naa })
    }

    return res.status(400).json({ error: 'Ukjent handling' })
  }

  if (req.method !== 'GET') return res.status(405).end()

  // ── GET: flate-data ──
  info.sistApnet = new Date().toISOString()
  tokens[token] = info
  await redis.set(TOKENS_NOKKEL, tokens)

  if (!info.verifisert) return res.status(200).json({ maaVerifisere: true, fornavn })

  const iDag = iDagIso()
  const mineTildelinger = (state.tildelinger || []).filter(t => t && t.ansattId === ansatt.id && (t.sluttDato || '9999') >= iDag)
  const prosjektIds = [...new Set(mineTildelinger.map(t => t.prosjektId))]
  const alleSjekklister = (await redis.get('fbs_ks_sjekklister')) || []
  const prosjekter = prosjektIds
    .map(pid => (state.prosjekter || []).find(p => p && p.id === pid))
    .filter(p => p && !p.arkivert)
    .map(p => ({
      id: p.id,
      navn: p.navn || p.adresse || 'Prosjekt',
      sjekklister: alleSjekklister
        .filter(sl => sl && sl.prosjektId === p.id && erAnsvarlig(sl, ansatt.navn))
        .map(sl => ({
          id: sl.id, navn: sl.navn, kategori: sl.kategori || '', gruppe: sl.gruppe || '', frist: sl.frist || null,
          status: beregnStatus(sl.punkter), levert: !!(sl.signert_av || sl.levert_dato),
          punkter: (sl.punkter || []).map(punktUt),
        })),
    }))

  return res.status(200).json({ fornavn, navn: ansatt.navn, prosjekter, hmsRutiner: [] /* PR3 */ })
}
