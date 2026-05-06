import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const ROLE_LABELS = { admin: 'Administrator', ansatt: 'Ansatt (lesetilgang)' };
const ROLE_COLORS = { admin: '#1e3a5f', ansatt: '#16a34a' };

function authHeader() {
  const token = localStorage.getItem('fbs_token') || '';
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function AdminUsers() {
  const { state } = useApp();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', navn: '', role: 'ansatt', ansattId: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { headers: authHeader() });
      if (!res.ok) throw new Error((await res.json()).error);
      setUsers(await res.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    setInviteUrl('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaveMsg(data.emailSent ? 'Invitasjon sendt på e-post!' : 'Bruker opprettet.');
      if (data.inviteUrl) setInviteUrl(data.inviteUrl);
      setForm({ email: '', navn: '', role: 'ansatt', ansattId: '' });
      setShowForm(false);
      await loadUsers();
    } catch (e) {
      setSaveMsg('Feil: ' + e.message);
    }
    setSaving(false);
  }

  async function handleRoleChange(email, role) {
    await fetch('/api/admin/users', {
      method: 'PUT',
      headers: authHeader(),
      body: JSON.stringify({ email, role }),
    });
    setUsers(u => u.map(x => x.email === email ? { ...x, role } : x));
  }

  async function handleToggleActive(email, active) {
    await fetch('/api/admin/users', {
      method: 'PUT',
      headers: authHeader(),
      body: JSON.stringify({ email, active: !active }),
    });
    setUsers(u => u.map(x => x.email === email ? { ...x, active: !active } : x));
  }

  async function handleDelete(email) {
    if (!confirm(`Slette bruker ${email}?`)) return;
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: authHeader(),
      body: JSON.stringify({ email }),
    });
    setUsers(u => u.filter(x => x.email !== email));
  }

  async function handleResendInvite(email, navn) {
    setSaveMsg('');
    setInviteUrl('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ email, navn, role: users.find(u => u.email === email)?.role || 'ansatt' }),
    });
    const data = await res.json();
    if (res.status === 409) {
      // User exists — send forgot-password instead
      const r2 = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ email }),
      });
      const d2 = await r2.json();
      setSaveMsg('Invitasjonslenke sendt på nytt!');
      if (d2.devResetUrl) setInviteUrl(d2.devResetUrl);
    } else if (res.ok) {
      setSaveMsg('Invitasjon sendt!');
      if (data.inviteUrl) setInviteUrl(data.inviteUrl);
    }
  }

  const ansatte = state.ansatte || [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#1e3a5f' }}>👥 Brukerstyring</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
            Administrer hvem som kan logge inn og hvilken tilgang de har
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { setShowForm(true); setSaveMsg(''); setInviteUrl(''); }}
        >
          + Legg til bruker
        </button>
      </div>

      {saveMsg && (
        <div style={{ background: saveMsg.startsWith('Feil') ? '#fee2e2' : '#dcfce7', border: `1px solid ${saveMsg.startsWith('Feil') ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14, color: saveMsg.startsWith('Feil') ? '#991b1b' : '#166534' }}>
          {saveMsg}
        </div>
      )}

      {inviteUrl && (
        <div style={{ background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
          <strong>⚠ E-post ikke sendt</strong> — Domenet er ikke verifisert i Resend ennå.<br />
          Del denne lenken manuelt med brukeren:<br />
          <a href={inviteUrl} style={{ color: '#1e3a5f', wordBreak: 'break-all' }}>{inviteUrl}</a>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Legg til bruker</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: '16px 0 0' }}>
              <div className="form-group">
                <label>E-postadresse *</label>
                <input
                  type="email"
                  required
                  placeholder="ansatt@follobyggservice.no"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Navn</label>
                <input
                  type="text"
                  placeholder="Fornavn Etternavn"
                  value={form.navn}
                  onChange={e => setForm(f => ({ ...f, navn: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Rolle *</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="ansatt">Ansatt – kun lesetilgang (Bemanningsplan)</option>
                  <option value="admin">Administrator – full tilgang</option>
                </select>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  {form.role === 'admin'
                    ? '🔑 Kan se og endre alt – prosjektledere, anleggsledere, bas'
                    : '👁 Kan kun se Bemanningsplanen – vanlige ansatte'}
                </div>
              </div>
              <div className="form-group">
                <label>Koble til ansatt (valgfritt)</label>
                <select value={form.ansattId} onChange={e => setForm(f => ({ ...f, ansattId: e.target.value }))}>
                  <option value="">— Ingen kobling —</option>
                  {ansatte.map(a => (
                    <option key={a.id} value={a.id}>{a.navn} ({a.fag || 'uten fag'})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Avbryt</button>
                <button type="submit" className="btn-primary" disabled={saving || !form.email}>
                  {saving ? 'Oppretter…' : 'Opprett og send invitasjon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>Laster brukere…</div>
      ) : error ? (
        <div style={{ background: '#fee2e2', borderRadius: 8, padding: 16, color: '#991b1b' }}>{error}</div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
          <p>Ingen brukere ennå. Legg til den første!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {users.sort((a, b) => a.navn.localeCompare(b.navn)).map(u => {
            const kobletAnsatt = ansatte.find(a => a.id === u.ansattId);
            return (
              <div key={u.email} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, opacity: u.active ? 1 : 0.6 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: ROLE_COLORS[u.role], color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                  {(u.navn || u.email)[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{u.navn || u.email}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{u.email}</div>
                  {kobletAnsatt && (
                    <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>Koblet: {kobletAnsatt.navn}</div>
                  )}
                  {!u.hasPassword && (
                    <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 2 }}>⚠ Passord ikke satt ennå</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.email, e.target.value)}
                    style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', color: ROLE_COLORS[u.role], fontWeight: 600 }}
                  >
                    <option value="admin">Administrator</option>
                    <option value="ansatt">Ansatt</option>
                  </select>
                  {!u.hasPassword && (
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => handleResendInvite(u.email, u.navn)}
                    >
                      Send invitasjon
                    </button>
                  )}
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '4px 10px', color: u.active ? '#6b7280' : '#16a34a' }}
                    onClick={() => handleToggleActive(u.email, u.active)}
                  >
                    {u.active ? 'Deaktiver' : 'Aktiver'}
                  </button>
                  <button
                    className="btn-icon"
                    style={{ color: '#ef4444' }}
                    onClick={() => handleDelete(u.email)}
                    title="Slett bruker"
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 32, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '16px 20px', fontSize: 13, color: '#0c4a6e' }}>
        <strong>ℹ Slik fungerer tilgangene:</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 2 }}>
          <li><strong>Administrator</strong> – Full tilgang: bemanningsplan, prosjekter, befaring, reklamasjon, service, ansatte, rørlegger</li>
          <li><strong>Ansatt</strong> – Kun lesetilgang til Bemanningsplan (kan se hvem som jobber hvor)</li>
        </ul>
        <p style={{ margin: '8px 0 0' }}>Nye brukere mottar en e-post med en lenke for å sette passordet sitt. Passordet krever minst 8 tegn, stor bokstav, tall og spesialtegn.</p>
      </div>
    </div>
  );
}
