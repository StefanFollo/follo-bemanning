// ═══ Tilbudsdata-visning (SPEC-del2 trinn 1) ═══
// Viser hele tilbudspakken på et prosjekt: nøkkeltall, fagBreakdown, poster,
// opsjoner, byggInfo, notater + lenke-rad (kundeside/PDF/tilbuds-app).
// Robust mot delvise payloads — hver seksjon vises kun når data finnes.

const TILBUDSAPP_URL = 'https://follo-befaring.vercel.app';

function fmtKr(n) {
  const tall = Number(n);
  if (!tall && tall !== 0) return null;
  if (Number.isNaN(tall)) return null;
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(tall);
}

function fmtTimer(n) {
  const tall = Number(n);
  if (!tall || Number.isNaN(tall)) return null;
  return tall.toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + ' t';
}

function Seksjon({ tittel, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 500, marginBottom: 6, color: 'var(--text-primary)' }}>{tittel}</div>
      {children}
    </div>
  );
}

// Lenke-rad — knapper vises kun når tilhørende data finnes.
// Kundesiden åpnes ALLTID med ?intern=1 slik at PL-besøk ikke telles i
// kunde-statistikken (tilbuds-appen håndterer flagget).
export function TilbudLenkeRad({ prosjekt }) {
  const tp = prosjekt.tilbudPayload || {};
  const publicToken = tp.publicToken || tp.public_token || prosjekt.publicToken || null;
  const pdfUrl = tp.tilbudPdfUrl || tp.pdfUrl || null;
  const tilbudLink = prosjekt.tilbudLink || tp.tilbudLink || null;
  if (!publicToken && !pdfUrl && !tilbudLink) return null;
  const knappStil = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-strong)', background: 'var(--bg-surface)',
    color: 'var(--accent)', fontSize: 13, fontWeight: 500,
    textDecoration: 'none', cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
      {publicToken && (
        <a style={knappStil} href={`${TILBUDSAPP_URL}/t/${publicToken}?intern=1`} target="_blank" rel="noopener noreferrer"
          title="Åpner kundens tilbudside i intern visning — telles ikke i kunde-statistikken">
          👁 Se kundesiden
        </a>
      )}
      {pdfUrl && (
        <a style={knappStil} href={pdfUrl} target="_blank" rel="noopener noreferrer">
          📄 Åpne tilbud-PDF
        </a>
      )}
      {tilbudLink && (
        <a style={knappStil} href={tilbudLink} target="_blank" rel="noopener noreferrer">
          🧮 Åpne i tilbuds-appen
        </a>
      )}
    </div>
  );
}

export default function TilbudsdataVisning({ prosjekt }) {
  const p = prosjekt;
  const tp = p.tilbudPayload || {};
  const kd = p.kildeTilbudData || {};

  const poster = (Array.isArray(tp.poster) && tp.poster.length ? tp.poster : null)
    || (Array.isArray(p.poster) && p.poster.length ? p.poster : null)
    || (Array.isArray(kd.poster) && kd.poster.length ? kd.poster : null)
    || [];
  const totalSum = tp.totalSum ?? tp.akseptertSum ?? null;
  const totalEksMva = tp.totalEksMva ?? tp.sumEksMva ?? null;
  const totalTimer = tp.totalTimer ?? (kd.timer ? Object.values(kd.timer).reduce((s, t) => s + (Number(t) || 0), 0) : null);
  const fagBreakdown = tp.fagBreakdown || null; // { fag: {timer, kr} } eller liknende
  const opsjoner = Array.isArray(tp.opsjoner) ? tp.opsjoner : null;
  const valgte = new Set((p.valgteOpsjoner || tp.valgteOpsjoner || []).map(o => typeof o === 'string' ? o : o?.id || o?.navn));
  const byggInfo = tp.byggInfo || null;
  const soner = Array.isArray(tp.soner) ? tp.soner : null;
  const notater = tp.befaringsnotater || tp.notater || tp.notat || null;
  const kundeKommentar = tp.kundeKommentar || null;

  const nokkeltall = [
    totalSum != null && totalSum > 0 && ['💰 Totalsum (inkl. mva)', fmtKr(totalSum)],
    totalEksMva != null && totalEksMva > 0 && ['Sum eks. mva', fmtKr(totalEksMva)],
    (p.estimertSum || tp.estimertSum) && ['Estimert sum', fmtKr(p.estimertSum || tp.estimertSum)],
    p.belop && ['Kontraktssum i prosjektet', fmtKr(p.belop)],
    totalTimer && ['⏱ Totale timer', fmtTimer(totalTimer)],
    (p.pristype || tp.pristype) && ['Pristype', p.pristype || tp.pristype],
    (p.oppstartTekst || kd.oppstart) && ['Oppstart', p.oppstartTekst || kd.oppstart],
    (p.varighetTekst || kd.varighet) && ['Varighet', p.varighetTekst || kd.varighet],
    tp.prosjektStandard && ['Standard', tp.prosjektStandard],
    tp.detaljnivaa && ['Detaljnivå', tp.detaljnivaa],
  ].filter(Boolean);

  return (
    <div style={{ fontSize: 13 }}>
      <TilbudLenkeRad prosjekt={p} />

      {p.tilbudKobletDato && (
        <div style={{ fontSize: 12, color: '#5d6b80', margin: '6px 0' }}>
          🔗 Koblet til tilbud {new Date(p.tilbudKobletDato).toLocaleDateString('nb-NO')}{p.tilbudKobletAv ? ` av ${p.tilbudKobletAv}` : ''}
        </div>
      )}

      {nokkeltall.length > 0 && (
        <Seksjon tittel="Nøkkeltall">
          {nokkeltall.map(([label, verdi], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--bg-subtle)' }}>
              <span style={{ color: '#5d6b80' }}>{label}</span>
              <span style={{ fontWeight: 500 }}>{verdi}</span>
            </div>
          ))}
        </Seksjon>
      )}

      {fagBreakdown && typeof fagBreakdown === 'object' && Object.keys(fagBreakdown).length > 0 && (
        <Seksjon tittel="Per fag">
          {Object.entries(fagBreakdown).map(([fag, info]) => {
            const timer = typeof info === 'object' ? (info.timer ?? info.antallTimer) : info;
            const kr = typeof info === 'object' ? (info.kr ?? info.sum ?? info.belop) : null;
            return (
              <div key={fag} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--bg-subtle)' }}>
                <span style={{ textTransform: 'capitalize' }}>{fag}</span>
                <span style={{ color: '#5d6b80' }}>
                  {[fmtTimer(timer), fmtKr(kr)].filter(Boolean).join(' · ') || String(info)}
                </span>
              </div>
            );
          })}
        </Seksjon>
      )}

      {poster.length > 0 && (
        <Seksjon tittel={`Poster (${poster.length})`}>
          {poster.map((post, i) => (
            <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--bg-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{post.navn || post.tittel || post.beskrivelse || `Post ${i + 1}`}</span>
                {(post.kalkyle?.totalPris ?? post.sum) != null && (
                  <span style={{ color: '#5d6b80', whiteSpace: 'nowrap' }}>{fmtKr(post.kalkyle?.totalPris ?? post.sum)}</span>
                )}
              </div>
              {Array.isArray(post.kalkyle?.timer) && post.kalkyle.timer.length > 0 && (
                <div style={{ fontSize: 12, color: '#5d6b80', paddingLeft: 8 }}>
                  {post.kalkyle.timer.map((t, j) => `${t.fag || 'annet'}: ${t.antall || 0} t`).join(' · ')}
                </div>
              )}
            </div>
          ))}
        </Seksjon>
      )}

      {opsjoner && opsjoner.length > 0 && (
        <Seksjon tittel={`Opsjoner (${opsjoner.length})`}>
          {opsjoner.map((o, i) => {
            const navn = typeof o === 'string' ? o : o.navn || o.tittel || `Opsjon ${i + 1}`;
            const id = typeof o === 'string' ? o : o.id || navn;
            const erValgt = valgte.has(id) || valgte.has(navn);
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--bg-subtle)' }}>
                <span>{erValgt ? '✅' : '⬜'} {navn}</span>
                {typeof o === 'object' && o.sum != null && <span style={{ color: '#5d6b80' }}>{fmtKr(o.sum)}</span>}
              </div>
            );
          })}
        </Seksjon>
      )}
      {!opsjoner && (p.valgteOpsjoner || []).length > 0 && (
        <Seksjon tittel="Valgte opsjoner">
          {p.valgteOpsjoner.map((o, i) => (
            <div key={i}>✅ {typeof o === 'string' ? o : o.navn || o.id || `Opsjon ${i + 1}`}</div>
          ))}
        </Seksjon>
      )}

      {(byggInfo || soner) && (
        <Seksjon tittel="Bygg og soner">
          {byggInfo && (
            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
              {typeof byggInfo === 'string'
                ? byggInfo
                : [byggInfo.byggeaar && `Byggeår: ${byggInfo.byggeaar}`, byggInfo.byggtype && `Byggtype: ${byggInfo.byggtype}`,
                   byggInfo.bra && `BRA: ${byggInfo.bra} m²`, byggInfo.tilstand && `Tilstand: ${byggInfo.tilstand}`]
                    .filter(Boolean).join(' · ') || JSON.stringify(byggInfo)}
            </div>
          )}
          {soner && soner.length > 0 && soner.map((s, i) => (
            <div key={i} style={{ paddingLeft: 8, color: 'var(--text-secondary)' }}>
              📍 {s.navn || s.name || `Sone ${i + 1}`}{s.areal ? ` — ${s.areal} m²` : ''}
            </div>
          ))}
        </Seksjon>
      )}

      {notater && (
        <Seksjon tittel="Befaringsnotater">
          <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{typeof notater === 'string' ? notater : JSON.stringify(notater)}</div>
        </Seksjon>
      )}
      {kundeKommentar && (
        <Seksjon tittel="Kundekommentar">
          <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>«{kundeKommentar}»</div>
        </Seksjon>
      )}
    </div>
  );
}
