// ═══ Kundeportal fase 3: framdriftsplan → tilbuds-appens kundeside ═══
// (SPEC-kundeportal.md VEDLEGG, postkasse-oppdrag 6). REN logikk — testet i
// tests/test-framdrift-eksport.mjs.
//
// 🛑 Payloaden er STRENGT hvitlistet: tittel, status, periodeTekst,
// ferdigDato per milepæl — ALDRI personnavn, timer, fag, pct eller
// bemanningsdata. Kilden er prosjektets fdTasks (dag-offset/varighet i
// 5-dagers uker fra fdStartWeek/fdStartYear).

// Mandag i en gitt ISO-uke/år
export function mandagIUke(uke, aar) {
  const d = new Date(Date.UTC(aar, 0, 4)); // 4. januar er alltid i uke 1
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - dag + 1 + (uke - 1) * 7);
  return d;
}
// ISO-uke/år for en dato (UTC)
export function isoUke(dato) {
  const d = new Date(Date.UTC(dato.getUTCFullYear(), dato.getUTCMonth(), dato.getUTCDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const aar = d.getUTCFullYear();
  const uke = Math.ceil(((d - Date.UTC(aar, 0, 1)) / 86400000 + 1) / 7);
  return { uke, aar };
}

// fdTasks-dagoffset (5-dagers uker) → kalenderdato
function fasedato(fdStartWeek, fdStartYear, dagOffset) {
  const mandag = mandagIUke(fdStartWeek, fdStartYear);
  const d = new Date(mandag);
  d.setUTCDate(d.getUTCDate() + Math.floor(dagOffset / 5) * 7 + (dagOffset % 5));
  return d;
}

// «uke 42» / «uke 42–45» / «uke 52/2026–uke 2/2027» (årsskifte håndteres)
export function periodeTekstForFase(fdStartWeek, fdStartYear, start, dur) {
  const fra = isoUke(fasedato(fdStartWeek, fdStartYear, start));
  const til = isoUke(fasedato(fdStartWeek, fdStartYear, start + Math.max(1, dur) - 1));
  if (fra.aar !== til.aar) return `uke ${fra.uke}/${fra.aar}–uke ${til.uke}/${til.aar}`;
  if (fra.uke === til.uke) return `uke ${fra.uke}`;
  return `uke ${fra.uke}–${til.uke}`;
}

function statusForFase(t, fdStartWeek, fdStartYear, iDagDato) {
  const pct = Number(t.pct) || 0;
  if (pct >= 100) return 'ferdig';
  const fra = fasedato(fdStartWeek, fdStartYear, t.start || 0);
  const til = fasedato(fdStartWeek, fdStartYear, (t.start || 0) + Math.max(1, t.dur || 1) - 1);
  if (pct > 0 || (iDagDato >= fra && iDagDato <= til) || iDagDato > til) return 'pagar';
  return 'kommer';
}

// Kobling: prosjektets befaring → befaring.tilbudId. «Koble til tilbud…»
// setter både befaringId og kildeBefaringId, men eldre/andre flyter kan ha
// bare én av dem — godta begge.
export function tilbudIdForProsjekt(prosjekt, befaringer) {
  if (!prosjekt) return null;
  const befId = prosjekt.befaringId || prosjekt.kildeBefaringId;
  if (!befId) return null;
  const bef = (befaringer || []).find(b => b && b.id === befId);
  return (bef && bef.tilbudId) || null;
}

// Startuke for planen: eksplisitt fdStartWeek/fdStartYear, ellers utledet fra
// prosjektets startDato — samme fallback som gantt-visningen bruker (den viser
// uker selv om feltet aldri ble satt, f.eks. etter «Legg til standard byggefaser»).
export function startukeForProsjekt(prosjekt) {
  if (prosjekt.fdStartWeek && prosjekt.fdStartYear) return { uke: prosjekt.fdStartWeek, aar: prosjekt.fdStartYear };
  if (prosjekt.startDato) {
    const u = isoUke(new Date(prosjekt.startDato + 'T12:00:00Z'));
    if (Number.isFinite(u.uke)) return u;
  }
  return null;
}

// Hovedfunksjon → { tilbudId, framdrift } eller null (mangler kobling/plan).
// naa/iDag injiseres for testbarhet.
export function byggFramdriftPayload(prosjekt, befaringer, { iDag, naa } = {}) {
  const tilbudId = tilbudIdForProsjekt(prosjekt, befaringer);
  if (!tilbudId) return null;
  const tasks = Array.isArray(prosjekt.fdTasks) ? prosjekt.fdTasks : [];
  const startuke = startukeForProsjekt(prosjekt);
  if (!tasks.length || !startuke) return null;
  const iDagDato = iDag ? new Date(iDag + 'T12:00:00Z') : new Date();
  const milepaler = tasks.map(t => ({
    tittel: String(t.name || t.navn || 'Fase').slice(0, 200),
    status: statusForFase(t, startuke.uke, startuke.aar, iDagDato),
    periodeTekst: periodeTekstForFase(startuke.uke, startuke.aar, t.start || 0, t.dur || 1),
    ferdigDato: null, // spores ikke per fase i dag — kontrakten tillater null
  }));
  return {
    tilbudId,
    framdrift: { oppdatert: naa || new Date().toISOString(), milepaler },
  };
}

// Hash uten tidsstempel — brukes til å hoppe over sendinger uten reell endring
// (pct-kryp under 100 % endrer ingenting kundesynlig → samme hash).
export function payloadHash(payload) {
  if (!payload) return null;
  const s = JSON.stringify({ tilbudId: payload.tilbudId, milepaler: payload.framdrift.milepaler });
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return String(h);
}
