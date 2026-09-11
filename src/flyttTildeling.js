// src/flyttTildeling.js — ren logikk for «dra prosjekt-stolpe mellom ansatte»
// (postkasse-oppdrag 29 del 2). Ingen React, ingen I/O — testes i
// tests/test-pipeline.mjs. Flytt = «slett gammel + opprett ny» (tombstone
// som i dag), kopier = behold original + ny på mottaker, samme ansatt =
// flytt i tid med dag-oppløsning. Konflikter rapporteres — aldri
// overskrevet stille.

import { ukeNr, addDays } from './pipeline.js';

const FERIE_ID = '__FERIE__';

function dagerMellom(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
function overlapper(aS, aE, bS, bE) { return aS <= bE && bS <= aE; }

export function ukeSpenn(startDato, sluttDato) {
  const u1 = ukeNr(startDato), u2 = ukeNr(sluttDato);
  return u1 === u2 ? `u${u1}` : `u${u1}–${u2}`;
}

// Planlegger hva et slipp skal gjøre.
//  tildeling: den som dras · grepDag: dagen musa grep stolpen på
//  mottakerId: ansatt-rad sluppet på · dag: kolonne sluppet på
//  kopier: Alt/Ctrl holdt · tildelinger: alle (for konfliktsjekk)
// Returnerer { handling, ny, slettIds, konflikter, loggTekst } eller null
// når slippet ikke gjør noe (samme sted).
export function planleggSlipp({ tildeling: t, grepDag, mottakerId, dag, kopier = false, tildelinger = [], ansatteById = {}, prosjekter = [], av = 'ukjent' }) {
  if (!t || !mottakerId || !dag) return null;
  const varighet = dagerMellom(t.startDato, t.sluttDato);
  const offset = grepDag && grepDag >= t.startDato && grepDag <= t.sluttDato ? dagerMellom(t.startDato, grepDag) : 0;
  const sammeAnsatt = mottakerId === t.ansattId;
  const p = prosjekter.find(x => x.id === t.prosjektId);
  const pNavn = p ? (p.adresse || p.navn) : (t.prosjektId === FERIE_ID ? 'Ferie / Fri' : 'prosjekt');
  const navn = id => (ansatteById[id]?.navn || '?').split(' ')[0];

  if (sammeAnsatt) {
    // Flytt i tid (dag-oppløsning), samme varighet
    const nyStart = addDays(dag, -offset);
    if (nyStart === t.startDato) return null;
    const nySlutt = addDays(nyStart, varighet);
    const konflikter = t.prosjektId === FERIE_ID ? [] : tildelinger.filter(x => x && x.id !== t.id && x.ansattId === t.ansattId
      && x.prosjektId !== FERIE_ID && overlapper(nyStart, nySlutt, x.startDato, x.sluttDato));
    return {
      handling: 'flyttTid',
      oppdater: { ...t, startDato: nyStart, sluttDato: nySlutt },
      ny: null, slettIds: [], konflikter,
      loggTekst: `Flyttet i tid ${ukeSpenn(t.startDato, t.sluttDato)} → ${ukeSpenn(nyStart, nySlutt)} · ${pNavn} · ${navn(t.ansattId)} · ${av}`,
    };
  }

  // Annen ansatt: flytt (standard) eller kopier — samme datoer
  const konflikter = t.prosjektId === FERIE_ID ? [] : tildelinger.filter(x => x && x.ansattId === mottakerId
    && x.prosjektId !== FERIE_ID && overlapper(t.startDato, t.sluttDato, x.startDato, x.sluttDato));
  const ny = { ansattId: mottakerId, prosjektId: t.prosjektId, startDato: t.startDato, sluttDato: t.sluttDato };
  return {
    handling: kopier ? 'kopier' : 'flytt',
    oppdater: null, ny,
    slettIds: kopier ? [] : [t.id],
    konflikter,
    loggTekst: `${kopier ? 'Kopiert' : 'Flyttet'} fra ${navn(t.ansattId)} til ${navn(mottakerId)} · ${pNavn} · ${ukeSpenn(t.startDato, t.sluttDato)} · ${av}`,
  };
}

// Tekst til konflikt-dialogen: «Overlapper Lindemansveien u38»
export function konfliktTekst(konflikter, prosjekter = []) {
  if (!konflikter.length) return '';
  const k = konflikter[0];
  const p = prosjekter.find(x => x.id === k.prosjektId);
  const flere = konflikter.length > 1 ? ` (+${konflikter.length - 1} til)` : '';
  return `Overlapper ${p ? (p.adresse || p.navn) : 'annen tildeling'} ${ukeSpenn(k.startDato, k.sluttDato)}${flere}`;
}
