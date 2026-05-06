import { useState } from 'react';
import { AppProvider } from './context/AppContext';
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
  const TABS = isAdmin ? ADMIN_TABS : ANSATT_TABS;

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
              <span className={`nav-role-badge nav-role-${role}`}>{isAdmin ? 'Admin' : 'Ansatt'}</span>
            </div>
            <button className="nav-btn logout-btn" onClick={handleLogout} title="Logg ut">
              🚪 Logg ut
            </button>
          </nav>
        </header>

        <main className="main">
          {activeTab === 'dashboard' && isAdmin && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'befaring' && isAdmin && <BefaringPlan />}
          {activeTab === 'reklamasjon' && isAdmin && <Reklamasjon />}
          {activeTab === 'service' && isAdmin && <Service />}
          {activeTab === 'prosjekter' && isAdmin && <Prosjekter />}
          {activeTab === 'ansatte' && isAdmin && <Ansatte />}
          {activeTab === 'bemanningsplan' && <Bemanningsplan readOnly={!isAdmin} />}
          {activeTab === 'rorlegger' && isAdmin && <RorleggerPlan />}
          {activeTab === 'framdrift' && isAdmin && <Framdriftsplan />}
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
