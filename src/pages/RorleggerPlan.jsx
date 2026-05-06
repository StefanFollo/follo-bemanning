import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { weekStart, addDays, isoToDate, dateToIso, formatDate, overlaps } from '../store';
import { getHolidayMap } from '../holidays';

const DAG_NAVN = ['Man', 'Tir', 'Ons', 'Tor', 'Fre'];
const DAG_NAVN_FULL = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const PLAN_DAY_W = 44; // px per dag i ukesplan-gantt
const MAANED_NAVN = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];
const DAY_START_H = 7;   // 07:00
const DAY_END_H = 17;    // 17:00
const DAY_HOURS = DAY_END_H - DAY_START_H;

const FALLBACK_COLORS = ['#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#be185d','#854d0e'];

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

export default function RorleggerPlan() {
  const { state, dispatch } = useApp();
  const today = dateToIso(new Date());
  const thisYear = new Date().getFullYear();
  const HOLIDAYS = getHolidayMap(thisYear - 1, thisYear + 2);

  const [currentWeek, setCurrentWeek] = useState(() => weekStart(today));
  const [planWeek, setPlanWeek] = useState(() => weekStart(today));

  // Ukesplan (bemanningsplan-stil) state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [planForm, setPlanForm] = useState({
    ansattId: '',
    modus: 'prosjekt',
    prosjektId: '',
    fritekst: '',
    startDato: '',
    sluttDato: '',
  });

  const [showModal, setShowModal] = useState(false);
  const [editTimer, setEditTimer] = useState(null); // null = new, object = edit
  const [form, setForm] = useState({
    ansattId: '',
    modus: 'prosjekt', // 'prosjekt' | 'fritekst'
    prosjektId: '',
    fritekst: '',
    kontakt: '',
    telefon: '',
    adresse: '',
    dato: '',
    startTid: '08:00',
    sluttTid: '12:00',
    notat: '',
  });

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(currentWeek, i));

  const rorleggere = state.ansatte.filter(a => a.fag === 'Rørlegger');

  function prosjektColor(pid) {
    if (!pid) return '#6b7280';
    const p = state.prosjekter.find(p => p.id === pid);
    if (p?.farge) return p.farge;
    const idx = state.prosjekter.findIndex(p => p.id === pid);
    return FALLBACK_COLORS[Math.max(0, idx) % FALLBACK_COLORS.length];
  }

  function openNew(ansattId, dato) {
    setEditTimer(null);
    setForm({
      ansattId: ansattId || (rorleggere[0]?.id || ''),
      modus: 'prosjekt',
      prosjektId: state.prosjekter[0]?.id || '',
      fritekst: '',
      kontakt: '',
      telefon: '',
      adresse: '',
      dato: dato || today,
      startTid: '08:00',
      sluttTid: '12:00',
      notat: '',
    });
    setShowModal(true);
  }

  function openEdit(t) {
    setEditTimer(t);
    setForm({
      ansattId: t.ansattId,
      modus: t.fritekst ? 'fritekst' : 'prosjekt',
      prosjektId: t.prosjektId || '',
      fritekst: t.fritekst || '',
      kontakt: t.kontakt || '',
      telefon: t.telefon || '',
      adresse: t.adresse || '',
      dato: t.dato,
      startTid: t.startTid,
      sluttTid: t.sluttTid,
      notat: t.notat || '',
    });
    setShowModal(true);
  }

  function handleSave() {
    const jobOk = form.modus === 'fritekst' ? !!form.fritekst.trim() : !!form.prosjektId;
    if (!form.ansattId || !jobOk || !form.dato || !form.startTid || !form.sluttTid) return;
    if (form.startTid >= form.sluttTid) return;
    const payload = {
      ansattId: form.ansattId,
      prosjektId: form.modus === 'prosjekt' ? form.prosjektId : '',
      fritekst: form.modus === 'fritekst' ? form.fritekst.trim() : '',
      kontakt: form.modus === 'fritekst' ? form.kontakt.trim() : '',
      telefon: form.modus === 'fritekst' ? form.telefon.trim() : '',
      adresse: form.adresse.trim(),
      dato: form.dato,
      startTid: form.startTid,
      sluttTid: form.sluttTid,
      notat: form.notat,
    };
    if (editTimer) {
      dispatch({ type: 'UPDATE_ROR_TIMER', payload: { ...editTimer, ...payload } });
    } else {
      dispatch({ type: 'ADD_ROR_TIMER', payload });
    }
    setShowModal(false);
  }

  function handleDelete(id) {
    if (window.confirm(`Slett oppdraget?`)) {
      dispatch({ type: 'DELETE_ROR_TIMER', id });
    }
  }

  // --- Ukesplan (gantt) ---
  const planDays = Array.from({ length: 14 }, (_, i) => addDays(planWeek, i))
    .filter(d => { const dow = new Date(d + 'T00:00:00').getDay(); return dow >= 1 && dow <= 5; });

  function planNavLabel() {
    const w1 = getWeekNumber(planDays[0]);
    const w2 = getWeekNumber(planDays[planDays.length - 1]);
    return `Uke ${w1}–${w2}`;
  }

  function openNewPlan(ansattId, dato) {
    setEditPlan(null);
    const start = dato || planWeek;
    const end = dato ? addDays(dato, 4) : addDays(planWeek, 4);
    setPlanForm({
      ansattId: ansattId || (rorleggere[0]?.id || ''),
      modus: 'prosjekt',
      prosjektId: state.prosjekter[0]?.id || '',
      fritekst: '',
      startDato: start,
      sluttDato: end,
    });
    setShowPlanModal(true);
  }

  function openEditPlan(p) {
    setEditPlan(p);
    setPlanForm({
      ansattId: p.ansattId,
      modus: p.fritekst ? 'fritekst' : 'prosjekt',
      prosjektId: p.prosjektId || '',
      fritekst: p.fritekst || '',
      startDato: p.startDato,
      sluttDato: p.sluttDato,
    });
    setShowPlanModal(true);
  }

  function handleSavePlan() {
    const jobOk = planForm.modus === 'fritekst' ? !!planForm.fritekst.trim() : !!planForm.prosjektId;
    if (!planForm.ansattId || !jobOk || !planForm.startDato || !planForm.sluttDato) return;
    if (planForm.startDato > planForm.sluttDato) return;
    const payload = {
      ansattId: planForm.ansattId,
      prosjektId: planForm.modus === 'prosjekt' ? planForm.prosjektId : '',
      fritekst: planForm.modus === 'fritekst' ? planForm.fritekst.trim() : '',
      startDato: planForm.startDato,
      sluttDato: planForm.sluttDato,
    };
    if (editPlan) {
      dispatch({ type: 'UPDATE_ROR_PLAN', payload: { ...editPlan, ...payload } });
    } else {
      dispatch({ type: 'ADD_ROR_PLAN', payload });
    }
    setShowPlanModal(false);
  }

  function handleDeletePlan(id) {
    if (window.confirm('Slett plan?')) {
      dispatch({ type: 'DELETE_ROR_PLAN', id });
      setShowPlanModal(false);
    }
  }

  // Beregn bar-posisjon i gantt (returnerer null hvis utenfor synlig område)
  function planBarStyle(plan) {
    const startIdx = planDays.findIndex(d => d >= plan.startDato);
    let endIdx = -1;
    for (let i = planDays.length - 1; i >= 0; i--) {
      if (planDays[i] <= plan.sluttDato) { endIdx = i; break; }
    }
    if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return null;
    return {
      position: 'absolute',
      left: startIdx * PLAN_DAY_W + 3,
      width: (endIdx - startIdx + 1) * PLAN_DAY_W - 6,
      top: 5, height: 30,
      borderRadius: 5,
      zIndex: 1,
      cursor: 'pointer',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', padding: '0 8px',
      color: 'white', fontSize: 12, fontWeight: 600,
      whiteSpace: 'nowrap',
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    };
  }

  // Bar positioning within the day timeline
  function getBarStyle(startTid, sluttTid, row = 0, totalRows = 1) {
    const s = tidToDecimal(startTid);
    const e = tidToDecimal(sluttTid);
    const clampedS = Math.max(DAY_START_H, Math.min(DAY_END_H, s));
    const clampedE = Math.max(DAY_START_H, Math.min(DAY_END_H, e));
    const left = ((clampedS - DAY_START_H) / DAY_HOURS) * 100;
    const width = ((clampedE - clampedS) / DAY_HOURS) * 100;
    const rowH = 100 / totalRows;
    const top = row * rowH;
    return {
      left: `${left}%`,
      width: `${Math.max(0, width)}%`,
      top: `${top}%`,
      height: `${rowH}%`,
    };
  }

  // Stack overlapping bars vertically in a cell
  function layoutBars(timers) {
    // Sort by start time
    const sorted = [...timers].sort((a, b) => a.startTid.localeCompare(b.startTid));
    // Assign rows to avoid overlap
    const rows = [];
    const assigned = sorted.map(t => {
      const tS = tidToDecimal(t.startTid);
      const tE = tidToDecimal(t.sluttTid);
      let row = 0;
      while (rows[row] !== undefined && rows[row] > tS) row++;
      rows[row] = tE;
      return { ...t, row };
    });
    const totalRows = Math.max(1, rows.length);
    return { bars: assigned, totalRows };
  }

  const navLabel = `Uke ${getWeekNumber(currentWeek)}: ${formatDate(currentWeek)} – ${formatDate(addDays(currentWeek, 4))}`;

  const hourTicks = Array.from({ length: DAY_HOURS + 1 }, (_, i) => DAY_START_H + i);

  return (
    <div>

      {/* ===== UKESPLAN (Bemanningsplan-stil) ===== */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15, color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: '#06b6d4', color: 'white', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>UKESPLAN</span>
          Planlegging over dager / uker
        </h3>

        <div className="uke-nav">
          <button className="btn" onClick={() => setPlanWeek(w => addDays(w, -7))}>← Forrige</button>
          <div className="uke-label">{planNavLabel()}</div>
          <button className="btn" onClick={() => setPlanWeek(weekStart(today))}>I dag</button>
          <button className="btn" onClick={() => setPlanWeek(w => addDays(w, 7))}>Neste →</button>
          <button className="btn no-print" style={{ marginLeft: 12, background: '#06b6d4', color: 'white' }}
            onClick={() => openNewPlan()}>+ Legg til plan</button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="ror-table" style={{ tableLayout: 'fixed', minWidth: 180 + planDays.length * PLAN_DAY_W }}>
            <thead>
              <tr>
                <th style={{ width: 180 }}></th>
                {/* Uke-overskrifter */}
                {(() => {
                  const weeks = [];
                  let curWn = null, count = 0, keyD = null;
                  planDays.forEach((d, i) => {
                    const wn = getWeekNumber(d);
                    if (wn !== curWn) {
                      if (curWn !== null) weeks.push({ label: `Uke ${curWn}`, count, key: keyD });
                      curWn = wn; count = 1; keyD = d;
                    } else { count++; }
                    if (i === planDays.length - 1) weeks.push({ label: `Uke ${wn}`, count, key: d });
                  });
                  return weeks.map(w => (
                    <th key={w.key} colSpan={w.count}
                      style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, background: '#f1f5f9', padding: '3px 0', color: '#475569' }}>
                      {w.label}
                    </th>
                  ));
                })()}
              </tr>
              <tr>
                <th className="ror-th-name">Rørlegger</th>
                {planDays.map(d => {
                  const isToday = d === today;
                  const hol = HOLIDAYS[d];
                  const dow = new Date(d + 'T00:00:00').getDay();
                  return (
                    <th key={d} style={{
                      width: PLAN_DAY_W, fontSize: 11, fontWeight: 600, textAlign: 'center',
                      background: isToday ? '#dbeafe' : hol ? '#fef2f2' : '',
                      color: hol ? '#dc2626' : '#64748b', padding: '3px 2px',
                    }}>
                      {DAG_NAVN[dow - 1]}<br />{d.slice(8)}.{d.slice(5, 7)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rorleggere.length === 0 && (
                <tr><td colSpan={planDays.length + 1} className="empty">Ingen rørleggere registrert.</td></tr>
              )}
              {rorleggere.map(ansatt => {
                const rowPlaner = (state.rorPlaner || []).filter(p =>
                  p.ansattId === ansatt.id &&
                  overlaps(p.startDato, p.sluttDato, planDays[0], planDays[planDays.length - 1])
                );
                return (
                  <tr key={ansatt.id}>
                    <td className="ror-td-name">
                      <div className="mini-avatar" style={{ background: '#06b6d4', width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
                        {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ marginLeft: 6, fontSize: 13 }}>{ansatt.navn}</div>
                    </td>
                    <td colSpan={planDays.length} style={{ padding: 0, position: 'relative', height: 40 }}>
                      {/* Klikkbare dag-celler bak barene */}
                      <div style={{ display: 'flex', height: '100%', position: 'absolute', inset: 0 }}>
                        {planDays.map(d => (
                          <div key={d}
                            style={{ flex: `0 0 ${PLAN_DAY_W}px`, cursor: 'pointer', borderLeft: '1px solid #e2e8f0', background: d === today ? '#eff6ff66' : '' }}
                            onClick={() => openNewPlan(ansatt.id, d)}
                          />
                        ))}
                      </div>
                      {/* Plan-barer */}
                      {rowPlaner.map(plan => {
                        const bs = planBarStyle(plan);
                        if (!bs) return null;
                        const jobNavn = plan.fritekst || state.prosjekter.find(p => p.id === plan.prosjektId)?.navn || '?';
                        return (
                          <div key={plan.id}
                            style={{ ...bs, background: prosjektColor(plan.prosjektId) }}
                            title={`${jobNavn}\n${formatDate(plan.startDato)} – ${formatDate(plan.sluttDato)}`}
                            onClick={e => { e.stopPropagation(); openEditPlan(plan); }}
                          >
                            {jobNavn}
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
          Klikk på en dag for å legge til plan. Klikk på en bar for å redigere.
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '2px solid #e2e8f0', margin: '0 0 24px' }} />

      {/* ===== TIMEPLAN (daglig timevisning) ===== */}
      <h3 style={{ margin: '0 0 10px', fontSize: 15, color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ background: '#8b5cf6', color: 'white', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>TIMEPLAN</span>
        Daglig timefordeling (07–17)
      </h3>

      {/* Nav */}
      <div className="uke-nav">
        <button className="btn" onClick={() => setCurrentWeek(w => addDays(w, -7))}>← Forrige</button>
        <div className="uke-label">{navLabel}</div>
        <button className="btn" onClick={() => setCurrentWeek(weekStart(today))}>I dag</button>
        <button className="btn" onClick={() => setCurrentWeek(w => addDays(w, 7))}>Neste →</button>
        <button className="btn no-print" style={{ marginLeft: 12, background: '#06b6d4', color: 'white' }}
          onClick={() => openNew()}>+ Legg til oppdrag</button>
      </div>

      {rorleggere.length === 0 && (
        <div className="empty">Ingen ansatte med fag «Rørlegger» registrert. Legg til under Ansatte-fanen.</div>
      )}

      {/* Time grid */}
      <div className="ror-grid-wrap">
        <table className="ror-table">
          <thead>
            <tr>
              <th className="ror-th-name">Rørlegger</th>
              {weekDays.map((d, i) => {
                const isToday = d === today;
                const hol = HOLIDAYS[d];
                return (
                  <th key={d} className={`ror-th-day${isToday ? ' ror-today' : ''}${hol ? ' holiday-header' : ''}`}>
                    <div style={{ fontWeight: 700 }}>{DAG_NAVN_FULL[i]}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{d.slice(8)}.{d.slice(5, 7)}</div>
                    {hol && <div style={{ fontSize: 10, color: '#dc2626' }}>{hol}</div>}
                  </th>
                );
              })}
            </tr>
            {/* Hour ruler row */}
            <tr>
              <td className="ror-ruler-label">
                <span style={{ fontSize: 10, color: '#94a3b8' }}>07 – 17</span>
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
                  <div className="mini-avatar" style={{ background: '#06b6d4', width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
                    {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ marginLeft: 6 }}>
                    <div className="row-navn" style={{ fontSize: 13 }}>{ansatt.navn}</div>
                  </div>
                </td>
                {weekDays.map(dato => {
                  const dayTimers = (state.rorTimer || []).filter(t => t.ansattId === ansatt.id && t.dato === dato);
                  const { bars, totalRows } = layoutBars(dayTimers);
                  const cellHeight = Math.max(44, totalRows * 28);
                  const isToday = dato === today;
                  return (
                    <td key={dato}
                      className={`ror-td-day${isToday ? ' ror-today' : ''}`}
                      style={{ height: cellHeight + 8 }}
                      onClick={() => openNew(ansatt.id, dato)}
                    >
                      <div className="ror-timeline" style={{ height: cellHeight }}>
                        {/* Background hour lines */}
                        {hourTicks.map(h => (
                          <div key={h} className="ror-hour-line" style={{ left: `${((h - DAY_START_H) / DAY_HOURS) * 100}%` }} />
                        ))}
                        {/* Assignment bars */}
                        {bars.map(t => {
                          const p = state.prosjekter.find(pr => pr.id === t.prosjektId);
                          const jobNavn = t.fritekst || p?.navn || '?';
                          const barStyle = getBarStyle(t.startTid, t.sluttTid, t.row, totalRows);
                          return (
                            <div key={t.id}
                              className="ror-bar"
                              style={{ ...barStyle, background: prosjektColor(t.prosjektId) }}
                              title={[jobNavn, t.adresse, t.kontakt, t.telefon, `${t.startTid} – ${t.sluttTid}`, t.notat].filter(Boolean).join('\n')}
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

      {/* Legend */}
      <div style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
        Klikk på en celle for å legge til oppdrag. Klikk på en bar for å redigere eller slette.
      </div>

      {/* Plan-modal (ukesplan) */}
      {showPlanModal && (
        <div className="modal-backdrop" onClick={() => setShowPlanModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editPlan ? 'Rediger plan' : 'Ny plan'}</h3>
              <button className="btn-icon" onClick={() => setShowPlanModal(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Rørlegger</label>
              <select value={planForm.ansattId} onChange={e => setPlanForm(f => ({ ...f, ansattId: e.target.value }))}>
                {rorleggere.map(a => <option key={a.id} value={a.id}>{a.navn}</option>)}
                {state.ansatte.filter(a => a.fag !== 'Rørlegger').length > 0 && (
                  <>
                    <option disabled>──────────</option>
                    {state.ansatte.filter(a => a.fag !== 'Rørlegger').map(a => (
                      <option key={a.id} value={a.id}>{a.navn} ({a.fag})</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Prosjekt / oppdrag</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button type="button" className="btn"
                  style={{ flex: 1, background: planForm.modus === 'prosjekt' ? '#2563eb' : '', color: planForm.modus === 'prosjekt' ? 'white' : '', fontSize: 13 }}
                  onClick={() => setPlanForm(f => ({ ...f, modus: 'prosjekt' }))}>
                  Fra prosjektliste
                </button>
                <button type="button" className="btn"
                  style={{ flex: 1, background: planForm.modus === 'fritekst' ? '#2563eb' : '', color: planForm.modus === 'fritekst' ? 'white' : '', fontSize: 13 }}
                  onClick={() => setPlanForm(f => ({ ...f, modus: 'fritekst' }))}>
                  Fri tekst
                </button>
              </div>
              {planForm.modus === 'prosjekt' ? (
                <select value={planForm.prosjektId} onChange={e => setPlanForm(f => ({ ...f, prosjektId: e.target.value }))}>
                  {state.prosjekter.map(p => <option key={p.id} value={p.id}>{p.navn}</option>)}
                </select>
              ) : (
                <input type="text" placeholder="Beskriv oppdraget" value={planForm.fritekst} autoFocus
                  onChange={e => setPlanForm(f => ({ ...f, fritekst: e.target.value }))} />
              )}
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
                  onClick={() => handleDeletePlan(editPlan.id)}>
                  Slett
                </button>
              )}
              <button className="btn" onClick={() => setShowPlanModal(false)}>Avbryt</button>
            </div>
          </div>
        </div>
      )}

      {/* Timegrid-modal (oppdrag) */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editTimer ? 'Rediger oppdrag' : 'Nytt oppdrag'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Rørlegger</label>
              <select value={form.ansattId} onChange={e => setForm(f => ({ ...f, ansattId: e.target.value }))}>
                {rorleggere.map(a => <option key={a.id} value={a.id}>{a.navn}</option>)}
                {/* Also allow other ansatte */}
                {state.ansatte.filter(a => a.fag !== 'Rørlegger').length > 0 && (
                  <>
                    <option disabled>──────────</option>
                    {state.ansatte.filter(a => a.fag !== 'Rørlegger').map(a => (
                      <option key={a.id} value={a.id}>{a.navn} ({a.fag})</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Prosjekt / oppdrag</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1, background: form.modus === 'prosjekt' ? '#2563eb' : '', color: form.modus === 'prosjekt' ? 'white' : '', fontSize: 13 }}
                  onClick={() => setForm(f => ({ ...f, modus: 'prosjekt' }))}
                >
                  Fra prosjektliste
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1, background: form.modus === 'fritekst' ? '#2563eb' : '', color: form.modus === 'fritekst' ? 'white' : '', fontSize: 13 }}
                  onClick={() => setForm(f => ({ ...f, modus: 'fritekst' }))}
                >
                  Fri tekst
                </button>
              </div>
              {form.modus === 'prosjekt' ? (
                <select value={form.prosjektId} onChange={e => setForm(f => ({ ...f, prosjektId: e.target.value }))}>
                  {state.prosjekter.map(p => <option key={p.id} value={p.id}>{p.navn}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Kort jobbtittel, f.eks. «Bytte varmtvannsbereder»"
                  value={form.fritekst}
                  onChange={e => setForm(f => ({ ...f, fritekst: e.target.value }))}
                  autoFocus
                />
              )}
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
              <input type="date" value={form.dato} onChange={e => setForm(f => ({ ...f, dato: e.target.value }))} />
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
              <textarea
                rows={4}
                placeholder="Beskriv jobben, hva som trengs, spesielle hensyn osv."
                value={form.notat}
                onChange={e => setForm(f => ({ ...f, notat: e.target.value }))}
                style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 14 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={handleSave}
                disabled={!form.ansattId || (form.modus === 'prosjekt' ? !form.prosjektId : !form.fritekst.trim()) || !form.dato || form.startTid >= form.sluttTid}>
                {editTimer ? 'Lagre endringer' : 'Legg til'}
              </button>
              {editTimer && (
                <button className="btn" style={{ color: '#dc2626', borderColor: '#fecaca' }}
                  onClick={() => { handleDelete(editTimer.id); setShowModal(false); }}>
                  Slett
                </button>
              )}
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
