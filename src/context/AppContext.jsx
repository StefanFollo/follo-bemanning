import { createContext, useContext, useReducer, useEffect, useState, useRef } from 'react';
import {
  loadState, FIELD_MAP,
  saveAnsatte, saveProsjekter, saveTildelinger, saveOppgaver, saveFag, saveTeams, saveRorTimer, saveRorPlaner, saveBefaringer, saveReklamasjoner, saveServiceJobber, saveBiler,
  loadFromCloud, saveToCloud, getLocalUpdatedAt, getFieldTs, mergeWithCloud,
  registrerSletting,
  uid,
} from '../store';

const AppContext = createContext(null);

// Handlinger der payload er selve elementet — stemples med _endret slik at
// per-element-fletting (klient + server) vet hvilken versjon som er nyest.
const STEMPLE_ENDRET = new Set([
  'ADD_ANSATT', 'UPDATE_ANSATT',
  'ADD_PROSJEKT', 'UPDATE_PROSJEKT',
  'ADD_TILDELING', 'UPDATE_TILDELING',
  'ADD_OPPGAVE', 'UPDATE_OPPGAVE',
  'ADD_ROR_TIMER', 'UPDATE_ROR_TIMER',
  'ADD_ROR_PLAN', 'UPDATE_ROR_PLAN',
  'ADD_BEFARING', 'UPDATE_BEFARING',
  'ADD_REKLAMASJON', 'UPDATE_REKLAMASJON',
  'ADD_SERVICE_JOBB', 'UPDATE_SERVICE_JOBB',
  'ADD_BIL', 'UPDATE_BIL',
  'ADD_TEAM', 'UPDATE_TEAM',
]);

// Slette-handlinger → felt, slik at tombstones registreres sentralt.
const SLETT_FELT = {
  DELETE_ANSATT: 'ansatte', DELETE_PROSJEKT: 'prosjekter', DELETE_TILDELING: 'tildelinger',
  DELETE_OPPGAVE: 'oppgaver', DELETE_ROR_TIMER: 'rorTimer', DELETE_ROR_PLAN: 'rorPlaner',
  DELETE_BEFARING: 'befaringer', DELETE_REKLAMASJON: 'reklamasjoner',
  DELETE_SERVICE_JOBB: 'serviceJobber', DELETE_BIL: 'biler', DELETE_TEAM: 'teams',
};

// Skitten-flagg: true når BRUKEREN har endret noe som ikke er lagret til sky ennå.
// LOAD_STATE (data hentet FRA sky) setter det ikke — ellers ville hver poll
// utløst en meningsløs re-lagring som roterer backupene i stykker.
let harLokaleEndringer = false;

// Brukes av auto-oppdateringen i App.jsx: ikke last siden på nytt
// mens brukeren har ulagrede endringer.
export function harUlagredeEndringer() { return harLokaleEndringer; }

function reducer(state, action) {
  if (action.type !== 'LOAD_STATE') harLokaleEndringer = true;
  if (STEMPLE_ENDRET.has(action.type) && action.payload && typeof action.payload === 'object') {
    action = { ...action, payload: { ...action.payload, _endret: Date.now() } };
  }
  // Registrer bevisste slettinger som tombstones — slik at sky-fletting vet at
  // elementet er slettet med vilje (og ikke bare mangler hos en utdatert klient).
  if (SLETT_FELT[action.type] && action.id != null) {
    registrerSletting(SLETT_FELT[action.type], action.id);
    // Kaskade-slettinger:
    if (action.type === 'DELETE_PROSJEKT') {
      for (const t of state.tildelinger || []) if (t.prosjektId === action.id) registrerSletting('tildelinger', t.id);
      for (const o of state.oppgaver || []) if (o.prosjektId === action.id) registrerSletting('oppgaver', o.id);
    }
    if (action.type === 'DELETE_ANSATT') {
      for (const t of state.tildelinger || []) if (t.ansattId === action.id) registrerSletting('tildelinger', t.id);
    }
  }
  if (action.type === 'SPLIT_TILDELING') registrerSletting('tildelinger', action.id);
  if (action.type === 'MERGE_TILDELINGER') { registrerSletting('tildelinger', action.id1); registrerSletting('tildelinger', action.id2); }
  if (action.type === 'SPLIT_ROR_PLAN') registrerSletting('rorPlaner', action.id);
  if (action.type === 'SET_TEAMS') {
    const nyeIds = new Set((action.teams || []).map(t => t.id));
    for (const t of state.teams || []) if (!nyeIds.has(t.id)) registrerSletting('teams', t.id);
  }
  switch (action.type) {
    // --- Last inn fra sky ---
    // Use _effectiveFieldTs (from mergeWithCloud) to preserve original timestamps.
    // Never call saveX() here — those set fbs_ts_* = NOW which creates phantom-newer
    // timestamps that would cause other devices to lose their newer edits on next sync.
    case 'LOAD_STATE': {
      const { _updatedAt, _effectiveFieldTs, ...s } = action.payload;
      for (const [field, lsKey] of Object.entries(FIELD_MAP)) {
        if (s[field] !== undefined) {
          localStorage.setItem(lsKey, JSON.stringify(s[field]));
          const ts = _effectiveFieldTs?.[field];
          if (ts) localStorage.setItem(`fbs_ts_${field}`, String(ts));
        }
      }
      // Keep fbs_updated_at at least as high as the cloud's _updatedAt.
      // This ensures subsequent auto-saves never send a lower _updatedAt than
      // what's already in the cloud, which would cause other devices to miss updates.
      if (_updatedAt) {
        const localTs = getLocalUpdatedAt();
        if (_updatedAt > localTs) localStorage.setItem('fbs_updated_at', String(_updatedAt));
      }
      return { ...state, ...s };
    }

    // --- Ansatte ---
    case 'ADD_ANSATT': {
      const next = [...state.ansatte, { ...action.payload, id: uid() }];
      saveAnsatte(next);
      return { ...state, ansatte: next };
    }
    case 'UPDATE_ANSATT': {
      const next = state.ansatte.map(a => a.id === action.payload.id ? action.payload : a);
      saveAnsatte(next);
      return { ...state, ansatte: next };
    }
    case 'DELETE_ANSATT': {
      const next = state.ansatte.filter(a => a.id !== action.id);
      const tNext = state.tildelinger.filter(t => t.ansattId !== action.id);
      saveAnsatte(next);
      saveTildelinger(tNext);
      return { ...state, ansatte: next, tildelinger: tNext };
    }

    // --- Prosjekter ---
    case 'ADD_PROSJEKT': {
      // Duplikat-vern: hopp over hvis prosjekt med samme navn+adresse finnes
      const nName = (action.payload.navn || '').toLowerCase().trim();
      const nAddr = (action.payload.adresse || '').toLowerCase().trim();
      const finnesAllerede = state.prosjekter.some(p =>
        (p.navn || '').toLowerCase().trim() === nName &&
        (p.adresse || '').toLowerCase().trim() === nAddr
      );
      if (nName && finnesAllerede) {
        console.warn('[ADD_PROSJEKT] Duplikat forhindret:', action.payload.navn);
        return state;
      }
      const next = [...state.prosjekter, { ...action.payload, id: action.payload.id || uid() }];
      saveProsjekter(next);
      return { ...state, prosjekter: next };
    }
    case 'UPDATE_PROSJEKT': {
      const next = state.prosjekter.map(p => p.id === action.payload.id ? action.payload : p);
      saveProsjekter(next);
      return { ...state, prosjekter: next };
    }
    case 'DELETE_PROSJEKT': {
      const next = state.prosjekter.filter(p => p.id !== action.id);
      const tNext = state.tildelinger.filter(t => t.prosjektId !== action.id);
      const oNext = state.oppgaver.filter(o => o.prosjektId !== action.id);
      saveProsjekter(next);
      saveTildelinger(tNext);
      saveOppgaver(oNext);
      return { ...state, prosjekter: next, tildelinger: tNext, oppgaver: oNext };
    }

    // --- Tildelinger ---
    case 'ADD_TILDELING': {
      const next = [...state.tildelinger, { ...action.payload, id: uid() }];
      saveTildelinger(next);
      return { ...state, tildelinger: next };
    }
    case 'UPDATE_TILDELING': {
      const next = state.tildelinger.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t);
      saveTildelinger(next);
      return { ...state, tildelinger: next };
    }
    case 'SPLIT_TILDELING': {
      // Remove original, add two new parts
      const without = state.tildelinger.filter(t => t.id !== action.id);
      const withParts = [...without, ...action.parts.map(p => ({ ...p, id: uid() }))];
      saveTildelinger(withParts);
      return { ...state, tildelinger: withParts };
    }
    case 'MERGE_TILDELINGER': {
      // Remove both originals, add one merged
      const without = state.tildelinger.filter(t => t.id !== action.id1 && t.id !== action.id2);
      const withMerged = [...without, { ...action.merged, id: uid() }];
      saveTildelinger(withMerged);
      return { ...state, tildelinger: withMerged };
    }
    case 'PATCH_TILDELINGER': {
      // Oppdater KUN tildelinger fra sky – aldri befaringer, ansatte, prosjekter e.l.
      saveTildelinger(action.tildelinger);
      return { ...state, tildelinger: action.tildelinger };
    }
    case 'DELETE_TILDELING': {
      const next = state.tildelinger.filter(t => t.id !== action.id);
      saveTildelinger(next);
      return { ...state, tildelinger: next };
    }

    // --- Oppgaver ---
    case 'ADD_OPPGAVE': {
      const next = [...state.oppgaver, { ...action.payload, id: uid() }];
      saveOppgaver(next);
      return { ...state, oppgaver: next };
    }
    case 'UPDATE_OPPGAVE': {
      const next = state.oppgaver.map(o => o.id === action.payload.id ? action.payload : o);
      saveOppgaver(next);
      return { ...state, oppgaver: next };
    }
    case 'DELETE_OPPGAVE': {
      const next = state.oppgaver.filter(o => o.id !== action.id);
      saveOppgaver(next);
      return { ...state, oppgaver: next };
    }

    // --- Rørlegger timer ---
    case 'ADD_ROR_TIMER': {
      const next = [...(state.rorTimer || []), { ...action.payload, id: uid() }];
      saveRorTimer(next);
      return { ...state, rorTimer: next };
    }
    case 'UPDATE_ROR_TIMER': {
      const next = (state.rorTimer || []).map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t);
      saveRorTimer(next);
      return { ...state, rorTimer: next };
    }
    case 'DELETE_ROR_TIMER': {
      const next = (state.rorTimer || []).filter(t => t.id !== action.id);
      saveRorTimer(next);
      return { ...state, rorTimer: next };
    }

    // --- Rørlegger planer (dato-spenn, bemanningsplan-stil) ---
    case 'ADD_ROR_PLAN': {
      const next = [...(state.rorPlaner || []), { ...action.payload, id: uid() }];
      saveRorPlaner(next);
      return { ...state, rorPlaner: next };
    }
    case 'UPDATE_ROR_PLAN': {
      const next = (state.rorPlaner || []).map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p);
      saveRorPlaner(next);
      return { ...state, rorPlaner: next };
    }
    case 'DELETE_ROR_PLAN': {
      const next = (state.rorPlaner || []).filter(p => p.id !== action.id);
      saveRorPlaner(next);
      return { ...state, rorPlaner: next };
    }
    case 'SPLIT_ROR_PLAN': {
      const next = (state.rorPlaner || [])
        .filter(p => p.id !== action.id)
        .concat(action.parts.map(part => ({ ...part, id: uid() })));
      saveRorPlaner(next);
      return { ...state, rorPlaner: next };
    }

    // --- Befaringer ---
    case 'ADD_BEFARING': {
      const next = [...(state.befaringer || []), { ...action.payload, id: action.payload.id || uid() }];
      saveBefaringer(next);
      return { ...state, befaringer: next };
    }
    case 'UPDATE_BEFARING': {
      const next = (state.befaringer || []).map(b => b.id === action.payload.id ? { ...b, ...action.payload } : b);
      saveBefaringer(next);
      return { ...state, befaringer: next };
    }
    case 'DELETE_BEFARING': {
      const next = (state.befaringer || []).filter(b => b.id !== action.id);
      saveBefaringer(next);
      return { ...state, befaringer: next };
    }

    // --- Reklamasjoner ---
    case 'ADD_REKLAMASJON': {
      const next = [...(state.reklamasjoner || []), { ...action.payload, id: uid() }];
      saveReklamasjoner(next);
      return { ...state, reklamasjoner: next };
    }
    case 'UPDATE_REKLAMASJON': {
      const next = (state.reklamasjoner || []).map(r => r.id === action.payload.id ? { ...r, ...action.payload } : r);
      saveReklamasjoner(next);
      return { ...state, reklamasjoner: next };
    }
    case 'DELETE_REKLAMASJON': {
      const next = (state.reklamasjoner || []).filter(r => r.id !== action.id);
      saveReklamasjoner(next);
      return { ...state, reklamasjoner: next };
    }

    // --- Service-jobber ---
    case 'ADD_SERVICE_JOBB': {
      const next = [...(state.serviceJobber || []), { ...action.payload, id: uid() }];
      saveServiceJobber(next);
      return { ...state, serviceJobber: next };
    }
    case 'UPDATE_SERVICE_JOBB': {
      const next = (state.serviceJobber || []).map(s => s.id === action.payload.id ? { ...s, ...action.payload } : s);
      saveServiceJobber(next);
      return { ...state, serviceJobber: next };
    }
    case 'DELETE_SERVICE_JOBB': {
      const next = (state.serviceJobber || []).filter(s => s.id !== action.id);
      saveServiceJobber(next);
      return { ...state, serviceJobber: next };
    }

    // --- Biler ---
    case 'ADD_BIL': {
      const next = [...(state.biler || []), { ...action.payload, id: action.payload.id || uid() }];
      saveBiler(next);
      return { ...state, biler: next };
    }
    case 'UPDATE_BIL': {
      const next = (state.biler || []).map(b => b.id === action.payload.id ? { ...b, ...action.payload } : b);
      saveBiler(next);
      return { ...state, biler: next };
    }
    case 'DELETE_BIL': {
      const next = (state.biler || []).filter(b => b.id !== action.id);
      saveBiler(next);
      return { ...state, biler: next };
    }

    // --- Teams ---
    case 'ADD_TEAM': {
      const next = [...(state.teams || []), { ...action.payload, id: uid() }];
      saveTeams(next);
      return { ...state, teams: next };
    }
    case 'UPDATE_TEAM': {
      const next = (state.teams || []).map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t);
      saveTeams(next);
      return { ...state, teams: next };
    }
    case 'DELETE_TEAM': {
      const next = (state.teams || []).filter(t => t.id !== action.id);
      saveTeams(next);
      return { ...state, teams: next };
    }
    case 'SET_TEAMS': {
      saveTeams(action.teams);
      return { ...state, teams: action.teams };
    }

    // --- Fag ---
    case 'ADD_FAG': {
      if (state.fag.includes(action.navn)) return state;
      const next = [...state.fag, action.navn];
      saveFag(next);
      return { ...state, fag: next };
    }
    case 'DELETE_FAG': {
      const next = state.fag.filter(f => f !== action.navn);
      saveFag(next);
      return { ...state, fag: next };
    }

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState);
  const [cloudReady, setCloudReady] = useState(false);
  // stateRef: always holds the latest state for use in polling closure
  const stateRef = useRef(state);
  // lastCloudTsRef: tracks the highest _updatedAt we've seen from the cloud,
  // so we only trigger a reload when someone else has actually saved something new
  const lastCloudTsRef = useRef(0);

  useEffect(() => { stateRef.current = state; }, [state]);

  // Last inn fra sky ved oppstart – flet inn per element basert på tidsstempel.
  // VIKTIG: cloudReady settes KUN etter vellykket lasting — ellers kan en enhet
  // med gamle data lagre over det andre har lagt inn. Feiler lastingen (nett/
  // token), prøver vi igjen hvert 3. sekund til vi får kontakt.
  useEffect(() => {
    let stoppet = false;
    async function initLast() {
      const cloudState = await loadFromCloud();
      if (stoppet) return;
      if (cloudState) {
        lastCloudTsRef.current = cloudState._updatedAt || 0;
        const merged = mergeWithCloud(stateRef.current, cloudState);
        dispatch({ type: 'LOAD_STATE', payload: merged });
        setCloudReady(true);
      } else if (!localStorage.getItem('fbs_token')) {
        // Ikke innlogget — ingen sky å vente på
        setCloudReady(true);
      } else {
        setTimeout(initLast, 3000);
      }
    }
    initLast();
    return () => { stoppet = true; };
  }, []);

  // Auto-lagre til sky 1 sekund etter siste endring — men KUN når brukeren
  // faktisk har endret noe (ikke når vi bare har hentet andres endringer).
  // Ved 409-konflikt: flet inn kun feltene sky har nyere data for.
  useEffect(() => {
    if (!cloudReady) return;
    if (!harLokaleEndringer) return;
    const timer = setTimeout(async () => {
      // Nullstill FØR lagring: endringer som kommer inn mens vi lagrer setter
      // flagget på nytt og får sin egen lagring.
      harLokaleEndringer = false;
      const result = await saveToCloud(state);
      if (result === 'ok') {
        // Track what we just sent so polling doesn't re-trigger on our own save
        lastCloudTsRef.current = Math.max(lastCloudTsRef.current, getLocalUpdatedAt());
      } else if (result === 'conflict') {
        const cloudState = await loadFromCloud();
        if (cloudState) {
          // stateRef (ikke state fra closure): brukeren kan ha endret ting
          // mens de to nettverkskallene pågikk — de må ikke gå tapt.
          const merged = mergeWithCloud(stateRef.current, cloudState);
          lastCloudTsRef.current = cloudState._updatedAt || 0;
          dispatch({ type: 'LOAD_STATE', payload: merged });
        }
        harLokaleEndringer = true; // lokale endringer er ennå ikke lagret
      } else {
        harLokaleEndringer = true; // nettfeil — prøv igjen ved neste anledning
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [state, cloudReady]);

  // Sanntids-polling: sjekk sky hvert 5. sekund.
  // Hvis en annen bruker har lagret, henter vi ny data og fletter inn.
  useEffect(() => {
    if (!cloudReady) return;
    async function friskOpp() {
      const cloudState = await loadFromCloud();
      if (!cloudState) return;
      const cloudTs = cloudState._updatedAt || 0;
      if (cloudTs > lastCloudTsRef.current) {
        const merged = mergeWithCloud(stateRef.current, cloudState);
        lastCloudTsRef.current = cloudTs;
        dispatch({ type: 'LOAD_STATE', payload: merged });
      }
    }
    const interval = setInterval(friskOpp, 5000);
    // Enheter som våkner fra dvale (iPad!) eller får nett igjen: synk STRAKS,
    // før brukeren rekker å redigere på gamle data.
    const onVis = () => { if (document.visibilityState === 'visible') friskOpp(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', friskOpp);
    window.addEventListener('online', friskOpp);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', friskOpp);
      window.removeEventListener('online', friskOpp);
    };
  }, [cloudReady]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
