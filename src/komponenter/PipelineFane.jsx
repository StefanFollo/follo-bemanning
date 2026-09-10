// Pipeline-fanen under Bemanning (oppdrag 22 + 23): FULL oversikt over alle
// ikke-fullførte prosjekter, gruppert (Mangler start · Overskredet ·
// Kommende · Pågår · Ferdig bemannet), med KPI-er, 12-ukers tidslinje,
// inline-redigering (lagres i pipeline-feltet og overstyrer anslag) og
// «Planlegg inn»-broen til ukeoversikten. Ingen sletting — Overskredet
// håndteres med Forleng eller Marker ferdig.

import React, { useState, useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight, ChevronDown, CalendarDays } from 'lucide-react';
import { Ikon } from './Ikon';
import { dateToIso, formatDate } from '../store';
import {
  pipelineOversikt, ukeKapasitet, kapasitetNivaa, ukeNr, ukeEtikett,
  pipelineLoggInnslag, erUtforende, addDays, weekStart,
} from '../pipeline';

const SIKKERHET = { fast: 'Fast', sannsynlig: 'Sannsynlig', mulig: 'Mulig' };
const STATUS_BADGE = {
  aktiv: { tekst: 'Pågår', farge: '#15803d' },
  godkjent: { tekst: 'Godkjent', farge: '#7c3aed' },
  jobber_med: { tekst: 'Jobber med', farge: '#b45309' },
  tilbud: { tekst: 'Tilbud', farge: '#5d6b80' },
};
const GRUPPER = [
  { key: 'manglerStart', tittel: 'Mangler start', farge: '#b45309', bg: '#fffbeb' },
  { key: 'overskredet', tittel: 'Overskredet', farge: '#dc2626', bg: '#fef2f2' },
  { key: 'kommende', tittel: 'Kommende', farge: '#2563eb', bg: null },
  { key: 'pagar', tittel: 'Pågår', farge: '#15803d', bg: null },
  { key: 'ferdig', tittel: 'Ferdig bemannet ut perioden', farge: '#5d6b80', bg: null },
];
const NIVAA_FARGE = { ok: '#15803d', gul: '#b45309', roed: '#dc2626' };
const NIVAA_BG = { ok: '#f0fdf4', gul: '#fef3c7', roed: '#fee2e2' };
const VINDU_UKER = 12;

const brukerNavn = () => localStorage.getItem('fbs_user_navn') || 'ukjent';
const kortDato = iso => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '';

export default function PipelineFane({ state, dispatch, readOnly, onPlanleggInn }) {
  const iDag = dateToIso(new Date());
  const [ukeOffset, setUkeOffset] = useState(0);
  const [filter, setFilter] = useState('alle'); // alle | vunnet | usikker | hull
  const [lukkede, setLukkede] = useState(() => ({ ferdig: true })); // gruppe → sammenlagt
  const [redigerId, setRedigerId] = useState(null);
  const [redigerForm, setRedigerForm] = useState(null);
  const [visLeggTil, setVisLeggTil] = useState(false);
  const [leggTilForm, setLeggTilForm] = useState({ valg: '', forventetStart: '', forventetUker: 2, forventetFolk: 2, sikkerhet: 'sannsynlig' });
  const dragInfo = useRef(null);
  const [dragPreview, setDragPreview] = useState(null);

  const naavaerendeUke = weekStart(iDag);
  const startUke = addDays(naavaerendeUke, ukeOffset * 7);
  const vindu = Array.from({ length: VINDU_UKER }, (_, i) => addDays(startUke, i * 7));

  const { rader: alleRader, grupper } = pipelineOversikt(state.prosjekter, state.befaringer, state.tildelinger, iDag);
  const utforende = (state.ansatte || []).filter(erUtforende);
  const ansatteById = {};
  for (const a of (state.ansatte || [])) ansatteById[a.id] = a;

  // KPI-er
  const forsteUtenFolk = grupper.kommende
    .filter(r => r.start && r.bemannedeUker.size === 0 && r.type !== 'befaring')
    .sort((a, b) => a.start.localeCompare(b.start))[0] || null;
  const kapRader = alleRader.filter(r => r.gruppe !== 'ferdig');
  const kapPerUke = vindu.map(m => ({ m, kap: ukeKapasitet(m, kapRader, state.tildelinger, utforende) }));
  const sprekker = kapPerUke.filter(x => kapasitetNivaa(x.kap) === 'roed');
  const sprekk = sprekker.length
    ? { tekst: sprekker.length === 1 ? `u${ukeNr(sprekker[0].m)}` : `u${ukeNr(sprekker[0].m)}–${ukeNr(sprekker[sprekker.length - 1].m)}`,
        behov: Math.max(...sprekker.map(x => x.kap.behov)), ansatte: sprekker[0].kap.ansatte }
    : null;
  const manglerDatoer = alleRader.filter(r => r.type === 'prosjekt' && (!r.start || r.manglerSluttdato)).length;

  function oppdaterProsjekt(rad, prosjektEndringer, pipelineEndringer, loggTekst) {
    if (rad.type === 'befaring') {
      const b = (state.befaringer || []).find(x => x.id === rad.befaringId);
      if (!b) return;
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, pipeline: { ...b.pipeline, ...pipelineEndringer } } });
      return;
    }
    const p = (state.prosjekter || []).find(x => x.id === rad.prosjektId);
    if (!p) return;
    const basis = { sikkerhet: 'fast', ...(p.pipeline || {}) };
    dispatch({
      type: 'UPDATE_PROSJEKT',
      payload: {
        ...p,
        ...(prosjektEndringer || {}),
        ...(pipelineEndringer ? { pipeline: { ...basis, ...pipelineEndringer } } : {}),
        pipelineLogg: [...(p.pipelineLogg || []), pipelineLoggInnslag(loggTekst, brukerNavn())],
      },
    });
  }

  // ── Drag på stolpen ──
  function startDrag(e, rad, modus) {
    if (readOnly || !rad.pipeline.forventetStart || rad.startKilde === 'bemanning') return;
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
    if (d.modus === 'flytt') setDragPreview({ radId: d.rad.id, forventetStart: addDays(d.rad.pipeline.forventetStart, deltaUker * 7), forventetUker: d.rad.pipeline.forventetUker });
    else setDragPreview({ radId: d.rad.id, forventetStart: d.rad.pipeline.forventetStart, forventetUker: Math.max(1, (Number(d.rad.pipeline.forventetUker) || 1) + deltaUker) });
  }
  function draSlutt() {
    const d = dragInfo.current;
    dragInfo.current = null;
    if (!d || !dragPreview || dragPreview.radId !== d.rad.id) { setDragPreview(null); return; }
    const p = d.rad.pipeline;
    if (dragPreview.forventetStart !== p.forventetStart) {
      oppdaterProsjekt(d.rad, null, { forventetStart: dragPreview.forventetStart, forventetUker: p.forventetUker, forventetFolk: p.forventetFolk },
        `Forventet start uke ${ukeNr(p.forventetStart)} → ${ukeNr(dragPreview.forventetStart)}`);
    } else if (dragPreview.forventetUker !== p.forventetUker) {
      oppdaterProsjekt(d.rad, null, { forventetStart: p.forventetStart, forventetUker: dragPreview.forventetUker, forventetFolk: p.forventetFolk },
        `Forventet varighet ${p.forventetUker || '?'} → ${dragPreview.forventetUker} uker`);
    }
    setDragPreview(null);
  }

  // ── Inline-redigering (lagres i pipeline; sluttdato skrives på prosjektet) ──
  function apneRediger(rad, fokus = null) {
    setRedigerId(rad.id);
    setRedigerForm({
      forventetStart: rad.pipeline.forventetStart || '',
      forventetUker: rad.pipeline.forventetUker || 2,
      forventetFolk: rad.pipeline.forventetFolk ?? 2,
      sikkerhet: rad.pipeline.sikkerhet || 'fast',
      sluttDato: rad.type === 'prosjekt' ? ((state.prosjekter || []).find(x => x.id === rad.prosjektId)?.sluttDato || '') : '',
      fokus,
    });
  }
  function lagreRediger(rad) {
    const f = redigerForm;
    const pipelineEndringer = {
      forventetStart: f.forventetStart ? weekStart(f.forventetStart) : null,
      forventetUker: Math.max(1, Number(f.forventetUker) || 1),
      forventetFolk: Math.max(1, Number(f.forventetFolk) || 1),
      sikkerhet: f.sikkerhet,
    };
    const p = rad.pipeline;
    const deler = [];
    if (pipelineEndringer.forventetStart !== p.forventetStart) deler.push(`start ${p.forventetStart ? 'uke ' + ukeNr(p.forventetStart) : 'ikke satt'} → ${pipelineEndringer.forventetStart ? 'uke ' + ukeNr(pipelineEndringer.forventetStart) : 'ikke satt'}`);
    if (pipelineEndringer.forventetUker !== p.forventetUker) deler.push(`varighet ${p.forventetUker || '?'} → ${pipelineEndringer.forventetUker} uker`);
    if (pipelineEndringer.forventetFolk !== p.forventetFolk) deler.push(`folk ${p.forventetFolk ?? '–'} → ${pipelineEndringer.forventetFolk}`);
    const prosjektEndringer = {};
    if (rad.type === 'prosjekt') {
      const eksSlutt = (state.prosjekter || []).find(x => x.id === rad.prosjektId)?.sluttDato || '';
      if ((f.sluttDato || '') !== eksSlutt) {
        prosjektEndringer.sluttDato = f.sluttDato || '';
        deler.push(`sluttdato ${eksSlutt || 'ikke satt'} → ${f.sluttDato || 'ikke satt'}`);
      }
    }
    oppdaterProsjekt(rad, prosjektEndringer, pipelineEndringer, deler.length ? `Pipeline endret: ${deler.join(', ')}` : 'Pipeline lagret');
    setRedigerId(null); setRedigerForm(null);
  }

  // ── Overskredet-handlinger ──
  function forleng(rad) { apneRediger(rad, 'slutt'); }
  function markerFerdig(rad) {
    if (!window.confirm(`Markere ${rad.navn} som fullført? (kan endres tilbake fra prosjektlisten — ingenting slettes)`)) return;
    oppdaterProsjekt(rad, { status: 'fullfort' }, null, 'Markert fullført fra Pipeline');
  }

  // ── «+ Legg til» ──
  const kandidatBefaringer = (state.befaringer || []).filter(b =>
    b && !b.arkivert && !b.prosjektId && !b.pipeline && ['planlagt', 'tilbud_arbeid', 'tilbud_sendt'].includes(b.status));
  function leggTil() {
    const f = leggTilForm;
    if (!f.valg) return;
    const b = kandidatBefaringer.find(x => x.id === f.valg);
    if (!b) return;
    dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, pipeline: {
      forventetStart: f.forventetStart ? weekStart(f.forventetStart) : null,
      forventetUker: Math.max(1, Number(f.forventetUker) || 1),
      forventetFolk: Math.max(1, Number(f.forventetFolk) || 1),
      sikkerhet: f.sikkerhet,
    } } });
    setVisLeggTil(false);
    setLeggTilForm({ valg: '', forventetStart: '', forventetUker: 2, forventetFolk: 2, sikkerhet: 'sannsynlig' });
  }

  const inputStil = { height: 28, fontSize: 12 };
  const kpiStil = { background: '#fff', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, padding: '10px 14px' };
  const GRID = 'minmax(170px, 230px) 96px 46px 46px 76px minmax(360px, 1fr) 118px';
  const graa = { color: '#94a3b8' };

  function radFiltrert(r) {
    if (filter === 'alle') return true;
    if (filter === 'hull') return r.kategori === 'hull';
    return r.kategori === filter;
  }

  return (
    <div>
      {/* ── Fire tall ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
        <div style={{ ...kpiStil, ...(grupper.manglerStart.length ? { borderColor: '#fde68a', background: '#fffbeb' } : {}) }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: grupper.manglerStart.length ? '#b45309' : undefined }}>{grupper.manglerStart.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #5d6b80)' }}>mangler forventet start</div>
        </div>
        <div style={{ ...kpiStil, ...(grupper.overskredet.length ? { borderColor: '#fecaca', background: '#fef2f2' } : {}) }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: grupper.overskredet.length ? '#dc2626' : undefined }}>{grupper.overskredet.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #5d6b80)' }}>overskredet (frist/start passert)</div>
        </div>
        <div style={kpiStil}>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>
            {forsteUtenFolk ? `u${ukeNr(forsteUtenFolk.start)} · ${forsteUtenFolk.navn}` : '—'}
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

      {/* Datahygiene-linje (D) */}
      {manglerDatoer > 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted, #5d6b80)', marginBottom: 8 }}>
          {manglerDatoer} prosjekt{manglerDatoer === 1 ? '' : 'er'} mangler start- eller sluttdato — sett datoer direkte i tabellen (klikk Start/Uker på raden).
        </div>
      )}

      {/* ── Filter + Legg til ── */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        {[['alle', `Alle (${alleRader.length})`], ['vunnet', 'Vunnet/godkjent'], ['usikker', 'Sannsynlig/mulig'], ['hull', 'Pågår med hull']].map(([k, l]) => (
          <button key={k} className={`bplan-fag-pill${filter === k ? ' aktiv' : ''}`}
            style={filter === k ? { background: '#185FA5', color: '#fff', borderColor: '#185FA5' } : {}}
            onClick={() => setFilter(k)}>{l}</button>
        ))}
        {!readOnly && (
          <button className="btn btn-sm" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => setVisLeggTil(v => !v)} title="Legg inn et tilbud/en befaring som ikke er vunnet (sannsynlig/mulig)">
            <Ikon ikon={Plus} size={13} /> Legg til
          </button>
        )}
      </div>

      {visLeggTil && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 10, marginBottom: 10 }}>
          <select className="input" style={{ ...inputStil, maxWidth: 280 }} value={leggTilForm.valg} onChange={e => setLeggTilForm(s => ({ ...s, valg: e.target.value }))}>
            <option value="">Velg tilbud/befaring (ikke vunnet)…</option>
            {kandidatBefaringer.map(b => <option key={b.id} value={b.id}>{b.adresse || b.kontaktNavn}</option>)}
          </select>
          <label style={{ fontSize: 12 }}>Start <input type="date" className="input" style={inputStil} value={leggTilForm.forventetStart} onChange={e => setLeggTilForm(s => ({ ...s, forventetStart: e.target.value }))} /></label>
          <label style={{ fontSize: 12 }}>Uker <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={leggTilForm.forventetUker} onChange={e => setLeggTilForm(s => ({ ...s, forventetUker: e.target.value }))} /></label>
          <label style={{ fontSize: 12 }}>Folk <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={leggTilForm.forventetFolk} onChange={e => setLeggTilForm(s => ({ ...s, forventetFolk: e.target.value }))} /></label>
          <select className="input" style={inputStil} value={leggTilForm.sikkerhet} onChange={e => setLeggTilForm(s => ({ ...s, sikkerhet: e.target.value }))}>
            {['sannsynlig', 'mulig'].map(k => <option key={k} value={k}>{SIKKERHET[k]}</option>)}
          </select>
          <button className="btn btn-sm btn-primary" style={{ height: 28 }} disabled={!leggTilForm.valg} onClick={leggTil}>Legg til</button>
          <button className="btn btn-sm" style={{ height: 28 }} onClick={() => setVisLeggTil(false)}>Avbryt</button>
        </div>
      )}

      {/* ── Tabellen ── */}
      <div style={{ background: '#fff', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, overflowX: 'auto' }}>
        <div style={{ minWidth: 1000 }}>
          {/* Kolonneheader med ukelinjal */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', padding: '7px 12px', background: 'var(--bg-subtle, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)', fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted, #5d6b80)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <div>Prosjekt</div><div>Start</div><div>Uker</div><div>Folk</div><div>PL</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'none', letterSpacing: 0 }}>
              <button className="btn btn-sm" style={{ height: 22, padding: '0 6px' }} title="Tidligere uker" onClick={() => setUkeOffset(o => o - 4)}><Ikon ikon={ChevronLeft} size={12} /></button>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${VINDU_UKER}, 1fr)` }}>
                {vindu.map(m => (
                  <span key={m} style={{ textAlign: 'center', fontWeight: m === naavaerendeUke ? 800 : 500, color: m === naavaerendeUke ? '#185FA5' : undefined }}>u{ukeNr(m)}</span>
                ))}
              </div>
              <button className="btn btn-sm" style={{ height: 22, padding: '0 6px' }} title="Senere uker" onClick={() => setUkeOffset(o => o + 4)}><Ikon ikon={ChevronRight} size={12} /></button>
              {ukeOffset !== 0 && <button className="btn btn-sm" style={{ height: 22, padding: '0 6px', fontSize: 10.5 }} onClick={() => setUkeOffset(0)}>I dag</button>}
            </div>
            <div />
          </div>

          {GRUPPER.map(g => {
            const radene = grupper[g.key].filter(radFiltrert);
            if (!grupper[g.key].length) return null;
            const lukket = !!lukkede[g.key];
            return (
              <React.Fragment key={g.key}>
                <button onClick={() => setLukkede(s => ({ ...s, [g.key]: !s[g.key] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', border: 'none', cursor: 'pointer', padding: '6px 12px', background: g.bg || 'var(--bg-subtle, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)', borderLeft: `4px solid ${g.farge}`, fontSize: 12.5, fontWeight: 700, color: g.farge, textAlign: 'left' }}>
                  <Ikon ikon={lukket ? ChevronRight : ChevronDown} size={13} />
                  {g.tittel} ({radene.length}{radene.length !== grupper[g.key].length ? ` av ${grupper[g.key].length}` : ''})
                </button>
                {!lukket && radene.map(rad => {
                  const pv = dragPreview?.radId === rad.id ? dragPreview : null;
                  const pl = pv ? { ...rad.pipeline, ...pv } : rad.pipeline;
                  const erUsikkerRad = pl.sikkerhet !== 'fast' || rad.type === 'befaring';
                  const farge = rad.gruppe === 'overskredet' ? '#dc2626' : erUsikkerRad ? '#5d6b80' : rad.gruppe === 'pagar' ? '#15803d' : '#2563eb';
                  const badge = STATUS_BADGE[rad.status] || STATUS_BADGE.tilbud;
                  const plAnsatt = rad.plId ? ansatteById[rad.plId] : null;
                  const nUker = Math.max(1, Number(pl.forventetUker) || rad.uker.length || 1);
                  const rawStart = pl.forventetStart ? Math.round((new Date(pl.forventetStart + 'T00:00:00') - new Date(startUke + 'T00:00:00')) / (7 * 86400000)) : 0;
                  const stolpeUker = rad.uker.length || nUker;
                  const rawSlutt = rawStart + stolpeUker;
                  const visStart = Math.max(0, rawStart);
                  const visSlutt = Math.min(VINDU_UKER, rawSlutt);
                  const bredde = Math.max(0, visSlutt - visStart);
                  const redigerer = redigerId === rad.id;
                  const kanRedigere = !readOnly;
                  const kanPlanlegge = !readOnly && rad.type !== 'befaring' && !!pl.forventetStart && onPlanleggInn && rad.gruppe !== 'ferdig';
                  const startTekst = !pl.forventetStart ? null
                    : rad.startKilde === 'bemanning' ? `u${ukeNr(pl.forventetStart)} (fra bemanning)`
                    : erUsikkerRad ? `u${ukeNr(pl.forventetStart)}?`
                    : rad.startKilde === 'prosjekt' ? `u${ukeNr(pl.forventetStart)}`
                    : `u${ukeNr(pl.forventetStart)}`;
                  return (
                    <React.Fragment key={rad.id}>
                      <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13, background: rad.gruppe === 'manglerStart' ? '#fffbeb' : undefined }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rad.navn}</div>
                          <div style={{ fontSize: 11, display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ color: badge.farge, fontWeight: 600 }}>{badge.tekst}</span>
                            {rad.gruppe === 'overskredet' && rad.slutt && <span style={{ color: '#dc2626' }}>· slutt {kortDato(rad.slutt)} passert</span>}
                            {rad.gruppe === 'overskredet' && !rad.slutt && <span style={{ color: '#dc2626' }}>· start passert uten folk</span>}
                            {erUsikkerRad && <span style={{ color: '#5d6b80' }}>· {SIKKERHET[pl.sikkerhet] || pl.sikkerhet}</span>}
                          </div>
                        </div>
                        <button onClick={() => kanRedigere && (redigerer ? setRedigerId(null) : apneRediger(rad))}
                          style={{ border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: kanRedigere ? 'pointer' : 'default', fontSize: 12, fontWeight: 600, color: !pl.forventetStart ? '#b45309' : rad.startKilde === 'bemanning' ? '#94a3b8' : 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          title="Klikk for å redigere start/uker/folk/sluttdato">
                          {!pl.forventetStart ? 'Sett start' : startTekst}
                        </button>
                        <button onClick={() => kanRedigere && (redigerer ? setRedigerId(null) : apneRediger(rad))}
                          style={{ border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: kanRedigere ? 'pointer' : 'default', fontSize: 12.5, ...(rad.ukerKilde !== 'pipeline' ? graa : {}) }}
                          title={rad.ukerKilde === 'bemanning' ? 'Fra bemanningen — klikk for å sette' : 'Klikk for å redigere'}>
                          {rad.ukerTall ?? '—'}
                        </button>
                        <button onClick={() => kanRedigere && (redigerer ? setRedigerId(null) : apneRediger(rad))}
                          style={{ border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: kanRedigere ? 'pointer' : 'default', fontSize: 12.5, ...(rad.folkKilde !== 'pipeline' ? graa : {}) }}
                          title={rad.folkKilde === 'bemanning' ? 'Maks samtidige i bemanningen — klikk for å sette' : rad.folkKilde === 'anslag' ? 'Anslag — klikk for å sette' : 'Klikk for å redigere'}>
                          {rad.folk}
                        </button>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #475569)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {plAnsatt ? (plAnsatt.navn || '').split(' ')[0] : '—'}
                        </div>
                        <div data-pf-track style={{ position: 'relative', height: 30 }}
                          onPointerMove={draBeveg} onPointerUp={draSlutt} onPointerCancel={draSlutt}>
                          {vindu.map((m, i) => (
                            <span key={m} style={{ position: 'absolute', left: (i / VINDU_UKER * 100) + '%', top: 0, bottom: 0, borderLeft: i ? '1px solid #f1f5f9' : 'none' }} />
                          ))}
                          {pl.forventetStart && bredde > 0 ? (
                            <div onPointerDown={e => startDrag(e, rad, 'flytt')}
                              style={{
                                position: 'absolute', top: 3, height: 24,
                                left: (visStart / VINDU_UKER * 100) + '%', width: (bredde / VINDU_UKER * 100) + '%',
                                border: `2px dashed ${farge}`, borderRadius: 6, background: farge + '14',
                                display: 'flex', alignItems: 'center', padding: '0 6px',
                                fontSize: 10.5, fontWeight: 600, color: farge, whiteSpace: 'nowrap', overflow: 'hidden',
                                cursor: readOnly || rad.startKilde === 'bemanning' ? 'default' : 'grab', userSelect: 'none', touchAction: 'none',
                              }}
                              title={ukeEtikett(pl.forventetStart, stolpeUker)}>
                              {rad.uker.map(u => {
                                if (!rad.bemannedeUker.has(u)) return null;
                                const i = Math.round((new Date(u + 'T00:00:00') - new Date(pl.forventetStart + 'T00:00:00')) / (7 * 86400000));
                                return <span key={u} style={{ position: 'absolute', left: (i / stolpeUker * 100) + '%', width: (1 / stolpeUker * 100) + '%', top: -2, bottom: -2, background: farge, opacity: 0.85, borderRadius: 4 }} title={`Uke ${ukeNr(u)}: bemannet`} />;
                              })}
                              <span style={{ position: 'relative' }}>{ukeEtikett(pl.forventetStart, stolpeUker)}</span>
                              {!readOnly && rad.startKilde !== 'bemanning' && (
                                <span onPointerDown={e => startDrag(e, rad, 'resize')} title="Dra for å endre antall uker"
                                  style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 10, cursor: 'ew-resize' }} />
                              )}
                            </div>
                          ) : rad.gruppe === 'pagar' && rad.manglerSluttdato && rad.bemannetTil ? (
                            <button onClick={() => kanRedigere && apneRediger(rad, 'slutt')}
                              style={{ position: 'absolute', left: 6, top: 5, border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 11.5, padding: 0 }}>
                              bemannet til {kortDato(rad.bemannetTil)} · slutt?
                            </button>
                          ) : !pl.forventetStart ? (
                            <button onClick={() => kanRedigere && apneRediger(rad)} disabled={readOnly}
                              style={{ position: 'absolute', left: 6, top: 5, border: 'none', background: 'none', cursor: 'pointer', color: '#b45309', fontSize: 11.5, fontWeight: 600, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Ikon ikon={CalendarDays} size={12} /> Sett forventet start →
                            </button>
                          ) : null}
                          {/* Pågår uten sluttdato MEN stolpe fra bemanningen: vis slutt?-hint til høyre */}
                          {pl.forventetStart && bredde > 0 && rad.gruppe === 'pagar' && rad.manglerSluttdato && (
                            <button onClick={() => kanRedigere && apneRediger(rad, 'slutt')}
                              style={{ position: 'absolute', right: 4, top: 6, border: 'none', background: '#fff', borderRadius: 4, cursor: 'pointer', color: '#94a3b8', fontSize: 10.5, padding: '1px 5px' }}>
                              bemannet til {kortDato(rad.bemannetTil)} · slutt?
                            </button>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {rad.gruppe === 'overskredet' && !readOnly ? (
                            <>
                              <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => forleng(rad)}>Forleng</button>
                              <button className="btn btn-sm" style={{ fontSize: 11 }} title="Sett status Fullført — ingenting slettes" onClick={() => markerFerdig(rad)}>Ferdig</button>
                            </>
                          ) : (
                            <button className="btn btn-sm" disabled={!kanPlanlegge}
                              title={rad.type === 'befaring' ? 'Tilbud/befaring — blir prosjekt når det vinnes' : !pl.forventetStart ? 'Sett forventet start først' : 'Åpne ukeoversikten og velg folk'}
                              onClick={() => kanPlanlegge && onPlanleggInn(rad)}>
                              Planlegg inn
                            </button>
                          )}
                        </div>
                      </div>
                      {redigerer && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                          <b style={{ fontSize: 12.5 }}>{rad.navn}:</b>
                          <label style={{ fontSize: 12 }}>Start <input type="date" className="input" style={inputStil} value={redigerForm.forventetStart} onChange={e => setRedigerForm(s => ({ ...s, forventetStart: e.target.value }))} /></label>
                          <label style={{ fontSize: 12 }}>Uker <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={redigerForm.forventetUker} onChange={e => setRedigerForm(s => ({ ...s, forventetUker: e.target.value }))} /></label>
                          <label style={{ fontSize: 12 }}>Folk <input type="number" min="1" className="input" style={{ ...inputStil, width: 58 }} value={redigerForm.forventetFolk} onChange={e => setRedigerForm(s => ({ ...s, forventetFolk: e.target.value }))} /></label>
                          {rad.type === 'prosjekt' && (
                            <label style={{ fontSize: 12, ...(redigerForm.fokus === 'slutt' ? { outline: '2px solid #b45309', borderRadius: 6, padding: '2px 4px' } : {}) }}>
                              Sluttdato <input type="date" className="input" style={inputStil} value={redigerForm.sluttDato} onChange={e => setRedigerForm(s => ({ ...s, sluttDato: e.target.value }))} />
                            </label>
                          )}
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
              </React.Fragment>
            );
          })}

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
