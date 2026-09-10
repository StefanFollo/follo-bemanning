// Pipeline «Ikke bemannet» (postkasse-oppdrag 21): forhåndsutfylling,
// rad-logikk, kapasitetslinje, digest-linje og vern mot lekkasje til
// ansattflate/kundeportal. Kjør: node tests/test-pipeline.mjs
import { readFileSync } from 'fs';
import {
  foreslaaPipeline, pipelineUker, pipelineRader, ukeKapasitet, kapasitetNivaa,
  ukeNr, pipelineDigestLinje, weekStart, addDays, TIMEVERK_UKE,
} from '../src/pipeline.js';
import { planleggVarsler, lagDigestEpost, VARSEL_STATUS_TOM } from '../src/oppfolgingVarsler.js';
import { byggFramdriftPayload } from '../src/framdriftEksport.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}

console.log('\n-- foreslaaPipeline: forhåndsutfylling fra tilbudsdata --');
{
  // 300 timer, tilbudets varighet 4 uker → folk = 300 / (37,5 × 4) = 2
  const a = foreslaaPipeline({ timerPerFag: { tomrer: 200, maler: 100 }, varighetUker: 4, startDato: '2026-09-16' });
  sjekk('varighetUker fra tilbudet brukes', a.forventetUker === 4);
  sjekk('folk = timer / (37,5 × uker), avrundet', a.forventetFolk === 2, `fikk ${a.forventetFolk}`);
  sjekk('forventetStart snappes til mandag', a.forventetStart === '2026-09-14');
  sjekk('automatisk = fast', a.sikkerhet === 'fast');

  // Uten varighet: uker = ceil(timer / (37,5 × 2)) — «2 mann»-antakelsen
  const b = foreslaaPipeline({ timerPerFag: { tomrer: 300 } });
  sjekk('uker utledes fra timer uten varighet', b.forventetUker === Math.ceil(300 / (TIMEVERK_UKE * 2)));
  sjekk('uten oppstart → forventetStart null (vises som «dato ikke satt»)', b.forventetStart === null);

  // Helt uten tilbudsdata: fornuftig standard, aldri 0
  const c = foreslaaPipeline({});
  sjekk('tomt tilbud → 2 uker · 2 folk', c.forventetUker === 2 && c.forventetFolk === 2);
}

console.log('\n-- pipelineUker --');
{
  const uker = pipelineUker({ forventetStart: '2026-09-14', forventetUker: 3 });
  sjekk('3 uker fra mandag', uker.length === 3 && uker[0] === '2026-09-14' && uker[2] === '2026-09-28');
  sjekk('uten start → tom liste', pipelineUker({ forventetUker: 5 }).length === 0);
  sjekk('ukeNr regner ISO-uke', ukeNr('2026-09-14') === 38, `fikk ${ukeNr('2026-09-14')}`);
}

console.log('\n-- pipelineRader: testkrav 1 og 3 --');
{
  const prosjekter = [
    { id: 'P1', navn: 'Bogerudveien 27', pipeline: { forventetStart: '2026-09-14', forventetUker: 3, forventetFolk: 3, sikkerhet: 'fast' } },
    { id: 'P2', navn: 'Ferdig bemannet', pipeline: { forventetStart: '2026-09-14', forventetUker: 1, forventetFolk: 2, sikkerhet: 'fast' } },
    { id: 'P3', navn: 'Arkivert', arkivert: true, pipeline: { forventetStart: '2026-09-14', forventetUker: 2, forventetFolk: 1, sikkerhet: 'fast' } },
    { id: 'P4', navn: 'Bøhlerveien 41A', startDato: '2026-09-14', sluttDato: '2026-10-02' }, // pågår m/ hull
  ];
  const tildelinger = [
    { id: 't1', prosjektId: 'P2', ansattId: 'A1', startDato: '2026-09-14', sluttDato: '2026-09-18' },
    { id: 't2', prosjektId: 'P4', ansattId: 'A2', startDato: '2026-09-14', sluttDato: '2026-09-18' }, // kun uke 38
  ];

  // Testkrav 1: nytt prosjekt uten en eneste tildeling ligger i seksjonen
  const rader = pipelineRader(prosjekter, [], tildelinger);
  const p1 = rader.find(r => r.prosjektId === 'P1');
  sjekk('P1 (uten tildelinger) vises', !!p1 && p1.type === 'prosjekt' && p1.bemannedeUker.size === 0);
  sjekk('P2 (hele perioden bemannet) er UTE av seksjonen', !rader.some(r => r.prosjektId === 'P2'));
  sjekk('Arkivert vises aldri', !rader.some(r => r.prosjektId === 'P3'));
  const hull = rader.find(r => r.prosjektId === 'P4');
  sjekk('Pågående med hull vises (u38 bemannet, u39–40 uten)', !!hull && hull.type === 'hull'
    && hull.bemannedeUker.has('2026-09-14') && !hull.bemannedeUker.has('2026-09-21'), JSON.stringify(hull?.uker));

  // Testkrav 3: bemann én uke → mørk; fjern tildelingen → tilbake til stiplet
  const medUke1 = pipelineRader(prosjekter, [], [...tildelinger,
    { id: 't3', prosjektId: 'P1', ansattId: 'A3', startDato: '2026-09-15', sluttDato: '2026-09-17' }]);
  const p1b = medUke1.find(r => r.prosjektId === 'P1');
  sjekk('Bemannet uke markeres (u38 mørk, u39–40 stiplet)', p1b.bemannedeUker.has('2026-09-14') && p1b.bemannedeUker.size === 1);
  const utenIgjen = pipelineRader(prosjekter, [], tildelinger).find(r => r.prosjektId === 'P1');
  sjekk('Tildeling fjernet → tilbake i pipeline uendret (ingen data slettes)', utenIgjen.bemannedeUker.size === 0);

  // P2 helbemannet → fjern tildelingen → tilbake i seksjonen
  const p2Tilbake = pipelineRader(prosjekter, [], []).find(r => r.prosjektId === 'P2');
  sjekk('Helbemannet prosjekt kommer TILBAKE når tildelinger fjernes', !!p2Tilbake);

  // Befaring lagt inn manuelt (sannsynlig)
  const befaringer = [
    { id: 'B1', adresse: 'Mulig jobb 1', status: 'tilbud_sendt', pipeline: { forventetStart: '2026-09-21', forventetUker: 2, forventetFolk: 2, sikkerhet: 'sannsynlig' } },
    { id: 'B2', adresse: 'Tapt', status: 'tapt', pipeline: { forventetStart: '2026-09-21', forventetUker: 2, forventetFolk: 2, sikkerhet: 'sannsynlig' } },
  ];
  const medBef = pipelineRader(prosjekter, befaringer, tildelinger);
  sjekk('Befaring med pipeline vises som usikker rad', medBef.some(r => r.befaringId === 'B1' && r.type === 'befaring'));
  sjekk('Tapt befaring vises ikke', !medBef.some(r => r.befaringId === 'B2'));
}

console.log('\n-- ukeKapasitet: testkrav 4 --');
{
  const ansatte = Array.from({ length: 9 }, (_, i) => ({ id: 'A' + i, navn: 'Ansatt ' + i }));
  const uke = '2026-10-12';
  // Pipeline-behov 11 i uka → rød selv uten faktisk bemanning
  const rader = pipelineRader([
    { id: 'X1', navn: 'Stor jobb', pipeline: { forventetStart: uke, forventetUker: 1, forventetFolk: 8, sikkerhet: 'fast' } },
    { id: 'X2', navn: 'Jobb to', pipeline: { forventetStart: uke, forventetUker: 1, forventetFolk: 3, sikkerhet: 'fast' } },
    { id: 'X3', navn: 'Kanskje', pipeline: { forventetStart: uke, forventetUker: 1, forventetFolk: 2, sikkerhet: 'mulig' } },
  ], [], []);
  const kap = ukeKapasitet(uke, rader, [], ansatte);
  sjekk('behov 11 av 9 ansatte', kap.behov === 11 && kap.ansatte === 9, JSON.stringify(kap));
  sjekk('usikre telles separat (+2)', kap.usikre === 2);
  sjekk('11/9 → RØD', kapasitetNivaa(kap) === 'roed');
  sjekk('9/9 → gul (≥90 %)', kapasitetNivaa({ behov: 9, ansatte: 9 }) === 'gul');
  sjekk('8/9 → ok (<90 %)', kapasitetNivaa({ behov: 8, ansatte: 9 }) === 'ok');

  // Faktisk bemannede teller i behovet; ferie hele uka reduserer ansatte
  const kap2 = ukeKapasitet(uke, [], [
    { prosjektId: 'P9', ansattId: 'A0', startDato: uke, sluttDato: addDays(uke, 4) },
    { prosjektId: '__FERIE__', ansattId: 'A1', startDato: uke, sluttDato: addDays(uke, 6) },
  ], ansatte);
  sjekk('faktisk bemannet teller i behov, ferie trekkes fra ansatte', kap2.behov === 1 && kap2.ansatte === 8, JSON.stringify(kap2));
}

console.log('\n-- Digest-linjen (C-delen) --');
{
  const iDag = '2026-09-10';
  const pros = [
    { id: 'P1', pipeline: { forventetStart: weekStart('2026-09-21'), forventetUker: 2, forventetFolk: 3, sikkerhet: 'fast' } },
    { id: 'P2', pipeline: { forventetStart: '2026-11-30', forventetUker: 2, forventetFolk: 2, sikkerhet: 'fast' } },
    { id: 'P3', pipeline: { forventetStart: weekStart('2026-09-28'), forventetUker: 1, forventetFolk: 1, sikkerhet: 'fast' } },
  ];
  const linje = pipelineDigestLinje(pros, [], iDag);
  sjekk('Linje når første start er innen 3 uker', linje === `Pipeline: 3 prosjekter uten bemanning, første starter uke ${ukeNr(weekStart('2026-09-21'))}`, linje);
  sjekk('Ingen linje når alt er >3 uker fram', pipelineDigestLinje([pros[1]], [], iDag) === null);
  sjekk('Bemannet prosjekt teller ikke', pipelineDigestLinje([pros[0]], [{ prosjektId: 'P1', ansattId: 'A1', startDato: '2026-09-21', sluttDato: '2026-09-25' }], iDag) === null);

  // Gjennom planleggVarsler → digest-innhold og e-post
  const plan = planleggVarsler({
    befaringer: [{ id: 'b1', status: 'tilbud_sendt', kontaktNavn: 'Kunde', adresse: 'Gate 1', tilbudFrist: '', nesteKontakt: iDag, ansvarligBefaringId: 'A1' }],
    ansatte: [{ id: 'A1', navn: 'Joachim' }],
    brukere: [{ email: 'j@fbs.no', navn: 'Joachim', role: 'befaring', ansattId: 'A1', active: true }],
    prosjekter: pros, tildelinger: [],
    varselStatus: VARSEL_STATUS_TOM, iDag, adminEposter: ['admin@fbs.no'],
  });
  const d = plan.digester[0];
  sjekk('Digesten bærer pipeline-linjen', !!d && typeof d.pipeline === 'string' && d.pipeline.startsWith('Pipeline: 3'));
  const epost = lagDigestEpost(d, 'https://app.test');
  sjekk('E-posten inneholder linjen', epost.html.includes('Pipeline: 3 prosjekter uten bemanning'));
}

console.log('\n-- Testkrav 5: pipeline lekker ALDRI til flate eller kundeportal --');
{
  const flateSrc = readFileSync(new URL('../api/ks/flate.js', import.meta.url), 'utf8');
  sjekk('api/ks/flate.js refererer aldri pipeline', !/pipeline/i.test(flateSrc));
  const payload = byggFramdriftPayload(
    { id: 'P1', navn: 'Test', fdTasks: [{ name: 'Riving', start: 0, dur: 5, pct: 50 }], fdStartWeek: 38, fdStartYear: 2026,
      pipeline: { forventetStart: '2026-09-14', forventetUker: 3, forventetFolk: 3, sikkerhet: 'fast' },
      pipelineLogg: [{ tid: 'x', av: 'y', tekst: 'z' }] },
    [], { iDag: '2026-09-16' }
  );
  const raa = JSON.stringify(payload);
  sjekk('Kundepayload uten pipeline/pipelineLogg', !/pipeline/i.test(raa), raa.slice(0, 120));
}

console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil ? 1 : 0);
