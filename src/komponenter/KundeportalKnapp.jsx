// ═══ «Kundeportal»-knappen (postkasse-oppdrag 8) ═══
// Én gjenkjennelig knapp overalt der et prosjekt/en befaring med
// tilbud-kobling vises. Åpner kundeportalen i ny fane MED ?intern=1
// (PL-besøk telles aldri i kunde-statistikken), pluss valgfri
// «Kopier kundelenke» (UTEN intern=1 — den sendes til kunden).
// Uten token rendres ingenting — aldri døde lenker.

import { useState } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { Ikon } from './Ikon';
import { kundeportalUrl } from '../kundeportal';

export default function KundeportalKnapp({ token, fane = null, medKopier = true, kompakt = false, stil = {} }) {
  const [kopiert, setKopiert] = useState(false);
  if (!token) return null;

  const kopier = async (e) => {
    e.preventDefault(); e.stopPropagation();
    try {
      await navigator.clipboard.writeText(kundeportalUrl(token, { intern: false }));
      setKopiert(true); setTimeout(() => setKopiert(false), 2000);
    } catch { window.prompt('Kopier kundelenken:', kundeportalUrl(token, { intern: false })); }
  };

  const knappStil = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: kompakt ? '4px 8px' : '6px 11px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-strong)', background: 'var(--bg-surface)',
    color: 'var(--accent)', fontSize: kompakt ? 12 : 13, fontWeight: 500,
    textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap', ...stil,
  };

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
      <a style={knappStil} href={kundeportalUrl(token, { intern: true, fane })}
        target="_blank" rel="noopener noreferrer"
        title="Åpner kundeportalen i intern visning — telles ikke i kunde-statistikken">
        <Ikon ikon={ExternalLink} size={kompakt ? 13 : 14} /> Kundeportal
      </a>
      {medKopier && (
        <button style={{ ...knappStil, color: kopiert ? 'var(--success)' : 'var(--text-secondary)' }}
          onClick={kopier} title="Kopier lenken kunden skal få (uten intern-flagg)">
          <Ikon ikon={kopiert ? Check : Copy} size={kompakt ? 13 : 14} />{kopiert ? ' Kopiert!' : kompakt ? '' : ' Kopier kundelenke'}
        </button>
      )}
    </span>
  );
}
