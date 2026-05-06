import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  return await redis.get(`fbs_session:${token}`);
}

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' });

  if (req.method === 'GET') {
    try {
      const state = await redis.get('fbs_state');
      res.status(200).json(state || {});
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else if (req.method === 'POST') {
    if (session.role && session.role !== 'admin') {
      return res.status(403).json({ error: 'Kun administratorer kan lagre endringer.' });
    }
    try {
      // Sikkerhetssperre: ikke tillat lagring som reduserer befaringer drastisk
      // (beskytter mot at seed-data ved ny browser-oppstart overskriver sky-data)
      const newState = req.body;
      const currentState = await redis.get('fbs_state');
      if (currentState && Array.isArray(currentState.befaringer) && Array.isArray(newState.befaringer)) {
        const currentCount = currentState.befaringer.length;
        const newCount = newState.befaringer.length;
        // Blokker hvis ny tilstand har mer enn 5 færre befaringer enn eksisterende
        if (newCount < currentCount - 5) {
          return res.status(409).json({
            error: `Konflikt: forsøker å lagre ${newCount} befaringer, men det finnes ${currentCount} i skyen. Last inn siden på nytt.`,
            currentCount,
            newCount,
          });
        }
      }
      await redis.set('fbs_state', newState);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
