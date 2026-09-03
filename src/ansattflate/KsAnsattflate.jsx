// ═══ KS-ansattflaten — /ks/<token> (SPEC-ks-ansattflate.md PR1) ═══
// Lukket mobilflate for de på byggeplassen: egne prosjekter, tildelte
// sjekklister, ett-trykks kvittering per punkt. Ingen nav til resten av
// appen, ingen vanlig innlogging — personlig token i URL-en.
// Autolagring: hver handling POST-es umiddelbart (nett på byggeplass er
// upålitelig — feil vises og handlingen kan gjentas, ingenting går tapt lokalt).
import { useState, useEffect, useCallback } from 'react';
import {
  HardHat, CircleCheck, Circle, CircleSlash, MessageSquare, ChevronLeft,
  Loader, TriangleAlert, Building2, RefreshCw,
} from 'lucide-react';
import { Ikon } from '../komponenter/Ikon';
import './ksflate.css';

const STATUS_TEKST = { 'ikke-startet': 'Ikke startet', 'pagar': 'Påbegynt', 'ferdig': 'Ferdig' };

async function api(metode, token, body) {
  const r = await fetch(`/api/ks/flate${metode === 'GET' ? `?token=${encodeURIComponent(token)}` : ''}`, {
    method: metode,
    headers: { 'Content-Type': 'application/json' },
    ...(metode === 'POST' ? { body: JSON.stringify({ token, ...body }) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
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
        </div>
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

export default function KsAnsattflate({ token }) {
  const [data, setData] = useState(null);
  const [feil, setFeil] = useState(null);
  const [laster, setLaster] = useState(true);
  const [valgt, setValgt] = useState(null); // { prosjektId, sjekklisteId }

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
    const r = await api('POST', token, { handling: 'punkt', sjekklisteId, punktId, ...felter });
    if (!r.ok) { if (r.data.laast || r.data.utlopt) hent(); return false; }
    // Oppdater lokalt (autolagret på server allerede)
    setData(d => ({
      ...d,
      prosjekter: d.prosjekter.map(p => ({
        ...p,
        sjekklister: p.sjekklister.map(sl => sl.id !== sjekklisteId ? sl : {
          ...sl, status: r.data.sjekklisteStatus,
          punkter: sl.punkter.map(pk => pk.id === punktId ? r.data.punkt : pk),
        }),
      })),
    }));
    return true;
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
        <div className="ksf-fot">Alt lagres automatisk. Signering og bilder kommer i neste versjon — lever via prosjektleder inntil videre.</div>
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
      <div className="ksf-fot">Din personlige lenke — ikke del den med andre. Trenger du ny? Spør prosjektleder.</div>
    </div>
  );
}
