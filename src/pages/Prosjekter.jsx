import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, PROSJEKT_PALETTE, isoToDate, dateToIso, daysBetween } from '../store';
import { StatusFaner, KompaktRad } from '../komponenter/Designsystem';

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

// ─── Framdriftsplan Gantt ─────────────────────────────────────────────────────

const FAG_GANTT = {
  tomrer: '#185FA5', flis: '#BA7517', elektriker: '#E24B4A',
  rorlegger: '#0F6E56', ventilasjon: '#7F77DD',
  maling: '#D4537E', ferdig: '#3B6D11', annet: '#888780',
}
function fagFarge(fag) {
  const k = Array.isArray(fag) ? fag[0] : fag
  return FAG_GANTT[k] || '#888780'
}

// Konverterer gammelt fdTasks-format (fra tilbuds-appen) til nytt framdriftsplan-format
function fdTasksTilFramdrift(project) {
  const { fdTasks = [], fdStartWeek, fdStartYear, fdTotalWeeks, fdMilepaler = [], fdGenDato, fdGenAv } = project
  const oppstartUke = fdStartWeek || 31
  return {
    generertDato: fdGenDato || new Date().toISOString(),
    generertAv: fdGenAv || 'AI',
    versjon: 1,
    oppstartUke,
    oppstartAar: fdStartYear || 2026,
    totalVarighetUker: fdTotalWeeks || 12,
    bufferProsent: 15,
    faser: fdTasks.map(t => ({
      id: t.id,
      navn: t.name,
      fag: [t.fag || 'annet'],
      startUke: oppstartUke + Math.floor((t.start || 0) / 5),
      varighetDager: t.dur || 5,
      timer: 0,
      mannskap: 2,
      kritisk: false,
      venterPaa: [],
      beskrivelse: '',
      status: (t.pct || 0) >= 100 ? 'ferdig' : (t.pct || 0) > 0 ? 'pagar' : 'planlagt',
    })),
    milepaler: (fdMilepaler || []).map((m, i) => ({
      id: `mil-${i + 1}`,
      navn: m.navn || 'Milepæl',
      uke: oppstartUke + Math.floor((m.dagFraStart || 0) / 5),
      kritisk: false,
      type: 'teknisk',
      beskrivelse: '',
    })),
    kritiskSti: [],
    advarsler: [],
    _fraFdTasks: true,  // markør: konvertert fra gammelt format
  }
}

function ProsjektFramdrift({ project, laster, feil, onGenerer }) {
  const [valgtFase, setValgtFase] = useState(null)

  // Bruker nytt framdriftsplan-objekt hvis det finnes, ellers konverterer gammelt fdTasks
  const harNyttFormat = Boolean(project.framdriftsplan)
  const harGammeltFormat = Array.isArray(project.fdTasks) && project.fdTasks.length > 0
  const fd = project.framdriftsplan || (harGammeltFormat ? fdTasksTilFramdrift(project) : null)

  if (laster) {
    return (
      <div className="fd-tom">
        <div style={{ fontSize: 22 }}>⏳</div>
        <div style={{ fontWeight: 600 }}>Genererer framdriftsplan med AI…</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Tar 10–20 sekunder</div>
      </div>
    )
  }

  if (!fd) {
    return (
      <div className="fd-tom">
        <div>🗓 Ingen framdriftsplan generert ennå</div>
        {project.kildeTilbudData ? (
          <button className="btn btn-primary" onClick={onGenerer}>✨ Generer framdriftsplan med AI</button>
        ) : (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Prosjektet må opprettes fra tilbuds-appen for å bruke AI-generering.
          </div>
        )}
        {feil && <div className="fd-feil" style={{ marginTop: 10 }}>❌ {feil}</div>}
      </div>
    )
  }

  const {
    faser = [], milepaler = [],
    oppstartUke = 31, totalVarighetUker = 12,
    generertDato, versjon, advarsler = [],
  } = fd

  const visUker = Math.max(
    totalVarighetUker + 2, 8,
    faser.reduce((mx, f) => {
      const slutt = (f.startUke - oppstartUke) + Math.ceil(f.varighetDager / 5) + 1
      return slutt > mx ? slutt : mx
    }, 8)
  )
  const ukeArr = Array.from({ length: visUker }, (_, i) => oppstartUke + i)
  const iDagUke = getWeekNr(new Date())

  function fasePosisjon(fase) {
    const startOffset = fase.startUke - oppstartUke
    const breddeUker = Math.max(1, Math.ceil(fase.varighetDager / 5))
    const left = Math.max(0, (startOffset / visUker) * 100)
    const width = Math.min((breddeUker / visUker) * 100, 100 - left)
    return { left: `${left}%`, width: `${Math.max(width, 1.5)}%` }
  }

  return (
    <div className="fd-seksjon">
      <div className="fd-header">
        {fd._fraFdTasks ? (
          <span className="fd-meta-badge" style={{ background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
            ✨ Fra tilbuds-appen
          </span>
        ) : (
          <span className="fd-meta-badge">✨ AI-generert</span>
        )}
        <span className="fd-meta">
          {generertDato ? new Date(generertDato).toLocaleDateString('nb-NO') : ''}
          {versjon > 1 ? ` · v${versjon}` : ''}
          {totalVarighetUker ? ` · ${totalVarighetUker} uker` : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {project.kildeTilbudData && (
            <button className="btn btn-sm" onClick={onGenerer} title="Generer ny detaljert plan med AI">
              ✨ {fd._fraFdTasks ? 'Generer ny med AI' : 'Regenerer'}
            </button>
          )}
        </div>
      </div>

      {feil && <div className="fd-feil">❌ {feil}</div>}

      {advarsler.length > 0 && (
        <div className="fd-advarsler">
          {advarsler.map((a, i) => <div key={i} className="fd-advarsel">⚠️ {a}</div>)}
        </div>
      )}

      <div className="fd-gantt">
        <div className="fd-gantt-inner">
          <div className="fd-gantt-header">
            {ukeArr.map(u => (
              <div key={u} className={`fd-gantt-uke${u === iDagUke ? ' idag' : ''}`}>U{u}</div>
            ))}
          </div>
          <div className="fd-gantt-rader">
            {faser.map(fase => {
              const pos = fasePosisjon(fase)
              const farge = fagFarge(fase.fag)
              return (
                <div key={fase.id} className="fd-gantt-rad">
                  <div
                    className="fd-gantt-navn"
                    onClick={() => setValgtFase(v => v?.id === fase.id ? null : fase)}
                    title={fase.navn}
                  >
                    {fase.kritisk && <span style={{ marginRight: 2 }}>🔴</span>}
                    {fase.navn}
                  </div>
                  <div className="fd-gantt-track" style={{ '--uke-w': `${100 / visUker}%` }}>
                    <div
                      className={`fd-gantt-bar${fase.kritisk ? ' fd-gantt-bar--kritisk' : ''}`}
                      style={{ ...pos, background: farge }}
                      onClick={() => setValgtFase(v => v?.id === fase.id ? null : fase)}
                      title={`${fase.navn} — ${fase.varighetDager} dager`}
                    >
                      <span className="fd-gantt-bar-label">{fase.navn}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {milepaler.length > 0 && (
            <div className="fd-gantt-milepaler">
              {milepaler.map(m => {
                const leftPct = ((m.uke - oppstartUke + 0.5) / visUker) * 100
                if (leftPct < 0 || leftPct > 100) return null
                return (
                  <div
                    key={m.id}
                    className={`fd-gantt-mil${m.kritisk ? ' fd-gantt-mil--kritisk' : ''}`}
                    style={{ left: `${leftPct}%` }}
                    title={m.beskrivelse || m.navn}
                  >
                    <span className="fd-gantt-mil-pin">{m.kritisk ? '📌' : '🚩'}</span>
                    <span className="fd-gantt-mil-label">{m.navn}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {milepaler.length > 0 && (
        <div className="fd-milepaler">
          {milepaler.map(m => (
            <span
              key={m.id}
              className={`fd-milepael-chip${m.kritisk ? ' fd-milepael-chip--kritisk' : ''}`}
              title={m.beskrivelse}
            >
              {m.kritisk ? '📌' : '🚩'} U{m.uke} — {m.navn}
            </span>
          ))}
        </div>
      )}

      {valgtFase && (
        <div className="fd-fase-modal-overlay" onClick={() => setValgtFase(null)}>
          <div className="fd-fase-modal" onClick={e => e.stopPropagation()}>
            <div className="fd-fase-modal-header">
              <div className="fd-fase-modal-tittel">
                <span className="fd-fase-modal-fag-dot" style={{ background: fagFarge(valgtFase.fag) }} />
                {valgtFase.navn}
                {valgtFase.kritisk && (
                  <span style={{ marginLeft: 8, color: '#dc2626', fontSize: 12 }}>🔴 Kritisk fase</span>
                )}
              </div>
              <button className="btn-icon" onClick={() => setValgtFase(null)}>✕</button>
            </div>
            <div className="fd-fase-modal-grid">
              <div className="fd-fase-modal-felt">
                <span className="fd-fase-modal-felt-label">Startuke</span>
                <span className="fd-fase-modal-felt-verdi">Uke {valgtFase.startUke}</span>
              </div>
              <div className="fd-fase-modal-felt">
                <span className="fd-fase-modal-felt-label">Varighet</span>
                <span className="fd-fase-modal-felt-verdi">{valgtFase.varighetDager} dager</span>
              </div>
              <div className="fd-fase-modal-felt">
                <span className="fd-fase-modal-felt-label">Timer</span>
                <span className="fd-fase-modal-felt-verdi">{valgtFase.timer || '–'}</span>
              </div>
              <div className="fd-fase-modal-felt">
                <span className="fd-fase-modal-felt-label">Mannskap</span>
                <span className="fd-fase-modal-felt-verdi">
                  {valgtFase.mannskap} person{valgtFase.mannskap !== 1 ? 'er' : ''}
                </span>
              </div>
              {valgtFase.beskrivelse && (
                <div className="fd-fase-modal-beskrivelse">
                  <span className="fd-fase-modal-felt-label">Beskrivelse</span>
                  <div style={{ marginTop: 2 }}>{valgtFase.beskrivelse}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
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

const EMPTY = { navn: '', adresse: '', kundeNavn: '', kundeTlf: '', kundeEpost: '', jobbType: '', startDato: '', sluttDato: '', status: 'jobber_med', beskrivelse: '', farge: PROSJEKT_PALETTE[0], belop: '', manskapAntall: '', prosjektlederId: '' };

// Normaliser gammel status til visningsgruppe
function normStatus(s) {
  if (s === 'planlagt') return 'jobber_med';
  if (s === 'pagaende') return 'aktiv';
  return s;
}

// ── KS-plan forslag (laster maler lazy fra API) ───────────────────────────────
function ProsjektKSPlanKnapp({ project, onOppdater }) {
  const [laster, setLaster] = useState(false)
  const [maler, setMaler] = useState(null)
  const [visModal, setVisModal] = useState(false)
  const [valgte, setValgte] = useState(new Set())
  const ksSjekklister = project.ksSjekklister || []
  const tildeltIds = new Set(ksSjekklister.map(k => k.malId))

  function getFaseKs(m) {
    const n = (m.navn || '').toLowerCase(), g = m.gruppe || ''
    if (g === 'Sluttkontroll' || m.id === 'mal-el-slutt') return 'slutt'
    if (n.includes('sluttkontroll') && n.includes('elektrisk')) return 'slutt'
    if (g === 'HMS' || n.includes('risikovurdering') || n.includes('sha') || n.includes('stillas')) return 'oppstart'
    return 'bygg'
  }

  function lagForslag(maler) {
    const jt = (project.jobbType || '').toLowerCase()
    const ctx = jt + ' ' + (project.navn || '').toLowerCase() + ' ' + (project.beskrivelse || '').toLowerCase()
    const ids = new Set(['mal-hms-daglig','mal-risikovurdering-oppstart','mal-sha-sja','mal-sluttkontroll','mal-el-slutt'])
    if (ctx.includes('bad') || ctx.includes('våtrom') || ctx.includes('rehabilitering'))
      ['mal-bad-riving','mal-bad-membran','mal-bad-flis','mal-bad-ror','mal-bad-el'].forEach(id => ids.add(id))
    if (ctx.includes('fasade') || ctx.includes('kledning') || ctx.includes('yttervegg'))
      ['mal-fasade-stillas','mal-fasade-riving','mal-fasade-underlag','mal-fasade-kledning','mal-fasade-vinduer','mal-fasade-beslag','mal-maling-utvendig'].forEach(id => ids.add(id))
    if (ctx.includes('tak') || ctx.includes('tekking'))
      ['mal-tak-stillas','mal-tak-riving','mal-tak-undertak','mal-tak-tekking','mal-tak-beslag'].forEach(id => ids.add(id))
    if (ctx.includes('tilbygg'))
      ['mal-tomrer-riving','mal-tomrer-baerende','mal-tomrer-isolasjon','mal-tomrer-gips','mal-tomrer-gulv'].forEach(id => ids.add(id))
    if (ctx.includes('innvendig') || ctx.includes('oppussing'))
      ['mal-tomrer-riving','mal-tomrer-gips','mal-tomrer-gulv','mal-maling-sparkling','mal-maling-innvendig'].forEach(id => ids.add(id))
    return maler.filter(m => ids.has(m.id))
  }

  async function aapneForslag() {
    setLaster(true)
    try {
      const token = localStorage.getItem('fbs_token') || ''
      const data = await fetch('/api/ks/maler', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json())
      setMaler(data)
      const forslag = lagForslag(data)
      setValgte(new Set(forslag.filter(m => !tildeltIds.has(m.id)).map(m => m.id)))
      setVisModal(true)
    } catch (e) { alert('Kunne ikke laste maler: ' + e.message) }
    setLaster(false)
  }

  function bekreft() {
    const nyeKS = (maler || []).filter(m => valgte.has(m.id)).map(m => ({
      malId: m.id, tildeltDato: new Date().toISOString(), tildeltAv: 'forslag:auto',
      status: 'ikke-startet', framdrift: { utfylt: 0, totalt: m.punkter?.length || 0 }, svar: [], avvik: [],
    }))
    onOppdater({ ...project, ksSjekklister: [...ksSjekklister, ...nyeKS] })
    setVisModal(false)
  }

  const forslatteMaler = maler ? lagForslag(maler) : []
  const FASER = [
    { id: 'oppstart', label: '📅 Oppstart', farge: '#3b82f6' },
    { id: 'bygg', label: '🔨 Bygg-fase', farge: '#f59e0b' },
    { id: 'slutt', label: '✅ Sluttkontroll', farge: '#16a34a' },
  ]

  return (
    <>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary" onClick={aapneForslag} disabled={laster} style={{ fontSize: 13 }}>
          {laster ? '⏳ Laster...' : '✨ Foreslå KS-sjekkliste-plan'}
        </button>
        {ksSjekklister.length > 0 && (
          <span style={{ fontSize: 12, color: '#64748b' }}>{ksSjekklister.length} sjekklister tildelt</span>
        )}
      </div>

      {visModal && maler && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setVisModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 520, width: '100%', padding: '22px 20px', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 20px 48px rgba(0,0,0,.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
              ✨ Foreslått sjekkliste-plan
              <button className="btn-icon" onClick={() => setVisModal(false)}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Basert på <strong>"{project.jobbType || project.navn}"</strong> — juster gjerne utvalget
            </div>
            {FASER.map(fase => {
              const fm = forslatteMaler.filter(m => getFaseKs(m) === fase.id || (fase.id === 'oppstart' && getFaseKs(m) === 'daglig'))
              if (fm.length === 0) return null
              return (
                <div key={fase.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: fase.farge, marginBottom: 5 }}>{fase.label}</div>
                  {fm.map(m => {
                    const er = tildeltIds.has(m.id)
                    return (
                      <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, cursor: er ? 'default' : 'pointer', background: valgte.has(m.id) ? '#eff6ff' : 'transparent' }}>
                        <input type="checkbox" checked={er || valgte.has(m.id)} disabled={er}
                          onChange={e => { const s = new Set(valgte); if (e.target.checked) s.add(m.id); else s.delete(m.id); setValgte(s) }} />
                        <span style={{ fontSize: 13, color: er ? '#94a3b8' : '#1e293b', flex: 1 }}>{m.navn}</span>
                        {er ? <span style={{ fontSize: 10, color: '#94a3b8' }}>✓</span> : <span style={{ fontSize: 10, color: '#94a3b8' }}>{m.punkter?.length || 0} pkt</span>}
                      </label>
                    )
                  })}
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
              <button className="btn" onClick={() => setVisModal(false)}>Avbryt</button>
              <button className="btn btn-primary" disabled={valgte.size === 0} onClick={bekreft}>
                ✅ Legg til {valgte.size} sjekklister
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function Prosjekter() {
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  // PL-filter huskes per bruker (spec 2.1)
  const [plFilter, setPlFilterState] = useState(() => localStorage.getItem('fbs_proj_plfilter') || '');
  const setPlFilter = v => { localStorage.setItem('fbs_proj_plfilter', v); setPlFilterState(v); };
  const [dedupPanel, setDedupPanel] = useState(null); // null | {loading} | {dry, plan, ...}
  const isAdmin = localStorage.getItem('fbs_role') === 'admin';
  // Ny liste (designsystem PR1): aktiv status-fane + sorteringsvalg
  const [aktivFane, setAktivFane] = useState('aktiv');
  const [sortValg, setSortValg] = useState('tittel'); // 'tittel' | 'frist' | 'sum' (PR2: 'handling')

  // Sorter på det som VISES som tittel (adressen når den finnes) — ikke det
  // skjulte navnet. Ellers havner «Angelica K. – Bøhlerveien 41A» under A.
  function visTittel(p) {
    return (p.adresse || ((p.navn || '').includes(' — ') ? (p.navn || '').split(' — ').slice(1).join(' — ') : (p.navn || ''))).trim().toLowerCase();
  }
  function sorterFane(arr) {
    return [...arr].sort((a, b) => {
      if (sortValg === 'frist') return (a.sluttDato || '9999').localeCompare(b.sluttDato || '9999');
      if (sortValg === 'sum') return (Number(b.belop) || 0) - (Number(a.belop) || 0);
      return visTittel(a).localeCompare(visTittel(b), 'nb');
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
    setForm({
      ...p,
      kundeNavn: p.kunde?.navn || '',
      kundeTlf:  p.kunde?.telefon || '',
      kundeEpost: p.kunde?.epost || '',
    });
    setShowModal(true);
  }

  function handleSave() {
    if (!form.navn.trim()) return;
    const kunde = {
      ...(editing?.kunde || {}),
      navn:     form.kundeNavn  || '',
      telefon:  form.kundeTlf   || '',
      epost:    form.kundeEpost || '',
      adresse:  form.adresse    || '',
    };
    const payload = { ...form, kunde };
    if (editing) {
      dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...payload, id: editing.id } });
    } else {
      dispatch({ type: 'ADD_PROSJEKT', payload });
    }
    setShowModal(false);
  }

  // ── Arkivering (erstatter fysisk sletting — SPEC absolutt krav) ──
  // Setter kun arkivert-flagg + dato + hvem. ALDRI DELETE_PROSJEKT fra UI.
  function arkiverProsjekt(p) {
    if (!confirm(`Arkivere «${p.navn || p.adresse}»?\n\nProsjektet skjules fra listene men slettes IKKE. Gjenopprett når som helst fra Arkivert-fanen.`)) return;
    dispatch({
      type: 'UPDATE_PROSJEKT',
      payload: {
        ...p,
        arkivert: true,
        arkivertDato: new Date().toISOString(),
        arkivertAv: localStorage.getItem('fbs_user_navn') || localStorage.getItem('fbs_role') || 'ukjent',
      },
    });
  }

  function gjenopprettProsjekt(p) {
    dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, arkivert: false } });
    setAktivFane(normStatus(p.status) || 'aktiv');
  }

  function settProsjektStatus(p, nyStatus) {
    dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, status: nyStatus } });
  }

  // Oppslags-indekser (unngå O(n) skann per prosjekt i render-loopen)
  const ansatteById = useMemo(() => {
    const m = {};
    for (const a of state.ansatte) m[a.id] = a;
    return m;
  }, [state.ansatte]);
  const oppgaverByProsjekt = useMemo(() => {
    const m = {};
    for (const o of state.oppgaver) (m[o.prosjektId] ||= []).push(o);
    return m;
  }, [state.oppgaver]);
  const tildelingerByProsjekt = useMemo(() => {
    const m = {};
    for (const t of state.tildelinger) (m[t.prosjektId] ||= []).push(t);
    return m;
  }, [state.tildelinger]);

  const alleProsjekter = useMemo(() => state.prosjekter.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      const pl = p.prosjektlederId ? ansatteById[p.prosjektlederId] : null;
      const match =
        (p.navn || '').toLowerCase().includes(q) ||
        (p.adresse || '').toLowerCase().includes(q) ||
        (p.jobbType || '').toLowerCase().includes(q) ||
        (p.beskrivelse || '').toLowerCase().includes(q) ||
        (pl?.navn || '').toLowerCase().includes(q) ||
        (p.kunde?.navn || '').toLowerCase().includes(q) ||
        (p.kunde?.telefon || '').includes(q) ||
        (p.kunde?.epost || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (plFilter && p.prosjektlederId !== plFilter) return false;
    return true;
  }), [state.prosjekter, ansatteById, search, plFilter]);

  // ── Status-faner (designsystem PR1): teller + sum per fane ──
  // Arkiverte er utelatt fra status-fanene og har egen dempet fane.
  const faneListe = useMemo(() => {
    const aktive = alleProsjekter.filter(p => !p.arkivert);
    const perFane = key => aktive.filter(p => normStatus(p.status) === key);
    const sum = arr => arr.reduce((s, p) => s + (Number(p.belop) || 0), 0);
    const lag = (key, label, ikon, farge, dempet = false) => {
      const arr = perFane(key);
      return { key, label, ikon, farge, dempet, teller: arr.length, sum: dempet ? 0 : sum(arr) };
    };
    return [
      lag('aktiv', 'Pågående', '🔨', STATUS_COLORS.aktiv),
      lag('godkjent', 'Godkjent', '✅', STATUS_COLORS.godkjent),
      lag('jobber_med', 'Vi jobber med', '📋', STATUS_COLORS.jobber_med),
      lag('fullfort', 'Fullført', '🏁', '#64748b', true),
      {
        key: 'arkivert', label: 'Arkivert', ikon: '🗄', farge: '#94a3b8', dempet: true,
        teller: alleProsjekter.filter(p => p.arkivert).length, sum: 0,
      },
    ];
  }, [alleProsjekter]);

  const faneProsjekter = useMemo(() => {
    const arr = aktivFane === 'arkivert'
      ? alleProsjekter.filter(p => p.arkivert)
      : alleProsjekter.filter(p => !p.arkivert && normStatus(p.status) === aktivFane);
    return sorterFane(arr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alleProsjekter, aktivFane, sortValg]);

  // ---- Admin: dedup prosjekter ----
  async function kjorDedup(dry) {
    setDedupPanel({ loading: true });
    try {
      const token = localStorage.getItem('fbs_token') || '';
      const r = await fetch('/api/admin/dedup-prosjekter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dry }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setDedupPanel({ ...data, loading: false });
      // Etter sletting plukker bakgrunns-sync (poller hvert 5s) opp endringen automatisk.
    } catch (e) {
      setDedupPanel({ error: e.message, loading: false });
    }
  }

  return (
    <div className={`page${fullscreen ? ' proj-fullscreen' : ''}`}>
      <div className="page-header">
        <h2>Prosjekter <span className="count-badge">{state.prosjekter.length}</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'}>
            {fullscreen ? '✕ Lukk' : '⛶ Fullskjerm'}
          </button>
          {/* Dedup-knappen er SKJULT per SPEC (sletter fysisk = farlig).
              Koden beholdes — endre `false` til `isAdmin` for å vise igjen. */}
          {false && isAdmin && (
            <button
              className="btn"
              onClick={() => dedupPanel ? setDedupPanel(null) : kjorDedup(true)}
              title="Finn og rydd opp duplikate prosjekter"
            >
              🔧 Dedup
            </button>
          )}
          <button className="btn btn-primary" onClick={openNew}>+ Nytt prosjekt</button>
        </div>
      </div>

      {/* Admin: dedup-panel */}
      {isAdmin && dedupPanel && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', margin: '0 0 12px 0', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ color: '#1e293b' }}>🔧 Dedup prosjekter</strong>
            <button onClick={() => setDedupPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8' }}>✕</button>
          </div>

          {dedupPanel.loading && <div style={{ color: '#64748b' }}>⏳ Henter duplikater...</div>}
          {dedupPanel.error && <div style={{ color: '#dc2626' }}>⚠️ Feil: {dedupPanel.error}</div>}
          {!dedupPanel.loading && !dedupPanel.error && dedupPanel.funnetDuplikater === 0 && (
            <div style={{ color: '#16a34a' }}>✅ Ingen duplikater funnet</div>
          )}

          {!dedupPanel.loading && !dedupPanel.error && dedupPanel.duplikatGrupper > 0 && (
            <>
              <div style={{ color: '#1e293b', marginBottom: 8 }}>
                Funnet <strong>{dedupPanel.duplikatGrupper}</strong> duplikatgrupper
                → vil slette <strong>{dedupPanel.skalSlettes}</strong> prosjekter
                (beholder {dedupPanel.gjenværendeEtter})
                {dedupPanel.refsSomFlyttes > 0 && <> · flytter {dedupPanel.refsSomFlyttes} tildelinger/oppgaver til keeper</>}
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                {(dedupPanel.plan || []).map((g, i) => (
                  <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < dedupPanel.plan.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ fontWeight: 600 }}>Beholder: {g.behold.navn}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>
                      id: {g.behold.id} · {g.behold.status} · {g.behold.refs} ref
                      {g.behold.harFramdrift ? ' · framdrift' : ''}{g.behold.harTilbud ? ' · tilbud' : ''}
                    </div>
                    {g.slett.map(s => (
                      <div key={s.id} style={{ color: '#dc2626', fontSize: 12, paddingLeft: 10 }}>
                        🗑 {s.navn} ({s.id}) · {s.status} · {s.refs} ref{s.harFramdrift ? ' · framdrift' : ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {dedupPanel.dry !== false && (
                <button
                  onClick={() => {
                    if (!window.confirm(`Slette ${dedupPanel.skalSlettes} duplikate prosjekter?\nReferanser (tildelinger/oppgaver) flyttes til keeper.\nDette kan ikke angres (men snapshots tas).`)) return;
                    kjorDedup(false);
                  }}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
                >
                  🗑 Slett {dedupPanel.skalSlettes} duplikater
                </button>
              )}
              {dedupPanel.dry === false && (
                <div style={{ color: '#16a34a', fontWeight: 600 }}>✅ Slettet {dedupPanel.slettet} duplikater · {dedupPanel.gjenværende} prosjekter igjen</div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ Ny liste (designsystem, SPEC layout C — PR1) ═══ */}

      {/* Status-faner med teller + sum (erstatter KPI-kort + grupper) */}
      <StatusFaner faner={faneListe} aktiv={aktivFane} onVelg={setAktivFane} />

      {/* Søk + PL-filter + sortering */}
      <div className="toolbar" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <input
          className="search-input"
          placeholder="🔍 Søk navn, adresse, type, leder..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        {(() => {
          const plIds = [...new Set(state.prosjekter.map(p => p.prosjektlederId).filter(Boolean))];
          if (plIds.length === 0) return null;
          return (
            <select
              className="input"
              style={{ width: 190, height: 36, fontSize: 13 }}
              value={plFilter}
              onChange={e => setPlFilter(e.target.value)}
            >
              <option value="">Alle prosjektledere</option>
              {plIds.map(id => {
                const a = ansatteById[id];
                return a ? <option key={id} value={id}>{a.navn}</option> : null;
              })}
            </select>
          );
        })()}
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Sorter:</span>
        {[['tittel', 'A–Å'], ['frist', 'Frist'], ['sum', 'Sum']].map(([key, label]) => (
          <button
            key={key}
            className="btn btn-sm"
            style={sortValg === key ? { background: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' } : {}}
            onClick={() => setSortValg(key)}
          >
            {label}
          </button>
        ))}
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
          {faneProsjekter.length} prosjekter
        </span>
      </div>

      {/* Kompakte rader */}
      {faneProsjekter.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          {aktivFane === 'arkivert' ? 'Ingen arkiverte prosjekter.' : 'Ingen prosjekter i denne fanen.'}
        </div>
      )}
      {faneProsjekter.map(p => {
        const visAdresse = p.adresse || ((p.navn || '').includes(' — ') ? (p.navn || '').split(' — ').slice(1).join(' — ').trim() : (p.navn || 'Uten navn'));
        const kundeNavn = p.kunde?.navn || ((p.navn || '').includes(' — ') ? (p.navn || '').split(' — ')[0].trim() : null);
        const pl = p.prosjektlederId ? ansatteById[p.prosjektlederId] : null;
        const tild = tildelingerByProsjekt[p.id] || [];
        const antallFolk = new Set(tild.map(t => t.ansattId)).size;
        const opp = oppgaverByProsjekt[p.id] || [];
        const fremgang = opp.length
          ? Math.round(opp.reduce((s, o) => s + (o.fremgang || 0), 0) / opp.length)
          : (Array.isArray(p.fdTasks) && p.fdTasks.length
            ? Math.round(p.fdTasks.reduce((s, t) => s + (t.progress || 0), 0) / p.fdTasks.length)
            : null);
        const belopVis = formaterBelop(p.belop);
        const varsel = aktivFane !== 'arkivert' ? sluttDatoInfo(p.sluttDato, p.status) : null;
        const ks = Array.isArray(p.ksSjekklister) && p.ksSjekklister.length > 0 ? p.ksSjekklister.length : null;

        if (aktivFane === 'arkivert') {
          return (
            <KompaktRad
              key={p.id}
              tittel={visAdresse}
              undertittel={kundeNavn ? `👤 ${kundeNavn}` : null}
              meta={[
                p.arkivertDato ? `🗄 Arkivert ${formatDate(p.arkivertDato.slice(0, 10))}` : '🗄 Arkivert',
                p.arkivertAv ? `av ${p.arkivertAv}` : null,
              ]}
              hoyre={[belopVis]}
              meny={[
                { ikon: '↩', label: 'Gjenopprett', onClick: () => gjenopprettProsjekt(p) },
                { ikon: '✏️', label: 'Rediger', onClick: () => openEdit(p) },
              ]}
              onClick={() => openEdit(p)}
            />
          );
        }

        return (
          <KompaktRad
            key={p.id}
            tittel={visAdresse}
            undertittel={kundeNavn ? `👤 ${kundeNavn}` : null}
            varsel={varsel ? `⚠ ${varsel.label}` : null}
            varselFarge={varsel ? varsel.farge : null}
            meta={[
              p.startDato ? `📅 ${formatDate(p.startDato)}${p.sluttDato ? ` – ${formatDate(p.sluttDato)}` : ''}` : null,
              varighetUker(p.startDato, p.sluttDato),
              pl ? `🧑‍💼 ${(pl.navn || '').split(' ')[0]}` : null,
              p.jobbType || null,
            ]}
            hoyre={[
              antallFolk > 0 ? `👷 ${antallFolk}` : null,
              belopVis,
              ks ? `✅ ${ks}` : null,
            ]}
            fremdrift={fremgang}
            meny={[
              { ikon: '✏️', label: 'Rediger', onClick: () => openEdit(p) },
              { skille: true },
              ...['jobber_med', 'godkjent', 'aktiv'].filter(s => normStatus(p.status) !== s).map(s => ({
                ikon: '→', label: SAVE_LABELS[s], onClick: () => settProsjektStatus(p, s),
              })),
              normStatus(p.status) !== 'fullfort' && { ikon: '🏁', label: 'Fullfør', onClick: () => settProsjektStatus(p, 'fullfort') },
              { skille: true },
              { ikon: '🗄', label: 'Arkiver', farlig: true, onClick: () => arkiverProsjekt(p) },
            ]}
            onClick={() => openEdit(p)}
          />
        );
      })}

      {/* Modal */}
      {showModal && (
        <Modal title={editing ? 'Rediger prosjekt' : 'Nytt prosjekt'} onClose={() => setShowModal(false)}>
          <div className="form">
            <label>Prosjektnavn *</label>
            <input value={form.navn} onChange={e => setForm(f => ({ ...f, navn: e.target.value }))} placeholder="Prosjektnavn" />
            <label>Adresse</label>
            <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="Adresse" />
            <label>Kundenavn</label>
            <input value={form.kundeNavn} onChange={e => setForm(f => ({ ...f, kundeNavn: e.target.value }))} placeholder="For- og etternavn" />
            <div className="form-row">
              <div>
                <label>Telefon</label>
                <input type="tel" value={form.kundeTlf} onChange={e => setForm(f => ({ ...f, kundeTlf: e.target.value }))} placeholder="99 99 99 99" />
              </div>
              <div>
                <label>E-post</label>
                <input type="email" value={form.kundeEpost} onChange={e => setForm(f => ({ ...f, kundeEpost: e.target.value }))} placeholder="kunde@eksempel.no" />
              </div>
            </div>
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
