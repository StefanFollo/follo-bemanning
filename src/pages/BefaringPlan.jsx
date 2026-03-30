import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { uid, dateToIso, isoToDate, addDays, weekStart, overlaps } from '../store';

const JOBB_TYPER = ['Ny bygg', 'Tilbygg', 'Tak jobb', 'Fasade jobb', 'Tømrer', 'Maling', 'Rørlegger', 'Flislegging', 'Elektro', 'Rehabilitering', 'Annet'];

const STATUS = {
  planlagt:     { label: 'Planlagt',      farge: '#3b82f6', bg: '#eff6ff', ikon: '📋' },
  tilbud_sendt: { label: 'Tilbud sendt',  farge: '#f59e0b', bg: '#fffbeb', ikon: '📤' },
  godkjent:     { label: 'Godkjent',      farge: '#16a34a', bg: '#f0fdf4', ikon: '✅' },
  tapt:         { label: 'Tapt',          farge: '#6b7280', bg: '#f9fafb', ikon: '❌' },
};

const MAANED_NAVN = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];
const DAG_NAVN_KORT = ['Man','Tir','Ons','Tor','Fre','Lør','Søn'];

function monthStart(iso) {
  return iso.slice(0, 7) + '-01';
}
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
  // 0=Mon ... 6=Sun
  const d = new Date(iso + 'T00:00:00');
  return (d.getDay() + 6) % 7;
}

function tomModal() {
  return {
    kontaktNavn: '',
    adresse: '',
    jobbType: 'Ny bygg',
    dato: dateToIso(new Date()),
    status: 'planlagt',
    notat: '',
    prosjektlederId: '',
    estimertBelop: '',
  };
}

export default function BefaringPlan() {
  const { state, dispatch } = useApp();
  const befaringer = state.befaringer || [];
  const today = dateToIso(new Date());
  const prosjektledere = state.ansatte.filter(a => a.fag === 'Prosjekt Leder');

  const [visModal, setVisModal] = useState(false);
  const [redigerer, setRedigerer] = useState(null); // befaring-objekt eller null
  const [form, setForm] = useState(tomModal());
  const [visKapasitet, setVisKapasitet] = useState(null); // befaring som ble godkjent
  const [visProsjektModal, setVisProsjektModal] = useState(false);
  const [prosjektNavn, setProsjektNavn] = useState('');
  const [kalMaaned, setKalMaaned] = useState(() => monthStart(today));

  // ---- Kapasitetsberegning ----
  function kapasitetPerUke() {
    const uker = [];
    const totalAnsatte = state.ansatte.length;
    for (let w = 0; w < 16; w++) {
      const ukeStart = addDays(weekStart(today), w * 7);
      const ukeSlut = addDays(ukeStart, 4); // man-fre
      const opptatt = new Set(
        state.tildelinger
          .filter(t => t.prosjektId !== '__FERIE__' && overlaps(t.startDato, t.sluttDato, ukeStart, ukeSlut))
          .map(t => t.ansattId)
      );
      uker.push({
        ukeStart,
        ukeSlut,
        ledige: totalAnsatte - opptatt.size,
        totalt: totalAnsatte,
      });
    }
    return uker;
  }

  // ---- Kalender-hjelp ----
  function kalenderDager() {
    const firstDay = dayOfWeek(kalMaaned); // 0=Man
    const antDager = daysInMonth(kalMaaned);
    const dager = [];
    // padding før
    for (let i = 0; i < firstDay; i++) dager.push(null);
    for (let d = 1; d <= antDager; d++) {
      const iso = kalMaaned.slice(0, 7) + '-' + String(d).padStart(2, '0');
      dager.push(iso);
    }
    // padding etter (full uker)
    while (dager.length % 7 !== 0) dager.push(null);
    return dager;
  }

  function befaringerPaaDag(iso) {
    return befaringer.filter(b => b.dato === iso);
  }

  // ---- CRUD ----
  function apneNy(dato) {
    setForm({ ...tomModal(), dato: dato || today });
    setRedigerer(null);
    setVisModal(true);
  }
  function apneRediger(b) {
    setForm({ ...b });
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
    setProsjektNavn(b.kontaktNavn + (b.adresse ? ' – ' + b.adresse : ''));
  }
  function opprettProsjekt() {
    if (!prosjektNavn.trim()) return;
    dispatch({
      type: 'ADD_PROSJEKT',
      payload: {
        navn: prosjektNavn,
        adresse: visKapasitet?.adresse || '',
        startDato: '',
        sluttDato: '',
        status: 'godkjent',
        beskrivelse: visKapasitet?.notat || '',
        farge: '#6b8fc4',
      },
    });
    setVisKapasitet(null);
    setVisProsjektModal(false);
  }

  // ---- Teller per status ----
  const teller = Object.fromEntries(Object.keys(STATUS).map(s => [s, befaringer.filter(b => b.status === s).length]));

  // ---- Kommende befaringer (sortert) ----
  const kommende = [...befaringer]
    .filter(b => b.status !== 'tapt' && b.status !== 'godkjent')
    .sort((a, b) => a.dato.localeCompare(b.dato));

  const uker = kapasitetPerUke();

  return (
    <div className="bef-side">
      {/* Topptittel */}
      <div className="page-header">
        <h2>Befaring & Tilbud</h2>
        <button className="btn btn-primary" onClick={() => apneNy()}>+ Ny befaring</button>
      </div>

      {/* Pipeline-kort */}
      <div className="bef-pipeline">
        {Object.entries(STATUS).map(([key, s]) => (
          <div key={key} className="bef-pipeline-kort" style={{ borderTop: `4px solid ${s.farge}`, background: s.bg }}>
            <div className="bef-pipeline-ikon">{s.ikon}</div>
            <div className="bef-pipeline-antall" style={{ color: s.farge }}>{teller[key] || 0}</div>
            <div className="bef-pipeline-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bef-innhold">
        {/* Kalender */}
        <div className="bef-kal-seksjon">
          <div className="bef-kal-nav">
            <button className="btn" onClick={() => setKalMaaned(m => addMonths(m, -1))}>←</button>
            <span className="bef-kal-tittel">{monthLabel(kalMaaned)}</span>
            <button className="btn" onClick={() => setKalMaaned(m => addMonths(m, 1))}>→</button>
          </div>
          <div className="bef-kal-grid">
            {DAG_NAVN_KORT.map(d => (
              <div key={d} className="bef-kal-dagheader">{d}</div>
            ))}
            {kalenderDager().map((dag, i) => {
              if (!dag) return <div key={'tom-' + i} className="bef-kal-dag bef-kal-dag--tom" />;
              const bfs = befaringerPaaDag(dag);
              const erIdag = dag === today;
              return (
                <div
                  key={dag}
                  className={`bef-kal-dag ${erIdag ? 'bef-kal-dag--idag' : ''}`}
                  onClick={() => apneNy(dag)}
                >
                  <span className="bef-kal-dato">{dag.slice(8)}</span>
                  {bfs.map(b => {
                    const pl = b.prosjektlederId ? state.ansatte.find(a => a.id === b.prosjektlederId) : null;
                    const plInitialer = pl ? pl.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : null;
                    return (
                      <div
                        key={b.id}
                        className="bef-kal-chip"
                        style={{ background: STATUS[b.status]?.farge || '#6b7280' }}
                        onClick={e => { e.stopPropagation(); apneRediger(b); }}
                        title={`${b.kontaktNavn} – ${b.adresse}${pl ? ` (${pl.navn})` : ''}`}
                      >
                        {b.kontaktNavn.split(' ')[0]}{plInitialer ? ` · ${plInitialer}` : ''}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Kommende liste */}
        <div className="bef-liste-seksjon">
          <h3 className="bef-liste-tittel">Kommende befaringer</h3>
          {kommende.length === 0 && (
            <div className="bef-tom-melding">Ingen kommende befaringer. Trykk + Ny befaring for å legge til.</div>
          )}
          {kommende.map(b => {
            const s = STATUS[b.status];
            const pl = b.prosjektlederId ? state.ansatte.find(a => a.id === b.prosjektlederId) : null;
            const belopVis = b.estimertBelop ? new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(b.estimertBelop)) : null;
            return (
              <div key={b.id} className="bef-kort" onClick={() => apneRediger(b)}>
                <div className="bef-kort-farge" style={{ background: s.farge }} />
                <div className="bef-kort-innhold">
                  <div className="bef-kort-navn">{b.kontaktNavn}</div>
                  <div className="bef-kort-adresse">{b.adresse}</div>
                  <div className="bef-kort-meta">
                    <span className="bef-kort-dato">{new Date(b.dato + 'T00:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                    <span className="bef-kort-type">{b.jobbType}</span>
                    {pl && <span className="bef-kort-pl">👤 {pl.navn}</span>}
                    {belopVis && <span className="bef-kort-pl">💰 {belopVis}</span>}
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

      {/* Modal: legg til / rediger befaring */}
      {visModal && (
        <div className="modal-backdrop" onClick={() => setVisModal(false)}>
          <div className="modal bef-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{redigerer ? 'Rediger befaring' : 'Ny befaring'}</h3>
              <button className="btn-icon" onClick={() => setVisModal(false)}>✕</button>
            </div>
            <div className="form">
              <label>Prosjektleder (befaringsansvarlig)</label>
              <select className="input" value={form.prosjektlederId} onChange={e => setForm(f => ({ ...f, prosjektlederId: e.target.value }))}>
                <option value="">– Velg prosjektleder –</option>
                {prosjektledere.map(a => (
                  <option key={a.id} value={a.id}>{a.navn}</option>
                ))}
              </select>

              <label>Kontaktnavn *</label>
              <input className="input" value={form.kontaktNavn} onChange={e => setForm(f => ({ ...f, kontaktNavn: e.target.value }))} placeholder="Navn på kontaktperson / prosjekt" />

              <label>Adresse *</label>
              <input className="input" value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="Adresse for befaring" />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label>Type jobb</label>
                  <select className="input" value={form.jobbType} onChange={e => setForm(f => ({ ...f, jobbType: e.target.value }))}>
                    {JOBB_TYPER.map(j => <option key={j}>{j}</option>)}
                  </select>
                </div>
                <div>
                  <label>Dato for befaring</label>
                  <input type="date" className="input" value={form.dato} onChange={e => setForm(f => ({ ...f, dato: e.target.value }))} />
                </div>
              </div>

              <label>Størrelse på jobb (ca. kr)</label>
              <input
                className="input"
                type="number"
                min="0"
                step="10000"
                value={form.estimertBelop}
                onChange={e => setForm(f => ({ ...f, estimertBelop: e.target.value }))}
                placeholder="f.eks. 500000"
              />

              <label>Status</label>
              <div className="bef-status-velger">
                {Object.entries(STATUS).map(([key, s]) => (
                  <button
                    key={key}
                    className={`bef-status-btn ${form.status === key ? 'aktiv' : ''}`}
                    style={form.status === key ? { background: s.farge, color: '#fff', borderColor: s.farge } : { borderColor: s.farge, color: s.farge }}
                    onClick={() => setForm(f => ({ ...f, status: key }))}
                    type="button"
                  >
                    {s.ikon} {s.label}
                  </button>
                ))}
              </div>

              <label>Notat</label>
              <textarea className="input" rows={3} value={form.notat} onChange={e => setForm(f => ({ ...f, notat: e.target.value }))} placeholder="Notater fra befaring, prisestimater, detaljer..." />

              <div className="modal-actions">
                {redigerer && (
                  <button className="btn btn-danger" onClick={slett}>Slett</button>
                )}
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

      {/* Modal: kapasitetsoversikt etter godkjenning */}
      {visKapasitet && (
        <div className="modal-backdrop" onClick={() => setVisKapasitet(null)}>
          <div className="modal bef-kap-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Ledig kapasitet – neste 16 uker</h3>
              <button className="btn-icon" onClick={() => setVisKapasitet(null)}>✕</button>
            </div>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
              Tilbud godkjent for <strong>{visKapasitet.kontaktNavn}</strong> – {visKapasitet.adresse}.<br />
              Velg en periode med ledig kapasitet og opprett prosjekt.
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
                    <div className="bef-kap-tall" style={{ color: farge }}>
                      {u.ledige} / {u.totalt} ledige
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn" onClick={() => setVisKapasitet(null)}>Lukk</button>
              <button className="btn btn-primary" onClick={() => { setVisProsjektModal(true); }}>
                + Opprett prosjekt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: opprett prosjekt */}
      {visProsjektModal && (
        <div className="modal-backdrop" onClick={() => setVisProsjektModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Opprett prosjekt</h3>
              <button className="btn-icon" onClick={() => setVisProsjektModal(false)}>✕</button>
            </div>
            <div className="form">
              <label>Prosjektnavn</label>
              <input className="input" value={prosjektNavn} onChange={e => setProsjektNavn(e.target.value)} />
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={opprettProsjekt} disabled={!prosjektNavn.trim()}>
                  Opprett
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
