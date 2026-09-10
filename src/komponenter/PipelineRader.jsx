// «Ikke bemannet»-seksjonen nederst i bemanningsplanen (postkasse-oppdrag 21).
// Rendres som grid-celler rett i .uke-grid slik at kolonnene og den
// horisontale scrollen deles med personradene over. Vunne tilbud legges hit
// automatisk (pipeline settes ved prosjektopprettelse); PL kan i tillegg
// legge inn tilbud/befaringer manuelt som sannsynlig/mulig.
// Ingen sletting: dra ut av plan = tilbake i pipeline; logg er append-only.

import React, { useState, useRef } from 'react';
import { ChevronDown, ChevronRight, Plus, ArrowUp, Pencil } from 'lucide-react';
import { Ikon } from './Ikon';
import { addDays, weekStart } from '../store';
import { pipelineRader, ukeKapasitet, kapasitetNivaa, ukeNr, pipelineLoggInnslag } from '../pipeline';

const SIKKERHET = { fast: 'Fast', sannsynlig: 'Sannsynlig', mulig: 'Mulig' };
const NIVAA_FARGE = { ok: '#15803d', gul: '#b45309', roed: '#dc2626' };
const NIVAA_BG = { ok: '#f0fdf4', gul: '#fef3c7', roed: '#fee2e2' };

const brukerNavn = () => localStorage.getItem('fbs_user_navn') || 'ukjent';

export default function PipelineRader({ state, dispatch, days, planAnsatte, readOnly, onBemann }) {
  const [apen, setApenState] = useState(() => localStorage.getItem('fbs_pipeline_apen') !== '0');
  const setApen = v => { localStorage.setItem('fbs_pipeline_apen', v ? '1' : '0'); setApenState(v); };
  const [redigerId, setRedigerId] = useState(null);
  const [redigerForm, setRedigerForm] = useState(null); // { forventetStart, forventetUker, forventetFolk, sikkerhet }
  const [visLeggTil, setVisLeggTil] = useState(false);
  const [leggTilForm, setLeggTilForm] = useState({ valg: '', forventetStart: '', forventetUker: 2, forventetFolk: 2, sikkerhet: 'sannsynlig' });
  const dragInfo = useRef(null); // { rad, modus: 'flytt'|'resize', startX, ukeBredde }
  const [dragPreview, setDragPreview] = useState(null); // { radId, forventetStart, forventetUker }

  const mandager = [...new Set(days.map(d => weekStart(d)))];
  const N = mandager.length;

  const alleRader = pipelineRader(state.prosjekter, state.befaringer, state.tildelinger);
  // Uten dato vises alltid; med dato vises når perioden treffer visningsvinduet
  const rader = alleRader.filter(r => !r.pipeline.forventetStart || r.uker.some(u => mandager.includes(u)));

  function oppdaterPipeline(rad, endringer, loggTekst) {
    if (rad.type === 'befaring') {
      const b = (state.befaringer || []).find(x => x.id === rad.befaringId);
      if (!b) return;
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, pipeline: { ...b.pipeline, ...endringer } } });
    } else {
      const p = (state.prosjekter || []).find(x => x.id === rad.prosjektId);
      if (!p) return;
      dispatch({
        type: 'UPDATE_PROSJEKT',
        payload: {
          ...p,
          pipeline: { ...(p.pipeline || rad.pipeline), ...endringer },
          pipelineLogg: [...(p.pipelineLogg || []), pipelineLoggInnslag(loggTekst, brukerNavn())],
        },
      });
    }
  }

  // ── Drag: flytt (uke-oppløsning) og endre lengde i høyre kant ──
  function startDrag(e, rad, modus) {
    if (readOnly || rad.type === 'hull' || !rad.pipeline.forventetStart) return;
    e.preventDefault(); e.stopPropagation();
    const track = e.currentTarget.closest('[data-pl-track]');
    if (!track) return;
    dragInfo.current = { rad, modus, startX: e.clientX, ukeBredde: track.clientWidth / N };
    track.setPointerCapture?.(e.pointerId);
  }
  function draBeveg(e) {
    const d = dragInfo.current;
    if (!d) return;
    const deltaUker = Math.round((e.clientX - d.startX) / d.ukeBredde);
    if (d.modus === 'flytt') {
      setDragPreview({ radId: d.rad.id, forventetStart: addDays(weekStart(d.rad.pipeline.forventetStart), deltaUker * 7), forventetUker: d.rad.pipeline.forventetUker });
    } else {
      setDragPreview({ radId: d.rad.id, forventetStart: d.rad.pipeline.forventetStart, forventetUker: Math.max(1, (Number(d.rad.pipeline.forventetUker) || 1) + deltaUker) });
    }
  }
  function draSlutt() {
    const d = dragInfo.current;
    dragInfo.current = null;
    if (!d || !dragPreview || dragPreview.radId !== d.rad.id) { setDragPreview(null); return; }
    const p = d.rad.pipeline;
    if (dragPreview.forventetStart !== p.forventetStart) {
      oppdaterPipeline(d.rad, { forventetStart: dragPreview.forventetStart },
        `Forventet start uke ${ukeNr(p.forventetStart)} → ${ukeNr(dragPreview.forventetStart)}`);
    } else if (dragPreview.forventetUker !== p.forventetUker) {
      oppdaterPipeline(d.rad, { forventetUker: dragPreview.forventetUker },
        `Forventet varighet ${p.forventetUker} → ${dragPreview.forventetUker} uker`);
    }
    setDragPreview(null);
  }

  function apneRediger(rad) {
    setRedigerId(rad.id);
    setRedigerForm({
      forventetStart: rad.pipeline.forventetStart || '',
      forventetUker: rad.pipeline.forventetUker || 2,
      forventetFolk: rad.pipeline.forventetFolk || 2,
      sikkerhet: rad.pipeline.sikkerhet || 'fast',
    });
  }
  function lagreRediger(rad) {
    const f = redigerForm;
    const endringer = {
      forventetStart: f.forventetStart ? weekStart(f.forventetStart) : null,
      forventetUker: Math.max(1, Number(f.forventetUker) || 1),
      forventetFolk: Math.max(1, Number(f.forventetFolk) || 1),
      sikkerhet: f.sikkerhet,
    };
    const p = rad.pipeline;
    const deler = [];
    if (endringer.forventetStart !== p.forventetStart) deler.push(`start ${p.forventetStart ? 'uke ' + ukeNr(p.forventetStart) : 'ikke satt'} → ${endringer.forventetStart ? 'uke ' + ukeNr(endringer.forventetStart) : 'ikke satt'}`);
    if (endringer.forventetUker !== p.forventetUker) deler.push(`varighet ${p.forventetUker} → ${endringer.forventetUker} uker`);
    if (endringer.forventetFolk !== p.forventetFolk) deler.push(`folk ${p.forventetFolk ?? '–'} → ${endringer.forventetFolk}`);
    if (endringer.sikkerhet !== p.sikkerhet) deler.push(`sikkerhet ${p.sikkerhet} → ${endringer.sikkerhet}`);
    oppdaterPipeline(rad, endringer, deler.length ? `Pipeline endret: ${deler.join(', ')}` : 'Pipeline lagret uten endringer');
    setRedigerId(null); setRedigerForm(null);
  }

  // ── «+ Legg i pipeline»: prosjekter uten pipeline + befaringer med tilbud ──
  const kandidatProsjekter = (state.prosjekter || []).filter(p =>
    p && !p.arkivert && p.status !== 'fullfort' && !p.pipeline);
  const kandidatBefaringer = (state.befaringer || []).filter(b =>
    b && !b.arkivert && !b.prosjektId && !b.pipeline && ['planlagt', 'tilbud_arbeid', 'tilbud_sendt'].includes(b.status));

  function leggTil() {
    const f = leggTilForm;
    if (!f.valg) return;
    const pipeline = {
      forventetStart: f.forventetStart ? weekStart(f.forventetStart) : null,
      forventetUker: Math.max(1, Number(f.forventetUker) || 1),
      forventetFolk: Math.max(1, Number(f.forventetFolk) || 1),
      sikkerhet: f.sikkerhet,
    };
    const [type, id] = f.valg.split(':');
    if (type === 'p') {
      const p = kandidatProsjekter.find(x => x.id === id);
      if (!p) return;
      dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, pipeline, pipelineLogg: [...(p.pipelineLogg || []), pipelineLoggInnslag(`Lagt i pipeline manuelt (${SIKKERHET[f.sikkerhet]})`, brukerNavn())] } });
    } else {
      const b = kandidatBefaringer.find(x => x.id === id);
      if (!b) return;
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, pipeline } });
    }
    setVisLeggTil(false);
    setLeggTilForm({ valg: '', forventetStart: '', forventetUker: 2, forventetFolk: 2, sikkerhet: 'sannsynlig' });
  }

  const inputStil = { height: 28, fontSize: 12 };

  return (
    <React.Fragment>
      {/* Seksjonsheader */}
      <div className="uke-prosjekt-header" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #2563eb', cursor: 'pointer', position: 'sticky', left: 0 }}
        onClick={() => setApen(!apen)}>
        <Ikon ikon={apen ? ChevronDown : ChevronRight} size={14} />
        <span className="uke-prosjekt-navn">Ikke bemannet ({alleRader.length})</span>
        <span className="uke-prosjekt-antall">vunne tilbud legges hit automatisk</span>
        {!readOnly && (
          <button className="btn btn-sm" style={{ marginLeft: 'auto', height: 24, fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={e => { e.stopPropagation(); setVisLeggTil(v => !v); }}>
            <Ikon ikon={Plus} size={12} /> Legg i pipeline
          </button>
        )}
      </div>

      {/* «+ Legg i pipeline»-boks */}
      {apen && visLeggTil && (
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', position: 'sticky', left: 0 }}>
          <select className="input" style={{ ...inputStil, maxWidth: 260 }} value={leggTilForm.valg} onChange={e => setLeggTilForm(s => ({ ...s, valg: e.target.value }))}>
            <option value="">Velg prosjekt eller tilbud/befaring…</option>
            {kandidatProsjekter.length > 0 && <optgroup label="Prosjekter uten pipeline">
              {kandidatProsjekter.map(p => <option key={p.id} value={'p:' + p.id}>{p.adresse || p.navn}</option>)}
            </optgroup>}
            {kandidatBefaringer.length > 0 && <optgroup label="Tilbud / befaringer (ikke vunnet)">
              {kandidatBefaringer.map(b => <option key={b.id} value={'b:' + b.id}>{b.adresse || b.kontaktNavn}</option>)}
            </optgroup>}
          </select>
          <label style={{ fontSize: 12 }}>Start <input type="date" className="input" style={inputStil} value={leggTilForm.forventetStart} onChange={e => setLeggTilForm(s => ({ ...s, forventetStart: e.target.value }))} /></label>
          <label style={{ fontSize: 12 }}>Uker <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={leggTilForm.forventetUker} onChange={e => setLeggTilForm(s => ({ ...s, forventetUker: e.target.value }))} /></label>
          <label style={{ fontSize: 12 }}>Folk <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={leggTilForm.forventetFolk} onChange={e => setLeggTilForm(s => ({ ...s, forventetFolk: e.target.value }))} /></label>
          <select className="input" style={inputStil} value={leggTilForm.sikkerhet} onChange={e => setLeggTilForm(s => ({ ...s, sikkerhet: e.target.value }))}>
            {Object.entries(SIKKERHET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn btn-sm btn-primary" style={{ height: 28 }} disabled={!leggTilForm.valg} onClick={leggTil}>Legg til</button>
          <button className="btn btn-sm" style={{ height: 28 }} onClick={() => setVisLeggTil(false)}>Avbryt</button>
        </div>
      )}

      {apen && rader.length === 0 && (
        <div style={{ gridColumn: '1 / -1', padding: '10px 14px', fontSize: 12.5, color: '#5d6b80', position: 'sticky', left: 0 }}>
          Ingenting i pipeline — vunne tilbud legges hit automatisk når prosjektet opprettes.
        </div>
      )}

      {/* Radene */}
      {apen && rader.map(rad => {
        const pv = dragPreview?.radId === rad.id ? dragPreview : null;
        const pl = pv ? { ...rad.pipeline, ...pv } : rad.pipeline;
        const erUsikker = pl.sikkerhet !== 'fast';
        const farge = rad.type === 'hull' ? '#b45309' : erUsikker ? '#5d6b80' : '#2563eb';
        const startIdx = pl.forventetStart ? mandager.indexOf(weekStart(pl.forventetStart)) : -1;
        const rawStart = pl.forventetStart ? Math.round((new Date(weekStart(pl.forventetStart) + 'T00:00:00') - new Date(mandager[0] + 'T00:00:00')) / (7 * 86400000)) : 0;
        const visStart = Math.max(0, rawStart);
        const visSlutt = Math.min(N, rawStart + (Number(pl.forventetUker) || 1));
        const bredde = Math.max(0, visSlutt - visStart);
        const forsteUbemannet = rad.uker.find(u => !rad.bemannedeUker.has(u)) || rad.uker[0] || mandager[0];
        const redigerer = redigerId === rad.id;
        return (
          <React.Fragment key={rad.id}>
            <div className="uke-row-label"
              draggable={!readOnly && rad.type !== 'befaring'}
              onDragStart={e => { e.dataTransfer.setData('text/fbs-pipeline', rad.prosjektId || ''); e.dataTransfer.effectAllowed = 'move'; }}
              title={rad.type === 'befaring' ? 'Tilbud/befaring — blir prosjekt når det vinnes' : 'Dra raden opp i planen, eller bruk Bemann-knappen'}>
              <div>
                <div className="row-navn" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rad.navn}</span>
                </div>
                <div className="row-fag" style={{ color: farge, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {rad.type === 'hull' ? 'hull i perioden' : `Folk: ${pl.forventetFolk ?? '–'} · ${SIKKERHET[pl.sikkerhet] || pl.sikkerhet}`}
                  {!readOnly && rad.type !== 'hull' && (
                    <button title="Rediger folk / uker / sikkerhet" onClick={() => redigerer ? setRedigerId(null) : apneRediger(rad)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#5d6b80', display: 'inline-flex' }}>
                      <Ikon ikon={Pencil} size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div data-pl-track style={{ gridColumn: '2 / -1', position: 'relative', minHeight: 40, borderBottom: '1px solid #f1f5f9' }}
              onPointerMove={draBeveg} onPointerUp={draSlutt} onPointerCancel={draSlutt}>
              {!pl.forventetStart ? (
                <button onClick={() => apneRediger(rad)} disabled={readOnly}
                  style={{ position: 'absolute', left: 8, top: 8, border: 'none', background: 'none', cursor: 'pointer', color: '#b45309', fontSize: 12.5, fontWeight: 600, padding: 0 }}>
                  Sett forventet start →
                </button>
              ) : bredde > 0 && (
                <div
                  onPointerDown={e => startDrag(e, rad, 'flytt')}
                  style={{
                    position: 'absolute', top: 6, height: 28,
                    left: (visStart / N * 100) + '%', width: (bredde / N * 100) + '%',
                    border: `2px dashed ${farge}`, borderRadius: 7, background: farge + '14',
                    display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
                    fontSize: 11.5, fontWeight: 600, color: farge, whiteSpace: 'nowrap', overflow: 'hidden',
                    cursor: readOnly || rad.type === 'hull' ? 'default' : 'grab', userSelect: 'none', touchAction: 'none',
                  }}>
                  {/* Bemannede uker = mørke segmenter oppå stolpen */}
                  {rad.uker.map(u => {
                    if (!rad.bemannedeUker.has(u)) return null;
                    const i = Math.round((new Date(u + 'T00:00:00') - new Date(weekStart(pl.forventetStart) + 'T00:00:00')) / (7 * 86400000));
                    const tot = Number(pl.forventetUker) || rad.uker.length;
                    return <span key={u} style={{ position: 'absolute', left: (i / tot * 100) + '%', width: (1 / tot * 100) + '%', top: -2, bottom: -2, background: farge, opacity: 0.85, borderRadius: 4 }} title={`Uke ${ukeNr(u)}: bemannet`} />;
                  })}
                  <span style={{ position: 'relative' }}>
                    u{ukeNr(pl.forventetStart)}–{ukeNr(addDays(weekStart(pl.forventetStart), ((Number(pl.forventetUker) || 1) - 1) * 7))}
                    {rad.type === 'hull' ? ' · uten folk' : ` · ${pl.forventetFolk ?? '–'} folk`}
                  </span>
                  {!readOnly && rad.type !== 'befaring' && onBemann && (
                    <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onBemann(rad.prosjektId, forsteUbemannet); }}
                      title="Bemann prosjektet i første uke uten folk"
                      style={{ position: 'relative', border: `1px solid ${farge}`, background: '#fff', color: farge, borderRadius: 5, fontSize: 10.5, fontWeight: 700, padding: '1px 6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      Bemann <Ikon ikon={ArrowUp} size={10} />
                    </button>
                  )}
                  {!readOnly && rad.type !== 'hull' && (
                    <span onPointerDown={e => startDrag(e, rad, 'resize')} title="Dra for å endre antall uker"
                      style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 10, cursor: 'ew-resize' }} />
                  )}
                </div>
              )}
            </div>
            {/* Inline-redigering */}
            {redigerer && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: '#fffbeb', borderBottom: '1px solid #fde68a', position: 'sticky', left: 0 }}>
                <b style={{ fontSize: 12.5 }}>{rad.navn}:</b>
                <label style={{ fontSize: 12 }}>Start <input type="date" className="input" style={inputStil} value={redigerForm.forventetStart} onChange={e => setRedigerForm(s => ({ ...s, forventetStart: e.target.value }))} /></label>
                <label style={{ fontSize: 12 }}>Uker <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={redigerForm.forventetUker} onChange={e => setRedigerForm(s => ({ ...s, forventetUker: e.target.value }))} /></label>
                <label style={{ fontSize: 12 }}>Folk <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={redigerForm.forventetFolk} onChange={e => setRedigerForm(s => ({ ...s, forventetFolk: e.target.value }))} /></label>
                <select className="input" style={inputStil} value={redigerForm.sikkerhet} onChange={e => setRedigerForm(s => ({ ...s, sikkerhet: e.target.value }))}>
                  {Object.entries(SIKKERHET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className="btn btn-sm btn-primary" style={{ height: 28 }} onClick={() => lagreRediger(rad)}>Lagre</button>
                <button className="btn btn-sm" style={{ height: 28 }} onClick={() => setRedigerId(null)}>Avbryt</button>
                {rad.type === 'prosjekt' && (() => {
                  const p = (state.prosjekter || []).find(x => x.id === rad.prosjektId);
                  const siste = (p?.pipelineLogg || []).slice(-1)[0];
                  return siste ? <span style={{ fontSize: 11, color: '#92400e' }}>Sist: {siste.tekst} · {siste.av}</span> : null;
                })()}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Kapasitetslinje per uke */}
      {apen && rader.length > 0 && (
        <React.Fragment>
          <div className="uke-row-label" title="Behov = folk i pipeline (fast) + faktisk bemannede, mot aktive ansatte (uten ferie). Usikre (sannsynlig/mulig) i parentes.">
            <div>
              <div className="row-navn">Kapasitet</div>
              <div className="row-fag" style={{ color: '#5d6b80' }}>Behov / {planAnsatte.length} ansatte</div>
            </div>
          </div>
          <div style={{ gridColumn: '2 / -1', position: 'relative', minHeight: 30, borderBottom: '1px solid #f1f5f9' }}>
            {mandager.map((m, i) => {
              const kap = ukeKapasitet(m, alleRader, state.tildelinger, planAnsatte);
              const nivaa = kapasitetNivaa(kap);
              if (kap.behov === 0 && kap.usikre === 0) return null;
              return (
                <span key={m} title={`Uke ${ukeNr(m)}: behov ${kap.behov} av ${kap.ansatte} ansatte${kap.usikre ? ` (+${kap.usikre} usikre)` : ''}`}
                  style={{ position: 'absolute', left: (i / N * 100) + '%', width: (1 / N * 100) + '%', top: 3, bottom: 3, background: NIVAA_BG[nivaa], color: NIVAA_FARGE[nivaa], borderRadius: 4, fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {kap.behov}/{kap.ansatte}{kap.usikre ? <span style={{ fontWeight: 400, opacity: 0.75 }}>(+{kap.usikre})</span> : null}
                </span>
              );
            })}
          </div>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
