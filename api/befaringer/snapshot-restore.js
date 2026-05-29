// POST /api/befaringer/snapshot-restore
// Body: { befaringId, snapId }
// Gjenoppretter en befaring til tilstanden i snapshoten ("Tilbake til"-knapp)

import { Redis } from '@upstash/redis'
import { appendAuditLog, byggAuditEntry } from '../_dataIntegritet.js'
import { validerInterAppToken } from '../_interApp.js'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const valid = validerInterAppToken(req)
  if (!valid.ok) return res.status(valid.status).json({ error: valid.error })

  const { befaringId, snapId } = req.body || {}
  if (!befaringId || !snapId) return res.status(400).json({ error: 'Mangler befaringId eller snapId' })

  try {
    const [state, snapshots] = await Promise.all([
      redis.get('fbs_state'),
      redis.get('fbs_snapshots'),
    ])

    const snap = (snapshots || []).find(s => s.id === snapId && s.objektId === befaringId)
    if (!snap) return res.status(404).json({ error: 'Snapshot ikke funnet' })

    const befaringer = Array.isArray(state?.befaringer) ? state.befaringer : []
    const gjeldende = befaringer.find(b => b.id === befaringId)
    if (!gjeldende) return res.status(404).json({ error: 'Befaring ikke funnet i state' })

    const gjenopprettet = {
      ...snap.dataFør,
      _gjenopprettetFra: snapId,
      _gjenopprettetDato: new Date().toISOString(),
      // Rens konflikt-flagg etter gjenoppretting
      konflikt: undefined,
      manueltOverstyrtAv: undefined,
      manueltOverstyrtDato: undefined,
    }

    await redis.set('fbs_state', {
      ...state,
      befaringer: befaringer.map(b => b.id === befaringId ? gjenopprettet : b),
      _updatedAt: Date.now(),
    })

    await appendAuditLog(redis, byggAuditEntry({
      objekt: 'befaring',
      objektId: befaringId,
      felt: 'status',
      fraVerdi: gjeldende.status,
      tilVerdi: snap.dataFør.status,
      endretAv: 'gjenoppretting',
      kilde: 'bemannings-app',
      begrunnelse: `Gjenopprettet fra snapshot ${snapId} (tatt ${snap.tidspunkt})`,
    }))

    return res.status(200).json({ ok: true, gjenopprettetStatus: snap.dataFør.status })
  } catch (e) {
    console.error('[snapshot-restore] feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
