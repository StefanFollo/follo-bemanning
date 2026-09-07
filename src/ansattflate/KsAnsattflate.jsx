// ═══ KS-ansattflaten — /ks/<token> (SPEC-ks-ansattflate.md PR1) ═══
// Lukket mobilflate for de på byggeplassen: egne prosjekter, tildelte
// sjekklister, ett-trykks kvittering per punkt. Ingen nav til resten av
// appen, ingen vanlig innlogging — personlig token i URL-en.
// Autolagring: hver handling POST-es umiddelbart (nett på byggeplass er
// upålitelig — feil vises og handlingen kan gjentas, ingenting går tapt lokalt).
import { useState, useEffect, useCallback } from 'react';
import {
  HardHat, CircleCheck, Circle, CircleSlash, MessageSquare, ChevronLeft,
  Loader, TriangleAlert, Building2, RefreshCw, Camera, PenLine, BookOpen,
  ChartGantt, CalendarDays, ClipboardCheck, Phone, ChevronRight, Flame,
} from 'lucide-react';
import { Ikon } from '../komponenter/Ikon';
import './ksflate.css';

const STATUS_TEKST = { 'ikke-startet': 'Ikke startet', 'pagar': 'Påbegynt', 'ferdig': 'Ferdig' };

// Oppdrag 11G: enhets-ID — 4-siffer-bekreftelsen bindes til enheten, så en
// videresendt lenke krever ny bekreftelse på ny telefon.
function hentEnhetsId() {
  try {
    let id = localStorage.getItem('fbs_ks_enhet');
    if (!id) {
      id = Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      localStorage.setItem('fbs_ks_enhet', id);
    }
    return id;
  } catch { return 'ukjent-enhet'; }
}

// Ett automatisk nytt forsøk ved nettverksfeil — byggeplass-nett er upålitelig.
// Serveren tåler dobbeltkall per handling (idempotent skriving).
// somAnsatt (oppdrag 11F): PL-forhåndsvisning — admin-sesjon i stedet for token.
async function api(metode, token, body, forsok = 0, somAnsatt = null) {
  try {
    const query = metode === 'GET'
      ? (somAnsatt
        ? `?somAnsatt=${encodeURIComponent(somAnsatt)}${body?.query || ''}`
        : `?token=${encodeURIComponent(token)}&enhet=${encodeURIComponent(hentEnhetsId())}${body?.query || ''}`)
      : '';
    const r = await fetch(`/api/ks/flate${query}`, {
      method: metode,
      headers: {
        'Content-Type': 'application/json',
        ...(somAnsatt ? { Authorization: 'Bearer ' + (localStorage.getItem('fbs_token') || '') } : {}),
      },
      ...(metode === 'POST' ? { body: JSON.stringify({ token, enhet: hentEnhetsId(), ...body }) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch {
    if (forsok < 1) { await new Promise(res => setTimeout(res, 800)); return api(metode, token, body, forsok + 1, somAnsatt); }
    return { ok: false, status: 0, data: { error: 'Ingen nettforbindelse — prøv igjen.' } };
  }
}

// Klient-komprimering (spec test-krav 7): maks 1600 px lengste side, JPEG 0.8.
async function komprimerBilde(fil) {
  const bitmap = await createImageBitmap(fil).catch(() => null);
  if (!bitmap) return null;
  const skala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * skala);
  c.height = Math.round(bitmap.height * skala);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

function Verifisering({ token, fornavn, onOk }) {
  const [siffer, setSiffer] = useState('');
  const [feil, setFeil] = useState('');
  const [laster, setLaster] = useState(false);
  async function send() {
    if (siffer.replace(/\D/g, '').length !== 4 || laster) return;
    setLaster(true); setFeil('');
    const r = await api('POST', token, { handling: 'verifiser', siffer });
    setLaster(false);
    if (r.ok) return onOk();
    setSiffer('');
    setFeil(r.data.error || 'Noe gikk galt — prøv igjen.');
  }
  return (
    <div className="ksf-kort ksf-verifiser">
      <p>Hei {fornavn}! For å bekrefte at det er deg: tast de <b>4 siste sifrene</b> i ditt eget telefonnummer.</p>
      <input
        className="ksf-siffer" type="tel" inputMode="numeric" maxLength={4} autoFocus
        value={siffer} placeholder="••••"
        onChange={e => setSiffer(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={e => e.key === 'Enter' && send()}
      />
      {feil && <div className="ksf-feil"><Ikon ikon={TriangleAlert} size={14} /> {feil}</div>}
      <button className="ksf-knapp ksf-knapp--primar" disabled={siffer.length !== 4 || laster} onClick={send}>
        {laster ? <Ikon ikon={Loader} size={16} className="ksf-spinn" /> : 'Bekreft'}
      </button>
    </div>
  );
}

function Punkt({ punkt, laast, onEndre }) {
  const [visKommentar, setVisKommentar] = useState(!!punkt.kommentar);
  const [kommentar, setKommentar] = useState(punkt.kommentar || '');
  const [lagrer, setLagrer] = useState(false);
  const [feil, setFeil] = useState(false);

  async function sett(felter) {
    setLagrer(true); setFeil(false);
    const ok = await onEndre(felter);
    setLagrer(false);
    if (!ok) setFeil(true);
  }
  const st = punkt.status || '';
  return (
    <div className={`ksf-punkt${st === 'ok' ? ' ksf-punkt--ok' : ''}${st === 'ikke-aktuelt' ? ' ksf-punkt--ia' : ''}`}>
      <button
        className="ksf-punkt-kvitter" disabled={laast || lagrer}
        title={st === 'ok' ? 'Trykk for å angre' : 'Trykk for å kvittere OK'}
        onClick={() => sett({ status: st === 'ok' ? '' : 'ok' })}
      >
        <Ikon ikon={lagrer ? Loader : st === 'ok' ? CircleCheck : st === 'ikke-aktuelt' ? CircleSlash : Circle}
          size={26} farge={st === 'ok' ? 'var(--success)' : st === 'ikke-aktuelt' ? 'var(--text-muted)' : undefined}
          className={lagrer ? 'ksf-spinn' : undefined} />
      </button>
      <div className="ksf-punkt-innhold">
        <div className="ksf-punkt-tekst">{punkt.tekst}</div>
        {punkt.veiledning_kort && <div className="ksf-punkt-veiledning">{punkt.veiledning_kort}</div>}
        {punkt.utfort_av && st && <div className="ksf-punkt-meta">{st === 'ikke-aktuelt' ? 'Ikke aktuelt' : 'Utført'} · {punkt.utfort_av}</div>}
        {feil && <div className="ksf-feil"><Ikon ikon={TriangleAlert} size={12} /> Fikk ikke lagret — sjekk nettet og prøv igjen.</div>}
        <div className="ksf-punkt-valg">
          {!laast && st !== 'ok' && (
            <button className="ksf-lenkeknapp" disabled={lagrer}
              onClick={() => sett({ status: st === 'ikke-aktuelt' ? '' : 'ikke-aktuelt' })}>
              {st === 'ikke-aktuelt' ? 'Angre «ikke aktuelt»' : 'Ikke aktuelt'}
            </button>
          )}
          {!laast && (
            <button className="ksf-lenkeknapp" onClick={() => setVisKommentar(v => !v)}>
              <Ikon ikon={MessageSquare} size={12} /> {punkt.kommentar ? 'Kommentar' : 'Legg til kommentar'}
            </button>
          )}
          {!laast && (
            <label className="ksf-bildeknapp" style={{ cursor: lagrer ? 'wait' : 'pointer' }}>
              <Ikon ikon={Camera} size={16} /> {punkt.krever_bilde && !(punkt.bilder || []).length ? 'Ta bilde (påkrevd)' : 'Ta bilde'}
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={lagrer}
                onChange={async e => {
                  const fil = e.target.files && e.target.files[0];
                  e.target.value = '';
                  if (!fil) return;
                  const dataUrl = await komprimerBilde(fil);
                  if (!dataUrl) { setFeil(true); return; }
                  await sett({ __bilde: dataUrl });
                }} />
            </label>
          )}
        </div>
        {(punkt.bilder || []).length > 0 && (
          <div className="ksf-bilder">
            {punkt.bilder.map((b, i) => (
              <a key={i} href={b.url} target="_blank" rel="noreferrer"><img src={b.url} alt={'Bilde ' + (i + 1)} loading="lazy" /></a>
            ))}
          </div>
        )}
        {visKommentar && (
          <div className="ksf-kommentar">
            <textarea rows={2} value={kommentar} disabled={laast} placeholder="Kort kommentar (valgfritt)…"
              onChange={e => setKommentar(e.target.value)} />
            {!laast && kommentar !== (punkt.kommentar || '') && (
              <button className="ksf-knapp" disabled={lagrer} onClick={() => sett({ kommentar })}>Lagre kommentar</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// «Signer og lever» (spec §2): navn forhåndsutfylt fra ansattkortet,
// dato/tid låses på serveren — etterpå er lista skrivebeskyttet for ansatt.
function SignerOgLever({ navn: forhandsutfylt, onLever }) {
  const [navn, setNavn] = useState(forhandsutfylt || '');
  const [sender, setSender] = useState(false);
  return (
    <div className="ksf-kort ksf-signer">
      <div className="ksf-signer-tittel"><Ikon ikon={PenLine} size={16} /> Signer og lever</div>
      <p>Alle punkter er avklart. Når du leverer, låses listen med navn og tidspunkt — endringer etterpå må gå via prosjektleder.</p>
      <label className="ksf-signer-felt">
        <span>Navn</span>
        <input value={navn} onChange={e => setNavn(e.target.value)} placeholder="Ditt navn" />
      </label>
      <button className="ksf-knapp ksf-knapp--primar" disabled={!navn.trim() || sender}
        onClick={async () => {
          if (!window.confirm('Levere og låse sjekklisten som «' + navn.trim() + '»?')) return;
          setSender(true);
          await onLever(navn.trim());
          setSender(false);
        }}>
        {sender ? <Ikon ikon={Loader} size={16} className="ksf-spinn" /> : 'Signer og lever'}
      </button>
    </div>
  );
}
// ── Oppdrag 11A: Framdrift — intern lesevisning av fasene per prosjekt ──
// Kun tittel/periode/status/pågår-nå fra serveren; aldri timer, priser
// eller bemanningsdetaljer om andre. PL-navn + telefon vises så ansatte
// kan ringe SIN prosjektleder.
const FASE_STATUS = {
  ferdig: { tekst: 'Ferdig', farge: '#15803d', bg: '#f0fdf4' },
  pagar:  { tekst: 'Pågår',  farge: '#2563eb', bg: '#eff6ff' },
  kommer: { tekst: 'Kommer', farge: '#5d6b80', bg: '#f8fafc' },
};
function datoKortKsf(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : null;
}
// Én fase-rad — for AL (oppdrag 11H) med Tildel/tekst/Ferdig; ellers lesevisning.
function FaseRad({ fase, forste, erAL, lag, onAL }) {
  const [visTildel, setVisTildel] = useState(false);
  const [tekst, setTekst] = useState(fase.oppgaveTekst || '');
  const [lagrer, setLagrer] = useState(false);
  const st = FASE_STATUS[fase.status] || FASE_STATUS.kommer;
  const kjor = async (handling, felter) => { setLagrer(true); await onAL(handling, { faseId: fase.id, ...felter }); setLagrer(false); };
  return (
    <div style={{ padding: '7px 0', borderTop: forste ? 'none' : '1px solid #f1f5f9', background: fase.deg ? '#eff6ff' : 'transparent', borderRadius: fase.deg ? 6 : 0, ...(fase.deg ? { padding: '7px 8px', margin: '2px -8px' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: (fase.pagarNa || fase.deg) ? 600 : 400 }}>
          {fase.tittel}
          {fase.pagarNa && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#c2410c', fontWeight: 600 }}><Ikon ikon={Flame} size={11} /> Pågår nå</span>}
          {fase.deg && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#185FA5', fontWeight: 700 }}>DIN</span>}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fase.periodeTekst}</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: st.farge, background: st.bg, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>{st.tekst}</span>
      </div>
      {(fase.tildelt || []).length > 0 && (
        <div style={{ fontSize: 12, color: '#185FA5', marginTop: 2 }}>→ {fase.tildelt.join(', ')}</div>
      )}
      {fase.oppgaveTekst && !erAL && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic' }}>«{fase.oppgaveTekst}»</div>}
      {erAL && (
        <div style={{ marginTop: 4 }}>
          <button className="ksf-lenkeknapp" disabled={lagrer} onClick={() => setVisTildel(v => !v)}>
            {visTildel ? 'Lukk tildeling' : 'Tildel'}
          </button>
          <label className="ksf-lenkeknapp" style={{ marginLeft: 10 }}>
            <input type="checkbox" checked={fase.status === 'ferdig'} disabled={lagrer}
              onChange={e => kjor('fase-ferdig', { ferdig: e.target.checked })} style={{ marginRight: 4 }} />
            Ferdig
          </label>
          {visTildel && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(lag || []).map(a => {
                  const valgt = (fase.tildeltIds || []).includes(a.id);
                  return (
                    <button key={a.id} disabled={lagrer}
                      style={{ fontSize: 12, padding: '4px 10px', borderRadius: 14, cursor: 'pointer', border: '1px solid ' + (valgt ? '#185FA5' : '#e2e8f0'), background: valgt ? '#185FA5' : '#fff', color: valgt ? '#fff' : '#1e293b' }}
                      onClick={() => kjor('fase-tildel', { ansattIds: valgt ? (fase.tildeltIds || []).filter(x => x !== a.id) : [...(fase.tildeltIds || []), a.id] })}>
                      {a.navn.split(' ')[0]}{a.fag ? ` · ${a.fag}` : ''}
                    </button>
                  );
                })}
                {!(lag || []).length && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ingen er bemannet på prosjektet ennå.</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input className="ksf-kommentar" style={{ flex: 1 }} placeholder="Hva skal gjøres? (valgfritt)" value={tekst} maxLength={300}
                  onChange={e => setTekst(e.target.value)} />
                {tekst !== (fase.oppgaveTekst || '') && (
                  <button className="ksf-knapp" disabled={lagrer} onClick={() => kjor('fase-tekst', { tekst })}>Lagre</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FramdriftFane({ prosjekter, erAL, onAL }) {
  if (!prosjekter.length) return <div className="ksf-kort" style={{ color: 'var(--text-muted)' }}>Du er ikke satt opp på noen prosjekter ennå — spør prosjektlederen din.</div>;
  return prosjekter.map(p => (
    <div key={p.id} className="ksf-kort">
      <div className="ksf-prosjekt-navn"><Ikon ikon={Building2} size={15} /> {p.navn}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 6px' }}>
        {[p.adresse && p.adresse !== p.navn ? p.adresse : null,
          p.startDato ? `${datoKortKsf(p.startDato)}${p.sluttDato ? ' – ' + datoKortKsf(p.sluttDato) : ''}` : null,
        ].filter(Boolean).join(' · ')}
      </div>
      {p.pl && (
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          PL: <b>{p.pl.navn}</b>
          {p.pl.telefon && (
            <a href={`tel:${String(p.pl.telefon).replace(/\s+/g, '')}`} style={{ marginLeft: 8, color: '#185FA5', fontWeight: 500, textDecoration: 'none' }}>
              <Ikon ikon={Phone} size={13} /> {p.pl.telefon}
            </a>
          )}
        </div>
      )}
      {!p.framdrift && <div className="ksf-tom">Ingen framdriftsplan for dette prosjektet ennå.</div>}
      {(p.framdrift || []).map((f, i) => (
        <FaseRad key={f.id || i} fase={f} forste={i === 0} erAL={erAL} lag={p.lag}
          onAL={(handling, felter) => onAL(handling, { prosjektId: p.id, ...felter })} />
      ))}
    </div>
  ));
}

// ── Oppdrag 11E (PRESISERT): Bemanning = «Din uke» + «Mitt lag»-bryter ──
// KUN egne oppdrag denne + 2 neste uker; laget = kollegene på SAMME prosjekt
// SAMME dag (navn + fag). Serveren sender aldri sykmelding/fravær/kontaktinfo
// om andre — og aldri folk på andre prosjekter.
function BemanningFane({ token, somAnsatt }) {
  const [data, setData] = useState(null);
  const [feil, setFeil] = useState(false);
  const [visLag, setVisLag] = useState(false);
  useEffect(() => {
    let aktiv = true;
    (async () => {
      const r = await api('GET', token, { query: '&dinUke=1' }, 0, somAnsatt);
      if (!aktiv) return;
      if (r.ok && r.data.dinUke) setData(r.data.dinUke); else setFeil(true);
    })();
    return () => { aktiv = false; };
  }, [token, somAnsatt]);

  if (feil) return <div className="ksf-kort ksf-feilkort"><p>Fikk ikke hentet uka di — prøv igjen.</p></div>;
  if (!data) return <div className="ksf-kort" style={{ textAlign: 'center' }}><Ikon ikon={Loader} size={20} className="ksf-spinn" /></div>;

  const harNoe = data.dager.some(d => d.oppdrag.length || d.egenFerie);
  const uker = [data.dager.slice(0, 7), data.dager.slice(7, 14), data.dager.slice(14, 21)];
  const ukeNavn = ['Denne uka', 'Neste uke', 'Uka etter'];

  return (
    <>
      <div className="ksf-kort" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}><Ikon ikon={CalendarDays} size={15} /> Din uke</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer', fontWeight: 500 }}>
          <input type="checkbox" checked={visLag} onChange={e => setVisLag(e.target.checked)} />
          Vis mitt lag
        </label>
      </div>
      {!harNoe && <div className="ksf-kort" style={{ color: 'var(--text-muted)' }}>Du er ikke satt opp på noen prosjekter ennå — spør prosjektlederen din.</div>}
      {uker.map((uke, u) => {
        const dagerMedInnhold = uke.filter(d => d.oppdrag.length || d.egenFerie);
        return (
          <div key={u} className="ksf-kort" style={u === 0 ? { borderLeft: '3px solid #185FA5' } : {}}>
            <div className="ksf-prosjekt-navn">{ukeNavn[u]}</div>
            {dagerMedInnhold.length === 0 && <div className="ksf-tom">Ikke satt opp.</div>}
            {dagerMedInnhold.map(d => (
              <div key={d.dato} style={{ padding: '5px 0', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                  {new Date(d.dato + 'T00:00:00').toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'short' })}
                </div>
                {d.egenFerie && <div style={{ fontSize: 13.5, fontWeight: 500, color: '#0e7490' }}>Ferie / fri</div>}
                {d.oppdrag.map((o, i) => (
                  <div key={i} style={{ marginTop: 2 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{o.prosjekt}</div>
                    {o.adresse && o.adresse !== o.prosjekt && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.adresse}</div>}
                    {o.plNavn && (
                      <div style={{ fontSize: 12.5 }}>
                        PL: {o.plNavn}
                        {o.plTelefon && <a href={`tel:${String(o.plTelefon).replace(/\s+/g, '')}`} style={{ marginLeft: 6, color: '#185FA5', fontWeight: 500, textDecoration: 'none' }}><Ikon ikon={Phone} size={12} /> {o.plTelefon}</a>}
                      </div>
                    )}
                    {(o.oppgaver || []).map((opp, j) => (
                      <div key={j} style={{ fontSize: 12.5, color: '#c2410c', fontWeight: 500, marginTop: 1 }}>
                        <Ikon ikon={HardHat} size={12} /> {opp.fase}{opp.tekst ? `: ${opp.tekst}` : ' — du er satt på denne fasen'}
                      </div>
                    ))}
                    {visLag && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                        {o.lag.length
                          ? <>Laget: {o.lag.map(k => `${k.navn.split(' ')[0]}${k.fag ? ' (' + k.fag + ')' : ''}`).join(', ')}</>
                          : 'Ingen andre på prosjektet denne dagen.'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// ── PR3: HMS-rutiner — ren LESEVISNING av rutinene admin/PL har flagget
// «Vis for ansatte». Innholdet ligger i den statiske håndbok-chunken og
// lazy-lastes først når seksjonen åpnes (stor fil, trengs ikke ellers).
function HmsRutiner({ ids, onTilbake }) {
  const [dokumenter, setDokumenter] = useState(null);
  const [sok, setSok] = useState('');
  const [valgtDok, setValgtDok] = useState(null);

  useEffect(() => {
    let aktiv = true;
    import('../data/rutiner-holte')
      .then(m => {
        if (!aktiv) return;
        const flagget = new Set(ids || []);
        setDokumenter(m.RUTINER_DATA.dokumenter.filter(d => flagget.has(d.id)));
      })
      .catch(() => { if (aktiv) setDokumenter([]); });
    return () => { aktiv = false; };
  }, [ids]);

  if (valgtDok) {
    return (
      <>
        <button className="ksf-tilbake" onClick={() => setValgtDok(null)}><Ikon ikon={ChevronLeft} size={16} /> HMS-rutiner</button>
        <div className="ksf-kort">
          <div className="ksf-sl-tittel">{valgtDok.tittel}</div>
          <div className="ksf-sl-under">{valgtDok.kapittel}{valgtDok.underkapittel ? ` · ${valgtDok.underkapittel}` : ''}</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>{valgtDok.innhold}</div>
        </div>
      </>
    );
  }

  const q = sok.trim().toLowerCase();
  const treff = (dokumenter || []).filter(d =>
    !q || d.tittel.toLowerCase().includes(q) || (q.length >= 4 && d.innhold.toLowerCase().includes(q)));
  const perKapittel = [];
  for (const d of treff) {
    const siste = perKapittel[perKapittel.length - 1];
    if (siste && siste.kapittel === d.kapittel) siste.dokumenter.push(d);
    else perKapittel.push({ kapittel: d.kapittel, dokumenter: [d] });
  }

  return (
    <>
      {onTilbake && <button className="ksf-tilbake" onClick={onTilbake}><Ikon ikon={ChevronLeft} size={16} /> Mine sjekklister</button>}
      <div className="ksf-kort">
        <div className="ksf-sl-tittel"><Ikon ikon={BookOpen} size={16} /> HMS-rutiner</div>
        <input className="ksf-kommentar" style={{ marginTop: 8 }} placeholder="Søk i rutinene…"
          value={sok} onChange={e => setSok(e.target.value)} />
      </div>
      {dokumenter === null && <div className="ksf-kort" style={{ textAlign: 'center' }}><Ikon ikon={Loader} size={20} className="ksf-spinn" /></div>}
      {dokumenter !== null && treff.length === 0 && (
        <div className="ksf-kort" style={{ color: 'var(--text-muted)' }}>{q ? 'Ingen rutiner matcher søket.' : 'Ingen rutiner er delt med ansatte ennå.'}</div>
      )}
      {perKapittel.map(gruppe => (
        <div key={gruppe.kapittel} className="ksf-kort">
          <div className="ksf-prosjekt-navn"><Ikon ikon={BookOpen} size={15} /> {gruppe.kapittel}</div>
          {gruppe.dokumenter.map(d => (
            <button key={d.id} className="ksf-sl-rad" onClick={() => setValgtDok(d)}>
              <span className="ksf-sl-rad-navn">{d.tittel}</span>
              <span className="ksf-sl-rad-teller">Les</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

// Oppdrag 11G: «Legg til på hjemskjerm» — dynamisk manifest (Android/Chrome
// bruker start_url = ansattens lenke) + hint-kort første gang.
function settOppHjemskjerm(token) {
  try {
    if (document.getElementById('ksf-manifest')) return;
    const manifest = {
      name: 'FBS Ansatt', short_name: 'FBS', display: 'standalone',
      start_url: window.location.origin + '/ks/' + token,
      background_color: '#f4f6f9', theme_color: '#185FA5',
      icons: [{ src: window.location.origin + '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    const l = document.createElement('link'); l.id = 'ksf-manifest'; l.rel = 'manifest'; l.href = url;
    document.head.appendChild(l);
    const m = document.createElement('meta'); m.name = 'apple-mobile-web-app-capable'; m.content = 'yes';
    document.head.appendChild(m);
  } catch { /* hjemskjerm-støtte er best-effort */ }
}

function HjemskjermHint() {
  const [skjult, setSkjult] = useState(() => {
    try { return localStorage.getItem('fbs_ks_hjemskjerm_hint') === 'vist'; } catch { return true; }
  });
  if (skjult || window.matchMedia?.('(display-mode: standalone)')?.matches) return null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return (
    <div className="ksf-kort" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12.5 }}>
      <b>Tips: legg meg på hjemskjermen!</b>{' '}
      {ios
        ? 'Trykk del-knappen (firkant med pil) nederst i Safari og velg «Legg til på Hjem-skjerm».'
        : 'Trykk ⋮-menyen i nettleseren og velg «Legg til på startsiden».'}
      <button className="ksf-lenkeknapp" style={{ marginLeft: 8 }}
        onClick={() => { try { localStorage.setItem('fbs_ks_hjemskjerm_hint', 'vist'); } catch { /* noop */ } setSkjult(true); }}>
        Skjønner
      </button>
    </div>
  );
}

export default function KsAnsattflate({ token, somAnsatt = null }) {
  const [data, setData] = useState(null);
  const [feil, setFeil] = useState(null);
  const [laster, setLaster] = useState(true);
  const [valgt, setValgt] = useState(null); // { prosjektId, sjekklisteId }
  const [fane, setFane] = useState('sjekklister'); // Oppdrag 11B: bunnmeny

  const hent = useCallback(async () => {
    setLaster(true);
    const r = await api('GET', token, null, 0, somAnsatt);
    setLaster(false);
    // Godta kun svar med kjent form — alt annet (proxy-HTML, nettverksfeil,
    // tomme svar) vises som feil i stedet for å krasje flaten.
    if (r.data && (r.data.maaVerifisere || Array.isArray(r.data.prosjekter))) { setFeil(null); setData(r.data); }
    else setFeil((r.data && r.data.error) || 'Fikk ikke kontakt — sjekk nettet og prøv igjen.');
  }, [token, somAnsatt]);
  useEffect(() => { hent(); }, [hent]);
  useEffect(() => { if (token && !somAnsatt) settOppHjemskjerm(token); }, [token, somAnsatt]);

  // Oppdrag 11H: anleggsleder-handling → server → friske data
  async function alHandling(handling, felter) {
    if (somAnsatt) return; // forhåndsvisning er kun lesing
    const r = await api('POST', token, { handling, ...felter });
    if (!r.ok) { window.alert(r.data.error || 'Fikk ikke lagret — prøv igjen.'); return; }
    await hent();
  }

  async function endrePunkt(sjekklisteId, punktId, felter) {
    const r = felter.__bilde
      ? await api('POST', token, { handling: 'bilde', sjekklisteId, punktId, bildeData: felter.__bilde })
      : await api('POST', token, { handling: 'punkt', sjekklisteId, punktId, ...felter });
    if (!r.ok) { if (r.data.laast || r.data.utlopt) hent(); return false; }
    // Oppdater lokalt (autolagret på server allerede)
    setData(d => ({
      ...d,
      prosjekter: d.prosjekter.map(p => ({
        ...p,
        sjekklister: p.sjekklister.map(sl => sl.id !== sjekklisteId ? sl : {
          ...sl, status: r.data.sjekklisteStatus || sl.status,
          punkter: sl.punkter.map(pk => pk.id === punktId ? r.data.punkt : pk),
        }),
      })),
    }));
    return true;
  }

  async function leverListe(sjekklisteId, navn) {
    const r = await api('POST', token, { handling: 'lever', sjekklisteId, navn });
    if (!r.ok) { window.alert(r.data.error || 'Fikk ikke levert — prøv igjen.'); return; }
    await hent();
    setValgt(null);
  }

  const topp = (
    <>
      <header className="ksf-topp">
        <span className="ksf-logo">FBS</span>
        <span className="ksf-topp-tittel"><Ikon ikon={HardHat} size={16} /> {somAnsatt ? 'Ansattflaten' : 'KS-sjekklister'}</span>
        <button className="ksf-oppdater" onClick={hent} title="Oppdater"><Ikon ikon={RefreshCw} size={15} /></button>
      </header>
      {somAnsatt && (
        <div style={{ background: '#c2410c', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '6px 14px', textAlign: 'center' }}>
          FORHÅNDSVISNING — slik ser {data?.navn || 'den ansatte'} flaten (kun lesing)
        </div>
      )}
    </>
  );

  if (feil) return <div className="ksf">{topp}<div className="ksf-kort ksf-feilkort"><Ikon ikon={TriangleAlert} size={28} farge="var(--warning)" /><p>{feil}</p><button className="ksf-knapp ksf-knapp--primar" onClick={hent}>Prøv igjen</button></div></div>;
  if (laster && !data) return <div className="ksf">{topp}<div className="ksf-kort" style={{ textAlign: 'center' }}><Ikon ikon={Loader} size={22} className="ksf-spinn" /></div></div>;
  if (!data) return null;
  if (data.maaVerifisere) return <div className="ksf">{topp}<Verifisering token={token} fornavn={data.fornavn} onOk={hent} /></div>;

  const alleSl = (data.prosjekter || []).flatMap(p => p.sjekklister.map(sl => ({ ...sl, prosjektId: p.id, prosjektNavn: p.navn })));
  const aktiv = fane === 'sjekklister' && valgt && alleSl.find(sl => sl.id === valgt.sjekklisteId);
  const hmsIds = Array.isArray(data.hmsRutiner) ? data.hmsRutiner : [];

  // Oppdrag 11B: mobil bunnmeny — fire faner
  const bunnmeny = (
    <nav className="ksf-bunnmeny">
      {[
        ['sjekklister', ClipboardCheck, 'Sjekklister'],
        ['framdrift', ChartGantt, 'Framdrift'],
        ['bemanning', CalendarDays, 'Bemanning'],
        ['rutiner', BookOpen, 'Rutiner'],
      ].map(([key, ikon, tekst]) => (
        <button key={key} className={`ksf-fane${fane === key ? ' ksf-fane--aktiv' : ''}`}
          onClick={() => { setFane(key); setValgt(null); }}>
          <Ikon ikon={ikon} size={19} />
          <span>{tekst}</span>
        </button>
      ))}
    </nav>
  );

  if (fane === 'framdrift') {
    return <div className="ksf ksf--medMeny">{topp}<div className="ksf-hilsen">Hei {data.fornavn}!</div><FramdriftFane prosjekter={data.prosjekter || []} erAL={!!data.erAnleggsleder && !somAnsatt} onAL={alHandling} />{bunnmeny}</div>;
  }
  if (fane === 'bemanning') {
    return <div className="ksf ksf--medMeny">{topp}<BemanningFane token={token} somAnsatt={somAnsatt} />{bunnmeny}</div>;
  }
  if (fane === 'rutiner') {
    return <div className="ksf ksf--medMeny">{topp}<HmsRutiner ids={hmsIds} onTilbake={null} />{bunnmeny}</div>;
  }

  if (aktiv) {
    const gjort = aktiv.punkter.filter(p => p.status === 'ok' || p.status === 'ikke-aktuelt').length;
    return (
      <div className="ksf ksf--medMeny">
        {topp}
        <button className="ksf-tilbake" onClick={() => setValgt(null)}><Ikon ikon={ChevronLeft} size={16} /> Mine sjekklister</button>
        <div className="ksf-kort">
          <div className="ksf-sl-tittel">{aktiv.navn}</div>
          <div className="ksf-sl-under">{aktiv.prosjektNavn}{aktiv.frist ? ` · frist ${aktiv.frist}` : ''}</div>
          <div className="ksf-framdrift"><span style={{ width: `${aktiv.punkter.length ? Math.round(gjort / aktiv.punkter.length * 100) : 0}%` }} /></div>
          <div className="ksf-framdrift-tekst">{gjort} av {aktiv.punkter.length} punkter</div>
          {aktiv.levert && <div className="ksf-levert"><Ikon ikon={CircleCheck} size={14} /> Levert — skrivebeskyttet</div>}
        </div>
        {aktiv.punkter.map(p => (
          <Punkt key={p.id} punkt={p} laast={aktiv.levert || !!somAnsatt || aktiv.min === false}
            onEndre={felter => endrePunkt(aktiv.id, p.id, felter)} />
        ))}
        {!aktiv.levert && !somAnsatt && aktiv.min !== false && gjort === aktiv.punkter.length && aktiv.punkter.length > 0 && (
          <SignerOgLever navn={data.navn} onLever={navn => leverListe(aktiv.id, navn)} />
        )}
        <div className="ksf-fot">Alt lagres automatisk mens du fyller ut.</div>
        {bunnmeny}
      </div>
    );
  }

  const erAL = !!data.erAnleggsleder && !somAnsatt;
  return (
    <div className="ksf ksf--medMeny">
      {topp}
      <div className="ksf-hilsen">Hei {data.fornavn}!</div>
      {!somAnsatt && <HjemskjermHint />}
      {(data.prosjekter || []).length === 0 && (
        <div className="ksf-kort" style={{ color: 'var(--text-muted)' }}>
          Du er ikke satt opp på noen prosjekter ennå, og ingen sjekklister er
          tildelt deg — spør prosjektlederen din. Rutinene finner du i
          Rutiner-fanen nederst.
        </div>
      )}
      {(data.prosjekter || []).map(p => {
        // Vanlige ansatte ser egne lister; AL ser alle på prosjektet (for tildeling)
        const lister = p.sjekklister.filter(sl => sl.min !== false || erAL);
        return (
          <div key={p.id} className="ksf-kort">
            <div className="ksf-prosjekt-navn"><Ikon ikon={Building2} size={15} /> {p.navn}</div>
            {lister.length === 0 && <div className="ksf-tom">Ingen sjekklister er tildelt deg her ennå.</div>}
            {lister.map(sl => {
              const gjort = sl.punkter.filter(x => x.status === 'ok' || x.status === 'ikke-aktuelt').length;
              return (
                <div key={sl.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button className="ksf-sl-rad" style={{ flex: 1, minWidth: 0 }} onClick={() => setValgt({ prosjektId: p.id, sjekklisteId: sl.id })}>
                    <span className="ksf-sl-rad-navn">{sl.navn}{erAL && sl.min === false && (sl.ansvarlig || []).length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({(sl.ansvarlig || []).map(n => n.split(' ')[0]).join(', ')})</span>}</span>
                    <span className={`ksf-badge ksf-badge--${sl.status}`}>{sl.levert ? 'Levert' : STATUS_TEKST[sl.status] || sl.status}</span>
                    <span className="ksf-sl-rad-teller">{gjort}/{sl.punkter.length}</span>
                  </button>
                  {erAL && !sl.levert && (
                    <button className="ksf-lenkeknapp" title="Tildel ansvarlige fra laget"
                      onClick={() => {
                        const lag = p.lag || [];
                        if (!lag.length) { window.alert('Ingen er bemannet på prosjektet ennå.'); return; }
                        const naa = new Set(sl.ansvarlig || []);
                        const valg = lag.map((a, i) => `${naa.has(a.navn) ? '✓' : ' '} ${i + 1}. ${a.navn}${a.fag ? ' (' + a.fag + ')' : ''}`).join('\n');
                        const svar = window.prompt('Hvem er ansvarlige for «' + sl.navn + '»?\nSkriv numrene atskilt med komma (tom = fjern alle):\n\n' + valg);
                        if (svar === null) return;
                        const idx = svar.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(i => i >= 0 && i < lag.length);
                        alHandling('sjekkliste-ansvarlig', { sjekklisteId: sl.id, navnListe: idx.map(i => lag[i].navn) });
                      }}>
                      Tildel
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <div className="ksf-fot">Din personlige lenke — ikke del den med andre. Trenger du ny? Spør prosjektleder.</div>
      {bunnmeny}
    </div>
  );
}
