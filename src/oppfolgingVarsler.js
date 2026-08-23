// ═══ Oppfølgings-varsler — ren planlegger (SPEC-oppfolgings-modul.md §3–4) ═══
// Brukes av api/oppfolging/digest.js (cron hverdager 07:30). Ingen I/O her:
// inn = befaringer + ansatte + brukere + varselstatus, ut = hva som skal
// sendes + ny varselstatus. Testet i tests/test-oppfolging-varsler.mjs.
//
// Regler:
//  - Daglig digest per person med ikke-tom liste, hverdager, MAKS 1/dag
//  - Frist-varsel én gang når tilbudsfrist er ≤ 3 dager fram
//  - Eskalering én gang når sak passerer 7 dager forfalt → PL + admin
//  - Mandag: ukesdigest til admin (håndtert/forfalt/utsatt per PL)
//  - «Borte til»: PL-ens saker går til admin i mellomtiden, PL får ingen digest
//  - Mangler ansvarlig → admin

import {
  byggOppfolgingsKo, ukesStatistikk, FRIST_VARSEL_DAGER, SAK_TYPER, sisteNotat,
} from './oppfolging.js';

export const VARSEL_STATUS_TOM = { digest: {}, frist: {}, eskalert: {}, ukesdigest: null };

export function erHverdag(iso) {
  const d = new Date(iso + 'T00:00:00').getDay();
  return d >= 1 && d <= 5;
}
export function erMandag(iso) {
  return new Date(iso + 'T00:00:00').getDay() === 1;
}
// Dagens dato i Oslo-tid (cron kjører i UTC).
export function iDagOslo(naa = new Date()) {
  const deler = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(naa);
  return deler; // sv-SE gir YYYY-MM-DD
}

function normEpost(e) { return (e || '').trim().toLowerCase(); }

// Slå opp mottakere: bruker-konto (fbs_user) per ansattId, ellers ansatt.epost.
// adminEposter: eksplisitt liste (env OPPFOLGING_ADMIN_EPOST) — i prod har
// mange brukere admin-rolle, og speccen sier «PL + Stefan», ikke «alle admins».
// Uten liste: fall tilbake til brukere med admin-rolle.
export function byggMottakere({ ansatte = [], brukere = [], iDag, adminEposter }) {
  const aktive = brukere.filter(u => u && u.active !== false && u.email);
  const perAnsatt = {};
  for (const u of aktive) if (u.ansattId) perAnsatt[u.ansattId] = perAnsatt[u.ansattId] || u;
  const eksplisitt = (adminEposter || []).map(normEpost).filter(Boolean);
  const admins = eksplisitt.length
    ? eksplisitt.map(e => aktive.find(u => normEpost(u.email) === e) || { email: e, navn: e, role: 'admin' })
    : aktive.filter(u => u.role === 'admin');
  const mottakerFor = ansattId => {
    const u = perAnsatt[ansattId];
    const a = ansatte.find(x => x.id === ansattId);
    const epost = normEpost(u ? u.email : (a && a.epost));
    if (!epost) return null;
    const borteTil = u && u.borteTil ? u.borteTil : null;
    return { epost, navn: (u && u.navn) || (a && a.navn) || epost, ansattId, borte: !!(borteTil && borteTil >= iDag), borteTil, kanal: (u && u.digestKanal) || 'epost' };
  };
  return {
    admins: admins.map(u => ({ epost: normEpost(u.email), navn: u.navn || u.email, ansattId: u.ansattId || null, kanal: u.digestKanal || 'epost' })),
    mottakerFor,
    borteIds: new Set(aktive.filter(u => u.ansattId && u.borteTil && u.borteTil >= iDag).map(u => u.ansattId)),
  };
}

// Hovedfunksjon. Returnerer { digester, fristVarsler, eskaleringer, ukesdigest, nyStatus, hoppetOver }
export function planleggVarsler({ befaringer = [], ansatte = [], brukere = [], varselStatus, iDag, tvingHverdag = false, adminEposter }) {
  const status = {
    digest: { ...((varselStatus && varselStatus.digest) || {}) },
    frist: { ...((varselStatus && varselStatus.frist) || {}) },
    eskalert: { ...((varselStatus && varselStatus.eskalert) || {}) },
    ukesdigest: (varselStatus && varselStatus.ukesdigest) || null,
  };
  const ut = { digester: [], fristVarsler: [], eskaleringer: [], ukesdigest: null, nyStatus: status, hoppetOver: [] };
  if (!erHverdag(iDag) && !tvingHverdag) { ut.hoppetOver.push('helg'); return ut; }

  const { admins, mottakerFor, borteIds } = byggMottakere({ ansatte, brukere, iDag, adminEposter });
  const adminTil = admins.map(a => a.epost);
  const saker = byggOppfolgingsKo(befaringer, iDag);
  const navnFor = id => (ansatte.find(a => a.id === id) || {}).navn || 'Ukjent';

  // ── Fordel saker per e-post (én digest per person uansett hvor mange roller) ──
  const perEpost = {}; // epost → { navn, egne:[], tilAdmin:[{sak, grunn}] }
  const sikre = (epost, navn) => (perEpost[epost] = perEpost[epost] || { epost, navn, egne: [], tilAdmin: [] });
  for (const a of admins) sikre(a.epost, a.navn);
  for (const sak of saker) {
    const m = sak.ansvarligId ? mottakerFor(sak.ansvarligId) : null;
    if (!sak.ansvarligId || !m) {
      for (const a of admins) sikre(a.epost, a.navn).tilAdmin.push({ sak, grunn: !sak.ansvarligId ? 'mangler ansvarlig' : `${navnFor(sak.ansvarligId)} har ingen e-post` });
    } else if (m.borte) {
      for (const a of admins) sikre(a.epost, a.navn).tilAdmin.push({ sak, grunn: `${m.navn} er borte til ${m.borteTil}` });
    } else {
      sikre(m.epost, m.navn).egne.push(sak);
    }
  }

  // ── Daglig digest (maks 1/dag, kun de med saker) ──
  for (const p of Object.values(perEpost)) {
    const antall = p.egne.length + p.tilAdmin.length;
    if (antall === 0) continue;
    if (status.digest[p.epost] === iDag) { ut.hoppetOver.push(`digest allerede sendt i dag: ${p.epost}`); continue; }
    const forfalt = p.egne.filter(s => s.forfalt).length + p.tilAdmin.filter(x => x.sak.forfalt).length;
    ut.digester.push({ til: p.epost, navn: p.navn, egne: p.egne, tilAdmin: p.tilAdmin, antall, forfalt });
    status.digest[p.epost] = iDag;
  }

  // ── Frist-varsel: én gang når frist ≤ 3 d fram (ikke passert) ──
  for (const sak of saker) {
    const fd = sak.fristDager !== undefined ? sak.fristDager : (sak.type === 'frist' ? sak.dager : undefined);
    if (fd === undefined || fd < 0 || fd > FRIST_VARSEL_DAGER) continue;
    const nokkel = `${sak.befaringId}:${sak.befaring.tilbudFrist}`;
    if (status.frist[nokkel]) continue;
    const m = sak.ansvarligId ? mottakerFor(sak.ansvarligId) : null;
    const til = m && !m.borte ? [m.epost] : adminTil;
    if (!til.length) continue;
    ut.fristVarsler.push({ til, sak, dager: fd });
    status.frist[nokkel] = iDag;
  }

  // ── Eskalering: én gang per sak (nøkkel befaring+forfallsdato) → PL + admin ──
  for (const sak of saker) {
    if (!sak.eskaler) continue;
    const nokkel = `${sak.befaringId}:${sak.forfallDato}`;
    if (status.eskalert[nokkel]) continue;
    const m = sak.ansvarligId ? mottakerFor(sak.ansvarligId) : null;
    const til = [...new Set([...(m && !m.borte ? [m.epost] : []), ...adminTil])];
    if (!til.length) continue;
    ut.eskaleringer.push({ til, sak, plNavn: m ? m.navn : null });
    status.eskalert[nokkel] = iDag;
  }

  // ── Mandag: ukesdigest til admin ──
  if (erMandag(iDag) && status.ukesdigest !== iDag && adminTil.length) {
    const stat = ukesStatistikk(befaringer, { iDag });
    const rader = Object.values(stat.perPl).map(r => ({ ...r, navn: r.ansattId === '__ukjent__' ? 'Mangler ansvarlig' : navnFor(r.ansattId) }))
      .sort((a, b) => (b.forfalt - a.forfalt) || a.navn.localeCompare(b.navn, 'nb'));
    ut.ukesdigest = { til: adminTil, fra: stat.fra, til_dato: stat.til, rader };
    status.ukesdigest = iDag;
  }

  ut.borteIds = [...borteIds];
  return ut;
}

// ── E-post-innhold (enkel HTML, lesbar på mobil) ────────────────────
function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function sakLinje(sak, appUrl) {
  const b = sak.befaring;
  const n = sisteNotat(b);
  return `<li style="margin:0 0 10px">
    <b>${esc(b.kontaktNavn || b.adresse)}</b>${b.adresse && b.kontaktNavn ? ' · ' + esc(b.adresse) : ''}
    ${b.telefon ? ` · <a href="tel:${esc(String(b.telefon).replace(/\s+/g, ''))}">${esc(b.telefon)}</a>` : ''}<br>
    <span style="color:${sak.forfalt ? '#b91c1c' : '#b45309'}">${esc(sak.tekst)}</span> · ${esc(SAK_TYPER[sak.type].label)}
    ${n ? `<br><span style="color:#6b7280">“${esc(n.tekst)}”</span>` : ''}
  </li>`;
}
function ramme(tittel, innhold, appUrl) {
  return `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:20px;background:#f8fafc;border-radius:12px">
    <div style="background:#0f2942;color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:18px">
      <h1 style="margin:0;font-size:18px">${esc(tittel)}</h1>
      <p style="margin:4px 0 0;opacity:.8;font-size:13px">FolloByggService · Oppfølging</p>
    </div>
    ${innhold}
    <div style="text-align:center;margin:22px 0 6px">
      <a href="${esc(appUrl)}" style="background:#f59e0b;color:#0f2942;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600">Åpne «Ring i dag»</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center">Du får maks én slik e-post per dag. Handlinger gjøres i appen — ingenting endres automatisk.</p>
  </div>`;
}

export function lagDigestEpost(d, appUrl) {
  const emne = `Du har ${d.antall} oppfølging${d.antall === 1 ? '' : 'er'} i dag${d.forfalt ? ` (${d.forfalt} forfalt)` : ''}`;
  let html = `<p>Hei ${esc(d.navn)},</p>`;
  if (d.egne.length) html += `<p>Dine saker (mest forfalt øverst):</p><ul style="padding-left:18px">${d.egne.map(s => sakLinje(s, appUrl)).join('')}</ul>`;
  if (d.tilAdmin.length) html += `<p><b>Hos deg som admin i mellomtiden:</b></p><ul style="padding-left:18px">${d.tilAdmin.map(x => sakLinje(x.sak, appUrl).replace('</li>', `<br><i style="color:#9ca3af">${esc(x.grunn)}</i></li>`)).join('')}</ul>`;
  return { emne, html: ramme(emne, html, appUrl) };
}
export function lagFristEpost(f, appUrl) {
  const b = f.sak.befaring;
  const emne = `Tilbudsfrist ${b.kontaktNavn || b.adresse} løper ut ${f.dager === 0 ? 'i dag' : 'om ' + f.dager + ' dag' + (f.dager === 1 ? '' : 'er')}`;
  const html = `<p>Tilbudet til <b>${esc(b.kontaktNavn || b.adresse)}</b>${b.adresse ? ' (' + esc(b.adresse) + ')' : ''} har frist <b>${esc(b.tilbudFrist)}</b> — ring kunden før fristen går ut.</p><ul style="padding-left:18px">${sakLinje(f.sak, appUrl)}</ul>`;
  return { emne, html: ramme(emne, html, appUrl) };
}
export function lagEskaleringEpost(e, appUrl) {
  const b = e.sak.befaring;
  const emne = `Eskalering: ${b.kontaktNavn || b.adresse} — ${e.sak.tekst}`;
  const html = `<p>Denne saken har vært forfalt i mer enn 7 dager${e.plNavn ? ` hos <b>${esc(e.plNavn)}</b>` : ' og mangler ansvarlig'}. Dette varselet sendes én gang, til PL og admin.</p><ul style="padding-left:18px">${sakLinje(e.sak, appUrl)}</ul>`;
  return { emne, html: ramme(emne, html, appUrl) };
}
export function lagUkesdigestEpost(u, appUrl) {
  const emne = `Oppfølging sist uke (${u.fra} – ${u.til_dato})`;
  const rader = u.rader.map(r => `<tr>
    <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb"><b>${esc(r.navn)}</b></td>
    <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${r.handtert} håndtert</td>
    <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;color:${r.forfalt ? '#b91c1c' : '#15803d'}">${r.forfalt} forfalt${r.forfalt >= 5 ? ' ⚠' : ''}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${r.utsatt} utsatt</td>
  </tr>`).join('');
  const html = `<p>Per prosjektleder:</p><table style="border-collapse:collapse;width:100%;font-size:14px">${rader || '<tr><td>Ingen aktivitet registrert.</td></tr>'}</table>`;
  return { emne, html: ramme(emne, html, appUrl) };
}
