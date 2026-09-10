// Endringsmeldinger på Kunde-fanen (postkasse-oppdrag 20).
// Snakker med tilbuds-appen via vår egen proxy /api/endringsordrer —
// aldri direkte (INTER_APP_TOKEN lever kun på serveren). Ingen lokal
// lagring utover visnings-cache: hent ferskt ved åpning, og etter hver
// handling oppdateres cachen fra handlingens eget svar (Vercel Blob er
// eventually consistent, så umiddelbar refetch kan gi gammelt innhold).

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Send, Ban, Lock, CircleCheck } from 'lucide-react';
import { Ikon, IkonTekst } from './Ikon';

const STATUS = {
  utkast:    { tekst: 'Utkast',           farge: '#5d6b80', bg: '#f1f5f9' },
  sendt:     { tekst: 'Venter på kunden', farge: '#b45309', bg: '#fef3c7' },
  godkjent:  { tekst: 'Godkjent',         farge: '#15803d', bg: '#dcfce7' },
  avvist:    { tekst: 'Avvist',           farge: '#dc2626', bg: '#fee2e2' },
  annullert: { tekst: 'Annullert',        farge: '#5d6b80', bg: '#f1f5f9' },
};

const fmtKr = n => (n || n === 0) ? new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n) : '—';
const TOM_POST = () => ({ navn: '', mengde: '', enhet: '', pris: '' });

async function apiKall(body) {
  const r = await fetch('/api/endringsordrer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fbs_token') || '') },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Noe gikk galt (${r.status})`);
  return data;
}

export default function Endringsmeldinger({ tilbudId, nyTrigger = 0 }) {
  const [data, setData] = useState(null);        // null = laster; { feil } eller API-svaret
  const [skjema, setSkjema] = useState(null);    // null | { id?, tittel, beskrivelse, poster }
  const [sendSms, setSendSms] = useState(false);
  const [skjemaFeil, setSkjemaFeil] = useState(null);
  const [jobber, setJobber] = useState(false);

  const hent = useCallback(async () => {
    if (!tilbudId) return;
    try {
      const r = await fetch(`/api/endringsordrer?tilbudId=${encodeURIComponent(tilbudId)}`, {
        headers: { Authorization: 'Bearer ' + (localStorage.getItem('fbs_token') || '') },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setData({ feil: d.error || `Fikk ikke hentet endringsmeldinger (${r.status})` });
      else setData(d);
    } catch {
      setData({ feil: 'Fikk ikke kontakt med serveren.' });
    }
  }, [tilbudId]);
  useEffect(() => { hent(); }, [hent]);

  const erAkseptert = data?.erAkseptert === true;
  const overtatt = !!data?.overtattDato;
  const kanLage = erAkseptert && !overtatt;

  const apneNytt = useCallback(() => {
    setSkjemaFeil(null); setSendSms(false);
    setSkjema({ tittel: '', beskrivelse: '', poster: [TOM_POST()] });
  }, []);
  useEffect(() => { if (nyTrigger > 0) apneNytt(); }, [nyTrigger, apneNytt]);

  const settOrdre = ordre => setData(d => {
    if (!d || d.feil || !ordre) return d;
    const ordrer = [...(d.ordrer || [])];
    const i = ordrer.findIndex(o => o.id === ordre.id);
    if (i >= 0) ordrer[i] = ordre; else ordrer.push(ordre);
    return { ...d, ordrer };
  });

  const posterTilApi = () => (skjema.poster || [])
    .filter(p => (p.navn || '').trim())
    .map(p => ({
      navn: p.navn.trim(),
      mengde: p.mengde === '' ? 1 : Number(p.mengde),
      enhet: (p.enhet || '').trim(),
      pris: Number(p.pris) || 0,
    }));

  // NB: tilbuds-appens server beregner sumEksMva som Σ pris (pris = SUM for
  // posten, ikke enhetspris — antall/enhet er beskrivende felter). Live-summen
  // her MÅ regne likt, ellers spriker skjemaet mot det kunden får se.
  const sumEks = (skjema?.poster || []).reduce((s, p) => s + (Number(p.pris) || 0), 0);

  async function lagreUtkast({ ogSend = false } = {}) {
    setSkjemaFeil(null);
    const poster = posterTilApi();
    if (!(skjema.tittel || '').trim()) return setSkjemaFeil('Tittel mangler.');
    if (!poster.length) return setSkjemaFeil('Legg inn minst én post (hva-feltet må fylles ut).');
    if (sumEks <= 0) return setSkjemaFeil('Summen må være over 0 kr.');
    setJobber(true);
    try {
      const svar = skjema.id
        ? await apiKall({ handling: 'oppdater', id: skjema.id, tittel: skjema.tittel.trim(), beskrivelse: (skjema.beskrivelse || '').trim(), poster })
        : await apiKall({ handling: 'opprett', tilbudId: Number(tilbudId), tittel: skjema.tittel.trim(), beskrivelse: (skjema.beskrivelse || '').trim(), poster });
      let ordre = svar.ordre;
      if (ogSend) {
        const sendSvar = await apiKall({ handling: 'send', id: ordre?.id || skjema.id, smsOgsaa: sendSms });
        ordre = sendSvar.ordre || ordre;
      }
      settOrdre(ordre);
      setSkjema(null);
    } catch (e) {
      setSkjemaFeil(e.message);
    } finally {
      setJobber(false);
    }
  }

  async function sendUtkast(o) {
    if (!window.confirm(`Sende «${o.tittel}» til kunden? Innholdet låses ved sending.`)) return;
    setJobber(true);
    try {
      const svar = await apiKall({ handling: 'send', id: o.id, smsOgsaa: false });
      settOrdre(svar.ordre);
    } catch (e) {
      window.alert(e.message);
    } finally {
      setJobber(false);
    }
  }

  async function annuller(o) {
    if (!window.confirm(`Annullere «${o.tittel}»? Den beholdes i historikken som annullert.`)) return;
    setJobber(true);
    try {
      const svar = await apiKall({ handling: 'annuller', id: o.id });
      settOrdre(svar.ordre || { ...o, status: 'annullert' });
    } catch (e) {
      window.alert(e.message);
    } finally {
      setJobber(false);
    }
  }

  function rediger(o) {
    setSkjemaFeil(null); setSendSms(false);
    setSkjema({
      id: o.id,
      tittel: o.tittel || '',
      beskrivelse: o.beskrivelse || '',
      poster: (o.poster || []).length
        ? o.poster.map(p => ({ navn: p.navn || '', mengde: p.mengde ?? '', enhet: p.enhet || '', pris: p.pris ?? '' }))
        : [TOM_POST()],
    });
  }

  const k = data?.kontraktssum;
  const ordrer = data?.ordrer || [];

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Endringsmeldinger</span>
        <button className="btn btn-sm" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          disabled={!kanLage || !!skjema} onClick={apneNytt}
          title={kanLage ? 'Ny endringsmelding til kunden' : 'Endringsmeldinger krever et akseptert tilbud'}>
          <Ikon ikon={Plus} size={13} /> Ny endringsmelding
        </button>
      </div>

      {data === null && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Henter endringsmeldinger…</div>}
      {data?.feil && <div style={{ fontSize: 12.5, color: '#dc2626' }}>{data.feil}</div>}

      {data && !data.feil && (
        <>
          {!erAkseptert && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }}>
              Tilbudet er ikke akseptert ennå — endringsmeldinger kan først sendes når
              kunden har akseptert (kontrakten må finnes før den kan endres).
            </div>
          )}
          {overtatt && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }}>
              Prosjektet er overtatt — nye endringsmeldinger kan ikke opprettes.
            </div>
          )}

          {k && (k.opprinnelig || k.godkjenteEndringer) ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '6px 0', borderBottom: ordrer.length ? '1px solid var(--bg-subtle, #f1f5f9)' : 'none' }}>
              Kontrakt: {fmtKr(k.opprinnelig)}
              {k.godkjenteEndringer ? <> + endringer {fmtKr(k.godkjenteEndringer)} = <b style={{ color: 'var(--text-primary, #1e293b)' }}>{fmtKr(k.gjeldende)}</b></> : null}
            </div>
          ) : null}

          {ordrer.length === 0 && erAkseptert && !skjema && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
              Ingen endringsmeldinger ennå. «Ny endringsmelding» lager en her —
              kunden godkjenner i kundeportalen.
            </div>
          )}

          {ordrer.map(o => {
            const st = STATUS[o.status] || STATUS.utkast;
            const laast = o.status === 'sendt' || o.status === 'godkjent';
            return (
              <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--bg-subtle, #f1f5f9)', opacity: o.status === 'annullert' ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
                  <span style={{ fontWeight: 500, textDecoration: o.status === 'annullert' ? 'line-through' : 'none' }}>{o.tittel || 'Endring'}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: st.farge, background: st.bg, borderRadius: 7, padding: '2px 8px' }}>{st.tekst}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 500 }}>{fmtKr(o.sumInklMva)} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11.5 }}>inkl. mva</span></span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {[
                    o.sendtDato ? `Sendt ${new Date(o.sendtDato).toLocaleDateString('nb-NO')}` : null,
                    o.status === 'godkjent' && o.signatur ? `Signert av ${o.signatur.navn}${o.signatur.tidspunkt ? ' · ' + new Date(o.signatur.tidspunkt).toLocaleDateString('nb-NO') : ''}` : null,
                    o.status === 'avvist' && o.avgjortDato ? `Avvist ${new Date(o.avgjortDato).toLocaleDateString('nb-NO')}` : null,
                    o.opprettetAv ? `av ${o.opprettetAv}` : null,
                  ].filter(Boolean).join(' · ')}
                </div>
                {o.status === 'avvist' && o.kommentarFraKunde && (
                  <div style={{ fontSize: 12.5, color: '#b45309', marginTop: 3 }}>Kunden: «{o.kommentarFraKunde}»</div>
                )}
                {laast && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Ikon ikon={Lock} size={11} /> Låst — innholdet er fryst
                  </div>
                )}
                {o.status === 'utkast' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button className="btn btn-sm" disabled={jobber || !!skjema} onClick={() => rediger(o)}><IkonTekst ikon={Pencil} size={12} gap={4}>Rediger</IkonTekst></button>
                    <button className="btn btn-sm" disabled={jobber || !!skjema} onClick={() => sendUtkast(o)}><IkonTekst ikon={Send} size={12} gap={4}>Send til kunde</IkonTekst></button>
                    <button className="btn btn-sm" disabled={jobber || !!skjema} style={{ color: '#b45309' }} onClick={() => annuller(o)}><IkonTekst ikon={Ban} size={12} gap={4}>Annuller</IkonTekst></button>
                  </div>
                )}
              </div>
            );
          })}

          {skjema && (
            <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg-subtle, #f8fafc)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{skjema.id ? 'Rediger utkast' : 'Ny endringsmelding'}</div>
              <input className="input" style={{ width: '100%', marginBottom: 6 }} placeholder="Tittel (f.eks. «Ekstra stikkontakter kjøkken»)"
                maxLength={120} value={skjema.tittel} onChange={e => setSkjema(s => ({ ...s, tittel: e.target.value }))} />
              <textarea className="input" style={{ width: '100%', minHeight: 54, marginBottom: 8, resize: 'vertical' }}
                placeholder="Beskrivelse til kunden (valgfritt)" maxLength={5000}
                value={skjema.beskrivelse} onChange={e => setSkjema(s => ({ ...s, beskrivelse: e.target.value }))} />

              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Poster</div>
              {skjema.poster.map((p, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 2fr) 64px 64px 100px 28px', gap: 6, marginBottom: 5 }}>
                  <input className="input" placeholder="Hva" value={p.navn}
                    onChange={e => setSkjema(s => ({ ...s, poster: s.poster.map((x, j) => j === i ? { ...x, navn: e.target.value } : x) }))} />
                  <input className="input" placeholder="Antall" type="number" min="0" step="any" value={p.mengde}
                    onChange={e => setSkjema(s => ({ ...s, poster: s.poster.map((x, j) => j === i ? { ...x, mengde: e.target.value } : x) }))} />
                  <input className="input" placeholder="Enhet" value={p.enhet}
                    onChange={e => setSkjema(s => ({ ...s, poster: s.poster.map((x, j) => j === i ? { ...x, enhet: e.target.value } : x) }))} />
                  <input className="input" placeholder="Sum eks. mva" title="Summen for hele posten (eks. mva) — antall og enhet er til forklaring for kunden" type="number" min="0" step="any" value={p.pris}
                    onChange={e => setSkjema(s => ({ ...s, poster: s.poster.map((x, j) => j === i ? { ...x, pris: e.target.value } : x) }))} />
                  <button className="btn btn-sm" title="Fjern posten" disabled={skjema.poster.length === 1}
                    onClick={() => setSkjema(s => ({ ...s, poster: s.poster.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
              <button className="btn btn-sm" style={{ marginBottom: 8 }} disabled={skjema.poster.length >= 50}
                onClick={() => setSkjema(s => ({ ...s, poster: [...s.poster, TOM_POST()] }))}>+ Post</button>

              <div style={{ fontSize: 13, marginBottom: 8 }}>
                Sum: <b>{fmtKr(sumEks)}</b> eks. mva · <b>{fmtKr(Math.round(sumEks * 1.25))}</b> inkl. mva
              </div>

              {skjemaFeil && (
                <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fee2e2', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>{skjemaFeil}</div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-sm" disabled={jobber} onClick={() => lagreUtkast()}>Lagre utkast</button>
                <button className="btn btn-sm btn-primary" disabled={jobber} onClick={() => lagreUtkast({ ogSend: true })}>
                  <IkonTekst ikon={Send} size={12} gap={5}>{jobber ? 'Sender…' : 'Send til kunde'}</IkonTekst>
                </button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} /> Send også SMS
                </label>
                <button className="btn btn-sm" style={{ marginLeft: 'auto' }} disabled={jobber} onClick={() => setSkjema(null)}>Avbryt</button>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Ikon ikon={CircleCheck} size={11} /> Kunden får e-post med lenke til kundeportalen og godkjenner der. Ved sending låses innholdet.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
