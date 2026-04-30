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
  'Prosjektleder': '#0ea5e9',
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

const EMPTY = { navn: '', fag: '', telefon: '', epost: '', innleie: false, bursdag: '', utenforBemanningsplan: false };

const MND_NAVN = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];

function bursdagLabel(bursdag) {
  if (!bursdag) return '';
  const [mm, dd] = bursdag.split('-');
  return `${parseInt(dd, 10)}. ${MND_NAVN[parseInt(mm, 10) - 1]}`;
}

export default function Ansatte() {
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [showFagModal, setShowFagModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [nyttFag, setNyttFag] = useState('');
  const [filterFag, setFilterFag] = useState('alle');
  const [search, setSearch] = useState('');
  const [gruppe, setGruppe] = useState('fast'); // 'fast' | 'innleie'

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, fag: state.fag[0] || '', innleie: gruppe === 'innleie' });
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

  let fastCount = 0, innleieCount = 0;
  const alleIGruppe = [];
  for (const a of state.ansatte) {
    if (a.innleie) { innleieCount++; if (gruppe === 'innleie') alleIGruppe.push(a); }
    else           { fastCount++;    if (gruppe === 'fast')    alleIGruppe.push(a); }
  }
  const searchLow = search.toLowerCase();
  const ansatte = alleIGruppe.filter(a =>
    (filterFag === 'alle' || a.fag === filterFag) &&
    (!search || a.navn.toLowerCase().includes(searchLow))
  );

  return (
    <div className="page">
      <div className="page-header">
        <h2>Ansatte <span className="count-badge">{state.ansatte.length}</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setShowFagModal(true)}>Administrer fag</button>
          <button className="btn btn-primary" onClick={openNew}>
            + {gruppe === 'innleie' ? 'Ny innleie' : 'Ny ansatt'}
          </button>
        </div>
      </div>

      {/* Gruppe-tabs */}
      <div className="tab-bar" style={{ marginBottom: 8 }}>
        <button
          className={`tab-btn ${gruppe === 'fast' ? 'active' : ''}`}
          onClick={() => { setGruppe('fast'); setFilterFag('alle'); }}
        >
          👷 Fast ansatte <span className="count-badge" style={{ marginLeft: 4 }}>{fastCount}</span>
        </button>
        <button
          className={`tab-btn ${gruppe === 'innleie' ? 'active' : ''}`}
          onClick={() => { setGruppe('innleie'); setFilterFag('alle'); }}
        >
          🔧 Innleie <span className="count-badge" style={{ marginLeft: 4 }}>{innleieCount}</span>
        </button>
      </div>

      <div className="toolbar">
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <button className={`filter-btn ${filterFag === 'alle' ? 'active' : ''}`} onClick={() => setFilterFag('alle')}>
            Alle ({alleIGruppe.length})
          </button>
          {state.fag.map(f => {
            const cnt = alleIGruppe.filter(a => a.fag === f).length;
            if (cnt === 0) return null;
            return (
              <button
                key={f}
                className={`filter-btn ${filterFag === f ? 'active' : ''}`}
                style={filterFag === f ? { background: fagColor(f), borderColor: fagColor(f) } : {}}
                onClick={() => setFilterFag(f)}
              >
                <span className="fag-dot" style={{ background: fagColor(f), display: 'inline-block', marginRight: 4 }} />
                {f} ({cnt})
              </button>
            );
          })}
        </div>
        <input
          className="search-input"
          placeholder={`Søk ${gruppe === 'innleie' ? 'innleie' : 'ansatt'}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {ansatte.length === 0 ? (
        <div className="empty">
          {gruppe === 'innleie'
            ? 'Ingen innleide arbeidere ennå. Klikk "+ Ny innleie" for å legge til.'
            : 'Ingen ansatte funnet.'}
        </div>
      ) : (
        <div className="compact-table">
          <div className="ct-header">
            <div className="ct-col ct-ansatt-navn">Navn</div>
            <div className="ct-col ct-fag">Fag</div>
            <div className="ct-col ct-kontakt">Telefon</div>
            <div className="ct-col ct-kontakt">E-post</div>
            <div className="ct-col ct-kontakt">Bursdag</div>
            <div className="ct-col ct-actions"></div>
          </div>
          {ansatte.map(a => (
            <div className="ct-row" key={a.id}>
              <div className="ct-col ct-ansatt-navn">
                <div className="ct-avatar" style={{ background: a.innleie ? '#f97316' : fagColor(a.fag) }}>
                  {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span className="ct-prosjekt-navn">{a.navn}</span>
                  {a.innleie && (
                    <span style={{ fontSize: 10, color: '#f97316', fontWeight: 600, letterSpacing: '0.03em' }}>INNLEIE</span>
                  )}
                  {a.utenforBemanningsplan && (
                    <span style={{ fontSize: 10, color: '#b45309', fontWeight: 600, letterSpacing: '0.03em' }}>KONTOR / ADMIN</span>
                  )}
                </div>
              </div>
              <div className="ct-col ct-fag">
                <span className="fag-tag" style={{ background: fagColor(a.fag) + '22', color: fagColor(a.fag), borderColor: fagColor(a.fag) + '55' }}>
                  {a.fag || '–'}
                </span>
              </div>
              <div className="ct-col ct-kontakt">{a.telefon || <span style={{ color: '#cbd5e1' }}>–</span>}</div>
              <div className="ct-col ct-kontakt">{a.epost || <span style={{ color: '#cbd5e1' }}>–</span>}</div>
              <div className="ct-col ct-kontakt">
                {a.bursdag
                  ? <span style={{ color: '#ec4899' }}>🎂 {bursdagLabel(a.bursdag)}</span>
                  : <span style={{ color: '#cbd5e1' }}>–</span>}
              </div>
              <div className="ct-col ct-actions">
                <button className="btn btn-sm" onClick={() => openEdit(a)}>Rediger</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a.id)}>Slett</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal
          title={editing ? (form.innleie ? 'Rediger innleie' : 'Rediger ansatt') : (form.innleie ? 'Ny innleie' : 'Ny ansatt')}
          onClose={() => setShowModal(false)}
        >
          <div className="form">
            {/* Type toggle */}
            <label>Type</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <button
                type="button"
                className={`filter-btn${!form.innleie ? ' active' : ''}`}
                style={!form.innleie ? { background: '#1e293b', borderColor: '#1e293b', color: '#fff' } : {}}
                onClick={() => setForm(f => ({ ...f, innleie: false }))}
              >
                👷 Fast ansatt
              </button>
              <button
                type="button"
                className={`filter-btn${form.innleie ? ' active' : ''}`}
                style={form.innleie ? { background: '#f97316', borderColor: '#f97316', color: '#fff' } : {}}
                onClick={() => setForm(f => ({ ...f, innleie: true }))}
              >
                🔧 Innleie
              </button>
            </div>
            <label>Navn *</label>
            <input value={form.navn} onChange={e => setForm(f => ({ ...f, navn: e.target.value }))} placeholder="Fullt navn" />
            <label>Fag / Stilling</label>
            <select value={form.fag} onChange={e => setForm(f => ({ ...f, fag: e.target.value }))}>
              {state.fag.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <label>Telefon</label>
            <input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} placeholder="+47 000 00 000" />
            <label>E-post</label>
            <input value={form.epost} onChange={e => setForm(f => ({ ...f, epost: e.target.value }))} placeholder="navn@epost.no" />
            <label>🎂 Bursdag (dag og måned)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={form.bursdag ? form.bursdag.split('-')[0] : ''}
                onChange={e => {
                  const mm = e.target.value;
                  const dd = form.bursdag ? form.bursdag.split('-')[1] || '01' : '01';
                  setForm(f => ({ ...f, bursdag: mm ? `${mm}-${dd}` : '' }));
                }}
                style={{ flex: 1 }}
              >
                <option value="">– Velg måned –</option>
                {MND_NAVN.map((m, i) => (
                  <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
                ))}
              </select>
              <select
                value={form.bursdag ? form.bursdag.split('-')[1] || '' : ''}
                onChange={e => {
                  const dd = e.target.value;
                  const mm = form.bursdag ? form.bursdag.split('-')[0] || '01' : '01';
                  setForm(f => ({ ...f, bursdag: dd ? `${mm}-${dd}` : '' }));
                }}
                style={{ flex: 1 }}
                disabled={!form.bursdag || !form.bursdag.split('-')[0]}
              >
                <option value="">– Velg dag –</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={String(d).padStart(2, '0')}>{d}.</option>
                ))}
              </select>
              {form.bursdag && (
                <button type="button" className="btn" onClick={() => setForm(f => ({ ...f, bursdag: '' }))}>✕</button>
              )}
            </div>
            <label style={{ marginTop: 8 }}>Bemanningsplan</label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                background: form.utenforBemanningsplan ? '#fef9ec' : '#f0fdf4',
                border: `1px solid ${form.utenforBemanningsplan ? '#fde68a' : '#bbf7d0'}`,
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setForm(f => ({ ...f, utenforBemanningsplan: !f.utenforBemanningsplan }))}
            >
              <div style={{
                width: 36, height: 20, borderRadius: 10,
                background: form.utenforBemanningsplan ? '#f59e0b' : '#16a34a',
                position: 'relative', transition: 'background .2s',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: form.utenforBemanningsplan ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left .2s',
                }} />
              </div>
              <span style={{ fontSize: 13, color: '#374151' }}>
                {form.utenforBemanningsplan
                  ? '⚠️ Ikke i bemanningsplan (kontor / admin)'
                  : '✅ Inkludert i bemanningsplan'}
              </span>
            </div>
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
