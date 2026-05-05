import { Redis } from '@upstash/redis';
import { randomBytes } from 'crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate-limit: maks 10 forsøk per IP per 15 min
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const attemptsKey = `fbs_attempts:${ip}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, 900);
  if (attempts > 10) {
    return res.status(429).json({ error: 'For mange forsøk. Vent 15 minutter.' });
  }

  const { username, password } = req.body || {};
  const APP_USER = process.env.APP_USER;
  const APP_PASS = process.env.APP_PASS;

  if (!APP_USER || !APP_PASS) {
    return res.status(500).json({ error: 'Server ikke konfigurert (mangler APP_USER/APP_PASS).' });
  }

  if (!username || !password || username !== APP_USER || password !== APP_PASS) {
    return res.status(401).json({ error: 'Feil brukernavn eller passord.' });
  }

  // Nullstill forsøksteller ved vellykket innlogging
  await redis.del(attemptsKey);

  // Generer sikker token og lagre i Redis med 30 dagers utløp
  const token = randomBytes(32).toString('hex');
  await redis.set(`fbs_session:${token}`, { user: username, at: Date.now() }, { ex: 30 * 24 * 3600 });

  return res.status(200).json({ token });
}
