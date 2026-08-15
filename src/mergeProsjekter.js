// ═══════════════════════════════════════════════════════════════════
// Slå sammen duplikat-prosjekter — REN logikk (SPEC-merge-prosjekter.md)
//
// 🔒 KJERNEPRINSIPP: Denne modulen inneholder INGEN slette-kode.
// Merge gjør nøyaktig to ting: KOPIERER felter til hovedprosjektet og
// ARKIVERER sekundærprosjektet med all data intakt. Angre gjenoppretter
// eksakt før-tilstand. Alt her er rene funksjoner uten side-effekter —
// testet i tests/test-merge-prosjekter.mjs (alle 8 spec-krav).
// ═══════════════════════════════════════════════════════════════════

// Gruppe A — tilbudsfelter. Følger ALLTID med fra prosjektet som har
// tilbuds-kobling, også over manuelt utfylte verdier (Stefans krav 15.08):
// tilbudets kalkyle skal aldri tapes til fordel for grove manuelle anslag.
export const TILBUDSFELTER = [
  'poster', 'fag', 'pristype', 'belop', 'estimertSum', 'valgteOpsjoner',
  'tilbudLink', 'kildeBefaringId', 'befaringId', 'tilbudPayload',
  'oppstartTekst', 'varighetTekst', 'varighetUker',
];

// Gruppe B — driftsfelter: hovedprosjektet beholder sitt, tomme fylles
// fra sekundær. (Øvrige ukjente felter på sekundær behandles likt.)
export const DRIFTSFELTER = [
  'startDato', 'sluttDato', 'status', 'farge', 'prosjektlederId',
  'beskrivelse', 'jobbType', 'kunde', 'ksSjekklister',
  'fdTasks', 'fdProgress', 'fdStatus', 'fdStartWeek', 'fdTotalWeeks',
];

// Felter som aldri kopieres/fylles automatisk (identitet + merge-metadata).
const IGNORER_FELT = new Set([
  'id', '_endret', 'navn', 'adresse',
  'arkivert', 'arkivertDato', 'arkivertAv', 'mergetInn', 'mergetFra',
]);

export function harTilbud(p) {
  return !!(
    p && (
      p.tilbudPayload || p.kildeBefaringId || p.befaringId || p.tilbudLink ||
      (Array.isArray(p.poster) && p.poster.length > 0)
    )
  );
}

export function erTom(v) {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return true;
  return false;
}

export function likVerdi(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

// ── Fuzzy-forslag ────────────────────────────────────────────────────

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

// «Bagerens Vei 11B, 1542 Vestby» → { gate: 'bagerens vei', nummer: '11b' }
// vei/veien/vn/v. likestilles; postnummer/sted ignoreres.
export function delAdresse(s) {
  const rens = (s || '')
    .toLowerCase()
    .split(',')[0]
    .replace(/[^a-zæøå0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = rens.match(/^(.*?)\s*(\d+\s*[a-z]?)$/);
  let gate = m ? m[1].trim() : rens;
  const nummer = m ? m[2].replace(/\s/g, '') : '';
  // «vei/veien/veg/vegen» likestilles også når det henger sammen med gatenavnet
  // («Bagerensveien» → «bagerensvei»); «vn»/«v» kun som eget ord.
  gate = gate
    .replace(/(vei|veg)(en)?$/, 'vei')
    .replace(/\s(vn|v)$/, ' vei')
    .replace(/\s+/g, ' ').trim();
  return { gate, nummer };
}

function normNavn(s) {
  return (s || '').toLowerCase().replace(/[^a-zæøå0-9]/g, '');
}

// Kandidat-score for «ligner på»-forslag. 0 = ikke kandidat.
// Regler (spec): Levenshtein ≤3 på gatenavn, husnummer MÅ matche eksakt
// når begge har nummer, kundenavn-match vekter sterkt, manglende
// postnummer hindrer ingenting (postnummer brukes ikke).
export function kandidatScore(a, b) {
  const adrA = delAdresse(a.adresse || a.navn);
  const adrB = delAdresse(b.adresse || b.navn);
  let score = 0;

  if (adrA.gate && adrB.gate) {
    const avstand = levenshtein(adrA.gate, adrB.gate);
    if (avstand <= 3) {
      if (adrA.nummer && adrB.nummer && adrA.nummer !== adrB.nummer) {
        // Husnummer må matche eksakt — 11 ≠ 13
        score = 0;
      } else {
        score += avstand === 0 ? 60 : 40 - avstand * 5;
        if (adrA.nummer && adrB.nummer) score += 20;
      }
    }
  }

  const kundeA = normNavn(a.kunde?.navn);
  const kundeB = normNavn(b.kunde?.navn);
  if (kundeA && kundeB && kundeA === kundeB) score += 40;

  return score;
}

export function finnKandidater(prosjekt, alle) {
  return alle
    .filter(p => p.id !== prosjekt.id && !p.arkivert)
    .map(p => ({ prosjekt: p, score: kandidatScore(prosjekt, p) }))
    .filter(k => k.score >= 30)
    .sort((a, b) => b.score - a.score);
}

// ── Selve sammenslåingen (ren — muterer ingenting) ──────────────────

// valg: {
//   adresse: string,                 — valgt adresse-variant
//   tilbudKilde: 'hoved'|'sekundar'|null,  — hvem sitt tilbud gjelder
//   beholdManuell: { [felt]: true }, — per gruppe A-felt: behold hovedens verdi
//   av: string, dato: string,
// }
// Returnerer { nyHoved, nySekundar, kopierteFelter, sekundarFørFelter }
export function beregnMerge(hoved, sekundar, valg) {
  const kopierteFelter = [];
  const nyHoved = { ...hoved };

  function settFelt(felt, tilVerdi, kilde) {
    if (likVerdi(nyHoved[felt], tilVerdi)) return;
    kopierteFelter.push({
      felt,
      fraVerdi: felt in nyHoved ? nyHoved[felt] : undefined,
      tilVerdi,
      kilde,
    });
    nyHoved[felt] = tilVerdi;
  }

  // Adresse-valg (kan rette skrivefeil i samme steg)
  if (valg.adresse && valg.adresse !== hoved.adresse) {
    settFelt('adresse', valg.adresse, 'adressevalg');
  }
  if (erTom(hoved.navn) && !erTom(sekundar.navn)) {
    settFelt('navn', sekundar.navn, 'sekundar');
  }

  // Gruppe A — tilbudsdata vinner ALLTID (med mindre «behold manuell» er krysset av)
  const kilde = valg.tilbudKilde
    ?? (harTilbud(sekundar) && !harTilbud(hoved) ? 'sekundar'
      : harTilbud(hoved) && !harTilbud(sekundar) ? 'hoved'
      : harTilbud(hoved) && harTilbud(sekundar) ? 'hoved' // begge: krever eksplisitt valg, default hoved
      : null);

  for (const felt of TILBUDSFELTER) {
    if (kilde === 'sekundar' && !valg.beholdManuell?.[felt]) {
      // Tilbudet (sekundær) vinner — også over manuelle verdier i hoved
      if (!erTom(sekundar[felt])) settFelt(felt, sekundar[felt], 'tilbud');
      // Tomt hos tilbudskilden: hovedens verdi beholdes (ingenting å vinne med)
    } else {
      // Hoved er kilde (eller behold manuell): fyll kun tomme felter
      if (erTom(nyHoved[felt]) && !erTom(sekundar[felt])) settFelt(felt, sekundar[felt], 'sekundar-utfyll');
    }
  }

  // Gruppe B + alle øvrige felter på sekundær: hoved beholder sitt,
  // tomme felter fylles fra sekundær.
  const alleFelter = new Set([...DRIFTSFELTER, ...Object.keys(sekundar)]);
  for (const felt of alleFelter) {
    if (IGNORER_FELT.has(felt) || TILBUDSFELTER.includes(felt)) continue;
    if (erTom(nyHoved[felt]) && !erTom(sekundar[felt])) {
      settFelt(felt, sekundar[felt], 'sekundar-utfyll');
    }
  }

  // Merge-metadata
  const sekundarFørFelter = {
    arkivert: sekundar.arkivert,
    arkivertDato: sekundar.arkivertDato,
    arkivertAv: sekundar.arkivertAv,
  };
  nyHoved.mergetFra = [
    ...(hoved.mergetFra || []),
    {
      id: sekundar.id,
      dato: valg.dato,
      av: valg.av,
      kopierteFelter,
      sekundarFørFelter,
      valgtAdresse: valg.adresse || hoved.adresse || '',
    },
  ];

  const nySekundar = {
    ...sekundar,
    arkivert: true,
    arkivertDato: valg.dato,
    arkivertAv: valg.av,
    mergetInn: { hovedId: hoved.id, dato: valg.dato, av: valg.av },
  };

  return { nyHoved, nySekundar, kopierteFelter, sekundarFørFelter };
}

// Peker-oppdatering: alt som peker på sekundær-ID re-pekes til hoved-ID.
// Returnerer per samling: hvilke elementer som skal oppdateres (nye objekter)
// og id-listen (lagres i merge-loggen for angre).
export function beregnPekerOppdatering(state, sekundarId, hovedId) {
  const samlinger = ['tildelinger', 'oppgaver', 'rorPlaner', 'rorTimer', 'befaringer'];
  const resultat = {};
  for (const s of samlinger) {
    const treff = (state[s] || []).filter(x => x && x.prosjektId === sekundarId);
    resultat[s] = {
      ids: treff.map(x => x.id),
      oppdaterte: treff.map(x => ({ ...x, prosjektId: hovedId })),
    };
  }
  return resultat;
}

// ── Angre — gjenoppretter EKSAKT før-tilstand ───────────────────────

// mergeInfo = innslaget i hoved.mergetFra for denne sammenslåingen.
// Returnerer { nyHoved, nySekundar, ikkeTilbakestilt: [felt] }
// - Sekundær: arkivert-feltene tilbake til før-verdiene, mergetInn fjernes.
//   Alt annet er urørt siden merge (arkivering endrer ingenting annet).
// - Hoved: kopierte felter tilbakestilles KUN hvis de fortsatt har verdien
//   fra kopieringen — manuelt endrede felter etterpå røres ikke.
export function beregnAngre(hoved, sekundar, mergeInfo) {
  const nyHoved = { ...hoved };
  const ikkeTilbakestilt = [];

  for (const k of mergeInfo.kopierteFelter || []) {
    if (likVerdi(nyHoved[k.felt], k.tilVerdi)) {
      if (k.fraVerdi === undefined) delete nyHoved[k.felt];
      else nyHoved[k.felt] = k.fraVerdi;
    } else {
      ikkeTilbakestilt.push(k.felt);
    }
  }
  nyHoved.mergetFra = (hoved.mergetFra || []).filter(m => m !== mergeInfo && m.id !== mergeInfo.id);
  if (nyHoved.mergetFra.length === 0) delete nyHoved.mergetFra;

  const før = mergeInfo.sekundarFørFelter || {};
  const nySekundar = { ...sekundar };
  for (const felt of ['arkivert', 'arkivertDato', 'arkivertAv']) {
    if (før[felt] === undefined) delete nySekundar[felt];
    else nySekundar[felt] = før[felt];
  }
  delete nySekundar.mergetInn;

  return { nyHoved, nySekundar, ikkeTilbakestilt };
}

// Angre-pekere: elementer i pekere-loggen som FORTSATT peker på hoved-ID
// settes tilbake til sekundær-ID (manuelt flyttede etterpå røres ikke).
export function beregnAngrePekere(state, pekereIds, sekundarId, hovedId) {
  const resultat = {};
  for (const [samling, ids] of Object.entries(pekereIds || {})) {
    const idSet = new Set(Array.isArray(ids) ? ids : ids.ids || []);
    const treff = (state[samling] || []).filter(x => x && idSet.has(x.id) && x.prosjektId === hovedId);
    resultat[samling] = {
      ids: treff.map(x => x.id),
      oppdaterte: treff.map(x => ({ ...x, prosjektId: sekundarId })),
    };
  }
  return resultat;
}
