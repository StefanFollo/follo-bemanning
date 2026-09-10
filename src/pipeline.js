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
    // Finn første ubemannede uke i gjenværende periode; hull-stolpen dekker
    // derfra og maks 8 uker fram (oppdrag 22) — lengre horisont er ikke
    // bemannings-handling nå, og lange perioder ga etiketter som «u37–22».
    const gjenstaaende = [];
    for (let m = start, i = 0; m <= p.sluttDato && i < 60; m = addDays(m, 7), i++) gjenstaaende.push(m);
    const forsteUbemannet = gjenstaaende.find(m => !ukeBemannet(p.id, tildelinger, m));
    if (!forsteUbemannet) continue; // alt bemannet — ikke noe hull
    const hullSlutt = addDays(forsteUbemannet, 8 * 7 - 1) < p.sluttDato ? addDays(forsteUbemannet, 8 * 7 - 1) : p.sluttDato;
    const alle = gjenstaaende.filter(m => m >= forsteUbemannet && m <= hullSlutt);
    const bemannede = new Set(alle.filter(m => ukeBemannet(p.id, tildelinger, m)));
    if (bemannede.size === alle.length) continue;
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

// Uke-etikett for en stolpe: «u38–45», over årsskiftet «u51–u3 (2027)»,
// én uke: «u41».
export function ukeEtikett(startIso, uker) {
  if (!startIso) return '';
  const start = weekStart(startIso);
  const n = Math.max(1, Number(uker) || 1);
  const sluttIso = addDays(start, (n - 1) * 7);
  const u1 = ukeNr(start), u2 = ukeNr(sluttIso);
  if (n === 1) return `u${u1}`;
  const aar1 = start.slice(0, 4), aar2 = sluttIso.slice(0, 4);
  if (u2 < u1) return `u${u1}–u${u2} (${aar2})`;
  if (aar1 !== aar2) return `u${u1}–u${u2} (${aar2})`;
  return `u${u1}–${u2}`;
}

// «Utførende» — nevneren i Pipeline-fanens kapasitetslinje (oppdrag 22):
// tømrerfagene + montør + maler; ALDRI Rørlegger (egen plan), PL/Anleggsleder
// eller «Utplassering …»-rader. Aktive = ikke arkivert/utenfor planen.
export const UTFORENDE_FAG = ['Tømrer', 'Bas Tømrer', 'Lærling Tømrer', 'Montør', 'Maler'];
export function erUtforende(a) {
  return !!a && !a.arkivert && !a.utenforBemanningsplan
    && UTFORENDE_FAG.includes(a.fag)
    && !/utplass?ering/i.test(a.navn || '');
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

// ═══ Oppdrag 24: avledet prosjektstatus — Ikke startet · Startet · Ferdig ═══
// Status VELGES ikke lenger: Startet = minst én tildeling i bemanningsplanen,
// Ikke startet = ingen; Ferdig = manuelt (status 'fullfort'). Gamle statuser
// (godkjent/jobber_med/planlagt/pagaende) migreres til 'aktiv' med
// statusGammel bevart — ingen sletting.
export const GAMLE_STATUSER = ['godkjent', 'jobber_med', 'planlagt', 'pagaende'];
export const STATUS_TEKST = { ikke_startet: 'Ikke startet', startet: 'Startet', ferdig: 'Ferdig' };

export function harTildeling(prosjektId, tildelinger) {
  return (tildelinger || []).some(t => t && t.prosjektId === prosjektId && t.prosjektId !== FERIE_ID);
}

export function prosjektStatus(p, tildelinger) {
  if (!p) return 'ikke_startet';
  if (p.status === 'fullfort') return 'ferdig';
  return harTildeling(p.id, tildelinger) ? 'startet' : 'ikke_startet';
}

// Siste tildelings sluttdato («Bemannet til dd.mm» i Startet-listen)
export function bemannetTil(prosjektId, tildelinger) {
  const egne = (tildelinger || []).filter(t => t && t.prosjektId === prosjektId && t.prosjektId !== FERIE_ID && t.sluttDato);
  if (!egne.length) return null;
  return egne.reduce((m, t) => t.sluttDato > m ? t.sluttDato : m, egne[0].sluttDato);
}

// Hull i et STARTET prosjekt: uker mellom siste tildeling og sluttdato
// (kun når sluttdato finnes — uten sluttdato antas ingen hull). Returnerer
// { fra, til } (mandager) eller null.
export function hullEtterBemanning(p, tildelinger, iDag = null) {
  if (!p || !p.sluttDato) return null;
  const til = bemannetTil(p.id, tildelinger);
  if (!til) return null;
  const dag = iDag || datoTilIso(new Date());
  const forsteHull = weekStart(addDays(til, 7));
  const naavaerendeUke = weekStart(dag);
  const fra = forsteHull > naavaerendeUke ? forsteHull : naavaerendeUke;
  if (fra > p.sluttDato) return null;
  // Er det faktisk en ubemannet uke mellom fra og sluttdato?
  for (let m = fra, i = 0; m <= p.sluttDato && i < 60; m = addDays(m, 7), i++) {
    if (!ukeBemannet(p.id, tildelinger, m)) return { fra: m, til: weekStart(p.sluttDato) };
  }
  return null;
}

// «Ferdig?»-forslag (aldri automatikk): sluttdato passert og ingen tildeling
// de siste 14 dagene.
export function ferdigForslag(p, tildelinger, iDag = null) {
  if (!p || p.status === 'fullfort' || p.arkivert || !p.sluttDato) return false;
  const dag = iDag || datoTilIso(new Date());
  if (p.sluttDato >= dag) return false;
  const grense = addDays(dag, -14);
  return !(tildelinger || []).some(t => t && t.prosjektId === p.id && t.prosjektId !== FERIE_ID
    && t.sluttDato && t.sluttDato >= grense);
}

// Migrering av gammel manuell status → 'aktiv' (avledet videre). Returnerer
// oppdatert prosjekt eller null når ingenting skal endres.
export function migrerStatus(p, dato = null) {
  if (!p || !GAMLE_STATUSER.includes(p.status)) return null;
  const d = dato || datoTilIso(new Date());
  return {
    ...p,
    status: 'aktiv',
    statusGammel: p.status,
    pipelineLogg: [...(p.pipelineLogg || []), {
      tid: new Date().toISOString(), av: 'automatisk',
      tekst: `status ${p.status} → ikke startet/startet (automatisk ${d.slice(8, 10)}.${d.slice(5, 7)})`,
    }],
  };
}

// Pipeline-listen = Ikke startet-prosjekter (ikke arkivert/fullført, 0
// tildelinger). Enkel liste: uten start øverst, så start stigende.
export function pipelineListe(prosjekter, tildelinger) {
  const rader = [];
  for (const p of (prosjekter || [])) {
    if (!p || p.arkivert || p.status === 'fullfort') continue;
    if (harTildeling(p.id, tildelinger)) continue;
    const pl = p.pipeline || {};
    const start = pl.forventetStart ? weekStart(pl.forventetStart) : (p.startDato ? weekStart(p.startDato) : null);
    let uker = pl.forventetUker || null;
    if (!uker && p.startDato && p.sluttDato && p.sluttDato >= p.startDato) {
      uker = Math.max(1, Math.ceil((isoTilDato(p.sluttDato) - isoTilDato(weekStart(p.startDato))) / (7 * 86400000)));
    }
    rader.push({
      prosjektId: p.id,
      navn: p.adresse || p.navn || 'Uten navn',
      kunde: p.kunde?.navn || null,
      start, uker,
      folk: pl.forventetFolk || null,
      folkAnslag: !pl.forventetFolk,
      sikkerhet: pl.sikkerhet || 'fast',
      plId: p.prosjektlederId || null,
      uker_liste: start ? Array.from({ length: Math.max(1, uker || 1) }, (_, i) => addDays(start, i * 7)) : [],
    });
  }
  return rader.sort((a, b) => {
    if (!a.start && b.start) return -1;
    if (a.start && !b.start) return 1;
    return (a.start || '').localeCompare(b.start || '') || a.navn.localeCompare(b.navn, 'nb');
  });
}

// Én oppsummeringslinje over listen: «N prosjekter · første start u41 ·
// behov i u42–43 over kapasitet». Behov per uke = faktisk tildelte +
// planlagte folk KUN for ikke-startede prosjekter (de har per definisjon
// ingen tildelinger) i ukene de dekker; nevner = utførende minus ferie.
export function pipelineOppsummering(liste, tildelinger, utforende, iDag = null, antallUker = 12) {
  const dag = iDag || datoTilIso(new Date());
  const naavaerendeUke = weekStart(dag);
  const forste = liste.filter(r => r.start && r.start >= naavaerendeUke).sort((a, b) => a.start.localeCompare(b.start))[0] || null;
  const kapRader = liste.map(r => ({
    uker: r.uker_liste, bemannedeUker: new Set(),
    pipeline: { forventetFolk: r.folk || 2, sikkerhet: r.sikkerhet },
  }));
  const sprekkUker = [];
  const perUke = [];
  for (let i = 0; i < antallUker; i++) {
    const m = addDays(naavaerendeUke, i * 7);
    const kap = ukeKapasitet(m, kapRader, tildelinger, utforende);
    perUke.push({ uke: m, ...kap });
    if (kapasitetNivaa(kap) === 'roed') sprekkUker.push(m);
  }
  return {
    antall: liste.length,
    forsteStart: forste ? forste.start : null,
    sprekk: sprekkUker.length ? { fra: sprekkUker[0], til: sprekkUker[sprekkUker.length - 1] } : null,
    perUke,
  };
}
