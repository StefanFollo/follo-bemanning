// ═══ Oppfølgings-modul — ren kø-logikk (SPEC-oppfolgings-modul.md) ═══
// Deles av «Ring i dag»-listen (klient) og digest-/varsel-endepunktet (api).
//
// 🛑 Modulen LESER kun. Ingen funksjon her muterer noe — de som «beregner»
// en handling (beregnRingt/beregnNyDato) returnerer en payload som PL-ens
// klikk dispatcher. Alt som skjer havner i oppfolgingsLogg på kortet.
//
// Én sak per befaring. Kilder i prioritert rekkefølge:
//   1. neste-kontakt  — nesteKontakt ≤ i dag (forfalt når < i dag)
//   2. frist          — tilbud_sendt med tilbudsfrist ≤ 3 dager fram (eller passert)
//   3. mangler-dato   — tilbud_sendt uten nesteKontakt, ≥ 7 dager uten aktivitet
//   4. lead           — lead uten nesteKontakt, ≥ 5 dager uten aktivitet
//
// `dager` på en sak: negativt = forfalt med N dager, 0 = i dag, positivt = om N dager
// (kun frist-saker kan ligge fram i tid).

export const AKTIV_PIPELINE = ['lead', 'planlagt', 'tilbud_arbeid', 'tilbud_sendt'];
export const FRIST_VARSEL_DAGER = 3;
export const UTEN_DATO_DAGER = 7;
export const LEAD_DAGER = 5;
export const ESKALERING_DAGER = 7;
export const FORESLAATT_NY_DATO_DAGER = 7;

export const SAK_TYPER = {
  'neste-kontakt': { label: 'Neste kontakt', prioritet: 1 },
  'frist':         { label: 'Tilbudsfrist', prioritet: 2 },
  'mangler-dato':  { label: 'Trenger oppfølgingsdato', prioritet: 3 },
  'lead':          { label: 'Følg opp lead', prioritet: 4 },
};

// ── Dato-hjelpere (datoer er YYYY-MM-DD-strenger, tidspunkt ISO) ────
export function isoDato(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function leggTilDager(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDato(d);
}
// Dager fra `fraIso` til `tilIso` (positivt når til ligger etter fra).
export function dagerMellom(fraIso, tilIso) {
  return Math.round((new Date(tilIso + 'T00:00:00') - new Date(fraIso + 'T00:00:00')) / 86400000);
}
function tilDato(verdi) {
  if (!verdi) return null;
  const s = String(verdi);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(verdi);
  return isNaN(d) ? null : isoDato(d);
}

export function ansvarligFor(b) {
  return b.prosjektlederId || b.ansvarligBefaringId || null;
}
export function sisteLogg(b) {
  const l = b.oppfolgingsLogg;
  return Array.isArray(l) && l.length ? l[l.length - 1] : null;
}

// Siste tegn til liv på kortet: kundeaktivitet, event fra tilbuds-appen,
// mottatt payload, PL-ens egen logg, eller befaringsdatoen.
export function sisteAktivitetDato(b) {
  const kandidater = [
    b.dato, b.sistKundeAktivitet, b.sistEventDato,
    b.tilbudPayload && b.tilbudPayload._mottattDato,
    sisteLogg(b) && sisteLogg(b).dato,
  ].map(tilDato).filter(Boolean);
  if (!kandidater.length) return null;
  return kandidater.sort().pop();
}

function tekstForDager(d, forfaltOrd, framOrd) {
  if (d < 0) return `${-d} d ${forfaltOrd}`;
  if (d === 0) return 'I dag';
  return `${framOrd} ${d} d`;
}

// ── Køen ────────────────────────────────────────────────────────────
export function byggOppfolgingsKo(befaringer, iDag = isoDato()) {
  const saker = [];
  for (const b of befaringer || []) {
    if (!b || b.arkivert || !AKTIV_PIPELINE.includes(b.status)) continue;
    const logg = sisteLogg(b);
    const ansvarligId = ansvarligFor(b);
    const basis = { befaringId: b.id, befaring: b, ansvarligId, manglerAnsvarlig: !ansvarligId };
    let sak = null;

    if (b.nesteKontakt) {
      const d = dagerMellom(iDag, b.nesteKontakt);
      if (d <= 0) sak = { ...basis, type: 'neste-kontakt', forfallDato: b.nesteKontakt, dager: d, tekst: tekstForDager(d, 'forfalt', 'om') };
    }

    if (b.status === 'tilbud_sendt' && b.tilbudFrist) {
      const fd = dagerMellom(iDag, b.tilbudFrist);
      if (fd <= FRIST_VARSEL_DAGER) {
        if (sak) sak.fristDager = fd;
        else sak = { ...basis, type: 'frist', forfallDato: b.tilbudFrist, dager: fd, fristDager: fd,
          tekst: fd < 0 ? `Frist gikk ut for ${-fd} d siden` : fd === 0 ? 'Frist i dag — ring kunden' : `Frist om ${fd} d — ring kunden` };
      }
    }

    // Bevisst «ingen ny oppfølging» fra PL stopper de aktivitetsbaserte reglene —
    // ikke forfalte datoer eller frister (de er PL-ens egne valg å rydde).
    const avsluttet = !!(logg && logg.ingenOppfolging);
    if (!sak && !b.nesteKontakt && !avsluttet) {
      const siste = sisteAktivitetDato(b) || iDag;
      const stille = dagerMellom(siste, iDag);
      if (b.status === 'tilbud_sendt' && stille >= UTEN_DATO_DAGER) {
        sak = { ...basis, type: 'mangler-dato', forfallDato: leggTilDager(siste, UTEN_DATO_DAGER), dager: -(stille - UTEN_DATO_DAGER),
          stilleDager: stille, tekst: `${stille} d uten aktivitet — trenger oppfølgingsdato` };
      } else if (b.status === 'lead' && stille >= LEAD_DAGER) {
        sak = { ...basis, type: 'lead', forfallDato: leggTilDager(siste, LEAD_DAGER), dager: -(stille - LEAD_DAGER),
          stilleDager: stille, tekst: `${stille} d uten aktivitet — følg opp lead` };
      }
    }

    if (sak) {
      sak.forfalt = sak.dager < 0;
      sak.eskaler = sak.dager <= -ESKALERING_DAGER;
      saker.push(sak);
    }
  }
  return sorterKo(saker);
}

export function sorterKo(saker) {
  return [...saker].sort((a, b) =>
    a.dager - b.dager
    || SAK_TYPER[a.type].prioritet - SAK_TYPER[b.type].prioritet
    || String(a.befaring.kontaktNavn || a.befaring.adresse || '').localeCompare(String(b.befaring.kontaktNavn || b.befaring.adresse || ''), 'nb'));
}

// ── Hvem ser hva ────────────────────────────────────────────────────
// PL ser KUN egne saker. admin/kontor ser alle (+ «mangler ansvarlig»).
// borteIds: ansatte som er «borte til» en dato ≥ i dag — sakene deres
// merkes så admin ser dem i mellomtiden (PL-en ser fortsatt sine egne).
export function serAlle(rolle) {
  return rolle === 'admin' || rolle === 'kontor';
}
export function filtrerForBruker(saker, { rolle, ansattId, borteIds } = {}) {
  const borte = borteIds instanceof Set ? borteIds : new Set(borteIds || []);
  const merket = saker.map(s => ({ ...s, ansvarligBorte: !!(s.ansvarligId && borte.has(s.ansvarligId)) }));
  if (serAlle(rolle)) return merket;
  if (!ansattId) return [];
  return merket.filter(s => s.ansvarligId === ansattId);
}

// ── PL-handlinger (rene — returnerer payload til UPDATE_BEFARING) ──
// Logg-innslag: { dato, av, avId, handling:'ringt'|'utsatt'|'ny-dato', notat, nyDato, forrigeDato, ingenOppfolging, sakType }
function nyttInnslag(felter, naa) {
  return { dato: naa || new Date().toISOString(), ...felter };
}

// ✓ Ringt: utfall-notat + ny neste kontakt-dato (eller bevisst «ingen ny oppfølging»).
export function beregnRingt(befaring, { av, avId, notat, nyDato, ingenOppfolging, sakType, naa } = {}) {
  const innslag = nyttInnslag({
    av: av || 'ukjent', avId: avId || null, handling: 'ringt',
    notat: (notat || '').trim(), nyDato: ingenOppfolging ? null : (nyDato || null),
    forrigeDato: befaring.nesteKontakt || null, ingenOppfolging: !!ingenOppfolging, sakType: sakType || null,
  }, naa);
  const payload = {
    id: befaring.id,
    oppfolgingsLogg: [...(befaring.oppfolgingsLogg || []), innslag],
    nesteKontakt: ingenOppfolging ? '' : (nyDato || befaring.nesteKontakt || ''),
  };
  return { payload, innslag };
}

// 📅 Ny dato: bare flytte datoen — logges som «utsatt» når det fantes en dato fra før.
export function beregnNyDato(befaring, { av, avId, nyDato, notat, sakType, naa } = {}) {
  if (!nyDato) throw new Error('nyDato er påkrevd');
  const innslag = nyttInnslag({
    av: av || 'ukjent', avId: avId || null,
    handling: befaring.nesteKontakt ? 'utsatt' : 'ny-dato',
    notat: (notat || '').trim(), nyDato, forrigeDato: befaring.nesteKontakt || null, sakType: sakType || null,
  }, naa);
  const payload = { id: befaring.id, oppfolgingsLogg: [...(befaring.oppfolgingsLogg || []), innslag], nesteKontakt: nyDato };
  return { payload, innslag };
}

export function foreslaattNyDato(iDag = isoDato()) {
  return leggTilDager(iDag, FORESLAATT_NY_DATO_DAGER);
}

// Siste notat på kortet til én linje: nyeste logg-notat, ellers kundeaktivitet,
// ellers kortets kommentar/notat.
export function sisteNotat(b) {
  const l = sisteLogg(b);
  if (l && l.notat) return { tekst: l.notat, dato: l.dato, kilde: 'logg', av: l.av };
  if (l && l.ingenOppfolging) return { tekst: 'Ingen ny oppfølging (bevisst valg)', dato: l.dato, kilde: 'logg', av: l.av };
  const akt = Array.isArray(b.kundeAktivitet) && b.kundeAktivitet.length ? b.kundeAktivitet[b.kundeAktivitet.length - 1] : null;
  if (akt) {
    const h = akt.handling === 'klikket-aksepter' ? 'Kunden klikket Aksepter'
      : akt.handling === 'klikket-sporsmal' ? 'Kunden klikket Spørsmål'
      : akt.handling === 'aapnet' ? `Kunden åpnet tilbudet${akt.antall ? ' ' + akt.antall + 'x' : ''}`
      : 'Kundeaktivitet: ' + akt.handling;
    return { tekst: h, dato: akt.sistTidspunkt || akt.tidspunkt, kilde: 'kunde' };
  }
  const k = (b.kommentar || b.notat || '').trim();
  return k ? { tekst: k.split('\n')[0], dato: null, kilde: 'kort' } : null;
}

// ── Ukesstatistikk per PL (admin-innsyn + mandagsdigest) ────────────
// håndtert = «ringt»-innslag i perioden, utsatt = «utsatt»/«ny-dato»,
// forfalt = saker som er forfalt akkurat nå.
export function ukesStatistikk(befaringer, { fra, til, iDag } = {}) {
  const dag = iDag || isoDato();
  const slutt = til || dag;
  const start = fra || leggTilDager(slutt, -6);
  const perPl = {};
  const sikre = id => (perPl[id] = perPl[id] || { ansattId: id, handtert: 0, utsatt: 0, forfalt: 0, eskalert: 0 });
  for (const b of befaringer || []) {
    if (!b || b.arkivert) continue;
    for (const l of b.oppfolgingsLogg || []) {
      const d = tilDato(l.dato);
      if (!d || d < start || d > slutt) continue;
      const id = l.avId || ansvarligFor(b) || '__ukjent__';
      if (l.handling === 'ringt') sikre(id).handtert++;
      else if (l.handling === 'utsatt' || l.handling === 'ny-dato') sikre(id).utsatt++;
    }
  }
  for (const s of byggOppfolgingsKo(befaringer, dag)) {
    const id = s.ansvarligId || '__ukjent__';
    if (s.forfalt) sikre(id).forfalt++;
    if (s.eskaler) sikre(id).eskalert++;
  }
  return { fra: start, til: slutt, perPl };
}
