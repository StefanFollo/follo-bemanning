import { useState } from 'react';

function strength(pw) {
  if (!pw) return { score: 0, label: '', color: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[!@#$%^&*()\-_=+{};:,<.>?/|[\]\\~`"']/.test(pw)) s++;
  const labels = ['', 'Svakt', 'Middels', 'Bra', 'Sterkt'];
  const colors = ['', '#ef4444', '#b45309', '#3b82f6', '#15803d'];
  return { score: s, label: labels[s], color: colors[s] };
}

export default function ResetPassword({ token, onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const st = strength(pw);
  const mismatch = pw2 && pw !== pw2;

  async function handleSubmit(e) {
    e.preventDefault();
    if (pw !== pw2) { setError('Passordene er ikke like.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw }),
      });
      const data = await res.json();
      if (res.ok) {
        setDone(true);
      } else {
        setError(data.error || 'Noe gikk galt.');
      }
    } catch {
      setError('Nettverksfeil — er du tilkoblet internett?');
    }
    setLoading(false);
  }

  if (done) {
    return (
      <div className="login-bg">
        <div className="login-card">
          <div className="login-logo" style={{ background: '#15803d' }}>✓</div>
          <h1 className="login-title">Passord satt!</h1>
          <p className="login-sub" style={{ textAlign: 'center' }}>
            Passordet ditt er oppdatert. Du kan nå logge inn.
          </p>
          <button className="login-btn" style={{ marginTop: 24 }} onClick={onDone}>
            Gå til innlogging
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">FBS</div>
        <h1 className="login-title">Sett nytt passord</h1>
        <p className="login-sub">Velg et sterkt passord for kontoen din</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Nytt passord</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Nytt passord"
                value={pw}
                onChange={e => setPw(e.target.value)}
                autoFocus
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#5d6b80' }}
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
            {pw && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= st.score ? st.color : '#e5e7eb', transition: 'background 0.2s' }} />
                  ))}
                </div>
                <div style={{ fontSize: 12, color: st.color, marginTop: 4 }}>{st.label}</div>
                <ul style={{ fontSize: 12, color: '#5d6b80', margin: '6px 0 0', paddingLeft: 16, lineHeight: 1.8 }}>
                  <li style={{ color: pw.length >= 8 ? '#15803d' : '#5d6b80' }}>Minst 8 tegn</li>
                  <li style={{ color: /[A-Z]/.test(pw) ? '#15803d' : '#5d6b80' }}>Minst én stor bokstav</li>
                  <li style={{ color: /[0-9]/.test(pw) ? '#15803d' : '#5d6b80' }}>Minst ett tall</li>
                  <li style={{ color: /[!@#$%^&*()\-_=+{};:,<.>?/|[\]\\~`"']/.test(pw) ? '#15803d' : '#5d6b80' }}>Minst ett spesialtegn (! @ # $ …)</li>
                </ul>
              </div>
            )}
          </div>
          <div className="login-field">
            <label>Bekreft passord</label>
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Gjenta passord"
              value={pw2}
              onChange={e => setPw2(e.target.value)}
              style={{ borderColor: mismatch ? '#ef4444' : undefined }}
            />
            {mismatch && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>Passordene er ikke like</div>}
          </div>
          {error && <div className="login-error">{error}</div>}
          <button
            type="submit"
            className="login-btn"
            disabled={loading || st.score < 4 || pw !== pw2 || !pw2}
          >
            {loading ? 'Lagrer…' : 'Sett passord'}
          </button>
        </form>
      </div>
    </div>
  );
}
