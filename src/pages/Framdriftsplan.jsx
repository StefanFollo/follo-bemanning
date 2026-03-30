import { useState, useRef, useLayoutEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, weekStart, addDays, dateToIso, isoToDate, overlaps } from '../store';
import { getHolidayMap } from '../holidays';

const FAG_COLORS = {
  'Bas Tømrer': '#f59e0b', 'Montør': '#3b82f6', 'Lærling Tømrer': '#16a34a',
  'Maler': '#ec4899', 'Rørlegger': '#06b6d4', 'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316', 'Prosjekt Leder': '#0ea5e9', 'Prosjektleder': '#0ea5e9',
};
function fagColor(fag) { return FAG_COLORS[fag] || '#6b7280'; }

function progressColor(pct) {
  if (pct >= 80) return '#16a34a';
  if (pct >= 40) return '#2563eb';
  return '#dc2626';
}

const DAG_NAVN = ['Man', 'Tir', 'Ons', 'Tor', 'Fre'];
const MAANED_NAVN = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'];

function monthStart(iso) { return iso.slice(0,7) + '-01'; }
function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return dateToIso(d).slice(0,7) + '-01';
}
function monthEnd(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + 1); d.setDate(0);
  return dateToIso(d);
}
function monthLabel(iso) {
  return MAANED_NAVN[parseInt(iso.slice(5,7),10)-1] + ' ' + iso.slice(0,4);
}
function getWeekNumber(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay()+6)%7));
  const w = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d-w)/86400000 - 3 + ((w.getDay()+6)%7))/7);
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

const EMPTY_OPPGAVE = { navn: '', fag: '', fremgang: 0, startDato: '', sluttDato: '' };

export default function Framdriftsplan() {
  const { state, dispatch } = useApp();
  const [selectedProsjekt, setSelectedProsjekt] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingOppgave, setEditingOppgave] = useState(null);
  const [oppgaveForm, setOppgaveForm] = useState(EMPTY_OPPGAVE);
  const [ukeMode, setUkeMode] = useState('uke'); // 'dag' | 'uke' | 'maaned'
  const [currentWeek, setCurrentWeek] = useState(() => weekStart(dateToIso(new Date())));
  const [currentMonth, setCurrentMonth] = useState(() => monthStart(dateToIso(new Date())));
  const dragRef = useRef(null);
  const scrollRef = useRef(null);
  const scrollSave = useRef(null);

  const today = dateToIso(new Date());
  const thisYear = new Date().getFullYear();
  const HOLIDAYS = getHolidayMap(thisYear - 1, thisYear + 2);

  const prosjekt = state.prosjekter.find(p => p.id === selectedProsjekt) || state.prosjekter[0];
  const prosjektOppgaver = prosjekt ? state.oppgaver.filter(o => o.prosjektId === prosjekt.id) : [];
  const totalFremgang = prosjektOppgaver.length
    ? Math.round(prosjektOppgaver.reduce((s, o) => s + (o.fremgang || 0), 0) / prosjektOppgaver.length)
    : 0;
  const fagGrupper = state.fag.map(fag => ({
    fag, oppgaver: prosjektOppgaver.filter(o => o.fag === fag),
  })).filter(g => g.oppgaver.length > 0);
  const uklassifiserte = prosjektOppgaver.filter(o => !state.fag.includes(o.fag));

  // --- Scroll restore ---
  useLayoutEffect(() => {
    if (!scrollSave.current) return;
    const { top, left } = scrollSave.current;
    scrollSave.current = null;
    if (scrollRef.current) { scrollRef.current.scrollTop = top; scrollRef.current.scrollLeft = left; }
  });

  function dispatchKeepScroll(action) {
    if (scrollRef.current) scrollSave.current = { top: scrollRef.current.scrollTop, left: scrollRef.current.scrollLeft };
    dispatch(action);
  }

  // --- Dag-modus kolonner (26 uker × 5 dager) ---
  const dagDays = Array.from({ length: 26 * 7 }, (_, i) => addDays(currentWeek, i))
    .filter(d => { const dow = new Date(d + 'T00:00:00').getDay(); return dow >= 1 && dow <= 5; });

  // --- Uke-modus (26 uker × 5 dager) ---
  const ukeDays = [];
  for (let w = 0; w < 26; w++) for (let d = 0; d < 5; d++) ukeDays.push(addDays(currentWeek, w*7+d));

  // --- Måned-modus (18 måneder) ---
  const maaneder = Array.from({ length: 18 }, (_, i) => addMonths(currentMonth, i));

  const days = ukeMode === 'dag' ? dagDays : ukeMode === 'uke' ? ukeDays : maaneder;
  const viewStart = days[0];
  const viewEnd = ukeMode === 'maaned' ? monthEnd(days[days.length-1]) : days[days.length-1];

  function prevPeriode() {
    if (ukeMode === 'maaned') setCurrentMonth(m => addMonths(m, -3));
    else setCurrentWeek(w => addDays(w, -7*4));
  }
  function nextPeriode() {
    if (ukeMode === 'maaned') setCurrentMonth(m => addMonths(m, 3));
    else setCurrentWeek(w => addDays(w, 7*4));
  }
  function gotoPeriode() {
    setCurrentWeek(weekStart(today));
    setCurrentMonth(monthStart(today));
  }

  const navLabel = ukeMode === 'maaned'
    ? `${monthLabel(maaneder[0])} – ${monthLabel(maaneder[17])}`
    : `${formatDate(days[0])} – ${formatDate(days[days.length-1])}`;

  // --- Bar position ---
  function getBarPos(startDato, sluttDato) {
    const n = days.length;
    let si = -1, ei = -1;
    for (let i = 0; i < n; i++) {
      const hit = ukeMode === 'maaned'
        ? overlaps(startDato, sluttDato, days[i], monthEnd(days[i]))
        : (days[i] >= startDato && days[i] <= sluttDato);
      if (hit) { if (si < 0) si = i; ei = i; }
    }
    if (si < 0) return null;
    const pct = 100 / n;
    return { left: `${si * pct}%`, width: `${(ei - si + 1) * pct}%` };
  }

  // --- Drag handlers ---
  function handleDragStart(e, oppgave, type) {
    e.stopPropagation();
    dragRef.current = { oppgaveId: oppgave.id, type, startDato: oppgave.startDato, sluttDato: oppgave.sluttDato };
  }

  function getIdxFromEvent(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.min(days.length-1, Math.max(0, Math.floor(x / (rect.width / days.length))));
  }

  function handleDrop(e, dayOrMonth) {
    e.preventDefault();
    if (!dragRef.current) return;
    const { oppgaveId, type, startDato, sluttDato } = dragRef.current;
    const oppgave = state.oppgaver.find(o => o.id === oppgaveId);
    if (!oppgave) return;
    const idx = getIdxFromEvent(e);
    const targetDay = ukeMode === 'maaned' ? days[idx] : days[idx];

    let newStart = startDato, newEnd = sluttDato;
    if (type === 'move') {
      const len = ukeMode === 'maaned'
        ? Math.round((new Date(sluttDato+'T00:00:00') - new Date(startDato+'T00:00:00')) / 86400000)
        : Math.max(0, days.indexOf(sluttDato) - days.indexOf(startDato));
      newStart = targetDay;
      newEnd = ukeMode === 'maaned' ? addDays(targetDay, len) : (days[Math.min(days.length-1, idx+len)] || targetDay);
    } else if (type === 'start') {
      newStart = targetDay <= sluttDato ? targetDay : sluttDato;
    } else if (type === 'end') {
      newEnd = targetDay >= startDato ? targetDay : startDato;
    }

    dispatchKeepScroll({ type: 'UPDATE_OPPGAVE', payload: { ...oppgave, startDato: newStart, sluttDato: newEnd } });
    dragRef.current = null;
  }

  // --- CRUD ---
  function openAddOppgave() {
    setEditingOppgave(null);
    const defaultStart = prosjekt?.startDato || today;
    const defaultEnd = prosjekt?.sluttDato || addDays(today, 14);
    setOppgaveForm({ ...EMPTY_OPPGAVE, fag: state.fag[0] || '', startDato: defaultStart, sluttDato: defaultEnd });
    setShowModal(true);
  }
  function openEditOppgave(o) {
    setEditingOppgave(o);
    setOppgaveForm({ ...o });
    setShowModal(true);
  }
  function handleSaveOppgave() {
    if (!oppgaveForm.navn.trim() || !prosjekt) return;
    if (editingOppgave) {
      dispatch({ type: 'UPDATE_OPPGAVE', payload: { ...oppgaveForm, id: editingOppgave.id } });
    } else {
      dispatch({ type: 'ADD_OPPGAVE', payload: { ...oppgaveForm, prosjektId: prosjekt.id } });
    }
    setShowModal(false);
  }
  function handleDeleteOppgave(id) {
    if (confirm('Slett oppgaven?')) dispatch({ type: 'DELETE_OPPGAVE', id });
  }
  function handleFremgangChange(oppgave, val) {
    dispatch({ type: 'UPDATE_OPPGAVE', payload: { ...oppgave, fremgang: Number(val) } });
  }

  // --- Gantt grid ---
  function GanttHeader() {
    if (ukeMode === 'maaned') {
      return <>
        <div className="fd-row-label" />
        {maaneder.map(m => {
          const erIMnd = m.slice(0,7) === today.slice(0,7);
          return <div key={m} className={`fd-header-cell ${erIMnd ? 'fd-today-col' : ''}`}>{monthLabel(m)}</div>;
        })}
      </>;
    }
    if (ukeMode === 'uke') {
      return <>
        <div className="fd-row-label" />
        {ukeDays.map((d, i) => {
          const isMonday = i % 5 === 0;
          const weekIdx = Math.floor(i / 5);
          const isToday = d === today;
          const hol = HOLIDAYS[d];
          return (
            <div key={d} className={`fd-header-cell ${isToday ? 'fd-today-col' : ''} ${isMonday ? 'fd-week-start' : ''} ${hol ? 'holiday-header' : ''}`}
              style={{ fontSize: 10, padding: '3px 1px', textAlign: 'center' }} title={hol || undefined}>
              {isMonday && <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8' }}>U{getWeekNumber(ukeDays[weekIdx*5])}</div>}
              <div style={{ fontWeight: isMonday ? 700 : 400 }}>{DAG_NAVN[i%5]}</div>
              <div style={{ fontSize: 9, color: '#94a3b8' }}>{d.slice(8)}.{d.slice(5,7)}</div>
            </div>
          );
        })};
      </>;
    }
    // dag-modus
    return <>
      <div className="fd-row-label" />
      {dagDays.map((d, i) => {
        const dow = new Date(d+'T00:00:00').getDay();
        const isMonday = dow === 1;
        const isToday = d === today;
        const hol = HOLIDAYS[d];
        return (
          <div key={d} className={`fd-header-cell ${isToday ? 'fd-today-col' : ''} ${isMonday ? 'fd-week-start' : ''} ${hol ? 'holiday-header' : ''}`}
            style={{ fontSize: 10, textAlign: 'center' }} title={hol || undefined}>
            {isMonday && <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8' }}>U{getWeekNumber(d)}</div>}
            <div>{DAG_NAVN[dow-1]}</div>
            <div style={{ fontSize: 9, color: '#94a3b8' }}>{d.slice(8)}.{d.slice(5,7)}</div>
          </div>
        );
      })}
    </>;
  }

  function GanttRow({ oppgave }) {
    const color = fagColor(oppgave.fag);
    const pos = oppgave.startDato && oppgave.sluttDato ? getBarPos(oppgave.startDato, oppgave.sluttDato) : null;
    const pct = oppgave.fremgang || 0;

    return (
      <div className="fd-gantt-row"
        onDragOver={e => e.preventDefault()}
        onDrop={e => handleDrop(e, null)}
      >
        {/* Today line */}
        {(() => {
          const ti = days.indexOf(today);
          if (ti < 0) return null;
          return <div className="fd-today-line" style={{ left: `${(ti / days.length) * 100}%` }} />;
        })()}

        {pos && (
          <div
            className="fd-bar"
            style={{ left: pos.left, width: pos.width, background: color }}
            draggable
            onDragStart={e => handleDragStart(e, oppgave, 'move')}
            title={`${oppgave.navn} · ${formatDate(oppgave.startDato)} – ${formatDate(oppgave.sluttDato)}`}
          >
            {/* Progress fill */}
            <div className="fd-bar-progress" style={{ width: pct + '%', background: 'rgba(255,255,255,0.35)' }} />
            {/* Left handle */}
            <div className="fd-handle fd-handle-l" draggable onDragStart={e => { e.stopPropagation(); handleDragStart(e, oppgave, 'start'); }}>◂</div>
            <span className="fd-bar-label">{oppgave.navn} {pct > 0 ? `${pct}%` : ''}</span>
            {/* Right handle */}
            <div className="fd-handle fd-handle-r" draggable onDragStart={e => { e.stopPropagation(); handleDragStart(e, oppgave, 'end'); }}>▸</div>
          </div>
        )}
        {!pos && (
          <div className="fd-bar-ingen" title="Ingen datoer satt – rediger oppgaven">
            Ingen datoer
          </div>
        )}
      </div>
    );
  }

  const cols = days.length;
  const gridTemplate = `150px repeat(${cols}, minmax(${ukeMode === 'maaned' ? 60 : ukeMode === 'uke' ? 28 : 36}px, 1fr))`;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Framdriftsplan</h2>
        {prosjekt && <button className="btn btn-primary" onClick={openAddOppgave}>+ Ny oppgave</button>}
      </div>

      {/* Prosjekt-tabs */}
      <div className="fd-prosjekt-tabs">
        {state.prosjekter.map(p => {
          const opp = state.oppgaver.filter(o => o.prosjektId === p.id);
          const fr = opp.length ? Math.round(opp.reduce((s,o) => s+(o.fremgang||0),0)/opp.length) : null;
          const isActive = prosjekt?.id === p.id;
          return (
            <button key={p.id}
              className={`fd-prosjekt-tab ${isActive ? 'active' : ''}`}
              style={isActive ? { borderBottom: `3px solid ${p.farge || '#2563eb'}` } : {}}
              onClick={() => setSelectedProsjekt(p.id)}
            >
              <span className="fd-tab-navn">{p.navn}</span>
              {fr !== null && <span className="fd-tab-pct" style={{ color: progressColor(fr) }}>{fr}%</span>}
            </button>
          );
        })}
      </div>

      {!prosjekt ? (
        <div className="empty">Ingen prosjekter registrert.</div>
      ) : (
        <>
          {/* Total fremgang */}
          <div className="fd-total-wrap">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{prosjekt.navn}</span>
              {prosjekt.startDato && <span style={{ color: '#64748b', fontSize: 13 }}>{formatDate(prosjekt.startDato)} – {formatDate(prosjekt.sluttDato)}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <div className="progress-bar big-bar" style={{ flex: 1 }}>
                <div className="progress-fill" style={{ width: totalFremgang + '%', background: progressColor(totalFremgang) }} />
              </div>
              <span style={{ fontWeight: 800, fontSize: 18, color: progressColor(totalFremgang), minWidth: 48 }}>{totalFremgang}%</span>
            </div>
          </div>

          {/* Tidslinje-navigasjon */}
          <div className="uke-nav" style={{ marginTop: 16 }}>
            <button className="btn" onClick={prevPeriode}>← Forrige</button>
            <div className="uke-label">{navLabel}</div>
            <button className="btn" onClick={gotoPeriode}>I dag</button>
            <button className="btn" onClick={nextPeriode}>Neste →</button>
            <div className="ukemode-toggle">
              <button className={`ukemode-btn ${ukeMode==='dag'?'active':''}`} onClick={() => setUkeMode('dag')}>Dager</button>
              <button className={`ukemode-btn ${ukeMode==='uke'?'active':''}`} onClick={() => setUkeMode('uke')}>Uker</button>
              <button className={`ukemode-btn ${ukeMode==='maaned'?'active':''}`} onClick={() => setUkeMode('maaned')}>Måneder</button>
            </div>
          </div>

          {/* Gantt grid */}
          {prosjektOppgaver.length === 0 ? (
            <div className="empty" style={{ marginTop: 24 }}>Ingen oppgaver. Klikk "+ Ny oppgave" for å legge til.</div>
          ) : (
            <div className="fd-grid-wrap" ref={scrollRef}>
              <div className="fd-grid" style={{ gridTemplateColumns: gridTemplate }}>
                {/* Header */}
                <GanttHeader />

                {/* Rader gruppert per fag */}
                {fagGrupper.map(({ fag, oppgaver }) => (
                  <>
                    <div key={fag + '-hdr'} className="fd-fag-header" style={{ gridColumn: '1 / -1', borderLeft: `4px solid ${fagColor(fag)}` }}>
                      <span className="fag-dot-lg" style={{ background: fagColor(fag) }} />
                      <span>{fag}</span>
                      <span style={{ color: fagColor(fag), fontWeight: 700, marginLeft: 'auto' }}>
                        {Math.round(oppgaver.reduce((s,o) => s+(o.fremgang||0), 0)/oppgaver.length)}%
                      </span>
                    </div>
                    {oppgaver.map(o => (
                      <>
                        <div key={o.id+'-lbl'} className="fd-row-label">
                          <span className="fd-oppgave-navn">{o.navn}</span>
                          <button className="btn btn-sm" style={{ padding: '1px 6px', fontSize: 11 }} onClick={() => openEditOppgave(o)}>✎</button>
                        </div>
                        <GanttRow key={o.id} oppgave={o} />
                      </>
                    ))}
                  </>
                ))}
                {uklassifiserte.map(o => (
                  <>
                    <div key={o.id+'-lbl'} className="fd-row-label">
                      <span className="fd-oppgave-navn">{o.navn}</span>
                      <button className="btn btn-sm" style={{ padding: '1px 6px', fontSize: 11 }} onClick={() => openEditOppgave(o)}>✎</button>
                    </div>
                    <GanttRow key={o.id} oppgave={o} />
                  </>
                ))}
              </div>
            </div>
          )}

          {/* Fremdriftssliders */}
          {prosjektOppgaver.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h4 style={{ marginBottom: 14, fontSize: 14, color: '#475569' }}>Oppdater fremdrift</h4>
              {fagGrupper.map(({ fag, oppgaver }) => (
                <div key={fag} className="fag-gruppe">
                  <div className="fag-gruppe-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="fag-dot-lg" style={{ background: fagColor(fag) }} />
                      <span className="fag-gruppe-navn">{fag}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="progress-bar" style={{ width: 100 }}>
                        <div className="progress-fill" style={{ width: Math.round(oppgaver.reduce((s,o) => s+(o.fremgang||0),0)/oppgaver.length) + '%', background: fagColor(fag) }} />
                      </div>
                      <span style={{ color: fagColor(fag), fontWeight: 600, minWidth: 38 }}>
                        {Math.round(oppgaver.reduce((s,o) => s+(o.fremgang||0),0)/oppgaver.length)}%
                      </span>
                    </div>
                  </div>
                  {oppgaver.map(o => (
                    <div key={o.id} className="oppgave-row">
                      <div className="oppgave-navn">{o.navn}</div>
                      <div className="oppgave-slider-wrap">
                        <input type="range" min={0} max={100} step={5}
                          value={o.fremgang || 0}
                          onChange={e => handleFremgangChange(o, e.target.value)}
                          className="oppgave-slider"
                          style={{ '--pct': (o.fremgang||0)+'%', '--color': fagColor(o.fag) }}
                        />
                        <span className="oppgave-pct">{o.fremgang || 0}%</span>
                      </div>
                      <div className="oppgave-actions">
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteOppgave(o.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {uklassifiserte.length > 0 && (
                <div className="fag-gruppe">
                  <div className="fag-gruppe-header"><span className="fag-gruppe-navn" style={{ color: '#6b7280' }}>Andre</span></div>
                  {uklassifiserte.map(o => (
                    <div key={o.id} className="oppgave-row">
                      <div className="oppgave-navn">{o.navn}</div>
                      <div className="oppgave-slider-wrap">
                        <input type="range" min={0} max={100} step={5}
                          value={o.fremgang || 0}
                          onChange={e => handleFremgangChange(o, e.target.value)}
                          className="oppgave-slider"
                        />
                        <span className="oppgave-pct">{o.fremgang || 0}%</span>
                      </div>
                      <div className="oppgave-actions">
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteOppgave(o.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {showModal && prosjekt && (
        <Modal title={editingOppgave ? 'Rediger oppgave' : 'Ny oppgave'} onClose={() => setShowModal(false)}>
          <div className="form">
            <label>Oppgavenavn *</label>
            <input value={oppgaveForm.navn} onChange={e => setOppgaveForm(f => ({ ...f, navn: e.target.value }))} placeholder="Beskriv oppgaven" />

            <label>Fag</label>
            <select value={oppgaveForm.fag} onChange={e => setOppgaveForm(f => ({ ...f, fag: e.target.value }))}>
              {state.fag.map(f => <option key={f} value={f}>{f}</option>)}
            </select>

            <div className="form-row">
              <div>
                <label>Startdato</label>
                <input type="date" value={oppgaveForm.startDato} onChange={e => setOppgaveForm(f => ({ ...f, startDato: e.target.value }))} />
              </div>
              <div>
                <label>Sluttdato</label>
                <input type="date" value={oppgaveForm.sluttDato} onChange={e => setOppgaveForm(f => ({ ...f, sluttDato: e.target.value }))} />
              </div>
            </div>

            <label>Fremdrift: {oppgaveForm.fremgang}%</label>
            <input type="range" min={0} max={100} step={5}
              value={oppgaveForm.fremgang}
              onChange={e => setOppgaveForm(f => ({ ...f, fremgang: Number(e.target.value) }))}
            />

            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button className="btn btn-primary" onClick={handleSaveOppgave}>Lagre</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
