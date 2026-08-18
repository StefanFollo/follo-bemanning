import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { dateToIso, addDays, weekStart, overlaps, PROSJEKT_PALETTE, uid } from '../store';
import { BEF_STATUS } from '../statuses';
import {
  Phone, Mail, Copy, CalendarDays, Building2, ClipboardList, Sparkles, Send, Eye,
  MessageSquare, CircleCheck, Link2, Clock, PhoneCall, Rocket, FileText, CircleX,
  TriangleAlert, Archive, Undo2, Wrench, X, Loader, Trash2, Check, ScrollText,
  Package, MapPin, Hammer, RotateCw,
} from 'lucide-react';
import { Ikon } from '../komponenter/Ikon';
import TilbudsdataVisning from '../komponenter/Tilbudsdata';
import { StatusFaner } from '../komponenter/Designsystem';
import {
  klassifiserKoblinger, forslagForSpokelse, beregnKobleTilbud, beregnStatusFix,
  beregnAngreSak, hentReparasjonHistorikk, leggTilReparasjonHistorikk, mapSalgsStatus,
  rangerKandidater,
} from '../reparasjonKoblinger';

// ═══ Fase 3: «Reparer koblinger»-wizard (admin) ═══
// Én sak om gangen, alt reversibelt, ingen bulk/auto/sletting.
function ReparerKoblinger({ state, dispatch, onLukk }) {
  const [rapport, setRapport] = React.useState(null);
  const [lasteFeil, setLasteFeil] = React.useState('');
  const [sakIdx, setSakIdx] = React.useState(0);
  const [velgAnnen, setVelgAnnen] = React.useState(false);
  const [sok, setSok] = React.useState('');
  const [overstyrVern, setOverstyrVern] = React.useState(false);
  const [okt, setOkt] = React.useState([]); // avgjorte saker i denne økten (for angre)
  const tellingRef = React.useRef(state.befaringer.length);

  React.useEffect(() => {
    const token = localStorage.getItem('fbs_token') || '';
    fetch('/api/befaringer/koblinger', { headers: { Authorization: 'Bearer ' + token } })
      .then(r2 => r2.json())
      .then(d => setRapport(d))
      .catch(e => setLasteFeil(String(e.message || e)));
  }, []);

  function auditLogg(objektId, felt, fraVerdi, tilVerdi, begrunnelse) {
    const token = localStorage.getItem('fbs_token') || '';
    fetch('/api/befaringer/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ objektId, felt, fraVerdi, tilVerdi, kilde: 'reparert-av-stefan', begrunnelse }),
    }).catch(() => {});
  }
  function postLosning(losning) {
    const token = localStorage.getItem('fbs_token') || '';
    fetch('/api/befaringer/koblinger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ losning }),
    }).catch(() => {});
    // Speil løsningen i lokal rapport-state så saken forsvinner fra køen
    // umiddelbart (serveren er fasit ved neste åpning).
    setRapport(rap => {
      if (!rap) return rap;
      const losninger = { ...(rap.losninger || {}) };
      if (losning.angret) delete losninger[String(losning.tilbudId)];
      else losninger[String(losning.tilbudId)] = { ...losning, dato: new Date().toISOString() };
      return { ...rap, losninger };
    });
  }

  if (lasteFeil) return <div className="modal-backdrop" onClick={onLukk}><div className="modal" onClick={e => e.stopPropagation()}><div style={{ padding: 20 }}>Kunne ikke hente koblingsrapporten: {lasteFeil}</div></div></div>;
  if (!rapport) return <div className="modal-backdrop"><div className="modal"><div style={{ padding: 20 }}>Henter koblingsrapport…</div></div></div>;

  const losninger = rapport.losninger || {};
  const { friske, spokelser, mismatch } = klassifiserKoblinger(rapport.koblinger, state.befaringer);
  const saker = [...spokelser, ...mismatch].filter(k => !losninger[String(k.tilbudId)]);
  const sak = saker[Math.min(sakIdx, Math.max(0, saker.length - 1))] || null;
  const tellingOk = state.befaringer.length >= tellingRef.current; // aldri færre enn ved start

  function ferdigMedSak(historikkInnslag) {
    leggTilReparasjonHistorikk(historikkInnslag);
    setOkt(o => [...o, historikkInnslag]);
    setVelgAnnen(false); setSok(''); setOverstyrVern(false);
  }

  function kobleTil(befaring) {
    const { nyBefaring, før } = beregnKobleTilbud(befaring, sak);
    dispatch({ type: 'UPDATE_BEFARING', payload: nyBefaring });
    postLosning({ tilbudId: sak.tilbudId, nyKildeBefaringId: befaring.id });
    auditLogg(befaring.id, 'tilbudId', før.tilbudId ?? null, String(sak.tilbudId),
      'Fase 3: spøkelse-kobling reparert — tilbudet koblet til denne befaringen');
    ferdigMedSak({ dato: new Date().toISOString(), handling: 'koblet', tilbudId: sak.tilbudId, befaringId: befaring.id, før, sakType: 'spokelse' });
  }

  function opprettNy() {
    const nyId = uid();
    dispatch({ type: 'ADD_BEFARING', payload: {
      id: nyId,
      kontaktNavn: sak.kundenavn || 'Ukjent kunde',
      adresse: sak.adresse || '',
      status: mapSalgsStatus(sak.salgsStatus) || 'planlagt',
      dato: new Date().toISOString().slice(0, 10),
      tid: '',
      notat: 'Opprettet av Reparer koblinger (fase 3) for tilbud ' + sak.tilbudId,
      kommentar: '',
      prosjektlederId: '', ansvarligBefaringId: '',
      tilbudId: sak.tilbudId,
      ...(sak.tilbudLink ? { tilbudLink: sak.tilbudLink } : {}),
      ...(sak.tilbudPayload ? { tilbudPayload: { ...sak.tilbudPayload, _mottattType: 'reparasjon', _mottattDato: new Date().toISOString() } } : {}),
    }});
    postLosning({ tilbudId: sak.tilbudId, nyKildeBefaringId: nyId });
    auditLogg(nyId, 'status', null, mapSalgsStatus(sak.salgsStatus) || 'planlagt',
      'Fase 3: ny befaring opprettet for tilbud uten gyldig kobling');
    ferdigMedSak({ dato: new Date().toISOString(), handling: 'opprettet', tilbudId: sak.tilbudId, befaringId: nyId, før: null, sakType: 'spokelse' });
  }

  function bytStatus(befaring) {
    const { nyBefaring, før } = beregnStatusFix(befaring, sak);
    dispatch({ type: 'UPDATE_BEFARING', payload: { ...nyBefaring, manueltOverstyrtAv: undefined, manueltOverstyrtDato: undefined } });
    postLosning({ tilbudId: sak.tilbudId, status: sak.forventetStatus });
    auditLogg(befaring.id, 'status', før.status, sak.forventetStatus,
      'Fase 3: status-mismatch reparert — tilbudets status brukt');
    ferdigMedSak({ dato: new Date().toISOString(), handling: 'status-fikset', tilbudId: sak.tilbudId, befaringId: befaring.id, før, sakType: 'mismatch' });
  }

  function beholdBefaringens(befaring) {
    postLosning({ tilbudId: sak.tilbudId, behold: 'befaring', status: befaring.status });
    auditLogg(befaring.id, 'status', befaring.status, befaring.status,
      'Fase 3: mismatch avgjort — befaringens status beholdt (tilbuds-appen kan synke sin vei)');
    ferdigMedSak({ dato: new Date().toISOString(), handling: 'beholdt', tilbudId: sak.tilbudId, befaringId: befaring.id, før: null, sakType: 'mismatch' });
  }

  function angreSak(innslag) {
    const befaring = state.befaringer.find(b => b.id === innslag.befaringId);
    if (befaring && innslag.før) {
      const { nyBefaring } = beregnAngreSak(befaring, innslag);
      dispatch({ type: 'UPDATE_BEFARING', payload: nyBefaring });
    }
    postLosning({ tilbudId: innslag.tilbudId, angret: true });
    auditLogg(innslag.befaringId, 'reparasjon', innslag.handling, 'angret', 'Fase 3: sak angret');
    setOkt(o => o.filter(x => x !== innslag));
    leggTilReparasjonHistorikk({ ...innslag, angret: true, angretDato: new Date().toISOString() });
  }

  const forslag = sak && sak.type === 'spokelse' ? forslagForSpokelse(sak, state.befaringer) : null;
  const mismatchBef = sak && sak.type === 'mismatch' ? state.befaringer.find(b => b.id === sak.befaringId) : null;
  const sokLav = sok.toLowerCase();
  // Alle ikke-arkiverte befaringer, alle statuser, beste fuzzy-kandidat øverst.
  const kandidatListe = (velgAnnen && sak)
    ? rangerKandidater(sak, state.befaringer).filter(({ befaring: b }) =>
        !sok || (b.adresse || '').toLowerCase().includes(sokLav) || (b.kontaktNavn || '').toLowerCase().includes(sokLav))
    : [];

  return (
    <div className="modal-backdrop" onClick={onLukk}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h3>Reparer koblinger (fase 3)</h3>
          <button className="btn-icon" onClick={onLukk}><Ikon ikon={X} size={15} /></button>
        </div>
        <div style={{ padding: '0 4px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '68vh', overflowY: 'auto' }}>
          <div style={{ color: '#5d6b80' }}>
            Rapport fra tilbuds-appen{rapport.mottattDato ? ' (' + new Date(rapport.mottattDato).toLocaleString('nb-NO') + ')' : ''}:
            {' '}{friske.length} friske · {spokelser.length} spøkelser · {mismatch.length} status-mismatch · {Object.keys(losninger).length} avgjort
            {!tellingOk && <div style={{ color: 'var(--danger)', fontWeight: 500 }}>Advarsel: antall befaringer har sunket — stopp og sjekk!</div>}
          </div>

          {(rapport.koblinger || []).length === 0 && (
            <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 8, padding: 12, color: 'var(--warning)' }}>
              Ingen rapport mottatt ennå. Be tilbuds-appen sende koblingslista
              (knapp der — API-et er klart til å ta imot).
            </div>
          )}

          {saker.length === 0 && (rapport.koblinger || []).length > 0 && (
            <div style={{ color: 'var(--success)', fontWeight: 500 }}>Alle saker er avgjort. Godt jobbet!</div>
          )}

          {sak && (
            <div style={{ border: '1px solid var(--border)', borderLeft: '3px solid ' + (sak.type === 'spokelse' ? 'var(--danger)' : 'var(--warning)'), borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>
                Sak {saker.indexOf(sak) + 1} av {saker.length}: {sak.type === 'spokelse' ? 'Spøkelse-kobling' : 'Status-mismatch'}
              </div>
              <div style={{ color: '#5d6b80', marginBottom: 8 }}>
                Tilbud {sak.tilbudId}{sak.kundenavn ? ' · ' + sak.kundenavn : ''}{sak.adresse ? ' · ' + sak.adresse : ''} · salgsstatus «{sak.salgsStatus}»
              </div>

              {sak.type === 'spokelse' && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    Peker på befaring <code>{sak.kildeBefaringId || '(mangler)'}</code> — som ikke finnes.
                  </div>
                  {forslag && !velgAnnen && (
                    <div style={{ background: 'var(--accent-subtle)', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                      Forslag: <b>{forslag.befaring.adresse || forslag.befaring.kontaktNavn}</b>
                      {forslag.befaring.kontaktNavn ? ' · ' + forslag.befaring.kontaktNavn : ''} (status {forslag.befaring.status})
                    </div>
                  )}
                  {!forslag && !velgAnnen && <div style={{ color: '#5d6b80', marginBottom: 8 }}>Ingen god fuzzy-match blant befaringene.</div>}
                  {velgAnnen && (
                    <div style={{ marginBottom: 8 }}>
                      <input className="input" placeholder="Søk befaring…" value={sok} onChange={e => setSok(e.target.value)} style={{ width: '100%', marginBottom: 6 }} />
                      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {kandidatListe.map(({ befaring: b, score }) => {
                          const st = BEF_STATUS[b.status] || BEF_STATUS.planlagt;
                          return (
                            <button key={b.id} className="btn" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => kobleTil(b)}>
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {b.adresse || b.kontaktNavn}{b.kontaktNavn ? ' · ' + b.kontaktNavn : ''}
                              </span>
                              {score > 0 && <span title="Fuzzy-treff på adresse/kundenavn" style={{ display: 'inline-flex' }}><Ikon ikon={Sparkles} size={13} farge="var(--header-accent)" /></span>}
                              <span style={{ fontSize: 11, fontWeight: 500, color: st.farge, background: st.bg, borderRadius: 10, padding: '1px 8px', whiteSpace: 'nowrap' }}>{st.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {forslag && !velgAnnen && <button className="btn btn-primary" onClick={() => kobleTil(forslag.befaring)}>Godkjenn forslag</button>}
                    <button className="btn" onClick={() => setVelgAnnen(v => !v)}>{velgAnnen ? 'Skjul liste' : 'Velg annen…'}</button>
                    <button className="btn" onClick={opprettNy}>Opprett ny befaring</button>
                    <button className="btn" onClick={() => setSakIdx(i => i + 1)}>Hopp over</button>
                  </div>
                </>
              )}

              {sak.type === 'mismatch' && mismatchBef && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    Befaringen «{mismatchBef.adresse || mismatchBef.kontaktNavn}» står i
                    {' '}<b>{sak.befaringStatus}</b>, tilbudet sier <b>{sak.forventetStatus}</b>
                    {' '}(flytting {sak.befaringStatus} → {sak.forventetStatus}).
                  </div>
                  {mismatchBef.manueltOverstyrtAv && (
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 6, padding: 8, marginBottom: 8, cursor: 'pointer', color: 'var(--warning)' }}>
                      <input type="checkbox" checked={overstyrVern} onChange={e => setOverstyrVern(e.target.checked)} />
                      Denne er MANUELT overstyrt ({mismatchBef.manueltOverstyrtAv}
                      {mismatchBef.manueltOverstyrtDato ? ', ' + new Date(mismatchBef.manueltOverstyrtDato).toLocaleDateString('nb-NO') : ''}) —
                      kryss av for å bekrefte at tilbudets status likevel skal brukes
                    </label>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" disabled={!!mismatchBef.manueltOverstyrtAv && !overstyrVern}
                      onClick={() => bytStatus(mismatchBef)}>Bruk tilbudets status</button>
                    <button className="btn" onClick={() => beholdBefaringens(mismatchBef)}>Behold befaringens</button>
                    <button className="btn" onClick={() => setSakIdx(i => i + 1)}>Hopp over</button>
                  </div>
                </>
              )}
            </div>
          )}

          {okt.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Avgjort i denne økten (kan angres):</div>
              {okt.map((innslag, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', color: '#5d6b80' }}>
                  <span>Tilbud {innslag.tilbudId}: {innslag.handling}</span>
                  <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => angreSak(innslag)}>Angre</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Tomtilstand for Tilbudsdata i rediger-modalen — stille resynk ved åpning
// (payload kan ha landet på serveren via re-send etter forrige poll) + manuell knapp.
function BefTilbudTomtilstand({ friskOpp }) {
  const [sjekker, setSjekker] = React.useState(false);
  React.useEffect(() => { Promise.resolve(friskOpp()).catch(() => {}); }, [friskOpp]);
  async function sjekk() {
    setSjekker(true);
    try { await friskOpp(); } catch { /* stille */ }
    setSjekker(false);
  }
  return (
    <div style={{ fontSize: 12.5, color: '#5d6b80' }}>
      <Ikon ikon={Send} size={13} /> Ingen tilbudsdata mottatt for denne befaringen ennå.
      Be om data fra tilbuds-appen: åpne tilbudet der og velg «Send data på nytt»,
      så fylles denne fanen. (Ingen automatikk — status og kolonne røres aldri.)
      <div style={{ marginTop: 8 }}>
        <button className="btn btn-sm" onClick={sjekk} disabled={sjekker}
          title="Henter siste data fra skyen" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Ikon ikon={RotateCw} size={13} style={sjekker ? { animation: 'spin 1.2s linear infinite' } : undefined} /> Sjekk på nytt
        </button>
      </div>
    </div>
  );
}

const JOBB_TYPER = ['Ny bygg', 'Tilbygg', 'Tak jobb', 'Fasade jobb', 'Bad', 'Tømrer', 'Maling', 'Rørlegger', 'Flislegging', 'Elektro', 'Rehabilitering', 'Annet'];

function fmtKr(n) { return Math.round(n).toLocaleString('nb-NO') + ' kr'; }

function byggTimer(poster) {
  const timer = {};
  for (const post of (poster || [])) {
    if (Array.isArray(post.kalkyle?.timer)) {
      for (const rad of post.kalkyle.timer) {
        const fag = (rad.fag || 'annet').toLowerCase();
        timer[fag] = (timer[fag] || 0) + (parseFloat(rad.antall) || 0);
      }
    }
  }
  return timer;
}

const STATUS = BEF_STATUS;

const PL_FARGER = ['#2563eb','#15803d','#9333ea','#ea580c','#0891b2','#be185d','#854d0e','#0f766e','#b45309','#1d4ed8'];
const MAANED_NAVN = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];
const DAG_NAVN_KORT = ['Man','Tir','Ons','Tor','Fre','Lør','Søn'];

function monthStart(iso) { return iso.slice(0, 7) + '-01'; }
function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return dateToIso(d).slice(0, 7) + '-01';
}
function daysInMonth(iso) {
  const d = new Date(iso + 'T00:00:00');
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function monthLabel(iso) {
  const m = parseInt(iso.slice(5, 7), 10) - 1;
  return MAANED_NAVN[m] + ' ' + iso.slice(0, 4);
}
function dayOfWeek(iso) {
  return (new Date(iso + 'T00:00:00').getDay() + 6) % 7;
}
function datoKort(iso) {
  if (!iso) return '';
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' });
}
function dagerTil(iso) {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return Math.round((d - new Date()) / 86400000);
}

function tomModal() {
  return {
    kontaktNavn: '',
    telefon: '',
    epost: '',
    adresse: '',
    jobbType: 'Ny bygg',
    dato: dateToIso(new Date()),
    tid: '09:00',
    status: 'planlagt',
    notat: '',
    kommentar: '',
    prosjektlederId: '',
    ansvarligBefaringId: '',
    estimertBelop: '',
    tilbudFrist: '',
    nesteKontakt: '',
    oensketOppstart: '',
    resultat: '',
    tapArsak: '',
  };
}

export default function BefaringPlan() {
  const { state, dispatch, friskOpp } = useApp();
  const befaringer = useMemo(() => state.befaringer || [], [state.befaringer]);
  const today = dateToIso(new Date());

  const isAdmin = localStorage.getItem('fbs_role') === 'admin';
  const [visModal, setVisModal] = useState(false);
  const [redigerer, setRedigerer] = useState(null);
  const [dedupPanel, setDedupPanel] = useState(null); // null | {loading} | {dry, plan, ...}
  const [visReparer, setVisReparer] = useState(false); // fase 3-verktøyet
  const [form, setForm] = useState(tomModal());
  const [autoSaveSts, setAutoSaveSts] = useState(null); // null | 'saving' | 'saved'
  const [modalFane, setModalFane] = useState('detaljer'); // 'detaljer' | 'aktivitet'
  const [aktivitetLog, setAktivitetLog] = useState([]);
  const [aktivitetLaster, setAktivitetLaster] = useState(false);
  const [konfliktBef, setKonfliktBef] = useState(null); // befaring med .konflikt som venter på beslutning
  const autoSaveRef  = useRef(null);
  const isFirstRender = useRef(true);

  // Auto-save når man redigerer eksisterende befaring
  useEffect(() => {
    if (!redigerer || !visModal) return;
    // Hopp over første render (modal nettopp åpnet)
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!form.kontaktNavn.trim() || !form.adresse.trim()) return;
    setAutoSaveSts('saving');
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...form, id: redigerer.id } });
      setAutoSaveSts('saved');
      autoSaveRef.current = setTimeout(() => setAutoSaveSts(null), 2200);
    }, 700);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps
  const [visArkiv, setVisArkiv] = useState(false);
  const [visKapasitet, setVisKapasitet] = useState(null);
  const [visProsjektModal, setVisProsjektModal] = useState(false);
  const [prosjektForm, setProsjektForm] = useState({ navn: '', startDato: '', sluttDato: '', farge: '#6b8fc4', lagTildeling: true });
  const [kalMaaned, setKalMaaned] = useState(() => monthStart(today));
  const [viewTab, setViewTab] = useState('oversikt'); // 'oversikt' | 'kalender'
  const [sok, setSok] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState(null);
  const [ansvarligFilter, setAnsvarligFilter] = useState('');
  const [sortering, setSortering] = useState(() => localStorage.getItem('fbs_bef_sort') || 'adresse');

  function ansattFarge(ansattId) {
    if (!ansattId) return null;
    const idx = state.ansatte.findIndex(a => a.id === ansattId);
    return PL_FARGER[idx >= 0 ? idx % PL_FARGER.length : 0];
  }

  // ---- Kapasitet ----
  function kapasitetPerUke() {
    const totalAnsatte = state.ansatte.length;
    return Array.from({ length: 16 }, (_, w) => {
      const ukeStart = addDays(weekStart(today), w * 7);
      const ukeSlut = addDays(ukeStart, 4);
      const opptatt = new Set(
        state.tildelinger
          .filter(t => t.prosjektId !== '__FERIE__' && overlaps(t.startDato, t.sluttDato, ukeStart, ukeSlut))
          .map(t => t.ansattId)
      );
      return { ukeStart, ukeSlut, ledige: totalAnsatte - opptatt.size, totalt: totalAnsatte };
    });
  }

  // ---- Kalender ----
  function kalenderDager() {
    const firstDay = dayOfWeek(kalMaaned);
    const antDager = daysInMonth(kalMaaned);
    const dager = [];
    for (let i = 0; i < firstDay; i++) dager.push(null);
    for (let d = 1; d <= antDager; d++) {
      dager.push(kalMaaned.slice(0, 7) + '-' + String(d).padStart(2, '0'));
    }
    while (dager.length % 7 !== 0) dager.push(null);
    return dager;
  }

  // ---- Admin: dedup befaringer ----
  async function kjorDedup(dry) {
    setDedupPanel({ loading: true });
    try {
      const token = localStorage.getItem('fbs_token') || '';
      const r = await fetch('/api/admin/dedup-befaringer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dry }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setDedupPanel({ ...data, loading: false });
    } catch (e) {
      setDedupPanel({ error: e.message, loading: false });
    }
  }

  // ---- CRUD ----
  function apneNy(presetStatus, presetDato) {
    setForm({ ...tomModal(), ...(presetStatus ? { status: presetStatus } : {}), dato: presetDato || today });
    setRedigerer(null);
    setAutoSaveSts(null);
    isFirstRender.current = true;
    setVisModal(true);
  }
  async function apneRediger(b) {
    setForm({ ...tomModal(), ...b });
    setRedigerer(b);
    setAutoSaveSts(null);
    setModalFane('detaljer');
    setAktivitetLog([]);
    isFirstRender.current = true;
    setVisModal(true);
    // Hent aktivitetslogg i bakgrunnen
    setAktivitetLaster(true);
    fetch(`/api/befaringer/audit?befaringId=${encodeURIComponent(b.id)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('fbs_token') || ''}` },
    })
      .then(r => r.ok ? r.json() : { entries: [] })
      .then(d => setAktivitetLog((d.entries || []).reverse()))
      .catch(() => {})
      .finally(() => setAktivitetLaster(false));
  }
  function lagre() {
    // Leads krever bare navn — ansvarlig/PL settes når man avtaler befaring
    if (form.status === 'lead') {
      if (!form.kontaktNavn.trim()) return;
    } else if (!form.kontaktNavn.trim() || !form.adresse.trim() || !form.ansvarligBefaringId || !form.prosjektlederId) {
      return;
    }
    if (redigerer) {
      // Manuell lagring i edit-modus: avbryt eventuell auto-save og lagre nå
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...form, id: redigerer.id } });
      setVisModal(false);
    } else {
      // Ny befaring: opprett og bytt til edit-modus (auto-save tar over)
      const nyId = uid();
      dispatch({ type: 'ADD_BEFARING', payload: { ...form, id: nyId } });
      const nyBef = { ...form, id: nyId };
      setRedigerer(nyBef);
      setAutoSaveSts(null);
      isFirstRender.current = true;
      // Modalen forblir åpen i edit-modus
    }
  }
  function slett() {
    if (redigerer && window.confirm('Slett denne befaringen?')) {
      dispatch({ type: 'DELETE_BEFARING', id: redigerer.id });
      setVisModal(false);
    }
  }
  function godkjenn(b) {
    dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, status: 'godkjent' } });
    setVisModal(false);
    setVisKapasitet(b);
    const nextFarge = PROSJEKT_PALETTE[state.prosjekter.length % PROSJEKT_PALETTE.length];
    setProsjektForm({
      navn: b.kontaktNavn + (b.adresse ? ' – ' + b.adresse : ''),
      startDato: b.oensketOppstart || today,
      sluttDato: '',
      farge: nextFarge,
      lagTildeling: !!b.prosjektlederId,
    });
  }
  function opprettProsjekt() {
    if (!prosjektForm.navn.trim()) return;
    const bef = visKapasitet || {};

    // Finnes prosjektet allerede (samme navn+adresse — f.eks. opprettet fra
    // tilbuds-appen)? Da KOBLER vi befaringen til det i stedet. Tidligere
    // blokkerte duplikat-vernet i ADD_PROSJEKT stille, og befaringen ble
    // lenket til en prosjekt-ID som aldri ble opprettet («Prosjekt opprettet»
    // uten prosjekt å gå inn i — jf. Bøhlerveien 41A).
    const nNavn = prosjektForm.navn.toLowerCase().trim();
    const nAdr = (bef.adresse || '').toLowerCase().trim();
    const eksisterende = state.prosjekter.find(p =>
      (p.navn || '').toLowerCase().trim() === nNavn &&
      (p.adresse || '').toLowerCase().trim() === nAdr
    );
    if (eksisterende) {
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...bef, prosjektId: eksisterende.id, arkivert: true } });
      alert(`Prosjektet «${eksisterende.navn}» finnes allerede — befaringen er koblet til det eksisterende prosjektet.`);
      setVisKapasitet(null);
      setVisProsjektModal(false);
      return;
    }

    const prosjektId = uid();
    // Bygg kildeTilbudData for AI-framdrift fra tilbuds-data på befaringen
    const poster = bef.poster || [];
    const timerPerFag = byggTimer(poster);
    const kildeTilbudData = (poster.length > 0 || Object.keys(timerPerFag).length > 0)
      ? { poster, timer: timerPerFag, oppstart: bef.oppstartTekst || '', varighet: bef.varighetTekst || '', kundenavn: bef.kontaktNavn || '' }
      : null;
    dispatch({
      type: 'ADD_PROSJEKT',
      payload: {
        id: prosjektId,
        navn: prosjektForm.navn,
        adresse: bef.adresse || '',
        jobbType: bef.jobbType || '',
        belop: bef.estimertBelop || '',
        estimertSum: bef.estimertSum || 0,
        prosjektlederId: bef.prosjektlederId || '',
        startDato: prosjektForm.startDato,
        sluttDato: prosjektForm.sluttDato,
        status: 'aktiv',
        beskrivelse: [bef.notat, bef.kommentar].filter(Boolean).join('\n\n') || '',
        farge: prosjektForm.farge,
        befaringId: bef.id || '',
        // Tilbudsdata fra tilbuds-appen
        poster,
        fag: bef.fag || [],
        pristype: bef.pristype || '',
        oppstartTekst: bef.oppstartTekst || '',
        varighetTekst: bef.varighetTekst || '',
        varighetUker: bef.varighetUker || null,
        valgteOpsjoner: bef.valgteOpsjoner || [],
        tilbudLink: bef.tilbudLink || '',
        kildeBefaringId: bef.id || '',
        ...(kildeTilbudData ? { kildeTilbudData } : {}),
        // Full payload-snapshot fra tilbuds-appen (byggInfo, soner, totalSum osv.)
        ...(bef.tilbudPayload ? { tilbudPayload: bef.tilbudPayload } : {}),
        kunde: {
          navn: bef.kontaktNavn || '',
          adresse: bef.adresse || '',
          telefon: bef.telefon || '',
          epost: bef.epost || '',
        },
      },
    });
    if (prosjektForm.lagTildeling && visKapasitet?.prosjektlederId && prosjektForm.startDato) {
      dispatch({
        type: 'ADD_TILDELING',
        payload: {
          ansattId: visKapasitet.prosjektlederId,
          prosjektId,
          startDato: prosjektForm.startDato,
          sluttDato: prosjektForm.sluttDato || addDays(prosjektForm.startDato, 13),
        },
      });
    }
    // Merk befaringen som konvertert til prosjekt og flytt til arkiv
    if (visKapasitet) {
      dispatch({ type: 'UPDATE_BEFARING', payload: { ...visKapasitet, prosjektId, arkivert: true } });
    }
    setVisKapasitet(null);
    setVisProsjektModal(false);
  }

  // Åpne prosjekt-modal direkte fra et godkjent kort (uten kapasitet-mellomsteg)
  function apneProsjektModal(b) {
    const nextFarge = PROSJEKT_PALETTE[state.prosjekter.length % PROSJEKT_PALETTE.length];
    setVisKapasitet(b);
    setProsjektForm({
      navn: b.kontaktNavn + (b.adresse ? ' – ' + b.adresse : ''),
      startDato: b.oensketOppstart || today,
      sluttDato: '',
      farge: nextFarge,
      lagTildeling: !!b.prosjektlederId,
    });
    setVisProsjektModal(true);
  }

  const aktive = useMemo(() => befaringer.filter(b => !b.arkivert), [befaringer]);
  const arkiverte = useMemo(() => [...befaringer.filter(b => b.arkivert)].sort((a, b) => b.dato?.localeCompare(a.dato || '') || 0), [befaringer]);
  const teller = useMemo(() => Object.fromEntries(Object.keys(STATUS).map(s => [s, aktive.filter(b => b.status === s).length])), [aktive]);

  function sokFilter(b) {
    if (!sok.trim()) return true;
    const q = sok.toLowerCase();
    return (
      b.kontaktNavn?.toLowerCase().includes(q) ||
      b.adresse?.toLowerCase().includes(q) ||
      b.telefon?.toLowerCase().includes(q) ||
      b.epost?.toLowerCase().includes(q) ||
      b.jobbType?.toLowerCase().includes(q)
    );
  }

  function statusFilter(b) {
    if (!pipelineFilter) return true;
    return b.status === pipelineFilter;
  }

  function ansvarligFilterFn(b) {
    if (!ansvarligFilter) return true;
    return b.prosjektlederId === ansvarligFilter || b.ansvarligBefaringId === ansvarligFilter;
  }

  function sumKr(arr) {
    const total = arr.reduce((s, b) => s + (Number(b.estimertBelop) || 0), 0);
    return total > 0
      ? new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(total) + ' kr'
      : null;
  }

  // Stabil sortering — kort hopper ikke når man redigerer felter som dato/frist.
  // Adresse/navn endres nesten aldri, så de gir mest forutsigbar rekkefølge.
  function idTs(b) {
    const m = String(b.id || '').match(/-(\d{10,})-/);
    return m ? parseInt(m[1], 10) : 0;
  }
  function sorterBef(a, b) {
    if (sortering === 'adresse')
      return (a.adresse || 'ÅÅÅ').localeCompare(b.adresse || 'ÅÅÅ', 'nb');
    if (sortering === 'navn')
      return (a.kontaktNavn || 'ÅÅÅ').localeCompare(b.kontaktNavn || 'ÅÅÅ', 'nb');
    if (sortering === 'nyeste')
      return idTs(b) - idTs(a) || (b.dato || '').localeCompare(a.dato || '');
    // 'frist' — eldste frist/dato først (som før)
    return (a.tilbudFrist || a.dato || '9999').localeCompare(b.tilbudFrist || b.dato || '9999');
  }

  const { leads, planlagte, tilbudArbeid, tilbudSendt, godkjente } = useMemo(() => {
    const filtrerOgSorter = (status) => [...aktive]
      .filter(b => b.status === status)
      .filter(sokFilter)
      .filter(statusFilter)
      .filter(ansvarligFilterFn)
      .sort(sorterBef);

    return {
      leads:        filtrerOgSorter('lead'),
      planlagte:    filtrerOgSorter('planlagt'),
      tilbudArbeid: filtrerOgSorter('tilbud_arbeid'),
      tilbudSendt:  filtrerOgSorter('tilbud_sendt'),
      godkjente:    filtrerOgSorter('godkjent'),
    };
    // sokFilter/statusFilter/ansvarligFilterFn/sorterBef er rene funksjoner av disse verdiene:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktive, sok, pipelineFilter, ansvarligFilter, sortering]);

  const uker = useMemo(() => kapasitetPerUke(),
    // kapasitetPerUke leser kun state.ansatte, state.tildelinger og today:
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.ansatte, state.tildelinger, today]);

  // ---- Kort-komponent ----
  function BefKort({ b }) {
    const s = STATUS[b.status] || STATUS.planlagt;
    const ansattBefaring = b.ansvarligBefaringId ? state.ansatte.find(a => a.id === b.ansvarligBefaringId) : null;
    const ansatt = b.prosjektlederId ? state.ansatte.find(a => a.id === b.prosjektlederId) : null;
    const belopVis = b.estimertBelop
      ? new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(b.estimertBelop))
      : null;
    const fristDager = dagerTil(b.tilbudFrist);
    const fristFarge = fristDager !== null ? (fristDager < 0 ? '#dc2626' : fristDager <= 3 ? '#b45309' : '#15803d') : null;
    const kontaktDager = dagerTil(b.nesteKontakt);
    const kontaktFarge = kontaktDager !== null ? (kontaktDager < 0 ? '#dc2626' : kontaktDager <= 2 ? '#b45309' : '#5d6b80') : '#5d6b80';

    const erForsinket = fristDager !== null && fristDager < 0;
    const erIdag = fristDager === 0;

    return (
      <div className="bef-k-kort" onClick={() => apneRediger(b)}
        style={erForsinket ? { borderLeft: '3px solid #dc2626' } : {}}>
        <div className="bef-k-kort-topp">
          <div style={{ minWidth: 0 }}>
            <div className="bef-k-navn">{b.adresse}</div>
            <div className="bef-k-adresse">{b.kontaktNavn}</div>
            {(b.telefon || b.epost) && (
              <div className="bef-k-kontakt">
                {b.telefon && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <a href={`tel:${b.telefon}`} onClick={e => e.stopPropagation()} className="bef-k-kontakt-link"><Ikon ikon={Phone} size={12} /> {b.telefon}</a>
                    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(b.telefon); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 11, opacity: 0.5, lineHeight: 1 }}
                      title="Kopier telefonnummer"><Ikon ikon={Copy} size={12} /></button>
                  </span>
                )}
                {b.epost && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <a href={`mailto:${b.epost}`} onClick={e => e.stopPropagation()} className="bef-k-kontakt-link"><Ikon ikon={Mail} size={12} /> {b.epost}</a>
                    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(b.epost); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 11, opacity: 0.5, lineHeight: 1 }}
                      title="Kopier e-post"><Ikon ikon={Copy} size={12} /></button>
                  </span>
                )}
              </div>
            )}
          </div>
          <span className="bef-k-status-pill" style={{ background: s.bg, color: s.farge, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Ikon ikon={s.ikon} size={13} /> {s.label}
          </span>
        </div>

        <div className="bef-k-chips">
          {b.jobbType && <span className="bef-k-chip">{b.jobbType}</span>}
          {b.dato && b.status === 'planlagt' && (
            <span className="bef-k-chip bef-k-chip--dato">
              <Ikon ikon={CalendarDays} size={12} /> {datoKort(b.dato)}{b.tid ? ` kl. ${b.tid}` : ''}
            </span>
          )}
          {belopVis && <span className="bef-k-chip bef-k-chip--belop">{belopVis}</span>}
          {ansattBefaring && (
            <span className="bef-k-chip bef-k-chip--ansatt" style={{ background: ansattFarge(b.ansvarligBefaringId) + '22', color: ansattFarge(b.ansvarligBefaringId) }} title="Ansvarlig befaring">
              <Ikon ikon={Building2} size={12} /> {ansattBefaring.navn.split(' ')[0]}
            </span>
          )}
          {ansatt && ansatt.id !== ansattBefaring?.id && (
            <span className="bef-k-chip bef-k-chip--ansatt" style={{ background: ansattFarge(b.prosjektlederId) + '22', color: ansattFarge(b.prosjektlederId) }} title="Ansvarlig tilbud">
              <Ikon ikon={ClipboardList} size={12} /> {ansatt.navn.split(' ')[0]}
            </span>
          )}
          {ansatt && !ansattBefaring && (
            <span className="bef-k-chip bef-k-chip--ansatt" style={{ background: ansattFarge(b.prosjektlederId) + '22', color: ansattFarge(b.prosjektlederId) }} title="Ansvarlig tilbud">
              {ansatt.navn.split(' ')[0]}
            </span>
          )}
          {b.kilde === 'tilbuds-app-direkte' && (
            <span className="bef-k-chip" style={{ background: '#f0f9ff', color: '#0369a1', fontSize: 10 }}
              title={`Opprettet direkte fra tilbuds-app av ${b.opprettetAv || 'ukjent'}`}>
              <Ikon ikon={Sparkles} size={11} /> Fra tilbuds-app
            </span>
          )}
        </div>

        {/* Tilbud-link og kunde-aktivitet — vises på Tilbud sendt / Godkjent */}
        {(b.tilbudLink || b.sistEventDato || b.tilbudPayload?.publicToken) && (b.status === 'tilbud_sendt' || b.status === 'godkjent') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '6px 0', padding: '8px 10px', background: '#f8faff', border: '1px solid #e0e8f8', borderRadius: 7 }}>
            {b.sistEventDato && (
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                <Ikon ikon={Send} size={11} /> Sendt: {new Date(b.sistEventDato).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' })}
              </span>
            )}
            {b.kundeHarSettTilbud ? (
              <span style={{ fontSize: 11, color: '#0891b2', fontWeight: 500 }}>
                <Ikon ikon={Eye} size={11} /> Åpnet {b.antallKundeAapninger || 1}x
                {(() => {
                  const aapnet = (b.kundeAktivitet || []).find(a => a.handling === 'aapnet')
                  if (!aapnet) return null
                  const tid = aapnet.sistTidspunkt || aapnet.tidspunkt
                  if (!tid) return null
                  const d = new Date(tid)
                  const today = new Date().toDateString()
                  const visning = d.toDateString() === today
                    ? d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) + ' i dag'
                    : d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
                  return ` — ${visning}`
                })()}
              </span>
            ) : (
              b.status === 'tilbud_sendt' && <span style={{ fontSize: 11, color: '#5d6b80' }}><Ikon ikon={Eye} size={11} /> Ikke åpnet ennå</span>
            )}
            {(b.kundeAktivitet || []).some(a => a.handling === 'klikket-sporsmal') && (
              <span style={{ fontSize: 11, color: '#b45309', fontWeight: 500 }}><Ikon ikon={MessageSquare} size={11} /> Klikket Spørsmål</span>
            )}
            {(b.kundeAktivitet || []).some(a => a.handling === 'klikket-aksepter') && (
              <span style={{ fontSize: 11, color: '#15803d', fontWeight: 500 }}><Ikon ikon={CircleCheck} size={11} /> Klikket Aksepter</span>
            )}
            {(() => {
              // ALLE kundeside-lenker MÅ ha ?intern=1 — ellers forurenses
              // «Åpnet tilbudet Nx»-statistikken av interne PL-besøk.
              const token = b.tilbudPayload?.publicToken || b.tilbudPayload?.public_token;
              const url = token
                ? `https://follo-befaring.vercel.app/t/${token}?intern=1`
                : b.tilbudLink
                  ? b.tilbudLink + (b.tilbudLink.includes('?') ? '&' : '?') + 'intern=1'
                  : null;
              if (!url) return null;
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  title="Intern visning — telles ikke i kunde-statistikken"
                  style={{ fontSize: 11, color: '#2874a6', fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}
                >
                  {token ? <><Ikon ikon={Eye} size={12} /> Se kundesiden ↗</> : <><Ikon ikon={Link2} size={12} /> Åpne kundens tilbudside ↗</>}
                </a>
              );
            })()}
          </div>
        )}

        <div className="bef-k-datoer">
          {b.tilbudFrist && (
            <span className="bef-k-dato-rad" style={{
              color: erForsinket ? '#fff' : erIdag ? '#92400e' : fristFarge,
              background: erForsinket ? '#dc2626' : erIdag ? '#fef3c7' : 'transparent',
              padding: (erForsinket || erIdag) ? '2px 7px' : undefined,
              borderRadius: (erForsinket || erIdag) ? 5 : undefined,
              fontWeight: (erForsinket || erIdag) ? 500 : undefined,
              display: 'inline-block',
            }}>
              <Ikon ikon={Clock} size={12} /> Tilbudsfrist: {datoKort(b.tilbudFrist)}
              {fristDager !== null && <em> ({fristDager < 0 ? `${Math.abs(fristDager)}d over` : fristDager === 0 ? 'i dag' : `${fristDager}d`})</em>}
            </span>
          )}
          {b.nesteKontakt && (
            <span className="bef-k-dato-rad" style={{ color: kontaktFarge, fontWeight: kontaktDager !== null && kontaktDager <= 2 ? 500 : 400 }}>
              <Ikon ikon={PhoneCall} size={12} /> Neste kontakt: {datoKort(b.nesteKontakt)}
              {kontaktDager !== null && kontaktDager <= 2 && (
                <em> ({kontaktDager < 0 ? `${Math.abs(kontaktDager)}d over` : kontaktDager === 0 ? 'i dag!' : `${kontaktDager}d`})</em>
              )}
            </span>
          )}
          {b.oensketOppstart && (
            <span className="bef-k-dato-rad" style={{ color: '#0891b2', fontWeight: 500 }}>
              <Ikon ikon={Rocket} size={12} /> Ønsket oppstart: {datoKort(b.oensketOppstart)}
            </span>
          )}
          {b.resultat && (
            <span className="bef-k-dato-rad bef-k-resultat">
              <Ikon ikon={FileText} size={12} /> {b.resultat}
            </span>
          )}
          {b.tapArsak && b.status === 'tapt' && (
            <span className="bef-k-dato-rad" style={{ color: '#dc2626' }}>
              <Ikon ikon={CircleX} size={12} /> {b.tapArsak}
            </span>
          )}
          {b.kommentar && (
            <span className="bef-k-dato-rad bef-k-kommentar">
              <Ikon ikon={MessageSquare} size={12} /> {b.kommentar.length > 60 ? b.kommentar.slice(0, 60) + '…' : b.kommentar}
            </span>
          )}
        </div>

        <div className="bef-k-status-bytte" onClick={e => e.stopPropagation()}>
          <select
            className="bef-k-status-select"
            value={b.status}
            onChange={e => {
              const nyStatus = e.target.value;
              const naa = new Date().toISOString();
              dispatch({
                type: 'UPDATE_BEFARING',
                payload: {
                  ...b,
                  status: nyStatus,
                  manueltOverstyrtAv: 'manuell',
                  manueltOverstyrtDato: naa,
                  konflikt: undefined,
                },
              });
              // Logg manuell statusendring til audit-log
              fetch('/api/befaringer/audit-log', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${localStorage.getItem('fbs_token') || ''}`,
                },
                body: JSON.stringify({
                  objektId: b.id,
                  felt: 'status',
                  fraVerdi: b.status,
                  tilVerdi: nyStatus,
                  endretAv: 'manuell (kanban)',
                  kilde: 'bemannings-app',
                }),
              }).catch(() => {});
            }}
          >
            {Object.entries(STATUS).map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Konflikt-banner: manuell overstyring vs. automatisk event */}
        {b.konflikt && (
          <div style={{ margin: '6px 0', padding: '8px 10px', background: '#fef3c7', border: '1px solid #b45309', borderRadius: 7 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#92400e', marginBottom: 4 }}>
              <Ikon ikon={TriangleAlert} size={13} /> Konflikt oppdaget!
            </div>
            <div style={{ fontSize: 11, color: '#78350f', lineHeight: 1.5 }}>
              Manuelt satt: <strong>{STATUS[b.konflikt.manuellStatus]?.label || b.konflikt.manuellStatus}</strong><br />
              Fra tilbuds-app: <strong>{STATUS[b.konflikt.inkommendStatus]?.label || b.konflikt.inkommendStatus}</strong>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button style={{ fontSize: 11, padding: '3px 8px', background: '#b45309', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}
                onClick={() => dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, konflikt: undefined, manueltOverstyrtAv: 'manuell', manueltOverstyrtDato: new Date().toISOString() } })}>
                Behold <Ikon ikon={STATUS[b.konflikt.manuellStatus]?.ikon} size={12} />
              </button>
              <button style={{ fontSize: 11, padding: '3px 8px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}
                onClick={() => dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, status: b.konflikt.inkommendStatus, konflikt: undefined, manueltOverstyrtAv: undefined, manueltOverstyrtDato: undefined } })}>
                Endre til <Ikon ikon={STATUS[b.konflikt.inkommendStatus]?.ikon} size={12} />
              </button>
            </div>
          </div>
        )}

        {b.status === 'godkjent' && (
          <div className="bef-k-prosjekt-rad" onClick={e => e.stopPropagation()}>
            {/* Selvhelbredende: prosjektId som peker på et prosjekt som ikke
                finnes (historisk feil) behandles som «ikke opprettet» */}
            {b.prosjektId && state.prosjekter.some(p => p.id === b.prosjektId) ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className="bef-k-prosjekt-badge"><Ikon ikon={Building2} size={12} /> Prosjekt opprettet</span>
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px', color: '#0891b2', borderColor: '#7dd3fc', background: '#f0f9ff' }}
                  onClick={() => dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, arkivert: true } })}
                  title="Skjul fra aktiv liste – data beholdes i arkivet"
                >
                  <Ikon ikon={Archive} size={12} /> Arkiver
                </button>
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626', borderColor: '#fca5a5', background: '#fff5f5' }}
                  onClick={() => {
                    if (!confirm('Angre prosjektoppretting? Dette sletter prosjektet (og tilknyttede tildelinger) og sender befaringen tilbake til "Godkjent".')) return;
                    dispatch({ type: 'DELETE_PROSJEKT', id: b.prosjektId });
                    dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, prosjektId: undefined } });
                  }}
                >
                  <Ikon ikon={Undo2} size={12} /> Angre
                </button>
              </div>
            ) : (
              <button className="bef-k-opprett-btn" onClick={() => apneProsjektModal(b)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Ikon ikon={Building2} size={14} /> Opprett prosjekt
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bef-side">
      {/* Header */}
      <div className="page-header">
        <h2>Befaring & Tilbud</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ width: 200, height: 36 }}
            placeholder="Søk navn, adresse, type..."
            value={sok}
            onChange={e => setSok(e.target.value)}
          />
          <select
            className="input"
            style={{ height: 36, fontSize: 13, minWidth: 150 }}
            value={sortering}
            onChange={e => { setSortering(e.target.value); localStorage.setItem('fbs_bef_sort', e.target.value); }}
            title="Sortering — påvirker rekkefølgen i alle kolonner"
          >
            <option value="adresse">Adresse (A–Å)</option>
            <option value="navn">Navn (A–Å)</option>
            <option value="nyeste">Nyeste først</option>
            <option value="frist">Frist / dato</option>
          </select>
          {(() => {
            // Ansatte som har minst én aktiv befaring
            const ansatteIds = [...new Set(aktive.flatMap(b => [b.prosjektlederId, b.ansvarligBefaringId].filter(Boolean)))];
            if (ansatteIds.length === 0) return null;
            return (
              <select
                className="input"
                style={{ height: 36, fontSize: 13, minWidth: 140 }}
                value={ansvarligFilter}
                onChange={e => setAnsvarligFilter(e.target.value)}
                title="Filtrer på ansvarlig person"
              >
                <option value="">Alle ansvarlige</option>
                {ansatteIds.map(id => {
                  const a = state.ansatte.find(x => x.id === id);
                  return a ? <option key={id} value={id}>{a.navn}</option> : null;
                })}
              </select>
            );
          })()}
          <div className="bef-view-tabs">
            <button className={`bef-view-tab${viewTab === 'oversikt' ? ' aktiv' : ''}`} onClick={() => setViewTab('oversikt')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={ClipboardList} size={14} /> Oversikt</button>
            <button className={`bef-view-tab${viewTab === 'kalender' ? ' aktiv' : ''}`} onClick={() => setViewTab('kalender')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={CalendarDays} size={14} /> Kalender</button>
          </div>
          <button className="btn btn-primary" onClick={() => apneNy()}>+ Ny befaring</button>
          {isAdmin && (
            <button className="btn" onClick={() => setVisReparer(true)}
              title="Fase 3: reparer historiske tilbud-befaring-koblinger — én sak om gangen, alt reversibelt">
              Reparer koblinger
            </button>
          )}
          {/* Dedup skjult fra UI (B-listen 15.08): sletter fysisk uten tombstones. Koden beholdes. */}
          {false && isAdmin && (
            <button
              onClick={() => dedupPanel ? setDedupPanel(null) : kjorDedup(true)}
              title="Finn og rydd opp duplikate befaringer"
              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 13, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Ikon ikon={Wrench} size={14} /> Dedup
            </button>
          )}
        </div>
      </div>

      {visReparer && <ReparerKoblinger state={state} dispatch={dispatch} onLukk={() => setVisReparer(false)} />}

      {/* Admin: dedup-panel */}
      {isAdmin && dedupPanel && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', margin: '0 0 12px 0', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ color: '#1e293b', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={Wrench} size={14} /> Dedup befaringer</strong>
            <button onClick={() => setDedupPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#5d6b80' }}><Ikon ikon={X} size={16} /></button>
          </div>

          {dedupPanel.loading && <div style={{ color: '#5d6b80' }}><Ikon ikon={Loader} size={14} style={{ animation: 'spin 1.2s linear infinite' }} /> Henter duplikater...</div>}

          {dedupPanel.error && <div style={{ color: '#dc2626' }}><Ikon ikon={TriangleAlert} size={14} /> Feil: {dedupPanel.error}</div>}

          {!dedupPanel.loading && !dedupPanel.error && dedupPanel.funnetDuplikater === 0 && (
            <div style={{ color: '#15803d' }}><Ikon ikon={CircleCheck} size={14} /> Ingen duplikater funnet</div>
          )}

          {!dedupPanel.loading && !dedupPanel.error && dedupPanel.duplikatGrupper > 0 && (
            <>
              <div style={{ color: '#1e293b', marginBottom: 8 }}>
                Funnet <strong>{dedupPanel.duplikatGrupper}</strong> duplikatgrupper
                → vil slette <strong>{dedupPanel.skalSlettes}</strong> befaringer
                (beholder {dedupPanel.gjenværendeEtter})
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                {(dedupPanel.plan || []).map((g, i) => (
                  <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < dedupPanel.plan.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ fontWeight: 500 }}>Beholder: {g.behold.adresse} — {g.behold.kontaktNavn}</div>
                    <div style={{ color: '#5d6b80', fontSize: 12 }}>id: {g.behold.id} · {g.behold.dato} · {g.behold.status}</div>
                    {g.slett.map(s => (
                      <div key={s.id} style={{ color: '#dc2626', fontSize: 12, paddingLeft: 10 }}>
                        <Ikon ikon={Trash2} size={12} /> {s.id} · {s.dato} · {s.status}{s.kilde ? ` (${s.kilde})` : ''}
                      </div>
                    ))}
                    {g.mergeTilbudId && <div style={{ color: '#0891b2', fontSize: 12, paddingLeft: 10 }}>→ Overfører tilbudId {g.mergeTilbudId} til keeper</div>}
                  </div>
                ))}
              </div>
              {dedupPanel.dry !== false && (
                <button
                  onClick={() => {
                    if (!window.confirm(`Slette ${dedupPanel.skalSlettes} duplikate befaringer?\nDette kan ikke angres (men snapshots tas).`)) return;
                    kjorDedup(false);
                  }}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Ikon ikon={Trash2} size={14} /> Slett {dedupPanel.skalSlettes} duplikater
                </button>
              )}
              {dedupPanel.dry === false && (
                <div style={{ color: '#15803d', fontWeight: 500 }}><Ikon ikon={CircleCheck} size={14} /> Slettet {dedupPanel.slettet} duplikater · {dedupPanel.gjenværende} befaringer igjen</div>
              )}
            </>
          )}
        </div>
      )}

      {/* Kompakt status-fane-linje (Stefans småfix 15.08) — samme komponent
          som Prosjekter-siden. Kanban-kolonnene beholder egne tellere. */}
      <StatusFaner
        faner={Object.entries(STATUS).map(([key, s]) => ({
          key,
          label: s.label,
          ikon: <Ikon ikon={s.ikon} size={14} />,
          farge: s.farge,
          teller: teller[key] || 0,
          sum: aktive.filter(b => b.status === key).reduce((sum, b) => sum + (Number(b.estimertBelop) || 0), 0),
        }))}
        aktiv={pipelineFilter}
        onVelg={key => setPipelineFilter(f => f === key ? null : key)}
      />
      {pipelineFilter && (
        <div className="bef-filter-banner">
          Viser kun: <strong>{STATUS[pipelineFilter]?.label}</strong>
          <button className="bef-filter-fjern" onClick={() => setPipelineFilter(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Ikon ikon={X} size={12} /> Fjern filter</button>
        </div>
      )}

      {/* Oversikt-visning: fem kolonner */}
      {viewTab === 'oversikt' && (
        <div className="bef-kanban bef-kanban--5col">
          {/* Leads (før befaring) */}
          <div className="bef-kolonne">
            <div className="bef-kolonne-header" style={{ borderColor: STATUS.lead.farge, color: STATUS.lead.farge }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={STATUS.lead.ikon} size={15} /> Leads <span className="bef-kolonne-teller">{leads.length}</span></span>
            </div>
            {leads.length === 0 && <div className="bef-tom-melding">Ingen leads.</div>}
            {leads.map(b => <BefKort key={b.id} b={b} />)}
            <button className="bef-legg-til-btn" onClick={() => apneNy('lead')}>+ Ny lead</button>
          </div>

          {/* Planlagt befaring */}
          <div className="bef-kolonne">
            <div className="bef-kolonne-header" style={{ borderColor: STATUS.planlagt.farge, color: STATUS.planlagt.farge }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={STATUS.planlagt.ikon} size={15} /> Planlagt befaring <span className="bef-kolonne-teller">{planlagte.length}</span></span>
              {sumKr(planlagte) && <span className="bef-kolonne-kr">{sumKr(planlagte)}</span>}
            </div>
            {planlagte.length === 0 && <div className="bef-tom-melding">Ingen planlagte befaringer.</div>}
            {planlagte.map(b => <BefKort key={b.id} b={b} />)}
            <button className="bef-legg-til-btn" onClick={() => apneNy('planlagt')}>+ Legg til befaring</button>
          </div>

          {/* Tilbud under arbeid */}
          <div className="bef-kolonne">
            <div className="bef-kolonne-header" style={{ borderColor: STATUS.tilbud_arbeid.farge, color: STATUS.tilbud_arbeid.farge }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={STATUS.tilbud_arbeid.ikon} size={15} /> Tilbud under arbeid <span className="bef-kolonne-teller">{tilbudArbeid.length}</span></span>
              {sumKr(tilbudArbeid) && <span className="bef-kolonne-kr">{sumKr(tilbudArbeid)}</span>}
            </div>
            {tilbudArbeid.length === 0 && <div className="bef-tom-melding">Ingen tilbud under arbeid.</div>}
            {tilbudArbeid.map(b => <BefKort key={b.id} b={b} />)}
            <button className="bef-legg-til-btn" onClick={() => apneNy('tilbud_arbeid')}>+ Legg til tilbud</button>
          </div>

          {/* Tilbud sendt */}
          <div className="bef-kolonne">
            <div className="bef-kolonne-header" style={{ borderColor: STATUS.tilbud_sendt.farge, color: STATUS.tilbud_sendt.farge }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={STATUS.tilbud_sendt.ikon} size={15} /> Tilbud sendt <span className="bef-kolonne-teller">{tilbudSendt.length}</span></span>
              {sumKr(tilbudSendt) && <span className="bef-kolonne-kr">{sumKr(tilbudSendt)}</span>}
            </div>
            {tilbudSendt.length === 0 && <div className="bef-tom-melding">Ingen tilbud sendt.</div>}
            {tilbudSendt.map(b => <BefKort key={b.id} b={b} />)}
          </div>

          {/* Godkjent */}
          <div className="bef-kolonne">
            <div className="bef-kolonne-header" style={{ borderColor: STATUS.godkjent.farge, color: STATUS.godkjent.farge }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ikon ikon={STATUS.godkjent.ikon} size={15} /> Godkjent <span className="bef-kolonne-teller">{godkjente.length}</span></span>
              {sumKr(godkjente) && <span className="bef-kolonne-kr">{sumKr(godkjente)}</span>}
            </div>
            {godkjente.length === 0 && <div className="bef-tom-melding">Ingen godkjente tilbud.</div>}
            {godkjente.map(b => <BefKort key={b.id} b={b} />)}
          </div>
        </div>
      )}

      {/* Arkiv-seksjon – vises under kanban */}
      {arkiverte.length > 0 && (
        <div className="bef-arkiv-seksjon">
          <button className="bef-arkiv-toggle" onClick={() => setVisArkiv(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Ikon ikon={Archive} size={15} /> Arkiv <span className="bef-kolonne-teller">{arkiverte.length}</span>
            <span style={{ marginLeft: 6, fontSize: 11 }}>{visArkiv ? '▲ Skjul' : '▼ Vis'}</span>
          </button>
          {visArkiv && (
            <div className="bef-arkiv-liste">
              {arkiverte.map(b => {
                const belopVis = b.estimertBelop
                  ? new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Number(b.estimertBelop)) + ' kr'
                  : null;
                const prosjekt = b.prosjektId ? state.prosjekter.find(p => p.id === b.prosjektId) : null;
                return (
                  <div key={b.id} className="bef-arkiv-rad" onClick={() => apneRediger(b)}>
                    <span className="bef-arkiv-ikon"><Ikon ikon={STATUS[b.status]?.ikon || ClipboardList} size={14} /></span>
                    <span className="bef-arkiv-adresse">{b.adresse}</span>
                    <span className="bef-arkiv-navn">{b.kontaktNavn}</span>
                    {prosjekt && <span className="bef-arkiv-prosjekt"><Ikon ikon={Building2} size={12} /> {prosjekt.navn}</span>}
                    {belopVis && <span className="bef-arkiv-belop">{belopVis}</span>}
                    {b.dato && <span className="bef-arkiv-dato">{datoKort(b.dato)}</span>}
                    <button
                      className="btn btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto', flexShrink: 0 }}
                      onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_BEFARING', payload: { ...b, arkivert: false } }); }}
                      title="Flytt tilbake til aktiv liste"
                    >
                      <Ikon ikon={Undo2} size={12} /> Gjenopprett
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Kalender-visning */}
      {viewTab === 'kalender' && (
        <div className="bef-innhold">
          <div className="bef-kal-seksjon">
            <div className="bef-kal-nav">
              <button className="btn" onClick={() => setKalMaaned(m => addMonths(m, -1))}>←</button>
              <span className="bef-kal-tittel">{monthLabel(kalMaaned)}</span>
              <button className="btn" onClick={() => setKalMaaned(m => addMonths(m, 1))}>→</button>
            </div>
            <div className="bef-kal-grid">
              {DAG_NAVN_KORT.map(d => <div key={d} className="bef-kal-dagheader">{d}</div>)}
              {kalenderDager().map((dag, i) => {
                if (!dag) return <div key={'tom-' + i} className="bef-kal-dag bef-kal-dag--tom" />;
                const bfs = befaringer.filter(b => b.dato === dag);
                return (
                  <div key={dag} className={`bef-kal-dag${dag === today ? ' bef-kal-dag--idag' : ''}`} onClick={() => apneNy(null, dag)}>
                    <span className="bef-kal-dato">{dag.slice(8)}</span>
                    {bfs.map(b => {
                      const ansatt = b.prosjektlederId ? state.ansatte.find(a => a.id === b.prosjektlederId) : null;
                      const chipFarge = ansattFarge(b.prosjektlederId) || STATUS[b.status]?.farge || '#6b7280';
                      return (
                        <div key={b.id} className="bef-kal-chip" style={{ background: chipFarge }}
                          onClick={e => { e.stopPropagation(); apneRediger(b); }}
                          title={`${b.tid ? b.tid + ' – ' : ''}${b.kontaktNavn} – ${b.adresse}${ansatt ? ` (${ansatt.navn})` : ''}`}>
                          {b.tid && <span style={{ fontSize: 9, opacity: 0.9 }}>{b.tid} </span>}
                          {b.kontaktNavn.split(' ')[0]}
                          {ansatt ? ` · ${ansatt.navn.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}` : ''}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kommende liste ved siden av kalender */}
          <div className="bef-liste-seksjon">
            <h3 className="bef-liste-tittel">Kommende befaringer</h3>
            {[...aktive]
              .filter(b => b.status !== 'tapt' && b.status !== 'godkjent')
              .sort((a, b) => a.dato.localeCompare(b.dato))
              .map(b => {
                const s = STATUS[b.status] || STATUS.planlagt;
                const ansattBefaring = b.ansvarligBefaringId ? state.ansatte.find(a => a.id === b.ansvarligBefaringId) : null;
                const ansattTilbud = b.prosjektlederId ? state.ansatte.find(a => a.id === b.prosjektlederId) : null;
                return (
                  <div key={b.id} className="bef-kort" onClick={() => apneRediger(b)}>
                    <div className="bef-kort-farge" style={{ background: s.farge }} />
                    <div className="bef-kort-innhold">
                      <div className="bef-kort-navn">{b.kontaktNavn}</div>
                      <div className="bef-kort-adresse">{b.adresse}</div>
                      <div className="bef-kort-meta">
                        <span className="bef-kort-dato">
                          {new Date(b.dato + 'T00:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: 'short' })}
                          {b.tid ? ` kl. ${b.tid}` : ''}
                        </span>
                        <span className="bef-kort-type">{b.jobbType}</span>
                        {ansattBefaring && <span className="bef-kort-pl" title="Ansvarlig befaring"><Ikon ikon={Building2} size={12} /> {ansattBefaring.navn.split(' ')[0]}</span>}
                        {ansattTilbud && ansattTilbud.id !== ansattBefaring?.id && <span className="bef-kort-pl" title="Ansvarlig tilbud"><Ikon ikon={ClipboardList} size={12} /> {ansattTilbud.navn.split(' ')[0]}</span>}
                        {ansattTilbud && !ansattBefaring && <span className="bef-kort-pl" title="Ansvarlig tilbud">{ansattTilbud.navn.split(' ')[0]}</span>}
                      </div>
                    </div>
                    <div className="bef-kort-status" style={{ color: s.farge, background: s.bg, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Ikon ikon={s.ikon} size={13} /> {s.label}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Modal: legg til / rediger */}
      {visModal && (
        <div className="modal-backdrop" onClick={() => setVisModal(false)}>
          <div className="modal bef-modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{redigerer ? 'Rediger befaring' : 'Ny befaring'}</h3>
              {redigerer && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4 }}>
                  {/* Fane-veksler */}
                  <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', padding: 2, borderRadius: 6 }}>
                    <button onClick={() => setModalFane('detaljer')}
                      style={{ fontSize: 12, padding: '3px 10px', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: modalFane === 'detaljer' ? 500 : 400, background: modalFane === 'detaljer' ? '#fff' : 'transparent', color: modalFane === 'detaljer' ? '#1e293b' : '#5d6b80' }}>
                      Detaljer
                    </button>
                    <button onClick={() => setModalFane('aktivitet')}
                      style={{ fontSize: 12, padding: '3px 10px', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: modalFane === 'aktivitet' ? 500 : 400, background: modalFane === 'aktivitet' ? '#fff' : 'transparent', color: modalFane === 'aktivitet' ? '#1e293b' : '#5d6b80' }}>
                      <Ikon ikon={ScrollText} size={13} /> Aktivitet {aktivitetLog.length > 0 ? `(${aktivitetLog.length})` : ''}
                    </button>
                  </div>
                  {/* Auto-save indikator */}
                  <span style={{ fontSize: 12, color: autoSaveSts === 'saved' ? '#15803d' : autoSaveSts === 'saving' ? '#b45309' : '#5d6b80', display: 'flex', alignItems: 'center', gap: 4, transition: 'color 0.3s' }}>
                    {autoSaveSts === 'saving' && <Ikon ikon={Loader} size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                    {autoSaveSts === 'saved' && <Ikon ikon={Check} size={13} />}
                    {autoSaveSts === 'saving' ? 'Lagrer…' : autoSaveSts === 'saved' ? 'Lagret' : ''}
                  </span>
                </div>
              )}
              <button className="btn-icon" onClick={() => setVisModal(false)}><Ikon ikon={X} size={15} /></button>
            </div>

            {/* Aktivitet-fane */}
            {modalFane === 'aktivitet' && redigerer && (
              <div style={{ padding: '16px 20px', maxHeight: 420, overflowY: 'auto' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginBottom: 12 }}><Ikon ikon={ScrollText} size={14} /> Endringshistorikk</div>
                {aktivitetLaster && <div style={{ color: '#5d6b80', fontSize: 13 }}>Laster historikk…</div>}
                {!aktivitetLaster && aktivitetLog.length === 0 && (
                  <div style={{ color: '#5d6b80', fontSize: 13 }}>Ingen loggede endringer ennå.</div>
                )}
                {aktivitetLog.map((entry, i) => {
                  const dato = new Date(entry.endretDato || entry.endring?.tilDato)
                  const datoVis = dato.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={entry.id || i} style={{ display: 'flex', gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', marginTop: 5, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, color: '#5d6b80' }}><Ikon ikon={CalendarDays} size={12} /> {datoVis}</div>
                        <div style={{ fontSize: 13, color: '#1e293b', marginTop: 2 }}>
                          <strong>{entry.endring?.felt || 'ukjent felt'}</strong>:
                          {entry.endring?.fraVerdi && <span style={{ color: '#dc2626' }}> {entry.endring.fraVerdi}</span>}
                          {entry.endring?.fraVerdi && ' → '}
                          <span style={{ color: '#15803d' }}>{entry.endring?.tilVerdi || '–'}</span>
                        </div>
                        {entry.begrunnelse && <div style={{ fontSize: 11, color: '#5d6b80', marginTop: 2 }}><Ikon ikon={MessageSquare} size={11} /> {entry.begrunnelse}</div>}
                        <div style={{ fontSize: 11, color: '#5d6b80', marginTop: 2 }}>Kilde: {entry.kilde || '–'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="form" style={{ display: modalFane === 'aktivitet' ? 'none' : undefined }}>

              {/* Grunninfo */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Grunninfo</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Kontaktnavn *</label>
                    <input className="input" value={form.kontaktNavn} onChange={e => setForm(f => ({ ...f, kontaktNavn: e.target.value }))} placeholder="Navn på kontaktperson / prosjekt" />
                  </div>
                  <div>
                    <label>Telefon</label>
                    <input className="input" type="tel" value={form.telefon || ''} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} placeholder="f.eks. 900 12 345" />
                  </div>
                  <div>
                    <label>E-post</label>
                    <input className="input" type="email" value={form.epost || ''} onChange={e => setForm(f => ({ ...f, epost: e.target.value }))} placeholder="kunde@epost.no" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Adresse *</label>
                    <input className="input" value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="Adresse for befaring" />
                  </div>
                  <div>
                    <label>Type jobb</label>
                    <select className="input" value={form.jobbType} onChange={e => setForm(f => ({ ...f, jobbType: e.target.value }))}>
                      {JOBB_TYPER.map(j => <option key={j}>{j}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Ansvarlig befaring *</label>
                    <select className="input" value={form.ansvarligBefaringId} onChange={e => setForm(f => ({ ...f, ansvarligBefaringId: e.target.value }))} style={!form.ansvarligBefaringId ? { borderColor: '#f87171' } : {}}>
                      <option value="">– Velg ansvarlig –</option>
                      {[...state.ansatte].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(a => (
                        <option key={a.id} value={a.id}>{a.navn}{a.fag ? ` (${a.fag})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Ansvarlig tilbud *</label>
                    <select className="input" value={form.prosjektlederId} onChange={e => setForm(f => ({ ...f, prosjektlederId: e.target.value }))} style={!form.prosjektlederId ? { borderColor: '#f87171' } : {}}>
                      <option value="">– Velg ansvarlig –</option>
                      {[...state.ansatte].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(a => (
                        <option key={a.id} value={a.id}>{a.navn}{a.fag ? ` (${a.fag})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Dato for befaring</label>
                    <input type="date" className="input" value={form.dato} onChange={e => setForm(f => ({ ...f, dato: e.target.value }))} />
                  </div>
                  <div>
                    <label>Tidspunkt</label>
                    <input type="time" className="input" value={form.tid || '09:00'} onChange={e => setForm(f => ({ ...f, tid: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Tilbud & Frister */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Tilbud & Frister</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label>Størrelse på jobb (kr)</label>
                    <input className="input" type="number" min="0" step="10000"
                      value={form.estimertBelop} onChange={e => setForm(f => ({ ...f, estimertBelop: e.target.value }))}
                      placeholder="f.eks. 500000" />
                  </div>
                  <div>
                    <label>Frist for tilbud</label>
                    <input type="date" className="input" value={form.tilbudFrist || ''} onChange={e => setForm(f => ({ ...f, tilbudFrist: e.target.value }))} />
                  </div>
                  <div>
                    <label>Dato neste kontakt</label>
                    <input type="date" className="input" value={form.nesteKontakt || ''} onChange={e => setForm(f => ({ ...f, nesteKontakt: e.target.value }))} />
                  </div>
                  <div>
                    <label>Ønsket oppstartsdato</label>
                    <input type="date" className="input" value={form.oensketOppstart || ''} onChange={e => setForm(f => ({ ...f, oensketOppstart: e.target.value }))} />
                  </div>
                  <div>
                    <label>Resultat</label>
                    <input className="input" value={form.resultat || ''} onChange={e => setForm(f => ({ ...f, resultat: e.target.value }))} placeholder="f.eks. Tilbud akseptert, avventer..." />
                  </div>
                </div>
              </div>

              {/* Tilbudsdata — samme delte komponent som prosjektpanelet (SPEC-tillegg 15.08).
                  Leser LIVE befaring fra state (ikke redigerer-øyeblikksbildet) slik at
                  payload som lander via re-send mens modalen er åpen vises straks. */}
              {redigerer && (() => {
                const liveBef = state.befaringer.find(x => x.id === redigerer.id) || redigerer;
                const harData = liveBef.tilbudPayload || liveBef.tilbudLink || (liveBef.poster || []).length > 0 || liveBef.estimertSum > 0;
                return (
                  <div className="bef-modal-seksjon" style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px' }}>
                    <div className="bef-modal-seksjon-tittel" style={{ color: '#15803d', marginBottom: 8 }}><Ikon ikon={Package} size={14} /> Tilbudsdata</div>
                    {harData ? (
                      <TilbudsdataVisning prosjekt={liveBef} />
                    ) : (
                      <BefTilbudTomtilstand friskOpp={friskOpp} />
                    )}
                  </div>
                );
              })()}

              {/* Status */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Status</div>
                <div className="bef-status-velger">
                  {Object.entries(STATUS).map(([key, s]) => (
                    <button key={key} type="button"
                      className={`bef-status-btn${form.status === key ? ' aktiv' : ''}`}
                      style={form.status === key ? { background: s.farge, color: '#fff', borderColor: s.farge } : { borderColor: s.farge, color: s.farge }}
                      onClick={() => setForm(f => ({ ...f, status: key }))}>
                      <Ikon ikon={s.ikon} size={14} /> {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tap-årsak (kun når status = tapt) */}
              {form.status === 'tapt' && (
                <div className="bef-modal-seksjon">
                  <div className="bef-modal-seksjon-tittel" style={{ color: '#dc2626' }}>Tap-årsak</div>
                  <input
                    className="input"
                    value={form.tapArsak || ''}
                    onChange={e => setForm(f => ({ ...f, tapArsak: e.target.value }))}
                    placeholder="Hvorfor tapte vi denne? (pris, konkurrent, endret behov...)"
                  />
                </div>
              )}

              {/* Kommentar */}
              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Kommentar & Notat</div>
                <label>Kommentar</label>
                <textarea className="input" rows={2} value={form.kommentar || ''} onChange={e => setForm(f => ({ ...f, kommentar: e.target.value }))} placeholder="Kort kommentar / merknad..." />
                <label style={{ marginTop: 8 }}>Notat (intern)</label>
                <textarea className="input" rows={3} value={form.notat} onChange={e => setForm(f => ({ ...f, notat: e.target.value }))} placeholder="Notater fra befaring, prisestimater, detaljer..." />
              </div>

              <div className="modal-actions">
                {redigerer && <button className="btn btn-danger" onClick={slett}>Slett</button>}
                {redigerer && redigerer.status !== 'godkjent' && (
                  <button className="btn" style={{ background: '#15803d', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => godkjenn(redigerer)}>
                    <Ikon ikon={CircleCheck} size={15} /> Godkjenn tilbud
                  </button>
                )}
                {redigerer ? (
                  // Edit-modus: alt lagres automatisk, knappen lukker bare modalen
                  <button className="btn btn-primary" onClick={() => {
                    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
                    dispatch({ type: 'UPDATE_BEFARING', payload: { ...form, id: redigerer.id } });
                    setVisModal(false);
                  }}>
                    Lukk
                  </button>
                ) : (
                  // Ny befaring: opprett og bytt til edit-modus
                  <button className="btn btn-primary" onClick={lagre} disabled={!form.kontaktNavn.trim() || !form.adresse.trim() || !form.ansvarligBefaringId || !form.prosjektlederId}>
                    Opprett befaring
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: kapasitet */}
      {visKapasitet && (
        <div className="modal-backdrop" onClick={() => setVisKapasitet(null)}>
          <div className="modal bef-kap-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Ledig kapasitet – neste 16 uker</h3>
              <button className="btn-icon" onClick={() => setVisKapasitet(null)}><Ikon ikon={X} size={15} /></button>
            </div>
            <p style={{ margin: '0 0 16px', color: '#5d6b80', fontSize: 14 }}>
              Tilbud godkjent for <strong>{visKapasitet.kontaktNavn}</strong> – {visKapasitet.adresse}.
            </p>
            <div className="bef-kap-liste">
              {uker.map((u, i) => {
                const pst = Math.round((u.ledige / u.totalt) * 100);
                const farge = pst >= 50 ? '#15803d' : pst >= 25 ? '#b45309' : '#dc2626';
                return (
                  <div key={i} className="bef-kap-rad">
                    <div className="bef-kap-uke">
                      Uke {i + 1} &nbsp;
                      <span style={{ color: '#5d6b80', fontSize: 12 }}>
                        {new Date(u.ukeStart + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                    <div className="bef-kap-bar-wrap">
                      <div className="bef-kap-bar" style={{ width: pst + '%', background: farge }} />
                    </div>
                    <div className="bef-kap-tall" style={{ color: farge }}>{u.ledige} / {u.totalt} ledige</div>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn" onClick={() => setVisKapasitet(null)}>Lukk</button>
              <button className="btn btn-primary" onClick={() => setVisProsjektModal(true)}>+ Opprett prosjekt</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: opprett prosjekt */}
      {visProsjektModal && (
        <div className="modal-backdrop" onClick={() => setVisProsjektModal(false)}>
          <div className="modal bef-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Ikon ikon={Building2} size={17} /> Opprett prosjekt fra befaring</h3>
              <button className="btn-icon" onClick={() => setVisProsjektModal(false)}><Ikon ikon={X} size={15} /></button>
            </div>
            <div className="form">
              {/* Forhåndsvisning av befaringsdata */}
              {visKapasitet && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                  <div style={{ fontWeight: 500, color: '#1e293b', marginBottom: 4 }}>Fra befaring:</div>
                  <div style={{ color: '#5d6b80' }}><Ikon ikon={MapPin} size={13} /> {visKapasitet.adresse}</div>
                  {visKapasitet.jobbType && <div style={{ color: '#5d6b80' }}><Ikon ikon={Hammer} size={13} /> {visKapasitet.jobbType}</div>}
                  {visKapasitet.estimertBelop && (
                    <div style={{ color: '#5d6b80' }}>
                      {new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(visKapasitet.estimertBelop))}
                    </div>
                  )}
                  {visKapasitet.oensketOppstart && (
                    <div style={{ color: '#0891b2', fontWeight: 500 }}>
                      <Ikon ikon={Rocket} size={13} /> Ønsket oppstart: {datoKort(visKapasitet.oensketOppstart)}
                    </div>
                  )}
                </div>
              )}

              <div className="bef-modal-seksjon">
                <div className="bef-modal-seksjon-tittel">Prosjektdetaljer</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Prosjektnavn *</label>
                    <input className="input" value={prosjektForm.navn}
                      onChange={e => setProsjektForm(f => ({ ...f, navn: e.target.value }))} />
                  </div>
                  <div>
                    <label>Startdato</label>
                    <input type="date" className="input" value={prosjektForm.startDato}
                      onChange={e => setProsjektForm(f => ({ ...f, startDato: e.target.value }))} />
                  </div>
                  <div>
                    <label>Sluttdato</label>
                    <input type="date" className="input" value={prosjektForm.sluttDato}
                      onChange={e => setProsjektForm(f => ({ ...f, sluttDato: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Farge</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {PROSJEKT_PALETTE.map(c => (
                        <button key={c} type="button"
                          onClick={() => setProsjektForm(f => ({ ...f, farge: c }))}
                          style={{
                            width: 28, height: 28, borderRadius: '50%', background: c, border: 'none',
                            cursor: 'pointer', outline: prosjektForm.farge === c ? `3px solid ${c}` : 'none',
                            outlineOffset: 2, transform: prosjektForm.farge === c ? 'scale(1.2)' : 'scale(1)',
                            transition: 'transform .15s',
                          }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Automatisk tildeling */}
              {visKapasitet?.prosjektlederId && (
                <div className="bef-modal-seksjon">
                  <div className="bef-modal-seksjon-tittel">Ansvarlig tilbud</div>
                  {(() => {
                    const ansatt = state.ansatte.find(a => a.id === visKapasitet.prosjektlederId);
                    return ansatt ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={prosjektForm.lagTildeling}
                          onChange={e => setProsjektForm(f => ({ ...f, lagTildeling: e.target.checked }))} />
                        <span>
                          Tildel <strong>{ansatt.navn}</strong> til prosjektet automatisk
                          {prosjektForm.startDato && (
                            <span style={{ color: '#5d6b80' }}>
                              {' '}(fra {new Date(prosjektForm.startDato + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' })}
                              {prosjektForm.sluttDato
                                ? ` til ${new Date(prosjektForm.sluttDato + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' })}`
                                : ' i 2 uker'})
                            </span>
                          )}
                        </span>
                      </label>
                    ) : null;
                  })()}
                </div>
              )}

              <div className="modal-actions">
                <button className="btn" onClick={() => setVisProsjektModal(false)}>Avbryt</button>
                <button className="btn btn-primary" onClick={opprettProsjekt} disabled={!prosjektForm.navn.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Ikon ikon={Building2} size={15} /> Opprett prosjekt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
