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
const FAG_IKON = {
  tomrer: '🔨', flis: '🔲', elektriker: '⚡', rorlegger: '🔵',
  ventilasjon: '💨', maling: '🎨', ferdig: '✓', annet: '📋',
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

// ─── GenererModal ─────────────────────────────────────────────────────────────

function GenererModal({ project, onClose, onApply }) {
  const { state } = useApp();
  const harEgenData = !!(project.kildeTilbudData || project.poster?.length);
  const [tab, setTab] = useState(harEgenData ? 'tilbud' : 'fritekst');
  const [valgtId, setValgtId] = useState(project.id);
  const [beskrivelse, setBeskrivelse] = useState('');
  const [oppstart, setOppstart] = useState(project.oppstartTekst || '');
  const [varighet, setVarighet] = useState(String(project.varighetUker || 4));
  const [mannskap, setMannskap] = useState('2');
  const [laster, setLaster] = useState(false);
  const [feil, setFeil] = useState('');
  const [preview, setPreview] = useState(null);

  const alleMedData = (state.prosjekter || []).filter(p =>
    (p.kildeTilbudData && (p.kildeTilbudData.poster?.length || Object.keys(p.kildeTilbudData.timer || {}).length)) ||
    p.poster?.length > 0
  );
  const valgtProj = alleMedData.find(p => p.id === valgtId) || alleMedData[0];
  const harEksisterende = (project.fdTasks || []).length > 0;

  async function generer() {
    setLaster(true); setFeil(''); setPreview(null);
    try {
      const token = localStorage.getItem('fbs_token') || '';
      let body;
      if (tab === 'tilbud') {
        if (!valgtProj) throw new Error('Ingen prosjekter med tilbudsdata');
        const kd = valgtProj.kildeTilbudData;
        body = {
          modus: 'fra-tilbud',
          poster: kd?.poster || valgtProj.poster || [],
          timer: kd?.timer || {},
          oppstart: kd?.oppstart || valgtProj.oppstartTekst || '',
          varighet: kd?.varighet || valgtProj.varighetTekst || '',
          adresse: valgtProj.adresse || '',
          kundenavn: valgtProj.navn || '',
        };
      } else {
        if (!beskrivelse.trim()) throw new Error('Skriv inn en beskrivelse av jobben');
        body = {
          modus: 'fri-tekst',
          beskrivelse: beskrivelse.trim(),
          oppstart: oppstart.trim(),
          varighet: parseInt(varighet) || 4,
          mannskap: parseInt(mannskap) || 2,
        };
      }
      const r = await fetch('/api/framdrift-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Feil ${r.status}`);
      setPreview(data);
    } catch (e) { setFeil(e.message); }
    finally { setLaster(false); }
  }

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{
      padding: '10px 18px', background: 'none', border: 'none',
      borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent',
      color: tab === key ? '#2563eb' : '#64748b',
      fontWeight: tab === key ? 700 : 500, cursor: 'pointer', fontSize: 13, marginBottom: -1,
    }}>{label}</button>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>✨ Generer framdriftsplan med AI</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {!preview ? (
          <>
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
              {tabBtn('tilbud', `📋 Fra tilbudsdata${alleMedData.length === 0 ? ' (ingen)' : ''}`)}
              {tabBtn('fritekst', '✏️ Fri beskrivelse')}
            </div>

            <div style={{ padding: '20px 24px 24px', display: 'grid', gap: 16 }}>
              {tab === 'tilbud' && (alleMedData.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  Ingen prosjekter med tilbudsdata funnet.<br />Bruk «Fri beskrivelse»-fanen i stedet.
                </div>
              ) : (
                <>
                  <div>
                    <label>Velg prosjekt med tilbudsdata</label>
                    <select className="input" value={valgtId} onChange={e => setValgtId(e.target.value)}>
                      {alleMedData.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.navn}{p.id === project.id ? ' (dette prosjektet)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {valgtProj && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', fontSize: 13, display: 'grid', gap: 3 }}>
                      <div style={{ fontWeight: 600, color: '#15803d', marginBottom: 2 }}>📦 Tilbudsdata</div>
                      {valgtProj.adresse && <div>📍 {valgtProj.adresse}</div>}
                      {valgtProj.estimertSum > 0 && <div>💰 {Math.round(valgtProj.estimertSum).toLocaleString('nb-NO')} kr</div>}
                      {valgtProj.fag?.length > 0 && <div>🔨 Fag: {valgtProj.fag.join(', ')}</div>}
                      {(() => { const ant = (valgtProj.kildeTilbudData?.poster || valgtProj.poster || []).length; return ant > 0 ? <div>📋 {ant} tilbudsposter</div> : null; })()}
                      {(valgtProj.kildeTilbudData?.oppstart || valgtProj.oppstartTekst) &&
                        <div>🚀 {valgtProj.kildeTilbudData?.oppstart || valgtProj.oppstartTekst}</div>}
                      {(valgtProj.kildeTilbudData?.varighet || valgtProj.varighetTekst) &&
                        <div>⏱ {valgtProj.kildeTilbudData?.varighet || valgtProj.varighetTekst}</div>}
                    </div>
                  )}
                </>
              ))}

              {tab === 'fritekst' && (
                <>
                  <div>
                    <label>Beskriv jobben kort *</label>
                    <textarea className="input" rows={4} value={beskrivelse}
                      onChange={e => setBeskrivelse(e.target.value)}
                      placeholder={'Eksempler:\n• Bad 6 m² og kjøkken-renovering 12 m²\n• Tilbygg 50 m² med skifertak og 3 vinduer\n• Rehab kjeller: pigging, drening, bad 8 m²'} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label>Oppstart</label>
                      <input className="input" value={oppstart} onChange={e => setOppstart(e.target.value)} placeholder="uke 31" />
                    </div>
                    <div>
                      <label>Varighet (uker)</label>
                      <input type="number" min={1} max={52} className="input" value={varighet} onChange={e => setVarighet(e.target.value)} />
                    </div>
                    <div>
                      <label>Mannskap</label>
                      <input type="number" min={1} max={20} className="input" value={mannskap} onChange={e => setMannskap(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              {feil && (
                <div style={{ color: '#dc2626', fontSize: 13, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>❌ {feil}</div>
              )}

              <div className="modal-actions">
                <button className="btn" onClick={onClose}>Avbryt</button>
                <button className="btn btn-primary" onClick={generer}
                  disabled={laster || (tab === 'tilbud' && !valgtProj) || (tab === 'fritekst' && !beskrivelse.trim())}>
                  {laster ? <><span className="fd2-spinner" /> Genererer…</> : '✨ Generer →'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '20px 24px 24px', display: 'grid', gap: 16 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 6 }}>✅ Plan generert!</div>
              <div style={{ fontSize: 13, color: '#374151', display: 'grid', gap: 3 }}>
                <div>📊 <strong>{preview.fdTasks?.length} faser</strong></div>
                <div>🗓 Startuke: <strong>U{preview.fdStartWeek}/{preview.fdStartYear}</strong></div>
                <div>⏱ Varighet: <strong>{preview.fdTotalWeeks} uker</strong></div>
                {preview.milepaler?.length > 0 && <div>📌 {preview.milepaler.length} milepæler</div>}
              </div>
            </div>

            <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              {(preview.fdTasks || []).map((t, i) => (
                <div key={t.id || i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
                  borderBottom: i < (preview.fdTasks?.length ?? 0) - 1 ? '1px solid #f1f5f9' : 'none', fontSize: 12,
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: fc(t.fag), flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 500, color: '#1e293b' }}>{t.name}</span>
                  <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{t.dur}d · dag {t.start}</span>
                  <span style={{ color: FAG[t.fag]?.color || '#888', fontSize: 10, minWidth: 60, textAlign: 'right' }}>{FAG[t.fag]?.label || t.fag}</span>
                </div>
              ))}
            </div>

            <div className="modal-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="btn" onClick={() => { setPreview(null); setFeil(''); }}>← Tilbake</button>
              <button className="btn" onClick={onClose}>Avbryt</button>
              {harEksisterende && (
                <button className="btn" style={{ borderColor: '#f59e0b', color: '#b45309' }}
                  onClick={() => onApply({ ...preview, replace: false })}>
                  ➕ Legg til i eksisterende
                </button>
              )}
              <button className="btn btn-primary"
                onClick={() => {
                  if (harEksisterende && !window.confirm('Erstatte eksisterende framdriftsplan?')) return;
                  onApply({ ...preview, replace: true });
                }}>
                {harEksisterende ? '🔄 Erstatt plan' : '✅ Bruk denne planen'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

  const ROW = 38, PAD = 240;
  const MILE_H = (project.fdMilepaler?.length > 0) ? 22 : 0;
  const TASK_TOP = 40 + MILE_H;
  const chartW = Math.max(totalDays * 18, 580) * zoom;
  const dw     = chartW / totalDays;
  const svgH   = Math.max(tasks.length * ROW + TASK_TOP + 16, 80);

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
            {MILE_H > 0 && (
              <rect x={0} y={40} width={PAD} height={MILE_H} fill="#faf5ff" />
            )}
            {tasks.map((t, i) => {
              const y = i * ROW + TASK_TOP;
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
                  <title>{t.name}</title>
                  {dropIdx === i && <rect x={0} y={y} width={PAD} height={2} fill="#2563eb" />}
                  <rect x={0} y={y} width={PAD} height={ROW} fill={done ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#fafafa'} />
                  <circle cx={12} cy={y + ROW / 2} r={5} fill={fc(t.fag)} opacity={done ? 0.4 : 1} />
                  <clipPath id={`nc${t.id}`}><rect x={24} y={y} width={PAD - 64} height={ROW} /></clipPath>
                  <text x={26} y={y + ROW / 2 + 5} fontSize={12} fill={done ? '#94a3b8' : '#1e293b'}
                    style={{ userSelect: 'none', textDecoration: done ? 'line-through' : 'none' }}
                    clipPath={`url(#nc${t.id})`}>
                    {t.name.length > 22 ? t.name.slice(0, 21) + '…' : t.name}
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
            {MILE_H > 0 && (
              <rect x={0} y={40} width={chartW} height={MILE_H} fill="#faf5ff" />
            )}
            {weeks.map((d, i) => {
              const { w } = wkNum(bw, by, Math.round(d / 7));
              return (
                <g key={d}>
                  <rect x={d * dw} y={TASK_TOP} width={7 * dw} height={svgH - TASK_TOP}
                    fill={i % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'rgba(0,0,0,0.03)'} />
                  <line x1={d * dw} y1={20} x2={d * dw} y2={svgH} stroke="#e2e8f0" strokeWidth={0.5} />
                  <text x={d * dw + 4} y={33} fontSize={10} fill="#94a3b8">U{w}</text>
                </g>
              );
            })}
            {tasks.map((t, i) => {
              const x  = t.start * dw;
              const w  = Math.max(t.dur * dw - 2, 6);
              const y  = i * ROW + TASK_TOP;
              const pct = t.pct ?? 0;
              const done = pct >= 100;
              const col  = fc(t.fag);
              return (
                <g key={t.id}>
                  <title>{t.name} · {t.dur} dager</title>
                  <rect x={x} y={y + 7} width={w} height={20} rx={5} fill={col} opacity={done ? 0.2 : 0.35}
                    style={{ cursor: 'grab' }} onMouseDown={e => startDrag(e, t.id, 'move')} />
                  {w * pct / 100 > 0 && (
                    <rect x={x} y={y + 7} width={w * pct / 100} height={20} rx={5} fill={col} opacity={done ? 0.65 : 0.85}
                      style={{ pointerEvents: 'none' }} />
                  )}
                  <clipPath id={`bc${t.id}`}><rect x={x + 4} y={y + 7} width={Math.max(w - 20, 0)} height={20} /></clipPath>
                  <text x={x + 6} y={y + 21} fontSize={10} fill="white" fontWeight="600"
                    style={{ pointerEvents: 'none' }} clipPath={`url(#bc${t.id})`}>{FAG_IKON[t.fag] || '■'} {t.dur}d</text>
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
            {MILE_H > 0 && (project.fdMilepaler || []).map((m, mi) => {
              const mx = (m.dagFraStart || 0) * dw;
              return (
                <g key={mi}>
                  <line x1={mx} y1={40} x2={mx} y2={svgH} stroke="#7c3aed" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
                  <polygon points={`${mx},${40+MILE_H-2} ${mx-4},${40+4} ${mx+4},${40+4}`} fill="#7c3aed" opacity={0.8} />
                  <text x={mx + 5} y={40 + MILE_H - 5} fontSize={8} fill="#7c3aed" fontWeight="700"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    d{m.dagFraStart}
                  </text>
                  <title>{m.navn} · dag {m.dagFraStart}</title>
                </g>
              );
            })}
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
  const [visGenModal, setVisGenModal] = useState(false);

  const { laster: aiLaster, feil: aiFeil, regenererMedAI } = useFramdriftAI(project, onUpdate);

  function handleAIApply({ fdTasks, fdStartWeek, fdStartYear, fdTotalWeeks, milepaler, replace }) {
    if (replace) {
      onUpdate({
        fdTasks,
        fdStartWeek,
        fdStartYear,
        fdTotalWeeks,
        fdMilepaler: milepaler || [],
        fdGenDato: new Date().toISOString(),
        fdGenAv: 'AI',
      });
    } else {
      const existing = project.fdTasks || [];
      const offset = existing.length ? Math.max(...existing.map(t => t.start + t.dur)) : 0;
      const merged = [
        ...existing,
        ...fdTasks.map(t => ({ ...t, id: uid(), start: t.start + offset })),
      ];
      const mergedMile = [
        ...(project.fdMilepaler || []),
        ...(milepaler || []).map(m => ({ ...m, dagFraStart: (m.dagFraStart || 0) + offset })),
      ];
      onUpdate({ fdTasks: merged, fdMilepaler: mergedMile });
    }
    setVisGenModal(false);
  }

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

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-sm fd2-ai-btn"
            onClick={() => setVisGenModal(true)}>
            ✨ Generer med AI
          </button>
          {project.kildeTilbudData && (
            <button className="btn btn-sm" style={{ fontSize: 11, padding: '4px 8px', color: '#64748b' }}
              onClick={regenererMedAI} disabled={aiLaster}
              title="Regenerer fra eksisterende tilbudsdata">
              {aiLaster ? <span className="fd2-spinner" /> : '🔄'}
            </button>
          )}
        </div>
      </div>

      {aiFeil && <div className="fd2-feil-banner">❌ {aiFeil}</div>}

      {visGenModal && (
        <GenererModal
          project={project}
          onClose={() => setVisGenModal(false)}
          onApply={handleAIApply}
        />
      )}

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

// ─── ProjectCard removed — replaced by inline list in main return ─────────────

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

  const medAIPlan  = aktive.filter(p => p.fdGenAv === 'AI' && p.kildeTilbudData).length;
  const utenPlan   = aktive.filter(p => !(p.fdTasks || []).length).length;
  const antForsinket = aktive.filter(p => p.fdStatus === 'Forsinket').length;
  const { week: nw, year: ny } = nowWeekYear();
  const krevOppmerksomhet = [
    ...aktive.filter(p => p.fdStatus === 'Forsinket').map(p => ({ p, ikon: '🔴', info: 'Forsinket' })),
    ...aktive.filter(p => {
      if ((p.fdTasks || []).length > 0 || !p.fdStartWeek) return false;
      const diff = (p.fdStartYear || ny) * 52 + p.fdStartWeek - ny * 52 - nw;
      return diff >= 0 && diff <= 8;
    }).map(p => {
      const diff = (p.fdStartYear || ny) * 52 + p.fdStartWeek - ny * 52 - nw;
      return { p, ikon: '🚀', info: `Starter om ${diff} uker — mangler plan` };
    }),
  ];

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
      {/* Header */}
      <div className="fd2-page-header">
        <div>
          <h2 className="fd2-page-tittel">Framdriftsplan</h2>
          <p className="fd2-page-sub">{aktive.length} aktive prosjekter · {medAIPlan} med AI-plan</p>
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
          {synkFeil && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 500 }}>⚠ {synkFeil}</span>}
        </div>
      </div>

      {/* Velg prosjekt */}
      <div className="fd2-velg-wrap">
        <select className="fd2-velg-select" value=""
          onChange={e => { if (e.target.value) setSelectedId(e.target.value); }}>
          <option value="" disabled>🔍 Velg prosjekt for å se framdriftsplan…</option>
          {[...aktive].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(p => (
            <option key={p.id} value={p.id}>
              {p.navn}
              {(p.fdTasks || []).length > 0 ? ' ✓' : ''}
              {p.fdGenAv === 'AI' ? ' ✨' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="fd2-dashboard-stats">
        {[
          { tall: aktive.length, label: 'Aktive prosjekter', color: '#1e293b' },
          { tall: medAIPlan,     label: '✨ AI-plan',          color: '#7c3aed' },
          { tall: utenPlan,      label: 'Mangler plan',        color: '#f59e0b' },
          ...(antForsinket > 0 ? [{ tall: antForsinket, label: '🔴 Forsinket', color: '#dc2626' }] : []),
        ].map((s, i) => (
          <div key={i} className="fd2-stat-boks" style={{ borderTop: `3px solid ${s.color}` }}>
            <div className="fd2-stat-tall" style={{ color: s.color }}>{s.tall}</div>
            <div className="fd2-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Krever oppmerksomhet */}
      {krevOppmerksomhet.length > 0 && (
        <div className="fd2-oppmerksomhet">
          <div className="fd2-oppmerksomhet-tittel">🔥 Krever oppmerksomhet</div>
          {krevOppmerksomhet.map(({ p, info, ikon }) => (
            <div key={p.id} className="fd2-oppmerksomhet-rad" onClick={() => setSelectedId(p.id)}>
              <span>{ikon}</span>
              <span className="fd2-oppm-navn">{p.navn}</span>
              <span className="fd2-oppm-info">{info}</span>
            </div>
          ))}
        </div>
      )}

      {/* Alle prosjekter — kompakt liste */}
      <div className="fd2-alle-liste">
        <div className="fd2-alle-tittel">Alle prosjekter ({aktive.length})</div>
        {[...aktive].sort((a, b) => {
          const so = { Forsinket: 0, Pågående: 1, 'Ikke startet': 2, Ferdig: 3 };
          const sa = so[a.fdStatus || 'Ikke startet'] ?? 2;
          const sb = so[b.fdStatus || 'Ikke startet'] ?? 2;
          return sa !== sb ? sa - sb : a.navn.localeCompare(b.navn, 'nb');
        }).map(p => {
          const tasks = p.fdTasks || [];
          const sc = STATUS_COLORS[p.fdStatus || 'Ikke startet'] ?? '#64748b';
          const harAI = p.fdGenAv === 'AI' && p.kildeTilbudData;
          return (
            <div key={p.id} className="fd2-prosjekt-rad" onClick={() => setSelectedId(p.id)}>
              <div className="fd2-rad-dot" style={{ background: sc }} />
              <div className="fd2-rad-navn">{p.navn}</div>
              <div className="fd2-rad-badges">
                {harAI && <span className="fd2-kilde-badge fd2-kilde-ai" style={{ fontSize: 10 }}>✨</span>}
                {tasks.length > 0
                  ? <span className="fd2-rad-info">{tasks.filter(t=>(t.pct??0)>=100).length}/{tasks.length} faser</span>
                  : <span className="fd2-rad-info" style={{ color: '#f59e0b' }}>Ingen plan</span>
                }
              </div>
              <span className="fd2-rad-status" style={{ color: sc }}>{p.fdStatus || 'Ikke startet'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
