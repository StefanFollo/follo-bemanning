// ═══ 4a: KS-sjekkliste-forslag fra tilbudets fag (SPEC-4a-4c) ═══
// REN tag/nøkkelord-matching — ingen AI, ingen auto-tildeling.
// Forslagene vises; PL tildeler med ett klikk (tildeltAv: 'forslag:fag-match').

// Normaliser fag-navn fra tilbudPayload.fag / fagBreakdown-nøkler til
// KS-bibliotekets fag-tagger ('tomrer','flis','ror','el','maler').
export function normKsFag(f) {
  const s = (f || '').toLowerCase().trim();
  if (/tomrer|tømrer|snekker|montør|montor|rive|riving/.test(s)) return 'tomrer';
  if (/flis|membran|mur/.test(s)) return 'flis';
  if (/ror|rør|vvs|sanit/.test(s)) return 'ror';
  if (/^el|elektr/.test(s)) return 'el';
  if (/maler|maling/.test(s)) return 'maler';
  return null;
}

// Post-navn-nøkkelord → mal-kategori (kategoriBibliotek)
const POST_KATEGORI = [
  { re: /bad|våtrom|vatrom|membran/, kategori: 'bad', label: 'bad/våtrom' },
  { re: /fasade|kledning|vindu/, kategori: 'yttervegg', label: 'fasade/kledning' },
  { re: /tak|tekking/, kategori: 'tak', label: 'tak' },
];

// prosjektets fag-grunnlag: tilbudPayload.fag + fagBreakdown-nøkler (+ p.fag)
export function hentProsjektFag(prosjekt) {
  const tp = prosjekt.tilbudPayload || {};
  const raa = [
    ...(Array.isArray(tp.fag) ? tp.fag : []),
    ...(Array.isArray(prosjekt.fag) ? prosjekt.fag : []),
    ...(tp.fagBreakdown && typeof tp.fagBreakdown === 'object' ? Object.keys(tp.fagBreakdown) : []),
  ];
  const sett = new Set();
  for (const f of raa) {
    const n = normKsFag(f);
    if (n) sett.add(n);
  }
  return sett;
}

// Hovedfunksjonen: forslag = maler som matcher og IKKE er tildelt.
// Returnerer { forslag: [{ mal, grunn, forhåndsvalgt }], grunnlag: string }
export function lagFagForslag(prosjekt, maler, tildelteMalIds) {
  const fagSett = hentProsjektFag(prosjekt);
  const tp = prosjekt.tilbudPayload || {};
  const poster = (Array.isArray(tp.poster) && tp.poster.length ? tp.poster : prosjekt.poster) || [];
  const posterTekst = poster
    .map(p => `${p.navn || ''} ${p.beskrivelse || p.tittel || ''}`)
    .join(' ')
    .toLowerCase();

  const kategoriTreff = POST_KATEGORI.filter(k => k.re.test(posterTekst));
  const kategoriSett = new Set(kategoriTreff.map(k => k.kategori));
  // fag-baserte kategorier: flis → bad-maler er relevante, ror → ror-kategorien
  if (fagSett.has('flis')) kategoriSett.add('bad');
  if (fagSett.has('ror')) kategoriSett.add('ror');
  if (fagSett.has('el')) kategoriSett.add('el');

  const forslag = [];
  for (const mal of maler || []) {
    if (!mal || tildelteMalIds.has(mal.id)) continue; // allerede tildelt: aldri foreslå

    // 1) HMS-pakken (obligatoriske) — alltid foreslått og forhåndsvalgt
    if (mal.obligatorisk) {
      forslag.push({ mal, grunn: 'obligatorisk', forhåndsvalgt: true });
      continue;
    }

    // 2) Fag-match: malens fag-tagger overlapper prosjektets fag
    const malFag = Array.isArray(mal.fag) ? mal.fag : [];
    const fagTreff = malFag.find(f => fagSett.has(f));
    if (fagTreff) {
      forslag.push({ mal, grunn: `fag: ${fagTreff}`, forhåndsvalgt: false });
      continue;
    }

    // 3) Kategori-match via post-nøkkelord (bad/våtrom, fasade/kledning/vindu, tak)
    const kat = mal.kategoriBibliotek || '';
    if (kat && kategoriSett.has(kat)) {
      const kilde = kategoriTreff.find(k => k.kategori === kat);
      forslag.push({ mal, grunn: kilde ? `post-match: ${kilde.label}` : `kategori: ${kat}`, forhåndsvalgt: false });
    }
  }

  const grunnlag = [
    ...[...fagSett],
    ...kategoriTreff.map(k => `poster om ${k.label}`),
  ].join(' · ');

  return { forslag, grunnlag };
}

// «Skjul forslag» huskes per prosjekt (localStorage) — ikke masete.
const SKJUL_NØKKEL = 'fbs_ks_forslag_skjul';
export function erForslagSkjult(prosjektId) {
  try {
    return JSON.parse(localStorage.getItem(SKJUL_NØKKEL) || '[]').includes(prosjektId);
  } catch { return false; }
}
export function skjulForslag(prosjektId) {
  try {
    const liste = JSON.parse(localStorage.getItem(SKJUL_NØKKEL) || '[]');
    if (!liste.includes(prosjektId)) liste.push(prosjektId);
    localStorage.setItem(SKJUL_NØKKEL, JSON.stringify(liste));
  } catch { /* ikke kritisk */ }
}

// Samme datamodell som manuell tildeling (lagNyKS i KS.jsx)
export function lagKsTildeling(mal) {
  return {
    malId: mal.id,
    tildeltDato: new Date().toISOString(),
    tildeltAv: 'forslag:fag-match',
    status: 'ikke-startet',
    framdrift: { utfylt: 0, totalt: mal.punkter?.length || 0 },
    svar: [],
    avvik: [],
  };
}
