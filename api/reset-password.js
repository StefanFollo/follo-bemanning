import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Passordet må ha minst 8 tegn.';
  if (!/[A-Z]/.test(pw)) return 'Passordet må ha minst én stor bokstav.';
  if (!/[0-9]/.test(pw)) return 'Passordet må ha minst ett tall.';
  if (!/[!@#$%^&*()\-_=+{};:,<.>?/|[\]\\~`"']/.test(pw)) return 'Passordet må ha minst ett spesialtegn (f.eks. ! @ # $).';
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { token, password } = body || {};

  if (!token || !password) return res.status(400).json({ error: 'Token og passord er påkrevd.' });

  const err = validatePassword(password);
  if (err) return res.status(400).json({ error: err });

  const emailKey = await redis.get(`fbs_reset:${token}`);
  if (!emailKey) return res.status(400).json({ error: 'Tilbakestillingslenken er ugyldig eller utløpt.' });

  const user = await redis.get(`fbs_user:${emailKey}`);
  if (!user) return res.status(400).json({ error: 'Brukeren finnes ikke lenger.' });

  const hash = await bcrypt.hash(password, 12);
  await redis.set(`fbs_user:${emailKey}`, { ...user, passwordHash: hash });
  await redis.del(`fbs_reset:${token}`);

  res.status(200).json({ ok: true });
}
