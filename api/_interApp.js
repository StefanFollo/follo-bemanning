// api/_interApp.js — felles helper for inter-app-auth (Tilbuds-appen ↔ Bemanning).
// Filer med _ foran behandles ikke som ruter av Vercel.
//
// Tilbuds-appen kaller bemanning-API-er med Bearer-token i header.
// Tokenet (INTER_APP_TOKEN) lever kun i Vercel-environment, ikke i frontend-kode.
// Begge apper må ha samme verdi satt for å virke.

export function validerInterAppToken(req) {
  const expected = process.env.INTER_APP_TOKEN
  if (!expected) {
    return { ok: false, error: 'INTER_APP_TOKEN ikke konfigurert på serveren', status: 500 }
  }
  const auth = (req.headers.authorization || '').trim()
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) {
    return { ok: false, error: 'Mangler Authorization-header', status: 401 }
  }
  if (token !== expected) {
    return { ok: false, error: 'Ugyldig inter-app-token', status: 401 }
  }
  return { ok: true }
}
