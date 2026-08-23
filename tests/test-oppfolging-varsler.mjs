// Test av oppfølgings-varsler (SPEC §3–4): planlegger + digest-endepunkt.
// Kjør: node tests/test-oppfolging-varsler.mjs
import http from 'http';
import { planleggVarsler, lagDigestEpost, lagUkesdigestEpost, erHverdag, erMandag, VARSEL_STATUS_TOM } from '../src/oppfolgingVarsler.js';
import { leggTilDager } from '../src/oppfolging.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}
const MANDAG = '2026-08-24';
const d = n => leggTilDager(MANDAG, n);

const ansatte = [
  { id: 'J1', navn: 'Joachim', epost: 'joachim@fbs.no' },
  { id: 'L1', navn: 'Lars', epost: 'lars@fbs.no' },
  { id: 'T1', navn: 'Thomas' },             // ingen e-post, ingen konto
  { id: 'S1', navn: 'Stefan', epost: 'stefan@fbs.no' },
];
const brukere = [
  { email: 'joachim@fbs.no', navn: 'Joachim', role: 'befaring', ansattId: 'J1', active: true },
  { email: 'lars@fbs.no', navn: 'Lars', role: 'befaring', ansattId: 'L1', active: true, borteTil: d(5) },
  { email: 'stefan@fbs.no', navn: 'Stefan', role: 'admin', ansattId: 'S1', active: true },
  { email: 'gammel@fbs.no', navn: 'Sluttet', role: 'admin', active: false },
];
const befaringer = [
  { id: 'B1', kontaktNavn: 'Forfalt', status: 'tilbud_sendt', nesteKontakt: d(-62), prosjektlederId: 'J1' },   // eskaler
  { id: 'B4', kontaktNavn: 'Frist', status: 'tilbud_sendt', tilbudFrist: d(3), prosjektlederId: 'J1', dato: d(-1) },
  { id: 'B5', kontaktNavn: 'Lars sin', status: 'planlagt', nesteKontakt: d(-1), prosjektlederId: 'L1' },
  { id: 'B6', kontaktNavn: 'Thomas sin', status: 'planlagt', nesteKontakt: d(0), prosjektlederId: 'T1' },
  { id: 'B9', kontaktNavn: 'Eierløs', status: 'tilbud_arbeid', nesteKontakt: d(-8) },                          // eskaler, admin
  { id: 'B3', kontaktNavn: 'Framtid', status: 'tilbud_sendt', nesteKontakt: d(9), prosjektlederId: 'J1' },     // ikke i kø
];

console.log('\n-- Hverdag/mandag-hjelpere --');
sjekk('Mandag er hverdag og mandag', erHverdag(MANDAG) && erMandag(MANDAG));
sjekk('Lørdag er ikke hverdag', !erHverdag(d(5)) && !erHverdag(d(6)));

console.log('\n-- Test 3: digest kun til de med saker, maks 1/dag --');
const p1 = planleggVarsler({ befaringer, ansatte, brukere, varselStatus: VARSEL_STATUS_TOM, iDag: MANDAG });
{
  const til = p1.digester.map(x => x.til).sort();
  sjekk('Digest til Joachim + Stefan (admin), IKKE Lars (borte) eller deaktivert admin', til.join(',') === 'joachim@fbs.no,stefan@fbs.no', til.join(','));
  const j = p1.digester.find(x => x.til === 'joachim@fbs.no');
  sjekk('Joachim: 2 egne saker, 1 forfalt', j.egne.length === 2 && j.forfalt === 1 && j.tilAdmin.length === 0);
  const s = p1.digester.find(x => x.til === 'stefan@fbs.no');
  const grunner = s.tilAdmin.map(x => x.grunn).sort();
  sjekk('Stefan får eierløs + Lars (borte) + Thomas (uten e-post) som admin-saker', s.tilAdmin.length === 3 && s.egne.length === 0, grunner.join(' | '));
  sjekk('Grunner forklarer hvorfor', grunner.some(g => g.includes('mangler ansvarlig')) && grunner.some(g => g.includes('Lars er borte til')) && grunner.some(g => g.includes('Thomas har ingen e-post')));
  sjekk('borteIds = L1', p1.borteIds.join(',') === 'L1');
  // Andre kjøring samme dag
  const p2 = planleggVarsler({ befaringer, ansatte, brukere, varselStatus: p1.nyStatus, iDag: MANDAG });
  sjekk('Kjøring nr 2 samme dag: 0 digester', p2.digester.length === 0 && p2.hoppetOver.filter(h => h.includes('allerede sendt')).length === 2);
  // Neste dag
  const p3 = planleggVarsler({ befaringer, ansatte, brukere, varselStatus: p1.nyStatus, iDag: d(1) });
  sjekk('Tirsdag: digester igjen (2)', p3.digester.length === 2);
  // Helg
  const p4 = planleggVarsler({ befaringer, ansatte, brukere, varselStatus: VARSEL_STATUS_TOM, iDag: d(5) });
  sjekk('Lørdag: ingenting sendes', p4.digester.length === 0 && p4.fristVarsler.length === 0 && p4.eskaleringer.length === 0 && p4.hoppetOver.includes('helg'));
  // Ingen saker → ingen digest
  const p5 = planleggVarsler({ befaringer: [befaringer[5]], ansatte, brukere, varselStatus: VARSEL_STATUS_TOM, iDag: MANDAG });
  sjekk('Uten saker: ingen digester i det hele tatt', p5.digester.length === 0);
  const e = lagDigestEpost(p1.digester.find(x => x.til === 'joachim@fbs.no'), 'https://app');
  sjekk('Digest-emne «Du har 2 oppfølginger i dag (1 forfalt)»', e.emne === 'Du har 2 oppfølginger i dag (1 forfalt)' && e.html.includes('Forfalt') && e.html.includes('tel:') === false);
}

console.log('\n-- Frist-varsel: én gang, 3 dager før --');
{
  sjekk('1 frist-varsel til Joachim (3 d)', p1.fristVarsler.length === 1 && p1.fristVarsler[0].til.join() === 'joachim@fbs.no' && p1.fristVarsler[0].dager === 3);
  const p2 = planleggVarsler({ befaringer, ansatte, brukere, varselStatus: p1.nyStatus, iDag: d(1) });
  sjekk('Dagen etter: ikke på nytt', p2.fristVarsler.length === 0);
  const flyttet = befaringer.map(b => b.id === 'B4' ? { ...b, tilbudFrist: d(2) } : b);
  const p3 = planleggVarsler({ befaringer: flyttet, ansatte, brukere, varselStatus: p1.nyStatus, iDag: d(1) });
  sjekk('Ny frist-dato → nytt varsel', p3.fristVarsler.length === 1);
}

console.log('\n-- Test 4: eskalering >7 d treffer PL + admin én gang --');
{
  const esk = p1.eskaleringer;
  sjekk('2 eskaleringer (B1 + eierløs B9)', esk.length === 2, esk.map(x => x.sak.befaringId).join(','));
  const b1 = esk.find(x => x.sak.befaringId === 'B1');
  sjekk('B1 → Joachim + Stefan', b1.til.sort().join(',') === 'joachim@fbs.no,stefan@fbs.no' && b1.plNavn === 'Joachim');
  const b9 = esk.find(x => x.sak.befaringId === 'B9');
  sjekk('Eierløs → kun admin', b9.til.join() === 'stefan@fbs.no' && b9.plNavn === null);
  const p2 = planleggVarsler({ befaringer, ansatte, brukere, varselStatus: p1.nyStatus, iDag: d(1) });
  sjekk('Dagen etter: ingen ny eskalering', p2.eskaleringer.length === 0);
  sjekk('Lars sin (1 d forfalt) eskaleres ikke', !esk.some(x => x.sak.befaringId === 'B5'));
  // Ny dato etter eskalering → ny syklus
  const ny = befaringer.map(b => b.id === 'B1' ? { ...b, nesteKontakt: d(-10) } : b);
  sjekk('Ny forfallsdato → kan eskaleres igjen', planleggVarsler({ befaringer: ny, ansatte, brukere, varselStatus: p1.nyStatus, iDag: d(1) }).eskaleringer.length === 1);
}

console.log('\n-- Mandag: ukesdigest til admin --');
{
  sjekk('Ukesdigest til Stefan på mandag', p1.ukesdigest && p1.ukesdigest.til.join() === 'stefan@fbs.no');
  const rader = p1.ukesdigest.rader;
  sjekk('Rader per PL med forfalt-telling (Joachim 1, Lars 1, Thomas 0, mangler 1)',
    rader.find(r => r.navn === 'Joachim').forfalt === 1 && rader.find(r => r.navn === 'Lars').forfalt === 1 && rader.find(r => r.navn === 'Mangler ansvarlig').forfalt === 1);
  sjekk('Tirsdag: ingen ukesdigest', planleggVarsler({ befaringer, ansatte, brukere, varselStatus: VARSEL_STATUS_TOM, iDag: d(1) }).ukesdigest === null);
  sjekk('Mandag igjen samme dag: ikke på nytt', planleggVarsler({ befaringer, ansatte, brukere, varselStatus: p1.nyStatus, iDag: MANDAG }).ukesdigest === null);
  const e = lagUkesdigestEpost(p1.ukesdigest, 'https://app');
  sjekk('Ukesdigest-epost har tabell', e.html.includes('håndtert') && e.html.includes('Joachim'));
}

console.log('\n-- Test 5: planleggeren muterer ingenting --');
{
  const før = JSON.stringify(befaringer);
  planleggVarsler({ befaringer, ansatte, brukere, varselStatus: VARSEL_STATUS_TOM, iDag: MANDAG });
  sjekk('Befaringer byte-identiske', JSON.stringify(befaringer) === før);
  sjekk('VARSEL_STATUS_TOM urørt', Object.keys(VARSEL_STATUS_TOM.digest).length === 0);
}

// ── Endepunktet mot fake Upstash + fanget Resend ─────────────────────
const store = new Map();
function kjorKommando(cmd) {
  const [op, ...args] = cmd;
  const OP = String(op).toUpperCase();
  if (OP === 'GET') return store.has(args[0]) ? store.get(args[0]) : null;
  if (OP === 'SET') { store.set(args[0], String(args[1])); return 'OK'; }
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
process.env.CRON_SECRET = 'cron-hemmelig';
process.env.RESEND_API_KEY = 're_test';
const resendKall = [];
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.resend.com')) {
    resendKall.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ id: 'e_' + resendKall.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return origFetch(url, opts);
};
const { default: handler } = await import('../api/oppfolging/digest.js');
store.set('fbs_state', JSON.stringify({ befaringer, ansatte }));
for (const u of brukere) store.set('fbs_user:' + u.email, JSON.stringify(u));
store.set('fbs_session:admintoken', JSON.stringify({ email: 'stefan@fbs.no', role: 'admin', navn: 'Stefan' }));
store.set('fbs_session:pltoken', JSON.stringify({ email: 'joachim@fbs.no', role: 'befaring', navn: 'Joachim' }));

function fakeRes() { return { _kode: null, _body: null, setHeader() {}, status(k) { this._kode = k; return this; }, json(b) { this._body = b; return this; }, end() { return this; } }; }
async function kall(method, auth, query) {
  const req = { method, headers: { authorization: 'Bearer ' + auth }, query: { dato: MANDAG, ...(query || {}) }, body: {} };
  const res = fakeRes(); await handler(req, res); return res;
}

console.log('\n-- /api/oppfolging/digest --');
{
  let r = await kall('POST', 'feil');
  sjekk('401 uten gyldig auth', r._kode === 401);
  r = await kall('POST', 'pltoken');
  sjekk('401 for PL (ikke admin, ikke cron)', r._kode === 401);
  r = await kall('GET', 'admintoken');
  sjekk('Admin GET = tørrkjøring: plan, ingen sending, ingen status', r._kode === 200 && r._body.torr && r._body.digester.length === 2 && resendKall.length === 0 && !store.has('fbs_oppfolging_varsler'));
  r = await kall('POST', 'cron-hemmelig');
  sjekk('Cron POST sender: 2 digester + 1 frist + 2 eskaleringer + 1 ukesdigest = 6 e-poster', r._kode === 200 && r._body.ok && resendKall.length === 6, 'fikk ' + resendKall.length);
  const emner = resendKall.map(k => k.subject);
  sjekk('Emner riktige', emner.some(e => e.startsWith('Du har 2 oppfølginger')) && emner.some(e => e.startsWith('Tilbudsfrist Frist')) && emner.some(e => e.startsWith('Eskalering:')) && emner.some(e => e.startsWith('Oppfølging sist uke')));
  const status = JSON.parse(store.get('fbs_oppfolging_varsler'));
  sjekk('Varselstatus lagret med dato per mottaker', status.digest['joachim@fbs.no'] === MANDAG && status.ukesdigest === MANDAG && Object.keys(status.eskalert).length === 2);
  const antallFør = resendKall.length;
  r = await kall('POST', 'cron-hemmelig');
  sjekk('Kjøring nr 2 samme dag: 0 nye e-poster (maks 1/dag)', r._kode === 200 && resendKall.length === antallFør && r._body.sendt.length === 0);
  sjekk('fbs_state urørt av endepunktet', JSON.parse(store.get('fbs_state')).befaringer.length === 6 && !JSON.parse(store.get('fbs_state')).befaringer[0].oppfolgingsLogg);
  r = await kall('POST', 'cron-hemmelig', { dato: d(5) });
  sjekk('Lørdag via cron: 0 sendt, hoppet «helg»', r._body.sendt.length === 0 && r._body.hoppetOver.includes('helg'));
}

server.close();
globalThis.fetch = origFetch;
console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil > 0 ? 1 : 0);
