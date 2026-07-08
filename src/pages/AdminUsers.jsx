import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

function formatTs(ts) {
  if (!ts) return '–';
  const d = new Date(ts);
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ROLE_LABELS = { admin: 'Administrator', kontor: 'Kontor', rorlegger: 'Rørlegger', befaring: 'Befaring / Service', ansatt: 'Ansatt (lesetilgang)' };
const ROLE_COLORS = { admin: '#1e3a5f', kontor: '#7c3aed', rorlegger: '#0891b2', befaring: '#d97706', ansatt: '#16a34a' };

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
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [diagnose, setDiagnose] = useState(null);
  const [diagnoseLaster, setDiagnoseLaster] = useState(false);
  const [gjenoppretter, setGjenoppretter] = useState(false);
  const [visAnsattInvite, setVisAnsattInvite] = useState(false);
  const [ansattRoller, setAnsattRoller] = useState({});   // { ansattId: rolle }
  const [inviterer, setInviterer] = useState(null);        // ansattId som sendes nå
  const [invitertIds, setInvitertIds] = useState(new Set()); // sendt i denne økten

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

  useEffect(() => { loadUsers(); loadBackups(); }, []);

  async function loadBackups() {
    setBackupLoading(true);
    try {
      const res = await fetch('/api/backup', { headers: authHeader() });
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch { /* silent */ }
    setBackupLoading(false);
  }

  async function gjenopprettManglende(feltNavn) {
    const antall = Object.values(diagnose?.rapport?.manglerSidenNatt || {}).reduce((s, arr) => s + arr.length, 0);
    if (!confirm(`Gjenopprette ${antall} manglende elementer fra nattens backup?\n\nDette LEGGER KUN TIL det som mangler — ingenting eksisterende endres eller slettes.`)) return;
    setGjenoppretter(true);
    try {
      const res = await fetch('/api/admin/gjenopprett-fra-backup', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ dry: false, felt: feltNavn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setBackupMsg(`✅ Gjenopprettet ${data.gjenopprettet} elementer fra backup ${formatTs(data.backupTidspunkt)}. Last inn siden på nytt (Ctrl+Shift+R) for å se dataene.`);
      await kjorDiagnose(); // vis oppdatert status
    } catch (e) {
      setBackupMsg('Feil ved gjenoppretting: ' + e.message);
    }
    setGjenoppretter(false);
  }

  async function kjorDiagnose() {
    setDiagnoseLaster(true);
    setDiagnose(null);
    try {
      const res = await fetch('/api/admin/diagnose-lagring', { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDiagnose(data);
    } catch (e) {
      setDiagnose({ error: e.message });
    }
    setDiagnoseLaster(false);
  }

  async function handleRestore(slot) {
    if (!confirm(`Gjenopprette backup ${slot}? Nåværende data lagres som backup 1 før restore.`)) return;
    setBackupMsg('');
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ slot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBackupMsg(`Backup ${slot} gjenopprettet! Last inn siden på nytt for å se endringene.`);
      await loadBackups();
    } catch (e) {
      setBackupMsg('Feil: ' + e.message);
    }
  }

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

  async function inviterAnsatt(ansatt) {
    const epost = (ansatt.epost || '').trim();
    if (!epost) return;
    const rolle = ansattRoller[ansatt.id] || 'ansatt';
    setInviterer(ansatt.id);
    setSaveMsg('');
    setInviteUrl('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ email: epost, navn: ansatt.navn, role: rolle, ansattId: ansatt.id }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setSaveMsg(`${ansatt.navn} er allerede registrert som bruker.`);
      } else if (!res.ok) {
        throw new Error(data.error);
      } else {
        setSaveMsg(data.emailSent ? `Invitasjon sendt til ${ansatt.navn} (${epost})!` : `Bruker opprettet for ${ansatt.navn}.`);
        if (data.inviteUrl) setInviteUrl(data.inviteUrl);
      }
      setInvitertIds(prev => new Set(prev).add(ansatt.id));
      await loadUsers();
    } catch (e) {
      setSaveMsg('Feil: ' + e.message);
    }
    setInviterer(null);
  }

  const ansatte = [...(state.ansatte || [])].sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  const eksisterendeEmails = new Set(users.map(u => (u.email || '').toLowerCase()));
  // Ansatte med e-post som ikke allerede har bruker
  const inviterbareAnsatte = ansatte.filter(a =>
    (a.epost || '').trim() && !eksisterendeEmails.has(a.epost.trim().toLowerCase())
  );

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
                  <option value="befaring">Befaring / Service – befaring, service og reklamasjon</option>
                  <option value="kontor">Kontor – alt unntatt Bemanningsplan</option>
                  <option value="rorlegger">Rørlegger – kun Rørlegger-siden</option>
                  <option value="admin">Administrator – full tilgang</option>
                </select>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  {form.role === 'admin' ? '🔑 Kan se og endre alt'
                    : form.role === 'kontor' ? '🏢 Ser alt unntatt Bemanningsplan'
                    : form.role === 'rorlegger' ? '🔧 Kun tilgang til Rørlegger-siden'
                    : form.role === 'befaring' ? '🔍 Tilgang til Befaring, Service og Reklamasjon (lese + endre)'
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

      {/* Inviter fra ansattliste */}
      <div style={{ marginBottom: 20, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, overflow: 'hidden' }}>
        <button
          onClick={() => setVisAnsattInvite(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#0c4a6e' }}>
          <span>📋 Inviter fra ansattliste {inviterbareAnsatte.length > 0 && <span style={{ fontSize: 13, fontWeight: 400, color: '#0369a1' }}>({inviterbareAnsatte.length} uten brukerkonto)</span>}</span>
          <span style={{ fontSize: 13 }}>{visAnsattInvite ? '▲' : '▼'}</span>
        </button>

        {visAnsattInvite && (
          <div style={{ padding: '0 18px 16px' }}>
            {inviterbareAnsatte.length === 0 ? (
              <div style={{ fontSize: 13, color: '#0369a1', padding: '8px 0' }}>
                Alle ansatte med e-post har allerede brukerkonto. ✅
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#0369a1', marginBottom: 12 }}>
                  Velg rolle og klikk «Inviter» — invitasjonen sendes til e-posten fra ansattlisten.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {inviterbareAnsatte.map(a => {
                    const sendt = invitertIds.has(a.id);
                    const sender = inviterer === a.id;
                    return (
                      <div key={a.id} style={{ background: 'white', border: '1px solid #e0f2fe', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.navn}</div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{a.epost}{a.fag ? ` · ${a.fag}` : ''}</div>
                        </div>
                        <select
                          value={ansattRoller[a.id] || 'ansatt'}
                          onChange={e => setAnsattRoller(r => ({ ...r, [a.id]: e.target.value }))}
                          disabled={sendt}
                          style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', flexShrink: 0 }}>
                          <option value="ansatt">Ansatt</option>
                          <option value="befaring">Befaring / Service</option>
                          <option value="kontor">Kontor</option>
                          <option value="rorlegger">Rørlegger</option>
                          <option value="admin">Administrator</option>
                        </select>
                        <button
                          className={sendt ? 'btn-secondary' : 'btn-primary'}
                          style={{ fontSize: 13, padding: '6px 14px', flexShrink: 0, opacity: sendt ? 0.6 : 1 }}
                          disabled={sender || sendt}
                          onClick={() => inviterAnsatt(a)}>
                          {sender ? 'Sender…' : sendt ? '✓ Sendt' : '✉ Inviter'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

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
                    style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', color: ROLE_COLORS[u.role] || '#374151', fontWeight: 600 }}
                  >
                    <option value="admin">Administrator</option>
                    <option value="kontor">Kontor</option>
                    <option value="befaring">Befaring / Service</option>
                    <option value="rorlegger">Rørlegger</option>
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
          <li><strong>Administrator</strong> – Full tilgang: alle sider inkl. Bemanningsplan og Brukerstyring</li>
          <li><strong>Kontor</strong> – Tilgang til alt unntatt Bemanningsplan (oversikt, befaring, reklamasjon, service, prosjekter, ansatte, framdrift)</li>
          <li><strong>Befaring / Service</strong> – Tilgang til Befaring, Service og Reklamasjon (lese og endre)</li>
          <li><strong>Rørlegger</strong> – Kun tilgang til Rørlegger-siden</li>
          <li><strong>Ansatt</strong> – Kun lesetilgang til Bemanningsplan (kan se hvem som jobber hvor)</li>
        </ul>
        <p style={{ margin: '8px 0 0' }}>Nye brukere mottar en e-post med en lenke for å sette passordet sitt. Passordet krever minst 8 tegn, stor bokstav, tall og spesialtegn.</p>
      </div>

      {/* Sikkerhetskopier */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: '#1e3a5f' }}>Sikkerhetskopier</h3>
          <button
            className="btn-secondary"
            style={{ fontSize: 13 }}
            onClick={loadBackups}
            disabled={backupLoading}
          >
            {backupLoading ? 'Laster…' : 'Last inn sikkerhetskopier'}
          </button>
        </div>

        {backupMsg && (
          <div style={{ background: backupMsg.startsWith('Feil') ? '#fee2e2' : '#dcfce7', border: `1px solid ${backupMsg.startsWith('Feil') ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 14, color: backupMsg.startsWith('Feil') ? '#991b1b' : '#166534' }}>
            {backupMsg}
          </div>
        )}

        {backups.length === 0 ? (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
            {backupLoading ? 'Laster sikkerhetskopier…' : 'Ingen sikkerhetskopier tilgjengelig ennå. Lagring skjer automatisk ved hver endring.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {backups.map(b => (
              <div key={b.slot} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1e3a5f', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                  {b.slot}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Backup {b.slot}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    Tidspunkt: {formatTs(b.backedUpAt)}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {b.befaringer} befaringer &bull; {b.tildelinger} tildelinger &bull; {b.ansatte} ansatte &bull; {b.prosjekter} prosjekter
                  </div>
                </div>
                <button
                  className="btn-secondary"
                  style={{ fontSize: 13, flexShrink: 0 }}
                  onClick={() => handleRestore(b.slot)}
                >
                  Gjenopprett
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
          Systemet lagrer automatisk de 5 siste versjonene av alle data (slettes etter 7 dager). Kun administratorer kan gjenopprette.
        </div>
      </div>

      {/* Diagnose lagring: sammenlign dagens data mot nattens backup */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: '#1e3a5f' }}>🩺 Diagnose lagring</h3>
          <button
            className="btn-secondary"
            style={{ fontSize: 13 }}
            onClick={kjorDiagnose}
            disabled={diagnoseLaster}
          >
            {diagnoseLaster ? 'Analyserer…' : 'Sammenlign mot nattens backup'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
          Kun lesing — viser hva som eventuelt mangler i dag sammenlignet med nattens automatiske backup. Ingenting endres eller slettes.
        </div>

        {diagnose?.error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', fontSize: 14, color: '#991b1b' }}>
            Feil: {diagnose.error}
          </div>
        )}

        {diagnose?.rapport && (() => {
          const r = diagnose.rapport;
          const mangler = r.manglerSidenNatt;
          const harMangler = mangler && typeof mangler === 'object';
          const innholdstap = r.prosjektInnholdstap;
          const harInnholdstap = Array.isArray(innholdstap) && innholdstap.length > 0;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Nå (sist lagret {r.naa._updatedAtLesbar || '–'})</div>
                <div style={{ color: '#6b7280' }}>
                  {Object.entries(r.naa.antall || {}).map(([k, v]) => `${v} ${k}`).join(' · ')}
                </div>
                {r.nattbackup?.tidspunkt && (
                  <div style={{ color: '#6b7280', marginTop: 6 }}>
                    Nattbackup {formatTs(r.nattbackup.tidspunkt)}: {Object.entries(r.nattbackup.antall || r.nattbackup.statistikk || {}).map(([k, v]) => `${v} ${k}`).join(' · ')}
                  </div>
                )}
                {r.nattbackup?.feil && <div style={{ color: '#dc2626', marginTop: 6 }}>⚠️ {r.nattbackup.feil}</div>}
              </div>

              {!harMangler && !harInnholdstap && (
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', fontSize: 14, color: '#166534' }}>
                  ✅ Ingen data mangler sammenlignet med nattens backup
                </div>
              )}

              {harMangler && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>⚠️ Elementer som fantes i natt men mangler nå:</div>
                  {Object.entries(mangler).map(([k, items]) => (
                    <div key={k} style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{k} ({items.length}):</div>
                      {items.map(it => (
                        <div key={it.id} style={{ color: '#7f1d1d', paddingLeft: 12, fontSize: 12 }}>
                          • {it.navn || it.id}{it.adresse ? ` — ${it.adresse}` : ''}{it.status ? ` (${it.status})` : ''}
                        </div>
                      ))}
                    </div>
                  ))}
                  <button
                    onClick={() => gjenopprettManglende(Object.keys(mangler))}
                    disabled={gjenoppretter}
                    style={{ marginTop: 8, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                  >
                    {gjenoppretter ? '⏳ Gjenoppretter…' : '↩️ Gjenopprett manglende fra nattens backup'}
                  </button>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 6 }}>Legger kun tilbake det som mangler — ingenting eksisterende endres eller slettes.</div>
                </div>
              )}

              {harInnholdstap && (
                <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: 8 }}>⚠️ Prosjekter som har mistet framdrift/sjekklister siden natten:</div>
                  {innholdstap.map(p => (
                    <div key={p.id} style={{ color: '#7c2d12', paddingLeft: 12, fontSize: 12 }}>
                      • {p.navn}: framdrift-faser {p.framdriftFaser}, sjekklister {p.sjekklister}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 12, color: '#9ca3af' }}>{r.bevart}</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
