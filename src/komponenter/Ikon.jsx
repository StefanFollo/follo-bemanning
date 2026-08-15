// ═══ Ikon-wrapper (SPEC-proff-polish-ikoner) ═══
// Lucide-ikoner med standardstørrelser: 16px i tekst/rader, 18px i nav,
// 20px i KPI, 32–40px i tomtilstander. Farge arves (currentColor);
// semantiske steder sender token-farge via `farge`.

export function Ikon({ ikon: IkonKomp, size = 16, farge, style, className }) {
  if (!IkonKomp) return null;
  return (
    <IkonKomp
      size={size}
      strokeWidth={size <= 14 ? 1.75 : 2}
      aria-hidden
      className={className}
      style={{ flexShrink: 0, verticalAlign: '-0.125em', display: 'inline-block', color: farge, ...style }}
    />
  );
}

// Ikon + tekst på én linje med 6px gap (knapper, meta-punkter, labels).
export function IkonTekst({ ikon, size = 16, farge, gap = 6, style, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, minWidth: 0, ...style }}>
      <Ikon ikon={ikon} size={size} farge={farge} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </span>
  );
}

// Tomtilstand: stort dempet ikon over teksten.
export function TomIkon({ ikon, size = 36 }) {
  return (
    <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
      <Ikon ikon={ikon} size={size} style={{ strokeWidth: 1.5 }} />
    </div>
  );
}
