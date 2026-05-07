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
  if (session.role !== 'admin') return res.status(403).json({ error: 'Kun admin kan se/gjenopprette sikkerhetskopier' });

  if (req.method === 'GET') {
    const backups = [];
    for (const slot of [1, 2, 3, 4, 5]) {
      try {
        const b = await redis.get(`fbs_backup_${slot}`);
        if (b) {
          backups.push({
            slot,
            backedUpAt: b._backedUpAt || b._updatedAt || null,
            befaringer:   (b.befaringer   || []).length,
            tildelinger:  (b.tildelinger  || []).length,
            ansatte:      (b.ansatte      || []).length,
            prosjekter:   (b.prosjekter   || []).length,
            reklamasjoner:(b.reklamasjoner|| []).length,
            serviceJobber:(b.serviceJobber|| []).length,
          });
        }
      } catch { /* skip */ }
    }
    return res.status(200).json({ backups });
  }

  if (req.method === 'POST') {
    const { slot } = req.body;
    if (!slot || slot < 1 || slot > 5) return res.status(400).json({ error: 'Ugyldig slot (1-5)' });
    try {
      const backup = await redis.get(`fbs_backup_${slot}`);
      if (!backup) return res.status(404).json({ error: `Ingen backup i slot ${slot}` });
      const current = await redis.get('fbs_state');
      if (current) await redis.set('fbs_backup_1', { ...current, _backedUpAt: Date.now() }, { ex: 7 * 24 * 3600 });
      await redis.set('fbs_state', backup);
      return res.status(200).json({ ok: true, restored: slot });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
