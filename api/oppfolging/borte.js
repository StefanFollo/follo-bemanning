// ═══ /api/oppfolging/borte — «Borte til [dato]» for innlogget bruker (SPEC §3) ═══
// GET  → { borteTil, digestKanal } for egen konto
// POST { borteTil: 'YYYY-MM-DD' | null, digestKanal?: 'epost'|'push'|'begge' }
// Kun egen konto; admin setter andres via /api/admin/users (PUT).
import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const KANALER = ['epost', 'push', 'begge'];

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const session = token ? await redis.get(`fbs_session:${token}`) : null;
  if (!session || !session.email) return res.status(401).json({ error: 'Ikke autorisert' });
  const nokkel = `fbs_user:${String(session.email).toLowerCase()}`;
  const user = await redis.get(nokkel);
  if (!user) return res.status(404).json({ error: 'Bruker ikke funnet' });

  if (req.method === 'GET') {
    return res.status(200).json({ borteTil: user.borteTil || null, digestKanal: user.digestKanal || 'epost' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }
  const { borteTil, digestKanal } = body || {};
  const oppdatert = { ...user };
  if (borteTil !== undefined) {
    if (borteTil && !/^\d{4}-\d{2}-\d{2}$/.test(borteTil)) return res.status(400).json({ error: 'borteTil må være YYYY-MM-DD' });
    oppdatert.borteTil = borteTil || null;
  }
  if (digestKanal !== undefined) {
    if (!KANALER.includes(digestKanal)) return res.status(400).json({ error: 'Ugyldig digestKanal' });
    oppdatert.digestKanal = digestKanal;
  }
  await redis.set(nokkel, oppdatert);
  return res.status(200).json({ ok: true, borteTil: oppdatert.borteTil || null, digestKanal: oppdatert.digestKanal || 'epost' });
}
