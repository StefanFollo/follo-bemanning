// ═══ Fase 3: Reparasjonsverktøy for tilbud↔befaring-koblinger ═══
// REN logikk (testet i tests/test-reparasjon-koblinger.mjs).
//
// INGEN bulk, INGEN auto, INGEN sletting: verktøyet klassifiserer og
// FORESLÅR — hver sak avgjøres av Stefan, alt er reversibelt via
// fbs_reparasjon_historikk (tømmes aldri).

import { kandidatScore } from './mergeProsjekter.js';

// Tilbuds-appens salgsstatus → befaringens kolonne (samme mapping som event.js)
export const SALGS_STATUS_MAP = {
  'tilbud-sendt': 'tilbud_sendt',
  'tilbud_sendt': 'tilbud_sendt',
  'tilbud-under-arbeid': 'tilbud_arbeid',
  'tilbud_arbeid': 'tilbud_arbeid',
  'under-arbeid': 'tilbud_arbeid',
  'kladd': 'tilbud_arbeid',
  'vunnet': 'godkjent',
  'godkjent': 'godkjent',
  'tapt': 'tapt',
  'avvist': 'tapt',
  'trukket': 'tilbud_arbeid',
  'lead': 'lead',
  'planlagt': 'planlagt',
};
export function mapSalgsStatus(s) {
  return SALGS_STATUS_MAP[(s || '').toLowerCase().trim()] || null;
}

// Klassifiser rapport-lista mot befaringene i state.
// → { friske, spokelser, mismatch } — sakene bevarer rapport-feltene.
export function klassifiserKoblinger(koblinger, befaringer) {
  const friske = [], spokelser = [], mismatch = [];
  for (const k of koblinger || []) {
    if (!k) continue;
    const bef = (befaringer || []).find(b => b && b.id === k.kildeBefaringId);
    if (!bef) {
      spokelser.push({ ...k, type: 'spokelse' });
      continue;
    }
    const forventet = mapSalgsStatus(k.salgsStatus);
    if (forventet && bef.status !== forventet) {
      mismatch.push({ ...k, type: 'mismatch', befaringId: bef.id, befaringStatus: bef.status, forventetStatus: forventet });
    } else {
      friske.push({ ...k, type: 'frisk', befaringId: bef.id });
    }
  }
  return { friske, spokelser, mismatch };
}

// Fuzzy-forslag for en spøkelse-kobling: beste befaring-match på
// adresse/kundenavn (gjenbruker merge-motoren — husnummer må matche eksakt).
export function forslagForSpokelse(sak, befaringer) {
  const kilde = { adresse: sak.adresse || '', navn: sak.kundenavn || '', kunde: { navn: sak.kundenavn || '' } };
  let best = null;
  for (const b of befaringer || []) {
    if (!b || b.arkivert) continue;
    const score = kandidatScore(kilde, { adresse: b.adresse, navn: b.kontaktNavn, kunde: { navn: b.kontaktNavn } });
    if (score >= 30 && (!best || score > best.score)) best = { befaring: b, score };
  }
  return best; // null når ingenting matcher godt nok
}

// «Velg annen…»-listen: ALLE ikke-arkiverte befaringer uansett status —
// status filtrerer ALDRI her (et vunnet tilbud hører typisk hjemme hos en
// GODKJENT befaring). Sortert med beste fuzzy-kandidat øverst, også når
// scoren er lav; delvis kundenavn-treff («Sameiet Søndre Moer B6» ↔
// «Søndre Moer b6») løfter rader kandidatScore alene gir 0.
function normNavnLokal(s) {
  return (s || '').toLowerCase().replace(/[^a-zæøå0-9]/g, '');
}
function delvisNavnScore(a, b) {
  const na = normNavnLokal(a), nb = normNavnLokal(b);
  if (!na || !nb || na === nb) return 0; // eksakt treff scorer kandidatScore selv
  return (na.includes(nb) || nb.includes(na)) ? 25 : 0;
}
export function rangerKandidater(sak, befaringer) {
  const kilde = { adresse: sak.adresse || '', navn: sak.kundenavn || '', kunde: { navn: sak.kundenavn || '' } };
  return (befaringer || [])
    .filter(b => b && !b.arkivert)
    .map(b => ({
      befaring: b,
      score: kandidatScore(kilde, { adresse: b.adresse, navn: b.kontaktNavn, kunde: { navn: b.kontaktNavn } })
        + delvisNavnScore(sak.kundenavn, b.kontaktNavn),
    }))
    .sort((x, y) => y.score - x.score
      || String(x.befaring.adresse || x.befaring.kontaktNavn || '').localeCompare(
           String(y.befaring.adresse || y.befaring.kontaktNavn || ''), 'nb'));
}

// ── Sak-avgjørelser (rene — muterer ingenting) ──────────────────────

// Spøkelse godkjent: koble tilbudet til valgt befaring.
// Setter tilbudId (så framtidige events matcher) + payload-kopi hvis
// rapporten bærer payload og befaringen mangler den. ALDRI status-endring her.
export function beregnKobleTilbud(befaring, sak) {
  const før = {
    tilbudId: befaring.tilbudId,
    tilbudLink: befaring.tilbudLink,
    harPayload: !!befaring.tilbudPayload,
  };
  const nyBefaring = {
    ...befaring,
    tilbudId: sak.tilbudId,
    ...(sak.tilbudLink && !befaring.tilbudLink ? { tilbudLink: sak.tilbudLink } : {}),
    ...(sak.tilbudPayload && !befaring.tilbudPayload
      ? { tilbudPayload: { ...sak.tilbudPayload, _mottattType: 'reparasjon', _mottattDato: new Date().toISOString() } }
      : {}),
  };
  return { nyBefaring, før };
}

// Mismatch: bruk tilbudets status (vernes av manueltOverstyrtAv i UI-et).
// før-verdiene inkluderer vern-feltene, siden UI-et nullstiller dem ved fiksen.
export function beregnStatusFix(befaring, sak) {
  const før = {
    status: befaring.status,
    manueltOverstyrtAv: befaring.manueltOverstyrtAv,
    manueltOverstyrtDato: befaring.manueltOverstyrtDato,
  };
  return {
    nyBefaring: { ...befaring, status: sak.forventetStatus },
    før,
  };
}

// Angre en sak: sett de loggede før-verdiene tilbake — kun feltene vi rørte.
// VIKTIG: UPDATE_BEFARING-reduceren MERGER payload ({...b, ...payload}) —
// felter må derfor settes eksplisitt til undefined, aldri bare slettes fra
// objektet (en manglende nøkkel overlever merge, undefined droppes ved lagring).
export function beregnAngreSak(befaring, sak) {
  const ny = { ...befaring };
  if (sak.handling === 'koblet') {
    ny.tilbudId = sak.før.tilbudId !== undefined ? sak.før.tilbudId : undefined;
    ny.tilbudLink = sak.før.tilbudLink !== undefined ? sak.før.tilbudLink : undefined;
    if (!sak.før.harPayload) ny.tilbudPayload = undefined;
  }
  if (sak.handling === 'status-fikset') {
    ny.status = sak.før.status;
    ny.manueltOverstyrtAv = sak.før.manueltOverstyrtAv !== undefined ? sak.før.manueltOverstyrtAv : undefined;
    ny.manueltOverstyrtDato = sak.før.manueltOverstyrtDato !== undefined ? sak.før.manueltOverstyrtDato : undefined;
  }
  return { nyBefaring: ny };
}

// ── Historikk (localStorage — tømmes aldri) ─────────────────────────
const HIST_NØKKEL = 'fbs_reparasjon_historikk';
export function hentReparasjonHistorikk() {
  try { return JSON.parse(localStorage.getItem(HIST_NØKKEL) || '[]'); } catch { return []; }
}
export function leggTilReparasjonHistorikk(innslag) {
  try {
    const hist = hentReparasjonHistorikk();
    hist.push(innslag);
    localStorage.setItem(HIST_NØKKEL, JSON.stringify(hist));
  } catch { /* ikke kritisk */ }
}
