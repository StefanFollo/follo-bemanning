// Manuell sikkerhetskopi (admin):
//   GET  → laster ned full backup som JSON-fil
//   POST → sender backupen som e-postvedlegg til innlogget admin
//          (eller valgfri adresse i body: { til: 'epost@...' })
//
// Auth: Bearer-token med role=admin

import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  const session = await redis.get(`fbs_session:${token}`)
  if (!session || session.role !== 'admin') return null
  return session
}

async function byggBackup() {
  const [state, auditLog, snapshots] = await Promise.all([
    redis.get('fbs_state'),
    redis.get('fbs_audit_log'),
    redis.get('fbs_snapshots'),
  ])
  const statistikk = {
    befaringer: (state?.befaringer || []).length,
    prosjekter: (state?.prosjekter || []).length,
    ansatte: (state?.ansatte || []).length,
    tildelinger: (state?.tildelinger || []).length,
    serviceJobber: (state?.serviceJobber || []).length,
    reklamasjoner: (state?.reklamasjoner || []).length,
    biler: (state?.biler || []).length,
  }
  return {
    meta: {
      tidspunkt: new Date().toISOString(),
      type: 'manuell',
      versjon: '1.0',
      statistikk,
    },
    state: state || {},
    auditLog: auditLog || [],
    snapshots: snapshots || [],
  }
}

function filnavn() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `fbs-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
}

export const config = {
  api: { bodyParser: { sizeLimit: '16kb' } },
}

export default async function handler(req, res) {
  const bruker = await requireAdmin(req)
  if (!bruker) return res.status(403).json({ error: 'Krever admin-rolle' })

  try {
    const backup = await byggBackup()
    const json = JSON.stringify(backup)

    // ── GET: last ned som fil ──
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filnavn()}"`)
      console.log(`[manuell-backup] ${bruker.email} lastet ned (${json.length} bytes)`)
      return res.status(200).send(json)
    }

    // ── POST: send som e-postvedlegg ──
    if (req.method === 'POST') {
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) return res.status(500).json({ error: 'E-postutsending er ikke konfigurert (RESEND_API_KEY mangler)' })

      let body = req.body
      if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
      const til = (body?.til || bruker.email || '').trim()
      if (!til || !til.includes('@')) return res.status(400).json({ error: 'Ingen gyldig mottaker-adresse' })

      const s = backup.meta.statistikk
      const naa = new Date().toLocaleString('no-NO')
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'FBS <noreply@follobyggservice.no>',
          to: [til],
          subject: `FBS sikkerhetskopi – ${naa}`,
          html: `
            <div style="font-family:Arial,sans-serif;color:#1c1c1c;max-width:520px">
              <div style="background:#1e3a5f;color:#fff;padding:12px 18px;border-radius:6px 6px 0 0;font-weight:700">
                💾 Sikkerhetskopi – FolloByggService bemanningssystem
              </div>
              <div style="border:1px solid #e0e4ed;border-top:none;padding:16px 18px">
                <p>Vedlagt ligger en fullstendig sikkerhetskopi tatt ${naa} av ${bruker.navn || bruker.email}.</p>
                <p style="font-size:13px;color:#555">
                  ${s.prosjekter} prosjekter · ${s.befaringer} befaringer · ${s.tildelinger} tildelinger ·
                  ${s.ansatte} ansatte · ${s.serviceJobber} servicejobber · ${s.reklamasjoner} reklamasjoner · ${s.biler} biler
                </p>
                <p style="font-size:12px;color:#888">Oppbevar filen trygt — den inneholder alle kunde- og prosjektdata.
                Gjenoppretting: kontakt systemansvarlig.</p>
              </div>
            </div>
          `,
          attachments: [{
            filename: filnavn(),
            content: Buffer.from(json, 'utf8').toString('base64'),
          }],
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.message || `Resend-feil (HTTP ${r.status})`)

      console.log(`[manuell-backup] ${bruker.email} sendte backup (${json.length} bytes) til ${til}`)
      return res.status(200).json({ ok: true, sendtTil: til, storrelseBytes: json.length })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[manuell-backup] feil:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
