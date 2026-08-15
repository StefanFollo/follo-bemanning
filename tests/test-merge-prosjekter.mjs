// Test av merge-logikken (SPEC-merge-prosjekter.md) — alle 8 test-krav.
// Kjør: node tests/test-merge-prosjekter.mjs
import {
  beregnMerge, beregnAngre, beregnPekerOppdatering, beregnAngrePekere,
  harTilbud, levenshtein, delAdresse, kandidatScore, finnKandidater,
  TILBUDSFELTER,
} from '../src/mergeProsjekter.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  ✅ ${navn}`); }
  else { feil++; console.log(`  ❌ ${navn}${detalj ? ' — ' + detalj : ''}`); }
}

// JSON-diff som ignorerer _endret (stemples om ved hver skriving — forventet)
function utenStempel(o) {
  const { _endret, ...rest } = o || {};
  return rest;
}
function jsonDiff(a, b) {
  const A = utenStempel(a), B = utenStempel(b);
  const felterA = Object.keys(A).sort(), felterB = Object.keys(B).sort();
  const diff = [];
  for (const f of new Set([...felterA, ...felterB])) {
    if (JSON.stringify(A[f]) !== JSON.stringify(B[f])) diff.push(f);
  }
  return diff;
}

// ── Testdata: hoved = manuelt PL-prosjekt med bemanning; sekundær = fra tilbud ──
const hoved = {
  id: 'H1', navn: 'Bagerens vei 11', adresse: 'Bagerens vei 11',
  status: 'aktiv', farge: '#1d4ed8', prosjektlederId: 'PL1',
  startDato: '2026-08-03', sluttDato: '2026-08-07',
  belop: 44000, // manuelt anslag — skal ERSTATTES av tilbudets 44300
  beskrivelse: 'Manuelt opprettet av PL',
  ksSjekklister: [{ malId: 'ks1', status: 'aktiv' }],
  _endret: 1000,
};
const sekundar = {
  id: 'S1', navn: 'Angelica — Bagerens Vei 11, 1542 Vestby', adresse: 'Bagerens Vei 11, 1542 Vestby',
  status: 'godkjent',
  belop: 44300, estimertSum: 44300, pristype: 'fast',
  poster: [{ navn: 'Riving', sum: 20000 }, { navn: 'Montering', sum: 24300 }],
  fag: ['tømrer'], valgteOpsjoner: ['opsjon1'],
  tilbudLink: 'https://tilbud/abc', kildeBefaringId: 'BEF1', befaringId: 'BEF1',
  tilbudPayload: { versjon: 2, sum: 44300 },
  oppstartTekst: 'Uke 33', varighetTekst: '1 uke', varighetUker: 1,
  kunde: { navn: 'Angelica', telefon: '99887766' },
  _endret: 2000,
};
const state = {
  prosjekter: [hoved, sekundar],
  tildelinger: [
    { id: 'T1', ansattId: 'A1', prosjektId: 'S1', startDato: '2026-08-03', sluttDato: '2026-08-05' },
    { id: 'T2', ansattId: 'A2', prosjektId: 'H1', startDato: '2026-08-03', sluttDato: '2026-08-07' },
  ],
  oppgaver: [{ id: 'O1', prosjektId: 'S1', tekst: 'Bestill container' }],
  rorPlaner: [{ id: 'R1', ansattId: 'A3', prosjektId: 'S1', startDato: '2026-08-04', sluttDato: '2026-08-06' }],
  rorTimer: [],
  befaringer: [{ id: 'BEF1', prosjektId: 'S1', status: 'godkjent', adresse: 'Bagerens Vei 11' }],
};

const hovedFør = JSON.parse(JSON.stringify(hoved));
const sekundarFør = JSON.parse(JSON.stringify(sekundar));
const stateFør = JSON.parse(JSON.stringify(state));

const valg = {
  adresse: 'Bagerens vei 11, 1542 Vestby', // Stefan retter skrivefeil i samme steg
  tilbudKilde: 'sekundar',
  beholdManuell: {},
  av: 'Test', dato: '2026-08-15T12:00:00.000Z',
};

console.log('\n── Merge ──');
const { nyHoved, nySekundar, kopierteFelter } = beregnMerge(hoved, sekundar, valg);
const pekere = beregnPekerOppdatering(state, 'S1', 'H1');

// Simuler tilstanden etter merge (som dispatchene ville gjort)
const stateEtter = {
  ...state,
  prosjekter: state.prosjekter.map(p => p.id === 'H1' ? nyHoved : p.id === 'S1' ? nySekundar : p),
  tildelinger: state.tildelinger.map(t => pekere.tildelinger.ids.includes(t.id) ? pekere.tildelinger.oppdaterte.find(x => x.id === t.id) : t),
  oppgaver: state.oppgaver.map(o => pekere.oppgaver.ids.includes(o.id) ? pekere.oppgaver.oppdaterte.find(x => x.id === o.id) : o),
  rorPlaner: state.rorPlaner.map(r => pekere.rorPlaner.ids.includes(r.id) ? pekere.rorPlaner.oppdaterte.find(x => x.id === r.id) : r),
  rorTimer: state.rorTimer,
  befaringer: state.befaringer.map(b => pekere.befaringer.ids.includes(b.id) ? pekere.befaringer.oppdaterte.find(x => x.id === b.id) : b),
};

// KRAV 1: ingen prosjekter forsvinner (aktiv + arkivert = samme totale antall)
sjekk('Krav 1: antall prosjekter uendret etter merge',
  stateEtter.prosjekter.length === stateFør.prosjekter.length);
sjekk('Krav 1b: sekundær er arkivert, ikke borte',
  stateEtter.prosjekter.find(p => p.id === 'S1')?.arkivert === true);

// KRAV 2: sekundærens data i arkivet === original (kun arkiv-/merge-metadata i tillegg)
const arkivert = stateEtter.prosjekter.find(p => p.id === 'S1');
const diff2 = jsonDiff(arkivert, sekundarFør)
  .filter(f => !['arkivert', 'arkivertDato', 'arkivertAv', 'mergetInn'].includes(f));
sjekk('Krav 2: sekundærens JSON i arkivet === original (diff tom)', diff2.length === 0, 'diff: ' + diff2.join(','));

// KRAV 4: tilbudsdata-garantien — ALLE gruppe A-felter fra tilbudet, uansett manuelle verdier
console.log('\n── Tilbudsdata-garantien ──');
for (const felt of TILBUDSFELTER) {
  if (sekundarFør[felt] === undefined) continue;
  sjekk(`Krav 4: ${felt} = tilbudets verdi`,
    JSON.stringify(nyHoved[felt]) === JSON.stringify(sekundarFør[felt]),
    `har ${JSON.stringify(nyHoved[felt])}`);
}
sjekk('Krav 4b: manuelt belop 44000 erstattet av tilbudets 44300', nyHoved.belop === 44300);
sjekk('Krav 4c: overskrevet manuell verdi ligger i kopierteFelter (for angre + logg)',
  kopierteFelter.some(k => k.felt === 'belop' && k.fraVerdi === 44000 && k.tilVerdi === 44300));

// KRAV 5: gruppe B — hovedens drift beholdes
console.log('\n── Driftsdata ──');
sjekk('Krav 5: status beholdt', nyHoved.status === 'aktiv');
sjekk('Krav 5: startDato beholdt', nyHoved.startDato === '2026-08-03');
sjekk('Krav 5: sluttDato beholdt', nyHoved.sluttDato === '2026-08-07');
sjekk('Krav 5: farge beholdt', nyHoved.farge === '#1d4ed8');
sjekk('Krav 5: prosjektleder beholdt', nyHoved.prosjektlederId === 'PL1');
sjekk('Krav 5: beskrivelse beholdt', nyHoved.beskrivelse === 'Manuelt opprettet av PL');
sjekk('Krav 5: KS-sjekklister beholdt', nyHoved.ksSjekklister?.[0]?.malId === 'ks1');
sjekk('Krav 5b: tomt felt (kunde) fylt fra sekundær', nyHoved.kunde?.navn === 'Angelica');
sjekk('Adresse: valgt variant satt', nyHoved.adresse === 'Bagerens vei 11, 1542 Vestby');

// KRAV 6: pekere etter merge
console.log('\n── Pekere ──');
sjekk('Krav 6: tildeling T1 re-pekt til H1', stateEtter.tildelinger.find(t => t.id === 'T1').prosjektId === 'H1');
sjekk('Krav 6: T2 (allerede H1) urørt', stateEtter.tildelinger.find(t => t.id === 'T2') === state.tildelinger[1]);
sjekk('Krav 6: oppgave re-pekt', stateEtter.oppgaver[0].prosjektId === 'H1');
sjekk('Krav 6: rørplan re-pekt', stateEtter.rorPlaner[0].prosjektId === 'H1');
sjekk('Krav 6: befaring re-pekt', stateEtter.befaringer[0].prosjektId === 'H1');

// KRAV 7: merge-logg komplett
console.log('\n── Merge-logg ──');
const mergeInfo = nyHoved.mergetFra[nyHoved.mergetFra.length - 1];
sjekk('Krav 7: mergetFra har innslag med id/dato/av', mergeInfo.id === 'S1' && !!mergeInfo.dato && mergeInfo.av === 'Test');
sjekk('Krav 7: kopierteFelter inkluderer overskrevet manuell verdi',
  mergeInfo.kopierteFelter.some(k => k.felt === 'belop' && k.fraVerdi === 44000));
sjekk('Krav 7: sekundærens før-arkivfelter lagret', 'arkivert' in mergeInfo.sekundarFørFelter);
sjekk('Sekundær har mergetInn-peker', nySekundar.mergetInn?.hovedId === 'H1');

// ── ANGRE ──
console.log('\n── Angre ──');
const angre = beregnAngre(nyHoved, nySekundar, mergeInfo);
const angrePekere = beregnAngrePekere(stateEtter, {
  tildelinger: pekere.tildelinger.ids, oppgaver: pekere.oppgaver.ids,
  rorPlaner: pekere.rorPlaner.ids, rorTimer: pekere.rorTimer.ids, befaringer: pekere.befaringer.ids,
}, 'S1', 'H1');

const stateAngret = {
  ...stateEtter,
  prosjekter: stateEtter.prosjekter.map(p => p.id === 'H1' ? angre.nyHoved : p.id === 'S1' ? angre.nySekundar : p),
  tildelinger: stateEtter.tildelinger.map(t => angrePekere.tildelinger.ids.includes(t.id) ? angrePekere.tildelinger.oppdaterte.find(x => x.id === t.id) : t),
  oppgaver: stateEtter.oppgaver.map(o => angrePekere.oppgaver.ids.includes(o.id) ? angrePekere.oppgaver.oppdaterte.find(x => x.id === o.id) : o),
  rorPlaner: stateEtter.rorPlaner.map(r => angrePekere.rorPlaner.ids.includes(r.id) ? angrePekere.rorPlaner.oppdaterte.find(x => x.id === r.id) : r),
  befaringer: stateEtter.befaringer.map(b => angrePekere.befaringer.ids.includes(b.id) ? angrePekere.befaringer.oppdaterte.find(x => x.id === b.id) : b),
};

// KRAV 3: JSON-diff mot før-tilstand = tom for BEGGE
const diffHoved = jsonDiff(stateAngret.prosjekter.find(p => p.id === 'H1'), hovedFør);
const diffSekundar = jsonDiff(stateAngret.prosjekter.find(p => p.id === 'S1'), sekundarFør);
sjekk('Krav 3: hoved etter angre === hoved før merge (diff tom)', diffHoved.length === 0, 'diff: ' + diffHoved.join(','));
sjekk('Krav 3: sekundær etter angre === sekundær før merge (diff tom)', diffSekundar.length === 0, 'diff: ' + diffSekundar.join(','));

// KRAV 6 etter angre
sjekk('Krav 6: tildeling T1 peker tilbake på S1', stateAngret.tildelinger.find(t => t.id === 'T1').prosjektId === 'S1');
sjekk('Krav 6: oppgave tilbake på S1', stateAngret.oppgaver[0].prosjektId === 'S1');
sjekk('Krav 6: befaring tilbake på S1', stateAngret.befaringer[0].prosjektId === 'S1');

// KRAV 8 (spec-krav 1/8): telling identisk gjennom hele syklusen
sjekk('Krav 8: antall prosjekter identisk etter hel syklus', stateAngret.prosjekter.length === stateFør.prosjekter.length);
sjekk('Krav 8b: antall tildelinger/oppgaver/befaringer uendret',
  stateAngret.tildelinger.length === stateFør.tildelinger.length &&
  stateAngret.oppgaver.length === stateFør.oppgaver.length &&
  stateAngret.befaringer.length === stateFør.befaringer.length);

// ── Kant: manuelt endret felt ETTER merge skal IKKE tilbakestilles ──
console.log('\n── Kant-tilfeller ──');
{
  const endretEtterpaa = { ...nyHoved, belop: 50000 }; // bruker endret manuelt etter merge
  const a2 = beregnAngre(endretEtterpaa, nySekundar, mergeInfo);
  sjekk('Manuelt endret belop etter merge røres IKKE av angre', a2.nyHoved.belop === 50000);
  sjekk('...og rapporteres i ikkeTilbakestilt', a2.ikkeTilbakestilt.includes('belop'));
}
// Kant: «behold manuell» per felt
{
  const { nyHoved: nh } = beregnMerge(hovedFør, sekundarFør, { ...valg, beholdManuell: { belop: true } });
  sjekk('«Behold manuell»: belop beholder 44000', nh.belop === 44000);
  sjekk('...men resten av gruppe A følger tilbudet', JSON.stringify(nh.poster) === JSON.stringify(sekundarFør.poster));
}
// Kant: hoved har tilbud, sekundær er manuell → gruppe A urørt
{
  const hovedMedTilbud = { ...sekundarFør, id: 'H2' };
  const sekManuell = { id: 'S2', navn: 'X', adresse: 'X 1', belop: 99, status: 'aktiv' };
  const { nyHoved: nh } = beregnMerge(hovedMedTilbud, sekManuell, { adresse: 'X 1', tilbudKilde: null, av: 'T', dato: 'd' });
  sjekk('Hoved har tilbudet: belop IKKE overskrevet av manuell sekundær', nh.belop === 44300);
}
// Kant: tilbudet mangler et gruppe A-felt hoved har manuelt → hoved beholder
{
  const sekUtenVarighet = { ...sekundarFør };
  delete sekUtenVarighet.varighetUker;
  const hovedMedVarighet = { ...hovedFør, varighetUker: 3 };
  const { nyHoved: nh } = beregnMerge(hovedMedVarighet, sekUtenVarighet, valg);
  sjekk('Tilbud uten varighetUker: hovedens manuelle 3 beholdes', nh.varighetUker === 3);
}

// ── Fuzzy-motor ──
console.log('\n── Fuzzy-forslag ──');
sjekk('Levenshtein: bagerens/bagerns = 1', levenshtein('bagerens', 'bagerns') === 1);
sjekk('delAdresse: «Bagerens Vei 11B, 1542 Vestby» → gate+nummer',
  JSON.stringify(delAdresse('Bagerens Vei 11B, 1542 Vestby')) === JSON.stringify({ gate: 'bagerens vei', nummer: '11b' }));
sjekk('vei/veien likestilles', delAdresse('Bagerensveien 11').gate === delAdresse('Bagerensvei 11').gate);
sjekk('Skrivefeil (lev≤3) matcher: «Bagerns vei 11» ~ «Bagerens vei 11»',
  kandidatScore({ adresse: 'Bagerns vei 11' }, { adresse: 'Bagerens vei 11' }) >= 30);
sjekk('Husnummer MÅ matche: 11 ≠ 13 → score 0',
  kandidatScore({ adresse: 'Bagerens vei 11' }, { adresse: 'Bagerens vei 13' }) === 0);
sjekk('Kundenavn-match vekter sterkt (uten adresse-match)',
  kandidatScore({ adresse: 'Helt annen vei 2', kunde: { navn: 'Angelica' } }, { adresse: 'Bagerens vei 11', kunde: { navn: 'Angelica' } }) >= 30);
sjekk('Postnummer-avvik hindrer ikke forslag',
  kandidatScore({ adresse: 'Bagerens vei 11' }, { adresse: 'Bagerens Vei 11, 1542 Vestby' }) >= 30);
sjekk('finnKandidater ekskluderer arkiverte og seg selv',
  finnKandidater(hovedFør, [hovedFør, { ...sekundarFør, arkivert: true }]).length === 0);
sjekk('harTilbud: sekundær ja, hoved nei', harTilbud(sekundarFør) && !harTilbud(hovedFør));

console.log(`\n═══ ${ok} OK, ${feil} FEIL ═══`);
process.exit(feil > 0 ? 1 : 0);
