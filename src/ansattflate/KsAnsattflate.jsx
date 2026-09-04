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
      <button className="ksf-tilbake" onClick={onTilbake}><Ikon ikon={ChevronLeft} size={16} /> Mine sjekklister</button>
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
  const [visHms, setVisHms] = useState(false); // PR3: HMS-rutiner-seksjonen

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
  const aktiv = valgt && alleSl.find(sl => sl.id === valgt.sjekklisteId);
  const hmsIds = Array.isArray(data.hmsRutiner) ? data.hmsRutiner : [];

  if (visHms) {
    return <div className="ksf">{topp}<HmsRutiner ids={hmsIds} onTilbake={() => setVisHms(false)} /></div>;
  }

  if (aktiv) {
    const gjort = aktiv.punkter.filter(p => p.status === 'ok' || p.status === 'ikke-aktuelt').length;
    return (
      <div className="ksf">
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
      </div>
    );
  }

  return (
    <div className="ksf">
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
      {hmsIds.length > 0 && (
        <div className="ksf-kort">
          <button className="ksf-sl-rad" onClick={() => setVisHms(true)}>
            <span className="ksf-sl-rad-navn"><Ikon ikon={BookOpen} size={15} style={{ marginRight: 6 }} />HMS-rutiner</span>
            <span className="ksf-sl-rad-teller">{hmsIds.length}</span>
          </button>
        </div>
      )}
      <div className="ksf-fot">Din personlige lenke — ikke del den med andre. Trenger du ny? Spør prosjektleder.</div>
    </div>
  );
}
