import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { uid } from '../store';

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
const STATUS_COLORS  = { 'Ikke startet': '#888780', 'Pågående': '#185FA5', 'Forsinket': '#993C1D', 'Ferdig': '#1D9E75' };

// Standard byggefaser — ett klikk legger til alle relevante
const STANDARD_FASER = [
  { name: 'Grunnarbeider',       fag: 'tomrer',      dur: 14 },
  { name: 'Råbygg / tømrerarbeid', fag: 'tomrer',    dur: 21 },
  { name: 'Tak',                 fag: 'tomrer',      dur: 7  },
  { name: 'Vinduer og dører',    fag: 'tomrer',      dur: 7  },
  { name: 'Rørlegger',           fag: 'rorlegger',   dur: 14 },
  { name: 'Elektriker',          fag: 'elektriker',  dur: 14 },
  { name: 'Ventilasjon',         fag: 'ventilasjon', dur: 7  },
  { name: 'Isolasjon og gips',   fag: 'tomrer',      dur: 14 },
  { name: 'Flislegging',         fag: 'flis',        dur: 7  },
  { name: 'Maling',              fag: 'maling',      dur: 7  },
  { name: 'Ferdigstilling',      fag: 'ferdig',      dur: 7  },
];

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

// Beregn fremdrift automatisk fra oppgaver (gjennomsnitt av pct)
function calcAutoProgress(tasks) {
  if (!tasks || tasks.length === 0) return null;
  return Math.round(tasks.reduce((s, t) => s + (t.pct ?? 0), 0) / tasks.length);
}

// ─── GanttChart ───────────────────────────────────────────────────────────────
function GanttChart({ project, onUpdate }) {
  const [tasks, setTasks] = useState(project.fdTasks || []);
  const [zoom, setZoom] = useState(1);
  const [newTask, setNewTask] = useState('');
  const [newFag, setNewFag] = useState('tomrer');
  const [dropIdx, setDropIdx] = useState(null);
  const drag = useRef(null);
  const rowDragRef = useRef(null);
  const tasksRef = useRef(tasks);

  useEffect(() => {
    setTasks(project.fdTasks || []);
    tasksRef.current = project.fdTasks || [];
  }, [project.id]);

  const { week: bw, year: by } = projStartWY(project);
  const totalWeeks = project.fdTotalWeeks || 12;
  const totalDays = Math.max(
    ...(tasks.length ? tasks.map(t => t.start + t.dur) : [0]),
    totalWeeks * 7
  );

  const ROW = 38, PAD = 200;
  const chartW = Math.max(totalDays * 18, 580) * zoom;
  const dw = chartW / totalDays;
  const svgH = Math.max(tasks.length * ROW + 56, 80);

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
    tasksRef.current = next;
    setTasks(next);
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
        if (type === 'resize') return { ...t, dur: Math.max(1, od + dx) };
        return t;
      });
      tasksRef.current = next;
      return next;
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

  // Klikk på Gantt-bar: toggle ferdig/ikke ferdig
  const toggleDone = (e, tid) => {
    e.stopPropagation();
    const next = tasks.map(t => t.id === tid ? { ...t, pct: (t.pct ?? 0) >= 100 ? 0 : 100 } : t);
    save(next);
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
    if (toAdd.length === 0) return;
    let cursor = tasks.length ? Math.max(...tasks.map(t => t.start + t.dur)) : 0;
    const newTasks = toAdd.map(f => {
      const t = { id: uid(), name: f.name, start: cursor, dur: f.dur, pct: 0, fag: f.fag };
      cursor += f.dur;
      return t;
    });
    save([...tasks, ...newTasks]);
  };

  return (
    <div>
      {/* Legg til standardfaser */}
      {tasks.length === 0 && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f0f7ff', borderRadius: 8, border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: '#1e40af' }}>Ingen oppgaver ennå.</span>
          <button onClick={addStandardFaser}
            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#185FA5', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>
            ➕ Legg til standard byggefaser
          </button>
        </div>
      )}

      {/* Zoom + Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#666' }}>Zoom:</span>
        <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.2).toFixed(1)))}
          style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: 15 }}>−</button>
        <span style={{ fontSize: 12, minWidth: 30, textAlign: 'center', color: '#666' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, +(z + 0.2).toFixed(1)))}
          style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: 15 }}>+</button>
        <button onClick={() => setZoom(1)}
          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', color: '#888' }}>Reset</button>
        {tasks.length > 0 && (
          <button onClick={addStandardFaser}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#185FA5', cursor: 'pointer', marginLeft: 4 }}>
            + Standardfaser
          </button>
        )}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 4 }}>
          {Object.entries(FAG).filter(([k]) => k !== 'annet').map(([k, v]) => (
            <span key={k} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: v.color + '22', color: v.color, border: `1px solid ${v.color}55` }}>
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* Gantt grid */}
      <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
        {/* Left: task names + done toggle */}
        <div style={{ flexShrink: 0, width: PAD, background: '#fff', borderRight: '1px solid #ddd', zIndex: 1 }}>
          <svg width={PAD} height={svgH} style={{ display: 'block' }}>
            <rect x={0} y={0} width={PAD} height={40} fill="#f5f5f5" />
            <text x={8} y={26} fontSize={11} fontWeight="500" fill="#888">Oppgave</text>
            <text x={PAD - 34} y={26} fontSize={10} fill="#aaa" textAnchor="middle">Ferdig</text>
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
                  {dropIdx === i && <rect x={0} y={y} width={PAD} height={2} fill="#378ADD" />}
                  <rect x={0} y={y} width={PAD} height={ROW} fill={done ? '#f0fdf4' : 'transparent'} />
                  <circle cx={10} cy={y + ROW / 2} r={5} fill={fc(t.fag)} opacity={done ? 0.4 : 1} />
                  <clipPath id={`nc${t.id}`}><rect x={22} y={y} width={PAD - 62} height={ROW} /></clipPath>
                  <text x={24} y={y + ROW / 2 + 5} fontSize={12} fill={done ? '#94a3b8' : '#333'}
                    style={{ userSelect: 'none', textDecoration: done ? 'line-through' : 'none' }}
                    clipPath={`url(#nc${t.id})`}>
                    {t.name.length > 20 ? t.name.slice(0, 19) + '…' : t.name}
                  </text>
                  {/* Slett-knapp */}
                  <text x={PAD - 54} y={y + ROW / 2 + 5} fontSize={11} fill="#ccc" style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => deleteTask(t.id)}>✕</text>
                  {/* Done toggle checkbox */}
                  <rect x={PAD - 36} y={y + ROW / 2 - 9} width={18} height={18} rx={4}
                    fill={done ? '#16a34a' : '#fff'} stroke={done ? '#16a34a' : '#ccc'} strokeWidth={1.5}
                    style={{ cursor: 'pointer' }}
                    onClick={e => toggleDone(e, t.id)} />
                  {done && (
                    <text x={PAD - 27} y={y + ROW / 2 + 5} fontSize={13} fill="#fff" textAnchor="middle"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>✓</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right: Gantt bars */}
        <div style={{ overflowX: 'auto', flex: 1 }} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          <svg width={chartW} height={svgH} style={{ display: 'block', userSelect: 'none' }}>
            {yearBands.map(b => (
              <g key={b.y}>
                <rect x={b.s * dw} y={0} width={(b.e - b.s) * dw} height={20} fill={b.y % 2 === 0 ? '#f0f0f0' : '#e8e8e8'} />
                <text x={b.s * dw + 5} y={14} fontSize={11} fontWeight="500" fill="#555">{b.y}</text>
              </g>
            ))}
            {weeks.map((d, i) => (
              <rect key={d} x={d * dw} y={40} width={7 * dw} height={svgH - 40}
                fill={i % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.05)'} />
            ))}
            {weeks.map(d => {
              const { w } = wkNum(bw, by, Math.round(d / 7));
              return (
                <g key={d}>
                  <line x1={d * dw} y1={20} x2={d * dw} y2={svgH} stroke="#ddd" strokeWidth={0.5} />
                  <text x={d * dw + 3} y={33} fontSize={10} fill="#aaa">U{w}</text>
                </g>
              );
            })}
            {tasks.map((t, i) => {
              const x = t.start * dw;
              const w = Math.max(t.dur * dw - 2, 6);
              const y = i * ROW + 40;
              const pct = t.pct ?? 0;
              const done = pct >= 100;
              const col = fc(t.fag);
              const doneW = w * pct / 100;
              return (
                <g key={t.id}>
                  <rect x={x} y={y + 6} width={w} height={22} rx={4} fill={col} opacity={done ? 0.25 : 0.45}
                    style={{ cursor: 'grab' }} onMouseDown={e => startDrag(e, t.id, 'move')} />
                  {doneW > 0 && (
                    <rect x={x} y={y + 6} width={doneW} height={22} rx={4} fill={col} opacity={done ? 0.7 : 0.9}
                      style={{ pointerEvents: 'none' }} />
                  )}
                  <clipPath id={`bc${t.id}`}><rect x={x + 2} y={y + 6} width={Math.max(w - 18, 0)} height={22} /></clipPath>
                  <text x={x + 5} y={y + 21} fontSize={10} fill="white" fontWeight="500"
                    style={{ pointerEvents: 'none' }} clipPath={`url(#bc${t.id})`}>{t.name}</text>
                  {done && w > 20 && (
                    <text x={x + w / 2} y={y + 21} fontSize={12} fill="white" textAnchor="middle"
                      style={{ pointerEvents: 'none' }}>✓</text>
                  )}
                  {/* Resize handle */}
                  <rect x={x + w - 6} y={y + 6} width={6} height={22}
                    fill="rgba(0,0,0,0.18)" rx={2} style={{ cursor: 'ew-resize' }}
                    onMouseDown={e => startDrag(e, t.id, 'resize')} />
                </g>
              );
            })}
            {nowX !== null && (
              <g>
                <line x1={nowX} y1={20} x2={nowX} y2={svgH} stroke="#E24B4A" strokeWidth={2} strokeDasharray="4 3" />
                <rect x={nowX - 16} y={21} width={32} height={16} rx={3} fill="#E24B4A" />
                <text x={nowX} y={33} fontSize={10} fontWeight="500" fill="white" textAnchor="middle">U{nowWk}</text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Add task */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input value={newTask} onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="+ Ny oppgave..."
          style={{ flex: 1, minWidth: 140, fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fafafa' }} />
        <select value={newFag} onChange={e => setNewFag(e.target.value)}
          style={{ fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#fafafa' }}>
          {Object.entries(FAG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={addTask}
          style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fafafa', cursor: 'pointer' }}>
          Legg til
        </button>
      </div>

      {/* Progress info */}
      {tasks.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
          {tasks.filter(t => (t.pct ?? 0) >= 100).length} av {tasks.length} faser fullført
          · Beregnet fremdrift: <strong>{calcAutoProgress(tasks)}%</strong>
        </div>
      )}
    </div>
  );
}

// ─── ProjectCard ──────────────────────────────────────────────────────────────
function ProjectCard({ project, onSelect }) {
  const pct = project.fdProgress ?? 0;
  const tasks = project.fdTasks || [];
  const doneTasks = tasks.filter(t => (t.pct ?? 0) >= 100).length;
  const status = project.fdStatus || 'Pågående';
  const sc = STATUS_COLORS[status] ?? '#888';
  const barColor = status === 'Ferdig' ? '#1D9E75' : status === 'Forsinket' ? '#993C1D' : '#185FA5';

  return (
    <div onClick={() => onSelect(project)}
      style={{
        background: '#fff',
        border: `1px solid ${status === 'Forsinket' ? '#fca5a5' : '#e0e0e0'}`,
        borderLeft: `4px solid ${sc}`,
        borderRadius: 10,
        padding: '12px 14px', cursor: 'pointer', transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#1e293b', lineHeight: 1.3 }}>{project.navn}</p>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: sc + '18', color: sc, whiteSpace: 'nowrap', marginLeft: 6, flexShrink: 0 }}>
          {status}
        </span>
      </div>
      <div style={{ background: '#f1f5f9', borderRadius: 99, height: 6, margin: '6px 0 4px' }}>
        <div style={{ width: pct + '%', height: 6, borderRadius: 99, background: barColor, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
        <span style={{ fontWeight: 600, color: pct > 0 ? barColor : '#94a3b8' }}>{pct}%</span>
        <span>{tasks.length > 0 ? `${doneTasks}/${tasks.length} faser` : 'Ingen faser ennå'}</span>
      </div>
    </div>
  );
}

// ─── ProjectDetail ────────────────────────────────────────────────────────────
function ProjectDetail({ project, onBack, onUpdate }) {
  const [status, setStatus] = useState(project.fdStatus || 'Pågående');
  const [note, setNote] = useState(project.fdNote || '');
  const [startWk, setStartWk] = useState(() => projStartWY(project).week);
  const [startYr, setStartYr] = useState(() => projStartWY(project).year);
  const [totalWk, setTotalWk] = useState(project.fdTotalWeeks || 12);
  const sc = STATUS_COLORS[status] ?? '#888';
  const pct = project.fdProgress ?? 0;

  useEffect(() => {
    setStatus(project.fdStatus || 'Pågående');
    setNote(project.fdNote || '');
    const wy = projStartWY(project);
    setStartWk(wy.week);
    setStartYr(wy.year);
    setTotalWk(project.fdTotalWeeks || 12);
  }, [project.id]);

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Back + title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <button onClick={onBack}
          style={{ fontSize: 13, padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'transparent', cursor: 'pointer', color: '#666' }}>
          ← Tilbake
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{project.navn}</span>
        </div>
      </div>

      {/* Status + fremdrift */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Status</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => { setStatus(s); onUpdate({ fdStatus: s }); }}
                style={{
                  fontSize: 12, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${STATUS_COLORS[s]}44`,
                  background: status === s ? STATUS_COLORS[s] : STATUS_COLORS[s] + '18',
                  color: status === s ? '#fff' : STATUS_COLORS[s],
                  fontWeight: status === s ? 600 : 400,
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Fremdrift-bar (read-only, beregnet fra oppgaver) */}
        <div style={{ flex: '1 1 200px', minWidth: 180 }}>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>
            Fremdrift: <strong>{pct}%</strong>
            {(project.fdTasks || []).length === 0 && (
              <span style={{ color: '#94a3b8', fontWeight: 400 }}> — legg til faser nedenfor</span>
            )}
          </label>
          <div style={{ background: '#f1f5f9', borderRadius: 99, height: 10 }}>
            <div style={{ width: pct + '%', height: 10, borderRadius: 99, background: sc, transition: 'width 0.3s' }} />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Notater / avvik</label>
          <input value={note} onChange={e => setNote(e.target.value)} onBlur={() => onUpdate({ fdNote: note })}
            placeholder="Avvik, endringer..."
            style={{ width: 220, fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#fafafa', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Gantt settings — kompakt */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 2 }}>Startuke</label>
          <input type="number" min={1} max={52} value={startWk}
            onChange={e => setStartWk(Number(e.target.value))}
            onBlur={() => onUpdate({ fdStartWeek: startWk, fdStartYear: startYr })}
            style={{ width: 60, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 2 }}>År</label>
          <input type="number" min={2023} max={2030} value={startYr}
            onChange={e => setStartYr(Number(e.target.value))}
            onBlur={() => onUpdate({ fdStartWeek: startWk, fdStartYear: startYr })}
            style={{ width: 72, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 2 }}>Totale uker</label>
          <input type="number" min={1} max={200} value={totalWk}
            onChange={e => setTotalWk(Number(e.target.value))}
            onBlur={() => onUpdate({ fdTotalWeeks: totalWk })}
            style={{ width: 72, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' }} />
        </div>
      </div>

      {/* Gantt */}
      <GanttChart project={project} onUpdate={onUpdate} />

      {/* Notes panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 16 }}>
        {[
          { key: 'fdNoteOrders', label: '📦 Bestillinger & leveranser', ph: 'Vinduer bestilt 10.04...' },
          { key: 'fdNoteSubs',   label: '👷 Underentreprenører',        ph: 'Rørlegger – Ola Hansen...' },
        ].map(({ key, label, ph }) => (
          <div key={key} style={{ background: '#f9f9f9', borderRadius: 8, padding: '10px 12px', border: '1px solid #e0e0e0' }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600 }}>{label}</p>
            <textarea rows={4} placeholder={ph} value={project[key] || ''}
              onChange={e => onUpdate({ [key]: e.target.value })}
              onBlur={e => onUpdate({ [key]: e.target.value })}
              style={{ width: '100%', fontSize: 12, lineHeight: 1.6, padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Framdriftsplan() {
  const { state, dispatch } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('Pågående');

  const updateProject = (proj, extra) => {
    dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...proj, ...extra } });
  };

  // Ikke vis fullførte/arkiverte prosjekter her
  const aktive = state.prosjekter.filter(p => p.status !== 'fullfort');

  const filtered = aktive.filter(p => {
    if (filter === 'Alle')        return true;
    if (filter === 'Pågående')    return !p.fdStatus || p.fdStatus === 'Pågående' || p.fdStatus === 'Ikke startet';
    if (filter === 'Forsinket')   return p.fdStatus === 'Forsinket';
    if (filter === 'Ferdig')      return p.fdStatus === 'Ferdig';
    return true;
  });

  // Sorter: Forsinket øverst, deretter Pågående, Ikke startet, Ferdig
  const sortOrder = { 'Forsinket': 0, 'Pågående': 1, 'Ikke startet': 2, 'Ferdig': 3 };
  filtered.sort((a, b) => {
    const sa = sortOrder[a.fdStatus || 'Pågående'] ?? 1;
    const sb = sortOrder[b.fdStatus || 'Pågående'] ?? 1;
    if (sa !== sb) return sa - sb;
    return (b.fdProgress ?? 0) - (a.fdProgress ?? 0);
  });

  const counts = {
    Alle:      aktive.length,
    Pågående:  aktive.filter(p => !p.fdStatus || p.fdStatus === 'Pågående' || p.fdStatus === 'Ikke startet').length,
    Forsinket: aktive.filter(p => p.fdStatus === 'Forsinket').length,
    Ferdig:    aktive.filter(p => p.fdStatus === 'Ferdig').length,
  };

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
    <div className="page" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Fremdriftsplan</h2>
          <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{aktive.length} aktive prosjekter</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Pågående', 'Forsinket', 'Ferdig', 'Alle'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 99,
                border: `1px solid ${f === 'Forsinket' ? '#fca5a5' : '#ddd'}`,
                background: filter === f ? (f === 'Forsinket' ? '#993C1D' : '#185FA5') : 'transparent',
                color: filter === f ? '#fff' : (f === 'Forsinket' ? '#993C1D' : '#666'),
                cursor: 'pointer', fontWeight: filter === f ? 600 : 400,
              }}>
              {f} {counts[f] != null ? <span style={{ opacity: 0.7 }}>({counts[f]})</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
        {filtered.map(p => (
          <ProjectCard key={p.id} project={p} onSelect={p => setSelectedId(p.id)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <p style={{ margin: 0, fontSize: 14 }}>Ingen prosjekter i denne kategorien.</p>
        </div>
      )}
    </div>
  );
}
