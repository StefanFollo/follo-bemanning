// api/endringsordrer.js — proxy mot tilbuds-appens inter-app-API for
// endringsordrer (postkasse-oppdrag 20). INTER_APP_TOKEN lever kun i
// Vercel-environment; frontend autentiseres med bruker-JWT (fbs_session).
//
//   GET  ?tilbudId=<id>  → { erAkseptert, overtattDato, kontraktssum, ordrer }
//   POST { handling: 'opprett',  tilbudId, tittel, beskrivelse, poster }
//   POST { handling: 'oppdater', id, tittel?, beskrivelse?, poster? }
//   POST { handling: 'send',     id, smsOgsaa? }
//   POST { handling: 'annuller', id, grunn? }
//
// opprettetAv/av settes ALLTID server-side fra sesjonen (aldri fra klienten),
// slik at loggen hos tilbuds-appen viser reell innlogget bruker.
// Feil fra tilbuds-appen (400 validering / 404 ukjent / 409 låst) sendes
// videre med samme status og `error`-forklaring — frontend viser dem direkte.

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const WRITE_ROLES = ['admin', 'kontor', 'befaring', 'anleggsleder'];

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const session = await redis.get(`fbs_session:${token}`);
  if (session) { try { await redis.expire(`fbs_session:${token}`, 7 * 24 * 3600); } catch { /* aldri blokker requesten */ } }
  return session;
}

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' });

  const interToken = process.env.INTER_APP_TOKEN;
  if (!interToken) return res.status(500).json({ error: 'INTER_APP_TOKEN ikke konfigurert på serveren' });
  const base = (process.env.TILBUDSAPP_URL || 'https://follo-befaring.vercel.app').replace(/\/$/, '');

  const videresend = async (metode, sti, body) => {
    const r = await fetch(`${base}${sti}`, {
      method: metode,
      headers: { Authorization: `Bearer ${interToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    return res.status(r.status).json(data);
  };

  try {
    if (req.method === 'GET') {
      const tilbudId = req.query?.tilbudId;
      if (!tilbudId) return res.status(400).json({ error: 'tilbudId mangler' });
      return await videresend('GET', `/api/interapp/endringsordrer?tilbudId=${encodeURIComponent(tilbudId)}`);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!WRITE_ROLES.includes(session.role)) {
      return res.status(403).json({ error: 'Rollen din har ikke skrivetilgang.' });
    }

    const b = req.body || {};
    const navn = session.navn || session.email || 'ukjent';

    if (b.handling === 'opprett') {
      if (!b.tilbudId) return res.status(400).json({ error: 'tilbudId mangler' });
      return await videresend('POST', '/api/interapp/endringsordrer', {
        tilbudId: Number(b.tilbudId),
        tittel: b.tittel,
        beskrivelse: b.beskrivelse,
        poster: b.poster,
        opprettetAv: navn,
      });
    }

    const id = b.id ? encodeURIComponent(String(b.id)) : null;
    if (!id) return res.status(400).json({ error: 'id mangler' });

    if (b.handling === 'oppdater') {
      const body = {};
      for (const felt of ['tittel', 'beskrivelse', 'poster']) {
        if (b[felt] !== undefined) body[felt] = b[felt];
      }
      return await videresend('PUT', `/api/interapp/endringsordrer/${id}`, body);
    }
    if (b.handling === 'send') {
      return await videresend('POST', `/api/interapp/endringsordrer/${id}/send`, { smsOgsaa: !!b.smsOgsaa, av: navn });
    }
    if (b.handling === 'annuller') {
      return await videresend('POST', `/api/interapp/endringsordrer/${id}/annuller`, { grunn: b.grunn || '', av: navn });
    }
    return res.status(400).json({ error: 'Ukjent handling' });
  } catch (e) {
    return res.status(502).json({ error: 'Fikk ikke kontakt med tilbuds-appen: ' + e.message });
  }
}
