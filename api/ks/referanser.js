// api/ks/referanser.js — Delt referansebibliotek (lover, standarder, byggdetaljer)
// GET → alle referanser
// GET ?kategori=bad → filtrert
// POST → opprett (admin/kontor)
// PUT ?id=xxx → oppdater
// DELETE ?id=xxx → slett (admin)

import { Redis } from '@upstash/redis'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

// Standard-referanser som seedes ved første oppstart
export const STANDARD_REFERANSER = [
  {
    id: 'ref-tek17-13-15',
    tittel: 'TEK17 § 13-15 Våtrom',
    beskrivelse: 'Krav til utførelse av våtrom, herunder fall mot sluk, membran og dampsperre.',
    type: 'url',
    url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/13/iii/13-15/',
    kategori: ['bad'],
    opprettet: new Date().toISOString(),
    opprettet_av: 'System',
  },
  {
    id: 'ref-tek17-9',
    tittel: 'TEK17 § 9 Konstruksjonssikkerhet',
    beskrivelse: 'Krav til bærende konstruksjoner, lastvirkning og stabilitet.',
    type: 'url',
    url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/9/',
    kategori: ['tomrer', 'fasade'],
    opprettet: new Date().toISOString(),
    opprettet_av: 'System',
  },
  {
    id: 'ref-tek17-14',
    tittel: 'TEK17 § 14 Energi',
    beskrivelse: 'Energikrav, U-verdier for vegger, tak og gulv.',
    type: 'url',
    url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/14/',
    kategori: ['fasade', 'tak', 'tomrer'],
    opprettet: new Date().toISOString(),
    opprettet_av: 'System',
  },
  {
    id: 'ref-tek17-11',
    tittel: 'TEK17 § 11 Brannsikkerhet',
    beskrivelse: 'Brannklasser, brannmotstand og krav til branntetting av gjennomføringer.',
    type: 'url',
    url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/11/',
    kategori: ['hms', 'tomrer', 'ror', 'el'],
    opprettet: new Date().toISOString(),
    opprettet_av: 'System',
  },
  {
    id: 'ref-arbmiljo-stillas',
    tittel: 'Arbeidsmiljøloven: Stillas og fallsikring',
    beskrivelse: 'Krav til stillas, fallsikring og sikring av arbeidsplassen i høyden.',
    type: 'url',
    url: 'https://www.arbeidstilsynet.no/regelverk/forskrifter/forskrift-om-utforelse-av-arbeid/16/16-2/',
    kategori: ['hms', 'fasade', 'tak'],
    opprettet: new Date().toISOString(),
    opprettet_av: 'System',
  },
  {
    id: 'ref-ns3420',
    tittel: 'NS 3420 Beskrivelsestekster for bygg',
    beskrivelse: 'Norsk standard for beskrivelsestekster — tekniske krav til utførelse.',
    type: 'url',
    url: 'https://www.standard.no/fagomrader/bygg-anlegg-og-eiendom/ns-3420/',
    kategori: ['bad', 'fasade', 'tak', 'tomrer'],
    opprettet: new Date().toISOString(),
    opprettet_av: 'System',
  },
  {
    id: 'ref-neks400',
    tittel: 'NEK 400 — Elektriske lavspenningsanlegg',
    beskrivelse: 'Norsk elektroteknisk komités standard for elektriske installasjoner.',
    type: 'url',
    url: 'https://www.nek.no/normativt-arbeid/standarder/nek-400/',
    kategori: ['el', 'bad'],
    opprettet: new Date().toISOString(),
    opprettet_av: 'System',
  },
]

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
    const alle = (await redis.get('fbs_ks_referanser')) || []
    const { kategori } = req.query
    if (kategori) return res.status(200).json(alle.filter(r => (r.kategori || []).includes(kategori)))
    return res.status(200).json(alle)
  }

  if (req.method === 'POST') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const alle = (await redis.get('fbs_ks_referanser')) || []
    const id = req.body.id || `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const ny = {
      ...req.body,
      id,
      opprettet: new Date().toISOString(),
      opprettet_av: session.navn || session.email || 'Ukjent',
    }
    await redis.set('fbs_ks_referanser', [...alle, ny])
    return res.status(201).json(ny)
  }

  if (req.method === 'PUT') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const alle = (await redis.get('fbs_ks_referanser')) || []
    const idx = alle.findIndex(r => r.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Referanse ikke funnet' })
    const oppdatert = { ...alle[idx], ...req.body, id, sist_endret: new Date().toISOString() }
    const ny = [...alle]; ny[idx] = oppdatert
    await redis.set('fbs_ks_referanser', ny)
    return res.status(200).json(oppdatert)
  }

  if (req.method === 'DELETE') {
    if (!isAdmin) return res.status(403).json({ error: 'Kun admin kan slette referanser' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const alle = (await redis.get('fbs_ks_referanser')) || []
    await redis.set('fbs_ks_referanser', alle.filter(r => r.id !== id))
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
