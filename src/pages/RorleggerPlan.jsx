import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { weekStart, addDays, isoToDate, dateToIso, formatDate } from '../store';
import { getHolidayMap } from '../holidays';

const DAG_NAVN = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
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
  const [showModal, setShowModal] = useState(false);
  const [editTimer, setEditTimer] = useState(null); // null = new, object = edit
  const [form, setForm] = useState({
    ansattId: '',
    modus: 'prosjekt', // 'prosjekt' | 'fritekst'
    prosjektId: '',
    fritekst: '',
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

  function handleDelete(id, navn) {
    if (window.confirm(`Slett oppdraget?`)) {
      dispatch({ type: 'DELETE_ROR_TIMER', id });
    }
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
                    <div style={{ fontWeight: 700 }}>{DAG_NAVN[i]}</div>
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
                              title={`${jobNavn}\n${t.startTid} – ${t.sluttTid}${t.notat ? '\n' + t.notat : ''}`}
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

      {/* Modal */}
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
                  placeholder="Beskriv oppdraget, f.eks. «Privat kunde – bytte varmtvannsbereder»"
                  value={form.fritekst}
                  onChange={e => setForm(f => ({ ...f, fritekst: e.target.value }))}
                  autoFocus
                />
              )}
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
              <label>Notat (valgfritt)</label>
              <input type="text" placeholder="f.eks. ta med stoppekran" value={form.notat}
                onChange={e => setForm(f => ({ ...f, notat: e.target.value }))} />
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
