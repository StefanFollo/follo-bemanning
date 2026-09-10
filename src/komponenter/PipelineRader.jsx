// Rullegardinen «▸ Pipeline – ikke startet (N)» nederst i Ukeoversikt
// (postkasse-oppdrag 25, erstatter «Ikke bemannet»-stripen fra #21).
// Rendres som grid-celler rett i .uke-grid slik at ukekolonnene og den
// horisontale scrollen deles med ansattradene over — PL ser pipelinen rett
// under folka. Samme data som Prosjekter → Pipeline (pipelineListe), ingen
// egen lagring. Legge inn: dra raden på en ansatt-celle i en uke (håndteres
// av Ukeoversikt: tildeling for den uka + toast med Angre) eller «Planlegg
// inn» (planleggingsmodus fra #22). Første tildeling → prosjektet er Startet
// og raden forsvinner av seg selv.

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { Ikon } from './Ikon';
import { weekStart, uid, PROSJEKT_PALETTE } from '../store';
import { pipelineListe, ukeNr, ukeEtikett, pipelineLoggInnslag } from '../pipeline';
import { leggKandidater, byggPipelineProsjekt } from '../leggIPipeline';

const SIKKERHET = { fast: 'Vunnet', sannsynlig: 'Sannsynlig', mulig: 'Mulig' };
const brukerNavn = () => localStorage.getItem('fbs_user_navn') || 'ukjent';
// Mobil/touch: ingen drag — kun «Planlegg inn»
const kanDra = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: fine)').matches;

export default function PipelineRader({ state, dispatch, days, readOnly, onPlanleggInn = null }) {
  const [apen, setApenState] = useState(() => localStorage.getItem('fbs_pipeline_rullegardin') === '1');
  const setApen = v => { localStorage.setItem('fbs_pipeline_rullegardin', v ? '1' : '0'); setApenState(v); };
  const [redigerId, setRedigerId] = useState(null);
  const [redigerDato, setRedigerDato] = useState('');
  const [visLeggTil, setVisLeggTil] = useState(false);
  const [leggForm, setLeggForm] = useState({ befaringId: '', forventetStart: '', forventetUker: 2, forventetFolk: 2 });

  const mandager = [...new Set(days.map(d => weekStart(d)))];
  const N = mandager.length;
  const liste = pipelineListe(state.prosjekter, state.tildelinger);
  const kandidater = leggKandidater(state.befaringer, state.prosjekter);
  const draTillatt = !readOnly && kanDra();

  function settStart(p, dato) {
    const ny = dato ? weekStart(dato) : null;
    const g = p.pipeline || {};
    dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, pipeline: { sikkerhet: 'fast', ...g, forventetStart: ny },
      pipelineLogg: [...(p.pipelineLogg || []), pipelineLoggInnslag(`Forventet start ${g.forventetStart ? 'u' + ukeNr(g.forventetStart) : 'ikke satt'} → ${ny ? 'u' + ukeNr(ny) : 'ikke satt'}`, brukerNavn())] } });
    setRedigerId(null); setRedigerDato('');
  }

  function leggTil() {
    const b = kandidater.find(x => x.id === leggForm.befaringId);
    if (!b) return;
    const brukt = state.prosjekter.map(p => p.farge).filter(Boolean);
    const farge = PROSJEKT_PALETTE.find(c => !brukt.includes(c)) || PROSJEKT_PALETTE[state.prosjekter.length % PROSJEKT_PALETTE.length];
    const { prosjekt, befaring } = byggPipelineProsjekt(b, leggForm, { prosjektId: uid(), farge, brukerNavn: brukerNavn() });
    dispatch({ type: 'ADD_PROSJEKT', payload: prosjekt });
    dispatch({ type: 'UPDATE_BEFARING', payload: befaring });
    setVisLeggTil(false);
    setLeggForm({ befaringId: '', forventetStart: '', forventetUker: 2, forventetFolk: 2 });
  }

  const inputStil = { height: 28, fontSize: 12 };

  return (
    <React.Fragment>
      <div className="uke-prosjekt-header" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #2563eb', cursor: 'pointer', position: 'sticky', left: 0 }}
        onClick={() => setApen(!apen)}>
        <Ikon ikon={apen ? ChevronDown : ChevronRight} size={14} />
        <span className="uke-prosjekt-navn">Pipeline – ikke startet ({liste.length})</span>
        <span className="uke-prosjekt-antall">{draTillatt ? 'dra en rad opp på en ansatt, eller Planlegg inn' : 'Planlegg inn legger folk på jobben'}</span>
        {!readOnly && (
          <button className="btn btn-sm" style={{ marginLeft: 'auto', height: 24, fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={e => { e.stopPropagation(); setVisLeggTil(v => !v); }}>
            <Ikon ikon={Plus} size={12} /> Legg i pipeline
          </button>
        )}
      </div>

      {apen && visLeggTil && (
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', position: 'sticky', left: 0 }}>
          <select className="input" style={{ ...inputStil, maxWidth: 300 }} value={leggForm.befaringId} onChange={e => setLeggForm(s => ({ ...s, befaringId: e.target.value }))}>
            <option value="">Velg tilbud / befaring…</option>
            {kandidater.filter(b => b.status === 'godkjent').length > 0 && <optgroup label="Vunne tilbud uten prosjekt">
              {kandidater.filter(b => b.status === 'godkjent').map(b => <option key={b.id} value={b.id}>{b.kontaktNavn} – {b.adresse}</option>)}
            </optgroup>}
            {kandidater.filter(b => b.status !== 'godkjent').length > 0 && <optgroup label="Sendte tilbud / befaringer (sannsynlig / mulig)">
              {kandidater.filter(b => b.status !== 'godkjent').map(b => <option key={b.id} value={b.id}>{b.kontaktNavn} – {b.adresse}</option>)}
            </optgroup>}
          </select>
          <label style={{ fontSize: 12 }}>Start <input type="date" className="input" style={inputStil} value={leggForm.forventetStart} onChange={e => setLeggForm(s => ({ ...s, forventetStart: e.target.value }))} /></label>
          <label style={{ fontSize: 12 }}>Uker <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={leggForm.forventetUker} onChange={e => setLeggForm(s => ({ ...s, forventetUker: e.target.value }))} /></label>
          <label style={{ fontSize: 12 }}>Folk <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={leggForm.forventetFolk} onChange={e => setLeggForm(s => ({ ...s, forventetFolk: e.target.value }))} /></label>
          <button className="btn btn-sm btn-primary" style={{ height: 28 }} disabled={!leggForm.befaringId} onClick={leggTil}>Legg til</button>
          <button className="btn btn-sm" style={{ height: 28 }} onClick={() => setVisLeggTil(false)}>Avbryt</button>
        </div>
      )}

      {apen && liste.length === 0 && (
        <div style={{ gridColumn: '1 / -1', padding: '10px 14px', fontSize: 12.5, color: '#5d6b80', position: 'sticky', left: 0 }}>
          Ingen prosjekter venter på oppstart.
        </div>
      )}

      {apen && liste.map(r => {
        const p = (state.prosjekter || []).find(x => x.id === r.prosjektId);
        const erUsikker = r.sikkerhet !== 'fast';
        const farge = r.startPassert ? '#dc2626' : erUsikker ? '#5d6b80' : '#2563eb';
        const rawStart = r.start ? Math.round((new Date(r.start + 'T00:00:00') - new Date(mandager[0] + 'T00:00:00')) / (7 * 86400000)) : 0;
        const nUker = Math.max(1, r.uker || 1);
        const visStart = Math.max(0, rawStart);
        const visSlutt = Math.min(N, rawStart + nUker);
        const bredde = r.start && !r.startPassert ? Math.max(0, visSlutt - visStart) : 0;
        const redigerer = redigerId === r.prosjektId;
        return (
          <React.Fragment key={r.prosjektId}>
            <div className="uke-row-label"
              draggable={draTillatt}
              onDragStart={e => { e.dataTransfer.setData('text/fbs-pipeline', r.prosjektId); e.dataTransfer.effectAllowed = 'copy'; }}
              style={{ cursor: draTillatt ? 'grab' : 'default', background: !r.start ? '#fffbeb' : undefined }}
              title={draTillatt ? 'Dra raden opp på en ansatt i uka jobben skal gjøres' : undefined}>
              <div style={{ minWidth: 0 }}>
                <div className="row-navn" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.navn}</div>
                <div className="row-fag" style={{ color: farge, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!r.start
                    ? <button onClick={() => { setRedigerId(r.prosjektId); setRedigerDato(''); }} disabled={readOnly}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#b45309', fontWeight: 700, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Ikon ikon={CalendarDays} size={11} /> Sett start
                      </button>
                    : r.startPassert
                      ? <button onClick={() => { setRedigerId(r.prosjektId); setRedigerDato(''); }} disabled={readOnly}
                          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: 11 }}>
                          Start passert · sett ny
                        </button>
                      : <span>u{ukeNr(r.start)}{erUsikker ? '?' : ''} · {r.folk || 2} folk</span>}
                  {!readOnly && onPlanleggInn && r.start && !r.startPassert && (
                    <button onClick={() => onPlanleggInn(r.prosjektId)} title="Åpne planleggingsmodus for prosjektet"
                      style={{ border: '1px solid #2563eb', background: '#fff', color: '#2563eb', borderRadius: 5, fontSize: 10.5, fontWeight: 700, padding: '0 6px', cursor: 'pointer' }}>
                      Planlegg inn
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div style={{ gridColumn: '2 / -1', position: 'relative', minHeight: 40, borderBottom: '1px solid #f1f5f9' }}>
              {bredde > 0 && (
                <div style={{
                  position: 'absolute', top: 7, height: 26,
                  left: (visStart / N * 100) + '%', width: (bredde / N * 100) + '%',
                  border: `2px dashed ${farge}`, borderRadius: 7, background: farge + '14',
                  display: 'flex', alignItems: 'center', padding: '0 8px',
                  fontSize: 11.5, fontWeight: 600, color: farge, whiteSpace: 'nowrap', overflow: 'hidden', pointerEvents: 'none',
                }}>
                  {ukeEtikett(r.start, nUker)} · {SIKKERHET[r.sikkerhet] || r.sikkerhet}
                </div>
              )}
              {redigerer && (
                <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: 8, top: 5, display: 'flex', gap: 6, alignItems: 'center', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '3px 8px', zIndex: 5 }}>
                  <span style={{ fontSize: 11.5, color: '#92400e', fontWeight: 600 }}>Uke:</span>
                  <input type="date" className="input" style={inputStil} value={redigerDato} onChange={e => setRedigerDato(e.target.value)} />
                  <button className="btn btn-sm btn-primary" style={{ height: 26, fontSize: 11 }} disabled={!redigerDato} onClick={() => p && settStart(p, redigerDato)}>Lagre</button>
                  <button className="btn btn-sm" style={{ height: 26, fontSize: 11 }} onClick={() => setRedigerId(null)}>Avbryt</button>
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </React.Fragment>
  );
}
