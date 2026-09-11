// Pipeline-rullegardinen i Bemanning → Oversikt / Storskjerm / Fullskjerm
// (postkasse-oppdrag 27). Samme data og oppførsel som rullegardinen i
// Ukeoversikt (PipelineRader), men rendret i Oversikt-tidslinjens geometri:
// .oversikt-row med sticky label (LABEL_W) og dag-kolonner à DAY_W px, så
// den følger zoom og kolonnene som ansattradene. Dra raden på en ansatt-rad
// håndteres av OversiktVisning (tildeling + toast med Angre). Ikke med i
// Uke-PDF (den bygges fra bemannede tildelinger alene).

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, CalendarDays, Rocket } from 'lucide-react';
import { Ikon } from './Ikon';
import { weekStart, uid, PROSJEKT_PALETTE } from '../store';
import { pipelineListe, ukeNr, ukeEtikett, pipelineLoggInnslag } from '../pipeline';
import { leggKandidater, byggPipelineProsjekt } from '../leggIPipeline';

const SIKKERHET = { fast: 'Vunnet', sannsynlig: 'Sannsynlig', mulig: 'Mulig' };
const brukerNavn = () => localStorage.getItem('fbs_user_navn') || 'ukjent';
const kanDra = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: fine)').matches;

export default function PipelineOversiktRader({ state, dispatch, readOnly, allDays, DAY_W, LABEL_W, kompakt, onPlanleggInn = null, onStartDrag = null }) {
  const [apen, setApenState] = useState(() => localStorage.getItem('fbs_pipeline_rullegardin') === '1');
  const setApen = v => { localStorage.setItem('fbs_pipeline_rullegardin', v ? '1' : '0'); setApenState(v); };
  const [redigerId, setRedigerId] = useState(null);
  const [redigerDato, setRedigerDato] = useState('');
  const [visLeggTil, setVisLeggTil] = useState(false);
  const [leggForm, setLeggForm] = useState({ befaringId: '', forventetStart: '', forventetUker: 2, forventetFolk: 2 });

  const liste = pipelineListe(state.prosjekter, state.tildelinger);
  const kandidater = leggKandidater(state.befaringer, state.prosjekter);
  const draTillatt = !readOnly && kanDra();
  const totalW = allDays.length * DAY_W;
  const rowH = kompakt ? 22 : 30;
  const headH = kompakt ? 22 : 26;
  const inputStil = { height: 24, fontSize: 11 };

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

  const stickyLabel = { width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3, background: '#fff', borderRight: '2px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', minWidth: 0 };

  return (
    <React.Fragment>
      <div key="pl-header" data-pipeline-oversikt style={{ display: 'flex', height: headH, alignItems: 'stretch', background: '#eff6ff', borderTop: '2px solid #2563eb', borderBottom: '1px solid #bfdbfe', minWidth: LABEL_W + totalW, cursor: 'pointer' }}
        onClick={() => setApen(!apen)}>
        <div style={{ ...stickyLabel, cursor: 'pointer' }}>
          <Ikon ikon={apen ? ChevronDown : ChevronRight} size={12} farge="#2563eb" />
          <Ikon ikon={Rocket} size={12} farge="#2563eb" />
          <span style={{ fontWeight: 600, fontSize: 12, color: '#2563eb', whiteSpace: 'nowrap' }}>Pipeline – ikke startet ({liste.length})</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', fontSize: 11, color: '#5d6b80', position: 'sticky', left: LABEL_W }}>
          <span>{draTillatt ? 'dra en rad opp på en ansatt, eller Planlegg inn' : 'Planlegg inn legger folk på jobben'}</span>
          {!readOnly && (
            <button className="btn btn-sm" style={{ height: 20, fontSize: 10.5, padding: '0 7px', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={e => { e.stopPropagation(); setVisLeggTil(v => !v); }}>
              <Ikon ikon={Plus} size={11} /> Legg i pipeline
            </button>
          )}
        </div>
      </div>

      {apen && visLeggTil && (
        <div key="pl-legg" style={{ display: 'flex', minWidth: LABEL_W + totalW, background: '#eff6ff', borderBottom: '1px solid #dbeafe' }}>
          <div style={{ position: 'sticky', left: 0, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', background: '#eff6ff', zIndex: 3 }}>
            <select className="input" style={{ ...inputStil, maxWidth: 260 }} value={leggForm.befaringId} onChange={e => setLeggForm(s => ({ ...s, befaringId: e.target.value }))}>
              <option value="">Velg tilbud / befaring…</option>
              {kandidater.filter(b => b.status === 'godkjent').length > 0 && <optgroup label="Vunne tilbud uten prosjekt">
                {kandidater.filter(b => b.status === 'godkjent').map(b => <option key={b.id} value={b.id}>{b.kontaktNavn} – {b.adresse}</option>)}
              </optgroup>}
              {kandidater.filter(b => b.status !== 'godkjent').length > 0 && <optgroup label="Sendte tilbud / befaringer (sannsynlig / mulig)">
                {kandidater.filter(b => b.status !== 'godkjent').map(b => <option key={b.id} value={b.id}>{b.kontaktNavn} – {b.adresse}</option>)}
              </optgroup>}
            </select>
            <input type="date" className="input" style={inputStil} value={leggForm.forventetStart} onChange={e => setLeggForm(s => ({ ...s, forventetStart: e.target.value }))} title="Forventet start" />
            <input type="number" min="1" className="input" style={{ ...inputStil, width: 52 }} value={leggForm.forventetUker} onChange={e => setLeggForm(s => ({ ...s, forventetUker: e.target.value }))} title="Uker" />
            <input type="number" min="1" className="input" style={{ ...inputStil, width: 52 }} value={leggForm.forventetFolk} onChange={e => setLeggForm(s => ({ ...s, forventetFolk: e.target.value }))} title="Folk" />
            <button className="btn btn-sm btn-primary" style={{ height: 24, fontSize: 11 }} disabled={!leggForm.befaringId} onClick={leggTil}>Legg til</button>
            <button className="btn btn-sm" style={{ height: 24, fontSize: 11 }} onClick={() => setVisLeggTil(false)}>Avbryt</button>
          </div>
        </div>
      )}

      {apen && liste.length === 0 && (
        <div key="pl-tom" style={{ display: 'flex', minWidth: LABEL_W + totalW }}>
          <div style={{ position: 'sticky', left: 0, padding: '6px 12px', fontSize: 11.5, color: '#5d6b80' }}>Ingen prosjekter venter på oppstart.</div>
        </div>
      )}

      {apen && liste.map(r => {
        const p = (state.prosjekter || []).find(x => x.id === r.prosjektId);
        const erUsikker = r.sikkerhet !== 'fast';
        const farge = r.startPassert ? '#dc2626' : erUsikker ? '#5d6b80' : '#2563eb';
        const nUker = Math.max(1, r.uker || 1);
        let bar = null;
        if (r.start && !r.startPassert) {
          const si = allDays.findIndex(d => d >= r.start);
          if (si >= 0) {
            const slutt = weekStart(r.start) < r.start ? r.start : r.start;
            const sluttDag = new Date(slutt + 'T00:00:00'); sluttDag.setDate(sluttDag.getDate() + (nUker - 1) * 7 + 4);
            const sluttIso = sluttDag.toISOString().slice(0, 10);
            let ei = -1;
            for (let i = allDays.length - 1; i >= 0; i--) { if (allDays[i] <= sluttIso) { ei = i; break; } }
            if (ei >= si) bar = { left: si * DAY_W + 2, width: (ei - si + 1) * DAY_W - 4 };
          }
        }
        const redigerer = redigerId === r.prosjektId;
        return (
          <div key={'pl-' + r.prosjektId} className="oversikt-row" data-pipeline-rad={r.prosjektId} style={{ height: rowH }}
            onPointerDown={e => { if (draTillatt && onStartDrag && !e.target.closest('button,input,select')) onStartDrag(e, { kind: 'pipeline', payload: { prosjektId: r.prosjektId }, tekst: r.navn }); }}
            title={draTillatt ? 'Dra raden opp på en ansatt i uka jobben skal gjøres' : undefined}>
            <div className="oversikt-row-label" style={{ width: LABEL_W, height: rowH, cursor: draTillatt ? 'grab' : 'default', background: !r.start ? '#fffbeb' : undefined, gap: 6 }}>
              <span className="oversikt-row-navn" style={{ fontSize: kompakt ? 11 : 12, fontWeight: 500 }}>{r.navn}</span>
              {!r.start
                ? <button onClick={e => { e.stopPropagation(); setRedigerId(r.prosjektId); setRedigerDato(''); }} disabled={readOnly}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#b45309', fontWeight: 700, fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                    <Ikon ikon={CalendarDays} size={10} /> Sett start
                  </button>
                : r.startPassert
                  ? <button onClick={e => { e.stopPropagation(); setRedigerId(r.prosjektId); setRedigerDato(''); }} disabled={readOnly}
                      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: 10.5, whiteSpace: 'nowrap' }}>
                      Start passert
                    </button>
                  : <span style={{ fontSize: 10.5, color: farge, whiteSpace: 'nowrap' }}>u{ukeNr(r.start)}{erUsikker ? '?' : ''} · {r.folk || 2} folk</span>}
            </div>
            <div className="oversikt-bars-area" style={{ width: totalW, height: rowH, position: 'relative' }}>
              {bar && (
                <div style={{ position: 'absolute', left: bar.left, width: bar.width, top: 3, height: rowH - 6, border: `2px dashed ${farge}`, borderRadius: 6, background: farge + '14', display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: kompakt ? 9 : 10.5, fontWeight: 600, color: farge, whiteSpace: 'nowrap', overflow: 'hidden', pointerEvents: 'none' }}>
                  {ukeEtikett(r.start, nUker)} · {SIKKERHET[r.sikkerhet] || r.sikkerhet}
                </div>
              )}
              {!readOnly && onPlanleggInn && r.start && !r.startPassert && (
                <button onClick={e => { e.stopPropagation(); onPlanleggInn(r.prosjektId); }} title="Åpne planleggingsmodus for prosjektet"
                  style={{ position: 'sticky', left: LABEL_W + 6, marginLeft: 6, top: 4, border: `1px solid ${farge}`, background: '#fff', color: farge, borderRadius: 5, fontSize: 10, fontWeight: 700, padding: '0 6px', cursor: 'pointer', height: rowH - 8, zIndex: 2 }}>
                  Planlegg inn
                </button>
              )}
              {redigerer && (
                <div onClick={e => e.stopPropagation()} style={{ position: 'sticky', left: LABEL_W + 6, marginLeft: 6, top: 2, display: 'inline-flex', gap: 5, alignItems: 'center', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '2px 7px', zIndex: 4 }}>
                  <input type="date" className="input" style={inputStil} value={redigerDato} onChange={e => setRedigerDato(e.target.value)} />
                  <button className="btn btn-sm btn-primary" style={{ height: 22, fontSize: 10.5 }} disabled={!redigerDato} onClick={() => p && settStart(p, redigerDato)}>Lagre</button>
                  <button className="btn btn-sm" style={{ height: 22, fontSize: 10.5 }} onClick={() => setRedigerId(null)}>Avbryt</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </React.Fragment>
  );
}
