import { useState } from 'react';

export default function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ user: '', pass: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.user.trim(), password: form.pass }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('fbs_token', data.token);
        localStorage.removeItem('fbs_auth'); // fjern gammel nøkkel
        onLogin();
      } else {
        setError(data.error || 'Innlogging feilet.');
      }
    } catch {
      setError('Nettverksfeil — er du tilkoblet internett?');
    }
    setLoading(false);
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">FBS</div>
        <h1 className="login-title">FolloByggService</h1>
        <p className="login-sub">Bemannings- og framdriftsplanlegger</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Brukernavn</label>
            <input
              type="text"
              autoComplete="username"
              placeholder="Brukernavn"
              value={form.user}
              onChange={e => setForm(f => ({ ...f, user: e.target.value }))}
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

          <button type="submit" className="login-btn" disabled={loading || !form.user || !form.pass}>
            {loading ? 'Logger inn…' : 'Logg inn'}
          </button>
        </form>
      </div>
    </div>
  );
}
