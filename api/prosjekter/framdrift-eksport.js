// ═══ /api/prosjekter/framdrift-eksport — send framdriftsplan til kundesiden ═══
// (SPEC-kundeportal.md fase 3, postkasse-oppdrag 6.) Klienten varsler hit ved
// plan-aktivering/-endring; serveren bygger hvitlistet payload og POST-er til
// tilbuds-appens /api/befaringer/framdrift med INTER_APP_TOKEN.
//
// Vern:
// - OPT-IN per prosjekt: prosjekt.framdriftDeltMedKunde må være true —
//   fase-titler er fritekst og blir kundesynlige, så PL må aktivt slå på
//   deling (og ser forhåndsvisning i appen) før noe sendes.
// - Dedup: samme payload-hash som sist → ingen sending (pct-kryp under 100 %
//   endrer ikke kundesynlig innhold og koalesceres dermed naturlig).
// - Feil hos tilbuds-appen (stub-perioden: endepunktet finnes ikke ennå) er
//   ufarlig — logges og prøves igjen ved neste trigger.
//
// GET ?prosjektId=&torr=1 (admin/kontor): forhåndsvisning — bygger payloaden
// uten å sende eller merke noe, uavhengig av delings-flagget.

import { Redis } from '@upstash/redis';
import { byggFramdriftPayload, payloadHash } from '../../src/framdriftEksport.js';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const STATUS_NOKKEL = 'fbs_framdrift_eksport';

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  return await redis.get(`fbs_session:${token}`);
}

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session || !['admin', 'kontor'].includes(session.role)) {
    return res.status(401).json({ error: 'Ikke autorisert' });
  }
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const torr = req.method === 'GET';
  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }
  const prosjektId = String((torr ? (req.query || {}).prosjektId : (body || {}).prosjektId) || '');
  if (!prosjektId) return res.status(400).json({ error: 'Mangler prosjektId' });

  const state = (await redis.get('fbs_state')) || {};
  const prosjekt = (state.prosjekter || []).find(p => p && p.id === prosjektId);
  if (!prosjekt) return res.status(404).json({ error: 'Prosjekt ikke funnet' });

  const payload = byggFramdriftPayload(prosjekt, state.befaringer || []);
  if (!payload) {
    return res.status(200).json({ ok: false, manglerGrunnlag: true,
      grunn: !prosjekt.befaringId ? 'Prosjektet er ikke koblet til en befaring' :
        'Mangler tilbud-kobling eller framdriftsplan (fdTasks/startuke)' });
  }

  if (torr) {
    return res.status(200).json({ ok: true, torr: true, delt: prosjekt.framdriftDeltMedKunde === true, payload });
  }

  // 🛑 Aldri sending uten PL-ens aktive valg
  if (prosjekt.framdriftDeltMedKunde !== true) {
    return res.status(200).json({ ok: false, ikkeDelt: true, grunn: 'Deling med kunde er ikke slått på for dette prosjektet' });
  }

  const status = (await redis.get(STATUS_NOKKEL)) || {};
  const hash = payloadHash(payload);
  const forrige = status[prosjektId] || {};
  if (forrige.hash === hash && forrige.sistSendtOk) {
    return res.status(200).json({ ok: true, uendret: true, sistSendt: forrige.sistSendt });
  }

  const base = (process.env.TILBUDSAPP_URL || 'https://follo-befaring.vercel.app').replace(/\/$/, '');
  const interToken = process.env.INTER_APP_TOKEN;
  if (!interToken) return res.status(200).json({ ok: false, feil: 'INTER_APP_TOKEN mangler i env' });

  let svar;
  try {
    const r = await fetch(base + '/api/befaringer/framdrift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + interToken },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    svar = { httpStatus: r.status, ok: r.ok && data.ok !== false, data };
  } catch (e) {
    svar = { httpStatus: 0, ok: false, data: { error: e.message } };
  }

  status[prosjektId] = {
    hash, sistForsok: new Date().toISOString(),
    sistSendt: svar.ok ? new Date().toISOString() : forrige.sistSendt || null,
    sistSendtOk: svar.ok, sistSvar: svar.httpStatus,
    milepaler: payload.framdrift.milepaler.length, tilbudId: payload.tilbudId,
  };
  await redis.set(STATUS_NOKKEL, status);

  console.log(`[framdrift-eksport] ${prosjektId} → tilbud ${payload.tilbudId}: ${svar.ok ? 'OK' : 'FEIL ' + svar.httpStatus} (${payload.framdrift.milepaler.length} milepæler)`);
  if (!svar.ok) {
    return res.status(200).json({ ok: false, feil: svar.data.error || `tilbuds-appen svarte ${svar.httpStatus}`, httpStatus: svar.httpStatus, tilbudId: payload.tilbudId });
  }
  return res.status(200).json({ ok: true, sendt: true, tilbudId: payload.tilbudId, milepaler: payload.framdrift.milepaler.length });
}
