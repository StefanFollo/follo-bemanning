// POST /api/admin/backup
// Kalles av Vercel Cron (kl 02:00 UTC daglig) — tar backup av all Redis-data til Vercel Blob.
// Kan også kalles manuelt med Authorization: Bearer {CRON_SECRET}

import { Redis } from '@upstash/redis'
import { put } from '@vercel/blob'
import { Resend } from 'resend'

export const config = {
  api: { bodyParser: false },
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

async function sendAlarmEpost(feilmelding) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: process.env.RESEND_FROM || 'FBS <noreply@follobyggservice.no>',
      to: 'post@follobyggservice.no',
      subject: '⚠️ BACKUP FEILET — Follo Byggservice bemanningssystem',
      html: `
        <div style="font-family:Arial,sans-serif;color:#1c1c1c">
          <div style="background:#dc2626;color:#fff;padding:12px 18px;border-radius:6px 6px 0 0;font-weight:700">
            ⚠️ DAGLIG BACKUP FEILET
          </div>
          <div style="border:1px solid #e0e4ed;border-top:none;padding:16px 18px">
            <p>Den automatiske nattsikkerheten feilet med følgende feil:</p>
            <pre style="background:#f8fafc;padding:10px;border-radius:4px;font-size:13px">${feilmelding}</pre>
            <p>Sjekk Vercel-loggene umiddelbart og verifiser at data er intakt.</p>
            <p style="font-size:11px;color:#888">Automatisk varsel ${new Date().toLocaleString('no-NO')}</p>
          </div>
        </div>
      `,
    })
  } catch (e) {
    console.error('[backup] Alarm-epost feilet:', e.message)
  }
}

export default async function handler(req, res) {
  // Autentisering: Vercel Cron setter Authorization-header automatisk med CRON_SECRET
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.authorization
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Ikke autorisert' })
    }
  }
  if (req.method !== 'POST') return res.status(405).end()

  const startTid = Date.now()
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  try {
    // Hent all data fra Redis parallelt
    const [state, auditLog, snapshots, sisteBackup] = await Promise.all([
      redis.get('fbs_state'),
      redis.get('fbs_audit_log'),
      redis.get('fbs_snapshots'),
      redis.get('fbs_siste_backup'),
    ])

    const statistikk = {
      befaringer: (state?.befaringer || []).length,
      prosjekter: (state?.prosjekter || []).length,
      ansatte: (state?.ansatte || []).length,
      tildelinger: (state?.tildelinger || []).length,
      auditEntries: (auditLog || []).length,
      snapshots: (snapshots || []).length,
    }

    const backupData = {
      meta: {
        tidspunkt: new Date().toISOString(),
        versjon: '1.0',
        statistikk,
      },
      state: state || {},
      auditLog: auditLog || [],
      snapshots: snapshots || [],
    }

    const json = JSON.stringify(backupData)
    const filnavn = `backup/fbs-${ts}.json`

    const blob = await put(filnavn, json, {
      access: 'public',  // private krever premium Blob-plan
      contentType: 'application/json',
    })

    // Oppdater "siste vellykkede backup"-nøkkel
    const backupInfo = {
      tidspunkt: backupData.meta.tidspunkt,
      url: blob.url,
      statistikk,
      storrelseBytes: json.length,
    }
    await redis.set('fbs_siste_backup', backupInfo)

    const varighet = Date.now() - startTid
    console.log(`[backup] OK — ${json.length} bytes → ${blob.url} (${varighet}ms)`)

    return res.status(200).json({
      ok: true,
      url: blob.url,
      statistikk,
      storrelseBytes: json.length,
      varighetMs: varighet,
    })
  } catch (e) {
    console.error('[backup] FEIL:', e.message)
    await sendAlarmEpost(e.message)
    return res.status(500).json({ error: e.message })
  }
}
