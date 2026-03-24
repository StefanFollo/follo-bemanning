import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { weekStart, addDays, isoToDate, dateToIso, formatDate, overlaps } from '../store';

const FAG_COLORS = {
  'Bas Tømrer': '#f59e0b',
  'Montør': '#3b82f6',
  'Lærling Tømrer': '#16a34a',
  'Maler': '#ec4899',
  'Rørlegger': '#06b6d4',
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

export default function Bemanningsplan() {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState('uke');
  const [ukeMode, setUkeMode] = useState('dag'); // 'dag' | 'uke' | 'maaned'
  const [currentWeek, setCurrentWeek] = useState(() => weekStart(dateToIso(new Date())));
  const [currentMonth, setCurrentMonth] = useState(() => monthStart(dateToIso(new Date())));
  const [showModal, setShowModal] = useState(false);
  const [tilForm, setTilForm] = useState({ ansattId: '', prosjektId: '', startDato: '', sluttDato: '' });
  const [splitModal, setSplitModal] = useState(null); // tildeling object
  const [splitForm, setSplitForm] = useState({ gapStart: '', gapEnd: '' });
  const dragRef = useRef(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));

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

  function handleAddTildeling() {
    if (!tilForm.ansattId || !tilForm.prosjektId || !tilForm.startDato || !tilForm.sluttDato) return;
    dispatch({ type: 'ADD_TILDELING', payload: tilForm });
    setShowModal(false);
  }

  function deleteTildeling(id) {
    dispatch({ type: 'DELETE_TILDELING', id });
  }

  function daysDiff(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
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
      dispatch({ type: 'UPDATE_TILDELING', payload: { ...t, startDato: newStart, sluttDato: newEnd } });
    } else if (d.type === 'end') {
      // Extend OR shorten from right — any date >= startDato is valid
      const newEnd = unit === 'week' ? addDays(targetDay, 6)
                  : unit === 'month' ? monthEnd(targetDay)
                  : targetDay;
      if (newEnd >= t.startDato)
        dispatch({ type: 'UPDATE_TILDELING', payload: { ...t, sluttDato: newEnd } });
    } else if (d.type === 'start') {
      // Extend OR shorten from left — any date <= sluttDato is valid
      const newStart = unit === 'week' ? targetDay
                     : unit === 'month' ? targetDay
                     : targetDay;
      if (newStart <= t.sluttDato)
        dispatch({ type: 'UPDATE_TILDELING', payload: { ...t, startDato: newStart } });
    }
  }

  function handleSplitSave() {
    const t = splitModal;
    const { gapStart, gapEnd } = splitForm;
    if (!gapStart || !gapEnd || gapStart > gapEnd) return;
    const parts = [];
    if (gapStart > t.startDato)
      parts.push({ ansattId: t.ansattId, prosjektId: t.prosjektId, startDato: t.startDato, sluttDato: addDays(gapStart, -1) });
    if (gapEnd < t.sluttDato)
      parts.push({ ansattId: t.ansattId, prosjektId: t.prosjektId, startDato: addDays(gapEnd, 1), sluttDato: t.sluttDato });
    if (parts.length === 0) return;
    dispatch({ type: 'SPLIT_TILDELING', id: t.id, parts });
    setSplitModal(null);
  }

  // --- UKE-VISNING ---
  function UkeVisning() {
    const today = dateToIso(new Date());
    const FALLBACK_COLORS = ['#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#be185d','#854d0e','#065f46','#1e40af'];
    const prosjektColor = (pid) => {
      const p = state.prosjekter.find(p => p.id === pid);
      if (p?.farge) return p.farge;
      const idx = state.prosjekter.findIndex(p => p.id === pid);
      return FALLBACK_COLORS[idx % FALLBACK_COLORS.length] || '#6b7280';
    };

    // Needle state for uke-modus
    const [needleDay, setNeedleDay] = useState(today);
    const draggingNeedle = useRef(false);
    const gridWrapRef = useRef(null);

    // ---- DAG-MODUS ----
    const weekEnd = addDays(currentWeek, 6);

    const dagProsjektIds = [...new Set(
      state.tildelinger
        .filter(t => overlaps(t.startDato, t.sluttDato, currentWeek, weekEnd))
        .map(t => t.prosjektId)
    )];
    const dagProsjekter = dagProsjektIds.map(id => state.prosjekter.find(p => p.id === id)).filter(Boolean);
    const dagTildeltIds = new Set(
      state.tildelinger.filter(t => overlaps(t.startDato, t.sluttDato, currentWeek, weekEnd)).map(t => t.ansattId)
    );
    const dagLedige = state.ansatte.filter(a => !dagTildeltIds.has(a.id));

    function DagAnsattRad({ ansatt }) {
      const [dragOverDay, setDragOverDay] = useState(null);
      return (
        <React.Fragment>
          <div className="uke-row-label">
            <div className="mini-avatar" style={{ background: fagColor(ansatt.fag) }}>
              {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="row-navn">{ansatt.navn}</div>
              <div className="row-fag" style={{ color: fagColor(ansatt.fag) }}>{ansatt.fag}</div>
            </div>
          </div>
          {weekDays.map(dag => {
            const dagTil = state.tildelinger.filter(t =>
              t.ansattId === ansatt.id && overlaps(t.startDato, t.sluttDato, dag, dag)
            );
            const isOver = dragOverDay === dag;
            return (
              <div key={`${ansatt.id}-${dag}`}
                className={`uke-cell ${isOver ? 'drag-over' : ''}`}
                onClick={() => dagTil.length === 0 && openAddTildeling(ansatt.id, dag)}
                onDragOver={e => { e.preventDefault(); setDragOverDay(dag); }}
                onDragLeave={e => {
                  // Only clear if cursor truly left the cell (not just moved to a child)
                  if (!e.currentTarget.contains(e.relatedTarget)) setDragOverDay(null);
                }}
                onDrop={e => { e.preventDefault(); setDragOverDay(null); handleDrop(dag, 'day'); }}
                title={dagTil.length === 0 ? 'Klikk for å legge til' : undefined}
              >
                {dagTil.map(t => {
                  const p = state.prosjekter.find(p => p.id === t.prosjektId);
                  const isFirstVis = t.startDato === dag || (t.startDato < weekDays[0] && dag === weekDays[0]);
                  const isLastVis  = t.sluttDato === dag || (t.sluttDato > weekDays[6] && dag === weekDays[6]);
                  return (
                    <div key={t.id}
                      className="tildeling-chip"
                      style={{ background: prosjektColor(t.prosjektId) }}
                      onClick={e => e.stopPropagation()}
                      title={`${p?.navn || 'Ukjent'} · ${formatDate(t.startDato)} – ${formatDate(t.sluttDato)}`}
                    >
                      {isFirstVis ? (
                        <div className="chip-handle chip-handle-l"
                          draggable
                          onDragStart={e => {
                            e.stopPropagation();
                            dragRef.current = { tildelingId: t.id, type: 'start' };
                          }}
                          title="Dra for å endre startdato">◂</div>
                      ) : <div className="chip-handle-spacer" />}
                      <span className="chip-navn">{p?.navn?.slice(0, 11) || '–'}</span>
                      <div className="chip-btns">
                        <button className="chip-split" title="Del opp med pause"
                          onClick={e => { e.stopPropagation(); setSplitModal(t); setSplitForm({ gapStart: '', gapEnd: '' }); }}>✂</button>
                        <button className="chip-delete"
                          onClick={e => { e.stopPropagation(); deleteTildeling(t.id); }}>✕</button>
                      </div>
                      {isLastVis ? (
                        <div className="chip-handle chip-handle-r"
                          draggable
                          onDragStart={e => {
                            e.stopPropagation();
                            dragRef.current = { tildelingId: t.id, type: 'end' };
                          }}
                          title="Dra for å endre sluttdato">▸</div>
                      ) : <div className="chip-handle-spacer" />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </React.Fragment>
      );
    }

    function DagGridHeader() {
      return (
        <>
          <div className="uke-header-cell"></div>
          {weekDays.map((dag, i) => (
            <div key={dag} className={`uke-header-cell ${dag === today ? 'today' : ''}`}>
              <div>{DAG_NAVN[i]}</div>
              <div className="dag-dato">{dag.slice(5).replace('-', '.')}</div>
            </div>
          ))}
        </>
      );
    }

    function ProsjektGruppe({ prosjekt, ansatte, cols, GridHeader, AnsattRad }) {
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

    // ---- UKE-MODUS: Man–Fre × 10 uker (50 kolonner) ----
    const TEN_WEEKS = Array.from({ length: 10 }, (_, i) => addDays(currentWeek, i * 7));

    // Alle arbeidsdager (Man–Fre) for 10 uker = 50 dager
    const WORK_DAYS_UKE = [];
    for (let w = 0; w < 10; w++) {
      for (let d = 0; d < 5; d++) {
        WORK_DAYS_UKE.push(addDays(currentWeek, w * 7 + d));
      }
    }

    const periodeStart = currentWeek;
    const periodeEnd = addDays(currentWeek, 10 * 7 - 1);

    const ukeProsjektIds = [...new Set(
      state.tildelinger
        .filter(t => overlaps(t.startDato, t.sluttDato, periodeStart, periodeEnd))
        .map(t => t.prosjektId)
    )];
    const ukeProsjekter = ukeProsjektIds.map(id => state.prosjekter.find(p => p.id === id)).filter(Boolean);
    const ukeTildeltIds = new Set(
      state.tildelinger.filter(t => overlaps(t.startDato, t.sluttDato, periodeStart, periodeEnd)).map(t => t.ansattId)
    );
    const ukeLedige = state.ansatte.filter(a => !ukeTildeltIds.has(a.id));

    // Needle helpers
    function getNeedleLeft(day) {
      const idx = WORK_DAYS_UKE.indexOf(day);
      if (idx < 0) return null;
      const pct = (idx / WORK_DAYS_UKE.length) * 100;
      const pxOffset = (idx / WORK_DAYS_UKE.length) * 180;
      return `calc(${(180 - pxOffset).toFixed(1)}px + ${pct.toFixed(2)}%)`;
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
      const x = e.clientX - rect.left + wrap.scrollLeft - 180;
      const colWidth = (wrap.scrollWidth - 180) / WORK_DAYS_UKE.length;
      const idx = Math.max(0, Math.min(WORK_DAYS_UKE.length - 1, Math.floor(x / colWidth)));
      setNeedleDay(WORK_DAYS_UKE[idx]);
    }
    function handleNeedlePointerUp() { draggingNeedle.current = false; }

    function UkeAnsattRad({ ansatt }) {
      const [dragOverDay, setDragOverDay] = useState(null);
      return (
        <React.Fragment>
          <div className="uke-row-label">
            <div className="mini-avatar" style={{ background: fagColor(ansatt.fag) }}>
              {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="row-navn">{ansatt.navn}</div>
              <div className="row-fag" style={{ color: fagColor(ansatt.fag) }}>{ansatt.fag}</div>
            </div>
          </div>
          {WORK_DAYS_UKE.map((dag, i) => {
            const isMonday = i % 5 === 0;
            const dagTil = state.tildelinger.filter(t =>
              t.ansattId === ansatt.id && overlaps(t.startDato, t.sluttDato, dag, dag)
            );
            const isToday = dag === today;
            const isOver = dragOverDay === dag;
            return (
              <div key={`${ansatt.id}-${dag}`}
                className={`uke-cell uke-cell-dag ${isToday ? 'today-col' : ''} ${isMonday ? 'week-start-col' : ''} ${isOver ? 'drag-over' : ''}`}
                onClick={() => dagTil.length === 0 && openAddTildeling(ansatt.id, dag)}
                onDragOver={e => { e.preventDefault(); setDragOverDay(dag); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverDay(null); }}
                onDrop={e => { e.preventDefault(); setDragOverDay(null); handleDrop(dag, 'day'); }}
                title={dagTil.length === 0 ? 'Klikk for å legge til' : undefined}
              >
                {dagTil.map(t => {
                  const p = state.prosjekter.find(p => p.id === t.prosjektId);
                  const isFirstVis = t.startDato === dag || dag === WORK_DAYS_UKE[0];
                  const isLastVis  = t.sluttDato === dag || dag === WORK_DAYS_UKE[WORK_DAYS_UKE.length - 1];
                  return (
                    <div key={t.id}
                      className="tildeling-chip"
                      style={{ background: prosjektColor(t.prosjektId) }}
                      onClick={e => e.stopPropagation()}
                      title={`${p?.navn || 'Ukjent'} · ${formatDate(t.startDato)} – ${formatDate(t.sluttDato)}`}
                    >
                      {isFirstVis ? (
                        <div className="chip-handle chip-handle-l" draggable
                          onDragStart={e => { e.stopPropagation(); dragRef.current = { tildelingId: t.id, type: 'start' }; }}
                          title="Dra for å endre startdato">◂</div>
                      ) : <div className="chip-handle-spacer" />}
                      <span className="chip-navn">{p?.navn?.slice(0, 8) || '–'}</span>
                      <div className="chip-btns">
                        <button className="chip-split" title="Del opp med pause"
                          onClick={e => { e.stopPropagation(); setSplitModal(t); setSplitForm({ gapStart: '', gapEnd: '' }); }}>✂</button>
                        <button className="chip-delete"
                          onClick={e => { e.stopPropagation(); deleteTildeling(t.id); }}>✕</button>
                      </div>
                      {isLastVis ? (
                        <div className="chip-handle chip-handle-r" draggable
                          onDragStart={e => { e.stopPropagation(); dragRef.current = { tildelingId: t.id, type: 'end' }; }}
                          title="Dra for å endre sluttdato">▸</div>
                      ) : <div className="chip-handle-spacer" />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </React.Fragment>
      );
    }

    function UkeGridHeader() {
      return (
        <>
          <div className="uke-header-cell"></div>
          {WORK_DAYS_UKE.map((dag, i) => {
            const isMonday = i % 5 === 0;
            const weekIdx = Math.floor(i / 5);
            const isToday = dag === today;
            const isCurrentWeek = TEN_WEEKS[weekIdx] === weekStart(today);
            return (
              <div key={dag}
                className={`uke-header-cell ${isToday ? 'today' : ''} ${isMonday ? 'week-start-col' : ''}`}
                style={{ fontSize: 11, padding: '4px 2px', textAlign: 'center' }}>
                {isMonday && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: isCurrentWeek ? '#2563eb' : '#94a3b8', lineHeight: 1.2 }}>
                    U{getWeekNumber(TEN_WEEKS[weekIdx])}
                  </div>
                )}
                <div style={{ fontWeight: isMonday ? 700 : 400 }}>{DAG_NAVN[i % 5]}</div>
                <div className="dag-dato" style={{ fontSize: 10 }}>{dag.slice(8)}.{dag.slice(5, 7)}</div>
              </div>
            );
          })}
        </>
      );
    }

    const SIX_MONTHS = Array.from({ length: 6 }, (_, i) => addMonths(currentMonth, i));
    const maanedPeriodeEnd = monthEnd(SIX_MONTHS[5]);

    const maanedProsjektIds = [...new Set(
      state.tildelinger
        .filter(t => overlaps(t.startDato, t.sluttDato, currentMonth, maanedPeriodeEnd))
        .map(t => t.prosjektId)
    )];
    const maanedProsjekter = maanedProsjektIds.map(id => state.prosjekter.find(p => p.id === id)).filter(Boolean);
    const maanedTildeltIds = new Set(
      state.tildelinger.filter(t => overlaps(t.startDato, t.sluttDato, currentMonth, maanedPeriodeEnd)).map(t => t.ansattId)
    );
    const maanedLedige = state.ansatte.filter(a => !maanedTildeltIds.has(a.id));

    function MaanedAnsattRad({ ansatt }) {
      const [dragOverM, setDragOverM] = useState(null);
      return (
        <React.Fragment>
          <div className="uke-row-label">
            <div className="mini-avatar" style={{ background: fagColor(ansatt.fag) }}>
              {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="row-navn">{ansatt.navn}</div>
              <div className="row-fag" style={{ color: fagColor(ansatt.fag) }}>{ansatt.fag}</div>
            </div>
          </div>
          {SIX_MONTHS.map(mStart => {
            const mEnd = monthEnd(mStart);
            const mTil = state.tildelinger.filter(t =>
              t.ansattId === ansatt.id && overlaps(t.startDato, t.sluttDato, mStart, mEnd)
            );
            const prosjekterIMaaned = [...new Map(
              mTil.map(t => [t.prosjektId, state.prosjekter.find(p => p.id === t.prosjektId)])
            ).values()].filter(Boolean);
            const isCurrentMonth = mStart.slice(0, 7) === today.slice(0, 7);
            const isOver = dragOverM === mStart;
            return (
              <div key={`${ansatt.id}-${mStart}`}
                className={`uke-cell uke-cell-uke ${isCurrentMonth ? 'current-week-col' : ''} ${isOver ? 'drag-over' : ''}`}
                onClick={() => prosjekterIMaaned.length === 0 && openAddTildeling(ansatt.id, mStart)}
                onDragOver={e => { e.preventDefault(); setDragOverM(mStart); }}
                onDragLeave={() => setDragOverM(null)}
                onDrop={e => { e.preventDefault(); setDragOverM(null); handleDrop(mStart, 'month'); }}
                title={prosjekterIMaaned.length === 0 ? 'Klikk for å legge til' : undefined}
              >
                {mTil.map(t => {
                  const p = state.prosjekter.find(pr => pr.id === t.prosjektId);
                  if (!p) return null;
                  return (
                    <div key={t.id} className="uke-uke-chip"
                      style={{ background: prosjektColor(p.id) }}
                      onClick={e => e.stopPropagation()}
                      title={`${p.navn} · ${formatDate(t.startDato)} – ${formatDate(t.sluttDato)}`}
                    >
                      <span className="uke-chip-handle uke-chip-handle-l"
                        draggable
                        onDragStart={e => { e.stopPropagation(); dragRef.current = { tildelingId: t.id, type: 'start' }; }}
                        title="Dra for å endre startdato">◂</span>
                      <span className="uke-chip-navn">{p.navn.slice(0, 9)}</span>
                      <span className="uke-chip-handle uke-chip-handle-r"
                        draggable
                        onDragStart={e => { e.stopPropagation(); dragRef.current = { tildelingId: t.id, type: 'end' }; }}
                        title="Dra for å endre sluttdato">▸</span>
                    </div>
                  );
                })}
                {prosjekterIMaaned.length === 0 && <span className="ledig">–</span>}
              </div>
            );
          })}
        </React.Fragment>
      );
    }

    function MaanedGridHeader() {
      return (
        <>
          <div className="uke-header-cell"></div>
          {SIX_MONTHS.map(m => {
            const isCurrentMonth = m.slice(0, 7) === today.slice(0, 7);
            return (
              <div key={m} className={`uke-header-cell ${isCurrentMonth ? 'today' : ''}`} style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>{monthLabel(m)}</div>
              </div>
            );
          })}
        </>
      );
    }

    const navLabel = ukeMode === 'dag'
      ? `Uke ${getWeekNumber(currentWeek)}: ${formatDate(currentWeek)} – ${formatDate(addDays(currentWeek, 6))}`
      : ukeMode === 'uke'
      ? `Uke ${getWeekNumber(currentWeek)} – Uke ${getWeekNumber(addDays(currentWeek, 9 * 7))}`
      : `${monthLabel(SIX_MONTHS[0])} – ${monthLabel(SIX_MONTHS[5])}`;

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

    function renderProsjektRader(prosjekter, ledige, cols, AnsattRad, periodeS, periodeE) {
      return (
        <>
          {prosjekter.map(prosjekt => {
            const color = prosjektColor(prosjekt.id);
            const ids = [...new Set(state.tildelinger.filter(t => t.prosjektId === prosjekt.id && overlaps(t.startDato, t.sluttDato, periodeS, periodeE)).map(t => t.ansattId))];
            const ansatte = ids.map(id => state.ansatte.find(a => a.id === id)).filter(Boolean);
            return (
              <React.Fragment key={prosjekt.id}>
                <div className="uke-prosjekt-header" style={{ gridColumn: '1 / -1', borderLeft: `4px solid ${color}` }}>
                  <span className="uke-prosjekt-farge" style={{ background: color }} />
                  <span className="uke-prosjekt-navn">{prosjekt.navn}</span>
                  <span className="uke-prosjekt-antall">{ansatte.length} ansatt{ansatte.length !== 1 ? 'e' : ''}</span>
                </div>
                {ansatte.map(a => <AnsattRad key={a.id} ansatt={a} />)}
              </React.Fragment>
            );
          })}
          {ledige.length > 0 && (
            <React.Fragment>
              <div className="uke-prosjekt-header" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #9ca3af' }}>
                <span className="uke-prosjekt-navn" style={{ color: '#6b7280' }}>Ikke tildelt i perioden</span>
                <span className="uke-prosjekt-antall">{ledige.length} ansatt{ledige.length !== 1 ? 'e' : ''}</span>
              </div>
              {ledige.map(a => <AnsattRad key={a.id} ansatt={a} />)}
            </React.Fragment>
          )}
        </>
      );
    }

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

        {state.ansatte.length === 0 && <div className="empty">Ingen ansatte registrert enda.</div>}

        {ukeMode === 'dag' ? (
          <div className="uke-grid-wrap">
            <div className="uke-grid" style={{ gridTemplateColumns: `180px repeat(7, 1fr)` }}>
              <DagGridHeader />
              {renderProsjektRader(dagProsjekter, dagLedige, 7, DagAnsattRad, currentWeek, weekEnd)}
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
            <div className="uke-grid" style={{ gridTemplateColumns: `180px repeat(50, minmax(34px, 1fr))` }}>
              <UkeGridHeader />
              {renderProsjektRader(ukeProsjekter, ukeLedige, 50, UkeAnsattRad, periodeStart, periodeEnd)}
            </div>
          </div>
        ) : (
          <div className="uke-grid-wrap">
            <div className="uke-grid" style={{ gridTemplateColumns: `180px repeat(6, 1fr)` }}>
              <MaanedGridHeader />
              {renderProsjektRader(maanedProsjekter, maanedLedige, 6, MaanedAnsattRad, currentMonth, maanedPeriodeEnd)}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>
          Klikk på en celle for å legge til en tildeling.
        </div>
      </div>
    );
  }

  // --- PROSJEKTOVERSIKT ---
  function ProsjektOversiktVisning() {
    const today = dateToIso(new Date());
    const aktive = state.prosjekter.filter(p => p.status === 'aktiv' || !p.status);

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
                          <span style={{ color: fagColor(fag), fontWeight: 600, fontSize: 12 }}>{fag}</span>
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
  function RessursVisning() {
    // Show 8 weeks from current week
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(currentWeek, i * 7));

    return (
      <div>
        <div className="uke-nav">
          <button className="btn" onClick={prevWeek}>← Forrige</button>
          <div className="uke-label">8-ukers oversikt fra uke {getWeekNumber(currentWeek)}</div>
          <button className="btn" onClick={thisWeek}>I dag</button>
          <button className="btn" onClick={nextWeek}>Neste →</button>
        </div>

        {state.prosjekter.length === 0 && (
          <div className="empty">Ingen prosjekter registrert.</div>
        )}

        {state.fag.map(fag => {
          const fagAnsatte = state.ansatte.filter(a => a.fag === fag);
          if (fagAnsatte.length === 0) return null;
          return (
            <div key={fag} className="ressurs-gruppe">
              <div className="ressurs-fag-header" style={{ borderLeft: `4px solid ${fagColor(fag)}` }}>
                {fag} ({fagAnsatte.length} ansatt{fagAnsatte.length !== 1 ? 'e' : ''})
              </div>
              <div className="ressurs-grid-wrap">
              <div className="ressurs-grid" style={{ gridTemplateColumns: `180px repeat(8, 1fr)` }}>
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

  return (
    <div className="page">
      <div className="page-header">
        <h2>Bemanningsplan</h2>
        <button className="btn btn-primary" onClick={() => openAddTildeling()}>+ Ny tildeling</button>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'uke' ? 'active' : ''}`} onClick={() => setTab('uke')}>
          Ukeoversikt
        </button>
        <button className={`tab-btn ${tab === 'ressurs' ? 'active' : ''}`} onClick={() => setTab('ressurs')}>
          Ressursallokering
        </button>
        <button className={`tab-btn ${tab === 'prosjekt' ? 'active' : ''}`} onClick={() => setTab('prosjekt')}>
          Prosjektoversikt
        </button>
      </div>

      {tab === 'uke' && <UkeVisning />}
      {tab === 'ressurs' && <RessursVisning />}
      {tab === 'prosjekt' && <ProsjektOversiktVisning />}

      {splitModal && (
        <Modal title="Del opp tildeling med pause" onClose={() => setSplitModal(null)}>
          <div className="form">
            <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {state.prosjekter.find(p => p.id === splitModal.prosjektId)?.navn}
              </div>
              <div style={{ color: '#64748b', fontSize: 13 }}>
                {state.ansatte.find(a => a.id === splitModal.ansattId)?.navn} · {formatDate(splitModal.startDato)} – {formatDate(splitModal.sluttDato)}
              </div>
            </div>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
              Angi perioden ansatt <b>ikke</b> er på prosjektet. Tildelingen splittes i to rundt denne pausen.
            </p>
            <div className="form-row">
              <div>
                <label>Pause fra *</label>
                <input type="date" value={splitForm.gapStart}
                  min={splitModal.startDato} max={splitModal.sluttDato}
                  onChange={e => setSplitForm(f => ({ ...f, gapStart: e.target.value }))} />
              </div>
              <div>
                <label>Pause til *</label>
                <input type="date" value={splitForm.gapEnd}
                  min={splitForm.gapStart || splitModal.startDato} max={splitModal.sluttDato}
                  onChange={e => setSplitForm(f => ({ ...f, gapEnd: e.target.value }))} />
              </div>
            </div>
            {splitForm.gapStart && splitForm.gapEnd && splitForm.gapStart <= splitForm.gapEnd && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginTop: 4 }}>
                Resultat: {splitForm.gapStart > splitModal.startDato ? `Del 1: ${formatDate(splitModal.startDato)} – ${formatDate(addDays(splitForm.gapStart, -1))}` : ''}
                {splitForm.gapStart > splitModal.startDato && splitForm.gapEnd < splitModal.sluttDato ? ' · ' : ''}
                {splitForm.gapEnd < splitModal.sluttDato ? `Del 2: ${formatDate(addDays(splitForm.gapEnd, 1))} – ${formatDate(splitModal.sluttDato)}` : ''}
              </div>
            )}
            <div className="form-actions">
              <button className="btn" onClick={() => setSplitModal(null)}>Avbryt</button>
              <button className="btn btn-primary" onClick={handleSplitSave}
                disabled={!splitForm.gapStart || !splitForm.gapEnd || splitForm.gapStart > splitForm.gapEnd}>
                Del opp
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal title="Legg til tildeling" onClose={() => setShowModal(false)}>
          <div className="form">
            <label>Ansatt *</label>
            <select value={tilForm.ansattId} onChange={e => setTilForm(f => ({ ...f, ansattId: e.target.value }))}>
              {state.ansatte.map(a => <option key={a.id} value={a.id}>{a.navn} ({a.fag})</option>)}
            </select>

            <label>Prosjekt *</label>
            <select value={tilForm.prosjektId} onChange={e => setTilForm(f => ({ ...f, prosjektId: e.target.value }))}>
              {state.prosjekter.map(p => <option key={p.id} value={p.id}>{p.navn}</option>)}
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
            {state.prosjekter.length === 0 && <p style={{ color: '#dc2626' }}>Legg til prosjekter først.</p>}

            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button
                className="btn btn-primary"
                onClick={handleAddTildeling}
                disabled={state.ansatte.length === 0 || state.prosjekter.length === 0}
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

function getWeekNumber(dateStr) {
  const d = isoToDate(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
