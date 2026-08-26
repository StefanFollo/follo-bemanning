import { Redis } from '@upstash/redis';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// x-real-ip settes av Vercel-plattformen og kan ikke forfalskes av klienten.
// Første ledd i x-forwarded-for er klient-styrt og kan spoofes for å omgå
// sperren — bruk derfor x-real-ip, med siste XFF-ledd (nærmeste proxy) som fallback.
function klientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return req.headers['x-real-ip'] || xff[xff.length - 1] || 'unknown';
}

async function rateLimit(nokkel, maks) {
  try {
    const key = `fbs_attempts:${nokkel}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, 900);
    return attempts > maks;
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

  const ip = klientIp(req);
  if (await rateLimit(`ip:${ip}`, 10)) {
    return res.status(429).json({ error: 'For mange forsøk. Vent 15 minutter.' });
  }

  if (!email || !password) {
    return res.status(401).json({ error: 'E-post og passord er påkrevd.' });
  }

  const emailKey = email.trim().toLowerCase();

  // Per-konto-sperre i tillegg til per-IP: hindrer brute-force mot én konto
  // fra mange IP-er (eller med forfalskede headere).
  if (await rateLimit(`konto:${emailKey}`, 10)) {
    return res.status(429).json({ error: 'For mange forsøk på denne kontoen. Vent 15 minutter.' });
  }

  // Try per-user account first
  const user = await redis.get(`fbs_user:${emailKey}`);
  if (user) {
    if (!user.active) return res.status(401).json({ error: 'Kontoen er deaktivert.' });
    if (!user.passwordHash) return res.status(401).json({ error: 'Passordet er ikke satt ennå. Bruk «Glemt passord» for å sette det.' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Feil e-post eller passord.' });

    const token = randomBytes(32).toString('hex');
    // 7 dager med glidende forlengelse ved bruk (api/me + lagring forlenger) —
    // aktive brukere merker ingenting, ubrukte tokens dør etter en uke.
    await redis.set(`fbs_session:${token}`, {
      email: emailKey, role: user.role, ansattId: user.ansattId || null, navn: user.navn,
    }, { ex: 7 * 24 * 3600 });
    return res.status(200).json({ token, role: user.role, navn: user.navn });
  }

  // Fallback: env-var admin — KUN hvis begge variablene er eksplisitt satt i
  // Vercel. Ingen innebygde standardverdier (admin/follo2026 var en bakdør:
  // hvis env-variablene noen gang ble fjernet, var systemet åpent).
  const APP_USER = process.env.APP_USER;
  const APP_PASS = process.env.APP_PASS;
  if (APP_USER && APP_PASS &&
      (emailKey === APP_USER.toLowerCase() || (process.env.APP_EMAIL && emailKey === process.env.APP_EMAIL.toLowerCase()))) {
    if (password !== APP_PASS) return res.status(401).json({ error: 'Feil e-post eller passord.' });
    const token = randomBytes(32).toString('hex');
    await redis.set(`fbs_session:${token}`, {
      email: emailKey, role: 'admin', ansattId: null, navn: 'Admin',
    }, { ex: 7 * 24 * 3600 });
    return res.status(200).json({ token, role: 'admin', navn: 'Admin' });
  }

  return res.status(401).json({ error: 'Feil e-post eller passord.' });
}
