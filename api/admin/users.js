import { Redis } from '@upstash/redis';
import { randomBytes } from 'crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const session = await redis.get(`fbs_session:${token}`);
  if (!session || session.role !== 'admin') return null;
  return session;
}

async function sendInviteEmail(toEmail, toNavn, inviteUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { skipped: true, inviteUrl };

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#f8fafc;border-radius:12px">
      <div style="background:#1e3a5f;color:white;padding:16px 24px;border-radius:8px;margin-bottom:24px">
        <h1 style="margin:0;font-size:20px">Velkommen til FBS!</h1>
        <p style="margin:4px 0 0;opacity:0.8;font-size:14px">FolloByggService – Bemanningssystem</p>
      </div>
      <p>Hei${toNavn ? ` ${toNavn}` : ''},</p>
      <p>Du har fått tilgang til FolloByggService sitt bemanningssystem.</p>
      <p>Klikk på knappen nedenfor for å sette ditt passord og aktivere kontoen. Lenken er gyldig i <strong>24 timer</strong>.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="${inviteUrl}" style="background:#1e3a5f;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600">
          Aktiver kontoen
        </a>
      </div>
      <p style="color:#6b7280;font-size:13px">Din e-post: <strong>${toEmail}</strong></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px;text-align:center">FolloByggService AS – Bemanningssystem</p>
    </div>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'FBS <noreply@follobyggservice.no>',
        to: [toEmail],
        subject: 'Aktiver din konto – FBS',
        html,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Resend feil');
    return { sent: true };
  } catch (e) {
    return { error: e.message };
  }
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Ikke tilgang. Krever admin-rolle.' });

  // GET: list all users
  if (req.method === 'GET') {
    try {
      const keys = await redis.keys('fbs_user:*');
      if (!keys.length) return res.status(200).json([]);
      const users = await Promise.all(keys.map(k => redis.get(k)));
      return res.status(200).json(users.filter(Boolean).map(u => ({
        email: u.email,
        navn: u.navn,
        role: u.role,
        ansattId: u.ansattId || null,
        active: u.active,
        hasPassword: !!u.passwordHash,
        createdAt: u.createdAt,
      })));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST: create user + send invite
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }
    const { email, navn, role, ansattId } = body || {};

    if (!email || !role) return res.status(400).json({ error: 'E-post og rolle er påkrevd.' });
    if (!['admin', 'ansatt'].includes(role)) return res.status(400).json({ error: 'Ugyldig rolle.' });

    const emailKey = email.trim().toLowerCase();
    const existing = await redis.get(`fbs_user:${emailKey}`);
    if (existing) return res.status(409).json({ error: 'En bruker med denne e-posten finnes allerede.' });

    await redis.set(`fbs_user:${emailKey}`, {
      email: emailKey,
      passwordHash: null,
      role,
      ansattId: ansattId || null,
      navn: navn || emailKey,
      active: true,
      createdAt: Date.now(),
    });

    // Create invite token (24hr TTL)
    const token = randomBytes(32).toString('hex');
    await redis.set(`fbs_reset:${token}`, emailKey, { ex: 86400 });

    const baseUrl = process.env.APP_URL || `https://${req.headers.host}`;
    const inviteUrl = `${baseUrl}/?reset=${token}`;

    const emailResult = await sendInviteEmail(emailKey, navn, inviteUrl);

    return res.status(200).json({
      ok: true,
      inviteUrl: (emailResult.skipped || emailResult.error) ? inviteUrl : undefined,
      emailSent: !!emailResult.sent,
    });
  }

  // PUT: update role/navn/ansattId
  if (req.method === 'PUT') {
    let body = req.body;
    if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }
    const { email, role, navn, ansattId, active } = body || {};
    if (!email) return res.status(400).json({ error: 'E-post er påkrevd.' });

    const emailKey = email.trim().toLowerCase();
    const user = await redis.get(`fbs_user:${emailKey}`);
    if (!user) return res.status(404).json({ error: 'Bruker ikke funnet.' });

    const updated = { ...user };
    if (role) updated.role = role;
    if (navn !== undefined) updated.navn = navn;
    if (ansattId !== undefined) updated.ansattId = ansattId;
    if (active !== undefined) updated.active = active;
    await redis.set(`fbs_user:${emailKey}`, updated);

    return res.status(200).json({ ok: true });
  }

  // DELETE: remove user
  if (req.method === 'DELETE') {
    let body = req.body;
    if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }
    const { email } = body || {};
    if (!email) return res.status(400).json({ error: 'E-post er påkrevd.' });

    const emailKey = email.trim().toLowerCase();
    await redis.del(`fbs_user:${emailKey}`);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
