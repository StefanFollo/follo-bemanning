// Pipeline-fanen under Bemanning (postkasse-oppdrag 22): oversikt over
// kommende/ubemannede prosjekter med KPI-er, filtrering, tidslinje med
// 12-ukers vindu og «Planlegg inn»-broen til ukeoversikten.
// Gjenbruker pipeline-feltet og logikken fra oppdrag 21 (src/pipeline.js).

import React, { useState, useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight, Pencil, CalendarDays } from 'lucide-react';
import { Ikon } from './Ikon';
import { dateToIso } from '../store';
import {
  pipelineFaneRader, ukeKapasitet, kapasitetNivaa, ukeNr, ukeEtikett,
  pipelineLoggInnslag, erUtforende, addDays, weekStart,
} from '../pipeline';

const SIKKERHET = { fast: 'Fast', sannsynlig: 'Sannsynlig', mulig: 'Mulig' };
const STATUS_BADGE = {
  aktiv: { tekst: 'Pågår', farge: '#15803d' },
  godkjent: { tekst: 'Godkjent', farge: '#7c3aed' },
  jobber_med: { tekst: 'Jobber med', farge: '#b45309' },
  tilbud: { tekst: 'Tilbud', farge: '#5d6b80' },
};
const NIVAA_FARGE = { ok: '#15803d', gul: '#b45309', roed: '#dc2626' };
const NIVAA_BG = { ok: '#f0fdf4', gul: '#fef3c7', roed: '#fee2e2' };
const VINDU_UKER = 12;

const brukerNavn = () => localStorage.getItem('fbs_user_navn') || 'ukjent';

export default function PipelineFane({ state, dispatch, readOnly, onPlanleggInn }) {
  const iDag = dateToIso(new Date());
  const [ukeOffset, setUkeOffset] = useState(0);
  const [filter, setFilter] = useState('alle'); // alle | vunnet | usikker | hull
  const [visEldre, setVisEldre] = useState(false);
  const [redigerId, setRedigerId] = useState(null);
  const [redigerForm, setRedigerForm] = useState(null);
  const [visLeggTil, setVisLeggTil] = useState(false);
  const [leggTilForm, setLeggTilForm] = useState({ valg: '', forventetStart: '', forventetUker: 2, forventetFolk: 2, sikkerhet: 'sannsynlig' });
  const dragInfo = useRef(null);
  const [dragPreview, setDragPreview] = useState(null);

  const startUke = addDays(weekStart(iDag), ukeOffset * 7);
  const vindu = Array.from({ length: VINDU_UKER }, (_, i) => addDays(startUke, i * 7));

  const alleRader = pipelineFaneRader(state.prosjekter, state.befaringer, state.tildelinger, iDag);
  const aktuelle = alleRader.filter(r => !r.eldre);
  const eldre = alleRader.filter(r => r.eldre);
  const filtrerte = (filter === 'alle' ? aktuelle : aktuelle.filter(r => r.kategori === filter))
    .concat(visEldre ? eldre : []);

  const utforende = (state.ansatte || []).filter(erUtforende);
  const ansatteById = {};
  for (const a of (state.ansatte || [])) ansatteById[a.id] = a;

  // ── KPI-tallene ──
  const utenStart = aktuelle.filter(r => !r.pipeline.forventetStart);
  // Fremoverrettet: starter i fortid (over frist) er egen sak — de skal ikke
  // fylle «første start uten folk» med f.eks. «u21» fra i mai.
  const naavaerendeUke = weekStart(iDag);
  const heltUtenFolk = aktuelle.filter(r => r.pipeline.forventetStart && r.pipeline.forventetStart >= naavaerendeUke
    && r.bemannedeUker.size === 0 && r.type !== 'befaring')
    .sort((a, b) => a.pipeline.forventetStart.localeCompare(b.pipeline.forventetStart));
  const forsteUtenFolk = heltUtenFolk[0] || null;
  const kapPerUke = vindu.map(m => ({ m, kap: ukeKapasitet(m, aktuelle, state.tildelinger, utforende) }));
  const sprekker = kapPerUke.filter(x => kapasitetNivaa(x.kap) === 'roed');
  const sprekk = sprekker.length
    ? {
        tekst: sprekker.length === 1 ? `u${ukeNr(sprekker[0].m)}` : `u${ukeNr(sprekker[0].m)}–${ukeNr(sprekker[sprekker.length - 1].m)}`,
        behov: Math.max(...sprekker.map(x => x.kap.behov)),
        ansatte: sprekker[0].kap.ansatte,
      }
    : null;

  function oppdaterPipeline(rad, endringer, loggTekst) {
    if (rad.type === 'befaring') {
      const b = (state.befaringer || []).find(x => x.id === rad.befaringId);
      if (!b) return;
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, pipeline: { ...b.pipeline, ...endringer } } });
    } else {
      const p = (state.prosjekter || []).find(x => x.id === rad.prosjektId);
      if (!p) return;
      const basis = { ...(p.pipeline || rad.pipeline) };
      delete basis._syntetisk;
      dispatch({
        type: 'UPDATE_PROSJEKT',
        payload: {
          ...p,
          pipeline: { ...basis, forventetFolk: basis.forventetFolk ?? 2, ...endringer },
          pipelineLogg: [...(p.pipelineLogg || []), pipelineLoggInnslag(loggTekst, brukerNavn())],
        },
      });
    }
  }

  // ── Drag på stolpen (flytt / endre lengde) ──
  function startDrag(e, rad, modus) {
    if (readOnly || rad.type === 'hull' || !rad.pipeline.forventetStart) return;
    e.preventDefault(); e.stopPropagation();
    const track = e.currentTarget.closest('[data-pf-track]');
    if (!track) return;
    dragInfo.current = { rad, modus, startX: e.clientX, ukeBredde: track.clientWidth / VINDU_UKER };
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
        `Forventet varighet ${p.forventetUker || '?'} → ${dragPreview.forventetUker} uker`);
    }
    setDragPreview(null);
  }

  function apneRediger(rad) {
    setRedigerId(rad.id);
    setRedigerForm({
      forventetStart: rad.pipeline.forventetStart || '',
      forventetUker: rad.pipeline.forventetUker || 2,
      forventetFolk: rad.pipeline.forventetFolk ?? 2,
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
    if (endringer.forventetUker !== p.forventetUker) deler.push(`varighet ${p.forventetUker || '?'} → ${endringer.forventetUker} uker`);
    if (endringer.forventetFolk !== p.forventetFolk) deler.push(`folk ${p.forventetFolk ?? '–'} → ${endringer.forventetFolk}`);
    if (endringer.sikkerhet !== p.sikkerhet) deler.push(`sikkerhet ${p.sikkerhet} → ${endringer.sikkerhet}`);
    oppdaterPipeline(rad, endringer, deler.length ? `Pipeline endret: ${deler.join(', ')}` : 'Pipeline lagret');
    setRedigerId(null); setRedigerForm(null);
  }

  // ── «+ Legg til» (samme velger som stripens, oppdrag 21) ──
  const kandidatProsjekter = (state.prosjekter || []).filter(p =>
    p && !p.arkivert && p.status !== 'fullfort' && !p.pipeline && !alleRader.some(r => r.prosjektId === p.id));
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
  const kpiStil = { background: '#fff', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, padding: '10px 14px' };
  const GRID = 'minmax(170px, 230px) 74px 46px 46px 76px minmax(360px, 1fr) 112px';

  return (
    <div>
      {/* ── Fire tall ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div style={kpiStil}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{aktuelle.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #5d6b80)' }}>prosjekter ikke ferdig bemannet</div>
        </div>
        <div style={{ ...kpiStil, ...(utenStart.length ? { borderColor: '#fde68a', background: '#fffbeb' } : {}) }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: utenStart.length ? '#b45309' : undefined }}>{utenStart.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #5d6b80)' }}>mangler forventet start</div>
        </div>
        <div style={kpiStil}>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>
            {forsteUtenFolk ? `u${ukeNr(forsteUtenFolk.pipeline.forventetStart)} · ${forsteUtenFolk.navn}` : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #5d6b80)' }}>første start uten folk</div>
        </div>
        <div style={{ ...kpiStil, ...(sprekk ? { borderColor: '#fecaca', background: '#fef2f2' } : {}) }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: sprekk ? '#dc2626' : '#15803d' }}>
            {sprekk ? `${sprekk.tekst} · behov ${sprekk.behov} / ${sprekk.ansatte} utførende` : 'ingen sprekk'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #5d6b80)' }}>uke med sprekk (neste {VINDU_UKER} uker)</div>
        </div>
      </div>

      {/* ── Filter + Legg til ── */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        {[['alle', `Alle (${aktuelle.length})`], ['vunnet', 'Vunnet/godkjent'], ['usikker', 'Sannsynlig/mulig'], ['hull', 'Pågår med hull']].map(([k, l]) => (
          <button key={k} className={`bplan-fag-pill${filter === k ? ' aktiv' : ''}`}
            style={filter === k ? { background: '#185FA5', color: '#fff', borderColor: '#185FA5' } : {}}
            onClick={() => setFilter(k)}>{l}</button>
        ))}
        {!readOnly && (
          <button className="btn btn-sm" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => setVisLeggTil(v => !v)}>
            <Ikon ikon={Plus} size={13} /> Legg til
          </button>
        )}
      </div>

      {visLeggTil && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 10, marginBottom: 10 }}>
          <select className="input" style={{ ...inputStil, maxWidth: 260 }} value={leggTilForm.valg} onChange={e => setLeggTilForm(s => ({ ...s, valg: e.target.value }))}>
            <option value="">Velg prosjekt eller tilbud/befaring…</option>
            {kandidatProsjekter.length > 0 && <optgroup label="Prosjekter">
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

      {/* ── Tabellen ── */}
      <div style={{ background: '#fff', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, overflowX: 'auto' }}>
        <div style={{ minWidth: 980 }}>
          {/* Header med ukelinjal */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', padding: '7px 12px', background: 'var(--bg-subtle, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)', fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted, #5d6b80)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <div>Prosjekt</div><div>Start</div><div>Uker</div><div>Folk</div><div>PL</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'none', letterSpacing: 0 }}>
              <button className="btn btn-sm" style={{ height: 22, padding: '0 6px' }} title="Tidligere uker" onClick={() => setUkeOffset(o => o - 4)}><Ikon ikon={ChevronLeft} size={12} /></button>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${VINDU_UKER}, 1fr)` }}>
                {vindu.map(m => (
                  <span key={m} style={{ textAlign: 'center', fontWeight: m === weekStart(iDag) ? 800 : 500, color: m === weekStart(iDag) ? '#185FA5' : undefined }}>u{ukeNr(m)}</span>
                ))}
              </div>
              <button className="btn btn-sm" style={{ height: 22, padding: '0 6px' }} title="Senere uker" onClick={() => setUkeOffset(o => o + 4)}><Ikon ikon={ChevronRight} size={12} /></button>
              {ukeOffset !== 0 && <button className="btn btn-sm" style={{ height: 22, padding: '0 6px', fontSize: 10.5 }} onClick={() => setUkeOffset(0)}>I dag</button>}
            </div>
            <div />
          </div>

          {filtrerte.length === 0 && (
            <div style={{ padding: 22, textAlign: 'center', fontSize: 13, color: 'var(--text-muted, #5d6b80)' }}>
              Ingenting i pipeline for dette filteret — vunne tilbud legges hit automatisk.
            </div>
          )}

          {filtrerte.map(rad => {
            const pv = dragPreview?.radId === rad.id ? dragPreview : null;
            const pl = pv ? { ...rad.pipeline, ...pv } : rad.pipeline;
            const utenStartRad = !pl.forventetStart;
            const erUsikker = pl.sikkerhet !== 'fast' || rad.type === 'befaring';
            const farge = rad.type === 'hull' ? '#b45309' : erUsikker ? '#5d6b80' : '#2563eb';
            const badge = STATUS_BADGE[rad.status] || STATUS_BADGE.tilbud;
            const plAnsatt = rad.plId ? ansatteById[rad.plId] : null;
            const rawStart = pl.forventetStart ? Math.round((new Date(weekStart(pl.forventetStart) + 'T00:00:00') - new Date(startUke + 'T00:00:00')) / (7 * 86400000)) : 0;
            const nUker = Math.max(1, Number(pl.forventetUker) || rad.uker.length || 1);
            const visStart = Math.max(0, rawStart);
            const visSlutt = Math.min(VINDU_UKER, rawStart + nUker);
            const bredde = Math.max(0, visSlutt - visStart);
            const startTekst = utenStartRad ? null
              : erUsikker ? `u${ukeNr(pl.forventetStart)}?`
              : pl._syntetisk ? `ca. u${ukeNr(pl.forventetStart)}`
              : `u${ukeNr(pl.forventetStart)}`;
            const redigerer = redigerId === rad.id;
            const kanPlanlegge = !readOnly && rad.type !== 'befaring' && !!pl.forventetStart && onPlanleggInn;
            return (
              <React.Fragment key={rad.id}>
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13, background: utenStartRad ? '#fffbeb' : undefined, opacity: rad.eldre ? 0.65 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rad.navn}</div>
                    <div style={{ fontSize: 11, display: 'flex', gap: 5, alignItems: 'center' }}>
                      <span style={{ color: badge.farge, fontWeight: 600 }}>{badge.tekst}</span>
                      {rad.type === 'hull' && <span style={{ color: '#b45309' }}>· hull</span>}
                      {erUsikker && rad.type !== 'hull' && <span style={{ color: '#5d6b80' }}>· {SIKKERHET[pl.sikkerhet] || pl.sikkerhet}</span>}
                    </div>
                  </div>
                  <button onClick={() => !readOnly && rad.type !== 'hull' && (redigerer ? setRedigerId(null) : apneRediger(rad))}
                    style={{ border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: readOnly || rad.type === 'hull' ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 600, color: utenStartRad ? '#b45309' : 'inherit' }}
                    title={rad.type === 'hull' ? 'Perioden styres av prosjektdatoene' : 'Klikk for å redigere'}>
                    {utenStartRad ? 'Sett start' : startTekst}
                  </button>
                  <button onClick={() => !readOnly && rad.type !== 'hull' && (redigerer ? setRedigerId(null) : apneRediger(rad))}
                    style={{ border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: readOnly || rad.type === 'hull' ? 'default' : 'pointer', fontSize: 12.5 }}>
                    {pl.forventetUker ?? (rad.uker.length || '—')}
                  </button>
                  <button onClick={() => !readOnly && rad.type !== 'hull' && (redigerer ? setRedigerId(null) : apneRediger(rad))}
                    style={{ border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: readOnly || rad.type === 'hull' ? 'default' : 'pointer', fontSize: 12.5 }}>
                    {pl.forventetFolk ?? '—'}
                  </button>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #475569)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {plAnsatt ? (plAnsatt.navn || '').split(' ')[0] : '—'}
                  </div>
                  <div data-pf-track style={{ position: 'relative', height: 30 }}
                    onPointerMove={draBeveg} onPointerUp={draSlutt} onPointerCancel={draSlutt}>
                    {/* uke-gitter */}
                    {vindu.map((m, i) => (
                      <span key={m} style={{ position: 'absolute', left: (i / VINDU_UKER * 100) + '%', top: 0, bottom: 0, borderLeft: i ? '1px solid #f1f5f9' : 'none' }} />
                    ))}
                    {!utenStartRad && bredde > 0 && (
                      <div onPointerDown={e => startDrag(e, rad, 'flytt')}
                        style={{
                          position: 'absolute', top: 3, height: 24,
                          left: (visStart / VINDU_UKER * 100) + '%', width: (bredde / VINDU_UKER * 100) + '%',
                          border: `2px dashed ${farge}`, borderRadius: 6, background: farge + '14',
                          display: 'flex', alignItems: 'center', padding: '0 6px',
                          fontSize: 10.5, fontWeight: 600, color: farge, whiteSpace: 'nowrap', overflow: 'hidden',
                          cursor: readOnly || rad.type === 'hull' ? 'default' : 'grab', userSelect: 'none', touchAction: 'none',
                        }}
                        title={`${ukeEtikett(pl.forventetStart, nUker)}${rad.type === 'hull' ? ' · uten folk' : ''}`}>
                        {rad.uker.map(u => {
                          if (!rad.bemannedeUker.has(u)) return null;
                          const i = Math.round((new Date(u + 'T00:00:00') - new Date(weekStart(pl.forventetStart) + 'T00:00:00')) / (7 * 86400000));
                          return <span key={u} style={{ position: 'absolute', left: (i / nUker * 100) + '%', width: (1 / nUker * 100) + '%', top: -2, bottom: -2, background: farge, opacity: 0.85, borderRadius: 4 }} title={`Uke ${ukeNr(u)}: bemannet`} />;
                        })}
                        <span style={{ position: 'relative' }}>{ukeEtikett(pl.forventetStart, nUker)}{rad.type === 'hull' ? ' · uten folk' : ''}</span>
                        {!readOnly && rad.type !== 'hull' && (
                          <span onPointerDown={e => startDrag(e, rad, 'resize')} title="Dra for å endre antall uker"
                            style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 10, cursor: 'ew-resize' }} />
                        )}
                      </div>
                    )}
                    {utenStartRad && (
                      <button onClick={() => apneRediger(rad)} disabled={readOnly}
                        style={{ position: 'absolute', left: 6, top: 5, border: 'none', background: 'none', cursor: 'pointer', color: '#b45309', fontSize: 11.5, fontWeight: 600, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Ikon ikon={CalendarDays} size={12} /> Sett forventet start →
                      </button>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm" disabled={!kanPlanlegge}
                      title={rad.type === 'befaring' ? 'Tilbud/befaring — blir prosjekt når det vinnes' : !pl.forventetStart ? 'Sett forventet start først' : 'Åpne ukeoversikten og velg folk'}
                      onClick={() => kanPlanlegge && onPlanleggInn(rad)}>
                      Planlegg inn
                    </button>
                  </div>
                </div>
                {redigerer && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                    <b style={{ fontSize: 12.5 }}>{rad.navn}:</b>
                    <label style={{ fontSize: 12 }}>Start <input type="date" className="input" style={inputStil} value={redigerForm.forventetStart} onChange={e => setRedigerForm(s => ({ ...s, forventetStart: e.target.value }))} /></label>
                    <label style={{ fontSize: 12 }}>Uker <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={redigerForm.forventetUker} onChange={e => setRedigerForm(s => ({ ...s, forventetUker: e.target.value }))} /></label>
                    <label style={{ fontSize: 12 }}>Folk <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={redigerForm.forventetFolk} onChange={e => setRedigerForm(s => ({ ...s, forventetFolk: e.target.value }))} /></label>
                    <select className="input" style={inputStil} value={redigerForm.sikkerhet} onChange={e => setRedigerForm(s => ({ ...s, sikkerhet: e.target.value }))}>
                      {Object.entries(SIKKERHET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button className="btn btn-sm btn-primary" style={{ height: 28 }} onClick={() => lagreRediger(rad)}>Lagre</button>
                    <button className="btn btn-sm" style={{ height: 28 }} onClick={() => setRedigerId(null)}>Avbryt</button>
                    {rad.prosjektId && (() => {
                      const p = (state.prosjekter || []).find(x => x.id === rad.prosjektId);
                      const siste = (p?.pipelineLogg || []).slice(-1)[0];
                      return siste ? <span style={{ fontSize: 11, color: '#92400e' }}>Sist: {siste.tekst} · {siste.av}</span> : null;
                    })()}
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {eldre.length > 0 && !visEldre && (
            <button className="btn btn-sm" style={{ margin: 10 }} onClick={() => setVisEldre(true)}>
              Vis {eldre.length} eldre (uten datoer, ikke rørt på 60 dager)
            </button>
          )}

          {/* ── Kapasitetslinje ── */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', padding: '7px 12px', background: 'var(--bg-subtle, #f8fafc)', borderTop: '1px solid var(--border, #e2e8f0)', fontSize: 12 }}>
            <div style={{ fontWeight: 600 }} title="Behov = faktisk tildelte + forventet folk for pipeline-prosjekter uten folk i uka. Nevner = aktive utførende (tømrer/lærling/montør/maler) minus ferie.">
              Behov / {utforende.length} utførende
            </div>
            <div /><div /><div /><div />
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${VINDU_UKER}, 1fr)`, gap: 2 }}>
              {kapPerUke.map(({ m, kap }) => {
                const nivaa = kapasitetNivaa(kap);
                return (
                  <span key={m} title={`Uke ${ukeNr(m)}: behov ${kap.behov} av ${kap.ansatte} utførende${kap.usikre ? ` (+${kap.usikre} usikre)` : ''}`}
                    style={{ textAlign: 'center', borderRadius: 4, padding: '2px 0', fontWeight: 700, fontSize: 10.5, background: NIVAA_BG[nivaa], color: NIVAA_FARGE[nivaa], whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    {kap.behov}/{kap.ansatte}{kap.usikre ? <span style={{ fontWeight: 400, opacity: 0.75 }}>(+{kap.usikre})</span> : null}
                  </span>
                );
              })}
            </div>
            <div />
          </div>
        </div>
      </div>
    </div>
  );
}
