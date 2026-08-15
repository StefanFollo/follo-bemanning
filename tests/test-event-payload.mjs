// Test av 'payload-oppdatering'-eventet (SPEC-trinn3, test-krav 1–3+5).
// Kjører den EKTE handleren i api/befaringer/event.js mot falsk Upstash.
// Kjør: node tests/test-event-payload.mjs

import http from 'http';

// ── Falsk Upstash REST-server (samme mønster som test-state-cas.mjs) ──
const store = new Map();

function kjorKommando(cmd) {
  const [op, ...args] = cmd;
  const OP = String(op).toUpperCase();
  if (OP === 'GET') return store.has(args[0]) ? store.get(args[0]) : null;
  if (OP === 'SET') { store.set(args[0], String(args[1])); return 'OK'; }
  if (OP === 'INCR') {
    const v = (parseInt(store.get(args[0]) || '0', 10) || 0) + 1;
    store.set(args[0], String(v));
    return v;
  }
  if (OP === 'EVAL') {
    const numKeys = parseInt(args[1], 10);
    const keys = args.slice(2, 2 + numKeys);
    const argv = args.slice(2 + numKeys);
    // SET+BUMP (skrivStateOgBump)
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
process.env.INTER_APP_TOKEN = 'inter-test-token';

const { default: handler } = await import('../api/befaringer/event.js');

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  ✅ ${navn}`); }
  else { feil++; console.log(`  ❌ ${navn}${detalj ? ' — ' + detalj : ''}`); }
}
function fakeRes() {
  return {
    _kode: null, _body: null,
    setHeader() {},
    status(k) { this._kode = k; return this; },
    json(b) { this._body = b; return this; },
    end() { return this; },
  };
}
async function sendEvent(body) {
  const req = { method: 'POST', headers: { authorization: 'Bearer inter-test-token' }, body };
  const res = fakeRes();
  await handler(req, res);
  return res;
}
const lesState = () => JSON.parse(store.get('fbs_state'));
const utenFelt = (o, ...felt) => { const k = { ...o }; for (const f of felt) delete k[f]; return k; };

function nullstill() {
  store.clear();
  store.set('fbs_state', JSON.stringify({
    befaringer: [
      { id: 'BEF-1', kontaktNavn: 'Kari Kunde', adresse: 'Regneveien 4', status: 'tilbud_sendt', tilbudId: 555, notat: 'viktig notat', _endret: 100 },
      { id: 'BEF-2', kontaktNavn: 'Annen Person', adresse: 'Annen vei 2', status: 'godkjent', _endret: 100 },
    ],
    prosjekter: [{ id: 'P-1', navn: 'Urørt prosjekt' }],
    _updatedAt: 1000,
  }));
  store.set('fbs_state_ver', '3');
}

const payload = { kundenavn: 'Kari Kunde', adresse: 'Regneveien 4', totalSum: 148125, poster: [{ navn: 'Riving' }], publicToken: 'tokX' };

console.log('\n── Krav 1: gyldig kobling → payload inn, ALT annet urørt ──');
{
  nullstill();
  const førBef = lesState().befaringer[0];
  const r = await sendEvent({ type: 'payload-oppdatering', kildeBefaringId: 'BEF-1', tilbudId: 555, tidspunkt: '2026-08-15T14:00:00.000Z', dato: '2026-08-15T14:00:00.000Z', data: payload });
  sjekk('Svar ok + befaring funnet', r._kode === 200 && r._body.ok && r._body.befaringFunnet);
  const etter = lesState();
  const bef = etter.befaringer.find(b => b.id === 'BEF-1');
  sjekk('tilbudPayload satt med _mottattType', bef.tilbudPayload?._mottattType === 'payload-oppdatering' && bef.tilbudPayload.totalSum === 148125);
  const diff = JSON.stringify(utenFelt(bef, 'tilbudPayload', '_endret')) === JSON.stringify(utenFelt(førBef, 'tilbudPayload', '_endret'));
  sjekk('JSON-diff utenom payload-feltet = tom (status/kolonne urørt)', diff);
  sjekk('Status eksplisitt uendret', bef.status === 'tilbud_sendt');
  sjekk('Andre befaringer urørt', JSON.stringify(etter.befaringer[1]) === JSON.stringify(lesState().befaringer[1]) && etter.befaringer[1]._endret === 100);
  sjekk('Krav 5: telling uendret (2 befaringer, 1 prosjekt)', etter.befaringer.length === 2 && etter.prosjekter.length === 1);
  sjekk('Audit-logg skrevet', (JSON.parse(store.get('fbs_audit_log') || '[]')).some(e => e.kilde === 'payload-oppdatering'));
  sjekk('Snapshot tatt før endring', (JSON.parse(store.get('fbs_snapshots') || '[]')).some(s => s.utløstAv === 'payload-oppdatering' && s.dataFør?.id === 'BEF-1'));
}

console.log('\n── Krav 2: spøkelse-ID → adresse-fallback ──');
{
  nullstill();
  const r = await sendEvent({ type: 'payload-oppdatering', kildeBefaringId: 'GHOST-99', tilbudId: 999, tidspunkt: '2026-08-15T14:01:00.000Z', dato: '2026-08-15T14:01:00.000Z', data: payload });
  sjekk('Fallback fant riktig befaring', r._body.kildeBefaringId === 'BEF-1' && r._body.oppslagsKilde === 'via adresse-fallback');
  sjekk('Payload lagt på riktig befaring', lesState().befaringer[0].tilbudPayload?.publicToken === 'tokX');
}

console.log('\n── Krav 3: nyere payload finnes → beholdes ──');
{
  nullstill();
  const state = lesState();
  state.befaringer[0].tilbudPayload = { totalSum: 999, _mottattDato: '2026-08-20T10:00:00.000Z', _mottattType: 'vunnet' };
  store.set('fbs_state', JSON.stringify(state));
  const verFør = store.get('fbs_state_ver');
  const r = await sendEvent({ type: 'payload-oppdatering', kildeBefaringId: 'BEF-1', tilbudId: 555, tidspunkt: '2026-08-15T14:02:00.000Z', dato: '2026-08-15T14:02:00.000Z', data: payload });
  sjekk('Svarer beholdtNyereVersjon med forklaring', r._body.beholdtNyereVersjon === true && /nyere/.test(r._body.beskjed));
  sjekk('Eksisterende payload beholdt', lesState().befaringer[0].tilbudPayload.totalSum === 999);
  sjekk('State ikke skrevet (ver uendret)', store.get('fbs_state_ver') === verFør);
}

console.log('\n── Ingen match → aldri auto-opprett ──');
{
  nullstill();
  const r = await sendEvent({ type: 'payload-oppdatering', tilbudId: 777, tidspunkt: '2026-08-15T14:03:00.000Z', dato: '2026-08-15T14:03:00.000Z', data: { kundenavn: 'Ukjent Person', adresse: 'Finnes ikke 1' } });
  sjekk('befaringFunnet:false + manuell beskjed', r._body.befaringFunnet === false && /manuelt/.test(r._body.beskjed));
  sjekk('Ingen ny befaring opprettet', lesState().befaringer.length === 2);
}

console.log('\n── Idempotens: samme event to ganger ──');
{
  nullstill();
  const body = { type: 'payload-oppdatering', kildeBefaringId: 'BEF-1', tilbudId: 555, tidspunkt: '2026-08-15T14:04:00.000Z', dato: '2026-08-15T14:04:00.000Z', data: payload };
  await sendEvent(body);
  const r2 = await sendEvent(body);
  sjekk('Andre kall avvist som duplikat', r2._body.duplikat === true);
}

console.log('\n── Auth: uten gyldig token ──');
{
  nullstill();
  const req = { method: 'POST', headers: { authorization: 'Bearer feil-token' }, body: { type: 'payload-oppdatering', tilbudId: 1, data: payload } };
  const res = fakeRes();
  await handler(req, res);
  sjekk('401 uten gyldig inter-app-token', res._kode === 401);
}

server.close();
console.log(`\n═══ ${ok} OK, ${feil} FEIL ═══`);
process.exit(feil > 0 ? 1 : 0);
