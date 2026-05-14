import { useState, useEffect, useCallback, useRef, startTransition } from 'react'
import { useApp } from '../context/AppContext'

// ── Konstanter ────────────────────────────────────────────────────────────────

const TOKEN = () => localStorage.getItem('fbs_token') || ''
const BRUKER = () => localStorage.getItem('fbs_user_navn') || 'Ukjent'
const ROLLE = () => localStorage.getItem('fbs_role') || 'ansatt'

const KAT_FARGE = {
  hms: '#dc2626', bad: '#0891b2', fasade: '#ea580c', tak: '#7c3aed',
  tomrer: '#854d0e', maler: '#be185d', ror: '#1d4ed8', el: '#f59e0b',
}
const GRUPPE_REKKEFØLGE = ['HMS', 'Sluttkontroll', 'Utførelse bad', 'Utførelse fasade', 'Utførelse tak', 'Utførelse innvendig', 'Maling', 'Rørlegger', 'Elektrisk']
const PUNKT_STATUS_CFG = {
  'ikke-utfort': { label: 'Ikke utført', farge: '#94a3b8', bg: '#f8fafc' },
  ok:            { label: 'OK ✓',        farge: '#16a34a', bg: '#f0fdf4' },
  avvik:         { label: 'Avvik ⚠',     farge: '#dc2626', bg: '#fef2f2' },
  'ikke-aktuelt':{ label: 'N/A',         farge: '#64748b', bg: '#f1f5f9' },
}
const ALVORLIGHET_CFG = {
  info:     { label: 'Info',     farge: '#0891b2' },
  mindre:   { label: 'Mindre',   farge: '#f59e0b' },
  alvorlig: { label: 'Alvorlig', farge: '#ea580c' },
  kritisk:  { label: 'Kritisk',  farge: '#dc2626' },
}

// ── API-hjelper ───────────────────────────────────────────────────────────────

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN()}`, ...(opts.headers || {}) },
    body: opts.body !== undefined && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

function prosent(punkter = []) {
  if (!punkter.length) return 0
  return Math.round(punkter.filter(p => p.status === 'ok' || p.status === 'ikke-aktuelt').length / punkter.length * 100)
}

// ── Mini-komponenter ──────────────────────────────────────────────────────────

function Fremdriftsbar({ pst, avvik = false, hoyde = 6 }) {
  return (
    <div style={{ height: hoyde, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pst}%`, background: avvik ? '#f59e0b' : '#22c55e', borderRadius: 3, transition: 'width .4s' }} />
    </div>
  )
}

function StatusPill({ status }) {
  const cfg = { 'ikke-startet': { bg: '#f1f5f9', c: '#64748b', t: '⚪ Ikke startet' }, pagar: { bg: '#fef9c3', c: '#ca8a04', t: '🟡 Pågår' }, ferdig: { bg: '#dcfce7', c: '#16a34a', t: '🟢 Ferdig' } }
  const s = cfg[status] || cfg['ikke-startet']
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.c, whiteSpace: 'nowrap' }}>{s.t}</span>
}

// ── Legg-til-sjekkliste modal ─────────────────────────────────────────────────

function LeggTilModal({ prosjektId, maler, eksisterendeMalIds, onLagre, onLukk }) {
  const [valgte, setValgte] = useState([])
  const [sok, setSok] = useState('')
  const [leggerTil, setLeggerTil] = useState(false)

  const filtrert = maler.filter(m =>
    !eksisterendeMalIds.has(m.id) &&
    (m.navn.toLowerCase().includes(sok.toLowerCase()) || m.gruppe?.toLowerCase().includes(sok.toLowerCase()))
  )

  const toggle = id => setValgte(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id])

  async function leggTil() {
    setLeggerTil(true)
    for (const malId of valgte) {
      const mal = maler.find(m => m.id === malId)
      if (!mal) continue
      await apiFetch('/api/ks/sjekklister', {
        method: 'POST',
        body: { prosjektId, malId: mal.id, malVersjon: mal.versjon || 1, navn: mal.navn, kategori: mal.kategori, gruppe: mal.gruppe || '', ansvarlig: [], punkter: mal.punkter },
      })
    }
    setLeggerTil(false)
    onLagre()
  }

  const gruppert = {}
  for (const m of filtrert) {
    const g = m.gruppe || 'Annet'
    if (!gruppert[g]) gruppert[g] = []
    gruppert[g].push(m)
  }
  const grupper = GRUPPE_REKKEFØLGE.filter(g => gruppert[g])

  return (
    <div className="modal-backdrop" onClick={onLukk}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Legg til sjekklister</h3>
          <button className="btn-icon" onClick={onLukk}>✕</button>
        </div>
        <div className="form">
          <input className="input" placeholder="🔍 Søk mal eller gruppe..." value={sok} onChange={e => setSok(e.target.value)} style={{ marginBottom: 12 }} />
          <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {grupper.map(g => (
              <div key={g}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 4px 4px' }}>{g}</div>
                {gruppert[g].map(m => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: valgte.includes(m.id) ? '#eff6ff' : '#fff', border: `1px solid ${valgte.includes(m.id) ? '#3b82f6' : '#e2e8f0'}`, marginBottom: 4 }}>
                    <input type="checkbox" checked={valgte.includes(m.id)} onChange={() => toggle(m.id)} style={{ marginTop: 3 }} />
                    <span style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{m.navn}</span>
                      {m.obligatorisk && <span style={{ marginLeft: 6, fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 5px' }}>Obligatorisk</span>}
                      <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{m.punkter?.length || 0} punkter · {m.fag?.join(', ') || 'alle fag'}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
            {!filtrert.length && <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>Ingen maler å legge til</div>}
          </div>
          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button className="btn" onClick={onLukk}>Avbryt</button>
            <button className="btn btn-primary" onClick={leggTil} disabled={!valgte.length || leggerTil}>
              {leggerTil ? '⏳ Legger til...' : `+ Legg til ${valgte.length > 0 ? `(${valgte.length})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Signerings-modal ──────────────────────────────────────────────────────────

function SignerModal({ punkt, sjekklisteNavn, onSigner, onLukk }) {
  const [bekreftet, setBekreftet] = useState(false)
  const navn = BRUKER()
  return (
    <div className="modal-backdrop" onClick={onLukk}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>✍️ Signer punkt</h3><button className="btn-icon" onClick={onLukk}>✕</button></div>
        <div className="form">
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#475569' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Punkt:</div>
            <div>"{punkt.tekst}"</div>
            <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 11 }}>Sjekkliste: {sjekklisteNavn}</div>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#1e293b' }}>
            Jeg, <strong>{navn}</strong>, bekrefter at dette punktet er utført korrekt og i henhold til gjeldende krav.
          </p>
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
  )
}

// ── AI-modal ──────────────────────────────────────────────────────────────────

function AiModal({ modus, mal, onFerdig, onLukk }) {
  const [tekst, setTekst] = useState('')
  const [laster, setLaster] = useState(false)
  const [resultat, setResultat] = useState(null)
  const [diff, setDiff] = useState(null)
  const [feil, setFeil] = useState(null)

  async function send() {
    setLaster(true); setFeil(null)
    try {
      if (modus === 'endre') {
        const r = await apiFetch('/api/ks/ai', { method: 'POST', body: { action: 'endre-mal', malId: mal?.id, instruksjon: tekst } })
        setDiff(r.diff)
      } else if (modus === 'ny') {
        const r = await apiFetch('/api/ks/ai', { method: 'POST', body: { action: 'lag-ny-mal', beskrivelse: tekst, kategori: 'tomrer', fag: [] } })
        setResultat(r.forslag)
      } else if (modus === 'hjelp') {
        const r = await apiFetch('/api/ks/ai', { method: 'POST', body: { action: 'forklar-punkt', punktTekst: tekst, malNavn: mal?.navn || '', kategori: mal?.kategori || '' } })
        setResultat({ forklaring: r.forklaring })
      }
    } catch (e) { setFeil(e.message) }
    setLaster(false)
  }

  const tittel = modus === 'endre' ? '✨ Endre sjekkliste med AI' : modus === 'ny' ? '✨ Lag ny sjekkliste' : '✨ Spør AI om hjelp'
  const placeholder = modus === 'endre' ? `F.eks. "Legg til punkt om branntetting rundt rør" eller "Fjern punktet om SHA-koordinator"`
    : modus === 'ny' ? 'F.eks. "Sjekkliste for montering av kjøkken med ny komfyr og koblinger"'
    : 'F.eks. "Hva betyr fall mot sluk 1:100?"'

  return (
    <div className="modal-backdrop" onClick={onLukk}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>{tittel}</h3><button className="btn-icon" onClick={onLukk}>✕</button></div>
        <div className="form">
          {mal && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Mal: {mal.navn}</div>}
          {!resultat && !diff && (
            <>
              <textarea className="input" rows={3} value={tekst} onChange={e => setTekst(e.target.value)} placeholder={placeholder} style={{ resize: 'vertical' }} />
              {feil && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>Feil: {feil}</div>}
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button className="btn" onClick={onLukk}>Avbryt</button>
                <button className="btn btn-primary" onClick={send} disabled={!tekst.trim() || laster}>
                  {laster ? '⏳ AI tenker...' : 'Send til AI →'}
                </button>
              </div>
            </>
          )}

          {diff && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#1e293b' }}>AI foreslår disse endringene:</div>
              {diff.leggTil?.map((p, i) => <div key={i} style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>✚ Nytt punkt: "{p.tekst}"</div>)}
              {diff.endre?.map((e, i) => <div key={i} style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>✏️ Endrer: "{e.fra}" → "{e.til}"</div>)}
              {diff.fjern?.map((f, i) => <div key={i} style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>− Fjerner: "{f.id}" ({f.grunn})</div>)}
              {diff.forklaring && <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 8 }}>💡 {diff.forklaring}</div>}
              <div className="modal-actions" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => { setDiff(null); setTekst('') }}>🔄 Prøv igjen</button>
                <button className="btn btn-primary" onClick={() => onFerdig({ type: 'endre', diff, malId: mal?.id })}>💾 Godta endringer</button>
              </div>
            </div>
          )}

          {resultat?.forklaring && (
            <div>
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', fontSize: 14, lineHeight: 1.6, color: '#1e293b', whiteSpace: 'pre-wrap' }}>{resultat.forklaring}</div>
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" onClick={onLukk}>Lukk</button>
              </div>
            </div>
          )}

          {resultat && !resultat.forklaring && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>AI-forslag: "{resultat.navn}"</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{resultat.punkter?.length} punkter · gruppe: {resultat.gruppe}</div>
              {resultat.punkter?.map((p, i) => <div key={i} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>{i+1}. {p.tekst}{p.krever_signering ? ' ✍️' : ''}{p.krever_bilde ? ' 📷' : ''}</div>)}
              <div className="modal-actions" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => { setResultat(null); setTekst('') }}>🔄 Prøv igjen</button>
                <button className="btn btn-primary" onClick={() => onFerdig({ type: 'ny-mal', mal: resultat })}>💾 Lagre som mal</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tildel-modal ──────────────────────────────────────────────────────────────

function TildelModal({ sl, ansatteIProsj, onLagre, onLukk }) {
  const [valgte, setValgte] = useState(sl.ansvarlig || [])
  const [frist, setFrist] = useState(sl.frist || '')
  const [lagrer, setLagrer] = useState(false)

  const toggle = navn => setValgte(v => v.includes(navn) ? v.filter(n => n !== navn) : [...v, navn])

  async function lagre() {
    setLagrer(true)
    const oppdatert = await apiFetch(`/api/ks/sjekklister?id=${sl.id}`, { method: 'PUT', body: { ...sl, ansvarlig: valgte, frist: frist || null } })
    onLagre(oppdatert)
  }

  return (
    <div className="modal-backdrop" onClick={onLukk}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>👥 Tildel ansvarlig</h3><button className="btn-icon" onClick={onLukk}>✕</button></div>
        <div className="form">
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Sjekkliste: <strong>{sl.navn}</strong></div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Mannskap på prosjektet:</div>
            {ansatteIProsj.length === 0 && <div style={{ fontSize: 13, color: '#94a3b8' }}>Ingen ansatte satt av til dette prosjektet i bemanningsplanleggeren.</div>}
            {ansatteIProsj.map(a => (
              <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: valgte.includes(a) ? '#eff6ff' : '#f8fafc', border: `1px solid ${valgte.includes(a) ? '#3b82f6' : '#e2e8f0'}`, marginBottom: 4 }}>
                <input type="checkbox" checked={valgte.includes(a)} onChange={() => toggle(a)} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{a}</span>
                {valgte.includes(a) && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#3b82f6', fontWeight: 700 }}>Ansvarlig</span>}
              </label>
            ))}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Frist</label>
            <input type="date" className="input" value={frist} onChange={e => setFrist(e.target.value)} style={{ maxWidth: 200 }} />
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={onLukk}>Avbryt</button>
            <button className="btn btn-primary" onClick={lagre} disabled={lagrer}>
              {lagrer ? '⏳...' : `📤 Tildel${valgte.length ? ` til ${valgte.join(', ')}` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sjekkpunkt-rad ────────────────────────────────────────────────────────────

function PunktRad({ punkt, idx, kanSkrive, onChange, onSigner, onAiHjelp }) {
  const [utvidet, setUtvidet] = useState(false)
  const [visRegelverk, setVisRegelverk] = useState(false)
  const cfg = PUNKT_STATUS_CFG[punkt.status] || PUNKT_STATUS_CFG['ikke-utfort']
  const erSignert = !!punkt.signert_av
  const brukernavn = BRUKER()

  function settStatus(s) {
    onChange({ ...punkt, status: s, utfort_av: brukernavn, utfort_dato: new Date().toISOString() })
  }

  return (
    <div className={`ks-punkt-rad ${punkt.status === 'avvik' ? 'ks-punkt-avvik' : punkt.status === 'ok' ? 'ks-punkt-ok' : ''}`}>
      <div className="ks-punkt-rad-topp">
        <div className="ks-punkt-nr" style={{ color: cfg.farge }}>{idx + 1}</div>
        <div className="ks-punkt-innhold">
          <div className="ks-punkt-tittel">
            {punkt.tekst}
            {punkt.krever_signering && <span className="ks-merke ks-merke-sign">✍️ Signering</span>}
            {punkt.krever_bilde && <span className="ks-merke ks-merke-bilde">📷 Bilde</span>}
          </div>
          {punkt.veiledning_kort && (
            <div className="ks-punkt-hint">
              📖 {punkt.veiledning_kort}
              {(punkt.beskrivelse || punkt.regelverkLenker?.length > 0) && (
                <button className="ks-lenke" onClick={() => setVisRegelverk(v => !v)}>
                  {visRegelverk ? ' Skjul ↑' : ' Vis krav ↓'}
                </button>
              )}
            </div>
          )}
          {visRegelverk && (
            <div className="ks-punkt-regelverk">
              {punkt.beskrivelse && <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.5 }}>{punkt.beskrivelse}</p>}
              {punkt.regelverkLenker?.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="ks-ref-lenke">📄 {l.tekst}</a>
              ))}
            </div>
          )}
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
          {punkt.kommentar && !utvidet && (
            <div style={{ fontSize: 12, color: '#475569', marginTop: 3, fontStyle: 'italic' }}>💬 {punkt.kommentar}</div>
          )}
        </div>
        {kanSkrive && (
          <div className="ks-punkt-knapper">
            {['ok', 'avvik', 'ikke-aktuelt'].map(s => (
              <button key={s} className={`ks-pkt-btn ${punkt.status === s ? 'aktiv' : ''}`}
                style={punkt.status === s ? { background: PUNKT_STATUS_CFG[s].bg, color: PUNKT_STATUS_CFG[s].farge, borderColor: PUNKT_STATUS_CFG[s].farge } : {}}
                onClick={() => settStatus(s)}>
                {PUNKT_STATUS_CFG[s].label}
              </button>
            ))}
            <button className="ks-pkt-btn" onClick={() => setUtvidet(v => !v)} title="Mer">{utvidet ? '▲' : '▼'}</button>
          </div>
        )}
        {!kanSkrive && (
          <StatusPill status={punkt.status === 'ok' ? 'ferdig' : punkt.status === 'ikke-utfort' ? 'ikke-startet' : 'pagar'} />
        )}
        <button className="ks-lenke" style={{ marginLeft: 8, fontSize: 11 }} onClick={() => onAiHjelp(punkt)} title="Spør AI">✨</button>
      </div>

      {utvidet && kanSkrive && (
        <div className="ks-punkt-utvid">
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Kommentar{punkt.status === 'avvik' ? ' (krevd ved avvik)' : ''}</label>
          <textarea className="input" rows={2} value={punkt.kommentar || ''}
            onChange={e => onChange({ ...punkt, kommentar: e.target.value })}
            placeholder={punkt.status === 'avvik' ? 'Beskriv avviket...' : 'Legg til kommentar...'} />
          {punkt.krever_signering && !erSignert && (
            <button className="btn" style={{ marginTop: 8, fontSize: 12, background: '#1e293b', color: '#fff' }} onClick={() => onSigner(punkt)}>
              ✍️ Signer dette punktet
            </button>
          )}
          {erSignert && (
            <div style={{ fontSize: 12, color: '#16a34a', marginTop: 8 }}>
              ✅ Signert av {punkt.signert_av} · {new Date(punkt.signert_dato).toLocaleDateString('nb-NO')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sjekkliste-detalj (4 faner) ───────────────────────────────────────────────

function SjekklisteDetalj({ sl, ansatteIProsj, onOppdater, onTilbake }) {
  const [fane, setFane] = useState('punkter') // detaljer | punkter | avvik | vedlegg
  const [lokale, setLokale] = useState(sl.punkter || [])
  const [avvik, setAvvik] = useState([])
  const [lagrer, setLagrer] = useState(false)
  const [lagret, setLagret] = useState(false)
  const [signerPunkt, setSignerPunkt] = useState(null)
  const [aiModus, setAiModus] = useState(null)
  const [aiPunkt, setAiPunkt] = useState(null)
  const [visTildel, setVisTildel] = useState(false)
  const [opplaster, setOpplaster] = useState(null)
  const filInputRef = useRef()
  const kanSkrive = ROLLE() !== 'les'
  const kanAdmin = ROLLE() === 'admin' || ROLLE() === 'kontor'

  useEffect(() => {
    apiFetch(`/api/ks/avvik?sjekklisteId=${sl.id}`).then(setAvvik).catch(() => {})
  }, [sl.id])

  function oppdaterPunkt(oppdatert) {
    setLokale(prev => prev.map(p => p.id === oppdatert.id ? oppdatert : p))
  }

  function signer(punktId, navn) {
    setLokale(prev => prev.map(p => p.id === punktId ? { ...p, signert_av: navn, signert_dato: new Date().toISOString() } : p))
    setSignerPunkt(null)
  }

  async function lagre() {
    setLagrer(true)
    try {
      const oppdatert = await apiFetch(`/api/ks/sjekklister?id=${sl.id}`, { method: 'PUT', body: { ...sl, punkter: lokale } })
      onOppdater(oppdatert)
      setLagret(true)
      setTimeout(() => setLagret(false), 2000)
      // Last inn avvik på nytt
      apiFetch(`/api/ks/avvik?sjekklisteId=${sl.id}`).then(setAvvik).catch(() => {})
    } catch (e) {
      alert('Feil ved lagring: ' + e.message)
    }
    setLagrer(false)
  }

  async function lastOppBilde(punktId, fil) {
    setOpplaster(punktId)
    try {
      const gps = await new Promise(resolve => {
        if (!navigator.geolocation) return resolve({ lat: null, lng: null })
        navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve({ lat: null, lng: null }), { timeout: 3000 })
      })
      const headers = {
        'Authorization': `Bearer ${TOKEN()}`,
        'Content-Type': fil.type,
        'X-Filename': fil.name,
        'X-Prosjekt-Id': sl.prosjektId,
        'X-Sjekkliste-Id': sl.id,
        'X-Punkt-Id': punktId,
        ...(gps.lat ? { 'X-Gps-Lat': String(gps.lat), 'X-Gps-Lng': String(gps.lng) } : {}),
      }
      const res = await fetch('/api/ks/bilder', { method: 'POST', headers, body: fil })
      const bilde = await res.json()
      setLokale(prev => prev.map(p => p.id === punktId ? { ...p, bilder: [...(p.bilder || []), bilde] } : p))
    } catch (e) {
      alert('Bilde-opplasting feilet: ' + e.message)
    }
    setOpplaster(null)
  }

  async function aiHandter({ type, diff, malId, mal }) {
    if (type === 'endre' && diff) {
      const maler = await apiFetch('/api/ks/maler')
      const m = maler.find(x => x.id === malId)
      if (!m) return
      // Bruk diff til å oppdatere lokale punkter
      let nyePunkter = [...lokale]
      for (const e of diff.endre || []) {
        nyePunkter = nyePunkter.map(p => p.id === e.id ? { ...p, [e.felt]: e.til } : p)
      }
      for (const f of diff.fjern || []) {
        nyePunkter = nyePunkter.filter(p => p.id !== f.id)
      }
      for (const a of diff.leggTil || []) {
        const nyId = `p-ny-${Date.now()}`
        nyePunkter.push({ ...a, id: nyId, status: 'ikke-utfort', kommentar: '', bilder: [], signert_av: null, signert_dato: null, utfort_av: null, utfort_dato: null })
      }
      setLokale(nyePunkter)
    }
    if (type === 'ny-mal' && mal) {
      await apiFetch('/api/ks/maler', { method: 'POST', body: mal })
    }
    setAiModus(null)
  }

  const pst = prosent(lokale)
  const avvikLokale = lokale.filter(p => p.status === 'avvik')

  return (
    <div className="ks-detalj-side">
      {/* Topplinje */}
      <div className="ks-detalj-topp">
        <button className="btn" onClick={onTilbake}>← Tilbake</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#1e293b' }}>{sl.navn}</h2>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatusPill status={sl.status} />
            {sl.gruppe && <span>📁 {sl.gruppe}</span>}
            {sl.ansvarlig?.length > 0 && <span>👤 {sl.ansvarlig.join(', ')}</span>}
            {sl.frist && <span style={{ color: new Date(sl.frist) < new Date() ? '#dc2626' : '#64748b' }}>📅 Frist: {new Date(sl.frist).toLocaleDateString('nb-NO')}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {kanAdmin && <button className="btn" onClick={() => setVisTildel(true)}>👥 Tildel</button>}
          {kanSkrive && <button className="btn" onClick={() => setAiModus('endre')} title="Endre med AI">✨ AI</button>}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, color: pst === 100 ? '#16a34a' : '#f59e0b', fontSize: 18 }}>{pst}%</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>{lokale.filter(p => p.status === 'ok' || p.status === 'ikke-aktuelt').length}/{lokale.length}</div>
          </div>
          {kanSkrive && (
            <button className="btn btn-primary" onClick={lagre} disabled={lagrer} style={{ background: lagret ? '#16a34a' : undefined }}>
              {lagrer ? '⏳ Lagrer...' : lagret ? '✅ Lagret!' : '💾 Lagre'}
            </button>
          )}
        </div>
      </div>

      {/* Fremdriftsbar */}
      <div style={{ marginBottom: 16 }}>
        <Fremdriftsbar pst={pst} avvik={avvikLokale.length > 0} hoyde={8} />
      </div>

      {/* 4 faner */}
      <div className="ks-faner">
        {[['punkter', `✓ Sjekkpunkter (${lokale.length})`], ['detaljer', '📋 Detaljer'], ['avvik-fane', `⚠️ Avvik${avvik.length ? ` (${avvik.length})` : ''}`], ['vedlegg', '📎 Vedlegg']].map(([id, label]) => (
          <button key={id} className={`ks-fane-btn ${fane === id ? 'aktiv' : ''}`} onClick={() => setFane(id)}>{label}</button>
        ))}
      </div>

      {/* Innhold per fane */}
      {fane === 'detaljer' && (
        <div className="ks-fane-innhold">
          <div className="ks-detalj-felt"><span className="ks-felt-label">Mal</span><span>{sl.navn} (v{sl.malVersjon || 1})</span></div>
          <div className="ks-detalj-felt"><span className="ks-felt-label">Gruppe</span><span>{sl.gruppe || '–'}</span></div>
          <div className="ks-detalj-felt"><span className="ks-felt-label">Kategori</span><span>{sl.kategori}</span></div>
          <div className="ks-detalj-felt"><span className="ks-felt-label">Ansvarlig</span><span>{sl.ansvarlig?.join(', ') || '–'}</span></div>
          <div className="ks-detalj-felt"><span className="ks-felt-label">Frist</span><span>{sl.frist ? new Date(sl.frist).toLocaleDateString('nb-NO') : '–'}</span></div>
          <div className="ks-detalj-felt"><span className="ks-felt-label">Opprettet</span><span>{new Date(sl.opprettet).toLocaleDateString('nb-NO')}</span></div>
          {sl.tildelt_av && <div className="ks-detalj-felt"><span className="ks-felt-label">Tildelt av</span><span>{sl.tildelt_av} · {new Date(sl.tildelt_dato).toLocaleDateString('nb-NO')}</span></div>}
          {sl.ferdigstilt && <div className="ks-detalj-felt"><span className="ks-felt-label">Ferdigstilt</span><span>{new Date(sl.ferdigstilt).toLocaleDateString('nb-NO')}</span></div>}
        </div>
      )}

      {fane === 'punkter' && (
        <div className="ks-punkter-liste">
          {lokale.map((punkt, i) => (
            <PunktRad key={punkt.id} punkt={punkt} idx={i} kanSkrive={kanSkrive}
              onChange={oppdaterPunkt}
              onSigner={p => setSignerPunkt(p)}
              onAiHjelp={p => { setAiPunkt(p); setAiModus('hjelp') }}
            />
          ))}
          {/* Bilde-opplastning for aktivt punkt */}
          {kanSkrive && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
              <input ref={filInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0] && opplaster) lastOppBilde(opplaster, e.target.files[0]) }} />
            </div>
          )}
        </div>
      )}

      {fane === 'avvik-fane' && (
        <div className="ks-fane-innhold">
          {avvik.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>✅ Ingen avvik registrert</div>}
          {avvik.map(a => (
            <div key={a.id} className="ks-avvik-kort">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.tittel}</div>
                  {a.beskrivelse && <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>{a.beskrivelse}</div>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: ALVORLIGHET_CFG[a.alvorlighet]?.farge, whiteSpace: 'nowrap' }}>{ALVORLIGHET_CFG[a.alvorlighet]?.label}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: a.status === 'lukket' ? '#dcfce7' : '#fee2e2', color: a.status === 'lukket' ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                  {a.status === 'lukket' ? 'Lukket' : a.status === 'i-arbeid' ? 'I arbeid' : 'Åpen'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Registrert av {a.registrert_av} · {new Date(a.registrert_dato).toLocaleDateString('nb-NO')}
                {a.ansvarlig_for_lukking && ` · Ansvarlig: ${a.ansvarlig_for_lukking}`}
                {a.frist && ` · Frist: ${new Date(a.frist).toLocaleDateString('nb-NO')}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {fane === 'vedlegg' && (
        <div className="ks-fane-innhold">
          {lokale.flatMap(p => (p.bilder || []).map(b => ({ ...b, punktTekst: p.tekst }))).length === 0
            ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>Ingen bilder lastet opp ennå</div>
            : <div className="ks-bilde-galleri">
                {lokale.flatMap(p => (p.bilder || []).map(b => ({ ...b, punktTekst: p.tekst }))).map((b, i) => (
                  <div key={i} className="ks-bilde-kort">
                    <img src={b.url} alt={b.punktTekst} style={{ width: '100%', borderRadius: 8, aspectRatio: '4/3', objectFit: 'cover' }} />
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{b.punktTekst}</div>
                    {b.gps && <div style={{ fontSize: 10, color: '#94a3b8' }}>📍 {b.gps.lat.toFixed(4)}, {b.gps.lng.toFixed(4)}</div>}
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{b.tatt_av} · {new Date(b.tatt).toLocaleDateString('nb-NO')}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Modaler */}
      {signerPunkt && <SignerModal punkt={signerPunkt} sjekklisteNavn={sl.navn} onSigner={n => signer(signerPunkt.id, n)} onLukk={() => setSignerPunkt(null)} />}
      {aiModus && <AiModal modus={aiModus} mal={aiModus === 'hjelp' ? { ...sl, navn: sl.navn, punktTekst: aiPunkt?.tekst } : sl} onFerdig={aiHandter} onLukk={() => { setAiModus(null); setAiPunkt(null) }} />}
      {visTildel && <TildelModal sl={sl} ansatteIProsj={ansatteIProsj} onLagre={opp => { onOppdater(opp); setVisTildel(false) }} onLukk={() => setVisTildel(false)} />}
    </div>
  )
}

// ── Prosjekt-visning (trestruktur) ────────────────────────────────────────────

function ProsjektVisning({ prosjekt, sjekklister, maler, ansatte, alleProsjekter, alleSjekklister, onOppdater, onTilbake, onAapneSl, onByttProsjekt }) {
  const [visLeggTil, setVisLeggTil] = useState(false)
  const [kollapset, setKollapset] = useState({})
  const [lasterSl, setLasterSl] = useState(false)
  const [visBytt, setVisBytt] = useState(false)
  const byttRef = useRef()
  const kanAdmin = ROLLE() === 'admin' || ROLLE() === 'kontor'

  useEffect(() => {
    if (!visBytt) return
    function lukk(e) { if (byttRef.current && !byttRef.current.contains(e.target)) setVisBytt(false) }
    document.addEventListener('mousedown', lukk)
    return () => document.removeEventListener('mousedown', lukk)
  }, [visBytt])

  // Mannskap på dette prosjektet fra bemanningsplanleggeren
  const ansatteIProsj = [...new Set(
    (ansatte || [])
      .filter(a => {
        // ansatt er på prosjektet hvis de har en uke koblet til prosjektet
        return a.prosjekt === prosjekt.id || a.prosjekter?.includes(prosjekt.id)
      })
      .map(a => a.navn)
  )]

  const mine = sjekklister.filter(s => s.prosjektId === prosjekt.id)
  const eksisterendeMalIds = new Set(mine.map(s => s.malId))

  // Obligatoriske maler som mangler
  const obligManger = maler.filter(m => m.obligatorisk && !mine.some(s => s.malId === m.id))

  // Grupper sjekklistene
  const gruppert = {}
  for (const sl of mine) {
    const g = sl.gruppe || 'Annet'
    if (!gruppert[g]) gruppert[g] = []
    gruppert[g].push(sl)
  }
  const grupper = [...GRUPPE_REKKEFØLGE.filter(g => gruppert[g]), ...Object.keys(gruppert).filter(g => !GRUPPE_REKKEFØLGE.includes(g))]

  const totalPst = mine.length ? Math.round(mine.reduce((sum, s) => sum + prosent(s.punkter), 0) / mine.length) : 0
  const avvikTotalt = mine.filter(s => (s.punkter || []).some(p => p.status === 'avvik')).length

  async function lastSjekklisterPaNytt() {
    setLasterSl(true)
    const alle = await apiFetch('/api/ks/sjekklister')
    onOppdater(alle)
    setLasterSl(false)
  }

  return (
    <div className="ks-side">
      <div className="page-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={onTilbake}>← Oversikt</button>
            <div ref={byttRef} style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prosjekt.navn}</span>
                {alleProsjekter?.length > 1 && onByttProsjekt && (
                  <button className="btn" style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }} onClick={() => setVisBytt(v => !v)}>
                    Bytt {visBytt ? '▲' : '▼'}
                  </button>
                )}
              </div>
              {prosjekt.adresse && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>📍 {prosjekt.adresse}</div>}
              {visBytt && alleProsjekter && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300, width: 360, maxWidth: '90vw' }}>
                  <ProsjektVelger
                    prosjekter={alleProsjekter}
                    sjekklister={alleSjekklister || []}
                    onVelg={p => { setVisBytt(false); onByttProsjekt(p) }}
                    valgt={prosjekt}
                    autoOpen={true}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <div style={{ fontWeight: 800, color: totalPst === 100 ? '#16a34a' : '#f59e0b', fontSize: 20 }}>{totalPst}%</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>{mine.filter(s => s.status === 'ferdig').length}/{mine.length} lister</div>
          </div>
          {avvikTotalt > 0 && <span style={{ fontSize: 12, background: '#fee2e2', color: '#dc2626', fontWeight: 700, padding: '4px 10px', borderRadius: 10 }}>⚠ {avvikTotalt} avvik</span>}
          {kanAdmin && <button className="btn btn-primary" onClick={() => setVisLeggTil(true)}>+ Legg til sjekkliste</button>}
          <button className="btn" onClick={() => genererRapport(prosjekt, mine)} title="Generer PDF-sluttrapport">📄 Rapport</button>
        </div>
      </div>

      {/* Fremdrift */}
      <div style={{ marginBottom: 20 }}>
        <Fremdriftsbar pst={totalPst} avvik={avvikTotalt > 0} hoyde={10} />
      </div>

      {obligManger.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 10 }}>
          ⚠ {obligManger.length} obligatoriske sjekklister mangler ({obligManger.map(m => m.navn).join(', ')})
          {kanAdmin && <button className="btn" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setVisLeggTil(true)}>Legg til</button>}
        </div>
      )}

      {mine.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
          <div style={{ fontSize: 32 }}>📋</div>
          <div style={{ marginBottom: 12 }}>Ingen sjekklister på dette prosjektet ennå.</div>
          {kanAdmin && <button className="btn btn-primary" onClick={() => setVisLeggTil(true)}>+ Legg til sjekkliste</button>}
        </div>
      )}

      {/* Trestruktur */}
      {grupper.map(gruppe => {
        const liste = gruppert[gruppe]
        const erKollapset = kollapset[gruppe]
        const ferdig = liste.filter(s => s.status === 'ferdig').length
        const avvik = liste.filter(s => (s.punkter || []).some(p => p.status === 'avvik')).length
        return (
          <div key={gruppe} className="ks-gruppe">
            <button className="ks-gruppe-hdr" onClick={() => setKollapset(k => ({ ...k, [gruppe]: !k[gruppe] }))}>
              <span className="ks-gruppe-pil">{erKollapset ? '▶' : '▼'}</span>
              <span className="ks-gruppe-navn">{gruppe}</span>
              <span className="ks-gruppe-meta">{ferdig}/{liste.length} ferdig{avvik > 0 ? ` · ` : ''}{avvik > 0 && <span style={{ color: '#dc2626' }}>⚠ {avvik} avvik</span>}</span>
            </button>
            {!erKollapset && (
              <div className="ks-gruppe-liste">
                {liste.map(sl => {
                  const pst = prosent(sl.punkter)
                  const avvikAnt = (sl.punkter || []).filter(p => p.status === 'avvik').length
                  return (
                    <div key={sl.id} className="ks-sl-rad" onClick={() => onAapneSl(sl)}>
                      <div className="ks-sl-rad-info">
                        <div className="ks-sl-rad-navn">{sl.navn}</div>
                        <div className="ks-sl-rad-meta">
                          {sl.ansvarlig?.length > 0 && <span>👤 {sl.ansvarlig.join(', ')}</span>}
                          {sl.frist && <span style={{ color: new Date(sl.frist) < new Date() ? '#dc2626' : '#64748b' }}>📅 {new Date(sl.frist).toLocaleDateString('nb-NO')}</span>}
                          {avvikAnt > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>⚠ {avvikAnt}</span>}
                        </div>
                      </div>
                      <div style={{ width: 140, flexShrink: 0 }}>
                        <Fremdriftsbar pst={pst} avvik={avvikAnt > 0} />
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, textAlign: 'right' }}>{pst}%</div>
                      </div>
                      <StatusPill status={sl.status} />
                      <span style={{ color: '#94a3b8', fontSize: 16, marginLeft: 4 }}>›</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Tegninger */}
      <TegningPanel prosjektId={prosjekt.id} kanAdmin={kanAdmin} />

      {visLeggTil && (
        <LeggTilModal
          prosjektId={prosjekt.id}
          maler={maler}
          eksisterendeMalIds={eksisterendeMalIds}
          onLagre={async () => { setVisLeggTil(false); await lastSjekklisterPaNytt() }}
          onLukk={() => setVisLeggTil(false)}
        />
      )}
    </div>
  )
}

// ── Mal-bibliotek ─────────────────────────────────────────────────────────────

function Bibliotek({ maler, onTilbake, onOppdaterMaler }) {
  const [aiModus, setAiModus] = useState(null)
  const [valgtMal, setValgtMal] = useState(null)
  const [fyller, setFyller] = useState(null)
  const [fyllerAlle, setFyllerAlle] = useState(false)
  const [fyllerProgress, setFyllerProgress] = useState({ gjort: 0, total: 0 })
  const kanAdmin = ROLLE() === 'admin' || ROLLE() === 'kontor'

  const malerUtenBeskrivelse = maler.filter(m => !m.punkter?.some(p => p.beskrivelse))

  const gruppert = {}
  for (const m of maler) {
    const g = m.gruppe || 'Annet'
    if (!gruppert[g]) gruppert[g] = []
    gruppert[g].push(m)
  }
  const grupper = [...GRUPPE_REKKEFØLGE.filter(g => gruppert[g]), ...Object.keys(gruppert).filter(g => !GRUPPE_REKKEFØLGE.includes(g))]

  async function fyllAIBeskrivelse(mal) {
    setFyller(mal.id)
    try {
      await apiFetch('/api/ks/ai', { method: 'POST', body: { action: 'fyll-beskrivelser', malId: mal.id } })
      const oppdatert = await apiFetch('/api/ks/maler')
      onOppdaterMaler(oppdatert)
    } catch (e) { alert('AI-feil: ' + e.message) }
    setFyller(null)
  }

  async function fyllAlleNaa() {
    if (malerUtenBeskrivelse.length === 0) return
    if (!window.confirm(`Fyll beskrivelser på alle ${malerUtenBeskrivelse.length} maler med AI? Dette tar ~3 min og koster ~$4.`)) return
    setFyllerAlle(true)
    setFyllerProgress({ gjort: 0, total: malerUtenBeskrivelse.length })
    for (let i = 0; i < malerUtenBeskrivelse.length; i++) {
      const mal = malerUtenBeskrivelse[i]
      setFyllerProgress({ gjort: i, total: malerUtenBeskrivelse.length, navaerendeMal: mal.navn })
      try {
        await apiFetch('/api/ks/ai', { method: 'POST', body: { action: 'fyll-beskrivelser', malId: mal.id } })
      } catch (e) {
        console.warn(`Feil på mal ${mal.navn}:`, e.message)
      }
    }
    const oppdatert = await apiFetch('/api/ks/maler')
    onOppdaterMaler(oppdatert)
    setFyllerAlle(false)
    setFyllerProgress({ gjort: 0, total: 0 })
  }

  async function aiHandter({ type, diff, malId, mal: nyMal }) {
    if (type === 'endre' && diff) {
      const mList = await apiFetch('/api/ks/maler')
      const m = mList.find(x => x.id === malId)
      if (!m) return
      let nyePunkter = [...m.punkter]
      for (const e of diff.endre || []) nyePunkter = nyePunkter.map(p => p.id === e.id ? { ...p, [e.felt]: e.til } : p)
      for (const f of diff.fjern || []) nyePunkter = nyePunkter.filter(p => p.id !== f.id)
      for (const a of diff.leggTil || []) nyePunkter.push({ id: `p-ny-${Date.now()}`, tekst: a.tekst, beskrivelse: a.beskrivelse || '', veiledning_kort: a.veiledning_kort || '', regelverkLenker: a.regelverkLenker || [], krever_bilde: a.krever_bilde || false, krever_signering: a.krever_signering || false, kommentar_pakrevd: a.kommentar_pakrevd || false })
      await apiFetch(`/api/ks/maler?id=${malId}`, { method: 'PUT', body: { ...m, punkter: nyePunkter } })
      onOppdaterMaler(await apiFetch('/api/ks/maler'))
    }
    if (type === 'ny-mal' && nyMal) {
      const id = `mal-${Date.now()}`
      await apiFetch('/api/ks/maler', { method: 'POST', body: { ...nyMal, id } })
      onOppdaterMaler(await apiFetch('/api/ks/maler'))
    }
    setAiModus(null)
    setValgtMal(null)
  }

  return (
    <div className="ks-side">
      <div className="page-header">
        <div>
          <button className="btn" style={{ marginRight: 12 }} onClick={onTilbake}>← Oversikt</button>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>Sjekkliste-bibliotek</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {kanAdmin && (
            <button className="btn" onClick={() => { setValgtMal(null); setAiModus('ny') }}>✨ Lag ny mal</button>
          )}
          <span style={{ fontSize: 13, color: '#94a3b8', alignSelf: 'center' }}>{maler.length} maler</span>
        </div>
      </div>

      {/* AI fyll-alle banner */}
      {kanAdmin && malerUtenBeskrivelse.length > 0 && (
        <div style={{ background: fyllerAlle ? '#eff6ff' : '#fef3c7', border: `1px solid ${fyllerAlle ? '#3b82f6' : '#f59e0b'}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: fyllerAlle ? '#1d4ed8' : '#92400e' }}>
              {fyllerAlle
                ? `✨ Fyller ${fyllerProgress.gjort + 1} av ${fyllerProgress.total}: ${fyllerProgress.navaerendeMal || ''}...`
                : `⚠️ ${malerUtenBeskrivelse.length} maler mangler beskrivelser`}
            </div>
            {!fyllerAlle && <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>AI fyller regelverk og veiledning på alle sjekkpunkter (~3 min, ~$4)</div>}
            {fyllerAlle && (
              <div style={{ marginTop: 6 }}>
                <Fremdriftsbar pst={Math.round(fyllerProgress.gjort / fyllerProgress.total * 100)} hoyde={4} />
                <div style={{ fontSize: 11, color: '#1d4ed8', marginTop: 2 }}>{Math.round(fyllerProgress.gjort / fyllerProgress.total * 100)}%</div>
              </div>
            )}
          </div>
          {!fyllerAlle && (
            <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={fyllAlleNaa}>
              ✨ Fyll beskrivelser på alle {malerUtenBeskrivelse.length} nå
            </button>
          )}
        </div>
      )}

      {grupper.map(g => (
        <div key={g} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 3, height: 16, background: '#3b82f6', borderRadius: 2, display: 'inline-block' }} />
            {g} ({gruppert[g].length})
          </div>
          <div className="ks-bib-grid">
            {gruppert[g].map(m => {
              const harBeskrivelse = m.punkter?.some(p => p.beskrivelse)
              return (
                <div key={m.id} className="ks-bib-kort">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{m.navn}</div>
                    {m.obligatorisk && <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 5px' }}>Obligatorisk</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{m.punkter?.length || 0} punkter · v{m.versjon || 1} · {m.fag?.join(', ') || 'alle fag'}</div>
                  {m.punkter?.slice(0, 2).map(p => (
                    <div key={p.id} style={{ fontSize: 11, color: '#64748b', padding: '2px 0', borderTop: '1px solid #f8fafc' }}>
                      · {p.tekst}{p.krever_signering ? ' ✍️' : ''}{p.krever_bilde ? ' 📷' : ''}
                    </div>
                  ))}
                  {(m.punkter?.length || 0) > 2 && <div style={{ fontSize: 11, color: '#94a3b8' }}>+ {m.punkter.length - 2} til...</div>}
                  {kanAdmin && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="ks-bib-btn" onClick={() => { setValgtMal(m); setAiModus('endre') }}>✨ Endre</button>
                      {!harBeskrivelse && (
                        <button className="ks-bib-btn" onClick={() => fyllAIBeskrivelse(m)} disabled={fyller === m.id} style={{ color: '#0891b2' }}>
                          {fyller === m.id ? '⏳ AI...' : '📖 Fyll beskrivelser'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {aiModus && <AiModal modus={aiModus} mal={valgtMal} onFerdig={aiHandter} onLukk={() => { setAiModus(null); setValgtMal(null) }} />}
    </div>
  )
}

// ── Tegning-modal (pinpoints) ─────────────────────────────────────────────────

function TegningModal({ tegning, onLagrePinpoints, onLukk }) {
  const [pins, setPins] = useState(tegning.pinpoints || [])
  const [modus, setModus] = useState(null) // null | 'plasser'
  const [lagrer, setLagrer] = useState(false)
  const imgRef = useRef()

  function klikk(e) {
    if (modus !== 'plasser') return
    const rect = imgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setPins(prev => [...prev, { id: `pin-${Date.now()}`, x, y, label: '', sjekkpunktId: null }])
    setModus(null)
  }

  async function lagre() {
    setLagrer(true)
    try {
      await apiFetch(`/api/ks/tegninger?id=${tegning.id}`, { method: 'PUT', body: { ...tegning, pinpoints: pins } })
      onLagrePinpoints(pins)
      onLukk()
    } catch (e) { alert('Lagring feilet: ' + e.message) }
    setLagrer(false)
  }

  return (
    <div className="modal-backdrop" onClick={onLukk}>
      <div className="modal" style={{ maxWidth: 820, maxHeight: '92vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📐 {tegning.tittel || tegning.navn}</h3>
          <button className="btn-icon" onClick={onLukk}>✕</button>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ position: 'relative', cursor: modus === 'plasser' ? 'crosshair' : 'default', userSelect: 'none' }}>
            <img ref={imgRef} src={tegning.url} alt={tegning.navn}
              style={{ width: '100%', borderRadius: 8, display: 'block' }}
              onClick={klikk} />
            {pins.map((pin, i) => (
              <div key={pin.id} style={{ position: 'absolute', left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, transform: 'translate(-50%, -100%)', zIndex: 10, lineHeight: 1 }}
                title={pin.label || `Pinpoint ${i + 1} — klikk for å fjerne`}
                onClick={e => { e.stopPropagation(); setPins(p => p.filter(x => x.id !== pin.id)) }}>
                <span style={{ fontSize: 22, cursor: 'pointer', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.4))' }}>📍</span>
                {pin.label && (
                  <span style={{ position: 'absolute', left: 24, top: 0, background: '#1e293b', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                    {pin.label}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`btn ${modus === 'plasser' ? 'btn-primary' : ''}`} onClick={() => setModus(m => m === 'plasser' ? null : 'plasser')}>
              {modus === 'plasser' ? '🎯 Klikk på tegning...' : '+ Legg til pinpoint'}
            </button>
            {pins.length > 0 && (
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {pins.length} pinpoints · Klikk 📍 for å fjerne
              </span>
            )}
          </div>

          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button className="btn" onClick={onLukk}>Avbryt</button>
            <button className="btn btn-primary" onClick={lagre} disabled={lagrer}>
              {lagrer ? '⏳ Lagrer...' : '💾 Lagre pinpoints'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tegning-panel (inn i ProsjektVisning) ─────────────────────────────────────

function TegningPanel({ prosjektId, kanAdmin }) {
  const [tegninger, setTegninger] = useState([])
  const [laster, setLaster] = useState(true)
  const [valgt, setValgt] = useState(null)
  const [lasterOpp, setLasterOpp] = useState(false)
  const filRef = useRef()

  useEffect(() => {
    apiFetch(`/api/ks/tegninger?prosjektId=${prosjektId}`)
      .then(setTegninger).catch(() => {}).finally(() => setLaster(false))
  }, [prosjektId])

  async function lastOpp(fil) {
    setLasterOpp(true)
    try {
      const form = new FormData()
      form.append('fil', fil, fil.name)
      form.append('prosjektId', prosjektId)
      form.append('tittel', fil.name.replace(/\.[^.]+$/, ''))
      const res = await fetch('/api/ks/tegninger', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN()}` },
        body: form,
      })
      if (!res.ok) throw new Error((await res.json()).error || res.statusText)
      const ny = await res.json()
      setTegninger(prev => [...prev, ny])
    } catch (e) { alert('Opplasting feilet: ' + e.message) }
    setLasterOpp(false)
  }

  if (laster) return <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>Laster tegninger...</div>

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>📐 Tegninger ({tegninger.length})</div>
        {kanAdmin && (
          <>
            <input ref={filRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) lastOpp(e.target.files[0]) }} />
            <button className="btn" onClick={() => filRef.current.click()} disabled={lasterOpp}>
              {lasterOpp ? '⏳ Laster opp...' : '+ Last opp tegning'}
            </button>
          </>
        )}
      </div>

      {tegninger.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
          Ingen tegninger lastet opp ennå
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {tegninger.map(t => (
            <div key={t.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, cursor: 'pointer', transition: 'box-shadow .2s' }}
              onClick={() => setValgt(t)}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
              <div style={{ aspectRatio: '4/3', background: '#e2e8f0', borderRadius: 6, marginBottom: 6, overflow: 'hidden' }}>
                {t.url && <img src={t.url} alt={t.navn} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tittel || t.navn}</div>
              {(t.pinpoints?.length || 0) > 0 && (
                <div style={{ fontSize: 11, color: '#64748b' }}>📍 {t.pinpoints.length} pinpoints</div>
              )}
            </div>
          ))}
        </div>
      )}

      {valgt && (
        <TegningModal
          tegning={valgt}
          onLagrePinpoints={pins => setTegninger(prev => prev.map(t => t.id === valgt.id ? { ...t, pinpoints: pins } : t))}
          onLukk={() => setValgt(null)}
        />
      )}
    </div>
  )
}

// ── Avvik-kort (brukes i AvvikOversikt) ───────────────────────────────────────

function AvvikKort({ avvik: a, prosjekter, kanAdmin, onOppdater }) {
  const [utvidet, setUtvidet] = useState(false)
  const [alvorlighet, setAlvorlighet] = useState(a.alvorlighet)
  const [tiltak, setTiltak] = useState(a.tiltak_beskrivelse || '')
  const [ansvarlig, setAnsvarlig] = useState(a.ansvarlig_for_lukking || '')
  const [lagrer, setLagrer] = useState(false)
  const prosjekt = prosjekter.find(p => p.id === a.prosjektId)
  const erForfalt = a.frist && new Date(a.frist) < new Date() && a.status !== 'lukket'

  async function lagre() {
    setLagrer(true)
    await onOppdater({ ...a, alvorlighet, tiltak_beskrivelse: tiltak, ansvarlig_for_lukking: ansvarlig })
    setLagrer(false); setUtvidet(false)
  }

  return (
    <div className="ks-avvik-kort" style={{ borderLeft: `4px solid ${ALVORLIGHET_CFG[a.alvorlighet]?.farge || '#f59e0b'}`, marginBottom: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{a.tittel}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {prosjekt && <span>📁 {prosjekt.navn}</span>}
            {a.registrert_av && <span>· av {a.registrert_av}</span>}
            {a.registrert_dato && <span>· {new Date(a.registrert_dato).toLocaleDateString('nb-NO')}</span>}
            {a.frist && <span style={{ color: erForfalt ? '#dc2626' : '#64748b', fontWeight: erForfalt ? 700 : 400 }}>
              · Frist: {new Date(a.frist).toLocaleDateString('nb-NO')}{erForfalt ? ' ⚠ Forfalt' : ''}
            </span>}
          </div>
          {a.beskrivelse && <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{a.beskrivelse}</div>}
          {a.ansvarlig_for_lukking && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>👤 {a.ansvarlig_for_lukking}</div>}
          {a.tiltak_beskrivelse && <div style={{ fontSize: 12, color: '#475569', marginTop: 2, fontStyle: 'italic' }}>🔧 {a.tiltak_beskrivelse}</div>}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: ALVORLIGHET_CFG[a.alvorlighet]?.farge }}>{ALVORLIGHET_CFG[a.alvorlighet]?.label}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
            background: a.status === 'lukket' ? '#dcfce7' : a.status === 'i-arbeid' ? '#fef9c3' : '#fee2e2',
            color: a.status === 'lukket' ? '#16a34a' : a.status === 'i-arbeid' ? '#ca8a04' : '#dc2626' }}>
            {a.status === 'lukket' ? '✓ Lukket' : a.status === 'i-arbeid' ? 'I arbeid' : 'Åpen'}
          </span>
          {kanAdmin && a.status !== 'lukket' && (
            <>
              {a.status === 'apen' && <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => onOppdater({ ...a, status: 'i-arbeid' })}>Start →</button>}
              <button className="btn" style={{ fontSize: 11, padding: '3px 8px', color: '#16a34a', borderColor: '#16a34a' }} onClick={() => onOppdater({ ...a, status: 'lukket' })}>Lukk ✓</button>
            </>
          )}
          <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setUtvidet(v => !v)}>{utvidet ? '▲' : '▼'}</button>
        </div>
      </div>

      {utvidet && kanAdmin && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="input" style={{ padding: '6px 10px', flex: 1, minWidth: 120 }} value={alvorlighet} onChange={e => setAlvorlighet(e.target.value)}>
              {Object.entries(ALVORLIGHET_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input className="input" placeholder="Ansvarlig for lukking" value={ansvarlig} onChange={e => setAnsvarlig(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          </div>
          <textarea className="input" rows={2} placeholder="Beskriv tiltak som er iverksatt..." value={tiltak} onChange={e => setTiltak(e.target.value)} />
          <button className="btn btn-primary" onClick={lagre} disabled={lagrer} style={{ alignSelf: 'flex-start' }}>
            {lagrer ? '⏳...' : '💾 Lagre'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Avvik-oversikt (standalone view) ─────────────────────────────────────────

function AvvikOversikt({ prosjekter, onTilbake }) {
  const [avvik, setAvvik] = useState([])
  const [laster, setLaster] = useState(true)
  const [filProsjekt, setFilProsjekt] = useState('')
  const [filStatus, setFilStatus] = useState('')
  const [filAlv, setFilAlv] = useState('')
  const kanAdmin = ROLLE() === 'admin' || ROLLE() === 'kontor'

  useEffect(() => {
    apiFetch('/api/ks/avvik').then(setAvvik).catch(() => {}).finally(() => setLaster(false))
  }, [])

  async function oppdater(id, data) {
    const opp = await apiFetch(`/api/ks/avvik?id=${id}`, { method: 'PUT', body: data })
    setAvvik(prev => prev.map(a => a.id === id ? opp : a))
  }

  const filtrert = avvik.filter(a =>
    (!filProsjekt || a.prosjektId === filProsjekt) &&
    (!filStatus || a.status === filStatus) &&
    (!filAlv || a.alvorlighet === filAlv)
  )

  if (laster) return (
    <div className="ks-side" style={{ textAlign: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 32 }}>⏳</div>
    </div>
  )

  const apne = avvik.filter(a => a.status === 'apen').length
  const iArbeid = avvik.filter(a => a.status === 'i-arbeid').length
  const lukket = avvik.filter(a => a.status === 'lukket').length
  const kritiske = avvik.filter(a => a.alvorlighet === 'kritisk' && a.status !== 'lukket').length

  return (
    <div className="ks-side">
      <div className="page-header">
        <div>
          <button className="btn" style={{ marginRight: 12 }} onClick={onTilbake}>← Oversikt</button>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>⚠️ Avvik-register</span>
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>{avvik.length} avvik totalt</div>
      </div>

      <div className="ks-stats" style={{ marginBottom: 20 }}>
        <div className="ks-stat-kort" style={{ borderColor: '#dc2626' }}>
          <div className="ks-stat-tall" style={{ color: '#dc2626' }}>{apne}</div>
          <div className="ks-stat-label">Åpne</div>
        </div>
        <div className="ks-stat-kort" style={{ borderColor: '#f59e0b' }}>
          <div className="ks-stat-tall" style={{ color: '#ca8a04' }}>{iArbeid}</div>
          <div className="ks-stat-label">I arbeid</div>
        </div>
        {kritiske > 0 && (
          <div className="ks-stat-kort" style={{ borderColor: '#dc2626', background: '#fef2f2' }}>
            <div className="ks-stat-tall" style={{ color: '#dc2626' }}>{kritiske}</div>
            <div className="ks-stat-label">Kritiske</div>
          </div>
        )}
        <div className="ks-stat-kort" style={{ borderColor: '#16a34a' }}>
          <div className="ks-stat-tall" style={{ color: '#16a34a' }}>{lukket}</div>
          <div className="ks-stat-label">Lukket</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="input" style={{ padding: '6px 10px', flex: 1, minWidth: 160, maxWidth: 220 }} value={filProsjekt} onChange={e => setFilProsjekt(e.target.value)}>
          <option value="">Alle prosjekter</option>
          {prosjekter.map(p => <option key={p.id} value={p.id}>{p.navn}</option>)}
        </select>
        <select className="input" style={{ padding: '6px 10px', minWidth: 140 }} value={filStatus} onChange={e => setFilStatus(e.target.value)}>
          <option value="">Alle statuser</option>
          <option value="apen">Åpen</option>
          <option value="i-arbeid">I arbeid</option>
          <option value="lukket">Lukket</option>
        </select>
        <select className="input" style={{ padding: '6px 10px', minWidth: 140 }} value={filAlv} onChange={e => setFilAlv(e.target.value)}>
          <option value="">Alle alvorligheter</option>
          {Object.entries(ALVORLIGHET_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {filtrert.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>
          {avvik.length === 0 ? '✅ Ingen avvik registrert' : 'Ingen avvik matcher filtrene'}
        </div>
      ) : filtrert.map(a => (
        <AvvikKort key={a.id} avvik={a} prosjekter={prosjekter} kanAdmin={kanAdmin}
          onOppdater={data => oppdater(a.id, data)} />
      ))}
    </div>
  )
}

// ── PDF sluttrapport ──────────────────────────────────────────────────────────

async function genererRapport(prosjekt, sjekklister) {
  const avvik = await apiFetch(`/api/ks/avvik?prosjektId=${prosjekt.id}`).catch(() => [])
  const dato = new Date().toLocaleDateString('nb-NO', { dateStyle: 'full' })

  const rowFarge = s => s === 'ok' ? '#16a34a' : s === 'avvik' ? '#dc2626' : s === 'ikke-aktuelt' ? '#64748b' : '#94a3b8'
  const rowLabel = s => s === 'ok' ? 'OK ✓' : s === 'avvik' ? 'Avvik' : s === 'ikke-aktuelt' ? 'N/A' : 'Ikke utført'

  const html = `<!DOCTYPE html>
<html lang="nb">
<head><meta charset="utf-8">
<title>KS-rapport: ${prosjekt.navn}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1e293b;margin:20mm 15mm}
  h1{font-size:18px;margin:0 0 4px}
  h2{font-size:13px;margin:18px 0 6px;border-bottom:2px solid #1e293b;padding-bottom:3px}
  h3{font-size:12px;margin:14px 0 4px;color:#475569}
  table{width:100%;border-collapse:collapse;margin-top:4px;font-size:10px}
  th{background:#f1f5f9;text-align:left;padding:5px 7px;border:1px solid #e2e8f0}
  td{padding:4px 7px;border:1px solid #f1f5f9;vertical-align:top}
  .meta{color:#64748b;font-size:10px;margin-bottom:2px}
  .ok{color:#16a34a;font-weight:700}
  .avvik{color:#dc2626;font-weight:700}
  .na{color:#64748b}
  .footer{margin-top:30px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:right}
  @media print{body{margin:10mm}}
</style></head>
<body>
<h1>KS/HMS-sluttrapport: ${prosjekt.navn}</h1>
<p class="meta">Generert: ${dato}${prosjekt.adresse ? ' · 📍 ' + prosjekt.adresse : ''}</p>
<p class="meta">${sjekklister.length} sjekklister · ${avvik.length} avvik registrert · ${avvik.filter(a => a.status === 'lukket').length} avvik lukket</p>

<h2>Sjekklister</h2>
${sjekklister.map(sl => {
  const pst = prosent(sl.punkter)
  const avvikAnt = (sl.punkter || []).filter(p => p.status === 'avvik').length
  return `
<h3>${sl.navn} — ${pst}%${sl.status === 'ferdig' ? ' ✓ FERDIG' : avvikAnt > 0 ? ` | ⚠ ${avvikAnt} avvik` : ''}</h3>
${sl.ansvarlig?.length ? `<p class="meta">Ansvarlig: ${sl.ansvarlig.join(', ')}</p>` : ''}
${sl.frist ? `<p class="meta">Frist: ${new Date(sl.frist).toLocaleDateString('nb-NO')}</p>` : ''}
<table>
<tr><th>#</th><th>Sjekkpunkt</th><th>Status</th><th>Utført av</th><th>Dato</th><th>Kommentar</th></tr>
${(sl.punkter || []).map((p, i) => `<tr>
  <td>${i + 1}</td><td>${p.tekst}</td>
  <td style="color:${rowFarge(p.status)}">${rowLabel(p.status)}</td>
  <td>${p.utfort_av || '–'}</td>
  <td>${p.utfort_dato ? new Date(p.utfort_dato).toLocaleDateString('nb-NO') : '–'}</td>
  <td>${p.kommentar || ''}</td>
</tr>`).join('')}
</table>`
}).join('')}

${avvik.length > 0 ? `
<h2>Avvik</h2>
<table>
<tr><th>Avvik</th><th>Alvorlighet</th><th>Status</th><th>Ansvarlig</th><th>Frist</th><th>Tiltak</th></tr>
${avvik.map(a => `<tr>
  <td>${a.tittel}${a.beskrivelse ? '<br><span style="color:#64748b">' + a.beskrivelse + '</span>' : ''}</td>
  <td style="color:${ALVORLIGHET_CFG[a.alvorlighet]?.farge}">${ALVORLIGHET_CFG[a.alvorlighet]?.label}</td>
  <td class="${a.status === 'lukket' ? 'ok' : 'avvik'}">${a.status === 'lukket' ? 'Lukket ✓' : a.status === 'i-arbeid' ? 'I arbeid' : 'Åpen'}</td>
  <td>${a.ansvarlig_for_lukking || '–'}</td>
  <td>${a.frist ? new Date(a.frist).toLocaleDateString('nb-NO') : '–'}</td>
  <td>${a.tiltak_beskrivelse || '–'}</td>
</tr>`).join('')}
</table>` : ''}

<div class="footer">Follo Byggservice · KS/HMS-system · ${dato}</div>
<script>window.addEventListener('load',()=>window.print())</script>
</body></html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

// ── Prosjekt-velger (søkbar dropdown) ────────────────────────────────────────

function ProsjektVelger({ prosjekter, sjekklister, onVelg, valgt, autoOpen = false }) {
  const [aapen, setAapen] = useState(autoOpen)
  const [sok, setSok] = useState('')
  const dropdownRef = useRef()

  useEffect(() => {
    function lukk(e) { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setAapen(false) }
    document.addEventListener('mousedown', lukk)
    return () => document.removeEventListener('mousedown', lukk)
  }, [])

  const filtrert = prosjekter
    .filter(p => !sok || p.navn.toLowerCase().includes(sok.toLowerCase()) || (p.adresse || '').toLowerCase().includes(sok.toLowerCase()))
    .sort((a, b) => a.navn.localeCompare(b.navn, 'nb'))

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', border: `2px solid ${aapen ? '#3b82f6' : '#e2e8f0'}`, borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: valgt ? 600 : 400, color: valgt ? '#1e293b' : '#94a3b8', transition: 'border-color .15s', textAlign: 'left' }}
        onClick={() => { setAapen(v => !v); setSok('') }}>
        <span>{valgt ? `📁 ${valgt.navn}` : '🔍 Søk eller velg prosjekt...'}</span>
        <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8, flexShrink: 0 }}>{aapen ? '▲' : '▼'}</span>
      </button>

      {aapen && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.14)', zIndex: 200, maxHeight: 420, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
            <input autoFocus className="input" style={{ margin: 0, fontSize: 14 }}
              placeholder="Søk prosjekt eller adresse..." value={sok} onChange={e => setSok(e.target.value)} />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtrert.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Ingen prosjekter funnet</div>
            )}
            {filtrert.map(p => {
              const mine = sjekklister.filter(s => s.prosjektId === p.id)
              const pst = mine.length ? Math.round(mine.reduce((sum, s) => sum + prosent(s.punkter), 0) / mine.length) : 0
              const avvikAnt = mine.filter(s => (s.punkter || []).some(pt => pt.status === 'avvik')).length
              const erValgt = valgt?.id === p.id
              return (
                <div key={p.id}
                  style={{ padding: '11px 16px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', background: erValgt ? '#eff6ff' : '#fff', transition: 'background .1s' }}
                  onMouseEnter={e => { if (!erValgt) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={e => { if (!erValgt) e.currentTarget.style.background = '#fff' }}
                  onClick={() => { onVelg(p); setAapen(false); setSok('') }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{p.navn}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      {avvikAnt > 0 && <span style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>⚠ {avvikAnt}</span>}
                      {mine.length > 0 && <span style={{ fontSize: 11, color: pst === 100 ? '#16a34a' : '#64748b', fontWeight: 600 }}>{pst}%</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {p.adresse && <span>📍 {p.adresse}</span>}
                    <span>{mine.length} sjekklister</span>
                  </div>
                  {mine.length > 0 && <div style={{ marginTop: 5 }}><Fremdriftsbar pst={pst} avvik={avvikAnt > 0} hoyde={3} /></div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Oversiktsskjerm ───────────────────────────────────────────────────────────

function Oversikt({ prosjekter, sjekklister, maler, onVelgProsjekt, onVisBibliotek, onVisAvvik, onRensTestData }) {
  const [aiModal, setAiModal] = useState(false)
  const [visdiag, setVisdiag] = useState(false)
  const totalFerdig = sjekklister.filter(s => s.status === 'ferdig').length
  const totalAvvik = sjekklister.filter(s => (s.punkter || []).some(p => p.status === 'avvik')).length

  // Diagnostikk: sjekklister som ikke matcher noen prosjekt
  const prosjektIds = new Set(prosjekter.map(p => p.id))
  const ugyldigeSl = sjekklister.filter(s => !prosjektIds.has(s.prosjektId))
  const harMismatch = ugyldigeSl.length > 0 && sjekklister.length > 0

  return (
    <div className="ks-side">
      {/* AI-banner */}
      <div className="ks-ai-banner" onClick={() => setAiModal(true)}>
        <div className="ks-ai-banner-ikon">✨</div>
        <div>
          <div className="ks-ai-banner-tittel">Spør AI</div>
          <div className="ks-ai-banner-sub">Lag ny sjekkliste · Endre eksisterende · Få hjelp</div>
        </div>
      </div>

      {/* Prosjektvelger */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 20px 22px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>📁 Velg prosjekt</div>
        <ProsjektVelger prosjekter={prosjekter} sjekklister={sjekklister} onVelg={onVelgProsjekt} valgt={null} />
      </div>

      {/* Knapper */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onVisBibliotek}>📚 Mal-bibliotek ({maler.length})</button>
        <button className="btn" onClick={onVisAvvik}>⚠️ Avvik-register</button>
      </div>

      {/* Sammendrag */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px' }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>📊 Sammendrag</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 13, color: '#1e293b' }}>• <strong>{prosjekter.length}</strong> aktive prosjekter</div>
          <div style={{ fontSize: 13, color: '#1e293b' }}>• <strong>{sjekklister.length}</strong> sjekkliste-instanser totalt</div>
          <div style={{ fontSize: 13, color: totalFerdig > 0 ? '#16a34a' : '#1e293b' }}>• <strong>{totalFerdig}</strong> ferdig</div>
          {totalAvvik > 0 && <div style={{ fontSize: 13, color: '#dc2626', cursor: 'pointer' }} onClick={onVisAvvik}>• <strong>{totalAvvik}</strong> med åpne avvik ↗</div>}
          {sjekklister.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Ingen sjekklister ennå — åpne et prosjekt og klikk «+ Legg til sjekkliste».</div>}
        </div>
      </div>

      {/* Diagnostikk-banner: sjekklister koblet til ukjente prosjekter */}
      {harMismatch && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 12, padding: '12px 16px', marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setVisdiag(v => !v)}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
              ⚠️ {ugyldigeSl.length} sjekklister er koblet til prosjekter som ikke finnes {visdiag ? '▲' : '▼'}
            </span>
            {onRensTestData && (
              <button className="btn" style={{ fontSize: 11, padding: '3px 10px', background: '#dc2626', color: '#fff', border: 'none' }}
                onClick={e => { e.stopPropagation(); onRensTestData(ugyldigeSl.map(s => s.id)) }}>
                🗑 Slett disse
              </button>
            )}
          </div>
          {visdiag && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#92400e' }}>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>ProsjektIder i systemet: {[...prosjektIds].slice(0, 5).join(', ')}{prosjektIds.size > 5 ? ` +${prosjektIds.size - 5} til` : ''}</div>
              {[...new Set(ugyldigeSl.map(s => s.prosjektId))].map(id => (
                <div key={id} style={{ padding: '2px 0' }}>
                  • ID <code style={{ background: '#fef9c3', padding: '0 3px', borderRadius: 2 }}>{id}</code> — {ugyldigeSl.filter(s => s.prosjektId === id).length} sjekklister
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {aiModal && <AiModal modus="ny" onFerdig={() => setAiModal(false)} onLukk={() => setAiModal(false)} />}
    </div>
  )
}

// ── Rot-komponent ─────────────────────────────────────────────────────────────

export default function KS() {
  const { state } = useApp()
  const [maler, setMaler] = useState([])
  const [sjekklister, setSjekklister] = useState([])
  const [laster, setLaster] = useState(true)
  const [feil, setFeil] = useState(null)
  const [view, setView] = useState('oversikt') // oversikt | prosjekt | sjekkliste | bibliotek | avvik
  const [valgtProsjekt, setValgtProsjekt] = useState(null)
  const [valgtSl, setValgtSl] = useState(null)
  const [aiFlyt, setAiFlyt] = useState(false)
  const [lasterProsjekt, setLasterProsjekt] = useState(false)

  function velgProsjekt(p) {
    setLasterProsjekt(true)
    startTransition(() => {
      setValgtProsjekt(p)
      setView('prosjekt')
      setLasterProsjekt(false)
    })
  }

  async function rensOrphans(ids) {
    if (!window.confirm(`Slett ${ids.length} sjekklister som er koblet til ukjente prosjekter?`)) return
    await Promise.all(ids.map(id => apiFetch(`/api/ks/sjekklister?id=${id}`, { method: 'DELETE' }).catch(() => {})))
    const ferske = await apiFetch('/api/ks/sjekklister')
    setSjekklister(ferske)
  }

  const isAdmin = ROLLE() === 'admin'

  const last = useCallback(async () => {
    setLaster(true); setFeil(null)
    try {
      const [m, s] = await Promise.all([apiFetch('/api/ks/maler'), apiFetch('/api/ks/sjekklister')])
      setMaler(m)
      setSjekklister(s)
      // Seed ved tom
      if (m.length === 0 && isAdmin) {
        await apiFetch('/api/ks/init', { method: 'POST' })
        const friske = await apiFetch('/api/ks/maler')
        setMaler(friske)
      }
    } catch (e) { setFeil(e.message) }
    setLaster(false)
  }, [isAdmin])

  useEffect(() => { last() }, [last])

  // Kun aktive prosjekter med KS-relevans
  const prosjekter = (state.prosjekter || []).filter(p => p.status === 'aktiv' || p.status === undefined)

  const ansatte = state.ansatte || []

  if (laster) return (
    <div className="ks-side" style={{ textAlign: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 32 }}>⏳</div>
      <div style={{ color: '#64748b', marginTop: 12 }}>Laster KS-data...</div>
    </div>
  )

  if (feil) return (
    <div className="ks-side" style={{ textAlign: 'center', paddingTop: 80 }}>
      <div style={{ color: '#dc2626', marginBottom: 12 }}>Feil: {feil}</div>
      <button className="btn btn-primary" onClick={last}>Prøv igjen</button>
    </div>
  )

  // ── Sjekkliste-detalj ────────────────────────────────────────────────────────
  if (view === 'sjekkliste' && valgtSl) {
    const ansatteIProsj = [...new Set(
      (ansatte).filter(a => a.prosjekt === valgtProsjekt?.id || a.prosjekter?.includes(valgtProsjekt?.id)).map(a => a.navn)
    )]
    return (
      <SjekklisteDetalj
        sl={valgtSl}
        ansatteIProsj={ansatteIProsj}
        onOppdater={opp => {
          setSjekklister(prev => prev.map(s => s.id === opp.id ? opp : s))
          setValgtSl(opp)
        }}
        onTilbake={() => setView('prosjekt')}
      />
    )
  }

  // ── Prosjekt-visning ──────────────────────────────────────────────────────────
  if (view === 'prosjekt' && valgtProsjekt) {
    if (lasterProsjekt) return (
      <div className="ks-side" style={{ textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: 32 }}>⏳</div>
        <div style={{ color: '#64748b', marginTop: 12 }}>Laster prosjekt...</div>
      </div>
    )
    return (
      <ProsjektVisning
        prosjekt={valgtProsjekt}
        sjekklister={sjekklister}
        maler={maler}
        ansatte={ansatte}
        alleProsjekter={prosjekter}
        alleSjekklister={sjekklister}
        onOppdater={nySl => setSjekklister(nySl)}
        onTilbake={() => setView('oversikt')}
        onAapneSl={sl => { setValgtSl(sl); setView('sjekkliste') }}
        onByttProsjekt={velgProsjekt}
      />
    )
  }

  // ── Avvik-oversikt ────────────────────────────────────────────────────────────
  if (view === 'avvik') {
    return (
      <AvvikOversikt
        prosjekter={prosjekter}
        onTilbake={() => setView('oversikt')}
      />
    )
  }

  // ── Bibliotek ─────────────────────────────────────────────────────────────────
  if (view === 'bibliotek') {
    return (
      <Bibliotek
        maler={maler}
        onTilbake={() => setView('oversikt')}
        onOppdaterMaler={setMaler}
      />
    )
  }

  // ── Oversikt ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Oversikt
        prosjekter={prosjekter}
        sjekklister={sjekklister}
        maler={maler}
        onVelgProsjekt={velgProsjekt}
        onVisBibliotek={() => setView('bibliotek')}
        onVisAvvik={() => setView('avvik')}
        onRensTestData={isAdmin ? rensOrphans : undefined}
      />
      {/* AI-floating-button */}
      <button className="ks-fab" onClick={() => setAiFlyt(true)} title="Spør AI">✨</button>
      {aiFlyt && <AiModal modus="hjelp" onFerdig={() => setAiFlyt(false)} onLukk={() => setAiFlyt(false)} />}
    </>
  )
}
