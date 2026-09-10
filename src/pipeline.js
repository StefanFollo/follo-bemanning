// src/pipeline.js — «Ikke bemannet»-pipeline (postkasse-oppdrag 21).
// Ren logikk uten React så alt kan testes: forhåndsutfylling fra tilbudsdata,
// hvilke rader som hører hjemme i seksjonen, bemannings-status per uke og
// kapasitetslinjen. Datamodell: p.pipeline = { forventetStart (ISO mandag),
// forventetUker, forventetFolk, sikkerhet: 'fast'|'sannsynlig'|'mulig' }
// (+ b.pipeline på befaringer lagt inn manuelt). pipelineLogg på prosjektet
// er append-only — aldri slettes, kun legges til.

// Egne dato-hjelpere (identisk oppførsel som store.js) slik at modulen er
// import-trygg både i nettleseren og på serveren (digest) — store.js bærer
// localStorage-kode som ikke skal inn i serverless-funksjoner.
function isoTilDato(iso) { return new Date(iso + 'T00:00:00'); }
function datoTilIso(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dg = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dg}`;
}
export function addDays(iso, n) { const d = isoTilDato(iso); d.setDate(d.getDate() + n); return datoTilIso(d); }
export function weekStart(iso) {
  const d = isoTilDato(iso);
  const dag = d.getDay();
  d.setDate(d.getDate() + (dag === 0 ? -6 : 1 - dag));
  return datoTilIso(d);
}
function overlaps(aStart, aEnd, bStart, bEnd) { return aStart <= bEnd && bStart <= aEnd; }

export const TIMEVERK_UKE = 37.5;
const FERIE_ID = '__FERIE__';

// ISO-ukenummer for en dato (mandag-basert, ISO 8601)
export function ukeNr(iso) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const aarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - aarStart) / 86400000 + 1) / 7);
}

// Forhåndsutfylling fra tilbudsdata (A-delen).
// timerPerFag: { fag: timer } — Σ timer styrer folk/uker-anslaget.
// varighetUker: tilbudets eget anslag hvis satt.
// startDato: ønsket oppstart hvis kjent (ISO) — ellers null (vises som «dato ikke satt»).
export function foreslaaPipeline({ timerPerFag = {}, varighetUker = null, startDato = null } = {}) {
  const timer = Object.values(timerPerFag).reduce((s, t) => s + (Number(t) || 0), 0);
  let uker = Number(varighetUker) > 0 ? Math.round(Number(varighetUker)) : 0;
  if (!uker) uker = timer > 0 ? Math.max(1, Math.ceil(timer / (TIMEVERK_UKE * 2))) : 2;
  const folk = timer > 0 ? Math.max(1, Math.round(timer / (TIMEVERK_UKE * uker))) : 2;
  return {
    forventetStart: startDato ? weekStart(startDato) : null,
    forventetUker: uker,
    forventetFolk: folk,
    sikkerhet: 'fast',
  };
}

// Uke-mandagene en pipeline-oppføring dekker (tom liste uten forventetStart)
export function pipelineUker(pipeline) {
  if (!pipeline?.forventetStart) return [];
  const start = weekStart(pipeline.forventetStart);
  const n = Math.max(1, Number(pipeline.forventetUker) || 1);
  return Array.from({ length: n }, (_, i) => addDays(start, i * 7));
}

// Har prosjektet minst én (ikke-ferie-)tildeling i uka som starter på `mandag`?
function ukeBemannet(prosjektId, tildelinger, mandag) {
  const slutt = addDays(mandag, 6);
  return (tildelinger || []).some(t => t && t.prosjektId === prosjektId && t.prosjektId !== FERIE_ID
    && t.startDato && t.sluttDato && overlaps(t.startDato, t.sluttDato, mandag, slutt));
}

// Radene i «Ikke bemannet»-seksjonen.
// - Prosjekter med p.pipeline der perioden IKKE er helt bemannet (fast/manuell)
// - Pågående prosjekter med hull: har start/slutt + minst én tildeling, men
//   uker i perioden uten folk (vises så PL ser hull i jobber som er i gang)
// - Befaringer med b.pipeline (sannsynlig/mulig — jobber som ikke er vunnet;
//   droppes når befaringen er tapt/arkivert eller har blitt prosjekt)
// Hver rad: { id, type: 'prosjekt'|'hull'|'befaring', navn, pipeline, uker,
//            bemannedeUker (Set), prosjektId? }
export function pipelineRader(prosjekter, befaringer, tildelinger, iDag = null) {
  const rader = [];
  const pipelineIds = new Set();
  // Hull i pågående prosjekter regnes kun fra inneværende uke og framover —
  // uker som allerede er passert er ikke noe PL kan bemanne.
  const naavaerendeUke = weekStart(iDag || datoTilIso(new Date()));

  for (const p of (prosjekter || [])) {
    if (!p || p.arkivert || p.status === 'fullfort') continue;
    if (!p.pipeline) continue;
    pipelineIds.add(p.id);
    const uker = pipelineUker(p.pipeline);
    const bemannede = new Set(uker.filter(m => ukeBemannet(p.id, tildelinger, m)));
    // Helt bemannet periode → ute av seksjonen (kommer tilbake om tildelinger fjernes)
    if (uker.length > 0 && bemannede.size === uker.length) continue;
    rader.push({
      id: 'pl-' + p.id, type: 'prosjekt', prosjektId: p.id,
      navn: p.adresse || p.navn || 'Uten navn',
      pipeline: p.pipeline, uker, bemannedeUker: bemannede,
    });
  }

  // Pågående med hull i perioden (kun prosjekter UTEN egen pipeline-rad)
  for (const p of (prosjekter || [])) {
    if (!p || p.arkivert || p.status === 'fullfort' || p.pipeline) continue;
    if (!p.startDato || !p.sluttDato) continue;
    const harTildeling = (tildelinger || []).some(t => t && t.prosjektId === p.id);
    if (!harTildeling) continue;
    const start = weekStart(p.startDato) > naavaerendeUke ? weekStart(p.startDato) : naavaerendeUke;
    if (start > p.sluttDato) continue; // hele perioden er passert
    const alle = [];
    for (let m = start; m <= p.sluttDato; m = addDays(m, 7)) alle.push(m);
    if (alle.length > 60) continue; // urimelig lang periode = dårlige datoer, ikke støy
    const bemannede = new Set(alle.filter(m => ukeBemannet(p.id, tildelinger, m)));
    if (bemannede.size === alle.length || bemannede.size === 0) continue;
    rader.push({
      id: 'hull-' + p.id, type: 'hull', prosjektId: p.id,
      navn: p.adresse || p.navn || 'Uten navn',
      pipeline: { forventetStart: start, forventetUker: alle.length, forventetFolk: null, sikkerhet: 'fast' },
      uker: alle, bemannedeUker: bemannede,
    });
  }

  for (const b of (befaringer || [])) {
    if (!b || b.arkivert || !b.pipeline) continue;
    if (b.prosjektId || ['tapt', 'godkjent'].includes(b.status)) continue;
    rader.push({
      id: 'bf-' + b.id, type: 'befaring', befaringId: b.id,
      navn: b.adresse || b.kontaktNavn || 'Uten navn',
      pipeline: b.pipeline, uker: pipelineUker(b.pipeline), bemannedeUker: new Set(),
    });
  }

  return rader;
}

// Kapasitet per uke for kapasitetslinjen nederst i seksjonen.
// behov = folk på pipeline-rader (fast, ubemannede uker) + faktisk bemannede ansatte
// usikre = folk på sannsynlig/mulig-rader aktive den uka
// ansatte = planAnsatte minus de som har ferie hele uka (fravær i planen)
export function ukeKapasitet(mandag, rader, tildelinger, planAnsatte) {
  const slutt = addDays(mandag, 6);
  const bemannedeIds = new Set(
    (tildelinger || [])
      .filter(t => t && t.prosjektId !== FERIE_ID && t.startDato && t.sluttDato
        && overlaps(t.startDato, t.sluttDato, mandag, slutt))
      .map(t => t.ansattId)
  );
  const ferieIds = new Set(
    (tildelinger || [])
      .filter(t => t && t.prosjektId === FERIE_ID && t.startDato && t.sluttDato
        && t.startDato <= mandag && t.sluttDato >= slutt) // ferie HELE uka
      .map(t => t.ansattId)
  );
  let behov = 0, usikre = 0;
  for (const rad of rader) {
    const aktiv = rad.uker.includes(mandag) && !rad.bemannedeUker.has(mandag);
    if (!aktiv) continue;
    const folk = Number(rad.pipeline?.forventetFolk) || 0;
    if (rad.pipeline?.sikkerhet === 'fast') behov += folk;
    else usikre += folk;
  }
  const faktisk = (planAnsatte || []).filter(a => bemannedeIds.has(a.id)).length;
  const ansatte = (planAnsatte || []).filter(a => !ferieIds.has(a.id)).length;
  return { behov: behov + faktisk, usikre, ansatte };
}

// Farge-terskel for kapasitetslinjen: 'ok' | 'gul' (≥90 %) | 'roed' (>100 %)
export function kapasitetNivaa({ behov, ansatte }) {
  if (!ansatte) return behov > 0 ? 'roed' : 'ok';
  if (behov > ansatte) return 'roed';
  if (behov >= ansatte * 0.9) return 'gul';
  return 'ok';
}

// Append-only logglinje for pipeline-endringer (lagres på prosjektet)
export function pipelineLoggInnslag(tekst, av) {
  return { tid: new Date().toISOString(), av: av || 'ukjent', tekst };
}

// Morgenbrief/digest-linje: «Pipeline: 3 prosjekter uten bemanning, første
// starter uke 41» — kun når noe starter innen 3 uker uten bemanning.
export function pipelineDigestLinje(prosjekter, tildelinger, iDag) {
  const uten = (prosjekter || []).filter(p => p && !p.arkivert && p.status !== 'fullfort' && p.pipeline
    && !(tildelinger || []).some(t => t && t.prosjektId === p.id && t.prosjektId !== FERIE_ID));
  const medStart = uten.filter(p => p.pipeline.forventetStart)
    .sort((a, b) => a.pipeline.forventetStart.localeCompare(b.pipeline.forventetStart));
  const forste = medStart[0];
  if (!forste) return null;
  const dager = Math.round((isoTilDato(forste.pipeline.forventetStart) - isoTilDato(iDag)) / 86400000);
  if (dager > 21) return null;
  return `Pipeline: ${uten.length} prosjekt${uten.length === 1 ? '' : 'er'} uten bemanning, første starter uke ${ukeNr(forste.pipeline.forventetStart)}`;
}
