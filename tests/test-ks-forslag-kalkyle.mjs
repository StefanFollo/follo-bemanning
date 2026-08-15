// Test av 4a (KS-forslag) + 4c (kalkyle vs bemanning) — SPEC-4a-4c test-krav.
// Kjør: node tests/test-ks-forslag-kalkyle.mjs
import { lagFagForslag, hentProsjektFag, lagKsTildeling, normKsFag } from '../src/ksForslag.js';
import { beregnKalkyleVsBemanning, workdaysBetween, erUnderbemannetMotKalkyle, normAnsattFag } from '../src/kalkyleBemanning.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  ✅ ${navn}`); }
  else { feil++; console.log(`  ❌ ${navn}${detalj ? ' — ' + detalj : ''}`); }
}

// ── Mal-bibliotek (samme form som /api/ks/maler) ──
const MALER = [
  { id: 'mal-hms-daglig', navn: 'HMS daglig sjekkliste', obligatorisk: true, fag: [], kategoriBibliotek: 'annet', punkter: [1, 2, 3] },
  { id: 'mal-sha-sja', navn: 'SHA-plan', obligatorisk: true, fag: [], punkter: [1] },
  { id: 'mal-tomrer-riving', navn: 'Riving innvendig', fag: ['tomrer'], kategoriBibliotek: 'innvendig', punkter: [1, 2] },
  { id: 'mal-tomrer-baerende', navn: 'Bærekonstruksjoner', fag: ['tomrer'], kategoriBibliotek: 'innvendig', punkter: [1] },
  { id: 'mal-bad-membran', navn: 'Membran våtrom', fag: ['flis'], kategoriBibliotek: 'bad', punkter: [1] },
  { id: 'mal-el-kurs', navn: 'El-kurser', fag: ['el'], kategoriBibliotek: 'el', punkter: [1] },
  { id: 'mal-ror-vvs', navn: 'VVS-kontroll', fag: ['ror'], kategoriBibliotek: 'ror', punkter: [1] },
  { id: 'mal-fasade-kledning', navn: 'Kledning yttervegg', fag: ['tomrer'], kategoriBibliotek: 'yttervegg', punkter: [1] },
];

console.log('\n── 4a Krav 1: fag tomrer+rive → HMS + tomrer-maler, IKKE bad/el ──');
{
  const p = { id: 'P1', tilbudPayload: { fag: ['Tømrer', 'Rive'], poster: [{ navn: 'Riving av grunnmur' }, { navn: 'Puss av grunnmur' }] } };
  const { forslag } = lagFagForslag(p, MALER, new Set());
  const ids = forslag.map(f => f.mal.id);
  sjekk('HMS-pakken foreslått', ids.includes('mal-hms-daglig') && ids.includes('mal-sha-sja'));
  sjekk('HMS forhåndsvalgt', forslag.filter(f => f.grunn === 'obligatorisk').every(f => f.forhåndsvalgt));
  sjekk('Tomrer-maler foreslått (fag-match)', ids.includes('mal-tomrer-riving') && ids.includes('mal-tomrer-baerende'));
  sjekk('Ikke-forhåndsvalgt for fag-match', forslag.find(f => f.mal.id === 'mal-tomrer-riving').forhåndsvalgt === false);
  sjekk('IKKE bad-maler', !ids.includes('mal-bad-membran'));
  sjekk('IKKE el-maler', !ids.includes('mal-el-kurs'));
  sjekk('IKKE rør-maler', !ids.includes('mal-ror-vvs'));
}

console.log('\n── 4a: post-nøkkelord (bad/våtrom, fasade, tak) ──');
{
  const p = { id: 'P2', tilbudPayload: { fag: ['tomrer'], poster: [{ navn: 'Membran og flis på bad' }, { navn: 'Ny kledning og vinduer' }] } };
  const { forslag } = lagFagForslag(p, MALER, new Set());
  const ids = forslag.map(f => f.mal.id);
  sjekk('Bad-mal via post-match', ids.includes('mal-bad-membran'));
  sjekk('Yttervegg-mal via post-match (fag-match tar den også)', ids.includes('mal-fasade-kledning'));
  sjekk('Grunn angir post-match/fag', /post-match|fag/.test(forslag.find(f => f.mal.id === 'mal-bad-membran').grunn));
}

console.log('\n── 4a Krav 2: tildeling identisk med manuell (lagNyKS-formen) ──');
{
  const t = lagKsTildeling(MALER[2]);
  sjekk('Samme felter som manuell tildeling',
    t.malId === 'mal-tomrer-riving' && t.status === 'ikke-startet' &&
    t.framdrift.utfylt === 0 && t.framdrift.totalt === 2 &&
    Array.isArray(t.svar) && Array.isArray(t.avvik) && !!t.tildeltDato);
  sjekk('tildeltAv = forslag:fag-match', t.tildeltAv === 'forslag:fag-match');
}

console.log('\n── 4a Krav 3: allerede tildelte foreslås aldri ──');
{
  const p = { id: 'P3', tilbudPayload: { fag: ['tomrer'] } };
  const { forslag } = lagFagForslag(p, MALER, new Set(['mal-tomrer-riving', 'mal-hms-daglig']));
  const ids = forslag.map(f => f.mal.id);
  sjekk('Tildelt tomrer-mal utelatt', !ids.includes('mal-tomrer-riving'));
  sjekk('Tildelt HMS-mal utelatt', !ids.includes('mal-hms-daglig'));
  sjekk('Utildelte foreslås fortsatt', ids.includes('mal-tomrer-baerende') && ids.includes('mal-sha-sja'));
}

console.log('\n── 4a: uten grunnlag → kun HMS ──');
{
  const p = { id: 'P4' };
  const { forslag } = lagFagForslag(p, MALER, new Set());
  sjekk('Kun obligatoriske uten fag/poster', forslag.every(f => f.grunn === 'obligatorisk'));
  sjekk('normKsFag-mapping', normKsFag('Tømrer') === 'tomrer' && normKsFag('rørlegger') === 'ror' && normKsFag('ukjent') === null);
}

console.log('\n── 4c Krav 5: timer-summering (manuell kontrollregning) ──');
{
  // Kalkyle: tomrer 238 t, rorlegger 30 t, pl 50 t
  // Tildelinger: Tømrer man 11.08–fre 22.08 (10 arbeidsdager × 7,5 = 75 t)
  //              Bas Tømrer man 11.08–ons 13.08 (3 × 7,5 = 22,5 t) → tomrer 97,5 ≈ 98
  //              Rørlegger man 18.08–man 18.08 (1 × 7,5 = 7,5 t) → 8 (avrundet)
  //              Maler (utenfor kalkyle) 2 dager = 15 t
  const p = { id: 'PX', status: 'aktiv', tilbudPayload: { fagBreakdown: { tomrer: { timer: 238 }, rorlegger: { timer: 30 }, pl: { timer: 50 } } } };
  const ansatte = { A1: { fag: 'Tømrer' }, A2: { fag: 'Bas Tømrer' }, A3: { fag: 'Rørlegger' }, A4: { fag: 'Maler', innleie: true } };
  const tild = [
    { id: 'T1', prosjektId: 'PX', ansattId: 'A1', startDato: '2026-08-10', sluttDato: '2026-08-21' }, // søn 10. → man-fre×2 = 10 dager
    { id: 'T2', prosjektId: 'PX', ansattId: 'A2', startDato: '2026-08-10', sluttDato: '2026-08-12' }, // man-ons = 3 dager (10. er søndag → 3? 10=søn,11=man,12=ons? 2026-08-10 er mandag! sjekkes under)
    { id: 'T3', prosjektId: 'PX', ansattId: 'A3', startDato: '2026-08-17', sluttDato: '2026-08-17' },
    { id: 'T4', prosjektId: 'PX', ansattId: 'A4', startDato: '2026-08-17', sluttDato: '2026-08-18' },
    { id: 'T5', prosjektId: 'ANNET', ansattId: 'A1', startDato: '2026-08-10', sluttDato: '2026-08-21' }, // annet prosjekt — teller ikke
  ];
  // Fasit på arbeidsdager
  sjekk('workdays 10.–21. aug 2026 = 10 (man–fre ×2)', workdaysBetween('2026-08-10', '2026-08-21') === 10);
  sjekk('workdays over helg teller ikke lør/søn', workdaysBetween('2026-08-14', '2026-08-17') === 2); // fre + man
  const b = beregnKalkyleVsBemanning(p, tild, ansatte);
  const tomrer = b.rader.find(r => r.fag === 'tomrer');
  const ror = b.rader.find(r => r.fag === 'rorlegger');
  const pl = b.rader.find(r => r.fag === 'pl');
  sjekk('Tømrer: (10+3)×7,5 = 97,5 ≈ 98 t', tomrer.bemannetTimer === 98, `fikk ${tomrer.bemannetTimer}`);
  sjekk('Tømrer-prosent 98/238 = 41 %', tomrer.pct === 41, `fikk ${tomrer.pct}`);
  sjekk('Rørlegger: 1×7,5 = 8 t avrundet', ror.bemannetTimer === 8);
  sjekk('PL: 0 t (⚠-rad)', pl.bemannetTimer === 0 && pl.pct === 0);
  sjekk('Maler utenfor kalkyle: 15 t, informativ', b.utenforKalkyle.length === 1 && b.utenforKalkyle[0].bemannetTimer === 15);
  sjekk('Totalt: 106 av 318', b.totalBemannet === 106 && b.totalKalkyle === 318, `${b.totalBemannet}/${b.totalKalkyle}`);
  sjekk('Mangler-rad for tømrer ~140 t', b.manglerRader.some(m => m.label === 'Tømrer' && m.manglerTimer === 140));
  sjekk('Innleie teller med', normAnsattFag('Maler') === 'maling');
}

console.log('\n── 4c Krav 6: uten fagBreakdown → null (ingen seksjon) ──');
{
  sjekk('Uten payload → null', beregnKalkyleVsBemanning({ id: 'x' }, [], {}) === null);
  sjekk('Tom fagBreakdown → null', beregnKalkyleVsBemanning({ id: 'x', tilbudPayload: { fagBreakdown: {} } }, [], {}) === null);
}

console.log('\n── 4c varsel: <50 % + <2 uker til slutt ──');
{
  const iDag = '2026-08-15';
  const ansatte = { A1: { fag: 'Tømrer' } };
  const lagP = (slutt, tild) => ({ id: 'PV', status: 'aktiv', sluttDato: slutt, tilbudPayload: { fagBreakdown: { tomrer: { timer: 100 } } } });
  const tildLite = [{ id: 'T', prosjektId: 'PV', ansattId: 'A1', startDato: '2026-08-17', sluttDato: '2026-08-18' }]; // 15 t = 15 %
  const tildMye = [{ id: 'T', prosjektId: 'PV', ansattId: 'A1', startDato: '2026-08-03', sluttDato: '2026-08-21' }]; // 15 d × 7,5 = 112 t
  sjekk('Underbemannet + slutt om 1 uke → varsel', erUnderbemannetMotKalkyle(lagP('2026-08-22'), tildLite, ansatte, iDag) === true);
  sjekk('Godt bemannet → ikke varsel', erUnderbemannetMotKalkyle(lagP('2026-08-22'), tildMye, ansatte, iDag) === false);
  sjekk('Slutt om 4 uker → ikke varsel ennå', erUnderbemannetMotKalkyle(lagP('2026-09-15'), tildLite, ansatte, iDag) === false);
  sjekk('Passert sluttdato → frist-varselet eier den (ikke dette)', erUnderbemannetMotKalkyle(lagP('2026-08-10'), tildLite, ansatte, iDag) === false);
}

console.log('\n── Krav 7: ren lesing — input muteres aldri ──');
{
  const p = { id: 'PX', tilbudPayload: { fagBreakdown: { tomrer: { timer: 10 } } }, ksSjekklister: [{ malId: 'mal-hms-daglig' }] };
  const før = JSON.stringify(p);
  const tild = [{ id: 'T', prosjektId: 'PX', ansattId: 'A1', startDato: '2026-08-10', sluttDato: '2026-08-11' }];
  const tildFør = JSON.stringify(tild);
  beregnKalkyleVsBemanning(p, tild, { A1: { fag: 'Tømrer' } });
  lagFagForslag(p, MALER, new Set(['mal-hms-daglig']));
  sjekk('Prosjekt umutert', JSON.stringify(p) === før);
  sjekk('Tildelinger umutert', JSON.stringify(tild) === tildFør);
}

console.log(`\n═══ ${ok} OK, ${feil} FEIL ═══`);
process.exit(feil > 0 ? 1 : 0);
