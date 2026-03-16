import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import Prosjekter from './pages/Prosjekter';
import Ansatte from './pages/Ansatte';
import Bemanningsplan from './pages/Bemanningsplan';
import Framdriftsplan from './pages/Framdriftsplan';
import './App.css';

const TABS = [
  { id: 'prosjekter', label: 'Prosjekter', icon: '🏗' },
  { id: 'ansatte', label: 'Ansatte', icon: '👷' },
  { id: 'bemanningsplan', label: 'Bemanningsplan', icon: '📅' },
  { id: 'framdrift', label: 'Framdrift', icon: '📊' },
];

function App() {
  const [activeTab, setActiveTab] = useState('prosjekter');

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
          </nav>
        </header>

        <main className="main">
          {activeTab === 'prosjekter' && <Prosjekter />}
          {activeTab === 'ansatte' && <Ansatte />}
          {activeTab === 'bemanningsplan' && <Bemanningsplan />}
          {activeTab === 'framdrift' && <Framdriftsplan />}
        </main>
      </div>
    </AppProvider>
  );
}

export default App;
