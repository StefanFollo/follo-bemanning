// Kryptering av backup-blobs (AES-256-GCM).
// Blob-lagringen er offentlig tilgjengelig (privat tier krever premium-plan),
// så innholdet MÅ krypteres — det er hele kundedatabasen.
// Nøkkel: BACKUP_KEY (anbefalt) eller CRON_SECRET som fallback.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

function nokkel() {
  const secret = process.env.BACKUP_KEY || process.env.CRON_SECRET
  if (!secret) return null
  return createHash('sha256').update(secret).digest()
}

export function harBackupNokkel() {
  return !!nokkel()
}

// jsonStr → kryptert konvolutt-JSON (string), eller null hvis nøkkel mangler
export function krypterBackup(jsonStr) {
  const key = nokkel()
  if (!key) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()])
  return JSON.stringify({
    fbsEnc: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: enc.toString('base64'),
  })
}

export function dekrypterBackup(konvolutt) {
  const key = nokkel()
  if (!key) throw new Error('BACKUP_KEY/CRON_SECRET mangler — kan ikke dekryptere backup')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(konvolutt.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(konvolutt.tag, 'base64'))
  const dec = Buffer.concat([decipher.update(Buffer.from(konvolutt.data, 'base64')), decipher.final()])
  return JSON.parse(dec.toString('utf8'))
}

// Hent og les en backup-blob — håndterer både kryptert og eldre ukryptert format
export async function lesBackupBlob(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Kunne ikke hente backup-blob: HTTP ${r.status}`)
  const parsed = await r.json()
  if (parsed && parsed.fbsEnc) return dekrypterBackup(parsed)
  return parsed
}
