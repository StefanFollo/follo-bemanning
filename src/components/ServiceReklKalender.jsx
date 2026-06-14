import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { dateToIso, addDays, weekStart } from '../store';

// Felles kalender for Service + Reklamasjon.
// Samme komponent vises på begge sider, så bildet er identisk.
// Ansvarlig planlegger NÅR en sak tas via planlagtDato.

const DAG_NAVN = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const DAG_KORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

const TYPE_INFO = {
  service:    { label: 'Service',    farge: '#0891b2', bg: '#ecfeff', ikon: '🔧' },
  reklamasjon:{ label: 'Reklamasjon', farge: '#ea580c', bg: '#fff7ed', ikon: '⚠️' },
};

function fmtDag(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()}. ${MND[d.getMonth()]}`;
}

export default function ServiceReklKalender() {
  const { state, dispatch } = useApp();
  const [ukeStart, setUkeStart] = useState(() => weekStart(dateToIso(new Date())));
  const [ansvarligFilter, setAnsvarligFilter] = useState('');
  const [valgtSak, setValgtSak] = useState(null);  // { type, item } for dato-popup

  const ansatte = state.ansatte || [];
  const today = dateToIso(new Date());

  // Samle alle saker fra begge kilder med en felles form
  const serviceJobber = (state.serviceJobber || [])
    .filter(j => j.status !== 'ferdig')
    .map(j => ({ type: 'service', item: j, ansvarligId: j.ansvarligId, planlagtDato: j.planlagtDato || '', tittel: j.adresse || j.kontaktNavn || 'Service', undertittel: j.type || '' }));
  const reklamasjoner = (state.reklamasjoner || [])
    .filter(r => !['utbedret', 'avvist', 'lukket'].includes(r.status))
    .map(r => ({ type: 'reklamasjon', item: r, ansvarligId: r.ansvarligId, planlagtDato: r.planlagtDato || '', tittel: r.adresse || r.kontaktNavn || 'Reklamasjon', undertittel: r.type || '' }));

  let alle = [...serviceJobber, ...reklamasjoner];
  if (ansvarligFilter) alle = alle.filter(s => s.ansvarligId === ansvarligFilter);

  const planlagte = alle.filter(s => s.planlagtDato);
  const uplanlagte = alle.filter(s => !s.planlagtDato);

  // Ansatte som er ansvarlig for minst én sak
  const ansvarligIds = [...new Set([...serviceJobber, ...reklamasjoner].map(s => s.ansvarligId).filter(Boolean))];

  const ukeDager = Array.from({ length: 7 }, (_, i) => addDays(ukeStart, i));

  function setPlanlagt(sak, dato) {
    const action = sak.type === 'service' ? 'UPDATE_SERVICE_JOBB' : 'UPDATE_REKLAMASJON';
    const nyStatus = sak.item.status === 'ny' ? 'planlagt' : sak.item.status;
    dispatch({ type: action, payload: { ...sak.item, planlagtDato: dato, status: nyStatus } });
    setValgtSak(null);
  }

  function ansvarligNavn(id) {
    const a = ansatte.find(x => x.id === id);
    return a ? a.navn : '';
  }

  function SakKort({ sak, kompakt }) {
    const info = TYPE_INFO[sak.type];
    const navn = ansvarligNavn(sak.ansvarligId);
    return (
      <div onClick={() => setValgtSak(sak)}
        style={{ background: info.bg, border: `1px solid ${info.farge}44`, borderLeft: `3px solid ${info.farge}`, borderRadius: 6, padding: kompakt ? '5px 7px' : '7px 9px', marginBottom: 5, cursor: 'pointer', fontSize: 12 }}
        title="Klikk for å endre dato eller markere ferdig">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, color: '#1e293b' }}>
          <span>{info.ikon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sak.tittel}</span>
        </div>
        {sak.undertittel && <div style={{ fontSize: 10, color: info.farge, marginTop: 1 }}>{sak.undertittel}</div>}
        {navn && <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>👤 {navn}</div>}
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      {/* Navigasjon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => setUkeStart(addDays(ukeStart, -7))}>← Forrige</button>
        <button className="btn btn-sm" onClick={() => setUkeStart(weekStart(today))}>I dag</button>
        <button className="btn btn-sm" onClick={() => setUkeStart(addDays(ukeStart, 7))}>Neste →</button>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginLeft: 4 }}>
          Uke {fmtDag(ukeStart)} – {fmtDag(addDays(ukeStart, 6))}
        </span>
        <div style={{ flex: 1 }} />
        {/* Legend */}
        <span style={{ fontSize: 11, color: '#0891b2', display: 'flex', alignItems: 'center', gap: 3 }}>🔧 Service</span>
        <span style={{ fontSize: 11, color: '#ea580c', display: 'flex', alignItems: 'center', gap: 3 }}>⚠️ Reklamasjon</span>
        {ansvarligIds.length > 0 && (
          <select className="input" style={{ height: 32, fontSize: 12, minWidth: 140 }}
            value={ansvarligFilter} onChange={e => setAnsvarligFilter(e.target.value)}>
            <option value="">👤 Alle ansvarlige</option>
            {ansvarligIds.map(id => <option key={id} value={id}>{ansvarligNavn(id)}</option>)}
          </select>
        )}
      </div>

      {/* Ukekalender */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {ukeDager.map((dato, i) => {
          const erIdag = dato === today;
          const erHelg = i >= 5;
          const sakerIdag = planlagte.filter(s => s.planlagtDato === dato);
          return (
            <div key={dato}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('sakIdx'); if (id !== '') setPlanlagt(uplanlagte[parseInt(id, 10)] || planlagte.find(s => s._dragId === id), dato); }}
              style={{ minHeight: 120, background: erIdag ? '#eff6ff' : erHelg ? '#fafafa' : '#fff', border: `1px solid ${erIdag ? '#3b82f6' : '#f1f5f9'}`, borderRadius: 8, padding: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: erIdag ? '#2563eb' : erHelg ? '#94a3b8' : '#475569', marginBottom: 6, textAlign: 'center' }}>
                {DAG_KORT[i]} {new Date(dato + 'T00:00:00').getDate()}.
              </div>
              {sakerIdag.map((sak, idx) => <SakKort key={sak.type + sak.item.id} sak={sak} kompakt />)}
            </div>
          );
        })}
      </div>

      {/* Uplanlagte saker */}
      {uplanlagte.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
            📥 Ikke planlagt ({uplanlagte.length}) — klikk for å sette dato
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {uplanlagte.map(sak => (
              <div key={sak.type + sak.item.id} style={{ width: 200 }}>
                <SakKort sak={sak} />
              </div>
            ))}
          </div>
        </div>
      )}

      {planlagte.length === 0 && uplanlagte.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 0', fontSize: 13 }}>
          Ingen åpne service- eller reklamasjonssaker.
        </div>
      )}

      {/* Dato-popup */}
      {valgtSak && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setValgtSak(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', maxWidth: 380, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
              {TYPE_INFO[valgtSak.type].ikon} {valgtSak.tittel}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              {TYPE_INFO[valgtSak.type].label}{valgtSak.undertittel ? ` · ${valgtSak.undertittel}` : ''}
              {ansvarligNavn(valgtSak.ansvarligId) && ` · 👤 ${ansvarligNavn(valgtSak.ansvarligId)}`}
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Når skal dette tas?</label>
            <input type="date" className="input" defaultValue={valgtSak.planlagtDato || ''}
              onChange={e => setPlanlagt(valgtSak, e.target.value)}
              style={{ marginBottom: 12 }} autoFocus />

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {[{ l: 'I dag', d: today }, { l: 'I morgen', d: addDays(today, 1) }, { l: 'Denne uka', d: addDays(weekStart(today), 2) }].map(v => (
                <button key={v.l} className="btn btn-sm" onClick={() => setPlanlagt(valgtSak, v.d)}>{v.l}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              {valgtSak.planlagtDato && (
                <button className="btn btn-sm" style={{ color: '#dc2626' }}
                  onClick={() => setPlanlagt(valgtSak, '')}>✕ Fjern dato</button>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn btn-sm" onClick={() => setValgtSak(null)}>Lukk</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
