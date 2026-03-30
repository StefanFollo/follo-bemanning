import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { dateToIso, isoToDate, formatDate, uid } from '../store';

// ─── Dato-hjelp ──────────────────────────────────────────────
const MAANED = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'];

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
  const [editModal, setEditModal] = useState(null);   // oppgave-objekt
  const [form, setForm] = useState(null);
  const [månedOffset, setMånedOffset] = useState(0);
  const MÅNEDER_SYNLIG = 18;
  const dragRef = useRef(null);
  const gridRef = useRef(null);

  const prosjekt = state.prosjekter.find(p => p.id === valgtProsjektId) || state.prosjekter[0];
  const alleOppgaver = prosjekt ? state.oppgaver.filter(o => o.prosjektId === prosjekt.id) : [];

  // Tidslinje-setup
  const tl0 = (() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + månedOffset);
    return dateToIso(d).slice(0, 7) + '-01';
  })();
  const måneder = monthsArray(tl0, MÅNEDER_SYNLIG);
  const tlStart = tl0;
  const tlEnd   = monthEndIso(måneder[måneder.length - 1]);
  const tlDays  = daysBetween(tlStart, addDays(tlEnd, 1));

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

  // ─── Drag ───────────────────────────────────────────────────
  function onDragStart(e, oppgave, type) {
    e.stopPropagation();
    dragRef.current = { id: oppgave.id, type, startDato: oppgave.startDato, sluttDato: oppgave.sluttDato };
  }

  function pctFromMouseX(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = gridRef.current ? gridRef.current.scrollLeft : 0;
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(100, (x / rect.width) * 100));
  }

  function isoFromPct(pct) {
    const days = Math.round((pct / 100) * tlDays);
    return addDays(tlStart, days);
  }

  function onDrop(e, oppgave) {
    e.preventDefault();
    if (!dragRef.current || dragRef.current.id !== oppgave.id) return;
    const { type, startDato, sluttDato } = dragRef.current;
    const pct = pctFromMouseX(e);
    const iso = isoFromPct(pct);
    let newStart = startDato, newEnd = sluttDato;
    if (type === 'start') {
      newStart = iso <= sluttDato ? iso : sluttDato;
    } else if (type === 'end') {
      newEnd = iso >= startDato ? iso : startDato;
    } else {
      const len = daysBetween(startDato, sluttDato);
      newStart = iso;
      newEnd = addDays(iso, len);
    }
    dispatch({ type: 'UPDATE_OPPGAVE', payload: { ...oppgave, startDato: newStart, sluttDato: newEnd } });
    dragRef.current = null;
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
    const color = erGruppe ? '#374151' : (oppgave.farge || '#6366f1');
    const style = barStyle(startD, sluttD, tlStart, tlDays, color);
    const varighet = daysBetween(startD, sluttD) + 1;

    return (
      <div className="fd2-bar-area"
        onDragOver={e => e.preventDefault()}
        onDrop={e => onDrop(e, oppgave)}
      >
        {todayPct !== null && (
          <div className="fd2-today-line" style={{ left: todayPct.toFixed(2) + '%' }}>
            <span className="fd2-today-label">I dag</span>
          </div>
        )}
        {style && (
          <div
            className={`fd2-bar ${erGruppe ? 'fd2-bar-gruppe' : ''}`}
            style={style}
            draggable
            onDragStart={e => onDragStart(e, oppgave, 'move')}
            title={`${oppgave.navn}\n${formatDate(startD)} – ${formatDate(sluttD)}\n${varighet} dager`}
          >
            <div className="fd2-handle fd2-handle-l" draggable
              onDragStart={e => { e.stopPropagation(); onDragStart(e, oppgave, 'start'); }}>◂</div>
            <span className="fd2-bar-tekst">{oppgave.navn}</span>
            <div className="fd2-handle fd2-handle-r" draggable
              onDragStart={e => { e.stopPropagation(); onDragStart(e, oppgave, 'end'); }}>▸</div>
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
        <button className="btn" onClick={() => setMånedOffset(o => o - 6)}>← Forrige</button>
        <span className="uke-label">{MAANED[new Date(tl0).getMonth()]} {new Date(tl0).getFullYear()} – {MAANED[new Date(tlEnd + 'T00:00:00').getMonth()]} {new Date(tlEnd + 'T00:00:00').getFullYear()}</span>
        <button className="btn" onClick={() => setMånedOffset(0)}>I dag</button>
        <button className="btn" onClick={() => setMånedOffset(o => o + 6)}>Neste →</button>
      </div>

      {/* Gantt-tabell */}
      <div className="fd2-wrap" ref={gridRef}>
        {/* Sticky header */}
        <div className="fd2-header">
          <div className="fd2-celle fd2-celle-id fd2-header-celle">ID</div>
          <div className="fd2-celle fd2-celle-navn fd2-header-celle">Aktivitet</div>
          <div className="fd2-celle fd2-celle-varighet fd2-header-celle">Varighet</div>
          <div className="fd2-celle fd2-celle-tl fd2-header-celle fd2-tl-header">
            {/* År-rad */}
            <div className="fd2-tl-aar-rad">
              {(() => {
                const aarGrupper = [];
                let gjeldende = null;
                måneder.forEach((m, i) => {
                  const aar = m.slice(0, 4);
                  if (gjeldende?.aar !== aar) {
                    gjeldende = { aar, antall: 1, fra: i };
                    aarGrupper.push(gjeldende);
                  } else {
                    gjeldende.antall++;
                  }
                });
                return aarGrupper.map(g => (
                  <div key={g.aar} className="fd2-aar-celle" style={{ width: `${(g.antall / MÅNEDER_SYNLIG) * 100}%` }}>
                    {g.aar}
                  </div>
                ));
              })()}
            </div>
            {/* Måneds-rad */}
            <div className="fd2-tl-mnd-rad">
              {måneder.map(m => {
                const erNåværende = m === today().slice(0, 7);
                return (
                  <div key={m} className={`fd2-mnd-celle ${erNåværende ? 'fd2-mnd-idag' : ''}`}
                    style={{ width: `${100 / MÅNEDER_SYNLIG}%` }}>
                    {MAANED[parseInt(m.slice(5, 7), 10) - 1]}
                  </div>
                );
              })}
            </div>
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
