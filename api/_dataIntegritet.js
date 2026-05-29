// api/_dataIntegritet.js — delt hjelpemodul for data-integritet
// Audit-log: fbs_audit_log  (append-only, maks 10 000 oppføringer)
// Snapshots:  fbs_snapshots (maks 2 000, renser etter 90 dager)

const MAX_AUDIT = 10000
const MAX_SNAPS = 2000

function nyId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// Bygg en audit-oppføring (returneres — appendAuditLog lagrer den)
export function byggAuditEntry({ objekt, objektId, felt, fraVerdi, tilVerdi, endretAv, kilde, begrunnelse }) {
  const naa = new Date().toISOString()
  return {
    id: nyId('log'),
    objekt,
    objektId,
    endring: { felt, fraVerdi, tilVerdi, tilDato: naa },
    endretAv: endretAv || 'ukjent',
    endretDato: naa,
    kilde: kilde || 'bemannings-app',
    begrunnelse: begrunnelse || null,
  }
}

// Legg til i fbs_audit_log (fail-soft — logger men kaster ikke videre)
export async function appendAuditLog(redis, entry) {
  try {
    const existing = (await redis.get('fbs_audit_log')) || []
    await redis.set('fbs_audit_log', [...existing, entry].slice(-MAX_AUDIT))
  } catch (e) {
    console.error('[audit] appendAuditLog feil:', e.message)
  }
}

// Ta et øyeblikksbilde av et objekt FØR kritisk endring
// Returnerer snap-objektet (eller null ved feil)
export async function appendSnapshot(redis, { objekt, objektId, dataFør, utløstAv }) {
  try {
    const naa = new Date().toISOString()
    const snap = {
      id: nyId('snap'),
      objekt,
      objektId,
      dataFør,
      tidspunkt: naa,
      utløstAv,
      oppbevartTil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    }
    const existing = (await redis.get('fbs_snapshots')) || []
    // Rens utløpte snapshots
    const gjeldende = existing.filter(s => s.oppbevartTil > naa)
    await redis.set('fbs_snapshots', [...gjeldende, snap].slice(-MAX_SNAPS))
    return snap
  } catch (e) {
    console.error('[snapshot] appendSnapshot feil:', e.message)
    return null
  }
}
