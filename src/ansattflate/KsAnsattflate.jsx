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

// Ett automatisk nytt forsøk ved nettverksfeil — byggeplass-nett er upålitelig.
// Serveren tåler dobbeltkall per handling (idempotent skriving).
async function api(metode, token, body, forsok = 0) {
  try {
    const r = await fetch(`/api/ks/flate${metode === 'GET' ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: metode,
      headers: { 'Content-Type': 'application/json' },
      ...(metode === 'POST' ? { body: JSON.stringify({ token, ...body }) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch {
    if (forsok < 1) { await new Promise(res => setTimeout(res, 800)); return api(metode, token, body, forsok + 1); }
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
            <label className="ksf-lenkeknapp" style={{ cursor: lagrer ? 'wait' : 'pointer' }}>
              <Ikon ikon={Camera} size={12} /> {punkt.krever_bilde && !(punkt.bilder || []).length ? 'Bilde (påkrevd)' : 'Ta bilde'}
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
function FramdriftFane({ prosjekter }) {
  if (!prosjekter.length) return <div className="ksf-kort" style={{ color: 'var(--text-muted)' }}>Du står ikke på noen aktive prosjekter akkurat nå.</div>;
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
      {!p.framdrift && <div className="ksf-tom">Ingen framdriftsplan ennå.</div>}
      {(p.framdrift || []).map((f, i) => {
        const st = FASE_STATUS[f.status] || FASE_STATUS.kommer;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: i ? '1px solid var(--bg-subtle, #f1f5f9)' : 'none' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: f.pagarNa ? 600 : 400 }}>
              {f.tittel}
              {f.pagarNa && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#c2410c', fontWeight: 600 }}><Ikon ikon={Flame} size={11} /> Pågår nå</span>}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{f.periodeTekst}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: st.farge, background: st.bg, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>{st.tekst}</span>
          </div>
        );
      })}
    </div>
  ));
}

// ── Oppdrag 11E: Bemanning — lesevisning av bemanningsplanen ──
// Serveren filtrerer (aldri sykmelding/fraværsårsak/kontaktinfo om andre;
// andres ferie er utelatt). Egen rad utheves; «Din uke» øverst.
const DAG_BOKSTAV = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];
function BemanningFane({ token }) {
  const [uke, setUke] = useState(0);
  const [data, setData] = useState(null);
  const [feil, setFeil] = useState(false);
  useEffect(() => {
    let aktiv = true;
    setData(null); setFeil(false);
    (async () => {
      try {
        const r = await fetch(`/api/ks/flate?token=${encodeURIComponent(token)}&bemanningUke=${uke}`);
        const d = await r.json().catch(() => ({}));
        if (!aktiv) return;
        if (r.ok && d.bemanning) setData(d.bemanning); else setFeil(true);
      } catch { if (aktiv) setFeil(true); }
    })();
    return () => { aktiv = false; };
  }, [token, uke]);

  const ukeTekst = data ? `Uke ${(() => { const d = new Date(data.dager[3] + 'T12:00:00Z'); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7); })()}` : '';

  return (
    <>
      <div className="ksf-kort" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="ksf-knapp" style={{ padding: '4px 10px' }} disabled={uke <= -1} onClick={() => setUke(u => u - 1)}><Ikon ikon={ChevronLeft} size={15} /></button>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 14 }}>
          {ukeTekst}{uke === 0 ? ' (denne uka)' : uke === 1 ? ' (neste uke)' : ''}
        </span>
        <button className="ksf-knapp" style={{ padding: '4px 10px' }} disabled={uke >= 8} onClick={() => setUke(u => u + 1)}><Ikon ikon={ChevronRight} size={15} /></button>
      </div>
      {feil && <div className="ksf-kort ksf-feilkort"><p>Fikk ikke hentet bemanningen — prøv igjen.</p></div>}
      {!data && !feil && <div className="ksf-kort" style={{ textAlign: 'center' }}><Ikon ikon={Loader} size={20} className="ksf-spinn" /></div>}
      {data && (
        <>
          <div className="ksf-kort" style={{ borderLeft: '3px solid #185FA5' }}>
            <div className="ksf-prosjekt-navn">Din uke</div>
            {data.dinUke.map(d => (
              <div key={d.dato} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '3px 0' }}>
                <span style={{ width: 92, color: 'var(--text-muted)' }}>{new Date(d.dato + 'T00:00:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span style={{ fontWeight: d.tekst ? 500 : 400, color: d.tekst ? 'inherit' : 'var(--text-muted)' }}>{d.tekst || 'Ikke satt opp'}</span>
              </div>
            ))}
          </div>
          {data.prosjekter.map((p, i) => (
            <div key={i} className="ksf-kort">
              <div className="ksf-prosjekt-navn"><Ikon ikon={Building2} size={15} /> {p.navn}</div>
              <div style={{ display: 'flex', gap: 0, fontSize: 10.5, color: 'var(--text-muted)', padding: '2px 0 4px', marginLeft: 110 }}>
                {DAG_BOKSTAV.map((b, j) => <span key={j} style={{ width: 22, textAlign: 'center' }}>{b}</span>)}
              </div>
              {p.rader.map((r, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'center', fontSize: 12.5, padding: '2px 0', fontWeight: r.erDeg ? 600 : 400, color: r.erDeg ? '#185FA5' : 'inherit' }}>
                  <span style={{ width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.erDeg ? 'Deg' : r.navn}</span>
                  {r.dager.map((på, k) => (
                    <span key={k} style={{ width: 22, textAlign: 'center', color: på ? (r.erDeg ? '#185FA5' : '#15803d') : '#e2e8f0' }}>{på ? '●' : '·'}</span>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {data.prosjekter.length === 0 && <div className="ksf-kort" style={{ color: 'var(--text-muted)' }}>Ingen bemanning registrert denne uka.</div>}
        </>
      )}
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

export default function KsAnsattflate({ token }) {
  const [data, setData] = useState(null);
  const [feil, setFeil] = useState(null);
  const [laster, setLaster] = useState(true);
  const [valgt, setValgt] = useState(null); // { prosjektId, sjekklisteId }
  const [fane, setFane] = useState('sjekklister'); // Oppdrag 11B: bunnmeny

  const hent = useCallback(async () => {
    setLaster(true);
    const r = await api('GET', token);
    setLaster(false);
    // Godta kun svar med kjent form — alt annet (proxy-HTML, nettverksfeil,
    // tomme svar) vises som feil i stedet for å krasje flaten.
    if (r.data && (r.data.maaVerifisere || Array.isArray(r.data.prosjekter))) { setFeil(null); setData(r.data); }
    else setFeil((r.data && r.data.error) || 'Fikk ikke kontakt — sjekk nettet og prøv igjen.');
  }, [token]);
  useEffect(() => { hent(); }, [hent]);

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
    <header className="ksf-topp">
      <span className="ksf-logo">FBS</span>
      <span className="ksf-topp-tittel"><Ikon ikon={HardHat} size={16} /> KS-sjekklister</span>
      <button className="ksf-oppdater" onClick={hent} title="Oppdater"><Ikon ikon={RefreshCw} size={15} /></button>
    </header>
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
    return <div className="ksf ksf--medMeny">{topp}<div className="ksf-hilsen">Hei {data.fornavn}!</div><FramdriftFane prosjekter={data.prosjekter || []} />{bunnmeny}</div>;
  }
  if (fane === 'bemanning') {
    return <div className="ksf ksf--medMeny">{topp}<BemanningFane token={token} />{bunnmeny}</div>;
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
          <Punkt key={p.id} punkt={p} laast={aktiv.levert}
            onEndre={felter => endrePunkt(aktiv.id, p.id, felter)} />
        ))}
        {!aktiv.levert && gjort === aktiv.punkter.length && aktiv.punkter.length > 0 && (
          <SignerOgLever navn={data.navn} onLever={navn => leverListe(aktiv.id, navn)} />
        )}
        <div className="ksf-fot">Alt lagres automatisk mens du fyller ut.</div>
        {bunnmeny}
      </div>
    );
  }

  return (
    <div className="ksf ksf--medMeny">
      {topp}
      <div className="ksf-hilsen">Hei {data.fornavn}!</div>
      {(data.prosjekter || []).length === 0 && (
        <div className="ksf-kort" style={{ color: 'var(--text-muted)' }}>Du står ikke på noen aktive prosjekter i bemanningsplanen akkurat nå.</div>
      )}
      {(data.prosjekter || []).map(p => (
        <div key={p.id} className="ksf-kort">
          <div className="ksf-prosjekt-navn"><Ikon ikon={Building2} size={15} /> {p.navn}</div>
          {p.sjekklister.length === 0 && <div className="ksf-tom">Ingen sjekklister tildelt deg her ennå.</div>}
          {p.sjekklister.map(sl => {
            const gjort = sl.punkter.filter(x => x.status === 'ok' || x.status === 'ikke-aktuelt').length;
            return (
              <button key={sl.id} className="ksf-sl-rad" onClick={() => setValgt({ prosjektId: p.id, sjekklisteId: sl.id })}>
                <span className="ksf-sl-rad-navn">{sl.navn}</span>
                <span className={`ksf-badge ksf-badge--${sl.status}`}>{sl.levert ? 'Levert' : STATUS_TEKST[sl.status] || sl.status}</span>
                <span className="ksf-sl-rad-teller">{gjort}/{sl.punkter.length}</span>
              </button>
            );
          })}
        </div>
      ))}
      <div className="ksf-fot">Din personlige lenke — ikke del den med andre. Trenger du ny? Spør prosjektleder.</div>
      {bunnmeny}
    </div>
  );
}
