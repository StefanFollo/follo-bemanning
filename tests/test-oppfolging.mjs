// Test av oppfølgings-køen (SPEC-oppfolgings-modul.md) — ren logikk.
// Kjør: node tests/test-oppfolging.mjs
import {
  byggOppfolgingsKo, filtrerForBruker, beregnRingt, beregnNyDato, sisteNotat,
  ukesStatistikk, foreslaattNyDato, leggTilDager, ESKALERING_DAGER,
} from '../src/oppfolging.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}
const I_DAG = '2026-08-24'; // mandag
const d = n => leggTilDager(I_DAG, n);

const befaringer = [
  // Joachim (PL J1)
  { id: 'B1', kontaktNavn: 'Forfalt Kunde', adresse: 'Gata 1', telefon: '900 00 001', status: 'tilbud_sendt', nesteKontakt: d(-62), prosjektlederId: 'J1' },
  { id: 'B2', kontaktNavn: 'I dag Kunde', status: 'planlagt', nesteKontakt: d(0), prosjektlederId: 'J1' },
  { id: 'B3', kontaktNavn: 'Framtid Kunde', status: 'tilbud_sendt', nesteKontakt: d(5), prosjektlederId: 'J1' },          // ikke i kø
  { id: 'B4', kontaktNavn: 'Frist Kunde', status: 'tilbud_sendt', tilbudFrist: d(3), prosjektlederId: 'J1', dato: d(-1) }, // frist om 3 d
  // Lars (PL L1)
  { id: 'B5', kontaktNavn: 'Uten dato', status: 'tilbud_sendt', dato: d(-10), prosjektlederId: 'L1' },                     // 10 d stille, mangler dato
  { id: 'B6', kontaktNavn: 'Fersk sendt', status: 'tilbud_sendt', dato: d(-3), prosjektlederId: 'L1' },                     // for fersk
  { id: 'B7', kontaktNavn: 'Gammel lead', status: 'lead', dato: d(-6), ansvarligBefaringId: 'L1' },                         // lead 6 d → kø (ansvarligBefaring teller)
  { id: 'B8', kontaktNavn: 'Aktiv lead', status: 'lead', dato: d(-20), sistKundeAktivitet: d(-2) + 'T10:00:00Z', prosjektlederId: 'L1' }, // aktivitet for 2 d siden
  // Uten ansvarlig → admin
  { id: 'B9', kontaktNavn: 'Eierløs', status: 'tilbud_arbeid', nesteKontakt: d(-8) },
  // Skal ALDRI i kø
  { id: 'B10', kontaktNavn: 'Godkjent', status: 'godkjent', nesteKontakt: d(-30), prosjektlederId: 'J1' },
  { id: 'B11', kontaktNavn: 'Arkivert', status: 'lead', nesteKontakt: d(-30), prosjektlederId: 'J1', arkivert: true },
  { id: 'B12', kontaktNavn: 'Bevisst avsluttet', status: 'tilbud_sendt', dato: d(-40), prosjektlederId: 'L1',
    oppfolgingsLogg: [{ dato: d(-9) + 'T08:00:00Z', av: 'Lars', avId: 'L1', handling: 'ringt', notat: 'Kunden valgte annen', ingenOppfolging: true }] },
];
const før = JSON.stringify(befaringer);

console.log('\n-- Køen: riktige saker, riktig type, mest forfalt øverst --');
const ko = byggOppfolgingsKo(befaringer, I_DAG);
const id = s => s.befaringId;
{
  sjekk('6 saker i køen', ko.length === 6, 'fikk ' + ko.map(id).join(','));
  sjekk('B1 øverst (62 d forfalt)', id(ko[0]) === 'B1' && ko[0].dager === -62 && ko[0].forfalt && ko[0].eskaler);
  sjekk('B1-tekst «62 d forfalt»', ko[0].tekst === '62 d forfalt');
  const typer = Object.fromEntries(ko.map(s => [s.befaringId, s.type]));
  sjekk('B2 = neste-kontakt i dag', typer.B2 === 'neste-kontakt' && ko.find(s => id(s) === 'B2').dager === 0);
  sjekk('B3 (om 5 d) ikke i kø', !typer.B3);
  sjekk('B4 = frist om 3 d (varsel 3 dager før)', typer.B4 === 'frist' && ko.find(s => id(s) === 'B4').dager === 3);
  sjekk('B5 = mangler-dato (10 d stille ≥ 7)', typer.B5 === 'mangler-dato' && ko.find(s => id(s) === 'B5').stilleDager === 10);
  sjekk('B6 (3 d) ikke i kø', !typer.B6);
  sjekk('B7 = lead (6 d ≥ 5), ansvarlig via ansvarligBefaringId', typer.B7 === 'lead' && ko.find(s => id(s) === 'B7').ansvarligId === 'L1');
  sjekk('B8 lead med fersk kundeaktivitet ikke i kø', !typer.B8);
  sjekk('B9 mangler ansvarlig-merke', typer.B9 === 'neste-kontakt' && ko.find(s => id(s) === 'B9').manglerAnsvarlig === true);
  sjekk('godkjent/arkivert/avsluttet aldri i kø', !typer.B10 && !typer.B11 && !typer.B12);
  sjekk('Sortert mest forfalt først', ko.every((s, i) => i === 0 || ko[i - 1].dager <= s.dager));
  sjekk('Eskalering kun > 7 d forfalt', ko.filter(s => s.eskaler).map(id).sort().join(',') === 'B1,B9' && ESKALERING_DAGER === 7);
}

console.log('\n-- Test 1: PL ser KUN egne, admin ser alle --');
{
  const joachim = filtrerForBruker(ko, { rolle: 'befaring', ansattId: 'J1' });
  const lars = filtrerForBruker(ko, { rolle: 'befaring', ansattId: 'L1' });
  const admin = filtrerForBruker(ko, { rolle: 'admin', ansattId: 'S1' });
  sjekk('Joachim: B1,B2,B4', joachim.map(id).sort().join(',') === 'B1,B2,B4');
  sjekk('Lars: B5,B7', lars.map(id).sort().join(',') === 'B5,B7');
  sjekk('Ingen PL ser eierløs B9', !joachim.some(s => id(s) === 'B9') && !lars.some(s => id(s) === 'B9'));
  sjekk('Admin ser alle 6 inkl. B9', admin.length === 6 && admin.some(s => id(s) === 'B9'));
  sjekk('Kontor ser alle', filtrerForBruker(ko, { rolle: 'kontor' }).length === 6);
  sjekk('Ansatt uten ansattId ser ingenting', filtrerForBruker(ko, { rolle: 'befaring', ansattId: '' }).length === 0);
  const medBorte = filtrerForBruker(ko, { rolle: 'admin', borteIds: ['J1'] });
  sjekk('Borte-flagg merker PL-ens saker for admin', medBorte.filter(s => s.ansvarligBorte).map(id).sort().join(',') === 'B1,B2,B4');
  sjekk('PL som er borte ser fortsatt egne', filtrerForBruker(ko, { rolle: 'befaring', ansattId: 'J1', borteIds: ['J1'] }).length === 3);
}

console.log('\n-- Test 2: ✓ Ringt → logg + ny dato, saken forsvinner til ny dato --');
{
  const b1 = befaringer[0];
  const naa = I_DAG + 'T09:15:00.000Z';
  const { payload, innslag } = beregnRingt(b1, { av: 'Joachim', avId: 'J1', notat: 'Vil ha revidert pris', nyDato: foreslaattNyDato(I_DAG), sakType: 'neste-kontakt', naa });
  sjekk('Foreslått ny dato = +7 d', payload.nesteKontakt === d(7));
  sjekk('Logg-innslag: hvem/når/notat/forrigeDato', innslag.av === 'Joachim' && innslag.avId === 'J1' && innslag.dato === naa
    && innslag.notat === 'Vil ha revidert pris' && innslag.forrigeDato === d(-62) && innslag.handling === 'ringt');
  sjekk('Payload rører kun id/oppfolgingsLogg/nesteKontakt', Object.keys(payload).sort().join(',') === 'id,nesteKontakt,oppfolgingsLogg');
  const etter = befaringer.map(b => b.id === 'B1' ? { ...b, ...payload } : b);
  const koEtter = byggOppfolgingsKo(etter, I_DAG);
  sjekk('B1 borte fra køen etter Ringt', !koEtter.some(s => id(s) === 'B1'));
  sjekk('B1 tilbake i køen på ny dato', byggOppfolgingsKo(etter, d(7)).some(s => id(s) === 'B1' && s.dager === 0));
  sjekk('Siste notat på rad = loggnotatet', sisteNotat(etter[0]).tekst === 'Vil ha revidert pris' && sisteNotat(etter[0]).av === 'Joachim');
  // «Ingen ny oppfølging» — bevisst valg
  const r2 = beregnRingt(befaringer[4], { av: 'Lars', avId: 'L1', notat: 'Valgte konkurrent', ingenOppfolging: true, naa });
  sjekk('Ingen ny oppfølging: nesteKontakt tom, flagg i logg', r2.payload.nesteKontakt === '' && r2.innslag.ingenOppfolging && r2.innslag.nyDato === null);
  const etter2 = befaringer.map(b => b.id === 'B5' ? { ...b, ...r2.payload } : b);
  sjekk('B5 (mangler-dato) forsvinner etter bevisst avslutning', !byggOppfolgingsKo(etter2, I_DAG).some(s => id(s) === 'B5'));
  // 📅 Ny dato = utsatt når dato fantes
  const r3 = beregnNyDato(b1, { av: 'Joachim', avId: 'J1', nyDato: d(3), notat: 'Ferie', naa });
  sjekk('Ny dato med eksisterende dato logges som «utsatt»', r3.innslag.handling === 'utsatt' && r3.payload.nesteKontakt === d(3) && r3.innslag.forrigeDato === d(-62));
  const r4 = beregnNyDato(befaringer[4], { av: 'Lars', avId: 'L1', nyDato: d(2), naa });
  sjekk('Ny dato uten eksisterende logges som «ny-dato»', r4.innslag.handling === 'ny-dato');
  let kastet = false; try { beregnNyDato(b1, { nyDato: '' }); } catch { kastet = true; }
  sjekk('Ny dato uten dato kaster', kastet);
}

console.log('\n-- Test 5: ingen data endres uten klikk; telling uendret --');
{
  sjekk('Inndata byte-identisk etter alle kø-/filter-beregninger', JSON.stringify(befaringer) === før);
  sjekk('Antall befaringer uendret (12)', befaringer.length === 12);
  sjekk('Køen kopierer saker, muterer ikke kortet', ko.every(s => s.befaring === befaringer.find(b => b.id === s.befaringId)) && !('dager' in befaringer[0]));
}

console.log('\n-- Ukesstatistikk per PL (admin-innsyn) --');
{
  const logget = befaringer.map(b => b.id === 'B2' ? { ...b, oppfolgingsLogg: [
    { dato: d(-1) + 'T08:00:00Z', av: 'Joachim', avId: 'J1', handling: 'ringt', notat: 'x' },
    { dato: d(-2) + 'T08:00:00Z', av: 'Joachim', avId: 'J1', handling: 'utsatt', nyDato: d(0) },
    { dato: d(-9) + 'T08:00:00Z', av: 'Joachim', avId: 'J1', handling: 'ringt', notat: 'for gammel' },
  ] } : b);
  const st = ukesStatistikk(logget, { iDag: I_DAG });
  sjekk('Periode = siste 7 dager', st.fra === d(-6) && st.til === I_DAG);
  sjekk('Joachim: 1 håndtert, 1 utsatt, 1 forfalt (B1)', st.perPl.J1.handtert === 1 && st.perPl.J1.utsatt === 1 && st.perPl.J1.forfalt === 1);
  sjekk('Lars: 0 håndtert denne uka, 2 forfalt', (st.perPl.L1.handtert || 0) === 0 && st.perPl.L1.forfalt === 2);
  sjekk('Eierløs forfalt teller under __ukjent__', st.perPl.__ukjent__.forfalt === 1);
}

console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil > 0 ? 1 : 0);
