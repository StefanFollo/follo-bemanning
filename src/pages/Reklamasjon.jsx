import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { dateToIso } from '../store';

const REKL_STATUS = {
  ny:           { label: 'Ny',             farge: '#3b82f6', bg: '#eff6ff', ikon: '🔵' },
  under_arbeid: { label: 'Under utbedring', farge: '#f59e0b', bg: '#fffbeb', ikon: '🔨' },
  utbedret:     { label: 'Utbedret',        farge: '#16a34a', bg: '#f0fdf4', ikon: '✅' },
  avvist:       { label: 'Avvist',          farge: '#dc2626', bg: '#fef2f2', ikon: '🚫' },
  lukket:       { label: 'Lukket',          farge: '#6b7280', bg: '#f9fafb', ikon: '🔒' },
};

const REKL_TYPER = [
  'Tømrer', 'Maling', 'Rørlegger', 'Flislegging', 'Elektro',
  'Fasade / Tak', 'Bad', 'Dør / Vindu', 'Grunnmur', 'Annet',
];

const FAG_COLORS = {
  'Bas Tømrer': '#f59e0b', 'Montør': '#3b82f6', 'Lærling Tømrer': '#16a34a',
  'Maler': '#ec4899', 'Rørlegger': '#06b6d4', 'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316', 'Prosjektleder': '#0ea5e9',
};
function fagColor(fag) { return FAG_COLORS[fag] || '#6b7280'; }

const PL_FARGER = ['#2563eb','#16a34a','#9333ea','#ea580c','#0891b2','#be185d','#854d0e','#0f766e'];

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
    status: 'ny',
    ansvarligId: '',
    kommentar: '',
    kostnad: '',
  };
}

export default function Reklamasjon() {
  const { state, dispatch } = useApp();
  const reklamasjoner = state.reklamasjoner || [];
  const today = dateToIso(new Date());

  const [visModal, setVisModal] = useState(false);
  const [redigerer, setRedigerer] = useState(null);
  const [form, setForm] = useState(tomForm());
  const [filter, setFilter] = useState('alle');
  const [sok, setSok] = useState('');

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
  const teller = Object.fromEntries(
    Object.keys(REKL_STATUS).map(s => [s, reklamasjoner.filter(r => r.status === s).length])
  );

  // Filtrert og søkt liste
  const filtrert = reklamasjoner
    .filter(r => filter === 'alle' || r.status === filter)
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
    });

  // Kanban-kolonner: aktive (ny + under_arbeid) og avsluttede (utbedret + avvist + lukket)
  const aktive     = filtrert.filter(r => r.status === 'ny' || r.status === 'under_arbeid');
  const avsluttede = filtrert.filter(r => r.status === 'utbedret' || r.status === 'avvist' || r.status === 'lukket');

  function ReklKort({ r }) {
    const s = REKL_STATUS[r.status] || REKL_STATUS.ny;
    const ansatt = r.ansvarligId ? state.ansatte.find(a => a.id === r.ansvarligId) : null;
    const prosjekt = r.prosjektId ? state.prosjekter.find(p => p.id === r.prosjektId) : null;
    const fristDager = dagerTil(r.frist);
    const fristFarge = fristDager !== null
      ? (fristDager < 0 ? '#dc2626' : fristDager <= 5 ? '#f59e0b' : '#16a34a')
      : null;

    return (
      <div className="rekl-kort" onClick={() => apneRediger(r)}>
        <div className="rekl-kort-topp">
          <div className="rekl-kort-tittel">
            <div className="rekl-kort-adresse">{prosjekt ? prosjekt.navn : r.adresse}</div>
            {r.kontaktNavn && <div className="rekl-kort-kontakt">👤 {r.kontaktNavn}</div>}
          </div>
          <span className="rekl-status-pill" style={{ background: s.bg, color: s.farge }}>
            {s.ikon} {s.label}
          </span>
        </div>

        <div className="rekl-chips">
          <span className="rekl-chip rekl-chip--type">{r.type}</span>
          <span className="rekl-chip rekl-chip--dato">📅 {datoKort(r.dato)}</span>
          {r.telefon && <span className="rekl-chip">📞 {r.telefon}</span>}
          {ansatt && (
            <span className="rekl-chip" style={{ background: ansattFarge(r.ansvarligId) + '22', color: ansattFarge(r.ansvarligId) }}>
              🔨 {ansatt.navn.split(' ')[0]}
            </span>
          )}
          {r.kostnad && (
            <span className="rekl-chip rekl-chip--kostnad">
              💰 {new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(r.kostnad))}
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
              ⏰ Frist: {datoKort(r.frist)}
              {fristDager !== null && (
                <em> ({fristDager < 0 ? `${Math.abs(fristDager)}d over` : fristDager === 0 ? 'i dag' : `${fristDager}d`})</em>
              )}
            </span>
          )}
          {r.kommentar && (
            <span className="rekl-kommentar">
              💬 {r.kommentar.length > 50 ? r.kommentar.slice(0, 50) + '…' : r.kommentar}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bef-side">
      {/* Header */}
      <div className="page-header">
        <h2>Reklamasjoner</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="input"
            style={{ width: 200, height: 36 }}
            placeholder="🔍 Søk..."
            value={sok}
            onChange={e => setSok(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => apneNy()}>+ Ny reklamasjon</button>
        </div>
      </div>

      {/* Pipeline */}
      <div className="bef-pipeline">
        {Object.entries(REKL_STATUS).map(([key, s]) => (
          <div key={key}
            className="bef-pipeline-kort"
            style={{ borderTop: `4px solid ${s.farge}`, background: s.bg, cursor: 'pointer' }}
            onClick={() => setFilter(filter === key ? 'alle' : key)}
          >
            <div className="bef-pipeline-ikon">{s.ikon}</div>
            <div className="bef-pipeline-antall" style={{ color: s.farge }}>{teller[key] || 0}</div>
            <div className="bef-pipeline-label">{s.label}</div>
            {filter === key && <div style={{ fontSize: 10, color: s.farge, marginTop: 2 }}>● Aktiv filter</div>}
          </div>
        ))}
      </div>

      {/* Kanban */}
      <div className="bef-kanban">
        {/* Aktive */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
            🔨 Aktive reklamasjoner
            <span className="bef-kolonne-teller">{aktive.length}</span>
          </div>
          {aktive.length === 0 && (
            <div className="bef-tom-melding">Ingen aktive reklamasjoner.</div>
          )}
          {aktive.map(r => <ReklKort key={r.id} r={r} />)}
          <button className="bef-legg-til-btn" onClick={() => apneNy('ny')}>+ Legg til reklamasjon</button>
        </div>

        {/* Avsluttede */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: '#6b7280', color: '#6b7280' }}>
            🔒 Avsluttede
            <span className="bef-kolonne-teller">{avsluttede.length}</span>
          </div>
          {avsluttede.length === 0 && (
            <div className="bef-tom-melding">Ingen avsluttede reklamasjoner.</div>
          )}
          {avsluttede.map(r => <ReklKort key={r.id} r={r} />)}
        </div>
      </div>

      {/* Modal */}
      {visModal && (
        <div className="modal-backdrop" onClick={() => setVisModal(false)}>
          <div className="modal bef-modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{redigerer ? 'Rediger reklamasjon' : 'Ny reklamasjon'}</h3>
              <button className="btn-icon" onClick={() => setVisModal(false)}>✕</button>
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
                      {s.ikon} {s.label}
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
                  <button className="btn" onClick={() => printPDF(redigerer)} title="Skriv ut / lagre som PDF">
                    🖨️ PDF
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
