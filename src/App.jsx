import { useState, useEffect, lazy, Suspense, useSyncExternalStore, Component } from 'react';
import { AppProvider, harUlagredeEndringer } from './context/AppContext';
import { useApp } from './context/AppContext';
import { saveToCloud, forceTimestampAlleFields, abonnerSynk, hentSynkStatus } from './store';
import LoginPage from './pages/LoginPage';
import './App.css';

// Sidene lastes ved behov (code-splitting): en ansatt laster ikke hele
// admin-flaten, og førstelastingen på iPad/mobil blir vesentlig raskere.
const Prosjekter = lazy(() => import('./pages/Prosjekter'));
const Ansatte = lazy(() => import('./pages/Ansatte'));
const Bemanningsplan = lazy(() => import('./pages/Bemanningsplan'));
const Framdriftsplan = lazy(() => import('./pages/Framdriftsplan'));
const RorleggerPlan = lazy(() => import('./pages/RorleggerPlan'));
const BefaringPlan = lazy(() => import('./pages/BefaringPlan'));
const Reklamasjon = lazy(() => import('./pages/Reklamasjon'));
const Service = lazy(() => import('./pages/Service'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const KS = lazy(() => import('./pages/KS'));
const Biler = lazy(() => import('./pages/Biler'));
const Rutiner = lazy(() => import('./pages/Rutiner'));

function SideLaster() {
  return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>Laster…</div>;
}

// Feilvern: en krasj på ÉN side skal aldri gi hvit side for hele appen.
// Viser feilmeldingen tydelig (så den kan rapporteres/skjermdumpes) og lar
// brukeren bytte fane eller laste på nytt. Nullstilles ved fanebytte (key).
class FeilVern extends Component {
  constructor(props) {
    super(props);
    this.state = { feil: null };
  }
  static getDerivedStateFromError(feil) {
    return { feil };
  }
  componentDidCatch(feil, info) {
    console.error('[FBS] Side-krasj:', feil, info?.componentStack);
  }
  render() {
    if (!this.state.feil) return this.props.children;
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: '24px 28px', background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 12 }}>
        <h3 style={{ margin: '0 0 8px', color: '#991b1b' }}>⚠️ Noe gikk galt på denne siden</h3>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#7f1d1d' }}>
          Resten av appen virker — bytt fane, eller last siden på nytt.
          Send gjerne et skjermbilde av denne boksen til Stefan/support.
        </p>
        <pre style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#b91c1c', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: 180 }}>
          {String(this.state.feil?.message || this.state.feil)}
          {'\n'}
          {String(this.state.feil?.stack || '').split('\n').slice(1, 4).join('\n')}
        </pre>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={() => this.setState({ feil: null })}>↻ Prøv igjen</button>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Last appen på nytt</button>
        </div>
      </div>
    );
  }
}

// Byggtidspunkt satt av vite.config.js — vises som versjon så man enkelt kan
// se om to enheter kjører samme versjon av appen.
// eslint-disable-next-line no-undef
const FBS_VERSJON = typeof __FBS_VERSJON__ !== 'undefined' ? __FBS_VERSJON__ : 'dev';

// ── Auto-oppdatering ──
// Åpne faner kjører gammel kode etter en deploy — og gammel synk-logikk mot ny
// server kan gi at endringer ikke synes hos andre. Sjekk hvert 5. minutt (og
// når fanen får fokus) om det ligger en ny versjon ute; last på nytt når
// brukeren ikke har ulagrede endringer. Data er trygt i localStorage + sky.
function gjeldendeBundle() {
  const script = document.querySelector('script[src*="/assets/index-"]');
  return script ? script.getAttribute('src') : null;
}
async function nyVersjonUte() {
  try {
    const res = await fetch(`/?vsjekk=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const html = await res.text();
    const m = html.match(/\/assets\/index-[\w-]+\.js/);
    const naa = gjeldendeBundle();
    return !!(m && naa && !naa.endsWith(m[0]) && m[0] !== naa);
  } catch {
    return false;
  }
}
function useAutoOppdatering(aktiv) {
  useEffect(() => {
    if (!aktiv) return;
    let stoppet = false;
    async function sjekk() {
      if (stoppet || document.visibilityState !== 'visible') return;
      if (await nyVersjonUte()) {
        if (!harUlagredeEndringer()) {
          console.log('[FBS] Ny versjon tilgjengelig — laster på nytt');
          window.location.reload();
        }
        // Har brukeren ulagrede endringer, prøver vi igjen ved neste sjekk —
        // autolagringen (1 s) har som regel rukket å tømme dem innen da.
      }
    }
    const interval = setInterval(sjekk, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') sjekk(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stoppet = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [aktiv]);
}

const ADMIN_TABS = [
  { id: 'dashboard', label: 'Oversikt', icon: '🏠' },
  { id: 'befaring', label: 'Befaring', icon: '🔍' },
  { id: 'reklamasjon', label: 'Reklamasjon', icon: '⚠️' },
  { id: 'service', label: 'Service', icon: '⚡' },
  { id: 'prosjekter', label: 'Prosjekter', icon: '🏗' },
  { id: 'ansatte', label: 'Ansatte', icon: '👷' },
  { id: 'bemanningsplan', label: 'Bemanningsplan', icon: '📅' },
  { id: 'rorlegger', label: 'Rørlegger', icon: '🔧' },
  { id: 'framdrift', label: 'Framdrift', icon: '📊' },
  { id: 'ks', label: 'KS / HMS', icon: '✅' },
  { id: 'biler', label: 'Biler', icon: '🚐' },
  { id: 'rutiner', label: 'Rutiner', icon: '📘' },
  { id: 'brukere', label: 'Brukere', icon: '👥' },
];

const KONTOR_TABS = [
  { id: 'dashboard', label: 'Oversikt', icon: '🏠' },
  { id: 'befaring', label: 'Befaring', icon: '🔍' },
  { id: 'reklamasjon', label: 'Reklamasjon', icon: '⚠️' },
  { id: 'service', label: 'Service', icon: '⚡' },
  { id: 'prosjekter', label: 'Prosjekter', icon: '🏗' },
  { id: 'ansatte', label: 'Ansatte', icon: '👷' },
  { id: 'framdrift', label: 'Framdrift', icon: '📊' },
  { id: 'ks', label: 'KS / HMS', icon: '✅' },
  { id: 'biler', label: 'Biler', icon: '🚐' },
  { id: 'rutiner', label: 'Rutiner', icon: '📘' },
];

const RORLEGGER_TABS = [
  { id: 'rorlegger', label: 'Rørlegger', icon: '🔧' },
  { id: 'rutiner', label: 'Rutiner', icon: '📘' },
];

const ANSATT_TABS = [
  { id: 'bemanningsplan', label: 'Bemanningsplan', icon: '📅' },
  { id: 'framdrift', label: 'Framdrift', icon: '📊' },
  { id: 'ks', label: 'KS / HMS', icon: '✅' },
  { id: 'rutiner', label: 'Rutiner', icon: '📘' },
];

const BEFARING_TABS = [
  { id: 'befaring', label: 'Befaring', icon: '🔍' },
  { id: 'service', label: 'Service', icon: '⚡' },
  { id: 'reklamasjon', label: 'Reklamasjon', icon: '⚠️' },
  { id: 'rutiner', label: 'Rutiner', icon: '📘' },
];

function getResetToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('reset') || null;
}

function clearResetToken() {
  const url = new URL(window.location.href);
  url.searchParams.delete('reset');
  window.history.replaceState({}, '', url.pathname + (url.search !== '?' ? url.search : ''));
}

// Synk-indikator: viser passivt at alt autolagres. Grønn hake = trygt,
// gul = lagrer, rød = får ikke kontakt med skyen (endringene ligger lokalt
// og sendes automatisk når nettet er tilbake). Klikk tvinger en lagring nå.
function SaveButton() {
  const { state } = useApp();
  const synk = useSyncExternalStore(abonnerSynk, hentSynkStatus);
  const [klikkLagrer, setKlikkLagrer] = useState(false);

  async function handleSave() {
    if (klikkLagrer) return;
    // Bump alle lokale timestamps til nå slik at brukerens state alltid
    // vinner over cloud-skrivinger fra event.js ved mergeWithCloud-konflikt
    forceTimestampAlleFields();
    setKlikkLagrer(true);
    await saveToCloud(state);
    setKlikkLagrer(false);
  }

  const visning = synk === 'feil'
    ? { label: '⚠️ Ikke lagret', bg: '#dc2626', tittel: 'Får ikke kontakt med skyen — endringene dine ligger trygt lokalt og sendes automatisk når nettet er tilbake. Klikk for å prøve nå.' }
    : synk === 'lagrer' || klikkLagrer
    ? { label: '⏳ Lagrer…', bg: '#f59e0b', tittel: 'Lagrer til skyen…' }
    : { label: '✓ Alt lagret', bg: '#16a34a', tittel: 'Alle endringer lagres automatisk til skyen. Klikk for å tvinge en lagring nå.' };

  return (
    <button
      className="nav-btn"
      style={{
        background: visning.bg,
        color: '#fff',
        borderColor: 'transparent',
        fontWeight: 600,
        transition: 'background .3s',
      }}
      onClick={handleSave}
      title={visning.tittel}
    >
      {visning.label}
    </button>
  );
}

function App() {
  const resetToken = getResetToken();
  const [showReset] = useState(!!resetToken);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem('fbs_token'));
  const [role, setRole] = useState(() => localStorage.getItem('fbs_role') || 'admin');
  const [userNavn, setUserNavn] = useState(() => localStorage.getItem('fbs_user_navn') || '');
  const [ansattId, setAnsattId] = useState(() => localStorage.getItem('fbs_ansatt_id') || '');
  const [resetDone, setResetDone] = useState(false);
  useAutoOppdatering(loggedIn);

  // Hent fersk rolle fra server ved oppstart — fanger opp rolle-endringer
  // gjort av admin uten at brukeren må logge ut og inn igjen.
  useEffect(() => {
    const token = localStorage.getItem('fbs_token');
    if (!token) return;
    fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.role && data.role !== localStorage.getItem('fbs_role')) {
          localStorage.setItem('fbs_role', data.role);
          setRole(data.role);
        }
        if (data.navn) {
          localStorage.setItem('fbs_user_navn', data.navn);
          setUserNavn(data.navn);
        }
        if (data.ansattId !== undefined) {
          localStorage.setItem('fbs_ansatt_id', data.ansattId || '');
          setAnsattId(data.ansattId || '');
        }
      })
      .catch(() => { /* ignorer — bruker cachet rolle */ });
  }, []);

  async function handleLogout() {
    const token = localStorage.getItem('fbs_token');
    localStorage.removeItem('fbs_token');
    localStorage.removeItem('fbs_role');
    localStorage.removeItem('fbs_user_navn');
    localStorage.removeItem('fbs_ansatt_id');
    localStorage.removeItem('fbs_auth');
    setLoggedIn(false);
    setRole('admin');
    setUserNavn('');
    if (token) {
      try {
        await fetch('/api/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch { /* ignorer */ }
    }
  }

  function handleLogin(r, namn) {
    setRole(r || 'admin');
    setUserNavn(namn || '');
    setLoggedIn(true);
    if (r === 'ansatt') setActiveTab('bemanningsplan');
    else if (r === 'rorlegger') setActiveTab('rorlegger');
    else if (r === 'befaring') setActiveTab('befaring');
    else setActiveTab('dashboard');
  }

  if (showReset && !resetDone) {
    return (
      <Suspense fallback={<SideLaster />}>
        <ResetPassword
          token={resetToken}
          onDone={() => {
            clearResetToken();
            setResetDone(true);
          }}
        />
      </Suspense>
    );
  }

  if (!loggedIn) return <LoginPage onLogin={handleLogin} />;

  const isAdmin = role === 'admin';
  const isKontor = role === 'kontor';
  const isRorlegger = role === 'rorlegger';
  const isBefaring = role === 'befaring';
  const TABS = isAdmin ? ADMIN_TABS
             : isKontor ? KONTOR_TABS
             : isRorlegger ? RORLEGGER_TABS
             : isBefaring ? BEFARING_TABS
             : ANSATT_TABS;

  return (
    <AppProvider>
      <div className="app">
        <header className="app-header">
          <div className="header-brand">
            <div className="brand-logo">FBS</div>
            <div>
              <div className="brand-name">FolloByggService</div>
              <div className="brand-sub">
                Bemannings- og framdriftsplanlegger
                <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 10 }} title="Versjon (byggtidspunkt) — skal være lik på alle enheter">
                  v{FBS_VERSJON}
                </span>
              </div>
            </div>
          </div>
          <nav className="nav">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="nav-icon">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
            <div className="nav-user">
              {userNavn && <span className="nav-user-name">{userNavn}</span>}
              <span className={`nav-role-badge nav-role-${role}`}>
                {isAdmin ? 'Admin' : isKontor ? 'Kontor' : isRorlegger ? 'Rørlegger' : isBefaring ? 'Befaring' : 'Ansatt'}
              </span>
            </div>
            {(isAdmin || isKontor || isBefaring) && <SaveButton />}
            <button className="nav-btn logout-btn" onClick={handleLogout} title="Logg ut">
              🚪 Logg ut
            </button>
          </nav>
        </header>

        <main className="main">
          <FeilVern key={activeTab}>
          <Suspense fallback={<SideLaster />}>
          {activeTab === 'dashboard' && (isAdmin || isKontor) && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'befaring' && (isAdmin || isKontor || isBefaring) && <BefaringPlan />}
          {activeTab === 'reklamasjon' && (isAdmin || isKontor || isBefaring) && <Reklamasjon />}
          {activeTab === 'service' && (isAdmin || isKontor || isBefaring) && <Service />}
          {activeTab === 'prosjekter' && (isAdmin || isKontor) && <Prosjekter />}
          {activeTab === 'ansatte' && (isAdmin || isKontor) && <Ansatte />}
          {activeTab === 'bemanningsplan' && (isAdmin || role === 'ansatt') && <Bemanningsplan readOnly={!isAdmin} />}
          {activeTab === 'rorlegger' && (isAdmin || isKontor || isRorlegger) && <RorleggerPlan />}
          {activeTab === 'framdrift' && (isAdmin || isKontor || role === 'ansatt') && <Framdriftsplan readOnly={role === 'ansatt'} ansattId={role === 'ansatt' ? ansattId : null} />}
          {activeTab === 'ks' && (isAdmin || isKontor || role === 'ansatt') && <KS readOnly={role === 'ansatt'} ansattId={role === 'ansatt' ? ansattId : null} />}
          {activeTab === 'biler' && (isAdmin || isKontor) && <Biler />}
          {activeTab === 'rutiner' && <Rutiner />}
          {activeTab === 'brukere' && isAdmin && <AdminUsers />}
          </Suspense>
          </FeilVern>
        </main>

        <nav className="mobile-nav">
          <div className="mobile-nav-inner">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`mobile-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="mobile-nav-icon">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </AppProvider>
  );
}

export default App;
