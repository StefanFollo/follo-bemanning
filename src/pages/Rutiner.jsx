import { useState, useMemo } from 'react';
import { ClipboardList, TriangleAlert, ClipboardCheck, FilePen, FileText, BookOpen, Printer, Sprout } from 'lucide-react';
import { Ikon, IkonTekst } from '../komponenter/Ikon';
import { RUTINER_DATA } from '../data/rutiner-holte';

// Rutiner: hele HMS/KS-håndboken (Mestergruppen/Holte) — søkbar og lesbar
// for alle ansatte. Datagrunnlaget ligger i src/data/rutiner-holte.js og
// lastes kun når denne fanen åpnes (lazy chunk).

const TYPE_INFO = {
  rutine:     { label: 'Rutiner',     ikon: ClipboardList,  farge: '#2563eb' },
  instruks:   { label: 'Instrukser',  ikon: TriangleAlert,  farge: '#c2410c' },
  sjekkliste: { label: 'Sjekklister', ikon: ClipboardCheck, farge: '#15803d' },
  skjema:     { label: 'Skjemaer',    ikon: FilePen,        farge: '#9333ea' },
  dokument:   { label: 'Dokumenter',  ikon: FileText,       farge: '#5d6b80' },
};

function skrivUtDokument(dok) {
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>${dok.tittel} – FolloByggService</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:28px;line-height:1.6}
      .hdr{display:flex;justify-content:space-between;border-bottom:2px solid #185FA5;padding-bottom:10px;margin-bottom:16px}
      .logo{font-size:20px;font-weight:700;color:#185FA5}
      .sub{font-size:10px;color:#666;margin-top:2px}
      h1{font-size:17px;margin-bottom:14px}
      pre{white-space:pre-wrap;font-family:inherit;font-size:13px}
      @media print{body{padding:10px}}
    </style>
  </head><body>
    <div class="hdr">
      <div><div class="logo">FolloByggService</div><div class="sub">HMS/KS-håndbok · ${dok.kapittel}${dok.underkapittel ? ' · ' + dok.underkapittel : ''}</div></div>
      <div class="sub">Utskrift: ${new Date().toLocaleDateString('nb-NO')}</div>
    </div>
    <h1>${dok.tittel}</h1>
    <pre>${dok.innhold.replace(/</g, '&lt;')}</pre>
    <script>window.onload = function(){ window.print(); }<\/script>
  </body></html>`);
  w.document.close();
}

export default function Rutiner() {
  const data = RUTINER_DATA;
  const [sok, setSok] = useState('');
  const [kapFilter, setKapFilter] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);
  const [valgt, setValgt] = useState(null);

  const kapitler = useMemo(() => {
    const m = new Map();
    for (const d of data.dokumenter) {
      if (!m.has(d.kapittel)) m.set(d.kapittel, 0);
      m.set(d.kapittel, m.get(d.kapittel) + 1);
    }
    return [...m.entries()];
  }, [data]);

  const filtrert = useMemo(() => {
    const q = sok.trim().toLowerCase();
    return data.dokumenter.filter(d => {
      if (kapFilter && d.kapittel !== kapFilter) return false;
      if (typeFilter && d.type !== typeFilter) return false;
      if (q) {
        return d.tittel.toLowerCase().includes(q) ||
          (q.length >= 4 && d.innhold.toLowerCase().includes(q));
      }
      return true;
    });
  }, [data, sok, kapFilter, typeFilter]);

  const typeTeller = useMemo(() => {
    const t = {};
    for (const d of data.dokumenter) t[d.type] = (t[d.type] || 0) + 1;
    return t;
  }, [data]);

  // ── Dokumentvisning ──
  if (valgt) {
    const ti = TYPE_INFO[valgt.type] || TYPE_INFO.dokument;
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button className="btn" onClick={() => setValgt(null)}>← Tilbake</button>
            <h2 style={{ fontSize: 17, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Ikon ikon={ti.ikon} size={16} farge={ti.farge} style={{ marginRight: 6 }} />{valgt.tittel}
            </h2>
          </div>
          <button className="btn" onClick={() => skrivUtDokument(valgt)} title="Skriv ut / lagre som PDF" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={Printer} size={16} /> PDF</button>
        </div>
        <div style={{ fontSize: 12, color: '#5d6b80', marginBottom: 12 }}>
          {valgt.kapittel}{valgt.underkapittel ? ` · ${valgt.underkapittel}` : ''} · side {valgt.side} i håndboken
        </div>
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          padding: '20px 24px', maxWidth: 860, whiteSpace: 'pre-wrap',
          fontSize: 14, lineHeight: 1.65, color: '#1e293b',
        }}>
          {valgt.innhold}
        </div>
      </div>
    );
  }

  // ── Liste-/oversiktsvisning ──
  return (
    <div className="page">
      <div className="page-header">
        <h2><IkonTekst ikon={BookOpen} size={18}>Rutiner &amp; HMS/KS-håndbok</IkonTekst> <span className="count-badge">{data.dokumenter.length}</span></h2>
      </div>
      <div style={{ fontSize: 12, color: '#5d6b80', marginBottom: 12 }}>
        {data.meta.kilde} · eksportert {data.meta.eksportert}
      </div>

      {/* Søk + typefilter */}
      <div className="toolbar" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <input
          className="search-input"
          placeholder="Søk i tittel og innhold…"
          value={sok}
          onChange={e => setSok(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        {Object.entries(TYPE_INFO).map(([key, ti]) => typeTeller[key] ? (
          <button
            key={key}
            className="btn btn-sm"
            style={typeFilter === key
              ? { background: ti.farge, color: '#fff', borderColor: ti.farge }
              : { color: ti.farge, borderColor: ti.farge + '66' }}
            onClick={() => setTypeFilter(t => t === key ? null : key)}
          >
            <IkonTekst ikon={ti.ikon} size={14} gap={4}>{ti.label} ({typeTeller[key]})</IkonTekst>
          </button>
        ) : null)}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Kapittel-nav */}
        <div style={{ width: 240, flexShrink: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}>
          <button
            className="btn btn-sm"
            style={{ width: '100%', textAlign: 'left', marginBottom: 4, ...(kapFilter === null ? { background: '#1e3a5f', color: '#fff' } : {}) }}
            onClick={() => setKapFilter(null)}
          >
            Alle kapitler ({data.dokumenter.length})
          </button>
          {kapitler.map(([kap, antall]) => (
            <button
              key={kap}
              className="btn btn-sm"
              style={{
                width: '100%', textAlign: 'left', marginBottom: 4, fontSize: 12,
                ...(kapFilter === kap ? { background: '#1e3a5f', color: '#fff' } : {}),
                ...(kap.includes('Miljøfyrtårn') ? { borderColor: '#15803d', fontWeight: 500 } : {}),
              }}
              onClick={() => setKapFilter(k => k === kap ? null : kap)}
            >
              {kap.includes('Miljøfyrtårn') && <Ikon ikon={Sprout} size={13} farge="#15803d" style={{ marginRight: 4 }} />}{kap} ({antall})
            </button>
          ))}
        </div>

        {/* Dokumentliste */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {filtrert.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#5d6b80', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              Ingen dokumenter matcher søket.
            </div>
          )}
          {(() => {
            let forrigeUnderkap = '__start__';
            return filtrert.map(d => {
              const ti = TYPE_INFO[d.type] || TYPE_INFO.dokument;
              const visUnderkap = d.underkapittel !== forrigeUnderkap && !sok;
              forrigeUnderkap = d.underkapittel;
              return (
                <div key={d.id}>
                  {visUnderkap && d.underkapittel && (
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#5d6b80', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px 4px' }}>
                      {d.underkapittel}
                    </div>
                  )}
                  <button
                    onClick={() => setValgt(d)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0',
                      borderLeft: `4px solid ${ti.farge}`, borderRadius: 8,
                      padding: '10px 14px', marginBottom: 6, cursor: 'pointer', fontSize: 13.5,
                      minHeight: 44,
                    }}
                  >
                    <Ikon ikon={ti.ikon} size={16} farge={ti.farge} />
                    <span style={{ flex: 1, fontWeight: 500, color: '#1e293b' }}>{d.tittel}</span>
                    <span style={{ fontSize: 11, color: '#5d6b80', flexShrink: 0 }}>{d.kapittel.slice(0, 2)}</span>
                  </button>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
