// Felles Resend-sending (REST, ingen SDK-avhengighet).
// Uten RESEND_API_KEY: no-op som rapporterer skipped — aldri krasj.
export const EPOST_FRA = () => process.env.RESEND_FROM || 'FBS <noreply@follobyggservice.no>';

export async function sendEpost({ til, emne, html, tekst }) {
  const apiKey = process.env.RESEND_API_KEY;
  const mottakere = (Array.isArray(til) ? til : [til]).filter(Boolean);
  if (!mottakere.length) return { skipped: true, grunn: 'ingen mottaker' };
  if (!apiKey) return { skipped: true, grunn: 'RESEND_API_KEY mangler', til: mottakere, emne };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EPOST_FRA(), to: mottakere, subject: emne, html, ...(tekst ? { text: tekst } : {}) }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: data.message || `Resend ${r.status}`, til: mottakere, emne };
    return { sent: true, id: data.id, til: mottakere, emne };
  } catch (e) {
    return { error: e.message, til: mottakere, emne };
  }
}
