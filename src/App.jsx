import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/AppContext';
import { saveToCloud } from './store';
import Prosjekter from './pages/Prosjekter';
import Ansatte from './pages/Ansatte';
import Bemanningsplan from './pages/Bemanningsplan';
import Framdriftsplan from './pages/Framdriftsplan';
import RorleggerPlan from './pages/RorleggerPlan';
import BefaringPlan from './pages/BefaringPlan';
import Reklamasjon from './pages/Reklamasjon';
import Service from './pages/Service';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import ResetPassword from './pages/ResetPassword';
import AdminUsers from './pages/AdminUsers';
import './App.css';

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
];

const RORLEGGER_TABS = [
  { id: 'rorlegger', label: 'Rørlegger', icon: '🔧' },
];

const ANSATT_TABS = [
  { id: 'bemanningsplan', label: 'Bemanningsplan', icon: '📅' },
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

function SaveButton() {
  const { state } = useApp();
  const [status, setStatus] = useState('idle'); // 'idle' | 'saving' | 'ok' | 'error'

  async function handleSave() {
    if (status === 'saving') return;
    setStatus('saving');
    const result = await saveToCloud(state);
    setStatus(result === 'error' ? 'error' : 'ok');
    setTimeout(() => setStatus('idle'), 2500);
  }

  const label = status === 'saving' ? '⏳ Lagrer...'
              : status === 'ok'     ? '✅ Lagret!'
              : status === 'error'  ? '❌ Feil'
              :                       '💾 Lagre nå';

  return (
    <button
      className="nav-btn"
      style={{
        background: status === 'ok' ? '#16a34a' : status === 'error' ? '#dc2626' : '#2563eb',
        color: '#fff',
        borderColor: 'transparent',
        fontWeight: 600,
        transition: 'background .3s',
        opacity: status === 'saving' ? 0.7 : 1,
      }}
      onClick={handleSave}
      disabled={status === 'saving'}
      title="Lagre og sikkerhetskopier alle data til skyen nå"
    >
      {label}
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
  const [resetDone, setResetDone] = useState(false);

  async function handleLogout() {
    const token = localStorage.getItem('fbs_token');
    localStorage.removeItem('fbs_token');
    localStorage.removeItem('fbs_role');
    localStorage.removeItem('fbs_user_navn');
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
    else setActiveTab('dashboard');
  }

  if (showReset && !resetDone) {
    return (
      <ResetPassword
        token={resetToken}
        onDone={() => {
          clearResetToken();
          setResetDone(true);
        }}
      />
    );
  }

  if (!loggedIn) return <LoginPage onLogin={handleLogin} />;

  const isAdmin = role === 'admin';
  const isKontor = role === 'kontor';
  const isRorlegger = role === 'rorlegger';
  const TABS = isAdmin ? ADMIN_TABS
             : isKontor ? KONTOR_TABS
             : isRorlegger ? RORLEGGER_TABS
             : ANSATT_TABS;

  return (
    <AppProvider>
      <div className="app">
        <header className="app-header">
          <div className="header-brand">
            <div className="brand-logo">FBS</div>
            <div>
              <div className="brand-name">FolloByggService</div>
              <div className="brand-sub">Bemannings- og framdriftsplanlegger</div>
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
                {isAdmin ? 'Admin' : isKontor ? 'Kontor' : isRorlegger ? 'Rørlegger' : 'Ansatt'}
              </span>
            </div>
            {(isAdmin || isKontor) && <SaveButton />}
            <button className="nav-btn logout-btn" onClick={handleLogout} title="Logg ut">
              🚪 Logg ut
            </button>
          </nav>
        </header>

        <main className="main">
          {activeTab === 'dashboard' && (isAdmin || isKontor) && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'befaring' && (isAdmin || isKontor) && <BefaringPlan />}
          {activeTab === 'reklamasjon' && (isAdmin || isKontor) && <Reklamasjon />}
          {activeTab === 'service' && (isAdmin || isKontor) && <Service />}
          {activeTab === 'prosjekter' && (isAdmin || isKontor) && <Prosjekter />}
          {activeTab === 'ansatte' && (isAdmin || isKontor) && <Ansatte />}
          {activeTab === 'bemanningsplan' && (isAdmin || role === 'ansatt') && <Bemanningsplan readOnly={!isAdmin} />}
          {activeTab === 'rorlegger' && (isAdmin || isKontor || isRorlegger) && <RorleggerPlan />}
          {activeTab === 'framdrift' && (isAdmin || isKontor) && <Framdriftsplan />}
          {activeTab === 'brukere' && isAdmin && <AdminUsers />}
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
