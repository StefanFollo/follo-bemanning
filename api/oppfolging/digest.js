// ═══ /api/oppfolging/digest — daglig oppfølgings-digest (SPEC §3) ═══
// Kjøres av Vercel cron hverdager 05:30 UTC (07:30 CEST / 06:30 CET), se
// vercel.json. Kan også kalles av admin (Bearer sesjons-token):
//   GET  ?torr=1   → tørrkjøring: returnerer planen (med kanal per mottaker),
//                    sender/merker INGENTING
//   POST           → kjør nå (respekterer maks 1/dag og hverdags-regelen)
//
// Kanaler: push (web-push mot tilbuds-appens abonnementer, samme VAPID-nøkler)
// og e-post (Resend). digestKanal per bruker: 'epost'|'push'|'begge'.
// E-post er fallback når push mangler enheter eller feiler (med respekt for
// tilbuds-appens epostFallback=false). Maks 1/dag gjelder PER PERSON på tvers
// av kanaler (status-nøkkelen er e-postadressen, merkes én gang).
//
// 🛑 Leser fbs_state, skriver KUN sin egen nøkkel fbs_oppfolging_varsler
// (hvem har fått hva, hvilken dag). Rører aldri befaringer eller abonnementer.

import { Redis } from '@upstash/redis';
import {
  planleggVarsler, lagDigestEpost, lagFristEpost, lagEskaleringEpost, grupperEskaleringer,
  lagUkesdigestEpost, iDagOslo, VARSEL_STATUS_TOM,
  byggPushIndeks, bestemKanaler, lagDigestPush, lagEskaleringPush, lagUkesdigestPush,
} from '../../src/oppfolgingVarsler.js';
import { sendEpost } from '../_epost.js';
import { hentInterappAbonnementer, sendPushBatch, vapidKlar } from '../_push.js';

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
    const [state, brukere, varselStatus, interapp] = await Promise.all([
      redis.get('fbs_state'), hentBrukere(), redis.get(VARSEL_NOKKEL), hentInterappAbonnementer(),
    ]);
    const befaringer = (state && state.befaringer) || [];
    const ansatte = (state && state.ansatte) || [];
    // Admin-mottakere: OPPFOLGING_ADMIN_EPOST (kommaseparert). Standard = Stefan,
    // siden mange kontoer har admin-rolle og speccen sier «PL + Stefan».
    const adminEposter = String(process.env.OPPFOLGING_ADMIN_EPOST || 'stefan@follobyggservice.no').split(',').map(x => x.trim()).filter(Boolean);
    const plan = planleggVarsler({ befaringer, ansatte, brukere, varselStatus: varselStatus || VARSEL_STATUS_TOM, iDag, adminEposter });

    // ── Kanaloppslag per mottaker (e-post → digestKanal, navn → push-enheter) ──
    const pushIdx = byggPushIndeks(interapp);
    const brukerFor = epost => brukere.find(u => String(u.email).toLowerCase() === String(epost).toLowerCase());
    const navnFor = epost => {
      const u = brukerFor(epost);
      return (u && u.navn) || epost;
    };
    const kanalInfoFor = epost => {
      const u = brukerFor(epost);
      const navn = navnFor(epost);
      return {
        ...bestemKanaler({ kanal: (u && u.digestKanal) || 'epost', antallEnheter: pushIdx.subsFor(navn).length }),
        navn, subs: pushIdx.subsFor(navn), innstilling: pushIdx.innstillingFor(navn),
      };
    };

    const eskGrupper = grupperEskaleringer(plan.eskaleringer);
    const oppsummering = {
      iDag, torr,
      digester: plan.digester.map(d => {
        const k = kanalInfoFor(d.til);
        return { til: d.til, navn: d.navn, antall: d.antall, forfalt: d.forfalt, egne: d.egne.length, tilAdmin: d.tilAdmin.length, kanal: k.kanal, pushEnheter: k.antallEnheter };
      }),
      fristVarsler: plan.fristVarsler.map(f => ({ til: f.til, kunde: f.sak.befaring.kontaktNavn, dager: f.dager })),
      eskaleringer: plan.eskaleringer.map(e => ({ til: e.til, kunde: e.sak.befaring.kontaktNavn, tekst: e.sak.tekst })),
      eskaleringsEposter: eskGrupper.map(g => {
        const k = kanalInfoFor(g.til);
        return { til: g.til, antall: g.saker.length, kanal: k.kanal, pushEnheter: k.antallEnheter };
      }),
      ukesdigest: plan.ukesdigest ? {
        til: plan.ukesdigest.til.map(t => { const k = kanalInfoFor(t); return { til: t, kanal: k.kanal, pushEnheter: k.antallEnheter }; }),
        rader: plan.ukesdigest.rader,
      } : null,
      hoppetOver: plan.hoppetOver, borteIds: plan.borteIds, adminEposter,
      push: { vapidKlar: vapidKlar(), abonnementer: pushIdx.antall, feil: interapp.feil || null },
    };
    if (torr) return res.status(200).json({ ok: true, ...oppsummering, sendt: [] });

    // ── Levering per mottaker: push og/eller e-post, e-post som fallback ──
    const sendt = [];
    const feilet = [];
    // → true når mottakeren fikk innholdet på minst én kanal (skipped-epost
    //   uten RESEND_API_KEY teller som levert, som før — miljø uten nøkler).
    async function lever(tilEpost, epostInnhold, pushInnhold) {
      const k = kanalInfoFor(tilEpost);
      const via = [];
      let pushRes = null;
      if (k.push && pushInnhold) {
        pushRes = await sendPushBatch(k.subs, pushInnhold);
        if (pushRes.sendt > 0) via.push(`push:${pushRes.sendt}/${pushRes.av}`);
      }
      const pushLeverte = !!(pushRes && pushRes.sendt > 0);
      // Fallback-regel: kanal 'push' uten levering → e-post, med mindre brukeren
      // eksplisitt har skrudd av epostFallback i tilbuds-appen OG faktisk har enheter.
      const fallbackTillatt = k.innstilling.epostFallback !== false || k.antallEnheter === 0 || (pushRes && pushRes.skipped);
      const trengerEpost = k.epost || (k.push && !pushLeverte && fallbackTillatt);
      if (trengerEpost) {
        const r = await sendEpost({ til: tilEpost, ...epostInnhold });
        if (r.sent || r.skipped) via.push(r.skipped ? 'epost(skipped)' : 'epost');
        else feilet.push({ til: tilEpost, emne: epostInnhold.emne, feil: r.error });
      }
      const leverte = via.length > 0;
      if (leverte) sendt.push({ til: tilEpost, emne: epostInnhold.emne, via });
      else if (pushRes && pushRes.feil.length) feilet.push({ til: tilEpost, emne: epostInnhold.emne, feil: 'push: ' + pushRes.feil.join('; ') });
      return leverte;
    }

    const gammel = varselStatus || VARSEL_STATUS_TOM;
    const ny = { digest: { ...gammel.digest }, frist: { ...gammel.frist }, eskalert: { ...gammel.eskalert }, ukesdigest: gammel.ukesdigest || null };

    for (const d of plan.digester) {
      if (await lever(d.til, lagDigestEpost(d, appUrl), lagDigestPush(d, appUrl))) ny.digest[d.til] = iDag;
    }
    for (const f of plan.fristVarsler) {
      // f.til er én PL eller admin-lista — merk kun når alle fikk den
      const resultater = [];
      for (const t of f.til) resultater.push(await lever(t, lagFristEpost(f, appUrl), null));
      if (resultater.every(Boolean)) ny.frist[`${f.sak.befaringId}:${f.sak.befaring.tilbudFrist}`] = iDag;
    }
    // Én eskaleringsmelding per mottaker; en sak merkes når alle dens mottakere fikk den
    const eskOk = new Map();
    for (const g of eskGrupper) {
      if (await lever(g.til, lagEskaleringEpost(g, appUrl), lagEskaleringPush(g, appUrl))) {
        for (const e of g.saker) { const n = `${e.sak.befaringId}:${e.sak.forfallDato}`; eskOk.set(n, (eskOk.get(n) || 0) + 1); }
      }
    }
    for (const e of plan.eskaleringer) {
      const n = `${e.sak.befaringId}:${e.sak.forfallDato}`;
      if ((eskOk.get(n) || 0) >= e.til.length) ny.eskalert[n] = iDag;
    }
    if (plan.ukesdigest) {
      const resultater = [];
      for (const t of plan.ukesdigest.til) resultater.push(await lever(t, lagUkesdigestEpost(plan.ukesdigest, appUrl), lagUkesdigestPush(plan.ukesdigest, appUrl)));
      if (resultater.every(Boolean)) ny.ukesdigest = iDag;
    }
    ny.sistKjort = new Date().toISOString();
    await redis.set(VARSEL_NOKKEL, ny);

    console.log(`[oppfolging/digest] ${iDag}: ${sendt.length} levert (${sendt.filter(s => s.via.some(v => v.startsWith('push'))).length} med push), ${feilet.length} feilet, hoppet: ${plan.hoppetOver.length}`);
    return res.status(200).json({ ok: feilet.length === 0, ...oppsummering, sendt, feilet });
  } catch (e) {
    console.error('[oppfolging/digest] feil:', e);
    return res.status(500).json({ error: e.message });
  }
}
