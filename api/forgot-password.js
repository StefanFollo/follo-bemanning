import { Redis } from '@upstash/redis';
import { randomBytes } from 'crypto';

// Samme mønster som login.js: x-real-ip kan ikke forfalskes av klienten.
function klientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return req.headers['x-real-ip'] || xff[xff.length - 1] || 'unknown';
}
async function rateLimit(nokkel, maks) {
  try {
    const key = `fbs_attempts:${nokkel}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, 900);
    return attempts > maks;
  } catch {
    return false;
  }
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function sendResetEmail(toEmail, toNavn, resetUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { skipped: true, resetUrl };

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#f8fafc;border-radius:12px">
      <div style="background:#1e3a5f;color:white;padding:16px 24px;border-radius:8px;margin-bottom:24px">
        <h1 style="margin:0;font-size:20px">FBS – Tilbakestill passord</h1>
        <p style="margin:4px 0 0;opacity:0.8;font-size:14px">FolloByggService</p>
      </div>
      <p>Hei${toNavn ? ` ${toNavn}` : ''},</p>
      <p>Vi mottok en forespørsel om å tilbakestille passordet ditt.</p>
      <p>Klikk på knappen nedenfor for å velge et nytt passord. Lenken er gyldig i <strong>1 time</strong>.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="${resetUrl}" style="background:#1e3a5f;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600">
          Sett nytt passord
        </a>
      </div>
      <p style="color:#6b7280;font-size:13px">Hvis du ikke ba om dette, kan du ignorere denne e-posten. Ingen endringer er gjort.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px;text-align:center">FolloByggService AS – Bemanningssystem</p>
    </div>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'FBS <noreply@follobyggservice.no>',
        to: [toEmail],
        subject: 'Tilbakestill passordet ditt – FBS',
        html,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Resend feil');
    return { sent: true };
  } catch (e) {
    return { error: e.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { email } = body || {};
  if (!email) return res.status(400).json({ error: 'E-post er påkrevd.' });

  const emailKey = email.trim().toLowerCase();

  // Endepunktet er uautentisert — uten sperre kan hvem som helst spamme
  // reset-eposter til de ansatte (sikkerhetsrunden pkt 2). 3 per 15 min
  // per e-post OG per IP; svarer 200 uansett så konto-eksistens ikke lekker.
  if (await rateLimit(`reset-ip:${klientIp(req)}`, 3) || await rateLimit(`reset-epost:${emailKey}`, 3)) {
    console.warn('[forgot-password] rate-limit truffet for', emailKey);
    return res.status(200).json({ ok: true });
  }
  const user = await redis.get(`fbs_user:${emailKey}`);

  // Always respond OK (don't reveal if email exists)
  if (!user) return res.status(200).json({ ok: true });

  const token = randomBytes(32).toString('hex');
  await redis.set(`fbs_reset:${token}`, emailKey, { ex: 3600 });

  const baseUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const resetUrl = `${baseUrl}/?reset=${token}`;

  const result = await sendResetEmail(emailKey, user.navn, resetUrl);

  // SIKKERHET: reset-lenken må ALDRI returneres i produksjon. Endepunktet er
  // uautentisert — en returnert lenke gir kontoovertakelse til hvem som helst
  // som kjenner e-postadressen. Kun i lokal utvikling.
  const erProduksjon = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if ((result.skipped || result.error) && !erProduksjon) {
    return res.status(200).json({ ok: true, devResetUrl: resetUrl });
  }
  if (result.skipped) console.error('[forgot-password] RESEND_API_KEY mangler — reset-epost IKKE sendt til', emailKey);
  if (result.error) console.error('[forgot-password] e-postutsending feilet:', result.error);

  return res.status(200).json({ ok: true });
}
