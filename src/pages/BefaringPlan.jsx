import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { dateToIso, addDays, weekStart, overlaps, PROSJEKT_PALETTE, uid } from '../store';

const JOBB_TYPER = ['Ny bygg', 'Tilbygg', 'Tak jobb', 'Fasade jobb', 'Bad', 'Tømrer', 'Maling', 'Rørlegger', 'Flislegging', 'Elektro', 'Rehabilitering', 'Annet'];

const STATUS = {
  planlagt:      { label: 'Planlagt befaring',   farge: '#3b82f6', bg: '#eff6ff', ikon: '📋' },
  tilbud_arbeid: { label: 'Tilbud under arbeid', farge: '#f59e0b', bg: '#fffbeb', ikon: '✏️' },
  tilbud_sendt:  { label: 'Tilbud sendt',        farge: '#8b5cf6', bg: '#f5f3ff', ikon: '📤' },
  godkjent:      { label: 'Godkjent',            farge: '#16a34a', bg: '#f0fdf4', ikon: '✅' },
  tapt:          { label: 'Tapt',                farge: '#6b7280', bg: '#f9fafb', ikon: '❌' },
};

const PL_FARGER = ['#2563eb','#16a34a','#9333ea','#ea580c','#0891b2','#be185d','#854d0e','#0f766e','#b45309','#1d4ed8'];
const MAANED_NAVN = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];
const DAG_NAVN_KORT = ['Man','Tir','Ons','Tor','Fre','Lør','Søn'];

function monthStart(iso) { return iso.slice(0, 7) + '-01'; }
function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return dateToIso(d).slice(0, 7) + '-01';
}
function daysInMonth(iso) {
  const d = new Date(iso + 'T00:00:00');
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function monthLabel(iso) {
  const m = parseInt(iso.slice(5, 7), 10) - 1;
  return MAANED_NAVN[m] + ' ' + iso.slice(0, 4);
}
function dayOfWeek(iso) {
  return (new Date(iso + 'T00:00:00').getDay() + 6) % 7;
}
function datoKort(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' });
}
function dagerTil(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso + 'T00:00:00') - new Date()) / 86400000);
}

function tomModal() {
  return {
    kontaktNavn: '',
    telefon: '',
    epost: '',
    adresse: '',
    jobbType: 'Ny bygg',
    dato: dateToIso(new Date()),
    tid: '09:00',
    status: 'planlagt',
    notat: '',
    kommentar: '',
    prosjektlederId: '',
    estimertBelop: '',
    tilbudFrist: '',
    nesteKontakt: '',
    oensketOppstart: '',
    resultat: '',
    tapArsak: '',
  };
}

export default function BefaringPlan() {
  const { state, dispatch } = useApp();
  const befaringer = state.befaringer || [];
  const today = dateToIso(new Date());

  const [visModal, setVisModal] = useState(false);
  const [redigerer, setRedigerer] = useState(null);
  const [form, setForm] = useState(tomModal());
  const [visKapasitet, setVisKapasitet] = useState(null);
  const [visProsjektModal, setVisProsjektModal] = useState(false);
  const [prosjektForm, setProsjektForm] = useState({ navn: '', startDato: '', sluttDato: '', farge: '#6b8fc4', lagTildeling: true });
  const [kalMaaned, setKalMaaned] = useState(() => monthStart(today));
  const [viewTab, setViewTab] = useState('oversikt'); // 'oversikt' | 'kalender'
  const [sok, setSok] = useState('');
  const [visAvsluttede, setVisAvsluttede] = useState(false);
  const [pipelineFilter, setPipelineFilter] = useState(null);

  function ansattFarge(ansattId) {
    if (!ansattId) return null;
    const idx = state.ansatte.findIndex(a => a.id === ansattId);
    return PL_FARGER[idx >= 0 ? idx % PL_FARGER.length : 0];
  }

  // ---- Kapasitet ----
  function kapasitetPerUke() {
    const totalAnsatte = state.ansatte.length;
    return Array.from({ length: 16 }, (_, w) => {
      const ukeStart = addDays(weekStart(today), w * 7);
      const ukeSlut = addDays(ukeStart, 4);
      const opptatt = new Set(
        state.tildelinger
          .filter(t => t.prosjektId !== '__FERIE__' && overlaps(t.startDato, t.sluttDato, ukeStart, ukeSlut))
          .map(t => t.ansattId)
      );
      return { ukeStart, ukeSlut, ledige: totalAnsatte - opptatt.size, totalt: totalAnsatte };
    });
  }

  // ---- Kalender ----
  function kalenderDager() {
    const firstDay = dayOfWeek(kalMaaned);
    const antDager = daysInMonth(kalMaaned);
    const dager = [];
    for (let i = 0; i < firstDay; i++) dager.push(null);
    for (let d = 1; d <= antDager; d++) {
      dager.push(kalMaaned.slice(0, 7) + '-' + String(d).padStart(2, '0'));
    }
    while (dager.length % 7 !== 0) dager.push(null);
    return dager;
  }

  // ---- CRUD ----
  function apneNy(presetStatus, presetDato) {
    setForm({ ...tomModal(), ...(presetStatus ? { status: presetStatus } : {}), dato: presetDato || today });
    setRedigerer(null);
    setVisModal(true);
  }
  function apneRediger(b) {
    setForm({ ...tomModal(), ...b });
    setRedigerer(b);
    setVisModal(true);
  }
  function lagre() {
    if (!form.kontaktNavn.trim() || !form.adresse.trim()) return;
    if (redigerer) {
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...form, id: redigerer.id } });
    } else {
      dispatch({ type: 'ADD_BEFARING', payload: form });
    }
    setVisModal(false);
  }
  function slett() {
    if (redigerer && window.confirm('Slett denne befaringen?')) {
      dispatch({ type: 'DELETE_BEFARING', id: redigerer.id });
      setVisModal(false);
    }
  }
  function godkjenn(b) {
    dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, status: 'godkjent' } });
    setVisModal(false);
    setVisKapasitet(b);
    const nextFarge = PROSJEKT_PALETTE[state.prosjekter.length % PROSJEKT_PALETTE.length];
    setProsjektForm({
      navn: b.kontaktNavn + (b.adresse ? ' – ' + b.adresse : ''),
      startDato: b.oensketOppstart || today,
      sluttDato: '',
      farge: nextFarge,
      lagTildeling: !!b.prosjektlederId,
    });
  }
  function opprettProsjekt() {
    if (!prosjektForm.navn.trim()) return;
    const prosjektId = uid();
    dispatch({
      type: 'ADD_PROSJEKT',
      payload: {
        id: prosjektId,
        navn: prosjektForm.navn,
        adresse: visKapasitet?.adresse || '',
        jobbType: visKapasitet?.jobbType || '',
        belop: visKapasitet?.estimertBelop || '',
        prosjektlederId: visKapasitet?.prosjektlederId || '',
        startDato: prosjektForm.startDato,
        sluttDato: prosjektForm.sluttDato,
        status: 'aktiv',
        beskrivelse: [visKapasitet?.notat, visKapasitet?.kommentar].filter(Boolean).join('\n\n') || '',
        farge: prosjektForm.farge,
        befaringId: visKapasitet?.id || '',
      },
    });
    if (prosjektForm.lagTildeling && visKapasitet?.prosjektlederId && prosjektForm.startDato) {
      dispatch({
        type: 'ADD_TILDELING',
        payload: {
          ansattId: visKapasitet.prosjektlederId,
          prosjektId,
          startDato: prosjektForm.startDato,
          sluttDato: prosjektForm.sluttDato || addDays(prosjektForm.startDato, 13),
        },
      });
    }
    // Merk befaringen som konvertert til prosjekt
    if (visKapasitet) {
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...visKapasitet, prosjektId } });
    }
    setVisKapasitet(null);
    setVisProsjektModal(false);
  }

  // Åpne prosjekt-modal direkte fra et godkjent kort (uten kapasitet-mellomsteg)
  function apneProsjektModal(b) {
    const nextFarge = PROSJEKT_PALETTE[state.prosjekter.length % PROSJEKT_PALETTE.length];
    setVisKapasitet(b);
    setProsjektForm({
      navn: b.kontaktNavn + (b.adresse ? ' – ' + b.adresse : ''),
      startDato: b.oensketOppstart || today,
      sluttDato: '',
      farge: nextFarge,
      lagTildeling: !!b.prosjektlederId,
    });
    setVisProsjektModal(true);
  }

  const teller = Object.fromEntries(Object.keys(STATUS).map(s => [s, befaringer.filter(b => b.status === s).length]));

  function sokFilter(b) {
    if (!sok.trim()) return true;
    const q = sok.toLowerCase();
    return (
      b.kontaktNavn?.toLowerCase().includes(q) ||
      b.adresse?.toLowerCase().includes(q) ||
      b.telefon?.toLowerCase().includes(q) ||
      b.epost?.toLowerCase().includes(q) ||
      b.jobbType?.toLowerCase().includes(q)
    );
  }

  function statusFilter(b) {
    if (!pipelineFilter) return true;
    return b.status === pipelineFilter;
  }

  function sumKr(arr) {
    const total = arr.reduce((s, b) => s + (Number(b.estimertBelop) || 0), 0);
    return total > 0
      ? new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(total) + ' kr'
      : null;
  }

  const planlagte = [...befaringer]
    .filter(b => b.status === 'planlagt')
    .filter(sokFilter)
    .filter(statusFilter)
    .sort((a, b) => a.dato.localeCompare(b.dato));

  const tilbudArbeid = [...befaringer]
    .filter(b => b.status === 'tilbud_arbeid' || b.status === 'tilbud_sendt')
    .filter(sokFilter)
    .filter(statusFilter)
    .sort((a, b) => (a.tilbudFrist || '9999').localeCompare(b.tilbudFrist || '9999'));

  const avsluttede = [...befaringer]
    .filter(b => b.status === 'godkjent' || b.status === 'tapt')
    .filter(sokFilter)
    .filter(statusFilter)
    .sort((a, b) => b.dato.localeCompare(a.dato));

  const uker = kapasitetPerUke();

  // ---- Kort-komponent ----
  function BefKort({ b }) {
    const s = STATUS[b.status] || STATUS.planlagt;
    const ansatt = b.prosjektlederId ? state.ansatte.find(a => a.id === b.prosjektlederId) : null;
    const belopVis = b.estimertBelop
      ? new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(b.estimertBelop))
      : null;
    const fristDager = dagerTil(b.tilbudFrist);
    const fristFarge = fristDager !== null ? (fristDager < 0 ? '#dc2626' : fristDager <= 3 ? '#f59e0b' : '#16a34a') : null;
    const kontaktDager = dagerTil(b.nesteKontakt);
    const kontaktFarge = kontaktDager !== null ? (kontaktDager < 0 ? '#dc2626' : kontaktDager <= 2 ? '#f59e0b' : '#64748b') : '#64748b';

    return (
      <div className="bef-k-kort" onClick={() => apneRediger(b)}>
        <div className="bef-k-kort-topp">
          <div style={{ minWidth: 0 }}>
            <div className="bef-k-navn">{b.kontaktNavn}</div>
            <div className="bef-k-adresse">{b.adresse}</div>
            {(b.telefon || b.epost) && (
              <div className="bef-k-kontakt">
                {b.telefon && <a href={`tel:${b.telefon}`} onClick={e => e.stopPropagation()} className="bef-k-kontakt-link">📱 {b.telefon}</a>}
                {b.epost && <a href={`mailto:${b.epost}`} onClick={e => e.stopPropagation()} className="bef-k-kontakt-link">✉️ {b.epost}</a>}
              </div>
            )}
          </div>
          <span className="bef-k-status-pill" style={{ background: s.bg, color: s.farge }}>
            {s.ikon} {s.label}
          </span>
        </div>

        <div className="bef-k-chips">
          {b.jobbType && <span className="bef-k-chip">{b.jobbType}</span>}
          {b.dato && b.status === 'planlagt' && (
            <span className="bef-k-chip bef-k-chip--dato">
              📅 {datoKort(b.dato)}{b.tid ? ` kl. ${b.tid}` : ''}
            </span>
          )}
          {belopVis && <span className="bef-k-chip bef-k-chip--belop">💰 {belopVis}</span>}
          {ansatt && (
            <span className="bef-k-chip bef-k-chip--ansatt" style={{ background: ansattFarge(b.prosjektlederId) + '22', color: ansattFarge(b.prosjektlederId) }}>
              👤 {ansatt.navn.split(' ')[0]}
            </span>
          )}
        </div>

        <div className="bef-k-datoer">
          {b.tilbudFrist && (
            <span className="bef-k-dato-rad" style={{ color: fristFarge }}>
              ⏰ Tilbudsfrist: {datoKort(b.tilbudFrist)}
              {fristDager !== null && <em> ({fristDager < 0 ? `${Math.abs(fristDager)}d over` : fristDager === 0 ? 'i dag' : `${fristDager}d`})</em>}
            </span>
          )}
          {b.nesteKontakt && (
            <span className="bef-k-dato-rad" style={{ color: kontaktFarge, fontWeight: kontaktDager !== null && kontaktDager <= 2 ? 600 : 400 }}>
              📞 Neste kontakt: {datoKort(b.nesteKontakt)}
              {kontaktDager !== null && kontaktDager <= 2 && (
                <em> ({kontaktDager < 0 ? `${Math.abs(kontaktDager)}d over` : kontaktDager === 0 ? 'i dag!' : `${kontaktDager}d`})</em>
              )}
            </span>
          )}
          {b.oensketOppstart && (
            <span className="bef-k-dato-rad" style={{ color: '#0891b2', fontWeight: 500 }}>
              🚀 Ønsket oppstart: {datoKort(b.oensketOppstart)}
            </span>
          )}
          {b.resultat && (
            <span className="bef-k-dato-rad bef-k-resultat">
              📝 {b.resultat}
            </span>
          )}
          {b.tapArsak && b.status === 'tapt' && (
            <span className="bef-k-dato-rad" style={{ color: '#dc2626' }}>
              ❌ {b.tapArsak}
            </span>
          )}
          {b.kommentar && (
            <span className="bef-k-dato-rad bef-k-kommentar">
              💬 {b.kommentar.length > 60 ? b.kommentar.slice(0, 60) + '…' : b.kommentar}
            </span>
          )}
        </div>

        <div className="bef-k-status-bytte" onClick={e => e.stopPropagation()}>
          <select
            className="bef-k-status-select"
            value={b.status}
            onChange={e => dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, status: e.target.value } })}
          >
            {Object.entries(STATUS).map(([key, s]) => (
              <option key={key} value={key}>{s.ikon} {s.label}</option>
            ))}
          </select>
        </div>

        {b.status === 'godkjent' && (
          <div className="bef-k-prosjekt-rad" onClick={e => e.stopPropagation()}>
            {b.prosjektId ? (
              <span className="bef-k-prosjekt-badge">🏗 Prosjekt opprettet</span>
            ) : (
              <button className="bef-k-opprett-btn" onClick={() => apneProsjektModal(b)}>
                🏗 Opprett prosjekt
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bef-side">
      {/* Header */}
      <div className="page-header">
        <h2>Befaring & Tilbud</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ width: 200, height: 36 }}
            placeholder="🔍 Søk navn, adresse, type..."
            value={sok}
            onChange={e => setSok(e.target.value)}
          />
          <div className="bef-view-tabs">
            <button className={`bef-view-tab${viewTab === 'oversikt' ? ' aktiv' : ''}`} onClick={() => setViewTab('oversikt')}>📋 Oversikt</button>
            <button className={`bef-view-tab${viewTab === 'kalender' ? ' aktiv' : ''}`} onClick={() => setViewTab('kalender')}>📅 Kalender</button>
          </div>
          <button className="btn btn-primary" onClick={() => apneNy()}>+ Ny befaring</button>
        </div>
      </div>

      {/* Pipeline */}
      <div className="bef-pipeline">
        {Object.entries(STATUS).map(([key, s]) => {
          const aktiv = pipelineFilter === key;
          return (
            <div
              key={key}
              className={`bef-pipeline-kort${aktiv ? ' bef-pipeline-kort--aktiv' : ''}`}
              style={{ borderTop: `4px solid ${s.farge}`, background: aktiv ? s.farge : s.bg, cursor: 'pointer' }}
              onClick={() => setPipelineFilter(f => f === key ? null : key)}
              title={aktiv ? 'Klikk for å fjerne filter' : `Filtrer på: ${s.label}`}
            >
              <div className="bef-pipeline-ikon">{s.ikon}</div>
              <div className="bef-pipeline-antall" style={{ color: aktiv ? '#fff' : s.farge }}>{teller[key] || 0}</div>
              <div className="bef-pipeline-label" style={{ color: aktiv ? '#fff' : undefined }}>{s.label}</div>
              {aktiv && <div className="bef-pipeline-aktiv-pill">✕ fjern</div>}
            </div>
          );
        })}
      </div>
      {pipelineFilter && (
        <div className="bef-filter-banner">
          Viser kun: <strong>{STATUS[pipelineFilter]?.label}</strong>
          <button className="bef-filter-fjern" onClick={() => setPipelineFilter(null)}>✕ Fjern filter</button>
        </div>
      )}

      {/* Oversikt-visning: tre kolonner */}
      {viewTab === 'oversikt' && (
        <div className="bef-kanban bef-kanban--3col">
          {/* Planlagt befaring */}
          <div className="bef-kolonne">
            <div className="bef-kolonne-header" style={{ borderColor: STATUS.planlagt.farge, color: STATUS.planlagt.farge }}>
              <span>📋 Planlagt befaring <span className="bef-kolonne-teller">{planlagte.length}</span></span>
              {sumKr(planlagte) && <span className="bef-kolonne-kr">{sumKr(planlagte)}</span>}
            </div>
            {planlagte.length === 0 && <div className="bef-tom-melding">Ingen planlagte befaringer.</div>}
            {planlagte.map(b => <BefKort key={b.id} b={b} />)}
            <button className="bef-legg-til-btn" onClick={() => apneNy('planlagt')}>+ Legg til befaring</button>
          </div>

          {/* Tilbud under arbeid */}
          <div className="bef-kolonne">
            <div className="bef-kolonne-header" style={{ borderColor: STATUS.tilbud_arbeid.farge, color: STATUS.tilbud_arbeid.farge }}>
              <span>✏️ Tilbud under arbeid <span className="bef-kolonne-teller">{tilbudArbeid.length}</span></span>
              {sumKr(tilbudArbeid) && <span className="bef-kolonne-kr">{sumKr(tilbudArbeid)}</span>}
            </div>
            {tilbudArbeid.length === 0 && <div className="bef-tom-melding">Ingen tilbud under arbeid.</div>}
            {tilbudArbeid.map(b => <BefKort key={b.id} b={b} />)}
            <button className="bef-legg-til-btn" onClick={() => apneNy('tilbud_arbeid')}>+ Legg til tilbud</button>
          </div>

          {/* Avsluttede: godkjent + tapt */}
          <div className="bef-kolonne">
            <div className="bef-kolonne-header" style={{ borderColor: '#6b7280', color: '#6b7280', cursor: 'pointer' }}
              onClick={() => setVisAvsluttede(v => !v)}>
              <span>{visAvsluttede ? '🔽' : '▶️'} Avsluttede <span className="bef-kolonne-teller">{avsluttede.length}</span></span>
              {visAvsluttede && sumKr(avsluttede) && <span className="bef-kolonne-kr">{sumKr(avsluttede)}</span>}
            </div>
            {!visAvsluttede && avsluttede.length > 0 && (
              <div className="bef-tom-melding" style={{ cursor: 'pointer' }} onClick={() => setVisAvsluttede(true)}>
                {teller.godkjent || 0} godkjent · {teller.tapt || 0} tapt — klikk for å vise
              </div>
            )}
            {visAvsluttede && (
              <>
                {avsluttede.length === 0 && <div className="bef-tom-melding">Ingen avsluttede befaringer.</div>}
                {avsluttede.map(b => <BefKort key={b.id} b={b} />)}
              </>
            )}
          </div>
        </div>
      )}

      {/* Kalender-visning */}
      {viewTab === 'kalender' && (
        <div className="bef-innhold">
          <div className="bef-kal-seksjon">
            <div className="bef-kal-nav">
              <button className="btn" onClick={() => setKalMaaned(m => addMonths(m, -1))}>←</button>
              <span className="bef-kal-tittel">{monthLabel(kalMaaned)}</span>
              <button className="btn" onClick={() => setKalMaaned(m => addMonths(m, 1))}>→</button>
            </div>
            <div className="bef-kal-grid">
              {DAG_NAVN_KORT.map(d => <div key={d} className="bef-kal-dagheader">{d}</div>)}
              {kalenderDager().map((dag, i) => {
                if (!dag) return <div key={'tom-' + i} className="bef-kal-dag bef-kal-dag--tom" />;
                const bfs = befaringer.filter(b => b.dato === dag);
                return (
                  <div key={dag} className={`bef-kal-dag${dag === today ? ' bef-kal-dag--idag' : ''}`} onClick={() => apneNy(null, dag)}>
                    <span className="bef-kal-dato">{dag.slice(8)}</span>
                    {bfs.map(b => {
                      const ansatt = b.prosjektlederId ? state.ansatte.find(a => a.id === b.prosjektlederId) : null;
                      const chipFarge = ansattFarge(b.prosjektlederId) || STATUS[b.status]?.farge || '#6b7280';
                      return (
                        <div key={b.id} className="bef-kal-chip" style={{ background: chipFarge }}
                          onClick={e => { e.stopPropagation(); apneRediger(b); }}
                          title={`${b.tid ? b.tid + ' – ' : ''}${b.kontaktNavn} – ${b.adresse}${ansatt ? ` (${ansatt.navn})` : ''}`}>
                          {b.tid && <span style={{ fontSize: 9, opacity: 0.9 }}>{b.tid} </span>}
                          {b.kontaktNavn.split(' ')[0]}
                          {ansatt ? ` · ${ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}` : ''}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kommende liste ved siden av kalender */}
          <div className="bef-liste-seksjon">
            <h3 className="bef-liste-tittel">Kommende befaringer</h3>
            {[...befaringer]
              .filter(b => b.status !== 'tapt' && b.status !== 'godkjent')
              .sort((a, b) => a.dato.localeCompare(b.dato))
              .map(b => {
                const s = STATUS[b.status] || STATUS.planlagt;
                const ansatt = b.prosjektlederId ? state.ansatte.find(a => a.id === b.prosjektlederId) : null;
                return (
                  <div key={b.id} className="bef-kort" onClick={() => apneRediger(b)}>
                    <div className="bef-kort-farge" style={{ background: s.farge }} />
                    <div className="bef-kort-innhold">
                      <div className="bef-kort-navn">{b.kontaktNavn}</div>
                      <div className="bef-kort-adresse">{b.adresse}</div>
                      <div className="bef-kort-meta">
                        <span className="bef-kort-dato">
                          {new Date(b.dato + 'T00:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: 'short' })}
                          {b.tid ? ` kl. ${b.tid}` : ''}
                        </span>
                        <span className="bef-kort-type">{b.jobbType}</span>
                        {ansatt && <span className="bef-kort-pl">👤 {ansatt.navn}</span>}
                      </div>
                    </div>
                    <div className="bef-kort-status" style={{ color: s.farge, background: s.bg }}>
                      {s.ikon} {s.label}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Modal: legg til / rediger */}
      {visModal && (
        <div className="modal-backdrop" onClick={() => setVisModal(false)}>
          <div className="modal bef-modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{redigerer ? 'Rediger befaring' : 'Ny befaring'}</h3>
              <button className="btn-icon" onClick={() => setVisModal(false)}>✕</button>
            </div>
            <div className="form">

              {/* Grunninfo */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Grunninfo</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Kontaktnavn *</label>
                    <input className="input" value={form.kontaktNavn} onChange={e => setForm(f => ({ ...f, kontaktNavn: e.target.value }))} placeholder="Navn på kontaktperson / prosjekt" />
                  </div>
                  <div>
                    <label>Telefon</label>
                    <input className="input" type="tel" value={form.telefon || ''} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} placeholder="f.eks. 900 12 345" />
                  </div>
                  <div>
                    <label>E-post</label>
                    <input className="input" type="email" value={form.epost || ''} onChange={e => setForm(f => ({ ...f, epost: e.target.value }))} placeholder="kunde@epost.no" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Adresse *</label>
                    <input className="input" value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="Adresse for befaring" />
                  </div>
                  <div>
                    <label>Type jobb</label>
                    <select className="input" value={form.jobbType} onChange={e => setForm(f => ({ ...f, jobbType: e.target.value }))}>
                      {JOBB_TYPER.map(j => <option key={j}>{j}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Ansvarlig person</label>
                    <select className="input" value={form.prosjektlederId} onChange={e => setForm(f => ({ ...f, prosjektlederId: e.target.value }))}>
                      <option value="">– Velg ansvarlig –</option>
                      {[...state.ansatte].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(a => (
                        <option key={a.id} value={a.id}>{a.navn}{a.fag ? ` (${a.fag})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Dato for befaring</label>
                    <input type="date" className="input" value={form.dato} onChange={e => setForm(f => ({ ...f, dato: e.target.value }))} />
                  </div>
                  <div>
                    <label>Tidspunkt</label>
                    <input type="time" className="input" value={form.tid || '09:00'} onChange={e => setForm(f => ({ ...f, tid: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Tilbud & Frister */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Tilbud & Frister</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label>Størrelse på jobb (kr)</label>
                    <input className="input" type="number" min="0" step="10000"
                      value={form.estimertBelop} onChange={e => setForm(f => ({ ...f, estimertBelop: e.target.value }))}
                      placeholder="f.eks. 500000" />
                  </div>
                  <div>
                    <label>Frist for tilbud</label>
                    <input type="date" className="input" value={form.tilbudFrist || ''} onChange={e => setForm(f => ({ ...f, tilbudFrist: e.target.value }))} />
                  </div>
                  <div>
                    <label>Dato neste kontakt</label>
                    <input type="date" className="input" value={form.nesteKontakt || ''} onChange={e => setForm(f => ({ ...f, nesteKontakt: e.target.value }))} />
                  </div>
                  <div>
                    <label>Ønsket oppstartsdato</label>
                    <input type="date" className="input" value={form.oensketOppstart || ''} onChange={e => setForm(f => ({ ...f, oensketOppstart: e.target.value }))} />
                  </div>
                  <div>
                    <label>Resultat</label>
                    <input className="input" value={form.resultat || ''} onChange={e => setForm(f => ({ ...f, resultat: e.target.value }))} placeholder="f.eks. Tilbud akseptert, avventer..." />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Status</div>
                <div className="bef-status-velger">
                  {Object.entries(STATUS).map(([key, s]) => (
                    <button key={key} type="button"
                      className={`bef-status-btn${form.status === key ? ' aktiv' : ''}`}
                      style={form.status === key ? { background: s.farge, color: '#fff', borderColor: s.farge } : { borderColor: s.farge, color: s.farge }}
                      onClick={() => setForm(f => ({ ...f, status: key }))}>
                      {s.ikon} {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tap-årsak (kun når status = tapt) */}
              {form.status === 'tapt' && (
                <div className="bef-modal-seksjon">
                  <div className="bef-modal-seksjon-tittel" style={{ color: '#dc2626' }}>Tap-årsak</div>
                  <input
                    className="input"
                    value={form.tapArsak || ''}
                    onChange={e => setForm(f => ({ ...f, tapArsak: e.target.value }))}
                    placeholder="Hvorfor tapte vi denne? (pris, konkurrent, endret behov...)"
                  />
                </div>
              )}

              {/* Kommentar */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Kommentar & Notat</div>
                <label>Kommentar</label>
                <textarea className="input" rows={2} value={form.kommentar || ''} onChange={e => setForm(f => ({ ...f, kommentar: e.target.value }))} placeholder="Kort kommentar / merknad..." />
                <label style={{ marginTop: 8 }}>Notat (intern)</label>
                <textarea className="input" rows={3} value={form.notat} onChange={e => setForm(f => ({ ...f, notat: e.target.value }))} placeholder="Notater fra befaring, prisestimater, detaljer..." />
              </div>

              <div className="modal-actions">
                {redigerer && <button className="btn btn-danger" onClick={slett}>Slett</button>}
                {redigerer && redigerer.status !== 'godkjent' && (
                  <button className="btn" style={{ background: '#16a34a', color: '#fff' }} onClick={() => godkjenn(redigerer)}>
                    ✅ Godkjenn tilbud
                  </button>
                )}
                <button className="btn btn-primary" onClick={lagre} disabled={!form.kontaktNavn.trim() || !form.adresse.trim()}>
                  Lagre
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: kapasitet */}
      {visKapasitet && (
        <div className="modal-backdrop" onClick={() => setVisKapasitet(null)}>
          <div className="modal bef-kap-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Ledig kapasitet – neste 16 uker</h3>
              <button className="btn-icon" onClick={() => setVisKapasitet(null)}>✕</button>
            </div>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
              Tilbud godkjent for <strong>{visKapasitet.kontaktNavn}</strong> – {visKapasitet.adresse}.
            </p>
            <div className="bef-kap-liste">
              {uker.map((u, i) => {
                const pst = Math.round((u.ledige / u.totalt) * 100);
                const farge = pst >= 50 ? '#16a34a' : pst >= 25 ? '#f59e0b' : '#dc2626';
                return (
                  <div key={i} className="bef-kap-rad">
                    <div className="bef-kap-uke">
                      Uke {i + 1} &nbsp;
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>
                        {new Date(u.ukeStart + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                    <div className="bef-kap-bar-wrap">
                      <div className="bef-kap-bar" style={{ width: pst + '%', background: farge }} />
                    </div>
                    <div className="bef-kap-tall" style={{ color: farge }}>{u.ledige} / {u.totalt} ledige</div>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn" onClick={() => setVisKapasitet(null)}>Lukk</button>
              <button className="btn btn-primary" onClick={() => setVisProsjektModal(true)}>+ Opprett prosjekt</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: opprett prosjekt */}
      {visProsjektModal && (
        <div className="modal-backdrop" onClick={() => setVisProsjektModal(false)}>
          <div className="modal bef-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🏗 Opprett prosjekt fra befaring</h3>
              <button className="btn-icon" onClick={() => setVisProsjektModal(false)}>✕</button>
            </div>
            <div className="form">
              {/* Forhåndsvisning av befaringsdata */}
              {visKapasitet && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>Fra befaring:</div>
                  <div style={{ color: '#64748b' }}>📍 {visKapasitet.adresse}</div>
                  {visKapasitet.jobbType && <div style={{ color: '#64748b' }}>🔨 {visKapasitet.jobbType}</div>}
                  {visKapasitet.estimertBelop && (
                    <div style={{ color: '#64748b' }}>
                      💰 {new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(visKapasitet.estimertBelop))}
                    </div>
                  )}
                  {visKapasitet.oensketOppstart && (
                    <div style={{ color: '#0891b2', fontWeight: 500 }}>
                      🚀 Ønsket oppstart: {datoKort(visKapasitet.oensketOppstart)}
                    </div>
                  )}
                </div>
              )}

              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Prosjektdetaljer</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Prosjektnavn *</label>
                    <input className="input" value={prosjektForm.navn}
                      onChange={e => setProsjektForm(f => ({ ...f, navn: e.target.value }))} />
                  </div>
                  <div>
                    <label>Startdato</label>
                    <input type="date" className="input" value={prosjektForm.startDato}
                      onChange={e => setProsjektForm(f => ({ ...f, startDato: e.target.value }))} />
                  </div>
                  <div>
                    <label>Sluttdato</label>
                    <input type="date" className="input" value={prosjektForm.sluttDato}
                      onChange={e => setProsjektForm(f => ({ ...f, sluttDato: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Farge</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {PROSJEKT_PALETTE.map(c => (
                        <button key={c} type="button"
                          onClick={() => setProsjektForm(f => ({ ...f, farge: c }))}
                          style={{
                            width: 28, height: 28, borderRadius: '50%', background: c, border: 'none',
                            cursor: 'pointer', outline: prosjektForm.farge === c ? `3px solid ${c}` : 'none',
                            outlineOffset: 2, transform: prosjektForm.farge === c ? 'scale(1.2)' : 'scale(1)',
                            transition: 'transform .15s',
                          }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Automatisk tildeling */}
              {visKapasitet?.prosjektlederId && (
                <div className="bef-modal-seksjon">
                  <div className="bef-modal-seksjon-tittel">Ansvarlig person</div>
                  {(() => {
                    const ansatt = state.ansatte.find(a => a.id === visKapasitet.prosjektlederId);
                    return ansatt ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={prosjektForm.lagTildeling}
                          onChange={e => setProsjektForm(f => ({ ...f, lagTildeling: e.target.checked }))} />
                        <span>
                          Tildel <strong>{ansatt.navn}</strong> til prosjektet automatisk
                          {prosjektForm.startDato && (
                            <span style={{ color: '#64748b' }}>
                              {' '}(fra {new Date(prosjektForm.startDato + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' })}
                              {prosjektForm.sluttDato
                                ? ` til ${new Date(prosjektForm.sluttDato + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' })}`
                                : ' i 2 uker'})
                            </span>
                          )}
                        </span>
                      </label>
                    ) : null;
                  })()}
                </div>
              )}

              <div className="modal-actions">
                <button className="btn" onClick={() => setVisProsjektModal(false)}>Avbryt</button>
                <button className="btn btn-primary" onClick={opprettProsjekt} disabled={!prosjektForm.navn.trim()}>
                  🏗 Opprett prosjekt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
