import React, { useState, useRef, useLayoutEffect, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { weekStart, addDays, isoToDate, dateToIso, formatDate, overlaps } from '../store';
import { getHolidayMap } from '../holidays';

const FERIE_ID = '__FERIE__';

const FAG_COLORS = {
  'Anleggsleder': '#b45309',
  'Bas Tømrer': '#b45309', // bakoverkompatibilitet
  'Montør': '#3b82f6',
  'Lærling Tømrer': '#15803d',
  'Maler': '#ec4899',
  'Rørlegger': '#0e7490',
  'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316',
  'Prosjektleder': '#0ea5e9',
};

function fagColor(fag) { return FAG_COLORS[fag] || '#6b7280'; }

const DAG_NAVN = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const MAANED_NAVN = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'];

function monthStart(isoDate) {
  return isoDate.slice(0, 7) + '-01';
}
function addMonths(isoDate, n) {
  const d = isoToDate ? new Date(isoDate + 'T00:00:00') : new Date(isoDate);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10).slice(0, 7) + '-01';
}
function monthEnd(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}
function monthLabel(isoDate) {
  const m = parseInt(isoDate.slice(5, 7), 10) - 1;
  return MAANED_NAVN[m] + ' ' + isoDate.slice(0, 4);
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Er ansatt sykmeldt i en gitt periode? Sykmeldt uten datoer = sykmeldt nå.
function erSykmeldtIPeriode(a, start, end) {
  if (!a.sykmeldt) return false;
  if (!a.sykmeldtFra && !a.sykmeldtTil) return true; // på ubestemt tid
  const fra = a.sykmeldtFra || '0000-01-01';
  const til = a.sykmeldtTil || '9999-12-31';
  return overlaps(fra, til, start, end);
}

function daysDiff(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

export default function Bemanningsplan({ readOnly = false }) {
  const { state, dispatch } = useApp();
  // Ansatte som er med i bemanningsplan-kapasitetsberegningen
  const planAnsatte = state.ansatte.filter(a => !a.utenforBemanningsplan && a.fag !== 'Rørlegger');

  const [tab, setTab] = useState('uke');
  const [fullscreen, setFullscreen] = useState(false);
  const [storskjerm, setStorskjerm] = useState(false);
  const [storskjermZoom, setStorskjermZoom] = useState(1);
  const [fagFilter, setFagFilter] = useState(null);
  // Kompakt visning (lavere rader, som ProResult) — valget huskes per enhet
  const [kompakt, setKompakt] = useState(() => localStorage.getItem('fbs_oversikt_kompakt') === '1');
  function toggleKompakt() {
    setKompakt(k => {
      localStorage.setItem('fbs_oversikt_kompakt', k ? '0' : '1');
      return !k;
    });
  }
  const storskjermContentRef = useRef(null);
  const [ukeMode, setUkeMode] = useState('dag'); // 'dag' | 'uke' | 'maaned'
  const [ferieYearOffset, setFerieYearOffset] = useState(0);
  const oversiktScrollRef = useRef(null);
  const oversiktPanRef    = useRef(null); // { startX, startScrollLeft, pointerId, panning }
  const [ansatteOrder, setAnsatteOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fbs_ansatte_order_v2') || '[]'); } catch { return []; }
  });
  const oversiktDragId = useRef(null);
  const [currentWeek, setCurrentWeek] = useState(() => weekStart(dateToIso(new Date())));
  const [currentMonth, setCurrentMonth] = useState(() => monthStart(dateToIso(new Date())));
  const [showModal, setShowModal] = useState(false);
  const [tilForm, setTilForm] = useState({ ansattId: '', prosjektId: '', startDato: '', sluttDato: '' });
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamForm, setTeamForm] = useState({ navn: '', farge: '#3b82f6', ansatteIds: [] });
  const [redigererTeam, setRedigererTeam] = useState(null);
  const [teamTildelForm, setTeamTildelForm] = useState({ teamId: '', prosjektId: '', startDato: '', sluttDato: '' });
  const [visTeamTildel, setVisTeamTildel] = useState(false);
  const [barMenu, setBarMenu] = useState(null); // { t, splitDay, x, y }
  const dragRef = useRef(null);
  const scrollRestoreRef = useRef(null); // lagrer scroll-posisjoner mellom dispatch og useLayoutEffect
  const teamDragIdx = useRef(null);
  const [teamDragOver, setTeamDragOver] = useState(null);
  const memberDragInfo = useRef(null); // { ansattId, fromTeamId }
  const [memberDragOverTeam, setMemberDragOverTeam] = useState(null);

  // Needle-state flyttes hit (var i UkeVisning) slik at UkeVisning() kan kalles som funksjon
  const [needleDay, setNeedleDay] = useState(() => dateToIso(new Date()));
  const draggingNeedle = useRef(false);
  const gridWrapRef = useRef(null);

  // Auto-skaler innhold i storskjerm-modus (bredde-basert, ingen høyde-klemming)
  useEffect(() => {
    const el = storskjermContentRef.current;
    if (!el) return;
    if (!storskjerm) {
      el.style.zoom = '';
      return;
    }
    el.style.zoom = '1';
    requestAnimationFrame(() => {
      if (!storskjermContentRef.current) return;
      // Skaler kun etter bredde – vertikal scrolling er OK
      const zoom = Math.min(1, window.innerWidth / el.scrollWidth);
      setStorskjermZoom(zoom);
      el.style.zoom = String(zoom);
    });
  }, [storskjerm, tab, ukeMode]);

  // Scroll Oversikt-tidslinja til i dag når fanen åpnes
  useEffect(() => {
    if (tab !== 'oversikt') return;
    const el = oversiktScrollRef.current;
    if (!el) return;
    const LABEL_W = 162;
    const DAY_W   = 36;
    const PAST_WEEKS = 4;
    const targetLeft = LABEL_W + PAST_WEEKS * 5 * DAY_W - 120;
    el.scrollLeft = Math.max(0, targetLeft);
  }, [tab]);

  // useLayoutEffect kjøres synkront etter DOM-oppdatering men FØR nettleseren tegner.
  // Bruker dette til å gjenopprette scroll etter dispatch, selv om komponenten ble re-mountet.
  useLayoutEffect(() => {
    if (!scrollRestoreRef.current) return;
    const { winY, winX, wraps, oversiktLeft, oversiktTop } = scrollRestoreRef.current;
    scrollRestoreRef.current = null;
    window.scrollTo({ top: winY, left: winX, behavior: 'instant' });
    const newWraps = [...document.querySelectorAll('.uke-grid-wrap')];
    newWraps.forEach((el, i) => {
      if (wraps[i] !== undefined) {
        el.scrollTop = wraps[i].top;
        el.scrollLeft = wraps[i].left;
      }
    });
    if (oversiktScrollRef.current && oversiktLeft !== null) {
      oversiktScrollRef.current.scrollLeft = oversiktLeft;
      oversiktScrollRef.current.scrollTop  = oversiktTop;
    }
  });

  // Kun hverdager (Man–Fre) over 52 uker = ~260 kolonner
  const weekDays = Array.from({ length: 52 * 7 }, (_, i) => addDays(currentWeek, i))
    .filter(d => { const dow = new Date(d + 'T00:00:00').getDay(); return dow >= 1 && dow <= 5; });

  // Helligdagskart – memoisert slik at det ikke bygges på nytt hver render
  const thisYear = new Date().getFullYear();
  const holidaysUke = useMemo(() => getHolidayMap(thisYear - 1, thisYear + 2), [thisYear]);
  const holidaysOversikt = useMemo(() => getHolidayMap(thisYear - 1, thisYear + 3), [thisYear]);

  function prevWeek() { setCurrentWeek(w => addDays(w, -7)); }
  function nextWeek() { setCurrentWeek(w => addDays(w, 7)); }
  function thisWeek() { setCurrentWeek(weekStart(dateToIso(new Date()))); }

  function openAddTildeling(ansattId, dag) {
    setTilForm({
      ansattId: ansattId || (state.ansatte[0]?.id || ''),
      prosjektId: state.prosjekter[0]?.id || '',
      startDato: dag || currentWeek,
      sluttDato: dag || addDays(currentWeek, 4),
    });
    setShowModal(true);
  }

  function openAddFerie(ansattId) {
    setTilForm({
      ansattId: ansattId || (state.ansatte[0]?.id || ''),
      prosjektId: FERIE_ID,
      startDato: currentWeek,
      sluttDato: addDays(currentWeek, 4),
    });
    setShowModal(true);
  }

  // Anleggsleder kan ha flere prosjekter parallelt
  const FLER_PROSJEKT_FAG = ['Anleggsleder', 'Prosjektleder'];
  function kanHaFlereProsjekter(ansattId) {
    const ansatt = state.ansatte.find(a => a.id === ansattId);
    return ansatt && FLER_PROSJEKT_FAG.includes(ansatt.fag);
  }

  // Sjekker om ansatt allerede er tildelt et prosjekt i den gitte perioden
  // ekskluderTildelingId brukes ved redigering slik at vi ikke kolliderer med seg selv
  function harKonflikt(ansattId, startDato, sluttDato, ekskluderTildelingId = null) {
    if (kanHaFlereProsjekter(ansattId)) return false; // Anleggsleder/PL kan ha flere
    return state.tildelinger.some(t =>
      t.ansattId === ansattId &&
      t.prosjektId !== FERIE_ID &&
      t.id !== ekskluderTildelingId &&
      overlaps(t.startDato, t.sluttDato, startDato, sluttDato)
    );
  }

  // Parallelle prosjekter er LOV (f.eks. Helena på flere prosjekter samme uke)
  // — men vi spør først, så utilsiktet dobbeltbooking fortsatt fanges.
  function bekreftParallell(ansattId, startDato, sluttDato, ekskluderTildelingId = null) {
    if (!harKonflikt(ansattId, startDato, sluttDato, ekskluderTildelingId)) return true;
    const navn = state.ansatte.find(a => a.id === ansattId)?.navn || 'Ansatt';
    return confirm(`${navn} er allerede tildelt et prosjekt i denne perioden.\n\nLegge inn som parallelt prosjekt likevel?`);
  }

  function handleAddTildeling() {
    if (!tilForm.ansattId || !tilForm.prosjektId || !tilForm.startDato || !tilForm.sluttDato) return;
    if (tilForm.prosjektId !== FERIE_ID && !bekreftParallell(tilForm.ansattId, tilForm.startDato, tilForm.sluttDato)) {
      return;
    }
    dispatch({ type: 'ADD_TILDELING', payload: tilForm });
    setShowModal(false);
  }

  // Tildel hele teamet til prosjekt
  function handleTildelTeam(teamId, prosjektId, startDato, sluttDato) {
    const team = (state.teams || []).find(t => t.id === teamId);
    if (!team || !prosjektId || !startDato || !sluttDato) return;
    let konflikter = 0;
    for (const ansattId of (team.ansatteIds || [])) {
      if (!harKonflikt(ansattId, startDato, sluttDato)) {
        dispatch({ type: 'ADD_TILDELING', payload: { ansattId, prosjektId, startDato, sluttDato } });
      } else {
        konflikter++;
      }
    }
    if (konflikter > 0) alert(`${konflikter} teammedlem(mer) var allerede opptatt og ble ikke tildelt.`);
    setShowTeamModal(false);
  }

  function deleteTildeling(id) {
    dispatch({ type: 'DELETE_TILDELING', id });
  }

  function openBarMenu(t, splitDay, x, y) {
    setBarMenu({ t, splitDay, x, y });
  }

  function handleSplitAtDay(t, splitDay) {
    if (!splitDay || splitDay <= t.startDato || splitDay > t.sluttDato) return;
    dispatch({
      type: 'SPLIT_TILDELING', id: t.id,
      parts: [
        { ansattId: t.ansattId, prosjektId: t.prosjektId, startDato: t.startDato, sluttDato: addDays(splitDay, -1) },
        { ansattId: t.ansattId, prosjektId: t.prosjektId, startDato: splitDay,    sluttDato: t.sluttDato },
      ],
    });
  }

  function handleMergeWith(t, neighbor) {
    dispatch({
      type: 'MERGE_TILDELINGER',
      id1: t.id,
      id2: neighbor.id,
      merged: {
        ansattId: t.ansattId,
        prosjektId: t.prosjektId,
        startDato: t.startDato < neighbor.startDato ? t.startDato : neighbor.startDato,
        sluttDato: t.sluttDato > neighbor.sluttDato ? t.sluttDato : neighbor.sluttDato,
      },
    });
  }

  // Lagre og gjenopprette scroll-posisjon rundt dispatch
  // Scroll-gjenopprettelsen skjer i useLayoutEffect over, etter at DOM er oppdatert
  function dispatchKeepScroll(action) {
    const wraps = [...document.querySelectorAll('.uke-grid-wrap')];
    const oversiktLeft = oversiktScrollRef.current ? oversiktScrollRef.current.scrollLeft : null;
    const oversiktTop  = oversiktScrollRef.current ? oversiktScrollRef.current.scrollTop  : null;
    scrollRestoreRef.current = {
      winY: window.scrollY,
      winX: window.scrollX,
      wraps: wraps.map(el => ({ top: el.scrollTop, left: el.scrollLeft })),
      oversiktLeft,
      oversiktTop,
    };
    dispatch(action);
  }

  function handleDrop(targetDay, unit /* 'day'|'week'|'month' */) {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    const t = state.tildelinger.find(t => t.id === d.tildelingId);
    if (!t) return;
    if (d.type === 'move') {
      const duration = daysDiff(t.startDato, t.sluttDato);
      const offset = unit === 'day' ? d.offsetDays : 0;
      const newStart = addDays(targetDay, -offset);
      const newEnd = addDays(newStart, duration);
      if (t.prosjektId !== FERIE_ID && !bekreftParallell(t.ansattId, newStart, newEnd, t.id)) {
        return;
      }
      dispatchKeepScroll({ type: 'UPDATE_TILDELING', payload: { ...t, startDato: newStart, sluttDato: newEnd } });
    } else if (d.type === 'end') {
      const newEnd = unit === 'week' ? addDays(targetDay, 6)
                  : unit === 'month' ? monthEnd(targetDay)
                  : targetDay;
      if (newEnd >= t.startDato) {
        if (t.prosjektId !== FERIE_ID) {
          const mergeCandidate = state.tildelinger.find(n =>
            n.id !== t.id && n.ansattId === t.ansattId && n.prosjektId === t.prosjektId &&
            overlaps(t.startDato, newEnd, n.startDato, n.sluttDato)
          );
          if (mergeCandidate) {
            const mergedEnd = mergeCandidate.sluttDato > newEnd ? mergeCandidate.sluttDato : newEnd;
            dispatchKeepScroll({
              type: 'MERGE_TILDELINGER', id1: t.id, id2: mergeCandidate.id,
              merged: { ansattId: t.ansattId, prosjektId: t.prosjektId, startDato: t.startDato, sluttDato: mergedEnd },
            });
            return;
          }
          if (!bekreftParallell(t.ansattId, t.startDato, newEnd, t.id)) {
            return;
          }
        }
        dispatchKeepScroll({ type: 'UPDATE_TILDELING', payload: { ...t, sluttDato: newEnd } });
      }
    } else if (d.type === 'start') {
      const newStart = targetDay;
      if (newStart <= t.sluttDato) {
        if (t.prosjektId !== FERIE_ID) {
          const mergeCandidate = state.tildelinger.find(n =>
            n.id !== t.id && n.ansattId === t.ansattId && n.prosjektId === t.prosjektId &&
            overlaps(newStart, t.sluttDato, n.startDato, n.sluttDato)
          );
          if (mergeCandidate) {
            const mergedStart = mergeCandidate.startDato < newStart ? mergeCandidate.startDato : newStart;
            dispatchKeepScroll({
              type: 'MERGE_TILDELINGER', id1: t.id, id2: mergeCandidate.id,
              merged: { ansattId: t.ansattId, prosjektId: t.prosjektId, startDato: mergedStart, sluttDato: t.sluttDato },
            });
            return;
          }
          if (!bekreftParallell(t.ansattId, newStart, t.sluttDato, t.id)) {
            return;
          }
        }
        dispatchKeepScroll({ type: 'UPDATE_TILDELING', payload: { ...t, startDato: newStart } });
      }
    }
  }

  return (
    <div className={`page${fullscreen ? ' bplan-fullscreen' : ''}${storskjerm ? ' bplan-storskjerm' : ''}`}>
      {/* Storskjerm: flytende lukk-knapp */}
      {storskjerm && (
        <div className="bplan-storskjerm-toolbar no-print">
          <button onClick={() => {
            const z = Math.min(2, +(storskjermZoom + 0.05).toFixed(2));
            setStorskjermZoom(z);
            if (storskjermContentRef.current) storskjermContentRef.current.style.zoom = String(z);
          }}>＋</button>
          <span>{Math.round(storskjermZoom * 100)}%</span>
          <button onClick={() => {
            const z = Math.max(0.1, +(storskjermZoom - 0.05).toFixed(2));
            setStorskjermZoom(z);
            if (storskjermContentRef.current) storskjermContentRef.current.style.zoom = String(z);
          }}>－</button>
          <button className="bplan-storskjerm-close" onClick={() => setStorskjerm(false)}>✕ Lukk</button>
        </div>
      )}

      <div className="page-header">
        <h2>Bemanningsplan</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn no-print" onClick={() => setStorskjerm(s => !s)} title="Storskjerm – skalert oversikt for TV/projektor">
            {storskjerm ? '✕ Lukk' : '📺 Storskjerm'}
          </button>
          <button className="btn no-print" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm – se alle ansatte'}>
            {fullscreen ? '✕ Lukk' : '⛶ Fullskjerm'}
          </button>
          <button className="btn no-print" onClick={() => window.print()} title="Skriv ut / Lagre som PDF">🖨 PDF</button>
          {!readOnly && <button className="btn no-print" onClick={() => openAddFerie()} title="Registrer ferie eller fri">🏖 Ferie</button>}
          {!readOnly && <button className="btn btn-primary no-print" onClick={() => openAddTildeling()}>+ Ny tildeling</button>}
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'uke' ? 'active' : ''}`} onClick={() => setTab('uke')}>
          Ukeoversikt
        </button>
        <button className={`tab-btn ${tab === 'oversikt' ? 'active' : ''}`} onClick={() => setTab('oversikt')}>
          📋 Oversikt
        </button>
        <button className={`tab-btn ${tab === 'ressurs' ? 'active' : ''}`} onClick={() => setTab('ressurs')}>
          Ressursallokering
        </button>
        <button className={`tab-btn ${tab === 'prosjekt' ? 'active' : ''}`} onClick={() => setTab('prosjekt')}>
          Prosjektoversikt
        </button>
        <button className={`tab-btn ${tab === 'ferie' ? 'active' : ''}`} onClick={() => setTab('ferie')}>
          🏖 Ferie
        </button>
        <button className={`tab-btn ${tab === 'bursdag' ? 'active' : ''}`} onClick={() => setTab('bursdag')}>
          🎂 Bursdag
        </button>
        <button className={`tab-btn ${tab === 'teams' ? 'active' : ''}`} onClick={() => setTab('teams')}>
          👷 Team {(state.teams || []).length > 0 && <span className="count-badge" style={{ marginLeft: 4 }}>{(state.teams || []).length}</span>}
        </button>
      </div>

      <div ref={storskjermContentRef}>
        {tab === 'uke' && (
          <UkeVisning
            state={state}
            readOnly={readOnly}
            planAnsatte={planAnsatte}
            currentWeek={currentWeek}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            ukeMode={ukeMode}
            setUkeMode={setUkeMode}
            fagFilter={fagFilter}
            setFagFilter={setFagFilter}
            weekDays={weekDays}
            prevWeek={prevWeek}
            nextWeek={nextWeek}
            thisWeek={thisWeek}
            needleDay={needleDay}
            setNeedleDay={setNeedleDay}
            draggingNeedle={draggingNeedle}
            gridWrapRef={gridWrapRef}
            dragRef={dragRef}
            HOLIDAYS={holidaysUke}
            handleDrop={handleDrop}
            openAddTildeling={openAddTildeling}
            openBarMenu={openBarMenu}
            deleteTildeling={deleteTildeling}
          />
        )}
        {tab === 'oversikt' && (
          <OversiktVisning
            state={state}
            readOnly={readOnly}
            planAnsatte={planAnsatte}
            fagFilter={fagFilter}
            setFagFilter={setFagFilter}
            kompakt={kompakt}
            toggleKompakt={toggleKompakt}
            ansatteOrder={ansatteOrder}
            setAnsatteOrder={setAnsatteOrder}
            oversiktScrollRef={oversiktScrollRef}
            oversiktPanRef={oversiktPanRef}
            oversiktDragId={oversiktDragId}
            dragRef={dragRef}
            HOLIDAYS={holidaysOversikt}
            handleDrop={handleDrop}
            openAddTildeling={openAddTildeling}
            openBarMenu={openBarMenu}
          />
        )}
        {tab === 'ressurs' && (
          <RessursVisning
            state={state}
            planAnsatte={planAnsatte}
            currentWeek={currentWeek}
            prevWeek={prevWeek}
            nextWeek={nextWeek}
            thisWeek={thisWeek}
          />
        )}
        {tab === 'prosjekt' && <ProsjektOversiktVisning state={state} />}
        {tab === 'ferie' && (
          <FerieVisning
            state={state}
            readOnly={readOnly}
            ferieYearOffset={ferieYearOffset}
            setFerieYearOffset={setFerieYearOffset}
            openAddFerie={openAddFerie}
            deleteTildeling={deleteTildeling}
          />
        )}
        {tab === 'bursdag' && <BursdagVisning state={state} />}
        {tab === 'teams' && (
          <TeamsVisning
            state={state}
            dispatch={dispatch}
            currentWeek={currentWeek}
            redigererTeam={redigererTeam}
            setRedigererTeam={setRedigererTeam}
            teamForm={teamForm}
            setTeamForm={setTeamForm}
            showTeamModal={showTeamModal}
            setShowTeamModal={setShowTeamModal}
            teamTildelForm={teamTildelForm}
            setTeamTildelForm={setTeamTildelForm}
            visTeamTildel={visTeamTildel}
            setVisTeamTildel={setVisTeamTildel}
            teamDragIdx={teamDragIdx}
            teamDragOver={teamDragOver}
            setTeamDragOver={setTeamDragOver}
            memberDragInfo={memberDragInfo}
            memberDragOverTeam={memberDragOverTeam}
            setMemberDragOverTeam={setMemberDragOverTeam}
            handleTildelTeam={handleTildelTeam}
          />
        )}
      </div>

      {barMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setBarMenu(null)} />
          <div style={{
            position: 'fixed',
            top: Math.min(barMenu.y + 8, window.innerHeight - 200),
            left: Math.min(barMenu.x, window.innerWidth - 220),
            zIndex: 9999,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.16)',
            padding: '12px 14px',
            minWidth: 210,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>
              {barMenu.t.prosjektId === FERIE_ID
                ? '🏖 Ferie / Fri'
                : state.prosjekter.find(p => p.id === barMenu.t.prosjektId)?.navn || '–'}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
              {state.ansatte.find(a => a.id === barMenu.t.ansattId)?.navn}
              {' · '}{formatDate(barMenu.t.startDato)} – {formatDate(barMenu.t.sluttDato)}
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>✂ Del fra dato</label>
              <input type="date"
                value={barMenu.splitDay}
                min={addDays(barMenu.t.startDato, 1)}
                max={barMenu.t.sluttDato}
                onChange={e => setBarMenu(m => ({ ...m, splitDay: e.target.value }))}
                style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, marginBottom: 6, boxSizing: 'border-box' }}
              />
              {barMenu.splitDay > barMenu.t.startDato && barMenu.splitDay <= barMenu.t.sluttDato && (
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                  Del 1: til <b>{formatDate(addDays(barMenu.splitDay, -1))}</b>
                  {' · '}Del 2: fra <b>{formatDate(barMenu.splitDay)}</b>
                </div>
              )}
              <button
                disabled={!barMenu.splitDay || barMenu.splitDay <= barMenu.t.startDato || barMenu.splitDay > barMenu.t.sluttDato}
                onClick={() => { handleSplitAtDay(barMenu.t, barMenu.splitDay); setBarMenu(null); }}
                style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: '#185FA5', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500, marginBottom: 6, opacity: (!barMenu.splitDay || barMenu.splitDay <= barMenu.t.startDato) ? 0.4 : 1 }}
              >
                ✂ Del opp
              </button>
            </div>

            {(() => {
              const t = barMenu.t;
              const naboer = state.tildelinger.filter(n =>
                n.id !== t.id &&
                n.ansattId === t.ansattId &&
                n.prosjektId === t.prosjektId &&
                (n.sluttDato === addDays(t.startDato, -1) || n.startDato === addDays(t.sluttDato, 1))
              );
              if (naboer.length === 0) return null;
              return (
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 6 }}>⟷ Slå sammen med</label>
                  {naboer.map(n => (
                    <button key={n.id}
                      onClick={() => { handleMergeWith(t, n); setBarMenu(null); }}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid #d1fae5', background: '#f0fdf4', color: '#15803d', fontSize: 12, cursor: 'pointer', marginBottom: 4, textAlign: 'left' }}
                    >
                      ⟷ {n.sluttDato === addDays(t.startDato, -1) ? '← ' : '→ '}
                      {formatDate(n.startDato)} – {formatDate(n.sluttDato)}
                    </button>
                  ))}
                </div>
              );
            })()}

            <button
              onClick={() => { deleteTildeling(barMenu.t.id); setBarMenu(null); }}
              style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
            >
              ✕ Slett tildeling
            </button>
          </div>
        </>
      )}

      {showModal && (
        <Modal title={tilForm.prosjektId === FERIE_ID ? '🏖 Legg til ferie / fri' : 'Legg til tildeling'} onClose={() => setShowModal(false)}>
          <div className="form">
            <label>Ansatt *</label>
            <select value={tilForm.ansattId} onChange={e => setTilForm(f => ({ ...f, ansattId: e.target.value }))}>
              {[...state.ansatte].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(a => (
                <option key={a.id} value={a.id}>
                  {a.innleie ? '🔧 ' : ''}{a.navn} ({a.fag})
                </option>
              ))}
            </select>

            <label>{tilForm.prosjektId === FERIE_ID ? 'Type' : 'Prosjekt *'}</label>
            <select value={tilForm.prosjektId} onChange={e => setTilForm(f => ({ ...f, prosjektId: e.target.value }))}>
              <option value={FERIE_ID}>🏖 Ferie / Fri</option>
              {[...state.prosjekter].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(p => <option key={p.id} value={p.id}>{p.navn}</option>)}
            </select>

            <div className="form-row">
              <div>
                <label>Fra dato *</label>
                <input type="date" value={tilForm.startDato} onChange={e => setTilForm(f => ({ ...f, startDato: e.target.value }))} />
              </div>
              <div>
                <label>Til dato *</label>
                <input type="date" value={tilForm.sluttDato} onChange={e => setTilForm(f => ({ ...f, sluttDato: e.target.value }))} />
              </div>
            </div>

            {state.ansatte.length === 0 && <p style={{ color: '#dc2626' }}>Legg til ansatte først.</p>}

            {tilForm.prosjektId !== FERIE_ID && tilForm.ansattId && tilForm.startDato && tilForm.sluttDato &&
              harKonflikt(tilForm.ansattId, tilForm.startDato, tilForm.sluttDato) && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#92400e' }}>
                ℹ️ {state.ansatte.find(a => a.id === tilForm.ansattId)?.navn} er allerede tildelt et prosjekt i denne perioden — dette legges inn som <strong>parallelt prosjekt</strong> (vises på egen linje i oversikten).
              </div>
            )}

            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button
                className="btn btn-primary"
                onClick={handleAddTildeling}
                disabled={state.ansatte.length === 0}
              >
                Lagre
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- UKE-VISNING ---
function UkeVisning({
  state, readOnly, planAnsatte, currentWeek, currentMonth, setCurrentMonth,
  ukeMode, setUkeMode, fagFilter, setFagFilter, weekDays,
  prevWeek, nextWeek, thisWeek,
  needleDay, setNeedleDay, draggingNeedle, gridWrapRef,
  dragRef, HOLIDAYS, handleDrop, openAddTildeling, openBarMenu, deleteTildeling,
}) {
  const today = dateToIso(new Date());
  const isHoliday = (iso) => !!HOLIDAYS[iso];
  const holidayName = (iso) => HOLIDAYS[iso] || '';
  const prosjektColor = (pid) => state.prosjekter.find(p => p.id === pid)?.farge || '#6b8fc4';
  // Felles props som trés ned til GanttRowContainer via rad-komponentene
  const gantt = { state, readOnly, dragRef, today, isHoliday, holidayName, prosjektColor, handleDrop, openAddTildeling, openBarMenu, deleteTildeling };

  // ---- DAG-MODUS ----
  const weekEnd = addDays(currentWeek, 52 * 7 - 1);

  const dagProsjektIds = [...new Set(
    state.tildelinger
      .filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, currentWeek, weekEnd))
      .map(t => t.prosjektId)
  )];
  const dagProsjekter = dagProsjektIds.map(id => state.prosjekter.find(p => p.id === id)).filter(Boolean).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  const dagTildeltIds = new Set(
    state.tildelinger.filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, currentWeek, weekEnd)).map(t => t.ansattId)
  );
  const dagLedige = planAnsatte.filter(a => !dagTildeltIds.has(a.id) && !erSykmeldtIPeriode(a, currentWeek, weekEnd));





  // ---- UKE-MODUS: Man–Fre × 52 uker (260 kolonner) ----
  const TEN_WEEKS = Array.from({ length: 52 }, (_, i) => addDays(currentWeek, i * 7));

  // Alle arbeidsdager (Man–Fre) for 52 uker = 260 dager
  const WORK_DAYS_UKE = [];
  for (let w = 0; w < 52; w++) {
    for (let d = 0; d < 5; d++) {
      WORK_DAYS_UKE.push(addDays(currentWeek, w * 7 + d));
    }
  }

  const periodeStart = currentWeek;
  const periodeEnd = addDays(currentWeek, 52 * 7 - 1);

  const ukeProsjektIds = [...new Set(
    state.tildelinger
      .filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, periodeStart, periodeEnd))
      .map(t => t.prosjektId)
  )];
  const ukeProsjekter = ukeProsjektIds.map(id => state.prosjekter.find(p => p.id === id)).filter(Boolean).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  const ukeTildeltIds = new Set(
    state.tildelinger.filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, periodeStart, periodeEnd)).map(t => t.ansattId)
  );
  const ukeLedige = planAnsatte.filter(a => !ukeTildeltIds.has(a.id) && !erSykmeldtIPeriode(a, periodeStart, periodeEnd));

  // Needle helpers
  function getNeedleLeft(day) {
    const idx = WORK_DAYS_UKE.indexOf(day);
    if (idx < 0) return null;
    const pct = (idx / WORK_DAYS_UKE.length) * 100;
    const pxOffset = (idx / WORK_DAYS_UKE.length) * 180;
    return `calc(${(150 - pxOffset).toFixed(1)}px + ${pct.toFixed(2)}%)`;
  }
  function handleNeedlePointerDown(e) {
    e.preventDefault();
    draggingNeedle.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handleNeedlePointerMove(e) {
    if (!draggingNeedle.current) return;
    const wrap = gridWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left + wrap.scrollLeft - 150;
    const colWidth = (wrap.scrollWidth - 150) / WORK_DAYS_UKE.length;
    const idx = Math.max(0, Math.min(WORK_DAYS_UKE.length - 1, Math.floor(x / colWidth)));
    setNeedleDay(WORK_DAYS_UKE[idx]);
  }
  function handleNeedlePointerUp() { draggingNeedle.current = false; }




  const SIX_MONTHS = Array.from({ length: 18 }, (_, i) => addMonths(currentMonth, i));
  const maanedPeriodeEnd = monthEnd(SIX_MONTHS[17]);

  const maanedProsjektIds = [...new Set(
    state.tildelinger
      .filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, currentMonth, maanedPeriodeEnd))
      .map(t => t.prosjektId)
  )];
  const maanedProsjekter = maanedProsjektIds.map(id => state.prosjekter.find(p => p.id === id)).filter(Boolean).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  const maanedTildeltIds = new Set(
    state.tildelinger.filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, currentMonth, maanedPeriodeEnd)).map(t => t.ansattId)
  );
  const maanedLedige = planAnsatte.filter(a => !maanedTildeltIds.has(a.id) && !erSykmeldtIPeriode(a, currentMonth, maanedPeriodeEnd));




  const navLabel = ukeMode === 'dag'
    ? `${formatDate(currentWeek)} – ${formatDate(weekDays[weekDays.length - 1])}`
    : ukeMode === 'uke'
    ? `${formatDate(currentWeek)} – ${formatDate(addDays(currentWeek, 51 * 7 + 4))}`
    : `${monthLabel(SIX_MONTHS[0])} – ${monthLabel(SIX_MONTHS[17])}`;

  function handlePrev() {
    if (ukeMode === 'maaned') setCurrentMonth(m => addMonths(m, -1));
    else prevWeek();
  }
  function handleNext() {
    if (ukeMode === 'maaned') setCurrentMonth(m => addMonths(m, 1));
    else nextWeek();
  }
  function handleToday() {
    if (ukeMode === 'maaned') setCurrentMonth(monthStart(dateToIso(new Date())));
    else thisWeek();
  }

  function renderProsjektRader(prosjekter, ledige, cols, AnsattRad, periodeS, periodeE, radExtra) {
    // Ansatte med ferie i perioden (brukes til å splitte "ledige"-seksjonen)
    const ferieIds = new Set(
      state.tildelinger
        .filter(t => t.prosjektId === FERIE_ID && overlaps(t.startDato, t.sluttDato, periodeS, periodeE))
        .map(t => t.ansattId)
    );
    // Ledige uten ferie → "Ikke tildelt", ledige med ferie → eget "Ferie"-avsnitt nederst
    const ikkeTildelt = ledige.filter(a => !ferieIds.has(a.id)).filter(a => !fagFilter || a.fag === fagFilter);
    const ferieKun    = ledige.filter(a =>  ferieIds.has(a.id)).filter(a => !fagFilter || a.fag === fagFilter);

    return (
      <>
        {prosjekter.map(prosjekt => {
          const color = prosjektColor(prosjekt.id);
          const ids = [...new Set(state.tildelinger.filter(t => t.prosjektId === prosjekt.id && overlaps(t.startDato, t.sluttDato, periodeS, periodeE)).map(t => t.ansattId))];
          const ansatte = ids.map(id => planAnsatte.find(a => a.id === id)).filter(Boolean)
            .filter(a => !fagFilter || a.fag === fagFilter);
          if (ansatte.length === 0) return null;
          return (
            <React.Fragment key={prosjekt.id}>
              <div className="uke-prosjekt-header" style={{ gridColumn: '1 / -1', borderLeft: `4px solid ${color}` }}>
                <span className="uke-prosjekt-farge" style={{ background: color }} />
                <span className="uke-prosjekt-navn">{prosjekt.navn}</span>
                <span className="uke-prosjekt-antall">{ansatte.length} ansatt{ansatte.length !== 1 ? 'e' : ''}</span>
              </div>
              {ansatte.map(a => <AnsattRad key={a.id} ansatt={a} prosjektId={prosjekt.id} {...radExtra} />)}
            </React.Fragment>
          );
        })}
        {ikkeTildelt.length > 0 && (
          <React.Fragment>
            <div className="uke-prosjekt-header" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #5d6b80' }}>
              <span className="uke-prosjekt-navn" style={{ color: '#6b7280' }}>Ikke tildelt i perioden</span>
              <span className="uke-prosjekt-antall">{ikkeTildelt.length} ansatt{ikkeTildelt.length !== 1 ? 'e' : ''}</span>
            </div>
            {ikkeTildelt.map(a => <AnsattRad key={a.id} ansatt={a} prosjektId={null} {...radExtra} />)}
          </React.Fragment>
        )}
        {ferieKun.length > 0 && (
          <React.Fragment>
            <div className="uke-prosjekt-header" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #b45309' }}>
              <span className="uke-prosjekt-farge" style={{ background: '#b45309' }} />
              <span className="uke-prosjekt-navn">🏖 Ferie / Fri</span>
              <span className="uke-prosjekt-antall">{ferieKun.length} ansatt{ferieKun.length !== 1 ? 'e' : ''}</span>
            </div>
            {ferieKun.map(a => <AnsattRad key={a.id} ansatt={a} prosjektId={null} {...radExtra} />)}
          </React.Fragment>
        )}
      </>
    );
  }

  // Kapasitet denne uken
  const kapWEnd = addDays(currentWeek, 4);
  const kapOpptattIds = new Set(
    state.tildelinger
      .filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, currentWeek, kapWEnd))
      .map(t => t.ansattId)
  );
  const kapFerieIds = new Set(
    state.tildelinger
      .filter(t => t.prosjektId === FERIE_ID && overlaps(t.startDato, t.sluttDato, currentWeek, kapWEnd))
      .map(t => t.ansattId)
  );
  const kapTotal   = planAnsatte.length;
  const kapOpptatt = planAnsatte.filter(a => kapOpptattIds.has(a.id)).length;
  const kapFerie   = planAnsatte.filter(a => kapFerieIds.has(a.id) && !kapOpptattIds.has(a.id)).length;
  const kapSyk     = planAnsatte.filter(a => erSykmeldtIPeriode(a, currentWeek, kapWEnd) && !kapOpptattIds.has(a.id) && !kapFerieIds.has(a.id)).length;
  const kapLedig   = kapTotal - kapOpptatt - kapFerie - kapSyk;
  const kapPst     = kapTotal > 0 ? Math.round((kapOpptatt / kapTotal) * 100) : 0;

  const fagOptions = state.fag.filter(f => planAnsatte.some(a => a.fag === f));

  return (
    <div>
      <div className="uke-nav">
        <button className="btn" onClick={handlePrev}>← Forrige</button>
        <div className="uke-label">{navLabel}</div>
        <button className="btn" onClick={handleToday}>I dag</button>
        <button className="btn" onClick={handleNext}>Neste →</button>
        <div className="ukemode-toggle">
          <button className={`ukemode-btn ${ukeMode === 'dag' ? 'active' : ''}`} onClick={() => setUkeMode('dag')}>Dager</button>
          <button className={`ukemode-btn ${ukeMode === 'uke' ? 'active' : ''}`} onClick={() => setUkeMode('uke')}>Uker</button>
          <button className={`ukemode-btn ${ukeMode === 'maaned' ? 'active' : ''}`} onClick={() => setUkeMode('maaned')}>Måneder</button>
        </div>
      </div>

      {/* Kapasitetsmåler – kun i dagmodus */}
      {ukeMode === 'dag' && kapTotal > 0 && (
        <div className="bplan-kap-banner">
          <span className="bplan-kap-tittel">Uke {getWeekNumber(currentWeek)}</span>
          <span className="bplan-kap-chip bplan-kap-chip--opptatt">🔨 {kapOpptatt} opptatt</span>
          {kapFerie > 0 && <span className="bplan-kap-chip bplan-kap-chip--ferie">🏖 {kapFerie} ferie</span>}
          <span className="bplan-kap-chip" style={{ background: kapLedig > 0 ? '#f0fdf4' : '#fef2f2', color: kapLedig > 0 ? '#15803d' : '#dc2626' }}>
            {kapLedig > 0 ? '✅' : '🔴'} {kapLedig} ledig
          </span>
          <div className="bplan-kap-bar-outer">
            <div className="bplan-kap-bar-seg bplan-kap-bar-opptatt" style={{ width: kapPst + '%' }} />
            <div className="bplan-kap-bar-seg bplan-kap-bar-ferie" style={{ width: (kapTotal > 0 ? kapFerie / kapTotal * 100 : 0) + '%' }} />
          </div>
          <span className="bplan-kap-pst">{kapPst}% utnyttet</span>
        </div>
      )}

      {/* Fag-filter */}
      {fagOptions.length > 1 && (
        <div className="bplan-fag-filter">
          <button className={`bplan-fag-pill${!fagFilter ? ' aktiv' : ''}`} onClick={() => setFagFilter(null)}>Alle</button>
          {fagOptions.map(f => (
            <button key={f}
              className={`bplan-fag-pill${fagFilter === f ? ' aktiv' : ''}`}
              style={fagFilter === f
                ? { background: fagColor(f), color: '#fff', borderColor: fagColor(f) }
                : { borderColor: fagColor(f), color: fagColor(f) }}
              onClick={() => setFagFilter(ff => ff === f ? null : f)}>
              {f}
            </button>
          ))}
        </div>
      )}

      {state.ansatte.length === 0 && <div className="empty">Ingen ansatte registrert enda.</div>}

      {ukeMode === 'dag' ? (
        <div className="uke-grid-wrap">
          <div className="uke-grid" style={{ gridTemplateColumns: `150px repeat(${weekDays.length}, minmax(36px, 1fr))` }}>
            <DagGridHeader weekDays={weekDays} HOLIDAYS={HOLIDAYS} today={today} />
            {renderProsjektRader(dagProsjekter, dagLedige, weekDays.length, DagAnsattRad, currentWeek, weekEnd, { days: weekDays, gantt })}
            {!fagFilter && <RorleggerRader state={state} days={weekDays} unit="day" viewStart={currentWeek} viewEnd={weekEnd} />}
          </div>
        </div>
      ) : ukeMode === 'uke' ? (
        <div className="uke-grid-wrap"
          ref={gridWrapRef}
          onPointerMove={handleNeedlePointerMove}
          onPointerUp={handleNeedlePointerUp}
        >
          {/* Drabar dato-nål */}
          {getNeedleLeft(needleDay) && (
            <div className="timeline-needle"
              style={{ left: getNeedleLeft(needleDay) }}
              onPointerDown={handleNeedlePointerDown}
              title={`Nål: ${formatDate(needleDay)} — dra for å flytte`}
            >
              <div className="needle-label">{formatDate(needleDay)}</div>
            </div>
          )}
          <div className="uke-grid" style={{ gridTemplateColumns: `150px repeat(260, minmax(28px, 1fr))` }}>
            <UkeGridHeader WORK_DAYS_UKE={WORK_DAYS_UKE} TEN_WEEKS={TEN_WEEKS} today={today} HOLIDAYS={HOLIDAYS} />
            {renderProsjektRader(ukeProsjekter, ukeLedige, 260, UkeAnsattRad, periodeStart, periodeEnd, { days: WORK_DAYS_UKE, gantt })}
            {!fagFilter && <RorleggerRader state={state} days={WORK_DAYS_UKE} unit="day" viewStart={periodeStart} viewEnd={periodeEnd} />}
          </div>
        </div>
      ) : (
        <div className="uke-grid-wrap">
          <div className="uke-grid" style={{ gridTemplateColumns: `150px repeat(18, minmax(80px, 1fr))` }}>
            <MaanedGridHeader SIX_MONTHS={SIX_MONTHS} today={today} />
            {renderProsjektRader(maanedProsjekter, maanedLedige, 18, MaanedAnsattRad, currentMonth, maanedPeriodeEnd, { days: SIX_MONTHS, gantt })}
            {!fagFilter && <RorleggerRader state={state} days={SIX_MONTHS} unit="month" viewStart={currentMonth} viewEnd={maanedPeriodeEnd} />}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>
        Klikk på en celle for å legge til en tildeling.
      </div>
    </div>
  );
}

// Shared Gantt row container — renders continuous bars with drag handles
// prosjektId: vis kun dette prosjektets bars normalt; andre prosjekter vises som opptatt-bar
function GanttRowContainer({
  ansatt, days, unit, prosjektId,
  state, readOnly, dragRef, today, isHoliday, holidayName, prosjektColor,
  handleDrop, openAddTildeling, openBarMenu, deleteTildeling,
}) {
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const n = days.length;
  const viewEnd = unit === 'month' ? monthEnd(days[n - 1]) : days[n - 1];

  const myTil = state.tildelinger.filter(t =>
    t.ansattId === ansatt.id && overlaps(t.startDato, t.sluttDato, days[0], viewEnd)
  );

  // Splitt i primær (dette prosjektet + ferie) og opptatt (andre prosjekter)
  const primaryTil = prosjektId
    ? myTil.filter(t => t.prosjektId === prosjektId || t.prosjektId === FERIE_ID)
    : myTil;
  const busyTil = prosjektId
    ? myTil.filter(t => t.prosjektId !== prosjektId && t.prosjektId !== FERIE_ID)
    : [];

  function getIdxFromEvent(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.min(n - 1, Math.max(0, Math.floor(x / (rect.width / n))));
  }

  function getBarPos(t) {
    let si = -1, ei = -1;
    for (let i = 0; i < n; i++) {
      const hit = unit === 'month'
        ? overlaps(t.startDato, t.sluttDato, days[i], monthEnd(days[i]))
        : (days[i] >= t.startDato && days[i] <= t.sluttDato);
      if (hit) { if (si === -1) si = i; ei = i; }
    }
    if (si === -1) return null;
    return {
      left: `${(si / n) * 100}%`,
      width: `${((ei - si + 1) / n) * 100}%`,
      isFirst: t.startDato >= days[0],
      isLast: t.sluttDato <= viewEnd,
    };
  }

  return (
    <div
      className="gantt-row"
      style={{ gridColumn: '2 / -1' }}
      onDragOver={e => { e.preventDefault(); setDragOverIdx(getIdxFromEvent(e)); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverIdx(null); }}
      onDrop={e => {
        e.preventDefault();
        const idx = getIdxFromEvent(e);
        setDragOverIdx(null);
        handleDrop(days[idx], unit === 'month' ? 'month' : 'day');
      }}
      onClick={e => {
        if (!readOnly && (e.target === e.currentTarget || e.target.classList.contains('gantt-bg-cell'))) {
          openAddTildeling(ansatt.id, days[getIdxFromEvent(e)]);
        }
      }}
    >
      {days.map((d, i) => {
        const isMonday = unit === 'day_50' && i % 5 === 0;
        const isTod = unit === 'month' ? d.slice(0, 7) === today.slice(0, 7) : d === today;
        const isHol = unit !== 'month' && isHoliday(d);
        return (
          <div key={d}
            className={`gantt-bg-cell${isTod ? ' today-col' : ''}${isMonday ? ' week-start-col' : ''}${isHol ? ' holiday-col' : ''}${dragOverIdx === i ? ' drag-over' : ''}`}
            style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
            title={isHol ? holidayName(d) : undefined}
          />
        );
      })}
      {/* Opptatt-bars: andre prosjekter — gjennomsiktig, ikke klikkbar */}
      {busyTil.map(t => {
        const pos = getBarPos(t);
        if (!pos) return null;
        const pNavn = state.prosjekter.find(pr => pr.id === t.prosjektId)?.navn || '–';
        return (
          <div key={t.id + '-busy'}
            className="gantt-bar gantt-bar-busy"
            style={{ left: pos.left, width: pos.width, background: prosjektColor(t.prosjektId) }}
            title={`Opptatt: ${pNavn} · ${formatDate(t.startDato)} – ${formatDate(t.sluttDato)}`}
          >
            <span className="gantt-busy-label">{pNavn}</span>
          </div>
        );
      })}
      {/* Primær-bars: dette prosjektets tildelinger + ferie */}
      {primaryTil.map(t => {
        const pos = getBarPos(t);
        if (!pos) return null;
        const isFerie = t.prosjektId === FERIE_ID;
        const p = isFerie ? null : state.prosjekter.find(pr => pr.id === t.prosjektId);
        const barLabel = isFerie ? 'Ferie / Fri' : (p?.navn || '–');
        return (
          <div key={t.id}
            className={`gantt-bar${isFerie ? ' gantt-bar-ferie' : ''}`}
            style={{ left: pos.left, width: pos.width, ...(isFerie ? {} : { background: prosjektColor(t.prosjektId) }) }}
            onClick={e => {
              e.stopPropagation();
              const mid = addDays(t.startDato, Math.max(1, Math.floor(daysDiff(t.startDato, t.sluttDato) / 2)));
              openBarMenu(t, mid, e.clientX, e.clientY);
            }}
            title={`${barLabel} · ${formatDate(t.startDato)} – ${formatDate(t.sluttDato)} — klikk for valg`}
          >
            {pos.isFirst
              ? <div className="gantt-handle gantt-handle-l" draggable onDragStart={e => { e.stopPropagation(); dragRef.current = { tildelingId: t.id, type: 'start' }; }}>◂</div>
              : <div className="gantt-handle-spacer" />}
            <span className="gantt-label">{barLabel}</span>
            <div className="gantt-actions">
              <button onClick={e => { e.stopPropagation(); deleteTildeling(t.id); }} title="Slett">✕</button>
            </div>
            {pos.isLast
              ? <div className="gantt-handle gantt-handle-r" draggable onDragStart={e => { e.stopPropagation(); dragRef.current = { tildelingId: t.id, type: 'end' }; }}>▸</div>
              : <div className="gantt-handle-spacer" />}
          </div>
        );
      })}
    </div>
  );
}

function DagAnsattRad({ ansatt, prosjektId, days, gantt }) {
  return (
    <React.Fragment>
      <div className="uke-row-label">
        <div className="mini-avatar" style={{ background: fagColor(ansatt.fag) }}>
          {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="row-navn">{ansatt.navn}</div>
          <div className="row-fag" style={{ color: fagColor(ansatt.fag) }}>
            {ansatt.innleie && <span style={{ color: '#f97316', fontWeight: 500, marginRight: 3 }}>🔧</span>}
            {ansatt.fag}
          </div>
        </div>
      </div>
      <GanttRowContainer ansatt={ansatt} days={days} unit="day" prosjektId={prosjektId} {...gantt} />
    </React.Fragment>
  );
}

function DagGridHeader({ weekDays, HOLIDAYS, today }) {
  return (
    <>
      <div className="uke-header-cell"></div>
      {weekDays.map((dag) => {
        const hol = HOLIDAYS[dag];
        const dow = new Date(dag + 'T00:00:00').getDay(); // 1=Man … 5=Fre
        const isMonday = dow === 1;
        const weekNum = getWeekNumber(dag);
        const isCurrentWeek = weekStart(dag) === weekStart(today);
        return (
          <div key={dag} className={`uke-header-cell ${dag === today ? 'today' : ''} ${isMonday ? 'week-start-col' : ''} ${hol ? 'holiday-header' : ''}`}
            style={{ fontSize: 11, padding: '4px 2px', textAlign: 'center' }}
            title={hol || undefined}>
            {isMonday && (
              <div style={{ fontSize: 10, fontWeight: 500, color: isCurrentWeek ? '#2563eb' : '#5d6b80', lineHeight: 1.2 }}>
                U{weekNum}
              </div>
            )}
            <div style={{ fontWeight: isMonday ? 500 : 400 }}>{DAG_NAVN[dow - 1]}</div>
            <div className="dag-dato" style={{ fontSize: 10 }}>{dag.slice(8)}.{dag.slice(5, 7)}</div>
            {hol && <div className="holiday-label">{hol.split(' ')[0]}</div>}
          </div>
        );
      })}
    </>
  );
}

function ProsjektGruppe({ prosjekt, ansatte, cols, GridHeader, AnsattRad, prosjektColor }) {
  const color = prosjektColor(prosjekt.id);
  return (
    <div className="uke-prosjekt-gruppe">
      <div className="uke-prosjekt-header" style={{ borderLeft: `4px solid ${color}` }}>
        <span className="uke-prosjekt-farge" style={{ background: color }} />
        <span className="uke-prosjekt-navn">{prosjekt.navn}</span>
        <span className="uke-prosjekt-antall">{ansatte.length} ansatt{ansatte.length !== 1 ? 'e' : ''}</span>
      </div>
      <div className="uke-grid-wrap">
        <div className="uke-grid" style={{ gridTemplateColumns: `180px repeat(${cols}, 1fr)` }}>
          <GridHeader />
          {ansatte.map(a => <AnsattRad key={a.id} ansatt={a} />)}
        </div>
      </div>
    </div>
  );
}

function UkeAnsattRad({ ansatt, prosjektId, days, gantt }) {
  return (
    <React.Fragment>
      <div className="uke-row-label" style={ansatt.sykmeldt ? { opacity: 0.45, filter: 'grayscale(1)' } : {}}>
        <div className="mini-avatar" style={{ background: ansatt.sykmeldt ? '#5d6b80' : fagColor(ansatt.fag) }}>
          {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="row-navn">{ansatt.navn}</div>
          <div className="row-fag" style={{ color: ansatt.sykmeldt ? '#5d6b80' : fagColor(ansatt.fag) }}>
            {ansatt.sykmeldt ? '🤒 Sykmeldt' : ansatt.innleie ? <><span style={{ color: '#f97316', fontWeight: 500, marginRight: 3 }}>🔧</span>{ansatt.fag}</> : ansatt.fag}
          </div>
        </div>
      </div>
      <GanttRowContainer ansatt={ansatt} days={days} unit="day_50" prosjektId={prosjektId} {...gantt} />
    </React.Fragment>
  );
}

function UkeGridHeader({ WORK_DAYS_UKE, TEN_WEEKS, today, HOLIDAYS }) {
  return (
    <>
      <div className="uke-header-cell"></div>
      {WORK_DAYS_UKE.map((dag, i) => {
        const isMonday = i % 5 === 0;
        const weekIdx = Math.floor(i / 5);
        const isToday = dag === today;
        const isCurrentWeek = weekStart(dag) === weekStart(today);
        const hol = HOLIDAYS[dag];
        return (
          <div key={dag}
            className={`uke-header-cell ${isToday ? 'today' : ''} ${isMonday ? 'week-start-col' : ''} ${hol ? 'holiday-header' : ''}`}
            style={{ fontSize: 11, padding: '4px 2px', textAlign: 'center' }}
            title={hol || undefined}>
            {isMonday && (
              <div style={{ fontSize: 10, fontWeight: 500, color: isCurrentWeek ? '#2563eb' : '#5d6b80', lineHeight: 1.2 }}>
                U{getWeekNumber(TEN_WEEKS[weekIdx])}
              </div>
            )}
            <div style={{ fontWeight: isMonday ? 500 : 400 }}>{DAG_NAVN[i % 5]}</div>
            <div className="dag-dato" style={{ fontSize: 10 }}>{dag.slice(8)}.{dag.slice(5, 7)}</div>
            {hol && <div className="holiday-label">{hol.split(' ')[0]}</div>}
          </div>
        );
      })}
    </>
  );
}

function MaanedAnsattRad({ ansatt, prosjektId, days, gantt }) {
  return (
    <React.Fragment>
      <div className="uke-row-label" style={ansatt.sykmeldt ? { opacity: 0.45, filter: 'grayscale(1)' } : {}}>
        <div className="mini-avatar" style={{ background: ansatt.sykmeldt ? '#5d6b80' : fagColor(ansatt.fag) }}>
          {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="row-navn">{ansatt.navn}</div>
          <div className="row-fag" style={{ color: ansatt.sykmeldt ? '#5d6b80' : fagColor(ansatt.fag) }}>
            {ansatt.sykmeldt ? '🤒 Sykmeldt' : ansatt.innleie ? <><span style={{ color: '#f97316', fontWeight: 500, marginRight: 3 }}>🔧</span>{ansatt.fag}</> : ansatt.fag}
          </div>
        </div>
      </div>
      <GanttRowContainer ansatt={ansatt} days={days} unit="month" prosjektId={prosjektId} {...gantt} />
    </React.Fragment>
  );
}

function MaanedGridHeader({ SIX_MONTHS, today }) {
  return (
    <>
      <div className="uke-header-cell"></div>
      {SIX_MONTHS.map(m => {
        const isCurrentMonth = m.slice(0, 7) === today.slice(0, 7);
        return (
          <div key={m} className={`uke-header-cell ${isCurrentMonth ? 'today' : ''}`} style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 500 }}>{monthLabel(m)}</div>
          </div>
        );
      })}
    </>
  );
}

// ── Rørlegger-seksjon nederst i uke-visningen — SYNKET fra Rørlegger-fanen.
// Kun visning her; planene redigeres under Rørlegger (rorPlaner/rorTimer/befaringer).
function hentRorItems(state, ansattId, viewStart, viewEnd, medEnkeltdager) {
  const items = [];
  for (const p of (state.rorPlaner || [])) {
    if (p.ansattId !== ansattId || !overlaps(p.startDato, p.sluttDato, viewStart, viewEnd)) continue;
    const proj = state.prosjekter.find(x => x.id === p.prosjektId);
    items.push({ id: 'rp-' + p.id, startDato: p.startDato, sluttDato: p.sluttDato, navn: p.fritekst || proj?.navn || '?', farge: proj?.farge || '#0e7490' });
  }
  if (medEnkeltdager) {
    for (const t of (state.rorTimer || [])) {
      if (t.ansattId !== ansattId || !t.dato || t.dato < viewStart || t.dato > viewEnd) continue;
      const proj = state.prosjekter.find(x => x.id === t.prosjektId);
      items.push({ id: 'rt-' + t.id, startDato: t.dato, sluttDato: t.dato, navn: t.fritekst || proj?.navn || '?', farge: proj?.farge || '#0e7490' });
    }
    for (const b of (state.befaringer || [])) {
      if (b.prosjektlederId !== ansattId || !b.dato || b.dato < viewStart || b.dato > viewEnd) continue;
      items.push({ id: 'bf-' + b.id, startDato: b.dato, sluttDato: b.dato, navn: '🔍 ' + (b.adresse || b.navn || 'Befaring'), farge: '#6d28d9' });
    }
  }
  return items;
}

function fordelLaner(items) {
  const laneSlutt = []; const laneOf = {};
  for (const it of [...items].sort((a, b) => a.startDato.localeCompare(b.startDato) || a.sluttDato.localeCompare(b.sluttDato))) {
    let l = laneSlutt.findIndex(s => it.startDato > s);
    if (l === -1) { l = laneSlutt.length; laneSlutt.push(it.sluttDato); } else laneSlutt[l] = it.sluttDato;
    laneOf[it.id] = l;
  }
  return { laneOf, antall: Math.max(1, laneSlutt.length) };
}

function RorleggerRader({ state, days, unit, viewStart, viewEnd }) {
  const rorleggere = state.ansatte
    .filter(a => a.fag === 'Rørlegger')
    .sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  if (rorleggere.length === 0) return null;
  const n = days.length;

  function pos(start, slutt) {
    let si = -1, ei = -1;
    if (unit === 'month') {
      for (let i = 0; i < n; i++) {
        if (overlaps(start, slutt, days[i], monthEnd(days[i]))) { if (si === -1) si = i; ei = i; }
      }
    } else {
      for (let i = 0; i < n; i++) {
        if (si === -1 && days[i] >= start) si = i;
        if (days[i] <= slutt) ei = i;
      }
    }
    if (si === -1 || ei === -1 || si > ei) return null;
    return { left: `${(si / n) * 100}%`, width: `${((ei - si + 1) / n) * 100}%` };
  }

  return (
    <>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: '#ecfeff', borderTop: '2px solid #0e7490', borderBottom: '1px solid #a5f3fc', fontSize: 11, fontWeight: 500, color: '#0e7490', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        🔧 Rørlegger — synket fra Rørlegger-fanen
      </div>
      {rorleggere.map(ansatt => {
        const items = hentRorItems(state, ansatt.id, viewStart, viewEnd, unit !== 'month');
        const { laneOf, antall } = fordelLaner(items);
        const radH = Math.max(40, antall * 20 + 8);
        return (
          <React.Fragment key={ansatt.id}>
            <div className="uke-row-label" style={{ minHeight: radH }}>
              <div className="mini-avatar" style={{ background: '#0e7490' }}>
                {ansatt.navn.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="row-navn">{ansatt.navn}</div>
                <div className="row-fag" style={{ color: '#0e7490' }}>Rørlegger</div>
              </div>
            </div>
            <div style={{ gridColumn: '2 / -1', position: 'relative', minHeight: radH, borderBottom: '1px solid #f1f5f9' }}
              title="Rørlegger-planen redigeres i Rørlegger-fanen">
              {items.map(it => {
                const p = pos(it.startDato, it.sluttDato);
                if (!p) return null;
                return (
                  <div key={it.id}
                    style={{ position: 'absolute', left: p.left, width: p.width, top: laneOf[it.id] * 20 + 4, height: 16, background: it.farge, borderRadius: 3, opacity: .9, color: '#fff', fontSize: 9.5, fontWeight: 500, display: 'flex', alignItems: 'center', padding: '0 4px', overflow: 'hidden', whiteSpace: 'nowrap' }}
                    title={`${it.navn} · ${formatDate(it.startDato)} – ${formatDate(it.sluttDato)} — redigeres i Rørlegger-fanen`}>
                    {it.navn}
                  </div>
                );
              })}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
}


// --- MULTI-UKE GANTT OVERSIKT ---
function OversiktVisning({
  state, readOnly, planAnsatte, fagFilter, setFagFilter, kompakt, toggleKompakt,
  ansatteOrder, setAnsatteOrder, oversiktScrollRef, oversiktPanRef, oversiktDragId,
  dragRef, HOLIDAYS, handleDrop, openAddTildeling, openBarMenu,
}) {
  const today = dateToIso(new Date());
  const PAST_WEEKS  = 4;   // uker før i dag som vises
  const GANTT_WEEKS = 60;  // total antall uker (4 bak + 56 frem ≈ 14 måneder)
  const DAY_W = 36;   // px per weekday
  // Kompakt = lave rader (som ProResult); full = litt tettere enn før.
  // Redigering (dra, klikk, splitt) virker likt i begge visninger.
  const LANE_H = kompakt ? 16 : 26;  // px per prosjekt-linje
  const AVATAR = kompakt ? 15 : 20;  // px avatar-størrelse i ansatt-kolonnen
  const LABEL_W = 162;

  // Fast startpunkt – alltid 4 uker før i dag, uavhengig av navigasjon
  const baseWeek = weekStart(addDays(today, -PAST_WEEKS * 7));

  const weeks = [];
  for (let w = 0; w < GANTT_WEEKS; w++) {
    const wStart = addDays(baseWeek, w * 7);
    const wDays = [0, 1, 2, 3, 4].map(d => addDays(wStart, d));
    weeks.push({ start: wStart, end: wDays[4], days: wDays });
  }

  const allDays = weeks.flatMap(w => w.days);
  const viewStart = allDays[0];
  const viewEnd   = allDays[allDays.length - 1];
  const totalW    = allDays.length * DAY_W;

  function wkNr(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w) / 86400000 - 3 + ((w.getDay() + 6) % 7)) / 7);
  }

  function weekLabel(wk) {
    const sD = parseInt(wk.start.slice(8), 10);
    const sM = parseInt(wk.start.slice(5, 7), 10) - 1;
    const eD = parseInt(wk.end.slice(8), 10);
    const eM = parseInt(wk.end.slice(5, 7), 10) - 1;
    const range = sM === eM
      ? `${sD}.–${eD}. ${MAANED_NAVN[sM].slice(0, 3).toLowerCase()}`
      : `${sD}. ${MAANED_NAVN[sM].slice(0, 3).toLowerCase()} – ${eD}. ${MAANED_NAVN[eM].slice(0, 3).toLowerCase()}`;
    return `${wkNr(wk.start)} · ${range}`;
  }

  // Pixel position of a tildeling bar within the allDays array
  function barProps(t) {
    if (!overlaps(t.startDato, t.sluttDato, viewStart, viewEnd)) return null;
    const si = allDays.findIndex(d => d >= t.startDato);
    let ei = -1;
    for (let i = allDays.length - 1; i >= 0; i--) {
      if (allDays[i] <= t.sluttDato) { ei = i; break; }
    }
    if (si === -1 || ei === -1 || si > ei) return null;
    return { left: si * DAY_W + 2, width: (ei - si + 1) * DAY_W - 4 };
  }

  const DAY_NAMES = ['Ma', 'Ti', 'On', 'To', 'Fr'];
  const todayIdx = allDays.indexOf(today);

  // Fast ansatte (A–Å) alltid før innleie (A–Å).
  // Innenfor hver gruppe respekteres evt. drag-rekkefølge; nye ansatte
  // som ikke er i den lagrede rekkefølgen havner alphabetisk i sin gruppe.
  const orderedAnsatte = (() => {
    const fast    = [...planAnsatte].filter(a => !a.innleie).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
    const innleie = [...planAnsatte].filter(a =>  a.innleie).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
    if (!ansatteOrder || ansatteOrder.length === 0) return [...fast, ...innleie];
    const inOrder = new Set(ansatteOrder);
    const ordFast = [
      ...ansatteOrder.map(id => fast.find(a => a.id === id)).filter(Boolean),
      ...fast.filter(a => !inOrder.has(a.id)),
    ];
    const ordInnleie = [
      ...ansatteOrder.map(id => innleie.find(a => a.id === id)).filter(Boolean),
      ...innleie.filter(a => !inOrder.has(a.id)),
    ];
    return [...ordFast, ...ordInnleie];
  })();

  // Drag-and-drop helpers (manipulate DOM directly — no state re-renders during drag)
  function clearDragOver() {
    document.querySelectorAll('.oversikt-row[data-dragover]').forEach(el => {
      delete el.dataset.dragover;
    });
  }

  function saveOrder(newOrder) {
    setAnsatteOrder(newOrder);
    localStorage.setItem('fbs_ansatte_order_v2', JSON.stringify(newOrder));
  }

  const ovFagOptions = state.fag.filter(f => planAnsatte.some(a => a.fag === f));
  const filteredAnsatte = fagFilter ? orderedAnsatte.filter(a => a.fag === fagFilter) : orderedAnsatte;

  // ── PDF-rapport: bemanningsplan for 1 uke (per dag) eller flere uker (per uke) ──
  function skrivUtPlanPdf(antallUker) {
    const start = weekStart(today);
    const perDag = antallUker === 1;
    // Kolonner: dager (1 uke) eller uker (periode)
    const kolonner = [];
    if (perDag) {
      for (let d = 0; d < 5; d++) {
        const dato = addDays(start, d);
        kolonner.push({ start: dato, end: dato, label: `${DAY_NAMES[d]} ${parseInt(dato.slice(8), 10)}.${parseInt(dato.slice(5, 7), 10)}` });
      }
    } else {
      for (let w = 0; w < antallUker; w++) {
        const ws = addDays(start, w * 7);
        kolonner.push({ start: ws, end: addDays(ws, 4), label: `Uke ${wkNr(ws)}` });
      }
    }
    const periodeSlutt = kolonner[kolonner.length - 1].end;

    function celle(ansatt, kol) {
      const deler = [];
      if (ansatt.sykmeldt) {
        const fra = ansatt.sykmeldtFra || kol.start;
        const til = ansatt.sykmeldtTil || kol.end;
        if (overlaps(fra, til, kol.start, kol.end)) deler.push('<span class="syk">🤒 Sykmeldt</span>');
      }
      for (const t of state.tildelinger) {
        if (t.ansattId !== ansatt.id || !overlaps(t.startDato, t.sluttDato, kol.start, kol.end)) continue;
        if (t.prosjektId === FERIE_ID) { deler.push('<span class="ferie">🏖 Ferie</span>'); continue; }
        const p = state.prosjekter.find(pr => pr.id === t.prosjektId);
        deler.push(`<span class="prosj" style="border-left-color:${p?.farge || '#6b7280'}">${p?.navn || '?'}</span>`);
      }
      return deler.length ? deler.join('') : '<span class="tom">–</span>';
    }

    // Rader gruppert etter team, samme rekkefølge som i visningen
    const teams = state.teams || [];
    const grupper = [];
    if (teams.length === 0) {
      grupper.push({ navn: null, farge: null, medlemmer: filteredAnsatte });
    } else {
      const iTeam = new Set(teams.flatMap(t => t.ansatteIds || []));
      for (const team of teams) {
        const m = filteredAnsatte.filter(a => (team.ansatteIds || []).includes(a.id));
        if (m.length) grupper.push({ navn: team.navn, farge: team.farge, medlemmer: m });
      }
      const uten = filteredAnsatte.filter(a => !iTeam.has(a.id));
      if (uten.length) grupper.push({ navn: 'Uten team', farge: '#5d6b80', medlemmer: uten });
    }

    const rader = grupper.map(g => {
      const teamRad = g.navn
        ? `<tr class="teamrad"><td colspan="${kolonner.length + 1}" style="border-left:4px solid ${g.farge}">${g.navn}</td></tr>`
        : '';
      const ansattRader = g.medlemmer.map(a => `<tr>
        <td class="navn">${a.navn}${a.innleie ? ' <span class="lite">(innleie)</span>' : ''}</td>
        ${kolonner.map(k => `<td>${celle(a, k)}</td>`).join('')}
      </tr>`).join('');
      return teamRad + ansattRader;
    }).join('');

    const idag = new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const tittel = perDag
      ? `Uke ${wkNr(start)} (${formatDate(start)} – ${formatDate(periodeSlutt)})`
      : `Uke ${wkNr(start)}–${wkNr(kolonner[kolonner.length - 1].start)} (${formatDate(start)} – ${formatDate(periodeSlutt)})`;

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Bemanningsplan – ${tittel}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px}
        .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #185FA5;padding-bottom:10px;margin-bottom:12px}
        .logo{font-size:20px;font-weight:700;color:#185FA5}
        .sub{font-size:10px;color:#666;margin-top:2px}
        .tittel{font-size:15px;font-weight:700;text-align:right}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        th{background:#f1f5f9;text-align:left;padding:5px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#475569;border-bottom:2px solid #cbd5e1}
        th.navn,td.navn{width:150px}
        td{padding:4px 7px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:10px}
        td.navn{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        tr.teamrad td{background:#f8fafc;font-weight:700;font-size:11px;padding:5px 8px}
        .prosj{display:block;border-left:3px solid #6b7280;padding-left:4px;margin:1px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ferie{display:block;color:#0891b2;margin:1px 0}
        .syk{display:block;color:#5d6b80;margin:1px 0}
        .tom{color:#cbd5e1}
        .lite{font-size:9px;color:#888;font-weight:400}
        @media print{body{padding:6px}@page{size:landscape;margin:10mm}}
      </style>
    </head><body>
      <div class="hdr">
        <div>
          <div class="logo">FolloByggService</div>
          <div class="sub">Bemanningsplan</div>
        </div>
        <div>
          <div class="tittel">${tittel}</div>
          <div class="sub" style="text-align:right">Generert: ${idag}${fagFilter ? ` · Filter: ${fagFilter}` : ''}</div>
        </div>
      </div>
      <table>
        <thead><tr><th class="navn">Ansatt</th>${kolonner.map(k => `<th>${k.label}</th>`).join('')}</tr></thead>
        <tbody>${rader}</tbody>
      </table>
      <script>window.onload = function(){ window.print(); }<\/script>
    </body></html>`);
    w.document.close();
  }

  return (
    <div>
      {/* Navigation */}
      <div className="uke-nav">
        <button className="btn" title="Gå til i dag"
          onClick={() => {
            if (!oversiktScrollRef.current) return;
            const todayIdx = allDays.indexOf(today);
            if (todayIdx >= 0) oversiktScrollRef.current.scrollLeft = LABEL_W + todayIdx * DAY_W - 120;
          }}>⊙ I dag</button>
        <span style={{ fontSize: 12, color: '#5d6b80' }}>Dra tidslinjen for å navigere</span>
        {ansatteOrder.length > 0 && (state.teams || []).length === 0 && (
          <button className="btn" title="Tilbakestill til alfabetisk rekkefølge"
            onClick={() => saveOrder([])}>↺ Alfabetisk</button>
        )}
        <button className="btn" onClick={toggleKompakt}
          title={kompakt ? 'Bytt til full visning (høyere rader)' : 'Bytt til kompakt visning (lavere rader, som ProResult)'}>
          {kompakt ? '▥ Full visning' : '▤ Kompakt'}
        </button>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="btn" onClick={() => skrivUtPlanPdf(1)} title="PDF for inneværende uke (per dag) — velg «Lagre som PDF» i utskriftsdialogen">🖨 Uke-PDF</button>
          <select
            className="input" defaultValue="" style={{ width: 120, height: 30, fontSize: 12 }}
            onChange={e => { const v = parseInt(e.target.value, 10); if (v) skrivUtPlanPdf(v); e.target.value = ''; }}
            title="PDF for en lengre periode (per uke)"
          >
            <option value="" disabled>🖨 Periode…</option>
            <option value="2">2 uker</option>
            <option value="4">4 uker</option>
            <option value="8">8 uker</option>
            <option value="12">12 uker</option>
          </select>
        </div>
        {!readOnly && <button className="btn btn-primary no-print" onClick={() => openAddTildeling()}>+ Ny tildeling</button>}
      </div>

      {/* Fag-filter */}
      {ovFagOptions.length > 1 && (
        <div className="bplan-fag-filter">
          <button className={`bplan-fag-pill${!fagFilter ? ' aktiv' : ''}`} onClick={() => setFagFilter(null)}>Alle</button>
          {ovFagOptions.map(f => (
            <button key={f}
              className={`bplan-fag-pill${fagFilter === f ? ' aktiv' : ''}`}
              style={fagFilter === f
                ? { background: fagColor(f), color: '#fff', borderColor: fagColor(f) }
                : { borderColor: fagColor(f), color: fagColor(f) }}
              onClick={() => setFagFilter(ff => ff === f ? null : f)}>
              {f}
            </button>
          ))}
        </div>
      )}

      <div className="oversikt-scroll-wrap" ref={oversiktScrollRef}
        onPointerDown={e => {
          if (e.target.closest('.oversikt-bar,.oversikt-handle,.oversikt-drag-handle,button')) return;
          if (dragRef.current) return;
          oversiktPanRef.current = { startX: e.clientX, startScrollLeft: oversiktScrollRef.current.scrollLeft, pointerId: e.pointerId, panning: false };
        }}
        onPointerMove={e => {
          if (!oversiktPanRef.current) return;
          const dx = e.clientX - oversiktPanRef.current.startX;
          if (!oversiktPanRef.current.panning && Math.abs(dx) > 5) {
            oversiktPanRef.current.panning = true;
            e.currentTarget.setPointerCapture(oversiktPanRef.current.pointerId);
            e.currentTarget.style.cursor = 'grabbing';
          }
          if (oversiktPanRef.current.panning) {
            oversiktScrollRef.current.scrollLeft = oversiktPanRef.current.startScrollLeft - dx;
          }
        }}
        onPointerUp={e => {
          if (!oversiktPanRef.current) return;
          if (oversiktPanRef.current.panning) e.currentTarget.style.cursor = '';
          oversiktPanRef.current = null;
        }}
        onPointerCancel={e => {
          oversiktPanRef.current = null;
          e.currentTarget.style.cursor = '';
        }}
      >
        <div style={{ display: 'inline-block', verticalAlign: 'top', width: LABEL_W + totalW, minWidth: '100%' }}>

          {/* ── Uke-header ─────────────────────────────────── */}
          <div className="oversikt-wk-header-row">
            <div className="oversikt-corner" style={{ width: LABEL_W }} />
            {weeks.map((wk, wi) => {
              const isCurrent = wk.days.includes(today);
              return (
                <div key={wi}
                  className={`oversikt-wk-cell${isCurrent ? ' current' : ''}`}
                  style={{ width: wk.days.length * DAY_W }}>
                  {weekLabel(wk)}
                </div>
              );
            })}
          </div>

          {/* ── Dag-header ─────────────────────────────────── */}
          <div className="oversikt-day-header-row">
            <div className="oversikt-day-corner" style={{ width: LABEL_W }}>Ansatt</div>
            {allDays.map((d, i) => {
              const dow = (new Date(d + 'T00:00:00').getDay() + 6) % 7;
              const isToday    = d === today;
              const isHoliday  = !!HOLIDAYS[d];
              const isWeekLast = dow === 4;
              return (
                <div key={d}
                  className={`oversikt-day-cell${isToday ? ' today' : ''}${isHoliday ? ' holiday' : ''}${isWeekLast ? ' week-last' : ''}`}
                  style={{ width: DAY_W }}>
                  <span>{DAY_NAMES[dow]}</span>
                  <span>{parseInt(d.slice(8), 10)}</span>
                </div>
              );
            })}
          </div>

          {/* ── Kapasitetsrad ──────────────────────────────── */}
          <div className="oversikt-kap-row" style={{ display: 'flex', minWidth: LABEL_W + totalW }}>
            <div className="oversikt-kap-corner" style={{ width: LABEL_W }}>Ledig</div>
            {weeks.map((wk, wi) => {
              const wOpptattIds = new Set(
                state.tildelinger
                  .filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, wk.start, wk.end))
                  .map(t => t.ansattId)
              );
              const tot = planAnsatte.length;
              const opp = planAnsatte.filter(a => wOpptattIds.has(a.id)).length;
              const led = tot - opp;
              const pst = tot > 0 ? Math.round((led / tot) * 100) : 0;
              const farge = led === 0 ? '#dc2626' : led <= 2 ? '#b45309' : '#15803d';
              const isCurrent = wk.days.includes(today);
              return (
                <div key={wi} className={`oversikt-kap-cell${isCurrent ? ' current' : ''}`} style={{ width: wk.days.length * DAY_W }}>
                  <div className="oversikt-kap-bar-wrap">
                    <div className="oversikt-kap-bar-fill" style={{ width: (100 - pst) + '%', background: '#e2e8f0' }} />
                  </div>
                  <span className="oversikt-kap-lbl" style={{ color: farge }}>{led}/{tot}</span>
                </div>
              );
            })}
          </div>

          {/* ── Ansatte-rader (gruppert etter team) ───────── */}
          {(() => {
            const teams = state.teams || [];
            let rowIdx = 0;

            function renderAnsattRad(ansatt) {
              const myTils = state.tildelinger
                .filter(t => t.ansattId === ansatt.id && overlaps(t.startDato, t.sluttDato, viewStart, viewEnd))
                .sort((a, b) => (a.prosjektId === FERIE_ID ? 1 : 0) - (b.prosjektId === FERIE_ID ? 1 : 0));

              // Lane-oppdeling: overlappende tildelinger får hver sin linje,
              // slik at tre samtidige prosjekter vises som tre separate striper
              // i stedet for å ligge oppå hverandre.
              const laneSlutt = [];
              const laneOf = {};
              for (const t of [...myTils].sort((a, b) => a.startDato.localeCompare(b.startDato) || a.sluttDato.localeCompare(b.sluttDato))) {
                let l = laneSlutt.findIndex(slutt => t.startDato > slutt);
                if (l === -1) { l = laneSlutt.length; laneSlutt.push(t.sluttDato); }
                else laneSlutt[l] = t.sluttDato;
                laneOf[t.id] = l;
              }
              const antallLaner = Math.max(1, laneSlutt.length);
              const rowH = antallLaner * LANE_H;

              const ri = rowIdx++;
              return (
              <div key={ansatt.id}
                className={`oversikt-row${ri % 2 === 0 ? '' : ' alt'}`}
                style={{ height: rowH }}
                onDragOver={e => {
                  if (!oversiktDragId.current) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  clearDragOver();
                  const rect = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.dataset.dragover = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget)) delete e.currentTarget.dataset.dragover;
                }}
                onDrop={e => {
                  e.preventDefault();
                  delete e.currentTarget.dataset.dragover;
                  const fromId = oversiktDragId.current;
                  const toId   = ansatt.id;
                  if (!fromId || fromId === toId) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos  = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                  const ids  = orderedAnsatte.map(a => a.id).filter(id => id !== fromId);
                  const at   = ids.indexOf(toId) + (pos === 'after' ? 1 : 0);
                  ids.splice(at, 0, fromId);
                  saveOrder(ids);
                }}
              >

                {/* Sticky name label */}
                <div className="oversikt-row-label" style={{ width: LABEL_W, height: rowH }}>
                  <span
                    className="oversikt-drag-handle"
                    title="Dra for å flytte"
                    draggable
                    onDragStart={e => {
                      e.stopPropagation();
                      oversiktDragId.current = ansatt.id;
                      e.dataTransfer.effectAllowed = 'move';
                      e.currentTarget.closest('.oversikt-row').classList.add('dragging');
                    }}
                    onDragEnd={e => {
                      oversiktDragId.current = null;
                      e.currentTarget.closest('.oversikt-row').classList.remove('dragging');
                      clearDragOver();
                    }}
                  >⠿</span>
                  <div className="mini-avatar" style={{
                    background: ansatt.sykmeldt ? '#5d6b80' : ansatt.innleie ? '#f97316' : fagColor(ansatt.fag),
                    width: AVATAR, height: AVATAR, fontSize: kompakt ? 7 : 8, flexShrink: 0,
                    filter: ansatt.sykmeldt ? 'grayscale(1)' : 'none',
                  }}>
                    {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="oversikt-row-navn" style={{ fontSize: kompakt ? 11 : 12, ...(ansatt.sykmeldt ? { color: '#5d6b80' } : {}) }}>
                    {ansatt.navn}
                  </span>
                  {ansatt.sykmeldt
                    ? <span style={{ fontSize: 9, color: '#5d6b80', flexShrink: 0 }}>🤒</span>
                    : ansatt.innleie && <span style={{ fontSize: 9, color: '#f97316', flexShrink: 0 }}>🔧</span>
                  }
                </div>

                {/* Bar area */}
                <div className="oversikt-bars-area" style={{ width: totalW, height: rowH }}
                  onPointerUp={e => {
                    if (!dragRef.current) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const dayIdx = Math.max(0, Math.min(allDays.length - 1, Math.floor((e.clientX - rect.left) / DAY_W)));
                    handleDrop(allDays[dayIdx], 'day');
                  }}
                >
                  {/* Background grid cells */}
                  {allDays.map((d, i) => {
                    const dow = (new Date(d + 'T00:00:00').getDay() + 6) % 7;
                    return (
                      <div key={d}
                        className={`oversikt-bg-cell${d === today ? ' today-col' : ''}${HOLIDAYS[d] ? ' holiday-col' : ''}${dow === 4 ? ' week-last' : ''}`}
                        style={{ left: i * DAY_W, width: DAY_W }}
                        onClick={() => { if (!readOnly && !dragRef.current) openAddTildeling(ansatt.id, d); }}
                      />
                    );
                  })}

                  {/* Today needle */}
                  {todayIdx >= 0 && (
                    <div className="oversikt-needle" style={{ left: todayIdx * DAY_W + DAY_W / 2 }} />
                  )}

                  {/* Sykmeldt-bar */}
                  {ansatt.sykmeldt && (() => {
                    const fra = ansatt.sykmeldtFra || viewStart;
                    const til = ansatt.sykmeldtTil || viewEnd;
                    const bp = barProps({ startDato: fra, sluttDato: til });
                    if (!bp) return null;
                    return (
                      <div key="syk" style={{
                        position: 'absolute', top: 2, height: rowH - 4,
                        left: bp.left, width: bp.width,
                        background: 'repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 4px,#f1f5f9 4px,#f1f5f9 8px)',
                        borderRadius: 4, border: '1px solid #cbd5e1',
                        display: 'flex', alignItems: 'center', paddingLeft: 6,
                        fontSize: 10, color: '#5d6b80', fontWeight: 500, gap: 4,
                        pointerEvents: 'none',
                      }}>
                        🤒 Sykmeldt{ansatt.sykmeldtTil ? ` t.o.m. ${new Date(ansatt.sykmeldtTil + 'T00:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}` : ''}
                      </div>
                    );
                  })()}

                  {/* Project / ferie bars */}
                  {myTils.map(t => {
                    const bp = barProps(t);
                    if (!bp) return null;
                    const isFerie = t.prosjektId === FERIE_ID;
                    const proj  = isFerie ? null : state.prosjekter.find(p => p.id === t.prosjektId);
                    const color = proj?.farge || '#6b7280';
                    const label = isFerie ? '🏖 Ferie' : (proj?.navn || '?');

                    return (
                      <div key={t.id}
                        className={`oversikt-bar${isFerie ? ' oversikt-bar-ferie' : ''}`}
                        style={{
                          left: bp.left, width: bp.width,
                          top: laneOf[t.id] * LANE_H + 2,
                          height: LANE_H - 4,
                          ...(isFerie ? {} : { background: color }),
                        }}
                        title={`${label} · ${formatDate(t.startDato)} – ${formatDate(t.sluttDato)} — klikk for valg`}
                        onClick={e => {
                          e.stopPropagation();
                          if (dragRef.current) return;
                          const area = e.currentTarget.closest('.oversikt-bars-area');
                          const rect = area ? area.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
                          const dayIdx = Math.max(0, Math.min(allDays.length - 1, Math.floor((e.clientX - rect.left) / DAY_W)));
                          const clickedDay = allDays[dayIdx];
                          const splitDay = clickedDay > t.startDato ? clickedDay : addDays(t.startDato, 1);
                          openBarMenu(t, splitDay, e.clientX, e.clientY);
                        }}
                      >
                        <div className="oversikt-handle oversikt-handle-l"
                          title="Dra for å endre startdato"
                          onPointerDown={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            dragRef.current = { tildelingId: t.id, type: 'start' };
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                        <span className="oversikt-bar-label" style={{ fontSize: kompakt ? 9 : 10.5 }}>{label}</span>
                        <div className="oversikt-handle oversikt-handle-r"
                          title="Dra for å endre sluttdato"
                          onPointerDown={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            dragRef.current = { tildelingId: t.id, type: 'end' };
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            }

            function renderTeamHeader(team, count) {
              return (
                <div key={`th-${team.id}`} style={{ display: 'flex', height: kompakt ? 22 : 26, alignItems: 'stretch', background: team.farge + '18', borderTop: `2px solid ${team.farge}`, borderBottom: `1px solid ${team.farge}33`, minWidth: LABEL_W + totalW }}>
                  <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', position: 'sticky', left: 0, zIndex: 3, background: '#fff', borderRight: `2px solid ${team.farge}33` }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: team.farge, flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, fontSize: 12, color: team.farge, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.navn}</span>
                    <span style={{ fontSize: 11, color: '#5d6b80', flexShrink: 0 }}>{count}</span>
                  </div>
                  <div style={{ flex: 1 }} />
                </div>
              );
            }

            if (teams.length === 0) {
              return filteredAnsatte.map(a => renderAnsattRad(a));
            }

            const assignedIds = new Set(teams.flatMap(t => t.ansatteIds || []));
            const rows = [];

            for (const team of teams) {
              const members = filteredAnsatte.filter(a => (team.ansatteIds || []).includes(a.id));
              if (members.length === 0 && !filteredAnsatte.some(a => (team.ansatteIds || []).includes(a.id))) continue;
              rows.push(renderTeamHeader(team, members.length + ' medl.'));
              members.forEach(a => rows.push(renderAnsattRad(a)));
            }

            const unassigned = filteredAnsatte.filter(a => !assignedIds.has(a.id));
            if (unassigned.length > 0) {
              rows.push(
                <div key="th-uten" style={{ display: 'flex', height: kompakt ? 22 : 26, alignItems: 'stretch', background: '#f1f5f9', borderTop: '2px solid #5d6b80', borderBottom: '1px solid #e2e8f0', minWidth: LABEL_W + totalW }}>
                  <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', position: 'sticky', left: 0, zIndex: 3, background: '#fff', borderRight: '2px solid #e2e8f0' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#5d6b80', flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, fontSize: 12, color: '#5d6b80' }}>Uten team</span>
                    <span style={{ fontSize: 11, color: '#5d6b80' }}>{unassigned.length}</span>
                  </div>
                  <div style={{ flex: 1 }} />
                </div>
              );
              unassigned.forEach(a => rows.push(renderAnsattRad(a)));
            }

            return rows;
          })()}

          {/* ── Rørlegger nederst — SYNKET fra Rørlegger-fanen (kun visning) ── */}
          {!fagFilter && (() => {
            const rorleggere = state.ansatte
              .filter(a => a.fag === 'Rørlegger')
              .sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
            if (rorleggere.length === 0) return null;
            const rows = [
              <div key="ror-header" style={{ display: 'flex', height: kompakt ? 22 : 26, alignItems: 'stretch', background: '#ecfeff', borderTop: '2px solid #0e7490', borderBottom: '1px solid #a5f3fc', minWidth: LABEL_W + totalW }}>
                <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', position: 'sticky', left: 0, zIndex: 3, background: '#fff', borderRight: '2px solid #a5f3fc' }}>
                  <span style={{ fontSize: 11 }}>🔧</span>
                  <span style={{ fontWeight: 500, fontSize: 12, color: '#0e7490', whiteSpace: 'nowrap' }}>Rørlegger</span>
                  <span style={{ fontSize: 10, color: '#5d6b80', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>fra Rørlegger-fanen</span>
                </div>
                <div style={{ flex: 1 }} />
              </div>,
            ];
            for (const ansatt of rorleggere) {
              const items = hentRorItems(state, ansatt.id, viewStart, viewEnd, true);
              const { laneOf, antall } = fordelLaner(items);
              const rowH = antall * LANE_H;
              rows.push(
                <div key={'ror-' + ansatt.id} className="oversikt-row" style={{ height: rowH }}>
                  <div className="oversikt-row-label" style={{ width: LABEL_W, height: rowH }}>
                    <div className="mini-avatar" style={{ background: '#0e7490', width: AVATAR, height: AVATAR, fontSize: kompakt ? 7 : 8, flexShrink: 0 }}>
                      {ansatt.navn.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="oversikt-row-navn" style={{ fontSize: kompakt ? 11 : 12 }}>{ansatt.navn}</span>
                    <span style={{ fontSize: 9, color: '#0e7490', flexShrink: 0 }}>🔧</span>
                  </div>
                  <div className="oversikt-bars-area" style={{ width: totalW, height: rowH }}>
                    {allDays.map((d, i) => {
                      const dow = (new Date(d + 'T00:00:00').getDay() + 6) % 7;
                      return (
                        <div key={d}
                          className={`oversikt-bg-cell${d === today ? ' today-col' : ''}${HOLIDAYS[d] ? ' holiday-col' : ''}${dow === 4 ? ' week-last' : ''}`}
                          style={{ left: i * DAY_W, width: DAY_W }}
                        />
                      );
                    })}
                    {todayIdx >= 0 && (
                      <div className="oversikt-needle" style={{ left: todayIdx * DAY_W + DAY_W / 2 }} />
                    )}
                    {items.map(it => {
                      const bp = barProps(it);
                      if (!bp) return null;
                      return (
                        <div key={it.id} className="oversikt-bar"
                          style={{ left: bp.left, width: bp.width, top: laneOf[it.id] * LANE_H + 2, height: LANE_H - 4, background: it.farge, cursor: 'default' }}
                          title={`${it.navn} · ${formatDate(it.startDato)} – ${formatDate(it.sluttDato)} — redigeres i Rørlegger-fanen`}>
                          <span className="oversikt-bar-label" style={{ fontSize: kompakt ? 9 : 10.5 }}>{it.navn}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return rows;
          })()}

        </div>
      </div>
    </div>
  );
}

// --- FERIEOVERSIKT ---
function FerieVisning({ state, readOnly, ferieYearOffset, setFerieYearOffset, openAddFerie, deleteTildeling }) {
  const today = dateToIso(new Date());
  const FERIE_MND = 12;
  // Use a dedicated ferie year offset (separate from currentMonth navigation)
  const ferieBase  = addMonths(monthStart(today), (ferieYearOffset || 0) * 12);
  const ferieMonths = Array.from({ length: FERIE_MND }, (_, i) => addMonths(ferieBase, i));
  const ferieEnd   = monthEnd(ferieMonths[FERIE_MND - 1]);
  const ferieYear  = ferieBase.slice(0, 4);

  const sortedAnsatte = [...state.ansatte].sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));

  // For each employee, compute ferie periods and total days in view
  function ferieDager(t) {
    // Count calendar days in the tildeling
    const ms = Math.max(0, (new Date(t.sluttDato + 'T00:00:00') - new Date(t.startDato + 'T00:00:00')) / 86400000) + 1;
    return ms;
  }

  // Bar position in the 12-month grid
  function getBarPos(t) {
    let si = -1, ei = -1;
    for (let i = 0; i < FERIE_MND; i++) {
      const mEnd = monthEnd(ferieMonths[i]);
      if (overlaps(t.startDato, t.sluttDato, ferieMonths[i], mEnd)) {
        if (si === -1) si = i;
        ei = i;
      }
    }
    if (si === -1) return null;
    return {
      left: `${(si / FERIE_MND) * 100}%`,
      width: `${((ei - si + 1) / FERIE_MND) * 100}%`,
    };
  }

  // Month totals (how many employees have ferie in each month)
  const mndTotals = ferieMonths.map(m => {
    const mEnd = monthEnd(m);
    return state.tildelinger.filter(t =>
      t.prosjektId === FERIE_ID && overlaps(t.startDato, t.sluttDato, m, mEnd)
    ).length;
  });

  return (
    <div>
      {/* Ferie nav */}
      <div className="uke-nav">
        <button className="btn" onClick={() => setFerieYearOffset(o => (o || 0) - 1)}>← Forrige år</button>
        <span className="uke-label">🏖 Ferieplan {ferieYear}</span>
        <button className="btn" onClick={() => setFerieYearOffset(o => (o || 0) + 1)}>Neste år →</button>
        <button className="btn" onClick={() => setFerieYearOffset(0)}>I år</button>
        {!readOnly && <button className="btn btn-primary no-print" onClick={() => openAddFerie()}>+ Legg til ferie</button>}
      </div>

      <div className="uke-grid-wrap">
        {/* Month header */}
        <div className="ferie-grid">
          <div className="uke-header-cell ferie-label-col" style={{ fontWeight: 500, fontSize: 11, color: '#5d6b80' }}>Ansatt</div>
          {ferieMonths.map((m, i) => {
            const isThisMonth = m.slice(0, 7) === today.slice(0, 7);
            return (
              <div key={m} className={`uke-header-cell ferie-month-col ${isThisMonth ? 'today' : ''}`}
                style={{ textAlign: 'center', fontSize: 11, fontWeight: isThisMonth ? 500 : 500 }}>
                {MAANED_NAVN[parseInt(m.slice(5, 7), 10) - 1]}
                {mndTotals[i] > 0 && (
                  <div style={{ fontSize: 9, color: '#5d6b80', marginTop: 1 }}>{mndTotals[i]} stk</div>
                )}
              </div>
            );
          })}

          {/* Employee rows */}
          {sortedAnsatte.map((ansatt, rowIdx) => {
            const ferieList = state.tildelinger.filter(t =>
              t.ansattId === ansatt.id && t.prosjektId === FERIE_ID &&
              overlaps(t.startDato, t.sluttDato, ferieMonths[0], ferieEnd)
            );
            const totalDager = ferieList.reduce((s, t) => s + ferieDager(t), 0);

            return (
              <React.Fragment key={ansatt.id}>
                {/* Label */}
                <div className="uke-row-label ferie-label-col" style={{ background: rowIdx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <div className="mini-avatar" style={{ background: ansatt.innleie ? '#f97316' : fagColor(ansatt.fag), flexShrink: 0 }}>
                    {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="row-navn" style={{ fontSize: 12 }}>{ansatt.navn}</div>
                    <div className="row-fag" style={{ color: fagColor(ansatt.fag), fontSize: 10 }}>
                      {ansatt.innleie && <span style={{ color: '#f97316', marginRight: 2 }}>🔧</span>}
                      {totalDager > 0
                        ? <span style={{ color: '#15803d', fontWeight: 500 }}>🏖 {totalDager} dager</span>
                        : ansatt.fag}
                    </div>
                  </div>
                </div>

                {/* Ferie bar row */}
                <div className="gantt-row ferie-bar-row"
                  style={{
                    gridColumn: '2 / -1',
                    background: rowIdx % 2 === 0 ? '#fff' : '#f8fafc',
                    cursor: 'pointer',
                  }}
                  onClick={e => {
                    if (!readOnly && (e.target === e.currentTarget || e.target.classList.contains('gantt-bg-cell'))) {
                      openAddFerie(ansatt.id);
                    }
                  }}
                >
                  {/* Month background cells */}
                  {ferieMonths.map((m, i) => {
                    const isThisMonth = m.slice(0, 7) === today.slice(0, 7);
                    return (
                      <div key={m}
                        className={`gantt-bg-cell${isThisMonth ? ' today-col' : ''}`}
                        style={{ left: `${(i / FERIE_MND) * 100}%`, width: `${100 / FERIE_MND}%` }}
                        onClick={() => { if (!readOnly) openAddFerie(ansatt.id); }}
                      />
                    );
                  })}

                  {/* Ferie bars */}
                  {ferieList.map(t => {
                    const pos = getBarPos(t);
                    if (!pos) return null;
                    const label = `${formatDate(t.startDato)} – ${formatDate(t.sluttDato)} (${ferieDager(t)} dg)`;
                    return (
                      <div key={t.id}
                        className="gantt-bar gantt-bar-ferie"
                        style={{ left: pos.left, width: pos.width }}
                        title={label}
                        onClick={e => {
                          e.stopPropagation();
                          deleteTildeling(t.id);
                        }}
                      >
                        <span className="gantt-label" style={{ fontSize: 10 }}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {sortedAnsatte.length === 0 && (
        <div className="empty">Ingen ansatte registrert.</div>
      )}
    </div>
  );
}

// --- BURSDAGSKALENDER ---
// --- TEAM-VISNING ---
function TeamsVisning({
  state, dispatch, currentWeek,
  redigererTeam, setRedigererTeam, teamForm, setTeamForm, showTeamModal, setShowTeamModal,
  teamTildelForm, setTeamTildelForm, visTeamTildel, setVisTeamTildel,
  teamDragIdx, teamDragOver, setTeamDragOver,
  memberDragInfo, memberDragOverTeam, setMemberDragOverTeam,
  handleTildelTeam,
}) {
  const teams = state.teams || [];
  const aktiveProsjekter = state.prosjekter.filter(p => p.status === 'aktiv' || !p.status).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  const fastAnsatte = state.ansatte.filter(a => !a.innleie).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  const innleieAnsatte = state.ansatte.filter(a => a.innleie).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  const planAnsatteAlle = [...fastAnsatte, ...innleieAnsatte];
  const TEAM_FARGER = ['#3b82f6','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#be185d','#854d0e'];

  function startNyttTeam() {
    setRedigererTeam(null);
    setTeamForm({ navn: '', farge: TEAM_FARGER[teams.length % TEAM_FARGER.length], ansatteIds: [] });
    setShowTeamModal(true);
  }
  function startRedigerTeam(t) {
    setRedigererTeam(t);
    setTeamForm({ navn: t.navn, farge: t.farge || '#3b82f6', ansatteIds: [...(t.ansatteIds || [])] });
    setShowTeamModal(true);
  }
  function lagreTeam() {
    if (!teamForm.navn.trim()) return;
    if (redigererTeam) {
      dispatch({ type: 'UPDATE_TEAM', payload: { ...redigererTeam, ...teamForm } });
    } else {
      dispatch({ type: 'ADD_TEAM', payload: teamForm });
    }
    setShowTeamModal(false);
  }
  function slettTeam(id) {
    if (confirm('Slett teamet?')) dispatch({ type: 'DELETE_TEAM', id });
  }
  // IDs som allerede tilhører et annet team (ikke det vi redigerer nå)
  const opptattIAnnetTeam = new Set(
    teams
      .filter(t => !redigererTeam || t.id !== redigererTeam.id)
      .flatMap(t => t.ansatteIds || [])
  );

  function toggleMedlem(ansattId) {
    if (opptattIAnnetTeam.has(ansattId)) return;
    setTeamForm(f => ({
      ...f,
      ansatteIds: f.ansatteIds.includes(ansattId)
        ? f.ansatteIds.filter(id => id !== ansattId)
        : [...f.ansatteIds, ansattId]
    }));
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Team</h3>
          <div style={{ fontSize: 13, color: '#5d6b80', marginTop: 2 }}>Grupper ansatte i team og tildel hele teamet til et prosjekt på én gang</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {teams.length > 0 && (
            <button className="btn" onClick={() => { setTeamTildelForm({ teamId: teams[0].id, prosjektId: '', startDato: currentWeek, sluttDato: addDays(currentWeek, 4) }); setVisTeamTildel(true); }}>
              📅 Tildel team til prosjekt
            </button>
          )}
          <button className="btn btn-primary" onClick={startNyttTeam}>+ Nytt team</button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="empty">Ingen team opprettet ennå. Klikk «+ Nytt team» for å lage ditt første team.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {teams.map((team, idx) => {
            const medlemmer = (team.ansatteIds || []).map(id => state.ansatte.find(a => a.id === id)).filter(Boolean);
            const isCardDragOver = teamDragOver === idx && teamDragIdx.current !== null && teamDragIdx.current !== idx;
            const isMemberDragOver = memberDragOverTeam === team.id && memberDragInfo.current?.fromTeamId !== team.id;
            return (
              <div
                key={team.id}
                draggable
                onDragStart={e => {
                  if (memberDragInfo.current) { e.preventDefault(); return; }
                  teamDragIdx.current = idx;
                }}
                onDragOver={e => {
                  e.preventDefault();
                  if (memberDragInfo.current) setMemberDragOverTeam(team.id);
                  else setTeamDragOver(idx);
                }}
                onDragLeave={e => {
                  if (e.currentTarget.contains(e.relatedTarget)) return;
                  if (memberDragInfo.current) setMemberDragOverTeam(null);
                  else setTeamDragOver(null);
                }}
                onDrop={e => {
                  e.preventDefault();
                  // --- Member move ---
                  if (memberDragInfo.current) {
                    const { ansattId, fromTeamId } = memberDragInfo.current;
                    if (fromTeamId !== team.id) {
                      const updated = teams.map(t => {
                        if (t.id === fromTeamId) return { ...t, ansatteIds: (t.ansatteIds || []).filter(id => id !== ansattId) };
                        if (t.id === team.id) return { ...t, ansatteIds: [...(t.ansatteIds || []), ansattId] };
                        return t;
                      });
                      dispatch({ type: 'SET_TEAMS', teams: updated });
                    }
                    memberDragInfo.current = null;
                    setMemberDragOverTeam(null);
                    return;
                  }
                  // --- Card reorder ---
                  const from = teamDragIdx.current;
                  if (from === null || from === idx) { setTeamDragOver(null); return; }
                  const reordered = [...teams];
                  const [moved] = reordered.splice(from, 1);
                  reordered.splice(idx, 0, moved);
                  dispatch({ type: 'SET_TEAMS', teams: reordered });
                  teamDragIdx.current = null;
                  setTeamDragOver(null);
                }}
                onDragEnd={() => {
                  teamDragIdx.current = null;
                  memberDragInfo.current = null;
                  setTeamDragOver(null);
                  setMemberDragOverTeam(null);
                }}
                style={{
                  background: isMemberDragOver ? '#f0fdf4' : '#fff',
                  border: isMemberDragOver
                    ? '2px dashed #15803d'
                    : isCardDragOver
                      ? `2px dashed ${team.farge || '#3b82f6'}`
                      : '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: (isMemberDragOver || isCardDragOver) ? 17 : 18,
                  boxShadow: isMemberDragOver
                    ? '0 4px 16px #15803d33'
                    : isCardDragOver
                      ? `0 4px 16px ${team.farge || '#3b82f6'}33`
                      : '0 1px 4px rgba(0,0,0,.04)',
                  borderTop: `4px solid ${team.farge || '#3b82f6'}`,
                  cursor: 'grab',
                  transition: 'box-shadow .15s, border .1s, background .15s',
                  opacity: teamDragIdx.current === idx ? 0.45 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#cbd5e1', fontSize: 16, lineHeight: 1, cursor: 'grab', userSelect: 'none' }}>⠿</span>
                    <div style={{ fontWeight: 500, fontSize: 16, color: '#1e293b' }}>{team.navn}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onMouseDown={e => e.stopPropagation()} onClick={() => startRedigerTeam(team)}>Rediger</button>
                    <button className="btn btn-sm btn-danger" onMouseDown={e => e.stopPropagation()} onClick={() => slettTeam(team.id)}>Slett</button>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#5d6b80', marginBottom: 8 }}>
                  {medlemmer.length} medlemmer
                  {isMemberDragOver && <span style={{ color: '#15803d', marginLeft: 6, fontWeight: 500 }}>↓ Slipp for å flytte hit</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {medlemmer.map(a => (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={e => {
                        e.stopPropagation();
                        memberDragInfo.current = { ansattId: a.id, fromTeamId: team.id };
                      }}
                      onDragEnd={e => {
                        e.stopPropagation();
                        memberDragInfo.current = null;
                        setMemberDragOverTeam(null);
                      }}
                      title={a.sykmeldt ? '🤒 Sykmeldt – ikke i bemanningsplan' : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: a.sykmeldt ? '#f1f5f9' : a.innleie ? '#fff7ed' : '#f8fafc',
                        border: `1px solid ${a.sykmeldt ? '#cbd5e1' : a.innleie ? '#fed7aa' : '#e2e8f0'}`,
                        borderRadius: 8, padding: '3px 8px 3px 4px', fontSize: 12,
                        cursor: 'grab', opacity: a.sykmeldt ? 0.6 : 1,
                      }}
                    >
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: a.sykmeldt ? '#5d6b80' : a.innleie ? '#f97316' : fagColor(a.fag), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 500, flexShrink: 0 }}>
                        {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ color: a.sykmeldt ? '#5d6b80' : 'inherit' }}>{a.navn}</span>
                      <span style={{ color: a.sykmeldt ? '#5d6b80' : a.innleie ? '#f97316' : '#5d6b80', fontSize: 10 }}>
                        {a.sykmeldt ? '🤒' : a.innleie ? '🔧' : a.fag}
                      </span>
                    </div>
                  ))}
                  {medlemmer.length === 0 && (
                    <span style={{ color: isMemberDragOver ? '#15803d' : '#5d6b80', fontSize: 12, fontStyle: 'italic' }}>
                      {isMemberDragOver ? '↓ Slipp her' : 'Ingen medlemmer ennå'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Rediger/lag team */}
      {showTeamModal && (
        <Modal title={redigererTeam ? `Rediger team: ${redigererTeam.navn}` : 'Nytt team'} onClose={() => setShowTeamModal(false)}>
          <div className="form">
            <label>Teamnavn *</label>
            <input value={teamForm.navn} onChange={e => setTeamForm(f => ({ ...f, navn: e.target.value }))} placeholder="f.eks. Team 1 – Tømrer" />
            <label>Farge</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {TEAM_FARGER.map(farge => (
                <button key={farge} type="button" onClick={() => setTeamForm(f => ({ ...f, farge }))}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: farge, border: teamForm.farge === farge ? '3px solid #1e293b' : '2px solid transparent', cursor: 'pointer' }} />
              ))}
            </div>
            <label>Medlemmer ({teamForm.ansatteIds.length} valgt)</label>
            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {fastAnsatte.length > 0 && (
                <div style={{ fontSize: 10, fontWeight: 500, color: '#5d6b80', letterSpacing: '0.06em', padding: '2px 6px 4px', textTransform: 'uppercase' }}>Fast ansatte</div>
              )}
              {fastAnsatte.map(a => {
                const tatt = opptattIAnnetTeam.has(a.id);
                const valgt = teamForm.ansatteIds.includes(a.id);
                const annetTeam = tatt ? teams.find(t => (!redigererTeam || t.id !== redigererTeam.id) && (t.ansatteIds || []).includes(a.id)) : null;
                return (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: tatt ? 'not-allowed' : 'pointer', padding: '4px 6px', borderRadius: 6, opacity: tatt ? 0.45 : 1, background: valgt ? '#eff6ff' : 'transparent' }}>
                    <input type="checkbox" checked={valgt} disabled={tatt} onChange={() => toggleMedlem(a.id)} />
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: fagColor(a.fag), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 500, flexShrink: 0 }}>
                      {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{a.navn}</span>
                    {tatt
                      ? <span style={{ fontSize: 11, color: '#f97316', marginLeft: 'auto' }}>i {annetTeam?.navn || 'annet team'}</span>
                      : <span style={{ fontSize: 11, color: '#5d6b80', marginLeft: 'auto' }}>{a.fag}</span>
                    }
                  </label>
                );
              })}
              {innleieAnsatte.length > 0 && (
                <div style={{ fontSize: 10, fontWeight: 500, color: '#f97316', letterSpacing: '0.06em', padding: '6px 6px 4px', textTransform: 'uppercase', borderTop: fastAnsatte.length > 0 ? '1px solid #f1f5f9' : 'none', marginTop: fastAnsatte.length > 0 ? 4 : 0 }}>🔧 Innleie</div>
              )}
              {innleieAnsatte.map(a => {
                const tatt = opptattIAnnetTeam.has(a.id);
                const valgt = teamForm.ansatteIds.includes(a.id);
                const annetTeam = tatt ? teams.find(t => (!redigererTeam || t.id !== redigererTeam.id) && (t.ansatteIds || []).includes(a.id)) : null;
                return (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: tatt ? 'not-allowed' : 'pointer', padding: '4px 6px', borderRadius: 6, opacity: tatt ? 0.45 : 1, background: valgt ? '#fff7ed' : 'transparent' }}>
                    <input type="checkbox" checked={valgt} disabled={tatt} onChange={() => toggleMedlem(a.id)} />
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 500, flexShrink: 0 }}>
                      {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{a.navn}</span>
                    {tatt
                      ? <span style={{ fontSize: 11, color: '#f97316', marginLeft: 'auto' }}>i {annetTeam?.navn || 'annet team'}</span>
                      : <span style={{ fontSize: 11, color: '#f97316', marginLeft: 'auto' }}>🔧 {a.fag}</span>
                    }
                  </label>
                );
              })}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowTeamModal(false)}>Avbryt</button>
              <button className="btn btn-primary" onClick={lagreTeam} disabled={!teamForm.navn.trim() || teamForm.ansatteIds.length === 0}>
                {redigererTeam ? 'Lagre endringer' : `Opprett team (${teamForm.ansatteIds.length} medl.)`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Tildel team til prosjekt */}
      {visTeamTildel && (
        <Modal title="Tildel team til prosjekt" onClose={() => setVisTeamTildel(false)}>
          <div className="form">
            <label>Team</label>
            <select value={teamTildelForm.teamId} onChange={e => setTeamTildelForm(f => ({ ...f, teamId: e.target.value }))}>
              {teams.map(t => <option key={t.id} value={t.id}>{t.navn} ({(t.ansatteIds || []).length} medl.)</option>)}
            </select>
            <label>Prosjekt</label>
            <select value={teamTildelForm.prosjektId} onChange={e => setTeamTildelForm(f => ({ ...f, prosjektId: e.target.value }))}>
              <option value="">– Velg prosjekt –</option>
              {aktiveProsjekter.map(p => <option key={p.id} value={p.id}>{p.navn}</option>)}
            </select>
            <label>Fra dato</label>
            <input type="date" value={teamTildelForm.startDato} onChange={e => setTeamTildelForm(f => ({ ...f, startDato: e.target.value }))} />
            <label>Til dato</label>
            <input type="date" value={teamTildelForm.sluttDato} onChange={e => setTeamTildelForm(f => ({ ...f, sluttDato: e.target.value }))} />
            {teamTildelForm.teamId && (
              <div style={{ fontSize: 12, color: '#5d6b80', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginTop: 4 }}>
                Tildeler {(teams.find(t => t.id === teamTildelForm.teamId)?.ansatteIds || []).length} teammedlemmer til prosjektet
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setVisTeamTildel(false)}>Avbryt</button>
              <button className="btn btn-primary"
                disabled={!teamTildelForm.teamId || !teamTildelForm.prosjektId || !teamTildelForm.startDato || !teamTildelForm.sluttDato}
                onClick={() => handleTildelTeam(teamTildelForm.teamId, teamTildelForm.prosjektId, teamTildelForm.startDato, teamTildelForm.sluttDato)}>
                📅 Tildel team
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BursdagVisning({ state }) {
  const today = dateToIso(new Date());
  const todayMM = today.slice(5, 7);
  const todayDD = today.slice(8, 10);

  // Group ansatte by birth month (bursdag format "MM-DD")
  const byMonth = Array.from({ length: 12 }, () => []);
  for (const a of state.ansatte) {
    if (!a.bursdag) continue;
    const mi = parseInt(a.bursdag.slice(0, 2), 10) - 1;
    if (mi >= 0 && mi < 12) byMonth[mi].push(a);
  }
  // Sort each month by day
  for (const arr of byMonth) arr.sort((a, b) => a.bursdag.slice(3).localeCompare(b.bursdag.slice(3)));

  // Upcoming birthdays in the next 30 days
  const upcoming = [];
  for (let offset = 0; offset <= 30; offset++) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const md = `${mm}-${dd}`;
    for (const a of state.ansatte) {
      if (a.bursdag === md) upcoming.push({ ansatt: a, offset, md });
    }
  }

  const totalMedBursdag = state.ansatte.filter(a => a.bursdag).length;

  return (
    <div>
      <div className="uke-nav">
        <span className="uke-label">🎂 Bursdagskalender</span>
        <span style={{ fontSize: 13, color: '#5d6b80' }}>
          {totalMedBursdag} av {state.ansatte.length} ansatte har registrert bursdag
        </span>
      </div>

      {/* Upcoming birthdays */}
      {upcoming.length > 0 && (
        <div className="bursdag-upcoming">
          {upcoming.map(({ ansatt, offset, md }) => {
            const isToday = offset === 0;
            const dayLabel = isToday ? 'I dag!' : offset === 1 ? 'I morgen' : `Om ${offset} dager`;
            return (
              <div key={ansatt.id + md} className={`bursdag-upcoming-item${isToday ? ' bursdag-today-item' : ''}`}>
                <span className="bursdag-upcoming-emoji">{isToday ? '🎉' : '🎂'}</span>
                <div className="mini-avatar" style={{ background: ansatt.innleie ? '#f97316' : fagColor(ansatt.fag), width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>
                  {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{ansatt.navn}</div>
                  <div style={{ fontSize: 11, color: '#5d6b80' }}>{ansatt.fag}</div>
                </div>
                <span className={`bursdag-upcoming-label${isToday ? ' today' : ''}`}>{dayLabel}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 12-month grid */}
      <div className="bursdag-grid">
        {MAANED_NAVN.map((mnd, mi) => {
          const isThisMonth = String(mi + 1).padStart(2, '0') === todayMM;
          const employees = byMonth[mi];
          return (
            <div key={mi} className={`bursdag-month-card${isThisMonth ? ' current-month' : ''}`}>
              <div className="bursdag-month-header">{mnd}</div>
              {employees.length === 0 ? (
                <div className="bursdag-empty">Ingen</div>
              ) : (
                employees.map(a => {
                  const dd = a.bursdag.slice(3);
                  const isToday = isThisMonth && dd === todayDD;
                  return (
                    <div key={a.id} className={`bursdag-item${isToday ? ' bursdag-today' : ''}`}>
                      <span className="bursdag-day">{parseInt(dd, 10)}.</span>
                      <div className="mini-avatar" style={{ background: a.innleie ? '#f97316' : fagColor(a.fag), width: 20, height: 20, fontSize: 9, flexShrink: 0 }}>
                        {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="bursdag-navn">{a.navn}</span>
                      {isToday && <span>🎉</span>}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      {totalMedBursdag === 0 && (
        <div className="empty">Ingen bursdager registrert ennå. Gå til Ansatte og legg inn bursdag (dag og måned).</div>
      )}
    </div>
  );
}

// --- PROSJEKTOVERSIKT ---
function ProsjektOversiktVisning({ state }) {
  const today = dateToIso(new Date());
  const aktive = state.prosjekter.filter(p => p.status === 'aktiv' || !p.status).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));

  return (
    <div className="proj-oversikt-wrap">
      {aktive.length === 0 && <div className="empty">Ingen aktive prosjekter.</div>}
      <div className="proj-oversikt-grid">
        {aktive.map(prosjekt => {
          const tildelinger = state.tildelinger.filter(t => t.prosjektId === prosjekt.id);
          const aktiveTildelinger = tildelinger.filter(t => overlaps(t.startDato, t.sluttDato, today, addDays(today, 30)));
          const ansatteIds = [...new Set(aktiveTildelinger.map(t => t.ansattId))];
          const ansatte = ansatteIds.map(id => state.ansatte.find(a => a.id === id)).filter(Boolean);

          const alleIds = [...new Set(tildelinger.map(t => t.ansattId))];
          const alleAnsatte = alleIds.map(id => state.ansatte.find(a => a.id === id)).filter(Boolean);

          const byFag = {};
          for (const a of ansatte) {
            if (!byFag[a.fag]) byFag[a.fag] = [];
            byFag[a.fag].push(a);
          }

          return (
            <div key={prosjekt.id} className="proj-oversikt-card">
              <div className="proj-oversikt-header">
                <div className="proj-oversikt-tittel">
                  <div className="proj-oversikt-navn">{prosjekt.navn}</div>
                  {prosjekt.adresse && <div className="proj-oversikt-meta">{prosjekt.adresse}</div>}
                </div>
                <div className="proj-oversikt-count">
                  <span className="proj-count-num">{ansatte.length}</span>
                  <span className="proj-count-lbl">nå</span>
                  {alleAnsatte.length !== ansatte.length && (
                    <span className="proj-count-total">/ {alleAnsatte.length} tot.</span>
                  )}
                </div>
              </div>

              {ansatte.length === 0 ? (
                <div className="proj-oversikt-tom">
                  {alleAnsatte.length > 0
                    ? `${alleAnsatte.length} tildelt – ingen aktive neste 30 dager`
                    : 'Ingen ansatte tildelt'}
                </div>
              ) : (
                <div className="proj-fag-grupper">
                  {Object.entries(byFag).map(([fag, fagAnsatte]) => (
                    <div key={fag} className="proj-fag-rad">
                      <div className="proj-fag-label">
                        <span className="fag-dot" style={{ background: fagColor(fag) }} />
                        <span style={{ color: fagColor(fag), fontWeight: 500, fontSize: 12 }}>{fag}</span>
                        <span className="proj-fag-antall">{fagAnsatte.length}</span>
                      </div>
                      <div className="proj-avatar-rad">
                        {fagAnsatte.map(a => (
                          <div key={a.id} className="proj-avatar-wrap" title={a.navn}>
                            <div className="mini-avatar" style={{ background: fagColor(a.fag), width: 34, height: 34, fontSize: 12 }}>
                              {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="proj-avatar-navn">{a.navn.split(' ')[0]}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- RESSURSALLOKERING ---
function RessursVisning({ state, planAnsatte, currentWeek, prevWeek, nextWeek, thisWeek }) {
  // Show 8 weeks from current week
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(currentWeek, i * 7));

  // Ledig kapasitet per uke: ansatte uten prosjekt-tildeling, uten ferie og ikke sykmeldt
  const ukeStats = weeks.map(weekStr => {
    const weekEnd = addDays(weekStr, 6);
    const opptattIds = new Set(state.tildelinger
      .filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, weekStr, weekEnd))
      .map(t => t.ansattId));
    const ferieIds = new Set(state.tildelinger
      .filter(t => t.prosjektId === FERIE_ID && overlaps(t.startDato, t.sluttDato, weekStr, weekEnd))
      .map(t => t.ansattId));
    const sykmeldte = planAnsatte.filter(a => erSykmeldtIPeriode(a, weekStr, weekEnd)).length;
    const ledige = planAnsatte.filter(a =>
      !opptattIds.has(a.id) && !ferieIds.has(a.id) && !erSykmeldtIPeriode(a, weekStr, weekEnd)
    ).length;
    return { weekStr, weekEnd, ledige, ferie: ferieIds.size, sykmeldte, total: planAnsatte.length };
  });

  return (
    <div>
      <div className="uke-nav">
        <button className="btn" onClick={prevWeek}>← Forrige</button>
        <div className="uke-label">8-ukers oversikt fra uke {getWeekNumber(currentWeek)}</div>
        <button className="btn" onClick={thisWeek}>I dag</button>
        <button className="btn" onClick={nextWeek}>Neste →</button>
      </div>

      {/* Ledig kapasitet per uke — rask oversikt øverst */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 18 }}>
        {ukeStats.map(s => {
          const ingen = s.ledige === 0;
          const faa = s.ledige > 0 && s.ledige <= 2;
          const farge = ingen ? '#dc2626' : faa ? '#d97706' : '#15803d';
          const bg = ingen ? '#fef2f2' : faa ? '#fffbeb' : '#f0fdf4';
          return (
            <div key={s.weekStr}
              style={{ background: bg, border: `1px solid ${farge}33`, borderLeft: `3px solid ${farge}`, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}
              title={`Uke ${getWeekNumber(s.weekStr)}: ${s.ledige} ledige av ${s.total}${s.ferie ? ` · ${s.ferie} på ferie` : ''}${s.sykmeldte ? ` · ${s.sykmeldte} sykmeldt` : ''}`}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#475569' }}>
                Uke {getWeekNumber(s.weekStr)}
              </div>
              <div style={{ fontSize: 10, color: '#5d6b80', marginBottom: 4 }}>
                {s.weekStr.slice(8)}.{s.weekStr.slice(5, 7)} – {s.weekEnd.slice(8)}.{s.weekEnd.slice(5, 7)}
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: farge, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                👷 {s.ledige}
              </div>
              <div style={{ fontSize: 10, color: farge, fontWeight: 500 }}>ledig{s.ledige !== 1 ? 'e' : ''}</div>
              {(s.ferie > 0 || s.sykmeldte > 0) && (
                <div style={{ fontSize: 10, marginTop: 2, display: 'flex', gap: 6, justifyContent: 'center' }}>
                  {s.ferie > 0 && <span style={{ color: '#0891b2' }}>🏖 {s.ferie}</span>}
                  {s.sykmeldte > 0 && <span style={{ color: '#5d6b80' }}>🤒 {s.sykmeldte}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {state.prosjekter.length === 0 && (
        <div className="empty">Ingen prosjekter registrert.</div>
      )}

      {state.fag.map(fag => {
        const fagAnsatte = planAnsatte.filter(a => a.fag === fag);
        if (fagAnsatte.length === 0) return null;
        return (
          <div key={fag} className="ressurs-gruppe">
            <div className="ressurs-fag-header" style={{ borderLeft: `4px solid ${fagColor(fag)}` }}>
              {fag} ({fagAnsatte.length} ansatt{fagAnsatte.length !== 1 ? 'e' : ''})
            </div>
            <div className="ressurs-grid-wrap">
            <div className="ressurs-grid" style={{ gridTemplateColumns: `150px repeat(8, 1fr)` }}>
              <div className="uke-header-cell" style={{ fontSize: 12 }}>Ansatt</div>
              {weeks.map(w => (
                <div key={w} className="uke-header-cell" style={{ fontSize: 11 }}>
                  Uke {getWeekNumber(w)}<br />{w.slice(5).replace('-', '.')}
                </div>
              ))}
              {fagAnsatte.map(ansatt => (
                <React.Fragment key={ansatt.id}>
                  <div className="uke-row-label" style={{ minHeight: 40 }}>
                    <div className="mini-avatar" style={{ background: fagColor(ansatt.fag), width: 28, height: 28, fontSize: 11 }}>
                      {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="row-navn" style={{ fontSize: 13 }}>{ansatt.navn}</div>
                  </div>
                  {weeks.map(weekStr => {
                    const weekEnd = addDays(weekStr, 6);
                    const tilInUke = state.tildelinger.filter(t =>
                      t.ansattId === ansatt.id && overlaps(t.startDato, t.sluttDato, weekStr, weekEnd)
                    );
                    const prosjekterIUke = tilInUke.map(t =>
                      state.prosjekter.find(p => p.id === t.prosjektId)
                    ).filter(Boolean);
                    const belastning = Math.min(tilInUke.length, 3);
                    const colors = ['#dcfce7', '#fef9c3', '#fee2e2'];
                    const bgColor = belastning === 0 ? '#f9fafb' : colors[belastning - 1];
                    return (
                      <div
                        key={`${ansatt.id}-${weekStr}`}
                        className="ressurs-cell"
                        style={{ background: bgColor }}
                        title={prosjekterIUke.map(p => p.navn).join('\n') || 'Ledig'}
                      >
                        {prosjekterIUke.slice(0, 2).map((p, i) => (
                          <div key={i} className="ressurs-chip">{p.navn.slice(0, 10)}</div>
                        ))}
                        {prosjekterIUke.length > 2 && (
                          <div className="ressurs-chip">+{prosjekterIUke.length - 2}</div>
                        )}
                        {belastning === 0 && <span className="ledig">Ledig</span>}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


function getWeekNumber(dateStr) {
  const d = isoToDate(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
