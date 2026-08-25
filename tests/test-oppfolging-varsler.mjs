// Test av oppfølgings-varsler (SPEC §3–4): planlegger + digest-endepunkt.
// Kjør: node tests/test-oppfolging-varsler.mjs
import http from 'http';
import {
  planleggVarsler, lagDigestEpost, lagUkesdigestEpost, lagEskaleringEpost, grupperEskaleringer,
  erHverdag, erMandag, VARSEL_STATUS_TOM,
  pushNokkelForNavn, byggPushIndeks, bestemKanaler, lagDigestPush, lagEskaleringPush, lagUkesdigestPush,
  morgenbriefData, morgenbriefEmne, datoKortNo, MORGENBRIEF_MAKS_RADER,
} from '../src/oppfolgingVarsler.js';
import { leggTilDager, ukesStatistikk as ukesStatistikkRef } from '../src/oppfolging.js';

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
  sjekk('Morgenbrief-emne «Morgenbrief 24.08: 2 å ringe (1 forfalt)»', e.emne === 'Morgenbrief 24.08: 2 å ringe (1 forfalt)' && e.html.includes('Forfalt') && e.html.includes('tel:') === false, e.emne);
}

console.log('\n-- Admin-mottakere via eksplisitt liste (env) — ikke «alle med admin-rolle» --');
{
  const mange = [...brukere, { email: 'rytis@fbs.no', navn: 'Rytis', role: 'admin', ansattId: 'R1', active: true }];
  const uten = planleggVarsler({ befaringer, ansatte, brukere: mange, varselStatus: VARSEL_STATUS_TOM, iDag: MANDAG });
  sjekk('Uten liste: alle admin-kontoer får admin-saker (Rytis også)', uten.digester.some(x => x.til === 'rytis@fbs.no'));
  const med = planleggVarsler({ befaringer, ansatte, brukere: mange, varselStatus: VARSEL_STATUS_TOM, iDag: MANDAG, adminEposter: ['Stefan@FBS.no'] });
  sjekk('Med liste: kun Stefan får admin-saker, Rytis ingenting', !med.digester.some(x => x.til === 'rytis@fbs.no') && med.digester.find(x => x.til === 'stefan@fbs.no').tilAdmin.length === 3);
  sjekk('Eskalering går til PL + kun listens admin', med.eskaleringer.every(e => e.til.every(t => t === 'joachim@fbs.no' || t === 'stefan@fbs.no')));
  sjekk('Ukesdigest kun til listen', med.ukesdigest.til.join() === 'stefan@fbs.no');
  const ukjent = planleggVarsler({ befaringer, ansatte, brukere: mange, varselStatus: VARSEL_STATUS_TOM, iDag: MANDAG, adminEposter: ['post@fbs.no'] });
  sjekk('Adresse uten konto fungerer som admin-mottaker', ukjent.digester.some(x => x.til === 'post@fbs.no' && x.tilAdmin.length === 3));
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
  const grupper = grupperEskaleringer(esk);
  sjekk('Gruppert: én e-post per mottaker (Joachim 1 sak, Stefan 2 saker)', grupper.length === 2
    && grupper.find(g => g.til === 'stefan@fbs.no').saker.length === 2 && grupper.find(g => g.til === 'joachim@fbs.no').saker.length === 1);
  const ge = lagEskaleringEpost(grupper.find(g => g.til === 'stefan@fbs.no'), 'https://app');
  sjekk('Samle-emne «2 saker forfalt mer enn 7 dager»', ge.emne === 'Eskalering: 2 saker forfalt mer enn 7 dager' && ge.html.includes('Eierløs') && ge.html.includes('Forfalt'));
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

console.log('\n-- Push-kanal: mapping, kanalvalg, payload-format --');
{
  sjekk('pushNokkelForNavn: fornavn i små bokstaver', pushNokkelForNavn('Joachim Norenberg') === 'joachim' && pushNokkelForNavn('  Lars Fagerli ') === 'lars' && pushNokkelForNavn('') === '');
  const idx = byggPushIndeks({
    abonnementer: [
      { bruker: 'joachim', endpoint: 'https://p/1', keys: { p256dh: 'a', auth: 'b' }, enhet: 'mobil' },
      { bruker: 'joachim', endpoint: 'https://p/2', keys: { p256dh: 'c', auth: 'd' } },
      { bruker: 'stefan', endpoint: 'https://p/3', keys: { p256dh: 'e', auth: 'f' } },
      { bruker: 'ukjentmann', endpoint: 'https://p/4', keys: { p256dh: 'g', auth: 'h' } },
      { bruker: 'joachim', endpoint: '', keys: null }, // ugyldig — droppes
    ],
    innstillinger: { joachim: { epostFallback: false }, stefan: { alleVarsler: true } },
  });
  sjekk('Joachim har 2 enheter via navnet sitt', idx.subsFor('Joachim Norenberg').length === 2);
  sjekk('Ukjent navn → 0 enheter', idx.subsFor('Kari Nordmann').length === 0);
  sjekk('Innstillinger slås opp på fornavn', idx.innstillingFor('Joachim Norenberg').epostFallback === false && idx.innstillingFor('Stefan Norberg').alleVarsler === true);
  sjekk('Kanal epost → kun epost', JSON.stringify(bestemKanaler({ kanal: 'epost', antallEnheter: 2 })) === JSON.stringify({ push: false, epost: true, kanal: 'epost', antallEnheter: 2 }));
  sjekk('Kanal begge m/enheter → push + epost', bestemKanaler({ kanal: 'begge', antallEnheter: 1 }).push === true && bestemKanaler({ kanal: 'begge', antallEnheter: 1 }).epost === true);
  sjekk('Kanal push m/enheter → kun push (epost er fallback ved feil)', bestemKanaler({ kanal: 'push', antallEnheter: 1 }).push === true && bestemKanaler({ kanal: 'push', antallEnheter: 1 }).epost === false);
  sjekk('Kanal push UTEN enheter → epost', bestemKanaler({ kanal: 'push', antallEnheter: 0 }).epost === true);
  sjekk('Ukjent kanal → epost', bestemKanaler({ kanal: 'tull', antallEnheter: 5 }).kanal === 'epost');
  const dp = lagDigestPush(p1.digester.find(x => x.til === 'joachim@fbs.no'), 'https://app');
  sjekk('Digest-push: morgenbrief-tittel + to øverste med dager',
    dp.tittel === 'Morgenbrief: 2 å ringe (1 forfalt)' && dp.tekst.includes('Forfalt (62 d)') && dp.url === 'https://app' && dp.hendelse === 'oppfolging-digest', dp.tittel + ' | ' + dp.tekst);
  const ep = lagEskaleringPush(grupperEskaleringer(p1.eskaleringer).find(g => g.til === 'stefan@fbs.no'), 'https://app');
  sjekk('Eskalering-push: samle-tittel + navneliste', ep.tittel === 'Eskalering: 2 saker forfalt >7 dager' && ep.hendelse === 'oppfolging-eskalering');
  const up = lagUkesdigestPush(p1.ukesdigest, 'https://app');
  sjekk('Ukesdigest-push: verstinger i teksten', up.hendelse === 'oppfolging-ukesdigest' && up.tekst.includes('forfalt'));
}

console.log('\n-- Morgenbrief: seksjoner A–D, maks 8, tomme utelates (SPEC-morgenbrief) --');
{
  const mb = [
    ...befaringer,
    { id: 'V1', kontaktNavn: 'Samuel Vigdal', adresse: 'Nybrottveien 38', telefon: '982 19 448', status: 'tilbud_sendt', nesteKontakt: d(2), prosjektlederId: 'J1',
      sistKundeAktivitet: MANDAG + 'T05:00:00Z', kundeAktivitet: [{ handling: 'aapnet', tidspunkt: MANDAG + 'T05:00:00Z', antall: 3 }] },
    { id: 'A1', kontaktNavn: 'Arja Hakala', adresse: 'Gydas vei 59', telefon: '90090090', status: 'planlagt', dato: MANDAG, tid: '11:00', ansvarligBefaringId: 'J1' },
    { id: 'A2', kontaktNavn: 'Ikke min', status: 'planlagt', dato: MANDAG, tid: '09:00', ansvarligBefaringId: 'L1' },
    { id: 'V2', kontaktNavn: 'Gammel Aktivitet', status: 'tilbud_sendt', nesteKontakt: d(3), prosjektlederId: 'J1', sistKundeAktivitet: d(-5) + 'T05:00:00Z' },
  ];
  const p = planleggVarsler({ befaringer: mb, ansatte, brukere, varselStatus: VARSEL_STATUS_TOM, iDag: MANDAG });
  const j = p.digester.find(x => x.til === 'joachim@fbs.no');
  sjekk('Emne med avtale-del: «… · 1 befaring i dag»', morgenbriefEmne(j) === 'Morgenbrief 24.08: 2 å ringe (1 forfalt) · 1 befaring i dag', morgenbriefEmne(j));
  sjekk('A: varmt signal = Samuel (3x åpnet), gammel aktivitet utelatt', j.varme.length === 1 && j.varme[0].befaring.id === 'V1' && j.varme[0].tekst === 'åpnet tilbudet 3x siste døgn');
  sjekk('C: kun egen avtale (Arja, ikke Lars sin)', j.avtaler.length === 1 && j.avtaler[0].id === 'A1');
  sjekk('C: frist-sak med i I DAG', j.frister.length === 1 && j.frister[0].befaringId === 'B4');
  sjekk('D: ukens tall matcher ukesStatistikk (testkrav 7)', j.uke && j.uke.forfalt === (ukesStatistikkRef(mb).perPl.J1 || {}).forfalt);
  const ep = lagDigestEpost(j, 'https://app');
  sjekk('HTML: VARME NÅ øverst før RING I DAG', ep.html.indexOf('VARME NÅ') > 0 && ep.html.indexOf('VARME NÅ') < ep.html.indexOf('RING I DAG'));
  sjekk('HTML: tel:-lenke + dyplenke ?kort=', ep.html.includes('tel:98219448') && ep.html.includes('?kort=B1'));
  sjekk('HTML: I DAG-seksjon med kl. 11:00 og frist', ep.html.includes('>I DAG</p>') && ep.html.includes('kl. 11:00') && ep.html.includes('Tilbudsfrist løper ut: Frist (3 dager igjen)'));
  sjekk('HTML: fot med ukens tall', ep.html.includes('Din uke så langt: 0 håndtert · 1 forfalt igjen · 0 utsatt'));
  sjekk('Morgenbrief-drakt i headeren', ep.html.includes('Follo Byggservice · Morgenbrief'));
  sjekk('Ren tekst: seksjoner + emne', ep.tekst.startsWith(ep.emne) && ep.tekst.includes('VARME NÅ:') && ep.tekst.includes('RING I DAG (2):') && ep.tekst.includes('I DAG:'));
  // Tomme seksjoner utelates (testkrav 2) — Stefan har verken varme eller avtaler
  const s = p.digester.find(x => x.til === 'stefan@fbs.no');
  const eps = lagDigestEpost(s, 'https://app');
  sjekk('Tom A/C utelates helt hos Stefan', !eps.html.includes('VARME NÅ') && !eps.html.includes('>I DAG</p>') && eps.html.includes('HOS DEG SOM ADMIN'));
  sjekk('Ansattløs mottaker får ingen ukesfot', lagDigestEpost({ ...s, uke: null, iDag: MANDAG }, 'https://app').html.includes('Din uke så langt') === false);
  // Maks 8 + «og N til» (testkrav 4)
  const mange = Array.from({ length: 10 }, (_, i) => ({ id: 'M' + i, kontaktNavn: 'Kunde ' + i, status: 'tilbud_sendt', nesteKontakt: d(-(i + 1)), prosjektlederId: 'J1' }));
  const pm = planleggVarsler({ befaringer: mange, ansatte, brukere, varselStatus: VARSEL_STATUS_TOM, iDag: MANDAG });
  const jm = lagDigestEpost(pm.digester.find(x => x.til === 'joachim@fbs.no'), 'https://app');
  sjekk('Maks 8 rader + «og 2 til»', jm.html.includes('8. <b>') && !jm.html.includes('9. <b>') && jm.html.includes('og 2 til') && MORGENBRIEF_MAKS_RADER === 8);
  // Push komprimert (SPEC §2)
  const pp = lagDigestPush(j, 'https://app');
  sjekk('Push: 🔥-signal først, så to øverste saker', pp.tittel === 'Morgenbrief: 2 å ringe (1 forfalt)' && pp.tekst.startsWith('🔥 Samuel leser tilbudet ditt') && pp.tekst.includes('Forfalt (62 d)'));
  // Triggere uendret (🛑-rammen): tom kø → ingen digest selv med varme/avtaler
  const kunVarm = [mb.find(b => b.id === 'V1'), mb.find(b => b.id === 'A1')];
  sjekk('Trigger uendret: kun varme/avtaler uten kø-saker → ingen digest', planleggVarsler({ befaringer: kunVarm, ansatte, brukere, varselStatus: VARSEL_STATUS_TOM, iDag: MANDAG }).digester.filter(x => x.til === 'joachim@fbs.no').length === 0);
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
  // Fake tilbuds-app: inter-app-abonnementer (Joachim har 1 enhet)
  if (String(req.url).startsWith('/api/push')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      abonnementer: [{ bruker: 'joachim', endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' }, enhet: 'test' }],
      innstillinger: { joachim: { epostFallback: true } },
    }));
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
process.env.CRON_SECRET = 'cron-hemmelig';
process.env.OPPFOLGING_ADMIN_EPOST = 'stefan@fbs.no';
process.env.INTER_APP_TOKEN = 'inter-test';
process.env.TILBUDSAPP_URL = `http://127.0.0.1:${server.address().port}`;
delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
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
  sjekk('Cron POST sender: 2 digester + 1 frist + 2 eskaleringsmailer (per mottaker) + 1 ukesdigest = 6 e-poster', r._kode === 200 && r._body.ok && resendKall.length === 6, 'fikk ' + resendKall.length);
  sjekk('Eskaleringsmail til Stefan samler 2 saker', resendKall.some(k => k.to.join() === 'stefan@fbs.no' && k.subject === 'Eskalering: 2 saker forfalt mer enn 7 dager'));
  const emner = resendKall.map(k => k.subject);
  sjekk('Emner riktige', emner.some(e => e.startsWith('Morgenbrief ' + datoKortNo(MANDAG) + ':')) && emner.some(e => e.startsWith('Tilbudsfrist Frist')) && emner.some(e => e.startsWith('Eskalering:')) && emner.some(e => e.startsWith('Oppfølging sist uke')));
  sjekk('Morgenbrief-eposten har ren tekst-fallback', resendKall.filter(k => k.subject.startsWith('Morgenbrief')).every(k => typeof k.text === 'string' && (k.text.includes('RING I DAG') || k.text.includes('HOS DEG SOM ADMIN'))));
  const status = JSON.parse(store.get('fbs_oppfolging_varsler'));
  sjekk('Varselstatus lagret med dato per mottaker', status.digest['joachim@fbs.no'] === MANDAG && status.ukesdigest === MANDAG && Object.keys(status.eskalert).length === 2);
  const antallFør = resendKall.length;
  r = await kall('POST', 'cron-hemmelig');
  sjekk('Kjøring nr 2 samme dag: 0 nye e-poster (maks 1/dag)', r._kode === 200 && resendKall.length === antallFør && r._body.sendt.length === 0);
  sjekk('fbs_state urørt av endepunktet', JSON.parse(store.get('fbs_state')).befaringer.length === 6 && !JSON.parse(store.get('fbs_state')).befaringer[0].oppfolgingsLogg);
  r = await kall('POST', 'cron-hemmelig', { dato: d(5) });
  sjekk('Lørdag via cron: 0 sendt, hoppet «helg»', r._body.sendt.length === 0 && r._body.hoppetOver.includes('helg'));

  console.log('\n-- Push-kanal i endepunktet (VAPID mangler → e-post-fallback) --');
  // Joachim går over til push-kanal; tirsdag gir nye digester
  store.set('fbs_user:joachim@fbs.no', JSON.stringify({ email: 'joachim@fbs.no', navn: 'Joachim', role: 'befaring', ansattId: 'J1', active: true, digestKanal: 'push' }));
  r = await kall('GET', 'admintoken', { dato: d(1) });
  const jo = r._body.digester.find(x => x.til === 'joachim@fbs.no');
  sjekk('Tørrkjøring viser kanal per mottaker (joachim: push, 1 enhet)', jo && jo.kanal === 'push' && jo.pushEnheter === 1);
  sjekk('Tørrkjøring viser push-status (VAPID mangler, 1 abonnement)', r._body.push && r._body.push.vapidKlar === false && r._body.push.abonnementer === 1);
  const førAntall = resendKall.length;
  r = await kall('POST', 'cron-hemmelig', { dato: d(1) });
  const joSendt = (r._body.sendt || []).find(x => x.til === 'joachim@fbs.no' && x.emne.startsWith('Morgenbrief'));
  sjekk('VAPID mangler → digest levert som e-post-fallback', joSendt && joSendt.via.includes('epost') && !joSendt.via.some(v => v.startsWith('push:')));
  sjekk('E-posten faktisk sendt via Resend', resendKall.length > førAntall && resendKall.slice(førAntall).some(k => k.to.join() === 'joachim@fbs.no'));
  const status2 = JSON.parse(store.get('fbs_oppfolging_varsler'));
  sjekk('Maks 1/dag på tvers av kanaler: merket én gang for tirsdag', status2.digest['joachim@fbs.no'] === d(1));
  r = await kall('POST', 'cron-hemmelig', { dato: d(1) });
  sjekk('Kjøring nr 2 tirsdag: ingen ny levering til Joachim', !(r._body.sendt || []).some(x => x.til === 'joachim@fbs.no'));
}

server.close();
globalThis.fetch = origFetch;
console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil > 0 ? 1 : 0);
