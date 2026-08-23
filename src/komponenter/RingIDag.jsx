// ═══ «Ring i dag» — PL-ens morgenliste (SPEC-oppfolgings-modul.md §2) ═══
// Vises på Oversikt (admin/kontor) og øverst på Befaring-siden (PL-rollen,
// som ikke har Oversikt). Leser køen fra src/oppfolging.js; eneste skriving
// er PL-ens egne klikk (✓ Ringt / Ny dato) → UPDATE_BEFARING + audit-logg.
import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  PhoneCall, Phone, CalendarDays, ExternalLink, Check, MessageSquare, UserX,
  Palmtree, X, Filter, CircleCheck, Mail, Send, ChartColumn, TriangleAlert,
} from 'lucide-react';
import { Ikon } from './Ikon';
import { BEF_STATUS } from '../statuses';
import {
  byggOppfolgingsKo, filtrerForBruker, serAlle, beregnRingt, beregnNyDato,
  foreslaattNyDato, sisteNotat, isoDato, ukesStatistikk,
} from '../oppfolging';
import './ringidag.css';

export function hentInnlogget() {
  return {
    rolle: localStorage.getItem('fbs_role') || 'ansatt',
    ansattId: localStorage.getItem('fbs_ansatt_id') || '',
    navn: localStorage.getItem('fbs_user_navn') || '',
  };
}

function auditLogg(objektId, fraVerdi, tilVerdi, begrunnelse) {
  const token = localStorage.getItem('fbs_token') || '';
  fetch('/api/befaringer/audit-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ objektId, felt: 'oppfolging', fraVerdi, tilVerdi, kilde: 'oppfolging', begrunnelse }),
  }).catch(() => {});
}

function datoKort(iso) {
  if (!iso) return '';
  return new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' });
}

export default function RingIDag({ onApneKort, borteIds, plFilter: plFilterProp, onPlFilter, tittel = 'Ring i dag' }) {
  const { state, dispatch } = useApp();
  const bruker = hentInnlogget();
  const seAlle = serAlle(bruker.rolle);
  const [plFilterLokal, setPlFilterLokal] = useState('');
  const plFilter = plFilterProp !== undefined ? plFilterProp : plFilterLokal;
  const setPlFilter = onPlFilter || setPlFilterLokal;
  const [dialog, setDialog] = useState(null); // { sak, modus:'ringt'|'dato' }
  const [notat, setNotat] = useState('');
  const [nyDato, setNyDato] = useState('');
  const [ingen, setIngen] = useState(false);
  const iDag = isoDato();

  // «Borte til»-flagg (SPEC §3): eget flagg via /api/oppfolging/borte, og for
  // admin hvem som er borte akkurat nå (fra /api/admin/users) → saker merkes.
  const [borteTil, setBorteTil] = useState(null);
  const [visBorteVelger, setVisBorteVelger] = useState(false);
  const [borteFraServer, setBorteFraServer] = useState(null); // Set av ansattId
  useEffect(() => {
    const token = localStorage.getItem('fbs_token');
    if (!token) return;
    const h = { Authorization: 'Bearer ' + token };
    fetch('/api/oppfolging/borte', { headers: h }).then(r => r.ok ? r.json() : null).then(d => { if (d) setBorteTil(d.borteTil || null); }).catch(() => {});
    if (bruker.rolle === 'admin') {
      fetch('/api/admin/users', { headers: h }).then(r => r.ok ? r.json() : []).then(liste => {
        const dag = isoDato();
        setBorteFraServer(new Set((liste || []).filter(u => u.ansattId && u.borteTil && u.borteTil >= dag).map(u => u.ansattId)));
      }).catch(() => {});
    }
  }, [bruker.rolle]);
  async function lagreBorte(dato) {
    const token = localStorage.getItem('fbs_token') || '';
    try {
      const r = await fetch('/api/oppfolging/borte', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ borteTil: dato || null }) });
      if (r.ok) { setBorteTil(dato || null); setVisBorteVelger(false); }
    } catch { /* ignorer */ }
  }
  const borteIdsEff = useMemo(() => {
    const sett = new Set(borteIds instanceof Set ? [...borteIds] : (borteIds || []));
    if (borteFraServer) for (const id of borteFraServer) sett.add(id);
    if (borteTil && borteTil >= iDag && bruker.ansattId) sett.add(bruker.ansattId);
    return sett;
  }, [borteIds, borteFraServer, borteTil, iDag, bruker.ansattId]);

  const alleSaker = useMemo(() => byggOppfolgingsKo(state.befaringer || [], iDag), [state.befaringer, iDag]);
  const mine = useMemo(() => filtrerForBruker(alleSaker, { rolle: bruker.rolle, ansattId: bruker.ansattId, borteIds: borteIdsEff }),
    [alleSaker, bruker.rolle, bruker.ansattId, borteIdsEff]);
  const saker = seAlle && plFilter
    ? mine.filter(s => plFilter === '__mangler__' ? s.manglerAnsvarlig : s.ansvarligId === plFilter)
    : mine;
  const antallForfalt = saker.filter(s => s.forfalt).length;

  const ansattNavn = id => (state.ansatte.find(a => a.id === id) || {}).navn || '';
  const plMedSaker = useMemo(() => {
    const ids = [...new Set(mine.map(s => s.ansvarligId).filter(Boolean))];
    return ids.map(id => ({ id, navn: ansattNavn(id), antall: mine.filter(s => s.ansvarligId === id).length }))
      .sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  }, [mine, state.ansatte]); // eslint-disable-line react-hooks/exhaustive-deps
  const antallManglerAnsvarlig = mine.filter(s => s.manglerAnsvarlig).length;

  function apneDialog(sak, modus) {
    setDialog({ sak, modus });
    setNotat('');
    setNyDato(foreslaattNyDato(iDag));
    setIngen(false);
  }
  function lagreDialog() {
    const { sak, modus } = dialog;
    const live = (state.befaringer || []).find(b => b.id === sak.befaringId) || sak.befaring;
    const felles = { av: bruker.navn || bruker.rolle, avId: bruker.ansattId || null, notat, sakType: sak.type };
    let res;
    if (modus === 'ringt') {
      res = beregnRingt(live, { ...felles, nyDato, ingenOppfolging: ingen });
    } else {
      if (!nyDato) return;
      res = beregnNyDato(live, { ...felles, nyDato });
    }
    dispatch({ type: 'UPDATE_BEFARING', payload: res.payload });
    auditLogg(live.id, live.nesteKontakt || null, res.innslag.ingenOppfolging ? 'ingen ny oppfølging' : (res.innslag.nyDato || null),
      `${res.innslag.handling}${notat ? ': ' + notat : ''}`);
    setDialog(null);
  }

  return (
    <div className="rid">
      <div className="rid-header">
        <span className="rid-tittel"><Ikon ikon={PhoneCall} size={15} /> {tittel}</span>
        <span className="rid-teller" style={{ color: antallForfalt ? 'var(--danger)' : undefined }}>
          {saker.length}{antallForfalt ? ` · ${antallForfalt} forfalt` : ''}
        </span>
        <span className="rid-borte">
          {borteTil && borteTil >= iDag ? (
            <>
              <span className="rid-badge rid-badge--varsel"><Ikon ikon={Palmtree} size={11} /> Borte til {datoKort(borteTil)}</span>
              <button className="btn rid-liten" onClick={() => lagreBorte(null)} title="Fjern borte-flagget — du får digest igjen">Tilbake</button>
            </>
          ) : visBorteVelger ? (
            <input type="date" className="input rid-borte-dato" min={iDag} autoFocus onChange={e => e.target.value && lagreBorte(e.target.value)} onBlur={() => setVisBorteVelger(false)} />
          ) : (
            <button className="btn rid-liten" onClick={() => setVisBorteVelger(true)} title="Ferie/fravær: sakene dine vises hos admin i mellomtiden, og du får ingen digest"><Ikon ikon={Palmtree} size={12} /> Borte?</button>
          )}
        </span>
        {seAlle && (plMedSaker.length > 0 || antallManglerAnsvarlig > 0) && (
          <label className="rid-filter" title="Vis én prosjektleders liste">
            <Ikon ikon={Filter} size={13} />
            <select value={plFilter} onChange={e => setPlFilter(e.target.value)}>
              <option value="">Alle ({mine.length})</option>
              {plMedSaker.map(p => <option key={p.id} value={p.id}>{p.navn} ({p.antall})</option>)}
              {antallManglerAnsvarlig > 0 && <option value="__mangler__">Mangler ansvarlig ({antallManglerAnsvarlig})</option>}
            </select>
          </label>
        )}
      </div>

      {saker.length === 0 && (
        <div className="rid-tom"><Ikon ikon={CircleCheck} size={16} farge="var(--success)" /> Ingen oppfølginger i dag{seAlle && plFilter ? ' for valgt PL' : ''}.</div>
      )}

      {saker.map(sak => {
        const b = sak.befaring;
        const st = BEF_STATUS[b.status] || BEF_STATUS.planlagt;
        const farge = sak.forfalt ? 'var(--danger)' : sak.dager === 0 ? 'var(--warning)' : 'var(--success)';
        const notatInfo = sisteNotat(b);
        return (
          <div key={sak.befaringId} className={`rid-rad${sak.forfalt ? ' rid-rad--forfalt' : ''}`} style={{ borderLeftColor: farge }}>
            <div className="rid-topp">
              <span className="rid-navn">{b.kontaktNavn || b.adresse || '(uten navn)'}</span>
              {b.adresse && b.kontaktNavn && <span className="rid-adresse">· {b.adresse}</span>}
              {b.telefon && (
                <a className="rid-tel" href={`tel:${String(b.telefon).replace(/\s+/g, '')}`} onClick={e => e.stopPropagation()}>
                  <Ikon ikon={Phone} size={12} /> {b.telefon}
                </a>
              )}
            </div>
            <div className="rid-meta">
              <span className="rid-badge" style={{ color: st.farge, background: st.bg }}><Ikon ikon={st.ikon} size={11} /> {st.label}</span>
              <span className="rid-badge" style={{ color: farge, background: 'color-mix(in srgb, ' + farge + ' 12%, transparent)' }}>{sak.tekst}</span>
              {sak.type === 'neste-kontakt' && sak.fristDager !== undefined && (
                <span className="rid-badge rid-badge--dempet">Frist {sak.fristDager < 0 ? 'passert' : sak.fristDager === 0 ? 'i dag' : 'om ' + sak.fristDager + ' d'}</span>
              )}
              {sak.manglerAnsvarlig && <span className="rid-badge rid-badge--varsel"><Ikon ikon={UserX} size={11} /> Mangler ansvarlig</span>}
              {sak.ansvarligBorte && <span className="rid-badge rid-badge--varsel"><Ikon ikon={Palmtree} size={11} /> {ansattNavn(sak.ansvarligId)} er borte</span>}
              {seAlle && !sak.manglerAnsvarlig && !sak.ansvarligBorte && <span className="rid-ansvarlig">{ansattNavn(sak.ansvarligId)}</span>}
            </div>
            {notatInfo && (
              <div className="rid-notat" title={notatInfo.tekst}>
                <Ikon ikon={MessageSquare} size={12} /> <span>{notatInfo.tekst}</span>
                {notatInfo.dato && <span className="rid-notat-dato">{datoKort(notatInfo.dato)}{notatInfo.av ? ' · ' + notatInfo.av : ''}</span>}
              </div>
            )}
            <div className="rid-knapper">
              <button className="btn btn-primary rid-knapp" onClick={() => apneDialog(sak, 'ringt')}><Ikon ikon={Check} size={14} /> Ringt</button>
              <button className="btn rid-knapp" onClick={() => apneDialog(sak, 'dato')}><Ikon ikon={CalendarDays} size={14} /> Ny dato</button>
              {onApneKort && <button className="btn rid-knapp" onClick={() => onApneKort(b.id)}><Ikon ikon={ExternalLink} size={14} /> Åpne kort</button>}
            </div>
          </div>
        );
      })}

      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <div className="modal rid-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{dialog.modus === 'ringt' ? 'Ringt — hva ble utfallet?' : 'Ny dato for neste kontakt'}</h3>
              <button className="btn-icon" onClick={() => setDialog(null)}><Ikon ikon={X} size={15} /></button>
            </div>
            <div className="rid-dialog-kropp">
              <div className="rid-dialog-kunde">
                {dialog.sak.befaring.kontaktNavn}{dialog.sak.befaring.adresse ? ' · ' + dialog.sak.befaring.adresse : ''}
                {dialog.sak.befaring.nesteKontakt && <span className="rid-dialog-forrige"> · neste kontakt var {datoKort(dialog.sak.befaring.nesteKontakt)}</span>}
              </div>
              {dialog.modus === 'ringt' && (
                <label className="rid-felt">
                  <span>Utfall / notat</span>
                  <textarea className="input" rows={3} autoFocus value={notat} onChange={e => setNotat(e.target.value)}
                    placeholder="F.eks. «Kunden vil ha revidert pris på bad, ringer tilbake torsdag»" />
                </label>
              )}
              {dialog.modus === 'dato' && (
                <label className="rid-felt">
                  <span>Hvorfor flyttes datoen? (valgfritt)</span>
                  <input className="input" value={notat} onChange={e => setNotat(e.target.value)} placeholder="F.eks. «Kunden er på ferie»" />
                </label>
              )}
              <label className="rid-felt">
                <span>Ny neste kontakt{dialog.modus === 'ringt' ? ' (foreslått +7 dager)' : ''}</span>
                <input className="input" type="date" value={nyDato} disabled={ingen} min={iDag} onChange={e => setNyDato(e.target.value)} />
              </label>
              {dialog.modus === 'ringt' && (
                <label className="rid-sjekk">
                  <input type="checkbox" checked={ingen} onChange={e => setIngen(e.target.checked)} />
                  Ingen ny oppfølging (bevisst valg — saken forsvinner fra listen)
                </label>
              )}
              <div className="rid-dialog-knapper">
                <button className="btn" onClick={() => setDialog(null)}>Avbryt</button>
                <button className="btn btn-primary" disabled={!ingen && !nyDato} onClick={lagreDialog}>
                  <Ikon ikon={Check} size={14} /> {dialog.modus === 'ringt' ? 'Lagre utfall' : 'Flytt dato'}
                </button>
              </div>
              <div className="rid-dialog-hint">Logges med navn og tidspunkt på kortet (oppfølgingslogg) og i endringshistorikken.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Admin-innsyn: «Oppfølging denne uka» per PL (SPEC §4) ═══
// Kun visning. Klikk på navn → PL-ens liste. Digest-knappene kaller
// /api/oppfolging/digest: forhåndsvisning er tørrkjøring; «Send nå»
// respekterer maks 1/dag og hverdags-regelen (serveren bestemmer).
export function OppfolgingUkeAdmin({ valgtPl, onVelgPl }) {
  const { state } = useApp();
  const bruker = hentInnlogget();
  const [digest, setDigest] = useState(null); // { laster, resultat, feil, sendt }
  if (bruker.rolle !== 'admin') return null;
  const stat = ukesStatistikk(state.befaringer || [], { iDag: isoDato() });
  const navn = id => id === '__ukjent__' ? 'Mangler ansvarlig' : ((state.ansatte.find(a => a.id === id) || {}).navn || 'Ukjent');
  const rader = Object.values(stat.perPl).map(r => ({ ...r, navn: navn(r.ansattId) }))
    .sort((a, b) => (b.forfalt - a.forfalt) || a.navn.localeCompare(b.navn, 'nb'));

  async function kjorDigest(send) {
    setDigest({ laster: true });
    try {
      const r = await fetch('/api/oppfolging/digest', { method: send ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + (localStorage.getItem('fbs_token') || '') } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Feil');
      setDigest({ resultat: d, sendt: send });
    } catch (e) { setDigest({ feil: e.message }); }
  }
  const r = digest && digest.resultat;

  return (
    <div className="rid-uke">
      <div className="rid-header">
        <span className="rid-tittel"><Ikon ikon={ChartColumn} size={15} /> Oppfølging denne uka</span>
        <span className="rid-teller">{stat.fra.slice(5).replace('-', '.')}–{stat.til.slice(5).replace('-', '.')}</span>
        <span className="rid-uke-verktoy">
          <button className="btn rid-liten" onClick={() => kjorDigest(false)} title="Tørrkjøring: viser hvem som ville fått hva i dag. Sender ingenting."><Ikon ikon={Mail} size={12} /> Forhåndsvis digest</button>
          <button className="btn rid-liten" onClick={() => kjorDigest(true)} title="Sender dagens digest nå (maks én per person per dag — serveren passer på)"><Ikon ikon={Send} size={12} /> Send nå</button>
        </span>
      </div>
      {rader.length === 0 && <div className="rid-tom">Ingen oppfølgingsaktivitet registrert ennå.</div>}
      {rader.map(rad => {
        const filterId = rad.ansattId === '__ukjent__' ? '__mangler__' : rad.ansattId;
        return (
        <button key={rad.ansattId} className={`rid-uke-rad${valgtPl === filterId ? ' rid-uke-rad--aktiv' : ''}`}
          onClick={() => onVelgPl && onVelgPl(valgtPl === filterId ? '' : filterId)} title="Vis denne PL-ens liste">
          <span className="rid-uke-navn">{rad.navn}</span>
          <span className="rid-uke-tall">{rad.handtert} håndtert</span>
          <span className="rid-uke-tall" style={{ color: rad.forfalt ? 'var(--danger)' : 'var(--success)' }}>{rad.forfalt} forfalt{rad.forfalt >= 5 ? <> <Ikon ikon={TriangleAlert} size={12} /></> : null}</span>
          <span className="rid-uke-tall">{rad.utsatt} utsatt</span>
        </button>
        );
      })}
      {digest && (
        <div className="rid-digest-resultat">
          {digest.laster && 'Kjører…'}
          {digest.feil && <span style={{ color: 'var(--danger)' }}>Feil: {digest.feil}</span>}
          {r && (
            <>
              <div><b>{digest.sendt ? 'Sendt nå' : 'Forhåndsvisning'} ({r.iDag}):</b> {r.digester.length} digest{r.digester.length === 1 ? '' : 'er'} · {r.fristVarsler.length} fristvarsel · {r.eskaleringer.length} eskalering{r.eskaleringer.length === 1 ? '' : 'er'}{r.ukesdigest ? ' · ukesdigest' : ''}</div>
              {r.digester.map(d => <div key={d.til}>· {d.navn} ({d.til}): {d.antall} sak{d.antall === 1 ? '' : 'er'}, {d.forfalt} forfalt{d.tilAdmin ? ` (${d.tilAdmin} som admin)` : ''}</div>)}
              {r.eskaleringer.map((e, i) => <div key={i}>· Eskalering: {e.kunde} → {e.til.join(', ')}</div>)}
              {r.hoppetOver && r.hoppetOver.length > 0 && <div style={{ color: 'var(--text-muted)' }}>Hoppet over: {r.hoppetOver.join('; ')}</div>}
              {digest.sendt && r.sendt && <div>{r.sendt.length} e-post{r.sendt.length === 1 ? '' : 'er'} sendt{r.sendt.some(x => x.skipped) ? ' (RESEND_API_KEY mangler — simulert)' : ''}{r.feilet && r.feilet.length ? `, ${r.feilet.length} feilet` : ''}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
