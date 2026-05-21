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
    const WRITE_ROLES = ['admin', 'kontor', 'befaring'];
    if (session.role && !WRITE_ROLES.includes(session.role)) {
      return res.status(403).json({ error: 'Kun administratorer kan lagre endringer.' });
    }
    try {
      // Sikkerhetssperre: ikke tillat lagring som reduserer befaringer drastisk
      // (beskytter mot at seed-data ved ny browser-oppstart overskriver sky-data)
      let newState = req.body;
      const currentState = await redis.get('fbs_state');
      if (currentState) {
        // Befaringer: blokker hvis mer enn 5 færre
        if (Array.isArray(currentState.befaringer) && Array.isArray(newState.befaringer)) {
          const cur = currentState.befaringer.length;
          const nxt = newState.befaringer.length;
          if (nxt < cur - 5) {
            return res.status(409).json({
              error: `Konflikt: forsøker å lagre ${nxt} befaringer, men det finnes ${cur} i skyen. Last inn siden på nytt.`,
              field: 'befaringer', currentCount: cur, newCount: nxt,
            });
          }
        }
        // Tildelinger: blokker hvis mer enn 10 færre (1 merge = -1, så 10 gir god margin)
        if (Array.isArray(currentState.tildelinger) && Array.isArray(newState.tildelinger)) {
          const cur = currentState.tildelinger.length;
          const nxt = newState.tildelinger.length;
          if (nxt < cur - 10) {
            return res.status(409).json({
              error: `Konflikt: forsøker å lagre ${nxt} tildelinger, men det finnes ${cur} i skyen. Last inn siden på nytt.`,
              field: 'tildelinger', currentCount: cur, newCount: nxt,
            });
          }
        }
        // Ansatte: blokker hvis mer enn 3 færre
        if (Array.isArray(currentState.ansatte) && Array.isArray(newState.ansatte)) {
          const cur = currentState.ansatte.length;
          const nxt = newState.ansatte.length;
          if (nxt < cur - 3) {
            return res.status(409).json({
              error: `Konflikt: forsøker å lagre ${nxt} ansatte, men det finnes ${cur} i skyen. Last inn siden på nytt.`,
              field: 'ansatte', currentCount: cur, newCount: nxt,
            });
          }
        }
        // Prosjekter: MERGE (union by ID) — bevar prosjekter lagt til av tilbuds-appen
        // som ikke har rukket å synke til nettleseren ennå
        if (Array.isArray(currentState.prosjekter) && Array.isArray(newState.prosjekter)) {
          const incomingIds = new Set(newState.prosjekter.map(p => p.id));
          const missingProsjekter = currentState.prosjekter.filter(p => !incomingIds.has(p.id));
          if (missingProsjekter.length > 0) {
            console.log(`[state] Beholder ${missingProsjekter.length} sky-prosjekter som mangler lokalt`);
            newState = { ...newState, prosjekter: [...newState.prosjekter, ...missingProsjekter] };
          }
          // Bevar høyeste _fieldTs.prosjekter — aldri la nettleseren overskrive
          // en nyere timestamp satt av tilbuds-appen (event.js / framdrift.js)
          const cloudTs = currentState._fieldTs?.prosjekter || 0;
          const incomingTs = newState._fieldTs?.prosjekter || 0;
          if (cloudTs > incomingTs) {
            newState = { ...newState, _fieldTs: { ...(newState._fieldTs || {}), prosjekter: cloudTs } };
          }
          // Bevar høyeste _updatedAt så polling i klientene kan oppdage endringen
          const cloudUpd = currentState._updatedAt || 0;
          const incomingUpd = newState._updatedAt || 0;
          if (cloudUpd > incomingUpd) {
            newState = { ...newState, _updatedAt: cloudUpd };
          }
        }
      }
      // Rullerende backup: bevar siste 5 lagringer i 7 dager
      try {
        const b4 = await redis.get('fbs_backup_4');
        if (b4) await redis.set('fbs_backup_5', b4, { ex: 7 * 24 * 3600 });
        const b3 = await redis.get('fbs_backup_3');
        if (b3) await redis.set('fbs_backup_4', b3, { ex: 7 * 24 * 3600 });
        const b2 = await redis.get('fbs_backup_2');
        if (b2) await redis.set('fbs_backup_3', b2, { ex: 7 * 24 * 3600 });
        const b1 = await redis.get('fbs_backup_1');
        if (b1) await redis.set('fbs_backup_2', b1, { ex: 7 * 24 * 3600 });
        const current = await redis.get('fbs_state');
        if (current) await redis.set('fbs_backup_1', { ...current, _backedUpAt: Date.now() }, { ex: 7 * 24 * 3600 });
      } catch { /* backup-feil stopper ikke lagring */ }

      await redis.set('fbs_state', newState);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
