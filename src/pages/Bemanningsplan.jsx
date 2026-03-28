import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { weekStart, addDays, isoToDate, dateToIso, formatDate, overlaps } from '../store';
import { getHolidayMap } from '../holidays';

const FERIE_ID = '__FERIE__';

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

  // Kun hverdager (Man–Fre) over 52 uker = ~260 kolonner
  const weekDays = Array.from({ length: 52 * 7 }, (_, i) => addDays(currentWeek, i))
    .filter(d => { const dow = new Date(d + 'T00:00:00').getDay(); return dow >= 1 && dow <= 5; });

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

  // Lagre og gjenopprette scroll-posisjon rundt dispatch
  // Dobbel rAF sikrer at React er ferdig med painting før vi restorer
  function dispatchKeepScroll(action) {
    const winY = window.scrollY;
    const winX = window.scrollX;
    const wraps = [...document.querySelectorAll('.uke-grid-wrap')];
    const saved = wraps.map(el => ({ el, top: el.scrollTop, left: el.scrollLeft }));
    dispatch(action);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top: winY, left: winX, behavior: 'instant' });
      saved.forEach(({ el, top, left }) => {
        el.scrollTop = top;
        el.scrollLeft = left;
      });
    }));
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
      dispatchKeepScroll({ type: 'UPDATE_TILDELING', payload: { ...t, startDato: newStart, sluttDato: newEnd } });
    } else if (d.type === 'end') {
      const newEnd = unit === 'week' ? addDays(targetDay, 6)
                  : unit === 'month' ? monthEnd(targetDay)
                  : targetDay;
      if (newEnd >= t.startDato)
        dispatchKeepScroll({ type: 'UPDATE_TILDELING', payload: { ...t, sluttDato: newEnd } });
    } else if (d.type === 'start') {
      const newStart = targetDay;
      if (newStart <= t.sluttDato)
        dispatchKeepScroll({ type: 'UPDATE_TILDELING', payload: { ...t, startDato: newStart } });
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
    const thisYear = new Date().getFullYear();
    const HOLIDAYS = getHolidayMap(thisYear - 1, thisYear + 2);
    const isHoliday = (iso) => !!HOLIDAYS[iso];
    const holidayName = (iso) => HOLIDAYS[iso] || '';
    // Én myk stålblå farge på alle prosjektbarer — ikke skarp, passer til designet
    const PROSJEKT_BAR_FARGE = '#6b8fc4';
    const prosjektColor = (_pid) => PROSJEKT_BAR_FARGE;

    // Needle state for uke-modus
    const [needleDay, setNeedleDay] = useState(today);
    const draggingNeedle = useRef(false);
    const gridWrapRef = useRef(null);

    // ---- DAG-MODUS ----
    const weekEnd = addDays(currentWeek, 52 * 7 - 1);

    const dagProsjektIds = [...new Set(
      state.tildelinger
        .filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, currentWeek, weekEnd))
        .map(t => t.prosjektId)
    )];
    const dagProsjekter = dagProsjektIds.map(id => state.prosjekter.find(p => p.id === id)).filter(Boolean);
    const dagTildeltIds = new Set(
      state.tildelinger.filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, currentWeek, weekEnd)).map(t => t.ansattId)
    );
    const dagLedige = state.ansatte.filter(a => !dagTildeltIds.has(a.id));

    // Shared Gantt row container — renders continuous bars with drag handles
    // prosjektId: vis kun dette prosjektets bars normalt; andre prosjekter vises som opptatt-bar
    function GanttRowContainer({ ansatt, days, unit, prosjektId }) {
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
            if (e.target === e.currentTarget || e.target.classList.contains('gantt-bg-cell')) {
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
                onClick={e => { e.stopPropagation(); if (window.confirm(`Slett «${barLabel}»?\n${formatDate(t.startDato)} – ${formatDate(t.sluttDato)}`)) deleteTildeling(t.id); }}
                title={`${barLabel} · ${formatDate(t.startDato)} – ${formatDate(t.sluttDato)}`}
              >
                {pos.isFirst
                  ? <div className="gantt-handle gantt-handle-l" draggable onDragStart={e => { e.stopPropagation(); dragRef.current = { tildelingId: t.id, type: 'start' }; }}>◂</div>
                  : <div className="gantt-handle-spacer" />}
                <span className="gantt-label">{barLabel}</span>
                <div className="gantt-actions">
                  <button onClick={e => { e.stopPropagation(); setSplitModal(t); setSplitForm({ gapStart: '', gapEnd: '' }); }} title="Del opp">✂</button>
                  <button onClick={e => { e.stopPropagation(); if (window.confirm(`Slett «${p?.navn}»?`)) deleteTildeling(t.id); }} title="Slett">✕</button>
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

    function DagAnsattRad({ ansatt, prosjektId }) {
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
          <GanttRowContainer ansatt={ansatt} days={weekDays} unit="day" prosjektId={prosjektId} />
        </React.Fragment>
      );
    }

    function DagGridHeader() {
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: isCurrentWeek ? '#2563eb' : '#94a3b8', lineHeight: 1.2 }}>
                    U{weekNum}
                  </div>
                )}
                <div style={{ fontWeight: isMonday ? 700 : 400 }}>{DAG_NAVN[dow - 1]}</div>
                <div className="dag-dato" style={{ fontSize: 10 }}>{dag.slice(8)}.{dag.slice(5, 7)}</div>
                {hol && <div className="holiday-label">{hol.split(' ')[0]}</div>}
              </div>
            );
          })}
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
    const ukeProsjekter = ukeProsjektIds.map(id => state.prosjekter.find(p => p.id === id)).filter(Boolean);
    const ukeTildeltIds = new Set(
      state.tildelinger.filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, periodeStart, periodeEnd)).map(t => t.ansattId)
    );
    const ukeLedige = state.ansatte.filter(a => !ukeTildeltIds.has(a.id));

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

    function UkeAnsattRad({ ansatt, prosjektId }) {
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
          <GanttRowContainer ansatt={ansatt} days={WORK_DAYS_UKE} unit="day_50" prosjektId={prosjektId} />
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
            const isCurrentWeek = weekStart(dag) === weekStart(today);
            const hol = HOLIDAYS[dag];
            return (
              <div key={dag}
                className={`uke-header-cell ${isToday ? 'today' : ''} ${isMonday ? 'week-start-col' : ''} ${hol ? 'holiday-header' : ''}`}
                style={{ fontSize: 11, padding: '4px 2px', textAlign: 'center' }}
                title={hol || undefined}>
                {isMonday && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: isCurrentWeek ? '#2563eb' : '#94a3b8', lineHeight: 1.2 }}>
                    U{getWeekNumber(TEN_WEEKS[weekIdx])}
                  </div>
                )}
                <div style={{ fontWeight: isMonday ? 700 : 400 }}>{DAG_NAVN[i % 5]}</div>
                <div className="dag-dato" style={{ fontSize: 10 }}>{dag.slice(8)}.{dag.slice(5, 7)}</div>
                {hol && <div className="holiday-label">{hol.split(' ')[0]}</div>}
              </div>
            );
          })}
        </>
      );
    }

    const SIX_MONTHS = Array.from({ length: 18 }, (_, i) => addMonths(currentMonth, i));
    const maanedPeriodeEnd = monthEnd(SIX_MONTHS[17]);

    const maanedProsjektIds = [...new Set(
      state.tildelinger
        .filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, currentMonth, maanedPeriodeEnd))
        .map(t => t.prosjektId)
    )];
    const maanedProsjekter = maanedProsjektIds.map(id => state.prosjekter.find(p => p.id === id)).filter(Boolean);
    const maanedTildeltIds = new Set(
      state.tildelinger.filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, currentMonth, maanedPeriodeEnd)).map(t => t.ansattId)
    );
    const maanedLedige = state.ansatte.filter(a => !maanedTildeltIds.has(a.id));

    function MaanedAnsattRad({ ansatt, prosjektId }) {
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
          <GanttRowContainer ansatt={ansatt} days={SIX_MONTHS} unit="month" prosjektId={prosjektId} />
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
                {ansatte.map(a => <AnsattRad key={a.id} ansatt={a} prosjektId={prosjekt.id} />)}
              </React.Fragment>
            );
          })}
          {ledige.length > 0 && (
            <React.Fragment>
              <div className="uke-prosjekt-header" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #9ca3af' }}>
                <span className="uke-prosjekt-navn" style={{ color: '#6b7280' }}>Ikke tildelt i perioden</span>
                <span className="uke-prosjekt-antall">{ledige.length} ansatt{ledige.length !== 1 ? 'e' : ''}</span>
              </div>
              {ledige.map(a => <AnsattRad key={a.id} ansatt={a} prosjektId={null} />)}
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
            <div className="uke-grid" style={{ gridTemplateColumns: `150px repeat(${weekDays.length}, minmax(36px, 1fr))` }}>
              <DagGridHeader />
              {renderProsjektRader(dagProsjekter, dagLedige, weekDays.length, DagAnsattRad, currentWeek, weekEnd)}
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
              <UkeGridHeader />
              {renderProsjektRader(ukeProsjekter, ukeLedige, 260, UkeAnsattRad, periodeStart, periodeEnd)}
            </div>
          </div>
        ) : (
          <div className="uke-grid-wrap">
            <div className="uke-grid" style={{ gridTemplateColumns: `150px repeat(18, minmax(80px, 1fr))` }}>
              <MaanedGridHeader />
              {renderProsjektRader(maanedProsjekter, maanedLedige, 18, MaanedAnsattRad, currentMonth, maanedPeriodeEnd)}
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

  return (
    <div className="page">
      <div className="page-header">
        <h2>Bemanningsplan</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn no-print" onClick={() => window.print()} title="Skriv ut / Lagre som PDF">🖨 PDF</button>
          <button className="btn no-print" onClick={() => openAddFerie()} title="Registrer ferie eller fri">🏖 Ferie</button>
          <button className="btn btn-primary no-print" onClick={() => openAddTildeling()}>+ Ny tildeling</button>
        </div>
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
        <Modal title={tilForm.prosjektId === FERIE_ID ? '🏖 Legg til ferie / fri' : 'Legg til tildeling'} onClose={() => setShowModal(false)}>
          <div className="form">
            <label>Ansatt *</label>
            <select value={tilForm.ansattId} onChange={e => setTilForm(f => ({ ...f, ansattId: e.target.value }))}>
              {state.ansatte.map(a => <option key={a.id} value={a.id}>{a.navn} ({a.fag})</option>)}
            </select>

            <label>{tilForm.prosjektId === FERIE_ID ? 'Type' : 'Prosjekt *'}</label>
            <select value={tilForm.prosjektId} onChange={e => setTilForm(f => ({ ...f, prosjektId: e.target.value }))}>
              <option value={FERIE_ID}>🏖 Ferie / Fri</option>
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

function getWeekNumber(dateStr) {
  const d = isoToDate(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
