import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { weekStart, addDays, isoToDate, dateToIso, formatDate, overlaps } from '../store';

const FAG_COLORS = {
  'Bas Tømrer': '#f59e0b',
  'Montør': '#3b82f6',
  'Lærling Tømrer': '#16a34a',
  'Maler': '#ec4899',
  'Rørlegger': '#06b6d4',
  'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316',
  'Prosjektleder': '#0ea5e9',
};

function fagColor(fag) { return FAG_COLORS[fag] || '#6b7280'; }

const DAG_NAVN = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

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

export default function Bemanningsplan() {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState('uke');
  const [currentWeek, setCurrentWeek] = useState(() => weekStart(dateToIso(new Date())));
  const [showModal, setShowModal] = useState(false);
  const [tilForm, setTilForm] = useState({ ansattId: '', prosjektId: '', startDato: '', sluttDato: '' });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));

  function prevWeek() { setCurrentWeek(w => addDays(w, -7)); }
  function nextWeek() { setCurrentWeek(w => addDays(w, 7)); }
  function thisWeek() { setCurrentWeek(weekStart(dateToIso(new Date()))); }

  function openAddTildeling(ansattId, dag) {
    setTilForm({
      ansattId: ansattId || (state.ansatte[0]?.id || ''),
      prosjektId: state.prosjekter[0]?.id || '',
      startDato: dag || currentWeek,
      sluttDato: dag || addDays(currentWeek, 4),
    });
    setShowModal(true);
  }

  function handleAddTildeling() {
    if (!tilForm.ansattId || !tilForm.prosjektId || !tilForm.startDato || !tilForm.sluttDato) return;
    dispatch({ type: 'ADD_TILDELING', payload: tilForm });
    setShowModal(false);
  }

  function deleteTildeling(id) {
    dispatch({ type: 'DELETE_TILDELING', id });
  }

  // --- UKE-VISNING ---
  function UkeVisning() {
    const weekEnd = addDays(currentWeek, 6);
    const today = dateToIso(new Date());

    // Assign a stable color to each project by index
    const PROJ_COLORS = ['#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#be185d','#854d0e','#065f46','#1e40af'];
    const prosjektColor = (pid) => {
      const idx = state.prosjekter.findIndex(p => p.id === pid);
      return PROJ_COLORS[idx % PROJ_COLORS.length] || '#6b7280';
    };

    // Find which projects have tildelinger this week
    const ukeProsjektIds = [...new Set(
      state.tildelinger
        .filter(t => overlaps(t.startDato, t.sluttDato, currentWeek, weekEnd))
        .map(t => t.prosjektId)
    )];
    const ukeProsjekter = ukeProsjektIds
      .map(id => state.prosjekter.find(p => p.id === id))
      .filter(Boolean);

    // Employees with any tildeling this week
    const tildeltAnsatteIds = new Set(
      state.tildelinger
        .filter(t => overlaps(t.startDato, t.sluttDato, currentWeek, weekEnd))
        .map(t => t.ansattId)
    );
    const ledigeAnsatte = state.ansatte.filter(a => !tildeltAnsatteIds.has(a.id));

    function AnsattRad({ ansatt }) {
      return (
        <React.Fragment key={ansatt.id}>
          <div className="uke-row-label">
            <div className="mini-avatar" style={{ background: fagColor(ansatt.fag) }}>
              {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="row-navn">{ansatt.navn}</div>
              <div className="row-fag" style={{ color: fagColor(ansatt.fag) }}>{ansatt.fag}</div>
            </div>
          </div>
          {weekDays.map(dag => {
            const dagTildelinger = state.tildelinger.filter(t =>
              t.ansattId === ansatt.id && overlaps(t.startDato, t.sluttDato, dag, dag)
            );
            return (
              <div
                key={`${ansatt.id}-${dag}`}
                className="uke-cell"
                onClick={() => openAddTildeling(ansatt.id, dag)}
                title="Klikk for å legge til tildeling"
              >
                {dagTildelinger.map(t => {
                  const prosjekt = state.prosjekter.find(p => p.id === t.prosjektId);
                  return (
                    <div
                      key={t.id}
                      className="tildeling-chip"
                      style={{ background: prosjektColor(t.prosjektId) }}
                      onClick={e => e.stopPropagation()}
                      title={`${prosjekt?.navn || 'Ukjent'}\n${formatDate(t.startDato)} – ${formatDate(t.sluttDato)}`}
                    >
                      <span>{prosjekt?.navn?.slice(0, 12) || '–'}</span>
                      <button className="chip-delete" onClick={e => { e.stopPropagation(); deleteTildeling(t.id); }}>✕</button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </React.Fragment>
      );
    }

    function GridHeader() {
      return (
        <>
          <div className="uke-header-cell"></div>
          {weekDays.map((dag, i) => {
            const isToday = dag === today;
            return (
              <div key={dag} className={`uke-header-cell ${isToday ? 'today' : ''}`}>
                <div>{DAG_NAVN[i]}</div>
                <div className="dag-dato">{dag.slice(5).replace('-', '.')}</div>
              </div>
            );
          })}
        </>
      );
    }

    return (
      <div>
        <div className="uke-nav">
          <button className="btn" onClick={prevWeek}>← Forrige uke</button>
          <div className="uke-label">
            Uke {getWeekNumber(currentWeek)}: {formatDate(currentWeek)} – {formatDate(addDays(currentWeek, 6))}
          </div>
          <button className="btn" onClick={thisWeek}>I dag</button>
          <button className="btn" onClick={nextWeek}>Neste uke →</button>
        </div>

        {state.ansatte.length === 0 && (
          <div className="empty">Ingen ansatte registrert enda.</div>
        )}

        {/* Grupper per prosjekt */}
        {ukeProsjekter.map(prosjekt => {
          const projAnsatteIds = [...new Set(
            state.tildelinger
              .filter(t => t.prosjektId === prosjekt.id && overlaps(t.startDato, t.sluttDato, currentWeek, weekEnd))
              .map(t => t.ansattId)
          )];
          const projAnsatte = projAnsatteIds.map(id => state.ansatte.find(a => a.id === id)).filter(Boolean);
          const color = prosjektColor(prosjekt.id);

          return (
            <div key={prosjekt.id} className="uke-prosjekt-gruppe">
              <div className="uke-prosjekt-header" style={{ borderLeft: `4px solid ${color}` }}>
                <span className="uke-prosjekt-farge" style={{ background: color }} />
                <span className="uke-prosjekt-navn">{prosjekt.navn}</span>
                <span className="uke-prosjekt-antall">{projAnsatte.length} ansatt{projAnsatte.length !== 1 ? 'e' : ''}</span>
              </div>
              <div className="uke-grid-wrap">
                <div className="uke-grid" style={{ gridTemplateColumns: `180px repeat(7, 1fr)` }}>
                  <GridHeader />
                  {projAnsatte.map(ansatt => <AnsattRad key={ansatt.id} ansatt={ansatt} />)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Ledige ansatte */}
        {ledigeAnsatte.length > 0 && (
          <div className="uke-prosjekt-gruppe">
            <div className="uke-prosjekt-header" style={{ borderLeft: '4px solid #9ca3af' }}>
              <span className="uke-prosjekt-navn" style={{ color: '#6b7280' }}>Ikke tildelt denne uken</span>
              <span className="uke-prosjekt-antall">{ledigeAnsatte.length} ansatt{ledigeAnsatte.length !== 1 ? 'e' : ''}</span>
            </div>
            <div className="uke-grid-wrap">
              <div className="uke-grid" style={{ gridTemplateColumns: `180px repeat(7, 1fr)` }}>
                <GridHeader />
                {ledigeAnsatte.map(ansatt => <AnsattRad key={ansatt.id} ansatt={ansatt} />)}
              </div>
            </div>
          </div>
        )}

        {ukeProsjekter.length === 0 && state.ansatte.length > 0 && (
          <div style={{ marginTop: 8 }} />
        )}

        <div style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>
          Klikk på en celle for å legge til en tildeling for den ansatte.
        </div>
      </div>
    );
  }

  // --- PROSJEKTOVERSIKT ---
  function ProsjektOversiktVisning() {
    const today = dateToIso(new Date());
    const aktive = state.prosjekter.filter(p => p.status === 'aktiv' || !p.status);

    return (
      <div className="proj-oversikt-wrap">
        {aktive.length === 0 && <div className="empty">Ingen aktive prosjekter.</div>}
        <div className="proj-oversikt-grid">
          {aktive.map(prosjekt => {
            const tildelinger = state.tildelinger.filter(t => t.prosjektId === prosjekt.id);
            const aktiveTildelinger = tildelinger.filter(t => overlaps(t.startDato, t.sluttDato, today, addDays(today, 30)));
            const ansatteIds = [...new Set(aktiveTildelinger.map(t => t.ansattId))];
            const ansatte = ansatteIds.map(id => state.ansatte.find(a => a.id === id)).filter(Boolean);

            const alleIds = [...new Set(tildelinger.map(t => t.ansattId))];
            const alleAnsatte = alleIds.map(id => state.ansatte.find(a => a.id === id)).filter(Boolean);

            const byFag = {};
            for (const a of ansatte) {
              if (!byFag[a.fag]) byFag[a.fag] = [];
              byFag[a.fag].push(a);
            }

            return (
              <div key={prosjekt.id} className="proj-oversikt-card">
                <div className="proj-oversikt-header">
                  <div className="proj-oversikt-tittel">
                    <div className="proj-oversikt-navn">{prosjekt.navn}</div>
                    {prosjekt.adresse && <div className="proj-oversikt-meta">{prosjekt.adresse}</div>}
                  </div>
                  <div className="proj-oversikt-count">
                    <span className="proj-count-num">{ansatte.length}</span>
                    <span className="proj-count-lbl">nå</span>
                    {alleAnsatte.length !== ansatte.length && (
                      <span className="proj-count-total">/ {alleAnsatte.length} tot.</span>
                    )}
                  </div>
                </div>

                {ansatte.length === 0 ? (
                  <div className="proj-oversikt-tom">
                    {alleAnsatte.length > 0
                      ? `${alleAnsatte.length} tildelt – ingen aktive neste 30 dager`
                      : 'Ingen ansatte tildelt'}
                  </div>
                ) : (
                  <div className="proj-fag-grupper">
                    {Object.entries(byFag).map(([fag, fagAnsatte]) => (
                      <div key={fag} className="proj-fag-rad">
                        <div className="proj-fag-label">
                          <span className="fag-dot" style={{ background: fagColor(fag) }} />
                          <span style={{ color: fagColor(fag), fontWeight: 600, fontSize: 12 }}>{fag}</span>
                          <span className="proj-fag-antall">{fagAnsatte.length}</span>
                        </div>
                        <div className="proj-avatar-rad">
                          {fagAnsatte.map(a => (
                            <div key={a.id} className="proj-avatar-wrap" title={a.navn}>
                              <div className="mini-avatar" style={{ background: fagColor(a.fag), width: 34, height: 34, fontSize: 12 }}>
                                {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="proj-avatar-navn">{a.navn.split(' ')[0]}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- RESSURSALLOKERING ---
  function RessursVisning() {
    // Show 8 weeks from current week
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(currentWeek, i * 7));

    return (
      <div>
        <div className="uke-nav">
          <button className="btn" onClick={prevWeek}>← Forrige</button>
          <div className="uke-label">8-ukers oversikt fra uke {getWeekNumber(currentWeek)}</div>
          <button className="btn" onClick={thisWeek}>I dag</button>
          <button className="btn" onClick={nextWeek}>Neste →</button>
        </div>

        {state.prosjekter.length === 0 && (
          <div className="empty">Ingen prosjekter registrert.</div>
        )}

        {state.fag.map(fag => {
          const fagAnsatte = state.ansatte.filter(a => a.fag === fag);
          if (fagAnsatte.length === 0) return null;
          return (
            <div key={fag} className="ressurs-gruppe">
              <div className="ressurs-fag-header" style={{ borderLeft: `4px solid ${fagColor(fag)}` }}>
                {fag} ({fagAnsatte.length} ansatt{fagAnsatte.length !== 1 ? 'e' : ''})
              </div>
              <div className="ressurs-grid-wrap">
              <div className="ressurs-grid" style={{ gridTemplateColumns: `180px repeat(8, 1fr)` }}>
                <div className="uke-header-cell" style={{ fontSize: 12 }}>Ansatt</div>
                {weeks.map(w => (
                  <div key={w} className="uke-header-cell" style={{ fontSize: 11 }}>
                    Uke {getWeekNumber(w)}<br />{w.slice(5).replace('-', '.')}
                  </div>
                ))}
                {fagAnsatte.map(ansatt => (
                  <React.Fragment key={ansatt.id}>
                    <div className="uke-row-label" style={{ minHeight: 40 }}>
                      <div className="mini-avatar" style={{ background: fagColor(ansatt.fag), width: 28, height: 28, fontSize: 11 }}>
                        {ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="row-navn" style={{ fontSize: 13 }}>{ansatt.navn}</div>
                    </div>
                    {weeks.map(weekStr => {
                      const weekEnd = addDays(weekStr, 6);
                      const tilInUke = state.tildelinger.filter(t =>
                        t.ansattId === ansatt.id && overlaps(t.startDato, t.sluttDato, weekStr, weekEnd)
                      );
                      const prosjekterIUke = tilInUke.map(t =>
                        state.prosjekter.find(p => p.id === t.prosjektId)
                      ).filter(Boolean);
                      const belastning = Math.min(tilInUke.length, 3);
                      const colors = ['#dcfce7', '#fef9c3', '#fee2e2'];
                      const bgColor = belastning === 0 ? '#f9fafb' : colors[belastning - 1];
                      return (
                        <div
                          key={`${ansatt.id}-${weekStr}`}
                          className="ressurs-cell"
                          style={{ background: bgColor }}
                          title={prosjekterIUke.map(p => p.navn).join('\n') || 'Ledig'}
                        >
                          {prosjekterIUke.slice(0, 2).map((p, i) => (
                            <div key={i} className="ressurs-chip">{p.navn.slice(0, 10)}</div>
                          ))}
                          {prosjekterIUke.length > 2 && (
                            <div className="ressurs-chip">+{prosjekterIUke.length - 2}</div>
                          )}
                          {belastning === 0 && <span className="ledig">Ledig</span>}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Bemanningsplan</h2>
        <button className="btn btn-primary" onClick={() => openAddTildeling()}>+ Ny tildeling</button>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'uke' ? 'active' : ''}`} onClick={() => setTab('uke')}>
          Ukeoversikt
        </button>
        <button className={`tab-btn ${tab === 'ressurs' ? 'active' : ''}`} onClick={() => setTab('ressurs')}>
          Ressursallokering
        </button>
        <button className={`tab-btn ${tab === 'prosjekt' ? 'active' : ''}`} onClick={() => setTab('prosjekt')}>
          Prosjektoversikt
        </button>
      </div>

      {tab === 'uke' && <UkeVisning />}
      {tab === 'ressurs' && <RessursVisning />}
      {tab === 'prosjekt' && <ProsjektOversiktVisning />}

      {showModal && (
        <Modal title="Legg til tildeling" onClose={() => setShowModal(false)}>
          <div className="form">
            <label>Ansatt *</label>
            <select value={tilForm.ansattId} onChange={e => setTilForm(f => ({ ...f, ansattId: e.target.value }))}>
              {state.ansatte.map(a => <option key={a.id} value={a.id}>{a.navn} ({a.fag})</option>)}
            </select>

            <label>Prosjekt *</label>
            <select value={tilForm.prosjektId} onChange={e => setTilForm(f => ({ ...f, prosjektId: e.target.value }))}>
              {state.prosjekter.map(p => <option key={p.id} value={p.id}>{p.navn}</option>)}
            </select>

            <div className="form-row">
              <div>
                <label>Fra dato *</label>
                <input type="date" value={tilForm.startDato} onChange={e => setTilForm(f => ({ ...f, startDato: e.target.value }))} />
              </div>
              <div>
                <label>Til dato *</label>
                <input type="date" value={tilForm.sluttDato} onChange={e => setTilForm(f => ({ ...f, sluttDato: e.target.value }))} />
              </div>
            </div>

            {state.ansatte.length === 0 && <p style={{ color: '#dc2626' }}>Legg til ansatte først.</p>}
            {state.prosjekter.length === 0 && <p style={{ color: '#dc2626' }}>Legg til prosjekter først.</p>}

            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button
                className="btn btn-primary"
                onClick={handleAddTildeling}
                disabled={state.ansatte.length === 0 || state.prosjekter.length === 0}
              >
                Lagre
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function getWeekNumber(dateStr) {
  const d = isoToDate(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
