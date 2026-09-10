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

// ═══ Oppdrag 23: full oversikt — ALLE ikke-fullførte prosjekter, gruppert ═══
// (Erstatter oppdrag 22 sin pipelineFaneRader: fanen skal være oversikten
// PL åpner for å se alt som kommer og pågår, ikke en feilliste.)
// Grupper (fast rekkefølge): manglerStart (gul) · overskredet (rød) ·
// kommende · pagar · ferdig (bemannet ut perioden, sammenlagt).
// Effektive verdier med kilde: pipeline-feltet vinner, deretter prosjekt-
// datoer, deretter bemanningen (grå «fra bemanning»), deretter anslag.

// Maks antall samtidige ansatte i prosjektets tildelinger (uke-oppløsning)
export function maksSamtidige(prosjektId, tildelinger) {
  const egne = (tildelinger || []).filter(t => t && t.prosjektId === prosjektId && t.prosjektId !== FERIE_ID && t.startDato && t.sluttDato);
  if (!egne.length) return 0;
  let maks = 0;
  const forste = weekStart(egne.reduce((m, t) => t.startDato < m ? t.startDato : m, egne[0].startDato));
  const siste = egne.reduce((m, t) => t.sluttDato > m ? t.sluttDato : m, egne[0].sluttDato);
  for (let m = forste, i = 0; m <= siste && i < 120; m = addDays(m, 7), i++) {
    const slutt = addDays(m, 6);
    const antall = new Set(egne.filter(t => overlaps(t.startDato, t.sluttDato, m, slutt)).map(t => t.ansattId)).size;
    if (antall > maks) maks = antall;
  }
  return maks;
}

export function pipelineOversikt(prosjekter, befaringer, tildelinger, iDag = null) {
  const dag = iDag || datoTilIso(new Date());
  const naavaerendeUke = weekStart(dag);
  const rader = [];

  for (const p of (prosjekter || [])) {
    if (!p || p.arkivert || p.status === 'fullfort') continue;
    const egne = (tildelinger || []).filter(t => t && t.prosjektId === p.id && t.prosjektId !== FERIE_ID && t.startDato && t.sluttDato);
    const harTild = egne.length > 0;
    const forsteTild = harTild ? egne.reduce((m, t) => t.startDato < m ? t.startDato : m, egne[0].startDato) : null;
    const bemannetTil = harTild ? egne.reduce((m, t) => t.sluttDato > m ? t.sluttDato : m, egne[0].sluttDato) : null;

    // Effektiv start med kilde
    const pl = p.pipeline || null;
    let start = null, startKilde = null;
    if (pl?.forventetStart) { start = weekStart(pl.forventetStart); startKilde = 'pipeline'; }
    else if (p.startDato) { start = weekStart(p.startDato); startKilde = 'prosjekt'; }
    else if (forsteTild) { start = weekStart(forsteTild); startKilde = 'bemanning'; }

    // Effektiv slutt: prosjektets sluttdato, ellers pipeline-perioden
    let slutt = p.sluttDato || null;
    if (!slutt && pl?.forventetStart && pl?.forventetUker) slutt = addDays(weekStart(pl.forventetStart), (pl.forventetUker - 1) * 7 + 4);

    // Uker med kilde
    let uker = null, ukerKilde = null;
    if (pl?.forventetUker) { uker = pl.forventetUker; ukerKilde = 'pipeline'; }
    else if (start && slutt && slutt >= start) { uker = Math.max(1, Math.ceil((isoTilDato(slutt) - isoTilDato(start)) / (7 * 86400000))); ukerKilde = 'prosjekt'; }
    else if (forsteTild && bemannetTil) { uker = Math.max(1, Math.ceil((isoTilDato(bemannetTil) - isoTilDato(weekStart(forsteTild))) / (7 * 86400000))); ukerKilde = 'bemanning'; }

    // Folk med kilde (B-delen: aldri tom)
    let folk, folkKilde;
    const samtidige = maksSamtidige(p.id, tildelinger);
    if (pl?.forventetFolk) { folk = pl.forventetFolk; folkKilde = 'pipeline'; }
    else if (samtidige > 0) { folk = samtidige; folkKilde = 'bemanning'; }
    else { folk = 2; folkKilde = 'anslag'; }

    // Gruppe
    let gruppe;
    if (!start) gruppe = 'manglerStart';
    else if ((p.sluttDato && p.sluttDato < dag) || (start < naavaerendeUke && !harTild)) gruppe = 'overskredet';
    else if (start >= dag || (start >= naavaerendeUke && !harTild)) gruppe = 'kommende';
    else gruppe = 'pagar';

    // Stolpe-uker + bemannede + hull. Pågår uten sluttdato: INGEN hull antas
    // (80 % mangler sluttdato) — vis «bemannet til dd.mm · slutt?» i stedet.
    let ukerListe = [], bemannede = new Set();
    if (gruppe === 'pagar' || gruppe === 'kommende') {
      const stolpeStart = start > naavaerendeUke ? start : naavaerendeUke;
      const stolpeSlutt = slutt || bemannetTil;
      if (stolpeSlutt && stolpeSlutt >= stolpeStart) {
        for (let m = stolpeStart, i = 0; m <= stolpeSlutt && i < 60; m = addDays(m, 7), i++) ukerListe.push(m);
        bemannede = new Set(ukerListe.filter(m => ukeBemannet(p.id, tildelinger, m)));
      }
      // Ferdig bemannet ut kjent periode → egen (sammenlagt) gruppe
      if (slutt && ukerListe.length > 0 && bemannede.size === ukerListe.length) gruppe = 'ferdig';
    }

    rader.push({
      id: 'ov-' + p.id, type: 'prosjekt', prosjektId: p.id,
      navn: p.adresse || p.navn || 'Uten navn',
      status: p.status || 'aktiv', plId: p.prosjektlederId || null,
      start, startKilde, slutt, bemannetTil, manglerSluttdato: !p.sluttDato,
      gruppe,
      uker: ukerListe, bemannedeUker: bemannede,
      pipeline: {
        forventetStart: start, forventetUker: uker, forventetFolk: folk,
        sikkerhet: pl?.sikkerhet || 'fast',
      },
      ukerTall: uker, ukerKilde, folk, folkKilde,
      lagretPipeline: pl,
      kategori: (pl?.sikkerhet && pl.sikkerhet !== 'fast') ? 'usikker'
        : (gruppe === 'pagar' && bemannede.size > 0 && bemannede.size < ukerListe.length) ? 'hull' : 'vunnet',
    });
  }

  // Manuelle tilbud/befaringer (sannsynlig/mulig) → Kommende
  for (const b of (befaringer || [])) {
    if (!b || b.arkivert || !b.pipeline) continue;
    if (b.prosjektId || ['tapt', 'godkjent'].includes(b.status)) continue;
    const ukerListe = pipelineUker(b.pipeline);
    rader.push({
      id: 'ovbf-' + b.id, type: 'befaring', befaringId: b.id,
      navn: b.adresse || b.kontaktNavn || 'Uten navn',
      status: 'tilbud', plId: null,
      start: b.pipeline.forventetStart ? weekStart(b.pipeline.forventetStart) : null,
      startKilde: b.pipeline.forventetStart ? 'pipeline' : null,
      slutt: null, bemannetTil: null, manglerSluttdato: false,
      gruppe: b.pipeline.forventetStart ? 'kommende' : 'manglerStart',
      uker: ukerListe, bemannedeUker: new Set(),
      pipeline: { ...b.pipeline },
      ukerTall: b.pipeline.forventetUker || null, ukerKilde: 'pipeline',
      folk: b.pipeline.forventetFolk || 2, folkKilde: b.pipeline.forventetFolk ? 'pipeline' : 'anslag',
      lagretPipeline: b.pipeline,
      kategori: 'usikker',
    });
  }

  const sorter = arr => arr.sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999') || a.navn.localeCompare(b.navn, 'nb'));
  const grupper = {
    manglerStart: sorter(rader.filter(r => r.gruppe === 'manglerStart')),
    overskredet: rader.filter(r => r.gruppe === 'overskredet').sort((a, b) => (a.slutt || a.start || '').localeCompare(b.slutt || b.start || '') || a.navn.localeCompare(b.navn, 'nb')),
    kommende: sorter(rader.filter(r => r.gruppe === 'kommende')),
    pagar: sorter(rader.filter(r => r.gruppe === 'pagar')),
    ferdig: sorter(rader.filter(r => r.gruppe === 'ferdig')),
  };
  return { rader, grupper };
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
