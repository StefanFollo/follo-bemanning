import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function isAuthorized(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return false;
  const session = await redis.get(`fbs_session:${token}`);
  return !!session;
}

export default async function handler(req, res) {
  if (!await isAuthorized(req)) {
    return res.status(401).json({ error: 'Ikke autorisert' });
  }

  if (req.method === 'GET') {
    try {
      const state = await redis.get('fbs_state');
      res.status(200).json(state || {});
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else if (req.method === 'POST') {
    try {
      await redis.set('fbs_state', req.body);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
