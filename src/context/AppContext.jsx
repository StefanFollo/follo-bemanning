import { createContext, useContext, useReducer, useEffect } from 'react';
import {
  loadState,
  saveAnsatte, saveProsjekter, saveTildelinger, saveOppgaver, saveFag,
  uid,
} from '../store';

const AppContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
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
      const next = [...state.prosjekter, { ...action.payload, id: uid() }];
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
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
