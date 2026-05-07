import { createContext, useContext, useReducer, useEffect, useState } from 'react';
import {
  loadState,
  saveAnsatte, saveProsjekter, saveTildelinger, saveOppgaver, saveFag, saveRorTimer, saveRorPlaner, saveBefaringer, saveReklamasjoner, saveServiceJobber,
  loadFromCloud, saveToCloud, getLocalUpdatedAt,
  uid,
} from '../store';

const AppContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    // --- Last inn fra sky ---
    case 'LOAD_STATE': {
      const { _updatedAt, ...s } = action.payload;
      if (s.ansatte) saveAnsatte(s.ansatte);
      if (s.prosjekter) saveProsjekter(s.prosjekter);
      if (s.tildelinger) saveTildelinger(s.tildelinger);
      if (s.oppgaver) saveOppgaver(s.oppgaver);
      if (s.fag) saveFag(s.fag);
      if (s.rorTimer) saveRorTimer(s.rorTimer);
      if (s.rorPlaner) saveRorPlaner(s.rorPlaner);
      if (s.befaringer) saveBefaringer(s.befaringer);
      if (s.reklamasjoner) saveReklamasjoner(s.reklamasjoner);
      if (s.serviceJobber) saveServiceJobber(s.serviceJobber);
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

  // Last inn fra sky ved oppstart – men kun hvis sky-data er nyere enn lokale data
  useEffect(() => {
    loadFromCloud().then(cloudState => {
      if (cloudState) {
        const cloudUpdatedAt = cloudState._updatedAt || 0;
        const localUpdatedAt = getLocalUpdatedAt();
        // Bruk sky-data kun hvis: ingen lokal timestamp (første gang) ELLER sky er nyere
        if (localUpdatedAt === 0 || cloudUpdatedAt > localUpdatedAt) {
          dispatch({ type: 'LOAD_STATE', payload: cloudState });
        }
      }
      setCloudReady(true);
    });
  }, []);

  // Auto-lagre til sky 1 sekund etter siste endring
  useEffect(() => {
    if (!cloudReady) return;
    const timer = setTimeout(() => saveToCloud(state), 1000);
    return () => clearTimeout(timer);
  }, [state, cloudReady]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
