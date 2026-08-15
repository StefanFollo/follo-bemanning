// ═══ 4a: Forslags-boks for KS-sjekklister fra tilbudets fag ═══
// Brukes i prosjektpanelets KS-fane og på KS/HMS-sidens prosjektvisning.
// KUN forslag: oppretter aldri noe selv — PL tildeler med «✓ Tildel valgte».

import { useState, useMemo } from 'react';
import { lagFagForslag, erForslagSkjult, skjulForslag, lagKsTildeling } from '../ksForslag';

export default function KSFagForslag({ prosjekt, maler, onTildel }) {
  const [skjult, setSkjult] = useState(() => erForslagSkjult(prosjekt.id));

  const tildelteMalIds = useMemo(
    () => new Set((prosjekt.ksSjekklister || []).map(k => k.malId)),
    [prosjekt]
  );
  const { forslag, grunnlag } = useMemo(
    () => lagFagForslag(prosjekt, maler || [], tildelteMalIds),
    [prosjekt, maler, tildelteMalIds]
  );

  const [valgte, setValgte] = useState(() => new Set(
    forslag.filter(f => f.forhåndsvalgt).map(f => f.mal.id)
  ));

  if (skjult || forslag.length === 0) return null;

  function toggle(id) {
    setValgte(v => {
      const ny = new Set(v);
      if (ny.has(id)) ny.delete(id); else ny.add(id);
      return ny;
    });
  }

  function tildelValgte() {
    const malerValgt = forslag.filter(f => valgte.has(f.mal.id)).map(f => f.mal);
    if (malerValgt.length === 0) return;
    // Identisk datamodell som manuell tildeling — kun tildeltAv skiller
    onTildel(malerValgt.map(lagKsTildeling));
    setValgte(new Set());
  }

  return (
    <div style={{
      background: 'var(--accent-subtle)', border: '1px solid var(--border-strong)',
      borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius-md)',
      padding: '10px 12px', marginBottom: 12, fontSize: 13,
    }}>
      <div style={{ fontWeight: 500, color: 'var(--accent)', marginBottom: 6 }}>
        💡 Forslag basert på tilbudet{grunnlag ? ` (${grunnlag})` : ''}:
      </div>
      {forslag.map(({ mal, grunn }) => (
        <label key={mal.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={valgte.has(mal.id)} onChange={() => toggle(mal.id)} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mal.navn}</span>
          <span style={{
            fontSize: 11, color: grunn === 'obligatorisk' ? 'var(--warning)' : '#5d6b80',
            fontWeight: grunn === 'obligatorisk' ? 500 : 400, flexShrink: 0,
          }}>
            {grunn === 'obligatorisk' ? '(obligatorisk)' : `(${grunn})`}
          </span>
        </label>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-sm btn-primary" disabled={valgte.size === 0} onClick={tildelValgte}>
          ✓ Tildel valgte ({valgte.size})
        </button>
        <button className="btn btn-sm" onClick={() => { skjulForslag(prosjekt.id); setSkjult(true); }}>
          Skjul forslag
        </button>
      </div>
    </div>
  );
}
