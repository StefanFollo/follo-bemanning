import { Redis } from '@upstash/redis';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function rateLimit(ip) {
  try {
    const key = `fbs_attempts:${ip}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, 900);
    return attempts > 10;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { email, password } = body || {};

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (await rateLimit(ip)) {
    return res.status(429).json({ error: 'For mange forsøk. Vent 15 minutter.' });
  }

  if (!email || !password) {
    return res.status(401).json({ error: 'E-post og passord er påkrevd.' });
  }

  const emailKey = email.trim().toLowerCase();

  // Try per-user account first
  const user = await redis.get(`fbs_user:${emailKey}`);
  if (user) {
    if (!user.active) return res.status(401).json({ error: 'Kontoen er deaktivert.' });
    if (!user.passwordHash) return res.status(401).json({ error: 'Passordet er ikke satt ennå. Bruk «Glemt passord» for å sette det.' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Feil e-post eller passord.' });

    const token = randomBytes(32).toString('hex');
    await redis.set(`fbs_session:${token}`, {
      email: emailKey, role: user.role, ansattId: user.ansattId || null, navn: user.navn,
    }, { ex: 30 * 24 * 3600 });
    return res.status(200).json({ token, role: user.role, navn: user.navn });
  }

  // Fallback: env-var admin (backwards compatible)
  const APP_USER = process.env.APP_USER || 'admin';
  const APP_PASS = process.env.APP_PASS || 'follo2026';
  if (emailKey === APP_USER.toLowerCase() || emailKey === (process.env.APP_EMAIL || '').toLowerCase()) {
    if (password !== APP_PASS) return res.status(401).json({ error: 'Feil e-post eller passord.' });
    const token = randomBytes(32).toString('hex');
    await redis.set(`fbs_session:${token}`, {
      email: emailKey, role: 'admin', ansattId: null, navn: 'Admin',
    }, { ex: 30 * 24 * 3600 });
    return res.status(200).json({ token, role: 'admin', navn: 'Admin' });
  }

  return res.status(401).json({ error: 'Feil e-post eller passord.' });
}
