// Proxy for endringsordrer (postkasse-oppdrag 20): auth, rollevern,
// handling→rute-mapping, server-satt opprettetAv/av og feilvideresending.
// Kjør: node tests/test-endringsordrer.mjs
import http from 'http';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}

// ── Fake Upstash (sesjoner) ──
const store = new Map();
function kjorKommando(cmd) {
  const [op, ...args] = cmd;
  const OP = String(op).toUpperCase();
  if (OP === 'GET') return store.has(args[0]) ? store.get(args[0]) : null;
  if (OP === 'SET') { store.set(args[0], String(args[1])); return 'OK'; }
  if (OP === 'EXPIRE') return store.has(args[0]) ? 1 : 0;
  throw new Error('Ustøttet: ' + OP);
}
const upstash = http.createServer((req, res) => {
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
await new Promise(r => upstash.listen(0, '127.0.0.1', r));
process.env.KV_REST_API_URL = `http://127.0.0.1:${upstash.address().port}`;
process.env.KV_REST_API_TOKEN = 'test';
process.env.INTER_APP_TOKEN = 'hemmelig-inter-token';
process.env.TILBUDSAPP_URL = 'https://tilbudsapp.test';

// ── Fake tilbuds-app via fetch-patch (Upstash-kall slippes gjennom) ──
const mottatt = []; // { metode, sti, auth, body }
let nesteSvar = { status: 200, body: { ok: true } };
const ekteFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith(process.env.KV_REST_API_URL)) return ekteFetch(url, opts);
  if (u.startsWith('https://tilbudsapp.test')) {
    mottatt.push({
      metode: opts.method || 'GET',
      sti: u.replace('https://tilbudsapp.test', ''),
      auth: (opts.headers || {}).Authorization || '',
      body: opts.body ? JSON.parse(opts.body) : null,
    });
    return { status: nesteSvar.status, ok: nesteSvar.status < 400, json: async () => nesteSvar.body };
  }
  throw new Error('Uventet fetch: ' + u);
};

const { default: handler } = await import('../api/endringsordrer.js');

function fakeRes() { return { _kode: null, _body: null, setHeader() {}, status(k) { this._kode = k; return this; }, json(b) { this._body = b; return this; }, end() { return this; } }; }
async function kall(method, { auth, body, query } = {}) {
  const req = { method, headers: auth ? { authorization: 'Bearer ' + auth } : {}, body: body || {}, query: query || {} };
  const res = fakeRes(); await handler(req, res); return res;
}

store.set('fbs_session:tok-admin', JSON.stringify({ email: 'stefan@fbs.no', role: 'admin', navn: 'Stefan Norberg' }));
store.set('fbs_session:tok-ansatt', JSON.stringify({ email: 'ola@fbs.no', role: 'ansatt', navn: 'Ola' }));

console.log('\n-- Auth og rollevern --');
{
  sjekk('Uten token → 401', (await kall('GET', { query: { tilbudId: '123' } }))._kode === 401);
  sjekk('Ukjent token → 401', (await kall('GET', { auth: 'finnes-ikke', query: { tilbudId: '123' } }))._kode === 401);
  const lese = await kall('GET', { auth: 'tok-ansatt', query: { tilbudId: '123' } });
  sjekk('Ansatt-rollen kan LESE (401/403 ikke gitt)', lese._kode === 200);
  const skrive = await kall('POST', { auth: 'tok-ansatt', body: { handling: 'opprett', tilbudId: 123, tittel: 'x', poster: [] } });
  sjekk('Ansatt-rollen kan IKKE skrive → 403', skrive._kode === 403);
  sjekk('403 nådde aldri tilbuds-appen', !mottatt.some(m => m.metode === 'POST'));
}

console.log('\n-- GET videresendes riktig --');
{
  mottatt.length = 0;
  nesteSvar = { status: 200, body: { erAkseptert: true, kontraktssum: { opprinnelig: 300000, godkjenteEndringer: 0, gjeldende: 300000 }, ordrer: [] } };
  const r = await kall('GET', { auth: 'tok-admin', query: { tilbudId: '1787474393570' } });
  sjekk('200 og svaret videresendt', r._kode === 200 && r._body.erAkseptert === true && r._body.kontraktssum.gjeldende === 300000);
  sjekk('Riktig rute + tilbudId', mottatt[0]?.sti === '/api/interapp/endringsordrer?tilbudId=1787474393570');
  sjekk('Inter-app-token på utgående kall', mottatt[0]?.auth === 'Bearer hemmelig-inter-token');
  sjekk('GET uten tilbudId → 400', (await kall('GET', { auth: 'tok-admin' }))._kode === 400);
}

console.log('\n-- Opprett: opprettetAv settes fra sesjonen --');
{
  mottatt.length = 0;
  nesteSvar = { status: 200, body: { ok: true, id: 'em-1', ordre: { id: 'em-1', status: 'utkast' } } };
  const r = await kall('POST', { auth: 'tok-admin', body: {
    handling: 'opprett', tilbudId: 1787474393570, tittel: 'Ekstra stikkontakter',
    beskrivelse: '4 stk', poster: [{ navn: 'Stikkontakt', mengde: 4, enhet: 'stk', pris: 1200 }],
    opprettetAv: 'HACKER', // skal IGNORERES
  } });
  sjekk('200 med ordre tilbake', r._kode === 200 && r._body.ordre?.id === 'em-1');
  const m = mottatt[0];
  sjekk('POST til riktig rute', m?.metode === 'POST' && m?.sti === '/api/interapp/endringsordrer');
  sjekk('opprettetAv = sesjonens navn (ikke klientens)', m?.body?.opprettetAv === 'Stefan Norberg');
  sjekk('tilbudId som tall + poster med', m?.body?.tilbudId === 1787474393570 && m?.body?.poster?.length === 1);
  sjekk('Opprett uten tilbudId → 400 lokalt', (await kall('POST', { auth: 'tok-admin', body: { handling: 'opprett', tittel: 'x' } }))._kode === 400);
}

console.log('\n-- Oppdater/send/annuller: id-ruter og av-felt --');
{
  mottatt.length = 0;
  nesteSvar = { status: 200, body: { ok: true, ordre: { id: 'em-1' } } };
  await kall('POST', { auth: 'tok-admin', body: { handling: 'oppdater', id: 'em-1', tittel: 'Ny tittel' } });
  sjekk('Oppdater → PUT /:id med kun sendte felter',
    mottatt[0]?.metode === 'PUT' && mottatt[0]?.sti === '/api/interapp/endringsordrer/em-1'
    && mottatt[0]?.body?.tittel === 'Ny tittel' && !('poster' in mottatt[0].body) && !('beskrivelse' in mottatt[0].body));

  mottatt.length = 0;
  await kall('POST', { auth: 'tok-admin', body: { handling: 'send', id: 'em-1', smsOgsaa: true } });
  sjekk('Send → POST /:id/send med smsOgsaa + av fra sesjonen',
    mottatt[0]?.sti === '/api/interapp/endringsordrer/em-1/send'
    && mottatt[0]?.body?.smsOgsaa === true && mottatt[0]?.body?.av === 'Stefan Norberg');

  mottatt.length = 0;
  await kall('POST', { auth: 'tok-admin', body: { handling: 'annuller', id: 'em-1', grunn: 'feil sum' } });
  sjekk('Annuller → POST /:id/annuller med grunn + av',
    mottatt[0]?.sti === '/api/interapp/endringsordrer/em-1/annuller'
    && mottatt[0]?.body?.grunn === 'feil sum' && mottatt[0]?.body?.av === 'Stefan Norberg');

  sjekk('Handling uten id → 400', (await kall('POST', { auth: 'tok-admin', body: { handling: 'send' } }))._kode === 400);
  sjekk('Ukjent handling → 400', (await kall('POST', { auth: 'tok-admin', body: { handling: 'slett', id: 'em-1' } }))._kode === 400);
}

console.log('\n-- Feil fra tilbuds-appen videresendes med forklaring --');
{
  nesteSvar = { status: 409, body: { error: 'Tilbudet er ikke akseptert' } };
  const r = await kall('POST', { auth: 'tok-admin', body: { handling: 'opprett', tilbudId: 1, tittel: 'x', poster: [{ navn: 'a', pris: 1 }] } });
  sjekk('409 + error-tekst rett gjennom', r._kode === 409 && r._body.error === 'Tilbudet er ikke akseptert');
  nesteSvar = { status: 404, body: { error: 'Ukjent ordre' } };
  const r2 = await kall('POST', { auth: 'tok-admin', body: { handling: 'send', id: 'finnes-ikke' } });
  sjekk('404 rett gjennom', r2._kode === 404 && r2._body.error === 'Ukjent ordre');
}

console.log('\n-- Nettverksfeil → 502 med forklaring --');
{
  const patched = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).startsWith(process.env.KV_REST_API_URL)) return ekteFetch(url, opts);
    throw new Error('ECONNREFUSED');
  };
  const r = await kall('GET', { auth: 'tok-admin', query: { tilbudId: '1' } });
  sjekk('502 når tilbuds-appen er nede', r._kode === 502 && /kontakt/i.test(r._body.error));
  globalThis.fetch = patched;
}

upstash.close();
console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil ? 1 : 0);
