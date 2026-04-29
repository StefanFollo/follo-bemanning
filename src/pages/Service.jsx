import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { dateToIso } from '../store';

const SERV_STATUS = {
  ny:           { label: 'Ny',           farge: '#3b82f6', bg: '#eff6ff', ikon: '🔵' },
  planlagt:     { label: 'Planlagt',     farge: '#f59e0b', bg: '#fffbeb', ikon: '📅' },
  under_arbeid: { label: 'Under arbeid', farge: '#8b5cf6', bg: '#f5f3ff', ikon: '🔨' },
  ferdig:       { label: 'Ferdig',       farge: '#16a34a', bg: '#f0fdf4', ikon: '✅' },
};

const SERV_TYPER = [
  'Diverse', 'Tømrer', 'Maling', 'Rørlegger', 'Flislegging',
  'Elektro', 'Fasade / Tak', 'Bad', 'Dør / Vindu', 'Grunnmur', 'Annet',
];

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
    adresse: '',
    kontaktNavn: '',
    telefon: '',
    epost: '',
    type: 'Diverse',
    beskrivelse: '',
    dato: dateToIso(new Date()),
    oensketDato: '',
    ansvarligId: '',
    estimertTimer: '',
    belop: '',
    status: 'ny',
    kommentar: '',
  };
}

export default function Service() {
  const { state, dispatch } = useApp();
  const serviceJobber = state.serviceJobber || [];
  const today = dateToIso(new Date());

  const [visModal, setVisModal] = useState(false);
  const [redigerer, setRedigerer] = useState(null);
  const [form, setForm] = useState(tomForm());
  const [statusFilter, setStatusFilter] = useState(null);
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

  const teller = Object.fromEntries(
    Object.keys(SERV_STATUS).map(s => [s, serviceJobber.filter(j => j.status === s).length])
  );

  const filtrert = serviceJobber
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
    });

  const nyeJobber      = filtrert.filter(j => j.status === 'ny');
  const planlagteJobber = filtrert.filter(j => j.status === 'planlagt');
  const underArbeid    = filtrert.filter(j => j.status === 'under_arbeid');
  const ferdige        = filtrert.filter(j => j.status === 'ferdig');

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
      ? (fristDager < 0 ? '#dc2626' : fristDager <= 3 ? '#f59e0b' : '#16a34a')
      : null;

    return (
      <div className="rekl-kort" onClick={() => apneRediger(j)}>
        <div className="rekl-kort-topp">
          <div className="rekl-kort-tittel">
            <div className="rekl-kort-adresse">{j.adresse}</div>
            {j.kontaktNavn && <div className="rekl-kort-kontakt">👤 {j.kontaktNavn}</div>}
          </div>
          <span className="rekl-status-pill" style={{ background: s.bg, color: s.farge }}>
            {s.ikon} {s.label}
          </span>
        </div>

        <div className="rekl-chips">
          <span className="rekl-chip rekl-chip--type">{j.type}</span>
          <span className="rekl-chip rekl-chip--dato">📅 {datoKort(j.dato)}</span>
          {ansatt && (
            <span className="rekl-chip" style={{ background: ansattFarge(j.ansvarligId) + '22', color: ansattFarge(j.ansvarligId) }}>
              🔨 {ansatt.navn.split(' ')[0]}
            </span>
          )}
          {j.estimertTimer && (
            <span className="rekl-chip">⏱ {j.estimertTimer}t</span>
          )}
          {j.belop && (
            <span className="rekl-chip rekl-chip--kostnad">
              💰 {new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(j.belop))}
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
              🚀 Ønsket dato: {datoKort(j.oensketDato)}
              {fristDager !== null && j.status !== 'ferdig' && (
                <em> ({fristDager < 0 ? `${Math.abs(fristDager)}d over` : fristDager === 0 ? 'i dag' : `${fristDager}d`})</em>
              )}
            </span>
          )}
          {j.kommentar && (
            <span className="rekl-kommentar">
              💬 {j.kommentar.length > 50 ? j.kommentar.slice(0, 50) + '…' : j.kommentar}
            </span>
          )}
        </div>

        {/* Rask status-bytte */}
        <div className="bef-k-status-bytte" onClick={e => e.stopPropagation()}>
          <select
            className="bef-k-status-select"
            value={j.status}
            onChange={e => dispatch({ type: 'UPDATE_SERVICE_JOBB', payload: { ...j, status: e.target.value } })}
          >
            {Object.entries(SERV_STATUS).map(([key, s]) => (
              <option key={key} value={key}>{s.ikon} {s.label}</option>
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
          <h2>⚡ Service</h2>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Små jobber under 1 uke</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ width: 200, height: 36 }}
            placeholder="🔍 Søk adresse, type..."
            value={sok}
            onChange={e => setSok(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => apneNy()}>+ Ny service-jobb</button>
        </div>
      </div>

      {/* Pipeline */}
      <div className="bef-pipeline">
        {Object.entries(SERV_STATUS).map(([key, s]) => {
          const aktiv = statusFilter === key;
          return (
            <div key={key}
              className={`bef-pipeline-kort${aktiv ? ' bef-pipeline-kort--aktiv' : ''}`}
              style={{ borderTop: `4px solid ${s.farge}`, background: aktiv ? s.farge : s.bg, cursor: 'pointer' }}
              onClick={() => setStatusFilter(f => f === key ? null : key)}
              title={aktiv ? 'Klikk for å fjerne filter' : `Filtrer: ${s.label}`}
            >
              <div className="bef-pipeline-ikon">{s.ikon}</div>
              <div className="bef-pipeline-antall" style={{ color: aktiv ? '#fff' : s.farge }}>{teller[key] || 0}</div>
              <div className="bef-pipeline-label" style={{ color: aktiv ? '#fff' : undefined }}>{s.label}</div>
              {aktiv && <div className="bef-pipeline-aktiv-pill">✕ fjern</div>}
            </div>
          );
        })}
      </div>
      {statusFilter && (
        <div className="bef-filter-banner">
          Viser kun: <strong>{SERV_STATUS[statusFilter]?.label}</strong>
          <button className="bef-filter-fjern" onClick={() => setStatusFilter(null)}>✕ Fjern filter</button>
        </div>
      )}

      {/* Kanban: 4 kolonner */}
      <div className="bef-kanban bef-kanban--4col">
        {/* Ny */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: SERV_STATUS.ny.farge, color: SERV_STATUS.ny.farge }}>
            <span>🔵 Ny <span className="bef-kolonne-teller">{nyeJobber.length}</span></span>
            {sumKr(nyeJobber) && <span className="bef-kolonne-kr">{sumKr(nyeJobber)}</span>}
          </div>
          {nyeJobber.length === 0 && <div className="bef-tom-melding">Ingen nye jobber.</div>}
          {nyeJobber.map(j => <ServKort key={j.id} j={j} />)}
          <button className="bef-legg-til-btn" onClick={() => apneNy('ny')}>+ Legg til jobb</button>
        </div>

        {/* Planlagt */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: SERV_STATUS.planlagt.farge, color: SERV_STATUS.planlagt.farge }}>
            <span>📅 Planlagt <span className="bef-kolonne-teller">{planlagteJobber.length}</span></span>
            {sumKr(planlagteJobber) && <span className="bef-kolonne-kr">{sumKr(planlagteJobber)}</span>}
          </div>
          {planlagteJobber.length === 0 && <div className="bef-tom-melding">Ingen planlagte jobber.</div>}
          {planlagteJobber.map(j => <ServKort key={j.id} j={j} />)}
        </div>

        {/* Under arbeid */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: SERV_STATUS.under_arbeid.farge, color: SERV_STATUS.under_arbeid.farge }}>
            <span>🔨 Under arbeid <span className="bef-kolonne-teller">{underArbeid.length}</span></span>
            {sumKr(underArbeid) && <span className="bef-kolonne-kr">{sumKr(underArbeid)}</span>}
          </div>
          {underArbeid.length === 0 && <div className="bef-tom-melding">Ingen jobber under arbeid.</div>}
          {underArbeid.map(j => <ServKort key={j.id} j={j} />)}
        </div>

        {/* Ferdig */}
        <div className="bef-kolonne">
          <div className="bef-kolonne-header" style={{ borderColor: SERV_STATUS.ferdig.farge, color: SERV_STATUS.ferdig.farge }}>
            <span>✅ Ferdig <span className="bef-kolonne-teller">{ferdige.length}</span></span>
            {sumKr(ferdige) && <span className="bef-kolonne-kr">{sumKr(ferdige)}</span>}
          </div>
          {ferdige.length === 0 && <div className="bef-tom-melding">Ingen ferdige jobber.</div>}
          {ferdige.map(j => <ServKort key={j.id} j={j} />)}
        </div>
      </div>

      {/* Modal */}
      {visModal && (
        <div className="modal-backdrop" onClick={() => setVisModal(false)}>
          <div className="modal bef-modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{redigerer ? '✏️ Rediger service-jobb' : '⚡ Ny service-jobb'}</h3>
              <button className="btn-icon" onClick={() => setVisModal(false)}>✕</button>
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
                  placeholder="Intern merknad, tilgang, nøkkel, parkering..." />
              </div>

              <div className="modal-actions">
                {redigerer && <button className="btn btn-danger" onClick={slett}>Slett</button>}
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
