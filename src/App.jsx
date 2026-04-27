import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import Prosjekter from './pages/Prosjekter';
import Ansatte from './pages/Ansatte';
import Bemanningsplan from './pages/Bemanningsplan';
import Framdriftsplan from './pages/Framdriftsplan';
import RorleggerPlan from './pages/RorleggerPlan';
import BefaringPlan from './pages/BefaringPlan';
import Reklamasjon from './pages/Reklamasjon';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import './App.css';

const TABS = [
  { id: 'dashboard', label: 'Oversikt', icon: '🏠' },
  { id: 'befaring', label: 'Befaring', icon: '🔍' },
  { id: 'reklamasjon', label: 'Reklamasjon', icon: '⚠️' },
  { id: 'prosjekter', label: 'Prosjekter', icon: '🏗' },
  { id: 'ansatte', label: 'Ansatte', icon: '👷' },
  { id: 'bemanningsplan', label: 'Bemanningsplan', icon: '📅' },
  { id: 'rorlegger', label: 'Rørlegger', icon: '🔧' },
  { id: 'framdrift', label: 'Framdrift', icon: '📊' },
];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loggedIn, setLoggedIn] = useState(() => localStorage.getItem('fbs_auth') === 'ok');

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;

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
            <button className="nav-btn logout-btn" onClick={() => { localStorage.removeItem('fbs_auth'); setLoggedIn(false); }} title="Logg ut">
              🚪 Logg ut
            </button>
          </nav>
        </header>

        <main className="main">
          {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'befaring' && <BefaringPlan />}
          {activeTab === 'reklamasjon' && <Reklamasjon />}
          {activeTab === 'prosjekter' && <Prosjekter />}
          {activeTab === 'ansatte' && <Ansatte />}
          {activeTab === 'bemanningsplan' && <Bemanningsplan />}
          {activeTab === 'rorlegger' && <RorleggerPlan />}
          {activeTab === 'framdrift' && <Framdriftsplan />}
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
