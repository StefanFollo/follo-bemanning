import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { uid } from '../store';

// ─── Fag (trade categories) ───────────────────────────────────────────────────
const FAG = {
  tomrer:      { label: 'Tømrer',      color: '#185FA5' },
  flis:        { label: 'Flis / mur',  color: '#BA7517' },
  elektriker:  { label: 'Elektriker',  color: '#E24B4A' },
  rorlegger:   { label: 'Rørlegger',   color: '#0F6E56' },
  ventilasjon: { label: 'Ventilasjon', color: '#7F77DD' },
  maling:      { label: 'Maling',      color: '#D4537E' },
  ferdig:      { label: 'Ferdig',      color: '#3B6D11' },
  pause:       { label: 'Pause',       color: '#B4B2A9' },
  milestone:   { label: 'Milepæl',     color: '#D85A30' },
  annet:       { label: 'Annet',       color: '#888780' },
};
const fc = k => FAG[k]?.color ?? '#888780';

const TYPE_LABEL = { small: 'Liten', medium: 'Medium', large: 'Stort' };
const TYPE_COLOR = { small: '#1D9E75', medium: '#185FA5', large: '#993556' };
const STATUS_OPTIONS = ['Ikke startet', 'Pågående', 'Forsinket', 'Ferdig'];
const STATUS_COLORS  = { 'Ikke startet': '#888780', 'Pågående': '#185FA5', 'Forsinket': '#993C1D', 'Ferdig': '#1D9E75' };
const FILTER_OPTIONS = ['Alle', 'Liten', 'Medium', 'Stort', 'Pågående', 'Ferdig'];

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

// ─── ContextMenu ─────────────────────────────────────────────────────────────
function ContextMenu({ task, x, y, onClose, onDelete, onChange }) {
  const [name, setName] = useState(task.name);
  return (
    <div
      style={{
        position: 'fixed',
        top: Math.min(y, window.innerHeight - 300),
        left: Math.min(x, window.innerWidth - 220),
        zIndex: 9999, background: '#fff', border: '1px solid #ddd',
        borderRadius: 10, padding: '8px 0', width: 210,
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
      }}
      onMouseLeave={onClose}
    >
      <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid #eee', marginBottom: 4 }}>
        <p style={{ margin: '0 0 4px', fontSize: 11, color: '#666' }}>Navn</p>
        <input value={name} onChange={e => setName(e.target.value)}
          onBlur={() => onChange({ name })}
          onKeyDown={e => { if (e.key === 'Enter') { onChange({ name }); onClose(); } if (e.key === 'Escape') onClose(); }}
          style={{ width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid #ddd', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid #eee', marginBottom: 4 }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, color: '#666' }}>Fagfarge</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(FAG).filter(([k]) => !['pause', 'milestone'].includes(k)).map(([k, v]) => (
            <div key={k} title={v.label} onClick={() => onChange({ fag: k })}
              style={{
                width: 20, height: 20, borderRadius: '50%', background: v.color, cursor: 'pointer',
                border: task.fag === k ? '2.5px solid #333' : '2px solid transparent',
              }} />
          ))}
        </div>
      </div>
      <div onClick={() => { onDelete(); onClose(); }}
        style={{ padding: '7px 12px', fontSize: 12, color: '#993C1D', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = '#FCEBEB'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        Slett oppgave
      </div>
      <div onClick={onClose}
        style={{ padding: '7px 12px', fontSize: 12, color: '#666', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        Lukk
      </div>
    </div>
  );
}

// ─── GanttChart ───────────────────────────────────────────────────────────────
function GanttChart({ project, onUpdate }) {
  const [tasks, setTasks] = useState(project.fdTasks || []);
  const [zoom, setZoom] = useState(1);
  const [newTask, setNewTask] = useState('');
  const [newFag, setNewFag] = useState('tomrer');
  const [selId, setSelId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const drag = useRef(null);
  const rowDragRef = useRef(null);

  useEffect(() => { setTasks(project.fdTasks || []); }, [project.id]);

  const { week: bw, year: by } = projStartWY(project);
  const totalWeeks = project.fdTotalWeeks || 12;
  const totalDays = Math.max(
    ...(tasks.length ? tasks.map(t => t.start + t.dur) : [0]),
    totalWeeks * 7
  );

  const ROW = 36, PAD = 220;
  const chartW = Math.max(totalDays * 18, 620) * zoom;
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

  const save = next => { setTasks(next); onUpdate({ fdTasks: next }); };

  const onMouseMove = e => {
    if (!drag.current) return;
    const { tid, type, sx, os, od, op } = drag.current;
    const dx = Math.round((e.clientX - sx) / dw);
    setTasks(prev => prev.map(t => {
      if (t.id !== tid) return t;
      if (type === 'move')   return { ...t, start: Math.max(0, os + dx) };
      if (type === 'resize') return { ...t, dur: Math.max(1, od + dx) };
      if (type === 'pct') {
        const barW = Math.max(t.dur * dw - 2, 6);
        return { ...t, pct: Math.min(100, Math.max(0, Math.round(((e.clientX - sx) / barW * 100) + op))) };
      }
      return t;
    }));
  };

  const onMouseUp = () => {
    if (drag.current) { drag.current = null; setTasks(prev => { onUpdate({ fdTasks: prev }); return prev; }); }
    if (rowDragRef.current !== null) { rowDragRef.current = null; setDropIdx(null); }
  };

  const startDrag = (e, tid, type) => {
    e.preventDefault(); e.stopPropagation();
    const t = tasks.find(t => t.id === tid);
    drag.current = { tid, type, sx: e.clientX, os: t.start, od: t.dur, op: t.pct ?? 0 };
  };

  const deleteTask = id => save(tasks.filter(t => t.id !== id));
  const changeTask = (id, fields) => save(tasks.map(t => t.id === id ? { ...t, ...fields } : t));
  const addTask = () => {
    if (!newTask.trim()) return;
    const end = tasks.length ? Math.max(...tasks.map(t => t.start + t.dur)) : 0;
    save([...tasks, { id: uid(), name: newTask, start: end, dur: 7, pct: 0, fag: newFag }]);
    setNewTask('');
  };

  return (
    <div>
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
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 4 }}>
          {Object.entries(FAG).filter(([k]) => !['pause', 'annet', 'milestone'].includes(k)).map(([k, v]) => (
            <span key={k} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: v.color + '22', color: v.color, border: `1px solid ${v.color}55` }}>
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* Gantt grid */}
      <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
        {/* Left: task names */}
        <div style={{ flexShrink: 0, width: PAD, background: '#fff', borderRight: '1px solid #ddd', zIndex: 1 }}>
          <svg width={PAD} height={svgH} style={{ display: 'block' }}>
            <rect x={0} y={0} width={PAD} height={40} fill="#f5f5f5" />
            <text x={8} y={26} fontSize={11} fontWeight="500" fill="#888">Oppgave</text>
            {tasks.map((t, i) => {
              const y = i * ROW + 40;
              return (
                <g key={t.id} style={{ cursor: 'grab' }}
                  onMouseDown={() => { rowDragRef.current = i; }}
                  onMouseEnter={() => { if (rowDragRef.current !== null && rowDragRef.current !== i) setDropIdx(i); }}
                  onMouseUp={() => {
                    if (rowDragRef.current !== null && rowDragRef.current !== i) {
                      const n = [...tasks]; const [m] = n.splice(rowDragRef.current, 1); n.splice(i, 0, m); save(n);
                    }
                    rowDragRef.current = null; setDropIdx(null);
                  }}
                  onContextMenu={e => { e.preventDefault(); setMenu({ tid: t.id, x: e.clientX, y: e.clientY }); }}>
                  {dropIdx === i && <rect x={0} y={y} width={PAD} height={2} fill="#378ADD" />}
                  <rect x={0} y={y} width={PAD} height={ROW} fill={selId === t.id ? 'rgba(55,138,221,0.1)' : 'transparent'} />
                  <circle cx={9} cy={y + ROW / 2} r={4} fill={fc(t.fag)} />
                  <text x={18} y={y + ROW / 2 + 4} fontSize={9} fill="#aaa" style={{ userSelect: 'none' }}>⠿</text>
                  <clipPath id={`nc${t.id}`}><rect x={26} y={y} width={PAD - 30} height={ROW} /></clipPath>
                  <text x={28} y={y + ROW / 2 + 5} fontSize={13} fill="#333" style={{ userSelect: 'none' }} clipPath={`url(#nc${t.id})`}>
                    {t.name.length > 24 ? t.name.slice(0, 23) + '…' : t.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right: Gantt bars */}
        <div style={{ overflowX: 'auto', flex: 1 }} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          <svg width={chartW} height={svgH} style={{ display: 'block', userSelect: 'none' }}>
            {/* Year bands */}
            {yearBands.map(b => (
              <g key={b.y}>
                <rect x={b.s * dw} y={0} width={(b.e - b.s) * dw} height={20} fill={b.y % 2 === 0 ? '#f0f0f0' : '#e8e8e8'} />
                <text x={b.s * dw + 5} y={14} fontSize={11} fontWeight="500" fill="#555">{b.y}</text>
              </g>
            ))}
            {/* Week alternating bg */}
            {weeks.map((d, i) => (
              <rect key={d} x={d * dw} y={40} width={7 * dw} height={svgH - 40}
                fill={i % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.05)'} />
            ))}
            {/* Week lines + labels */}
            {weeks.map(d => {
              const { w } = wkNum(bw, by, Math.round(d / 7));
              return (
                <g key={d}>
                  <line x1={d * dw} y1={20} x2={d * dw} y2={svgH} stroke="#ddd" strokeWidth={0.5} />
                  <text x={d * dw + 3} y={33} fontSize={10} fill="#aaa">U{w}</text>
                </g>
              );
            })}
            {/* Task bars */}
            {tasks.map((t, i) => {
              const x = t.start * dw;
              const w = Math.max(t.dur * dw - 2, 6);
              const y = i * ROW + 40;
              const pct = t.pct ?? 0;
              const col = fc(t.fag);
              const doneW = w * pct / 100;
              const isMilestone = t.fag === 'milestone';
              return (
                <g key={t.id} onClick={() => setSelId(selId === t.id ? null : t.id)}>
                  {selId === t.id && <rect x={0} y={y} width={chartW} height={ROW} fill="rgba(55,138,221,0.10)" />}
                  {isMilestone ? (
                    <polygon
                      points={`${x},${y + 18} ${x + 10},${y + 6} ${x + 20},${y + 18} ${x + 10},${y + 30}`}
                      fill={col} opacity={0.9} style={{ cursor: 'grab' }}
                      onMouseDown={e => startDrag(e, t.id, 'move')} />
                  ) : (
                    <>
                      <rect x={x} y={y + 4} width={w} height={24} rx={4} fill={col} opacity={0.55}
                        style={{ cursor: 'grab' }} onMouseDown={e => startDrag(e, t.id, 'move')} />
                      {doneW > 0 && (
                        <rect x={x} y={y + 4} width={doneW} height={24} rx={4} fill={col} opacity={0.95}
                          style={{ pointerEvents: 'none' }} />
                      )}
                      <clipPath id={`bc${t.id}`}><rect x={x + 2} y={y + 4} width={Math.max(w - 22, 0)} height={24} /></clipPath>
                      <text x={x + 4} y={y + 20} fontSize={11} fill="white" fontWeight="500"
                        style={{ pointerEvents: 'none' }} clipPath={`url(#bc${t.id})`}>{t.name}</text>
                      {w > 36 && (
                        <text x={x + w - 4} y={y + 20} fontSize={10} fill="white" fontWeight="500"
                          textAnchor="end" style={{ pointerEvents: 'none' }}>{pct}%</text>
                      )}
                      {/* Progress drag handle */}
                      <rect x={x + doneW - 3} y={y + 4} width={6} height={24}
                        fill="rgba(255,255,255,0.7)" style={{ cursor: 'col-resize' }}
                        onMouseDown={e => startDrag(e, t.id, 'pct')} />
                      {/* Resize handle */}
                      <rect x={x + w - 6} y={y + 4} width={6} height={24}
                        fill="rgba(0,0,0,0.18)" style={{ cursor: 'ew-resize' }}
                        onMouseDown={e => startDrag(e, t.id, 'resize')} />
                    </>
                  )}
                </g>
              );
            })}
            {/* Today line */}
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

      {/* Context menu */}
      {menu && (() => {
        const t = tasks.find(t => t.id === menu.tid);
        if (!t) return null;
        return (
          <ContextMenu task={t} x={menu.x} y={menu.y}
            onClose={() => setMenu(null)}
            onDelete={() => deleteTask(t.id)}
            onChange={f => changeTask(t.id, f)} />
        );
      })()}
    </div>
  );
}

// ─── ProjectCard ──────────────────────────────────────────────────────────────
function ProjectCard({ project, onSelect }) {
  const pct = project.fdProgress ?? 0;
  const fdType = project.fdType || 'medium';
  const tc = TYPE_COLOR[fdType] ?? project.farge ?? '#185FA5';
  const status = project.fdStatus || 'Pågående';
  const sc = STATUS_COLORS[status] ?? '#888';
  return (
    <div onClick={() => onSelect(project)}
      style={{
        background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12,
        padding: '12px 14px', cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#aaa'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#e0e0e0'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: 13, color: '#222' }}>{project.navn}</p>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: tc + '22', color: tc, whiteSpace: 'nowrap', marginLeft: 6 }}>
          {TYPE_LABEL[fdType]}
        </span>
      </div>
      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: sc + '22', color: sc }}>{status}</span>
      <div style={{ background: '#eee', borderRadius: 99, height: 4, margin: '6px 0 4px' }}>
        <div style={{ width: pct + '%', height: 4, borderRadius: 99, background: tc }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888' }}>
        <span>{pct}%</span>
        <span>{(project.fdTasks || []).length} oppgaver</span>
      </div>
    </div>
  );
}

// ─── ProjectDetail ────────────────────────────────────────────────────────────
function ProjectDetail({ project, onBack, onUpdate }) {
  const [status, setStatus] = useState(project.fdStatus || 'Pågående');
  const [progress, setProgress] = useState(project.fdProgress ?? 0);
  const [note, setNote] = useState(project.fdNote || '');
  const [startWk, setStartWk] = useState(() => projStartWY(project).week);
  const [startYr, setStartYr] = useState(() => projStartWY(project).year);
  const [totalWk, setTotalWk] = useState(project.fdTotalWeeks || 12);
  const sc = STATUS_COLORS[status] ?? '#888';

  useEffect(() => {
    setStatus(project.fdStatus || 'Pågående');
    setProgress(project.fdProgress ?? 0);
    setNote(project.fdNote || '');
    const wy = projStartWY(project);
    setStartWk(wy.week);
    setStartYr(wy.year);
    setTotalWk(project.fdTotalWeeks || 12);
  }, [project.id]);

  const save = (extra = {}) => onUpdate({ fdStatus: status, fdProgress: progress, fdNote: note, ...extra });

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Back + title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={onBack}
          style={{ fontSize: 13, padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'transparent', cursor: 'pointer', color: '#666' }}>
          ← Tilbake
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{project.navn}</span>
          <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: sc + '22', color: sc }}>{status}</span>
        </div>
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 130px' }}>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Status</label>
          <select value={status} onChange={e => { setStatus(e.target.value); save({ fdStatus: e.target.value }); }}
            style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#fafafa' }}>
            {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 110px' }}>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Type</label>
          <select value={project.fdType || 'medium'} onChange={e => onUpdate({ fdType: e.target.value })}
            style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#fafafa' }}>
            <option value="small">Liten</option>
            <option value="medium">Medium</option>
            <option value="large">Stort</option>
          </select>
        </div>
        <div style={{ flex: '2 1 160px' }}>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Fremdrift: {progress}%</label>
          <input type="range" min={0} max={100} step={5} value={progress}
            onChange={e => { const v = Number(e.target.value); setProgress(v); save({ fdProgress: v }); }}
            style={{ width: '100%' }} />
        </div>
        <div style={{ flex: '3 1 200px' }}>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Notater</label>
          <input value={note} onChange={e => setNote(e.target.value)} onBlur={() => save()}
            placeholder="Avvik, endringer..."
            style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#fafafa', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Gantt settings */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 2 }}>Startuke</label>
          <input type="number" min={1} max={52} value={startWk}
            onChange={e => setStartWk(Number(e.target.value))}
            onBlur={() => onUpdate({ fdStartWeek: startWk, fdStartYear: startYr })}
            style={{ width: 64, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 2 }}>År</label>
          <input type="number" min={2023} max={2030} value={startYr}
            onChange={e => setStartYr(Number(e.target.value))}
            onBlur={() => onUpdate({ fdStartWeek: startWk, fdStartYear: startYr })}
            style={{ width: 74, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 2 }}>Totale uker</label>
          <input type="number" min={1} max={200} value={totalWk}
            onChange={e => setTotalWk(Number(e.target.value))}
            onBlur={() => onUpdate({ fdTotalWeeks: totalWk })}
            style={{ width: 74, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' }} />
        </div>
      </div>

      {/* Gantt */}
      <GanttChart project={project} onUpdate={onUpdate} />

      {/* Notes panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 16 }}>
        {[
          { key: 'fdNoteOrders', label: 'Bestillinger & leveranser', ph: 'Vinduer bestilt 10.04...' },
          { key: 'fdNoteSubs',   label: 'Underentreprenører',        ph: 'Rørlegger – Ola Hansen...' },
        ].map(({ key, label, ph }) => (
          <div key={key} style={{ background: '#f9f9f9', borderRadius: 8, padding: '10px 12px', border: '1px solid #e0e0e0' }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 500 }}>{label}</p>
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
  const [filter, setFilter] = useState('Alle');

  const updateProject = (proj, extra) => {
    const updated = { ...proj, ...extra };
    dispatch({ type: 'UPDATE_PROSJEKT', payload: updated });
  };

  const filtered = state.prosjekter.filter(p => {
    if (filter === 'Alle')    return true;
    if (filter === 'Liten')   return p.fdType === 'small';
    if (filter === 'Medium')  return p.fdType === 'medium';
    if (filter === 'Stort')   return p.fdType === 'large';
    if (filter === 'Pågående') return (p.fdStatus || 'Pågående') === 'Pågående';
    if (filter === 'Ferdig')   return p.fdStatus === 'Ferdig';
    return true;
  });

  // Detail view
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

  // List view
  return (
    <div className="page" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Fremdriftsplan</h2>
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Follo Byggservice · {state.prosjekter.length} prosjekter</p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {FILTER_OPTIONS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                fontSize: 12, padding: '4px 11px', borderRadius: 99, border: '1px solid #ddd',
                background: filter === f ? '#185FA5' : 'transparent',
                color: filter === f ? '#fff' : '#666', cursor: 'pointer',
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 8 }}>
        {filtered.map(p => (
          <ProjectCard key={p.id} project={p} onSelect={p => setSelectedId(p.id)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>Ingen prosjekter matcher filteret.</p>
      )}
    </div>
  );
}
