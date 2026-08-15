import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, PROSJEKT_PALETTE, isoToDate, dateToIso, daysBetween } from '../store';
import { StatusFaner, KompaktRad, DetaljPanel, VarselBanner } from '../komponenter/Designsystem';
import {
  beregnMerge, beregnAngre, beregnPekerOppdatering, beregnAngrePekere,
  beregnKobling, beregnFjernKobling, tilbudsfelterFraBefaring,
  harTilbud, kandidatScore, finnKandidater, TILBUDSFELTER, erTom, likVerdi,
} from '../mergeProsjekter';
import TilbudsdataVisning from '../komponenter/Tilbudsdata';
import { beregnAktivering, beregnForkast, kalkyleSammendrag, harKalkyle } from '../framdriftUtkast';
import KSFagForslag from '../komponenter/KSFagForslag';
import { erForslagSkjult } from '../ksForslag';
import { beregnKalkyleVsBemanning, erUnderbemannetMotKalkyle } from '../kalkyleBemanning';

function formaterBelop(belop) {
  if (!belop && belop !== 0) return null;
  const n = Number(belop);
  if (isNaN(n)) return null;
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n);
}

function varighetUker(startDato, sluttDato) {
  if (!startDato || !sluttDato) return null;
  const dager = daysBetween(startDato, sluttDato);
  if (dager < 0) return null;
  const uker = Math.ceil(dager / 7);
  return uker === 1 ? '1 uke' : `${uker} uker`;
}

const MND = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'];

function addDaysLocal(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateToIso(d);
}

function mondayOf(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return dateToIso(d);
}

// Bygg timeline-konfigurasjon for valgt modus
function buildTimeline(mode) {
  const todayIso = dateToIso(new Date());

  if (mode === 'maaned') {
    const now = new Date();
    const startD = new Date(now.getFullYear(), 0, 1);
    const tlStart = dateToIso(startD);
    const endD = new Date(startD.getFullYear() + 2, startD.getMonth(), startD.getDate());
    const tlDays = Math.round((endD - startD) / 86400000);
    const ticks = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(startD.getFullYear(), startD.getMonth() + i, 1);
      const pct = (Math.round((d - startD) / 86400000) / tlDays) * 100;
      ticks.push({ pct, label: d.getMonth() === 0 ? String(d.getFullYear()) : (i % 3 === 0 ? MND[d.getMonth()] : null) });
    }
    return { tlStart, tlDays, ticks, label: 'Tidslinje (2 år)' };
  }

  if (mode === 'uke') {
    const tlStart = mondayOf(todayIso);
    const tlDays = 26 * 7;
    const ticks = [];
    for (let w = 0; w < 26; w++) {
      const d = new Date(addDaysLocal(tlStart, w * 7) + 'T00:00:00');
      const pct = (w * 7 / tlDays) * 100;
      const mndStart = d.getDate() <= 7; // første uke i måneden
      ticks.push({ pct, label: mndStart ? MND[d.getMonth()] : (w % 4 === 0 ? `U${getWeekNr(d)}` : null) });
    }
    return { tlStart, tlDays, ticks, label: 'Tidslinje (26 uker)' };
  }

  // dag: 13 uker
  const tlStart = mondayOf(todayIso);
  const tlDays = 13 * 7;
  const ticks = [];
  for (let w = 0; w < 13; w++) {
    const d = new Date(addDaysLocal(tlStart, w * 7) + 'T00:00:00');
    const pct = (w * 7 / tlDays) * 100;
    ticks.push({ pct, label: `${d.getDate()}/${d.getMonth() + 1}` });
  }
  return { tlStart, tlDays, ticks, label: 'Tidslinje (13 uker)' };
}

function getWeekNr(d) {
  const tmp = new Date(d); tmp.setHours(0,0,0,0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay()+6)%7));
  const w = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp - w)/86400000 - 3 + ((w.getDay()+6)%7))/7);
}

function MiniGantt({ prosjekt, color, tlStart, tlDays, ticks }) {
  function pct(iso) {
    if (!iso) return null;
    const diff = Math.round((new Date(iso + 'T00:00:00') - new Date(tlStart + 'T00:00:00')) / 86400000);
    return Math.max(0, Math.min(100, (diff / tlDays) * 100));
  }
  const s = pct(prosjekt.startDato);
  const e = pct(prosjekt.sluttDato);
  const todayPct = pct(dateToIso(new Date()));

  return (
    <div className="proj-gantt-wrap">
      {ticks.map((t, i) => (
        <div key={i} className="proj-gantt-tick" style={{ left: `${t.pct}%` }}>
          {t.label && <span className="proj-gantt-tick-label">{t.label}</span>}
        </div>
      ))}
      {todayPct !== null && (
        <div className="proj-gantt-today" style={{ left: `${todayPct}%` }} title="I dag" />
      )}
      {s !== null && e !== null ? (
        <div className="proj-gantt-bar"
          style={{ left: `${s}%`, width: `${Math.max(0.5, e - s)}%`, background: color }}
          title={`${formatDate(prosjekt.startDato)} – ${formatDate(prosjekt.sluttDato)}`}
        />
      ) : s !== null ? (
        <div className="proj-gantt-bar proj-gantt-bar-open"
          style={{ left: `${s}%`, width: `${100 - s}%`, background: color, opacity: 0.5 }}
          title={`Start: ${formatDate(prosjekt.startDato)}`}
        />
      ) : null}
    </div>
  );
}

// ─── Framdriftsplan Gantt ─────────────────────────────────────────────────────

const FAG_GANTT = {
  tomrer: '#185FA5', flis: '#BA7517', elektriker: '#E24B4A',
  rorlegger: '#0F6E56', ventilasjon: '#7F77DD',
  maling: '#D4537E', ferdig: '#3B6D11', annet: '#888780',
}
function fagFarge(fag) {
  const k = Array.isArray(fag) ? fag[0] : fag
  return FAG_GANTT[k] || '#888780'
}

// Konverterer gammelt fdTasks-format (fra tilbuds-appen) til nytt framdriftsplan-format
function fdTasksTilFramdrift(project) {
  const { fdTasks = [], fdStartWeek, fdStartYear, fdTotalWeeks, fdMilepaler = [], fdGenDato, fdGenAv } = project
  const oppstartUke = fdStartWeek || 31
  return {
    generertDato: fdGenDato || new Date().toISOString(),
    generertAv: fdGenAv || 'AI',
    versjon: 1,
    oppstartUke,
    oppstartAar: fdStartYear || 2026,
    totalVarighetUker: fdTotalWeeks || 12,
    bufferProsent: 15,
    faser: fdTasks.map(t => ({
      id: t.id,
      navn: t.name,
      fag: [t.fag || 'annet'],
      startUke: oppstartUke + Math.floor((t.start || 0) / 5),
      varighetDager: t.dur || 5,
      timer: 0,
      mannskap: 2,
      kritisk: false,
      venterPaa: [],
      beskrivelse: '',
      status: (t.pct || 0) >= 100 ? 'ferdig' : (t.pct || 0) > 0 ? 'pagar' : 'planlagt',
    })),
    milepaler: (fdMilepaler || []).map((m, i) => ({
      id: `mil-${i + 1}`,
      navn: m.navn || 'Milepæl',
      uke: oppstartUke + Math.floor((m.dagFraStart || 0) / 5),
      kritisk: false,
      type: 'teknisk',
      beskrivelse: '',
    })),
    kritiskSti: [],
    advarsler: [],
    _fraFdTasks: true,  // markør: konvertert fra gammelt format
  }
}

// ── SPEC-trinn4b: utkast-visning — tydelig merket, PL redigerer/aktiverer/forkaster ──
function FramdriftUtkast({ project, utkast, onAktiver, onForkast, onOppdaterUtkast }) {
  const faser = utkast.faser || []

  function endreFase(i, endring) {
    const nyeFaser = faser.map((f, j) => j === i ? { ...f, ...endring } : f)
    onOppdaterUtkast({ ...utkast, faser: nyeFaser })
  }
  function slettFase(i) {
    onOppdaterUtkast({ ...utkast, faser: faser.filter((_, j) => j !== i) })
  }
  function flyttFase(i, retning) {
    const j = i + retning
    if (j < 0 || j >= faser.length) return
    const nye = [...faser]
    ;[nye[i], nye[j]] = [nye[j], nye[i]]
    onOppdaterUtkast({ ...utkast, faser: nye })
  }
  function leggTilFase() {
    const sisteUke = faser.reduce((mx, f) => Math.max(mx, (f.startUke || utkast.oppstartUke) + Math.ceil((f.varighetDager || 5) / 5)), utkast.oppstartUke || 1)
    onOppdaterUtkast({
      ...utkast,
      faser: [...faser, { id: `fase-${Date.now()}`, navn: 'Ny fase', fag: ['annet'], startUke: sisteUke, varighetDager: 5, timer: 0, estimertTimer: 0, avhengerAv: [], posterRef: [], status: 'planlagt' }],
    })
  }

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontWeight: 500, color: 'var(--warning)' }}>
        ✨ Utkast — ikke aktivert. Rediger fasene, og aktiver når planen ser riktig ut.
      </div>
      <div style={{ color: '#5d6b80', marginBottom: 8 }}>
        Generert fra tilbudskalkylen {utkast.generertDato ? new Date(utkast.generertDato).toLocaleDateString('nb-NO') : ''} · {faser.length} faser · uke {utkast.oppstartUke}–{utkast.estimertSluttUke}
      </div>

      {faser.map((f, i) => (
        <div key={f.id || i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--bg-subtle)', flexWrap: 'wrap' }}>
          <span style={{ color: '#5d6b80', width: 18, textAlign: 'right' }}>{i + 1}.</span>
          <input className="input" style={{ flex: '1 1 140px', height: 30, fontSize: 13 }} value={f.navn}
            onChange={e => endreFase(i, { navn: e.target.value })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#5d6b80', fontSize: 12 }}>
            uke <input className="input" type="number" style={{ width: 58, height: 30, fontSize: 13 }} value={f.startUke || ''}
              onChange={e => endreFase(i, { startUke: parseInt(e.target.value) || utkast.oppstartUke })} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#5d6b80', fontSize: 12 }}>
            dager <input className="input" type="number" style={{ width: 54, height: 30, fontSize: 13 }} value={f.varighetDager || ''}
              onChange={e => endreFase(i, { varighetDager: Math.max(1, parseInt(e.target.value) || 1) })} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#5d6b80', fontSize: 12 }}>
            timer <input className="input" type="number" style={{ width: 60, height: 30, fontSize: 13 }} value={f.estimertTimer ?? f.timer ?? ''}
              onChange={e => endreFase(i, { estimertTimer: parseInt(e.target.value) || 0, timer: parseInt(e.target.value) || 0 })} />
          </label>
          <span style={{ fontSize: 11, color: '#5d6b80' }}>{(f.fag || []).join(', ')}{f.kritisk ? ' · ⚠ kritisk' : ''}</span>
          {Array.isArray(f.avhengerAv) && f.avhengerAv.length > 0 && (
            <span style={{ fontSize: 11, color: '#5d6b80' }} title="Avhenger av fase(r)">⛓ etter {f.avhengerAv.map(n => n + 1).join(', ')}</span>
          )}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            <button className="btn-icon" title="Flytt opp" onClick={() => flyttFase(i, -1)} disabled={i === 0}>↑</button>
            <button className="btn-icon" title="Flytt ned" onClick={() => flyttFase(i, 1)} disabled={i === faser.length - 1}>↓</button>
            <button className="btn-icon btn-danger-icon" title="Slett fase" onClick={() => slettFase(i)}>✕</button>
          </span>
        </div>
      ))}
      <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={leggTilFase}>+ Legg til fase</button>

      {Array.isArray(utkast.merknader) && utkast.merknader.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Merknader fra AI:</div>
          {utkast.merknader.map((m, i) => <div key={i} style={{ color: 'var(--text-secondary)' }}>💡 {m}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button className="btn btn-primary" onClick={onAktiver} disabled={faser.length === 0}>✓ Aktiver plan</button>
        <button className="btn" style={{ color: 'var(--danger)' }} onClick={onForkast}>🗑 Forkast utkast</button>
        {(project.framdriftsplan || (project.fdTasks || []).length > 0) && (
          <span style={{ fontSize: 12, color: '#5d6b80', alignSelf: 'center' }}>Aktivering arkiverer dagens plan (kan gjenopprettes)</span>
        )}
      </div>
    </div>
  )
}

function ProsjektFramdrift({ project, laster, feil, onGenerer, onAktiver, onForkast, onOppdaterUtkast }) {
  const [valgtFase, setValgtFase] = useState(null)
  const [visHistorikk, setVisHistorikk] = useState(false)

  // Bruker nytt framdriftsplan-objekt hvis det finnes, ellers konverterer gammelt fdTasks
  const harNyttFormat = Boolean(project.framdriftsplan)
  const harGammeltFormat = Array.isArray(project.fdTasks) && project.fdTasks.length > 0
  const fd = project.framdriftsplan || (harGammeltFormat ? fdTasksTilFramdrift(project) : null)
  const kalkyle = harKalkyle(project) ? kalkyleSammendrag(project) : null

  if (laster) {
    return (
      <div className="fd-tom">
        <div style={{ fontSize: 22 }}>⏳</div>
        <div style={{ fontWeight: 500 }}>Genererer framdriftsplan-utkast med AI…</div>
        <div style={{ fontSize: 12, color: '#5d6b80' }}>Tar 10–20 sekunder</div>
      </div>
    )
  }

  // SPEC-trinn4b: utkast har forrang i visningen til det aktiveres/forkastes
  if (project.framdriftsplanUtkast) {
    return (
      <>
        <FramdriftUtkast project={project} utkast={project.framdriftsplanUtkast}
          onAktiver={onAktiver} onForkast={onForkast} onOppdaterUtkast={onOppdaterUtkast} />
        {feil && <div className="fd-feil" style={{ marginTop: 10 }}>❌ {feil}</div>}
      </>
    )
  }

  if (!fd) {
    return (
      <div className="fd-tom">
        <div>🗓 Ingen framdriftsplan ennå</div>
        {kalkyle ? (
          <>
            <div style={{ fontSize: 12, color: '#5d6b80' }}>
              Dette prosjektet har full kalkyle fra tilbudet ({kalkyle.tekst})
            </div>
            <button className="btn btn-primary" onClick={onGenerer}>✨ Generer utkast fra kalkylen</button>
          </>
        ) : project.kildeTilbudData ? (
          <button className="btn btn-primary" onClick={onGenerer}>✨ Generer utkast med AI</button>
        ) : (
          <div style={{ fontSize: 12, color: '#5d6b80' }}>
            Ingen tilbudsdata på prosjektet — bruk «🔗 Koble til tilbud» i 📦 Tilbudsdata-fanen først.
          </div>
        )}
        {feil && <div className="fd-feil" style={{ marginTop: 10 }}>❌ {feil}</div>}
      </div>
    )
  }

  const {
    faser = [], milepaler = [],
    oppstartUke = 31, totalVarighetUker = 12,
    generertDato, versjon, advarsler = [],
  } = fd

  const visUker = Math.max(
    totalVarighetUker + 2, 8,
    faser.reduce((mx, f) => {
      const slutt = (f.startUke - oppstartUke) + Math.ceil(f.varighetDager / 5) + 1
      return slutt > mx ? slutt : mx
    }, 8)
  )
  const ukeArr = Array.from({ length: visUker }, (_, i) => oppstartUke + i)
  const iDagUke = getWeekNr(new Date())

  function fasePosisjon(fase) {
    const startOffset = fase.startUke - oppstartUke
    const breddeUker = Math.max(1, Math.ceil(fase.varighetDager / 5))
    const left = Math.max(0, (startOffset / visUker) * 100)
    const width = Math.min((breddeUker / visUker) * 100, 100 - left)
    return { left: `${left}%`, width: `${Math.max(width, 1.5)}%` }
  }

  return (
    <div className="fd-seksjon">
      <div className="fd-header">
        {fd._fraFdTasks ? (
          <span className="fd-meta-badge" style={{ background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
            ✨ Fra tilbuds-appen
          </span>
        ) : (
          <span className="fd-meta-badge">✨ AI-generert</span>
        )}
        <span className="fd-meta">
          {generertDato ? new Date(generertDato).toLocaleDateString('nb-NO') : ''}
          {versjon > 1 ? ` · v${versjon}` : ''}
          {totalVarighetUker ? ` · ${totalVarighetUker} uker` : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {(kalkyle || project.kildeTilbudData) && (
            <button className="btn btn-sm" onClick={onGenerer}
              title="Lager et nytt UTKAST fra kalkylen — dagens plan røres ikke før du aktiverer">
              ✨ Generer nytt utkast
            </button>
          )}
          {(project.framdriftsplanHistorikk || []).length > 0 && (
            <button className="btn btn-sm" onClick={() => setVisHistorikk(v => !v)}>
              🗄 {project.framdriftsplanHistorikk.length}
            </button>
          )}
        </div>
      </div>

      {visHistorikk && (project.framdriftsplanHistorikk || []).length > 0 && (
        <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, margin: '8px 0', fontSize: 12.5 }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Tidligere planer (arkivert ved aktivering — slettes aldri):</div>
          {project.framdriftsplanHistorikk.map((h, i) => (
            <div key={i} style={{ padding: '3px 0', color: '#5d6b80' }}>
              🗄 {h.arkivertDato ? new Date(h.arkivertDato).toLocaleDateString('nb-NO') : '?'} av {h.arkivertAv || '?'} — {h.fraFdTasks ? `${(h.fdTasks || []).length} faser (fra tilbuds-appen)` : `${(h.faser || []).length} faser${h.generertDato ? `, generert ${new Date(h.generertDato).toLocaleDateString('nb-NO')}` : ''}`}
            </div>
          ))}
        </div>
      )}

      {feil && <div className="fd-feil">❌ {feil}</div>}

      {advarsler.length > 0 && (
        <div className="fd-advarsler">
          {advarsler.map((a, i) => <div key={i} className="fd-advarsel">⚠️ {a}</div>)}
        </div>
      )}

      <div className="fd-gantt">
        <div className="fd-gantt-inner">
          <div className="fd-gantt-header">
            {ukeArr.map(u => (
              <div key={u} className={`fd-gantt-uke${u === iDagUke ? ' idag' : ''}`}>U{u}</div>
            ))}
          </div>
          <div className="fd-gantt-rader">
            {faser.map(fase => {
              const pos = fasePosisjon(fase)
              const farge = fagFarge(fase.fag)
              return (
                <div key={fase.id} className="fd-gantt-rad">
                  <div
                    className="fd-gantt-navn"
                    onClick={() => setValgtFase(v => v?.id === fase.id ? null : fase)}
                    title={fase.navn}
                  >
                    {fase.kritisk && <span style={{ marginRight: 2 }}>🔴</span>}
                    {fase.navn}
                  </div>
                  <div className="fd-gantt-track" style={{ '--uke-w': `${100 / visUker}%` }}>
                    <div
                      className={`fd-gantt-bar${fase.kritisk ? ' fd-gantt-bar--kritisk' : ''}`}
                      style={{ ...pos, background: farge }}
                      onClick={() => setValgtFase(v => v?.id === fase.id ? null : fase)}
                      title={`${fase.navn} — ${fase.varighetDager} dager`}
                    >
                      <span className="fd-gantt-bar-label">{fase.navn}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {milepaler.length > 0 && (
            <div className="fd-gantt-milepaler">
              {milepaler.map(m => {
                const leftPct = ((m.uke - oppstartUke + 0.5) / visUker) * 100
                if (leftPct < 0 || leftPct > 100) return null
                return (
                  <div
                    key={m.id}
                    className={`fd-gantt-mil${m.kritisk ? ' fd-gantt-mil--kritisk' : ''}`}
                    style={{ left: `${leftPct}%` }}
                    title={m.beskrivelse || m.navn}
                  >
                    <span className="fd-gantt-mil-pin">{m.kritisk ? '📌' : '🚩'}</span>
                    <span className="fd-gantt-mil-label">{m.navn}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {milepaler.length > 0 && (
        <div className="fd-milepaler">
          {milepaler.map(m => (
            <span
              key={m.id}
              className={`fd-milepael-chip${m.kritisk ? ' fd-milepael-chip--kritisk' : ''}`}
              title={m.beskrivelse}
            >
              {m.kritisk ? '📌' : '🚩'} U{m.uke} — {m.navn}
            </span>
          ))}
        </div>
      )}

      {valgtFase && (
        <div className="fd-fase-modal-overlay" onClick={() => setValgtFase(null)}>
          <div className="fd-fase-modal" onClick={e => e.stopPropagation()}>
            <div className="fd-fase-modal-header">
              <div className="fd-fase-modal-tittel">
                <span className="fd-fase-modal-fag-dot" style={{ background: fagFarge(valgtFase.fag) }} />
                {valgtFase.navn}
                {valgtFase.kritisk && (
                  <span style={{ marginLeft: 8, color: '#dc2626', fontSize: 12 }}>🔴 Kritisk fase</span>
                )}
              </div>
              <button className="btn-icon" onClick={() => setValgtFase(null)}>✕</button>
            </div>
            <div className="fd-fase-modal-grid">
              <div className="fd-fase-modal-felt">
                <span className="fd-fase-modal-felt-label">Startuke</span>
                <span className="fd-fase-modal-felt-verdi">Uke {valgtFase.startUke}</span>
              </div>
              <div className="fd-fase-modal-felt">
                <span className="fd-fase-modal-felt-label">Varighet</span>
                <span className="fd-fase-modal-felt-verdi">{valgtFase.varighetDager} dager</span>
              </div>
              <div className="fd-fase-modal-felt">
                <span className="fd-fase-modal-felt-label">Timer</span>
                <span className="fd-fase-modal-felt-verdi">{valgtFase.timer || '–'}</span>
              </div>
              <div className="fd-fase-modal-felt">
                <span className="fd-fase-modal-felt-label">Mannskap</span>
                <span className="fd-fase-modal-felt-verdi">
                  {valgtFase.mannskap} person{valgtFase.mannskap !== 1 ? 'er' : ''}
                </span>
              </div>
              {valgtFase.beskrivelse && (
                <div className="fd-fase-modal-beskrivelse">
                  <span className="fd-fase-modal-felt-label">Beskrivelse</span>
                  <div style={{ marginTop: 2 }}>{valgtFase.beskrivelse}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const FAG_COLORS = {
  'Bas Tømrer': '#b45309', 'Montør': '#3b82f6', 'Lærling Tømrer': '#15803d',
  'Maler': '#ec4899', 'Rørlegger': '#06b6d4', 'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316', 'Prosjektleder': '#0ea5e9',
};

// Backward-compat: 'planlagt' vises som 'Vi jobber med', 'aktiv' som 'Pågående'
const STATUS_LABELS = {
  jobber_med: 'Vi jobber med',
  planlagt:   'Vi jobber med',  // legacy
  godkjent:   'Godkjent',
  aktiv:      'Pågående',
  pagaende:   'Pågående',       // legacy alias
  fullfort:   'Fullført',
};

const STATUS_COLORS = {
  jobber_med: '#b45309',
  planlagt:   '#b45309',
  godkjent:   '#15803d',
  aktiv:      '#2563eb',
  pagaende:   '#2563eb',
  fullfort:   '#5d6b80',
};

const STATUS_BG = {
  jobber_med: '#fffbeb',
  planlagt:   '#fffbeb',
  godkjent:   '#f0fdf4',
  aktiv:      '#eff6ff',
  pagaende:   '#eff6ff',
  fullfort:   '#f8fafc',
};

// Canonical save-values (new records use these)
const SAVE_STATUSES = ['jobber_med', 'godkjent', 'aktiv', 'fullfort'];
const SAVE_LABELS   = { jobber_med: 'Vi jobber med', godkjent: 'Godkjent', aktiv: 'Pågående', fullfort: 'Fullført' };

// Grupperingsrekkefølge for display
const GROUP_ORDER = ['aktiv', 'pagaende', 'godkjent', 'jobber_med', 'planlagt', 'fullfort'];

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function nextAutoColor(prosjekter) {
  const used = prosjekter.map(p => p.farge).filter(Boolean);
  return PROSJEKT_PALETTE.find(c => !used.includes(c)) || PROSJEKT_PALETTE[prosjekter.length % PROSJEKT_PALETTE.length];
}

const JOBB_TYPER = ['Ny bygg', 'Tilbygg', 'Tak jobb', 'Fasade jobb', 'Bad', 'Tømrer', 'Maling', 'Rørlegger', 'Flislegging', 'Elektro', 'Rehabilitering', 'Annet'];

const EMPTY = { navn: '', adresse: '', kundeNavn: '', kundeTlf: '', kundeEpost: '', jobbType: '', startDato: '', sluttDato: '', status: 'jobber_med', beskrivelse: '', farge: PROSJEKT_PALETTE[0], belop: '', manskapAntall: '', prosjektlederId: '' };

// Normaliser gammel status til visningsgruppe
function normStatus(s) {
  if (s === 'planlagt') return 'jobber_med';
  if (s === 'pagaende') return 'aktiv';
  return s;
}

// ═══ Slå sammen duplikat-prosjekter (SPEC-merge-prosjekter.md) ═══
// Forhåndsvisning side-om-side. INGEN slette-kode: sekundær arkiveres
// med all data intakt, alt kan angres. Logikken bor i src/mergeProsjekter.js.

function mergeVisVerdi(v) {
  if (v === undefined || v === null || v === '') return '(tomt)';
  if (Array.isArray(v)) return `${v.length} stk`;
  if (typeof v === 'object') return '✓ (data)';
  if (typeof v === 'number') return v.toLocaleString('nb-NO');
  const s = String(v);
  return s.length > 42 ? s.slice(0, 40) + '…' : s;
}

function MergeModal({ startProsjekt, forslagId, alleProsjekter, tildelingerByProsjekt, onUtfør, onLukk }) {
  const [hovedId, setHovedId] = useState(startProsjekt.id);
  const [sekundarId, setSekundarId] = useState(forslagId || null);
  const [søk, setSøk] = useState('');
  const [valgtAdresse, setValgtAdresse] = useState(null);
  const [tilbudKilde, setTilbudKilde] = useState(null);
  const [beholdManuell, setBeholdManuell] = useState({});

  const aktive = alleProsjekter.filter(p => !p.arkivert);
  const hoved = aktive.find(p => p.id === hovedId) || null;
  const sekundar = aktive.find(p => p.id === sekundarId && p.id !== hovedId) || null;

  // Kandidat-liste: fuzzy-forslag først (hjelp), deretter ALLE prosjekter
  // (PL skriver av og til feil adresse — forslag er aldri en begrensning).
  const basis = aktive.find(p => p.id === startProsjekt.id) || startProsjekt;
  const kandidater = useMemo(() => {
    const forslag = finnKandidater(basis, aktive);
    const forslagIds = new Set(forslag.map(k => k.prosjekt.id));
    const q = søk.toLowerCase();
    const treffer = p =>
      !q ||
      (p.adresse || '').toLowerCase().includes(q) ||
      (p.navn || '').toLowerCase().includes(q) ||
      (p.kunde?.navn || '').toLowerCase().includes(q);
    return [
      ...forslag.filter(k => treffer(k.prosjekt)).map(k => ({ ...k, erForslag: true })),
      ...aktive
        .filter(p => p.id !== basis.id && !forslagIds.has(p.id) && treffer(p))
        .map(p => ({ prosjekt: p, score: 0, erForslag: false })),
    ];
  }, [basis, aktive, søk]);

  const begge = hoved && sekundar;
  const beggeHarTilbud = begge && harTilbud(hoved) && harTilbud(sekundar);
  const effektivKilde = beggeHarTilbud
    ? tilbudKilde // Stefan MÅ velge når begge har tilbud
    : begge && harTilbud(sekundar) ? 'sekundar'
    : begge && harTilbud(hoved) ? 'hoved'
    : null;

  // Tørrkjøring for forhåndsvisning — ingenting skrives før «Slå sammen»
  const preview = useMemo(() => {
    if (!begge || (beggeHarTilbud && !tilbudKilde)) return null;
    return beregnMerge(hoved, sekundar, {
      adresse: valgtAdresse ?? hoved.adresse,
      tilbudKilde: effektivKilde,
      beholdManuell,
      av: 'forhåndsvisning', dato: 'forhåndsvisning',
    });
  }, [hoved, sekundar, begge, beggeHarTilbud, tilbudKilde, effektivKilde, valgtAdresse, beholdManuell]);

  const tilbudsEndringer = (preview?.kopierteFelter || []).filter(k => k.kilde === 'tilbud');
  const utfyllinger = (preview?.kopierteFelter || []).filter(k => k.kilde === 'sekundar-utfyll');
  const antallBemanning = begge ? (tildelingerByProsjekt[hoved.id] || []).length : 0;
  const sekBemanning = begge ? (tildelingerByProsjekt[sekundar.id] || []).length : 0;

  const adresseAlternativer = begge
    ? [...new Set([hoved.adresse, sekundar.adresse].filter(Boolean))]
    : [];

  function byttHovedOgSekundar() {
    setHovedId(sekundarId); setSekundarId(hovedId);
    setTilbudKilde(k => (k === 'hoved' ? 'sekundar' : k === 'sekundar' ? 'hoved' : null));
    setBeholdManuell({});
  }

  const kolonneStil = { flex: 1, minWidth: 0, border: '1px solid var(--border)', borderRadius: 8, padding: 12 };
  const kanSlåSammen = begge && (!beggeHarTilbud || !!tilbudKilde);

  return (
    <Modal title="🔗 Slå sammen prosjekter" onClose={onLukk}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>

        {!sekundar && (
          <div>
            <div style={{ fontSize: 13, color: '#5d6b80', marginBottom: 8 }}>
              Velg prosjektet som skal slås sammen med <b>{basis.adresse || basis.navn}</b>.
              Forslagene er hjelp — du kan velge hvilket som helst prosjekt.
            </div>
            <input
              className="input" autoFocus placeholder="Søk adresse, navn eller kunde…"
              value={søk} onChange={e => setSøk(e.target.value)} style={{ width: '100%', marginBottom: 8 }}
            />
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {kandidater.slice(0, 40).map(({ prosjekt: p, erForslag }) => (
                <button key={p.id} className="btn" style={{ textAlign: 'left', display: 'flex', gap: 8, alignItems: 'center' }}
                  onClick={() => setSekundarId(p.id)}>
                  {erForslag && <span title="Fuzzy-forslag: lignende adresse/kunde" style={{ flexShrink: 0 }}>🔗</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.adresse || p.navn}
                    {p.kunde?.navn ? <span style={{ color: '#5d6b80' }}> · {p.kunde.navn}</span> : null}
                    {harTilbud(p) ? <span style={{ color: '#15803d' }}> · 📦 tilbud</span> : null}
                  </span>
                </button>
              ))}
              {kandidater.length === 0 && <div style={{ color: '#5d6b80', fontSize: 13, padding: 8 }}>Ingen prosjekter matcher søket.</div>}
            </div>
          </div>
        )}

        {begge && (
          <>
            {/* Side-om-side med bytt-knapp */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
              <div style={{ ...kolonneStil, borderColor: 'var(--accent)', background: 'var(--accent-subtle)' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)', marginBottom: 4 }}>⭐ HOVEDPROSJEKT (beholdes aktivt)</div>
                <div style={{ fontWeight: 500 }}>{hoved.adresse || hoved.navn}</div>
                <div style={{ fontSize: 12, color: '#5d6b80', marginTop: 2 }}>
                  {[normStatus(hoved.status), hoved.kunde?.navn, formaterBelop(hoved.belop), harTilbud(hoved) ? '📦 tilbud' : 'manuelt', `👷 ${antallBemanning} tildelinger`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button className="btn btn-sm" title="Bytt hvilken som er hovedprosjekt" onClick={byttHovedOgSekundar} style={{ alignSelf: 'center', flexShrink: 0 }}>⇄ Bytt</button>
              <div style={kolonneStil}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#5d6b80', marginBottom: 4 }}>📦 SLÅS INN (arkiveres — kan angres)</div>
                <div style={{ fontWeight: 500 }}>{sekundar.adresse || sekundar.navn}</div>
                <div style={{ fontSize: 12, color: '#5d6b80', marginTop: 2 }}>
                  {[normStatus(sekundar.status), sekundar.kunde?.navn, formaterBelop(sekundar.belop), harTilbud(sekundar) ? '📦 tilbud' : 'manuelt', `👷 ${sekBemanning} tildelinger`].filter(Boolean).join(' · ')}
                </div>
                <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => { setSekundarId(null); setSøk(''); }}>Velg annet…</button>
              </div>
            </div>

            {/* Adresse-valg (retter skrivefeil i samme steg) */}
            {adresseAlternativer.length > 1 && (
              <div style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Adresse på det sammenslåtte prosjektet:</div>
                {adresseAlternativer.map(adr => (
                  <label key={adr} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0', cursor: 'pointer' }}>
                    <input type="radio" name="merge-adresse" checked={(valgtAdresse ?? hoved.adresse) === adr} onChange={() => setValgtAdresse(adr)} />
                    {adr}
                  </label>
                ))}
              </div>
            )}

            {/* Begge har tilbud → Stefan velger hvilket som gjelder */}
            {beggeHarTilbud && (
              <div style={{ fontSize: 13, background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 500, color: 'var(--warning)', marginBottom: 4 }}>⚠ Begge prosjektene har tilbuds-kobling — velg hvilket tilbud som gjelder:</div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', padding: '2px 0' }}>
                  <input type="radio" name="merge-tilbud" checked={tilbudKilde === 'hoved'} onChange={() => setTilbudKilde('hoved')} />
                  Tilbudet på {hoved.adresse || hoved.navn} ({formaterBelop(hoved.belop) || 'uten beløp'})
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', padding: '2px 0' }}>
                  <input type="radio" name="merge-tilbud" checked={tilbudKilde === 'sekundar'} onChange={() => setTilbudKilde('sekundar')} />
                  Tilbudet på {sekundar.adresse || sekundar.navn} ({formaterBelop(sekundar.belop) || 'uten beløp'})
                </label>
              </div>
            )}

            {/* Forhåndsvisning */}
            {preview && (
              <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {effektivKilde === 'sekundar' && (
                  <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontWeight: 500, color: 'var(--success)', marginBottom: 4 }}>📦 Tilbudsdata (følger ALLTID med fra tilbudet):</div>
                    {tilbudsEndringer.length === 0 && <div style={{ color: '#5d6b80' }}>Ingen felter endres — hovedprosjektet har allerede tilbudets verdier.</div>}
                    {tilbudsEndringer.map(k => (
                      <div key={k.felt} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0', flexWrap: 'wrap' }}>
                        <span>
                          + <b>{k.felt}</b>:{' '}
                          {k.fraVerdi !== undefined && !('' + k.fraVerdi === '') ? (
                            <><span style={{ textDecoration: 'line-through', color: 'var(--warning)' }}>{mergeVisVerdi(k.fraVerdi)} manuell</span> → {mergeVisVerdi(k.tilVerdi)} fra tilbud</>
                          ) : (
                            <>{mergeVisVerdi(k.tilVerdi)}</>
                          )}
                        </span>
                        {k.fraVerdi !== undefined && k.fraVerdi !== null && k.fraVerdi !== '' && (
                          <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#5d6b80', cursor: 'pointer', fontSize: 12 }}>
                            <input type="checkbox" checked={!!beholdManuell[k.felt]}
                              onChange={e => setBeholdManuell(b => ({ ...b, [k.felt]: e.target.checked }))} />
                            behold manuell verdi
                          </label>
                        )}
                      </div>
                    ))}
                    {Object.entries(beholdManuell).filter(([, v]) => v).map(([felt]) => (
                      <div key={felt} style={{ color: '#5d6b80', padding: '2px 0' }}>
                        ✋ <b>{felt}</b>: beholder manuell verdi {mergeVisVerdi(hoved[felt])}
                        {' '}<label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer', fontSize: 12 }}>
                          <input type="checkbox" checked onChange={() => setBeholdManuell(b => ({ ...b, [felt]: false }))} /> behold manuell verdi
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>👷 Driftsdata (hovedprosjektet beholder sitt):</div>
                  <div>✓ Bemanning ({antallBemanning}{sekBemanning > 0 ? ` + ${sekBemanning} flyttes over` : ''}), status «{SAVE_LABELS[normStatus(hoved.status)] || hoved.status}», datoer, farge, prosjektleder</div>
                  {utfyllinger.length > 0 && (
                    <div style={{ marginTop: 4, color: '#5d6b80' }}>
                      Tomme felter fylles fra sekundær: {utfyllinger.map(k => k.felt).join(', ')}
                    </div>
                  )}
                </div>
                <div style={{ color: 'var(--success)', fontWeight: 500 }}>
                  🔒 Ingenting slettes. Sekundærprosjektet arkiveres med all data intakt og kan gjenopprettes med ett klikk.
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button className="btn" onClick={onLukk}>Avbryt</button>
          <button className="btn btn-primary" disabled={!kanSlåSammen}
            title={!begge ? 'Velg prosjekt først' : beggeHarTilbud && !tilbudKilde ? 'Velg hvilket tilbud som gjelder' : ''}
            onClick={() => onUtfør({
              hovedId: hoved.id, sekundarId: sekundar.id,
              adresse: valgtAdresse ?? hoved.adresse,
              tilbudKilde: effektivKilde, beholdManuell,
            })}>
            🔗 Slå sammen
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══ «Koble til tilbud»-dialog (SPEC-del2 trinn 2) ═══
// Søker blant befaringer som HAR tilbudPayload; fuzzy-forslag øverst.
// Kopierer kun tilbudsdata (gruppe A) — driftsdata røres ALDRI.
function KobleDialog({ prosjekt, befaringer, onUtfør, onLukk }) {
  const [valgtBefId, setValgtBefId] = useState(null);
  const [søk, setSøk] = useState('');
  const [beholdManuell, setBeholdManuell] = useState({});

  const medPayload = befaringer.filter(b => b && b.tilbudPayload);
  const kandidater = useMemo(() => {
    const q = søk.toLowerCase();
    return medPayload
      .filter(b => !q || (b.adresse || '').toLowerCase().includes(q) || (b.kontaktNavn || '').toLowerCase().includes(q))
      .map(b => ({ b, score: kandidatScore(prosjekt, { adresse: b.adresse, navn: b.kontaktNavn, kunde: { navn: b.kontaktNavn } }) }))
      .sort((x, y) => y.score - x.score);
  }, [medPayload, prosjekt, søk]);

  const valgtBef = medPayload.find(b => b.id === valgtBefId) || null;

  // Tørrkjøring for forhåndsvisning
  const preview = useMemo(() => {
    if (!valgtBef) return null;
    return beregnKobling(prosjekt, valgtBef, { beholdManuell, av: 'forhåndsvisning', dato: 'forhåndsvisning' });
  }, [prosjekt, valgtBef, beholdManuell]);

  const erstattede = (preview?.kopierteFelter || []).filter(k => !erTom(k.fraVerdi));
  const nyeFelter = (preview?.kopierteFelter || []).filter(k => erTom(k.fraVerdi));

  return (
    <Modal title="🔗 Koble prosjekt til tilbud" onClose={onLukk}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto', fontSize: 13 }}>
        <div style={{ color: '#5d6b80' }}>
          Koble <b>{prosjekt.adresse || prosjekt.navn}</b> til et tilbud fra tilbuds-appen.
          Tilbudsdata kopieres inn — bemanning, datoer og status røres ikke.
        </div>

        {!valgtBef && (
          <>
            <input className="input" autoFocus placeholder="Søk på adresse eller kundenavn…"
              value={søk} onChange={e => setSøk(e.target.value)} style={{ width: '100%' }} />
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {kandidater.slice(0, 30).map(({ b, score }) => (
                <button key={b.id} className="btn" style={{ textAlign: 'left', display: 'flex', gap: 8, alignItems: 'center' }}
                  onClick={() => setValgtBefId(b.id)}>
                  {score >= 30 && <span title="Fuzzy-forslag: lignende adresse/kunde">🔗</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.adresse || b.kontaktNavn}
                    {b.kontaktNavn ? <span style={{ color: '#5d6b80' }}> · {b.kontaktNavn}</span> : null}
                    {(b.estimertSum || b.tilbudPayload?.totalSum) ? <span style={{ color: '#15803d' }}> · {formaterBelop(b.estimertSum || b.tilbudPayload?.totalSum)}</span> : null}
                    {Array.isArray(b.poster) && b.poster.length > 0 ? <span style={{ color: '#5d6b80' }}> · {b.poster.length} poster</span> : null}
                  </span>
                </button>
              ))}
              {kandidater.length === 0 && (
                <div style={{ color: '#5d6b80', padding: 8 }}>
                  Ingen befaringer med tilbudsdata matcher søket. (Kun befaringer som har mottatt full tilbudspakke vises her.)
                </div>
              )}
            </div>
          </>
        )}

        {valgtBef && preview && (
          <>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 500 }}>{valgtBef.adresse || valgtBef.kontaktNavn}</div>
              <div style={{ fontSize: 12, color: '#5d6b80' }}>
                {[valgtBef.kontaktNavn, valgtBef.status, formaterBelop(valgtBef.estimertSum || valgtBef.tilbudPayload?.totalSum)].filter(Boolean).join(' · ')}
              </div>
              <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setValgtBefId(null)}>Velg annet…</button>
            </div>

            <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 500, color: 'var(--success)', marginBottom: 4 }}>📦 Kopieres inn fra tilbudet:</div>
              {nyeFelter.length > 0 && (
                <div style={{ padding: '2px 0' }}>+ {nyeFelter.map(k => k.felt).join(', ')}</div>
              )}
              {erstattede.map(k => (
                <div key={k.felt} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0', flexWrap: 'wrap' }}>
                  <span>
                    + <b>{k.felt}</b>: <span style={{ textDecoration: 'line-through', color: 'var(--warning)' }}>{mergeVisVerdi(k.fraVerdi)} manuell</span> → {mergeVisVerdi(k.tilVerdi)} fra tilbud
                  </span>
                  <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#5d6b80', cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={!!beholdManuell[k.felt]}
                      onChange={e => setBeholdManuell(bm => ({ ...bm, [k.felt]: e.target.checked }))} />
                    behold manuell verdi
                  </label>
                </div>
              ))}
              {Object.entries(beholdManuell).filter(([, v]) => v).map(([felt]) => (
                <div key={felt} style={{ color: '#5d6b80', padding: '2px 0' }}>
                  ✋ <b>{felt}</b>: beholder manuell verdi
                  {' '}<label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked onChange={() => setBeholdManuell(bm => ({ ...bm, [felt]: false }))} /> behold manuell verdi
                  </label>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              ✓ Bemanning, datoer, status, farge, prosjektleder, KS og framdrift røres <b>ikke</b>.
              «Fjern kobling» i ⋯-menyen gjenoppretter alt nøyaktig som før.
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button className="btn" onClick={onLukk}>Avbryt</button>
          <button className="btn btn-primary" disabled={!valgtBef}
            onClick={() => onUtfør({ befaringId: valgtBef.id, beholdManuell })}>
            🔗 Koble til
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── KS-plan forslag (laster maler lazy fra API) ───────────────────────────────
// ═══ 4a: forslags-boks i prosjektpanelets KS-fane (laster maler lazy) ═══
function PanelKSForslag({ prosjekt, onOppdater }) {
  const [maler, setMaler] = useState(null);
  const [lastet, setLastet] = useState(false);
  const harGrunnlag = !!(prosjekt.tilbudPayload || (prosjekt.fag || []).length > 0);
  useEffect(() => {
    if (lastet || !harGrunnlag || erForslagSkjult(prosjekt.id)) return;
    setLastet(true);
    const token = localStorage.getItem('fbs_token') || '';
    fetch('/api/ks/maler', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setMaler(d); })
      .catch(() => {});
  }, [lastet, harGrunnlag, prosjekt.id]);
  if (!harGrunnlag || !maler) return null;
  return (
    <KSFagForslag
      prosjekt={prosjekt}
      maler={maler}
      onTildel={nye => onOppdater({ ...prosjekt, ksSjekklister: [...(prosjekt.ksSjekklister || []), ...nye] })}
    />
  );
}

// ═══ 4c: kalkyletimer mot faktisk bemanning — ren visning ═══
function KalkyleVsBemanningSeksjon({ prosjekt, tildelinger, ansatteById }) {
  const beregning = useMemo(
    () => beregnKalkyleVsBemanning(prosjekt, tildelinger, ansatteById),
    [prosjekt, tildelinger, ansatteById]
  );
  if (!beregning) return null; // uten fagBreakdown: ingen seksjon

  const Bar = ({ pct }) => (
    <span style={{ flex: '0 0 90px', height: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', display: 'inline-block' }}>
      <span style={{ display: 'block', height: '100%', width: Math.min(100, pct) + '%', background: pct >= 100 ? 'var(--success)' : pct >= 50 ? 'var(--accent)' : 'var(--warning)' }} />
    </span>
  );

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 14, fontSize: 13 }}>
      <div style={{ fontWeight: 500, marginBottom: 6 }}>📊 Kalkyle vs. bemannet</div>
      {beregning.rader.map(r => (
        <div key={r.fag} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
          <span style={{ flex: '0 0 84px' }}>{r.bemannetTimer === 0 ? '⚠ ' : ''}{r.label}</span>
          <Bar pct={r.pct} />
          <span style={{ color: '#5d6b80', whiteSpace: 'nowrap' }}>{r.bemannetTimer} / {r.kalkyleTimer} t</span>
          <span style={{ fontWeight: 500, color: r.pct >= 100 ? 'var(--success)' : r.pct >= 50 ? 'var(--text-secondary)' : 'var(--warning)', marginLeft: 'auto' }}>
            {r.pct >= 100 ? '✓' : `${r.pct}%`}
          </span>
        </div>
      ))}
      {beregning.utenforKalkyle.map(r => (
        <div key={r.fag} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', color: '#5d6b80' }}>
          <span style={{ flex: '0 0 84px' }}>{r.label}</span>
          <span style={{ fontSize: 12 }}>utenfor kalkyle</span>
          <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{r.bemannetTimer} t</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, color: 'var(--text-secondary)' }}>
        Totalt bemannet: <b>{beregning.totalBemannet}</b> av <b>{beregning.totalKalkyle}</b> kalkyletimer
        <span style={{ color: '#5d6b80' }}> (tildelinger × 7,5 t/dag, man–fre)</span>
      </div>
      {beregning.manglerRader.map((m, i) => (
        <div key={i} style={{ color: 'var(--warning)', fontWeight: 500, marginTop: 2 }}>
          ⚠ {m.label} mangler ~{m.manglerTimer} t (≈{m.ukesverk.toLocaleString('nb-NO')} ukesverk)
        </div>
      ))}
    </div>
  );
}

function ProsjektKSPlanKnapp({ project, onOppdater }) {
  const [laster, setLaster] = useState(false)
  const [maler, setMaler] = useState(null)
  const [visModal, setVisModal] = useState(false)
  const [valgte, setValgte] = useState(new Set())
  const ksSjekklister = project.ksSjekklister || []
  const tildeltIds = new Set(ksSjekklister.map(k => k.malId))

  function getFaseKs(m) {
    const n = (m.navn || '').toLowerCase(), g = m.gruppe || ''
    if (g === 'Sluttkontroll' || m.id === 'mal-el-slutt') return 'slutt'
    if (n.includes('sluttkontroll') && n.includes('elektrisk')) return 'slutt'
    if (g === 'HMS' || n.includes('risikovurdering') || n.includes('sha') || n.includes('stillas')) return 'oppstart'
    return 'bygg'
  }

  function lagForslag(maler) {
    const jt = (project.jobbType || '').toLowerCase()
    const ctx = jt + ' ' + (project.navn || '').toLowerCase() + ' ' + (project.beskrivelse || '').toLowerCase()
    const ids = new Set(['mal-hms-daglig','mal-risikovurdering-oppstart','mal-sha-sja','mal-sluttkontroll','mal-el-slutt'])
    if (ctx.includes('bad') || ctx.includes('våtrom') || ctx.includes('rehabilitering'))
      ['mal-bad-riving','mal-bad-membran','mal-bad-flis','mal-bad-ror','mal-bad-el'].forEach(id => ids.add(id))
    if (ctx.includes('fasade') || ctx.includes('kledning') || ctx.includes('yttervegg'))
      ['mal-fasade-stillas','mal-fasade-riving','mal-fasade-underlag','mal-fasade-kledning','mal-fasade-vinduer','mal-fasade-beslag','mal-maling-utvendig'].forEach(id => ids.add(id))
    if (ctx.includes('tak') || ctx.includes('tekking'))
      ['mal-tak-stillas','mal-tak-riving','mal-tak-undertak','mal-tak-tekking','mal-tak-beslag'].forEach(id => ids.add(id))
    if (ctx.includes('tilbygg'))
      ['mal-tomrer-riving','mal-tomrer-baerende','mal-tomrer-isolasjon','mal-tomrer-gips','mal-tomrer-gulv'].forEach(id => ids.add(id))
    if (ctx.includes('innvendig') || ctx.includes('oppussing'))
      ['mal-tomrer-riving','mal-tomrer-gips','mal-tomrer-gulv','mal-maling-sparkling','mal-maling-innvendig'].forEach(id => ids.add(id))
    return maler.filter(m => ids.has(m.id))
  }

  async function aapneForslag() {
    setLaster(true)
    try {
      const token = localStorage.getItem('fbs_token') || ''
      const data = await fetch('/api/ks/maler', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json())
      setMaler(data)
      const forslag = lagForslag(data)
      setValgte(new Set(forslag.filter(m => !tildeltIds.has(m.id)).map(m => m.id)))
      setVisModal(true)
    } catch (e) { alert('Kunne ikke laste maler: ' + e.message) }
    setLaster(false)
  }

  function bekreft() {
    const nyeKS = (maler || []).filter(m => valgte.has(m.id)).map(m => ({
      malId: m.id, tildeltDato: new Date().toISOString(), tildeltAv: 'forslag:auto',
      status: 'ikke-startet', framdrift: { utfylt: 0, totalt: m.punkter?.length || 0 }, svar: [], avvik: [],
    }))
    onOppdater({ ...project, ksSjekklister: [...ksSjekklister, ...nyeKS] })
    setVisModal(false)
  }

  const forslatteMaler = maler ? lagForslag(maler) : []
  const FASER = [
    { id: 'oppstart', label: '📅 Oppstart', farge: '#3b82f6' },
    { id: 'bygg', label: '🔨 Bygg-fase', farge: '#f59e0b' },
    { id: 'slutt', label: '✅ Sluttkontroll', farge: '#16a34a' },
  ]

  return (
    <>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary" onClick={aapneForslag} disabled={laster} style={{ fontSize: 13 }}>
          {laster ? '⏳ Laster...' : '✨ Foreslå KS-sjekkliste-plan'}
        </button>
        {ksSjekklister.length > 0 && (
          <span style={{ fontSize: 12, color: '#5d6b80' }}>{ksSjekklister.length} sjekklister tildelt</span>
        )}
      </div>

      {visModal && maler && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setVisModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 520, width: '100%', padding: '22px 20px', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 20px 48px rgba(0,0,0,.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 500, fontSize: 17, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
              ✨ Foreslått sjekkliste-plan
              <button className="btn-icon" onClick={() => setVisModal(false)}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: '#5d6b80', marginBottom: 16 }}>
              Basert på <strong>"{project.jobbType || project.navn}"</strong> — juster gjerne utvalget
            </div>
            {FASER.map(fase => {
              const fm = forslatteMaler.filter(m => getFaseKs(m) === fase.id || (fase.id === 'oppstart' && getFaseKs(m) === 'daglig'))
              if (fm.length === 0) return null
              return (
                <div key={fase.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: fase.farge, marginBottom: 5 }}>{fase.label}</div>
                  {fm.map(m => {
                    const er = tildeltIds.has(m.id)
                    return (
                      <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, cursor: er ? 'default' : 'pointer', background: valgte.has(m.id) ? '#eff6ff' : 'transparent' }}>
                        <input type="checkbox" checked={er || valgte.has(m.id)} disabled={er}
                          onChange={e => { const s = new Set(valgte); if (e.target.checked) s.add(m.id); else s.delete(m.id); setValgte(s) }} />
                        <span style={{ fontSize: 13, color: er ? '#5d6b80' : '#1e293b', flex: 1 }}>{m.navn}</span>
                        {er ? <span style={{ fontSize: 10, color: '#5d6b80' }}>✓</span> : <span style={{ fontSize: 10, color: '#5d6b80' }}>{m.punkter?.length || 0} pkt</span>}
                      </label>
                    )
                  })}
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
              <button className="btn" onClick={() => setVisModal(false)}>Avbryt</button>
              <button className="btn btn-primary" disabled={valgte.size === 0} onClick={bekreft}>
                ✅ Legg til {valgte.size} sjekklister
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function Prosjekter({ onNavigate = null }) {
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  // PL-filter huskes per bruker (spec 2.1)
  const [plFilter, setPlFilterState] = useState(() => localStorage.getItem('fbs_proj_plfilter') || '');
  const setPlFilter = v => { localStorage.setItem('fbs_proj_plfilter', v); setPlFilterState(v); };
  const [dedupPanel, setDedupPanel] = useState(null); // null | {loading} | {dry, plan, ...}
  const isAdmin = localStorage.getItem('fbs_role') === 'admin';
  // Ny liste (designsystem PR1): aktiv status-fane + sorteringsvalg
  const [aktivFane, setAktivFane] = useState('aktiv');
  const [sortValg, setSortValg] = useState('handling'); // 'handling' (default) | 'tittel' | 'frist' | 'sum'
  // PR2: detaljpanel, varselfilter, visning, gantt-zoom, forleng frist
  const [valgtId, setValgtId] = useState(null);
  const [panelFane, setPanelFane] = useState('framdrift');
  const [varselFilter, setVarselFilter] = useState(null); // null | 'frist' | 'bemanning'
  const [visning, setVisning] = useState('liste');        // 'liste' | 'gantt'
  const [ganttMnd, setGanttMnd] = useState(6);            // 3 | 6 | 12
  const [forlengFristId, setForlengFristId] = useState(null);
  const [forlengDato, setForlengDato] = useState('');
  const [fdLaster, setFdLaster] = useState(false);
  const [fdFeil, setFdFeil] = useState('');
  const [loggEntries, setLoggEntries] = useState(null);   // null = ikke lastet

  // Sorter på det som VISES som tittel (adressen når den finnes) — ikke det
  // skjulte navnet. Ellers havner «Angelica K. – Bøhlerveien 41A» under A.
  function visTittel(p) {
    return (p.adresse || ((p.navn || '').includes(' — ') ? (p.navn || '').split(' — ').slice(1).join(' — ') : (p.navn || ''))).trim().toLowerCase();
  }
  function sorterFane(arr) {
    return [...arr].sort((a, b) => {
      if (sortValg === 'frist') return (a.sluttDato || '9999').localeCompare(b.sluttDato || '9999');
      if (sortValg === 'sum') return (Number(b.belop) || 0) - (Number(a.belop) || 0);
      return visTittel(a).localeCompare(visTittel(b), 'nb');
    });
  }

  function sluttDatoInfo(sluttDato, status) {
    if (!sluttDato || status === 'fullfort') return null;
    const dager = Math.round((new Date(sluttDato + 'T00:00:00') - new Date()) / 86400000);
    if (dager < 0)    return { farge: '#dc2626', bg: '#fff5f5', label: `${Math.abs(dager)}d over` };
    if (dager <= 7)   return { farge: '#dc2626', bg: '#fff5f5', label: `${dager}d igjen` };
    if (dager <= 14)  return { farge: '#b45309', bg: '#fffbeb', label: `${dager}d igjen` };
    return null;
  }

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, farge: nextAutoColor(state.prosjekter) });
    setShowModal(true);
  }

  function openEdit(p) {
    setEditing(p);
    setForm({
      ...p,
      kundeNavn: p.kunde?.navn || '',
      kundeTlf:  p.kunde?.telefon || '',
      kundeEpost: p.kunde?.epost || '',
    });
    setShowModal(true);
  }

  function handleSave() {
    if (!form.navn.trim()) return;
    const kunde = {
      ...(editing?.kunde || {}),
      navn:     form.kundeNavn  || '',
      telefon:  form.kundeTlf   || '',
      epost:    form.kundeEpost || '',
      adresse:  form.adresse    || '',
    };
    const payload = { ...form, kunde };
    if (editing) {
      dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...payload, id: editing.id } });
    } else {
      dispatch({ type: 'ADD_PROSJEKT', payload });
    }
    setShowModal(false);
  }

  // ── Arkivering (erstatter fysisk sletting — SPEC absolutt krav) ──
  // Setter kun arkivert-flagg + dato + hvem. ALDRI DELETE_PROSJEKT fra UI.
  function arkiverProsjekt(p) {
    if (!confirm(`Arkivere «${p.navn || p.adresse}»?\n\nProsjektet skjules fra listene men slettes IKKE. Gjenopprett når som helst fra Arkivert-fanen.`)) return;
    dispatch({
      type: 'UPDATE_PROSJEKT',
      payload: {
        ...p,
        arkivert: true,
        arkivertDato: new Date().toISOString(),
        arkivertAv: localStorage.getItem('fbs_user_navn') || localStorage.getItem('fbs_role') || 'ukjent',
      },
    });
  }

  function gjenopprettProsjekt(p) {
    dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, arkivert: false } });
    setAktivFane(normStatus(p.status) || 'aktiv');
  }

  function settProsjektStatus(p, nyStatus) {
    dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, status: nyStatus } });
  }

  // ═══ Slå sammen duplikater (SPEC-merge-prosjekter.md) ═══
  // 🔒 Ingen slette-kode: kopierer til hoved + arkiverer sekundær. Alt angres.
  const [mergeFor, setMergeFor] = useState(null);      // {prosjekt, forslagId}
  const [mergeToast, setMergeToast] = useState(null);  // {tekst, hovedId, sekundarId}
  useEffect(() => {
    if (!mergeToast) return;
    const t = setTimeout(() => setMergeToast(null), 30000);
    return () => clearTimeout(t);
  }, [mergeToast]);

  function loggAudit(objektId, felt, fraVerdi, tilVerdi, begrunnelse) {
    const token = localStorage.getItem('fbs_token') || '';
    fetch('/api/befaringer/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ objektId, felt, fraVerdi, tilVerdi, kilde: 'merge-prosjekter', begrunnelse }),
    }).catch(() => {});
  }

  const PEKER_ACTION = { tildelinger: 'UPDATE_TILDELING', oppgaver: 'UPDATE_OPPGAVE', rorPlaner: 'UPDATE_ROR_PLAN', rorTimer: 'UPDATE_ROR_TIMER', befaringer: 'UPDATE_BEFARING' };

  function utførMerge(valgInn) {
    const hoved = state.prosjekter.find(p => p.id === valgInn.hovedId);
    const sekundar = state.prosjekter.find(p => p.id === valgInn.sekundarId);
    if (!hoved || !sekundar || hoved.id === sekundar.id) return;
    const av = localStorage.getItem('fbs_user_navn') || localStorage.getItem('fbs_role') || 'ukjent';
    const dato = new Date().toISOString();
    const { nyHoved, nySekundar, kopierteFelter } = beregnMerge(hoved, sekundar, { ...valgInn, av, dato });
    const pekere = beregnPekerOppdatering(state, sekundar.id, hoved.id);
    const pekerIds = Object.fromEntries(Object.entries(pekere).map(([k, v]) => [k, v.ids]));

    // Peker-listen lagres PÅ mergetFra-innslaget (synkes til skyen) slik at
    // angre virker fra hvilken som helst enhet — ikke bare denne maskinen.
    const sisteMerge = nyHoved.mergetFra[nyHoved.mergetFra.length - 1];
    sisteMerge.pekere = pekerIds;

    // 1) Backup FØRST: begge prosjektenes komplette JSON i fbs_merge_historikk.
    //    Tømmes aldri — selv om angre-logikken skulle feile ligger originalene her.
    try {
      const hist = JSON.parse(localStorage.getItem('fbs_merge_historikk') || '[]');
      hist.push({ dato, av, hovedFør: hoved, sekundarFør: sekundar, pekereFør: pekerIds, valgtAdresse: valgInn.adresse || '' });
      localStorage.setItem('fbs_merge_historikk', JSON.stringify(hist));
    } catch (e) { console.error('fbs_merge_historikk:', e); }

    // 2) Skriv — utelukkende UPDATE-actions (denne flyten HAR ingen slette-kode)
    dispatch({ type: 'UPDATE_PROSJEKT', payload: nyHoved });
    dispatch({ type: 'UPDATE_PROSJEKT', payload: nySekundar });
    for (const [samling, info] of Object.entries(pekere)) {
      for (const item of info.oppdaterte) dispatch({ type: PEKER_ACTION[samling], payload: item });
    }

    loggAudit(hoved.id, 'merge', sekundar.adresse || sekundar.navn, hoved.adresse || hoved.navn,
      `Slo sammen «${sekundar.adresse || sekundar.navn}» inn i «${hoved.adresse || hoved.navn}» — ${kopierteFelter.length} felter kopiert, adresse satt til «${valgInn.adresse || hoved.adresse || ''}»`);

    setMergeFor(null);
    setValgtId(null);
    setMergeToast({
      tekst: `🔗 Slo sammen «${sekundar.adresse || sekundar.navn}» inn i «${hoved.adresse || hoved.navn}»`,
      hovedId: hoved.id, sekundarId: sekundar.id,
    });
  }

  function angreMerge(hovedId, sekundarId) {
    const hoved = state.prosjekter.find(p => p.id === hovedId);
    const sekundar = state.prosjekter.find(p => p.id === sekundarId);
    const mergeInfo = (hoved?.mergetFra || []).filter(m => m.id === sekundarId).slice(-1)[0];
    if (!hoved || !sekundar || !mergeInfo) {
      alert('Fant ikke sammenslåings-loggen for dette prosjektet — ingenting er endret.');
      return;
    }
    const { nyHoved, nySekundar, ikkeTilbakestilt } = beregnAngre(hoved, sekundar, mergeInfo);
    const angrePekere = beregnAngrePekere(state, mergeInfo.pekere || {}, sekundarId, hovedId);

    dispatch({ type: 'UPDATE_PROSJEKT', payload: nyHoved });
    dispatch({ type: 'UPDATE_PROSJEKT', payload: nySekundar });
    for (const [samling, info] of Object.entries(angrePekere)) {
      for (const item of info.oppdaterte) dispatch({ type: PEKER_ACTION[samling], payload: item });
    }

    loggAudit(hovedId, 'angre-merge', hoved.adresse || hoved.navn, sekundar.adresse || sekundar.navn,
      `Angret sammenslåing: «${sekundar.adresse || sekundar.navn}» gjenopprettet fra «${hoved.adresse || hoved.navn}»`);

    setMergeToast(null);
    if (ikkeTilbakestilt.length > 0) {
      alert(`Sammenslåingen er angret. Disse feltene var endret manuelt ETTER sammenslåingen og ble derfor ikke rørt: ${ikkeTilbakestilt.join(', ')}`);
    }
  }

  // ═══ Koble til tilbud (SPEC-del2 trinn 2) — kun gruppe A, alt reversibelt ═══
  const [kobleFor, setKobleFor] = useState(null); // prosjekt | null

  function utførKobling(prosjektId, valgInn) {
    const prosjekt = state.prosjekter.find(p => p.id === prosjektId);
    const befaring = (state.befaringer || []).find(b => b.id === valgInn.befaringId);
    if (!prosjekt || !befaring) return;
    const av = localStorage.getItem('fbs_user_navn') || localStorage.getItem('fbs_role') || 'ukjent';
    const dato = new Date().toISOString();
    const { nyProsjekt, kopierteFelter, felterFør } = beregnKobling(prosjekt, befaring, { ...valgInn, av, dato });

    // Historikk FØRST (tømmes aldri) — så selv om fjern-logikken skulle
    // feile ligger før-verdiene her ordrett.
    try {
      const hist = JSON.parse(localStorage.getItem('fbs_koble_historikk') || '[]');
      hist.push({ dato, av, prosjektId: prosjekt.id, befaringId: befaring.id, felterFør, prosjektFør: prosjekt });
      localStorage.setItem('fbs_koble_historikk', JSON.stringify(hist));
    } catch (e) { console.error('fbs_koble_historikk:', e); }

    dispatch({ type: 'UPDATE_PROSJEKT', payload: nyProsjekt });
    loggAudit(prosjekt.id, 'koble-tilbud', null, befaring.adresse || befaring.kontaktNavn,
      `Koblet prosjektet til tilbud fra befaring «${befaring.adresse || befaring.kontaktNavn}» — ${kopierteFelter.length} felter kopiert`);
    setKobleFor(null);
  }

  function fjernKobling(p) {
    if (!p.tilbudsfelterFørKobling) {
      alert('Dette prosjektet har ingen manuell tilbuds-kobling å fjerne.');
      return;
    }
    if (!confirm(`Fjerne tilbuds-koblingen på «${p.adresse || p.navn}»?\n\nTilbudsfeltene settes tilbake nøyaktig slik de var før koblingen. Ingen annen data røres.`)) return;
    const resultat = beregnFjernKobling(p);
    if (!resultat) return;
    dispatch({ type: 'UPDATE_PROSJEKT', payload: resultat.nyProsjekt });
    loggAudit(p.id, 'fjern-tilbud-kobling', p.befaringId || null, null,
      `Fjernet tilbuds-koblingen — tilbudsfeltene gjenopprettet til verdiene før kobling`);
  }

  // Oppslags-indekser (unngå O(n) skann per prosjekt i render-loopen)
  const ansatteById = useMemo(() => {
    const m = {};
    for (const a of state.ansatte) m[a.id] = a;
    return m;
  }, [state.ansatte]);
  const oppgaverByProsjekt = useMemo(() => {
    const m = {};
    for (const o of state.oppgaver) (m[o.prosjektId] ||= []).push(o);
    return m;
  }, [state.oppgaver]);
  const tildelingerByProsjekt = useMemo(() => {
    const m = {};
    for (const t of state.tildelinger) (m[t.prosjektId] ||= []).push(t);
    return m;
  }, [state.tildelinger]);

  const alleProsjekter = useMemo(() => state.prosjekter.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      const pl = p.prosjektlederId ? ansatteById[p.prosjektlederId] : null;
      const match =
        (p.navn || '').toLowerCase().includes(q) ||
        (p.adresse || '').toLowerCase().includes(q) ||
        (p.jobbType || '').toLowerCase().includes(q) ||
        (p.beskrivelse || '').toLowerCase().includes(q) ||
        (pl?.navn || '').toLowerCase().includes(q) ||
        (p.kunde?.navn || '').toLowerCase().includes(q) ||
        (p.kunde?.telefon || '').includes(q) ||
        (p.kunde?.epost || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (plFilter && p.prosjektlederId !== plFilter) return false;
    return true;
  }), [state.prosjekter, ansatteById, search, plFilter]);

  // ── Status-faner (designsystem PR1): teller + sum per fane ──
  // Arkiverte er utelatt fra status-fanene og har egen dempet fane.
  const faneListe = useMemo(() => {
    const aktive = alleProsjekter.filter(p => !p.arkivert);
    const perFane = key => aktive.filter(p => normStatus(p.status) === key);
    const sum = arr => arr.reduce((s, p) => s + (Number(p.belop) || 0), 0);
    const lag = (key, label, ikon, farge, dempet = false) => {
      const arr = perFane(key);
      return { key, label, ikon, farge, dempet, teller: arr.length, sum: dempet ? 0 : sum(arr) };
    };
    return [
      lag('aktiv', 'Pågående', '🔨', STATUS_COLORS.aktiv),
      lag('godkjent', 'Godkjent', '✅', STATUS_COLORS.godkjent),
      lag('jobber_med', 'Vi jobber med', '📋', STATUS_COLORS.jobber_med),
      lag('fullfort', 'Fullført', '🏁', '#5d6b80', true),
      {
        key: 'arkivert', label: 'Arkivert', ikon: '🗄', farge: '#5d6b80', dempet: true,
        teller: alleProsjekter.filter(p => p.arkivert).length, sum: 0,
      },
    ];
  }, [alleProsjekter]);

  // ── PR2: varsler (over frist / uten bemanning neste 7 dager) ──
  const overFristIds = useMemo(() => new Set(
    alleProsjekter
      .filter(p => !p.arkivert && normStatus(p.status) !== 'fullfort' && p.sluttDato &&
        new Date(p.sluttDato + 'T00:00:00') < new Date(dateToIso(new Date()) + 'T00:00:00'))
      .map(p => p.id)
  ), [alleProsjekter]);

  const utenBemanningIds = useMemo(() => {
    const iDag = dateToIso(new Date());
    const omEnUke = dateToIso(new Date(Date.now() + 7 * 86400000));
    return new Set(
      alleProsjekter
        .filter(p => !p.arkivert && normStatus(p.status) === 'aktiv')
        // Prosjekter som allerede har passert sluttdato hører til frist-varselet,
        // ikke bemanning-varselet — ellers dobbelttelles de og tallet blåses opp
        .filter(p => !(p.sluttDato && p.sluttDato < iDag))
        .filter(p => !(tildelingerByProsjekt[p.id] || []).some(t =>
          t.startDato && t.sluttDato && t.startDato <= omEnUke && t.sluttDato >= iDag))
        .map(p => p.id)
    );
  }, [alleProsjekter, tildelingerByProsjekt]);

  // ── 4c lett varsel: Pågående + kalkyle-fag <50 % bemannet + <2 uker til slutt ──
  const underbemannetIds = useMemo(() => {
    const iDag = dateToIso(new Date());
    return new Set(
      alleProsjekter
        .filter(p => !p.arkivert && normStatus(p.status) === 'aktiv' && p.tilbudPayload?.fagBreakdown)
        .filter(p => erUnderbemannetMotKalkyle(p, state.tildelinger, ansatteById, iDag))
        .map(p => p.id)
    );
  }, [alleProsjekter, state.tildelinger, ansatteById]);

  // ── Duplikat-hint — fuzzy-motor fra mergeProsjekter (SPEC §2): Levenshtein ≤3
  // på gatenavn, husnummer må matche eksakt, kundenavn vekter sterkt.
  // KUN visning/hjelp — aldri auto-handling. hint[p.id] = { id, label }.
  const duplikatHint = useMemo(() => {
    const aktive = alleProsjekter.filter(p => !p.arkivert);
    const hint = {};
    for (const p of aktive) {
      let best = null;
      for (const q of aktive) {
        if (q.id === p.id) continue;
        const s = kandidatScore(p, q);
        if (s >= 50 && (!best || s > best.score)) best = { score: s, q };
      }
      if (best) hint[p.id] = { id: best.q.id, label: best.q.adresse || best.q.navn };
    }
    return hint;
  }, [alleProsjekter]);

  const faneProsjekter = useMemo(() => {
    let arr = aktivFane === 'arkivert'
      ? alleProsjekter.filter(p => p.arkivert)
      : alleProsjekter.filter(p => !p.arkivert && normStatus(p.status) === aktivFane);
    if (varselFilter === 'frist') arr = arr.filter(p => overFristIds.has(p.id));
    if (varselFilter === 'bemanning') arr = arr.filter(p => utenBemanningIds.has(p.id));
    if (sortValg === 'handling' && aktivFane !== 'arkivert') {
      // «Trenger handling først»: over frist øverst, deretter uten bemanning,
      // deretter resten — alfabetisk innen hver gruppe
      const vekt = p => (overFristIds.has(p.id) ? 0 : utenBemanningIds.has(p.id) ? 1 : 2);
      return [...arr].sort((a, b) => vekt(a) - vekt(b) || visTittel(a).localeCompare(visTittel(b), 'nb'));
    }
    return sorterFane(arr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alleProsjekter, aktivFane, sortValg, varselFilter, overFristIds, utenBemanningIds]);

  // ── PR2: detaljpanel-hjelpere ──
  const valgtProsjekt = valgtId ? state.prosjekter.find(p => p.id === valgtId) : null;

  function aapnePanel(p) {
    setValgtId(p.id);
    setPanelFane('framdrift');
    setLoggEntries(null);
    setFdFeil('');
  }

  // SPEC-trinn4b: generering lager alltid et UTKAST — aldri auto-aktivert.
  async function genererFramdrift(prosjektId) {
    setFdLaster(true);
    setFdFeil('');
    try {
      const token = localStorage.getItem('fbs_token') || '';
      const r = await fetch('/api/prosjekter/framdrift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prosjektId, somUtkast: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Feil ${r.status}`);
      const prosjekt = state.prosjekter.find(p => p.id === prosjektId);
      if (prosjekt) dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...prosjekt, framdriftsplanUtkast: data.framdriftsplan } });
    } catch (e) {
      setFdFeil(e.message);
    } finally {
      setFdLaster(false);
    }
  }

  function aktiverUtkast(p) {
    const utkast = p.framdriftsplanUtkast;
    if (!utkast) return;
    const harEksisterende = p.framdriftsplan || (Array.isArray(p.fdTasks) && p.fdTasks.length > 0);
    if (harEksisterende && !confirm('Erstatte eksisterende framdriftsplan?\n\nDen gamle arkiveres i plan-historikken og kan gjenopprettes — ingenting slettes.')) return;
    const av = localStorage.getItem('fbs_user_navn') || localStorage.getItem('fbs_role') || 'ukjent';
    const { nyProsjekt } = beregnAktivering(p, utkast, { av, dato: new Date().toISOString() });
    dispatch({ type: 'UPDATE_PROSJEKT', payload: nyProsjekt });
    loggAudit(p.id, 'framdriftsplan', harEksisterende ? 'eksisterende plan (arkivert)' : null, `${utkast.faser?.length || 0} faser`,
      'Aktiverte AI-generert framdriftsplan fra tilbudskalkylen');
  }

  function forkastUtkast(p) {
    if (!p.framdriftsplanUtkast) return;
    const { nyProsjekt } = beregnForkast(p);
    dispatch({ type: 'UPDATE_PROSJEKT', payload: nyProsjekt });
  }

  async function hentLogg(p) {
    setLoggEntries([]);
    try {
      const token = localStorage.getItem('fbs_token') || '';
      const r = await fetch('/api/befaringer/audit', { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json().catch(() => ({}));
      const relevante = (data.entries || []).filter(e =>
        [p.id, p.befaringId, p.kildeBefaringId].filter(Boolean).includes(e.objektId)
      );
      setLoggEntries(relevante.reverse());
    } catch {
      setLoggEntries([]);
    }
  }

  function lagreForlengFrist(p) {
    if (!forlengDato) return;
    dispatch({
      type: 'UPDATE_PROSJEKT',
      payload: {
        ...p,
        sluttDato: forlengDato,
        fristUtvidelser: [
          ...(p.fristUtvidelser || []),
          {
            fraDato: p.sluttDato || null,
            tilDato: forlengDato,
            endretAv: localStorage.getItem('fbs_user_navn') || 'ukjent',
            endretDato: new Date().toISOString(),
          },
        ],
      },
    });
    setForlengFristId(null);
    setForlengDato('');
  }

  // ---- Admin: dedup prosjekter ----
  async function kjorDedup(dry) {
    setDedupPanel({ loading: true });
    try {
      const token = localStorage.getItem('fbs_token') || '';
      const r = await fetch('/api/admin/dedup-prosjekter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dry }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setDedupPanel({ ...data, loading: false });
      // Etter sletting plukker bakgrunns-sync (poller hvert 5s) opp endringen automatisk.
    } catch (e) {
      setDedupPanel({ error: e.message, loading: false });
    }
  }

  return (
    <div className={`page${fullscreen ? ' proj-fullscreen' : ''}`}>
      <div className="page-header">
        <h2>Prosjekter <span className="count-badge">{state.prosjekter.length}</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'}>
            {fullscreen ? '✕ Lukk' : '⛶ Fullskjerm'}
          </button>
          {/* Dedup-knappen er SKJULT per SPEC (sletter fysisk = farlig).
              Koden beholdes — endre `false` til `isAdmin` for å vise igjen. */}
          {false && isAdmin && (
            <button
              className="btn"
              onClick={() => dedupPanel ? setDedupPanel(null) : kjorDedup(true)}
              title="Finn og rydd opp duplikate prosjekter"
            >
              🔧 Dedup
            </button>
          )}
          <button className="btn btn-primary" onClick={openNew}>+ Nytt prosjekt</button>
        </div>
      </div>

      {/* Admin: dedup-panel */}
      {isAdmin && dedupPanel && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', margin: '0 0 12px 0', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ color: '#1e293b' }}>🔧 Dedup prosjekter</strong>
            <button onClick={() => setDedupPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#5d6b80' }}>✕</button>
          </div>

          {dedupPanel.loading && <div style={{ color: '#5d6b80' }}>⏳ Henter duplikater...</div>}
          {dedupPanel.error && <div style={{ color: '#dc2626' }}>⚠️ Feil: {dedupPanel.error}</div>}
          {!dedupPanel.loading && !dedupPanel.error && dedupPanel.funnetDuplikater === 0 && (
            <div style={{ color: '#15803d' }}>✅ Ingen duplikater funnet</div>
          )}

          {!dedupPanel.loading && !dedupPanel.error && dedupPanel.duplikatGrupper > 0 && (
            <>
              <div style={{ color: '#1e293b', marginBottom: 8 }}>
                Funnet <strong>{dedupPanel.duplikatGrupper}</strong> duplikatgrupper
                → vil slette <strong>{dedupPanel.skalSlettes}</strong> prosjekter
                (beholder {dedupPanel.gjenværendeEtter})
                {dedupPanel.refsSomFlyttes > 0 && <> · flytter {dedupPanel.refsSomFlyttes} tildelinger/oppgaver til keeper</>}
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                {(dedupPanel.plan || []).map((g, i) => (
                  <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < dedupPanel.plan.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ fontWeight: 500 }}>Beholder: {g.behold.navn}</div>
                    <div style={{ color: '#5d6b80', fontSize: 12 }}>
                      id: {g.behold.id} · {g.behold.status} · {g.behold.refs} ref
                      {g.behold.harFramdrift ? ' · framdrift' : ''}{g.behold.harTilbud ? ' · tilbud' : ''}
                    </div>
                    {g.slett.map(s => (
                      <div key={s.id} style={{ color: '#dc2626', fontSize: 12, paddingLeft: 10 }}>
                        🗑 {s.navn} ({s.id}) · {s.status} · {s.refs} ref{s.harFramdrift ? ' · framdrift' : ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {dedupPanel.dry !== false && (
                <button
                  onClick={() => {
                    if (!window.confirm(`Slette ${dedupPanel.skalSlettes} duplikate prosjekter?\nReferanser (tildelinger/oppgaver) flyttes til keeper.\nDette kan ikke angres (men snapshots tas).`)) return;
                    kjorDedup(false);
                  }}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}
                >
                  🗑 Slett {dedupPanel.skalSlettes} duplikater
                </button>
              )}
              {dedupPanel.dry === false && (
                <div style={{ color: '#15803d', fontWeight: 500 }}>✅ Slettet {dedupPanel.slettet} duplikater · {dedupPanel.gjenværende} prosjekter igjen</div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ Ny liste (designsystem, SPEC layout C — PR1) ═══ */}

      {/* Varsel-bannere — klikk filtrerer listen (PR2) */}
      <div>
        {overFristIds.size > 0 && (
          <VarselBanner
            ikon="⚠" tone="roed" aktiv={varselFilter === 'frist'}
            tekst={`${overFristIds.size} over frist`}
            onClick={() => setVarselFilter(f => f === 'frist' ? null : 'frist')}
          />
        )}
        {utenBemanningIds.size > 0 && (
          <VarselBanner
            ikon="👷" tone="gul" aktiv={varselFilter === 'bemanning'}
            tekst={`${utenBemanningIds.size} uten bemanning neste uke`}
            onClick={() => setVarselFilter(f => f === 'bemanning' ? null : 'bemanning')}
          />
        )}
      </div>

      {/* Status-faner med teller + sum (erstatter KPI-kort + grupper) */}
      <StatusFaner faner={faneListe} aktiv={aktivFane} onVelg={k => { setAktivFane(k); setVarselFilter(null); }} />

      {/* Søk + PL-filter + sortering */}
      <div className="toolbar" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <input
          className="search-input"
          placeholder="🔍 Søk navn, adresse, type, leder..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        {(() => {
          const plIds = [...new Set(state.prosjekter.map(p => p.prosjektlederId).filter(Boolean))];
          if (plIds.length === 0) return null;
          return (
            <select
              className="input"
              style={{ width: 190, height: 36, fontSize: 13 }}
              value={plFilter}
              onChange={e => setPlFilter(e.target.value)}
            >
              <option value="">Alle prosjektledere</option>
              {plIds.map(id => {
                const a = ansatteById[id];
                return a ? <option key={id} value={id}>{a.navn}</option> : null;
              })}
            </select>
          );
        })()}
        <span style={{ fontSize: 12, color: '#5d6b80' }}>Sorter:</span>
        {[['handling', '⚠ Trenger handling'], ['tittel', 'A–Å'], ['frist', 'Frist'], ['sum', 'Sum']].map(([key, label]) => (
          <button
            key={key}
            className="btn btn-sm"
            style={sortValg === key ? { background: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' } : {}}
            onClick={() => setSortValg(key)}
          >
            {label}
          </button>
        ))}
        <span style={{ fontSize: 12, color: '#5d6b80', marginLeft: 8 }}>Visning:</span>
        {[['liste', '☰ Liste'], ['gantt', '📊 Gantt']].map(([key, label]) => (
          <button
            key={key}
            className="btn btn-sm"
            style={visning === key ? { background: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' } : {}}
            onClick={() => setVisning(key)}
          >
            {label}
          </button>
        ))}
        {visning === 'gantt' && [3, 6, 12].map(m => (
          <button
            key={m}
            className="btn btn-sm"
            style={ganttMnd === m ? { background: '#0891b2', color: '#fff', borderColor: '#0891b2' } : {}}
            onClick={() => setGanttMnd(m)}
          >
            {m} mnd
          </button>
        ))}
        <span style={{ fontSize: 12, color: '#5d6b80', marginLeft: 'auto' }}>
          {faneProsjekter.length} prosjekter
        </span>
      </div>

      {/* ── Gantt-visning (PR2): kun aktiv fanes prosjekter, -1/+N mnd ── */}
      {visning === 'gantt' && aktivFane !== 'arkivert' && (() => {
        const start = new Date(); start.setMonth(start.getMonth() - 1); start.setDate(1);
        const slutt = new Date(); slutt.setMonth(slutt.getMonth() + ganttMnd);
        const startIso = dateToIso(start), sluttIso = dateToIso(slutt);
        const totDager = Math.max(1, daysBetween(startIso, sluttIso));
        const pct = iso => Math.max(0, Math.min(100, (daysBetween(startIso, iso) / totDager) * 100));
        const iDagPct = pct(dateToIso(new Date()));
        const mnder = [];
        for (let d = new Date(start); d < slutt; d.setMonth(d.getMonth() + 1)) {
          mnder.push({ label: d.toLocaleDateString('nb-NO', { month: 'short' }), pct: pct(dateToIso(d)) });
        }
        return (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', position: 'relative' }}>
            <div style={{ position: 'relative', height: 20, borderBottom: '1px solid #e2e8f0', marginBottom: 8, marginLeft: 180 }}>
              {mnder.map((m, i) => (
                <span key={i} style={{ position: 'absolute', left: m.pct + '%', fontSize: 11, color: '#5d6b80', fontWeight: 500 }}>{m.label}</span>
              ))}
            </div>
            {(() => {
              // ALLE prosjekter i fanen vises — samme utvalg som Liste-visningen.
              // Datoer utenfor vinduet klemmes til kanten med ◂/▸-markør;
              // mangler én av datoene brukes den andre for begge.
              return (
                <>
                  {faneProsjekter.map(p => {
                    const visAdr = p.adresse || p.navn || 'Uten navn';
                    const s = p.startDato || p.sluttDato;
                    const e = p.sluttDato || p.startDato;
                    const utenDato = !s;
                    const heltFoer = !utenDato && e < startIso;
                    const heltEtter = !utenDato && s > sluttIso;
                    const datoTittel = utenDato ? '' : `${formatDate(s)} – ${formatDate(e)}`;
                    let v = 0, b = 0;
                    if (!utenDato && !heltFoer && !heltEtter) {
                      v = pct(s < startIso ? startIso : s);
                      b = Math.max(1.5, pct(e > sluttIso ? sluttIso : e) - v);
                    }
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', height: 34, borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                        onClick={() => aapnePanel(p)}>
                        <div style={{ width: 180, flexShrink: 0, fontSize: 12.5, fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                          {visAdr}
                        </div>
                        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                          <div style={{ position: 'absolute', left: iDagPct + '%', top: 0, bottom: 0, width: 2, background: '#dc2626', opacity: .6 }} />
                          {utenDato && (
                            <span style={{ position: 'absolute', left: 8, top: 9, fontSize: 11, color: '#5d6b80', fontStyle: 'italic' }}>
                              🗓 ingen datoer — sett via Rediger
                            </span>
                          )}
                          {heltFoer && (
                            <span title={datoTittel} style={{ position: 'absolute', left: 4, top: 8, fontSize: 12, fontWeight: 500, color: p.farge || '#1d4ed8' }}>
                              ◂ {formatDate(e)}
                            </span>
                          )}
                          {heltEtter && (
                            <span title={datoTittel} style={{ position: 'absolute', right: 4, top: 8, fontSize: 12, fontWeight: 500, color: p.farge || '#1d4ed8' }}>
                              {formatDate(s)} ▸
                            </span>
                          )}
                          {!utenDato && !heltFoer && !heltEtter && (
                            <div title={datoTittel}
                              style={{ position: 'absolute', left: v + '%', width: b + '%', top: 7, height: 20, background: p.farge || '#2563eb', borderRadius: 5, opacity: .9 }}>
                              {s < startIso && <span style={{ position: 'absolute', left: 3, top: 2, fontSize: 11, color: '#fff' }}>◂</span>}
                              {e > sluttIso && <span style={{ position: 'absolute', right: 3, top: 2, fontSize: 11, color: '#fff' }}>▸</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {faneProsjekter.length === 0 && <div style={{ padding: 20, color: '#5d6b80', textAlign: 'center' }}>Ingen prosjekter i denne fanen.</div>}
                </>
              );
            })()}
          </div>
        );
      })()}

      {/* Kompakte rader */}
      {visning === 'liste' && faneProsjekter.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#5d6b80', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          {aktivFane === 'arkivert' ? 'Ingen arkiverte prosjekter.' : 'Ingen prosjekter i denne fanen.'}
        </div>
      )}
      {visning === 'liste' && faneProsjekter.map(p => {
        const visAdresse = p.adresse || ((p.navn || '').includes(' — ') ? (p.navn || '').split(' — ').slice(1).join(' — ').trim() : (p.navn || 'Uten navn'));
        const kundeNavn = p.kunde?.navn || ((p.navn || '').includes(' — ') ? (p.navn || '').split(' — ')[0].trim() : null);
        const pl = p.prosjektlederId ? ansatteById[p.prosjektlederId] : null;
        const tild = tildelingerByProsjekt[p.id] || [];
        const antallFolk = new Set(tild.map(t => t.ansattId)).size;
        const opp = oppgaverByProsjekt[p.id] || [];
        const fremgang = opp.length
          ? Math.round(opp.reduce((s, o) => s + (o.fremgang || 0), 0) / opp.length)
          : (Array.isArray(p.fdTasks) && p.fdTasks.length
            ? Math.round(p.fdTasks.reduce((s, t) => s + (t.progress || 0), 0) / p.fdTasks.length)
            : null);
        const belopVis = formaterBelop(p.belop);
        const varsel = aktivFane !== 'arkivert' ? sluttDatoInfo(p.sluttDato, p.status) : null;
        const ks = Array.isArray(p.ksSjekklister) && p.ksSjekklister.length > 0 ? p.ksSjekklister.length : null;

        if (aktivFane === 'arkivert') {
          const mergetHoved = p.mergetInn
            ? state.prosjekter.find(x => x.id === p.mergetInn.hovedId)
            : null;
          return (
            <KompaktRad
              key={p.id}
              tittel={visAdresse}
              undertittel={kundeNavn ? `👤 ${kundeNavn}` : null}
              varsel={p.mergetInn ? `🔗 Slått sammen med ${mergetHoved ? (mergetHoved.adresse || mergetHoved.navn) : 'annet prosjekt'}` : null}
              varselFarge={p.mergetInn ? '#0e7490' : null}
              meta={[
                p.arkivertDato ? `🗄 Arkivert ${formatDate(p.arkivertDato.slice(0, 10))}` : '🗄 Arkivert',
                p.arkivertAv ? `av ${p.arkivertAv}` : null,
              ]}
              hoyre={[belopVis]}
              meny={[
                p.mergetInn
                  ? { ikon: '↩', label: 'Angre sammenslåing', onClick: () => angreMerge(p.mergetInn.hovedId, p.id) }
                  : { ikon: '↩', label: 'Gjenopprett', onClick: () => gjenopprettProsjekt(p) },
                { ikon: '✏️', label: 'Rediger', onClick: () => openEdit(p) },
              ]}
              onClick={() => openEdit(p)}
            />
          );
        }

        const manglerBemanning = utenBemanningIds.has(p.id);
        const hurtigknapp = overFristIds.has(p.id)
          ? { label: '📅 Forleng frist', onClick: () => { setForlengFristId(p.id); setForlengDato(p.sluttDato || dateToIso(new Date())); } }
          : manglerBemanning && onNavigate
            ? { label: '👷 + Bemann', onClick: () => onNavigate('bemanningsplan') }
            : null;

        return (
          <div key={p.id}>
          <KompaktRad
            tittel={visAdresse}
            undertittel={kundeNavn ? `👤 ${kundeNavn}` : null}
            varsel={(() => {
              // Rød frist (over/≤7d) vinner alltid; underbemannet-mot-kalkyle er
              // mer handlingsrettet enn det gule «Xd igjen» og tar dets plass.
              if (varsel && varsel.farge === '#dc2626') return `⚠ ${varsel.label}`;
              if (underbemannetIds.has(p.id)) return '👷 underbemannet mot kalkyle';
              if (varsel) return `⚠ ${varsel.label}`;
              if (manglerBemanning) return '👷 ingen bemanning neste uke';
              return null;
            })()}
            varselFarge={varsel?.farge === '#dc2626' ? varsel.farge : underbemannetIds.has(p.id) ? '#b45309' : varsel ? varsel.farge : manglerBemanning ? '#b45309' : null}
            hint={duplikatHint[p.id] ? `🔗 ligner på ${duplikatHint[p.id].label}` : null}
            meta={[
              p.startDato ? `📅 ${formatDate(p.startDato)}${p.sluttDato ? ` – ${formatDate(p.sluttDato)}` : ''}` : null,
              varighetUker(p.startDato, p.sluttDato),
              pl ? `🧑‍💼 ${(pl.navn || '').split(' ')[0]}` : null,
              p.jobbType || null,
            ]}
            hoyre={[
              antallFolk > 0 ? `👷 ${antallFolk}` : null,
              belopVis,
              ks ? `✅ ${ks}` : null,
            ]}
            fremdrift={fremgang}
            hurtigknapp={hurtigknapp}
            meny={[
              { ikon: '✏️', label: 'Rediger', onClick: () => openEdit(p) },
              duplikatHint[p.id]
                ? { ikon: '🔗', label: `Slå sammen med ${duplikatHint[p.id].label}…`, onClick: () => setMergeFor({ prosjekt: p, forslagId: duplikatHint[p.id].id }) }
                : { ikon: '🔗', label: 'Slå sammen med…', onClick: () => setMergeFor({ prosjekt: p, forslagId: null }) },
              !(p.tilbudPayload || p.tilbudLink)
                && { ikon: '📦', label: 'Koble til tilbud…', onClick: () => setKobleFor(p) },
              p.tilbudsfelterFørKobling
                && { ikon: '✂', label: 'Fjern tilbuds-kobling', onClick: () => fjernKobling(p) },
              { skille: true },
              ...['jobber_med', 'godkjent', 'aktiv'].filter(s => normStatus(p.status) !== s).map(s => ({
                ikon: '→', label: SAVE_LABELS[s], onClick: () => settProsjektStatus(p, s),
              })),
              normStatus(p.status) !== 'fullfort' && { ikon: '🏁', label: 'Fullfør', onClick: () => settProsjektStatus(p, 'fullfort') },
              { skille: true },
              { ikon: '🗄', label: 'Arkiver', farlig: true, onClick: () => arkiverProsjekt(p) },
            ]}
            onClick={() => aapnePanel(p)}
          />
          {forlengFristId === p.id && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 14px', margin: '-4px 0 8px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: '#92400e' }}>Ny sluttdato:</span>
              <input type="date" className="input" style={{ width: 160, height: 32 }} value={forlengDato} onChange={e => setForlengDato(e.target.value)} />
              <button className="btn btn-sm btn-primary" onClick={() => lagreForlengFrist(p)}>Lagre</button>
              <button className="btn btn-sm" onClick={() => setForlengFristId(null)}>Avbryt</button>
              {(p.fristUtvidelser || []).length > 0 && (
                <span style={{ fontSize: 11, color: '#92400e' }}>Forlenget {(p.fristUtvidelser || []).length} gang(er) før</span>
              )}
            </div>
          )}
          </div>
        );
      })}

      {/* ── Detaljpanel (PR2): skyver inn fra høyre ved rad-klikk ── */}
      {valgtProsjekt && (() => {
        const p = valgtProsjekt;
        const tild = tildelingerByProsjekt[p.id] || [];
        const panelTittel = p.adresse || p.navn || 'Uten navn';
        return (
          <DetaljPanel
            tittel={panelTittel}
            undertittel={[p.kunde?.navn && `👤 ${p.kunde.navn}`, p.kunde?.telefon && `📱 ${p.kunde.telefon}`, formaterBelop(p.belop)].filter(Boolean).join(' · ')}
            faner={[
              { key: 'framdrift', label: '📊 Framdrift' },
              { key: 'bemanning', label: '👷 Bemanning' },
              { key: 'ks', label: '✅ KS' },
              { key: 'tilbud', label: '📦 Tilbudsdata' },
              { key: 'logg', label: '📜 Logg' },
            ]}
            aktivFane={panelFane}
            onFane={f => { setPanelFane(f); if (f === 'logg' && loggEntries === null) hentLogg(p); }}
            onLukk={() => setValgtId(null)}
            handlinger={<>
              <select
                className="input" style={{ height: 34, fontSize: 13, width: 160 }}
                value={normStatus(p.status)}
                onChange={e => settProsjektStatus(p, e.target.value)}
              >
                {Object.entries(SAVE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className="btn btn-sm" onClick={() => { setValgtId(null); openEdit(p); }}>✏️ Rediger</button>
              {normStatus(p.status) !== 'fullfort' && (
                <button className="btn btn-sm" onClick={() => settProsjektStatus(p, 'fullfort')}>🏁 Fullfør</button>
              )}
              <button className="btn btn-sm" style={{ color: '#b45309' }} onClick={() => { setValgtId(null); arkiverProsjekt(p); }}>🗄 Arkiver</button>
            </>}
          >
            {panelFane === 'framdrift' && (
              <ProsjektFramdrift project={p} laster={fdLaster} feil={fdFeil}
                onGenerer={() => genererFramdrift(p.id)}
                onAktiver={() => aktiverUtkast(p)}
                onForkast={() => forkastUtkast(p)}
                onOppdaterUtkast={u => dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...p, framdriftsplanUtkast: u } })}
              />
            )}
            {panelFane === 'bemanning' && (
              <div>
                <KalkyleVsBemanningSeksjon prosjekt={p} tildelinger={state.tildelinger} ansatteById={ansatteById} />
                {tild.length === 0 && <div style={{ color: '#5d6b80', fontSize: 13, marginBottom: 12 }}>Ingen tildelinger på prosjektet.</div>}
                {tild.map(t => {
                  const a = ansatteById[t.ansattId];
                  return (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                      <span style={{ fontWeight: 500 }}>{a?.navn || 'Ukjent'}</span>
                      <span style={{ color: '#5d6b80' }}>{t.startDato ? formatDate(t.startDato) : '?'} – {t.sluttDato ? formatDate(t.sluttDato) : '?'}</span>
                    </div>
                  );
                })}
                {onNavigate && (
                  <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => onNavigate('bemanningsplan')}>👷 + Bemann i bemanningsplanen</button>
                )}
              </div>
            )}
            {panelFane === 'ks' && (
              <div>
                <PanelKSForslag prosjekt={p} onOppdater={np => dispatch({ type: 'UPDATE_PROSJEKT', payload: np })} />
                {!(p.ksSjekklister || []).length && <div style={{ color: '#5d6b80', fontSize: 13 }}>Ingen KS-sjekklister tildelt. Gå til KS / HMS-fanen for å legge til.</div>}
                {(p.ksSjekklister || []).map((ks, i) => (
                  <div key={ks.id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <span>{ks.ikon || '✅'} {ks.navn || ks.malNavn || 'Sjekkliste'}</span>
                    <span style={{ color: '#5d6b80' }}>{ks.status || 'ikke startet'}</span>
                  </div>
                ))}
              </div>
            )}
            {panelFane === 'tilbud' && (
              (p.tilbudPayload || p.tilbudLink || p.kildeTilbudData || (Array.isArray(p.poster) && p.poster.length > 0))
                ? <TilbudsdataVisning prosjekt={p} />
                : (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: '#5d6b80', fontSize: 13 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
                    <div style={{ marginBottom: 14 }}>Dette prosjektet har ingen tilbudsdata — det er trolig regnet manuelt.</div>
                    <button className="btn btn-primary" onClick={() => { setValgtId(null); setKobleFor(p); }}>
                      🔗 Koble til tilbud
                    </button>
                  </div>
                )
            )}
            {panelFane === 'logg' && (
              <div style={{ fontSize: 12.5 }}>
                {loggEntries === null && <div style={{ color: '#5d6b80' }}>⏳ Henter logg…</div>}
                {Array.isArray(loggEntries) && loggEntries.length === 0 && <div style={{ color: '#5d6b80' }}>Ingen logg-innslag funnet for dette prosjektet.</div>}
                {(loggEntries || []).map((e, i) => (
                  <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontWeight: 500 }}>{e.felt}: {String(e.fraVerdi ?? '–')} → {String(e.tilVerdi ?? '–')}</div>
                    <div style={{ color: '#5d6b80', fontSize: 11 }}>{e.endretAv || '?'} · {e.tidspunkt ? new Date(e.tidspunkt).toLocaleString('nb-NO') : ''} · {e.kilde || ''}</div>
                  </div>
                ))}
              </div>
            )}
          </DetaljPanel>
        );
      })()}

      {/* Modal */}
      {showModal && (
        <Modal title={editing ? 'Rediger prosjekt' : 'Nytt prosjekt'} onClose={() => setShowModal(false)}>
          <div className="form">
            <label>Prosjektnavn *</label>
            <input value={form.navn} onChange={e => setForm(f => ({ ...f, navn: e.target.value }))} placeholder="Prosjektnavn" />
            <label>Adresse</label>
            <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="Adresse" />
            <label>Kundenavn</label>
            <input value={form.kundeNavn} onChange={e => setForm(f => ({ ...f, kundeNavn: e.target.value }))} placeholder="For- og etternavn" />
            <div className="form-row">
              <div>
                <label>Telefon</label>
                <input type="tel" value={form.kundeTlf} onChange={e => setForm(f => ({ ...f, kundeTlf: e.target.value }))} placeholder="99 99 99 99" />
              </div>
              <div>
                <label>E-post</label>
                <input type="email" value={form.kundeEpost} onChange={e => setForm(f => ({ ...f, kundeEpost: e.target.value }))} placeholder="kunde@eksempel.no" />
              </div>
            </div>
            <label>Type jobb</label>
            <select value={form.jobbType || ''} onChange={e => setForm(f => ({ ...f, jobbType: e.target.value }))}>
              <option value="">– Velg type –</option>
              {JOBB_TYPER.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
            <label>Prosjektleder</label>
            <select value={form.prosjektlederId || ''} onChange={e => setForm(f => ({ ...f, prosjektlederId: e.target.value }))}>
              <option value="">– Ingen valgt –</option>
              {[...state.ansatte]
                .sort((a, b) => a.navn.localeCompare(b.navn, 'nb'))
                .map(a => (
                  <option key={a.id} value={a.id}>{a.navn}{a.fag ? ` (${a.fag})` : ''}</option>
                ))}
            </select>
            <label>Status</label>
            <select value={normStatus(form.status)} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {SAVE_STATUSES.map(s => (
                <option key={s} value={s}>{SAVE_LABELS[s]}</option>
              ))}
            </select>
            <div className="form-row">
              <div>
                <label>Startdato</label>
                <input type="date" value={form.startDato} onChange={e => setForm(f => ({ ...f, startDato: e.target.value }))} />
              </div>
              <div>
                <label>Sluttdato</label>
                <input type="date" value={form.sluttDato} onChange={e => setForm(f => ({ ...f, sluttDato: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label>Kontraktssum (NOK)</label>
                <input type="number" min="0" step="1000" value={form.belop} onChange={e => setForm(f => ({ ...f, belop: e.target.value }))} placeholder="f.eks. 850000" />
              </div>
              <div>
                <label>Manskap (antall)</label>
                <input type="number" min="1" max="50" value={form.manskapAntall} onChange={e => setForm(f => ({ ...f, manskapAntall: e.target.value }))} placeholder="f.eks. 4" />
              </div>
            </div>
            <label>Prosjektfarge</label>
            <div className="farge-picker">
              {PROSJEKT_PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`farge-swatch ${form.farge === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setForm(f => ({ ...f, farge: c }))}
                  title={c}
                />
              ))}
            </div>
            <label>Beskrivelse</label>
            <textarea value={form.beskrivelse} onChange={e => setForm(f => ({ ...f, beskrivelse: e.target.value }))} rows={2} placeholder="Valgfri beskrivelse" />
            <div className="form-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Avbryt</button>
              {editing && normStatus(form.status) !== 'fullfort' && (
                <button className="btn btn-success" onClick={() => {
                  setForm(f => ({ ...f, status: 'fullfort' }));
                  dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...form, id: editing.id, status: 'fullfort' } });
                  setShowModal(false);
                }}>🏁 Prosjekt ferdig</button>
              )}
              <button className="btn btn-primary" onClick={handleSave}>Lagre</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Koble til tilbud-dialog (SPEC-del2 trinn 2) ── */}
      {kobleFor && (
        <KobleDialog
          prosjekt={kobleFor}
          befaringer={state.befaringer || []}
          onUtfør={valg => utførKobling(kobleFor.id, valg)}
          onLukk={() => setKobleFor(null)}
        />
      )}

      {/* ── Slå sammen-modal (SPEC-merge-prosjekter) ── */}
      {mergeFor && (
        <MergeModal
          startProsjekt={mergeFor.prosjekt}
          forslagId={mergeFor.forslagId}
          alleProsjekter={state.prosjekter}
          tildelingerByProsjekt={tildelingerByProsjekt}
          onUtfør={utførMerge}
          onLukk={() => setMergeFor(null)}
        />
      )}

      {/* ── Toast med angre-lenke (30 sek) etter merge ── */}
      {mergeToast && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 500,
          background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderLeft: '3px solid var(--success)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-panel)',
          padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', maxWidth: '90vw',
        }}>
          <span style={{ fontSize: 13 }}>{mergeToast.tekst}</span>
          <button className="btn btn-sm" onClick={() => angreMerge(mergeToast.hovedId, mergeToast.sekundarId)}>↩ Angre</button>
          <button className="btn-icon" onClick={() => setMergeToast(null)} title="Lukk">✕</button>
        </div>
      )}
    </div>
  );
}
