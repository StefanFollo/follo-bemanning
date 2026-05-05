import { Redis } from '@upstash/redis';
import { randomBytes } from 'crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Parse body (støtter både parsed og rå JSON)
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { username, password } = body || {};

  const APP_USER = process.env.APP_USER || 'admin';
  const APP_PASS = process.env.APP_PASS || 'follo2026';

  // Rate-limit: maks 10 forsøk per IP per 15 min (ikke-blokkerende)
  try {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const attemptsKey = `fbs_attempts:${ip}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, 900);
    if (attempts > 10) {
      return res.status(429).json({ error: 'For mange forsøk. Vent 15 minutter.' });
    }
  } catch {
    // Ikke la Redis-feil stoppe innlogging
  }

  if (!username || !password || username.trim().toLowerCase() !== APP_USER.toLowerCase() || password !== APP_PASS) {
    return res.status(401).json({ error: 'Feil brukernavn eller passord.' });
  }

  // Generer token og lagre i Redis
  try {
    const token = randomBytes(32).toString('hex');
    await redis.set(`fbs_session:${token}`, { user: username, at: Date.now() }, { ex: 30 * 24 * 3600 });
    return res.status(200).json({ token });
  } catch (e) {
    return res.status(500).json({ error: 'Serverfeil: ' + e.message });
  }
}
