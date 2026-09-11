// DragMotor — felles pointer-basert dra-og-slipp for bemanningsplanen
// (postkasse-oppdrag 29). Brukes både for pipeline-rader og tildelings-
// stolper, i Ukeoversikt og Oversikt/Storskjerm/Fullskjerm.
//  - pointerdown/move/up med setPointerCapture (HTML5-drag gir ikke
//    autoscroll), flytende «spøkelse» av det som dras
//  - autoscroll når musa er < 60 px fra kant av planens scroll-container
//    eller vinduet, med økende fart nærmere kanten
//  - slipp-mål = enhver rad med [data-ansatt-id] × kolonne; målcellen
//    markeres (rød ved konflikt). Målet regnes ut av visningen via
//    `finnMaal(clientX, clientY)` → { ansattId, dag, celleEl } | null
//  - touch: langt trykk (400 ms) starter drag; mus: 5 px bevegelse
//  - Alt/Ctrl under drag = «Kopier» (vises i spøkelset)

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

const KANT = 60;          // px fra kant der autoscroll starter
const MAKS_FART = 28;     // px per frame ved kanten
const TERSKEL = 5;        // px bevegelse før mus-drag starter
const LANGT_TRYKK = 400;  // ms for touch

function fart(avstand) {
  if (avstand >= KANT) return 0;
  const f = (KANT - Math.max(0, avstand)) / KANT; // 0..1
  return Math.round(MAKS_FART * f * f + 2);
}

let sisteDragSlutt = 0;
export function nyligDratt() { return Date.now() - sisteDragSlutt < 400; }

// Spøkelset har egen state så planen (tusenvis av celler) ikke re-rendres
// for hver pointermove — bare denne lille portalen oppdateres.
function DragGhost({ abonner }) {
  const [aktiv, setAktiv] = useState(null);
  useEffect(() => abonner(setAktiv), [abonner]);
  if (!aktiv) return null;
  return createPortal(
    <div className="dm-spokelse" style={{ left: aktiv.x + 14, top: aktiv.y + 12 }}>
      <span className={`dm-spokelse-modus${aktiv.kopier ? ' dm-spokelse-modus--kopier' : ''}`}>
        {aktiv.kind === 'pipeline' ? 'Legg inn' : aktiv.kopier ? 'Kopier' : 'Flytt'}
      </span>
      <span className="dm-spokelse-tekst">{aktiv.tekst}</span>
      {aktiv.konflikt && <span className="dm-spokelse-konflikt">overlapper</span>}
    </div>,
    document.body
  );
}

export function useDragMotor({ finnMaal, sjekkKonflikt = null, onSlipp, scrollEl = null }) {
  const lytter = useRef(null);              // setAktiv fra DragGhost
  const aktivRef = useRef(null);
  const setAktiv = useCallback(v => { aktivRef.current = typeof v === 'function' ? v(aktivRef.current) : v; lytter.current?.(aktivRef.current); }, []);
  const abonner = useCallback(fn => { lytter.current = fn; fn(aktivRef.current); return () => { if (lytter.current === fn) lytter.current = null; }; }, []);
  const ref = useRef(null);                 // arbeidsdata mellom events
  const rafRef = useRef(null);
  const forrigeCelle = useRef(null);

  const rydd = useCallback(() => {
    if (forrigeCelle.current) {
      forrigeCelle.current.classList.remove('drop-maal', 'drop-maal-konflikt');
      forrigeCelle.current = null;
    }
    if (rafRef.current) { clearInterval(rafRef.current); rafRef.current = null; }
    document.body.classList.remove('dm-drar');
  }, []);

  // Autoscroll-løkke (kjører mens drag er aktiv). setInterval, ikke rAF:
  // rAF pauses i bakgrunnsfaner og kan strupes, intervallet er billig.
  const autoscroll = useCallback(() => {
    const d = ref.current;
    if (!d || !d.startet) { if (rafRef.current) clearInterval(rafRef.current); rafRef.current = null; return; }
    const el = typeof scrollEl === 'function' ? scrollEl() : scrollEl;
    const { x, y } = d.pos;
    // Vinduet
    const vy = y < KANT ? -fart(y) : (window.innerHeight - y) < KANT ? fart(window.innerHeight - y) : 0;
    const vx = x < KANT ? -fart(x) : (window.innerWidth - x) < KANT ? fart(window.innerWidth - x) : 0;
    if (vy || vx) window.scrollBy(vx, vy);
    // Planens container (begge akser)
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      const cy = y - r.top < KANT ? -fart(y - r.top) : (r.bottom - y) < KANT ? fart(r.bottom - y) : 0;
      const cx = x - r.left < KANT ? -fart(x - r.left) : (r.right - x) < KANT ? fart(r.right - x) : 0;
      if (cy && el.scrollHeight > el.clientHeight) el.scrollTop += cy;
      if (cx && el.scrollWidth > el.clientWidth) el.scrollLeft += cx;
    }
  }, [scrollEl]);

  const oppdaterMaal = useCallback((x, y, kopier) => {
    const d = ref.current;
    if (!d) return;
    // Spøkelset har pointer-events:none, så elementFromPoint treffer planen
    const maal = finnMaal(x, y, d) || null;
    const konflikt = maal && sjekkKonflikt ? sjekkKonflikt(d, maal, kopier) : false;
    if (forrigeCelle.current && forrigeCelle.current !== maal?.celleEl) {
      forrigeCelle.current.classList.remove('drop-maal', 'drop-maal-konflikt');
      forrigeCelle.current = null;
    }
    if (maal?.celleEl) {
      maal.celleEl.classList.add(konflikt ? 'drop-maal-konflikt' : 'drop-maal');
      maal.celleEl.classList.remove(konflikt ? 'drop-maal' : 'drop-maal-konflikt');
      forrigeCelle.current = maal.celleEl;
    }
    d.maal = maal; d.konflikt = konflikt;
    setAktiv(a => a ? { ...a, x, y, kopier, maal, konflikt } : a);
  }, [finnMaal, sjekkKonflikt]);

  const avslutt = useCallback((utfor) => {
    const d = ref.current;
    ref.current = null;
    rydd();
    if (d?.timer) clearTimeout(d.timer);
    window.removeEventListener('pointermove', d?.onMove);
    window.removeEventListener('pointerup', d?.onUp);
    window.removeEventListener('pointercancel', d?.onUp);
    window.removeEventListener('keydown', d?.onKey);
    window.removeEventListener('keyup', d?.onKey);
    setAktiv(null);
    if (d?.startet) sisteDragSlutt = Date.now();
    if (utfor && d?.startet && d.maal) onSlipp({ kind: d.kind, payload: d.payload, maal: d.maal, kopier: !!d.kopier, konflikt: !!d.konflikt });
  }, [onSlipp, rydd]);

  // startDrag(e, { kind, payload, tekst }) — kalles fra pointerdown
  const startDrag = useCallback((e, spec) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (ref.current) return;
    const erTouch = e.pointerType === 'touch';
    const d = {
      kind: spec.kind, payload: spec.payload, tekst: spec.tekst,
      startX: e.clientX, startY: e.clientY, pos: { x: e.clientX, y: e.clientY },
      startet: false, kopier: !!(e.altKey || e.ctrlKey), maal: null, konflikt: false,
      pointerId: e.pointerId, target: e.currentTarget, timer: null,
    };
    const start = () => {
      if (d.startet || ref.current !== d) return;
      d.startet = true;
      try { d.target.setPointerCapture?.(d.pointerId); } catch { /* ok */ }
      document.body.classList.add('dm-drar');
      setAktiv({ kind: d.kind, payload: d.payload, tekst: d.tekst, x: d.pos.x, y: d.pos.y, kopier: d.kopier, maal: null, konflikt: false });
      oppdaterMaal(d.pos.x, d.pos.y, d.kopier);
      if (!rafRef.current) rafRef.current = setInterval(autoscroll, 16);
    };
    d.onMove = ev => {
      if (ref.current !== d) return;
      d.pos = { x: ev.clientX, y: ev.clientY };
      if (!d.startet) {
        if (erTouch) return; // touch venter på langt trykk
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < TERSKEL) return;
        start();
      }
      ev.preventDefault?.();
      const kopier = !!(ev.altKey || ev.ctrlKey) || d.kopierTast;
      d.kopier = kopier;
      oppdaterMaal(ev.clientX, ev.clientY, kopier);
    };
    d.onKey = ev => {
      if (ref.current !== d) return;
      d.kopierTast = ev.type === 'keydown' && (ev.key === 'Alt' || ev.key === 'Control');
      const kopier = d.kopierTast || !!(ev.altKey || ev.ctrlKey);
      d.kopier = kopier;
      if (d.startet) oppdaterMaal(d.pos.x, d.pos.y, kopier);
    };
    d.onUp = () => {
      if (ref.current !== d) return;
      const varStartet = d.startet;
      avslutt(varStartet);
    };
    ref.current = d;
    window.addEventListener('pointermove', d.onMove, { passive: false });
    window.addEventListener('pointerup', d.onUp);
    window.addEventListener('pointercancel', d.onUp);
    window.addEventListener('keydown', d.onKey);
    window.addEventListener('keyup', d.onKey);
    if (erTouch) d.timer = setTimeout(start, LANGT_TRYKK);
  }, [oppdaterMaal, autoscroll, avslutt]);

  const avbryt = useCallback(() => avslutt(false), [avslutt]);
  useEffect(() => () => rydd(), [rydd]);

  const ghost = useMemo(() => <DragGhost abonner={abonner} />, [abonner]);

  return { startDrag, avbryt, ghost };
}

// Hjelper for visningene: finn rad + kolonne under pekeren.
// radVelger: CSS-velger for rader med data-ansatt-id
// omraadeVelger: velger for kolonneområdet inne i raden
// dagFraX(areaEl, clientX) → iso (visningens geometri)
export function lagFinnMaal({ radVelger, omraadeVelger, celleVelger, dagFraX }) {
  return (x, y) => {
    const el = document.elementFromPoint(x, y);
    const rad = el?.closest?.(radVelger);
    if (!rad) return null;
    const ansattId = rad.dataset.ansattId;
    const area = rad.querySelector(omraadeVelger) || rad;
    const { dag, idx } = dagFraX(area, x) || {};
    if (!dag) return null;
    const celleEl = area.querySelectorAll(celleVelger)[idx] || null;
    return { ansattId, dag, idx, celleEl, radEl: rad };
  };
}
