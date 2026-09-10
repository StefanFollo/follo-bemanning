// Pipeline «Ikke bemannet» (postkasse-oppdrag 21): forhåndsutfylling,
// rad-logikk, kapasitetslinje, digest-linje og vern mot lekkasje til
// ansattflate/kundeportal. Kjør: node tests/test-pipeline.mjs
import { readFileSync } from 'fs';
import {
  foreslaaPipeline, pipelineUker, pipelineRader, ukeKapasitet, kapasitetNivaa,
  ukeNr, pipelineDigestLinje, weekStart, addDays, TIMEVERK_UKE,
  erUtforende, ukeEtikett, prosjektStatus, bemannetTil, hullEtterBemanning, ferdigForslag,
  migrerStatus, pipelineListe, pipelineOppsummering,
} from '../src/pipeline.js';
import { planleggVarsler, lagDigestEpost, VARSEL_STATUS_TOM } from '../src/oppfolgingVarsler.js';
import { byggFramdriftPayload } from '../src/framdriftEksport.js';
import { leggKandidater, byggPipelineProsjekt, sikkerhetFor } from '../src/leggIPipeline.js';

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
  const rader = pipelineRader(prosjekter, [], tildelinger, '2026-09-10');
  const p1 = rader.find(r => r.prosjektId === 'P1');
  sjekk('P1 (uten tildelinger) vises', !!p1 && p1.type === 'prosjekt' && p1.bemannedeUker.size === 0);
  sjekk('P2 (hele perioden bemannet) er UTE av seksjonen', !rader.some(r => r.prosjektId === 'P2'));
  sjekk('Arkivert vises aldri', !rader.some(r => r.prosjektId === 'P3'));
  const hull = rader.find(r => r.prosjektId === 'P4');
  sjekk('Pågående med hull: stolpen starter på FØRSTE ubemannede uke (u39–40)', !!hull && hull.type === 'hull'
    && hull.uker[0] === '2026-09-21' && hull.uker.length === 2 && hull.bemannedeUker.size === 0, JSON.stringify(hull?.uker));

  // Testkrav 3: bemann én uke → mørk; fjern tildelingen → tilbake til stiplet
  const medUke1 = pipelineRader(prosjekter, [], [...tildelinger,
    { id: 't3', prosjektId: 'P1', ansattId: 'A3', startDato: '2026-09-15', sluttDato: '2026-09-17' }], '2026-09-10');
  const p1b = medUke1.find(r => r.prosjektId === 'P1');
  sjekk('Bemannet uke markeres (u38 mørk, u39–40 stiplet)', p1b.bemannedeUker.has('2026-09-14') && p1b.bemannedeUker.size === 1);
  const utenIgjen = pipelineRader(prosjekter, [], tildelinger, '2026-09-10').find(r => r.prosjektId === 'P1');
  sjekk('Tildeling fjernet → tilbake i pipeline uendret (ingen data slettes)', utenIgjen.bemannedeUker.size === 0);

  // Hull i fortid er ikke noe PL kan bemanne — kun inneværende uke og framover
  const fortid = pipelineRader([
    { id: 'P5', navn: 'Gammel jobb', startDato: '2026-08-10', sluttDato: '2026-09-25' },
  ], [], [{ id: 't9', prosjektId: 'P5', ansattId: 'A9', startDato: '2026-09-14', sluttDato: '2026-09-18' }], '2026-09-10');
  const p5 = fortid.find(r => r.prosjektId === 'P5');
  sjekk('Hull-uker i fortid utelates (starter fra inneværende uke)', !!p5 && p5.uker[0] === '2026-09-07', JSON.stringify(p5?.uker));

  // P2 helbemannet → fjern tildelingen → tilbake i seksjonen
  const p2Tilbake = pipelineRader(prosjekter, [], [], '2026-09-10').find(r => r.prosjektId === 'P2');
  sjekk('Helbemannet prosjekt kommer TILBAKE når tildelinger fjernes', !!p2Tilbake);

  // Befaring lagt inn manuelt (sannsynlig)
  const befaringer = [
    { id: 'B1', adresse: 'Mulig jobb 1', status: 'tilbud_sendt', pipeline: { forventetStart: '2026-09-21', forventetUker: 2, forventetFolk: 2, sikkerhet: 'sannsynlig' } },
    { id: 'B2', adresse: 'Tapt', status: 'tapt', pipeline: { forventetStart: '2026-09-21', forventetUker: 2, forventetFolk: 2, sikkerhet: 'sannsynlig' } },
  ];
  const medBef = pipelineRader(prosjekter, befaringer, tildelinger, '2026-09-10');
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
  ], [], [], '2026-09-10');
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

console.log('\n-- Oppdrag 24: avledet status (Ikke startet · Startet · Ferdig) --');
{
  const iDag = '2026-09-10';
  const tild = [{ id: 't1', prosjektId: 'S1', ansattId: 'A1', startDato: '2026-09-07', sluttDato: '2026-09-18' }];
  sjekk('Uten tildelinger → ikke_startet', prosjektStatus({ id: 'S0', status: 'aktiv' }, tild) === 'ikke_startet');
  sjekk('Minst én tildeling → startet (uansett dato)', prosjektStatus({ id: 'S1', status: 'aktiv' }, tild) === 'startet');
  sjekk('fullfort → ferdig selv med tildelinger', prosjektStatus({ id: 'S1', status: 'fullfort' }, tild) === 'ferdig');
  sjekk('Gammel status godkjent uten tildeling → ikke_startet (avledet)', prosjektStatus({ id: 'S0', status: 'godkjent' }, tild) === 'ikke_startet');
  sjekk('Ferie-tildeling teller ikke', prosjektStatus({ id: 'S2', status: 'aktiv' }, [{ prosjektId: '__FERIE__', ansattId: 'A1', startDato: '2026-09-07', sluttDato: '2026-09-11' }]) === 'ikke_startet');
  sjekk('bemannetTil = siste tildelings sluttdato', bemannetTil('S1', tild) === '2026-09-18' && bemannetTil('S0', tild) === null);

  // Migrering: gamle statuser → aktiv, gammel verdi bevart, logg
  const m = migrerStatus({ id: 'M1', status: 'jobber_med' }, iDag);
  sjekk('migrerStatus: jobber_med → aktiv + statusGammel + logg', m.status === 'aktiv' && m.statusGammel === 'jobber_med' && m.pipelineLogg.length === 1 && /automatisk 10\.09/.test(m.pipelineLogg[0].tekst));
  sjekk('migrerStatus rører ikke aktiv/fullfort', migrerStatus({ id: 'M2', status: 'aktiv' }) === null && migrerStatus({ id: 'M3', status: 'fullfort' }) === null);

  // Ferdig?-forslag: sluttdato passert + ingen tildeling siste 14 d
  sjekk('Ferdig? når slutt passert og stille i 14 d', ferdigForslag({ id: 'F1', status: 'aktiv', sluttDato: '2026-08-20' }, [{ prosjektId: 'F1', ansattId: 'A1', startDato: '2026-08-10', sluttDato: '2026-08-20' }], iDag) === true);
  sjekk('IKKE Ferdig? når tildeling innen 14 d', ferdigForslag({ id: 'F1', status: 'aktiv', sluttDato: '2026-08-20' }, [{ prosjektId: 'F1', ansattId: 'A1', startDato: '2026-09-01', sluttDato: '2026-09-05' }], iDag) === false);
  sjekk('IKKE Ferdig? uten sluttdato / når slutt er fram i tid', ferdigForslag({ id: 'F2', status: 'aktiv' }, [], iDag) === false && ferdigForslag({ id: 'F3', status: 'aktiv', sluttDato: '2026-10-01' }, [], iDag) === false);

  // Hull: mellom siste tildeling og sluttdato — aldri uten sluttdato
  const hull = hullEtterBemanning({ id: 'H1', status: 'aktiv', sluttDato: '2026-10-16' }, [{ prosjektId: 'H1', ansattId: 'A1', startDato: '2026-09-07', sluttDato: '2026-09-25' }], iDag);
  sjekk('Hull u40–42 mellom siste tildeling (25.09) og slutt (16.10)', hull && hull.fra === '2026-09-28' && hull.til === '2026-10-12', JSON.stringify(hull));
  sjekk('Ingen hull uten sluttdato', hullEtterBemanning({ id: 'H2', status: 'aktiv' }, [{ prosjektId: 'H2', ansattId: 'A1', startDato: '2026-09-07', sluttDato: '2026-09-25' }], iDag) === null);
  sjekk('Ingen hull når bemannet ut perioden', hullEtterBemanning({ id: 'H3', status: 'aktiv', sluttDato: '2026-09-25' }, [{ prosjektId: 'H3', ansattId: 'A1', startDato: '2026-09-07', sluttDato: '2026-09-25' }], iDag) === null);
}

console.log('\n-- Oppdrag 24: pipelineListe + oppsummering (test-krav 4) --');
{
  const iDag = '2026-09-10';
  const prosjekter = [
    { id: 'P1', navn: 'Tusenfryd', status: 'jobber_med' },
    { id: 'P2', navn: 'Kappveien 24', status: 'godkjent', pipeline: { forventetStart: '2026-10-05', forventetUker: 2, forventetFolk: 3, sikkerhet: 'fast' } },
    { id: 'P3', navn: 'Sannsynlig jobb', status: 'aktiv', pipeline: { forventetStart: '2026-09-21', forventetUker: 1, forventetFolk: 2, sikkerhet: 'sannsynlig' } },
    { id: 'P4', navn: 'Startet', status: 'aktiv', startDato: '2026-09-07', sluttDato: '2026-12-18' },
    { id: 'P5', navn: 'Ferdig', status: 'fullfort' },
  ];
  const tild = [{ id: 't4', prosjektId: 'P4', ansattId: 'A1', startDato: '2026-09-07', sluttDato: '2026-09-18' }];
  const liste = pipelineListe(prosjekter, tild);
  sjekk('Listen = ikke startet (P1, P2, P3) — startet/ferdig er ute', liste.map(r => r.prosjektId).join(',') === 'P1,P3,P2', liste.map(r => r.prosjektId).join(','));
  sjekk('Uten start øverst, så start stigende', !liste[0].start && liste[1].start === '2026-09-21' && liste[2].start === '2026-10-05');
  sjekk('Folk: pipeline-verdi ellers anslag', liste.find(r => r.prosjektId === 'P2').folk === 3 && liste.find(r => r.prosjektId === 'P1').folkAnslag === true);

  // Kapasitet: 21 utførende; P4 er STARTET med tildeling i u37 (1 person) —
  // den skal IKKE bidra med planlagte folk. Bare faktisk tildelte teller.
  const utforende = Array.from({ length: 21 }, (_, i) => ({ id: 'A' + (i + 1), navn: 'U' + i, fag: 'Tømrer' }));
  const opps = pipelineOppsummering(liste, tild, utforende, iDag);
  const u37 = opps.perUke[0];
  sjekk('Uke 37: behov = 1 (faktisk tildelt), IKKE 35 — planlagte folk telles kun der prosjektet mangler tildeling', u37.behov === 1 && u37.ansatte === 21, JSON.stringify(u37));
  const u41 = opps.perUke.find(x => x.uke === '2026-10-05');
  sjekk('Uke 41: Kappveien (fast, 3 folk) teller i behov', u41.behov === 3, JSON.stringify(u41));
  const u39 = opps.perUke.find(x => x.uke === '2026-09-21');
  sjekk('Uke 39: sannsynlig telles som usikre, ikke behov', u39.behov === 0 && u39.usikre === 2, JSON.stringify(u39));
  sjekk('Første start = første ikke-startede med dato fram i tid', opps.forsteStart === '2026-09-21' && opps.antall === 3);
  sjekk('Ingen sprekk ved 21 utførende', opps.sprekk === null);
  const stor = pipelineOppsummering([{ prosjektId: 'X', navn: 'x', start: '2026-09-14', uker: 2, folk: 30, folkAnslag: false, sikkerhet: 'fast', uker_liste: ['2026-09-14', '2026-09-21'] }], [], utforende, iDag);
  sjekk('Sprekk u38–39 når behov 30 > 21', stor.sprekk && stor.sprekk.fra === '2026-09-14' && stor.sprekk.til === '2026-09-21', JSON.stringify(stor.sprekk));
}

console.log('\n-- Oppdrag 25: Start passert, 8-ukers hull i Startet-listen, legg i pipeline --');
{
  const iDag = '2026-09-10';
  const liste = pipelineListe([
    { id: 'A', navn: 'Uten start', status: 'aktiv' },
    { id: 'B', navn: 'Passert', status: 'aktiv', startDato: '2026-05-18' },
    { id: 'C', navn: 'Framtid', status: 'aktiv', pipeline: { forventetStart: '2026-10-05', forventetUker: 2, forventetFolk: 2, sikkerhet: 'fast' } },
  ], [], iDag);
  sjekk('b) gammel startDato < inneværende uke flagges startPassert', liste.find(r => r.prosjektId === 'B').startPassert === true && liste.find(r => r.prosjektId === 'C').startPassert === false);
  sjekk('b) sortering: Sett start → Start passert → start stigende', liste.map(r => r.prosjektId).join(',') === 'A,B,C', liste.map(r => r.prosjektId).join(','));
  sjekk('b) passert start gir ingen uker i kapasitetsregningen', liste.find(r => r.prosjektId === 'B').uker_liste.length === 0);

  // c) hull begrenses til neste 8 uker: bemannet t.o.m. u37, slutt langt ute i 2027
  const hull = hullEtterBemanning({ id: 'H', status: 'aktiv', sluttDato: '2027-05-28' },
    [{ prosjektId: 'H', ansattId: 'A1', startDato: '2026-09-07', sluttDato: '2026-09-11' }], iDag);
  sjekk('c) hull u38–44 (8 uker fra inneværende), aldri «u38–u22 (2027)»', hull && hull.fra === '2026-09-14' && hull.til === '2026-10-26', JSON.stringify(hull));

  // Legg i pipeline: kandidater og bygging
  const bef = [
    { id: 'b1', status: 'godkjent', kontaktNavn: 'Kunde A', adresse: 'Gate 1' },
    { id: 'b2', status: 'tilbud_sendt', kontaktNavn: 'Kunde B', adresse: 'Gate 2', poster: [{ navn: 'x' }] },
    { id: 'b3', status: 'planlagt', kontaktNavn: 'Kunde C', adresse: 'Gate 3' },
    { id: 'b4', status: 'tapt', kontaktNavn: 'Kunde D', adresse: 'Gate 4' },
    { id: 'b5', status: 'godkjent', kontaktNavn: 'Har prosjekt', adresse: 'Gate 5', prosjektId: 'P5' },
    { id: 'b6', status: 'godkjent', kontaktNavn: 'Koblet via prosjekt', adresse: 'Gate 6' },
  ];
  const kand = leggKandidater(bef, [{ id: 'P6', kildeBefaringId: 'b6' }]);
  sjekk('Kandidater: vunnet/sendt/befaring uten prosjekt — ikke tapt, ikke allerede koblet', kand.map(b => b.id).join(',') === 'b1,b2,b3', kand.map(b => b.id).join(','));
  sjekk('Sikkerhet: vunnet=fast, sendt=sannsynlig, befaring=mulig', sikkerhetFor(bef[0]) === 'fast' && sikkerhetFor(bef[1]) === 'sannsynlig' && sikkerhetFor(bef[2]) === 'mulig');
  const { prosjekt, befaring } = byggPipelineProsjekt(bef[1], { forventetStart: '2026-10-21', forventetUker: 3, forventetFolk: 2 }, { prosjektId: 'NY1', farge: '#123', brukerNavn: 'Test' });
  sjekk('Prosjekt: navn «Kunde – adresse» (som BefaringPlan), status aktiv, pipeline sannsynlig, start snappet til mandag',
    prosjekt.navn === 'Kunde B – Gate 2' && prosjekt.status === 'aktiv' && prosjekt.pipeline.sikkerhet === 'sannsynlig' && prosjekt.pipeline.forventetStart === '2026-10-19' && prosjekt.pipeline.forventetUker === 3 && prosjekt.kildeBefaringId === 'b2');
  sjekk('Sendt tilbud: befaringen kobles men arkiveres IKKE', befaring.prosjektId === 'NY1' && !befaring.arkivert);
  const vunnet = byggPipelineProsjekt(bef[0], {}, { prosjektId: 'NY2', farge: '#123', brukerNavn: 'Test' });
  sjekk('Vunnet tilbud: fast + befaring arkiveres (som BefaringPlan)', vunnet.prosjekt.pipeline.sikkerhet === 'fast' && vunnet.befaring.arkivert === true && vunnet.prosjekt.pipeline.forventetStart === null);
  sjekk('Lagt-i-pipeline logges på prosjektet', prosjekt.pipelineLogg.length === 1 && /sannsynlig/.test(prosjekt.pipelineLogg[0].tekst));
}

console.log('\n-- Oppdrag 22: 8-ukers hull + ukeEtikett --');
{
  // Haakon-scenarioet: langt prosjekt, kun inneværende uke bemannet →
  // stolpen dekker første ubemannede uke + 8 uker (u38–45), aldri «u37–22»
  const rader = pipelineRader([
    { id: 'H1', navn: 'Haakon Tveters vei', startDato: '2026-08-24', sluttDato: '2027-05-28' },
  ], [], [{ id: 'ht1', prosjektId: 'H1', ansattId: 'A1', startDato: '2026-09-07', sluttDato: '2026-09-11' }], '2026-09-10');
  const h = rader.find(r => r.prosjektId === 'H1');
  sjekk('Hull-vindu = 8 uker fra første ubemannede', !!h && h.uker.length === 8 && h.uker[0] === '2026-09-14', JSON.stringify(h?.uker));
  sjekk('Etiketten blir «u38–45»', ukeEtikett(h.uker[0], h.uker.length) === 'u38–45', ukeEtikett(h?.uker[0], h?.uker.length));
  sjekk('Over årsskiftet: årstall i parentes (2026 har 53 uker → u51–u2)', ukeEtikett('2026-12-14', 5) === 'u51–u2 (2027)', ukeEtikett('2026-12-14', 5));
  sjekk('Én uke: «u41»', ukeEtikett('2026-10-05', 1) === 'u41');
}

console.log('\n-- Oppdrag 22: erUtforende (kapasitetsnevner) --');
{
  sjekk('Tømrer teller', erUtforende({ navn: 'Ola', fag: 'Tømrer' }));
  sjekk('Montør/Maler/Lærling teller', ['Montør', 'Maler', 'Lærling Tømrer'].every(fag => erUtforende({ navn: 'x', fag })));
  sjekk('Rørlegger teller IKKE (egen plan)', !erUtforende({ navn: 'Rør', fag: 'Rørlegger' }));
  sjekk('Prosjektleder/Anleggsleder teller IKKE', !erUtforende({ navn: 'PL', fag: 'Prosjektleder' }) && !erUtforende({ navn: 'AL', fag: 'Anleggsleder' }));
  sjekk('«Utplassering …»-rader teller IKKE', !erUtforende({ navn: 'Utplassering skole', fag: 'Tømrer' }));
  sjekk('Arkivert/utenfor planen teller IKKE', !erUtforende({ navn: 'x', fag: 'Tømrer', arkivert: true }) && !erUtforende({ navn: 'x', fag: 'Tømrer', utenforBemanningsplan: true }));
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
