// ═══ «Ring i dag» — PL-ens morgenliste (SPEC-oppfolgings-modul.md §2) ═══
// Vises på Oversikt (admin/kontor) og øverst på Befaring-siden (PL-rollen,
// som ikke har Oversikt). Leser køen fra src/oppfolging.js; eneste skriving
// er PL-ens egne klikk (✓ Ringt / Ny dato) → UPDATE_BEFARING + audit-logg.
import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  PhoneCall, Phone, CalendarDays, ExternalLink, Check, MessageSquare, UserX,
  Palmtree, X, Filter, CircleCheck,
} from 'lucide-react';
import { Ikon } from './Ikon';
import { BEF_STATUS } from '../statuses';
import {
  byggOppfolgingsKo, filtrerForBruker, serAlle, beregnRingt, beregnNyDato,
  foreslaattNyDato, sisteNotat, isoDato,
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

  const alleSaker = useMemo(() => byggOppfolgingsKo(state.befaringer || [], iDag), [state.befaringer, iDag]);
  const mine = useMemo(() => filtrerForBruker(alleSaker, { rolle: bruker.rolle, ansattId: bruker.ansattId, borteIds }),
    [alleSaker, bruker.rolle, bruker.ansattId, borteIds]);
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
