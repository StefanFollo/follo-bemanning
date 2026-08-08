// Ende-til-ende-test av fase 1 sync-fiks (CAS-merge i api/state.js).
// Kjører den EKTE handleren med den EKTE @upstash/redis-klienten mot en
// falsk Upstash REST-server i minnet — inkludert deterministisk simulering
// av kappløpet der /api/befaringer/event skriver MIDT I en klient-lagring.
//
// Kjør: node test-sider/test-state-cas.mjs   (fra repo-rot)

import http from 'http';

// ── Falsk Upstash REST-server ──
const store = new Map();
let hooks = { forCasEval: null }; // injiseres per scenario

function kjorKommando(cmd) {
  const [op, ...args] = cmd;
  const OP = String(op).toUpperCase();
  if (globalThis.__loggAlt) console.log('[fake-cmd]', OP, OP === 'EVAL'
    ? 'args=' + JSON.stringify(args.map(a => String(a).replace(/\n/g, ' ').slice(0, 30)))
    : String(args[0]).slice(0, 40) + (OP === 'GET' ? ' → ' + String(store.get(args[0])).slice(0, 25) : ''));
  if (OP === 'GET') return store.has(args[0]) ? store.get(args[0]) : null;
  if (OP === 'SET') { store.set(args[0], String(args[1])); return 'OK'; }
  if (OP === 'INCR') {
    const v = (parseInt(store.get(args[0]) || '0', 10) || 0) + 1;
    store.set(args[0], String(v));
    return v;
  }
  if (OP === 'EVAL') {
    const script = args[0];
    const numKeys = parseInt(args[1], 10);
    const keys = args.slice(2, 2 + numKeys);
    const argv = args.slice(2 + numKeys);
    if (script.includes("if v ~= ARGV[1]")) {
      // CAS-script
      if (hooks.forCasEval) { hooks.forCasEval(); } // simuler samtidig skriving
      const v = store.get(keys[0]) ?? '0';
      if (String(v) !== String(argv[0])) {
        if (process.env.CAS_DEBUG) console.log(`[fake] CAS-mismatch: lagret='${v}' argv='${argv[0]}' (type ${typeof argv[0]})`);
        return 0;
      }
      store.set(keys[1], String(argv[1]));
      kjorKommando(['INCR', keys[0]]);
      return 1;
    }
    // SET+BUMP-script
    store.set(keys[1], String(argv[0]));
    kjorKommando(['INCR', keys[0]]);
    return 1;
  }
  throw new Error('Ustøttet kommando i fake: ' + OP);
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    try {
      // Klienten sender Upstash-Encoding: base64 og BASE64-DEKODER alle
      // streng-resultater — fake-serveren må derfor kode dem.
      const vilHaBase64 = (req.headers['upstash-encoding'] || '').includes('base64');
      const kod = v => (vilHaBase64 && typeof v === 'string') ? Buffer.from(v, 'utf8').toString('base64') : v;
      const parsed = JSON.parse(body);
      let svar;
      if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
        svar = parsed.map(cmd => ({ result: kod(kjorKommando(cmd)) }));
      } else {
        svar = { result: kod(kjorKommando(parsed)) };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(svar));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
process.env.KV_REST_API_URL = `http://127.0.0.1:${port}`;
process.env.KV_REST_API_TOKEN = 'test-token';

// Importer den EKTE handleren ETTER at env er satt (klienten lages ved import)
const { default: handler } = await import('../api/state.js');

// ── Hjelpere ──
function fakeRes() {
  return {
    _kode: null, _body: null,
    setHeader() {},
    status(k) { this._kode = k; return this; },
    json(b) { this._body = b; return this; },
    end() { return this; },
  };
}

async function kjorLagring(body) {
  const req = { method: 'POST', headers: { authorization: 'Bearer testtoken' }, body };
  const res = fakeRes();
  await handler(req, res);
  return res;
}

function lesStateFraStore() {
  return JSON.parse(store.get('fbs_state'));
}

function nullstill(befaringer, ver = 5) {
  store.clear();
  hooks.forCasEval = null;
  store.set('fbs_session:testtoken', JSON.stringify({ role: 'admin', email: 'test@fbs.no', navn: 'Test Admin' }));
  store.set('fbs_state_ver', String(ver));
  store.set('fbs_state', JSON.stringify({
    befaringer,
    prosjekter: [], tildelinger: [], ansatte: [], oppgaver: [], teams: [],
    _fieldTs: { befaringer: 1000 }, _updatedAt: 1000, _tombstones: [],
  }));
}

const T0 = Date.now() - 100000;
function bef(id, navn, endret = T0) {
  return { id, kontaktNavn: navn, adresse: navn + 'veien 1', status: 'planlagt', _endret: endret };
}

let feil = 0;
function sjekk(navn, betingelse, detalj = '') {
  console.log(`${betingelse ? '✅' : '❌'} ${navn}${detalj ? ' — ' + detalj : ''}`);
  if (!betingelse) feil++;
}

// ══ SCENARIO 1: Kappløpet — event skriver MIDT I klient-lagringen ══
// Klienten leste 3 befaringer. Mens den fletter/backup-er, oppretter
// /api/befaringer/event bf-event-ny og bumper versjonen. Klientens CAS
// skal feile, flette på nytt, og bf-event-ny skal OVERLEVE.
{
  const tre = [bef('bf-1', 'Kari'), bef('bf-2', 'Ola'), bef('bf-3', 'Per')];
  nullstill(tre, 5);
  let injisert = false;
  hooks.forCasEval = () => {
    if (injisert) return;
    injisert = true;
    // Simuler event.js: les state, legg til befaring, skriv + bump (atomisk)
    const s = JSON.parse(store.get('fbs_state'));
    s.befaringer = [...s.befaringer, bef('bf-event-ny', 'Lene Teigen', Date.now())];
    s._updatedAt = Date.now();
    store.set('fbs_state', JSON.stringify(s));
    kjorKommando(['INCR', 'fbs_state_ver']);
  };
  const res = await kjorLagring({
    befaringer: tre, prosjekter: [], tildelinger: [], ansatte: [], oppgaver: [], teams: [],
    _fieldTs: { befaringer: 2000 }, _updatedAt: 2000, _slettinger: [],
  });
  const etter = lesStateFraStore();
  const ids = etter.befaringer.map(b => b.id);
  sjekk('S1: lagring lyktes etter CAS-retry', res._kode === 200, `HTTP ${res._kode}`);
  sjekk('S1: event-opprettet befaring OVERLEVDE klient-lagring', ids.includes('bf-event-ny'), ids.join(','));
  sjekk('S1: klientens 3 befaringer er også der', ids.length === 4, `${ids.length} totalt`);
  sjekk('S1: klienten fikk merged-flagg (henter resultatet straks)', res._body?.merged === true);
  const audit = JSON.parse(store.get('fbs_audit_log') || '[]');
  sjekk('S1: merge ble audit-logget', audit.some(a => a.kilde === 'state-merge'), `${audit.length} innslag`);
}

// ══ SCENARIO 2: Bevisst sletting virker fortsatt (tombstone) ══
{
  nullstill([bef('bf-1', 'Kari'), bef('bf-2', 'Ola')], 9);
  const res = await kjorLagring({
    befaringer: [bef('bf-1', 'Kari')], prosjekter: [], tildelinger: [], ansatte: [], oppgaver: [], teams: [],
    _fieldTs: { befaringer: Date.now() }, _updatedAt: Date.now(),
    _slettinger: [{ felt: 'befaringer', id: 'bf-2', ts: Date.now() }],
  });
  const etter = lesStateFraStore();
  const ids = etter.befaringer.map(b => b.id);
  sjekk('S2: lagring OK', res._kode === 200, `HTTP ${res._kode}`);
  sjekk('S2: bevisst slettet befaring er borte', !ids.includes('bf-2'), ids.join(','));
  sjekk('S2: gjenværende befaring intakt', ids.includes('bf-1'));
}

// ══ SCENARIO 3: Event-opprettet FØR klientens lesing overlever (klassisk stale klient) ══
{
  nullstill([bef('bf-1', 'Kari'), bef('bf-gammel-event', 'Myrsletta', Date.now())], 3);
  const res = await kjorLagring({
    befaringer: [bef('bf-1', 'Kari')], prosjekter: [], tildelinger: [], ansatte: [], oppgaver: [], teams: [],
    _fieldTs: { befaringer: 500 }, _updatedAt: 500, _slettinger: [],
  });
  const etter = lesStateFraStore();
  const ids = etter.befaringer.map(b => b.id);
  sjekk('S3: event-opprettet (før lesing) overlevde', ids.includes('bf-gammel-event'), ids.join(','));
  sjekk('S3: HTTP 200', res._kode === 200);
}

// ══ SCENARIO 4: Versjonsteller bumpes ved vellykket skriving ══
{
  nullstill([bef('bf-1', 'Kari')], 20);
  const { Redis } = await import('@upstash/redis');
  const testKlient = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
  const raa = await testKlient.get('fbs_state_ver');
  console.log('[probe] direkte get fbs_state_ver →', JSON.stringify(raa), 'typeof', typeof raa, '| Number:', Number(raa));
  const { lesStateOgVer } = await import('../api/_stateCas.js');
  const probe2 = await lesStateOgVer(testKlient);
  console.log('[probe] lesStateOgVer → ver:', probe2.ver, '| state er objekt:', typeof probe2.state === 'object');
  await kjorLagring({
    befaringer: [bef('bf-1', 'Kari')], prosjekter: [], tildelinger: [], ansatte: [], oppgaver: [], teams: [],
    _fieldTs: {}, _updatedAt: 1, _slettinger: [],
  });
  sjekk('S4: fbs_state_ver bumpet 20 → 21', store.get('fbs_state_ver') === '21', store.get('fbs_state_ver'));
}

server.close();
console.log(feil === 0 ? '\n🎉 ALLE TESTER PASSERTE' : `\n💥 ${feil} TESTER FEILET`);
process.exit(feil === 0 ? 0 : 1);
