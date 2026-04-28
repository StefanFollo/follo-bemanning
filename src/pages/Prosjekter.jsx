import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, PROSJEKT_PALETTE, isoToDate, dateToIso, daysBetween } from '../store';

function formaterBelop(belop) {
  if (!belop && belop !== 0) return null;
  const n = Number(belop);
  if (isNaN(n)) return null;
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n);
}

function varighetUker(startDato, sluttDato) {
  if (!startDato || !sluttDato) return null;
  const dager = daysBetween(startDato, sluttDato);
  if (dager < 0) return null;
  const uker = Math.ceil(dager / 7);
  return uker === 1 ? '1 uke' : `${uker} uker`;
}

const MND = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'];

function addDaysLocal(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateToIso(d);
}

function mondayOf(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return dateToIso(d);
}

// Bygg timeline-konfigurasjon for valgt modus
function buildTimeline(mode) {
  const todayIso = dateToIso(new Date());

  if (mode === 'maaned') {
    const now = new Date();
    const startD = new Date(now.getFullYear(), 0, 1);
    const tlStart = dateToIso(startD);
    const endD = new Date(startD.getFullYear() + 2, startD.getMonth(), startD.getDate());
    const tlDays = Math.round((endD - startD) / 86400000);
    const ticks = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(startD.getFullYear(), startD.getMonth() + i, 1);
      const pct = (Math.round((d - startD) / 86400000) / tlDays) * 100;
      ticks.push({ pct, label: d.getMonth() === 0 ? String(d.getFullYear()) : (i % 3 === 0 ? MND[d.getMonth()] : null) });
    }
    return { tlStart, tlDays, ticks, label: 'Tidslinje (2 år)' };
  }

  if (mode === 'uke') {
    const tlStart = mondayOf(todayIso);
    const tlDays = 26 * 7;
    const ticks = [];
    for (let w = 0; w < 26; w++) {
      const d = new Date(addDaysLocal(tlStart, w * 7) + 'T00:00:00');
      const pct = (w * 7 / tlDays) * 100;
      const mndStart = d.getDate() <= 7; // første uke i måneden
      ticks.push({ pct, label: mndStart ? MND[d.getMonth()] : (w % 4 === 0 ? `U${getWeekNr(d)}` : null) });
    }
    return { tlStart, tlDays, ticks, label: 'Tidslinje (26 uker)' };
  }

  // dag: 13 uker
  const tlStart = mondayOf(todayIso);
  const tlDays = 13 * 7;
  const ticks = [];
  for (let w = 0; w < 13; w++) {
    const d = new Date(addDaysLocal(tlStart, w * 7) + 'T00:00:00');
    const pct = (w * 7 / tlDays) * 100;
    ticks.push({ pct, label: `${d.getDate()}/${d.getMonth() + 1}` });
  }
  return { tlStart, tlDays, ticks, label: 'Tidslinje (13 uker)' };
}

function getWeekNr(d) {
  const tmp = new Date(d); tmp.setHours(0,0,0,0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay()+6)%7));
  const w = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp - w)/86400000 - 3 + ((w.getDay()+6)%7))/7);
}

function MiniGantt({ prosjekt, color, tlStart, tlDays, ticks }) {
  function pct(iso) {
    if (!iso) return null;
    const diff = Math.round((new Date(iso + 'T00:00:00') - new Date(tlStart + 'T00:00:00')) / 86400000);
    return Math.max(0, Math.min(100, (diff / tlDays) * 100));
  }
  const s = pct(prosjekt.startDato);
  const e = pct(prosjekt.sluttDato);
  const todayPct = pct(dateToIso(new Date()));

  return (
    <div className="proj-gantt-wrap">
      {ticks.map((t, i) => (
        <div key={i} className="proj-gantt-tick" style={{ left: `${t.pct}%` }}>
          {t.label && <span className="proj-gantt-tick-label">{t.label}</span>}
        </div>
      ))}
      {todayPct !== null && (
        <div className="proj-gantt-today" style={{ left: `${todayPct}%` }} title="I dag" />
      )}
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

const JOBB_TYPER = ['Ny bygg', 'Tilbygg', 'Tak jobb', 'Fasade jobb', 'Bad', 'Tømrer', 'Maling', 'Rørlegger', 'Flislegging', 'Elektro', 'Rehabilitering', 'Annet'];

const EMPTY = { navn: '', adresse: '', jobbType: '', startDato: '', sluttDato: '', status: 'jobber_med', beskrivelse: '', farge: PROSJEKT_PALETTE[0], belop: '', manskapAntall: '', prosjektlederId: '' };

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
  const [fullscreen, setFullscreen] = useState(false);
  const [tlMode, setTlMode] = useState('maaned');
  const [statusFilter, setStatusFilter] = useState(null);
  const [plFilter, setPlFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const tl = buildTimeline(tlMode);

  function sumKr(arr) {
    const total = arr.reduce((s, p) => s + (Number(p.belop) || 0), 0);
    return total > 0
      ? new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(total) + ' kr'
      : null;
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function sortIcon(key) {
    if (sortKey !== key) return <span className="ct-sort-icon">↕</span>;
    return <span className="ct-sort-icon ct-sort-icon--active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function sortProsjekter(arr) {
    if (!sortKey) return arr;
    return [...arr].sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case 'navn':      va = a.navn.toLowerCase(); vb = b.navn.toLowerCase(); break;
        case 'startDato': va = a.startDato || ''; vb = b.startDato || ''; break;
        case 'sluttDato': va = a.sluttDato || ''; vb = b.sluttDato || ''; break;
        case 'belop':     va = Number(a.belop) || 0; vb = Number(b.belop) || 0; break;
        case 'fremgang': {
          const oppA = state.oppgaver.filter(o => o.prosjektId === a.id);
          va = oppA.length ? oppA.reduce((s, o) => s + (o.fremgang || 0), 0) / oppA.length : -1;
          const oppB = state.oppgaver.filter(o => o.prosjektId === b.id);
          vb = oppB.length ? oppB.reduce((s, o) => s + (o.fremgang || 0), 0) / oppB.length : -1;
          break;
        }
        default: return 0;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function sluttDatoInfo(sluttDato, status) {
    if (!sluttDato || status === 'fullfort') return null;
    const dager = Math.round((new Date(sluttDato + 'T00:00:00') - new Date()) / 86400000);
    if (dager < 0)    return { farge: '#dc2626', bg: '#fff5f5', label: `${Math.abs(dager)}d over` };
    if (dager <= 7)   return { farge: '#dc2626', bg: '#fff5f5', label: `${dager}d igjen` };
    if (dager <= 14)  return { farge: '#f59e0b', bg: '#fffbeb', label: `${dager}d igjen` };
    return null;
  }

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

  const alleProsjekter = state.prosjekter.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      const pl = p.prosjektlederId ? state.ansatte.find(a => a.id === p.prosjektlederId) : null;
      const match =
        p.navn.toLowerCase().includes(q) ||
        (p.adresse || '').toLowerCase().includes(q) ||
        (p.jobbType || '').toLowerCase().includes(q) ||
        (p.beskrivelse || '').toLowerCase().includes(q) ||
        (pl?.navn || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (plFilter && p.prosjektlederId !== plFilter) return false;
    return true;
  });

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
    <div className={`page${fullscreen ? ' proj-fullscreen' : ''}`}>
      <div className="page-header">
        <h2>Prosjekter <span className="count-badge">{state.prosjekter.length}</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'}>
            {fullscreen ? '✕ Lukk' : '⛶ Fullskjerm'}
          </button>
          <button className="btn btn-primary" onClick={openNew}>+ Nytt prosjekt</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="proj-summary-cards">
        {summaryCards.map(card => {
          const aktiv = statusFilter === card.key;
          const gruppe = groups.find(g => g.key === card.key);
          const gruppeProsjekter = gruppe ? state.prosjekter.filter(p => gruppe.statuses.includes(p.status)) : [];
          const krSum = sumKr(gruppeProsjekter);
          return (
            <div
              key={card.key}
              className={`proj-summary-card${aktiv ? ' proj-summary-card--aktiv' : ''}`}
              style={{
                borderTop: `3px solid ${card.color}`,
                background: aktiv ? card.color : card.bg,
                cursor: 'pointer',
                transition: 'box-shadow .15s, transform .1s',
              }}
              onClick={() => setStatusFilter(f => f === card.key ? null : card.key)}
              title={aktiv ? 'Klikk for å fjerne filter' : `Filtrer på: ${card.label}`}
            >
              <div className="proj-summary-icon">{card.icon}</div>
              <div className="proj-summary-count" style={{ color: aktiv ? '#fff' : card.color }}>{card.count}</div>
              <div className="proj-summary-label" style={{ color: aktiv ? 'rgba(255,255,255,.85)' : undefined }}>{card.label}</div>
              {krSum && <div className="proj-summary-kr" style={{ color: aktiv ? 'rgba(255,255,255,.8)' : '#16a34a' }}>{krSum}</div>}
            </div>
          );
        })}
      </div>
      {statusFilter && (
        <div className="bef-filter-banner" style={{ marginBottom: 12 }}>
          Viser kun: <strong>{summaryCards.find(c => c.key === statusFilter)?.label}</strong>
          <button className="bef-filter-fjern" onClick={() => setStatusFilter(null)}>✕ Fjern filter</button>
        </div>
      )}

      {/* Search + filters */}
      <div className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <input
          className="search-input"
          placeholder="🔍 Søk navn, adresse, type, leder..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        {(() => {
          const plIds = [...new Set(state.prosjekter.map(p => p.prosjektlederId).filter(Boolean))];
          if (plIds.length === 0) return null;
          return (
            <select
              className="input"
              style={{ width: 200, height: 36, fontSize: 13 }}
              value={plFilter}
              onChange={e => setPlFilter(e.target.value)}
            >
              <option value="">Alle prosjektledere</option>
              {plIds.map(id => {
                const a = state.ansatte.find(x => x.id === id);
                return a ? <option key={id} value={id}>{a.navn}</option> : null;
              })}
            </select>
          );
        })()}
        {(search || plFilter) && (
          <button className="btn btn-sm" onClick={() => { setSearch(''); setPlFilter(''); }}>✕ Tøm filter</button>
        )}
      </div>

      {/* Grouped sections */}
      {groups.map(group => {
        if (statusFilter && statusFilter !== group.key) return null;
        const prosjekter = alleProsjekter.filter(p => group.statuses.includes(p.status));
        if (prosjekter.length === 0 && !search && !plFilter && !statusFilter) return null;
        const isCollapsed = collapsed[group.key];
        const color = STATUS_COLORS[group.key];
        const krSum = sumKr(prosjekter);

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
              {krSum && <span className="proj-gruppe-kr">{krSum}</span>}
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
                    <div className="ct-col ct-name">
                      <button className="ct-sort-btn" onClick={() => toggleSort('navn')}>
                        Prosjektnavn {sortIcon('navn')}
                      </button>
                    </div>
                    <div className="ct-col ct-gantt" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button className="ct-sort-btn" onClick={() => toggleSort('startDato')}>
                        {tl.label} {sortIcon('startDato')}
                      </button>
                      <div className="ukemode-toggle" style={{ marginLeft: 'auto' }}>
                        <button className={`ukemode-btn ${tlMode==='dag'?'active':''}`} onClick={() => setTlMode('dag')}>Dag</button>
                        <button className={`ukemode-btn ${tlMode==='uke'?'active':''}`} onClick={() => setTlMode('uke')}>Uke</button>
                        <button className={`ukemode-btn ${tlMode==='maaned'?'active':''}`} onClick={() => setTlMode('maaned')}>Måned</button>
                      </div>
                    </div>
                    <div className="ct-col ct-progress">
                      <button className="ct-sort-btn" onClick={() => toggleSort('fremgang')}>
                        Fremdrift {sortIcon('fremgang')}
                      </button>
                    </div>
                    <div className="ct-col ct-actions">
                      <button className="ct-sort-btn" onClick={() => toggleSort('belop')}>
                        💰 Beløp {sortIcon('belop')}
                      </button>
                    </div>
                  </div>
                  {sortProsjekter(prosjekter).map(p => {
                    const opp = state.oppgaver.filter(o => o.prosjektId === p.id);
                    const fremgang = opp.length
                      ? Math.round(opp.reduce((s, o) => s + (o.fremgang || 0), 0) / opp.length)
                      : null;
                    const tildelinger = state.tildelinger.filter(t => t.prosjektId === p.id);
                    const ansatteIds = [...new Set(tildelinger.map(t => t.ansattId))];
                    const ansatteCount = ansatteIds.length;
                    const ansatteNavn = ansatteIds.map(id => state.ansatte.find(a => a.id === id)).filter(Boolean);
                    const barColor = p.farge || color;
                    const belopVis = formaterBelop(p.belop);
                    const varighetVis = varighetUker(p.startDato, p.sluttDato);
                    const prosjektleder = p.prosjektlederId
                      ? state.ansatte.find(a => a.id === p.prosjektlederId)
                      : null;
                    const varsel = sluttDatoInfo(p.sluttDato, p.status);
                    const isExpanded = expandedId === p.id;

                    return (
                      <div key={p.id} className="ct-row-wrap">
                        <div
                          className={`ct-row${varsel ? ' ct-row--varsel' : ''}${isExpanded ? ' ct-row--expanded' : ''}`}
                          style={{ background: varsel?.bg, cursor: 'pointer' }}
                          onClick={() => setExpandedId(id => id === p.id ? null : p.id)}
                        >
                          <div className="ct-col ct-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="prosjekt-farge-dot" style={{ background: barColor }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span className="ct-prosjekt-navn">{p.navn}</span>
                                <span className="ct-expand-chevron">{isExpanded ? '▾' : '▸'}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
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
                                  <span style={{ fontSize: 11, color: varsel ? varsel.farge : '#94a3b8', fontWeight: varsel ? 600 : 400 }}>
                                    {formatDate(p.startDato)}{p.sluttDato ? ` – ${formatDate(p.sluttDato)}` : ''}
                                    {varsel && <em style={{ marginLeft: 4 }}>({varsel.label})</em>}
                                  </span>
                                )}
                                {varighetVis && <span className="proj-meta-pill">⏱ {varighetVis}</span>}
                                {belopVis && <span className="proj-meta-pill proj-meta-belop">💰 {belopVis}</span>}
                                {p.manskapAntall && <span className="proj-meta-pill">👷 {p.manskapAntall} mann</span>}
                                {prosjektleder && (
                                  <span className="proj-meta-pill proj-meta-pl">
                                    🧑‍💼 {prosjektleder.navn.split(' ')[0]}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="ct-col ct-gantt">
                            <MiniGantt prosjekt={p} color={barColor} tlStart={tl.tlStart} tlDays={tl.tlDays} ticks={tl.ticks} />
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
                          <div className="ct-col ct-actions" onClick={e => e.stopPropagation()}>
                            <select
                              className="proj-status-select"
                              value={normStatus(p.status)}
                              title="Endre status"
                              onChange={e => dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, status: e.target.value } })}
                            >
                              {SAVE_STATUSES.map(s => (
                                <option key={s} value={s}>{SAVE_LABELS[s]}</option>
                              ))}
                            </select>
                            <button className="btn btn-sm" onClick={() => openEdit(p)}>Rediger</button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Slett</button>
                          </div>
                        </div>

                        {/* Utvidet detaljpanel */}
                        {isExpanded && (
                          <div className="ct-row-detail" style={{ borderLeft: `4px solid ${barColor}` }}>
                            {/* Fra befaring */}
                            {p.befaringId && (() => {
                              const bef = (state.befaringer || []).find(b => b.id === p.befaringId);
                              if (!bef) return null;
                              return (
                                <div className="ct-detail-seksjon ct-detail-fra-befaring">
                                  <div className="ct-detail-tittel">📋 Fra befaring</div>
                                  <div className="ct-detail-rad">
                                    <span className="ct-detail-navn">{bef.kontaktNavn}</span>
                                    {bef.adresse && <span className="ct-detail-fag">📍 {bef.adresse}</span>}
                                    {bef.jobbType && <span className="ct-detail-fag">{bef.jobbType}</span>}
                                    {bef.estimertBelop && (
                                      <span className="ct-detail-fag" style={{ color: '#16a34a' }}>
                                        💰 {new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(bef.estimertBelop))}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            {p.beskrivelse && (
                              <div className="ct-detail-seksjon">
                                <div className="ct-detail-tittel">📝 Beskrivelse</div>
                                <div className="ct-detail-tekst">{p.beskrivelse}</div>
                              </div>
                            )}
                            <div className="ct-detail-grid">
                              {/* Tildelinger */}
                              <div className="ct-detail-seksjon">
                                <div className="ct-detail-tittel">👷 Tildelinger ({tildelinger.length})</div>
                                {tildelinger.length === 0 ? (
                                  <div className="ct-detail-tom">Ingen tildelinger registrert</div>
                                ) : (
                                  tildelinger.map(t => {
                                    const ansatt = state.ansatte.find(a => a.id === t.ansattId);
                                    if (!ansatt) return null;
                                    return (
                                      <div key={t.id} className="ct-detail-rad">
                                        <span className="ct-detail-dot" style={{ background: FAG_COLORS[ansatt.fag] || barColor }} />
                                        <span className="ct-detail-navn">{ansatt.navn}</span>
                                        {ansatt.fag && <span className="ct-detail-fag">{ansatt.fag}</span>}
                                        <span className="ct-detail-dato">
                                          {t.startDato ? formatDate(t.startDato) : '?'}
                                          {t.sluttDato ? ` – ${formatDate(t.sluttDato)}` : ''}
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              {/* Oppgaver */}
                              {opp.length > 0 && (
                                <div className="ct-detail-seksjon">
                                  <div className="ct-detail-tittel">✅ Oppgaver ({opp.length})</div>
                                  {opp.map(o => (
                                    <div key={o.id} className="ct-detail-opp">
                                      <span className="ct-detail-navn">{o.navn || o.name || o.tittel || 'Oppgave'}</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
                                        <div className="progress-bar" style={{ flex: 1, height: 4 }}>
                                          <div className="progress-fill" style={{ width: (o.fremgang || 0) + '%', background: barColor }} />
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', minWidth: 28 }}>{o.fremgang || 0}%</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
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
            <label>Type jobb</label>
            <select value={form.jobbType || ''} onChange={e => setForm(f => ({ ...f, jobbType: e.target.value }))}>
              <option value="">– Velg type –</option>
              {JOBB_TYPER.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
            <label>Prosjektleder</label>
            <select value={form.prosjektlederId || ''} onChange={e => setForm(f => ({ ...f, prosjektlederId: e.target.value }))}>
              <option value="">– Ingen valgt –</option>
              {[...state.ansatte]
                .sort((a, b) => a.navn.localeCompare(b.navn, 'nb'))
                .map(a => (
                  <option key={a.id} value={a.id}>{a.navn}{a.fag ? ` (${a.fag})` : ''}</option>
                ))}
            </select>
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
            <div className="form-row">
              <div>
                <label>Kontraktssum (NOK)</label>
                <input type="number" min="0" step="1000" value={form.belop} onChange={e => setForm(f => ({ ...f, belop: e.target.value }))} placeholder="f.eks. 850000" />
              </div>
              <div>
                <label>Manskap (antall)</label>
                <input type="number" min="1" max="50" value={form.manskapAntall} onChange={e => setForm(f => ({ ...f, manskapAntall: e.target.value }))} placeholder="f.eks. 4" />
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
              {editing && normStatus(form.status) !== 'fullfort' && (
                <button className="btn btn-success" onClick={() => {
                  setForm(f => ({ ...f, status: 'fullfort' }));
                  dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...form, id: editing.id, status: 'fullfort' } });
                  setShowModal(false);
                }}>🏁 Prosjekt ferdig</button>
              )}
              <button className="btn btn-primary" onClick={handleSave}>Lagre</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
