// Persistent state via localStorage

const DEFAULT_FAG = ['Bas Tømrer', 'Montør', 'Lærling Tømrer', 'Maler', 'Rørlegger', 'Tømrer', 'Flislegger', 'Prosjektleder'];

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

const PROJ_PALETTE = ['#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#be185d','#854d0e','#065f46','#1e40af','#b45309','#0f766e'];

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
].map((navn, i) => ({ id: mkId('p' + i), navn, adresse: '', startDato: '', sluttDato: '', status: 'aktiv', beskrivelse: '', farge: PROJ_PALETTE[i % PROJ_PALETTE.length] }));

export const PROSJEKT_PALETTE = PROJ_PALETTE;

// Seed tildelinger from Proresult PDF (weeks 13-19, 2026-03-23 to 2026-05-08)
// a=ansatt index, p=prosjekt index
const SEED_TILDELINGER = [
  // Glenn Fosser → Stølsveien 12B wk13-15
  { id: mkId('t0'),  ansattId: mkId('a9'),  prosjektId: mkId('p23'), startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Leif Anders Nysveen Grøv → Stølsveien 12B wk13-15
  { id: mkId('t1'),  ansattId: mkId('a18'), prosjektId: mkId('p23'), startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Mario Deila → Stølsveien 12B wk13-14, Skullerudbakken 46 wk16
  { id: mkId('t2'),  ansattId: mkId('a21'), prosjektId: mkId('p23'), startDato: '2026-03-23', sluttDato: '2026-04-03' },
  { id: mkId('t3'),  ansattId: mkId('a21'), prosjektId: mkId('p21'), startDato: '2026-04-13', sluttDato: '2026-04-17' },
  // Martins Cerins → Stølsveien 12B wk13, wk16-17
  { id: mkId('t4'),  ansattId: mkId('a22'), prosjektId: mkId('p23'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t5'),  ansattId: mkId('a22'), prosjektId: mkId('p23'), startDato: '2026-04-13', sluttDato: '2026-04-24' },
  // Kristoffer Olsen Tollofsen → Sæterskogveien 4 wk13-15
  { id: mkId('t6'),  ansattId: mkId('a16'), prosjektId: mkId('p14'), startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Malin Kristin Dolk → Sæterskogveien 4 wk13-15
  { id: mkId('t7'),  ansattId: mkId('a20'), prosjektId: mkId('p14'), startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Richard Fosser Minge → Skullerudbakken 46 wk16
  { id: mkId('t8'),  ansattId: mkId('a27'), prosjektId: mkId('p21'), startDato: '2026-04-13', sluttDato: '2026-04-17' },
  // Rytis Jauniskis → Ellingsrudveien 43 wk13, wk15 + Hareveien 14 wk16
  { id: mkId('t9'),  ansattId: mkId('a30'), prosjektId: mkId('p7'),  startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t10'), ansattId: mkId('a30'), prosjektId: mkId('p7'),  startDato: '2026-04-06', sluttDato: '2026-04-10' },
  { id: mkId('t11'), ansattId: mkId('a30'), prosjektId: mkId('p9'),  startDato: '2026-04-13', sluttDato: '2026-04-17' },
  // Aleksej Kursakov → Hareveien 14 wk13, Sæterskogveien 4 wk14-16
  { id: mkId('t12'), ansattId: mkId('a1'),  prosjektId: mkId('p9'),  startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t13'), ansattId: mkId('a1'),  prosjektId: mkId('p14'), startDato: '2026-03-30', sluttDato: '2026-04-17' },
  // Arturas Maciuta → Hareveien 14 wk13, wk15-16
  { id: mkId('t14'), ansattId: mkId('a5'),  prosjektId: mkId('p9'),  startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t15'), ansattId: mkId('a5'),  prosjektId: mkId('p9'),  startDato: '2026-04-06', sluttDato: '2026-04-17' },
  // Helena Espeland Tryg → Hareveien 14 wk13-15
  { id: mkId('t16'), ansattId: mkId('a10'), prosjektId: mkId('p9'),  startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Tomas Strumilas → Hareveien 14 wk13, Åslandsveien 31 wk14, Sandbukta 4 wk15-16
  { id: mkId('t17'), ansattId: mkId('a34'), prosjektId: mkId('p9'),  startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t18'), ansattId: mkId('a34'), prosjektId: mkId('p25'), startDato: '2026-03-30', sluttDato: '2026-04-03' },
  { id: mkId('t19'), ansattId: mkId('a34'), prosjektId: mkId('p20'), startDato: '2026-04-06', sluttDato: '2026-04-17' },
  // Tommy Fredriksen → Lindemansveien 59 wk13, wk15
  { id: mkId('t20'), ansattId: mkId('a36'), prosjektId: mkId('p13'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t21'), ansattId: mkId('a36'), prosjektId: mkId('p13'), startDato: '2026-04-06', sluttDato: '2026-04-10' },
  // Imad Muhammad Abouzraa → Lindemansveien 59 wk13
  { id: mkId('t22'), ansattId: mkId('a11'), prosjektId: mkId('p13'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  // Muhammed Sarr → Lindemansveien 59 wk13
  { id: mkId('t23'), ansattId: mkId('a24'), prosjektId: mkId('p13'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  // Petros Potsis → Steinhammerveien 6B wk13, Fiolveien 16B wk14-15, Lindemansveien 59 wk16-17
  { id: mkId('t24'), ansattId: mkId('a25'), prosjektId: mkId('p22'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t25'), ansattId: mkId('a25'), prosjektId: mkId('p8'),  startDato: '2026-03-30', sluttDato: '2026-04-10' },
  { id: mkId('t26'), ansattId: mkId('a25'), prosjektId: mkId('p13'), startDato: '2026-04-13', sluttDato: '2026-04-24' },
  // Pyrros Christou → Steinhammerveien 6B wk13, Lindemansveien 59 wk14-15
  { id: mkId('t27'), ansattId: mkId('a26'), prosjektId: mkId('p22'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t28'), ansattId: mkId('a26'), prosjektId: mkId('p13'), startDato: '2026-03-30', sluttDato: '2026-04-10' },
  // Sigurd Lind Aanby → Steinhammerveien 6B wk13, Ellingsrudveien 43 wk14+wk16, Lindemansveien 59 wk17-18
  { id: mkId('t29'), ansattId: mkId('a32'), prosjektId: mkId('p22'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t30'), ansattId: mkId('a32'), prosjektId: mkId('p7'),  startDato: '2026-03-30', sluttDato: '2026-04-03' },
  { id: mkId('t31'), ansattId: mkId('a32'), prosjektId: mkId('p7'),  startDato: '2026-04-13', sluttDato: '2026-04-17' },
  { id: mkId('t32'), ansattId: mkId('a32'), prosjektId: mkId('p13'), startDato: '2026-04-20', sluttDato: '2026-05-01' },
  // Abdul Malik → Steinhammerveien 6B wk13
  { id: mkId('t33'), ansattId: mkId('a0'),  prosjektId: mkId('p22'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  // Andrius Jauniskis → Fiolveien 16B wk13-15
  { id: mkId('t34'), ansattId: mkId('a3'),  prosjektId: mkId('p8'),  startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Rytis Jackevicius → Fiolveien 16B wk13-15
  { id: mkId('t35'), ansattId: mkId('a29'), prosjektId: mkId('p8'),  startDato: '2026-03-23', sluttDato: '2026-04-10' },
];

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
  // Oppdater lokal timestamp slik at sky-data aldri overskriver nyere lokal data
  localStorage.setItem('fbs_updated_at', Date.now().toString());
}

export function getLocalUpdatedAt() {
  return parseInt(localStorage.getItem('fbs_updated_at') || '0', 10);
}

export function loadState() {
  // One-time migration: seed tildelinger from PDF import if none exist yet
  const existing = load('fbs_tildelinger', null);
  const seeded = localStorage.getItem('fbs_tildelinger_seeded');
  if (!seeded && (!existing || existing.length === 0)) {
    save('fbs_tildelinger', SEED_TILDELINGER);
    localStorage.setItem('fbs_tildelinger_seeded', '1');
  }

  return {
    ansatte: load('fbs_ansatte', SEED_ANSATTE),
    prosjekter: load('fbs_prosjekter', SEED_PROSJEKTER),
    tildelinger: load('fbs_tildelinger', SEED_TILDELINGER),
    oppgaver: load('fbs_oppgaver', []),
    fag: load('fbs_fag', DEFAULT_FAG),
    rorTimer: load('fbs_ror_timer', []),
    befaringer: load('fbs_befaringer', []),
  };
}

export function saveAnsatte(data) { save('fbs_ansatte', data); }
export function saveProsjekter(data) { save('fbs_prosjekter', data); }
export function saveTildelinger(data) { save('fbs_tildelinger', data); }
export function saveOppgaver(data) { save('fbs_oppgaver', data); }
export function saveFag(data) { save('fbs_fag', data); }
export function saveRorTimer(data) { save('fbs_ror_timer', data); }
export function saveBefaringer(data) { save('fbs_befaringer', data); }

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Date utils
export function isoToDate(str) {
  return str ? new Date(str + 'T00:00:00') : null;
}

export function dateToIso(d) {
  // Use local date (not UTC) to avoid timezone shift in Norwegian timezone
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

// Cloud sync via Vercel KV
export async function loadFromCloud() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) return null;
    const data = await res.json();
    return Object.keys(data).length > 0 ? data : null;
  } catch {
    return null;
  }
}

export async function saveToCloud(state) {
  try {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state, _updatedAt: getLocalUpdatedAt() }),
    });
  } catch {
    // localStorage er backup
  }
}
