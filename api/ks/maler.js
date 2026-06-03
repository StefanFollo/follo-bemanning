// api/ks/maler.js — CRUD for sjekkliste-maler
// GET → hent alle maler
// POST → opprett ny mal (admin/kontor)
// PUT → oppdater mal (admin/kontor)
// DELETE → slett mal (admin only)

import { Redis } from '@upstash/redis'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const session = await getSession(req)
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  const isAdmin = session.role === 'admin'
  const kanSkrive = isAdmin || session.role === 'kontor'

  if (req.method === 'GET') {
    const maler = (await redis.get('fbs_ks_maler')) || []
    // Berik med fase/kategori basert på navn og gruppe (alltid reberegn for riktig tagging)
    function tildelFase(m) {
      const n = (m.navn || '').toLowerCase()
      const g = m.gruppe || ''
      if (m.id === 'mal-hms-daglig') return 'daglig'
      if (g === 'Sluttkontroll' || m.id === 'mal-el-slutt') return 'slutt'
      if (n.includes('sluttkontroll') && n.includes('elektrisk')) return 'slutt'
      if (g === 'HMS' || n.includes('risikovurdering') || n.includes('sha') || n.includes('sikker jobb')) return 'oppstart'
      if (n.includes('stillas')) return 'oppstart'
      return 'bygg'
    }
    function tildelKategoriBibliotek(m) {
      const n = (m.navn || '').toLowerCase()
      const g = m.gruppe || ''
      // Bad (gruppe-prioritet fanger "Sanitæranlegg — rørlegger" i bad-kontekst)
      if (g === 'Utførelse bad') return 'bad'
      if (n.includes('bad') || n.includes('membran') || n.includes('våtrom') || n.includes('flislegg')) return 'bad'
      // Yttervegg/fasade
      if (n.includes('fasade') || n.includes('vinduer og dør') || n.includes('panel og kledning') || n.includes('beslag og tetting') || n.includes('maling utvendig')) return 'yttervegg'
      // Tak
      if (g === 'Utførelse tak' || (n.includes('tak') && !n.includes('stillas'))) return 'tak'
      // Innvendig
      if (g === 'Utførelse innvendig' || n.includes('innvendig') || n.includes('gips') || n.includes('sparkling') || n.includes('gulvlegg') || n.includes('bærekonstruk') || n.includes('isolasjon og dampsperre')) return 'innvendig'
      if (g === 'Maling') return n.includes('utvendig') ? 'yttervegg' : 'innvendig'
      // Rør
      if (g === 'Rørlegger' || n.includes('vvs') || n.includes('sanitær') || n.includes('avløp') || n.includes('varmtvann')) return 'ror'
      // El (ikke sluttkontroll)
      if (g === 'Elektrisk' || n.includes('kurssikring') || (n.includes('elektrisk') && !n.includes('sluttkontroll'))) return 'el'
      return 'annet'
    }
    const enriched = maler.map(m => ({
      ...m,
      // Alltid reberegn fase og kategoriBibliotek (override lagret verdi for riktig tagging)
      fase: tildelFase(m),
      kilde: m.kilde || 'follo',
      kategoriBibliotek: tildelKategoriBibliotek(m),
    }))
    return res.status(200).json(enriched)
  }

  if (req.method === 'POST') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const maler = (await redis.get('fbs_ks_maler')) || []
    const ny = { ...req.body, sist_endret: new Date().toISOString(), endret_av: session.navn || session.email || 'ukjent' }
    await redis.set('fbs_ks_maler', [...maler, ny])
    return res.status(201).json(ny)
  }

  if (req.method === 'PUT') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const maler = (await redis.get('fbs_ks_maler')) || []
    const idx = maler.findIndex(m => m.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Mal ikke funnet' })
    const oppdatert = { ...maler[idx], ...req.body, id, sist_endret: new Date().toISOString(), endret_av: session.navn || session.email || 'ukjent', versjon: (maler[idx].versjon || 1) + 1 }
    const ny = [...maler]; ny[idx] = oppdatert
    await redis.set('fbs_ks_maler', ny)
    return res.status(200).json(oppdatert)
  }

  if (req.method === 'DELETE') {
    if (!isAdmin) return res.status(403).json({ error: 'Kun admin kan slette maler' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const maler = (await redis.get('fbs_ks_maler')) || []
    await redis.set('fbs_ks_maler', maler.filter(m => m.id !== id))
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
