import { useState, useEffect, useLayoutEffect, useRef, lazy, Suspense, useSyncExternalStore, Component } from 'react';
import { House, Search, ShieldAlert, Zap, Building2, HardHat, CalendarDays, Wrench, ChartGantt, ClipboardCheck, Truck, BookOpen, Users, RotateCw } from 'lucide-react';
import { Ikon } from './komponenter/Ikon';
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
        <h3 style={{ margin: '0 0 8px', color: '#991b1b' }}>Noe gikk galt på denne siden</h3>
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
          <button className="btn" onClick={() => this.setState({ feil: null })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={RotateCw} size={14} /> Prøv igjen</button>
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
  { id: 'dashboard', label: 'Oversikt', icon: House },
  { id: 'befaring', label: 'Befaring', icon: Search },
  { id: 'reklamasjon', label: 'Reklamasjon', icon: ShieldAlert },
  { id: 'service', label: 'Service', icon: Zap },
  { id: 'prosjekter', label: 'Prosjekter', icon: Building2 },
  { id: 'ansatte', label: 'Ansatte', icon: HardHat },
  { id: 'bemanningsplan', label: 'Bemanning', icon: CalendarDays },
  { id: 'rorlegger', label: 'Rørlegger', icon: Wrench },
  { id: 'framdrift', label: 'Framdrift', icon: ChartGantt },
  { id: 'ks', label: 'KS/HMS', icon: ClipboardCheck },
  { id: 'biler', label: 'Biler', icon: Truck },
  { id: 'rutiner', label: 'Rutiner', icon: BookOpen },
  { id: 'brukere', label: 'Brukere', icon: Users },
];

const KONTOR_TABS = [
  { id: 'dashboard', label: 'Oversikt', icon: House },
  { id: 'befaring', label: 'Befaring', icon: Search },
  { id: 'reklamasjon', label: 'Reklamasjon', icon: ShieldAlert },
  { id: 'service', label: 'Service', icon: Zap },
  { id: 'prosjekter', label: 'Prosjekter', icon: Building2 },
  { id: 'ansatte', label: 'Ansatte', icon: HardHat },
  { id: 'framdrift', label: 'Framdrift', icon: ChartGantt },
  { id: 'ks', label: 'KS/HMS', icon: ClipboardCheck },
  { id: 'biler', label: 'Biler', icon: Truck },
  { id: 'rutiner', label: 'Rutiner', icon: BookOpen },
];

const RORLEGGER_TABS = [
  { id: 'rorlegger', label: 'Rørlegger', icon: Wrench },
  { id: 'rutiner', label: 'Rutiner', icon: BookOpen },
];

const ANSATT_TABS = [
  { id: 'bemanningsplan', label: 'Bemanning', icon: CalendarDays },
  { id: 'framdrift', label: 'Framdrift', icon: ChartGantt },
  { id: 'ks', label: 'KS/HMS', icon: ClipboardCheck },
  { id: 'rutiner', label: 'Rutiner', icon: BookOpen },
];

const BEFARING_TABS = [
  { id: 'befaring', label: 'Befaring', icon: Search },
  { id: 'service', label: 'Service', icon: Zap },
  { id: 'reklamasjon', label: 'Reklamasjon', icon: ShieldAlert },
  { id: 'rutiner', label: 'Rutiner', icon: BookOpen },
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

  // Design v2: passiv status-tekst + fylt oransje «Lagre nå»-knapp
  // (eneste fylte element i baren). Ingen ikoner i topp-baren.
  const status = synk === 'feil'
    ? { tekst: 'Ikke lagret', klasse: 'lagre-status lagre-status--feil', tittel: 'Får ikke kontakt med skyen — endringene dine ligger trygt lokalt og sendes automatisk når nettet er tilbake.' }
    : synk === 'lagrer' || klikkLagrer
    ? { tekst: 'Lagrer…', klasse: 'lagre-status', tittel: 'Lagrer til skyen…' }
    : { tekst: 'Alt lagret', klasse: 'lagre-status', tittel: 'Alle endringer lagres automatisk til skyen.' };

  return (
    <>
      <span className={status.klasse} title={status.tittel}>{status.tekst}</span>
      <button className="lagre-naa-knapp" onClick={handleSave} disabled={klikkLagrer}
        title="Tving en lagring til skyen nå">
        Lagre nå
      </button>
    </>
  );
}

// ═══ Design v2: ren tekst-nav på ÉN linje, aldri to rader ═══
// Ved plassmangel flyttes de siste punktene til en «Mer ▾»-dropdown.
// EKTE måling (ikke breakpoint-gjetting): krymp til innholdet faktisk får
// plass i nav-containeren, voks igjen når det er romslig margin — ellers
// overlappet fanene brukernavnet på mellomstore skjermer.
function TekstNav({ TABS, activeTab, setActiveTab }) {
  const [antallSynlige, setAntallSynlige] = useState(TABS.length);
  const [, tving] = useState(0); // render-tick så måle-løkka kjører etter resize
  const [merApen, setMerApen] = useState(false);
  const merRef = useRef(null);
  const navRef = useRef(null);

  useEffect(() => { setAntallSynlige(TABS.length); }, [TABS]);

  // Krymp til innholdet faktisk får plass — synkront etter hver render.
  // (Konvergerer: når ingenting endres, slutter løkken av seg selv.)
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (nav.scrollWidth > nav.clientWidth + 1 && antallSynlige > 3) {
      setAntallSynlige(antallSynlige - 1);
    }
  });

  // Ved vindus-endring: start på nytt fra full liste og la løkken konvergere.
  useEffect(() => {
    const onResize = () => { setAntallSynlige(TABS.length); tving(t => t + 1); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [TABS.length]);

  useEffect(() => {
    if (!merApen) return;
    const lukk = e => { if (merRef.current && !merRef.current.contains(e.target)) setMerApen(false); };
    document.addEventListener('mousedown', lukk);
    return () => document.removeEventListener('mousedown', lukk);
  }, [merApen]);

  const synlige = TABS.slice(0, antallSynlige);
  const skjulte = TABS.slice(antallSynlige);
  const aktivISkjult = skjulte.some(t => t.id === activeTab);

  return (
    <nav className="nav" ref={navRef}>
      {synlige.map(tab => (
        <button
          key={tab.id}
          className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      {skjulte.length > 0 && (
        <div className="nav-mer" ref={merRef}>
          <button
            className={`nav-btn ${aktivISkjult ? 'active' : ''}`}
            onClick={() => setMerApen(a => !a)}
          >
            Mer ▾
          </button>
          {merApen && (
            <div className="nav-mer-liste">
              {skjulte.map(tab => (
                <button
                  key={tab.id}
                  className={`nav-mer-valg${activeTab === tab.id ? ' aktiv' : ''}`}
                  onClick={() => { setActiveTab(tab.id); setMerApen(false); }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

function hjemmefaneFor(rolle) {
  if (rolle === 'ansatt') return 'bemanningsplan';
  if (rolle === 'rorlegger') return 'rorlegger';
  if (rolle === 'befaring') return 'befaring';
  return 'dashboard';
}

function App() {
  const resetToken = getResetToken();
  const [showReset] = useState(!!resetToken);
  // Hjemmefane per rolle — også ved reload (PL-rollen har ikke Oversikt og
  // landet tidligere på en tom side til de trykket i menyen).
  const [activeTab, setActiveTab] = useState(() => hjemmefaneFor(localStorage.getItem('fbs_role')));
  // Dyplenke: «Åpne kort» i Ring i dag-listen → Befaring-siden åpner kortet
  const [apneBefaringId, setApneBefaringId] = useState(null);
  function navigerTil(tab, befaringId) {
    if (befaringId) setApneBefaringId(befaringId);
    setActiveTab(tab);
  }
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem('fbs_token'));
  const [role, setRole] = useState(() => localStorage.getItem('fbs_role') || 'admin');
  const [userNavn, setUserNavn] = useState(() => localStorage.getItem('fbs_user_navn') || '');
  const [ansattId, setAnsattId] = useState(() => localStorage.getItem('fbs_ansatt_id') || '');
  const [resetDone, setResetDone] = useState(false);
  useAutoOppdatering(loggedIn);

  // Dyplenke fra morgenbrief-eposten: ?kort=<befaringId> åpner kortet direkte
  // (kun roller som har Befaring-siden; parameteren fjernes fra URL-en etterpå).
  useEffect(() => {
    if (!localStorage.getItem('fbs_token')) return;
    const kort = new URLSearchParams(window.location.search).get('kort');
    if (!kort) return;
    const r = localStorage.getItem('fbs_role');
    if (['admin', 'kontor', 'befaring'].includes(r)) {
      setApneBefaringId(kort);
      setActiveTab('befaring');
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setActiveTab(hjemmefaneFor(r));
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
            <div className="brand-logo" title={`FolloByggService — Bemannings- og framdriftsplanlegger · v${FBS_VERSJON} (skal være lik på alle enheter)`}>FBS</div>
          </div>
          <TekstNav TABS={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
          <div className="nav-hoyre">
            <div className="nav-user">
              {userNavn && <span className="nav-user-name">{userNavn}</span>}
              <span className={`nav-role-badge nav-role-${role}`}>
                {isAdmin ? 'Admin' : isKontor ? 'Kontor' : isRorlegger ? 'Rørlegger' : isBefaring ? 'Befaring' : 'Ansatt'}
              </span>
            </div>
            {(isAdmin || isKontor || isBefaring) && <SaveButton />}
            <button className="nav-btn logout-btn" onClick={handleLogout} title="Logg ut">
              Logg ut
            </button>
          </div>
        </header>

        <main className="main">
          <FeilVern key={activeTab}>
          <Suspense fallback={<SideLaster />}>
          {activeTab === 'dashboard' && (isAdmin || isKontor) && <Dashboard onNavigate={navigerTil} />}
          {activeTab === 'befaring' && (isAdmin || isKontor || isBefaring) && <BefaringPlan apneBefaringId={apneBefaringId} onApnet={() => setApneBefaringId(null)} />}
          {activeTab === 'reklamasjon' && (isAdmin || isKontor || isBefaring) && <Reklamasjon />}
          {activeTab === 'service' && (isAdmin || isKontor || isBefaring) && <Service />}
          {activeTab === 'prosjekter' && (isAdmin || isKontor) && <Prosjekter onNavigate={setActiveTab} />}
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
                <span className="mobile-nav-icon"><Ikon ikon={tab.icon} size={20} /></span>
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
