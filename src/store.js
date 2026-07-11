// Persistent state via localStorage

const DEFAULT_FAG = ['Anleggsleder', 'Montør', 'Lærling Tømrer', 'Maler', 'Rørlegger', 'Tømrer', 'Flislegger', 'Prosjektleder'];


const PROJ_PALETTE = [
  '#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2',
  '#be185d','#854d0e','#065f46','#1e40af','#b45309','#0f766e',
  '#6366f1','#d97706','#059669','#f43f5e','#8b5cf6','#14b8a6',
  '#64748b','#84cc16',
];


export const PROSJEKT_PALETTE = PROJ_PALETTE;


function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export const FIELD_MAP = {
  ansatte:      'fbs_ansatte',
  prosjekter:   'fbs_prosjekter',
  tildelinger:  'fbs_tildelinger',
  oppgaver:     'fbs_oppgaver',
  fag:          'fbs_fag',
  teams:        'fbs_teams',
  rorTimer:     'fbs_ror_timer',
  rorPlaner:    'fbs_ror_planer',
  befaringer:   'fbs_befaringer',
  reklamasjoner:'fbs_reklamasjoner',
  serviceJobber:'fbs_service_jobber',
  biler:        'fbs_biler',
};


function save(key, value, field) {
  localStorage.setItem(key, JSON.stringify(value));
  const now = Date.now().toString();
  localStorage.setItem('fbs_updated_at', now);
  if (field) localStorage.setItem(`fbs_ts_${field}`, now);
}

export function getLocalUpdatedAt() {
  return parseInt(localStorage.getItem('fbs_updated_at') || '0', 10);
}

export function getFieldTs(field) {
  return parseInt(localStorage.getItem(`fbs_ts_${field}`) || '0', 10);
}

export function getAllFieldTs() {
  const ts = {};
  for (const f of Object.keys(FIELD_MAP)) ts[f] = getFieldTs(f);
  return ts;
}

// Arrays der elementene har id og kan flettes per element.
// 'fag' er strenger og flettes fortsatt på felt-nivå.
const ITEM_ARRAYS = new Set([
  'ansatte', 'prosjekter', 'tildelinger', 'oppgaver', 'teams',
  'rorTimer', 'rorPlaner', 'befaringer', 'reklamasjoner', 'serviceJobber', 'biler',
]);

// ── Slette-markører (tombstones) ──
// Når noe slettes med vilje, registreres det her. Fletting (klient + server)
// kan da skille «slettet med vilje» fra «mangler fordi klienten er utdatert».
// Uten dette mistet vi data: en iPad som våknet med gårsdagens kopi lagret
// over alt de andre hadde lagt inn.
export function registrerSletting(felt, id) {
  if (id == null) return;
  try {
    const raw = JSON.parse(localStorage.getItem('fbs_tombstones') || '[]');
    raw.push({ felt, id, ts: Date.now() });
    const grense = Date.now() - 30 * 24 * 3600 * 1000;
    localStorage.setItem('fbs_tombstones', JSON.stringify(raw.filter(t => t.ts > grense).slice(-500)));
  } catch { /* noop */ }
}

export function hentSlettinger() {
  try { return JSON.parse(localStorage.getItem('fbs_tombstones') || '[]'); } catch { return []; }
}

// Per-element-fletting: nyeste versjon av hvert element (etter _endret) vinner.
// Elementer som bare finnes i skyen beholdes ALLTID her — bevisste slettinger
// håndteres av tombstone-filteret i mergeWithCloud/serveren.
export function mergeArrayPerItem(localArr, cloudArr, { cloudNyereFelt }) {
  if (!Array.isArray(localArr)) return cloudArr;
  if (!Array.isArray(cloudArr)) return localArr;
  const cloudById = new Map(cloudArr.filter(x => x && x.id != null).map(x => [x.id, x]));
  const localIds = new Set(localArr.filter(x => x && x.id != null).map(x => x.id));
  const result = localArr.map(item => {
    if (!item || item.id == null) return item;
    const c = cloudById.get(item.id);
    if (!c) return item; // nytt lokalt (ulagret) — behold
    const ct = c._endret || 0;
    const lt = item._endret || 0;
    if (ct > lt) return c;
    if (lt > ct) return item;
    // Uten stempler: fall tilbake på felt-tidsstempel
    return cloudNyereFelt ? c : item;
  });
  for (const c of cloudArr) {
    if (!c || c.id == null || localIds.has(c.id)) continue;
    result.push(c); // finnes i sky, ikke lokalt → behold (tombstones filtrerer etterpå)
  }
  // Rekkefølge: hvis skyen er nyere for feltet, bruk skyens rekkefølge som
  // fasit (bevarer f.eks. drag-sortering av team gjort av en annen bruker).
  if (cloudNyereFelt) {
    const pos = new Map(cloudArr.filter(x => x && x.id != null).map((x, i) => [x.id, i]));
    result.sort((a, b) =>
      (pos.has(a?.id) ? pos.get(a.id) : Infinity) - (pos.has(b?.id) ? pos.get(b.id) : Infinity)
    );
  }
  return result;
}

// Merge local state with cloud state — per element der det er mulig, aldri mist data.
// Returns merged state with _effectiveFieldTs so LOAD_STATE can persist correct timestamps.
export function mergeWithCloud(localState, cloudState) {
  const cloudFieldTs = cloudState._fieldTs || {};
  const merged = { ...localState };
  const effectiveFieldTs = {};

  // Kombiner lokale + sky-tombstones: id → nyeste slette-tidspunkt
  const tomb = new Map();
  for (const t of [...hentSlettinger(), ...(Array.isArray(cloudState._tombstones) ? cloudState._tombstones : [])]) {
    if (!t || t.id == null) continue;
    const eks = tomb.get(t.id);
    if (!eks || t.ts > eks) tomb.set(t.id, t.ts);
  }
  const ikkeSlettet = x => !(x && x.id != null && (tomb.get(x.id) || 0) > (x._endret || 0));

  for (const field of Object.keys(FIELD_MAP)) {
    const localTs = getFieldTs(field);
    const cloudTs = cloudFieldTs[field] || cloudState._updatedAt || 0;
    if (ITEM_ARRAYS.has(field) && Array.isArray(localState[field]) && Array.isArray(cloudState[field])) {
      merged[field] = mergeArrayPerItem(localState[field], cloudState[field], {
        cloudNyereFelt: cloudTs > localTs,
      }).filter(ikkeSlettet);
      effectiveFieldTs[field] = Math.max(cloudTs, localTs);
    } else if (cloudTs > localTs && cloudState[field] !== undefined) {
      merged[field] = cloudState[field];
      effectiveFieldTs[field] = cloudTs;
    } else {
      effectiveFieldTs[field] = localTs;
    }
  }
  merged._effectiveFieldTs = effectiveFieldTs;
  merged._updatedAt = cloudState._updatedAt; // pass through so LOAD_STATE can sync fbs_updated_at
  return merged;
}

// Alle data bor i skyen (Redis) — en fersk nettleser starter tomt og fylles
// av cloud-lastingen ved innlogging. Gamle seed-/engangsimport-data er fjernet:
// de lå permanent i bundelen (~43 kB), og med per-element-fletting kunne
// utdaterte seed-elementer i verste fall gjenoppstå i skyen fra en ny enhet.
export function loadState() {
  return {
    ansatte: load('fbs_ansatte', []),
    prosjekter: load('fbs_prosjekter', []),
    tildelinger: load('fbs_tildelinger', []),
    oppgaver: load('fbs_oppgaver', []),
    fag: load('fbs_fag', DEFAULT_FAG),
    teams: load('fbs_teams', []),
    rorTimer: load('fbs_ror_timer', []),
    rorPlaner: load('fbs_ror_planer', []),
    befaringer: load('fbs_befaringer', []),
    reklamasjoner: load('fbs_reklamasjoner', []),
    serviceJobber: load('fbs_service_jobber', []),
    biler: load('fbs_biler', []),
  };
}

export function saveAnsatte(data)       { save('fbs_ansatte',        data, 'ansatte'); }
export function saveProsjekter(data)    { save('fbs_prosjekter',     data, 'prosjekter'); }
export function saveTildelinger(data)   { save('fbs_tildelinger',    data, 'tildelinger'); }
export function saveOppgaver(data)      { save('fbs_oppgaver',       data, 'oppgaver'); }
export function saveFag(data)           { save('fbs_fag',            data, 'fag'); }
export function saveRorTimer(data)      { save('fbs_ror_timer',      data, 'rorTimer'); }
export function saveRorPlaner(data)     { save('fbs_ror_planer',     data, 'rorPlaner'); }
export function saveTeams(data)         { save('fbs_teams',           data, 'teams'); }
export function saveBefaringer(data)    { save('fbs_befaringer',     data, 'befaringer'); }
export function saveReklamasjoner(data) { save('fbs_reklamasjoner',  data, 'reklamasjoner'); }
export function saveServiceJobber(data) { save('fbs_service_jobber', data, 'serviceJobber'); }
export function saveBiler(data)         { save('fbs_biler',          data, 'biler'); }

// Brukes av "Lagre nå"-knappen for å garantere at brukerens lokale state
// vinner over cloud-endringer fra event.js ved neste mergeWithCloud.
// Uten dette kan event.js bumpe _fieldTs i cloud etter brukerens siste
// lagring → cloud vinner → brukerens slettinger/endringer overskrives.
export function forceTimestampAlleFields() {
  const now = Date.now().toString()
  localStorage.setItem('fbs_updated_at', now)
  for (const field of Object.keys(FIELD_MAP)) {
    localStorage.setItem(`fbs_ts_${field}`, now)
  }
}

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
function getToken() { return localStorage.getItem('fbs_token') || ''; }

// Returnerer: state-objekt ({} hvis skyen er tom men nåbar), null KUN ved feil
// (nett/HTTP). Skillet er viktig: tom sky skal IKKE blokkere cloudReady —
// ellers kan første lagring som skulle så skyen aldri skje.
export async function loadFromCloud() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/state', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Synk-status (for indikator i toppmenyen) ──
// Egen mini-store utenfor React-treet så statusendringer ikke re-rendrer
// hele appen — kun indikator-komponenten abonnerer (useSyncExternalStore).
let synkStatus = 'lagret'; // 'lagret' | 'lagrer' | 'feil'
const synkLyttere = new Set();
export function hentSynkStatus() { return synkStatus; }
export function abonnerSynk(lytter) {
  synkLyttere.add(lytter);
  return () => synkLyttere.delete(lytter);
}
function settSynkStatus(s) {
  if (s === synkStatus) return;
  synkStatus = s;
  synkLyttere.forEach(f => f());
}

// Returns 'conflict' if server blocked save (caller should reload from cloud)
// _slettinger: klientens tombstones — lar serveren skille «slettet med vilje»
// fra «mangler fordi klienten er utdatert».
export async function saveToCloud(state) {
  const token = getToken();
  if (!token) return 'ok';
  settSynkStatus('lagrer');
  try {
    const res = await fetch('/api/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ ...state, _updatedAt: getLocalUpdatedAt(), _fieldTs: getAllFieldTs(), _slettinger: hentSlettinger() }),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      console.warn('[FBS] Sky-lagring blokkert – laster ny data fra sky:', data.error);
      return 'conflict'; // beholder 'lagrer' — fletting + nytt forsøk følger
    }
    if (!res.ok) {
      settSynkStatus('feil');
      return 'error';
    }
    settSynkStatus('lagret');
    return 'ok';
  } catch {
    settSynkStatus('feil');
    return 'error'; // localStorage er backup
  }
}
