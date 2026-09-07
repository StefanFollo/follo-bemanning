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
const blobKall = [];
const server = http.createServer((req, res) => {
  if (String(req.url).startsWith('/blob/')) {
    const u2 = new URL(req.url, 'http://x');
    const pathname = decodeURIComponent(u2.pathname.slice('/blob/'.length)) || u2.searchParams.get('pathname') || '';
    let n = 0;
    req.on('data', c => { n += c.length; });
    req.on('end', () => {
      blobKall.push({ pathname, size: n });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: 'https://blob.example/' + pathname, downloadUrl: 'https://blob.example/' + pathname, pathname, contentType: 'image/jpeg', contentDisposition: 'inline' }));
    });
    return;
  }
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
process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_AbC123dEf456GhI7_x0x0x0x0x0x0x0x0x0x0x0x0x0';
process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${server.address().port}/blob`;
// PR3: SMS går via tilbuds-appens /api/sms-interapp (ikke Twilio direkte)
process.env.TILBUDSAPP_URL = 'http://tilbudsapp.fake';
process.env.INTER_APP_TOKEN = 'inter-test';
// Fang inter-app-SMS-kall — Blob går til fake-serveren via VERCEL_BLOB_API_URL
const smsKall = [];
let smsInterappSvar = { status: 200, body: { ok: true } };
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/api/sms-interapp')) {
    smsKall.push({ url: u, body: JSON.parse(String(opts.body)), auth: opts.headers.Authorization });
    return new Response(JSON.stringify(smsInterappSvar.body), { status: smsInterappSvar.status, headers: { 'Content-Type': 'application/json' } });
  }
  return origFetch(url, opts);
};
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
// Oppdrag 11G: flate-kall bærer enhets-ID — testene bruker 'E1' som standard
// enhet; tester for enhetsbinding sender egen enhet eksplisitt.
async function kall(handler, method, { auth, body, query, ip } = {}) {
  const q = { ...(query || {}) };
  const b = { ...(body || {}) };
  if (handler === flate) {
    if (method === 'GET' && q.enhet === undefined) q.enhet = 'E1';
    if (method === 'POST' && b.enhet === undefined) b.enhet = 'E1';
  }
  const req = { method, headers: { ...(auth ? { authorization: 'Bearer ' + auth } : {}), 'x-real-ip': ip || ('10.0.0.' + (++ipTeller % 200)) }, body: b, query: q };
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
  // Oppdrag 11F endret dette: P2 vises OGSÅ fordi SL3 er tildelt Tomas på
  // NAVN der (union bemannet ∪ navnetildelt). Utløpt P3 vises fortsatt ikke.
  sjekk('Union: bemannet P1 + navnetildelt P2, aldri utløpt P3', p.map(x => x.id).sort().join(',') === 'P1,P2');
  const p1 = p.find(x => x.id === 'P1');
  sjekk('Kun egne sjekklister (SL1 + levert SL4, ikke Andres SL2)', p1.sjekklister.map(s => s.id).sort().join(',') === 'SL1,SL4');
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

console.log('\n-- PR2: bilde per punkt → Vercel Blob (testkrav 5/7 server-side) --');
{
  const pikselJpeg = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes-etter-klientkomprimering').toString('base64');
  let r = await kall(flate, 'POST', { body: { token, handling: 'bilde', sjekklisteId: 'SL1', punktId: 'p1', bildeData: pikselJpeg } });
  sjekk('Bilde lastes opp og festes på punktet', r._kode === 200 && r._body.punkt.bilder.length === 1 && r._body.punkt.bilder[0].url.startsWith('https://blob.example/ks-bilder/P1/SL1/flate-') && r._body.punkt.bilder[0].av === 'Tomas Snekker', JSON.stringify(r._body));
  sjekk('Blob-kall gikk til riktig sti', blobKall.length === 1 && blobKall[0].pathname.includes('ks-bilder/P1/SL1/flate-') && blobKall[0].size > 10);
  const lagretB = JSON.parse(store.get('fbs_ks_sjekklister')).find(s => s.id === 'SL1');
  sjekk('Bildet lagret på sjekklisten (PL ser det — testkrav 5)', lagretB.punkter[0].bilder.length === 1);
  r = await kall(flate, 'POST', { body: { token, handling: 'bilde', sjekklisteId: 'SL1', punktId: 'p1', bildeData: 'ikke-en-dataurl' } });
  sjekk('Ugyldig bildeData avvises', r._kode === 400);
  r = await kall(flate, 'POST', { body: { token, handling: 'bilde', sjekklisteId: 'SL2', punktId: 'x', bildeData: pikselJpeg } });
  sjekk('Bilde på andres liste avvises', r._kode === 403 && blobKall.length === 1);
  const histB = JSON.parse(store.get('fbs_ks_utfylling_historikk'));
  sjekk('Bilde logget i historikk', histB.some(h => h.handling === 'bilde' && h.bildeUrl));
}

console.log('\n-- PR2: «Signer og lever» låser lista (testkrav 5) --');
{
  // SL1: p1 er nullstilt fra tidligere test — lever skal avvises
  let r = await kall(flate, 'POST', { body: { token, handling: 'lever', sjekklisteId: 'SL1', navn: 'Tomas Snekker' } });
  sjekk('Lever med uavklarte punkter avvises', r._kode === 400 && r._body.uavklarte >= 1);
  await kall(flate, 'POST', { body: { token, handling: 'punkt', sjekklisteId: 'SL1', punktId: 'p1', status: 'ok' } });
  r = await kall(flate, 'POST', { body: { token, handling: 'lever', sjekklisteId: 'SL1' } });
  sjekk('Lever uten navn bruker ansattnavnet + låser', r._kode === 200 && r._body.signert_av === 'Tomas Snekker' && r._body.signert_dato);
  const lev = JSON.parse(store.get('fbs_ks_sjekklister')).find(s => s.id === 'SL1');
  sjekk('Lagret: signert_av/dato + levert_dato + status ferdig', lev.signert_av === 'Tomas Snekker' && lev.levert_dato && lev.status === 'ferdig');
  r = await kall(flate, 'POST', { body: { token, handling: 'punkt', sjekklisteId: 'SL1', punktId: 'p1', status: '' } });
  sjekk('Levert liste er låst for videre endring (testkrav 5)', r._kode === 409 && r._body.laast);
  r = await kall(flate, 'GET', { query: { token } });
  sjekk('Flaten viser lista som levert', r._body.prosjekter[0].sjekklister.find(s => s.id === 'SL1').levert === true);
  const histL = JSON.parse(store.get('fbs_ks_utfylling_historikk'));
  sjekk('Levering logget', histL.some(h => h.handling === 'levert' && h.signertAv === 'Tomas Snekker'));
}

console.log('\n-- PR2/PR3: SMS-utsending (via tilbuds-appens sms-interapp) + gjenbruk --');
{
  // regenerer:false gjenbruker eksisterende (verifisert) token
  let r = await kall(flateAdmin, 'POST', { auth: 'admintoken', body: { ansattId: 'A1', regenerer: false, sendSms: true } });
  sjekk('Gjenbruk: samme lenke, ikke regenerert', r._kode === 200 && r._body.gjenbrukt === true && r._body.url.endsWith('/ks/' + token));
  sjekk('SMS sendt via inter-app-endepunktet', r._body.sms && r._body.sms.sendt === true && smsKall.length === 1);
  const sk = smsKall[0];
  sjekk('sms-interapp-kall: Bearer-token, normalisert nummer, lenke og formaal',
    sk.url === 'http://tilbudsapp.fake/api/sms-interapp' && sk.auth === 'Bearer inter-test'
    && sk.body.til === '+4791234567' && sk.body.tekst.includes('/ks/' + token) && sk.body.formaal === 'ks-lenke');
  r = await kall(flateAdmin, 'GET', { auth: 'admintoken' });
  sjekk('Status viser sendtDato', !!r._body.perAnsatt.A1.sendtDato);
  // Token fortsatt verifisert (gjenbruk nullstiller ikke)
  r = await kall(flate, 'GET', { query: { token } });
  sjekk('Gjenbrukt lenke er fortsatt verifisert', r._kode === 200 && !r._body.maaVerifisere);
  // Endepunktet ikke utrullet ennå (404) → ikkeKlar, ALDRI stille feil
  smsInterappSvar = { status: 404, body: { error: 'Not found' } };
  r = await kall(flateAdmin, 'POST', { auth: 'admintoken', body: { ansattId: 'A1', regenerer: false, sendSms: true } });
  sjekk('404 fra sms-interapp → ikkeKlar:true, ingen krasj', r._kode === 200 && r._body.sms.ikkeKlar === true && !r._body.sms.sendt);
  smsInterappSvar = { status: 200, body: { ok: true } };
  // Uten INTER_APP_TOKEN: skipped, ikke feil
  const it = process.env.INTER_APP_TOKEN; delete process.env.INTER_APP_TOKEN;
  r = await kall(flateAdmin, 'POST', { auth: 'admintoken', body: { ansattId: 'A1', regenerer: false, sendSms: true } });
  sjekk('Uten INTER_APP_TOKEN: hoppet over, ingen krasj', r._kode === 200 && r._body.sms.hoppet === true);
  process.env.INTER_APP_TOKEN = it;
  // regenerer:true (standard) lager fortsatt ny
  r = await kall(flateAdmin, 'POST', { auth: 'admintoken', body: { ansattId: 'A1' } });
  sjekk('Standard regenererer fortsatt (PR1-oppførsel)', r._body.regenerert === true && !r._body.url.endsWith('/ks/' + token));
}

console.log('\n-- PR3: HMS-rutiner i flate-svaret --');
{
  // Uten flagg-liste i state: tom array (feltet fantes ikke før PR3)
  const nyToken = Object.keys(JSON.parse(store.get('fbs_ks_flate_tokens'))).find(t => JSON.parse(store.get('fbs_ks_flate_tokens'))[t].ansattId === 'A1');
  // Ny lenke fra forrige test er uverifisert — verifiser med A1s 4 siste siffer
  await kall(flate, 'POST', { body: { token: nyToken, handling: 'verifiser', siffer: '4567' } });
  let r = await kall(flate, 'GET', { query: { token: nyToken } });
  sjekk('Uten rutinerForAnsatte i state → tom hmsRutiner-liste', r._kode === 200 && Array.isArray(r._body.hmsRutiner) && r._body.hmsRutiner.length === 0);
  // Med flaggede rutiner: IDene følger med flate-svaret
  const st = JSON.parse(store.get('fbs_state'));
  st.rutinerForAnsatte = ['rut-001', 'rut-042', 'rut-117'];
  store.set('fbs_state', JSON.stringify(st));
  r = await kall(flate, 'GET', { query: { token: nyToken } });
  sjekk('Flaggede rutine-IDer leveres til flaten', JSON.stringify(r._body.hmsRutiner) === '["rut-001","rut-042","rut-117"]');
  sjekk('Flate-svaret lekker fortsatt ingen kundedata', !JSON.stringify(r._body).includes('HEMMELIG'));
}

console.log('\n-- Oppdrag 11A: framdrift + PL i flate-svaret --');
const gyldigToken = Object.keys(JSON.parse(store.get('fbs_ks_flate_tokens'))).find(t => JSON.parse(store.get('fbs_ks_flate_tokens'))[t].ansattId === 'A1');
{
  const st = JSON.parse(store.get('fbs_state'));
  st.ansatte.push({ id: 'PL1', navn: 'Petter Prosjektleder', telefon: '911 22 333' });
  st.prosjekter = st.prosjekter.map(p => p.id === 'P1' ? {
    ...p, adresse: 'Lindemansveien 59, Oslo', startDato: '2026-09-07', sluttDato: '2026-12-18',
    prosjektlederId: 'PL1', fdStartWeek: 37, fdStartYear: 2026,
    fdTasks: [
      { id: 'f1', name: 'Riving', start: 0, dur: 5, pct: 100, fag: 'tomrer' },
      { id: 'f2', name: 'Oppbygging', start: 5, dur: 10, pct: 30, fag: 'tomrer' },
    ],
  } : p);
  store.set('fbs_state', JSON.stringify(st));
  const r = await kall(flate, 'GET', { query: { token: gyldigToken } });
  const p1 = r._body.prosjekter.find(p => p.id === 'P1');
  sjekk('Prosjektet bærer adresse/datoer/PL', p1.adresse.includes('Lindemansveien') && p1.startDato === '2026-09-07' && p1.pl.navn === 'Petter Prosjektleder' && p1.pl.telefon === '911 22 333');
  sjekk('Framdrift: faser med tittel/status/periodeTekst/pagarNa', Array.isArray(p1.framdrift) && p1.framdrift.length === 2
    && p1.framdrift[0].tittel === 'Riving' && p1.framdrift[0].status === 'ferdig'
    && /^uke /.test(p1.framdrift[0].periodeTekst) && typeof p1.framdrift[0].pagarNa === 'boolean');
  sjekk('Framdrift lekker ALDRI pct/fag/timer', !JSON.stringify(p1.framdrift).match(/"(pct|fag|timer|belop)"/));
  // Prosjekt uten faser → framdrift null (ikke tom side i flaten)
  sjekk('Uten faser → framdrift null', r._body.prosjekter.every(p => p.id === 'P1' || p.framdrift === null));
  // Faser men verken startuke eller startdato → gantt-fallbacken (dagens uke),
  // slik at flaten viser det samme som PL-ens gantt
  const st3 = JSON.parse(store.get('fbs_state'));
  st3.prosjekter = st3.prosjekter.map(p => p.id === 'P1' ? { ...p, fdStartWeek: undefined, fdStartYear: undefined, startDato: '' } : p);
  store.set('fbs_state', JSON.stringify(st3));
  const r2 = await kall(flate, 'GET', { query: { token: gyldigToken } });
  const p1b = r2._body.prosjekter.find(p => p.id === 'P1');
  sjekk('Uten startuke/startdato → faser fra dagens uke (gantt-fallback)', Array.isArray(p1b.framdrift) && p1b.framdrift.length === 2 && /^uke \d+/.test(p1b.framdrift[0].periodeTekst));
  store.set('fbs_state', JSON.stringify(st));
}

console.log('\n-- Oppdrag 11E (presisert): «Din uke» + «Mitt lag» med personvern-vern --');
{
  const st = JSON.parse(store.get('fbs_state'));
  const iDagIso = new Date().toISOString().slice(0, 10);
  const om14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const for7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  st.ansatte.push({ id: 'A4', navn: 'Kollega Sykmeldt', fag: 'Tømrer', telefon: '922 33 444', sykmeldt: true, sykmeldtTil: om14, epost: 'kollega@follo.no' });
  st.ansatte.push({ id: 'A5', navn: 'Annen Prosjektmann', fag: 'Murer', telefon: '933 44 555' });
  st.tildelinger = [
    { id: 't1', ansattId: 'A1', prosjektId: 'P1', startDato: for7, sluttDato: om14 },
    { id: 't2', ansattId: 'A4', prosjektId: 'P1', startDato: for7, sluttDato: om14 },   // lag-kollega
    { id: 't5', ansattId: 'A5', prosjektId: 'P2', startDato: for7, sluttDato: om14 },   // ANNET prosjekt — skal ALDRI vises
    { id: 't3', ansattId: 'A4', prosjektId: '__FERIE__', startDato: iDagIso, sluttDato: om14 }, // andres ferie: utelates
    { id: 't4', ansattId: 'A1', prosjektId: '__FERIE__', startDato: iDagIso, sluttDato: iDagIso }, // egen ferie: vises
  ];
  store.set('fbs_state', JSON.stringify(st));
  const r = await kall(flate, 'GET', { query: { token: gyldigToken, dinUke: '1' } });
  const d = r._body.dinUke;
  sjekk('Din uke: 21 dager (denne + 2 neste uker)', r._kode === 200 && d.dager.length === 21);
  const medOppdrag = d.dager.filter(x => x.oppdrag.length);
  sjekk('Oppdrag bærer prosjekt/adresse/PL med telefon', medOppdrag.length > 0
    && medOppdrag[0].oppdrag[0].prosjekt.includes('Lindemansveien')
    && medOppdrag[0].oppdrag[0].plNavn === 'Petter Prosjektleder' && medOppdrag[0].oppdrag[0].plTelefon === '911 22 333');
  sjekk('«Mitt lag»: kollega på SAMME prosjekt med navn + fag', medOppdrag[0].oppdrag[0].lag.some(k => k.navn === 'Kollega Sykmeldt' && k.fag === 'Tømrer'));
  const raa = JSON.stringify(d);
  sjekk('🛑 ALDRI folk fra andre prosjekter', !raa.includes('Annen Prosjektmann'));
  sjekk('🛑 ALDRI sykmelding/kontaktinfo om andre', !raa.includes('sykmeldt') && !raa.includes('922') && !raa.includes('933') && !raa.includes('kollega@follo.no'));
  sjekk('Egen ferie-dag markert', d.dager.some(x => x.egenFerie === true));
  sjekk('Andres ferie finnes ikke i svaret', !raa.includes('__FERIE__'));
}

console.log('\n-- Oppdrag 11G: enhetsbundet 4-siffer-bekreftelse --');
{
  // Samme lenke på NY enhet → maaVerifisere; etter verifisering på ny enhet → inne
  let r = await kall(flate, 'GET', { query: { token: gyldigToken, enhet: 'NY-TELEFON' } });
  sjekk('Ny enhet → må bekrefte på nytt', r._kode === 200 && r._body.maaVerifisere === true);
  r = await kall(flate, 'POST', { body: { token: gyldigToken, enhet: 'NY-TELEFON', handling: 'verifiser', siffer: '4567' } });
  sjekk('4 siffer på ny enhet godtas', r._kode === 200 && r._body.verifisert === true);
  r = await kall(flate, 'GET', { query: { token: gyldigToken, enhet: 'NY-TELEFON' } });
  sjekk('Ny enhet er nå inne', r._kode === 200 && Array.isArray(r._body.prosjekter));
  r = await kall(flate, 'POST', { body: { token: gyldigToken, enhet: 'UVERIFISERT', handling: 'punkt', sjekklisteId: 'SL1', punktId: 'p1', status: 'ok' } });
  sjekk('Skriving fra uverifisert enhet avvises', r._kode === 401 && r._body.maaVerifisere === true);
}

console.log('\n-- Oppdrag 11F: forhåndsvisning + union-prosjektliste --');
{
  let r = await kall(flate, 'GET', { auth: 'admintoken', query: { somAnsatt: 'A1' } });
  sjekk('Admin kan forhåndsvise flaten som A1', r._kode === 200 && r._body.forhandsvisning === true && Array.isArray(r._body.prosjekter) && r._body.navn === 'Tomas Snekker');
  r = await kall(flate, 'GET', { auth: 'pltoken', query: { somAnsatt: 'A1' } });
  sjekk('Befaring-rollen kan IKKE forhåndsvise', r._kode === 401);
  r = await kall(flate, 'GET', { query: { somAnsatt: 'A1' } });
  sjekk('Uten sesjon: 401', r._kode === 401);
  // Union: A5 er IKKE bemannet på P1, men får sjekkliste tildelt på navn → P1 vises
  const sjekklister = JSON.parse(store.get('fbs_ks_sjekklister'));
  sjekklister.push({ id: 'SL9', prosjektId: 'P1', navn: 'Navnetildelt liste', ansvarlig: ['Annen Prosjektmann'], punkter: [{ id: 'q', tekst: 'Q', status: '' }] });
  store.set('fbs_ks_sjekklister', JSON.stringify(sjekklister));
  r = await kall(flate, 'GET', { auth: 'admintoken', query: { somAnsatt: 'A5' } });
  sjekk('Union: liste tildelt på NAVN gir prosjektet i flaten uansett bemanning',
    r._body.prosjekter.some(p => p.id === 'P1' && p.sjekklister.some(sl => sl.id === 'SL9' && sl.min === true)));
}

console.log('\n-- Oppdrag 11H: anleggsleder-modus --');
{
  const st = JSON.parse(store.get('fbs_state'));
  st.ansatte = st.ansatte.map(a => a.id === 'A1' ? { ...a, fag: 'Anleggsleder' } : a);
  store.set('fbs_state', JSON.stringify(st));
  let r = await kall(flate, 'GET', { query: { token: gyldigToken } });
  sjekk('AL-flagg + lag i flate-svaret', r._body.erAnleggsleder === true
    && r._body.prosjekter.find(p => p.id === 'P1').lag.some(a => a.navn === 'Kollega Sykmeldt' && a.fag === 'Tømrer'));
  const p1 = r._body.prosjekter.find(p => p.id === 'P1');
  const fase = p1.framdrift[1];
  r = await kall(flate, 'POST', { body: { token: gyldigToken, handling: 'fase-tildel', prosjektId: 'P1', faseId: fase.id, ansattIds: ['A4', 'A5'] } });
  sjekk('Fase-tildeling: kun laget godtas (A5 er på annet prosjekt)', r._kode === 200 && JSON.stringify(r._body.fase.tildelt) === '["A4"]');
  r = await kall(flate, 'POST', { body: { token: gyldigToken, handling: 'fase-tekst', prosjektId: 'P1', faseId: fase.id, tekst: 'Kapp lekter til gavl' } });
  sjekk('Oppgavetekst lagres', r._kode === 200 && r._body.fase.oppgaveTekst === 'Kapp lekter til gavl');
  r = await kall(flate, 'POST', { body: { token: gyldigToken, handling: 'fase-ferdig', prosjektId: 'P1', faseId: fase.id, ferdig: true } });
  sjekk('AL kan markere fasen ferdig', r._kode === 200 && r._body.fase.ferdig === true);
  const st2 = JSON.parse(store.get('fbs_state'));
  const lagretFase = st2.prosjekter.find(p => p.id === 'P1').fdTasks.find(t => t.id === fase.id);
  sjekk('Lagret i fbs_state med _endret-stempel', lagretFase.pct === 100 && lagretFase.oppgaveTekst === 'Kapp lekter til gavl'
    && JSON.stringify(lagretFase.tildelt) === '["A4"]' && st2.prosjekter.find(p => p.id === 'P1')._endret > 0);
  // Vern: vanlig ansatt (ikke AL) avvises
  const st3 = JSON.parse(store.get('fbs_state'));
  st3.ansatte = st3.ansatte.map(a => a.id === 'A1' ? { ...a, fag: 'Tømrer' } : a);
  store.set('fbs_state', JSON.stringify(st3));
  r = await kall(flate, 'POST', { body: { token: gyldigToken, handling: 'fase-tildel', prosjektId: 'P1', faseId: fase.id, ansattIds: [] } });
  sjekk('Uten Anleggsleder-fag: 403', r._kode === 403);
  // Tildelt oppgave vises i «Din uke» hos den tildelte (A4 sett via forhåndsvisning)
  r = await kall(flate, 'GET', { auth: 'admintoken', query: { somAnsatt: 'A4', dinUke: '1' } });
  const harOppgave = r._body.dinUke.dager.some(dg => dg.oppdrag.some(o => (o.oppgaver || []).some(x => x.tekst === 'Kapp lekter til gavl')));
  sjekk('Den tildelte ser oppgaven i «Din uke» når fasen pågår', harOppgave);
  st3.ansatte = st3.ansatte.map(a => a.id === 'A1' ? { ...a, fag: 'Anleggsleder' } : a);
  store.set('fbs_state', JSON.stringify(st3));
}

console.log('\n-- Oppdrag 15: oppgaver under faser --');
{
  // A1 er Anleggsleder igjen (satt på slutten av 11H-blokken) og står på P1
  let r = await kall(flate, 'POST', { body: { token: gyldigToken, handling: 'oppgave-ny', prosjektId: 'P1', faseId: 'f2',
    tekster: ['Kapp lekter til gavl', 'Skru gips nordvegg', '', 'Rydd etter riving'], tildelt: ['A4', 'A5'] } });
  // 3 nye + 1 MIGRERT fra 11H-testens oppgaveTekst («Kapp lekter til gavl»
  // på fasen fra før) — migreringen arver fasens tildelt ['A4']
  sjekk('AL lager 3 oppgaver + gammel oppgaveTekst migreres (4 totalt, kun laget tildeles)', r._kode === 200
    && r._body.oppgaver.length === 4 && r._body.oppgaver.every(o => JSON.stringify(o.tildeltIds) === '["A4"]'));
  const oppgaveId = r._body.oppgaver.find(o => o.tekst === 'Skru gips nordvegg').id;
  sjekk('Fasens tildelt = union av oppgavene', JSON.stringify(r._body.faseTildelt) === '["A4"]');
  // Vanlig ansatt (A4) kan kvittere SIN oppgave — bruk forhåndsvisning? Nei:
  // skrivende kall krever token. Test via A1 som IKKE-AL med egen oppgave:
  const st15 = JSON.parse(store.get('fbs_state'));
  st15.ansatte = st15.ansatte.map(a => a.id === 'A1' ? { ...a, fag: 'Tømrer' } : a);
  store.set('fbs_state', JSON.stringify(st15));
  r = await kall(flate, 'POST', { body: { token: gyldigToken, handling: 'oppgave-ny', prosjektId: 'P1', faseId: 'f2', tekster: ['X'] } });
  sjekk('Ikke-AL kan IKKE lage oppgaver', r._kode === 403);
  r = await kall(flate, 'POST', { body: { token: gyldigToken, handling: 'oppgave-status', prosjektId: 'P1', faseId: 'f2', oppgaveId, ferdig: true } });
  sjekk('Ikke-AL kan ikke kvittere ANDRES oppgave', r._kode === 403);
  // Gi A1 (Tomas) en egen oppgave via AL (A4-fag byttes midlertidig)... enklere:
  // gjør A1 til AL, tildel oppgave til A1 selv, bytt tilbake, kvitter som vanlig ansatt
  st15.ansatte = st15.ansatte.map(a => a.id === 'A1' ? { ...a, fag: 'Anleggsleder' } : a);
  store.set('fbs_state', JSON.stringify(st15));
  r = await kall(flate, 'POST', { body: { token: gyldigToken, handling: 'oppgave-endre', prosjektId: 'P1', faseId: 'f2', oppgaveId, tildelt: ['A1', 'A4'] } });
  sjekk('AL om-tildeler oppgaven (A1 + A4)', r._kode === 200 && r._body.oppgaver.find(o => o.id === oppgaveId).tildeltIds.length === 2);
  const st15b = JSON.parse(store.get('fbs_state'));
  st15b.ansatte = st15b.ansatte.map(a => a.id === 'A1' ? { ...a, fag: 'Tømrer' } : a);
  store.set('fbs_state', JSON.stringify(st15b));
  r = await kall(flate, 'POST', { body: { token: gyldigToken, handling: 'oppgave-status', prosjektId: 'P1', faseId: 'f2', oppgaveId, ferdig: true } });
  sjekk('Ansatt kvitterer EGEN oppgave', r._kode === 200 && r._body.oppgaver.find(o => o.id === oppgaveId).status === 'ferdig');
  const lagretO = JSON.parse(store.get('fbs_state')).prosjekter.find(p => p.id === 'P1').fdTasks.find(t => t.id === 'f2').oppgaver.find(o => o.id === oppgaveId);
  sjekk('Ferdig logget med hvem/når i fbs_state', lagretO.ferdigAv === 'Tomas Snekker' && !!lagretO.ferdigDato);
  // GET: oppgavene følger fasene (min-markering) og «Din uke»
  r = await kall(flate, 'GET', { query: { token: gyldigToken } });
  const fase15 = r._body.prosjekter.find(p => p.id === 'P1').framdrift.find(f => f.id === 'f2');
  sjekk('GET: oppgaveliste med min-markering og fornavn', fase15.oppgaver.length === 4
    && fase15.oppgaver.find(o => o.id === oppgaveId).min === true
    && fase15.oppgaver.find(o => o.id === oppgaveId).tildelt.includes('Tomas'));
  r = await kall(flate, 'GET', { query: { token: gyldigToken, dinUke: '1' } });
  const alleOpp = r._body.dinUke.dager.flatMap(d => d.oppdrag.flatMap(o => o.oppgaver || []));
  sjekk('«Din uke»: egne oppgaver med id-er og status', alleOpp.some(o => o.oppgaveId === oppgaveId && o.status === 'ferdig' && o.prosjektId === 'P1'));
  // Fjernet skjules
  const st15c = JSON.parse(store.get('fbs_state'));
  st15c.ansatte = st15c.ansatte.map(a => a.id === 'A1' ? { ...a, fag: 'Anleggsleder' } : a);
  store.set('fbs_state', JSON.stringify(st15c));
  r = await kall(flate, 'POST', { body: { token: gyldigToken, handling: 'oppgave-endre', prosjektId: 'P1', faseId: 'f2', oppgaveId, fjernet: true } });
  sjekk('Fjernet oppgave skjules (men slettes aldri)', r._kode === 200 && r._body.oppgaver.length === 3
    && JSON.parse(store.get('fbs_state')).prosjekter.find(p => p.id === 'P1').fdTasks.find(t => t.id === 'f2').oppgaver.length === 4);
}

console.log('\n-- Oppdrag 11C: SMS-tekst (1 segment) + rate-grense --');
{
  smsKall.length = 0;
  let r = await kall(flateAdmin, 'POST', { auth: 'admintoken', body: { ansattId: 'A1', regenerer: false, sendSms: true } });
  sjekk('Ny SMS-tekst: sjekklister/framdriftsplaner/HMS-rutiner + 4-siffer-instruks', r._body.sms.sendt === true
    && smsKall[0].body.tekst.includes('sjekklister, framdriftsplaner og HMS-rutiner')
    && smsKall[0].body.tekst.includes('4 siste sifrene'));
  sjekk('SMS-teksten er uten æøå (1 GSM-7-segment)', !/[æøåÆØÅ]/.test(smsKall[0].body.tekst));
  smsInterappSvar = { status: 429, body: { error: 'Grense: 50/dogn' } };
  r = await kall(flateAdmin, 'POST', { auth: 'admintoken', body: { ansattId: 'A1', regenerer: false, sendSms: true } });
  sjekk('429 fra sms-interapp → rateGrense:true', r._kode === 200 && r._body.sms.rateGrense === true && !r._body.sms.sendt);
  smsInterappSvar = { status: 200, body: { ok: true } };
}

globalThis.fetch = origFetch;
server.close();
console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil > 0 ? 1 : 0);
