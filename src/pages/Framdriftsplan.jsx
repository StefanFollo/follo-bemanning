import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { uid, mergeWithCloud } from '../store';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowWeekYear() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - w) / 86400000 - 3 + ((w.getDay() + 6) % 7)) / 7);
  return { week, year: d.getFullYear() };
}

function isoToWeekYear(iso) {
  if (!iso) return nowWeekYear();
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - w) / 86400000 - 3 + ((w.getDay() + 6) % 7)) / 7);
  return { week, year: d.getFullYear() };
}

function wkNum(bw, by, weekOffset) {
  let w = bw + weekOffset, y = by;
  while (w > 52) { w -= 52; y++; }
  while (w < 1)  { w += 52; y--; }
  return { w, y };
}

function projStartWY(proj) {
  if (proj.fdStartWeek && proj.fdStartYear)
    return { week: proj.fdStartWeek, year: proj.fdStartYear };
  return isoToWeekYear(proj.startDato || null);
}

function calcAutoProgress(tasks) {
  if (!tasks || tasks.length === 0) return 0;
  return Math.round(tasks.reduce((s, t) => s + (t.pct ?? 0), 0) / tasks.length);
}

const FAG = {
  tomrer:      { label: 'Tømrer',      color: '#185FA5' },
  flis:        { label: 'Flis / mur',  color: '#BA7517' },
  elektriker:  { label: 'Elektriker',  color: '#E24B4A' },
  rorlegger:   { label: 'Rørlegger',   color: '#0F6E56' },
  ventilasjon: { label: 'Ventilasjon', color: '#7F77DD' },
  maling:      { label: 'Maling',      color: '#D4537E' },
  ferdig:      { label: 'Ferdig',      color: '#3B6D11' },
  annet:       { label: 'Annet',       color: '#888780' },
};
const fc = k => FAG[k]?.color ?? '#888780';

const STATUS_OPTIONS = ['Ikke startet', 'Pågående', 'Forsinket', 'Ferdig'];
const STATUS_COLORS  = {
  'Ikke startet': '#64748b',
  'Pågående':     '#2563eb',
  'Forsinket':    '#dc2626',
  'Ferdig':       '#16a34a',
};

const STANDARD_FASER = [
  { name: 'Grunnarbeider',         fag: 'tomrer',     dur: 14 },
  { name: 'Råbygg / tømrerarbeid', fag: 'tomrer',     dur: 21 },
  { name: 'Tak',                   fag: 'tomrer',     dur: 7  },
  { name: 'Vinduer og dører',      fag: 'tomrer',     dur: 7  },
  { name: 'Rørlegger',             fag: 'rorlegger',  dur: 14 },
  { name: 'Elektriker',            fag: 'elektriker', dur: 14 },
  { name: 'Ventilasjon',           fag: 'ventilasjon',dur: 7  },
  { name: 'Isolasjon og gips',     fag: 'tomrer',     dur: 14 },
  { name: 'Flislegging',           fag: 'flis',       dur: 7  },
  { name: 'Maling',                fag: 'maling',     dur: 7  },
  { name: 'Ferdigstilling',        fag: 'ferdig',     dur: 7  },
];

// ─── AI regenerering ──────────────────────────────────────────────────────────

function useFramdriftAI(project, onUpdate) {
  const [laster, setLaster] = useState(false);
  const [feil, setFeil] = useState('');

  async function regenererMedAI() {
    setLaster(true); setFeil('');
    try {
      const token = localStorage.getItem('fbs_token') || '';
      const r = await fetch('/api/framdrift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ regenerer: true, prosjektId: project.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Feil ${r.status}`);
      onUpdate({
        fdTasks: data.fdTasks,
        fdStartWeek:  data.fdStartWeek  || project.fdStartWeek,
        fdStartYear:  data.fdStartYear  || project.fdStartYear,
        fdTotalWeeks: data.fdTotalWeeks || project.fdTotalWeeks,
        fdMilepaler:  data.milepaler,
        fdGenDato:    new Date().toISOString(),
        fdGenAv:      'AI',
      });
    } catch (e) { setFeil(e.message); }
    finally { setLaster(false); }
  }

  return { laster, feil, regenererMedAI };
}

// ─── GanttChart ───────────────────────────────────────────────────────────────

function GanttChart({ project, onUpdate }) {
  const [tasks, setTasks]   = useState(project.fdTasks || []);
  const [zoom, setZoom]     = useState(1);
  const [newTask, setNewTask] = useState('');
  const [newFag, setNewFag]   = useState('tomrer');
  const [dropIdx, setDropIdx] = useState(null);
  const drag       = useRef(null);
  const rowDragRef = useRef(null);
  const tasksRef   = useRef(tasks);

  useEffect(() => {
    setTasks(project.fdTasks || []);
    tasksRef.current = project.fdTasks || [];
  }, [project.id]);

  const { week: bw, year: by } = projStartWY(project);
  const totalWeeks = project.fdTotalWeeks || 12;
  const totalDays  = Math.max(
    ...(tasks.length ? tasks.map(t => t.start + t.dur) : [0]),
    totalWeeks * 7
  );

  const ROW = 38, PAD = 200;
  const chartW = Math.max(totalDays * 18, 580) * zoom;
  const dw     = chartW / totalDays;
  const svgH   = Math.max(tasks.length * ROW + 56, 80);

  const weeks = [];
  for (let d = 0; d < totalDays; d += 7) weeks.push(d);

  const yearBands = [];
  weeks.forEach(d => {
    const { y } = wkNum(bw, by, Math.round(d / 7));
    const last = yearBands[yearBands.length - 1];
    if (!last || last.y !== y) yearBands.push({ y, s: d, e: d + 7 });
    else last.e = d + 7;
  });

  const { week: nowWk, year: nowYr } = nowWeekYear();
  const noff = (nowYr * 52 + nowWk) - (by * 52 + bw);
  const nowX = (noff >= 0 && noff * 7 <= totalDays) ? noff * 7 * dw : null;

  const save = next => {
    tasksRef.current = next; setTasks(next);
    const autoPct = calcAutoProgress(next);
    onUpdate({ fdTasks: next, ...(autoPct !== null ? { fdProgress: autoPct } : {}) });
  };

  const onMouseMove = e => {
    if (!drag.current) return;
    const { tid, type, sx, os, od } = drag.current;
    const dx = Math.round((e.clientX - sx) / dw);
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== tid) return t;
        if (type === 'move')   return { ...t, start: Math.max(0, os + dx) };
        if (type === 'resize') return { ...t, dur:   Math.max(1, od + dx) };
        return t;
      });
      tasksRef.current = next; return next;
    });
  };

  const onMouseUp = () => {
    if (drag.current) {
      drag.current = null;
      const autoPct = calcAutoProgress(tasksRef.current);
      onUpdate({ fdTasks: tasksRef.current, ...(autoPct !== null ? { fdProgress: autoPct } : {}) });
    }
    if (rowDragRef.current !== null) { rowDragRef.current = null; setDropIdx(null); }
  };

  const startDrag = (e, tid, type) => {
    e.preventDefault(); e.stopPropagation();
    const t = tasks.find(t => t.id === tid);
    drag.current = { tid, type, sx: e.clientX, os: t.start, od: t.dur };
  };

  const toggleDone = (e, tid) => {
    e.stopPropagation();
    save(tasks.map(t => t.id === tid ? { ...t, pct: (t.pct ?? 0) >= 100 ? 0 : 100 } : t));
  };

  const deleteTask = id => save(tasks.filter(t => t.id !== id));

  const addTask = () => {
    if (!newTask.trim()) return;
    const end = tasks.length ? Math.max(...tasks.map(t => t.start + t.dur)) : 0;
    save([...tasks, { id: uid(), name: newTask, start: end, dur: 7, pct: 0, fag: newFag }]);
    setNewTask('');
  };

  const addStandardFaser = () => {
    const existing = new Set(tasks.map(t => t.name));
    const toAdd = STANDARD_FASER.filter(f => !existing.has(f.name));
    if (!toAdd.length) return;
    let cursor = tasks.length ? Math.max(...tasks.map(t => t.start + t.dur)) : 0;
    const newTasks = toAdd.map(f => {
      const t = { id: uid(), name: f.name, start: cursor, dur: f.dur, pct: 0, fag: f.fag };
      cursor += f.dur; return t;
    });
    save([...tasks, ...newTasks]);
  };

  return (
    <div>
      {tasks.length === 0 && (
        <div className="fd2-tom-gantt">
          <span>Ingen faser lagt til ennå.</span>
          <button className="btn btn-primary btn-sm" onClick={addStandardFaser}>
            ➕ Legg til standard byggefaser
          </button>
        </div>
      )}

      <div className="fd2-gantt-toolbar">
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Zoom:</span>
        <button className="fd2-zoom-btn" onClick={() => setZoom(z => Math.max(0.3, +(z - 0.2).toFixed(1)))}>−</button>
        <span className="fd2-zoom-pct">{Math.round(zoom * 100)}%</span>
        <button className="fd2-zoom-btn" onClick={() => setZoom(z => Math.min(4, +(z + 0.2).toFixed(1)))}>+</button>
        <button className="fd2-zoom-btn" onClick={() => setZoom(1)} style={{ fontSize: 10, width: 'auto', padding: '0 8px' }}>Reset</button>
        {tasks.length > 0 && (
          <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={addStandardFaser}>
            + Standardfaser
          </button>
        )}
        <div className="fd2-fag-legend">
          {Object.entries(FAG).filter(([k]) => k !== 'annet').map(([k, v]) => (
            <span key={k} className="fd2-fag-chip" style={{ background: v.color + '1a', color: v.color, border: `1px solid ${v.color}55` }}>
              {v.label}
            </span>
          ))}
        </div>
      </div>

      <div className="fd2-gantt-wrap">
        <div className="fd2-gantt-left" style={{ width: PAD }}>
          <svg width={PAD} height={svgH} style={{ display: 'block' }}>
            <rect x={0} y={0} width={PAD} height={40} fill="#f8fafc" />
            <text x={10} y={26} fontSize={11} fontWeight="600" fill="#64748b">Fase</text>
            <text x={PAD - 34} y={26} fontSize={10} fill="#94a3b8" textAnchor="middle">✓</text>
            {tasks.map((t, i) => {
              const y = i * ROW + 40;
              const done = (t.pct ?? 0) >= 100;
              return (
                <g key={t.id}
                  onMouseDown={() => { rowDragRef.current = i; }}
                  onMouseEnter={() => { if (rowDragRef.current !== null && rowDragRef.current !== i) setDropIdx(i); }}
                  onMouseUp={() => {
                    if (rowDragRef.current !== null && rowDragRef.current !== i) {
                      const n = [...tasks]; const [m] = n.splice(rowDragRef.current, 1); n.splice(i, 0, m); save(n);
                    }
                    rowDragRef.current = null; setDropIdx(null);
                  }}>
                  {dropIdx === i && <rect x={0} y={y} width={PAD} height={2} fill="#2563eb" />}
                  <rect x={0} y={y} width={PAD} height={ROW} fill={done ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#fafafa'} />
                  <circle cx={12} cy={y + ROW / 2} r={5} fill={fc(t.fag)} opacity={done ? 0.4 : 1} />
                  <clipPath id={`nc${t.id}`}><rect x={24} y={y} width={PAD - 64} height={ROW} /></clipPath>
                  <text x={26} y={y + ROW / 2 + 5} fontSize={12} fill={done ? '#94a3b8' : '#1e293b'}
                    style={{ userSelect: 'none', textDecoration: done ? 'line-through' : 'none' }}
                    clipPath={`url(#nc${t.id})`}>
                    {t.name.length > 18 ? t.name.slice(0, 17) + '…' : t.name}
                  </text>
                  <text x={PAD - 54} y={y + ROW / 2 + 5} fontSize={11} fill="#cbd5e1"
                    style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => deleteTask(t.id)}>✕</text>
                  <rect x={PAD - 36} y={y + ROW / 2 - 9} width={18} height={18} rx={4}
                    fill={done ? '#16a34a' : '#fff'} stroke={done ? '#16a34a' : '#e2e8f0'} strokeWidth={1.5}
                    style={{ cursor: 'pointer' }} onClick={e => toggleDone(e, t.id)} />
                  {done && (
                    <text x={PAD - 27} y={y + ROW / 2 + 5} fontSize={13} fill="#fff" textAnchor="middle"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>✓</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="fd2-gantt-right" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          <svg width={chartW} height={svgH} style={{ display: 'block', userSelect: 'none' }}>
            {yearBands.map(b => (
              <g key={b.y}>
                <rect x={b.s * dw} y={0} width={(b.e - b.s) * dw} height={20} fill={b.y % 2 === 0 ? '#f1f5f9' : '#e9eef5'} />
                <text x={b.s * dw + 6} y={14} fontSize={11} fontWeight="600" fill="#475569">{b.y}</text>
              </g>
            ))}
            {weeks.map((d, i) => {
              const { w } = wkNum(bw, by, Math.round(d / 7));
              return (
                <g key={d}>
                  <rect x={d * dw} y={40} width={7 * dw} height={svgH - 40}
                    fill={i % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'rgba(0,0,0,0.03)'} />
                  <line x1={d * dw} y1={20} x2={d * dw} y2={svgH} stroke="#e2e8f0" strokeWidth={0.5} />
                  <text x={d * dw + 4} y={33} fontSize={10} fill="#94a3b8">U{w}</text>
                </g>
              );
            })}
            {tasks.map((t, i) => {
              const x  = t.start * dw;
              const w  = Math.max(t.dur * dw - 2, 6);
              const y  = i * ROW + 40;
              const pct = t.pct ?? 0;
              const done = pct >= 100;
              const col  = fc(t.fag);
              return (
                <g key={t.id}>
                  <rect x={x} y={y + 7} width={w} height={20} rx={5} fill={col} opacity={done ? 0.2 : 0.35}
                    style={{ cursor: 'grab' }} onMouseDown={e => startDrag(e, t.id, 'move')} />
                  {w * pct / 100 > 0 && (
                    <rect x={x} y={y + 7} width={w * pct / 100} height={20} rx={5} fill={col} opacity={done ? 0.65 : 0.85}
                      style={{ pointerEvents: 'none' }} />
                  )}
                  <clipPath id={`bc${t.id}`}><rect x={x + 4} y={y + 7} width={Math.max(w - 20, 0)} height={20} /></clipPath>
                  <text x={x + 6} y={y + 21} fontSize={10} fill="white" fontWeight="600"
                    style={{ pointerEvents: 'none' }} clipPath={`url(#bc${t.id})`}>{t.name}</text>
                  {done && w > 24 && (
                    <text x={x + w / 2} y={y + 21} fontSize={12} fill="white" textAnchor="middle"
                      style={{ pointerEvents: 'none' }}>✓</text>
                  )}
                  <rect x={x + w - 6} y={y + 7} width={6} height={20} fill="rgba(0,0,0,0.15)" rx={2}
                    style={{ cursor: 'ew-resize' }} onMouseDown={e => startDrag(e, t.id, 'resize')} />
                </g>
              );
            })}
            {nowX !== null && (
              <g>
                <line x1={nowX} y1={20} x2={nowX} y2={svgH} stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3" />
                <rect x={nowX - 16} y={21} width={32} height={16} rx={4} fill="#dc2626" />
                <text x={nowX} y={33} fontSize={10} fontWeight="600" fill="white" textAnchor="middle">U{nowWk}</text>
              </g>
            )}
          </svg>
        </div>
      </div>

      <div className="fd2-add-row">
        <input value={newTask} onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="+ Ny fase (Enter for å legge til)"
          className="input" style={{ flex: 1, minWidth: 140, fontSize: 13 }} />
        <select value={newFag} onChange={e => setNewFag(e.target.value)}
          className="input" style={{ width: 130, fontSize: 13 }}>
          {Object.entries(FAG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={addTask}>Legg til</button>
      </div>

      {tasks.length > 0 && (
        <div className="fd2-progress-sum">
          <span>{tasks.filter(t => (t.pct ?? 0) >= 100).length} av {tasks.length} faser fullført</span>
          <span>·</span>
          <span>Beregnet fremdrift: <strong>{calcAutoProgress(tasks)}%</strong></span>
        </div>
      )}
    </div>
  );
}

// ─── ProjectDetail ────────────────────────────────────────────────────────────

function ProjectDetail({ project, onBack, onUpdate }) {
  const [status,   setStatus]   = useState(project.fdStatus || 'Pågående');
  const [note,     setNote]     = useState(project.fdNote || '');
  const [startWk,  setStartWk]  = useState(() => projStartWY(project).week);
  const [startYr,  setStartYr]  = useState(() => projStartWY(project).year);
  const [totalWk,  setTotalWk]  = useState(project.fdTotalWeeks || 12);
  const [aktTab,   setAktTab]   = useState('gantt');

  const { laster: aiLaster, feil: aiFeil, regenererMedAI } = useFramdriftAI(project, onUpdate);

  useEffect(() => {
    setStatus(project.fdStatus || 'Pågående');
    setNote(project.fdNote || '');
    const wy = projStartWY(project);
    setStartWk(wy.week); setStartYr(wy.year);
    setTotalWk(project.fdTotalWeeks || 12);
  }, [project.id]);

  const pct     = project.fdProgress ?? 0;
  const sc      = STATUS_COLORS[status] ?? '#2563eb';
  const harAI   = project.fdGenAv === 'AI' && Boolean(project.kildeTilbudData);
  const harData = (project.fdTasks || []).length > 0;

  return (
    <div className="fd2-detail">
      {/* Sticky header */}
      <div className="fd2-detail-header">
        <button className="btn btn-sm" onClick={onBack}>← Tilbake</button>
        <div className="fd2-detail-tittel-wrap">
          <h3 className="fd2-detail-tittel">{project.navn}</h3>
          {project.adresse && <span className="fd2-detail-adr">📍 {project.adresse}</span>}
        </div>
        <div className="fd2-detail-badges">
          {harAI && (
            <span className="fd2-kilde-badge fd2-kilde-ai">✨ AI fra tilbuds-appen</span>
          )}
          {!harAI && harData && (
            <span className="fd2-kilde-badge fd2-kilde-manuell">📋 Manuell framdrift</span>
          )}
          {project.fdGenDato && (
            <span className="fd2-kilde-badge fd2-kilde-dato">
              {new Date(project.fdGenDato).toLocaleDateString('nb-NO')}
            </span>
          )}
        </div>
      </div>

      {/* Status-rad */}
      <div className="fd2-status-rad">
        <div className="fd2-status-gruppe">
          <span className="fd2-status-label">Status</span>
          <div className="fd2-status-pills">
            {STATUS_OPTIONS.map(s => (
              <button key={s}
                className={`fd2-status-pill${status === s ? ' active' : ''}`}
                style={status === s ? { background: STATUS_COLORS[s], color: '#fff', borderColor: STATUS_COLORS[s] } : { color: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] + '66' }}
                onClick={() => { setStatus(s); onUpdate({ fdStatus: s }); }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="fd2-fremdrift-gruppe">
          <span className="fd2-status-label">Fremdrift <strong>{pct}%</strong></span>
          <div className="fd2-fremdrift-bar">
            <div className="fd2-fremdrift-fill" style={{ width: pct + '%', background: sc }} />
          </div>
        </div>

        {project.kildeTilbudData && (
          <button className="btn btn-sm fd2-ai-btn"
            onClick={regenererMedAI}
            disabled={aiLaster}>
            {aiLaster
              ? <><span className="fd2-spinner" /> Genererer…</>
              : '✨ Regenerer med AI'}
          </button>
        )}
      </div>

      {aiFeil && <div className="fd2-feil-banner">❌ {aiFeil}</div>}

      {/* Tabs */}
      <div className="fd2-tabs">
        {[
          { key: 'gantt',       label: '📊 Gantt' },
          { key: 'innstilling', label: '⚙️ Innstillinger' },
          { key: 'notater',     label: '📝 Notater' },
        ].map(tab => (
          <button key={tab.key}
            className={`fd2-tab${aktTab === tab.key ? ' active' : ''}`}
            onClick={() => setAktTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Gantt-tab */}
      {aktTab === 'gantt' && (
        <div className="fd2-tab-innhold">
          <GanttChart project={project} onUpdate={onUpdate} />

          {Array.isArray(project.fdMilepaler) && project.fdMilepaler.length > 0 && (
            <div className="fd2-milepaler">
              <div className="fd2-milepaler-tittel">📌 Milepæler</div>
              <div className="fd2-milepaler-chips">
                {project.fdMilepaler.map((m, i) => (
                  <span key={i} className="fd2-milepael-chip">
                    {m.navn}{m.dagFraStart != null ? ` · dag ${m.dagFraStart}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Innstillinger-tab */}
      {aktTab === 'innstilling' && (
        <div className="fd2-tab-innhold">
          <div className="fd2-innstilling-grid">
            <div className="fd2-innstilling-felt">
              <label className="fd2-label">Startuke</label>
              <input type="number" min={1} max={52} value={startWk} className="input"
                style={{ width: 80 }}
                onChange={e => setStartWk(Number(e.target.value))}
                onBlur={() => onUpdate({ fdStartWeek: startWk, fdStartYear: startYr })} />
            </div>
            <div className="fd2-innstilling-felt">
              <label className="fd2-label">År</label>
              <input type="number" min={2023} max={2035} value={startYr} className="input"
                style={{ width: 90 }}
                onChange={e => setStartYr(Number(e.target.value))}
                onBlur={() => onUpdate({ fdStartWeek: startWk, fdStartYear: startYr })} />
            </div>
            <div className="fd2-innstilling-felt">
              <label className="fd2-label">Totale uker</label>
              <input type="number" min={1} max={200} value={totalWk} className="input"
                style={{ width: 90 }}
                onChange={e => setTotalWk(Number(e.target.value))}
                onBlur={() => onUpdate({ fdTotalWeeks: totalWk })} />
            </div>
          </div>
          {harAI && (
            <div className="fd2-kilde-info">
              <div className="fd2-kilde-info-tittel">📦 Data fra tilbuds-appen</div>
              <div className="fd2-kilde-info-rad">
                <span>Generert:</span>
                <strong>{project.fdGenDato ? new Date(project.fdGenDato).toLocaleString('nb-NO') : '–'}</strong>
              </div>
              <div className="fd2-kilde-info-rad">
                <span>Faser:</span>
                <strong>{(project.fdTasks || []).length} stk</strong>
              </div>
              {project.kildeTilbudData?.adresse && (
                <div className="fd2-kilde-info-rad">
                  <span>Adresse:</span>
                  <strong>{project.kildeTilbudData.adresse}</strong>
                </div>
              )}
              {project.kildeTilbudData?.oppstart && (
                <div className="fd2-kilde-info-rad">
                  <span>Oppstart (fra tilbud):</span>
                  <strong>{project.kildeTilbudData.oppstart}</strong>
                </div>
              )}
              {project.kildeTilbudData?.varighet && (
                <div className="fd2-kilde-info-rad">
                  <span>Varighet (fra tilbud):</span>
                  <strong>{project.kildeTilbudData.varighet}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notater-tab */}
      {aktTab === 'notater' && (
        <div className="fd2-tab-innhold">
          <div className="fd2-notater-grid">
            <div>
              <label className="fd2-label">Avvik / merknader</label>
              <textarea rows={4} value={note} className="input"
                style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                placeholder="Beskriv avvik eller endringer…"
                onChange={e => setNote(e.target.value)}
                onBlur={() => onUpdate({ fdNote: note })} />
            </div>
            {[
              { key: 'fdNoteOrders', label: '📦 Bestillinger & leveranser', ph: 'Vinduer bestilt 10.04…' },
              { key: 'fdNoteSubs',   label: '👷 Underentreprenører',        ph: 'Rørlegger – Ola Hansen…' },
            ].map(({ key, label, ph }) => (
              <div key={key}>
                <label className="fd2-label">{label}</label>
                <textarea rows={4} value={project[key] || ''} className="input"
                  style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                  placeholder={ph}
                  onChange={e => onUpdate({ [key]: e.target.value })}
                  onBlur={e => onUpdate({ [key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ProjectCard ──────────────────────────────────────────────────────────────

function ProjectCard({ project, onSelect }) {
  const pct      = project.fdProgress ?? 0;
  const tasks    = project.fdTasks || [];
  const done     = tasks.filter(t => (t.pct ?? 0) >= 100).length;
  const status   = project.fdStatus || 'Ikke startet';
  const sc       = STATUS_COLORS[status] ?? '#64748b';
  const harAI    = project.fdGenAv === 'AI' && Boolean(project.kildeTilbudData);
  const harData  = tasks.length > 0;
  const { week } = projStartWY(project);

  return (
    <div className="fd2-card" onClick={() => onSelect(project)}
      style={{ borderTop: `3px solid ${sc}` }}>
      <div className="fd2-card-header">
        <div className="fd2-card-navn">{project.navn}</div>
        <span className="fd2-card-status" style={{ color: sc, background: sc + '15' }}>{status}</span>
      </div>
      {project.adresse && <div className="fd2-card-adr">📍 {project.adresse}</div>}

      <div className="fd2-card-badges">
        {harAI && <span className="fd2-kilde-badge fd2-kilde-ai">✨ AI fra tilbuds-appen</span>}
        {!harAI && harData && <span className="fd2-kilde-badge fd2-kilde-manuell">📋 Manuell</span>}
        {!harData && <span className="fd2-kilde-badge" style={{ color: '#94a3b8', borderColor: '#e2e8f0', background: '#f8fafc' }}>Ingen plan</span>}
        {project.fdStartWeek && (
          <span className="fd2-kilde-badge" style={{ color: '#475569', borderColor: '#e2e8f0', background: '#f8fafc' }}>
            U{week} · {project.fdTotalWeeks || '?'} uker
          </span>
        )}
      </div>

      <div className="fd2-card-progress-wrap">
        <div className="fd2-card-progress-bar">
          <div className="fd2-card-progress-fill" style={{ width: pct + '%', background: pct > 0 ? sc : '#cbd5e1' }} />
        </div>
        <span className="fd2-card-pct" style={{ color: pct > 0 ? sc : '#94a3b8' }}>{pct}%</span>
      </div>
      <div className="fd2-card-meta">
        {harData ? `${done} / ${tasks.length} faser fullført` : 'Klikk for å legge til faser'}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Framdriftsplan() {
  const { state, dispatch } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  const [filter,     setFilter]     = useState('Alle');
  const [synker,     setSynker]     = useState(false);
  const [sistSynk,   setSistSynk]   = useState(null);
  const [synkFeil,   setSynkFeil]   = useState('');

  // Force cloud sync når siden lastes
  useEffect(() => { syncFraCloud(); }, []);

  async function syncFraCloud() {
    setSynker(true);
    setSynkFeil('');
    try {
      const token = localStorage.getItem('fbs_token') || '';
      if (!token) { setSynkFeil('Ikke innlogget'); return; }
      const r = await fetch('/api/state', { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) { setSynkFeil('Innlogging utløpt – last siden på nytt'); return; }
      if (!r.ok) { setSynkFeil(`Sky-feil (${r.status})`); return; }
      const cloudState = await r.json();
      if (!cloudState || typeof cloudState !== 'object') { setSynkFeil('Ugyldig sky-data'); return; }
      // Bruk mergeWithCloud slik at prosjekter fra sky alltid vinner hvis sky er nyere
      const merged = mergeWithCloud(state, cloudState);
      dispatch({ type: 'LOAD_STATE', payload: merged });
      setSistSynk(new Date());
    } catch { setSynkFeil('Nettverksfeil – sjekk internett'); }
    finally { setSynker(false); }
  }

  const updateProject = (proj, extra) =>
    dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...proj, ...extra } });

  const aktive = state.prosjekter.filter(p => p.status !== 'fullfort');

  const counts = {
    Alle:        aktive.length,
    'AI-plan':   aktive.filter(p => p.fdGenAv === 'AI' && p.kildeTilbudData).length,
    Pågående:    aktive.filter(p => !p.fdStatus || p.fdStatus === 'Pågående' || p.fdStatus === 'Ikke startet').length,
    Forsinket:   aktive.filter(p => p.fdStatus === 'Forsinket').length,
    Ferdig:      aktive.filter(p => p.fdStatus === 'Ferdig').length,
  };

  const filtered = aktive.filter(p => {
    if (filter === 'Alle')      return true;
    if (filter === 'AI-plan')   return p.fdGenAv === 'AI' && Boolean(p.kildeTilbudData);
    if (filter === 'Pågående')  return !p.fdStatus || p.fdStatus === 'Pågående' || p.fdStatus === 'Ikke startet';
    if (filter === 'Forsinket') return p.fdStatus === 'Forsinket';
    if (filter === 'Ferdig')    return p.fdStatus === 'Ferdig';
    return true;
  });

  const sortOrder = { Forsinket: 0, Pågående: 1, 'Ikke startet': 2, Ferdig: 3 };
  filtered.sort((a, b) => {
    const sa = sortOrder[a.fdStatus || 'Pågående'] ?? 1;
    const sb = sortOrder[b.fdStatus || 'Pågående'] ?? 1;
    if (sa !== sb) return sa - sb;
    return (b.fdProgress ?? 0) - (a.fdProgress ?? 0);
  });

  if (selectedId) {
    const live = state.prosjekter.find(p => p.id === selectedId);
    if (live) {
      return (
        <div className="page">
          <ProjectDetail
            project={live}
            onBack={() => setSelectedId(null)}
            onUpdate={extra => updateProject(live, extra)}
          />
        </div>
      );
    }
  }

  return (
    <div className="page fd2-page">
      <div className="fd2-page-header">
        <div>
          <h2 className="fd2-page-tittel">Framdriftsplan</h2>
          <p className="fd2-page-sub">{aktive.length} aktive prosjekter</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button className="btn btn-sm fd2-sync-btn" onClick={syncFraCloud} disabled={synker}
            title="Hent siste data fra sky">
            {synker ? '⏳ Synker…' : '🔄 Synk'}
            {sistSynk && !synker && (
              <span className="fd2-sync-tid">
                {sistSynk.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </button>
          {synkFeil && (
            <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 500 }}>⚠ {synkFeil}</span>
          )}
        </div>
      </div>

      <div className="fd2-filter-bar">
        {[
          { key: 'Alle',      label: 'Alle',            color: '#475569' },
          { key: 'AI-plan',   label: '✨ AI-generert',  color: '#7c3aed' },
          { key: 'Pågående',  label: 'Pågående',        color: '#2563eb' },
          { key: 'Forsinket', label: 'Forsinket',       color: '#dc2626' },
          { key: 'Ferdig',    label: 'Ferdig',          color: '#16a34a' },
        ].map(f => (
          <button key={f.key}
            className={`fd2-filter-pill${filter === f.key ? ' active' : ''}`}
            style={filter === f.key
              ? { background: f.color, color: '#fff', borderColor: f.color }
              : { color: f.color, borderColor: f.color + '55' }}
            onClick={() => setFilter(f.key)}>
            {f.label}
            <span className="fd2-filter-count">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="fd2-empty">
          <div style={{ fontSize: 40, marginBottom: 10 }}>
            {filter === 'AI-plan' ? '✨' : filter === 'Forsinket' ? '✅' : '📋'}
          </div>
          <p>
            {filter === 'AI-plan'
              ? 'Ingen prosjekter med AI-generert framdrift ennå. Send tilbud over fra tilbuds-appen!'
              : `Ingen prosjekter i kategorien «${filter}».`}
          </p>
          {filter === 'AI-plan' && (
            <button className="btn btn-sm" onClick={() => setFilter('Alle')}>Vis alle prosjekter</button>
          )}
        </div>
      ) : (
        <div className="fd2-card-grid">
          {filtered.map(p => (
            <ProjectCard key={p.id} project={p} onSelect={p => setSelectedId(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
