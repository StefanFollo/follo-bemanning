import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { StatusFaner } from '../komponenter/Designsystem';
import { dateToIso } from '../store';
import ServiceReklKalender from '../components/ServiceReklKalender';
import { SERV_STATUS } from '../statuses';
import {
  CalendarDays, Hammer, Clock, Rocket, MessageSquare, Archive, Undo2,
  Zap, Pencil, X, ClipboardList, Printer,
} from 'lucide-react';
import { Ikon } from '../komponenter/Ikon';

const SERV_TYPER = [
  'Diverse', 'Tømrer', 'Maling', 'Rørlegger', 'Flislegging',
  'Elektro', 'Fasade / Tak', 'Bad', 'Dør / Vindu', 'Grunnmur', 'Annet',
];

const PL_FARGER = ['#2563eb','#15803d','#9333ea','#ea580c','#0891b2','#be185d','#854d0e','#0f766e'];

function datoKort(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: '2-digit' });
}
function dagerTil(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso + 'T00:00:00') - new Date()) / 86400000);
}

function tomForm() {
  return {
    adresse: '',
    kontaktNavn: '',
    telefon: '',
    epost: '',
    type: 'Diverse',
    beskrivelse: '',
    dato: dateToIso(new Date()),
    oensketDato: '',
    planlagtDato: '',
    ansvarligId: '',
    estimertTimer: '',
    belop: '',
    status: 'ny',
    kommentar: '',
  };
}

export default function Service() {
  const { state, dispatch } = useApp();
  const serviceJobber = useMemo(() => (state.serviceJobber || []).filter(j => !j.arkivert), [state.serviceJobber]);
  const arkiverte = useMemo(
    () => (state.serviceJobber || []).filter(j => j.arkivert).sort((a, b) => (b.dato || '').localeCompare(a.dato || '')),
    [state.serviceJobber]
  );
  const [visArkiv, setVisArkiv] = useState(false);
  const today = dateToIso(new Date());

  const [visModal, setVisModal] = useState(false);
  const [redigerer, setRedigerer] = useState(null);
  const [form, setForm] = useState(tomForm());
  const [statusFilter, setStatusFilter] = useState(null);
  const [sok, setSok] = useState('');
  const [visning, setVisning] = useState('liste'); // 'liste' | 'kalender'

  function ansattFarge(id) {
    if (!id) return null;
    const idx = state.ansatte.findIndex(a => a.id === id);
    return PL_FARGER[idx >= 0 ? idx % PL_FARGER.length : 0];
  }

  function apneNy(presetStatus) {
    setForm({ ...tomForm(), ...(presetStatus ? { status: presetStatus } : {}) });
    setRedigerer(null);
    setVisModal(true);
  }
  function apneRediger(j) {
    setForm({ ...tomForm(), ...j });
    setRedigerer(j);
    setVisModal(true);
  }
  function lagre() {
    if (!form.adresse.trim()) return;
    if (redigerer) {
      dispatch({ type: 'UPDATE_SERVICE_JOBB', payload: { ...form, id: redigerer.id } });
    } else {
      dispatch({ type: 'ADD_SERVICE_JOBB', payload: form });
    }
    setVisModal(false);
  }
  function slett() {
    if (redigerer && window.confirm('Slett denne service-jobben?')) {
      dispatch({ type: 'DELETE_SERVICE_JOBB', id: redigerer.id });
      setVisModal(false);
    }
  }

  function printPDF(j) {
    const ansatt = j.ansvarligId ? state.ansatte.find(a => a.id === j.ansvarligId) : null;
    const ansattNavn = ansatt ? ansatt.navn : '–';
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Service-ordre – ${j.adresse}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:28px}
        .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #185FA5;padding-bottom:10px;margin-bottom:18px}
        .logo{font-size:22px;font-weight:700;color:#185FA5}
        .sub{font-size:11px;color:#666;margin-top:2px}
        .tittel{font-size:16px;font-weight:700;text-align:right}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-bottom:16px}
        .full{grid-column:1/-1}
        .felt{border-bottom:1px solid #e5e7eb;padding-bottom:5px}
        .lbl{font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
        .val{font-size:13px;font-weight:500;min-height:17px}
        .besk{background:#f9f9f9;border:1px solid #e0e0e0;border-radius:4px;padding:10px 12px;min-height:64px;font-size:13px;line-height:1.6;white-space:pre-wrap;margin-bottom:16px}
        .avkr{display:flex;gap:28px;margin-top:16px}
        .avkr-item{display:flex;align-items:center;gap:8px;font-size:13px}
        .cb{width:16px;height:16px;border:1.5px solid #555;display:inline-block;flex-shrink:0;border-radius:2px}
        .sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px;padding-top:14px;border-top:1px solid #ccc}
        .sign-linje{border-bottom:1px solid #888;height:34px}
        .sign-lbl{font-size:10px;color:#999;margin-top:4px}
        @media print{body{padding:10px}}
      </style>
    </head><body>
      <div class="hdr">
        <div>
          <div class="logo">FolloByggService</div>
          <div class="sub">Bemannings- og serviceplanlegger</div>
        </div>
        <div>
          <div class="tittel">SERVICE-ORDRE</div>
          <div class="sub" style="text-align:right">Utskrift: ${new Date().toLocaleDateString('nb-NO')}</div>
        </div>
      </div>

      <div class="grid">
        <div class="felt full">
          <div class="lbl">Adresse / Sted</div>
          <div class="val" style="font-size:16px">${j.adresse || '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Kontaktperson</div>
          <div class="val">${j.kontaktNavn || '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Telefon</div>
          <div class="val">${j.telefon || '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">E-post</div>
          <div class="val">${j.epost || '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Type jobb</div>
          <div class="val">${j.type || '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Dato innmeldt</div>
          <div class="val">${j.dato ? new Date(j.dato + 'T00:00:00').toLocaleDateString('nb-NO') : '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Ønsket dato</div>
          <div class="val">${j.oensketDato ? new Date(j.oensketDato + 'T00:00:00').toLocaleDateString('nb-NO') : '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Ansvarlig</div>
          <div class="val">${ansattNavn}</div>
        </div>
        <div class="felt">
          <div class="lbl">Estimert tid</div>
          <div class="val">${j.estimertTimer ? j.estimertTimer + ' timer' : '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Pris</div>
          <div class="val">${j.belop ? new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(j.belop)) : '–'}</div>
        </div>
      </div>

      <div class="lbl" style="margin-bottom:5px">Beskrivelse av jobb</div>
      <div class="besk">${j.beskrivelse || '(Ingen beskrivelse)'}</div>

      ${j.kommentar ? `<div class="lbl" style="margin-bottom:5px">Kommentar / Notat</div><div class="besk">${j.kommentar}</div>` : ''}

      <div class="avkr">
        <div class="avkr-item"><div class="cb"></div> Jobb fullført</div>
        <div class="avkr-item"><div class="cb"></div> Materiell brukt notert</div>
        <div class="avkr-item"><div class="cb"></div> Kunde informert</div>
      </div>

      <div class="sign">
        <div>
          <div class="sign-linje"></div>
          <div class="sign-lbl">Utført av (signatur)</div>
        </div>
        <div>
          <div class="sign-linje"></div>
          <div class="sign-lbl">Dato</div>
        </div>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  const teller = useMemo(() => Object.fromEntries(
    Object.keys(SERV_STATUS).map(s => [s, serviceJobber.filter(j => j.status === s).length])
  ), [serviceJobber]);

  const filtrert = useMemo(() => serviceJobber
    .filter(j => !statusFilter || j.status === statusFilter)
    .filter(j => {
      if (!sok.trim()) return true;
      const q = sok.toLowerCase();
      return (
        j.adresse?.toLowerCase().includes(q) ||
        j.kontaktNavn?.toLowerCase().includes(q) ||
        j.beskrivelse?.toLowerCase().includes(q) ||
        j.type?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.oensketDato && b.oensketDato) return a.oensketDato.localeCompare(b.oensketDato);
      if (a.oensketDato) return -1;
      if (b.oensketDato) return 1;
      return b.dato.localeCompare(a.dato);
    }), [serviceJobber, statusFilter, sok]);

  const { nyeJobber, planlagteJobber, underArbeid, ferdige, fakturerte } = useMemo(() => ({
    nyeJobber:       filtrert.filter(j => j.status === 'ny'),
    planlagteJobber: filtrert.filter(j => j.status === 'planlagt'),
    underArbeid:     filtrert.filter(j => j.status === 'under_arbeid'),
    ferdige:         filtrert.filter(j => j.status === 'ferdig'),
    fakturerte:      filtrert.filter(j => j.status === 'fakturert'),
  }), [filtrert]);

  function sumKr(arr) {
    const total = arr.reduce((s, j) => s + (Number(j.belop) || 0), 0);
    return total > 0
      ? new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(total) + ' kr'
      : null;
  }

  function ServKort({ j }) {
    const s = SERV_STATUS[j.status] || SERV_STATUS.ny;
    const ansatt = j.ansvarligId ? state.ansatte.find(a => a.id === j.ansvarligId) : null;
    const fristDager = dagerTil(j.oensketDato);
    const fristFarge = fristDager !== null
      ? (fristDager < 0 ? '#dc2626' : fristDager <= 3 ? '#b45309' : '#15803d')
      : null;

    return (
      <div className="rekl-kort" onClick={() => apneRediger(j)}>
        <div className="rekl-kort-topp">
          <div className="rekl-kort-tittel">
            <div className="rekl-kort-adresse">{j.adresse}</div>
            {j.kontaktNavn && <div className="rekl-kort-kontakt">{j.kontaktNavn}</div>}
          </div>
          <span className="rekl-status-pill" style={{ background: s.bg, color: s.farge, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Ikon ikon={s.ikon} size={13} /> {s.label}
          </span>
        </div>

        <div className="rekl-chips">
          <span className="rekl-chip rekl-chip--type">{j.type}</span>
          <span className="rekl-chip rekl-chip--dato"><Ikon ikon={CalendarDays} size={12} /> {datoKort(j.dato)}</span>
          {ansatt && (
            <span className="rekl-chip" style={{ background: ansattFarge(j.ansvarligId) + '22', color: ansattFarge(j.ansvarligId) }}>
              <Ikon ikon={Hammer} size={12} /> {ansatt.navn.split(' ')[0]}
            </span>
          )}
          {j.estimertTimer && (
            <span className="rekl-chip"><Ikon ikon={Clock} size={12} /> {j.estimertTimer}t</span>
          )}
          {j.belop && (
            <span className="rekl-chip rekl-chip--kostnad">
              {new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(j.belop))}
            </span>
          )}
        </div>

        {j.beskrivelse && (
          <div className="rekl-beskrivelse">
            {j.beskrivelse.length > 80 ? j.beskrivelse.slice(0, 80) + '…' : j.beskrivelse}
          </div>
        )}

        <div className="rekl-bunntekst">
          {j.oensketDato && (
            <span style={{ color: fristFarge || '#0891b2', fontSize: 12, fontWeight: 500 }}>
              <Ikon ikon={Rocket} size={12} /> Ønsket dato: {datoKort(j.oensketDato)}
              {fristDager !== null && j.status !== 'ferdig' && j.status !== 'fakturert' && (
                <em> ({fristDager < 0 ? `${Math.abs(fristDager)}d over` : fristDager === 0 ? 'i dag' : `${fristDager}d`})</em>
              )}
            </span>
          )}
          {j.kommentar && (
            <span className="rekl-kommentar">
              <Ikon ikon={MessageSquare} size={12} /> {j.kommentar.length > 50 ? j.kommentar.slice(0, 50) + '…' : j.kommentar}
            </span>
          )}
        </div>

        {/* Manuell arkivering av ferdige/fakturerte jobber */}
        {(j.status === 'ferdig' || j.status === 'fakturert') && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 6 }}>
            <button
              className="btn btn-sm"
              style={{ fontSize: 11, padding: '3px 10px', color: '#0891b2', borderColor: '#7dd3fc', background: '#f0f9ff' }}
              onClick={() => dispatch({ type: 'UPDATE_SERVICE_JOBB', payload: { ...j, arkivert: true } })}
              title="Flytt til arkivet — data beholdes og kan gjenopprettes"
            >
              <Ikon ikon={Archive} size={12} /> Arkiver
            </button>
          </div>
        )}

        {/* Rask status-bytte */}
        <div className="bef-k-status-bytte" onClick={e => e.stopPropagation()}>
          <select
            className="bef-k-status-select"
            value={j.status}
            onChange={e => dispatch({ type: 'UPDATE_SERVICE_JOBB', payload: { ...j, status: e.target.value } })}
          >
            {Object.entries(SERV_STATUS).map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="bef-side">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Ikon ikon={Zap} size={18} /> Service</h2>
          <div style={{ fontSize: 13, color: '#5d6b80', marginTop: 2 }}>Små jobber under 1 uke</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="bef-view-tabs">
            <button className={`bef-view-tab${visning === 'liste' ? ' aktiv' : ''}`} onClick={() => setVisning('liste')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={ClipboardList} size={14} /> Liste</button>
            <button className={`bef-view-tab${visning === 'kalender' ? ' aktiv' : ''}`} onClick={() => setVisning('kalender')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={CalendarDays} size={14} /> Kalender</button>
          </div>
          <input
            className="input"
            style={{ width: 200, height: 36 }}
            placeholder="Søk adresse, type..."
            value={sok}
            onChange={e => setSok(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => apneNy()}>+ Ny service-jobb</button>
        </div>
      </div>

      {visning === 'kalender' && <ServiceReklKalender />}

      {visning === 'liste' && <>
      {/* Kompakt status-fane-linje (Stefans småfix 15.08) */}
      <StatusFaner
        faner={Object.entries(SERV_STATUS).map(([key, s]) => ({
          key, label: s.label, ikon: <Ikon ikon={s.ikon} size={14} />, farge: s.farge, teller: teller[key] || 0, sum: 0,
        }))}
        aktiv={statusFilter}
        onVelg={key => setStatusFilter(f => f === key ? null : key)}
      />
      {statusFilter && (
        <div className="bef-filter-banner">
          Viser kun: <strong>{SERV_STATUS[statusFilter]?.label}</strong>
          <button className="bef-filter-fjern" onClick={() => setStatusFilter(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Ikon ikon={X} size={12} /> Fjern filter</button>
        </div>
      )}

      {/* Kanban: 5 kolonner */}
      <div className="bef-kanban bef-kanban--5col">
        {/* Ny */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: SERV_STATUS.ny.farge, color: SERV_STATUS.ny.farge }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={SERV_STATUS.ny.ikon} size={15} /> Ny <span className="bef-kolonne-teller">{nyeJobber.length}</span></span>
            {sumKr(nyeJobber) && <span className="bef-kolonne-kr">{sumKr(nyeJobber)}</span>}
          </div>
          {nyeJobber.length === 0 && <div className="bef-tom-melding">Ingen nye jobber.</div>}
          {nyeJobber.map(j => <ServKort key={j.id} j={j} />)}
          <button className="bef-legg-til-btn" onClick={() => apneNy('ny')}>+ Legg til jobb</button>
        </div>

        {/* Planlagt */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: SERV_STATUS.planlagt.farge, color: SERV_STATUS.planlagt.farge }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={SERV_STATUS.planlagt.ikon} size={15} /> Planlagt <span className="bef-kolonne-teller">{planlagteJobber.length}</span></span>
            {sumKr(planlagteJobber) && <span className="bef-kolonne-kr">{sumKr(planlagteJobber)}</span>}
          </div>
          {planlagteJobber.length === 0 && <div className="bef-tom-melding">Ingen planlagte jobber.</div>}
          {planlagteJobber.map(j => <ServKort key={j.id} j={j} />)}
        </div>

        {/* Under arbeid */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: SERV_STATUS.under_arbeid.farge, color: SERV_STATUS.under_arbeid.farge }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={SERV_STATUS.under_arbeid.ikon} size={15} /> Under arbeid <span className="bef-kolonne-teller">{underArbeid.length}</span></span>
            {sumKr(underArbeid) && <span className="bef-kolonne-kr">{sumKr(underArbeid)}</span>}
          </div>
          {underArbeid.length === 0 && <div className="bef-tom-melding">Ingen jobber under arbeid.</div>}
          {underArbeid.map(j => <ServKort key={j.id} j={j} />)}
        </div>

        {/* Ferdig – ikke fakturert */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: SERV_STATUS.ferdig.farge, color: SERV_STATUS.ferdig.farge }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={SERV_STATUS.ferdig.ikon} size={15} /> Ferdig <span className="bef-kolonne-teller">{ferdige.length}</span></span>
            {sumKr(ferdige) && <span className="bef-kolonne-kr">{sumKr(ferdige)}</span>}
          </div>
          {ferdige.length === 0 && <div className="bef-tom-melding">Ingen ferdige jobber.</div>}
          {ferdige.map(j => <ServKort key={j.id} j={j} />)}
        </div>

        {/* Fakturert */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: SERV_STATUS.fakturert.farge, color: SERV_STATUS.fakturert.farge }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={SERV_STATUS.fakturert.ikon} size={15} /> Fakturert <span className="bef-kolonne-teller">{fakturerte.length}</span></span>
            {sumKr(fakturerte) && <span className="bef-kolonne-kr">{sumKr(fakturerte)}</span>}
          </div>
          {fakturerte.length === 0 && <div className="bef-tom-melding">Ingen fakturerte jobber.</div>}
          {fakturerte.map(j => <ServKort key={j.id} j={j} />)}
        </div>
      </div>

      {/* Arkiv — manuelt arkiverte jobber */}
      {arkiverte.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button className="bef-arkiv-toggle" onClick={() => setVisArkiv(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Ikon ikon={Archive} size={15} /> Arkiv <span className="bef-kolonne-teller">{arkiverte.length}</span>
            <span style={{ marginLeft: 6, fontSize: 11 }}>{visArkiv ? '▲ Skjul' : '▼ Vis'}</span>
          </button>
          {visArkiv && (
            <div className="bef-arkiv-liste">
              {arkiverte.map(j => (
                <div key={j.id} className="bef-arkiv-rad" onClick={() => apneRediger(j)}>
                  <span className="bef-arkiv-ikon"><Ikon ikon={(SERV_STATUS[j.status] || SERV_STATUS.ny).ikon} size={14} /></span>
                  <span className="bef-arkiv-adresse">{j.adresse}</span>
                  <span className="bef-arkiv-navn">{j.kontaktNavn}</span>
                  {j.dato && <span className="bef-arkiv-dato">{datoKort(j.dato)}</span>}
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto', flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_SERVICE_JOBB', payload: { ...j, arkivert: false } }); }}
                    title="Flytt tilbake til aktiv liste"
                  >
                    <Ikon ikon={Undo2} size={12} /> Gjenopprett
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </>}

      {/* Modal */}
      {visModal && (
        <div className="modal-backdrop" onClick={() => setVisModal(false)}>
          <div className="modal bef-modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{redigerer ? <><Ikon ikon={Pencil} size={16} /> Rediger service-jobb</> : <><Ikon ikon={Zap} size={16} /> Ny service-jobb</>}</h3>
              <button className="btn-icon" onClick={() => setVisModal(false)}><Ikon ikon={X} size={15} /></button>
            </div>
            <div className="form">

              {/* Grunninfo */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Grunninfo</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Adresse *</label>
                    <input className="input" value={form.adresse}
                      onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))}
                      placeholder="Adresse / sted for jobben" />
                  </div>
                  <div>
                    <label>Kontaktperson</label>
                    <input className="input" value={form.kontaktNavn}
                      onChange={e => setForm(f => ({ ...f, kontaktNavn: e.target.value }))}
                      placeholder="Kundens navn" />
                  </div>
                  <div>
                    <label>Type jobb</label>
                    <select className="input" value={form.type}
                      onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                      {SERV_TYPER.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Telefon</label>
                    <input className="input" value={form.telefon || ''}
                      onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))}
                      placeholder="Kundens telefon" />
                  </div>
                  <div>
                    <label>E-post</label>
                    <input className="input" value={form.epost || ''}
                      onChange={e => setForm(f => ({ ...f, epost: e.target.value }))}
                      placeholder="Kundens e-post" />
                  </div>
                </div>
              </div>

              {/* Planlegging */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Planlegging</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label>Dato innmeldt</label>
                    <input type="date" className="input" value={form.dato}
                      onChange={e => setForm(f => ({ ...f, dato: e.target.value }))} />
                  </div>
                  <div>
                    <label>Ønsket dato</label>
                    <input type="date" className="input" value={form.oensketDato || ''}
                      onChange={e => setForm(f => ({ ...f, oensketDato: e.target.value }))} />
                  </div>
                  <div>
                    <label>Planlagt utført (kalender)</label>
                    <input type="date" className="input" value={form.planlagtDato || ''}
                      onChange={e => setForm(f => ({ ...f, planlagtDato: e.target.value }))}
                      title="Når skal jobben tas — vises i den delte kalenderen" />
                  </div>
                  <div>
                    <label>Ansvarlig</label>
                    <select className="input" value={form.ansvarligId}
                      onChange={e => setForm(f => ({ ...f, ansvarligId: e.target.value }))}>
                      <option value="">– Velg ansvarlig –</option>
                      {[...state.ansatte].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(a => (
                        <option key={a.id} value={a.id}>{a.navn}{a.fag ? ` (${a.fag})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Estimert tid (timer)</label>
                    <input className="input" type="number" min="0.5" step="0.5"
                      value={form.estimertTimer || ''}
                      onChange={e => setForm(f => ({ ...f, estimertTimer: e.target.value }))}
                      placeholder="f.eks. 4" />
                  </div>
                  <div>
                    <label>Pris (kr)</label>
                    <input className="input" type="number" min="0" step="500"
                      value={form.belop || ''}
                      onChange={e => setForm(f => ({ ...f, belop: e.target.value }))}
                      placeholder="f.eks. 3500" />
                  </div>
                </div>
              </div>

              {/* Beskrivelse */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Beskrivelse</div>
                <textarea className="input" rows={3} value={form.beskrivelse}
                  onChange={e => setForm(f => ({ ...f, beskrivelse: e.target.value }))}
                  placeholder="Hva skal gjøres? Beskriv jobben kort..." />
              </div>

              {/* Status */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Status</div>
                <div className="bef-status-velger">
                  {Object.entries(SERV_STATUS).map(([key, s]) => (
                    <button key={key} type="button"
                      className={`bef-status-btn${form.status === key ? ' aktiv' : ''}`}
                      style={form.status === key
                        ? { background: s.farge, color: '#fff', borderColor: s.farge }
                        : { borderColor: s.farge, color: s.farge }}
                      onClick={() => setForm(f => ({ ...f, status: key }))}>
                      <Ikon ikon={s.ikon} size={14} /> {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kommentar */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Kommentar / Notat</div>
                <textarea className="input" rows={2} value={form.kommentar}
                  onChange={e => setForm(f => ({ ...f, kommentar: e.target.value }))}
                  placeholder="Intern merknad, tilgang, nøkkel, parkering..." />
              </div>

              <div className="modal-actions">
                {redigerer && <button className="btn btn-danger" onClick={slett}>Slett</button>}
                {redigerer && (
                  <button className="btn" onClick={() => printPDF(redigerer)} title="Skriv ut / lagre som PDF" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Ikon ikon={Printer} size={15} /> PDF
                  </button>
                )}
                <button className="btn" onClick={() => setVisModal(false)}>Avbryt</button>
                <button className="btn btn-primary" onClick={lagre} disabled={!form.adresse.trim()}>
                  Lagre
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
