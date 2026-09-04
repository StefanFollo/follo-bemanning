// ═══ Kundeportal-lenker (postkasse-oppdrag 8) ═══
// Kundeportalen er tilbuds-appens /t/<publicToken> — kundens prosjektside.
// REN logikk, testet i tests/test-kundeportal.mjs.
//
// Regler:
// - Interne åpninger skal ALLTID ha ?intern=1 (PL-besøk telles ellers i
//   kunde-statistikken «Åpnet tilbudet Nx»)
// - «Kopier kundelenke» er UTEN intern=1 — den skal sendes til kunden
// - Mangler token → ingen knapp (aldri døde lenker)

export const TILBUDSAPP_URL = 'https://follo-befaring.vercel.app';

// Token fra et prosjekt eller en befaring. Prosjekter bærer tilbudPayload
// etter kobling; ellers slås koblet befaring opp (befaringId/kildeBefaringId).
export function kundeportalToken(objekt, befaringer) {
  if (!objekt) return null;
  const tp = objekt.tilbudPayload || {};
  const egen = tp.publicToken || tp.public_token || objekt.publicToken;
  if (egen) return String(egen);
  const befId = objekt.befaringId || objekt.kildeBefaringId;
  if (befId && Array.isArray(befaringer)) {
    const bef = befaringer.find(b => b && b.id === befId);
    const btp = (bef && bef.tilbudPayload) || {};
    if (btp.publicToken || btp.public_token) return String(btp.publicToken || btp.public_token);
  }
  return null;
}

// intern=true → ?intern=1 (PL-visning, ingen sporing); fane → #hash
// (kundeportalens faner: framdrift, endringer, bilder, meldinger, dokumenter)
export function kundeportalUrl(token, { intern = true, fane = null } = {}) {
  if (!token) return null;
  return `${TILBUDSAPP_URL}/t/${encodeURIComponent(token)}${intern ? '?intern=1' : ''}${fane ? '#' + fane : ''}`;
}
