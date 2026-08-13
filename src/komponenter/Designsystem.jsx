import { useState, useRef, useEffect } from 'react';
import './designsystem.css';

// ═══════════════════════════════════════════════════════════════════
// FBS DESIGNSYSTEM (SPEC-prosjektside-C-designsystem.md, godkjent 08.08)
// Gjenbrukbare byggeklosser for alle sider. Prosjekt-siden er første bruker;
// Befaring/Service/Reklamasjon/Biler følger etter (spec del 6).
// ═══════════════════════════════════════════════════════════════════

function fmtSum(kr) {
  if (!kr || kr <= 0) return null;
  if (kr >= 1000000) return (kr / 1000000).toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + 'M';
  if (kr >= 1000) return Math.round(kr / 1000) + 'k';
  return String(Math.round(kr));
}

// ── 1.1 KPI-kort (klikkbart, varsel-variant) ──
export function KpiKort({ tall, label, sum, ikon, farge = '#2563eb', varsel = false, aktiv = false, onClick }) {
  return (
    <button
      className={`ds-kpi${varsel ? ' ds-kpi--varsel' : ''}${aktiv ? ' ds-kpi--aktiv' : ''}`}
      style={aktiv ? { background: farge, borderColor: farge } : { borderTopColor: farge }}
      onClick={onClick}
    >
      <span className="ds-kpi-tall" style={aktiv ? {} : { color: farge }}>{ikon} {tall}</span>
      <span className="ds-kpi-label">{label}{sum ? ` · ${fmtSum(sum)}` : ''}</span>
    </button>
  );
}

// ── 1.2 Status-faner (teller + sum, dempede faner for Fullført/Arkivert) ──
export function StatusFaner({ faner, aktiv, onVelg }) {
  return (
    <div className="ds-faner" role="tablist">
      {faner.map(f => {
        const erAktiv = aktiv === f.key;
        return (
          <button
            key={f.key}
            role="tab"
            aria-selected={erAktiv}
            className={`ds-fane${erAktiv ? ' ds-fane--aktiv' : ''}${f.dempet ? ' ds-fane--dempet' : ''}`}
            style={erAktiv ? { background: f.farge, borderColor: f.farge } : {}}
            onClick={() => onVelg(f.key)}
          >
            <span className="ds-fane-ikon">{f.ikon}</span>
            <span className="ds-fane-label">{f.label}</span>
            <span className="ds-fane-teller" style={erAktiv ? {} : { color: f.farge }}>{f.teller}</span>
            {f.sum > 0 && <span className="ds-fane-sum">· {fmtSum(f.sum)}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── 1.4 ⋯-meny — alle handlinger bak én knapp, aldri knapperader ──
export function RadMeny({ valg }) {
  const [apen, setApen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!apen) return;
    const lukk = e => { if (ref.current && !ref.current.contains(e.target)) setApen(false); };
    const esc = e => { if (e.key === 'Escape') setApen(false); };
    document.addEventListener('mousedown', lukk);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', lukk); document.removeEventListener('keydown', esc); };
  }, [apen]);
  return (
    <div className="ds-radmeny" ref={ref} onClick={e => e.stopPropagation()}>
      <button className="ds-radmeny-knapp" title="Handlinger" onClick={() => setApen(a => !a)}>⋯</button>
      {apen && (
        <div className="ds-radmeny-liste">
          {valg.filter(Boolean).map((v, i) => v.skille
            ? <div key={i} className="ds-radmeny-skille" />
            : (
              <button
                key={i}
                className={`ds-radmeny-valg${v.farlig ? ' ds-radmeny-valg--farlig' : ''}`}
                onClick={() => { setApen(false); v.onClick(); }}
              >
                {v.ikon} {v.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ── 1.3 Kompakt rad ──
// tittel + valgfri varsel-tekst; meta-linje under; høyre side: nøkkeltall,
// mini fremdrifts-bar, ⋯-meny. Farget venstre-kant ved varsel.
export function KompaktRad({
  tittel, undertittel, varsel, varselFarge, meta = [], hint,
  hoyre = [], fremdrift = null, meny = null, hurtigknapp = null, onClick,
}) {
  return (
    <div
      className={`ds-rad${onClick ? ' ds-rad--klikkbar' : ''}`}
      style={varselFarge ? { borderLeft: `4px solid ${varselFarge}` } : {}}
      onClick={onClick}
    >
      <div className="ds-rad-venstre">
        <div className="ds-rad-tittel-linje">
          <span className="ds-rad-tittel">{tittel}</span>
          {undertittel && <span className="ds-rad-undertittel">{undertittel}</span>}
          {varsel && <span className="ds-rad-varsel" style={{ color: varselFarge || '#dc2626' }}>{varsel}</span>}
        </div>
        <div className="ds-rad-meta">
          {meta.filter(Boolean).map((m, i) => <span key={i}>{m}</span>)}
          {hint && <span className="ds-rad-hint">{hint}</span>}
        </div>
      </div>
      <div className="ds-rad-hoyre" onClick={hurtigknapp || meny ? undefined : undefined}>
        {hurtigknapp && (
          <button
            className="ds-rad-hurtigknapp"
            onClick={e => { e.stopPropagation(); hurtigknapp.onClick(); }}
          >
            {hurtigknapp.label}
          </button>
        )}
        {hoyre.filter(Boolean).map((h, i) => <span key={i} className="ds-rad-tall">{h}</span>)}
        {fremdrift !== null && (
          <span className="ds-rad-bar-wrap" title={`Fremdrift: ${fremdrift}%`}>
            <span className="ds-rad-bar" style={{ width: Math.min(100, Math.max(0, fremdrift)) + '%' }} />
          </span>
        )}
        {meny && <RadMeny valg={meny} />}
      </div>
    </div>
  );
}

// ── 1.6 Varsel-banner (klikk = filtrer) ──
export function VarselBanner({ ikon = '⚠', tekst, tone = 'roed', aktiv = false, onClick }) {
  return (
    <button
      className={`ds-banner ds-banner--${tone}${aktiv ? ' ds-banner--aktiv' : ''}`}
      onClick={onClick}
    >
      {ikon} {tekst}
    </button>
  );
}
