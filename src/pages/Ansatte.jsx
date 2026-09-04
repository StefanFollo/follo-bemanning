import { useState, useEffect } from 'react';
import { HardHat, Wrench, Thermometer, Cake, CircleCheck, TriangleAlert, X, CalendarDays, Lock, Smartphone } from 'lucide-react';
import { Ikon, IkonTekst } from '../komponenter/Ikon';
import { useApp } from '../context/AppContext';

const FAG_COLORS = {
  'Anleggsleder': '#b45309',
  'Bas Tømrer': '#b45309', // bakoverkompatibilitet
  'Montør': '#3b82f6',
  'Lærling Tømrer': '#15803d',
  'Maler': '#ec4899',
  'Rørlegger': '#0e7490',
  'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316',
  'Prosjektleder': '#0ea5e9',
};

function fagColor(fag) { return FAG_COLORS[fag] || '#6b7280'; }

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}><Ikon ikon={X} size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const EMPTY = { navn: '', fag: '', telefon: '', epost: '', innleie: false, bursdag: '', utenforBemanningsplan: false };

const MND_NAVN = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];

function bursdagLabel(bursdag) {
  if (!bursdag) return '';
  const [mm, dd] = bursdag.split('-');
  return `${parseInt(dd, 10)}. ${MND_NAVN[parseInt(mm, 10) - 1]}`;
}

export default function Ansatte() {
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [showFagModal, setShowFagModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [nyttFag, setNyttFag] = useState('');
  const [filterFag, setFilterFag] = useState('alle');
  const [search, setSearch] = useState('');
  const [gruppe, setGruppe] = useState('fast'); // 'fast' | 'innleie'
  const [sykmeldtModal, setSykmeldtModal] = useState(null); // ansatt object
  const [sykmeldtForm, setSykmeldtForm] = useState({ fra: '', til: '' });

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, fag: state.fag[0] || '', innleie: gruppe === 'innleie' });
    setShowModal(true);
  }

  function openEdit(a) {
    setEditing(a);
    setForm({ ...a });
    setShowModal(true);
  }

  function handleSave() {
    if (!form.navn.trim()) return;
    if (editing) {
      dispatch({ type: 'UPDATE_ANSATT', payload: { ...form, id: editing.id } });
    } else {
      dispatch({ type: 'ADD_ANSATT', payload: form });
    }
    setShowModal(false);
  }

  // Fysisk sletting er ERSTATTET med arkivering (B-listen 15.08) — koden
  // beholdes ubrukt med vilje. Historiske tildelinger røres ikke.
  // eslint-disable-next-line no-unused-vars
  function handleDelete(id) {
    if (confirm('Slett ansatt og alle tilknyttede tildelinger?')) {
      dispatch({ type: 'DELETE_ANSATT', id });
    }
  }

  // PR3: KS-lenke-status per ansatt (aldri sendt / sendt / åpnet / sperret).
  // Én GET når siden åpnes; 401 (ikke admin/kontor) → kolonnen viser bare «–».
  const [ksStatus, setKsStatus] = useState(null);
  async function hentKsStatus() {
    try {
      const r = await fetch('/api/ks/flate-admin', {
        headers: { Authorization: 'Bearer ' + (localStorage.getItem('fbs_token') || '') },
      });
      if (r.ok) setKsStatus((await r.json()).perAnsatt || {});
    } catch { /* nettverksfeil → kolonnen viser – */ }
  }
  useEffect(() => { hentKsStatus(); }, []);

  // KS-ansattflate PR1: generer/regenerer personlig lenke (SMS kommer i PR2 —
  // inntil da kopieres lenken og sendes manuelt). Mangler telefon → tydelig varsel.
  async function hentKsLenke(ansatt) {
    const harTlf = !!String(ansatt.telefon || '').replace(/\D/g, '').slice(-4);
    // PR2: eksisterende lenke gjenbrukes (regenerer:false) — sperret lenke
    // regenereres automatisk på serveren. SMS sendes når nummer finnes og
    // det bekreftes; ellers kopieres lenken som før.
    const sendSms = harTlf && window.confirm('Sende ' + ansatt.navn + ' sin personlige KS-lenke på SMS til ' + ansatt.telefon + '?\n\n(Avbryt = bare kopiér lenken)');
    try {
      const r = await fetch('/api/ks/flate-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fbs_token') || '') },
        body: JSON.stringify({ ansattId: ansatt.id, regenerer: false, sendSms }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.status);
      let melding = 'KS-lenke for ' + ansatt.navn + (d.gjenbrukt ? ' (samme som før)' : d.regenerert ? ' (NY — gammel lenke er død)' : ' (ny)') + ':\n' + d.url;
      if (d.sms) {
        melding += d.sms.sendt ? '\n\nSMS er sendt.'
          : d.sms.ikkeKlar ? '\n\nSMS-tjeneste ikke klar ennå — kopiér lenken og send manuelt.'
          : d.sms.hoppet ? '\n\nSMS IKKE sendt: ' + '(inter-app-oppsett mangler i Vercel)'
          : '\n\nSMS FEILET: ' + d.sms.feil;
      }
      if (d.manglerTelefon) melding += '\n\nOBS: Ansatt mangler telefonnummer — 4-siffer-bekreftelsen vil ikke virke før nummeret er lagt inn på ansattkortet.';
      try { await navigator.clipboard.writeText(d.url); melding += '\n\n(Lenken er også kopiert til utklippstavlen.)'; } catch { /* utklipp kan feile */ }
      window.alert(melding);
      hentKsStatus();
    } catch (e) {
      window.alert('Kunne ikke lage KS-lenke: ' + e.message);
    }
  }

  function arkiverAnsatt(a) {
    if (!confirm(`Arkivere ${a.navn}?\n\nPersonen skjules fra lister og bemanningsplan, men slettes IKKE — historiske tildelinger beholdes, og du kan gjenopprette når som helst.`)) return;
    dispatch({
      type: 'UPDATE_ANSATT',
      payload: {
        ...a,
        arkivert: true,
        arkivertDato: new Date().toISOString(),
        arkivertAv: localStorage.getItem('fbs_user_navn') || localStorage.getItem('fbs_role') || 'ukjent',
      },
    });
  }

  function gjenopprettAnsatt(a) {
    dispatch({ type: 'UPDATE_ANSATT', payload: { ...a, arkivert: false } });
  }

  function handleAddFag() {
    if (!nyttFag.trim()) return;
    dispatch({ type: 'ADD_FAG', navn: nyttFag.trim() });
    setNyttFag('');
  }

  function handleDeleteFag(navn) {
    if (confirm(`Slett faget "${navn}"?`)) {
      dispatch({ type: 'DELETE_FAG', navn });
    }
  }

  let fastCount = 0, innleieCount = 0;
  const alleIGruppe = [];
  const sortedAnsatte = state.ansatte.filter(a => !a.arkivert).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  const arkiverte = state.ansatte.filter(a => a.arkivert).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  const iDagIso = new Date().toISOString().slice(0, 10);
  for (const a of sortedAnsatte) {
    if (a.innleie) { innleieCount++; if (gruppe === 'innleie') alleIGruppe.push(a); }
    else           { fastCount++;    if (gruppe === 'fast')    alleIGruppe.push(a); }
  }
  const searchLow = search.toLowerCase();
  const ansatte = alleIGruppe.filter(a =>
    (filterFag === 'alle' || a.fag === filterFag) &&
    (!search || a.navn.toLowerCase().includes(searchLow))
  );

  return (
    <div className="page">
      <div className="page-header">
        <h2>Ansatte <span className="count-badge">{sortedAnsatte.length}</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setShowFagModal(true)}>Administrer fag</button>
          <button className="btn btn-primary" onClick={openNew}>
            + {gruppe === 'innleie' ? 'Ny innleie' : 'Ny ansatt'}
          </button>
        </div>
      </div>

      {/* Gruppe-tabs */}
      <div className="tab-bar" style={{ marginBottom: 8 }}>
        <button
          className={`tab-btn ${gruppe === 'fast' ? 'active' : ''}`}
          onClick={() => { setGruppe('fast'); setFilterFag('alle'); }}
        >
          <IkonTekst ikon={HardHat} size={15}>Fast ansatte</IkonTekst> <span className="count-badge" style={{ marginLeft: 4 }}>{fastCount}</span>
        </button>
        <button
          className={`tab-btn ${gruppe === 'innleie' ? 'active' : ''}`}
          onClick={() => { setGruppe('innleie'); setFilterFag('alle'); }}
        >
          <IkonTekst ikon={Wrench} size={15}>Innleie</IkonTekst> <span className="count-badge" style={{ marginLeft: 4 }}>{innleieCount}</span>
        </button>
      </div>

      <div className="toolbar">
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <button className={`filter-btn ${filterFag === 'alle' ? 'active' : ''}`} onClick={() => setFilterFag('alle')}>
            Alle ({alleIGruppe.length})
          </button>
          {state.fag.map(f => {
            const cnt = alleIGruppe.filter(a => a.fag === f).length;
            if (cnt === 0) return null;
            return (
              <button
                key={f}
                className={`filter-btn ${filterFag === f ? 'active' : ''}`}
                style={filterFag === f ? { background: fagColor(f), borderColor: fagColor(f) } : {}}
                onClick={() => setFilterFag(f)}
              >
                <span className="fag-dot" style={{ background: fagColor(f), display: 'inline-block', marginRight: 4 }} />
                {f} ({cnt})
              </button>
            );
          })}
        </div>
        <input
          className="search-input"
          placeholder={`Søk ${gruppe === 'innleie' ? 'innleie' : 'ansatt'}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {ansatte.length === 0 ? (
        <div className="empty">
          {gruppe === 'innleie'
            ? 'Ingen innleide arbeidere ennå. Klikk "+ Ny innleie" for å legge til.'
            : 'Ingen ansatte funnet.'}
        </div>
      ) : (
        <div className="compact-table">
          <div className="ct-header">
            <div className="ct-col ct-ansatt-navn">Navn</div>
            <div className="ct-col ct-fag">Fag</div>
            <div className="ct-col ct-kontakt">Telefon</div>
            <div className="ct-col ct-kontakt">E-post</div>
            <div className="ct-col ct-kontakt">Bursdag</div>
            <div className="ct-col ct-kontakt">KS-lenke</div>
            <div className="ct-col ct-actions"></div>
          </div>
          {ansatte.map(a => (
            <div className="ct-row" key={a.id} style={a.sykmeldt ? { opacity: 0.55, background: '#f8fafc' } : {}}>
              <div className="ct-col ct-ansatt-navn">
                <div className="ct-avatar" style={{ background: a.sykmeldt ? '#5d6b80' : a.innleie ? '#f97316' : fagColor(a.fag) }}>
                  {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span className="ct-prosjekt-navn">{a.navn}</span>
                  {a.sykmeldt && (
                    <span style={{ fontSize: 10, color: '#5d6b80', fontWeight: 500, letterSpacing: '0.03em' }}>
                      <Ikon ikon={Thermometer} size={11} style={{ marginRight: 3 }} />SYKMELDT{a.sykmeldtTil ? ` t.o.m. ${bursdagLabel ? new Date(a.sykmeldtTil + 'T00:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : a.sykmeldtTil}` : ''}
                    </span>
                  )}
                  {a.sykmeldt && a.sykmeldtTil && a.sykmeldtTil < iDagIso && (
                    <span style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 500, letterSpacing: '0.03em', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Ikon ikon={TriangleAlert} size={11} /> SYKMELDING UTLØPT — friskmeld eller forleng
                    </span>
                  )}
                  {!a.sykmeldt && a.innleie && (
                    <span style={{ fontSize: 10, color: '#f97316', fontWeight: 500, letterSpacing: '0.03em' }}>INNLEIE</span>
                  )}
                  {!a.sykmeldt && a.utenforBemanningsplan && (
                    <span style={{ fontSize: 10, color: '#b45309', fontWeight: 500, letterSpacing: '0.03em' }}>KONTOR / ADMIN</span>
                  )}
                </div>
              </div>
              <div className="ct-col ct-fag">
                <span className="fag-tag" style={{ background: a.sykmeldt ? '#e2e8f022' : fagColor(a.fag) + '22', color: a.sykmeldt ? '#5d6b80' : fagColor(a.fag), borderColor: a.sykmeldt ? '#e2e8f0' : fagColor(a.fag) + '55' }}>
                  {a.fag || '–'}
                </span>
              </div>
              <div className="ct-col ct-kontakt">{a.telefon || <span style={{ color: '#cbd5e1' }}>–</span>}</div>
              <div className="ct-col ct-kontakt">{a.epost || <span style={{ color: '#cbd5e1' }}>–</span>}</div>
              <div className="ct-col ct-kontakt">
                {a.bursdag
                  ? <span style={{ color: '#ec4899' }}><Ikon ikon={Cake} size={14} style={{ marginRight: 4 }} />{bursdagLabel(a.bursdag)}</span>
                  : <span style={{ color: '#cbd5e1' }}>–</span>}
              </div>
              <div className="ct-col ct-kontakt" style={{ fontSize: 12 }}>
                {(() => {
                  // PR3: KS-lenke-status. Mangler telefon vises ALLTID tydelig —
                  // 4-siffer-bekreftelsen i flaten krever nummeret.
                  const manglerTlf = !String(a.telefon || '').replace(/\D/g, '').slice(-4);
                  const s = ksStatus?.[a.id];
                  const dato = iso => iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : '';
                  return (
                    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
                      {ksStatus === null ? <span style={{ color: '#cbd5e1' }}>–</span>
                        : !s ? <span style={{ color: '#94a3b8' }}>Aldri sendt</span>
                        : s.sperret ? <span style={{ color: 'var(--danger)', fontWeight: 500 }}><Ikon ikon={Lock} size={12} style={{ marginRight: 3 }} />Sperret</span>
                        : s.sistApnet ? <span style={{ color: '#15803d' }}><Ikon ikon={Smartphone} size={12} style={{ marginRight: 3 }} />Åpnet {dato(s.sistApnet)}</span>
                        : s.sendtDato ? <span style={{ color: '#2563eb' }}>Sendt {dato(s.sendtDato)}</span>
                        : <span style={{ color: '#5d6b80' }}>Lenke laget</span>}
                      {manglerTlf && (
                        <span style={{ color: 'var(--warning)', fontWeight: 500, fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Ikon ikon={TriangleAlert} size={11} /> Mangler telefon
                        </span>
                      )}
                    </span>
                  );
                })()}
              </div>
              <div className="ct-col ct-actions">
                {a.sykmeldt ? (
                  <button
                    className="btn btn-sm"
                    style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}
                    onClick={() => dispatch({ type: 'UPDATE_ANSATT', payload: { ...a, sykmeldt: false, sykmeldtFra: '', sykmeldtTil: '' } })}
                  ><IkonTekst ikon={CircleCheck} size={14} gap={4}>Friskmeldt</IkonTekst></button>
                ) : (
                  <button
                    className="btn btn-sm"
                    style={{ background: '#f8fafc', color: '#5d6b80', borderColor: '#e2e8f0' }}
                    onClick={() => { setSykmeldtForm({ fra: new Date().toISOString().slice(0, 10), til: '' }); setSykmeldtModal(a); }}
                  ><IkonTekst ikon={Thermometer} size={14} gap={4}>Syk</IkonTekst></button>
                )}
                <button className="btn btn-sm" onClick={() => openEdit(a)}>Rediger</button>
                <button className="btn-icon" title="Lag/kopier personlig KS-lenke (ansattflaten på mobil)" onClick={() => hentKsLenke(a)}>

                  <Ikon ikon={HardHat} size={15} />

                </button>
                <button className="btn btn-sm" style={{ color: 'var(--warning)' }} onClick={() => arkiverAnsatt(a)}>Arkiver</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Arkiverte ansatte — tombstone-mønsteret fra prosjektene ── */}
      {arkiverte.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 8 }}>
            Arkiverte ({arkiverte.length})
          </div>
          {arkiverte.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 5, fontSize: 13, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{a.navn}</span>
              <span>{a.fag || ''}</span>
              <span style={{ fontSize: 11 }}>
                Arkivert {a.arkivertDato ? new Date(a.arkivertDato).toLocaleDateString('nb-NO') : ''}{a.arkivertAv ? ` av ${a.arkivertAv}` : ''}
              </span>
              <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => gjenopprettAnsatt(a)}>Gjenopprett</button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal
          title={editing ? (form.innleie ? 'Rediger innleie' : 'Rediger ansatt') : (form.innleie ? 'Ny innleie' : 'Ny ansatt')}
          onClose={() => setShowModal(false)}
        >
          <div className="form">
            {/* Type toggle */}
            <label>Type</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <button
                type="button"
                className={`filter-btn${!form.innleie ? ' active' : ''}`}
                style={!form.innleie ? { background: '#1e293b', borderColor: '#1e293b', color: '#fff' } : {}}
                onClick={() => setForm(f => ({ ...f, innleie: false }))}
              >
                <IkonTekst ikon={HardHat} size={14} gap={4}>Fast ansatt</IkonTekst>
              </button>
              <button
                type="button"
                className={`filter-btn${form.innleie ? ' active' : ''}`}
                style={form.innleie ? { background: '#f97316', borderColor: '#f97316', color: '#fff' } : {}}
                onClick={() => setForm(f => ({ ...f, innleie: true }))}
              >
                <IkonTekst ikon={Wrench} size={14} gap={4}>Innleie</IkonTekst>
              </button>
            </div>
            <label>Navn *</label>
            <input value={form.navn} onChange={e => setForm(f => ({ ...f, navn: e.target.value }))} placeholder="Fullt navn" />
            <label>Fag / Stilling</label>
            <select value={form.fag} onChange={e => setForm(f => ({ ...f, fag: e.target.value }))}>
              {state.fag.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <label>Telefon</label>
            <input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} placeholder="+47 000 00 000" />
            <label>E-post</label>
            <input value={form.epost} onChange={e => setForm(f => ({ ...f, epost: e.target.value }))} placeholder="navn@epost.no" />
            <label><IkonTekst ikon={Cake} size={14} gap={4}>Bursdag (dag og måned)</IkonTekst></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={form.bursdag ? form.bursdag.split('-')[0] : ''}
                onChange={e => {
                  const mm = e.target.value;
                  const dd = form.bursdag ? form.bursdag.split('-')[1] || '01' : '01';
                  setForm(f => ({ ...f, bursdag: mm ? `${mm}-${dd}` : '' }));
                }}
                style={{ flex: 1 }}
              >
                <option value="">– Velg måned –</option>
                {MND_NAVN.map((m, i) => (
                  <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
                ))}
              </select>
              <select
                value={form.bursdag ? form.bursdag.split('-')[1] || '' : ''}
                onChange={e => {
                  const dd = e.target.value;
                  const mm = form.bursdag ? form.bursdag.split('-')[0] || '01' : '01';
                  setForm(f => ({ ...f, bursdag: dd ? `${mm}-${dd}` : '' }));
                }}
                style={{ flex: 1 }}
                disabled={!form.bursdag || !form.bursdag.split('-')[0]}
              >
                <option value="">– Velg dag –</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={String(d).padStart(2, '0')}>{d}.</option>
                ))}
              </select>
              {form.bursdag && (
                <button type="button" className="btn" onClick={() => setForm(f => ({ ...f, bursdag: '' }))}><Ikon ikon={X} size={16} /></button>
              )}
            </div>
            <label style={{ marginTop: 8 }}>Bemanningsplan</label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                background: form.utenforBemanningsplan ? '#fef9ec' : '#f0fdf4',
                border: `1px solid ${form.utenforBemanningsplan ? '#fde68a' : '#bbf7d0'}`,
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setForm(f => ({ ...f, utenforBemanningsplan: !f.utenforBemanningsplan }))}
            >
              <div style={{
                width: 36, height: 20, borderRadius: 10,
                background: form.utenforBemanningsplan ? '#b45309' : '#15803d',
                position: 'relative', transition: 'background .2s',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: form.utenforBemanningsplan ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left .2s',
                }} />
              </div>
              <span style={{ fontSize: 13, color: '#374151' }}>
                {form.utenforBemanningsplan
                  ? <IkonTekst ikon={TriangleAlert} size={14} farge="#b45309">Ikke i bemanningsplan (kontor / admin)</IkonTekst>
                  : <IkonTekst ikon={CircleCheck} size={14} farge="#15803d">Inkludert i bemanningsplan</IkonTekst>}
              </span>
            </div>
            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button className="btn btn-primary" onClick={handleSave}>Lagre</button>
            </div>
          </div>
        </Modal>
      )}

      {sykmeldtModal && (
        <Modal title={<IkonTekst ikon={Thermometer} size={16}>Sykmelding – {sykmeldtModal.navn}</IkonTekst>} onClose={() => setSykmeldtModal(null)}>
          <div className="form">
            <label>Fra dato</label>
            <input type="date" value={sykmeldtForm.fra} onChange={e => setSykmeldtForm(f => ({ ...f, fra: e.target.value }))} />
            <label>Til dato <span style={{ color: '#5d6b80', fontWeight: 400 }}>(valgfritt – la stå tom hvis ukjent)</span></label>
            <input type="date" value={sykmeldtForm.til} min={sykmeldtForm.fra} onChange={e => setSykmeldtForm(f => ({ ...f, til: e.target.value }))} />
            {sykmeldtForm.til && sykmeldtForm.fra && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#475569' }}>
                <IkonTekst ikon={CalendarDays} size={14}>Sykmeldt i {Math.max(1, Math.round((new Date(sykmeldtForm.til) - new Date(sykmeldtForm.fra)) / 86400000))} dager</IkonTekst>
              </div>
            )}
            <div className="form-actions">
              <button className="btn" onClick={() => setSykmeldtModal(null)}>Avbryt</button>
              <button
                className="btn btn-primary"
                disabled={!sykmeldtForm.fra}
                onClick={() => {
                  dispatch({ type: 'UPDATE_ANSATT', payload: { ...sykmeldtModal, sykmeldt: true, sykmeldtFra: sykmeldtForm.fra, sykmeldtTil: sykmeldtForm.til } });
                  setSykmeldtModal(null);
                }}
              >Lagre sykmelding</button>
            </div>
          </div>
        </Modal>
      )}

      {showFagModal && (
        <Modal title="Administrer fag" onClose={() => setShowFagModal(false)}>
          <div className="form">
            <div className="fag-list">
              {state.fag.map(f => (
                <div key={f} className="fag-item">
                  <span className="fag-dot" style={{ background: fagColor(f) }} />
                  <span>{f}</span>
                  <button className="btn-icon btn-danger-icon" onClick={() => handleDeleteFag(f)}><Ikon ikon={X} size={16} /></button>
                </div>
              ))}
            </div>
            <label>Legg til nytt fag</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nyttFag} onChange={e => setNyttFag(e.target.value)} placeholder="Fagnavn" onKeyDown={e => e.key === 'Enter' && handleAddFag()} />
              <button className="btn btn-primary" onClick={handleAddFag}>Legg til</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
