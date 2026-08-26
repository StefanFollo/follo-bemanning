// Sikkerhetsrunden: rate-limit på forgot-password, 7 d glidende sesjon,
// «Logg ut alle enheter». Kjør: node tests/test-sikkerhet.mjs
import http from 'http';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}

// Fake Upstash med GET/SET(EX)/DEL/INCR/EXPIRE/KEYS + TTL-bokføring
const store = new Map();
const ttls = new Map();
function kjorKommando(cmd) {
  const [op, ...args] = cmd;
  const OP = String(op).toUpperCase();
  if (OP === 'GET') return store.has(args[0]) ? store.get(args[0]) : null;
  if (OP === 'SET') {
    store.set(args[0], String(args[1]));
    const exIdx = args.findIndex(a => String(a).toUpperCase() === 'EX');
    if (exIdx >= 0) ttls.set(args[0], Number(args[exIdx + 1]));
    return 'OK';
  }
  if (OP === 'DEL') { const fantes = store.delete(args[0]); ttls.delete(args[0]); return fantes ? 1 : 0; }
  if (OP === 'INCR') { const v = (Number(store.get(args[0])) || 0) + 1; store.set(args[0], String(v)); return v; }
  if (OP === 'EXPIRE') { if (!store.has(args[0])) return 0; ttls.set(args[0], Number(args[1])); return 1; }
  if (OP === 'KEYS') { const pre = String(args[0]).replace('*', ''); return [...store.keys()].filter(k => k.startsWith(pre)); }
  if (OP === 'EVAL') throw new Error('EVAL ikke i denne testen');
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
process.env.VERCEL_ENV = 'production';
delete process.env.RESEND_API_KEY;
delete process.env.APP_USER; delete process.env.APP_PASS;

const { default: forgot } = await import('../api/forgot-password.js');
const { default: login } = await import('../api/login.js');
const { default: me } = await import('../api/me.js');
const { default: users } = await import('../api/admin/users.js');

function fakeRes() { return { _kode: null, _body: null, setHeader() {}, status(k) { this._kode = k; return this; }, json(b) { this._body = b; return this; }, end() { return this; } }; }
async function kall(handler, method, { auth, body, ip } = {}) {
  const req = { method, headers: { ...(auth ? { authorization: 'Bearer ' + auth } : {}), 'x-real-ip': ip || '1.2.3.4' }, body: body || {}, query: {} };
  const res = fakeRes(); await handler(req, res); return res;
}

// bcryptjs-hash for «Test1234!» lages her så testen ikke hardkoder en hash
const bcrypt = (await import('bcryptjs')).default;
const hash = await bcrypt.hash('Test1234!', 4);
store.set('fbs_user:joachim@fbs.no', JSON.stringify({ email: 'joachim@fbs.no', passwordHash: hash, role: 'befaring', ansattId: 'J1', navn: 'Joachim', active: true }));
store.set('fbs_user:stefan@fbs.no', JSON.stringify({ email: 'stefan@fbs.no', passwordHash: hash, role: 'admin', ansattId: 'S1', navn: 'Stefan', active: true }));

console.log('\n-- Pkt 2: rate-limit på forgot-password (3/15 min) --');
{
  for (let i = 1; i <= 3; i++) {
    const r = await kall(forgot, 'POST', { body: { email: 'joachim@fbs.no' } });
    sjekk(`Forsøk ${i}: ok + reset-token opprettet`, r._kode === 200 && [...store.keys()].filter(k => k.startsWith('fbs_reset:')).length === i);
  }
  const r4 = await kall(forgot, 'POST', { body: { email: 'joachim@fbs.no' } });
  sjekk('Forsøk 4: fortsatt 200 (lekker ikke), men INGEN ny token', r4._kode === 200 && [...store.keys()].filter(k => k.startsWith('fbs_reset:')).length === 3);
  sjekk('Sperre-nøkler med 15 min TTL', ttls.get('fbs_attempts:reset-epost:joachim@fbs.no') === 900 && ttls.get('fbs_attempts:reset-ip:1.2.3.4') === 900);
  // Annen e-post fra samme IP: IP-sperren (også 3) har brukt opp kvoten
  const r5 = await kall(forgot, 'POST', { body: { email: 'stefan@fbs.no' } });
  sjekk('Samme IP, annen e-post: IP-sperren stopper også (ingen ny token)', r5._kode === 200 && [...store.keys()].filter(k => k.startsWith('fbs_reset:')).length === 3);
  // Annen IP + annen e-post går gjennom
  const r6 = await kall(forgot, 'POST', { body: { email: 'stefan@fbs.no' }, ip: '9.9.9.9' });
  sjekk('Annen IP + annen e-post: går gjennom', r6._kode === 200 && [...store.keys()].filter(k => k.startsWith('fbs_reset:')).length === 4);
  sjekk('Ingen devResetUrl i produksjon', !JSON.stringify(r6._body).includes('devResetUrl'));
}

console.log('\n-- Pkt 4: 7 d sesjon med glidende forlengelse --');
{
  const r = await kall(login, 'POST', { body: { email: 'joachim@fbs.no', password: 'Test1234!' } });
  sjekk('Innlogging ok', r._kode === 200 && r._body.token);
  const token = r._body.token;
  sjekk('Ny sesjon får 7 d TTL (ikke 30)', ttls.get('fbs_session:' + token) === 7 * 24 * 3600);
  ttls.set('fbs_session:' + token, 60); // lat som den snart utløper
  const r2 = await kall(me, 'GET', { auth: token });
  sjekk('api/me forlenger til 7 nye dager', r2._kode === 200 && ttls.get('fbs_session:' + token) === 7 * 24 * 3600);
  sjekk('Feil passord avvises fortsatt', (await kall(login, 'POST', { body: { email: 'joachim@fbs.no', password: 'feil' } }))._kode === 401);
  sjekk('Env-fallback død når APP_USER/APP_PASS er borte', (await kall(login, 'POST', { body: { email: 'admin', password: 'follo2026' } }))._kode === 401);
}

console.log('\n-- Pkt 5: «Logg ut alle enheter» --');
{
  // To sesjoner for Joachim + én for Stefan (admin)
  const j1 = (await kall(login, 'POST', { body: { email: 'joachim@fbs.no', password: 'Test1234!' } }))._body.token;
  const j2 = (await kall(login, 'POST', { body: { email: 'joachim@fbs.no', password: 'Test1234!' } }))._body.token;
  const s1 = (await kall(login, 'POST', { body: { email: 'stefan@fbs.no', password: 'Test1234!' } }))._body.token;
  const r = await kall(users, 'PUT', { auth: s1, body: { email: 'joachim@fbs.no', loggUtAlle: true } });
  sjekk('Logger ut alle Joachims sesjoner (≥2)', r._kode === 200 && r._body.loggetUt >= 2, JSON.stringify(r._body));
  sjekk('Joachims tokens er døde', !store.has('fbs_session:' + j1) && !store.has('fbs_session:' + j2));
  sjekk('Stefans sesjon urørt', store.has('fbs_session:' + s1));
  const u = JSON.parse(store.get('fbs_user:joachim@fbs.no'));
  sjekk('Kontoen er uendret (aktiv, hash intakt)', u.active === true && u.passwordHash === hash && u.role === 'befaring');
  sjekk('Ikke-admin kan ikke logge ut andre', (await kall(users, 'PUT', { auth: j1, body: { email: 'stefan@fbs.no', loggUtAlle: true } }))._kode !== 200);
}

server.close();
console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil > 0 ? 1 : 0);
