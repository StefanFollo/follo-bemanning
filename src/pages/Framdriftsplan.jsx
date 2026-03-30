import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { dateToIso, isoToDate, formatDate, uid, weekStart, overlaps } from '../store';
import { getHolidayMap } from '../holidays';

// ─── Dato-hjelp ──────────────────────────────────────────────
const MAANED = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'];
const DAG_NAVN = ['Man','Tir','Ons','Tor','Fre'];

function today() { return dateToIso(new Date()); }

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateToIso(d);
}

function daysBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000));
}

function monthsArray(fromIso, count) {
  const out = [];
  const d = new Date(fromIso + 'T00:00:00');
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    const iso = dateToIso(d).slice(0, 7);
    out.push(iso);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function monthEndIso(ym) {
  const [y, m] = ym.split('-').map(Number);
  return dateToIso(new Date(y, m, 0)); // last day of month
}

function monthStartIso(ym) { return ym + '-01'; }

function getWeekNumber(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay()+6)%7));
  const w = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d-w)/86400000 - 3 + ((w.getDay()+6)%7))/7);
}

// Lag array av hverdager (man-fre) fra startdato over N uker
function hverdager(fraIso, antUker) {
  return Array.from({ length: antUker * 7 }, (_, i) => addDays(fraIso, i))
    .filter(d => { const dow = new Date(d + 'T00:00:00').getDay(); return dow >= 1 && dow <= 5; });
}

// Lag array av uker (mandag-fredag, én per uke) fra startdato over N uker
function ukeStarter(fraIso, antUker) {
  return Array.from({ length: antUker }, (_, i) => addDays(fraIso, i * 7));
}

function pctInRange(iso, rangeStart, rangeDays) {
  if (!iso) return null;
  const diff = daysBetween(rangeStart, iso);
  return Math.max(0, Math.min(100, (diff / rangeDays) * 100));
}

function barStyle(startDato, sluttDato, rangeStart, rangeDays, color) {
  if (!startDato || !sluttDato) return null;
  const left = pctInRange(startDato, rangeStart, rangeDays);
  const right = pctInRange(addDays(sluttDato, 1), rangeStart, rangeDays);
  if (left === null || right === null || right <= left) return null;
  return { left: left.toFixed(2) + '%', width: (right - left).toFixed(2) + '%', background: color };
}

// ─── Standardfarger per ny aktivitet ─────────────────────────
const FARGER = ['#6366f1','#8b5cf6','#3b82f6','#06b6d4','#16a34a','#f59e0b','#ea580c','#ec4899'];
function nesteFarge(oppgaver) {
  const used = oppgaver.map(o => o.farge).filter(Boolean);
  return FARGER.find(f => !used.includes(f)) || FARGER[oppgaver.length % FARGER.length];
}

// ─── Tom oppgave ─────────────────────────────────────────────
function tomOppgave(prosjektId, erGruppe, parentId, farge, rekkefølge) {
  return {
    navn: '',
    prosjektId,
    erGruppe: !!erGruppe,
    parentId: parentId || null,
    startDato: today(),
    sluttDato: addDays(today(), erGruppe ? 30 : 7),
    farge: farge || '#6366f1',
    fremgang: 0,
    rekkefølge: rekkefølge || 0,
  };
}

// ─── Modal ───────────────────────────────────────────────────
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

// ─── Hoved-komponent ─────────────────────────────────────────
export default function Framdriftsplan() {
  const { state, dispatch } = useApp();
  const [valgtProsjektId, setValgtProsjektId] = useState(() => state.prosjekter[0]?.id || null);
  const [collapsed, setCollapsed] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState(null);
  const [ukeMode, setUkeMode] = useState('maaned'); // 'dag' | 'uke' | 'maaned'
  const [periodeOffset, setPeriodeOffset] = useState(0);
  const [dragPreview, setDragPreview] = useState(null); // { id, startDato, sluttDato }
  const MÅNEDER_SYNLIG = 18;
  const UKE_SYNLIG = 26;
  const DAG_SYNLIG = 13; // uker i dag-modus
  const activeDrag = useRef(null);
  const gridRef = useRef(null);

  const thisYear = new Date().getFullYear();
  const HOLIDAYS = getHolidayMap(thisYear - 1, thisYear + 2);

  const prosjekt = state.prosjekter.find(p => p.id === valgtProsjektId) || state.prosjekter[0];
  const alleOppgaver = prosjekt ? state.oppgaver.filter(o => o.prosjektId === prosjekt.id) : [];

  // ── Tidslinje avhengig av modus ──────────────────────────────
  const baseWeek = weekStart(today());

  // Dag-modus: hverdager over 13 uker
  const dagStart = addDays(baseWeek, periodeOffset * 5 * DAG_SYNLIG);
  const dagDager = hverdager(dagStart, DAG_SYNLIG);

  // Uke-modus: mandag i hver uke over 26 uker
  const ukeStart = addDays(baseWeek, periodeOffset * UKE_SYNLIG * 7);
  const ukeUker  = ukeStarter(ukeStart, UKE_SYNLIG);

  // Måned-modus: 18 måneder
  const mndBase = (() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + periodeOffset * 6);
    return dateToIso(d).slice(0, 7) + '-01';
  })();
  const måneder  = monthsArray(mndBase, MÅNEDER_SYNLIG);
  const tlStart  = ukeMode === 'dag' ? dagDager[0]
                 : ukeMode === 'uke' ? ukeUker[0]
                 : mndBase;
  const tlEnd    = ukeMode === 'dag' ? dagDager[dagDager.length - 1]
                 : ukeMode === 'uke' ? addDays(ukeUker[ukeUker.length - 1], 4)
                 : monthEndIso(måneder[måneder.length - 1]);
  const tlDays   = daysBetween(tlStart, addDays(tlEnd, 1));

  // "I dag"-linje
  const todayPct = pctInRange(today(), tlStart, tlDays);

  // Grupper og oppgaver sortert
  const grupper = alleOppgaver
    .filter(o => o.erGruppe)
    .sort((a, b) => (a.rekkefølge || 0) - (b.rekkefølge || 0));
  const løseAktiviteter = alleOppgaver
    .filter(o => !o.erGruppe && !o.parentId)
    .sort((a, b) => (a.rekkefølge || 0) - (b.rekkefølge || 0));

  function barnAv(gruppeId) {
    return alleOppgaver
      .filter(o => !o.erGruppe && o.parentId === gruppeId)
      .sort((a, b) => (a.rekkefølge || 0) - (b.rekkefølge || 0));
  }

  // Autobered gruppe-bar (min start → max slutt av barn)
  function gruppeBar(g) {
    const barn = barnAv(g.id);
    if (barn.length === 0) return { start: g.startDato, slutt: g.sluttDato };
    const start = barn.reduce((s, b) => b.startDato < s ? b.startDato : s, barn[0].startDato);
    const slutt  = barn.reduce((s, b) => b.sluttDato > s ? b.sluttDato : s, barn[0].sluttDato);
    return { start, slutt };
  }

  // ID-nummerering per prosjekt (sekvensielt)
  const idMap = {};
  let n = 1;
  grupper.forEach(g => {
    idMap[g.id] = n++;
    barnAv(g.id).forEach(b => { idMap[b.id] = n++; });
  });
  løseAktiviteter.forEach(a => { idMap[a.id] = n++; });

  // ─── Pointer-drag (live feedback, ingen HTML5 drag) ──────────
  function startDrag(e, oppgave, type) {
    e.preventDefault();
    e.stopPropagation();
    const barArea = e.currentTarget.closest('.fd2-bar-area');
    const pxPerDay = barArea ? barArea.offsetWidth / tlDays : 10;
    activeDrag.current = {
      oppgave,
      type,
      origStart: oppgave.startDato,
      origEnd:   oppgave.sluttDato,
      startX:    e.clientX,
      pxPerDay,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragPreview({ id: oppgave.id, startDato: oppgave.startDato, sluttDato: oppgave.sluttDato });
  }

  function moveDrag(e) {
    if (!activeDrag.current) return;
    const { oppgave, type, origStart, origEnd, startX, pxPerDay } = activeDrag.current;
    const deltaDager = Math.round((e.clientX - startX) / pxPerDay);
    let newStart = origStart, newEnd = origEnd;
    if (type === 'move') {
      newStart = addDays(origStart, deltaDager);
      newEnd   = addDays(origEnd,   deltaDager);
    } else if (type === 'start') {
      const k = addDays(origStart, deltaDager);
      newStart = k <= origEnd ? k : origEnd;
    } else if (type === 'end') {
      const k = addDays(origEnd, deltaDager);
      newEnd = k >= origStart ? k : origStart;
    }
    setDragPreview({ id: oppgave.id, startDato: newStart, sluttDato: newEnd });
  }

  function endDrag(e) {
    if (!activeDrag.current) return;
    const { oppgave } = activeDrag.current;
    setDragPreview(prev => {
      if (prev && prev.id === oppgave.id) {
        dispatch({ type: 'UPDATE_OPPGAVE', payload: { ...oppgave, startDato: prev.startDato, sluttDato: prev.sluttDato } });
      }
      return null;
    });
    activeDrag.current = null;
  }

  // ─── CRUD ────────────────────────────────────────────────────
  function åpneNyGruppe() {
    const rek = alleOppgaver.length;
    setForm({ ...tomOppgave(prosjekt.id, true, null, '#4b5563', rek), _type: 'gruppe' });
    setEditModal(null);
    setShowModal(true);
  }

  function åpneNyAktivitet(parentId) {
    const farge = nesteFarge(alleOppgaver);
    const rek = alleOppgaver.length;
    setForm({ ...tomOppgave(prosjekt.id, false, parentId || null, farge, rek), _type: 'aktivitet' });
    setEditModal(null);
    setShowModal(true);
  }

  function åpneRediger(oppgave) {
    setForm({ ...oppgave, _type: oppgave.erGruppe ? 'gruppe' : 'aktivitet' });
    setEditModal(oppgave);
    setShowModal(true);
  }

  function lagre() {
    if (!form.navn.trim()) return;
    const { _type, ...data } = form;
    if (editModal) {
      dispatch({ type: 'UPDATE_OPPGAVE', payload: { ...data, id: editModal.id } });
    } else {
      dispatch({ type: 'ADD_OPPGAVE', payload: data });
    }
    setShowModal(false);
  }

  function slett(id) {
    if (confirm('Slett aktiviteten?')) {
      dispatch({ type: 'DELETE_OPPGAVE', id });
      // Slett også eventuelle barn
      state.oppgaver.filter(o => o.parentId === id).forEach(b =>
        dispatch({ type: 'DELETE_OPPGAVE', id: b.id })
      );
      setShowModal(false);
    }
  }

  function toggleCollapse(id) {
    setCollapsed(c => ({ ...c, [id]: !c[id] }));
  }

  // ─── Render en bar-rad ────────────────────────────────────────
  function BarRad({ oppgave, erGruppe, startD, sluttD }) {
    // Bruk live preview-datoer under dragging
    const effStart = dragPreview?.id === oppgave.id ? dragPreview.startDato : startD;
    const effEnd   = dragPreview?.id === oppgave.id ? dragPreview.sluttDato : sluttD;
    const color    = erGruppe ? '#374151' : (oppgave.farge || '#6366f1');
    const style    = barStyle(effStart, effEnd, tlStart, tlDays, color);
    const varighet = daysBetween(effStart, effEnd) + 1;
    const isDragging = dragPreview?.id === oppgave.id;

    return (
      <div className="fd2-bar-area">
        {todayPct !== null && (
          <div className="fd2-today-line" style={{ left: todayPct.toFixed(2) + '%' }}>
            <span className="fd2-today-label">I dag</span>
          </div>
        )}
        {style && (
          <div
            className={`fd2-bar ${erGruppe ? 'fd2-bar-gruppe' : ''} ${isDragging ? 'fd2-bar-dragging' : ''}`}
            style={style}
            title={`${oppgave.navn}\n${formatDate(effStart)} – ${formatDate(effEnd)}\n${varighet} dager`}
            onPointerDown={e => startDrag(e, oppgave, 'move')}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          >
            <div className="fd2-handle fd2-handle-l"
              onPointerDown={e => startDrag(e, oppgave, 'start')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
            >◂</div>
            <span className="fd2-bar-tekst">{oppgave.navn}</span>
            <div className="fd2-handle fd2-handle-r"
              onPointerDown={e => startDrag(e, oppgave, 'end')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
            >▸</div>
          </div>
        )}
        {!style && !erGruppe && (
          <div className="fd2-bar-ingen" onClick={() => åpneRediger(oppgave)}>
            Ingen datoer – klikk for å sette
          </div>
        )}
      </div>
    );
  }

  // ─── Render en rad ─────────────────────────────────────────
  function Rad({ oppgave, indentert, erGruppe }) {
    const startD = erGruppe ? gruppeBar(oppgave).start : oppgave.startDato;
    const sluttD = erGruppe ? gruppeBar(oppgave).slutt  : oppgave.sluttDato;
    const varighet = (startD && sluttD) ? (daysBetween(startD, sluttD) + 1) + 'd' : '–';
    const barn = erGruppe ? barnAv(oppgave.id) : [];
    const isOpen = !collapsed[oppgave.id];

    return (
      <>
        <div className={`fd2-rad ${erGruppe ? 'fd2-rad-gruppe' : ''}`}>
          {/* ID */}
          <div className="fd2-celle fd2-celle-id">{idMap[oppgave.id]}</div>

          {/* Aktivitet */}
          <div className="fd2-celle fd2-celle-navn" style={{ paddingLeft: indentert ? 28 : 12 }}>
            {erGruppe && (
              <button className="fd2-toggle" onClick={() => toggleCollapse(oppgave.id)}>
                {isOpen ? '▾' : '▸'}
              </button>
            )}
            <span
              className="fd2-navn-tekst"
              onClick={() => åpneRediger(oppgave)}
              title="Klikk for å redigere"
            >
              {oppgave.navn || <em style={{ color: '#94a3b8' }}>Uten navn</em>}
            </span>
            {erGruppe && (
              <button className="fd2-legg-til-barn" onClick={() => åpneNyAktivitet(oppgave.id)} title="Legg til aktivitet i denne fasen">+</button>
            )}
          </div>

          {/* Varighet */}
          <div className="fd2-celle fd2-celle-varighet">{varighet}</div>

          {/* Bar */}
          <BarRad oppgave={oppgave} erGruppe={erGruppe} startD={startD} sluttD={sluttD} />
        </div>

        {/* Barn */}
        {erGruppe && isOpen && barn.map(b => (
          <Rad key={b.id} oppgave={b} indentert erGruppe={false} />
        ))}
      </>
    );
  }

  if (state.prosjekter.length === 0) {
    return <div className="page"><div className="empty">Ingen prosjekter. Legg til et prosjekt først.</div></div>;
  }

  return (
    <div className="page fd2-side">
      {/* Topptittel */}
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2>Fremdriftsplan</h2>
          {/* Prosjekt-dropdown */}
          <select
            className="fd2-prosjekt-select"
            value={valgtProsjektId || ''}
            onChange={e => setValgtProsjektId(e.target.value)}
          >
            {state.prosjekter.map(p => (
              <option key={p.id} value={p.id}>{p.navn}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={åpneNyGruppe}>+ Ny fase</button>
          <button className="btn btn-primary" onClick={() => åpneNyAktivitet(null)}>+ Ny aktivitet</button>
        </div>
      </div>

      {/* Periode-navigasjon */}
      <div className="uke-nav" style={{ marginBottom: 8 }}>
        <button className="btn" onClick={() => setPeriodeOffset(o => o - 1)}>← Forrige</button>
        <span className="uke-label">
          {ukeMode === 'maaned'
            ? `${MAANED[new Date(tlStart+'T00:00:00').getMonth()]} ${new Date(tlStart+'T00:00:00').getFullYear()} – ${MAANED[new Date(tlEnd+'T00:00:00').getMonth()]} ${new Date(tlEnd+'T00:00:00').getFullYear()}`
            : `${formatDate(tlStart)} – ${formatDate(tlEnd)}`}
        </span>
        <button className="btn" onClick={() => setPeriodeOffset(0)}>I dag</button>
        <button className="btn" onClick={() => setPeriodeOffset(o => o + 1)}>Neste →</button>
        <div className="ukemode-toggle">
          <button className={`ukemode-btn ${ukeMode==='dag'?'active':''}`} onClick={() => { setUkeMode('dag'); setPeriodeOffset(0); }}>Dager</button>
          <button className={`ukemode-btn ${ukeMode==='uke'?'active':''}`} onClick={() => { setUkeMode('uke'); setPeriodeOffset(0); }}>Uker</button>
          <button className={`ukemode-btn ${ukeMode==='maaned'?'active':''}`} onClick={() => { setUkeMode('maaned'); setPeriodeOffset(0); }}>Måneder</button>
        </div>
      </div>

      {/* Gantt-tabell */}
      <div className="fd2-wrap" ref={gridRef}>
        {/* Sticky header */}
        <div className="fd2-header">
          <div className="fd2-celle fd2-celle-id fd2-header-celle">ID</div>
          <div className="fd2-celle fd2-celle-navn fd2-header-celle">Aktivitet</div>
          <div className="fd2-celle fd2-celle-varighet fd2-header-celle">Varighet</div>
          <div className="fd2-celle fd2-celle-tl fd2-header-celle fd2-tl-header">
            {ukeMode === 'maaned' && <>
              {/* Måned: år-rad + måneds-rad */}
              <div className="fd2-tl-aar-rad">
                {(() => {
                  const ag = []; let g = null;
                  måneder.forEach(m => {
                    const aar = m.slice(0,4);
                    if (g?.aar !== aar) { g = { aar, antall: 1 }; ag.push(g); } else g.antall++;
                  });
                  return ag.map(x => (
                    <div key={x.aar} className="fd2-aar-celle" style={{ width: `${(x.antall/MÅNEDER_SYNLIG)*100}%` }}>{x.aar}</div>
                  ));
                })()}
              </div>
              <div className="fd2-tl-mnd-rad">
                {måneder.map(m => (
                  <div key={m} className={`fd2-mnd-celle ${m===today().slice(0,7)?'fd2-mnd-idag':''}`} style={{ width: `${100/MÅNEDER_SYNLIG}%` }}>
                    {MAANED[parseInt(m.slice(5,7),10)-1]}
                  </div>
                ))}
              </div>
            </>}

            {ukeMode === 'uke' && <>
              {/* Uke: måned-rad + uke-rad */}
              <div className="fd2-tl-aar-rad">
                {(() => {
                  const ag = []; let g = null;
                  ukeUker.forEach(d => {
                    const mnd = d.slice(0,7);
                    if (g?.mnd !== mnd) { g = { mnd, antall: 1 }; ag.push(g); } else g.antall++;
                  });
                  return ag.map(x => (
                    <div key={x.mnd} className="fd2-aar-celle" style={{ width: `${(x.antall/UKE_SYNLIG)*100}%` }}>
                      {MAANED[parseInt(x.mnd.slice(5,7),10)-1]} {x.mnd.slice(0,4)}
                    </div>
                  ));
                })()}
              </div>
              <div className="fd2-tl-mnd-rad">
                {ukeUker.map((d, i) => {
                  const erNå = weekStart(today()) === d;
                  const hol = HOLIDAYS[d];
                  return (
                    <div key={d} className={`fd2-mnd-celle ${erNå?'fd2-mnd-idag':''} ${hol?'holiday-header':''}`}
                      style={{ width: `${100/UKE_SYNLIG}%` }} title={hol||undefined}>
                      U{getWeekNumber(d)}
                    </div>
                  );
                })}
              </div>
            </>}

            {ukeMode === 'dag' && <>
              {/* Dag: uke-rad + dag-rad */}
              <div className="fd2-tl-aar-rad">
                {(() => {
                  const ag = []; let g = null;
                  dagDager.forEach((d, i) => {
                    const dow = new Date(d+'T00:00:00').getDay();
                    const wnr = getWeekNumber(d);
                    if (dow === 1 || i === 0) { g = { wnr, antall: 1 }; ag.push(g); } else if (g) g.antall++;
                  });
                  return ag.map((x, i) => (
                    <div key={i} className="fd2-aar-celle" style={{ width: `${(x.antall/dagDager.length)*100}%` }}>
                      U{x.wnr}
                    </div>
                  ));
                })()}
              </div>
              <div className="fd2-tl-mnd-rad">
                {dagDager.map(d => {
                  const dow = new Date(d+'T00:00:00').getDay();
                  const erIdag = d === today();
                  const hol = HOLIDAYS[d];
                  return (
                    <div key={d} className={`fd2-mnd-celle ${erIdag?'fd2-mnd-idag':''} ${hol?'holiday-header':''}`}
                      style={{ width: `${100/dagDager.length}%`, minWidth: 28 }} title={hol||undefined}>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>{DAG_NAVN[dow-1]}</div>
                      <div>{d.slice(8)}</div>
                    </div>
                  );
                })}
              </div>
            </>}
          </div>
        </div>

        {/* Rader */}
        <div className="fd2-rader">
          {grupper.map(g => <Rad key={g.id} oppgave={g} indentert={false} erGruppe={true} />)}
          {løseAktiviteter.map(a => <Rad key={a.id} oppgave={a} indentert={false} erGruppe={false} />)}
          {alleOppgaver.length === 0 && (
            <div style={{ padding: '32px', color: '#94a3b8', textAlign: 'center', gridColumn: '1/-1' }}>
              Ingen aktiviteter ennå. Klikk "+ Ny fase" eller "+ Ny aktivitet".
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <Modal
          title={editModal ? 'Rediger' : form?._type === 'gruppe' ? 'Ny fase' : 'Ny aktivitet'}
          onClose={() => setShowModal(false)}
        >
          <div className="form">
            <label>{form?._type === 'gruppe' ? 'Fasenavn' : 'Aktivitetsnavn'} *</label>
            <input
              className="input"
              autoFocus
              value={form?.navn || ''}
              onChange={e => setForm(f => ({ ...f, navn: e.target.value }))}
              placeholder={form?._type === 'gruppe' ? 'f.eks. Grunnarbeid' : 'f.eks. Graving, Støpe plate...'}
            />

            <div className="form-row">
              <div>
                <label>Startdato</label>
                <input type="date" className="input" value={form?.startDato || ''} onChange={e => setForm(f => ({ ...f, startDato: e.target.value }))} />
              </div>
              <div>
                <label>Sluttdato</label>
                <input type="date" className="input" value={form?.sluttDato || ''} onChange={e => setForm(f => ({ ...f, sluttDato: e.target.value }))} />
              </div>
            </div>

            {form?._type === 'aktivitet' && (
              <>
                <label>Farge</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {FARGER.map(c => (
                    <button key={c} type="button"
                      style={{ width: 28, height: 28, borderRadius: 6, background: c, border: form?.farge === c ? '3px solid #1e293b' : '2px solid transparent', cursor: 'pointer' }}
                      onClick={() => setForm(f => ({ ...f, farge: c }))}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="modal-actions" style={{ marginTop: 16 }}>
              {editModal && (
                <button className="btn btn-danger" onClick={() => slett(editModal.id)}>Slett</button>
              )}
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button className="btn btn-primary" onClick={lagre} disabled={!form?.navn?.trim()}>Lagre</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
