import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { StatusFaner } from '../komponenter/Designsystem';
import { dateToIso } from '../store';
import ServiceReklKalender from '../components/ServiceReklKalender';
import { REKL_STATUS } from '../statuses';
import {
  CalendarDays, PhoneCall, Hammer, Clock, MessageSquare, Archive, Undo2,
  X, ClipboardList, Printer,
} from 'lucide-react';
import { Ikon } from '../komponenter/Ikon';

const REKL_TYPER = [
  'Tømrer', 'Maling', 'Rørlegger', 'Flislegging', 'Elektro',
  'Fasade / Tak', 'Bad', 'Dør / Vindu', 'Grunnmur', 'Annet',
];

const FAG_COLORS = {
  'Bas Tømrer': '#b45309', 'Montør': '#3b82f6', 'Lærling Tømrer': '#15803d',
  'Maler': '#ec4899', 'Rørlegger': '#0e7490', 'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316', 'Prosjektleder': '#0ea5e9',
};
function fagColor(fag) { return FAG_COLORS[fag] || '#6b7280'; }

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
    prosjektId: '',
    adresse: '',
    kontaktNavn: '',
    telefon: '',
    epost: '',
    type: 'Tømrer',
    beskrivelse: '',
    dato: dateToIso(new Date()),
    frist: '',
    planlagtDato: '',
    status: 'ny',
    ansvarligId: '',
    kommentar: '',
    kostnad: '',
  };
}

export default function Reklamasjon() {
  const { state, dispatch } = useApp();
  const reklamasjoner = useMemo(() => (state.reklamasjoner || []).filter(r => !r.arkivert), [state.reklamasjoner]);
  const arkiverte = useMemo(
    () => (state.reklamasjoner || []).filter(r => r.arkivert).sort((a, b) => (b.dato || '').localeCompare(a.dato || '')),
    [state.reklamasjoner]
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
  function apneRediger(r) {
    setForm({ ...tomForm(), ...r });
    setRedigerer(r);
    setVisModal(true);
  }
  function lagre() {
    if (!form.adresse.trim() && !form.prosjektId) return;
    if (redigerer) {
      dispatch({ type: 'UPDATE_REKLAMASJON', payload: { ...form, id: redigerer.id } });
    } else {
      dispatch({ type: 'ADD_REKLAMASJON', payload: form });
    }
    setVisModal(false);
  }
  function slett() {
    if (redigerer && window.confirm('Slett denne reklamasjonen?')) {
      dispatch({ type: 'DELETE_REKLAMASJON', id: redigerer.id });
      setVisModal(false);
    }
  }

  function printPDF(r) {
    const ansatt = r.ansvarligId ? state.ansatte.find(a => a.id === r.ansvarligId) : null;
    const prosjekt = r.prosjektId ? state.prosjekter.find(p => p.id === r.prosjektId) : null;
    const tittel = prosjekt ? prosjekt.navn : (r.adresse || '–');
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Reklamasjon – ${tittel}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:28px}
        .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #dc2626;padding-bottom:10px;margin-bottom:18px}
        .logo{font-size:22px;font-weight:700;color:#dc2626}
        .sub{font-size:11px;color:#666;margin-top:2px}
        .tittel{font-size:16px;font-weight:700;text-align:right;color:#dc2626}
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
          <div class="sub">Reklamasjonshåndtering</div>
        </div>
        <div>
          <div class="tittel">REKLAMASJON</div>
          <div class="sub" style="text-align:right">Utskrift: ${new Date().toLocaleDateString('nb-NO')}</div>
        </div>
      </div>

      <div class="grid">
        <div class="felt full">
          <div class="lbl">Prosjekt / Adresse</div>
          <div class="val" style="font-size:16px">${tittel}</div>
        </div>
        <div class="felt">
          <div class="lbl">Kontaktperson (klager)</div>
          <div class="val">${r.kontaktNavn || '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Telefon</div>
          <div class="val">${r.telefon || '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">E-post</div>
          <div class="val">${r.epost || '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Type reklamasjon</div>
          <div class="val">${r.type || '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Dato meldt inn</div>
          <div class="val">${r.dato ? new Date(r.dato + 'T00:00:00').toLocaleDateString('nb-NO') : '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Frist for utbedring</div>
          <div class="val">${r.frist ? new Date(r.frist + 'T00:00:00').toLocaleDateString('nb-NO') : '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Ansvarlig for utbedring</div>
          <div class="val">${ansatt ? ansatt.navn : '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Status</div>
          <div class="val">${r.status ? { ny: 'Ny', under_arbeid: 'Under utbedring', utbedret: 'Utbedret', avvist: 'Avvist', lukket: 'Lukket' }[r.status] || r.status : '–'}</div>
        </div>
        <div class="felt">
          <div class="lbl">Kostnad for utbedring</div>
          <div class="val">${r.kostnad ? new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(r.kostnad)) : '–'}</div>
        </div>
      </div>

      <div class="lbl" style="margin-bottom:5px">Beskrivelse / Hva kunden klager på</div>
      <div class="besk">${r.beskrivelse || '(Ingen beskrivelse)'}</div>

      ${r.kommentar ? `<div class="lbl" style="margin-bottom:5px">Kommentar / Hva er gjort</div><div class="besk">${r.kommentar}</div>` : ''}

      <div class="avkr">
        <div class="avkr-item"><div class="cb"></div> Utbedret</div>
        <div class="avkr-item"><div class="cb"></div> Kunde godkjent</div>
        <div class="avkr-item"><div class="cb"></div> Dokumentert med foto</div>
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

  // Teller per status
  const teller = useMemo(() => Object.fromEntries(
    Object.keys(REKL_STATUS).map(s => [s, reklamasjoner.filter(r => r.status === s).length])
  ), [reklamasjoner]);

  // Filtrert og søkt liste
  const filtrert = useMemo(() => reklamasjoner
    .filter(r => !statusFilter || r.status === statusFilter)
    .filter(r => {
      if (!sok.trim()) return true;
      const q = sok.toLowerCase();
      return (
        r.adresse?.toLowerCase().includes(q) ||
        r.kontaktNavn?.toLowerCase().includes(q) ||
        r.beskrivelse?.toLowerCase().includes(q) ||
        r.type?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.frist && b.frist) return a.frist.localeCompare(b.frist);
      if (a.frist) return -1;
      if (b.frist) return 1;
      return b.dato.localeCompare(a.dato);
    }), [reklamasjoner, statusFilter, sok]);

  const { nyeRekl, planlagteRekl, underArbeid, utbedredeRekl } = useMemo(() => ({
    nyeRekl:        filtrert.filter(r => r.status === 'ny'),
    planlagteRekl:  filtrert.filter(r => r.status === 'planlagt'),
    underArbeid:    filtrert.filter(r => r.status === 'under_arbeid'),
    utbedredeRekl:  filtrert.filter(r => r.status === 'utbedret' || r.status === 'avvist' || r.status === 'lukket'),
  }), [filtrert]);

  function sumKr(arr) {
    const total = arr.reduce((s, r) => s + (Number(r.kostnad) || 0), 0);
    return total > 0 ? new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(total) + ' kr' : null;
  }

  function ReklKort({ r }) {
    const s = REKL_STATUS[r.status] || REKL_STATUS.ny;
    const ansatt = r.ansvarligId ? state.ansatte.find(a => a.id === r.ansvarligId) : null;
    const prosjekt = r.prosjektId ? state.prosjekter.find(p => p.id === r.prosjektId) : null;
    const fristDager = dagerTil(r.frist);
    const fristFarge = fristDager !== null
      ? (fristDager < 0 ? '#dc2626' : fristDager <= 5 ? '#b45309' : '#15803d')
      : null;

    return (
      <div className="rekl-kort" onClick={() => apneRediger(r)}>
        <div className="rekl-kort-topp">
          <div className="rekl-kort-tittel">
            <div className="rekl-kort-adresse">{prosjekt ? prosjekt.navn : r.adresse}</div>
            {r.kontaktNavn && <div className="rekl-kort-kontakt">{r.kontaktNavn}</div>}
          </div>
          <span className="rekl-status-pill" style={{ background: s.bg, color: s.farge, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Ikon ikon={s.ikon} size={13} /> {s.label}
          </span>
        </div>

        <div className="rekl-chips">
          <span className="rekl-chip rekl-chip--type">{r.type}</span>
          <span className="rekl-chip rekl-chip--dato"><Ikon ikon={CalendarDays} size={12} /> {datoKort(r.dato)}</span>
          {r.telefon && <span className="rekl-chip"><Ikon ikon={PhoneCall} size={12} /> {r.telefon}</span>}
          {ansatt && (
            <span className="rekl-chip" style={{ background: ansattFarge(r.ansvarligId) + '22', color: ansattFarge(r.ansvarligId) }}>
              <Ikon ikon={Hammer} size={12} /> {ansatt.navn.split(' ')[0]}
            </span>
          )}
          {r.kostnad && (
            <span className="rekl-chip rekl-chip--kostnad">
              {new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(r.kostnad))}
            </span>
          )}
        </div>

        {r.beskrivelse && (
          <div className="rekl-beskrivelse">
            {r.beskrivelse.length > 80 ? r.beskrivelse.slice(0, 80) + '…' : r.beskrivelse}
          </div>
        )}

        <div className="rekl-bunntekst">
          {r.frist && (
            <span style={{ color: fristFarge, fontSize: 12 }}>
              <Ikon ikon={Clock} size={12} /> Frist: {datoKort(r.frist)}
              {fristDager !== null && (
                <em> ({fristDager < 0 ? `${Math.abs(fristDager)}d over` : fristDager === 0 ? 'i dag' : `${fristDager}d`})</em>
              )}
            </span>
          )}
          {r.kommentar && (
            <span className="rekl-kommentar">
              <Ikon ikon={MessageSquare} size={12} /> {r.kommentar.length > 50 ? r.kommentar.slice(0, 50) + '…' : r.kommentar}
            </span>
          )}
        </div>

        {/* Manuell arkivering av avsluttede reklamasjoner */}
        {(r.status === 'utbedret' || r.status === 'avvist' || r.status === 'lukket') && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 6 }}>
            <button
              className="btn btn-sm"
              style={{ fontSize: 11, padding: '3px 10px', color: '#0891b2', borderColor: '#7dd3fc', background: '#f0f9ff' }}
              onClick={() => dispatch({ type: 'UPDATE_REKLAMASJON', payload: { ...r, arkivert: true } })}
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
            value={r.status}
            onChange={e => dispatch({ type: 'UPDATE_REKLAMASJON', payload: { ...r, status: e.target.value } })}
          >
            {Object.entries(REKL_STATUS).map(([key, s]) => (
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
        <h2>Reklamasjoner</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="bef-view-tabs">
            <button className={`bef-view-tab${visning === 'liste' ? ' aktiv' : ''}`} onClick={() => setVisning('liste')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={ClipboardList} size={14} /> Liste</button>
            <button className={`bef-view-tab${visning === 'kalender' ? ' aktiv' : ''}`} onClick={() => setVisning('kalender')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={CalendarDays} size={14} /> Kalender</button>
          </div>
          <input
            className="input"
            style={{ width: 200, height: 36 }}
            placeholder="Søk..."
            value={sok}
            onChange={e => setSok(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => apneNy()}>+ Ny reklamasjon</button>
        </div>
      </div>

      {visning === 'kalender' && <ServiceReklKalender />}

      {visning === 'liste' && <>
      {/* Pipeline */}
      {/* Kompakt status-fane-linje (Stefans småfix 15.08) */}
      <StatusFaner
        faner={Object.entries(REKL_STATUS).map(([key, s]) => ({
          key, label: s.label, ikon: <Ikon ikon={s.ikon} size={14} />, farge: s.farge, teller: teller[key] || 0, sum: 0,
        }))}
        aktiv={statusFilter}
        onVelg={key => setStatusFilter(f => f === key ? null : key)}
      />
      {statusFilter && (
        <div className="bef-filter-banner">
          Viser kun: <strong>{REKL_STATUS[statusFilter]?.label}</strong>
          <button className="bef-filter-fjern" onClick={() => setStatusFilter(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Ikon ikon={X} size={12} /> Fjern filter</button>
        </div>
      )}

      {/* Kanban: 4 kolonner */}
      <div className="bef-kanban bef-kanban--4col">
        {/* Ny */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: REKL_STATUS.ny.farge, color: REKL_STATUS.ny.farge }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={REKL_STATUS.ny.ikon} size={15} /> Ny <span className="bef-kolonne-teller">{nyeRekl.length}</span></span>
            {sumKr(nyeRekl) && <span className="bef-kolonne-kr">{sumKr(nyeRekl)}</span>}
          </div>
          {nyeRekl.length === 0 && <div className="bef-tom-melding">Ingen nye reklamasjoner.</div>}
          {nyeRekl.map(r => <ReklKort key={r.id} r={r} />)}
          <button className="bef-legg-til-btn" onClick={() => apneNy('ny')}>+ Legg til reklamasjon</button>
        </div>

        {/* Planlagt */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: REKL_STATUS.planlagt.farge, color: REKL_STATUS.planlagt.farge }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={REKL_STATUS.planlagt.ikon} size={15} /> Planlagt <span className="bef-kolonne-teller">{planlagteRekl.length}</span></span>
            {sumKr(planlagteRekl) && <span className="bef-kolonne-kr">{sumKr(planlagteRekl)}</span>}
          </div>
          {planlagteRekl.length === 0 && <div className="bef-tom-melding">Ingen planlagte reklamasjoner.</div>}
          {planlagteRekl.map(r => <ReklKort key={r.id} r={r} />)}
        </div>

        {/* Under utbedring */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: REKL_STATUS.under_arbeid.farge, color: REKL_STATUS.under_arbeid.farge }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={REKL_STATUS.under_arbeid.ikon} size={15} /> Under utbedring <span className="bef-kolonne-teller">{underArbeid.length}</span></span>
            {sumKr(underArbeid) && <span className="bef-kolonne-kr">{sumKr(underArbeid)}</span>}
          </div>
          {underArbeid.length === 0 && <div className="bef-tom-melding">Ingen reklamasjoner under arbeid.</div>}
          {underArbeid.map(r => <ReklKort key={r.id} r={r} />)}
        </div>

        {/* Utbedret / Avvist / Lukket */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: REKL_STATUS.utbedret.farge, color: REKL_STATUS.utbedret.farge }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={REKL_STATUS.utbedret.ikon} size={15} /> Utbedret <span className="bef-kolonne-teller">{utbedredeRekl.length}</span></span>
            {sumKr(utbedredeRekl) && <span className="bef-kolonne-kr">{sumKr(utbedredeRekl)}</span>}
          </div>
          {utbedredeRekl.length === 0 && <div className="bef-tom-melding">Ingen utbedrede reklamasjoner.</div>}
          {utbedredeRekl.map(r => <ReklKort key={r.id} r={r} />)}
        </div>
      </div>

      {/* Arkiv — manuelt arkiverte reklamasjoner */}
      {arkiverte.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button className="bef-arkiv-toggle" onClick={() => setVisArkiv(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Ikon ikon={Archive} size={15} /> Arkiv <span className="bef-kolonne-teller">{arkiverte.length}</span>
            <span style={{ marginLeft: 6, fontSize: 11 }}>{visArkiv ? '▲ Skjul' : '▼ Vis'}</span>
          </button>
          {visArkiv && (
            <div className="bef-arkiv-liste">
              {arkiverte.map(r => (
                <div key={r.id} className="bef-arkiv-rad" onClick={() => apneRediger(r)}>
                  <span className="bef-arkiv-ikon"><Ikon ikon={(REKL_STATUS[r.status] || REKL_STATUS.ny).ikon} size={14} /></span>
                  <span className="bef-arkiv-adresse">{r.adresse}</span>
                  <span className="bef-arkiv-navn">{r.kontaktNavn}</span>
                  {r.dato && <span className="bef-arkiv-dato">{datoKort(r.dato)}</span>}
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto', flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_REKLAMASJON', payload: { ...r, arkivert: false } }); }}
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
          <div className="modal bef-modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{redigerer ? 'Rediger reklamasjon' : 'Ny reklamasjon'}</h3>
              <button className="btn-icon" onClick={() => setVisModal(false)}><Ikon ikon={X} size={15} /></button>
            </div>
            <div className="form">

              {/* Grunninfo */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Grunninfo</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label>Prosjekt</label>
                    <select className="input" value={form.prosjektId} onChange={e => setForm(f => ({ ...f, prosjektId: e.target.value }))}>
                      <option value="">– Velg prosjekt –</option>
                      {[...state.prosjekter]
                        .filter(p => p.status === 'aktiv' || !p.status)
                        .sort((a, b) => a.navn.localeCompare(b.navn, 'nb'))
                        .map(p => <option key={p.id} value={p.id}>{p.navn}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Adresse (manuell)</label>
                    <input className="input" value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="Alternativt til prosjekt" />
                  </div>
                  <div>
                    <label>Kontaktperson (klager)</label>
                    <input className="input" value={form.kontaktNavn} onChange={e => setForm(f => ({ ...f, kontaktNavn: e.target.value }))} placeholder="Navn på kunde/kontakt" />
                  </div>
                  <div>
                    <label>Telefon</label>
                    <input className="input" value={form.telefon || ''} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} placeholder="Kundens telefon" />
                  </div>
                  <div>
                    <label>E-post</label>
                    <input className="input" value={form.epost || ''} onChange={e => setForm(f => ({ ...f, epost: e.target.value }))} placeholder="Kundens e-post" />
                  </div>
                  <div>
                    <label>Type reklamasjon</label>
                    <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                      {REKL_TYPER.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Dato meldt inn</label>
                    <input type="date" className="input" value={form.dato} onChange={e => setForm(f => ({ ...f, dato: e.target.value }))} />
                  </div>
                  <div>
                    <label>Frist for utbedring</label>
                    <input type="date" className="input" value={form.frist} onChange={e => setForm(f => ({ ...f, frist: e.target.value }))} />
                  </div>
                  <div>
                    <label>Planlagt utført (kalender)</label>
                    <input type="date" className="input" value={form.planlagtDato || ''}
                      onChange={e => setForm(f => ({ ...f, planlagtDato: e.target.value }))}
                      title="Når skal reklamasjonen tas — vises i den delte kalenderen" />
                  </div>
                  <div>
                    <label>Ansvarlig for utbedring</label>
                    <select className="input" value={form.ansvarligId} onChange={e => setForm(f => ({ ...f, ansvarligId: e.target.value }))}>
                      <option value="">– Velg ansvarlig –</option>
                      {[...state.ansatte].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(a => (
                        <option key={a.id} value={a.id}>{a.navn}{a.fag ? ` (${a.fag})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Kostnad for utbedring (kr)</label>
                    <input className="input" type="number" min="0" step="500" value={form.kostnad}
                      onChange={e => setForm(f => ({ ...f, kostnad: e.target.value }))} placeholder="f.eks. 5000" />
                  </div>
                </div>
              </div>

              {/* Beskrivelse */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Beskrivelse</div>
                <textarea className="input" rows={3} value={form.beskrivelse}
                  onChange={e => setForm(f => ({ ...f, beskrivelse: e.target.value }))}
                  placeholder="Beskriv hva reklamasjonen gjelder, hva kunden klager på..." />
              </div>

              {/* Status */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Status</div>
                <div className="bef-status-velger">
                  {Object.entries(REKL_STATUS).map(([key, s]) => (
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
                  placeholder="Intern merknad, hva er gjort, oppfølging..." />
              </div>

              <div className="modal-actions">
                {redigerer && <button className="btn btn-danger" onClick={slett}>Slett</button>}
                {redigerer && (
                  <button className="btn" onClick={() => printPDF(redigerer)} title="Skriv ut / lagre som PDF" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Ikon ikon={Printer} size={15} /> PDF
                  </button>
                )}
                <button className="btn" onClick={() => setVisModal(false)}>Avbryt</button>
                <button className="btn btn-primary" onClick={lagre}
                  disabled={!form.adresse.trim() && !form.prosjektId}>
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
