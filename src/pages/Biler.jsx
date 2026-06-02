import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { uid } from '../store';

const MODELLER = ['Transporter','E-NV200','Proace','Expert','Vivaro','Jumpy','Caddy','Transit','Sprinter','Annet'];
const DEKK_TYPER = ['', 'V', 'S'];
const DEKK_LABELS = { V: 'Vinter', S: 'Sommer', '': '–' };
const DEKKLAGRING = ['', 'Dekkhotell', 'Hjemme', 'Firma'];

const TOM_BIL = {
  modell: 'Proace', regNr: '', sjafor: '', abax: '',
  euKontroll: '', dekkType: '', dekklagring: '',
  km: '', kmDato: '', kommentar: '',
};

function dagerTil(isoDate) {
  if (!isoDate) return null;
  return Math.round((new Date(isoDate + 'T00:00:00') - new Date()) / 86400000);
}

function euStatus(isoDate) {
  const d = dagerTil(isoDate);
  if (d === null) return { farge: '#94a3b8', bg: '#f8fafc', label: 'Ukjent' };
  if (d < 0)   return { farge: '#fff', bg: '#dc2626', label: `Forfalt ${Math.abs(d)}d`, ikon: '🚨' };
  if (d <= 30) return { farge: '#fff', bg: '#f59e0b', label: `${d}d igjen`, ikon: '⚠️' };
  if (d <= 90) return { farge: '#92400e', bg: '#fef3c7', label: `${d}d igjen`, ikon: '⏰' };
  return { farge: '#166534', bg: '#dcfce7', label: `${d}d`, ikon: '✅' };
}

function fmt(isoDate) {
  if (!isoDate) return '–';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtKm(km) {
  if (!km) return '';
  const n = parseInt(km.replace(/\s/g, ''), 10);
  return isNaN(n) ? km : n.toLocaleString('nb-NO') + ' km';
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Biler() {
  const { state, dispatch } = useApp();
  const biler = state.biler || [];

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(TOM_BIL);
  const [sok, setSok] = useState('');
  const [filter, setFilter] = useState('alle'); // 'alle' | 'ledig' | 'eu-varsel'
  const [lagretMsg, setLagretMsg] = useState('');

  function visLagret(msg = '✅ Lagret automatisk') {
    setLagretMsg(msg);
    setTimeout(() => setLagretMsg(''), 2500);
  }

  // Statistikk
  const ledigCount   = biler.filter(b => !b.sjafor).length;
  const euVarselCount = biler.filter(b => {
    const d = dagerTil(b.euKontroll);
    return d !== null && d <= 30;
  }).length;
  const dekkhotellCount = biler.filter(b => b.dekklagring === 'Dekkhotell').length;

  const filtrert = biler.filter(b => {
    if (filter === 'ledig' && b.sjafor) return false;
    if (filter === 'eu-varsel') {
      const d = dagerTil(b.euKontroll);
      if (d === null || d > 30) return false;
    }
    if (sok) {
      const q = sok.toLowerCase();
      return (
        b.modell.toLowerCase().includes(q) ||
        b.regNr.toLowerCase().includes(q) ||
        (b.sjafor || '').toLowerCase().includes(q) ||
        (b.kommentar || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  function apneNy() {
    setEditing(null);
    setForm({ ...TOM_BIL, kmDato: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  }

  function apneRediger(b) {
    setEditing(b);
    setForm({ ...b });
    setShowModal(true);
  }

  function lagre() {
    if (!form.regNr.trim()) return;
    if (editing) {
      dispatch({ type: 'UPDATE_BIL', payload: { ...form, id: editing.id } });
      visLagret('✅ Endringer lagret');
    } else {
      dispatch({ type: 'ADD_BIL', payload: { ...form, id: uid() } });
      visLagret('✅ Bil lagt til');
    }
    setShowModal(false);
  }

  function slett(id) {
    if (confirm('Slette bilen?')) {
      dispatch({ type: 'DELETE_BIL', id });
      visLagret('🗑 Bil slettet');
    }
  }

  const summaryCards = [
    { label: 'Totalt',      count: biler.length,      icon: '🚐', color: '#2563eb', bg: '#eff6ff', key: 'alle' },
    { label: 'Ledig',       count: ledigCount,         icon: '🔑', color: '#f59e0b', bg: '#fffbeb', key: 'ledig' },
    { label: 'EU-varsel',   count: euVarselCount,      icon: '🚨', color: '#dc2626', bg: '#fff5f5', key: 'eu-varsel' },
    { label: 'Dekkhotell',  count: dekkhotellCount,    icon: '🔄', color: '#16a34a', bg: '#f0fdf4', key: 'alle' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h2>🚐 Firmabiler <span className="count-badge">{biler.length}</span></h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lagretMsg && (
            <span style={{ fontSize: 13, color: lagretMsg.startsWith('🗑') ? '#64748b' : '#16a34a', fontWeight: 600, transition: 'opacity .3s' }}>
              {lagretMsg}
            </span>
          )}
          <button className="btn btn-primary" onClick={apneNy}>+ Legg til bil</button>
        </div>
      </div>

      {/* Summary-kort */}
      <div className="proj-summary-cards" style={{ marginBottom: 16 }}>
        {summaryCards.map((c, i) => {
          const aktiv = filter === c.key && c.key !== 'alle';
          return (
            <div
              key={i}
              className="proj-summary-card"
              style={{ borderTop: `3px solid ${c.color}`, background: aktiv ? c.color : c.bg, cursor: c.key !== 'alle' ? 'pointer' : 'default' }}
              onClick={() => c.key !== 'alle' && setFilter(f => f === c.key ? 'alle' : c.key)}
            >
              <div className="proj-summary-icon">{c.icon}</div>
              <div className="proj-summary-count" style={{ color: aktiv ? '#fff' : c.color }}>{c.count}</div>
              <div className="proj-summary-label" style={{ color: aktiv ? 'rgba(255,255,255,.85)' : undefined }}>{c.label}</div>
            </div>
          );
        })}
      </div>

      {/* Søk + filter */}
      <div className="toolbar" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <input
          className="search-input"
          placeholder="🔍 Søk reg.nr., sjåfør, modell..."
          value={sok}
          onChange={e => setSok(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        {filter !== 'alle' && (
          <button className="btn btn-sm" onClick={() => setFilter('alle')}>✕ Fjern filter</button>
        )}
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
          {filtrert.length} av {biler.length} biler
        </span>
      </div>

      {/* Tabell */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              {['Modell','Reg.nr.','Sjåfør','EU-Kontroll','Dekk','Dekklagring','KM','Kommentar',''].map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrert.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Ingen biler matcher søket.</td></tr>
            )}
            {filtrert.map((b, idx) => {
              const eu = euStatus(b.euKontroll);
              const ledig = !b.sjafor;
              return (
                <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  {/* Modell */}
                  <td style={{ padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>
                      {b.modell}
                    </span>
                  </td>

                  {/* Reg.nr. */}
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 14 }}>
                    {b.regNr}
                  </td>

                  {/* Sjåfør */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {ledig
                      ? <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 12 }}>🔑 LEDIG</span>
                      : <span style={{ color: '#1e293b' }}>{b.sjafor}</span>
                    }
                  </td>

                  {/* EU-Kontroll */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {b.euKontroll ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{fmt(b.euKontroll)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, background: eu.bg, color: eu.farge, borderRadius: 4, padding: '1px 6px', display: 'inline-block' }}>
                          {eu.ikon} {eu.label}
                        </span>
                      </div>
                    ) : <span style={{ color: '#cbd5e1' }}>–</span>}
                  </td>

                  {/* Dekk */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {b.dekkType ? (
                      <span style={{
                        fontSize: 12, fontWeight: 700, borderRadius: 4, padding: '2px 8px',
                        background: b.dekkType === 'V' ? '#dbeafe' : '#fef9c3',
                        color: b.dekkType === 'V' ? '#1d4ed8' : '#854d0e',
                      }}>
                        {b.dekkType === 'V' ? '❄️ Vinter' : '☀️ Sommer'}
                      </span>
                    ) : <span style={{ color: '#cbd5e1' }}>–</span>}
                  </td>

                  {/* Dekklagring */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: b.dekklagring ? '#374151' : '#cbd5e1', fontSize: 12 }}>
                    {b.dekklagring || '–'}
                  </td>

                  {/* KM */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {b.km ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{fmtKm(b.km)}</span>
                        {b.kmDato && <span style={{ fontSize: 10, color: '#94a3b8' }}>{fmt(b.kmDato)}</span>}
                      </div>
                    ) : <span style={{ color: '#cbd5e1' }}>–</span>}
                  </td>

                  {/* Kommentar */}
                  <td style={{ padding: '8px 12px', maxWidth: 220 }}>
                    {b.kommentar ? (
                      <span style={{ fontSize: 12, color: b.kommentar.toLowerCase().includes('bestillt') ? '#f59e0b' : '#64748b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={b.kommentar}>
                        {b.kommentar}
                      </span>
                    ) : null}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => apneRediger(b)}>Rediger</button>
                      <button className="btn btn-sm btn-danger" onClick={() => slett(b.id)}>Slett</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editing ? `Rediger: ${editing.regNr}` : 'Legg til bil'} onClose={() => setShowModal(false)}>
          <div className="form">
            <div className="form-row">
              <div>
                <label>Modell *</label>
                <select value={form.modell} onChange={e => setForm(f => ({ ...f, modell: e.target.value }))}>
                  {MODELLER.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label>Reg.nr. *</label>
                <input
                  value={form.regNr}
                  onChange={e => setForm(f => ({ ...f, regNr: e.target.value.toUpperCase() }))}
                  placeholder="AB 12345"
                  style={{ fontFamily: 'monospace', fontWeight: 700 }}
                />
              </div>
            </div>

            <label>Sjåfør (la stå tom = LEDIG)</label>
            <input value={form.sjafor} onChange={e => setForm(f => ({ ...f, sjafor: e.target.value }))} placeholder="Navn på sjåfør" />

            <label>EU-Kontroll dato</label>
            <input type="date" value={form.euKontroll} onChange={e => setForm(f => ({ ...f, euKontroll: e.target.value }))} />

            <div className="form-row">
              <div>
                <label>Dekk type</label>
                <select value={form.dekkType} onChange={e => setForm(f => ({ ...f, dekkType: e.target.value }))}>
                  {DEKK_TYPER.map(t => <option key={t} value={t}>{t ? DEKK_LABELS[t] : '– Ikke satt –'}</option>)}
                </select>
              </div>
              <div>
                <label>Dekklagring</label>
                <select value={form.dekklagring} onChange={e => setForm(f => ({ ...f, dekklagring: e.target.value }))}>
                  {DEKKLAGRING.map(d => <option key={d} value={d}>{d || '– Ingen –'}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div>
                <label>Kilometerstand</label>
                <input type="number" value={form.km} onChange={e => setForm(f => ({ ...f, km: e.target.value }))} placeholder="f.eks. 125000" />
              </div>
              <div>
                <label>KM-dato</label>
                <input type="date" value={form.kmDato} onChange={e => setForm(f => ({ ...f, kmDato: e.target.value }))} />
              </div>
            </div>

            <label>ABAX</label>
            <input value={form.abax} onChange={e => setForm(f => ({ ...f, abax: e.target.value }))} placeholder="ABAX-enhet ID" />

            <label>Kommentar</label>
            <textarea value={form.kommentar} onChange={e => setForm(f => ({ ...f, kommentar: e.target.value }))} rows={2} placeholder="Service, feil, oppgaver..." />

            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button className="btn btn-primary" onClick={lagre} disabled={!form.regNr.trim()}>Lagre</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
