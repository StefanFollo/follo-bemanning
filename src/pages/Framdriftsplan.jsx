import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate } from '../store';

const FAG_COLORS = {
  'Bas Tømrer': '#f59e0b',
  'Montør': '#3b82f6',
  'Lærling Tømrer': '#16a34a',
  'Maler': '#ec4899',
  'Rørlegger': '#06b6d4',
  'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316',
};

function fagColor(fag) { return FAG_COLORS[fag] || '#6b7280'; }

function progressColor(pct) {
  if (pct >= 80) return '#16a34a';
  if (pct >= 40) return '#2563eb';
  return '#dc2626';
}

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

const EMPTY_OPPGAVE = { navn: '', fag: '', fremgang: 0 };

export default function Framdriftsplan() {
  const { state, dispatch } = useApp();
  const [selectedProsjekt, setSelectedProsjekt] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingOppgave, setEditingOppgave] = useState(null);
  const [oppgaveForm, setOppgaveForm] = useState(EMPTY_OPPGAVE);

  const prosjekt = state.prosjekter.find(p => p.id === selectedProsjekt) || state.prosjekter[0];

  function openAddOppgave() {
    setEditingOppgave(null);
    setOppgaveForm({ ...EMPTY_OPPGAVE, fag: state.fag[0] || '' });
    setShowModal(true);
  }

  function openEditOppgave(o) {
    setEditingOppgave(o);
    setOppgaveForm({ ...o });
    setShowModal(true);
  }

  function handleSaveOppgave() {
    if (!oppgaveForm.navn.trim() || !prosjekt) return;
    if (editingOppgave) {
      dispatch({ type: 'UPDATE_OPPGAVE', payload: { ...oppgaveForm, id: editingOppgave.id } });
    } else {
      dispatch({ type: 'ADD_OPPGAVE', payload: { ...oppgaveForm, prosjektId: prosjekt.id } });
    }
    setShowModal(false);
  }

  function handleDeleteOppgave(id) {
    if (confirm('Slett oppgaven?')) {
      dispatch({ type: 'DELETE_OPPGAVE', id });
    }
  }

  function handleFremgangChange(oppgave, val) {
    dispatch({ type: 'UPDATE_OPPGAVE', payload: { ...oppgave, fremgang: Number(val) } });
  }

  const prosjektOppgaver = prosjekt
    ? state.oppgaver.filter(o => o.prosjektId === prosjekt.id)
    : [];

  const totalFremgang = prosjektOppgaver.length
    ? Math.round(prosjektOppgaver.reduce((s, o) => s + (o.fremgang || 0), 0) / prosjektOppgaver.length)
    : 0;

  // Group by fag
  const fagGrupper = state.fag.map(fag => ({
    fag,
    oppgaver: prosjektOppgaver.filter(o => o.fag === fag),
  })).filter(g => g.oppgaver.length > 0);

  // UklassifiserteOppgaver
  const uklassifiserte = prosjektOppgaver.filter(o => !state.fag.includes(o.fag));

  // Oversikt: alle prosjekter
  function Oversikt() {
    return (
      <div className="framdrift-oversikt">
        <h3 style={{ marginBottom: 16 }}>Samlet fremdrift</h3>
        {state.prosjekter.length === 0 ? (
          <div className="empty">Ingen prosjekter registrert.</div>
        ) : (
          state.prosjekter.map(p => {
            const opp = state.oppgaver.filter(o => o.prosjektId === p.id);
            const fremgang = opp.length
              ? Math.round(opp.reduce((s, o) => s + (o.fremgang || 0), 0) / opp.length)
              : null;

            return (
              <div
                key={p.id}
                className={`framdrift-prosjekt-row ${prosjekt?.id === p.id ? 'selected' : ''}`}
                onClick={() => setSelectedProsjekt(p.id)}
              >
                <div className="framdrift-p-info">
                  <div className="framdrift-p-navn">{p.navn}</div>
                  <div className="framdrift-p-meta">{p.adresse} · {formatDate(p.startDato)} – {formatDate(p.sluttDato)}</div>
                </div>
                <div className="framdrift-p-bar">
                  {fremgang !== null ? (
                    <>
                      <div className="progress-bar" style={{ flex: 1, marginRight: 8 }}>
                        <div
                          className="progress-fill"
                          style={{ width: fremgang + '%', background: progressColor(fremgang) }}
                        />
                      </div>
                      <div className="fremgang-pct" style={{ color: progressColor(fremgang) }}>
                        {fremgang}%
                      </div>
                    </>
                  ) : (
                    <span style={{ color: '#9ca3af', fontSize: 13 }}>Ingen oppgaver</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Framdriftsplan</h2>
        {prosjekt && (
          <button className="btn btn-primary" onClick={openAddOppgave}>+ Ny oppgave</button>
        )}
      </div>

      <div className="framdrift-layout">
        {/* Venstre: prosjektoversikt */}
        <div className="framdrift-sidebar">
          <Oversikt />
        </div>

        {/* Høyre: detalj per prosjekt */}
        <div className="framdrift-detail">
          {!prosjekt ? (
            <div className="empty">Velg et prosjekt for å se detaljer.</div>
          ) : (
            <>
              <div className="framdrift-detail-header">
                <div>
                  <h3>{prosjekt.navn}</h3>
                  <div style={{ color: '#6b7280', fontSize: 14 }}>{prosjekt.adresse}</div>
                </div>
                <div className="total-fremgang" style={{ color: progressColor(totalFremgang) }}>
                  {totalFremgang}%
                  <div style={{ fontSize: 12, color: '#6b7280' }}>total</div>
                </div>
              </div>

              {prosjektOppgaver.length > 0 && (
                <div className="progress-bar big-bar" style={{ marginBottom: 20 }}>
                  <div
                    className="progress-fill"
                    style={{ width: totalFremgang + '%', background: progressColor(totalFremgang) }}
                  />
                </div>
              )}

              {prosjektOppgaver.length === 0 ? (
                <div className="empty">
                  Ingen oppgaver. Klikk "+ Ny oppgave" for å legge til.
                </div>
              ) : (
                <>
                  {fagGrupper.map(({ fag, oppgaver }) => {
                    const fagFremgang = Math.round(
                      oppgaver.reduce((s, o) => s + (o.fremgang || 0), 0) / oppgaver.length
                    );
                    return (
                      <div key={fag} className="fag-gruppe">
                        <div className="fag-gruppe-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="fag-dot-lg" style={{ background: fagColor(fag) }} />
                            <span className="fag-gruppe-navn">{fag}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="progress-bar" style={{ width: 100 }}>
                              <div
                                className="progress-fill"
                                style={{ width: fagFremgang + '%', background: fagColor(fag) }}
                              />
                            </div>
                            <span style={{ color: fagColor(fag), fontWeight: 600, minWidth: 38 }}>
                              {fagFremgang}%
                            </span>
                          </div>
                        </div>

                        {oppgaver.map(o => (
                          <div key={o.id} className="oppgave-row">
                            <div className="oppgave-navn">{o.navn}</div>
                            <div className="oppgave-slider-wrap">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={o.fremgang || 0}
                                onChange={e => handleFremgangChange(o, e.target.value)}
                                className="oppgave-slider"
                                style={{ '--pct': (o.fremgang || 0) + '%', '--color': fagColor(o.fag) }}
                              />
                              <span className="oppgave-pct">{o.fremgang || 0}%</span>
                            </div>
                            <div className="oppgave-actions">
                              <button className="btn btn-sm" onClick={() => openEditOppgave(o)}>✎</button>
                              <button className="btn btn-sm btn-danger" onClick={() => handleDeleteOppgave(o.id)}>✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {uklassifiserte.length > 0 && (
                    <div className="fag-gruppe">
                      <div className="fag-gruppe-header">
                        <span className="fag-gruppe-navn" style={{ color: '#6b7280' }}>Andre</span>
                      </div>
                      {uklassifiserte.map(o => (
                        <div key={o.id} className="oppgave-row">
                          <div className="oppgave-navn">{o.navn}</div>
                          <div className="oppgave-slider-wrap">
                            <input
                              type="range" min={0} max={100} step={5}
                              value={o.fremgang || 0}
                              onChange={e => handleFremgangChange(o, e.target.value)}
                              className="oppgave-slider"
                            />
                            <span className="oppgave-pct">{o.fremgang || 0}%</span>
                          </div>
                          <div className="oppgave-actions">
                            <button className="btn btn-sm" onClick={() => openEditOppgave(o)}>✎</button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleDeleteOppgave(o.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showModal && prosjekt && (
        <Modal
          title={editingOppgave ? 'Rediger oppgave' : 'Ny oppgave'}
          onClose={() => setShowModal(false)}
        >
          <div className="form">
            <label>Oppgavenavn *</label>
            <input
              value={oppgaveForm.navn}
              onChange={e => setOppgaveForm(f => ({ ...f, navn: e.target.value }))}
              placeholder="Beskriv oppgaven"
            />

            <label>Fag</label>
            <select value={oppgaveForm.fag} onChange={e => setOppgaveForm(f => ({ ...f, fag: e.target.value }))}>
              {state.fag.map(f => <option key={f} value={f}>{f}</option>)}
            </select>

            <label>Fremdrift: {oppgaveForm.fremgang}%</label>
            <input
              type="range" min={0} max={100} step={5}
              value={oppgaveForm.fremgang}
              onChange={e => setOppgaveForm(f => ({ ...f, fremgang: Number(e.target.value) }))}
            />

            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button className="btn btn-primary" onClick={handleSaveOppgave}>Lagre</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
