// Felles SMS-sending — via TILBUDS-APPENS inter-app-endepunkt (PR3, Stefans
// valg (a)): POST /api/sms-interapp med Bearer INTER_APP_TOKEN og body
// { til, tekst, formaal }. Bemanning trenger INGEN Twilio-variabler.
// Til endepunktet er ute hos dem (404): { ikkeKlar: true } — klienten viser
// «SMS-tjeneste ikke klar» i stedet for å feile stille.

// Normaliser norsk nummer til E.164 (+47XXXXXXXX) — samme regler som
// tilbuds-appens send-sms.js.
export function normaliserNorskTlf(tlf) {
  if (!tlf) return null;
  let kun = String(tlf).replace(/[^\d+]/g, '');
  if (kun.startsWith('0047')) kun = '+47' + kun.slice(4);
  if (kun.startsWith('47') && kun.length === 10) kun = '+' + kun;
  if (/^\d{8}$/.test(kun)) kun = '+47' + kun;
  if (!/^\+47\d{8}$/.test(kun)) return null;
  return kun;
}

export async function sendSms({ til, melding, formaal = 'ks-lenke' }) {
  const tlf = normaliserNorskTlf(til);
  if (!tlf) return { error: `Ugyldig norsk telefonnummer: «${til}»` };
  const base = (process.env.TILBUDSAPP_URL || 'https://follo-befaring.vercel.app').replace(/\/$/, '');
  const interToken = process.env.INTER_APP_TOKEN;
  if (!interToken) return { skipped: true, grunn: 'INTER_APP_TOKEN mangler i env', til: tlf };
  try {
    const r = await fetch(base + '/api/sms-interapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + interToken },
      body: JSON.stringify({ til: tlf, tekst: melding, formaal }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 404) return { ikkeKlar: true, til: tlf }; // endepunktet ikke utrullet ennå
    if (!r.ok || data.ok === false) return { error: data.error || `sms-interapp svarte ${r.status}`, til: tlf };
    return { sent: true, til: tlf };
  } catch (e) {
    return { error: e.message, til: tlf };
  }
}
