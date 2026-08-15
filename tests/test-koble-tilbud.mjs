// Test av «Koble til tilbud»-logikken (SPEC-del2 trinn 2, test-krav 5–7).
// Kjør: node tests/test-koble-tilbud.mjs
import { beregnKobling, beregnFjernKobling, tilbudsfelterFraBefaring } from '../src/mergeProsjekter.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  ✅ ${navn}`); }
  else { feil++; console.log(`  ❌ ${navn}${detalj ? ' — ' + detalj : ''}`); }
}
function utenStempel(o) { const { _endret, ...rest } = o || {}; return rest; }
function jsonDiff(a, b) {
  const A = utenStempel(a), B = utenStempel(b);
  const diff = [];
  for (const f of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (JSON.stringify(A[f]) !== JSON.stringify(B[f])) diff.push(f);
  }
  return diff;
}

// Gruppe B-felter som ALDRI skal røres av kobling
const GRUPPE_B = ['startDato', 'sluttDato', 'status', 'farge', 'prosjektlederId', 'beskrivelse', 'ksSjekklister', 'fdTasks', 'kunde', 'navn', 'adresse'];

const prosjekt = {
  id: 'P1', navn: 'Manuelt prosjekt', adresse: 'Regneveien 4',
  status: 'aktiv', farge: '#1d4ed8', prosjektlederId: 'PL1',
  startDato: '2026-08-01', sluttDato: '2026-09-01',
  beskrivelse: 'PL regnet dette selv',
  belop: 120000, // manuelt anslag
  ksSjekklister: [{ malId: 'ks1' }],
  fdTasks: [{ id: 't1', navn: 'Riving' }],
  kunde: { navn: 'Ola Eier' },
  _endret: 111,
};
const befaring = {
  id: 'B1', kontaktNavn: 'Ola Eier', adresse: 'Regneveien 4',
  status: 'godkjent',
  estimertBelop: '', estimertSum: 118500, pristype: 'fast',
  poster: [{ navn: 'Riving', sum: 50000, kalkyle: { totalPris: 50000, timer: [{ fag: 'tømrer', antall: 40 }] } }, { navn: 'Montering', sum: 68500 }],
  fag: ['tømrer'], valgteOpsjoner: ['ekstra-bod'],
  tilbudLink: 'https://tilbud/xyz',
  oppstartTekst: 'Uke 35', varighetTekst: '3 uker', varighetUker: 3,
  tilbudPayload: { totalSum: 148125, totalTimer: 40, publicToken: 'tok123', tilbudPdfUrl: 'https://pdf/xyz', fagBreakdown: { tomrer: { timer: 40, kr: 118500 } } },
};

const prosjektFør = JSON.parse(JSON.stringify(prosjekt));

console.log('\n── Kobling ──');
const { nyProsjekt, kopierteFelter, felterFør } = beregnKobling(prosjekt, befaring, {
  beholdManuell: {}, av: 'Test', dato: '2026-08-15T13:00:00.000Z',
});

// Krav 5: gruppe A inn, gruppe B urørt (JSON-diff på gruppe B = tom)
const diffB = GRUPPE_B.filter(f => JSON.stringify(nyProsjekt[f]) !== JSON.stringify(prosjektFør[f]));
sjekk('Krav 5: JSON-diff på gruppe B etter kobling = tom', diffB.length === 0, 'diff: ' + diffB.join(','));
sjekk('Krav 5b: tilbudPayload kopiert (full pakke)', nyProsjekt.tilbudPayload?.publicToken === 'tok123' && nyProsjekt.tilbudPayload?.totalSum === 148125);
sjekk('Krav 5c: poster kopiert', nyProsjekt.poster?.length === 2);
sjekk('Krav 5d: manuelt belop erstattet av tilbudets (estimertSum-fallback)', nyProsjekt.belop === 118500);
sjekk('Krav 5e: befaringId/kildeBefaringId satt', nyProsjekt.befaringId === 'B1' && nyProsjekt.kildeBefaringId === 'B1');
sjekk('Krav 5f: kildeTilbudData bygget med timer per fag', nyProsjekt.kildeTilbudData?.timer?.['tømrer'] === 40);
sjekk('Koble-metadata satt', nyProsjekt.tilbudKobletDato && nyProsjekt.tilbudKobletAv === 'Test' && !!nyProsjekt.tilbudsfelterFørKobling);
sjekk('felterFør har manuelt belop', felterFør.belop === 120000);
sjekk('kopierteFelter logget for audit', kopierteFelter.some(k => k.felt === 'belop' && k.fraVerdi === 120000 && k.tilVerdi === 118500));

// «Behold manuell»
{
  const { nyProsjekt: np } = beregnKobling(prosjektFør, befaring, { beholdManuell: { belop: true }, av: 'T', dato: 'd' });
  sjekk('«Behold manuell»: belop beholder 120000', np.belop === 120000);
  sjekk('...men payload kopieres fortsatt', np.tilbudPayload?.publicToken === 'tok123');
}

console.log('\n── Fjern kobling ──');
const { nyProsjekt: gjenopprettet } = beregnFjernKobling(nyProsjekt);
const diffEtterFjern = jsonDiff(gjenopprettet, prosjektFør);
sjekk('Krav 6: JSON-diff mot før-tilstand = tom', diffEtterFjern.length === 0, 'diff: ' + diffEtterFjern.join(','));
sjekk('Krav 6b: felter som ikke fantes er fjernet igjen', !('tilbudPayload' in gjenopprettet) && !('poster' in gjenopprettet) && !('befaringId' in gjenopprettet));
sjekk('Krav 6c: koble-metadata fjernet', !('tilbudKobletDato' in gjenopprettet) && !('tilbudsfelterFørKobling' in gjenopprettet));
sjekk('Fjern uten kobling → null (ingenting skjer)', beregnFjernKobling(prosjektFør) === null);

// Krav 7: telling — ren logikk endrer aldri antall (1 prosjekt inn → 1 ut)
sjekk('Krav 7: kobling/fjerning skaper/sletter aldri objekter',
  [nyProsjekt, gjenopprettet].every(x => x && x.id === 'P1'));

// tilbudsfelterFraBefaring-detaljer
console.log('\n── Felt-mapping ──');
const felter = tilbudsfelterFraBefaring(befaring);
sjekk('belop faller tilbake på estimertSum når estimertBelop er tomt', felter.belop === 118500);
sjekk('payload kopieres som nytt objekt (ikke referanse)', felter.tilbudPayload !== befaring.tilbudPayload && JSON.stringify(felter.tilbudPayload) === JSON.stringify(befaring.tilbudPayload));

console.log(`\n═══ ${ok} OK, ${feil} FEIL ═══`);
process.exit(feil > 0 ? 1 : 0);
