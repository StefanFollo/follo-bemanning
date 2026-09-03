// Test av framdrift-eksporten til kundeportalen (SPEC-kundeportal.md fase 3,
// postkasse-oppdrag 6). Kjør: node tests/test-framdrift-eksport.mjs
import http from 'http';
import {
  byggFramdriftPayload, payloadHash, periodeTekstForFase, tilbudIdForProsjekt, mandagIUke, isoUke,
} from '../src/framdriftEksport.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}

const befaringer = [{ id: 'B1', tilbudId: 1787044631506, kontaktNavn: 'HEMMELIG KUNDE' }];
const prosjekt = {
  id: 'P1', navn: 'Lindemansveien 59', befaringId: 'B1',
  fdStartWeek: 40, fdStartYear: 2026, fdTotalWeeks: 20,
  fdTasks: [
    { id: 'f1', name: 'Grunnarbeid', start: 0, dur: 5, pct: 100, fag: 'graving' },
    { id: 'f2', name: 'Råbygg', start: 5, dur: 10, pct: 40, fag: 'tomrer' },
    { id: 'f3', name: 'Tett hus', start: 10, dur: 10, pct: 0, fag: 'tomrer' },
    { id: 'f4', name: 'Innredning — Knut venter på rørlegger', start: 60, dur: 15, pct: 0, fag: 'tomrer' },
  ],
};

console.log('\n-- Payload: hvitliste, status-avledning, kobling --');
{
  const p = byggFramdriftPayload(prosjekt, befaringer, { iDag: '2026-10-14', naa: '2026-10-14T07:00:00Z' });
  sjekk('tilbudId via prosjekt.befaringId → befaring.tilbudId', p.tilbudId === 1787044631506);
  sjekk('4 milepæler med KUN kontraktsfeltene', p.framdrift.milepaler.length === 4
    && p.framdrift.milepaler.every(m => JSON.stringify(Object.keys(m).sort()) === '["ferdigDato","periodeTekst","status","tittel"]'));
  sjekk('ALDRI fag/pct/navn-nøkler eller kundedata i payloaden', !JSON.stringify(p).match(/"(fag|pct|navn|kontaktNavn|timer)"/) && !JSON.stringify(p).includes('HEMMELIG'));
  const [f1, f2, f3, f4] = p.framdrift.milepaler;
  sjekk('pct 100 → ferdig', f1.status === 'ferdig' && f1.tittel === 'Grunnarbeid');
  sjekk('pct 40 → pagar', f2.status === 'pagar');
  sjekk('pct 0 men perioden inneholder i dag → pagar', f3.status === 'pagar', f3.periodeTekst);
  sjekk('pct 0 fram i tid → kommer', f4.status === 'kommer');
  sjekk('ferdigDato er null (spores ikke ennå)', p.framdrift.milepaler.every(m => m.ferdigDato === null));
  sjekk('oppdatert = injisert tidsstempel', p.framdrift.oppdatert === '2026-10-14T07:00:00Z');
  // Fritekst-tittel med personnavn passerer teknisk — derfor opt-in + forhåndsvisning i UI
  sjekk('Tittel sendes som PL skrev den (opt-in-vernet ligger i UI/endepunkt)', f4.tittel.includes('Knut'));
}

console.log('\n-- periodeTekst: uker, spenn og årsskifte --');
{
  sjekk('Én uke → «uke 40»', periodeTekstForFase(40, 2026, 0, 5) === 'uke 40');
  sjekk('Spenn → «uke 41–42»', periodeTekstForFase(40, 2026, 5, 10) === 'uke 41–42');
  sjekk('Årsskifte → med årstall (2026 har 53 ISO-uker)', periodeTekstForFase(40, 2026, 60, 15) === 'uke 52/2026–uke 1/2027', periodeTekstForFase(40, 2026, 60, 15));
  sjekk('mandagIUke/isoUke er konsistente', (() => { const m = mandagIUke(1, 2027); const u = isoUke(m); return u.uke === 1 && u.aar === 2027; })());
}

console.log('\n-- Manglende grunnlag → null --');
{
  sjekk('Uten befaringId', byggFramdriftPayload({ ...prosjekt, befaringId: null }, befaringer) === null);
  sjekk('Befaring uten tilbudId', byggFramdriftPayload(prosjekt, [{ id: 'B1' }]) === null);
  sjekk('Uten fdTasks', byggFramdriftPayload({ ...prosjekt, fdTasks: [] }, befaringer) === null);
  sjekk('tilbudIdForProsjekt-hjelperen', tilbudIdForProsjekt(prosjekt, befaringer) === 1787044631506 && tilbudIdForProsjekt({}, befaringer) === null);
}

console.log('\n-- Hash: pct-kryp under 100 % koalesceres, statusskifte sender --');
{
  const a = payloadHash(byggFramdriftPayload(prosjekt, befaringer, { iDag: '2026-10-14', naa: 'T1' }));
  const b = payloadHash(byggFramdriftPayload({ ...prosjekt, fdTasks: prosjekt.fdTasks.map(t => t.id === 'f2' ? { ...t, pct: 60 } : t) }, befaringer, { iDag: '2026-10-14', naa: 'T2' }));
  const c = payloadHash(byggFramdriftPayload({ ...prosjekt, fdTasks: prosjekt.fdTasks.map(t => t.id === 'f2' ? { ...t, pct: 100 } : t) }, befaringer, { iDag: '2026-10-14', naa: 'T3' }));
  sjekk('40 % → 60 % gir samme hash (ingen sending)', a === b);
  sjekk('→ 100 % gir ny hash (milepæl fullført sendes)', a !== c);
}

// ── Endepunktet mot fake Upstash + fake tilbuds-app ──────────────────
const store = new Map();
function kjorKommando(cmd) {
  const [op, ...args] = cmd;
  const OP = String(op).toUpperCase();
  if (OP === 'GET') return store.has(args[0]) ? store.get(args[0]) : null;
  if (OP === 'SET') { store.set(args[0], String(args[1])); return 'OK'; }
  throw new Error('Ustøttet: ' + OP);
}
let tilbudsAppSvar = { status: 404, body: { error: 'Not found' } }; // stub-perioden
const mottatt = [];
const server = http.createServer((req, res) => {
  if (String(req.url).startsWith('/api/befaringer/framdrift')) {
    let b = '';
    req.on('data', c => { b += c; });
    req.on('end', () => {
      mottatt.push({ auth: req.headers.authorization, body: JSON.parse(b) });
      res.writeHead(tilbudsAppSvar.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tilbudsAppSvar.body));
    });
    return;
  }
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const vilHaBase64 = (req.headers['upstash-encoding'] || '').includes('base64');
    const kod = v => (vilHaBase64 && typeof v === 'string') ? Buffer.from(v, 'utf8').toString('base64') : v;
    const parsed = JSON.parse(body);
    const svar = Array.isArray(parsed) && Array.isArray(parsed[0]) ? parsed.map(cmd => ({ result: kod(kjorKommando(cmd)) })) : { result: kod(kjorKommando(parsed)) };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(svar));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
process.env.KV_REST_API_URL = `http://127.0.0.1:${server.address().port}`;
process.env.KV_REST_API_TOKEN = 'test';
process.env.TILBUDSAPP_URL = `http://127.0.0.1:${server.address().port}`;
process.env.INTER_APP_TOKEN = 'inter-test';
const { default: handler } = await import('../api/prosjekter/framdrift-eksport.js');

store.set('fbs_state', JSON.stringify({ prosjekter: [prosjekt, { ...prosjekt, id: 'P2', framdriftDeltMedKunde: true }], befaringer }));
store.set('fbs_session:admintoken', JSON.stringify({ email: 's@x.no', role: 'admin', navn: 'Stefan' }));
store.set('fbs_session:pltoken', JSON.stringify({ email: 'p@x.no', role: 'befaring', navn: 'PL' }));

function fakeRes() { return { _kode: null, _body: null, setHeader() {}, status(k) { this._kode = k; return this; }, json(b) { this._body = b; return this; }, end() { return this; } }; }
async function kall(method, auth, prosjektId, torr) {
  const req = { method, headers: { authorization: 'Bearer ' + auth }, body: { prosjektId }, query: torr ? { prosjektId, torr: '1' } : {} };
  const res = fakeRes(); await handler(req, res); return res;
}

console.log('\n-- /api/prosjekter/framdrift-eksport --');
{
  let r = await kall('POST', 'feil', 'P1');
  sjekk('401 uten gyldig sesjon', r._kode === 401);
  r = await kall('POST', 'pltoken', 'P1');
  sjekk('401 for PL-rollen (kun admin/kontor)', r._kode === 401);
  r = await kall('POST', 'admintoken', 'P1');
  sjekk('🛑 Uten delings-flagg: INGEN sending', r._kode === 200 && r._body.ikkeDelt === true && mottatt.length === 0);
  r = await kall('GET', 'admintoken', 'P1', true);
  sjekk('Tørrkjøring viser payload uansett flagg, sender ikke', r._kode === 200 && r._body.torr && r._body.delt === false && r._body.payload.framdrift.milepaler.length === 4 && mottatt.length === 0);
  // Delt prosjekt, men tilbuds-appens endepunkt finnes ikke ennå (stub-perioden)
  r = await kall('POST', 'admintoken', 'P2');
  sjekk('Stub-perioden: 404 hos tilbuds-appen → ok:false, ingen krasj', r._kode === 200 && r._body.ok === false && r._body.httpStatus === 404 && mottatt.length === 1);
  sjekk('Kallet bar inter-app-token og kontraktspayload', mottatt[0].auth === 'Bearer inter-test' && mottatt[0].body.tilbudId === 1787044631506 && mottatt[0].body.framdrift.milepaler.length === 4);
  // Mottaket kommer på plass → sending lykkes og merkes
  tilbudsAppSvar = { status: 200, body: { ok: true } };
  r = await kall('POST', 'admintoken', 'P2');
  sjekk('Vellykket sending når mottaket finnes', r._kode === 200 && r._body.sendt === true && mottatt.length === 2);
  r = await kall('POST', 'admintoken', 'P2');
  sjekk('Samme innhold → uendret, ingen ny sending (dedup)', r._kode === 200 && r._body.uendret === true && mottatt.length === 2);
  // Milepæl fullført → ny hash → sending
  const st = JSON.parse(store.get('fbs_state'));
  st.prosjekter = st.prosjekter.map(p => p.id === 'P2' ? { ...p, fdTasks: p.fdTasks.map(t => t.id === 'f2' ? { ...t, pct: 100 } : t) } : p);
  store.set('fbs_state', JSON.stringify(st));
  r = await kall('POST', 'admintoken', 'P2');
  sjekk('Milepæl fullført → sendes på nytt', r._body.sendt === true && mottatt.length === 3 && mottatt[2].body.framdrift.milepaler[1].status === 'ferdig');
  sjekk('fbs_state urørt av eksporten (leser kun)', JSON.parse(store.get('fbs_state')).prosjekter.length === 2);
}

server.close();
console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil > 0 ? 1 : 0);
