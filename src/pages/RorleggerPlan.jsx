import React, { useState } from 'react';
import {
  ClipboardList, Pencil, Send, CircleCheck, CircleX, X, Search, Phone, Mail,
  CalendarDays, Clock, PhoneCall, Rocket, FilePen, MessageSquare,
} from 'lucide-react';
import { Ikon } from '../komponenter/Ikon';
import { useApp } from '../context/AppContext';
import { weekStart, addDays, isoToDate, dateToIso, formatDate, overlaps } from '../store';
import { getHolidayMap } from '../holidays';

const DAG_NAVN    = ['Man', 'Tir', 'Ons', 'Tor', 'Fre'];
const MAANED_NAVN = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'];

const BEF_STATUS = {
  planlagt:      { label: 'Planlagt befaring',   farge: '#3b82f6', bg: '#eff6ff', ikon: ClipboardList },
  tilbud_arbeid: { label: 'Tilbud under arbeid', farge: '#b45309', bg: '#fffbeb', ikon: Pencil },
  tilbud_sendt:  { label: 'Tilbud sendt',        farge: '#6d28d9', bg: '#f5f3ff', ikon: Send },
  godkjent:      { label: 'Godkjent',            farge: '#15803d', bg: '#f0fdf4', ikon: CircleCheck },
  tapt:          { label: 'Tapt',                farge: '#6b7280', bg: '#f9fafb', ikon: CircleX },
};
function datoKort(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' });
}
function dagerTil(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso + 'T00:00:00') - new Date()) / 86400000);
}
const BEF_FARGE = {
  planlagt:      '#3b82f6',
  tilbud_arbeid: '#b45309',
  tilbud_sendt:  '#6d28d9',
  godkjent:      '#15803d',
  tapt:          '#5d6b80',
};
function befaringFarge(status) { return BEF_FARGE[status] || '#3b82f6'; }
function tidPluss1t(tid) {
  if (!tid) return '10:00';
  const [h, m] = tid.split(':').map(Number);
  return `${String(Math.min(16, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
const DAY_START_H = 7;
const DAY_END_H   = 17;
const DAY_HOURS   = DAY_END_H - DAY_START_H;
const FALLBACK_COLORS = ['#2563eb','#15803d','#dc2626','#9333ea','#ea580c','#0891b2','#be185d','#854d0e'];

function getWeekNumber(dateStr) {
  const d = isoToDate(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
function tidToDecimal(tid) {
  const [h, m] = tid.split(':').map(Number);
  return h + m / 60;
}
function monthStart(iso) { return iso.slice(0, 7) + '-01'; }
function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 7) + '-01';
}
function monthEnd(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + 1); d.setDate(0);
  return d.toISOString().slice(0, 10);
}
function monthLabel(iso) {
  return MAANED_NAVN[parseInt(iso.slice(5, 7), 10) - 1] + ' ' + iso.slice(0, 4);
}

export default function RorleggerPlan() {
  const { state, dispatch } = useApp();
  const today    = dateToIso(new Date());
  const thisYear = new Date().getFullYear();
  const HOLIDAYS = getHolidayMap(thisYear - 1, thisYear + 2);

  // Navigasjon
  const [currentWeek,  setCurrentWeek]  = useState(() => weekStart(today));
  const [currentMonth, setCurrentMonth] = useState(() => monthStart(today));
  const [ukeMode,      setUkeMode]      = useState('dag'); // 'dag' | 'uke' | 'maaned'

  // Ukesplan (gantt) modal
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editPlan,      setEditPlan]      = useState(null);
  const [planForm,      setPlanForm]      = useState({
    ansattId: '', modus: 'prosjekt', prosjektId: '', fritekst: '', startDato: '', sluttDato: '',
  });

  // Timeplan (daglig timegrid) modal
  const [showModal,  setShowModal]  = useState(false);
  const [editTimer,  setEditTimer]  = useState(null);
  const [form,       setForm]       = useState({
    ansattId: '', modus: 'prosjekt', prosjektId: '', fritekst: '',
    kontakt: '', telefon: '', adresse: '',
    dato: '', startTid: '08:00', sluttTid: '12:00', notat: '',
  });

  const rorleggere = state.ansatte.filter(a => !a.arkivert && a.fag === 'Rørlegger').sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));

  // ──────────────────────────────────────────────
  // GANTT – data per modus
  // ──────────────────────────────────────────────

  // dag: 5 arbeidsdager (gjeldende uke) — synkronisert med timegriden
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(currentWeek, i));

  // uke: 52 uker × 5 dager = 260 arbeidsdager fra gjeldende uke
  const WORK_DAYS_52 = [];
  for (let w = 0; w < 52; w++)
    for (let d = 0; d < 5; d++)
      WORK_DAYS_52.push(addDays(currentWeek, w * 7 + d));

  // maaned: 18 måneder fra gjeldende måned
  const SIX_MONTHS_18 = Array.from({ length: 18 }, (_, i) => addMonths(currentMonth, i));

  const ganttDays = ukeMode === 'dag' ? weekDays
                  : ukeMode === 'uke' ? WORK_DAYS_52
                  : SIX_MONTHS_18;
  const ganttUnit = ukeMode === 'maaned' ? 'month' : 'day';

  // Navigasjon
  function handlePrev()  {
    if (ukeMode === 'maaned') setCurrentMonth(m => addMonths(m, -1));
    else setCurrentWeek(w => addDays(w, -7));
  }
  function handleNext()  {
    if (ukeMode === 'maaned') setCurrentMonth(m => addMonths(m, 1));
    else setCurrentWeek(w => addDays(w, 7));
  }
  function handleToday() {
    if (ukeMode === 'maaned') setCurrentMonth(monthStart(today));
    else setCurrentWeek(weekStart(today));
  }

  const navLabel = ukeMode === 'dag'
    ? `Uke ${getWeekNumber(currentWeek)}: ${formatDate(currentWeek)} – ${formatDate(addDays(currentWeek, 4))}`
    : ukeMode === 'uke'
    ? `${formatDate(currentWeek)} – ${formatDate(addDays(currentWeek, 51 * 7 + 4))}`
    : `${monthLabel(SIX_MONTHS_18[0])} – ${monthLabel(SIX_MONTHS_18[17])}`;

  function prosjektColor(pid) {
    if (!pid) return '#6b7280';
    const p = state.prosjekter.find(p => p.id === pid);
    if (p?.farge) return p.farge;
    const idx = state.prosjekter.findIndex(p => p.id === pid);
    return FALLBACK_COLORS[Math.max(0, idx) % FALLBACK_COLORS.length];
  }

  // Bar-posisjon i gantt (fungerer for alle tre moduser)
  function getBarPos(startDato, sluttDato) {
    const days = ganttDays;
    const n    = days.length;
    let si = -1, ei = -1;
    for (let i = 0; i < n; i++) {
      const hit = ganttUnit === 'month'
        ? overlaps(startDato, sluttDato, days[i], monthEnd(days[i]))
        : (days[i] >= startDato && days[i] <= sluttDato);
      if (hit) { if (si === -1) si = i; ei = i; }
    }
    if (si === -1) return null;
    return {
      left:  `${(si / n) * 100}%`,
      width: `${((ei - si + 1) / n) * 100}%`,
    };
  }

  // ──────────────────────────────────────────────
  // UKESPLAN – gantt-hjelpefunksjoner
  // ──────────────────────────────────────────────
  function openNewPlan(ansattId, dato) {
    setEditPlan(null);
    const start = dato || currentWeek;
    setPlanForm({
      ansattId:   ansattId || (rorleggere[0]?.id || ''),
      modus:      'prosjekt',
      prosjektId: state.prosjekter[0]?.id || '',
      fritekst:   '',
      startDato:  start,
      sluttDato:  addDays(start, 4),
    });
    setShowPlanModal(true);
  }

  function openEditPlan(p) {
    setEditPlan(p);
    setPlanForm({
      ansattId:   p.ansattId,
      modus:      p.fritekst ? 'fritekst' : 'prosjekt',
      prosjektId: p.prosjektId || '',
      fritekst:   p.fritekst  || '',
      startDato:  p.startDato,
      sluttDato:  p.sluttDato,
    });
    setShowPlanModal(true);
  }

  function handleSavePlan() {
    const jobOk = planForm.modus === 'fritekst' ? !!planForm.fritekst.trim() : !!planForm.prosjektId;
    if (!planForm.ansattId || !jobOk || !planForm.startDato || !planForm.sluttDato) return;
    if (planForm.startDato > planForm.sluttDato) return;
    const payload = {
      ansattId:   planForm.ansattId,
      prosjektId: planForm.modus === 'prosjekt' ? planForm.prosjektId : '',
      fritekst:   planForm.modus === 'fritekst' ? planForm.fritekst.trim() : '',
      startDato:  planForm.startDato,
      sluttDato:  planForm.sluttDato,
    };
    dispatch({ type: editPlan ? 'UPDATE_ROR_PLAN' : 'ADD_ROR_PLAN',
               payload: editPlan ? { ...editPlan, ...payload } : payload });
    setShowPlanModal(false);
  }

  function handleDeletePlan(id) {
    if (window.confirm('Slett plan?')) {
      dispatch({ type: 'DELETE_ROR_PLAN', id });
      setShowPlanModal(false);
    }
  }

  // ──────────────────────────────────────────────
  // TIMEPLAN – hjelpefunksjoner
  // ──────────────────────────────────────────────
  function openNew(ansattId, dato) {
    setEditTimer(null);
    setForm({
      ansattId: ansattId || (rorleggere[0]?.id || ''),
      modus: 'prosjekt', prosjektId: state.prosjekter[0]?.id || '',
      fritekst: '', kontakt: '', telefon: '', adresse: '',
      dato: dato || today, startTid: '08:00', sluttTid: '12:00', notat: '',
    });
    setShowModal(true);
  }

  function openEdit(t) {
    setEditTimer(t);
    setForm({
      ansattId:   t.ansattId,
      modus:      t.fritekst ? 'fritekst' : 'prosjekt',
      prosjektId: t.prosjektId || '',
      fritekst:   t.fritekst  || '',
      kontakt:    t.kontakt   || '',
      telefon:    t.telefon   || '',
      adresse:    t.adresse   || '',
      dato: t.dato, startTid: t.startTid, sluttTid: t.sluttTid, notat: t.notat || '',
    });
    setShowModal(true);
  }

  function handleSave() {
    const jobOk = form.modus === 'fritekst' ? !!form.fritekst.trim() : !!form.prosjektId;
    if (!form.ansattId || !jobOk || !form.dato || !form.startTid || !form.sluttTid) return;
    if (form.startTid >= form.sluttTid) return;
    const payload = {
      ansattId:   form.ansattId,
      prosjektId: form.modus === 'prosjekt' ? form.prosjektId : '',
      fritekst:   form.modus === 'fritekst' ? form.fritekst.trim() : '',
      kontakt:    form.modus === 'fritekst' ? form.kontakt.trim() : '',
      telefon:    form.modus === 'fritekst' ? form.telefon.trim() : '',
      adresse:    form.adresse.trim(),
      dato: form.dato, startTid: form.startTid, sluttTid: form.sluttTid, notat: form.notat,
    };
    dispatch({ type: editTimer ? 'UPDATE_ROR_TIMER' : 'ADD_ROR_TIMER',
               payload: editTimer ? { ...editTimer, ...payload } : payload });
    setShowModal(false);
  }

  function handleDelete(id) {
    if (window.confirm('Slett oppdraget?')) {
      dispatch({ type: 'DELETE_ROR_TIMER', id });
      setShowModal(false);
    }
  }

  function getTimerBarStyle(startTid, sluttTid, row = 0, totalRows = 1) {
    const s     = tidToDecimal(startTid), e = tidToDecimal(sluttTid);
    const cS    = Math.max(DAY_START_H, Math.min(DAY_END_H, s));
    const cE    = Math.max(DAY_START_H, Math.min(DAY_END_H, e));
    const rowH  = 100 / totalRows;
    return {
      left:   `${((cS - DAY_START_H) / DAY_HOURS) * 100}%`,
      width:  `${Math.max(0, ((cE - cS) / DAY_HOURS) * 100)}%`,
      top:    `${row * rowH}%`,
      height: `${rowH}%`,
    };
  }

  function layoutBars(timers) {
    const sorted = [...timers].sort((a, b) => a.startTid.localeCompare(b.startTid));
    const rows   = [];
    const assigned = sorted.map(t => {
      const tS = tidToDecimal(t.startTid), tE = tidToDecimal(t.sluttTid);
      let row = 0;
      while (rows[row] !== undefined && rows[row] > tS) row++;
      rows[row] = tE;
      return { ...t, row };
    });
    return { bars: assigned, totalRows: Math.max(1, rows.length) };
  }

  const hourTicks = Array.from({ length: DAY_HOURS + 1 }, (_, i) => DAY_START_H + i);

  // ──────────────────────────────────────────────
  // Gantt-header per modus
  // ──────────────────────────────────────────────
  function GanttHeader() {
    const days = ganttDays;
    const n    = days.length;

    if (ukeMode === 'maaned') {
      return (
        <>
          <div className="uke-header-cell"></div>
          {days.map(m => (
            <div key={m}
              className={`uke-header-cell${m.slice(0, 7) === today.slice(0, 7) ? ' today' : ''}`}
              style={{ fontSize: 11, padding: '4px 2px', textAlign: 'center' }}>
              <div style={{ fontWeight: 500 }}>{monthLabel(m)}</div>
            </div>
          ))}
        </>
      );
    }

    // dag & uke: viser dager
    return (
      <>
        <div className="uke-header-cell"></div>
        {days.map((dag, i) => {
          const hol        = HOLIDAYS[dag];
          const dow        = new Date(dag + 'T00:00:00').getDay(); // 1=Man…5=Fre
          const isMonday   = dow === 1;
          const weekNum    = getWeekNumber(dag);
          const isCurWeek  = weekStart(dag) === weekStart(today);
          return (
            <div key={dag}
              className={`uke-header-cell${dag === today ? ' today' : ''}${isMonday ? ' week-start-col' : ''}${hol ? ' holiday-header' : ''}`}
              style={{ fontSize: 11, padding: '4px 2px', textAlign: 'center' }}
              title={hol || undefined}>
              {isMonday && (
                <div style={{ fontSize: 10, fontWeight: 500, color: isCurWeek ? '#2563eb' : '#5d6b80', lineHeight: 1.2 }}>
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

  // ──────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────
  return (
    <div>

      {/* ── FELLES NAVIGASJON ── */}
      <div className="uke-nav">
        <button className="btn" onClick={handlePrev}>← Forrige</button>
        <div className="uke-label">{navLabel}</div>
        <button className="btn" onClick={handleToday}>I dag</button>
        <button className="btn" onClick={handleNext}>Neste →</button>

        {/* Modus-toggle identisk med Bemanningsplan */}
        <div className="ukemode-toggle">
          <button className={`ukemode-btn${ukeMode === 'dag'    ? ' active' : ''}`} onClick={() => setUkeMode('dag')}>Dager</button>
          <button className={`ukemode-btn${ukeMode === 'uke'    ? ' active' : ''}`} onClick={() => setUkeMode('uke')}>Uker</button>
          <button className={`ukemode-btn${ukeMode === 'maaned' ? ' active' : ''}`} onClick={() => setUkeMode('maaned')}>Måneder</button>
        </div>

        <button className="btn no-print"
          style={{ marginLeft: 8, background: '#0e7490', color: 'white' }}
          onClick={() => openNewPlan()}>+ Plan</button>
        <button className="btn no-print"
          style={{ background: '#6d28d9', color: 'white' }}
          onClick={() => openNew()}>+ Oppdrag</button>
      </div>

      {rorleggere.length === 0 && (
        <div className="empty">Ingen ansatte med fag «Rørlegger» registrert. Legg til under Ansatte-fanen.</div>
      )}

      {/* ══════════════════════════════════════════
          UKESPLAN  —  identisk med Bemanningsplan
          ══════════════════════════════════════════ */}
      <div className="uke-grid-wrap" style={{ marginBottom: 0 }}>
        <div className="uke-grid"
          style={{ gridTemplateColumns: `180px repeat(${ganttDays.length}, 1fr)` }}>

          <GanttHeader />

          {rorleggere.map(ansatt => {
            const viewEnd   = ukeMode === 'maaned' ? monthEnd(ganttDays[ganttDays.length - 1]) : ganttDays[ganttDays.length - 1];
            const rowPlaner = (state.rorPlaner || []).filter(p =>
              p.ansattId === ansatt.id && overlaps(p.startDato, p.sluttDato, ganttDays[0], viewEnd)
            );
            // rorTimer vises bare i dag/uke-modus (enkeltdager)
            const rowTimer = ukeMode !== 'maaned'
              ? (state.rorTimer || []).filter(t =>
                  t.ansattId === ansatt.id &&
                  t.dato >= ganttDays[0] && t.dato <= ganttDays[ganttDays.length - 1]
                )
              : [];
            // Befaringer der denne rørleggeren er ansvarlig
            const rowBefaringer = (state.befaringer || []).filter(b => {
              if (b.prosjektlederId !== ansatt.id) return false;
              if (ukeMode === 'maaned') return b.dato >= ganttDays[0] && b.dato <= monthEnd(ganttDays[ganttDays.length - 1]);
              return b.dato >= ganttDays[0] && b.dato <= ganttDays[ganttDays.length - 1];
            });

            return (
              <React.Fragment key={ansatt.id}>
                <div className="uke-row-label">
                  <div className="mini-avatar" style={{ background: '#0e7490' }}>
                    {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="row-navn">{ansatt.navn}</div>
                    <div className="row-fag" style={{ color: '#0e7490' }}>Rørlegger</div>
                  </div>
                </div>

                <div className="gantt-row" style={{ gridColumn: '2 / -1' }}
                  onClick={e => {
                    if (e.target === e.currentTarget || e.target.classList.contains('gantt-bg-cell')) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const idx  = Math.min(ganttDays.length - 1, Math.max(0,
                        Math.floor((e.clientX - rect.left) / (rect.width / ganttDays.length))
                      ));
                      const d = ganttDays[idx];
                      openNewPlan(ansatt.id, ukeMode === 'maaned' ? d : d);
                    }
                  }}
                >
                  {/* Bakgrunnsceller */}
                  {ganttDays.map((d, i) => {
                    const isMonday  = ukeMode !== 'maaned' && new Date(d + 'T00:00:00').getDay() === 1;
                    const isToday   = ukeMode === 'maaned'
                      ? d.slice(0, 7) === today.slice(0, 7)
                      : d === today;
                    const isHol     = ukeMode !== 'maaned' && !!HOLIDAYS[d];
                    return (
                      <div key={d}
                        className={`gantt-bg-cell${isToday ? ' today-col' : ''}${isMonday ? ' week-start-col' : ''}${isHol ? ' holiday-col' : ''}`}
                        style={{ left: `${(i / ganttDays.length) * 100}%`, width: `${100 / ganttDays.length}%` }}
                      />
                    );
                  })}

                  {/* rorPlaner-barer */}
                  {rowPlaner.map(plan => {
                    const pos = getBarPos(plan.startDato, plan.sluttDato);
                    if (!pos) return null;
                    const jobNavn = plan.fritekst || state.prosjekter.find(p => p.id === plan.prosjektId)?.navn || '?';
                    return (
                      <div key={plan.id}
                        className="gantt-bar"
                        style={{ left: pos.left, width: pos.width, background: prosjektColor(plan.prosjektId) }}
                        title={`${jobNavn} · ${formatDate(plan.startDato)} – ${formatDate(plan.sluttDato)}`}
                        onClick={e => { e.stopPropagation(); openEditPlan(plan); }}
                      >
                        <span className="gantt-label">{jobNavn}</span>
                        <div className="gantt-actions">
                          <button onClick={e => { e.stopPropagation(); handleDeletePlan(plan.id); }} title="Slett"><Ikon ikon={X} size={12} /></button>
                        </div>
                      </div>
                    );
                  })}

                  {/* rorTimer-chips (vises i dag/uke-modus) */}
                  {rowTimer.map(t => {
                    const dayIdx = ganttDays.indexOf(t.dato);
                    if (dayIdx === -1) return null;
                    const n       = ganttDays.length;
                    const jobNavn = t.fritekst || state.prosjekter.find(p => p.id === t.prosjektId)?.navn || '?';
                    return (
                      <div key={t.id}
                        style={{
                          position: 'absolute',
                          left:   `calc(${(dayIdx / n) * 100}% + 3px)`,
                          width:  `calc(${(1 / n) * 100}% - 6px)`,
                          bottom: 3, height: 16,
                          background:   prosjektColor(t.prosjektId),
                          opacity:      0.85,
                          borderRadius: 3,
                          fontSize: 9, color: 'white', fontWeight: 500,
                          display: 'flex', alignItems: 'center', padding: '0 4px',
                          overflow: 'hidden', whiteSpace: 'nowrap',
                          zIndex: 2, cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        }}
                        title={`${jobNavn}: ${t.startTid}–${t.sluttTid}${t.adresse ? '\n' + t.adresse : ''}`}
                        onClick={e => { e.stopPropagation(); openEdit(t); }}
                      >
                        {t.startTid}–{t.sluttTid}
                      </div>
                    );
                  })}

                  {/* Befaring-chips */}
                  {rowBefaringer.map(b => {
                    const farge = befaringFarge(b.status);
                    const n     = ganttDays.length;
                    let chipIdx;
                    if (ukeMode === 'maaned') {
                      chipIdx = ganttDays.findIndex(m => b.dato.slice(0, 7) === m.slice(0, 7));
                    } else {
                      chipIdx = ganttDays.indexOf(b.dato);
                    }
                    if (chipIdx === -1) return null;
                    return (
                      <div key={b.id + '-bef'}
                        style={{
                          position: 'absolute',
                          left:   `calc(${(chipIdx / n) * 100}% + 3px)`,
                          width:  `calc(${(1 / n) * 100}% - 6px)`,
                          top: 3, height: 16,
                          background:   farge,
                          borderRadius: 3,
                          fontSize: 9, color: 'white', fontWeight: 500,
                          display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px',
                          overflow: 'hidden', whiteSpace: 'nowrap',
                          zIndex: 3, cursor: 'default',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        }}
                        title={`Befaring\n${b.kontaktNavn} — ${b.adresse}\n${b.dato}${b.tid ? ' kl. ' + b.tid : ''}${b.jobbType ? '\nType: ' + b.jobbType : ''}${b.notat ? '\n' + b.notat : ''}`}
                      >
                        <Ikon ikon={Search} size={10} /> {b.tid || ''}
                      </div>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#5d6b80', margin: '4px 0 20px' }}>
        Klikk i gantten for å legge til plan. Klikk på bar for å redigere.
        {ukeMode === 'dag' && ' Timeoppgaver vises som chips nederst.'}
      </div>

      {/* ══════════════════════════════════════════
          TIMEPLAN  —  daglig timefordeling 07–17
          (alltid gjeldende uke, synkronisert)
          ══════════════════════════════════════════ */}
      <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#475569', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ background: '#6d28d9', color: 'white', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>TIMEPLAN</span>
        Daglig timefordeling 07–17 — Uke {getWeekNumber(currentWeek)}
      </h3>

      <div className="ror-grid-wrap">
        <table className="ror-table">
          <thead>
            <tr>
              <th className="ror-th-name">Rørlegger</th>
              {weekDays.map((d, i) => {
                const hol = HOLIDAYS[d];
                return (
                  <th key={d} className={`ror-th-day${d === today ? ' ror-today' : ''}${hol ? ' holiday-header' : ''}`}>
                    <div style={{ fontWeight: 500 }}>{DAG_NAVN[i]}</div>
                    <div style={{ fontSize: 11, color: '#5d6b80' }}>{d.slice(8)}.{d.slice(5, 7)}</div>
                    {hol && <div style={{ fontSize: 10, color: '#dc2626' }}>{hol}</div>}
                  </th>
                );
              })}
            </tr>
            <tr>
              <td className="ror-ruler-label">
                <span style={{ fontSize: 10, color: '#5d6b80' }}>07 – 17</span>
              </td>
              {weekDays.map(d => (
                <td key={d} className="ror-ruler-cell">
                  <div className="ror-ruler">
                    {hourTicks.map(h => (
                      <div key={h} className="ror-tick" style={{ left: `${((h - DAY_START_H) / DAY_HOURS) * 100}%` }}>
                        {h % 2 === 0 && <span className="ror-tick-label">{h}</span>}
                      </div>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {rorleggere.map(ansatt => (
              <tr key={ansatt.id} className="ror-tr">
                <td className="ror-td-name">
                  <div className="mini-avatar" style={{ background: '#0e7490', width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
                    {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ marginLeft: 6 }}>
                    <div className="row-navn" style={{ fontSize: 13 }}>{ansatt.navn}</div>
                  </div>
                </td>
                {weekDays.map(dato => {
                  const dayTimers = (state.rorTimer || []).filter(t => t.ansattId === ansatt.id && t.dato === dato);
                  const dayBef    = (state.befaringer || []).filter(b => b.prosjektlederId === ansatt.id && b.dato === dato && b.tid);
                  // Kombiner rorTimer og befaringer i layout (befaringer er 1 time)
                  const allBars   = [
                    ...dayTimers.map(t => ({ ...t, _type: 'timer' })),
                    ...dayBef.map(b => ({ ...b, _type: 'befaring', startTid: b.tid, sluttTid: tidPluss1t(b.tid) })),
                  ];
                  const { bars, totalRows } = layoutBars(allBars);
                  const cellHeight          = Math.max(44, totalRows * 28);
                  return (
                    <td key={dato}
                      className={`ror-td-day${dato === today ? ' ror-today' : ''}`}
                      style={{ height: cellHeight + 8 }}
                      onClick={() => openNew(ansatt.id, dato)}
                    >
                      <div className="ror-timeline" style={{ height: cellHeight }}>
                        {hourTicks.map(h => (
                          <div key={h} className="ror-hour-line" style={{ left: `${((h - DAY_START_H) / DAY_HOURS) * 100}%` }} />
                        ))}
                        {bars.map(t => {
                          if (t._type === 'befaring') {
                            const farge = befaringFarge(t.status);
                            return (
                              <div key={t.id + '-bef'}
                                className="ror-bar"
                                style={{ ...getTimerBarStyle(t.startTid, t.sluttTid, t.row, totalRows), background: farge, opacity: 0.9, backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.15) 4px,rgba(255,255,255,0.15) 8px)' }}
                                title={`Befaring\n${t.kontaktNavn} — ${t.adresse}\nkl. ${t.tid}${t.jobbType ? '\nType: ' + t.jobbType : ''}${t.notat ? '\n' + t.notat : ''}`}
                                onClick={e => e.stopPropagation()}
                              >
                                <span className="ror-bar-label"><Ikon ikon={Search} size={10} style={{ marginRight: 2 }} />{t.tid}</span>
                                <span className="ror-bar-prosjekt">{t.kontaktNavn || t.adresse}</span>
                              </div>
                            );
                          }
                          const jobNavn = t.fritekst || state.prosjekter.find(pr => pr.id === t.prosjektId)?.navn || '?';
                          return (
                            <div key={t.id}
                              className="ror-bar"
                              style={{ ...getTimerBarStyle(t.startTid, t.sluttTid, t.row, totalRows), background: prosjektColor(t.prosjektId) }}
                              title={[jobNavn, t.adresse, t.kontakt, t.telefon, `${t.startTid}–${t.sluttTid}`, t.notat].filter(Boolean).join('\n')}
                              onClick={e => { e.stopPropagation(); openEdit(t); }}
                            >
                              <span className="ror-bar-label">{t.startTid}–{t.sluttTid}</span>
                              <span className="ror-bar-prosjekt">{jobNavn}</span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: '#5d6b80' }}>
        Klikk på en celle for å legge til timeoppgave. Klikk på bar for å redigere.
        <span style={{ marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 14, height: 10, background: '#3b82f6', borderRadius: 2, backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,0.25) 3px,rgba(255,255,255,0.25) 6px)' }} />
          = Befaring (redigeres under Befaring-fanen)
        </span>
      </div>

      {/* ══════════════════════════════════════════
          BEFARINGER  —  kort-oversikt per rørlegger
          ══════════════════════════════════════════ */}
      {(() => {
        // Alle befaringer tilhørende rørleggerne på denne siden
        const rorIds = new Set(rorleggere.map(r => r.id));
        const mineBef = (state.befaringer || []).filter(b => rorIds.has(b.prosjektlederId));
        if (mineBef.length === 0) return null;

        return (
          <div style={{ marginTop: 28 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#475569', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#3b82f6', color: 'white', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>BEFARINGER</span>
              Befaringsoversikt for rørleggere
            </h3>

            {rorleggere.map(ansatt => {
              const bef = (state.befaringer || [])
                .filter(b => b.prosjektlederId === ansatt.id && b.status !== 'tapt')
                .sort((a, b) => (a.dato || '').localeCompare(b.dato || ''));
              if (bef.length === 0) return null;

              return (
                <div key={ansatt.id} style={{ marginBottom: 20 }}>
                  {/* Rørlegger-navn som seksjonstittel */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 10, paddingBottom: 6,
                    borderBottom: '2px solid #e2e8f0',
                  }}>
                    <div className="mini-avatar" style={{ background: '#0e7490', width: 26, height: 26, fontSize: 10, flexShrink: 0 }}>
                      {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 500, fontSize: 14, color: '#0f172a' }}>{ansatt.navn}</span>
                    <span style={{ fontSize: 12, color: '#5d6b80' }}>{bef.length} befaring{bef.length !== 1 ? 'er' : ''}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                    {bef.map(b => {
                      const s           = BEF_STATUS[b.status] || BEF_STATUS.planlagt;
                      const fristDager  = dagerTil(b.tilbudFrist);
                      const fristFarge  = fristDager !== null ? (fristDager < 0 ? '#dc2626' : fristDager <= 3 ? '#b45309' : '#15803d') : null;
                      const kontDager   = dagerTil(b.nesteKontakt);
                      const kontFarge   = kontDager  !== null ? (kontDager  < 0 ? '#dc2626' : kontDager  <= 2 ? '#b45309' : '#5d6b80') : '#5d6b80';
                      const belopVis    = b.estimertBelop
                        ? new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Number(b.estimertBelop)) + ' kr'
                        : null;

                      return (
                        <div key={b.id} className="bef-k-kort" style={{ cursor: 'default' }}>
                          {/* Topp: adresse + status */}
                          <div className="bef-k-kort-topp">
                            <div style={{ minWidth: 0 }}>
                              <div className="bef-k-navn">{b.adresse}</div>
                              <div className="bef-k-adresse">{b.kontaktNavn}</div>
                              {(b.telefon || b.epost) && (
                                <div className="bef-k-kontakt">
                                  {b.telefon && <a href={`tel:${b.telefon}`} className="bef-k-kontakt-link"><Ikon ikon={Phone} size={12} style={{ marginRight: 3 }} />{b.telefon}</a>}
                                  {b.epost   && <a href={`mailto:${b.epost}`} className="bef-k-kontakt-link"><Ikon ikon={Mail} size={12} style={{ marginRight: 3 }} />{b.epost}</a>}
                                </div>
                              )}
                            </div>
                            <span className="bef-k-status-pill" style={{ background: s.bg, color: s.farge, whiteSpace: 'nowrap' }}>
                              <Ikon ikon={s.ikon} size={12} style={{ marginRight: 4 }} />{s.label}
                            </span>
                          </div>

                          {/* Chips */}
                          <div className="bef-k-chips">
                            {b.jobbType && <span className="bef-k-chip">{b.jobbType}</span>}
                            {b.dato && (
                              <span className="bef-k-chip bef-k-chip--dato">
                                <Ikon ikon={CalendarDays} size={12} style={{ marginRight: 3 }} />{datoKort(b.dato)}{b.tid ? ` kl. ${b.tid}` : ''}
                              </span>
                            )}
                            {belopVis && <span className="bef-k-chip bef-k-chip--belop">{belopVis}</span>}
                          </div>

                          {/* Datoer og kommentar */}
                          <div className="bef-k-datoer">
                            {b.tilbudFrist && (
                              <span className="bef-k-dato-rad" style={{ color: fristFarge }}>
                                <Ikon ikon={Clock} size={12} style={{ marginRight: 3 }} />Tilbudsfrist: {datoKort(b.tilbudFrist)}
                                {fristDager !== null && <em> ({fristDager < 0 ? `${Math.abs(fristDager)}d over` : fristDager === 0 ? 'i dag' : `${fristDager}d`})</em>}
                              </span>
                            )}
                            {b.nesteKontakt && (
                              <span className="bef-k-dato-rad" style={{ color: kontFarge, fontWeight: kontDager !== null && kontDager <= 2 ? 500 : 400 }}>
                                <Ikon ikon={PhoneCall} size={12} style={{ marginRight: 3 }} />Neste kontakt: {datoKort(b.nesteKontakt)}
                                {kontDager !== null && kontDager <= 2 && (
                                  <em> ({kontDager < 0 ? `${Math.abs(kontDager)}d over` : kontDager === 0 ? 'i dag!' : `${kontDager}d`})</em>
                                )}
                              </span>
                            )}
                            {b.oensketOppstart && (
                              <span className="bef-k-dato-rad" style={{ color: '#0891b2', fontWeight: 500 }}>
                                <Ikon ikon={Rocket} size={12} style={{ marginRight: 3 }} />Ønsket oppstart: {datoKort(b.oensketOppstart)}
                              </span>
                            )}
                            {b.resultat && (
                              <span className="bef-k-dato-rad bef-k-resultat"><Ikon ikon={FilePen} size={12} style={{ marginRight: 3 }} />{b.resultat}</span>
                            )}
                            {b.kommentar && (
                              <span className="bef-k-dato-rad bef-k-kommentar">
                                <Ikon ikon={MessageSquare} size={12} style={{ marginRight: 3 }} />{b.kommentar.length > 80 ? b.kommentar.slice(0, 80) + '…' : b.kommentar}
                              </span>
                            )}
                          </div>

                          {/* Status-dropdown — kan endre status direkte */}
                          <div className="bef-k-status-bytte">
                            <select
                              className="bef-k-status-select"
                              value={b.status}
                              onChange={e => dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, status: e.target.value } })}
                            >
                              {Object.entries(BEF_STATUS).map(([key, sv]) => (
                                <option key={key} value={key}>{sv.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ══ PLAN-MODAL (ukesplan) ══ */}
      {showPlanModal && (
        <div className="modal-backdrop" onClick={() => setShowPlanModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editPlan ? 'Rediger plan' : 'Ny plan'}</h3>
              <button className="btn-icon" onClick={() => setShowPlanModal(false)}><Ikon ikon={X} size={16} /></button>
            </div>

            <div className="form-group">
              <label>Rørlegger</label>
              <select value={planForm.ansattId} onChange={e => setPlanForm(f => ({ ...f, ansattId: e.target.value }))}>
                {rorleggere.map(a => <option key={a.id} value={a.id}>{a.navn}</option>)}
                {state.ansatte.filter(a => a.fag !== 'Rørlegger').length > 0 && (
                  <><option disabled>──────────</option>
                    {[...state.ansatte].filter(a => a.fag !== 'Rørlegger').sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(a => (
                      <option key={a.id} value={a.id}>{a.navn} ({a.fag})</option>
                    ))}</>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Prosjekt / oppdrag</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {['prosjekt', 'fritekst'].map(m => (
                  <button key={m} type="button" className="btn"
                    style={{ flex: 1, background: planForm.modus === m ? '#2563eb' : '', color: planForm.modus === m ? 'white' : '', fontSize: 13 }}
                    onClick={() => setPlanForm(f => ({ ...f, modus: m }))}>
                    {m === 'prosjekt' ? 'Fra prosjektliste' : 'Fri tekst'}
                  </button>
                ))}
              </div>
              {planForm.modus === 'prosjekt'
                ? <select value={planForm.prosjektId} onChange={e => setPlanForm(f => ({ ...f, prosjektId: e.target.value }))}>
                    {[...state.prosjekter].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(p => <option key={p.id} value={p.id}>{p.navn}</option>)}
                  </select>
                : <input type="text" placeholder="Beskriv oppdraget" value={planForm.fritekst} autoFocus
                    onChange={e => setPlanForm(f => ({ ...f, fritekst: e.target.value }))} />
              }
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Fra dato</label>
                <input type="date" value={planForm.startDato}
                  onChange={e => setPlanForm(f => ({ ...f, startDato: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Til dato</label>
                <input type="date" value={planForm.sluttDato}
                  onChange={e => setPlanForm(f => ({ ...f, sluttDato: e.target.value }))} />
              </div>
            </div>
            {planForm.startDato && planForm.sluttDato && planForm.startDato > planForm.sluttDato && (
              <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>Sluttdato må være etter startdato</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={handleSavePlan}
                disabled={!planForm.ansattId || (planForm.modus === 'prosjekt' ? !planForm.prosjektId : !planForm.fritekst.trim()) || !planForm.startDato || !planForm.sluttDato || planForm.startDato > planForm.sluttDato}>
                {editPlan ? 'Lagre endringer' : 'Legg til'}
              </button>
              {editPlan && (
                <button className="btn" style={{ color: '#dc2626', borderColor: '#fecaca' }}
                  onClick={() => handleDeletePlan(editPlan.id)}>Slett</button>
              )}
              <button className="btn" onClick={() => setShowPlanModal(false)}>Avbryt</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TIMEGRID-MODAL (oppdrag) ══ */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editTimer ? 'Rediger oppdrag' : 'Nytt oppdrag'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><Ikon ikon={X} size={16} /></button>
            </div>

            <div className="form-group">
              <label>Rørlegger</label>
              <select value={form.ansattId} onChange={e => setForm(f => ({ ...f, ansattId: e.target.value }))}>
                {rorleggere.map(a => <option key={a.id} value={a.id}>{a.navn}</option>)}
                {state.ansatte.filter(a => a.fag !== 'Rørlegger').length > 0 && (
                  <><option disabled>──────────</option>
                    {[...state.ansatte].filter(a => a.fag !== 'Rørlegger').sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(a => (
                      <option key={a.id} value={a.id}>{a.navn} ({a.fag})</option>
                    ))}</>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Prosjekt / oppdrag</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {['prosjekt', 'fritekst'].map(m => (
                  <button key={m} type="button" className="btn"
                    style={{ flex: 1, background: form.modus === m ? '#2563eb' : '', color: form.modus === m ? 'white' : '', fontSize: 13 }}
                    onClick={() => setForm(f => ({ ...f, modus: m }))}>
                    {m === 'prosjekt' ? 'Fra prosjektliste' : 'Fri tekst'}
                  </button>
                ))}
              </div>
              {form.modus === 'prosjekt'
                ? <select value={form.prosjektId} onChange={e => setForm(f => ({ ...f, prosjektId: e.target.value }))}>
                    {[...state.prosjekter].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(p => <option key={p.id} value={p.id}>{p.navn}</option>)}
                  </select>
                : <input type="text" placeholder="Kort jobbtittel, f.eks. «Bytte varmtvannsbereder»"
                    value={form.fritekst} autoFocus
                    onChange={e => setForm(f => ({ ...f, fritekst: e.target.value }))} />
              }
            </div>

            {form.modus === 'fritekst' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Kontaktperson</label>
                  <input type="text" placeholder="Navn på kunde / kontakt"
                    value={form.kontakt} onChange={e => setForm(f => ({ ...f, kontakt: e.target.value }))} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Telefon</label>
                  <input type="tel" placeholder="Mobilnummer"
                    value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Adresse</label>
              <input type="text" placeholder="Arbeidsstedsadresse"
                value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} />
            </div>

            <div className="form-group">
              <label>Dato</label>
              <input type="date" value={form.dato}
                onChange={e => setForm(f => ({ ...f, dato: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Fra kl.</label>
                <input type="time" value={form.startTid} step="900"
                  onChange={e => setForm(f => ({ ...f, startTid: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Til kl.</label>
                <input type="time" value={form.sluttTid} step="900"
                  onChange={e => setForm(f => ({ ...f, sluttTid: e.target.value }))} />
              </div>
            </div>

            {form.startTid && form.sluttTid && form.startTid < form.sluttTid && (
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                Varighet: {Math.round((tidToDecimal(form.sluttTid) - tidToDecimal(form.startTid)) * 10) / 10} timer
              </div>
            )}
            {form.startTid >= form.sluttTid && form.startTid && form.sluttTid && (
              <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>Sluttid må være etter starttid</div>
            )}

            <div className="form-group">
              <label>Beskrivelse / notat</label>
              <textarea rows={4} placeholder="Beskriv jobben, hva som trengs, spesielle hensyn osv."
                value={form.notat} onChange={e => setForm(f => ({ ...f, notat: e.target.value }))}
                style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 14 }} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={handleSave}
                disabled={!form.ansattId || (form.modus === 'prosjekt' ? !form.prosjektId : !form.fritekst.trim()) || !form.dato || form.startTid >= form.sluttTid}>
                {editTimer ? 'Lagre endringer' : 'Legg til'}
              </button>
              {editTimer && (
                <button className="btn" style={{ color: '#dc2626', borderColor: '#fecaca' }}
                  onClick={() => handleDelete(editTimer.id)}>Slett</button>
              )}
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
