// ═══ Felles lag-oppslag (postkasse-oppdrag 14) ═══
// «Laget» på et prosjekt = alle aktive ansatte med en tildeling på prosjektet
// i HELE prosjektperioden (fortid + framtid) — IKKE bare dagens dato.
//
// Brukes av både Framdrift-boksens fase-tildeling og KS-fanens TildelModal,
// slik at de to aldri spriker igjen (bug 14: modalen fant ikke mannskapet
// fordi den filtrerte på felter som ikke finnes / dagens dato).

export function lagForProsjekt(prosjektId, tildelinger, ansatte) {
  if (!prosjektId) return [];
  const ids = new Set((tildelinger || [])
    .filter(t => t && t.prosjektId === prosjektId)
    .map(t => t.ansattId));
  return (ansatte || []).filter(a => a && !a.arkivert && ids.has(a.id));
}

// Navneliste-variant (KS-fanens ansvarlig-modell er navn, satt i TildelModal)
export function lagNavnForProsjekt(prosjektId, tildelinger, ansatte) {
  return [...new Set(lagForProsjekt(prosjektId, tildelinger, ansatte).map(a => a.navn))];
}
