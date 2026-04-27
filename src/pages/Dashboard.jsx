import React from 'react';
import { useApp } from '../context/AppContext';
import { dateToIso, addDays, weekStart, overlaps } from '../store';

const FAG_COLORS = {
  'Bas Tømrer': '#f59e0b', 'Montør': '#3b82f6', 'Lærling Tømrer': '#16a34a',
  'Maler': '#ec4899', 'Rørlegger': '#06b6d4', 'Tømrer': '#8b5cf6',
  'Flislegger': '#f97316', 'Prosjektleder': '#0ea5e9',
};
function fagColor(fag) { return FAG_COLORS[fag] || '#6b7280'; }

const REKL_STATUS = {
  ny:           { label: 'Ny',             farge: '#3b82f6', bg: '#eff6ff', ikon: '🔵' },
  under_arbeid: { label: 'Under utbedring', farge: '#f59e0b', bg: '#fffbeb', ikon: '🔨' },
  utbedret:     { label: 'Utbedret',        farge: '#16a34a', bg: '#f0fdf4', ikon: '✅' },
  avvist:       { label: 'Avvist',          farge: '#dc2626', bg: '#fef2f2', ikon: '🚫' },
  lukket:       { label: 'Lukket',          farge: '#6b7280', bg: '#f9fafb', ikon: '🔒' },
};

const BEF_STATUS = {
  planlagt:      { label: 'Planlagt',          farge: '#3b82f6', ikon: '📋' },
  tilbud_arbeid: { label: 'Tilbud under arbeid', farge: '#f59e0b', ikon: '✏️' },
  tilbud_sendt:  { label: 'Tilbud sendt',       farge: '#8b5cf6', ikon: '📤' },
  godkjent:      { label: 'Godkjent',           farge: '#16a34a', ikon: '✅' },
  tapt:          { label: 'Tapt',               farge: '#6b7280', ikon: '❌' },
};

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
  const { state } = useApp();
  const today = dateToIso(new Date());
  const todayDate = new Date(today + 'T00:00:00');
  const ukeStartI = weekStart(today);
  const ukeSluttI = addDays(ukeStartI, 6);

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
  const ledigeIdag = state.ansatte.filter(a => !opptattIds.has(a.id));

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

  const ukedagNavn = UKEDAGER[todayDate.getDay()];

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
          <div className="dash-stat-tall">{state.ansatte.length}</div>
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
        <div className="dash-stat-kort dash-stat-kort--rekl" style={{ borderTop: aktiveRekl > 0 ? '4px solid #f59e0b' : undefined }}>
          <div className="dash-stat-tall" style={{ color: aktiveRekl > 0 ? '#f59e0b' : undefined }}>{aktiveRekl}</div>
          <div className="dash-stat-label">Aktive reklamasjoner</div>
          <div className="dash-stat-sub">{reklamasjonerUtenFrist > 0 ? `${reklamasjonerUtenFrist} uten frist` : 'Alle har frist'}</div>
        </div>
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
                  <span className="dash-proj-navn" style={{ color: '#f59e0b' }}>Ferie / Fri</span>
                  <span className="dash-proj-antall">{ferieIdag.length} person{ferieIdag.length !== 1 ? 'er' : ''}</span>
                </div>
                <div className="dash-avatar-rad">
                  {ferieIdag.map(a => (
                    <div key={a.id} className="dash-avatar-wrap" title={a.navn}>
                      <div className="mini-avatar" style={{ background: '#f59e0b', width: 30, height: 30, fontSize: 10 }}>
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
                  <span className="dash-proj-navn" style={{ color: '#16a34a' }}>Ledig / ikke tildelt</span>
                  <span className="dash-proj-antall">{ledigeIdag.length} person{ledigeIdag.length !== 1 ? 'er' : ''}</span>
                </div>
                <div className="dash-avatar-rad">
                  {ledigeIdag.slice(0, 12).map(a => (
                    <div key={a.id} className="dash-avatar-wrap" title={`${a.navn} (${a.fag})`}>
                      <div className="mini-avatar" style={{ background: '#94a3b8', width: 30, height: 30, fontSize: 10 }}>
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
                  <div className="dash-bef-dato" style={{ color: erIdag ? '#2563eb' : '#64748b' }}>
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

          {/* Tilbudsfrister */}
          {tilbudFrister.length > 0 && (
            <div className="dash-seksjon">
              <div className="dash-seksjon-header">
                <span>✏️ Tilbudsfrister</span>
                <span className="dash-seksjon-teller">{tilbudFrister.length}</span>
              </div>
              {tilbudFrister.map(b => {
                const farge = b.dager < 0 ? '#dc2626' : b.dager <= 3 ? '#f59e0b' : '#16a34a';
                return (
                  <div key={b.id} className="dash-frist-rad">
                    <div className="dash-frist-info">
                      <div className="dash-frist-navn">{b.kontaktNavn || b.adresse}</div>
                      <div className="dash-frist-adresse">{b.adresse}</div>
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
              <span className="dash-seksjon-teller" style={{ color: aktiveRekl > 0 ? '#f59e0b' : undefined }}>{aktiveRekl}</span>
            </div>
            {aktiveRekl === 0 && <div className="dash-tom">Ingen aktive reklamasjoner. 🎉</div>}
            {reklamasjonerFrist.map(r => {
              const s = REKL_STATUS[r.status] || REKL_STATUS.ny;
              const farge = r.dager < 0 ? '#dc2626' : r.dager <= 5 ? '#f59e0b' : '#16a34a';
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
