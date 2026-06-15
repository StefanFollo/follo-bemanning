import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { dateToIso, addDays, weekStart } from '../store';

// Felles kalender for Service + Reklamasjon.
// Samme komponent vises på begge sider, så bildet er identisk.
// Ansvarlig planlegger NÅR en sak tas via planlagtDato (+ valgfri planlagtSluttDato).

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
function dagerMellom(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

export default function ServiceReklKalender() {
  const { state, dispatch } = useApp();
  const [ukeStart, setUkeStart] = useState(() => weekStart(dateToIso(new Date())));
  const [ansvarligFilter, setAnsvarligFilter] = useState('');
  const [valgtSak, setValgtSak] = useState(null);
  const [dragOverDag, setDragOverDag] = useState(null);
  const dragSak = useRef(null);

  const ansatte = state.ansatte || [];
  const today = dateToIso(new Date());

  const serviceJobber = (state.serviceJobber || [])
    .filter(j => j.status !== 'ferdig' && j.status !== 'fakturert')
    .map(j => ({ type: 'service', item: j, ansvarligId: j.ansvarligId, planlagtDato: j.planlagtDato || '', planlagtSluttDato: j.planlagtSluttDato || '', tittel: j.adresse || j.kontaktNavn || 'Service', undertittel: j.type || '' }));
  const reklamasjoner = (state.reklamasjoner || [])
    .filter(r => !['utbedret', 'avvist', 'lukket'].includes(r.status))
    .map(r => ({ type: 'reklamasjon', item: r, ansvarligId: r.ansvarligId, planlagtDato: r.planlagtDato || '', planlagtSluttDato: r.planlagtSluttDato || '', tittel: r.adresse || r.kontaktNavn || 'Reklamasjon', undertittel: r.type || '' }));

  let alle = [...serviceJobber, ...reklamasjoner];
  if (ansvarligFilter) alle = alle.filter(s => s.ansvarligId === ansvarligFilter);

  const planlagte = alle.filter(s => s.planlagtDato);
  const uplanlagte = alle.filter(s => !s.planlagtDato);
  const ansvarligIds = [...new Set([...serviceJobber, ...reklamasjoner].map(s => s.ansvarligId).filter(Boolean))];
  const ukeDager = Array.from({ length: 7 }, (_, i) => addDays(ukeStart, i));

  function lagre(sak, felt) {
    const action = sak.type === 'service' ? 'UPDATE_SERVICE_JOBB' : 'UPDATE_REKLAMASJON';
    const nyStatus = (felt.planlagtDato && sak.item.status === 'ny') ? 'planlagt' : sak.item.status;
    dispatch({ type: action, payload: { ...sak.item, ...felt, status: nyStatus } });
  }

  function flyttTil(sak, dato) {
    // Behold varighet ved flytting
    let nySlutt = '';
    if (sak.planlagtDato && sak.planlagtSluttDato) {
      const lengde = dagerMellom(sak.planlagtDato, sak.planlagtSluttDato);
      nySlutt = lengde > 0 ? addDays(dato, lengde) : '';
    }
    lagre(sak, { planlagtDato: dato, planlagtSluttDato: nySlutt });
  }

  function ansvarligNavn(id) {
    const a = ansatte.find(x => x.id === id);
    return a ? a.navn : '';
  }

  // Hvilke saker dekker en gitt dag (start ≤ dag ≤ slutt)
  function sakerPaaDag(dato) {
    return planlagte.filter(s => {
      const slutt = s.planlagtSluttDato || s.planlagtDato;
      return dato >= s.planlagtDato && dato <= slutt;
    });
  }

  function SakKort({ sak, dato }) {
    const info = TYPE_INFO[sak.type];
    const navn = ansvarligNavn(sak.ansvarligId);
    const slutt = sak.planlagtSluttDato || sak.planlagtDato;
    const flereDager = slutt > sak.planlagtDato;
    const erStart = !dato || dato === sak.planlagtDato;
    const erSlutt = dato === slutt;
    return (
      <div
        draggable
        onDragStart={() => { dragSak.current = sak; }}
        onDragEnd={() => { dragSak.current = null; setDragOverDag(null); }}
        onClick={() => setValgtSak(sak)}
        style={{
          background: info.bg, borderTop: `1px solid ${info.farge}44`, borderBottom: `1px solid ${info.farge}44`,
          borderLeft: erStart ? `3px solid ${info.farge}` : `3px solid ${info.farge}66`,
          borderRight: (flereDager && !erSlutt) ? 'none' : `1px solid ${info.farge}44`,
          borderTopLeftRadius: erStart ? 6 : 0, borderBottomLeftRadius: erStart ? 6 : 0,
          borderTopRightRadius: erSlutt ? 6 : 0, borderBottomRightRadius: erSlutt ? 6 : 0,
          padding: '5px 7px', marginBottom: 5, cursor: 'grab', fontSize: 12, position: 'relative',
        }}
        title="Dra for å flytte · klikk for å endre dato/varighet">
        {erStart ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, color: '#1e293b' }}>
              <span>{info.ikon}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sak.tittel}</span>
            </div>
            {navn && <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>👤 {navn}{flereDager ? ` · ${dagerMellom(sak.planlagtDato, slutt) + 1} dager` : ''}</div>}
          </>
        ) : (
          <div style={{ fontSize: 10, color: info.farge, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden' }}>↳ {sak.tittel}</div>
        )}
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
        <span style={{ fontSize: 11, color: '#0891b2' }}>🔧 Service</span>
        <span style={{ fontSize: 11, color: '#ea580c' }}>⚠️ Reklamasjon</span>
        {ansvarligIds.length > 0 && (
          <select className="input" style={{ height: 32, fontSize: 12, minWidth: 140 }}
            value={ansvarligFilter} onChange={e => setAnsvarligFilter(e.target.value)}>
            <option value="">👤 Alle ansvarlige</option>
            {ansvarligIds.map(id => <option key={id} value={id}>{ansvarligNavn(id)}</option>)}
          </select>
        )}
      </div>

      {/* Ukekalender */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {ukeDager.map((dato, i) => {
          const erIdag = dato === today;
          const erHelg = i >= 5;
          const saker = sakerPaaDag(dato);
          const erDragOver = dragOverDag === dato;
          return (
            <div key={dato}
              onDragOver={e => { e.preventDefault(); setDragOverDag(dato); }}
              onDragLeave={() => setDragOverDag(d => d === dato ? null : d)}
              onDrop={e => { e.preventDefault(); if (dragSak.current) flyttTil(dragSak.current, dato); dragSak.current = null; setDragOverDag(null); }}
              style={{
                minHeight: 130,
                background: erDragOver ? '#dbeafe' : erIdag ? '#eff6ff' : erHelg ? '#fafafa' : '#fff',
                border: `1px solid ${erDragOver ? '#3b82f6' : erIdag ? '#3b82f6' : '#f1f5f9'}`,
                borderRadius: 8, padding: 5, transition: 'background .1s',
              }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: erIdag ? '#2563eb' : erHelg ? '#94a3b8' : '#475569', marginBottom: 6, textAlign: 'center' }}>
                {DAG_KORT[i]} {new Date(dato + 'T00:00:00').getDate()}.
              </div>
              {saker.map(sak => <SakKort key={sak.type + sak.item.id} sak={sak} dato={dato} />)}
            </div>
          );
        })}
      </div>

      {/* Uplanlagte saker — kan dras inn på en dag */}
      {uplanlagte.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
            📥 Ikke planlagt ({uplanlagte.length}) — dra inn på en dag, eller klikk for å sette dato
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

      {/* Dato/varighet-popup */}
      {valgtSak && (() => {
        const slutt = valgtSak.planlagtSluttDato || valgtSak.planlagtDato;
        const antDager = valgtSak.planlagtDato ? (dagerMellom(valgtSak.planlagtDato, slutt) + 1) : 1;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => setValgtSak(null)}>
            <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
                {TYPE_INFO[valgtSak.type].ikon} {valgtSak.tittel}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                {TYPE_INFO[valgtSak.type].label}{valgtSak.undertittel ? ` · ${valgtSak.undertittel}` : ''}
                {ansvarligNavn(valgtSak.ansvarligId) && ` · 👤 ${ansvarligNavn(valgtSak.ansvarligId)}`}
              </div>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Startdato</label>
              <input type="date" className="input" value={valgtSak.planlagtDato || ''}
                onChange={e => { flyttTil(valgtSak, e.target.value); setValgtSak({ ...valgtSak, planlagtDato: e.target.value }); }}
                style={{ marginBottom: 12 }} autoFocus />

              {valgtSak.planlagtDato && (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                    Varighet: <strong>{antDager} dag{antDager !== 1 ? 'er' : ''}</strong>
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                    {[1, 2, 3, 4, 5].map(d => {
                      const nySlutt = d === 1 ? '' : addDays(valgtSak.planlagtDato, d - 1);
                      return (
                        <button key={d}
                          className="btn btn-sm"
                          style={antDager === d ? { background: '#2563eb', color: '#fff', borderColor: '#2563eb' } : undefined}
                          onClick={() => { lagre(valgtSak, { planlagtSluttDato: nySlutt }); setValgtSak({ ...valgtSak, planlagtSluttDato: nySlutt }); }}>
                          {d} dag{d !== 1 ? 'er' : ''}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                {valgtSak.planlagtDato && (
                  <button className="btn btn-sm" style={{ color: '#dc2626' }}
                    onClick={() => { lagre(valgtSak, { planlagtDato: '', planlagtSluttDato: '' }); setValgtSak(null); }}>✕ Fjern fra kalender</button>
                )}
                <div style={{ flex: 1 }} />
                <button className="btn btn-sm" onClick={() => setValgtSak(null)}>Lukk</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
