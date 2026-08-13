import { useApp } from '../context/AppContext';
import { dateToIso, addDays, weekStart, overlaps } from '../store';

const FAG_COLORS = {
  'Bas Tømrer': '#b45309', 'Montør': '#3b82f6', 'Lærling Tømrer': '#15803d',
  'Maler': '#ec4899', 'Rørlegger': '#0e7490', 'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316', 'Prosjektleder': '#0ea5e9',
};
function fagColor(fag) { return FAG_COLORS[fag] || '#6b7280'; }

// Felles status-definisjoner — Dashboard hadde tidligere egne kopier som
// manglet 'lead' og 'planlagt' og dermed viste feil farge/ikon.
import { BEF_STATUS, REKL_STATUS } from '../statuses';

const UKEDAGER = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MAANEDER = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];

function datoLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()}. ${MAANEDER[d.getMonth()]} ${d.getFullYear()}`;
}
function datoKort(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' });
}
function dagerTil(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso + 'T00:00:00') - new Date()) / 86400000);
}

export default function Dashboard({ onNavigate }) {
  const { state, dispatch } = useApp();
  const today = dateToIso(new Date());
  const todayDate = new Date(today + 'T00:00:00');
  const ukeStartI = weekStart(today);
  const ukeSluttI = addDays(ukeStartI, 6);

  // Ansatte som er med i bemanningsplan-kapasitetsberegningen
  const planAnsatte = state.ansatte.filter(a => !a.utenforBemanningsplan);

  // ── Dagens bemanning ───────────────────────────────────────
  const FERIE_ID = '__FERIE__';
  const dagensProsjektIds = new Set(
    state.tildelinger
      .filter(t => t.prosjektId !== FERIE_ID && overlaps(t.startDato, t.sluttDato, today, today))
      .map(t => t.prosjektId)
  );

  // Grupper ansatte per prosjekt i dag
  const prosjektGrupper = [];
  dagensProsjektIds.forEach(pId => {
    const prosjekt = state.prosjekter.find(p => p.id === pId);
    if (!prosjekt) return;
    const ansatte = state.tildelinger
      .filter(t => t.prosjektId === pId && overlaps(t.startDato, t.sluttDato, today, today))
      .map(t => state.ansatte.find(a => a.id === t.ansattId))
      .filter(Boolean);
    prosjektGrupper.push({ prosjekt, ansatte });
  });
  prosjektGrupper.sort((a, b) => b.ansatte.length - a.ansatte.length);

  // Fri / ferie i dag
  const ferieIdag = state.tildelinger
    .filter(t => t.prosjektId === FERIE_ID && overlaps(t.startDato, t.sluttDato, today, today))
    .map(t => state.ansatte.find(a => a.id === t.ansattId))
    .filter(Boolean);

  // Ledige i dag (ingen tildeling, ingen ferie)
  const opptattIds = new Set(
    state.tildelinger
      .filter(t => overlaps(t.startDato, t.sluttDato, today, today))
      .map(t => t.ansattId)
  );
  const ledigeIdag = planAnsatte.filter(a => !opptattIds.has(a.id));

  // ── Nøkkeltall ─────────────────────────────────────────────
  const aktiveProsj = state.prosjekter.filter(p => p.status === 'aktiv' || !p.status).length;
  const aktiveRekl  = (state.reklamasjoner || []).filter(r => r.status === 'ny' || r.status === 'under_arbeid').length;
  const planlagteBef = (state.befaringer || []).filter(b => b.status === 'planlagt').length;
  const tilbudArbeid = (state.befaringer || []).filter(b => b.status === 'tilbud_arbeid').length;

  // ── Befaringer denne uka ──────────────────────────────────
  const ukasBef = (state.befaringer || [])
    .filter(b => b.dato >= ukeStartI && b.dato <= ukeSluttI && b.status !== 'tapt' && b.status !== 'godkjent')
    .sort((a, b) => a.dato.localeCompare(b.dato));

  // ── Reklamasjoner å følge opp ─────────────────────────────
  const reklamasjonerFrist = (state.reklamasjoner || [])
    .filter(r => r.status !== 'lukket' && r.status !== 'avvist' && r.status !== 'utbedret')
    .map(r => ({ ...r, dager: dagerTil(r.frist) }))
    .filter(r => r.frist)
    .sort((a, b) => a.frist.localeCompare(b.frist))
    .slice(0, 6);

  // Reklamasjoner uten frist
  const reklamasjonerUtenFrist = (state.reklamasjoner || [])
    .filter(r => r.status !== 'lukket' && r.status !== 'avvist' && r.status !== 'utbedret' && !r.frist)
    .length;

  // ── Tilbud med frist ──────────────────────────────────────
  const tilbudFrister = (state.befaringer || [])
    .filter(b => b.status === 'tilbud_arbeid' && b.tilbudFrist)
    .map(b => ({ ...b, dager: dagerTil(b.tilbudFrist) }))
    .sort((a, b) => a.tilbudFrist.localeCompare(b.tilbudFrist))
    .slice(0, 5);

  // ── Oppfølging (neste kontakt) på leads/befaringer/tilbud ──
  // Datoen skrives inn på befaringskortet, men var tidligere ikke synlig
  // noe sted som påminnelse — leads ble glemt. Viser forfalte + de neste 3 dager.
  const AKTIV_PIPELINE = new Set(['lead', 'planlagt', 'tilbud_arbeid', 'tilbud_sendt']);
  const oppfolginger = (state.befaringer || [])
    .filter(b => AKTIV_PIPELINE.has(b.status) && b.nesteKontakt)
    .map(b => ({ ...b, dager: dagerTil(b.nesteKontakt) }))
    .filter(b => b.dager <= 3)
    .sort((a, b) => a.nesteKontakt.localeCompare(b.nesteKontakt))
    .slice(0, 8);

  const ukedagNavn = UKEDAGER[todayDate.getDay()];

  // ── Kunde-aktivitet siste 24 timer ────────────────────────
  const for24t = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const kundeAktivitet24t = (state.befaringer || [])
    .filter(b => b.sistKundeAktivitet && b.sistKundeAktivitet >= for24t)
    .sort((a, b) => b.sistKundeAktivitet.localeCompare(a.sistKundeAktivitet));

  function aktivitetTekst(b) {
    const akt = b.kundeAktivitet || [];
    if (akt.some(a => a.handling === 'klikket-aksepter')) return '✅ Klikket Aksepter'
    if (akt.some(a => a.handling === 'klikket-sporsmal')) return '💬 Klikket Spørsmål'
    if (b.kundeHarSettTilbud) return `👁 Åpnet tilbudet ${b.antallKundeAapninger || 1}x`
    return '👁 Sett tilbudet'
  }
  function tidRelativt(iso) {
    if (!iso) return ''
    const d = new Date(iso);
    const today2 = new Date().toDateString();
    if (d.toDateString() === today2) return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) + ' i dag'
    return d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="dash-side">
      {/* ── Topplinje ── */}
      <div className="dash-header">
        <div>
          <h2 className="dash-tittel">God dag! 👋</h2>
          <p className="dash-dato">{ukedagNavn.charAt(0).toUpperCase() + ukedagNavn.slice(1)}, {datoLabel(today)}</p>
        </div>
      </div>

      {/* ── Nøkkeltall ── */}
      <div className="dash-stats">
        <div className="dash-stat-kort">
          <div className="dash-stat-tall">{planAnsatte.length}</div>
          <div className="dash-stat-label">Ansatte totalt</div>
          <div className="dash-stat-sub">{opptattIds.size} på jobb i dag</div>
        </div>
        <div className="dash-stat-kort">
          <div className="dash-stat-tall">{aktiveProsj}</div>
          <div className="dash-stat-label">Aktive prosjekter</div>
          <div className="dash-stat-sub">{prosjektGrupper.length} aktive i dag</div>
        </div>
        <div className="dash-stat-kort dash-stat-kort--bef">
          <div className="dash-stat-tall">{planlagteBef}</div>
          <div className="dash-stat-label">Planlagte befaringer</div>
          <div className="dash-stat-sub">{tilbudArbeid} tilbud under arbeid</div>
        </div>
        <div className="dash-stat-kort dash-stat-kort--rekl" style={{ borderLeftColor: aktiveRekl > 0 ? '#b45309' : undefined }}>
          <div className="dash-stat-tall" style={{ color: aktiveRekl > 0 ? '#b45309' : undefined }}>{aktiveRekl}</div>
          <div className="dash-stat-label">Aktive reklamasjoner</div>
          <div className="dash-stat-sub">{reklamasjonerUtenFrist > 0 ? `${reklamasjonerUtenFrist} uten frist` : 'Alle har frist'}</div>
        </div>
      </div>

      {/* ── Kunde-aktivitet siste 24t ── */}
      <div className="dash-seksjon" style={{ marginBottom: 16 }}>
        <div className="dash-seksjon-header">
          <span>🎯 Kunde-aktivitet siste 24 timer</span>
          {kundeAktivitet24t.length > 0 && <span className="dash-seksjon-teller">{kundeAktivitet24t.length}</span>}
        </div>
        {kundeAktivitet24t.length === 0 ? (
          <div className="dash-tom">Ingen kunde-aktivitet siste 24 timer.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {kundeAktivitet24t.map(b => {
              const fristDgr = dagerTil(b.tilbudFrist);
              return (
                <div
                  key={b.id}
                  onClick={() => onNavigate && onNavigate('befaring')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f8faff', border: '1px solid #e0e8f8', borderRadius: 7, cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eef3fb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8faff'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.kontaktNavn} — {b.adresse}
                    </div>
                    <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>
                      {aktivitetTekst(b)}
                      {fristDgr !== null && fristDgr <= 3 && (
                        <span style={{ marginLeft: 8, color: fristDgr < 0 ? '#dc2626' : '#b45309', fontWeight: 500 }}>
                          ⏰ Frist: {datoKort(b.tilbudFrist)}{fristDgr === 0 ? ' (i dag!)' : fristDgr < 0 ? ` (${Math.abs(fristDgr)}d over)` : ` (${fristDgr}d)`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#5d6b80', flexShrink: 0 }}>{tidRelativt(b.sistKundeAktivitet)}</div>
                  {b.tilbudLink && (
                    <a
                      href={b.tilbudLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      title="Åpne kundens tilbudside"
                      style={{ color: '#2874a6', fontSize: 15, flexShrink: 0, textDecoration: 'none' }}
                    >🔗</a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="dash-grid">
        {/* ── Venstre kolonne ── */}
        <div className="dash-kolonne">

          {/* Dagens bemanning */}
          <div className="dash-seksjon">
            <div className="dash-seksjon-header">
              <span>📍 Dagens bemanning</span>
              <span className="dash-seksjon-teller">{opptattIds.size - ferieIdag.length} på prosjekt</span>
            </div>

            {prosjektGrupper.length === 0 && (
              <div className="dash-tom">Ingen tildelinger i dag.</div>
            )}
            {prosjektGrupper.map(({ prosjekt, ansatte }) => (
              <div key={prosjekt.id} className="dash-prosjekt-rad">
                <div className="dash-prosjekt-topp">
                  <span className="dash-proj-farge" style={{ background: prosjekt.farge || '#6b8fc4' }} />
                  <span className="dash-proj-navn">{prosjekt.navn}</span>
                  <span className="dash-proj-antall">{ansatte.length} person{ansatte.length !== 1 ? 'er' : ''}</span>
                </div>
                <div className="dash-avatar-rad">
                  {ansatte.map(a => (
                    <div key={a.id} className="dash-avatar-wrap" title={`${a.navn} (${a.fag})`}>
                      <div className="mini-avatar" style={{ background: a.innleie ? '#f97316' : fagColor(a.fag), width: 30, height: 30, fontSize: 10 }}>
                        {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="dash-avatar-navn">{a.navn.split(' ')[0]}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Ferie/fri */}
            {ferieIdag.length > 0 && (
              <div className="dash-prosjekt-rad dash-ferie-rad">
                <div className="dash-prosjekt-topp">
                  <span>🏖</span>
                  <span className="dash-proj-navn" style={{ color: '#b45309' }}>Ferie / Fri</span>
                  <span className="dash-proj-antall">{ferieIdag.length} person{ferieIdag.length !== 1 ? 'er' : ''}</span>
                </div>
                <div className="dash-avatar-rad">
                  {ferieIdag.map(a => (
                    <div key={a.id} className="dash-avatar-wrap" title={a.navn}>
                      <div className="mini-avatar" style={{ background: '#b45309', width: 30, height: 30, fontSize: 10 }}>
                        {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="dash-avatar-navn">{a.navn.split(' ')[0]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ledige */}
            {ledigeIdag.length > 0 && (
              <div className="dash-prosjekt-rad dash-ledige-rad">
                <div className="dash-prosjekt-topp">
                  <span>✅</span>
                  <span className="dash-proj-navn" style={{ color: '#15803d' }}>Ledig / ikke tildelt</span>
                  <span className="dash-proj-antall">{ledigeIdag.length} person{ledigeIdag.length !== 1 ? 'er' : ''}</span>
                </div>
                <div className="dash-avatar-rad">
                  {ledigeIdag.slice(0, 12).map(a => (
                    <div key={a.id} className="dash-avatar-wrap" title={`${a.navn} (${a.fag})`}>
                      <div className="mini-avatar" style={{ background: '#5d6b80', width: 30, height: 30, fontSize: 10 }}>
                        {a.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="dash-avatar-navn">{a.navn.split(' ')[0]}</div>
                    </div>
                  ))}
                  {ledigeIdag.length > 12 && (
                    <div className="dash-avatar-wrap">
                      <div className="mini-avatar" style={{ background: '#cbd5e1', width: 30, height: 30, fontSize: 10, color: '#475569' }}>
                        +{ledigeIdag.length - 12}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Befaringer denne uka */}
          <div className="dash-seksjon">
            <div className="dash-seksjon-header">
              <span>🔍 Befaringer denne uka</span>
              <span className="dash-seksjon-teller">{ukasBef.length}</span>
            </div>
            {ukasBef.length === 0 && <div className="dash-tom">Ingen befaringer denne uka.</div>}
            {ukasBef.map(b => {
              const s = BEF_STATUS[b.status] || BEF_STATUS.planlagt;
              const erIdag = b.dato === today;
              return (
                <div key={b.id} className={`dash-bef-rad${erIdag ? ' dash-bef-idag' : ''}`}>
                  <div className="dash-bef-dato" style={{ color: erIdag ? '#2563eb' : '#5d6b80' }}>
                    {erIdag ? '📌 I dag' : datoKort(b.dato)}
                    {b.tid && <span style={{ marginLeft: 4, fontSize: 11 }}>kl. {b.tid}</span>}
                  </div>
                  <div className="dash-bef-info">
                    <div className="dash-bef-navn">{b.kontaktNavn}</div>
                    <div className="dash-bef-adresse">{b.adresse}</div>
                  </div>
                  <span className="dash-bef-pill" style={{ background: s.ikon === '📋' ? '#eff6ff' : '#fffbeb', color: s.farge }}>
                    {s.ikon}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Høyre kolonne ── */}
        <div className="dash-kolonne">

          {/* Oppfølging: neste kontakt på leads/tilbud */}
          {oppfolginger.length > 0 && (
            <div className="dash-seksjon">
              <div className="dash-seksjon-header">
                <span>📞 Oppfølging — neste kontakt</span>
                <span className="dash-seksjon-teller" style={{ color: oppfolginger.some(b => b.dager <= 0) ? '#dc2626' : undefined }}>
                  {oppfolginger.length}
                </span>
              </div>
              {oppfolginger.map(b => {
                const s = BEF_STATUS[b.status] || BEF_STATUS.planlagt;
                const farge = b.dager < 0 ? '#dc2626' : b.dager === 0 ? '#b45309' : '#15803d';
                return (
                  <div
                    key={b.id}
                    className="dash-frist-rad"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNavigate && onNavigate('befaring')}
                    title="Gå til Befaring"
                  >
                    <div className="dash-frist-info">
                      <div className="dash-frist-navn">{s.ikon} {b.kontaktNavn || b.adresse}</div>
                      <div className="dash-frist-adresse">{b.adresse}{b.telefon ? ` · 📱 ${b.telefon}` : ''}</div>
                      <div style={{ fontSize: 11, color: s.farge, marginTop: 2 }}>{s.label}</div>
                    </div>
                    <div className="dash-frist-badge" style={{ background: farge + '1a', color: farge }}>
                      {b.dager < 0 ? `${Math.abs(b.dager)}d forfalt`
                        : b.dager === 0 ? 'I dag!'
                        : `om ${b.dager}d`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tilbudsfrister */}
          {tilbudFrister.length > 0 && (
            <div className="dash-seksjon">
              <div className="dash-seksjon-header">
                <span>✏️ Tilbudsfrister</span>
                <span className="dash-seksjon-teller">{tilbudFrister.length}</span>
              </div>
              {tilbudFrister.map(b => {
                const farge = b.dager < 0 ? '#dc2626' : b.dager <= 3 ? '#b45309' : '#15803d';
                return (
                  <div key={b.id} className="dash-frist-rad">
                    <div className="dash-frist-info">
                      <div className="dash-frist-navn">{b.kontaktNavn || b.adresse}</div>
                      <div className="dash-frist-adresse">{b.adresse}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: '2px 8px', background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}
                          onClick={() => dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, status: 'godkjent' } })}
                        >
                          ✅ Godkjent
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: '2px 8px', background: '#f9fafb', color: '#6b7280', borderColor: '#e2e8f0' }}
                          onClick={() => dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, status: 'tapt' } })}
                        >
                          ❌ Tapt
                        </button>
                      </div>
                    </div>
                    <div className="dash-frist-badge" style={{ background: farge + '1a', color: farge }}>
                      {b.dager < 0
                        ? `${Math.abs(b.dager)}d over`
                        : b.dager === 0 ? 'I dag!'
                        : `${b.dager}d`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reklamasjoner å følge opp */}
          <div className="dash-seksjon">
            <div className="dash-seksjon-header">
              <span>⚠️ Reklamasjoner å følge opp</span>
              <span className="dash-seksjon-teller" style={{ color: aktiveRekl > 0 ? '#b45309' : undefined }}>{aktiveRekl}</span>
            </div>
            {aktiveRekl === 0 && <div className="dash-tom">Ingen aktive reklamasjoner. 🎉</div>}
            {reklamasjonerFrist.map(r => {
              const s = REKL_STATUS[r.status] || REKL_STATUS.ny;
              const farge = r.dager < 0 ? '#dc2626' : r.dager <= 5 ? '#b45309' : '#15803d';
              const prosjekt = r.prosjektId ? state.prosjekter.find(p => p.id === r.prosjektId) : null;
              return (
                <div key={r.id} className="dash-frist-rad">
                  <div style={{ fontSize: 18 }}>{s.ikon}</div>
                  <div className="dash-frist-info">
                    <div className="dash-frist-navn">{prosjekt ? prosjekt.navn : r.adresse}</div>
                    <div className="dash-frist-adresse">{r.type} · {r.kontaktNavn}</div>
                  </div>
                  <div className="dash-frist-badge" style={{ background: farge + '1a', color: farge }}>
                    {r.dager < 0
                      ? `${Math.abs(r.dager)}d over`
                      : r.dager === 0 ? 'I dag!'
                      : `${r.dager}d`}
                  </div>
                </div>
              );
            })}
            {reklamasjonerUtenFrist > 0 && (
              <div className="dash-tom" style={{ marginTop: 8 }}>
                + {reklamasjonerUtenFrist} reklamasjon{reklamasjonerUtenFrist !== 1 ? 'er' : ''} uten frist
              </div>
            )}
          </div>

          {/* Statistikk tilbud */}
          {(() => {
            const befaringer = state.befaringer || [];
            const totalt = befaringer.filter(b => b.status !== 'planlagt').length;
            const vunnet = befaringer.filter(b => b.status === 'godkjent').length;
            const tapt = befaringer.filter(b => b.status === 'tapt').length;
            const aktive = befaringer.filter(b => b.status === 'tilbud_arbeid' || b.status === 'tilbud_sendt').length;
            const vinnRate = totalt > 0 ? Math.round((vunnet / (vunnet + tapt)) * 100) : null;
            const sumVunnet = befaringer
              .filter(b => b.status === 'godkjent' && b.estimertBelop)
              .reduce((s, b) => s + Number(b.estimertBelop), 0);
            const sumTapt = befaringer
              .filter(b => b.status === 'tapt' && b.estimertBelop)
              .reduce((s, b) => s + Number(b.estimertBelop), 0);
            const fmtKr = n => n > 0 ? new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n) : null;
            return (
              <div className="dash-seksjon">
                <div className="dash-seksjon-header">
                  <span>📊 Tilbudsstatistikk</span>
                  {vinnRate !== null && (
                    <span className="dash-seksjon-teller" style={{ color: vinnRate >= 50 ? '#15803d' : '#b45309' }}>
                      {vinnRate}% vinnrate
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 80, background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 500, color: '#15803d' }}>{vunnet}</div>
                    <div style={{ fontSize: 11, color: '#5d6b80' }}>Vunnet</div>
                    {fmtKr(sumVunnet) && <div style={{ fontSize: 10, color: '#15803d', marginTop: 2 }}>{fmtKr(sumVunnet)}</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 80, background: '#fff7ed', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 500, color: '#b45309' }}>{aktive}</div>
                    <div style={{ fontSize: 11, color: '#5d6b80' }}>Under arbeid</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 80, background: '#f9fafb', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 500, color: '#6b7280' }}>{tapt}</div>
                    <div style={{ fontSize: 11, color: '#5d6b80' }}>Tapt</div>
                    {fmtKr(sumTapt) && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{fmtKr(sumTapt)}</div>}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Rask navigasjon */}
          <div className="dash-seksjon">
            <div className="dash-seksjon-header"><span>🚀 Hurtiglenker</span></div>
            <div className="dash-hurtig-grid">
              {[
                { tab: 'befaring',       ikon: '🔍', label: 'Ny befaring',       sub: 'Planlegg befaring' },
                { tab: 'reklamasjon',    ikon: '⚠️',  label: 'Reklamasjon',       sub: 'Registrer klage' },
                { tab: 'bemanningsplan', ikon: '📅',  label: 'Bemanningsplan',    sub: 'Tildel ansatte' },
                { tab: 'prosjekter',     ikon: '🏗',  label: 'Prosjekter',        sub: 'Se alle prosjekter' },
              ].map(({ tab, ikon, label, sub }) => (
                <button key={tab} className="dash-hurtig-knapp" onClick={() => onNavigate(tab)}>
                  <span className="dash-hurtig-ikon">{ikon}</span>
                  <div>
                    <div className="dash-hurtig-label">{label}</div>
                    <div className="dash-hurtig-sub">{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
