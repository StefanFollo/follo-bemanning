import { useState } from 'react';

const APP_USER = import.meta.env.VITE_APP_USER || 'admin';
const APP_PASS = import.meta.env.VITE_APP_PASS || 'follo2026';

export default function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ user: '', pass: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      if (form.user.trim() === APP_USER && form.pass === APP_PASS) {
        localStorage.setItem('fbs_auth', 'ok');
        onLogin();
      } else {
        setError('Feil brukernavn eller passord.');
      }
      setLoading(false);
    }, 400);
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

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Logger inn…' : 'Logg inn'}
          </button>
        </form>
      </div>
    </div>
  );
}
