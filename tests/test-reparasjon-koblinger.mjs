// Test av fase 3-reparasjonslogikken + koblinger-API-et.
// Kjør: node tests/test-reparasjon-koblinger.mjs
import http from 'http';
import {
  klassifiserKoblinger, forslagForSpokelse, beregnKobleTilbud,
  beregnStatusFix, beregnAngreSak, mapSalgsStatus, rangerKandidater,
} from '../src/reparasjonKoblinger.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}
function jsonDiff(rawA, rawB) {
  const a = JSON.parse(JSON.stringify(rawA)); const b = JSON.parse(JSON.stringify(rawB));
  const diff = [];
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) diff.push(f);
  }
  return diff;
}

const befaringer = [
  { id: 'B1', kontaktNavn: 'Kari Kunde', adresse: 'Regneveien 4', status: 'tilbud_sendt' },
  { id: 'B2', kontaktNavn: 'Ola Eier', adresse: 'Testveien 11', status: 'godkjent', manueltOverstyrtAv: 'manuell' },
  { id: 'B3', kontaktNavn: 'Per Person', adresse: 'Testveien 13', status: 'planlagt' },
];
const koblinger = [
  { tilbudId: 1, kildeBefaringId: 'B1', salgsStatus: 'tilbud-sendt' },                       // frisk
  { tilbudId: 2, kildeBefaringId: 'GHOST', salgsStatus: 'vunnet', kundenavn: 'Kari Kunde', adresse: 'Regneveien 4', tilbudLink: 'https://t/2' }, // spøkelse
  { tilbudId: 3, kildeBefaringId: 'B2', salgsStatus: 'tapt' },                               // mismatch (godkjent → tapt), manuelt vernet
  { tilbudId: 4, kildeBefaringId: 'GHOST2', salgsStatus: 'tilbud-sendt', adresse: 'Testveien 13' }, // spøkelse — husnummer 13 matcher kun B3
];

console.log('\n-- Klassifisering --');
{
  const { friske, spokelser, mismatch } = klassifiserKoblinger(koblinger, befaringer);
  sjekk('1 frisk', friske.length === 1 && friske[0].tilbudId === 1);
  sjekk('2 spøkelser', spokelser.length === 2);
  sjekk('1 mismatch med retning', mismatch.length === 1 && mismatch[0].befaringStatus === 'godkjent' && mismatch[0].forventetStatus === 'tapt');
  sjekk('mapSalgsStatus: vunnet→godkjent, ukjent→null', mapSalgsStatus('vunnet') === 'godkjent' && mapSalgsStatus('tull') === null);
}

console.log('\n-- Fuzzy-forslag (husnummer må matche eksakt) --');
{
  const { spokelser } = klassifiserKoblinger(koblinger, befaringer);
  const f1 = forslagForSpokelse(spokelser[0], befaringer); // Regneveien 4 + Kari
  sjekk('Spøkelse 2 → forslag B1 (adresse+kunde)', f1?.befaring.id === 'B1');
  const f2 = forslagForSpokelse(spokelser[1], befaringer); // Testveien 13
  sjekk('Spøkelse 4 → forslag B3 (13 matcher ALDRI 11)', f2?.befaring.id === 'B3');
}

console.log('\n-- «Velg annen…»: alle statuser med, fuzzy øverst (Stefans bug) --');
{
  // Stefans reelle sak: vunnet tilbud «Sameiet Søndre Moer B6» skal kunne
  // kobles til GODKJENT befaring «Bjørkeveien 49 · Søndre Moer b6».
  const alleBef = [
    { id: 'G1', kontaktNavn: 'Søndre Moer b6', adresse: 'Bjørkeveien 49', status: 'godkjent' },
    { id: 'P1', kontaktNavn: 'Planla Gt', adresse: 'Planveien 1', status: 'planlagt' },
    { id: 'L1', kontaktNavn: 'Lead Ledesen', adresse: 'Leadveien 2', status: 'lead' },
    { id: 'T1', kontaktNavn: 'Tapt Tapersen', adresse: 'Taptveien 3', status: 'tapt' },
    { id: 'A1', kontaktNavn: 'Arkiv Arkivsen', adresse: 'Arkivveien 4', status: 'godkjent', arkivert: true },
  ];
  const sak = { tilbudId: 7, type: 'spokelse', kildeBefaringId: 'GHOST', salgsStatus: 'vunnet', kundenavn: 'Sameiet Søndre Moer B6', adresse: 'Søndre Moer' };
  const liste = rangerKandidater(sak, alleBef);
  sjekk('Alle 4 ikke-arkiverte med (godkjent/planlagt/lead/tapt)', liste.length === 4);
  sjekk('Arkivert holdt utenfor', !liste.some(k => k.befaring.id === 'A1'));
  sjekk('Godkjent befaring valgbar for vunnet tilbud', liste.some(k => k.befaring.id === 'G1' && k.befaring.status === 'godkjent'));
  sjekk('Delvis kundenavn-treff løfter Bjørkeveien 49 øverst', liste[0].befaring.id === 'G1' && liste[0].score > 0);
  sjekk('Resten alfabetisk på adresse', liste.slice(1).map(k => k.befaring.id).join(',') === 'L1,P1,T1');
  // Uten navnetreff: ingen krasj, ren alfabetisk liste
  const flat = rangerKandidater({ tilbudId: 8, kundenavn: 'Helt Annen', adresse: '' }, alleBef);
  sjekk('Uten treff: 4 rader, alfabetisk, score 0', flat.length === 4 && flat.every(k => k.score === 0) && flat[0].befaring.adresse === 'Bjørkeveien 49');
}

console.log('\n-- Koble + angre: JSON-diff tom --');
{
  const { spokelser } = klassifiserKoblinger(koblinger, befaringer);
  const sak = spokelser[0];
  const før = JSON.parse(JSON.stringify(befaringer[0]));
  const { nyBefaring, før: førFelter } = beregnKobleTilbud(befaringer[0], sak);
  sjekk('tilbudId satt', nyBefaring.tilbudId === 2);
  sjekk('tilbudLink kopiert (var tom)', nyBefaring.tilbudLink === 'https://t/2');
  sjekk('status urørt av kobling', nyBefaring.status === 'tilbud_sendt');
  const { nyBefaring: angret } = beregnAngreSak(nyBefaring, { handling: 'koblet', før: førFelter });
  const diff = jsonDiff(angret, før);
  sjekk('Angre → JSON-diff tom', diff.length === 0, 'diff: ' + diff.join(','));
}

console.log('\n-- Mismatch begge veier + angre --');
{
  const { mismatch } = klassifiserKoblinger(koblinger, befaringer);
  const sak = mismatch[0];
  const før = JSON.parse(JSON.stringify(befaringer[1]));
  const { nyBefaring, før: f } = beregnStatusFix(befaringer[1], sak);
  sjekk('Status flyttet godkjent→tapt', nyBefaring.status === 'tapt');
  const { nyBefaring: angret } = beregnAngreSak(nyBefaring, { handling: 'status-fikset', før: f });
  sjekk('Angre → status tilbake', angret.status === 'godkjent' && jsonDiff(angret, før).length === 0);
  // Motsatt vei (planlagt → tilbud_sendt)
  const sak2 = klassifiserKoblinger([{ tilbudId: 9, kildeBefaringId: 'B3', salgsStatus: 'tilbud-sendt' }], befaringer).mismatch[0];
  const r2 = beregnStatusFix(befaringer[2], sak2);
  sjekk('Motsatt vei planlagt→tilbud_sendt', r2.nyBefaring.status === 'tilbud_sendt');
}

console.log('\n-- Telling: ren logikk skaper/sletter aldri --');
{
  sjekk('3 befaringer før og etter alle beregninger', befaringer.length === 3);
}

// ── API-endepunktet mot fake Upstash ──
const store = new Map();
function kjorKommando(cmd) {
  const [op, ...args] = cmd;
  const OP = String(op).toUpperCase();
  if (OP === 'GET') return store.has(args[0]) ? store.get(args[0]) : null;
  if (OP === 'SET') { store.set(args[0], String(args[1])); return 'OK'; }
  throw new Error('Ustøttet: ' + OP);
}
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const vilHaBase64 = (req.headers['upstash-encoding'] || '').includes('base64');
    const kod = v => (vilHaBase64 && typeof v === 'string') ? Buffer.from(v, 'utf8').toString('base64') : v;
    const parsed = JSON.parse(body);
    const svar = Array.isArray(parsed) && Array.isArray(parsed[0])
      ? parsed.map(cmd => ({ result: kod(kjorKommando(cmd)) }))
      : { result: kod(kjorKommando(parsed)) };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(svar));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
process.env.KV_REST_API_URL = `http://127.0.0.1:${server.address().port}`;
process.env.KV_REST_API_TOKEN = 'test';
process.env.INTER_APP_TOKEN = 'inter-test';
const { default: handler } = await import('../api/befaringer/koblinger.js');

function fakeRes() {
  return { _kode: null, _body: null, setHeader() {}, status(k) { this._kode = k; return this; }, json(b) { this._body = b; return this; }, end() { return this; } };
}
async function kall(method, auth, body, query) {
  const req = { method, headers: { authorization: 'Bearer ' + auth }, body, query: query || {} };
  const res = fakeRes();
  await handler(req, res);
  return res;
}

console.log('\n-- Koblinger-API --');
{
  store.set('fbs_session:brukertoken', JSON.stringify({ navn: 'Stefan', role: 'admin' }));
  // Tilbuds-appen leverer lista
  let r = await kall('POST', 'inter-test', { koblinger });
  sjekk('Inter-app POST lagrer rapport', r._kode === 200 && r._body.antall === 4);
  // Bruker henter
  r = await kall('GET', 'brukertoken');
  sjekk('Bruker-GET gir rapporten', r._body.koblinger.length === 4 && r._body.mottattDato);
  // Bruker registrerer løsning
  r = await kall('POST', 'brukertoken', { losning: { tilbudId: 2, nyKildeBefaringId: 'B1' } });
  sjekk('Løsning registrert', r._kode === 200);
  // Tilbuds-appen henter løsninger
  r = await kall('GET', 'inter-test', null, { losninger: '1' });
  sjekk('Inter-app henter løsninger', r._body.losninger['2']?.nyKildeBefaringId === 'B1' && r._body.losninger['2'].avgjortAv === 'Stefan');
  // Ny rapport ERSTATTER lista men beholder løsninger
  r = await kall('POST', 'inter-test', { koblinger: koblinger.slice(0, 2) });
  r = await kall('GET', 'brukertoken');
  sjekk('Ny rapport beholder løsningene', r._body.koblinger.length === 2 && r._body.losninger['2']?.nyKildeBefaringId === 'B1');
  // Angre fjerner løsningen
  r = await kall('POST', 'brukertoken', { losning: { tilbudId: 2, angret: true } });
  r = await kall('GET', 'inter-test', null, { losninger: '1' });
  sjekk('Angret løsning fjernet', !r._body.losninger['2']);
  // Uautorisert
  r = await kall('GET', 'feil-token');
  sjekk('401 uten gyldig auth', r._kode === 401);
}

server.close();
console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil > 0 ? 1 : 0);
