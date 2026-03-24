import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, PROSJEKT_PALETTE } from '../store';

const STATUS_LABELS = { planlagt: 'Planlagt', aktiv: 'Aktiv', fullfort: 'Fullfort' };
const STATUS_COLORS = { planlagt: '#6b7280', aktiv: '#2563eb', fullfort: '#16a34a' };

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

const EMPTY = { navn: '', adresse: '', startDato: '', sluttDato: '', status: 'planlagt', beskrivelse: '', farge: PROSJEKT_PALETTE[0] };

export default function Prosjekter() {
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState('alle');
  const [search, setSearch] = useState('');

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

  const prosjekter = state.prosjekter
    .filter(p => filter === 'alle' || p.status === filter)
    .filter(p => !search || p.navn.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page">
      <div className="page-header">
        <h2>Prosjekter <span className="count-badge">{state.prosjekter.length}</span></h2>
        <button className="btn btn-primary" onClick={openNew}>+ Nytt prosjekt</button>
      </div>

      <div className="toolbar">
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          {['alle', 'planlagt', 'aktiv', 'fullfort'].map(s => (
            <button
              key={s}
              className={`filter-btn ${filter === s ? 'active' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s === 'alle' ? 'Alle' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          placeholder="Søk prosjekt..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {prosjekter.length === 0 ? (
        <div className="empty">Ingen prosjekter funnet.</div>
      ) : (
        <div className="compact-table">
          <div className="ct-header">
            <div className="ct-col ct-name">Prosjektnavn</div>
            <div className="ct-col ct-status">Status</div>
            <div className="ct-col ct-dato">Startdato</div>
            <div className="ct-col ct-dato">Sluttdato</div>
            <div className="ct-col ct-progress">Fremdrift</div>
            <div className="ct-col ct-actions"></div>
          </div>
          {prosjekter.map(p => {
            const opp = state.oppgaver.filter(o => o.prosjektId === p.id);
            const fremgang = opp.length
              ? Math.round(opp.reduce((s, o) => s + (o.fremgang || 0), 0) / opp.length)
              : null;

            return (
              <div className="ct-row" key={p.id}>
                <div className="ct-col ct-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="prosjekt-farge-dot" style={{ background: p.farge || '#6b7280' }} />
                  <div>
                    <span className="ct-prosjekt-navn">{p.navn}</span>
                    {p.adresse && <span className="ct-sub">{p.adresse}</span>}
                  </div>
                </div>
                <div className="ct-col ct-status">
                  <span className="badge" style={{ background: STATUS_COLORS[p.status], fontSize: 11 }}>
                    {STATUS_LABELS[p.status]}
                  </span>
                </div>
                <div className="ct-col ct-dato">{formatDate(p.startDato) || '–'}</div>
                <div className="ct-col ct-dato">{formatDate(p.sluttDato) || '–'}</div>
                <div className="ct-col ct-progress">
                  {fremgang !== null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <div className="progress-fill" style={{ width: fremgang + '%' }} />
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
      )}

      {showModal && (
        <Modal title={editing ? 'Rediger prosjekt' : 'Nytt prosjekt'} onClose={() => setShowModal(false)}>
          <div className="form">
            <label>Prosjektnavn *</label>
            <input value={form.navn} onChange={e => setForm(f => ({ ...f, navn: e.target.value }))} placeholder="Prosjektnavn" />
            <label>Adresse</label>
            <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="Adresse" />
            <label>Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="planlagt">Planlagt</option>
              <option value="aktiv">Aktiv</option>
              <option value="fullfort">Fullfort</option>
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
