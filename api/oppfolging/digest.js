// ═══ /api/oppfolging/digest — daglig oppfølgings-digest (SPEC §3) ═══
// Kjøres av Vercel cron hverdager 05:30 UTC (07:30 CEST / 06:30 CET), se
// vercel.json. Kan også kalles av admin (Bearer sesjons-token):
//   GET  ?torr=1   → tørrkjøring: returnerer planen, sender/merker INGENTING
//   POST           → kjør nå (respekterer maks 1/dag og hverdags-regelen)
//
// 🛑 Leser fbs_state, skriver KUN sin egen nøkkel fbs_oppfolging_varsler
// (hvem har fått hva, hvilken dag). Rører aldri befaringer.

import { Redis } from '@upstash/redis';
import { planleggVarsler, lagDigestEpost, lagFristEpost, lagEskaleringEpost, grupperEskaleringer, lagUkesdigestEpost, iDagOslo, VARSEL_STATUS_TOM } from '../../src/oppfolgingVarsler.js';
import { sendEpost } from '../_epost.js';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const VARSEL_NOKKEL = 'fbs_oppfolging_varsler';

async function autoriser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token === cronSecret) return { cron: true };
  // Samme praksis som api/admin/backup.js: uten CRON_SECRET slipper Vercel-cron
  // gjennom (kjenn igjen på user-agent). Sett CRON_SECRET i Vercel for å låse.
  if (!cronSecret && String(req.headers['user-agent'] || '').startsWith('vercel-cron')) {
    console.warn('[oppfolging/digest] CRON_SECRET er ikke satt — cron slippes gjennom på user-agent');
    return { cron: true, usikret: true };
  }
  if (!token) return null;
  const session = await redis.get(`fbs_session:${token}`);
  if (session && session.role === 'admin') return { admin: true, session };
  return null;
}

export async function hentBrukere() {
  const keys = await redis.keys('fbs_user:*');
  if (!keys.length) return [];
  const brukere = await Promise.all(keys.map(k => redis.get(k)));
  return brukere.filter(Boolean).map(u => ({
    email: u.email, navn: u.navn, role: u.role, ansattId: u.ansattId || null,
    active: u.active !== false, borteTil: u.borteTil || null, digestKanal: u.digestKanal || 'epost',
  }));
}

export default async function handler(req, res) {
  const hvem = await autoriser(req);
  if (!hvem) return res.status(401).json({ error: 'Ikke autorisert' });
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const torr = req.method === 'GET' || String((req.query || {}).torr || '') === '1';
  const iDag = String((req.query || {}).dato || '') || iDagOslo();
  const appUrl = process.env.APP_URL || 'https://follo-bemanning.vercel.app';

  try {
    const [state, brukere, varselStatus] = await Promise.all([
      redis.get('fbs_state'), hentBrukere(), redis.get(VARSEL_NOKKEL),
    ]);
    const befaringer = (state && state.befaringer) || [];
    const ansatte = (state && state.ansatte) || [];
    // Admin-mottakere: OPPFOLGING_ADMIN_EPOST (kommaseparert). Standard = Stefan,
    // siden mange kontoer har admin-rolle og speccen sier «PL + Stefan».
    const adminEposter = String(process.env.OPPFOLGING_ADMIN_EPOST || 'stefan@follobyggservice.no').split(',').map(x => x.trim()).filter(Boolean);
    const plan = planleggVarsler({ befaringer, ansatte, brukere, varselStatus: varselStatus || VARSEL_STATUS_TOM, iDag, adminEposter });

    const oppsummering = {
      iDag, torr, digester: plan.digester.map(d => ({ til: d.til, navn: d.navn, antall: d.antall, forfalt: d.forfalt, egne: d.egne.length, tilAdmin: d.tilAdmin.length })),
      fristVarsler: plan.fristVarsler.map(f => ({ til: f.til, kunde: f.sak.befaring.kontaktNavn, dager: f.dager })),
      eskaleringer: plan.eskaleringer.map(e => ({ til: e.til, kunde: e.sak.befaring.kontaktNavn, tekst: e.sak.tekst })),
      eskaleringsEposter: grupperEskaleringer(plan.eskaleringer).map(g => ({ til: g.til, antall: g.saker.length })),
      ukesdigest: plan.ukesdigest ? { til: plan.ukesdigest.til, rader: plan.ukesdigest.rader } : null,
      hoppetOver: plan.hoppetOver, borteIds: plan.borteIds, adminEposter,
    };
    if (torr) return res.status(200).json({ ok: true, ...oppsummering, sendt: [] });

    // Send — og merk KUN det som faktisk ble sendt (eller hoppet pga manglende nøkkel)
    const sendt = [];
    const feilet = [];
    const send = async (til, { emne, html }, merkOk) => {
      const r = await sendEpost({ til, emne, html });
      if (r.sent || r.skipped) { sendt.push({ til, emne, skipped: !!r.skipped }); merkOk(); }
      else feilet.push({ til, emne, feil: r.error });
    };
    // Vi bygger ny status fra den gamle og legger til kun det som gikk gjennom.
    const gammel = varselStatus || VARSEL_STATUS_TOM;
    const ny = { digest: { ...gammel.digest }, frist: { ...gammel.frist }, eskalert: { ...gammel.eskalert }, ukesdigest: gammel.ukesdigest || null };
    for (const d of plan.digester) await send(d.til, lagDigestEpost(d, appUrl), () => { ny.digest[d.til] = iDag; });
    for (const f of plan.fristVarsler) await send(f.til, lagFristEpost(f, appUrl), () => { ny.frist[`${f.sak.befaringId}:${f.sak.befaring.tilbudFrist}`] = iDag; });
    // Én eskaleringsmail per mottaker; en sak merkes når alle dens mottakere fikk den
    const eskOk = new Map(); // nøkkel → antall vellykkede mottakere
    for (const g of grupperEskaleringer(plan.eskaleringer)) {
      await send(g.til, lagEskaleringEpost(g, appUrl), () => {
        for (const e of g.saker) { const n = `${e.sak.befaringId}:${e.sak.forfallDato}`; eskOk.set(n, (eskOk.get(n) || 0) + 1); }
      });
    }
    for (const e of plan.eskaleringer) {
      const n = `${e.sak.befaringId}:${e.sak.forfallDato}`;
      if ((eskOk.get(n) || 0) >= e.til.length) ny.eskalert[n] = iDag;
    }
    if (plan.ukesdigest) await send(plan.ukesdigest.til, lagUkesdigestEpost(plan.ukesdigest, appUrl), () => { ny.ukesdigest = iDag; });
    ny.sistKjort = new Date().toISOString();
    await redis.set(VARSEL_NOKKEL, ny);

    console.log(`[oppfolging/digest] ${iDag}: ${sendt.length} sendt, ${feilet.length} feilet, hoppet: ${plan.hoppetOver.length}`);
    return res.status(200).json({ ok: feilet.length === 0, ...oppsummering, sendt, feilet });
  } catch (e) {
    console.error('[oppfolging/digest] feil:', e);
    return res.status(500).json({ error: e.message });
  }
}
