// Felles SMS-sending via Twilio REST (samme env-navn som tilbuds-appen:
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SENDER — kopiér verdiene
// inn i bemanning-prosjektet i Vercel). Uten env: no-op med skipped.

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

export async function sendSms({ til, melding }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const fra = process.env.TWILIO_SENDER;
  const tlf = normaliserNorskTlf(til);
  if (!tlf) return { error: `Ugyldig norsk telefonnummer: «${til}»` };
  if (!sid || !auth || !fra) return { skipped: true, grunn: 'TWILIO_* env mangler', til: tlf };
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: tlf, From: fra, Body: melding }).toString(),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: data.message || `Twilio ${r.status}`, til: tlf };
    return { sent: true, sid: data.sid, til: tlf };
  } catch (e) {
    return { error: e.message, til: tlf };
  }
}
