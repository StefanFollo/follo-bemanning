import { useState } from 'react';
import {
  Truck, Key, CircleAlert, TriangleAlert, Clock, CircleCheck, Wrench, X,
  Printer, Snowflake, Sun, Car, Trash2,
} from 'lucide-react';
import { Ikon, IkonTekst } from '../komponenter/Ikon';
import { useApp } from '../context/AppContext';
import { uid } from '../store';

const MODELLER = ['Transporter','E-NV200','Proace','Expert','Vivaro','Jumpy','Caddy','Transit','Sprinter','Annet'];
const DEKK_TYPER = ['', 'V', 'S'];
const DEKK_LABELS = { V: 'Vinter', S: 'Sommer', '': '–' };
const DEKKLAGRING = ['', 'Dekkhotell', 'Hjemme', 'Firma'];

const TOM_BIL = {
  modell: 'Proace', regNr: '', sjafor: '', abax: '',
  euKontroll: '', dekkType: '', dekklagring: '',
  km: '', kmDato: '', kommentar: '',
  restverdiSkatteetaten: '', problemer: '', planlagtService: '', erstatningsbil: '',
};

function dagerTil(isoDate) {
  if (!isoDate) return null;
  return Math.round((new Date(isoDate + 'T00:00:00') - new Date()) / 86400000);
}

function serviceStatus(isoDate) {
  const d = dagerTil(isoDate);
  if (d === null) return null;
  if (d < 0)   return { farge: '#fff', bg: '#dc2626', label: `Forfalt ${Math.abs(d)}d`, ikon: CircleAlert };
  if (d === 0) return { farge: '#fff', bg: '#b45309', label: 'I dag', ikon: Wrench };
  if (d <= 14) return { farge: '#92400e', bg: '#fef3c7', label: `om ${d}d`, ikon: Wrench };
  return { farge: '#166534', bg: '#dcfce7', label: `om ${d}d`, ikon: Wrench };
}

function fmtRestverdi(v) {
  if (!v) return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? v : n.toLocaleString('nb-NO') + ' kr';
}

function euStatus(isoDate) {
  const d = dagerTil(isoDate);
  if (d === null) return { farge: '#5d6b80', bg: '#f8fafc', label: 'Ukjent' };
  if (d < 0)   return { farge: '#fff', bg: '#dc2626', label: `Forfalt ${Math.abs(d)}d`, ikon: CircleAlert };
  if (d <= 30) return { farge: '#fff', bg: '#b45309', label: `${d}d igjen`, ikon: TriangleAlert };
  if (d <= 90) return { farge: '#92400e', bg: '#fef3c7', label: `${d}d igjen`, ikon: Clock };
  return { farge: '#166534', bg: '#dcfce7', label: `${d}d`, ikon: CircleCheck };
}

function fmt(isoDate) {
  if (!isoDate) return '–';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtKm(km) {
  if (!km) return '';
  const n = parseInt(km.replace(/\s/g, ''), 10);
  return isNaN(n) ? km : n.toLocaleString('nb-NO') + ' km';
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}><Ikon ikon={X} size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Biler() {
  const { state, dispatch } = useApp();
  const biler = state.biler || [];

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(TOM_BIL);
  const [sok, setSok] = useState('');
  const [filter, setFilter] = useState('alle'); // 'alle' | 'ledig' | 'eu-varsel'
  const [lagretMsg, setLagretMsg] = useState('');

  function visLagret(msg = 'Lagret automatisk') {
    setLagretMsg(msg);
    setTimeout(() => setLagretMsg(''), 2500);
  }

  // Statistikk
  const ledigCount   = biler.filter(b => !b.sjafor).length;
  const euVarselCount = biler.filter(b => {
    const d = dagerTil(b.euKontroll);
    return d !== null && d <= 30;
  }).length;
  const problemCount = biler.filter(b => (b.problemer || '').trim()).length;

  const filtrert = biler.filter(b => {
    if (filter === 'ledig' && b.sjafor) return false;
    if (filter === 'eu-varsel') {
      const d = dagerTil(b.euKontroll);
      if (d === null || d > 30) return false;
    }
    if (filter === 'problem' && !(b.problemer || '').trim()) return false;
    if (sok) {
      const q = sok.toLowerCase();
      return (
        b.modell.toLowerCase().includes(q) ||
        b.regNr.toLowerCase().includes(q) ||
        (b.sjafor || '').toLowerCase().includes(q) ||
        (b.kommentar || '').toLowerCase().includes(q) ||
        (b.problemer || '').toLowerCase().includes(q) ||
        (b.erstatningsbil || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  function apneNy() {
    setEditing(null);
    setForm({ ...TOM_BIL, kmDato: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  }

  function apneRediger(b) {
    setEditing(b);
    setForm({ ...b });
    setShowModal(true);
  }

  function lagre() {
    if (!form.regNr.trim()) return;
    if (editing) {
      dispatch({ type: 'UPDATE_BIL', payload: { ...form, id: editing.id } });
      visLagret('Endringer lagret');
    } else {
      dispatch({ type: 'ADD_BIL', payload: { ...form, id: uid() } });
      visLagret('Bil lagt til');
    }
    setShowModal(false);
  }

  function slett(id) {
    if (confirm('Slette bilen?')) {
      dispatch({ type: 'DELETE_BIL', id });
      visLagret('Bil slettet');
    }
  }

  const summaryCards = [
    { label: 'Totalt',      count: biler.length,      icon: Truck,         color: '#2563eb', bg: '#eff6ff', key: 'alle' },
    { label: 'Ledig',       count: ledigCount,         icon: Key,           color: '#b45309', bg: '#fffbeb', key: 'ledig' },
    { label: 'EU-varsel',   count: euVarselCount,      icon: CircleAlert,   color: '#dc2626', bg: '#fff5f5', key: 'eu-varsel' },
    { label: 'Problemer',   count: problemCount,       icon: TriangleAlert, color: '#ea580c', bg: '#fff7ed', key: 'problem' },
  ];

  // PDF-rapport: full statusoversikt for alle biler, klar for utskrift/PDF
  function skrivUtRapport() {
    const sortert = [...biler].sort((a, b) => (a.regNr || '').localeCompare(b.regNr || ''));
    const idag = new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const rader = sortert.map(b => {
      const eu = euStatus(b.euKontroll);
      const sv = serviceStatus(b.planlagtService);
      const harProblem = (b.problemer || '').trim();
      return `<tr${harProblem ? ' class="problem"' : ''}>
        <td class="mono"><b>${b.regNr || '–'}</b></td>
        <td>${b.modell || '–'}</td>
        <td>${b.sjafor || '<i>LEDIG</i>'}</td>
        <td>${b.euKontroll ? `${fmt(b.euKontroll)}<br><span class="badge" style="background:${eu.bg};color:${eu.farge}">${eu.label}</span>` : '–'}</td>
        <td>${b.planlagtService ? `${fmt(b.planlagtService)}<br><span class="badge" style="background:${sv.bg};color:${sv.farge}">${sv.label}</span>` : '–'}</td>
        <td>${b.dekkType ? (b.dekkType === 'V' ? 'Vinter' : 'Sommer') : '–'}${b.dekklagring ? `<br><span class="lite">${b.dekklagring}</span>` : ''}</td>
        <td>${b.km ? fmtKm(b.km) : '–'}${b.kmDato ? `<br><span class="lite">${fmt(b.kmDato)}</span>` : ''}</td>
        <td>${fmtRestverdi(b.restverdiSkatteetaten) || '–'}</td>
        <td>${harProblem ? `<span class="rod">${b.problemer}</span>` : '–'}${(b.erstatningsbil || '').trim() ? `<br><span class="lite">Erstatningsbil: ${b.erstatningsbil}</span>` : ''}</td>
        <td>${b.kommentar || ''}</td>
      </tr>`;
    }).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Bilrapport – FolloByggService ${idag}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px}
        .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #185FA5;padding-bottom:10px;margin-bottom:12px}
        .logo{font-size:20px;font-weight:700;color:#185FA5}
        .sub{font-size:10px;color:#666;margin-top:2px}
        .tittel{font-size:15px;font-weight:700;text-align:right}
        .oppsummering{display:flex;gap:18px;margin-bottom:12px;font-size:11px;color:#444}
        .oppsummering b{font-size:14px;color:#111}
        table{width:100%;border-collapse:collapse}
        th{background:#f1f5f9;text-align:left;padding:5px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#475569;border-bottom:2px solid #cbd5e1;white-space:nowrap}
        td{padding:5px 7px;border-bottom:1px solid #e5e7eb;vertical-align:top}
        tr.problem{background:#fff7ed}
        .mono{font-family:monospace;font-size:12px}
        .badge{font-size:9px;font-weight:700;border-radius:3px;padding:1px 5px;display:inline-block;margin-top:2px}
        .lite{font-size:9px;color:#888}
        .rod{color:#c2410c;font-weight:600}
        @media print{body{padding:6px}@page{size:landscape;margin:10mm}}
      </style>
    </head><body>
      <div class="hdr">
        <div>
          <div class="logo">FolloByggService</div>
          <div class="sub">Firmabiler – statusrapport</div>
        </div>
        <div>
          <div class="tittel">BILRAPPORT</div>
          <div class="sub" style="text-align:right">Generert: ${idag}</div>
        </div>
      </div>
      <div class="oppsummering">
        <div><b>${biler.length}</b> biler totalt</div>
        <div><b>${ledigCount}</b> ledige</div>
        <div><b>${euVarselCount}</b> EU-varsler (&le;30d)</div>
        <div><b>${problemCount}</b> med problemer</div>
        <div><b>${biler.filter(b => b.planlagtService).length}</b> med bestilt service</div>
      </div>
      <table>
        <thead><tr>
          <th>Reg.nr.</th><th>Modell</th><th>Sjåfør</th><th>EU-kontroll</th><th>Planlagt service</th>
          <th>Dekk</th><th>KM</th><th>Restverdi (Skatteetaten)</th><th>Problemer / erstatningsbil</th><th>Kommentar</th>
        </tr></thead>
        <tbody>${rader}</tbody>
      </table>
      <script>window.onload = function(){ window.print(); }<\/script>
    </body></html>`);
    w.document.close();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2><IkonTekst ikon={Truck} size={18}>Firmabiler</IkonTekst> <span className="count-badge">{biler.length}</span></h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lagretMsg && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: lagretMsg.includes('slettet') ? '#5d6b80' : '#15803d', fontWeight: 500, transition: 'opacity .3s' }}>
              <Ikon ikon={lagretMsg.includes('slettet') ? Trash2 : CircleCheck} size={14} />
              {lagretMsg}
            </span>
          )}
          <button className="btn" onClick={skrivUtRapport} title="Åpner utskriftsvennlig statusrapport — velg «Lagre som PDF» i utskriftsdialogen" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Ikon ikon={Printer} size={16} /> PDF-rapport
          </button>
          <button className="btn btn-primary" onClick={apneNy}>+ Legg til bil</button>
        </div>
      </div>

      {/* Summary-kort */}
      <div className="proj-summary-cards" style={{ marginBottom: 16 }}>
        {summaryCards.map((c, i) => {
          const aktiv = filter === c.key && c.key !== 'alle';
          return (
            <div
              key={i}
              className="proj-summary-card"
              style={{ borderLeft: `3px solid ${c.color}`, background: aktiv ? c.color : '#fff', cursor: c.key !== 'alle' ? 'pointer' : 'default' }}
              onClick={() => c.key !== 'alle' && setFilter(f => f === c.key ? 'alle' : c.key)}
            >
              <div className="proj-summary-icon"><Ikon ikon={c.icon} size={20} farge={aktiv ? '#fff' : c.color} /></div>
              <div className="proj-summary-count" style={{ color: aktiv ? '#fff' : c.color }}>{c.count}</div>
              <div className="proj-summary-label" style={{ color: aktiv ? 'rgba(255,255,255,.85)' : undefined }}>{c.label}</div>
            </div>
          );
        })}
      </div>

      {/* Søk + filter */}
      <div className="toolbar" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <input
          className="search-input"
          placeholder="Søk reg.nr., sjåfør, modell..."
          value={sok}
          onChange={e => setSok(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        {filter !== 'alle' && (
          <button className="btn btn-sm" onClick={() => setFilter('alle')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Ikon ikon={X} size={14} /> Fjern filter</button>
        )}
        <span style={{ fontSize: 12, color: '#5d6b80', marginLeft: 'auto' }}>
          {filtrert.length} av {biler.length} biler
        </span>
      </div>

      {/* Tabell */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              {['Modell','Reg.nr.','Sjåfør','EU-Kontroll','Service','Dekk','Dekklagring','KM','Restverdi','Problemer','Kommentar',''].map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrert.length === 0 && (
              <tr><td colSpan={12} style={{ padding: 24, textAlign: 'center', color: '#5d6b80' }}>Ingen biler matcher søket.</td></tr>
            )}
            {filtrert.map((b, idx) => {
              const eu = euStatus(b.euKontroll);
              const ledig = !b.sjafor;
              return (
                <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  {/* Modell */}
                  <td style={{ padding: '8px 12px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '2px 7px', fontWeight: 500 }}>
                      {b.modell}
                    </span>
                  </td>

                  {/* Reg.nr. */}
                  <td style={{ padding: '8px 12px', fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 14 }}>
                    {b.regNr}
                  </td>

                  {/* Sjåfør */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {ledig
                      ? <span style={{ color: '#b45309', fontWeight: 500, fontSize: 12 }}><Ikon ikon={Key} size={12} style={{ marginRight: 3 }} />LEDIG</span>
                      : <span style={{ color: '#1e293b' }}>{b.sjafor}</span>
                    }
                  </td>

                  {/* EU-Kontroll */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {b.euKontroll ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 11, color: '#5d6b80' }}>{fmt(b.euKontroll)}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, background: eu.bg, color: eu.farge, borderRadius: 4, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3, alignSelf: 'flex-start' }}>
                          <Ikon ikon={eu.ikon} size={11} /> {eu.label}
                        </span>
                      </div>
                    ) : <span style={{ color: '#cbd5e1' }}>–</span>}
                  </td>

                  {/* Planlagt service */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {b.planlagtService ? (() => {
                      const sv = serviceStatus(b.planlagtService);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 11, color: '#5d6b80' }}>{fmt(b.planlagtService)}</span>
                          <span style={{ fontSize: 11, fontWeight: 500, background: sv.bg, color: sv.farge, borderRadius: 4, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3, alignSelf: 'flex-start' }}>
                            <Ikon ikon={sv.ikon} size={11} /> {sv.label}
                          </span>
                        </div>
                      );
                    })() : <span style={{ color: '#cbd5e1' }}>–</span>}
                  </td>

                  {/* Dekk */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {b.dekkType ? (
                      <span style={{
                        fontSize: 12, fontWeight: 500, borderRadius: 4, padding: '2px 8px',
                        background: b.dekkType === 'V' ? '#dbeafe' : '#fef9c3',
                        color: b.dekkType === 'V' ? '#1d4ed8' : '#854d0e',
                      }}>
                        {b.dekkType === 'V'
                          ? <IkonTekst ikon={Snowflake} size={12} gap={4}>Vinter</IkonTekst>
                          : <IkonTekst ikon={Sun} size={12} gap={4}>Sommer</IkonTekst>}
                      </span>
                    ) : <span style={{ color: '#cbd5e1' }}>–</span>}
                  </td>

                  {/* Dekklagring */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: b.dekklagring ? '#374151' : '#cbd5e1', fontSize: 12 }}>
                    {b.dekklagring || '–'}
                  </td>

                  {/* KM */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {b.km ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontWeight: 500, color: '#1e293b' }}>{fmtKm(b.km)}</span>
                        {b.kmDato && <span style={{ fontSize: 10, color: '#5d6b80' }}>{fmt(b.kmDato)}</span>}
                      </div>
                    ) : <span style={{ color: '#cbd5e1' }}>–</span>}
                  </td>

                  {/* Restverdi Skatteetaten */}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {b.restverdiSkatteetaten
                      ? <span style={{ fontWeight: 500, color: '#166534' }}>{fmtRestverdi(b.restverdiSkatteetaten)}</span>
                      : <span style={{ color: '#cbd5e1' }}>–</span>}
                  </td>

                  {/* Problemer + erstatningsbil */}
                  <td style={{ padding: '8px 12px', maxWidth: 200 }}>
                    {(b.problemer || '').trim() ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 12, color: '#c2410c', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.problemer}>
                          <Ikon ikon={TriangleAlert} size={12} style={{ marginRight: 3 }} />{b.problemer}
                        </span>
                        {(b.erstatningsbil || '').trim() && (
                          <span style={{ fontSize: 11, color: '#5d6b80', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`Erstatningsbil: ${b.erstatningsbil}`}>
                            <Ikon ikon={Car} size={12} style={{ marginRight: 3 }} />{b.erstatningsbil}
                          </span>
                        )}
                      </div>
                    ) : <span style={{ color: '#cbd5e1' }}>–</span>}
                  </td>

                  {/* Kommentar */}
                  <td style={{ padding: '8px 12px', maxWidth: 220 }}>
                    {b.kommentar ? (
                      <span style={{ fontSize: 12, color: b.kommentar.toLowerCase().includes('bestillt') ? '#b45309' : '#5d6b80', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={b.kommentar}>
                        {b.kommentar}
                      </span>
                    ) : null}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => apneRediger(b)}>Rediger</button>
                      <button className="btn btn-sm btn-danger" onClick={() => slett(b.id)}>Slett</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editing ? `Rediger: ${editing.regNr}` : 'Legg til bil'} onClose={() => setShowModal(false)}>
          <div className="form">
            <div className="form-row">
              <div>
                <label>Modell *</label>
                <select value={form.modell} onChange={e => setForm(f => ({ ...f, modell: e.target.value }))}>
                  {MODELLER.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label>Reg.nr. *</label>
                <input
                  value={form.regNr}
                  onChange={e => setForm(f => ({ ...f, regNr: e.target.value.toUpperCase() }))}
                  placeholder="AB 12345"
                  style={{ fontFamily: 'monospace', fontWeight: 500 }}
                />
              </div>
            </div>

            <label>Sjåfør (la stå tom = LEDIG)</label>
            <input value={form.sjafor} onChange={e => setForm(f => ({ ...f, sjafor: e.target.value }))} placeholder="Navn på sjåfør" />

            <label>EU-Kontroll dato</label>
            <input type="date" value={form.euKontroll} onChange={e => setForm(f => ({ ...f, euKontroll: e.target.value }))} />

            <div className="form-row">
              <div>
                <label>Dekk type</label>
                <select value={form.dekkType} onChange={e => setForm(f => ({ ...f, dekkType: e.target.value }))}>
                  {DEKK_TYPER.map(t => <option key={t} value={t}>{t ? DEKK_LABELS[t] : '– Ikke satt –'}</option>)}
                </select>
              </div>
              <div>
                <label>Dekklagring</label>
                <select value={form.dekklagring} onChange={e => setForm(f => ({ ...f, dekklagring: e.target.value }))}>
                  {DEKKLAGRING.map(d => <option key={d} value={d}>{d || '– Ingen –'}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div>
                <label>Kilometerstand</label>
                <input type="number" value={form.km} onChange={e => setForm(f => ({ ...f, km: e.target.value }))} placeholder="f.eks. 125000" />
              </div>
              <div>
                <label>KM-dato</label>
                <input type="date" value={form.kmDato} onChange={e => setForm(f => ({ ...f, kmDato: e.target.value }))} />
              </div>
            </div>

            <div className="form-row">
              <div>
                <label>Planlagt service (hvis bestilt)</label>
                <input type="date" value={form.planlagtService || ''} onChange={e => setForm(f => ({ ...f, planlagtService: e.target.value }))} />
              </div>
              <div>
                <label>Restverdi hos Skatteetaten (kr)</label>
                <input type="number" value={form.restverdiSkatteetaten || ''} onChange={e => setForm(f => ({ ...f, restverdiSkatteetaten: e.target.value }))} placeholder="f.eks. 85000" />
              </div>
            </div>

            <label>Problemer / feil med bilen</label>
            <textarea value={form.problemer || ''} onChange={e => setForm(f => ({ ...f, problemer: e.target.value }))} rows={2} placeholder="f.eks. skyvedør henger, motorlampe lyser..." />

            <label>Erstatningsbil i reparasjonsperioden</label>
            <input value={form.erstatningsbil || ''} onChange={e => setForm(f => ({ ...f, erstatningsbil: e.target.value }))} placeholder="f.eks. leiebil VW Caddy EL 12345 fra Hertz" />

            <label>ABAX</label>
            <input value={form.abax} onChange={e => setForm(f => ({ ...f, abax: e.target.value }))} placeholder="ABAX-enhet ID" />

            <label>Kommentar</label>
            <textarea value={form.kommentar} onChange={e => setForm(f => ({ ...f, kommentar: e.target.value }))} rows={2} placeholder="Service, feil, oppgaver..." />

            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              <button className="btn btn-primary" onClick={lagre} disabled={!form.regNr.trim()}>Lagre</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
