// api/ks/sjekklister.js — CRUD for prosjekt-sjekklister
// GET ?prosjektId=xxx → hent sjekklister for prosjekt
// GET ?id=xxx → hent én
// POST → opprett ny sjekkliste-instans fra mal
// PUT ?id=xxx → oppdater (fylle ut punkter, status, signering, ansvarlig)
// DELETE ?id=xxx → slett (admin)

import { Redis } from '@upstash/redis'

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  return await redis.get(`fbs_session:${token}`)
}

function beregnStatus(punkter) {
  if (!punkter?.length) return 'ikke-startet'
  const alleOK = punkter.every(p => p.status === 'ok' || p.status === 'ikke-aktuelt')
  const noenUtfort = punkter.some(p => p.status === 'ok' || p.status === 'avvik' || p.status === 'ikke-aktuelt')
  if (alleOK) return 'ferdig'
  if (noenUtfort) return 'pagar'
  return 'ikke-startet'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const session = await getSession(req)
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' })

  const isAdmin = session.role === 'admin'
  const kanSkrive = isAdmin || session.role === 'kontor' || session.role === 'ansatt'

  if (req.method === 'GET') {
    const alle = (await redis.get('fbs_ks_sjekklister')) || []
    const { prosjektId, id } = req.query
    if (id) return res.status(200).json(alle.find(s => s.id === id) || null)
    return res.status(200).json(prosjektId ? alle.filter(s => s.prosjektId === prosjektId) : alle)
  }

  if (req.method === 'POST') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const alle = (await redis.get('fbs_ks_sjekklister')) || []
    const id = `psl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    // Berik punkter med instance-felter når vi oppretter fra mal
    const mal = req.body
    const punkter = (mal.punkter || []).map(p => ({
      id: p.id,
      tekst: p.tekst,
      beskrivelse: p.beskrivelse || '',
      veiledning_kort: p.veiledning_kort || '',
      regelverkLenker: p.regelverkLenker || [],
      krever_bilde: p.krever_bilde || false,
      krever_signering: p.krever_signering || false,
      kommentar_pakrevd: p.kommentar_pakrevd || false,
      // Instance-data:
      status: 'ikke-utfort',
      kommentar: '',
      bilder: [],
      signert_av: null,
      signert_dato: null,
      utfort_av: null,
      utfort_dato: null,
      avvikId: null, // lenke til avvik-objekt hvis avvik registrert
    }))

    const ny = {
      id,
      prosjektId: mal.prosjektId,
      malId: mal.malId,
      malVersjon: mal.malVersjon || 1,
      navn: mal.navn,
      kategori: mal.kategori,
      gruppe: mal.gruppe || '',
      ansvarlig: mal.ansvarlig || [],
      frist: mal.frist || null,
      status: 'ikke-startet',
      punkter,
      opprettet: new Date().toISOString(),
      ferdigstilt: null,
      tildelt_av: null,
      tildelt_dato: null,
    }

    await redis.set('fbs_ks_sjekklister', [...alle, ny])
    return res.status(201).json(ny)
  }

  if (req.method === 'PUT') {
    if (!kanSkrive) return res.status(403).json({ error: 'Ingen tilgang' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })

    const alle = (await redis.get('fbs_ks_sjekklister')) || []
    const idx = alle.findIndex(s => s.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Sjekkliste ikke funnet' })

    const gammel = alle[idx]
    const oppdatert = { ...gammel, ...req.body, id, sist_endret: new Date().toISOString() }

    // Registrer tildeling
    if (req.body.ansvarlig && !gammel.tildelt_dato && req.body.ansvarlig.length > 0) {
      oppdatert.tildelt_av = session.navn || session.email || 'Ukjent'
      oppdatert.tildelt_dato = new Date().toISOString()
    }

    // Beregn status fra punkter
    if (oppdatert.punkter) {
      const ny_status = beregnStatus(oppdatert.punkter)
      oppdatert.status = ny_status
      if (ny_status === 'ferdig' && !oppdatert.ferdigstilt) {
        oppdatert.ferdigstilt = new Date().toISOString()
      } else if (ny_status !== 'ferdig') {
        oppdatert.ferdigstilt = null
      }

      // Auto-opprett avvik-objekter for punkter med avvik-status (asynkron)
      const avvikPunkter = oppdatert.punkter.filter(p => p.status === 'avvik' && !p.avvikId)
      if (avvikPunkter.length > 0) {
        const alleAvvik = (await redis.get('fbs_ks_avvik')) || []
        const nyeAvvik = avvikPunkter.map(p => {
          const avvikId = `av-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          // Koble avvikId til punktet
          const pIdx = oppdatert.punkter.findIndex(x => x.id === p.id)
          if (pIdx !== -1) oppdatert.punkter[pIdx].avvikId = avvikId
          return {
            id: avvikId,
            prosjektId: oppdatert.prosjektId,
            sjekklisteId: oppdatert.id,
            sjekkpunktId: p.id,
            tittel: p.tekst,
            beskrivelse: p.kommentar || '',
            alvorlighet: 'mindre',
            status: 'apen',
            registrert_av: session.navn || session.email || 'Ukjent',
            registrert_dato: new Date().toISOString(),
            ansvarlig_for_lukking: oppdatert.ansvarlig?.[0] || null,
            frist: oppdatert.frist || null,
            tiltak_beskrivelse: '',
            bilder: p.bilder || [],
            kommentarer: [],
            lukket_av: null,
            lukket_dato: null,
          }
        })
        await redis.set('fbs_ks_avvik', [...alleAvvik, ...nyeAvvik])
      }

      // Lukk avvik hvis punktet er satt tilbake til ok/ikke-aktuelt
      const lukketPunkter = oppdatert.punkter.filter(p => p.avvikId && (p.status === 'ok' || p.status === 'ikke-aktuelt'))
      if (lukketPunkter.length > 0) {
        const alleAvvik = (await redis.get('fbs_ks_avvik')) || []
        const oppdaterteAvvik = alleAvvik.map(a => {
          const erLukt = lukketPunkter.some(p => p.avvikId === a.id)
          if (!erLukt || a.status === 'lukket') return a
          return { ...a, status: 'lukket', lukket_av: session.navn || session.email, lukket_dato: new Date().toISOString() }
        })
        await redis.set('fbs_ks_avvik', oppdaterteAvvik)
      }
    }

    const ny = [...alle]; ny[idx] = oppdatert
    await redis.set('fbs_ks_sjekklister', ny)
    return res.status(200).json(oppdatert)
  }

  if (req.method === 'DELETE') {
    if (!isAdmin) return res.status(403).json({ error: 'Kun admin kan slette sjekklister' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Mangler id' })
    const alle = (await redis.get('fbs_ks_sjekklister')) || []
    await redis.set('fbs_ks_sjekklister', alle.filter(s => s.id !== id))
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
