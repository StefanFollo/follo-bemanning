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
import { byggInterneFaser } from '../../src/framdriftEksport.js'
import { leggTilOppgaver, endreOppgave, oppgaverPaaFase, migrerFase } from '../../src/faseOppgaver.js'
import { appendAuditLog, byggAuditEntry } from '../_dataIntegritet.js'

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

// Oppdrag 11G: 4-siffer-bekreftelsen er bundet til ENHETEN. En videresendt
// lenke er ubrukelig uten telefonnummerets 4 siste siffer på den nye enheten.
// (info.verifisert beholdes som «minst én enhet bekreftet» for status-API-et.)
function enhetOk(info, enhetsId) {
  return !!(enhetsId && info.enheter && info.enheter[enhetsId])
}

// Oppdrag 11F: PL-forhåndsvisning — admin/kontor kan se flaten som en gitt
// ansatt (kun GET, ingen skriving, sistApnet røres ikke).
async function forhandsvisningsSesjon(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  const session = await redis.get(`fbs_session:${token}`)
  return session && ['admin', 'kontor'].includes(session.role) ? session : null
}

// Oppdrag 11H: anleggsleder-modus — fag «Anleggsleder» på ansattkortet gir
// tildelingsrett i flaten på prosjekter ansatt selv står på.
function erAnleggsleder(ansatt) {
  return normNavn(ansatt.fag) === 'anleggsleder'
}

// PL-oppslag (navn + telefon — ansatte skal kunne ringe SIN prosjektleder;
// aldri kontaktinfo til andre kolleger)
function plForState(state, p) {
  const pl = p.prosjektlederId ? (state.ansatte || []).find(a => a && a.id === p.prosjektlederId && !a.arkivert) : null
  return pl ? { navn: pl.navn, telefon: pl.telefon || null } : null
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
  const enhetsId = String((req.method === 'GET' ? (req.query || {}).enhet : (req.body || {}).enhet) || '').trim().slice(0, 64)

  // ── Oppdrag 11F: PL-forhåndsvisning (?somAnsatt=<id>, admin/kontor-sesjon,
  // KUN GET — flaten bygges for den ansatte uten token og uten skriving) ──
  const somAnsatt = req.method === 'GET' ? String((req.query || {}).somAnsatt || '').trim() : ''
  let tokens = null, info = null, forhandsvisning = false
  const state = (await redis.get('fbs_state')) || {}
  let ansatt
  if (somAnsatt) {
    const session = await forhandsvisningsSesjon(req)
    if (!session) return res.status(401).json({ error: 'Forhåndsvisning krever admin/kontor-innlogging' })
    ansatt = (state.ansatte || []).find(a => a && a.id === somAnsatt)
    if (!ansatt || ansatt.arkivert) return res.status(404).json({ error: 'Ansatt ikke funnet' })
    forhandsvisning = true
  } else {
    const funn = await hentTokenInfo(token)
    // Samme svar for ukjent og utgått token — ingen opplisting/probing
    if (!funn) return res.status(404).json({ utlopt: true, error: 'Lenken er utløpt eller ugyldig. Kontakt din prosjektleder for ny lenke.' })
    tokens = funn.tokens; info = funn.info
    ansatt = (state.ansatte || []).find(a => a && a.id === info.ansattId)
  }
  // Arkivert/slettet ansatt → lenken er død (spec §1)
  if (!ansatt || ansatt.arkivert) {
    return res.status(404).json({ utlopt: true, error: 'Lenken er utløpt eller ugyldig. Kontakt din prosjektleder for ny lenke.' })
  }
  if (info && info.sperret) {
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
      // Oppdrag 11G: bind bekreftelsen til ENHETEN — ny telefon krever ny
      // 4-siffer-bekreftelse (maks 10 enheter, eldste ryddes)
      if (enhetsId) {
        const enheter = info.enheter || {}
        enheter[enhetsId] = { verifisert: new Date().toISOString() }
        const nokler = Object.keys(enheter)
        if (nokler.length > 10) delete enheter[nokler[0]]
        info.enheter = enheter
      }
      tokens[token] = info
      await redis.set(TOKENS_NOKKEL, tokens)
      return res.status(200).json({ ok: true, verifisert: true })
    }

    if (handling === 'punkt') {
      if (!enhetOk(info, enhetsId)) return res.status(401).json({ maaVerifisere: true, error: 'Bekreft med de 4 siste sifrene i telefonnummeret ditt først.' })
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
      if (!enhetOk(info, enhetsId)) return res.status(401).json({ maaVerifisere: true, error: 'Bekreft med de 4 siste sifrene i telefonnummeret ditt først.' })
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
      if (!enhetOk(info, enhetsId)) return res.status(401).json({ maaVerifisere: true, error: 'Bekreft med de 4 siste sifrene i telefonnummeret ditt først.' })
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

    // ── Oppdrag 11H: anleggsleder-handlinger — fase-tildeling på eget prosjekt.
    // Krav: fag «Anleggsleder», bemannet på prosjektet, enhet verifisert.
    // Skriver fbs_state.prosjekter med _endret-stempel (samme flette-semantikk
    // som en annen klient) + auditlogg — reversibelt, ingenting slettes.
    if (['fase-tildel', 'fase-tekst', 'fase-ferdig'].includes(handling)) {
      if (!enhetOk(info, enhetsId)) return res.status(401).json({ maaVerifisere: true, error: 'Bekreft med de 4 siste sifrene i telefonnummeret ditt først.' })
      if (!erAnleggsleder(ansatt)) return res.status(403).json({ error: 'Kun anleggsleder kan tildele oppgaver' })
      const { prosjektId, faseId } = body || {}
      const iDagN = iDagIso()
      const staarPaa = (state.tildelinger || []).some(t => t && t.ansattId === ansatt.id && t.prosjektId === prosjektId && (t.sluttDato || '9999') >= iDagN)
      if (!staarPaa) return res.status(403).json({ error: 'Du står ikke på dette prosjektet' })
      const pIdx2 = (state.prosjekter || []).findIndex(p => p && p.id === prosjektId)
      if (pIdx2 < 0) return res.status(404).json({ error: 'Prosjektet finnes ikke' })
      const prosjekt = state.prosjekter[pIdx2]
      const fIdx = (prosjekt.fdTasks || []).findIndex(t => t && t.id === faseId)
      if (fIdx < 0) return res.status(404).json({ error: 'Fasen finnes ikke' })
      const fase = { ...prosjekt.fdTasks[fIdx] }
      let loggTekst = ''
      if (handling === 'fase-tildel') {
        // Kun folk fra laget (bemannet på prosjektet) kan tildeles.
        // Oppdrag 14: HELE prosjektperioden — samme lag-oppslag som klienten.
        const lagIds = new Set((state.tildelinger || []).filter(t => t && t.prosjektId === prosjektId).map(t => t.ansattId))
        const onsket = Array.isArray(body.ansattIds) ? body.ansattIds.filter(id => lagIds.has(id)) : []
        loggTekst = `Tildelte fasen «${fase.name}» til ${onsket.length} person(er)`
        fase.tildelt = onsket
      } else if (handling === 'fase-tekst') {
        fase.oppgaveTekst = String(body.tekst || '').slice(0, 300)
        loggTekst = `Oppgavetekst på «${fase.name}»: ${fase.oppgaveTekst || '(tom)'}`
      } else {
        fase.pct = body.ferdig ? 100 : 0
        loggTekst = `Fasen «${fase.name}» markert ${body.ferdig ? 'FERDIG' : 'ikke ferdig'}`
      }
      const nyeTasks = prosjekt.fdTasks.map((t, i) => (i === fIdx ? fase : t))
      state.prosjekter[pIdx2] = { ...prosjekt, fdTasks: nyeTasks, _endret: Math.max(Date.now(), (prosjekt._endret || 0) + 1) }
      await redis.set('fbs_state', state)
      try {
        await appendAuditLog(redis, byggAuditEntry({
          objekt: 'prosjekt', objektId: prosjektId, felt: 'framdriftsplan',
          fraVerdi: null, tilVerdi: loggTekst, endretAv: ansatt.navn, kilde: 'ansattflate-anleggsleder',
        }))
      } catch { /* logg-feil stopper ikke handlingen */ }
      return res.status(200).json({ ok: true, fase: { id: fase.id, tildelt: fase.tildelt || [], oppgaveTekst: fase.oppgaveTekst || '', ferdig: (fase.pct || 0) >= 100 } })
    }

    // ── Oppdrag 15: oppgaver under faser ──
    // 'oppgave-ny' og 'oppgave-endre' krever AL på eget prosjekt.
    // 'oppgave-status' (huk av/på ferdig) tillates OGSÅ for den oppgaven er
    // tildelt — ansatte kvitterer sine egne oppgaver. Alt auditlogges.
    if (['oppgave-ny', 'oppgave-endre', 'oppgave-status'].includes(handling)) {
      if (!enhetOk(info, enhetsId)) return res.status(401).json({ maaVerifisere: true, error: 'Bekreft med de 4 siste sifrene i telefonnummeret ditt først.' })
      const { prosjektId, faseId, oppgaveId } = body || {}
      const pIdx3 = (state.prosjekter || []).findIndex(p => p && p.id === prosjektId)
      if (pIdx3 < 0) return res.status(404).json({ error: 'Prosjektet finnes ikke' })
      const prosjekt3 = state.prosjekter[pIdx3]
      const fIdx3 = (prosjekt3.fdTasks || []).findIndex(t => t && t.id === faseId)
      if (fIdx3 < 0) return res.status(404).json({ error: 'Fasen finnes ikke' })
      const fase3 = prosjekt3.fdTasks[fIdx3]
      const al3 = erAnleggsleder(ansatt)
      const iDag3 = iDagIso()
      const staarPaa3 = (state.tildelinger || []).some(t => t && t.ansattId === ansatt.id && t.prosjektId === prosjektId && (t.sluttDato || '9999') >= iDag3)
      const lagIds3 = new Set((state.tildelinger || []).filter(t => t && t.prosjektId === prosjektId).map(t => t.ansattId))

      let nyFase = null, loggTekst3 = ''
      if (handling === 'oppgave-ny') {
        if (!al3 || !staarPaa3) return res.status(403).json({ error: 'Kun anleggsleder på prosjektet kan legge til oppgaver' })
        const tekster = Array.isArray(body.tekster) ? body.tekster : [body.tekst]
        const tildelt = (Array.isArray(body.tildelt) ? body.tildelt : []).filter(id => lagIds3.has(id))
        nyFase = leggTilOppgaver(fase3, tekster, { tildelt, av: ansatt.navn, dag: body.dag || null })
        loggTekst3 = `La til ${oppgaverPaaFase(nyFase).length - oppgaverPaaFase(fase3).length} oppgave(r) på «${fase3.name}»`
      } else if (handling === 'oppgave-endre') {
        if (!al3 || !staarPaa3) return res.status(403).json({ error: 'Kun anleggsleder på prosjektet kan endre oppgaver' })
        const endring = {}
        if (body.tekst !== undefined) endring.tekst = body.tekst
        if (body.tildelt !== undefined) endring.tildelt = (Array.isArray(body.tildelt) ? body.tildelt : []).filter(id => lagIds3.has(id))
        if (body.dag !== undefined) endring.dag = body.dag
        if (body.fjernet !== undefined) endring.fjernet = body.fjernet
        nyFase = endreOppgave(fase3, oppgaveId, endring, { av: ansatt.navn })
        if (!nyFase) return res.status(404).json({ error: 'Oppgaven finnes ikke' })
        loggTekst3 = `${body.fjernet ? 'Fjernet (skjulte)' : 'Endret'} oppgave på «${fase3.name}»`
      } else {
        const oppgave = oppgaverPaaFase(migrerFase(fase3, { av: ansatt.navn })).find(o => o.id === oppgaveId)
        if (!oppgave) return res.status(404).json({ error: 'Oppgaven finnes ikke' })
        const erMin = (oppgave.tildelt || []).includes(ansatt.id)
        if (!erMin && !(al3 && staarPaa3)) return res.status(403).json({ error: 'Du kan kun kvittere dine egne oppgaver' })
        nyFase = endreOppgave(fase3, oppgaveId, { ferdig: !!body.ferdig }, { av: ansatt.navn })
        loggTekst3 = `Oppgave «${oppgave.tekst.slice(0, 60)}» på «${fase3.name}»: ${body.ferdig ? 'FERDIG' : 'gjenåpnet'}`
      }

      state.prosjekter[pIdx3] = {
        ...prosjekt3,
        fdTasks: prosjekt3.fdTasks.map((t, i) => (i === fIdx3 ? nyFase : t)),
        _endret: Math.max(Date.now(), (prosjekt3._endret || 0) + 1),
      }
      await redis.set('fbs_state', state)
      try {
        await appendAuditLog(redis, byggAuditEntry({
          objekt: 'prosjekt', objektId: prosjektId, felt: 'framdriftsplan',
          fraVerdi: null, tilVerdi: loggTekst3, endretAv: ansatt.navn,
          kilde: al3 ? 'ansattflate-anleggsleder' : 'ansattflate',
        }))
      } catch { /* logg-feil stopper ikke handlingen */ }
      const navnFor3 = id => { const a = (state.ansatte || []).find(x => x && x.id === id && !x.arkivert); return a ? a.navn : null }
      return res.status(200).json({ ok: true, oppgaver: oppgaverPaaFase(nyFase).map(o => ({
        id: o.id, tekst: o.tekst, status: o.status, dag: o.dag || null,
        tildelt: (o.tildelt || []).map(navnFor3).filter(Boolean),
        tildeltIds: al3 ? (o.tildelt || []) : undefined,
        ferdigAv: o.ferdigAv || null, min: (o.tildelt || []).includes(ansatt.id),
      })), faseTildelt: nyFase.tildelt || [] })
    }

    // AL: sett ansvarlige på en sjekkliste i eget prosjekt (samme modell som
    // KS-fanens TildelModal — ansvarlig er NAVN-liste; levert liste er låst)
    if (handling === 'sjekkliste-ansvarlig') {
      if (!enhetOk(info, enhetsId)) return res.status(401).json({ maaVerifisere: true, error: 'Bekreft med de 4 siste sifrene i telefonnummeret ditt først.' })
      if (!erAnleggsleder(ansatt)) return res.status(403).json({ error: 'Kun anleggsleder kan tildele sjekklister' })
      const { sjekklisteId, navnListe } = body || {}
      const alle = (await redis.get('fbs_ks_sjekklister')) || []
      const idx = alle.findIndex(s => s && s.id === sjekklisteId)
      if (idx < 0) return res.status(404).json({ error: 'Sjekklisten finnes ikke' })
      const sl = alle[idx]
      const iDagN = iDagIso()
      const staarPaa = (state.tildelinger || []).some(t => t && t.ansattId === ansatt.id && t.prosjektId === sl.prosjektId && (t.sluttDato || '9999') >= iDagN)
      if (!staarPaa) return res.status(403).json({ error: 'Du står ikke på dette prosjektet' })
      if (sl.signert_av || sl.levert_dato) return res.status(409).json({ laast: true, error: 'Sjekklisten er levert og kan ikke endres.' })
      const lagNavn = new Set((state.tildelinger || []).filter(t => t && t.prosjektId === sl.prosjektId)
        .map(t => (state.ansatte || []).find(a => a && a.id === t.ansattId)).filter(a => a && !a.arkivert).map(a => a.navn))
      const ansvarlig = (Array.isArray(navnListe) ? navnListe : []).map(n => String(n)).filter(n => lagNavn.has(n))
      alle[idx] = { ...sl, ansvarlig }
      await redis.set('fbs_ks_sjekklister', alle)
      await loggHistorikk({ dato: new Date().toISOString(), ansattId: ansatt.id, navn: ansatt.navn, kilde: 'ansattflate-anleggsleder',
        sjekklisteId, prosjektId: sl.prosjektId, handling: 'tildelt-ansvarlige', ansvarlig })
      return res.status(200).json({ ok: true, ansvarlig })
    }

    return res.status(400).json({ error: 'Ukjent handling' })
  }

  if (req.method !== 'GET') return res.status(405).end()

  // ── GET: flate-data ──
  if (!forhandsvisning) {
    info.sistApnet = new Date().toISOString()
    tokens[token] = info
    await redis.set(TOKENS_NOKKEL, tokens)
    if (!enhetOk(info, enhetsId)) return res.status(200).json({ maaVerifisere: true, fornavn })
  }

  const iDag = iDagIso()

  // ── Oppdrag 11E (PRESISERT 07.09): «Din uke» + «Mitt lag» — IKKE hele
  // firmaets plan. Egne oppdrag denne + 2 neste uker (dag, prosjekt, adresse,
  // PL + tel:), og laget = kollegene på SAMME prosjekt SAMME dag (navn + fag,
  // aldri telefon/e-post). ALDRI sykmelding/fravær om andre; andres ferie
  // finnes ikke i svaret. Egen ferie vises på egen rad. ──
  if ((req.query || {}).dinUke !== undefined) {
    const iDagD = new Date(iDag + 'T12:00:00Z')
    const mandag = new Date(iDagD)
    mandag.setUTCDate(mandag.getUTCDate() - ((mandag.getUTCDay() + 6) % 7))
    const dager = Array.from({ length: 21 }, (_, i) => {
      const d = new Date(mandag); d.setUTCDate(d.getUTCDate() + i)
      return d.toISOString().slice(0, 10)
    })
    const ansattVed = id => (state.ansatte || []).find(a => a && a.id === id && !a.arkivert)
    const pVed = id => (state.prosjekter || []).find(x => x && x.id === id)
    const dagListe = dager.map(dato => {
      const mine = (state.tildelinger || []).filter(t => t && t.ansattId === ansatt.id
        && (t.startDato || '0000') <= dato && (t.sluttDato || '9999') >= dato)
      const egenFerie = mine.some(t => t.prosjektId === '__FERIE__')
      const oppdrag = mine.filter(t => t.prosjektId !== '__FERIE__').map(t => {
        const p = pVed(t.prosjektId)
        if (!p || p.arkivert) return null
        const pl = plForState(state, p)
        // «Mitt lag»: kollegene på samme prosjekt samme dag — navn + fag
        const lag = (state.tildelinger || [])
          .filter(k => k && k.prosjektId === t.prosjektId && k.ansattId !== ansatt.id && k.prosjektId !== '__FERIE__'
            && (k.startDato || '0000') <= dato && (k.sluttDato || '9999') >= dato)
          .map(k => ansattVed(k.ansattId)).filter(Boolean)
          .map(a => ({ navn: a.navn, fag: a.fag || '' }))
        // Oppdrag 11H/15: oppgavene mine — enkeltoppgaver på faser som pågår
        // denne dagen (eller med dag satt til akkurat denne datoen), med
        // id-er så Ferdig-avhukingen i «Din uke» kan treffe riktig oppgave.
        const faserDenneDagen = byggInterneFaser(p, { iDag: dato, fallbackIDag: iDag }) || []
        const oppgaver = (p.fdTasks || []).flatMap((f, i) => {
          if (!f) return []
          const synlige = oppgaverPaaFase(f).filter(o => (o.tildelt || []).includes(ansatt.id)
            && (o.dag ? o.dag === dato : faserDenneDagen[i]?.pagarNa))
          if (synlige.length) {
            return synlige.map(o => ({ fase: f.name || 'Fase', tekst: o.tekst, oppgaveId: o.id, faseId: f.id, prosjektId: p.id, status: o.status }))
          }
          // Bakoverkomp: gammel oppgaveTekst-modell uten oppgaveliste
          return (Array.isArray(f.tildelt) && f.tildelt.includes(ansatt.id) && faserDenneDagen[i]?.pagarNa)
            ? [{ fase: f.name || 'Fase', tekst: f.oppgaveTekst || '' }] : []
        })
        return { prosjekt: p.navn || p.adresse || 'Prosjekt', adresse: p.adresse || '', plNavn: pl?.navn || null, plTelefon: pl?.telefon || null, lag, oppgaver }
      }).filter(Boolean)

      // Oppdrag 15: oppgaver skal vises SELV OM du ikke er bemannet den dagen
      // (AL kan sette deg på en fase utenfor bemanningsperioden din) — egne
      // «kun oppgaver»-oppføringer for slike prosjekter
      const dekket = new Set(mine.filter(t => t.prosjektId !== '__FERIE__').map(t => t.prosjektId))
      for (const p of (state.prosjekter || [])) {
        if (!p || p.arkivert || dekket.has(p.id)) continue
        const faserDenneDagen = byggInterneFaser(p, { iDag: dato, fallbackIDag: iDag }) || []
        const oppg = (p.fdTasks || []).flatMap((f, i) => !f ? [] : oppgaverPaaFase(f)
          .filter(o => (o.tildelt || []).includes(ansatt.id) && (o.dag ? o.dag === dato : faserDenneDagen[i]?.pagarNa))
          .map(o => ({ fase: f.name || 'Fase', tekst: o.tekst, oppgaveId: o.id, faseId: f.id, prosjektId: p.id, status: o.status })))
        if (oppg.length) {
          const pl = plForState(state, p)
          oppdrag.push({ prosjekt: p.navn || p.adresse || 'Prosjekt', adresse: p.adresse || '', plNavn: pl?.navn || null, plTelefon: pl?.telefon || null, lag: [], oppgaver: oppg, kunOppgaver: true })
        }
      }
      return { dato, egenFerie, oppdrag }
    })
    return res.status(200).json({ dinUke: { dager: dagListe } })
  }

  const mineTildelinger = (state.tildelinger || []).filter(t => t && t.ansattId === ansatt.id && (t.sluttDato || '9999') >= iDag)
  const alleSjekklister = (await redis.get('fbs_ks_sjekklister')) || []
  // Oppdrag 11F: prosjektlisten er UNION av (bemannet på) ∪ (har tildelt
  // sjekkliste på) — PL-er/anleggsledere står sjelden i bemanningen men får
  // ofte lister tildelt på navn. En liste tildelt «Stefan» skal alltid vises.
  const prosjektIds = [...new Set([
    ...mineTildelinger.map(t => t.prosjektId),
    ...alleSjekklister.filter(sl => sl && erAnsvarlig(sl, ansatt.navn) && !(sl.signert_av || sl.levert_dato)).map(sl => sl.prosjektId),
  ])]
  const al = erAnleggsleder(ansatt)
  const navnFor = id => { const a = (state.ansatte || []).find(x => x && x.id === id && !x.arkivert); return a ? a.navn : null }

  const prosjekter = prosjektIds
    .map(pid => (state.prosjekter || []).find(p => p && p.id === pid))
    .filter(p => p && !p.arkivert)
    .map(p => {
      // Oppdrag 11A: intern framdriftsvisning — tittel/periode/status/pågår-nå,
      // aldri pct/fag/timer/priser. null = «Ingen framdriftsplan ennå».
      const framdrift = byggInterneFaser(p, { iDag })
      // Oppdrag 11H: fase-id + tildelte (navn) + oppgavetekst + «deg»-markør
      if (framdrift) framdrift.forEach((f, i) => {
        const t = (p.fdTasks || [])[i] || {}
        f.id = t.id || null
        f.tildelt = (Array.isArray(t.tildelt) ? t.tildelt : []).map(navnFor).filter(Boolean)
        f.tildeltIds = al ? (Array.isArray(t.tildelt) ? t.tildelt : []) : undefined
        f.oppgaveTekst = t.oppgaveTekst || ''
        f.deg = (Array.isArray(t.tildelt) ? t.tildelt : []).includes(ansatt.id)
        // Oppdrag 15: oppgavelisten under fasen — mine markeres, andres har
        // kun tekst + fornavn (aldri kontaktinfo)
        f.oppgaver = oppgaverPaaFase(t).map(o => ({
          id: o.id, tekst: o.tekst, status: o.status, dag: o.dag || null,
          tildelt: (o.tildelt || []).map(navnFor).filter(Boolean).map(n => al ? n : n.split(/\s+/)[0]),
          tildeltIds: al ? (o.tildelt || []) : undefined,
          ferdigAv: o.ferdigAv || null,
          min: (o.tildelt || []).includes(ansatt.id),
        }))
      })
      // AL: laget (bemannede på prosjektet) til Tildel-velgeren — id/navn/fag
      const lag = al ? (state.tildelinger || [])
        .filter(t => t && t.prosjektId === p.id)
        .map(t => (state.ansatte || []).find(a => a && a.id === t.ansattId)).filter(a => a && !a.arkivert)
        .filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i)
        .map(a => ({ id: a.id, navn: a.navn, fag: a.fag || '' })) : undefined
      return {
        id: p.id,
        navn: p.navn || p.adresse || 'Prosjekt',
        adresse: p.adresse || '',
        startDato: p.startDato || null,
        sluttDato: p.sluttDato || null,
        pl: plForState(state, p),
        framdrift,
        lag,
        sjekklister: alleSjekklister
          .filter(sl => sl && sl.prosjektId === p.id && (erAnsvarlig(sl, ansatt.navn) || al))
          .map(sl => ({
            id: sl.id, navn: sl.navn, kategori: sl.kategori || '', gruppe: sl.gruppe || '', frist: sl.frist || null,
            status: beregnStatus(sl.punkter), levert: !!(sl.signert_av || sl.levert_dato),
            ansvarlig: al ? (sl.ansvarlig || []) : undefined,
            min: erAnsvarlig(sl, ansatt.navn),
            punkter: (sl.punkter || []).map(punktUt),
          })),
      }
    })

  // PR3: rutine-IDer admin/PL har flagget «Vis for ansatte» — innholdet
  // ligger i klient-bundlen (rutiner-holte), flaten viser kun disse IDene.
  const hmsRutiner = Array.isArray(state.rutinerForAnsatte)
    ? state.rutinerForAnsatte.filter(id => typeof id === 'string').slice(0, 500)
    : []
  return res.status(200).json({ fornavn, navn: ansatt.navn, prosjekter, hmsRutiner, erAnleggsleder: al, forhandsvisning: forhandsvisning || undefined })
}
