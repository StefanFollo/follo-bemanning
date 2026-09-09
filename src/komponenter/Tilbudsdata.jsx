// ═══ Tilbudsdata-visning (SPEC-del2 trinn 1) ═══
// Viser hele tilbudspakken på et prosjekt: nøkkeltall, fagBreakdown, poster,
// opsjoner, byggInfo, notater + lenke-rad (kundeside/PDF/tilbuds-app).
// Robust mot delvise payloads — hver seksjon vises kun når data finnes.

import { Eye, FileText, Calculator, Link2, CircleCheck, Square, MapPin } from 'lucide-react';
import { Ikon } from './Ikon';

const TILBUDSAPP_URL = 'https://follo-befaring.vercel.app';

// Oppdrag 17.2: fag-nøklene lagres uten æøå — VISNINGS-mapping (nøklene røres aldri)
const FAG_VISNING = {
  tomrer: 'Tømrer', ror: 'Rør', rorlegger: 'Rørlegger', pl: 'PL', flis: 'Flis',
  maler: 'Maler', maling: 'Maling', parkett: 'Parkett', rive: 'Riving',
  riving: 'Riving', elektriker: 'Elektriker', ventilasjon: 'Ventilasjon',
  graving: 'Graving', mur: 'Mur', membran: 'Membran', annet: 'Annet',
};
export function fagNavn(nokkel) {
  const k = String(nokkel || '').toLowerCase();
  return FAG_VISNING[k] || (k.charAt(0).toUpperCase() + k.slice(1));
}

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
          <Ikon ikon={Eye} size={15} /> Se kundesiden
        </a>
      )}
      {/* Oppdrag 18a: /t/<token>/pdf-ruten er UTRULLET i tilbuds-appen
          (deres #13, commit 8abb81a) — tilbudPdfUrl brukes direkte igjen */}
      {pdfUrl && (
        <a style={knappStil} href={pdfUrl} target="_blank" rel="noopener noreferrer"
          title="Åpner tilbudet med automatisk «Lagre som PDF»">
          <Ikon ikon={FileText} size={15} /> Åpne tilbud-PDF
        </a>
      )}
      {tilbudLink && (
        <a style={knappStil} href={tilbudLink} target="_blank" rel="noopener noreferrer">
          <Ikon ikon={Calculator} size={15} /> Åpne i tilbuds-appen
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

  // Oppdrag 17.3: tydelige summer — Tilbudssum eks./inkl. mva fra tilbudet;
  // «Estimert sum» (gammelt manuelt felt) skjules når tilbudet finnes;
  // kontraktssummen merkes med kilde og varsler ved avvik (tilbudet gjelder).
  const tilbudInkl = (totalSum != null && totalSum > 0) ? totalSum : null;
  const tilbudEks = (totalEksMva != null && totalEksMva > 0) ? totalEksMva
    : (tilbudInkl ? Math.round(tilbudInkl / 1.25) : null);
  const kontrakt = p.belop ? Number(p.belop) : null;
  const kontraktFraTilbud = kontrakt != null && (kontrakt === tilbudInkl || kontrakt === tilbudEks);
  const kontraktAvviker = kontrakt != null && tilbudInkl != null && !kontraktFraTilbud;

  const nokkeltall = [
    tilbudInkl && ['Tilbudssum (inkl. mva)', fmtKr(tilbudInkl)],
    tilbudEks && ['Tilbudssum (eks. mva)' + (totalEksMva ? '' : ' – beregnet'), fmtKr(tilbudEks)],
    !tilbudInkl && (p.estimertSum || tp.estimertSum) && ['Estimert sum (manuelt anslag)', fmtKr(p.estimertSum || tp.estimertSum)],
    kontrakt != null && ['Kontraktssum i prosjektet' + (kontraktFraTilbud ? ' (fra tilbudet)' : ' (manuelt felt)'), fmtKr(kontrakt)],
    totalTimer && ['Totale timer', fmtTimer(totalTimer)],
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
        <div style={{ fontSize: 12, color: '#5d6b80', margin: '6px 0', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Ikon ikon={Link2} size={13} /> Koblet til tilbud {new Date(p.tilbudKobletDato).toLocaleDateString('nb-NO')}{p.tilbudKobletAv ? ` av ${p.tilbudKobletAv}` : ''}
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
          {kontraktAvviker && (
            <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '5px 9px', marginTop: 6 }}>
              Kontraktssummen ({fmtKr(kontrakt)}) avviker fra tilbudssummen ({fmtKr(tilbudInkl)} inkl. mva)
              — tilbudet gjelder. Oppdater kontraktssummen i prosjektet om den er utdatert.
            </div>
          )}
        </Seksjon>
      )}

      {fagBreakdown && typeof fagBreakdown === 'object' && Object.keys(fagBreakdown).length > 0 && (
        <Seksjon tittel="Per fag">
          {Object.entries(fagBreakdown).map(([fag, info]) => {
            const timer = typeof info === 'object' ? (info.timer ?? info.antallTimer) : info;
            const kr = typeof info === 'object' ? (info.kr ?? info.sum ?? info.belop) : null;
            return (
              <div key={fag} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--bg-subtle)' }}>
                <span>{fagNavn(fag)}</span>
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
          {poster.map((post, i) => {
            // Oppdrag 17.4: pris eks. mva per post — vises når tilbudsdataene
            // faktisk bærer den (aldri beregnet: kalkyle-komponentene mangler
            // rabatt/justering, så en utregnet sum ville avvike fra tilbudet)
            const postPris = post.postPrisEksMva ?? post.kalkyle?.totalPris ?? post.sum ?? post.sumEksMva ?? post.pris ?? post.kalkyle?.sum ?? post.kalkyle?.sumEksMva ?? null;
            return (
            <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--bg-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{post.navn || post.tittel || post.beskrivelse || `Post ${i + 1}`}</span>
                {postPris != null && (
                  <span style={{ color: '#5d6b80', whiteSpace: 'nowrap' }}>{fmtKr(postPris)} <span style={{ fontSize: 10 }}>eks. mva</span></span>
                )}
              </div>
              {Array.isArray(post.kalkyle?.timer) && post.kalkyle.timer.length > 0 && (
                <div style={{ fontSize: 12, color: '#5d6b80', paddingLeft: 8 }}>
                  {post.kalkyle.timer.map(t => `${fagNavn(t.fag || 'annet')}: ${t.antall || 0} t`).join(' · ')}
                </div>
              )}
            </div>
            );
          })}
          {/* Oppdrag 18b: rabatt/justering fra tilbudet — slik at
              Σ poster + justering = tilbudssum eks. mva */}
          {Number(tp.justeringEksMva) !== 0 && tp.justeringEksMva != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontWeight: 500, color: Number(tp.justeringEksMva) < 0 ? '#15803d' : '#b45309' }}>
              <span>{Number(tp.justeringEksMva) < 0 ? 'Rabatt/justering' : 'Justering/påslag'}</span>
              <span>{fmtKr(tp.justeringEksMva)} <span style={{ fontSize: 10, fontWeight: 400 }}>eks. mva</span></span>
            </div>
          )}
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={erValgt ? CircleCheck : Square} size={14} farge={erValgt ? 'var(--success)' : 'var(--text-muted)'} /> {navn}</span>
                {typeof o === 'object' && o.sum != null && <span style={{ color: '#5d6b80' }}>{fmtKr(o.sum)}</span>}
              </div>
            );
          })}
        </Seksjon>
      )}
      {!opsjoner && (p.valgteOpsjoner || []).length > 0 && (
        <Seksjon tittel="Valgte opsjoner">
          {p.valgteOpsjoner.map((o, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ikon ikon={CircleCheck} size={14} farge='var(--success)' /> {typeof o === 'string' ? o : o.navn || o.id || `Opsjon ${i + 1}`}</div>
          ))}
        </Seksjon>
      )}

      {(byggInfo || soner) && (
        <Seksjon tittel="Bygg og soner">
          {byggInfo && (
            /* Oppdrag 17.1: aldri rå JSON — kjente felter vises pent, tomme
               skjules, og tilstandsnotatet får egen linje */
            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
              {typeof byggInfo === 'string'
                ? byggInfo
                : (() => {
                    const rad = [byggInfo.byggeaar && `Byggeår: ${byggInfo.byggeaar}`, byggInfo.byggtype && `Byggtype: ${byggInfo.byggtype}`,
                      byggInfo.bra && `BRA: ${byggInfo.bra} m²`, byggInfo.tilstand && `Tilstand: ${byggInfo.tilstand}`]
                      .filter(Boolean).join(' · ');
                    const notat = byggInfo.tilstandNotat || byggInfo.notat || '';
                    if (!rad && !notat) return <span style={{ color: 'var(--text-muted)' }}>Ingen bygginfo registrert.</span>;
                    return <>{rad}{rad && notat ? '\n' : ''}{notat}</>;
                  })()}
            </div>
          )}
          {soner && soner.length > 0 && soner.map((s, i) => (
            <div key={i} style={{ paddingLeft: 8, color: 'var(--text-secondary)' }}>
              <Ikon ikon={MapPin} size={13} /> {s.navn || s.name || `Sone ${i + 1}`}{s.areal ? ` — ${s.areal} m²` : ''}
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
