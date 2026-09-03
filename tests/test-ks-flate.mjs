// Test av KS-ansattflaten PR1 (SPEC-ks-ansattflate.md) — token-modell,
// filtrering, 4-siffer-verifisering, utfylling. Kjør: node tests/test-ks-flate.mjs
import http from 'http';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}

const store = new Map();
function kjorKommando(cmd) {
  const [op, ...args] = cmd;
  const OP = String(op).toUpperCase();
  if (OP === 'GET') return store.has(args[0]) ? store.get(args[0]) : null;
  if (OP === 'SET') { store.set(args[0], String(args[1])); return 'OK'; }
  if (OP === 'DEL') { const f = store.delete(args[0]); return f ? 1 : 0; }
  if (OP === 'INCR') { const v = (Number(store.get(args[0])) || 0) + 1; store.set(args[0], String(v)); return v; }
  if (OP === 'EXPIRE') { return store.has(args[0]) ? 1 : 0; }
  if (OP === 'KEYS') { const pre = String(args[0]).replace('*', ''); return [...store.keys()].filter(k => k.startsWith(pre)); }
  throw new Error('Ustøttet: ' + OP);
}
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const vilHaBase64 = (req.headers['upstash-encoding'] || '').includes('base64');
    const kod = v => (vilHaBase64 && typeof v === 'string') ? Buffer.from(v, 'utf8').toString('base64') : Array.isArray(v) ? v.map(kod) : v;
    const parsed = JSON.parse(body);
    const svar = Array.isArray(parsed) && Array.isArray(parsed[0]) ? parsed.map(cmd => ({ result: kod(kjorKommando(cmd)) })) : { result: kod(kjorKommando(parsed)) };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(svar));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
process.env.KV_REST_API_URL = `http://127.0.0.1:${server.address().port}`;
process.env.KV_REST_API_TOKEN = 'test';
const { default: flate } = await import('../api/ks/flate.js');
const { default: flateAdmin } = await import('../api/ks/flate-admin.js');

const iDag = new Date().toISOString().slice(0, 10);
const omEnUke = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const iGaar = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

store.set('fbs_state', JSON.stringify({
  ansatte: [
    { id: 'A1', navn: 'Tomas Snekker', telefon: '+47 912 34 567', fag: 'Tømrer' },
    { id: 'A2', navn: 'Arkivert Mann', telefon: '90000000', arkivert: true },
    { id: 'A3', navn: 'Uten Telefon' },
  ],
  prosjekter: [
    { id: 'P1', navn: 'Lindemansveien 59', kunde: { navn: 'HEMMELIG KUNDE' }, estimertBelop: 999999 },
    { id: 'P2', navn: 'Annet Prosjekt' },
    { id: 'P3', navn: 'Gammelt Prosjekt' },
  ],
  tildelinger: [
    { ansattId: 'A1', prosjektId: 'P1', startDato: iGaar, sluttDato: omEnUke },
    { ansattId: 'A1', prosjektId: 'P3', startDato: '2026-01-01', sluttDato: iGaar },  // utløpt
    { ansattId: 'A9', prosjektId: 'P2', startDato: iGaar, sluttDato: omEnUke },
  ],
}));
store.set('fbs_ks_sjekklister', JSON.stringify([
  { id: 'SL1', prosjektId: 'P1', navn: 'Stillas-kontroll', kategori: 'HMS', ansvarlig: ['Tomas Snekker'],
    punkter: [
      { id: 'p1', tekst: 'Fundament sjekket', status: '', hemmeligAIFelt: 'intern' },
      { id: 'p2', tekst: 'Rekkverk montert', status: '' },
    ] },
  { id: 'SL2', prosjektId: 'P1', navn: 'Andres liste', ansvarlig: ['Noen Andre'], punkter: [{ id: 'x', tekst: 'X', status: '' }] },
  { id: 'SL3', prosjektId: 'P2', navn: 'Feil prosjekt', ansvarlig: ['Tomas Snekker'], punkter: [{ id: 'y', tekst: 'Y', status: '' }] },
  { id: 'SL4', prosjektId: 'P1', navn: 'Levert liste', ansvarlig: ['Tomas Snekker'], signert_av: 'Tomas Snekker',
    punkter: [{ id: 'z', tekst: 'Z', status: 'ok' }] },
]));
store.set('fbs_session:admintoken', JSON.stringify({ email: 'stefan@fbs.no', role: 'admin', navn: 'Stefan' }));
store.set('fbs_session:pltoken', JSON.stringify({ email: 'pl@fbs.no', role: 'befaring', navn: 'PL' }));

function fakeRes() { return { _kode: null, _body: null, setHeader() {}, status(k) { this._kode = k; return this; }, json(b) { this._body = b; return this; }, end() { return this; } }; }
let ipTeller = 0;
async function kall(handler, method, { auth, body, query, ip } = {}) {
  const req = { method, headers: { ...(auth ? { authorization: 'Bearer ' + auth } : {}), 'x-real-ip': ip || ('10.0.0.' + (++ipTeller % 200)) }, body: body || {}, query: query || {} };
  const res = fakeRes(); await handler(req, res); return res;
}

console.log('\n-- Admin: generer og regenerer lenke --');
let token;
{
  let r = await kall(flateAdmin, 'POST', { auth: 'pltoken', body: { ansattId: 'A1' } });
  sjekk('PL-rollen kan ikke lage lenker (kun admin/kontor)', r._kode === 401);
  r = await kall(flateAdmin, 'POST', { auth: 'admintoken', body: { ansattId: 'A1' } });
  sjekk('Admin lager lenke', r._kode === 200 && /\/ks\/[a-f0-9]{48}$/.test(r._body.url));
  token = r._body.url.split('/ks/')[1];
  sjekk('Uten telefon-varsel når nummer finnes: nei', r._body.manglerTelefon === false);
  r = await kall(flateAdmin, 'POST', { auth: 'admintoken', body: { ansattId: 'A3' } });
  sjekk('Mangler telefon flagges', r._body.manglerTelefon === true);
  r = await kall(flateAdmin, 'POST', { auth: 'admintoken', body: { ansattId: 'A2' } });
  sjekk('Arkivert ansatt avvises', r._kode === 409);
  r = await kall(flateAdmin, 'GET', { auth: 'admintoken' });
  sjekk('Status per ansatt uten å avsløre tokens', r._body.perAnsatt.A1 && r._body.perAnsatt.A1.harLenke && !JSON.stringify(r._body).includes(token));
}

console.log('\n-- Testkrav 3: 4-siffer-verifisering med sperre etter 5 --');
{
  let r = await kall(flate, 'GET', { query: { token } });
  sjekk('Før verifisering: maaVerifisere + kun fornavn', r._kode === 200 && r._body.maaVerifisere && r._body.fornavn === 'Tomas' && !r._body.prosjekter);
  for (let i = 1; i <= 4; i++) {
    r = await kall(flate, 'POST', { body: { token, handling: 'verifiser', siffer: '0000' } });
    sjekk(`Feil siffer ${i}: 401 med ${5 - i} igjen`, r._kode === 401 && r._body.igjen === 5 - i);
  }
  r = await kall(flate, 'POST', { body: { token, handling: 'verifiser', siffer: '0000' } });
  sjekk('Femte feil: sperret (423)', r._kode === 423 && r._body.sperret);
  r = await kall(flate, 'GET', { query: { token } });
  sjekk('Sperret lenke gir sperret-melding også på GET', r._kode === 423);
  // Regenerer → gammel død, ny fungerer (testkrav 2)
  r = await kall(flateAdmin, 'POST', { auth: 'admintoken', body: { ansattId: 'A1' } });
  sjekk('Regenerering markert', r._body.regenerert === true);
  const gammelToken = token;
  token = r._body.url.split('/ks/')[1];
  r = await kall(flate, 'GET', { query: { token: gammelToken } });
  sjekk('Testkrav 2: gammel lenke er utløpt', r._kode === 404 && r._body.utlopt);
  r = await kall(flate, 'POST', { body: { token, handling: 'verifiser', siffer: '4567' } });
  sjekk('Riktige 4 siffer (fra +47 912 34 567) verifiserer', r._kode === 200 && r._body.verifisert);
}

console.log('\n-- Testkrav 1 + 6: ser KUN egne prosjekter/sjekklister, aldri kundedata --');
{
  const r = await kall(flate, 'GET', { query: { token } });
  sjekk('Flaten åpner etter verifisering', r._kode === 200 && r._body.fornavn === 'Tomas');
  const p = r._body.prosjekter;
  sjekk('Kun aktive egne prosjekter (P1, ikke utløpt P3 eller andres P2)', p.length === 1 && p[0].id === 'P1');
  sjekk('Kun egne sjekklister (SL1 + levert SL4, ikke Andres SL2)', p[0].sjekklister.map(s => s.id).sort().join(',') === 'SL1,SL4');
  const tekst = JSON.stringify(r._body);
  sjekk('Aldri kundenavn/beløp/interne felter i svaret', !tekst.includes('HEMMELIG') && !tekst.includes('999999') && !tekst.includes('hemmeligAIFelt'));
  sjekk('Levert liste er merket levert', p[0].sjekklister.find(s => s.id === 'SL4').levert === true);
  const ugyldig = await kall(flate, 'GET', { query: { token: 'a'.repeat(48) } });
  sjekk('Ukjent token → utløpt-svar (ingen probing)', ugyldig._kode === 404 && ugyldig._body.utlopt);
}

console.log('\n-- Utfylling: lagres på sjekklisten + historikk; låst når levert --');
{
  let r = await kall(flate, 'POST', { body: { token, handling: 'punkt', sjekklisteId: 'SL1', punktId: 'p1', status: 'ok', kommentar: 'Sjekket i dag' } });
  sjekk('Kvittering OK lagres', r._kode === 200 && r._body.punkt.status === 'ok' && r._body.punkt.utfort_av === 'Tomas Snekker' && r._body.sjekklisteStatus === 'pagar');
  const lagret = JSON.parse(store.get('fbs_ks_sjekklister')).find(s => s.id === 'SL1');
  sjekk('Skrevet til fbs_ks_sjekklister med status/kommentar', lagret.punkter[0].status === 'ok' && lagret.punkter[0].kommentar === 'Sjekket i dag' && lagret.status === 'pagar');
  r = await kall(flate, 'POST', { body: { token, handling: 'punkt', sjekklisteId: 'SL1', punktId: 'p2', status: 'ikke-aktuelt' } });
  sjekk('Ikke aktuelt + alle punkter avklart → ferdig', r._kode === 200 && r._body.sjekklisteStatus === 'ferdig');
  r = await kall(flate, 'POST', { body: { token, handling: 'punkt', sjekklisteId: 'SL1', punktId: 'p1', status: '' } });
  sjekk('Angre kvittering nullstiller utført-felter', r._kode === 200 && r._body.punkt.status === '' && r._body.punkt.utfort_av === null);
  r = await kall(flate, 'POST', { body: { token, handling: 'punkt', sjekklisteId: 'SL2', punktId: 'x', status: 'ok' } });
  sjekk('Andres sjekkliste avvises (403)', r._kode === 403);
  r = await kall(flate, 'POST', { body: { token, handling: 'punkt', sjekklisteId: 'SL4', punktId: 'z', status: '' } });
  sjekk('Levert/signert liste er låst (409)', r._kode === 409 && r._body.laast);
  r = await kall(flate, 'POST', { body: { token, handling: 'punkt', sjekklisteId: 'SL1', punktId: 'p1', status: 'avvik' } });
  sjekk('Avvik-status avvises fra ansattflaten i PR1', r._kode === 400);
  const hist = JSON.parse(store.get('fbs_ks_utfylling_historikk'));
  sjekk('Historikk logget per handling (3 innslag, kilde ansattflate)', hist.length === 3 && hist.every(h => h.kilde === 'ansattflate' && h.ansattId === 'A1'));
  sjekk('Antall sjekklister uendret (4)', JSON.parse(store.get('fbs_ks_sjekklister')).length === 4);
}

server.close();
console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil > 0 ? 1 : 0);
