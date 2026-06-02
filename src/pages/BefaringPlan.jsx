import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { dateToIso, addDays, weekStart, overlaps, PROSJEKT_PALETTE, uid } from '../store';

const JOBB_TYPER = ['Ny bygg', 'Tilbygg', 'Tak jobb', 'Fasade jobb', 'Bad', 'Tømrer', 'Maling', 'Rørlegger', 'Flislegging', 'Elektro', 'Rehabilitering', 'Annet'];

function fmtKr(n) { return Math.round(n).toLocaleString('nb-NO') + ' kr'; }

function byggTimer(poster) {
  const timer = {};
  for (const post of (poster || [])) {
    if (Array.isArray(post.kalkyle?.timer)) {
      for (const rad of post.kalkyle.timer) {
        const fag = (rad.fag || 'annet').toLowerCase();
        timer[fag] = (timer[fag] || 0) + (parseFloat(rad.antall) || 0);
      }
    }
  }
  return timer;
}

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
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' });
}
function dagerTil(iso) {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return Math.round((d - new Date()) / 86400000);
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
    ansvarligBefaringId: '',
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

  const isAdmin = localStorage.getItem('fbs_role') === 'admin';
  const [visModal, setVisModal] = useState(false);
  const [redigerer, setRedigerer] = useState(null);
  const [dedupPanel, setDedupPanel] = useState(null); // null | {loading} | {dry, plan, ...}
  const [form, setForm] = useState(tomModal());
  const [autoSaveSts, setAutoSaveSts] = useState(null); // null | 'saving' | 'saved'
  const [modalFane, setModalFane] = useState('detaljer'); // 'detaljer' | 'aktivitet'
  const [aktivitetLog, setAktivitetLog] = useState([]);
  const [aktivitetLaster, setAktivitetLaster] = useState(false);
  const [konfliktBef, setKonfliktBef] = useState(null); // befaring med .konflikt som venter på beslutning
  const autoSaveRef  = useRef(null);
  const isFirstRender = useRef(true);

  // Auto-save når man redigerer eksisterende befaring
  useEffect(() => {
    if (!redigerer || !visModal) return;
    // Hopp over første render (modal nettopp åpnet)
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!form.kontaktNavn.trim() || !form.adresse.trim()) return;
    setAutoSaveSts('saving');
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...form, id: redigerer.id } });
      setAutoSaveSts('saved');
      autoSaveRef.current = setTimeout(() => setAutoSaveSts(null), 2200);
    }, 700);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps
  const [visArkiv, setVisArkiv] = useState(false);
  const [visKapasitet, setVisKapasitet] = useState(null);
  const [visProsjektModal, setVisProsjektModal] = useState(false);
  const [prosjektForm, setProsjektForm] = useState({ navn: '', startDato: '', sluttDato: '', farge: '#6b8fc4', lagTildeling: true });
  const [kalMaaned, setKalMaaned] = useState(() => monthStart(today));
  const [viewTab, setViewTab] = useState('oversikt'); // 'oversikt' | 'kalender'
  const [sok, setSok] = useState('');
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

  // ---- Admin: dedup befaringer ----
  async function kjorDedup(dry) {
    setDedupPanel({ loading: true });
    try {
      const token = localStorage.getItem('fbs_token') || '';
      const r = await fetch('/api/admin/dedup-befaringer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dry }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setDedupPanel({ ...data, loading: false });
    } catch (e) {
      setDedupPanel({ error: e.message, loading: false });
    }
  }

  // ---- CRUD ----
  function apneNy(presetStatus, presetDato) {
    setForm({ ...tomModal(), ...(presetStatus ? { status: presetStatus } : {}), dato: presetDato || today });
    setRedigerer(null);
    setAutoSaveSts(null);
    isFirstRender.current = true;
    setVisModal(true);
  }
  async function apneRediger(b) {
    setForm({ ...tomModal(), ...b });
    setRedigerer(b);
    setAutoSaveSts(null);
    setModalFane('detaljer');
    setAktivitetLog([]);
    isFirstRender.current = true;
    setVisModal(true);
    // Hent aktivitetslogg i bakgrunnen
    setAktivitetLaster(true);
    fetch(`/api/befaringer/audit?befaringId=${encodeURIComponent(b.id)}`)
      .then(r => r.ok ? r.json() : { entries: [] })
      .then(d => setAktivitetLog((d.entries || []).reverse()))
      .catch(() => {})
      .finally(() => setAktivitetLaster(false));
  }
  function lagre() {
    if (!form.kontaktNavn.trim() || !form.adresse.trim() || !form.ansvarligBefaringId || !form.prosjektlederId) return;
    if (redigerer) {
      // Manuell lagring i edit-modus: avbryt eventuell auto-save og lagre nå
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...form, id: redigerer.id } });
      setVisModal(false);
    } else {
      // Ny befaring: opprett og bytt til edit-modus (auto-save tar over)
      const nyId = uid();
      dispatch({ type: 'ADD_BEFARING', payload: { ...form, id: nyId } });
      const nyBef = { ...form, id: nyId };
      setRedigerer(nyBef);
      setAutoSaveSts(null);
      isFirstRender.current = true;
      // Modalen forblir åpen i edit-modus
    }
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
    const bef = visKapasitet || {};
    // Bygg kildeTilbudData for AI-framdrift fra tilbuds-data på befaringen
    const poster = bef.poster || [];
    const timerPerFag = byggTimer(poster);
    const kildeTilbudData = (poster.length > 0 || Object.keys(timerPerFag).length > 0)
      ? { poster, timer: timerPerFag, oppstart: bef.oppstartTekst || '', varighet: bef.varighetTekst || '', kundenavn: bef.kontaktNavn || '' }
      : null;
    dispatch({
      type: 'ADD_PROSJEKT',
      payload: {
        id: prosjektId,
        navn: prosjektForm.navn,
        adresse: bef.adresse || '',
        jobbType: bef.jobbType || '',
        belop: bef.estimertBelop || '',
        estimertSum: bef.estimertSum || 0,
        prosjektlederId: bef.prosjektlederId || '',
        startDato: prosjektForm.startDato,
        sluttDato: prosjektForm.sluttDato,
        status: 'aktiv',
        beskrivelse: [bef.notat, bef.kommentar].filter(Boolean).join('\n\n') || '',
        farge: prosjektForm.farge,
        befaringId: bef.id || '',
        // Tilbudsdata fra tilbuds-appen
        poster,
        fag: bef.fag || [],
        pristype: bef.pristype || '',
        oppstartTekst: bef.oppstartTekst || '',
        varighetTekst: bef.varighetTekst || '',
        varighetUker: bef.varighetUker || null,
        valgteOpsjoner: bef.valgteOpsjoner || [],
        tilbudLink: bef.tilbudLink || '',
        kildeBefaringId: bef.id || '',
        ...(kildeTilbudData ? { kildeTilbudData } : {}),
        // Full payload-snapshot fra tilbuds-appen (byggInfo, soner, totalSum osv.)
        ...(bef.tilbudPayload ? { tilbudPayload: bef.tilbudPayload } : {}),
        kunde: {
          navn: bef.kontaktNavn || '',
          adresse: bef.adresse || '',
          telefon: bef.telefon || '',
          epost: bef.epost || '',
        },
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

  const aktive = befaringer.filter(b => !b.arkivert);
  const arkiverte = [...befaringer.filter(b => b.arkivert)].sort((a, b) => b.dato?.localeCompare(a.dato || '') || 0);
  const teller = Object.fromEntries(Object.keys(STATUS).map(s => [s, aktive.filter(b => b.status === s).length]));

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

  const planlagte = [...aktive]
    .filter(b => b.status === 'planlagt')
    .filter(sokFilter)
    .filter(statusFilter)
    .sort((a, b) => a.dato.localeCompare(b.dato));

  const tilbudArbeid = [...aktive]
    .filter(b => b.status === 'tilbud_arbeid')
    .filter(sokFilter)
    .filter(statusFilter)
    .sort((a, b) => (a.tilbudFrist || '9999').localeCompare(b.tilbudFrist || '9999'));

  const tilbudSendt = [...aktive]
    .filter(b => b.status === 'tilbud_sendt')
    .filter(sokFilter)
    .filter(statusFilter)
    .sort((a, b) => (a.tilbudFrist || '9999').localeCompare(b.tilbudFrist || '9999'));

  const godkjente = [...aktive]
    .filter(b => b.status === 'godkjent')
    .filter(sokFilter)
    .filter(statusFilter)
    .sort((a, b) => b.dato.localeCompare(a.dato));

  const uker = kapasitetPerUke();

  // ---- Kort-komponent ----
  function BefKort({ b }) {
    const s = STATUS[b.status] || STATUS.planlagt;
    const ansattBefaring = b.ansvarligBefaringId ? state.ansatte.find(a => a.id === b.ansvarligBefaringId) : null;
    const ansatt = b.prosjektlederId ? state.ansatte.find(a => a.id === b.prosjektlederId) : null;
    const belopVis = b.estimertBelop
      ? new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(b.estimertBelop))
      : null;
    const fristDager = dagerTil(b.tilbudFrist);
    const fristFarge = fristDager !== null ? (fristDager < 0 ? '#dc2626' : fristDager <= 3 ? '#f59e0b' : '#16a34a') : null;
    const kontaktDager = dagerTil(b.nesteKontakt);
    const kontaktFarge = kontaktDager !== null ? (kontaktDager < 0 ? '#dc2626' : kontaktDager <= 2 ? '#f59e0b' : '#64748b') : '#64748b';

    const erForsinket = fristDager !== null && fristDager < 0;
    const erIdag = fristDager === 0;

    return (
      <div className="bef-k-kort" onClick={() => apneRediger(b)}
        style={erForsinket ? { borderLeft: '3px solid #dc2626' } : {}}>
        <div className="bef-k-kort-topp">
          <div style={{ minWidth: 0 }}>
            <div className="bef-k-navn">{b.adresse}</div>
            <div className="bef-k-adresse">{b.kontaktNavn}</div>
            {(b.telefon || b.epost) && (
              <div className="bef-k-kontakt">
                {b.telefon && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <a href={`tel:${b.telefon}`} onClick={e => e.stopPropagation()} className="bef-k-kontakt-link">📱 {b.telefon}</a>
                    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(b.telefon); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 11, opacity: 0.5, lineHeight: 1 }}
                      title="Kopier telefonnummer">📋</button>
                  </span>
                )}
                {b.epost && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <a href={`mailto:${b.epost}`} onClick={e => e.stopPropagation()} className="bef-k-kontakt-link">✉️ {b.epost}</a>
                    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(b.epost); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 11, opacity: 0.5, lineHeight: 1 }}
                      title="Kopier e-post">📋</button>
                  </span>
                )}
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
          {ansattBefaring && (
            <span className="bef-k-chip bef-k-chip--ansatt" style={{ background: ansattFarge(b.ansvarligBefaringId) + '22', color: ansattFarge(b.ansvarligBefaringId) }} title="Ansvarlig befaring">
              🏗 {ansattBefaring.navn.split(' ')[0]}
            </span>
          )}
          {ansatt && ansatt.id !== ansattBefaring?.id && (
            <span className="bef-k-chip bef-k-chip--ansatt" style={{ background: ansattFarge(b.prosjektlederId) + '22', color: ansattFarge(b.prosjektlederId) }} title="Ansvarlig tilbud">
              📋 {ansatt.navn.split(' ')[0]}
            </span>
          )}
          {ansatt && !ansattBefaring && (
            <span className="bef-k-chip bef-k-chip--ansatt" style={{ background: ansattFarge(b.prosjektlederId) + '22', color: ansattFarge(b.prosjektlederId) }} title="Ansvarlig tilbud">
              👤 {ansatt.navn.split(' ')[0]}
            </span>
          )}
          {b.kilde === 'tilbuds-app-direkte' && (
            <span className="bef-k-chip" style={{ background: '#f0f9ff', color: '#0369a1', fontSize: 10 }}
              title={`Opprettet direkte fra tilbuds-app av ${b.opprettetAv || 'ukjent'}`}>
              ✨ Fra tilbuds-app
            </span>
          )}
        </div>

        {/* Tilbud-link og kunde-aktivitet — vises på Tilbud sendt / Godkjent */}
        {(b.tilbudLink || b.sistEventDato) && (b.status === 'tilbud_sendt' || b.status === 'godkjent') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '6px 0', padding: '8px 10px', background: '#f8faff', border: '1px solid #e0e8f8', borderRadius: 7 }}>
            {b.sistEventDato && (
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                📤 Sendt: {new Date(b.sistEventDato).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' })}
              </span>
            )}
            {b.kundeHarSettTilbud ? (
              <span style={{ fontSize: 11, color: '#0891b2', fontWeight: 600 }}>
                👁 Åpnet {b.antallKundeAapninger || 1}x
                {(() => {
                  const aapnet = (b.kundeAktivitet || []).find(a => a.handling === 'aapnet')
                  if (!aapnet) return null
                  const tid = aapnet.sistTidspunkt || aapnet.tidspunkt
                  if (!tid) return null
                  const d = new Date(tid)
                  const today = new Date().toDateString()
                  const visning = d.toDateString() === today
                    ? d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) + ' i dag'
                    : d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
                  return ` — ${visning}`
                })()}
              </span>
            ) : (
              b.status === 'tilbud_sendt' && <span style={{ fontSize: 11, color: '#9ca3af' }}>👁 Ikke åpnet ennå</span>
            )}
            {(b.kundeAktivitet || []).some(a => a.handling === 'klikket-sporsmal') && (
              <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>💬 Klikket Spørsmål</span>
            )}
            {(b.kundeAktivitet || []).some(a => a.handling === 'klikket-aksepter') && (
              <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✅ Klikket Aksepter</span>
            )}
            {b.tilbudLink && (
              <a
                href={b.tilbudLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 11, color: '#2874a6', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}
              >
                🔗 Åpne kundens tilbudside ↗
              </a>
            )}
          </div>
        )}

        <div className="bef-k-datoer">
          {b.tilbudFrist && (
            <span className="bef-k-dato-rad" style={{
              color: erForsinket ? '#fff' : erIdag ? '#92400e' : fristFarge,
              background: erForsinket ? '#dc2626' : erIdag ? '#fef3c7' : 'transparent',
              padding: (erForsinket || erIdag) ? '2px 7px' : undefined,
              borderRadius: (erForsinket || erIdag) ? 5 : undefined,
              fontWeight: (erForsinket || erIdag) ? 700 : undefined,
              display: 'inline-block',
            }}>
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
            onChange={e => {
              const nyStatus = e.target.value;
              const naa = new Date().toISOString();
              dispatch({
                type: 'UPDATE_BEFARING',
                payload: {
                  ...b,
                  status: nyStatus,
                  manueltOverstyrtAv: 'manuell',
                  manueltOverstyrtDato: naa,
                  konflikt: undefined,
                },
              });
              // Logg manuell statusendring til audit-log
              fetch('/api/befaringer/audit-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  objektId: b.id,
                  felt: 'status',
                  fraVerdi: b.status,
                  tilVerdi: nyStatus,
                  endretAv: 'manuell (kanban)',
                  kilde: 'bemannings-app',
                }),
              }).catch(() => {});
            }}
          >
            {Object.entries(STATUS).map(([key, s]) => (
              <option key={key} value={key}>{s.ikon} {s.label}</option>
            ))}
          </select>
        </div>

        {/* Konflikt-banner: manuell overstyring vs. automatisk event */}
        {b.konflikt && (
          <div style={{ margin: '6px 0', padding: '8px 10px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 7 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
              ⚠️ Konflikt oppdaget!
            </div>
            <div style={{ fontSize: 11, color: '#78350f', lineHeight: 1.5 }}>
              Manuelt satt: <strong>{STATUS[b.konflikt.manuellStatus]?.label || b.konflikt.manuellStatus}</strong><br />
              Fra tilbuds-app: <strong>{STATUS[b.konflikt.inkommendStatus]?.label || b.konflikt.inkommendStatus}</strong>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button style={{ fontSize: 11, padding: '3px 8px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                onClick={() => dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, konflikt: undefined, manueltOverstyrtAv: 'manuell', manueltOverstyrtDato: new Date().toISOString() } })}>
                Behold {STATUS[b.konflikt.manuellStatus]?.ikon}
              </button>
              <button style={{ fontSize: 11, padding: '3px 8px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                onClick={() => dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, status: b.konflikt.inkommendStatus, konflikt: undefined, manueltOverstyrtAv: undefined, manueltOverstyrtDato: undefined } })}>
                Endre til {STATUS[b.konflikt.inkommendStatus]?.ikon}
              </button>
            </div>
          </div>
        )}

        {b.status === 'godkjent' && (
          <div className="bef-k-prosjekt-rad" onClick={e => e.stopPropagation()}>
            {b.prosjektId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className="bef-k-prosjekt-badge">🏗 Prosjekt opprettet</span>
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px', color: '#0891b2', borderColor: '#7dd3fc', background: '#f0f9ff' }}
                  onClick={() => dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, arkivert: true } })}
                  title="Skjul fra aktiv liste – data beholdes i arkivet"
                >
                  📦 Arkiver
                </button>
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626', borderColor: '#fca5a5', background: '#fff5f5' }}
                  onClick={() => {
                    if (!confirm('Angre prosjektoppretting? Dette sletter prosjektet (og tilknyttede tildelinger) og sender befaringen tilbake til "Godkjent".')) return;
                    dispatch({ type: 'DELETE_PROSJEKT', id: b.prosjektId });
                    dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, prosjektId: undefined } });
                  }}
                >
                  ↩ Angre
                </button>
              </div>
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
          {isAdmin && (
            <button
              onClick={() => dedupPanel ? setDedupPanel(null) : kjorDedup(true)}
              title="Finn og rydd opp duplikate befaringer"
              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 13, color: '#475569' }}
            >
              🔧 Dedup
            </button>
          )}
        </div>
      </div>

      {/* Admin: dedup-panel */}
      {isAdmin && dedupPanel && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', margin: '0 0 12px 0', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ color: '#1e293b' }}>🔧 Dedup befaringer</strong>
            <button onClick={() => setDedupPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8' }}>✕</button>
          </div>

          {dedupPanel.loading && <div style={{ color: '#64748b' }}>⏳ Henter duplikater...</div>}

          {dedupPanel.error && <div style={{ color: '#dc2626' }}>⚠️ Feil: {dedupPanel.error}</div>}

          {!dedupPanel.loading && !dedupPanel.error && dedupPanel.funnetDuplikater === 0 && (
            <div style={{ color: '#16a34a' }}>✅ Ingen duplikater funnet</div>
          )}

          {!dedupPanel.loading && !dedupPanel.error && dedupPanel.duplikatGrupper > 0 && (
            <>
              <div style={{ color: '#1e293b', marginBottom: 8 }}>
                Funnet <strong>{dedupPanel.duplikatGrupper}</strong> duplikatgrupper
                → vil slette <strong>{dedupPanel.skalSlettes}</strong> befaringer
                (beholder {dedupPanel.gjenværendeEtter})
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                {(dedupPanel.plan || []).map((g, i) => (
                  <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < dedupPanel.plan.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ fontWeight: 600 }}>Beholder: {g.behold.adresse} — {g.behold.kontaktNavn}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>id: {g.behold.id} · {g.behold.dato} · {g.behold.status}</div>
                    {g.slett.map(s => (
                      <div key={s.id} style={{ color: '#dc2626', fontSize: 12, paddingLeft: 10 }}>
                        🗑 {s.id} · {s.dato} · {s.status}{s.kilde ? ` (${s.kilde})` : ''}
                      </div>
                    ))}
                    {g.mergeTilbudId && <div style={{ color: '#0891b2', fontSize: 12, paddingLeft: 10 }}>→ Overfører tilbudId {g.mergeTilbudId} til keeper</div>}
                  </div>
                ))}
              </div>
              {dedupPanel.dry !== false && (
                <button
                  onClick={() => {
                    if (!window.confirm(`Slette ${dedupPanel.skalSlettes} duplikate befaringer?\nDette kan ikke angres (men snapshots tas).`)) return;
                    kjorDedup(false);
                  }}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
                >
                  🗑 Slett {dedupPanel.skalSlettes} duplikater
                </button>
              )}
              {dedupPanel.dry === false && (
                <div style={{ color: '#16a34a', fontWeight: 600 }}>✅ Slettet {dedupPanel.slettet} duplikater · {dedupPanel.gjenværende} befaringer igjen</div>
              )}
            </>
          )}
        </div>
      )}

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

      {/* Oversikt-visning: fire kolonner */}
      {viewTab === 'oversikt' && (
        <div className="bef-kanban bef-kanban--4col">
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

          {/* Tilbud sendt */}
          <div className="bef-kolonne">
            <div className="bef-kolonne-header" style={{ borderColor: STATUS.tilbud_sendt.farge, color: STATUS.tilbud_sendt.farge }}>
              <span>📤 Tilbud sendt <span className="bef-kolonne-teller">{tilbudSendt.length}</span></span>
              {sumKr(tilbudSendt) && <span className="bef-kolonne-kr">{sumKr(tilbudSendt)}</span>}
            </div>
            {tilbudSendt.length === 0 && <div className="bef-tom-melding">Ingen tilbud sendt.</div>}
            {tilbudSendt.map(b => <BefKort key={b.id} b={b} />)}
          </div>

          {/* Godkjent */}
          <div className="bef-kolonne">
            <div className="bef-kolonne-header" style={{ borderColor: STATUS.godkjent.farge, color: STATUS.godkjent.farge }}>
              <span>✅ Godkjent <span className="bef-kolonne-teller">{godkjente.length}</span></span>
              {sumKr(godkjente) && <span className="bef-kolonne-kr">{sumKr(godkjente)}</span>}
            </div>
            {godkjente.length === 0 && <div className="bef-tom-melding">Ingen godkjente tilbud.</div>}
            {godkjente.map(b => <BefKort key={b.id} b={b} />)}
          </div>
        </div>
      )}

      {/* Arkiv-seksjon – vises under kanban */}
      {arkiverte.length > 0 && (
        <div className="bef-arkiv-seksjon">
          <button className="bef-arkiv-toggle" onClick={() => setVisArkiv(v => !v)}>
            📦 Arkiv <span className="bef-kolonne-teller">{arkiverte.length}</span>
            <span style={{ marginLeft: 6, fontSize: 11 }}>{visArkiv ? '▲ Skjul' : '▼ Vis'}</span>
          </button>
          {visArkiv && (
            <div className="bef-arkiv-liste">
              {arkiverte.map(b => {
                const belopVis = b.estimertBelop
                  ? new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Number(b.estimertBelop)) + ' kr'
                  : null;
                const prosjekt = b.prosjektId ? state.prosjekter.find(p => p.id === b.prosjektId) : null;
                return (
                  <div key={b.id} className="bef-arkiv-rad" onClick={() => apneRediger(b)}>
                    <span className="bef-arkiv-ikon">{STATUS[b.status]?.ikon || '📋'}</span>
                    <span className="bef-arkiv-adresse">{b.adresse}</span>
                    <span className="bef-arkiv-navn">{b.kontaktNavn}</span>
                    {prosjekt && <span className="bef-arkiv-prosjekt">🏗 {prosjekt.navn}</span>}
                    {belopVis && <span className="bef-arkiv-belop">💰 {belopVis}</span>}
                    {b.dato && <span className="bef-arkiv-dato">{datoKort(b.dato)}</span>}
                    <button
                      className="btn btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto', flexShrink: 0 }}
                      onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, arkivert: false } }); }}
                      title="Flytt tilbake til aktiv liste"
                    >
                      ↩ Gjenopprett
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
            {[...aktive]
              .filter(b => b.status !== 'tapt' && b.status !== 'godkjent')
              .sort((a, b) => a.dato.localeCompare(b.dato))
              .map(b => {
                const s = STATUS[b.status] || STATUS.planlagt;
                const ansattBefaring = b.ansvarligBefaringId ? state.ansatte.find(a => a.id === b.ansvarligBefaringId) : null;
                const ansattTilbud = b.prosjektlederId ? state.ansatte.find(a => a.id === b.prosjektlederId) : null;
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
                        {ansattBefaring && <span className="bef-kort-pl" title="Ansvarlig befaring">🏗 {ansattBefaring.navn.split(' ')[0]}</span>}
                        {ansattTilbud && ansattTilbud.id !== ansattBefaring?.id && <span className="bef-kort-pl" title="Ansvarlig tilbud">📋 {ansattTilbud.navn.split(' ')[0]}</span>}
                        {ansattTilbud && !ansattBefaring && <span className="bef-kort-pl" title="Ansvarlig tilbud">👤 {ansattTilbud.navn.split(' ')[0]}</span>}
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
              {redigerer && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4 }}>
                  {/* Fane-veksler */}
                  <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', padding: 2, borderRadius: 6 }}>
                    <button onClick={() => setModalFane('detaljer')}
                      style={{ fontSize: 12, padding: '3px 10px', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: modalFane === 'detaljer' ? 700 : 400, background: modalFane === 'detaljer' ? '#fff' : 'transparent', color: modalFane === 'detaljer' ? '#1e293b' : '#64748b' }}>
                      Detaljer
                    </button>
                    <button onClick={() => setModalFane('aktivitet')}
                      style={{ fontSize: 12, padding: '3px 10px', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: modalFane === 'aktivitet' ? 700 : 400, background: modalFane === 'aktivitet' ? '#fff' : 'transparent', color: modalFane === 'aktivitet' ? '#1e293b' : '#64748b' }}>
                      📜 Aktivitet {aktivitetLog.length > 0 ? `(${aktivitetLog.length})` : ''}
                    </button>
                  </div>
                  {/* Auto-save indikator */}
                  <span style={{ fontSize: 12, color: autoSaveSts === 'saved' ? '#16a34a' : autoSaveSts === 'saving' ? '#f59e0b' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, transition: 'color 0.3s' }}>
                    {autoSaveSts === 'saving' && <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>}
                    {autoSaveSts === 'saved' && '✓'}
                    {autoSaveSts === 'saving' ? 'Lagrer…' : autoSaveSts === 'saved' ? 'Lagret' : ''}
                  </span>
                </div>
              )}
              <button className="btn-icon" onClick={() => setVisModal(false)}>✕</button>
            </div>

            {/* Aktivitet-fane */}
            {modalFane === 'aktivitet' && redigerer && (
              <div style={{ padding: '16px 20px', maxHeight: 420, overflowY: 'auto' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>📜 Endringshistorikk</div>
                {aktivitetLaster && <div style={{ color: '#94a3b8', fontSize: 13 }}>Laster historikk…</div>}
                {!aktivitetLaster && aktivitetLog.length === 0 && (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>Ingen loggede endringer ennå.</div>
                )}
                {aktivitetLog.map((entry, i) => {
                  const dato = new Date(entry.endretDato || entry.endring?.tilDato)
                  const datoVis = dato.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={entry.id || i} style={{ display: 'flex', gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', marginTop: 5, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>📅 {datoVis}</div>
                        <div style={{ fontSize: 13, color: '#1e293b', marginTop: 2 }}>
                          <strong>{entry.endring?.felt || 'ukjent felt'}</strong>:
                          {entry.endring?.fraVerdi && <span style={{ color: '#dc2626' }}> {entry.endring.fraVerdi}</span>}
                          {entry.endring?.fraVerdi && ' → '}
                          <span style={{ color: '#16a34a' }}>{entry.endring?.tilVerdi || '–'}</span>
                        </div>
                        {entry.begrunnelse && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>💬 {entry.begrunnelse}</div>}
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Kilde: {entry.kilde || '–'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="form" style={{ display: modalFane === 'aktivitet' ? 'none' : undefined }}>

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
                    <label>Ansvarlig befaring *</label>
                    <select className="input" value={form.ansvarligBefaringId} onChange={e => setForm(f => ({ ...f, ansvarligBefaringId: e.target.value }))} style={!form.ansvarligBefaringId ? { borderColor: '#f87171' } : {}}>
                      <option value="">– Velg ansvarlig –</option>
                      {[...state.ansatte].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(a => (
                        <option key={a.id} value={a.id}>{a.navn}{a.fag ? ` (${a.fag})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Ansvarlig tilbud *</label>
                    <select className="input" value={form.prosjektlederId} onChange={e => setForm(f => ({ ...f, prosjektlederId: e.target.value }))} style={!form.prosjektlederId ? { borderColor: '#f87171' } : {}}>
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

              {/* Fra tilbuds-appen (read-only) */}
              {redigerer && (redigerer.poster?.length > 0 || redigerer.tilbudLink || redigerer.estimertSum > 0 || redigerer.fag?.length > 0) && (
                <div className="bef-modal-seksjon" style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px' }}>
                  <div className="bef-modal-seksjon-tittel" style={{ color: '#16a34a', marginBottom: 8 }}>📄 Fra tilbuds-appen</div>
                  <div style={{ fontSize: 13, display: 'grid', gap: 5 }}>
                    {redigerer.estimertSum > 0 && (
                      <div>
                        💰 <strong>{fmtKr(redigerer.estimertSum)}</strong>
                        {redigerer.pristype && <span style={{ marginLeft: 8, color: '#64748b' }}>({redigerer.pristype})</span>}
                      </div>
                    )}
                    {Array.isArray(redigerer.fag) && redigerer.fag.length > 0 && (
                      <div>🔨 Fag: <strong>{redigerer.fag.join(', ')}</strong></div>
                    )}
                    {redigerer.varighetTekst && <div>⏱ Varighet: {redigerer.varighetTekst}</div>}
                    {redigerer.oppstartTekst && <div>🚀 Oppstart: {redigerer.oppstartTekst}</div>}
                    {Array.isArray(redigerer.poster) && redigerer.poster.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontWeight: 600, marginBottom: 3, color: '#374151' }}>Tilbudsposter ({redigerer.poster.length}):</div>
                        {redigerer.poster.slice(0, 6).map((p, i) => (
                          <div key={i} style={{ paddingLeft: 8, color: '#374151', fontSize: 12, lineHeight: '1.6' }}>
                            • {p.navn || p.beskrivelse || `Post ${i + 1}`}
                            {p.kalkyle?.totalPris > 0 && <span style={{ color: '#64748b' }}> — {fmtKr(p.kalkyle.totalPris)}</span>}
                          </div>
                        ))}
                        {redigerer.poster.length > 6 && (
                          <div style={{ paddingLeft: 8, color: '#94a3b8', fontSize: 12 }}>… og {redigerer.poster.length - 6} til</div>
                        )}
                      </div>
                    )}
                    {redigerer.tilbudLink && (
                      <a href={redigerer.tilbudLink} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#2563eb', fontSize: 12, textDecoration: 'none', marginTop: 2 }}>
                        🔗 Åpne tilbud →
                      </a>
                    )}
                    {/* Utvidede felt fra tilbudPayload (byggInfo, soner, totalSum osv.) */}
                    {redigerer.tilbudPayload && (() => {
                      const p = redigerer.tilbudPayload;
                      return (
                        <>
                          {p.totalSum != null && p.totalSum > 0 && (
                            <div>💰 Akseptert sum: <strong>{fmtKr(p.totalSum)}</strong></div>
                          )}
                          {p.byggInfo && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ fontWeight: 600 }}>🏗 Byggeinfo:</span>
                              <div style={{ paddingLeft: 8, color: '#374151', fontSize: 12, whiteSpace: 'pre-wrap' }}>{p.byggInfo}</div>
                            </div>
                          )}
                          {Array.isArray(p.soner) && p.soner.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ fontWeight: 600 }}>📍 Soner ({p.soner.length}):</span>
                              {p.soner.map((s, i) => (
                                <div key={i} style={{ paddingLeft: 8, color: '#374151', fontSize: 12 }}>
                                  • {s.navn || s.name || `Sone ${i + 1}`}{s.areal ? ` — ${s.areal} m²` : ''}
                                </div>
                              ))}
                            </div>
                          )}
                          {p.kundeKommentar && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ fontWeight: 600 }}>💬 Kundekommentar:</span>
                              <div style={{ paddingLeft: 8, color: '#374151', fontSize: 12, fontStyle: 'italic' }}>"{p.kundeKommentar}"</div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

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
                {redigerer ? (
                  // Edit-modus: alt lagres automatisk, knappen lukker bare modalen
                  <button className="btn btn-primary" onClick={() => {
                    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
                    dispatch({ type: 'UPDATE_BEFARING', payload: { ...form, id: redigerer.id } });
                    setVisModal(false);
                  }}>
                    Lukk
                  </button>
                ) : (
                  // Ny befaring: opprett og bytt til edit-modus
                  <button className="btn btn-primary" onClick={lagre} disabled={!form.kontaktNavn.trim() || !form.adresse.trim() || !form.ansvarligBefaringId || !form.prosjektlederId}>
                    Opprett befaring
                  </button>
                )}
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
                  <div className="bef-modal-seksjon-tittel">Ansvarlig tilbud</div>
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
