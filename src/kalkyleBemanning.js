// ═══ 4c: Kalkyletimer mot faktisk bemanning (SPEC-4a-4c) ═══
// REN avledning ved visning — leser tildelinger + fagBreakdown, endrer ingenting.

export const TIMER_PER_DAG = 7.5;

// Arbeidsdager (man–fre) inklusive begge ender.
export function workdaysBetween(startIso, sluttIso) {
  if (!startIso || !sluttIso || sluttIso < startIso) return 0;
  const start = new Date(startIso + 'T00:00:00');
  const slutt = new Date(sluttIso + 'T00:00:00');
  let dager = 0;
  for (let d = new Date(start); d <= slutt; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dager++;
  }
  return dager;
}

// Kalkylens fagBreakdown-nøkler → kanoniske fag
export function normKalkyleFag(f) {
  const s = (f || '').toLowerCase().trim();
  if (/tomrer|tømrer|snekker|montering/.test(s)) return 'tomrer';
  if (/rive|riving/.test(s)) return 'rive';
  if (/flis|membran|mur/.test(s)) return 'flis';
  if (/ror|rør|vvs|sanit/.test(s)) return 'rorlegger';
  if (/^el$|elektr/.test(s)) return 'elektriker';
  if (/maler|maling/.test(s)) return 'maling';
  if (/^pl$|prosjektled|anleggsled|ledelse/.test(s)) return 'pl';
  if (/ventilasjon/.test(s)) return 'ventilasjon';
  return s || 'annet';
}

// Ansatt-registerets fag-navn → samme kanoniske fag
export function normAnsattFag(f) {
  const s = (f || '').toLowerCase().trim();
  if (/tømrer|tomrer|montør|montor|snekker/.test(s)) return 'tomrer'; // inkl. Bas/Lærling Tømrer
  if (/rørlegger|rorlegger/.test(s)) return 'rorlegger';
  if (/flislegger|flis|murer/.test(s)) return 'flis';
  if (/elektriker/.test(s)) return 'elektriker';
  if (/maler/.test(s)) return 'maling';
  if (/prosjekt ?leder|anleggsleder/.test(s)) return 'pl';
  return s || 'annet';
}

const FAG_LABEL = {
  tomrer: 'Tømrer', rive: 'Rive', flis: 'Flislegger', rorlegger: 'Rørlegger',
  elektriker: 'Elektriker', maling: 'Maler', pl: 'PL', ventilasjon: 'Ventilasjon', annet: 'Annet',
};
export function fagLabel(f) {
  return FAG_LABEL[f] || (f ? f.charAt(0).toUpperCase() + f.slice(1) : 'Annet');
}

// Hovedfunksjonen. Returnerer null når prosjektet ikke har fagBreakdown
// (da vises ingen seksjon — ingen tom boks).
// {
//   rader: [{ fag, label, kalkyleTimer, bemannetTimer, pct, mangler }],
//   utenforKalkyle: [{ fag, label, bemannetTimer }],
//   totalKalkyle, totalBemannet,
//   manglerRader: [{ label, manglerTimer, ukesverk }],
// }
export function beregnKalkyleVsBemanning(prosjekt, tildelinger, ansatteById) {
  const fb = prosjekt?.tilbudPayload?.fagBreakdown;
  if (!fb || typeof fb !== 'object') return null;

  // Kalkyletimer per kanonisk fag
  const kalkyle = {};
  for (const [fag, info] of Object.entries(fb)) {
    const timer = parseFloat(typeof info === 'object' ? (info?.timer ?? info?.antallTimer) : info) || 0;
    if (timer <= 0) continue;
    const nf = normKalkyleFag(fag);
    kalkyle[nf] = (kalkyle[nf] || 0) + timer;
  }
  if (Object.keys(kalkyle).length === 0) return null;

  // Bemannede timer per fag: dager × 7,5 t per person (innleie teller med)
  const bemannet = {};
  for (const t of tildelinger || []) {
    if (!t || t.prosjektId !== prosjekt.id) continue;
    const dager = workdaysBetween(t.startDato, t.sluttDato);
    if (dager <= 0) continue;
    const ansatt = ansatteById[t.ansattId];
    const fag = normAnsattFag(ansatt?.fag);
    bemannet[fag] = (bemannet[fag] || 0) + dager * TIMER_PER_DAG;
  }

  const rader = Object.entries(kalkyle)
    .sort((a, b) => b[1] - a[1])
    .map(([fag, kalkyleTimer]) => {
      const bemannetTimer = bemannet[fag] || 0;
      const pct = kalkyleTimer > 0 ? Math.round((bemannetTimer / kalkyleTimer) * 100) : 0;
      const kalkyleRund = Math.round(kalkyleTimer);
      const bemannetRund = Math.round(bemannetTimer);
      return {
        fag,
        label: fagLabel(fag),
        kalkyleTimer: kalkyleRund,
        bemannetTimer: bemannetRund,
        pct,
        // Fra de viste (avrundede) verdiene, så regnestykket går opp for leseren
        mangler: Math.max(0, kalkyleRund - bemannetRund),
      };
    });

  const utenforKalkyle = Object.entries(bemannet)
    .filter(([fag]) => !(fag in kalkyle))
    .map(([fag, timer]) => ({ fag, label: fagLabel(fag), bemannetTimer: Math.round(timer) }));

  const totalKalkyle = rader.reduce((s, r) => s + r.kalkyleTimer, 0);
  const totalBemannet = rader.reduce((s, r) => s + r.bemannetTimer, 0);

  const manglerRader = rader
    .filter(r => r.mangler > 0)
    .map(r => ({
      label: r.label,
      manglerTimer: r.mangler,
      // 1 ukesverk = 5 dager × 7,5 t = 37,5 t
      ukesverk: Math.round((r.mangler / 37.5) * 10) / 10,
    }));

  return { rader, utenforKalkyle, totalKalkyle, totalBemannet, manglerRader };
}

// 4c lett varsel: Pågående + et kalkyle-fag <50 % bemannet + <2 uker til slutt.
export function erUnderbemannetMotKalkyle(prosjekt, tildelinger, ansatteById, iDagIso) {
  if (!prosjekt.sluttDato) return false;
  const om14 = new Date(iDagIso + 'T00:00:00');
  om14.setDate(om14.getDate() + 14);
  const slutt = new Date(prosjekt.sluttDato + 'T00:00:00');
  if (slutt < new Date(iDagIso + 'T00:00:00') || slutt > om14) return false;
  const beregning = beregnKalkyleVsBemanning(prosjekt, tildelinger, ansatteById);
  if (!beregning) return false;
  return beregning.rader.some(r => r.pct < 50);
}
