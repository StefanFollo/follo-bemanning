// src/grupper.js — underprosjekter (SPEC-underprosjekter.md §1 + §3,
// postkasse-oppdrag 32). Et underprosjekt ER et vanlig prosjekt (egne
// tildelinger, pipeline-rad, framdrift, sjekklister) — det eneste nye er
// `prosjekt.gruppeId` (+ valgfritt `gruppeNavn`) som binder søsken sammen.
// Gruppa har ingen egen post; den er summen av medlemmene. Ren logikk,
// server-trygg (brukes også av api/ks/flate.js) — testes i
// tests/test-grupper.mjs. Ingenting slettes: «Løsne» fjerner bare feltene.

const SKILLE = /\s*(?:–|—|-|·|\||,|:)\s*/;

function norm(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

export function gruppeIdFor(p) { return (p && p.gruppeId) || null; }
export function sammeGruppe(a, b) { return !!(a && b && a.gruppeId && a.gruppeId === b.gruppeId); }

// Medlemmer i en gruppe (aktive som standard), stabil rekkefølge:
// eldst først (opprettet/id), så navn.
export function gruppeMedlemmer(prosjekter, gruppeId, { medArkiverte = false } = {}) {
  if (!gruppeId) return [];
  return (prosjekter || [])
    .filter(p => p && p.gruppeId === gruppeId && (medArkiverte || !p.arkivert))
    .sort((a, b) => String(a.opprettet || a.id).localeCompare(String(b.opprettet || b.id)) || (a.navn || '').localeCompare(b.navn || '', 'nb'));
}

// Gruppenavn: satt navn på et medlem, ellers «gate husnummer» fra første
// medlems adresse («Greverudveien 15B Bad» → «Greverudveien 15B»), ellers
// første medlems adresse/navn.
export function gruppeNavn(prosjekter, gruppeId) {
  const m = gruppeMedlemmer(prosjekter, gruppeId, { medArkiverte: true });
  const satt = m.find(p => p.gruppeNavn && p.gruppeNavn.trim());
  if (satt) return satt.gruppeNavn.trim();
  const kilde = m[0] ? (m[0].adresse || m[0].navn || '') : '';
  const t = kilde.split(',')[0].trim();
  const hit = t.match(/^(.*?\D)\s*(\d+\s*[A-Za-zÆØÅæøå]?)\b/);
  if (hit) return `${hit[1].trim()} ${hit[2].replace(/\s+/g, '')}`;
  return t || 'Gruppe';
}

// Medlemsnavn («Bad», «Fasade», «Kjøkken»): satt medlemsNavn, ellers
// jobbType, ellers prosjektnavnet renset for gruppenavn/kunde/adresse.
export function medlemsNavn(p, prosjekter = []) {
  if (!p) return '';
  if (p.medlemsNavn && p.medlemsNavn.trim()) return p.medlemsNavn.trim();
  const gNavn = p.gruppeId ? gruppeNavn(prosjekter, p.gruppeId) : '';
  const fjern = [gNavn, p.adresse, p.kunde && p.kunde.navn, p.kundeNavn].filter(Boolean).map(norm);
  let rest = (p.navn || '').split(SKILLE).map(x => x.trim()).filter(Boolean)
    .filter(del => !fjern.some(f => f && (norm(del) === f || f.includes(norm(del)) || norm(del).includes(f))));
  let navn = rest.join(' ').trim();
  if (navn && gNavn && norm(navn).startsWith(norm(gNavn))) navn = navn.slice(gNavn.length).replace(/^[\s–—\-·,:]+/, '').trim();
  if (navn) return navn;
  if (p.jobbType && p.jobbType.trim()) return p.jobbType.trim();
  return p.navn || p.adresse || 'Uten navn';
}

// «Greverudveien 15B · Bad» for gruppemedlemmer; ellers som i dag (adresse
// eller navn). Brukes i bemanningsplanen, pipeline-rullegardinen, /ks/ og digest.
export function visningsnavn(p, prosjekter = []) {
  if (!p) return 'Uten navn';
  if (!p.gruppeId) return p.adresse || p.navn || 'Uten navn';
  return `${gruppeNavn(prosjekter, p.gruppeId)} · ${medlemsNavn(p, prosjekter)}`;
}

// ── Farge: medlemmer får varianter av gruppefargen (samme nyanse, ulik
// lyshet/metning) så de er gjenkjennelige som søsken i planen ──
function hexTilHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
function hslTilHex({ h, s, l }) {
  const f = n => { const k = (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
export function fargeVariant(hex, idx) {
  const hsl = hexTilHsl(hex);
  if (!hsl || !idx) return hex;
  // idx 1: lysere/mindre mettet, 2: mørkere, 3: lysere igjen …
  const steg = Math.ceil(idx / 2) * 0.1;
  const l = idx % 2 === 1 ? Math.min(0.85, hsl.l + steg) : Math.max(0.2, hsl.l - steg);
  const s = idx % 2 === 1 ? Math.max(0.25, hsl.s - 0.15) : Math.min(1, hsl.s + 0.1);
  return hslTilHex({ h: hsl.h, s, l });
}
export function gruppeFarge(p, prosjekter = []) {
  if (!p) return '#6b8fc4';
  if (!p.gruppeId) return p.farge || '#6b8fc4';
  const m = gruppeMedlemmer(prosjekter, p.gruppeId);
  const idx = Math.max(0, m.findIndex(x => x.id === p.id));
  const base = (m[0] && m[0].farge) || p.farge || '#6b8fc4';
  return fargeVariant(base, idx);
}

// Liste → [{ type:'gruppe', gruppeId, navn, medlemmer }, { type:'enkel', prosjekt }]
// i rekkefølgen prosjektene kommer (gruppa plasseres der første medlem sto).
export function samleIGrupper(prosjekter, alleProsjekter = prosjekter) {
  const ut = [];
  const sett = {};
  for (const p of prosjekter || []) {
    if (!p) continue;
    if (!p.gruppeId) { ut.push({ type: 'enkel', prosjekt: p }); continue; }
    if (!sett[p.gruppeId]) {
      sett[p.gruppeId] = { type: 'gruppe', gruppeId: p.gruppeId, navn: gruppeNavn(alleProsjekter, p.gruppeId), medlemmer: [] };
      ut.push(sett[p.gruppeId]);
    }
    sett[p.gruppeId].medlemmer.push(p);
  }
  return ut;
}

// Samlet avvik på gruppe-raden: teller badge-typer («1 hull · 1 i pipeline»).
// badges: [{ type, tekst }] — type fra badgeFor: 'frist-over', 'bemanning',
// 'ferdig-forslag', 'uten-ansvarlig', 'ok', 'pipeline' …
export function gruppeAvvik(badges) {
  const teller = {};
  for (const b of badges || []) {
    if (!b || b.type === 'ok') continue;
    teller[b.type] = (teller[b.type] || 0) + 1;
  }
  const TEKST = { 'frist-over': 'frist passert', bemanning: 'hull', 'ferdig-forslag': 'ferdig?', 'uten-ansvarlig': 'uten ansvarlig', pipeline: 'i pipeline' };
  return Object.entries(teller).map(([type, n]) => `${n} ${TEKST[type] || type}`).join(' · ');
}

export function gruppeSum(medlemmer) {
  return (medlemmer || []).reduce((s, p) => s + (Number(p && p.belop) || 0), 0);
}

// ── Handlinger (alt logget på pipelineLogg, som øvrige prosjekthendelser) ──
function logg(p, tekst, av, naa) {
  return [...(p.pipelineLogg || []), { tid: new Date(naa).toISOString(), av: av || 'ukjent', tekst }];
}

// «Legg i gruppe med …»: p legges i mal sin gruppe. Har mal ingen gruppe,
// opprettes den med mal.id som gruppeId (SPEC §1: id til første medlem).
// Returnerer { prosjekt, mal } — mal er null når den var uendret.
export function leggIGruppe(p, mal, { av, naa = Date.now() } = {}) {
  if (!p || !mal || p.id === mal.id) return null;
  const gruppeId = mal.gruppeId || mal.id;
  const navn = mal.gruppeNavn || null;
  const prosjekt = { ...p, gruppeId, ...(navn ? { gruppeNavn: navn } : {}),
    pipelineLogg: logg(p, `Lagt i gruppe med «${mal.adresse || mal.navn}»${navn ? ` (${navn})` : ''}`, av, naa) };
  const nyMal = mal.gruppeId ? null : { ...mal, gruppeId, pipelineLogg: logg(mal, `Gruppe opprettet — «${p.adresse || p.navn}» lagt til`, av, naa) };
  return { prosjekt, mal: nyMal };
}

export function losneFraGruppe(p, { av, naa = Date.now() } = {}) {
  if (!p || !p.gruppeId) return null;
  const { gruppeId, gruppeNavn: gn, medlemsNavn: mn, ...rest } = p; // eslint-disable-line no-unused-vars
  return { ...rest, pipelineLogg: logg(p, `Løsnet fra gruppen${gn ? ` «${gn}»` : ''}`, av, naa) };
}

// Gir alle medlemmer samme gruppeNavn (tomt navn = tilbake til utledet).
export function giGruppeNavn(medlemmer, navn, { av, naa = Date.now() } = {}) {
  const n = (navn || '').trim();
  return (medlemmer || []).map(p => {
    const { gruppeNavn: gammelt, ...rest } = p; // eslint-disable-line no-unused-vars
    return { ...rest, ...(n ? { gruppeNavn: n } : {}), pipelineLogg: logg(p, n ? `Gruppen fikk navnet «${n}»` : 'Gruppenavnet fjernet (utledes av adressen)', av, naa) };
  });
}

// Digest (SPEC §3.6): grupperer prosjektlinjer per gruppe —
// «Greverudveien 15B: Bad starter u39 uten folk; Fasade hull u40».
// linjer: [{ prosjektId, tekst }] → [tekster]
export function grupperDigestLinjer(linjer, prosjekter = []) {
  const perGruppe = {};
  const ut = [];
  for (const l of linjer || []) {
    const p = (prosjekter || []).find(x => x && x.id === l.prosjektId);
    if (!p || !p.gruppeId) { ut.push(l.tekst); continue; }
    if (!perGruppe[p.gruppeId]) { perGruppe[p.gruppeId] = []; ut.push({ gruppeId: p.gruppeId }); }
    perGruppe[p.gruppeId].push(`${medlemsNavn(p, prosjekter)} ${l.tekst}`);
  }
  return ut.map(x => typeof x === 'string' ? x : `${gruppeNavn(prosjekter, x.gruppeId)}: ${perGruppe[x.gruppeId].join('; ')}`);
}
