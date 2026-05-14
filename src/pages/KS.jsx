import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';

const TOKEN = () => localStorage.getItem('fbs_token') || '';
const BRUKER = () => localStorage.getItem('fbs_user_navn') || 'Ukjent';
const ROLLE = () => localStorage.getItem('fbs_role') || 'ansatt';

const KAT_LABEL = {
  hms: 'HMS', bad: 'Bad / Våtrom', fasade: 'Fasade', tak: 'Tak',
  tomrer: 'Tømrer', maler: 'Maling', ror: 'Rørlegger', el: 'Elektrisk',
};
const KAT_FARGE = {
  hms: '#dc2626', bad: '#0891b2', fasade: '#ea580c', tak: '#7c3aed',
  tomrer: '#854d0e', maler: '#be185d', ror: '#1d4ed8', el: '#f59e0b',
};
const STATUS_CFG = {
  'ikke-startet': { label: 'Ikke startet', farge: '#94a3b8', bg: '#f8fafc', ikon: '⚪' },
  'pagar':        { label: 'Pågår',        farge: '#f59e0b', bg: '#fffbeb', ikon: '🟡' },
  'ferdig':       { label: 'Ferdig',       farge: '#16a34a', bg: '#f0fdf4', ikon: '🟢' },
};
const PUNKT_STATUS = ['ikke-utfort', 'ok', 'avvik', 'ikke-aktuelt'];
const PUNKT_LABEL = { 'ikke-utfort': 'Ikke utført', ok: 'OK ✓', avvik: 'Avvik ⚠', 'ikke-aktuelt': 'N/A' };
const PUNKT_FARGE = { 'ikke-utfort': '#94a3b8', ok: '#16a34a', avvik: '#dc2626', 'ikke-aktuelt': '#64748b' };

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN()}`, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function prosent(sjekkliste) {
  const pts = sjekkliste.punkter || [];
  if (!pts.length) return 0;
  const ferdig = pts.filter(p => p.status === 'ok' || p.status === 'ikke-aktuelt').length;
  return Math.round((ferdig / pts.length) * 100);
}

function ProsjektKort({ prosjekt, sjekklister, onClick }) {
  const mine = sjekklister.filter(s => s.prosjektId === prosjekt.id);
  const ferdig = mine.filter(s => s.status === 'ferdig').length;
  const avvik = mine.filter(s => (s.punkter || []).some(p => p.status === 'avvik')).length;
  const pst = mine.length ? Math.round((ferdig / mine.length) * 100) : 0;

  return (
    <div className="ks-prosjekt-kort" onClick={onClick}>
      <div className="ks-pk-farge" style={{ background: prosjekt.farge || '#6b7280' }} />
      <div className="ks-pk-innhold">
        <div className="ks-pk-navn">{prosjekt.navn}</div>
        {prosjekt.adresse && <div className="ks-pk-adresse">📍 {prosjekt.adresse}</div>}
        <div className="ks-pk-meta">
          <span className="ks-pk-chip">{mine.length} sjekklister</span>
          <span className="ks-pk-chip" style={{ background: '#f0fdf4', color: '#16a34a' }}>{ferdig} ferdig</span>
          {avvik > 0 && <span className="ks-pk-chip" style={{ background: '#fef2f2', color: '#dc2626' }}>⚠ {avvik} avvik</span>}
        </div>
        <div className="ks-pk-bar-wrap">
          <div className="ks-pk-bar" style={{ width: pst + '%', background: avvik ? '#f59e0b' : '#16a34a' }} />
        </div>
        <div className="ks-pk-pst">{pst}% ferdig</div>
      </div>
    </div>
  );
}

function SjekklisteKort({ sl, onClick }) {
  const cfg = STATUS_CFG[sl.status] || STATUS_CFG['ikke-startet'];
  const pst = prosent(sl);
  const avvik = (sl.punkter || []).filter(p => p.status === 'avvik').length;
  const kreverBilde = (sl.punkter || []).filter(p => p.krever_bilde).length;
  const kreverSign = (sl.punkter || []).filter(p => p.krever_signering).length;

  return (
    <div className="ks-sl-kort" onClick={onClick} style={{ borderLeft: `4px solid ${KAT_FARGE[sl.kategori] || '#6b7280'}` }}>
      <div className="ks-sl-topp">
        <div>
          <div className="ks-sl-navn">{sl.navn}</div>
          <div className="ks-sl-meta">
            <span className="ks-sl-chip" style={{ background: (KAT_FARGE[sl.kategori] || '#6b7280') + '22', color: KAT_FARGE[sl.kategori] || '#6b7280' }}>
              {KAT_LABEL[sl.kategori] || sl.kategori}
            </span>
            {kreverBilde > 0 && <span className="ks-sl-chip">📷 {kreverBilde}</span>}
            {kreverSign > 0 && <span className="ks-sl-chip">✍️ {kreverSign}</span>}
          </div>
        </div>
        <span className="ks-sl-status" style={{ background: cfg.bg, color: cfg.farge }}>
          {cfg.ikon} {cfg.label}
        </span>
      </div>
      {avvik > 0 && <div className="ks-sl-avvik">⚠ {avvik} avvik registrert</div>}
      <div className="ks-sl-bar-wrap">
        <div className="ks-sl-bar" style={{ width: pst + '%', background: avvik ? '#f59e0b' : '#16a34a' }} />
      </div>
      <div className="ks-sl-pst">{pst}% · {(sl.punkter || []).filter(p => p.status === 'ok' || p.status === 'ikke-aktuelt').length} / {(sl.punkter || []).length} punkter</div>
    </div>
  );
}

function LeggTilModal({ prosjektId, maler, eksisterendeMalIds, onLagre, onLukk }) {
  const [valgte, setValgte] = useState([]);
  const [sok, setSok] = useState('');

  const filtrert = maler.filter(m =>
    !eksisterendeMalIds.has(m.id) &&
    (m.navn.toLowerCase().includes(sok.toLowerCase()) ||
      (KAT_LABEL[m.kategori] || m.kategori).toLowerCase().includes(sok.toLowerCase()))
  );

  function toggle(id) {
    setValgte(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
  }

  async function leggTil() {
    for (const malId of valgte) {
      const mal = maler.find(m => m.id === malId);
      if (!mal) continue;
      await apiFetch('/api/ks/sjekklister', {
        method: 'POST',
        body: {
          prosjektId,
          malId: mal.id,
          malVersjon: mal.versjon || 1,
          navn: mal.navn,
          kategori: mal.kategori,
          status: 'ikke-startet',
          ansvarlig: [],
          punkter: (mal.punkter || []).map(p => ({
            ...p,
            status: 'ikke-utfort',
            kommentar: '',
            bilder: [],
            signert_av: null,
            signert_dato: null,
            utfort_av: null,
            utfort_dato: null,
          })),
        },
      });
    }
    onLagre();
  }

  return (
    <div className="modal-backdrop" onClick={onLukk}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Legg til sjekklister</h3>
          <button className="btn-icon" onClick={onLukk}>✕</button>
        </div>
        <div className="form">
          <input className="input" placeholder="🔍 Søk mal..." value={sok} onChange={e => setSok(e.target.value)} style={{ marginBottom: 12 }} />
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(KAT_LABEL).map(([kat, katLabel]) => {
              const i = filtrert.filter(m => m.kategori === kat);
              if (!i.length) return null;
              return (
                <div key={kat}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: KAT_FARGE[kat] || '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 0 4px' }}>{katLabel}</div>
                  {i.map(m => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', background: valgte.includes(m.id) ? '#eff6ff' : '#fff', border: `1px solid ${valgte.includes(m.id) ? '#3b82f6' : '#e2e8f0'}` }}>
                      <input type="checkbox" checked={valgte.includes(m.id)} onChange={() => toggle(m.id)} />
                      <span style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{m.navn}</span>
                        {m.obligatorisk && <span style={{ marginLeft: 6, fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 5px' }}>Obligatorisk</span>}
                        <span style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>{m.punkter?.length || 0} punkter</span>
                      </span>
                    </label>
                  ))}
                </div>
              );
            })}
            {!filtrert.length && <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>Ingen maler å legge til</div>}
          </div>
          <div className="modal-actions" style={{ marginTop: 12 }}>
            <button className="btn" onClick={onLukk}>Avbryt</button>
            <button className="btn btn-primary" onClick={leggTil} disabled={!valgte.length}>
              + Legg til {valgte.length > 0 ? `(${valgte.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignerModal({ punkt, sjekklisteNavn, onSigner, onLukk }) {
  const [bekreftet, setBekreftet] = useState(false);
  const navn = BRUKER();

  return (
    <div className="modal-backdrop" onClick={onLukk}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>✍️ Signer punkt</h3>
          <button className="btn-icon" onClick={onLukk}>✕</button>
        </div>
        <div className="form">
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#475569' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Punkt:</div>
            <div>"{punkt.tekst}"</div>
            <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 11 }}>Sjekkliste: {sjekklisteNavn}</div>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: '#1e293b', marginBottom: 16 }}>
            Jeg, <strong>{navn}</strong>, bekrefter at dette punktet er utført korrekt og i henhold til gjeldende krav.
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={bekreftet} onChange={e => setBekreftet(e.target.checked)} style={{ marginTop: 2 }} />
            Jeg har lest punktet og sjekket arbeidet
          </label>
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button className="btn" onClick={onLukk}>Avbryt</button>
            <button className="btn btn-primary" disabled={!bekreftet} onClick={() => onSigner(navn)}>
              ✍️ Signer som {navn} — {new Date().toLocaleDateString('nb-NO')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SjekklisteDetalj({ sl, onOppdater, onTilbake }) {
  const { state } = useApp();
  const [lokale, setLokale] = useState(sl.punkter || []);
  const [lagrer, setLagrer] = useState(false);
  const [lagret, setLagret] = useState(false);
  const [signerPunkt, setSignerPunkt] = useState(null);
  const [utvidetPunkt, setUtvidetPunkt] = useState(null);

  const brukernavn = BRUKER();
  const kanSkrive = ROLLE() !== 'ansatt_ro';

  function oppdaterPunkt(id, felt, verdi) {
    setLokale(prev => prev.map(p => p.id === id
      ? { ...p, [felt]: verdi, utfort_av: p.utfort_av || brukernavn, utfort_dato: p.utfort_dato || new Date().toISOString() }
      : p
    ));
  }

  function settStatus(id, status) {
    setLokale(prev => prev.map(p => p.id === id
      ? { ...p, status, utfort_av: brukernavn, utfort_dato: new Date().toISOString() }
      : p
    ));
  }

  function signer(punktId, navn) {
    setLokale(prev => prev.map(p => p.id === punktId
      ? { ...p, signert_av: navn, signert_dato: new Date().toISOString() }
      : p
    ));
    setSignerPunkt(null);
  }

  async function lagre() {
    setLagrer(true);
    try {
      const oppdatert = await apiFetch(`/api/ks/sjekklister?id=${sl.id}`, { method: 'PUT', body: { ...sl, punkter: lokale } });
      onOppdater(oppdatert);
      setLagret(true);
      setTimeout(() => setLagret(false), 2000);
    } catch (e) {
      alert('Feil ved lagring: ' + e.message);
    } finally {
      setLagrer(false);
    }
  }

  const pst = (() => {
    if (!lokale.length) return 0;
    return Math.round(lokale.filter(p => p.status === 'ok' || p.status === 'ikke-aktuelt').length / lokale.length * 100);
  })();

  const ansatte = [...(state.ansatte || [])].sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));

  return (
    <div className="ks-detalj">
      <div className="ks-detalj-header">
        <button className="btn" onClick={onTilbake}>← Tilbake</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{sl.navn}</h2>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            <span style={{ background: (KAT_FARGE[sl.kategori] || '#6b7280') + '22', color: KAT_FARGE[sl.kategori] || '#6b7280', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
              {KAT_LABEL[sl.kategori] || sl.kategori}
            </span>
            {sl.ansvarlig?.length > 0 && <span style={{ marginLeft: 8 }}>👤 {sl.ansvarlig.join(', ')}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: pst === 100 ? '#16a34a' : '#f59e0b' }}>{pst}%</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>{lokale.filter(p => p.status === 'ok' || p.status === 'ikke-aktuelt').length}/{lokale.length} pts</div>
          </div>
          <button
            className="btn btn-primary"
            onClick={lagre}
            disabled={lagrer}
            style={{ background: lagret ? '#16a34a' : undefined }}
          >
            {lagrer ? '⏳ Lagrer...' : lagret ? '✅ Lagret!' : '💾 Lagre'}
          </button>
        </div>
      </div>

      {/* Ansvarlig-seksjon */}
      {ROLLE() === 'admin' || ROLLE() === 'kontor' ? (
        <div className="ks-ansvarlig-rad">
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Ansvarlig:</span>
          <select
            className="input"
            style={{ maxWidth: 220, fontSize: 12, padding: '4px 8px' }}
            value={sl.ansvarlig?.[0] || ''}
            onChange={async e => {
              const oppdatert = await apiFetch(`/api/ks/sjekklister?id=${sl.id}`, { method: 'PUT', body: { ...sl, punkter: lokale, ansvarlig: e.target.value ? [e.target.value] : [] } });
              onOppdater(oppdatert);
            }}
          >
            <option value="">– Velg ansvarlig –</option>
            {ansatte.map(a => <option key={a.id} value={a.navn}>{a.navn}</option>)}
          </select>
        </div>
      ) : null}

      {/* Punkter */}
      <div className="ks-punkter">
        {lokale.map((punkt, i) => {
          const erUtvidet = utvidetPunkt === punkt.id;
          const statusFarge = PUNKT_FARGE[punkt.status] || '#94a3b8';
          const erKritisk = punkt.krever_signering;
          const erSignert = !!punkt.signert_av;

          return (
            <div key={punkt.id} className={`ks-punkt ${punkt.status === 'avvik' ? 'ks-punkt--avvik' : punkt.status === 'ok' ? 'ks-punkt--ok' : ''}`}>
              <div className="ks-punkt-topp">
                <div className="ks-punkt-nr" style={{ color: statusFarge }}>{i + 1}</div>
                <div className="ks-punkt-tekst">
                  <div style={{ fontWeight: punkt.status === 'ok' ? 400 : 600 }}>
                    {punkt.tekst}
                    {erKritisk && <span className="ks-punkt-kritisk">✍️ Signering krevd</span>}
                    {punkt.krever_bilde && <span className="ks-punkt-kritisk" style={{ background: '#eff6ff', color: '#2563eb' }}>📷 Bilde krevd</span>}
                  </div>
                  {punkt.status !== 'ikke-utfort' && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {punkt.utfort_av && `Utført av ${punkt.utfort_av}`}
                      {punkt.utfort_dato && ` · ${new Date(punkt.utfort_dato).toLocaleDateString('nb-NO')}`}
                    </div>
                  )}
                  {erSignert && (
                    <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                      ✍️ Signert av {punkt.signert_av} · {new Date(punkt.signert_dato).toLocaleDateString('nb-NO')}
                    </div>
                  )}
                  {punkt.kommentar && (
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 4, fontStyle: 'italic' }}>
                      💬 {punkt.kommentar}
                    </div>
                  )}
                </div>
                {kanSkrive && (
                  <div className="ks-punkt-knapper">
                    {PUNKT_STATUS.filter(s => s !== punkt.status).map(s => (
                      <button key={s} className="ks-punkt-btn" style={{ color: PUNKT_FARGE[s], borderColor: PUNKT_FARGE[s] + '44' }}
                        onClick={() => settStatus(punkt.id, s)}>
                        {PUNKT_LABEL[s]}
                      </button>
                    ))}
                    <button className="ks-punkt-btn" onClick={() => setUtvidetPunkt(erUtvidet ? null : punkt.id)}>
                      {erUtvidet ? '▲' : '▼ Mer'}
                    </button>
                  </div>
                )}
              </div>

              {erUtvidet && kanSkrive && (
                <div className="ks-punkt-utvidet">
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Kommentar</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={punkt.kommentar || ''}
                      onChange={e => oppdaterPunkt(punkt.id, 'kommentar', e.target.value)}
                      placeholder={punkt.status === 'avvik' ? 'Beskriv avviket...' : 'Legg til kommentar...'}
                    />
                  </div>
                  {erKritisk && !erSignert && (
                    <button className="btn" style={{ fontSize: 12, background: '#1e293b', color: '#fff', marginTop: 8 }}
                      onClick={() => setSignerPunkt(punkt)}>
                      ✍️ Signer dette punktet
                    </button>
                  )}
                  {erKritisk && erSignert && (
                    <div style={{ fontSize: 12, color: '#16a34a', marginTop: 8 }}>
                      ✅ Signert av {punkt.signert_av} · {new Date(punkt.signert_dato).toLocaleDateString('nb-NO')}
                      {' '}<button className="btn" style={{ fontSize: 11, padding: '1px 6px' }}
                        onClick={() => oppdaterPunkt(punkt.id, 'signert_av', null) && oppdaterPunkt(punkt.id, 'signert_dato', null)}>
                        Angre
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {signerPunkt && (
        <SignerModal
          punkt={signerPunkt}
          sjekklisteNavn={sl.navn}
          onSigner={navn => signer(signerPunkt.id, navn)}
          onLukk={() => setSignerPunkt(null)}
        />
      )}
    </div>
  );
}

export default function KS() {
  const { state } = useApp();
  const [maler, setMaler] = useState([]);
  const [sjekklister, setSjekklister] = useState([]);
  const [laster, setLaster] = useState(true);
  const [feil, setFeil] = useState(null);
  const [view, setView] = useState('oversikt'); // oversikt | prosjekt | sjekkliste | bibliotek
  const [valgtProsjekt, setValgtProsjekt] = useState(null);
  const [valgtSl, setValgtSl] = useState(null);
  const [visLeggTil, setVisLeggTil] = useState(false);
  const [sokProsj, setSokProsj] = useState('');

  const isAdmin = ROLLE() === 'admin';
  const isKontor = ROLLE() === 'kontor';
  const kanAdmin = isAdmin || isKontor;

  const last = useCallback(async () => {
    setLaster(true); setFeil(null);
    try {
      const [m, s] = await Promise.all([
        apiFetch('/api/ks/maler'),
        apiFetch('/api/ks/sjekklister'),
      ]);
      setMaler(m);
      setSjekklister(s);
      // Seed maler hvis ingen finnes (admin)
      if (m.length === 0 && isAdmin) {
        await apiFetch('/api/ks/init', { method: 'POST' });
        const friske = await apiFetch('/api/ks/maler');
        setMaler(friske);
      }
    } catch (e) {
      setFeil(e.message);
    } finally {
      setLaster(false);
    }
  }, [isAdmin]);

  useEffect(() => { last(); }, [last]);

  // Prosjekter med minst én sjekkliste, pluss alle aktive
  const prosjekterMedKS = [...(state.prosjekter || [])].filter(p => p.status === 'aktiv').sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));

  const filtProsjekter = prosjekterMedKS.filter(p =>
    p.navn.toLowerCase().includes(sokProsj.toLowerCase()) ||
    (p.adresse || '').toLowerCase().includes(sokProsj.toLowerCase())
  );

  function aapneProsjekt(p) {
    setValgtProsjekt(p);
    setView('prosjekt');
  }

  function aapneSl(sl) {
    setValgtSl(sl);
    setView('sjekkliste');
  }

  if (laster) return <div className="page-header"><div style={{ color: '#64748b', padding: '40px 0' }}>⏳ Laster KS-data...</div></div>;
  if (feil) return <div className="page-header"><div style={{ color: '#dc2626', padding: '40px 0' }}>Feil: {feil} <button className="btn" onClick={last}>Prøv igjen</button></div></div>;

  // ── Sjekkliste-detalj ─────────────────────────────────────────────────────
  if (view === 'sjekkliste' && valgtSl) {
    return (
      <SjekklisteDetalj
        sl={valgtSl}
        onOppdater={oppdatert => {
          setSjekklister(prev => prev.map(s => s.id === oppdatert.id ? oppdatert : s));
          setValgtSl(oppdatert);
        }}
        onTilbake={() => setView('prosjekt')}
      />
    );
  }

  // ── Per prosjekt ──────────────────────────────────────────────────────────
  if (view === 'prosjekt' && valgtProsjekt) {
    const mine = sjekklister.filter(s => s.prosjektId === valgtProsjekt.id);
    const obligatorisk = maler.filter(m => m.obligatorisk);
    const obligManglerIds = obligatorisk.filter(m => !mine.some(s => s.malId === m.id)).map(m => m.id);
    const eksisterendeMalIds = new Set(mine.map(s => s.malId));

    const gruppert = {
      ferdig: mine.filter(s => s.status === 'ferdig'),
      pagar: mine.filter(s => s.status === 'pagar'),
      'ikke-startet': mine.filter(s => s.status === 'ikke-startet'),
    };

    return (
      <div className="ks-side">
        <div className="page-header">
          <div>
            <button className="btn" style={{ marginRight: 12 }} onClick={() => setView('oversikt')}>← Oversikt</button>
            <h2 style={{ display: 'inline', fontSize: 20 }}>{valgtProsjekt.navn}</h2>
            {valgtProsjekt.adresse && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>📍 {valgtProsjekt.adresse}</div>}
          </div>
          {kanAdmin && (
            <button className="btn btn-primary" onClick={() => setVisLeggTil(true)}>+ Legg til sjekkliste</button>
          )}
        </div>

        {obligManglerIds.length > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
            ⚠ {obligManglerIds.length} obligatoriske sjekklister mangler på dette prosjektet.
            {kanAdmin && <button className="btn" style={{ marginLeft: 10, fontSize: 11, padding: '2px 8px' }} onClick={() => setVisLeggTil(true)}>Legg til</button>}
          </div>
        )}

        {mine.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div>Ingen sjekklister på dette prosjektet ennå.</div>
            {kanAdmin && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setVisLeggTil(true)}>+ Legg til sjekkliste</button>}
          </div>
        )}

        {(['ferdig', 'pagar', 'ikke-startet']).map(grp => {
          const liste = gruppert[grp];
          if (!liste.length) return null;
          const cfg = STATUS_CFG[grp];
          return (
            <div key={grp} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: cfg.farge, marginBottom: 10 }}>
                {cfg.ikon} {cfg.label} ({liste.length})
              </div>
              <div className="ks-sl-grid">
                {liste.map(sl => (
                  <SjekklisteKort key={sl.id} sl={sl} onClick={() => aapneSl(sl)} />
                ))}
              </div>
            </div>
          );
        })}

        {visLeggTil && (
          <LeggTilModal
            prosjektId={valgtProsjekt.id}
            maler={maler}
            eksisterendeMalIds={eksisterendeMalIds}
            onLagre={async () => { setVisLeggTil(false); const s = await apiFetch('/api/ks/sjekklister'); setSjekklister(s); }}
            onLukk={() => setVisLeggTil(false)}
          />
        )}
      </div>
    );
  }

  // ── Mal-bibliotek ─────────────────────────────────────────────────────────
  if (view === 'bibliotek') {
    const grupper = Object.entries(KAT_LABEL);
    return (
      <div className="ks-side">
        <div className="page-header">
          <div>
            <button className="btn" style={{ marginRight: 12 }} onClick={() => setView('oversikt')}>← Oversikt</button>
            <h2 style={{ display: 'inline', fontSize: 20 }}>Sjekkliste-bibliotek</h2>
          </div>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>{maler.length} maler totalt</span>
        </div>
        {grupper.map(([kat, katLabel]) => {
          const i = maler.filter(m => m.kategori === kat);
          if (!i.length) return null;
          return (
            <div key={kat} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: KAT_FARGE[kat], marginBottom: 10, borderLeft: `3px solid ${KAT_FARGE[kat]}`, paddingLeft: 8 }}>
                {katLabel} ({i.length})
              </div>
              <div className="ks-sl-grid">
                {i.map(m => (
                  <div key={m.id} className="ks-sl-kort" style={{ borderLeft: `4px solid ${KAT_FARGE[m.kategori] || '#6b7280'}` }}>
                    <div className="ks-sl-topp">
                      <div>
                        <div className="ks-sl-navn">{m.navn}</div>
                        <div className="ks-sl-meta">
                          {m.obligatorisk && <span className="ks-sl-chip" style={{ background: '#fef3c7', color: '#92400e' }}>Obligatorisk</span>}
                          <span className="ks-sl-chip">{m.punkter?.length || 0} punkter</span>
                          <span className="ks-sl-chip">v{m.versjon || 1}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      {(m.punkter || []).slice(0, 3).map(p => (
                        <div key={p.id} style={{ fontSize: 11, color: '#64748b', padding: '2px 0', borderTop: '1px solid #f1f5f9' }}>
                          · {p.tekst}
                          {p.krever_signering && ' ✍️'}
                          {p.krever_bilde && ' 📷'}
                        </div>
                      ))}
                      {(m.punkter?.length || 0) > 3 && (
                        <div style={{ fontSize: 11, color: '#94a3b8', paddingTop: 2 }}>+ {m.punkter.length - 3} til...</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Oversikt (standard) ───────────────────────────────────────────────────
  const totalSl = sjekklister.length;
  const ferdigSl = sjekklister.filter(s => s.status === 'ferdig').length;
  const avvikSl = sjekklister.filter(s => (s.punkter || []).some(p => p.status === 'avvik')).length;

  return (
    <div className="ks-side">
      <div className="page-header">
        <div>
          <h2>KS / HMS</h2>
          <div style={{ fontSize: 13, color: '#64748b' }}>Kvalitetssikring og sjekklister</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setView('bibliotek')}>📚 Mal-bibliotek ({maler.length})</button>
        </div>
      </div>

      {/* Statistikk-banner */}
      <div className="ks-stats">
        <div className="ks-stat-kort">
          <div className="ks-stat-tall">{prosjekterMedKS.length}</div>
          <div className="ks-stat-label">Aktive prosjekter</div>
        </div>
        <div className="ks-stat-kort">
          <div className="ks-stat-tall">{totalSl}</div>
          <div className="ks-stat-label">Sjekklister totalt</div>
        </div>
        <div className="ks-stat-kort" style={{ borderColor: '#16a34a' }}>
          <div className="ks-stat-tall" style={{ color: '#16a34a' }}>{ferdigSl}</div>
          <div className="ks-stat-label">Ferdig</div>
        </div>
        {avvikSl > 0 && (
          <div className="ks-stat-kort" style={{ borderColor: '#dc2626' }}>
            <div className="ks-stat-tall" style={{ color: '#dc2626' }}>{avvikSl}</div>
            <div className="ks-stat-label">Med avvik</div>
          </div>
        )}
      </div>

      {/* Søk */}
      <input
        className="input"
        style={{ maxWidth: 280, marginBottom: 16 }}
        placeholder="🔍 Søk prosjekt..."
        value={sokProsj}
        onChange={e => setSokProsj(e.target.value)}
      />

      {/* Prosjektliste */}
      <div className="ks-prosjekt-grid">
        {filtProsjekter.map(p => (
          <ProsjektKort
            key={p.id}
            prosjekt={p}
            sjekklister={sjekklister}
            onClick={() => aapneProsjekt(p)}
          />
        ))}
        {!filtProsjekter.length && (
          <div style={{ color: '#94a3b8', padding: '32px 0', gridColumn: '1/-1', textAlign: 'center' }}>
            Ingen aktive prosjekter funnet.
          </div>
        )}
      </div>
    </div>
  );
}
