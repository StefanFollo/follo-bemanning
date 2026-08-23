import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Ikke autorisert' });

  const session = await redis.get(`fbs_session:${token}`);
  if (!session) return res.status(401).json({ error: 'Økt utløpt' });

  // Oppfølgings-modul: egne flagg fra brukerkontoen (tåler manglende konto)
  let user = null;
  try { user = session.email ? await redis.get(`fbs_user:${String(session.email).toLowerCase()}`) : null; } catch { user = null; }

  res.status(200).json({
    borteTil: (user && user.borteTil) || null,
    digestKanal: (user && user.digestKanal) || 'epost',
    email: session.email,
    // Manglende rolle → laveste privilegium (aldri admin som standard)
    role: session.role || 'ansatt',
    navn: session.navn || '',
    ansattId: session.ansattId || null,
  });
}
