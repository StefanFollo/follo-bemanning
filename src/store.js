// Persistent state via localStorage

const DEFAULT_FAG = ['Bas Tømrer', 'Montør', 'Lærling Tømrer', 'Maler', 'Rørlegger', 'Tømrer', 'Flislegger'];

function mkId(n) { return 'seed' + n; }

const SEED_ANSATTE = [
  'Abdul Malik','Aleksej Kursakov','Alexis K. Lusimbwa','Andrius Jauniskis',
  'Antun Tkalec','Arturas Maciuta','Brage Grinde','Dawod Azizian',
  'Brogen Ernst Kristian Stølen','Glenn Fosser','Helena Espeland Tryg',
  'Imad Muhammad Abouzraa','James Paul Klassen','Joachim Norenberg',
  'Kateryna Barabanova','Kenneth Grinde','Kristoffer Olsen Tollofsen',
  'Krzysztof Slabon','Leif Anders Nysveen Grøv','Lucas G Fosser',
  'Malin Kristin Dolk','Mario Deila','Martins Cerins','Mikkel Heggen Kulsrud',
  'Muhammed Sarr','Petros Potsis','Pyrros Christou','Richard Fosser Minge',
  'Richard Havnegjerde Ekroll','Rytis Jackevicius','Rytis Jauniskis',
  'Serhii Pieniev','Sigurd Lind Aanby','Stanislaw Kostrubiec',
  'Tomas Strumilas','Tomasz Miroslaw Czop','Tommy Fredriksen',
].map((navn, i) => ({ id: mkId('a' + i), navn, fag: 'Montør', telefon: '', epost: '' }));

const SEED_PROSJEKTER = [
  '25032 Tvetenveien 20','Arne Nordli','Askveien 6','Belsjøparken 13',
  'Bjerkelundsveien 39','Carl Nords vei 7b','Eikestubben 9',
  'Ellingsrudveien 43','Fiolveien 16B','Hareveien 14','Høyåsveien 5',
  'Køyafaret tomt','Liadalsveien 4-14','Lindemansveien 59',
  'Lofts leiligheter Sæterskogveien 4','Lokaler 2 etg Sæterskogveien 4',
  'Regnbueveien 3c','Reklamasjoner 2026','Sagveien 37',
  'Sameiet Søndre Moer B6','Sandbukta 4','Skullerudbakken 46',
  'Steinhammerveien 6B','Stølsveien 12B','Øreliveien 16B',
  'Åslandsveien 31','Åsulvs vei 21',
].map((navn, i) => ({ id: mkId('p' + i), navn, adresse: '', startDato: '', sluttDato: '', status: 'aktiv', beskrivelse: '' }));

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadState() {
  return {
    ansatte: load('fbs_ansatte', SEED_ANSATTE),
    prosjekter: load('fbs_prosjekter', SEED_PROSJEKTER),
    tildelinger: load('fbs_tildelinger', []),
    oppgaver: load('fbs_oppgaver', []),
    fag: load('fbs_fag', DEFAULT_FAG),
  };
}

export function saveAnsatte(data) { save('fbs_ansatte', data); }
export function saveProsjekter(data) { save('fbs_prosjekter', data); }
export function saveTildelinger(data) { save('fbs_tildelinger', data); }
export function saveOppgaver(data) { save('fbs_oppgaver', data); }
export function saveFag(data) { save('fbs_fag', data); }

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Date utils
export function isoToDate(str) {
  return str ? new Date(str + 'T00:00:00') : null;
}

export function dateToIso(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = isoToDate(dateStr);
  d.setDate(d.getDate() + n);
  return dateToIso(d);
}

export function weekStart(dateStr) {
  const d = isoToDate(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return dateToIso(d);
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = isoToDate(dateStr);
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function daysBetween(a, b) {
  const da = isoToDate(a);
  const db = isoToDate(b);
  return Math.round((db - da) / 86400000);
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}
