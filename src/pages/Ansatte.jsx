import { useState } from 'react';
import { useApp } from '../context/AppContext';

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

const EMPTY = { navn: '', fag: '', telefon: '', epost: '' };

export default function Ansatte() {
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [showFagModal, setShowFagModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [nyttFag, setNyttFag] = useState('');
  const [filterFag, setFilterFag] = useState('alle');
  const [search, setSearch] = useState('');

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, fag: state.fag[0] || '' });
    setShowModal(true);
  }

  function openEdit(a) {
    setEditing(a);
    setForm({ ...a });
    setShowModal(true);
  }

  function handleSave() {
    if (!form.navn.trim()) return;
    if (editing) {
      dispatch({ type: 'UPDATE_ANSATT', payload: { ...form, id: editing.id } });
    } else {
      dispatch({ type: 'ADD_ANSATT', payload: form });
    }
    setShowModal(false);
  }

  function handleDelete(id) {
    if (confirm('Slett ansatt og alle tilknyttede tildelinger?')) {
      dispatch({ type: 'DELETE_ANSATT', id });
    }
  }

  function handleAddFag() {
    if (!nyttFag.trim()) return;
    dispatch({ type: 'ADD_FAG', navn: nyttFag.trim() });
    setNyttFag('');
  }

  function handleDeleteFag(navn) {
    if (confirm(`Slett faget "${navn}"?`)) {
      dispatch({ type: 'DELETE_FAG', navn });
    }
  }

  const ansatte = state.ansatte
    .filter(a => filterFag === 'alle' || a.fag === filterFag)
    .filter(a => !search || a.navn.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page">
      <div className="page-header">
        <h2>Ansatte <span className="count-badge">{state.ansatte.length}</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setShowFagModal(true)}>Administrer fag</button>
          <button className="btn btn-primary" onClick={openNew}>+ Ny ansatt</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <button className={`filter-btn ${filterFag === 'alle' ? 'active' : ''}`} onClick={() => setFilterFag('alle')}>
            Alle ({state.ansatte.length})
          </button>
          {state.fag.map(f => (
            <button
              key={f}
              className={`filter-btn ${filterFag === f ? 'active' : ''}`}
              style={filterFag === f ? { background: fagColor(f), borderColor: fagColor(f) } : {}}
              onClick={() => setFilterFag(f)}
            >
              <span className="fag-dot" style={{ background: fagColor(f), display: 'inline-block', marginRight: 4 }} />
              {f} ({state.ansatte.filter(a => a.fag === f).length})
            </button>
          ))}
        </div>
        <input
          className="search-input"
          placeholder="Søk ansatt..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {ansatte.length === 0 ? (
        <div className="empty">Ingen ansatte funnet.</div>
      ) : (
        <div className="compact-table">
          <div className="ct-header">
            <div className="ct-col ct-ansatt-navn">Navn</div>
            <div className="ct-col ct-fag">Fag</div>
            <div className="ct-col ct-kontakt">Telefon</div>
            <div className="ct-col ct-kontakt">E-post</div>
            <div className="ct-col ct-actions"></div>
          </div>
          {ansatte.map(a => (
            <div className="ct-row" key={a.id}>
              <div className="ct-col ct-ansatt-navn">
                <div className="ct-avatar" style={{ background: fagColor(a.fag) }}>
                  {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <span className="ct-prosjekt-navn">{a.navn}</span>
              </div>
              <div className="ct-col ct-fag">
                <span className="fag-tag" style={{ background: fagColor(a.fag) + '22', color: fagColor(a.fag), borderColor: fagColor(a.fag) + '55' }}>
                  {a.fag || '–'}
                </span>
              </div>
              <div className="ct-col ct-kontakt">{a.telefon || <span style={{ color: '#cbd5e1' }}>–</span>}</div>
              <div className="ct-col ct-kontakt">{a.epost || <span style={{ color: '#cbd5e1' }}>–</span>}</div>
              <div className="ct-col ct-actions">
                <button className="btn btn-sm" onClick={() => openEdit(a)}>Rediger</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a.id)}>Slett</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Rediger ansatt' : 'Ny ansatt'} onClose={() => setShowModal(false)}>
          <div className="form">
            <label>Navn *</label>
            <input value={form.navn} onChange={e => setForm(f => ({ ...f, navn: e.target.value }))} placeholder="Fullt navn" />
            <label>Fag</label>
            <select value={form.fag} onChange={e => setForm(f => ({ ...f, fag: e.target.value }))}>
              {state.fag.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <label>Telefon</label>
            <input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} placeholder="+47 000 00 000" />
            <label>E-post</label>
            <input value={form.epost} onChange={e => setForm(f => ({ ...f, epost: e.target.value }))} placeholder="navn@epost.no" />
            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button className="btn btn-primary" onClick={handleSave}>Lagre</button>
            </div>
          </div>
        </Modal>
      )}

      {showFagModal && (
        <Modal title="Administrer fag" onClose={() => setShowFagModal(false)}>
          <div className="form">
            <div className="fag-list">
              {state.fag.map(f => (
                <div key={f} className="fag-item">
                  <span className="fag-dot" style={{ background: fagColor(f) }} />
                  <span>{f}</span>
                  <button className="btn-icon btn-danger-icon" onClick={() => handleDeleteFag(f)}>✕</button>
                </div>
              ))}
            </div>
            <label>Legg til nytt fag</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nyttFag} onChange={e => setNyttFag(e.target.value)} placeholder="Fagnavn" onKeyDown={e => e.key === 'Enter' && handleAddFag()} />
              <button className="btn btn-primary" onClick={handleAddFag}>Legg til</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
