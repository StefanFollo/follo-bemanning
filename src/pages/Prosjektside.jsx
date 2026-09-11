// ═══ Prosjektsiden — én arbeidsflate per prosjekt (postkasse-oppdrag 16, PR1) ═══
// SPEC-prosjektside-samlet.md: samling og RUTING av det som finnes — hver fane
// er den eksisterende komponenten låst til prosjektet (fastProsjektId).
// PR1: Oversikt · Framdrift · Sjekklister · Kunde · Tilbud · Logg.
// PR2 (senere): Bemanning-fane, «Trenger handling»-reglene, dyplenker fra digest.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft, ChartGantt, ClipboardCheck, Package, ScrollText, House,
  MessageSquare, Eye, Archive, Users, TriangleAlert, CircleCheck,
} from 'lucide-react';
import { Ikon, IkonTekst } from '../komponenter/Ikon';
import { useApp } from '../context/AppContext';
import KundeportalKnapp from '../komponenter/KundeportalKnapp';
import { kundeportalToken } from '../kundeportal';
import { tilbudIdForProsjekt } from '../framdriftEksport';
import { gruppeNavn, medlemsNavn, gruppeMedlemmer } from '../grupper';
import { oppgaveStat } from '../faseOppgaver';
import { lagForProsjekt } from '../prosjektLag';
import { varsleFramdriftEksport } from '../framdriftEksportKlient';
import TilbudsdataVisning from '../komponenter/Tilbudsdata';
import Endringsmeldinger from '../komponenter/Endringsmeldinger';
import Framdriftsplan from './Framdriftsplan';
import KS from './KS';
import Bemanningsplan from './Bemanningsplan';
import { byggInterneFaser } from '../framdriftEksport';
import { ukeNr, prosjektStatus, STATUS_TEKST, pipelineLoggInnslag, flyttTilPipeline, addDays as leggTilDager } from '../pipeline';

// Oppdrag 24: status er AVLEDET (Ikke startet / Startet / Ferdig) — ikke valgt
const STATUS_FARGE = { ikke_startet: '#b45309', startet: '#15803d', ferdig: '#5d6b80' };

function relTid(iso) {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  const t = Math.floor(d / 3600000), dg = Math.floor(d / 86400000);
  if (d < 3600000) return `${Math.max(1, Math.floor(d / 60000))} min siden`;
  if (t < 24) return `${t} t siden`;
  return dg === 1 ? 'i går' : `${dg} d siden`;
}

export default function Prosjektside({ prosjektId, fane: startFane = 'oversikt', onTilbake, onNavigate, onApneProsjekt = null }) {
  const { state, dispatch } = useApp();
  const [fane, setFane] = useState(startFane);
  const [ksSjekklister, setKsSjekklister] = useState(null);
  const [logg, setLogg] = useState(null);
  const [nyEmTrigger, setNyEmTrigger] = useState(0);
  useEffect(() => { setFane(startFane); }, [startFane, prosjektId]);

  const p = (state.prosjekter || []).find(x => x && x.id === prosjektId);
  const befaring = p ? (state.befaringer || []).find(b => b && (b.id === p.befaringId || b.id === p.kildeBefaringId)) : null;
  const tilbudId = p ? tilbudIdForProsjekt(p, state.befaringer) : null;
  const portalToken = p ? kundeportalToken(p, state.befaringer) : null;
  const pl = p?.prosjektlederId ? (state.ansatte || []).find(a => a && a.id === p.prosjektlederId) : null;
  const lag = p ? lagForProsjekt(p.id, state.tildelinger, state.ansatte) : [];
  const al = lag.find(a => String(a.fag || '').trim().toLowerCase() === 'anleggsleder');

  // Sjekklister for badges/oversikt (API-instansene; prosjekt-sjekklister ligger i state)
  const hentKs = useCallback(async () => {
    try {
      const r = await fetch('/api/ks/sjekklister', { headers: { Authorization: 'Bearer ' + (localStorage.getItem('fbs_token') || '') } });
      const alle = await r.json();
      setKsSjekklister((Array.isArray(alle) ? alle : []).filter(sl => sl && sl.prosjektId === prosjektId));
    } catch { setKsSjekklister([]); }
  }, [prosjektId]);
  useEffect(() => { hentKs(); }, [hentKs]);

  const hentLogg = useCallback(async () => {
    try {
      const r = await fetch('/api/befaringer/audit', { headers: { Authorization: 'Bearer ' + (localStorage.getItem('fbs_token') || '') } });
      const data = await r.json().catch(() => ({}));
      const ider = [prosjektId, p?.befaringId, p?.kildeBefaringId].filter(Boolean);
      setLogg((data.entries || []).filter(e => ider.includes(e.objektId)).reverse());
    } catch { setLogg([]); }
  }, [prosjektId, p?.befaringId, p?.kildeBefaringId]);
  useEffect(() => { hentLogg(); }, [hentLogg]);

  if (!p) {
    return (
      <div className="page">
        <button className="btn" onClick={onTilbake}><IkonTekst ikon={ArrowLeft} size={14}>Prosjekter</IkonTekst></button>
        <div className="empty" style={{ marginTop: 20 }}>Fant ikke prosjektet — det kan være arkivert.</div>
      </div>
    );
  }

  // ── Nøkkeltall til Oversikt + badges ──
  const tasks = p.fdTasks || [];
  const faserFerdig = tasks.filter(t => (t.pct ?? 0) >= 100).length;
  const oppgSum = tasks.reduce((s, t) => { const st = oppgaveStat(t); return { f: s.f + st.ferdig, t: s.t + st.totalt }; }, { f: 0, t: 0 });
  const paagaaende = tasks.find(t => (t.pct ?? 0) > 0 && (t.pct ?? 0) < 100);
  const alleLister = [...(ksSjekklister || []), ...(p.sjekklister || [])];
  const utenAnsvarlig = ksSjekklister === null ? null : alleLister.filter(sl => !(sl.ansvarlig || []).length && !(sl.signert_av || sl.levert_dato)).length;
  const signert = alleLister.filter(sl => sl.signert_av || sl.levert_dato).length;
  const iDag = new Date().toISOString().slice(0, 10);
  const omEnUke = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const denneUka = [...new Set((state.tildelinger || [])
    .filter(t => t && t.prosjektId === prosjektId && t.prosjektId !== '__FERIE__' && (t.startDato || '0000') <= omEnUke && (t.sluttDato || '9999') >= iDag)
    .map(t => (state.ansatte || []).find(a => a && a.id === t.ansattId)?.navn).filter(Boolean))];
  const tp = p.tilbudPayload || {};
  const kontrakt = tp.totalSum ?? tp.akseptertSum ?? (p.belop ? Number(p.belop) : null);
  // Oppdrag 32: gruppen (underprosjekter) — kun lesing
  const sosken = p.gruppeId ? gruppeMedlemmer(state.prosjekter || [], p.gruppeId) : [];
  const gNavn = p.gruppeId ? gruppeNavn(state.prosjekter || [], p.gruppeId) : '';
  const gruppeKontrakt = sosken.reduce((s, m) => { const t = m.tilbudPayload || {}; const k = t.totalSum ?? t.akseptertSum ?? (m.belop ? Number(m.belop) : 0); return s + (Number(k) || 0); }, 0);
  const gruppeFolk = new Set((state.tildelinger || [])
    .filter(t => t && t.prosjektId !== '__FERIE__' && sosken.some(m => m.id === t.prosjektId) && (t.startDato || '0000') <= omEnUke && (t.sluttDato || '9999') >= iDag)
    .map(t => t.ansattId)).size;
  const kundeAkt = (befaring?.kundeAktivitet || []).slice(-5).reverse();
  const nyKundeAkt = kundeAkt.some(a => a && (Date.now() - new Date(a.sistTidspunkt || a.tidspunkt || 0).getTime()) < 86400000);

  // PR2: uke uten bemanning innenfor prosjektperioden (neste 2 uker)
  const tommeUker = (() => {
    if (!p.startDato || !p.sluttDato) return [];
    const tomme = [];
    for (let u = 0; u < 2; u++) {
      const fra = new Date(Date.now() + u * 7 * 86400000).toISOString().slice(0, 10);
      const til = new Date(Date.now() + (u * 7 + 6) * 86400000).toISOString().slice(0, 10);
      if (til < p.startDato || fra > p.sluttDato) continue; // utenfor prosjektperioden
      const dekket = (state.tildelinger || []).some(t => t && t.prosjektId === prosjektId && t.prosjektId !== '__FERIE__'
        && (t.startDato || '0000') <= til && (t.sluttDato || '9999') >= fra);
      if (!dekket) tomme.push(u === 0 ? 'denne uka' : 'neste uke');
    }
    return tomme;
  })();

  const FANER = [
    { id: 'oversikt', label: 'Oversikt', ikon: House },
    { id: 'framdrift', label: 'Framdrift', ikon: ChartGantt, badge: tasks.length ? `${faserFerdig}/${tasks.length}` : null },
    { id: 'sjekklister', label: 'Sjekklister', ikon: ClipboardCheck, badge: utenAnsvarlig ? `${utenAnsvarlig} uten ansvarlig` : null, badgeGul: true },
    { id: 'bemanning', label: 'Bemanning', ikon: Users, badge: tommeUker.length ? `${tommeUker[0]} tom` : null, badgeGul: true },
    { id: 'kunde', label: 'Kunde', ikon: MessageSquare, badge: nyKundeAkt ? 'ny aktivitet' : null },
    { id: 'tilbud', label: 'Tilbud', ikon: Package },
    { id: 'logg', label: 'Logg', ikon: ScrollText },
  ];

  const fmtKr = n => (n || n === 0) ? new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n) : '—';
  const avledet = prosjektStatus(p, state.tildelinger);
  const settStatus = s => dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, status: s,
    pipelineLogg: [...(p.pipelineLogg || []), pipelineLoggInnslag(s === 'fullfort' ? 'Markert ferdig' : 'Gjenåpnet', localStorage.getItem('fbs_user_navn') || 'ukjent')] } });

  return (
    <div className="page" style={{ paddingBottom: 24 }}>
      {/* ── Topp (alltid synlig) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <button className="btn btn-sm" onClick={onTilbake}><IkonTekst ikon={ArrowLeft} size={14}>Prosjekter</IkonTekst></button>
        <h2 style={{ margin: 0, fontSize: 19, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.gruppeId
            ? <><span style={{ color: 'var(--text-secondary)' }}>{gNavn}</span> <span style={{ color: '#94a3b8' }}>›</span> {medlemsNavn(p, state.prosjekter)}</>
            : (p.navn || p.adresse || 'Uten navn')}
        </h2>
        {sosken.length > 1 && (
          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }} title="Underprosjekter i samme gruppe">
            {sosken.map(m => (
              <button key={m.id} className="btn btn-sm"
                style={{ height: 24, fontSize: 11.5, padding: '0 8px', ...(m.id === p.id ? { background: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' } : {}) }}
                disabled={m.id === p.id || !onApneProsjekt}
                onClick={() => onApneProsjekt && onApneProsjekt(m.id, fane)}>
                {medlemsNavn(m, state.prosjekter)}
              </button>
            ))}
          </span>
        )}
        <span style={{ fontSize: 11.5, fontWeight: 600, color: STATUS_FARGE[avledet], background: STATUS_FARGE[avledet] + '1a', borderRadius: 6, padding: '2px 9px' }}
          title="Status avledes automatisk: Startet = minst én tildeling i bemanningsplanen">
          {STATUS_TEKST[avledet]}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <KundeportalKnapp token={portalToken} kompakt />
          {tilbudId && (
            <button className="btn btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={() => { setFane('kunde'); setNyEmTrigger(t => t + 1); }}
              title="Åpner skjema for ny endringsmelding på Kunde-fanen">
              <Ikon ikon={MessageSquare} size={13} /> Ny endringsmelding
            </button>
          )}
          {avledet === 'startet' && (
            <button className="btn btn-sm" title="Prosjektet regnes som ikke startet til noen setter på nye folk — gamle tildelinger beholdes"
              onClick={() => {
                const antall = (state.tildelinger || []).filter(t => t && t.prosjektId === p.id && t.prosjektId !== '__FERIE__').length;
                const dato = window.prompt(`Flytte «${p.adresse || p.navn}» til pipeline?\n\nProsjektet har ${antall} tildeling${antall === 1 ? '' : 'er'}. De beholdes (grået i ukeplanen), men prosjektet regnes som ikke startet til noen setter på nye folk.\n\nForventet start (ÅÅÅÅ-MM-DD):`, leggTilDager(new Date().toISOString().slice(0, 10), 14));
                if (dato === null) return;
                dispatch({ type: 'UPDATE_PROSJEKT', payload: flyttTilPipeline(p, state.tildelinger, { forventetStart: /^\d{4}-\d{2}-\d{2}$/.test(dato) ? dato : null, av: localStorage.getItem('fbs_user_navn') || 'ukjent' }) });
              }}>
              Flytt til pipeline
            </button>
          )}
          {avledet === 'ferdig'
            ? <button className="btn btn-sm" onClick={() => settStatus('aktiv')} title="Status tilbake til Startet/Ikke startet — ingenting slettes">Gjenåpne</button>
            : <button className="btn btn-sm" onClick={() => { if (window.confirm(`Markere ${p.navn || p.adresse} som ferdig?`)) settStatus('fullfort'); }}>Marker ferdig</button>}
          <button className="btn btn-sm" style={{ color: 'var(--warning)' }}
            onClick={() => { if (window.confirm(`Arkivere ${p.navn || p.adresse}? (skjules, slettes aldri)`)) { dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, arkivert: true, arkivertDato: new Date().toISOString() } }); onTilbake(); } }}>
            <Ikon ikon={Archive} size={13} />
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
        {[p.jobbType, p.kunde?.navn || p.kundeNavn, p.startDato ? `${p.startDato}${p.sluttDato ? ' – ' + p.sluttDato : ''}` : null,
          pl ? `PL: ${pl.navn}` : null, al ? `AL: ${al.navn}` : null].filter(Boolean).join(' · ') || 'Rediger og tilbud-kobling gjøres fra ⋯-menyen i prosjektlista.'}
      </div>

      {/* ── Fanelinje (rullbar på mobil) ── */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', borderBottom: '2px solid var(--border)', marginBottom: 14, paddingBottom: 0 }}>
        {FANER.map(f => (
          <button key={f.id} onClick={() => setFane(f.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', border: 'none', background: 'none', cursor: 'pointer',
              padding: '9px 13px', fontSize: 13.5, fontWeight: fane === f.id ? 600 : 500,
              color: fane === f.id ? '#185FA5' : 'var(--text-secondary)',
              borderBottom: fane === f.id ? '2.5px solid #185FA5' : '2.5px solid transparent', marginBottom: -2 }}>
            <Ikon ikon={f.ikon} size={14} /> {f.label}
            {f.badge && (
              <span style={{ fontSize: 10.5, fontWeight: 600, borderRadius: 8, padding: '1px 7px',
                background: f.badgeGul ? '#fef3c7' : '#eff6ff', color: f.badgeGul ? '#b45309' : '#1d4ed8' }}>{f.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Fanene: eksisterende komponenter låst til prosjektet ── */}
      {fane === 'framdrift' && (
        <Framdriftsplan fastProsjektId={prosjektId} onFastTilbake={() => setFane('oversikt')} onNavigate={onNavigate} />
      )}
      {fane === 'sjekklister' && (
        <KS fastProsjektId={prosjektId} onFastTilbake={() => { setFane('oversikt'); hentKs(); }} />
      )}
      {fane === 'bemanning' && (
        <Bemanningsplan fastProsjektId={prosjektId} />
      )}
      {fane === 'tilbud' && (
        (p.tilbudPayload || p.tilbudLink || p.kildeTilbudData || (Array.isArray(p.poster) && p.poster.length > 0))
          ? <TilbudsdataVisning prosjekt={p} />
          : <div className="empty">Ingen tilbudsdata — koble prosjektet til et tilbud fra ⋯-menyen i prosjektlista.</div>
      )}
      {fane === 'logg' && (
        <div style={{ fontSize: 12.5, maxWidth: 760 }}>
          {logg === null && <div style={{ color: 'var(--text-muted)' }}>Henter logg…</div>}
          {Array.isArray(logg) && logg.length === 0 && <div className="empty">Ingen logg-innslag for dette prosjektet.</div>}
          {(logg || []).map((e, i) => (
            <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--bg-subtle, #f1f5f9)' }}>
              <div style={{ fontWeight: 500 }}>{e.endring?.felt || e.felt}: {String(e.endring?.tilVerdi ?? e.tilVerdi ?? '–')}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{e.endretAv || '?'} · {e.endretDato ? new Date(e.endretDato).toLocaleString('nb-NO') : ''} · {e.kilde || ''}</div>
            </div>
          ))}
        </div>
      )}

      {fane === 'oversikt' && (
        <div style={{ maxWidth: 900 }}>
          {/* Fire tall */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              ['Kontrakt', fmtKr(kontrakt), tilbudId ? `tilbud ${tilbudId}` : 'ikke koblet til tilbud'],
              ['Framdrift', tasks.length ? `${faserFerdig} av ${tasks.length} faser` : 'ingen plan ennå',
                [paagaaende ? `pågår: ${paagaaende.name}` : null, oppgSum.t ? `${oppgSum.f}/${oppgSum.t} oppgaver` : null].filter(Boolean).join(' · ')],
              ['Bemanning denne uka', `${denneUka.length} person${denneUka.length === 1 ? '' : 'er'}`, denneUka.map(n => n.split(' ')[0]).slice(0, 6).join(', ')],
              ['Sjekklister', alleLister.length ? `${signert} av ${alleLister.length} signert` : 'ingen ennå',
                utenAnsvarlig ? `${utenAnsvarlig} uten ansvarlig` : (alleLister.length ? 'alle har ansvarlig' : '')],
              ...(p.gruppeId ? [[
                'Gruppen',
                `${sosken.length} oppdrag`,
                `kontrakt Σ ${fmtKr(gruppeKontrakt)} · ${gruppeFolk} folk denne uka`,
              ]] : []),
              ...(avledet === 'ikke_startet' ? [[
                'Planlagt start',
                p.pipeline?.forventetStart ? `u${ukeNr(p.pipeline.forventetStart)}` : (p.startDato ? `u${ukeNr(p.startDato)}` : 'dato ikke satt'),
                <span key="pl" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {`${p.pipeline?.forventetUker || '?'} uker · ${p.pipeline?.forventetFolk || '?'} folk`}
                  {onNavigate && (p.pipeline?.forventetStart || p.startDato) && (
                    <button className="btn btn-sm" style={{ height: 24, fontSize: 11.5 }}
                      onClick={() => { sessionStorage.setItem('fbs_planlegg_inn', p.id); onNavigate('bemanningsplan'); }}>
                      Planlegg inn
                    </button>
                  )}
                </span>,
              ]] : []),
            ].map(([tittel, tall, under], i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tittel}</div>
                <div style={{ fontSize: 17, fontWeight: 600, margin: '3px 0 1px' }}>{tall}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{under}</div>
              </div>
            ))}
          </div>

          {/* «Trenger handling» — PR1: de lokale reglene; resten i PR2 */}
          {(() => {
            const linjer = [];
            if (utenAnsvarlig) linjer.push({ tekst: `${utenAnsvarlig} sjekkliste${utenAnsvarlig === 1 ? '' : 'r'} uten ansvarlig`, fane: 'sjekklister' });
            if (!p.startDato || !p.sluttDato) linjer.push({ tekst: 'Prosjektet mangler start-/sluttdato', fane: 'oversikt' });
            if (!tilbudId) linjer.push({ tekst: 'Ikke koblet til tilbud — kontrakt og kundeportal mangler', fane: 'kunde' });
            const snartFaser = tasks.filter(t => !(t.tildelt || []).length && (t.pct ?? 0) < 100);
            if (tasks.length && snartFaser.length === tasks.length) linjer.push({ tekst: 'Ingen faser har tildelte personer', fane: 'framdrift' });
            // PR2-reglene:
            for (const uke of tommeUker) linjer.push({ tekst: `Ingen bemanning ${uke}`, fane: 'bemanning' });
            // Oppdrag 21: pipeline-prosjekt som starter snart uten en eneste tildeling
            if (p.pipeline?.forventetStart && !(state.tildelinger || []).some(t => t && t.prosjektId === prosjektId && t.prosjektId !== '__FERIE__')) {
              const dTilStart = Math.round((new Date(p.pipeline.forventetStart + 'T00:00:00') - Date.now()) / 86400000);
              if (dTilStart <= 14) {
                linjer.push({ tekst: dTilStart < 0 ? `Planlagt start (uke ${ukeNr(p.pipeline.forventetStart)}) er passert — ingen bemanning` : `Starter om ${dTilStart} dager — ingen bemanning`, fane: 'bemanning' });
              }
            }
            const omSju = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
            const faserNaa = byggInterneFaser(p, { iDag }) || [];
            const faserOmSju = byggInterneFaser(p, { iDag: omSju, fallbackIDag: iDag }) || [];
            const starterSnart = tasks.filter((t, i) => !(t.tildelt || []).length && (t.pct ?? 0) < 100
              && !faserNaa[i]?.pagarNa && faserOmSju[i]?.pagarNa);
            for (const t of starterSnart) linjer.push({ tekst: `Fasen «${t.name}» starter innen 7 dager uten tildelte folk`, fane: 'framdrift' });
            const ventendeEndringer = (tp.endringsmeldinger || []).filter(em => em && /venter/i.test(em.status || '')
              && em.dato && (Date.now() - new Date(em.dato).getTime()) > 3 * 86400000);
            for (const em of ventendeEndringer) linjer.push({ tekst: `Endringsmelding «${em.tittel || em.navn || ''}» har ventet på kunden i over 3 dager`, fane: 'kunde' });
            const sisteSporsmal = (befaring?.kundeAktivitet || []).filter(a => a && a.handling === 'klikket-sporsmal').pop();
            if (sisteSporsmal && (Date.now() - new Date(sisteSporsmal.sistTidspunkt || sisteSporsmal.tidspunkt || 0).getTime()) > 86400000) {
              linjer.push({ tekst: 'Kunden klikket «Spørsmål» for over 1 dag siden — er de fulgt opp?', fane: 'kunde' });
            }
            if (!linjer.length) return null;
            return (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#92400e', marginBottom: 4 }}><IkonTekst ikon={TriangleAlert} size={14} gap={5}>Trenger handling</IkonTekst></div>
                {linjer.map((l, i) => (
                  <button key={i} onClick={() => setFane(l.fane)}
                    style={{ display: 'block', background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 13, padding: '2px 0', textDecoration: 'underline' }}>
                    {l.tekst}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Siste hendelser */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}><IkonTekst ikon={ScrollText} size={14} gap={5}>Siste hendelser</IkonTekst></div>
            {(logg || []).slice(0, 5).map((e, i) => (
              <div key={'l' + i} style={{ fontSize: 12.5, padding: '3px 0', color: 'var(--text-secondary)' }}>
                {String(e.endring?.tilVerdi ?? e.tilVerdi ?? e.endring?.felt ?? '')} <span style={{ color: 'var(--text-muted)' }}>· {e.endretAv || '?'} · {relTid(e.endretDato)}</span>
              </div>
            ))}
            {kundeAkt.slice(0, 3).map((a, i) => (
              <div key={'k' + i} style={{ fontSize: 12.5, padding: '3px 0', color: '#0891b2' }}>
                Kunden {a.handling === 'aapnet' ? 'åpnet tilbudet' : a.handling === 'klikket-sporsmal' ? 'klikket «Spørsmål»' : a.handling} <span style={{ color: 'var(--text-muted)' }}>· {relTid(a.sistTidspunkt || a.tidspunkt)}</span>
              </div>
            ))}
            {(logg || []).length === 0 && kundeAkt.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Ingen hendelser ennå.</div>}
          </div>
        </div>
      )}

      {fane === 'kunde' && (
        <div style={{ maxWidth: 760 }}>
          {!tilbudId ? (
            <div className="empty">
              Prosjektet er ikke koblet til et tilbud — kundeportal, kontraktssum og
              endringsmeldinger blir tilgjengelige når koblingen er på plass.
              Bruk «Koble til tilbud…» i ⋯-menyen i prosjektlista.
            </div>
          ) : (
            <>
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}><IkonTekst ikon={Eye} size={14} gap={5}>Kunden ser</IkonTekst></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, fontSize: 13 }}>
                  <div><div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Akseptert</div>
                    {befaring?.status === 'godkjent' || tp.akseptertDato ? <span style={{ color: '#15803d', fontWeight: 500 }}><Ikon ikon={CircleCheck} size={13} /> {tp.akseptertDato ? new Date(tp.akseptertDato).toLocaleDateString('nb-NO') : 'Ja'}</span> : <span style={{ color: 'var(--text-muted)' }}>Ikke akseptert ennå</span>}</div>
                  <div><div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Kontraktssum</div><b>{fmtKr(kontrakt)}</b></div>
                  <div><div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Delt framdrift</div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 500 }}>
                      <input type="checkbox" checked={p.framdriftDeltMedKunde === true}
                        onChange={e => { dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, framdriftDeltMedKunde: e.target.checked } }); if (e.target.checked) varsleFramdriftEksport(p.id); }} />
                      {p.framdriftDeltMedKunde ? 'På' : 'Av'}
                    </label></div>
                  <div><div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Overtakelse</div>
                    {tp.overtakelse?.bekreftet ? <span style={{ color: '#15803d', fontWeight: 500 }}>Bekreftet</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
                </div>
              </div>

              <Endringsmeldinger tilbudId={tilbudId} nyTrigger={nyEmTrigger} />

              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Kundens aktivitet</span>
                  <span style={{ marginLeft: 'auto' }}><KundeportalKnapp token={portalToken} kompakt medKopier={false} /></span>
                </div>
                {kundeAkt.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Ingen kundeaktivitet registrert ennå.</div>}
                {kundeAkt.map((a, i) => (
                  <div key={i} style={{ fontSize: 12.5, padding: '3px 0', color: 'var(--text-secondary)' }}>
                    {a.handling === 'aapnet' ? `Åpnet tilbudet${a.antall ? ' ' + a.antall + 'x' : ''}` : a.handling === 'klikket-sporsmal' ? 'Klikket «Spørsmål»' : a.handling === 'klikket-aksepter' ? 'Klikket «Aksepter»' : a.handling}
                    <span style={{ color: 'var(--text-muted)' }}> · {relTid(a.sistTidspunkt || a.tidspunkt)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
