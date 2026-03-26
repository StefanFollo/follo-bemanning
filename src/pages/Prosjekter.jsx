import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, PROSJEKT_PALETTE, isoToDate, dateToIso } from '../store';

// Timeline spanning current + next year (24 months)
function buildTimelineMonths() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1); // Jan this year
  const months = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    months.push({
      iso: dateToIso(d).slice(0, 7),
      label: ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'][d.getMonth()],
      year: d.getFullYear(),
      isFirstOfYear: d.getMonth() === 0,
    });
  }
  return months;
}

const TIMELINE_MONTHS = buildTimelineMonths();
const TL_START = TIMELINE_MONTHS[0].iso + '-01';
const TL_END_D = new Date(TL_START);
TL_END_D.setMonth(TL_END_D.getMonth() + 24);
const TL_DAYS = Math.round((TL_END_D - new Date(TL_START + 'T00:00:00')) / 86400000);

function pctInTimeline(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00');
  const start = new Date(TL_START + 'T00:00:00');
  const diff = Math.round((d - start) / 86400000);
  return Math.max(0, Math.min(100, (diff / TL_DAYS) * 100));
}

function MiniGantt({ prosjekt, color }) {
  const s = pctInTimeline(prosjekt.startDato);
  const e = pctInTimeline(prosjekt.sluttDato);
  const today = pctInTimeline(dateToIso(new Date()));

  return (
    <div className="proj-gantt-wrap">
      {/* Month ticks */}
      {TIMELINE_MONTHS.map((m, i) => (
        <div key={m.iso}
          className="proj-gantt-tick"
          style={{ left: `${(i / TIMELINE_MONTHS.length) * 100}%` }}>
          {(i % 3 === 0) && (
            <span className="proj-gantt-tick-label">
              {m.isFirstOfYear ? m.year : m.label}
            </span>
          )}
        </div>
      ))}
      {/* Today line */}
      {today !== null && (
        <div className="proj-gantt-today" style={{ left: `${today}%` }} title="I dag" />
      )}
      {/* Project bar */}
      {s !== null && e !== null ? (
        <div className="proj-gantt-bar"
          style={{ left: `${s}%`, width: `${Math.max(0.5, e - s)}%`, background: color }}
          title={`${formatDate(prosjekt.startDato)} – ${formatDate(prosjekt.sluttDato)}`}
        />
      ) : s !== null ? (
        <div className="proj-gantt-bar proj-gantt-bar-open"
          style={{ left: `${s}%`, width: `${100 - s}%`, background: color, opacity: 0.5 }}
          title={`Start: ${formatDate(prosjekt.startDato)}`}
        />
      ) : null}
    </div>
  );
}

const FAG_COLORS = {
  'Bas Tømrer': '#f59e0b', 'Montør': '#3b82f6', 'Lærling Tømrer': '#16a34a',
  'Maler': '#ec4899', 'Rørlegger': '#06b6d4', 'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316', 'Prosjektleder': '#0ea5e9',
};

// Backward-compat: 'planlagt' vises som 'Vi jobber med', 'aktiv' som 'Pågående'
const STATUS_LABELS = {
  jobber_med: 'Vi jobber med',
  planlagt:   'Vi jobber med',  // legacy
  godkjent:   'Godkjent',
  aktiv:      'Pågående',
  pagaende:   'Pågående',       // legacy alias
  fullfort:   'Fullført',
};

const STATUS_COLORS = {
  jobber_med: '#f59e0b',
  planlagt:   '#f59e0b',
  godkjent:   '#16a34a',
  aktiv:      '#2563eb',
  pagaende:   '#2563eb',
  fullfort:   '#64748b',
};

const STATUS_BG = {
  jobber_med: '#fffbeb',
  planlagt:   '#fffbeb',
  godkjent:   '#f0fdf4',
  aktiv:      '#eff6ff',
  pagaende:   '#eff6ff',
  fullfort:   '#f8fafc',
};

// Canonical save-values (new records use these)
const SAVE_STATUSES = ['jobber_med', 'godkjent', 'aktiv', 'fullfort'];
const SAVE_LABELS   = { jobber_med: 'Vi jobber med', godkjent: 'Godkjent', aktiv: 'Pågående', fullfort: 'Fullført' };

// Grupperingsrekkefølge for display
const GROUP_ORDER = ['aktiv', 'pagaende', 'godkjent', 'jobber_med', 'planlagt', 'fullfort'];

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

function nextAutoColor(prosjekter) {
  const used = prosjekter.map(p => p.farge).filter(Boolean);
  return PROSJEKT_PALETTE.find(c => !used.includes(c)) || PROSJEKT_PALETTE[prosjekter.length % PROSJEKT_PALETTE.length];
}

const EMPTY = { navn: '', adresse: '', startDato: '', sluttDato: '', status: 'jobber_med', beskrivelse: '', farge: PROSJEKT_PALETTE[0] };

// Normaliser gammel status til visningsgruppe
function normStatus(s) {
  if (s === 'planlagt') return 'jobber_med';
  if (s === 'pagaende') return 'aktiv';
  return s;
}

export default function Prosjekter() {
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, farge: nextAutoColor(state.prosjekter) });
    setShowModal(true);
  }

  function openEdit(p) {
    setEditing(p);
    setForm({ ...p });
    setShowModal(true);
  }

  function handleSave() {
    if (!form.navn.trim()) return;
    if (editing) {
      dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...form, id: editing.id } });
    } else {
      dispatch({ type: 'ADD_PROSJEKT', payload: form });
    }
    setShowModal(false);
  }

  function handleDelete(id) {
    if (confirm('Slett prosjekt og alle tilknyttede tildelinger og oppgaver?')) {
      dispatch({ type: 'DELETE_PROSJEKT', id });
    }
  }

  function toggleCollapse(key) {
    setCollapsed(c => ({ ...c, [key]: !c[key] }));
  }

  const alleProsjekter = state.prosjekter.filter(
    p => !search || p.navn.toLowerCase().includes(search.toLowerCase()) || (p.adresse || '').toLowerCase().includes(search.toLowerCase())
  );

  // Summary counts (normalized)
  const counts = { jobber_med: 0, godkjent: 0, aktiv: 0, fullfort: 0 };
  for (const p of state.prosjekter) counts[normStatus(p.status)] = (counts[normStatus(p.status)] || 0) + 1;

  // Group projects
  const groups = [
    { key: 'aktiv',      label: 'Pågående prosjekter',       statuses: ['aktiv', 'pagaende'],    icon: '🔨' },
    { key: 'godkjent',   label: 'Godkjente prosjekter',      statuses: ['godkjent'],              icon: '✅' },
    { key: 'jobber_med', label: 'Vi jobber med',             statuses: ['jobber_med', 'planlagt'], icon: '📋' },
    { key: 'fullfort',   label: 'Fullførte prosjekter',      statuses: ['fullfort'],              icon: '🏁' },
  ];

  const summaryCards = [
    { key: 'aktiv',      label: 'Pågående',       icon: '🔨', count: counts.aktiv      || 0, color: STATUS_COLORS.aktiv,      bg: STATUS_BG.aktiv },
    { key: 'godkjent',   label: 'Godkjent',       icon: '✅', count: counts.godkjent   || 0, color: STATUS_COLORS.godkjent,   bg: STATUS_BG.godkjent },
    { key: 'jobber_med', label: 'Vi jobber med',  icon: '📋', count: counts.jobber_med || 0, color: STATUS_COLORS.jobber_med, bg: STATUS_BG.jobber_med },
    { key: 'fullfort',   label: 'Fullført',       icon: '🏁', count: counts.fullfort   || 0, color: STATUS_COLORS.fullfort,   bg: STATUS_BG.fullfort },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Prosjekter <span className="count-badge">{state.prosjekter.length}</span></h2>
        <button className="btn btn-primary" onClick={openNew}>+ Nytt prosjekt</button>
      </div>

      {/* Summary cards */}
      <div className="proj-summary-cards">
        {summaryCards.map(card => (
          <div key={card.key} className="proj-summary-card" style={{ borderTop: `3px solid ${card.color}`, background: card.bg }}>
            <div className="proj-summary-icon">{card.icon}</div>
            <div className="proj-summary-count" style={{ color: card.color }}>{card.count}</div>
            <div className="proj-summary-label">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input
          className="search-input"
          placeholder="Søk prosjekt eller adresse..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        {search && (
          <button className="btn btn-sm" onClick={() => setSearch('')} style={{ marginLeft: 8 }}>✕ Tøm</button>
        )}
      </div>

      {/* Grouped sections */}
      {groups.map(group => {
        const prosjekter = alleProsjekter.filter(p => group.statuses.includes(p.status));
        if (prosjekter.length === 0 && !search) return null;
        const isCollapsed = collapsed[group.key];
        const color = STATUS_COLORS[group.key];

        return (
          <div key={group.key} className="proj-gruppe" style={{ marginBottom: 20 }}>
            {/* Group header */}
            <button
              className="proj-gruppe-header"
              style={{ borderLeft: `4px solid ${color}` }}
              onClick={() => toggleCollapse(group.key)}
            >
              <span className="proj-gruppe-icon">{group.icon}</span>
              <span className="proj-gruppe-label">{group.label}</span>
              <span className="proj-gruppe-count" style={{ background: color }}>{prosjekter.length}</span>
              <span className="proj-gruppe-chevron">{isCollapsed ? '▸' : '▾'}</span>
            </button>

            {/* Table */}
            {!isCollapsed && (
              prosjekter.length === 0 ? (
                <div style={{ padding: '10px 16px', color: '#94a3b8', fontSize: 13 }}>
                  Ingen prosjekter{search ? ' som matcher søket' : ''}.
                </div>
              ) : (
                <div className="compact-table">
                  <div className="ct-header">
                    <div className="ct-col ct-name">Prosjektnavn</div>
                    <div className="ct-col ct-gantt">Tidslinje (2 år)</div>
                    <div className="ct-col ct-progress">Fremdrift</div>
                    <div className="ct-col ct-actions"></div>
                  </div>
                  {prosjekter.map(p => {
                    const opp = state.oppgaver.filter(o => o.prosjektId === p.id);
                    const fremgang = opp.length
                      ? Math.round(opp.reduce((s, o) => s + (o.fremgang || 0), 0) / opp.length)
                      : null;
                    const tildelinger = state.tildelinger.filter(t => t.prosjektId === p.id);
                    const ansatteIds = [...new Set(tildelinger.map(t => t.ansattId))];
                    const ansatteCount = ansatteIds.length;
                    const ansatteNavn = ansatteIds.map(id => state.ansatte.find(a => a.id === id)).filter(Boolean);
                    const barColor = p.farge || color;

                    return (
                      <div className="ct-row" key={p.id}>
                        <div className="ct-col ct-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="prosjekt-farge-dot" style={{ background: barColor }} />
                          <div>
                            <span className="ct-prosjekt-navn">{p.navn}</span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                              {p.adresse && <span className="ct-sub">{p.adresse}</span>}
                              {ansatteCount > 0 && (
                                <span className="ansatte-tooltip-wrap">
                                  <span className="ansatte-badge">👷 {ansatteCount}</span>
                                  <div className="ansatte-tooltip">
                                    <div className="ansatte-tooltip-tittel">Tildelte ansatte</div>
                                    {ansatteNavn.map(a => (
                                      <div key={a.id} className="ansatte-tooltip-rad">
                                        <span className="ansatte-tooltip-dot" style={{ background: FAG_COLORS[a.fag] || '#6b7280' }} />
                                        {a.navn}
                                      </div>
                                    ))}
                                  </div>
                                </span>
                              )}
                              {p.startDato && (
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                  {formatDate(p.startDato)}{p.sluttDato ? ` – ${formatDate(p.sluttDato)}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="ct-col ct-gantt">
                          <MiniGantt prosjekt={p} color={barColor} />
                        </div>
                        <div className="ct-col ct-progress">
                          {fremgang !== null ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div className="progress-bar" style={{ flex: 1 }}>
                                <div className="progress-fill" style={{ width: fremgang + '%', background: barColor }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 30 }}>{fremgang}%</span>
                            </div>
                          ) : <span style={{ color: '#cbd5e1', fontSize: 12 }}>–</span>}
                        </div>
                        <div className="ct-col ct-actions">
                          <button className="btn btn-sm" onClick={() => openEdit(p)}>Rediger</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Slett</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        );
      })}

      {alleProsjekter.length === 0 && search && (
        <div className="empty">Ingen prosjekter matcher «{search}».</div>
      )}

      {/* Modal */}
      {showModal && (
        <Modal title={editing ? 'Rediger prosjekt' : 'Nytt prosjekt'} onClose={() => setShowModal(false)}>
          <div className="form">
            <label>Prosjektnavn *</label>
            <input value={form.navn} onChange={e => setForm(f => ({ ...f, navn: e.target.value }))} placeholder="Prosjektnavn" />
            <label>Adresse</label>
            <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="Adresse" />
            <label>Status</label>
            <select value={normStatus(form.status)} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {SAVE_STATUSES.map(s => (
                <option key={s} value={s}>{SAVE_LABELS[s]}</option>
              ))}
            </select>
            <div className="form-row">
              <div>
                <label>Startdato</label>
                <input type="date" value={form.startDato} onChange={e => setForm(f => ({ ...f, startDato: e.target.value }))} />
              </div>
              <div>
                <label>Sluttdato</label>
                <input type="date" value={form.sluttDato} onChange={e => setForm(f => ({ ...f, sluttDato: e.target.value }))} />
              </div>
            </div>
            <label>Prosjektfarge</label>
            <div className="farge-picker">
              {PROSJEKT_PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`farge-swatch ${form.farge === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setForm(f => ({ ...f, farge: c }))}
                  title={c}
                />
              ))}
            </div>
            <label>Beskrivelse</label>
            <textarea value={form.beskrivelse} onChange={e => setForm(f => ({ ...f, beskrivelse: e.target.value }))} rows={2} placeholder="Valgfri beskrivelse" />
            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button className="btn btn-primary" onClick={handleSave}>Lagre</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
