import { useState } from 'react';

export default function LoginPage({ onLogin }) {
  const [view, setView] = useState('login'); // 'login' | 'forgot' | 'forgot-sent'
  const [form, setForm] = useState({ email: '', pass: '' });
  const [forgotEmail, setForgotEmail] = useState('');
  const [devResetUrl, setDevResetUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), password: form.pass }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('fbs_token', data.token);
        localStorage.setItem('fbs_role', data.role || 'admin');
        localStorage.setItem('fbs_user_navn', data.navn || '');
        localStorage.removeItem('fbs_auth');
        onLogin(data.role || 'admin', data.navn || '');
      } else {
        setError(data.error || 'Innlogging feilet.');
      }
    } catch {
      setError('Nettverksfeil — er du tilkoblet internett?');
    }
    setLoading(false);
  }

  async function handleForgot(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setDevResetUrl(data.devResetUrl || '');
        setView('forgot-sent');
      } else {
        setError(data.error || 'Noe gikk galt.');
      }
    } catch {
      setError('Nettverksfeil — er du tilkoblet internett?');
    }
    setLoading(false);
  }

  if (view === 'forgot') {
    return (
      <div className="login-bg">
        <div className="login-card">
          <div className="login-logo">FBS</div>
          <h1 className="login-title">Glemt passord</h1>
          <p className="login-sub">Vi sender deg en lenke for å sette nytt passord</p>
          <form className="login-form" onSubmit={handleForgot}>
            <div className="login-field">
              <label>E-postadresse</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="din@epost.no"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                autoFocus
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-btn" disabled={loading || !forgotEmail.trim()}>
              {loading ? 'Sender…' : 'Send tilbakestillingslenke'}
            </button>
          </form>
          <button className="login-link-btn" onClick={() => { setView('login'); setError(''); }}>
            ← Tilbake til innlogging
          </button>
        </div>
      </div>
    );
  }

  if (view === 'forgot-sent') {
    return (
      <div className="login-bg">
        <div className="login-card">
          <div className="login-logo" style={{ background: '#16a34a' }}>✓</div>
          <h1 className="login-title">Sjekk e-posten</h1>
          <p className="login-sub" style={{ textAlign: 'center', lineHeight: 1.6 }}>
            Hvis det finnes en konto med <strong>{forgotEmail}</strong>, har vi sendt en lenke for å sette nytt passord.
          </p>
          {devResetUrl && (
            <div style={{ background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 8, padding: '12px 16px', marginTop: 16, fontSize: 13 }}>
              <strong>🛠 Dev-modus</strong> (ingen e-posttjeneste konfigurert)<br />
              <a href={devResetUrl} style={{ color: '#1e3a5f', wordBreak: 'break-all' }}>{devResetUrl}</a>
            </div>
          )}
          <button className="login-btn" style={{ marginTop: 24 }} onClick={() => { setView('login'); setDevResetUrl(''); }}>
            Tilbake til innlogging
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">FBS</div>
        <h1 className="login-title">FolloByggService</h1>
        <p className="login-sub">Bemannings- og framdriftsplanlegger</p>
        <form className="login-form" onSubmit={handleLogin}>
          <div className="login-field">
            <label>E-postadresse</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="din@epost.no"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="login-field">
            <label>Passord</label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Passord"
              value={form.pass}
              onChange={e => setForm(f => ({ ...f, pass: e.target.value }))}
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-btn" disabled={loading || !form.email || !form.pass}>
            {loading ? 'Logger inn…' : 'Logg inn'}
          </button>
          <button
            type="button"
            className="login-link-btn"
            onClick={() => { setForgotEmail(form.email); setView('forgot'); setError(''); }}
          >
            Glemt passord?
          </button>
        </form>
      </div>
    </div>
  );
}
