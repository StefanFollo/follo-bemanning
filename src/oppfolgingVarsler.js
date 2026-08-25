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
  AKTIV_PIPELINE, ansvarligFor, leggTilDager,
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
  // Hvert element beriket til morgenbrief (SPEC-morgenbrief-digest.md):
  // varme signaler, dagens avtaler, frister og ukens tall — kun innhold,
  // triggere/dedup er som før.
  const ansattIdForEpost = epost => {
    const a = admins.find(x => x.epost === epost && x.ansattId);
    if (a) return a.ansattId;
    const u = brukere.find(x => x && normEpost(x.email) === epost);
    return (u && u.ansattId) || null;
  };
  for (const p of Object.values(perEpost)) {
    const antall = p.egne.length + p.tilAdmin.length;
    if (antall === 0) continue;
    if (status.digest[p.epost] === iDag) { ut.hoppetOver.push(`digest allerede sendt i dag: ${p.epost}`); continue; }
    const forfalt = p.egne.filter(s => s.forfalt).length + p.tilAdmin.filter(x => x.sak.forfalt).length;
    const brief = morgenbriefData({ befaringer, ansattId: ansattIdForEpost(p.epost), egne: p.egne, iDag });
    ut.digester.push({ til: p.epost, navn: p.navn, egne: p.egne, tilAdmin: p.tilAdmin, antall, forfalt, iDag, ...brief });
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
function ramme(tittel, innhold, appUrl, undertittel = 'FolloByggService · Oppfølging') {
  return `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:20px;background:#f8fafc;border-radius:12px">
    <div style="background:#0f2942;color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:18px">
      <h1 style="margin:0;font-size:18px">${esc(tittel)}</h1>
      <p style="margin:4px 0 0;opacity:.8;font-size:13px">${esc(undertittel)}</p>
    </div>
    ${innhold}
    <div style="text-align:center;margin:22px 0 6px">
      <a href="${esc(appUrl)}" style="background:#f59e0b;color:#0f2942;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600">Åpne «Ring i dag»</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center">Du får maks én slik e-post per dag. Handlinger gjøres i appen — ingenting endres automatisk.</p>
  </div>`;
}

// ── Morgenbrief (SPEC-morgenbrief-digest.md) ────────────────────────
export const MORGENBRIEF_MAKS_RADER = 8;
export function datoKortNo(iso) { return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`; }

function varmeTekst(b) {
  const akt = Array.isArray(b.kundeAktivitet) ? b.kundeAktivitet : [];
  const siste = akt[akt.length - 1] || {};
  if (siste.handling === 'klikket-aksepter') return 'klikket Aksepter på tilbudet';
  if (siste.handling === 'klikket-sporsmal') return 'klikket Spørsmål på tilbudet';
  const antall = siste.antall || b.antallKundeAapninger;
  return `åpnet tilbudet${antall ? ' ' + antall + 'x' : ''} siste døgn`;
}

// Seksjonsdata for én mottaker. Uten ansattId (ren admin-adresse) finnes
// verken egne varme signaler, avtaler eller ukestall — seksjonene utelates.
export function morgenbriefData({ befaringer = [], ansattId, egne = [], iDag }) {
  const frister = egne.filter(s => {
    const fd = s.fristDager !== undefined ? s.fristDager : (s.type === 'frist' ? s.dager : undefined);
    return fd !== undefined && fd >= 0 && fd <= FRIST_VARSEL_DAGER;
  });
  if (!ansattId) return { ansattId: null, varme: [], avtaler: [], frister, uke: null };
  const grense = leggTilDager(iDag, -1);
  const varme = befaringer
    .filter(b => b && !b.arkivert && AKTIV_PIPELINE.includes(b.status) && ansvarligFor(b) === ansattId
      && b.sistKundeAktivitet && String(b.sistKundeAktivitet) >= grense)
    .sort((a, b) => String(b.sistKundeAktivitet).localeCompare(String(a.sistKundeAktivitet)))
    .map(b => ({ befaring: b, tekst: varmeTekst(b) }));
  const avtaler = befaringer
    .filter(b => b && !b.arkivert && b.status === 'planlagt' && b.dato === iDag
      && (b.ansvarligBefaringId === ansattId || b.prosjektlederId === ansattId))
    .sort((a, b) => String(a.tid || '99').localeCompare(String(b.tid || '99')));
  const uke = ukesStatistikk(befaringer, { iDag }).perPl[ansattId] || { ansattId, handtert: 0, utsatt: 0, forfalt: 0, eskalert: 0 };
  return { ansattId, varme, avtaler, frister, uke };
}

export function morgenbriefEmne(d) {
  const deler = [`${d.antall} å ringe${d.forfalt ? ` (${d.forfalt} forfalt)` : ''}`];
  if ((d.avtaler || []).length) deler.push(`${d.avtaler.length} befaring${d.avtaler.length === 1 ? '' : 'er'} i dag`);
  return `Morgenbrief ${datoKortNo(d.iDag)}: ${deler.join(' · ')}`;
}

function telHtml(b) {
  return b.telefon ? ` · <a href="tel:${esc(String(b.telefon).replace(/\s+/g, ''))}" style="color:#0f2942;font-weight:600">${esc(b.telefon)}</a>` : '';
}
function overskrift(tekst) {
  return `<p style="margin:18px 0 8px;font-size:12px;font-weight:700;letter-spacing:.06em;color:#0f2942;border-bottom:2px solid #f59e0b;padding-bottom:4px">${tekst}</p>`;
}

export function lagDigestEpost(d, appUrl) {
  const emne = morgenbriefEmne(d);
  const tekst = [emne, ''];
  let html = `<p style="margin:0 0 6px">Hei ${esc(d.navn)},</p>`;

  // A — varme signaler øverst: kunden sitter og leser tilbudet
  if ((d.varme || []).length) {
    html += overskrift('🔥 VARME NÅ — kundeaktivitet siste døgn');
    tekst.push('VARME NÅ:');
    for (const v of d.varme) {
      const b = v.befaring;
      html += `<p style="margin:0 0 8px"><b>${esc(b.kontaktNavn || b.adresse)}</b>${b.adresse && b.kontaktNavn ? ' — ' + esc(b.adresse) : ''} · ${esc(v.tekst)}${telHtml(b)}</p>`;
      tekst.push(`- ${b.kontaktNavn || b.adresse}: ${v.tekst}${b.telefon ? ' · tlf ' + b.telefon : ''}`);
    }
    tekst.push('');
  }

  // B — hele køen, maks 8 rader + «og N til»
  const rader = d.egne.slice(0, MORGENBRIEF_MAKS_RADER);
  const rest = d.egne.length - rader.length;
  if (d.egne.length) {
    html += overskrift(`RING I DAG (${d.egne.length}${d.forfalt ? ' · ' + d.egne.filter(s => s.forfalt).length + ' forfalt' : ''})`);
    tekst.push(`RING I DAG (${d.egne.length}):`);
    html += rader.map((s, i) => {
      const b = s.befaring;
      const n = sisteNotat(b);
      tekst.push(`${i + 1}. ${b.kontaktNavn || b.adresse} — ${s.tekst}${b.telefon ? ' · ' + b.telefon : ''}`);
      return `<p style="margin:0 0 10px">${i + 1}. <b>${esc(b.kontaktNavn || b.adresse)}</b>${b.adresse && b.kontaktNavn ? ' — ' + esc(b.adresse) : ''}<br>
        <span style="color:#6b7280">${esc(SAK_TYPER[s.type].label)}</span> · <span style="color:${s.forfalt ? '#b91c1c' : '#b45309'};font-weight:600">${esc(s.tekst)}</span>${telHtml(b)}<br>
        ${n ? `<i style="color:#6b7280">«${esc(n.tekst)}»</i> · ` : ''}<a href="${esc(appUrl)}/?kort=${encodeURIComponent(b.id)}" style="color:#0f2942">Åpne kortet</a>
      </p>`;
    }).join('');
    if (rest > 0) {
      html += `<p style="margin:0 0 10px"><a href="${esc(appUrl)}" style="color:#0f2942">… og ${rest} til — åpne appen</a></p>`;
      tekst.push(`… og ${rest} til — åpne appen`);
    }
    tekst.push('');
  }

  // Admin-saker (mangler ansvarlig / PL borte) — uendret logikk, ny drakt
  if ((d.tilAdmin || []).length) {
    html += overskrift(`HOS DEG SOM ADMIN (${d.tilAdmin.length})`);
    tekst.push('HOS DEG SOM ADMIN:');
    html += `<ul style="padding-left:18px;margin:0 0 10px">${d.tilAdmin.map(x => sakLinje(x.sak, appUrl).replace('</li>', `<br><i style="color:#9ca3af">${esc(x.grunn)}</i></li>`)).join('')}</ul>`;
    for (const x of d.tilAdmin) tekst.push(`- ${x.sak.befaring.kontaktNavn || x.sak.befaring.adresse} — ${x.sak.tekst} (${x.grunn})`);
    tekst.push('');
  }

  // C — dagens avtaler + frister (utelates helt hvis tom)
  const cLinjer = [];
  for (const b of d.avtaler || []) {
    cLinjer.push({ html: `• Befaring${b.tid ? ' kl. ' + esc(b.tid) : ''} — ${esc(b.kontaktNavn || '')}${b.adresse ? ', ' + esc(b.adresse) : ''}${telHtml(b)}`,
      tekst: `- Befaring${b.tid ? ' kl. ' + b.tid : ''} — ${b.kontaktNavn || ''}${b.adresse ? ', ' + b.adresse : ''}` });
  }
  for (const s of d.frister || []) {
    const b = s.befaring;
    const fd = s.fristDager !== undefined ? s.fristDager : s.dager;
    cLinjer.push({ html: `• Tilbudsfrist løper ut: ${esc(b.kontaktNavn || b.adresse)} (${fd === 0 ? 'i dag!' : fd + ' dager igjen'})`,
      tekst: `- Tilbudsfrist: ${b.kontaktNavn || b.adresse} (${fd === 0 ? 'i dag!' : fd + ' dager igjen'})` });
  }
  if (cLinjer.length) {
    html += overskrift('I DAG');
    tekst.push('I DAG:');
    html += cLinjer.map(l => `<p style="margin:0 0 6px">${l.html}</p>`).join('');
    for (const l of cLinjer) tekst.push(l.tekst);
    tekst.push('');
  }

  // D — ukens tall som fot
  if (d.uke) {
    const fot = `Din uke så langt: ${d.uke.handtert} håndtert · ${d.uke.forfalt} forfalt igjen · ${d.uke.utsatt} utsatt`;
    html += `<p style="margin:16px 0 0;padding-top:10px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:13px">${esc(fot)}</p>`;
    tekst.push(fot);
  }

  return { emne, html: ramme(emne, html, appUrl, 'Follo Byggservice · Morgenbrief'), tekst: tekst.join('\n') };
}
export function lagFristEpost(f, appUrl) {
  const b = f.sak.befaring;
  const emne = `Tilbudsfrist ${b.kontaktNavn || b.adresse} løper ut ${f.dager === 0 ? 'i dag' : 'om ' + f.dager + ' dag' + (f.dager === 1 ? '' : 'er')}`;
  const html = `<p>Tilbudet til <b>${esc(b.kontaktNavn || b.adresse)}</b>${b.adresse ? ' (' + esc(b.adresse) + ')' : ''} har frist <b>${esc(b.tilbudFrist)}</b> — ring kunden før fristen går ut.</p><ul style="padding-left:18px">${sakLinje(f.sak, appUrl)}</ul>`;
  return { emne, html: ramme(emne, html, appUrl) };
}
// Eskaleringer samles til ÉN e-post per mottaker per kjøring (første kjøring
// i prod hadde 18 saker >7 d — 18 separate e-poster er pling-bombardement).
// Hver sak varsles fortsatt bare én gang.
export function grupperEskaleringer(eskaleringer) {
  const per = {};
  for (const e of eskaleringer || []) for (const til of e.til) (per[til] = per[til] || { til, saker: [] }).saker.push(e);
  return Object.values(per);
}
export function lagEskaleringEpost(gruppe, appUrl) {
  const saker = gruppe.saker || [gruppe];
  const emne = saker.length === 1
    ? `Eskalering: ${saker[0].sak.befaring.kontaktNavn || saker[0].sak.befaring.adresse} — ${saker[0].sak.tekst}`
    : `Eskalering: ${saker.length} saker forfalt mer enn 7 dager`;
  const html = `<p>${saker.length === 1 ? 'Denne saken har' : 'Disse sakene har'} vært forfalt i mer enn 7 dager. Varselet sendes én gang per sak, til ansvarlig PL og admin.</p>
    <ul style="padding-left:18px">${saker.map(e => sakLinje(e.sak, appUrl).replace('</li>', `<br><i style="color:#9ca3af">${e.plNavn ? 'PL: ' + esc(e.plNavn) : 'mangler ansvarlig'}</i></li>`)).join('')}</ul>`;
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

// ── Push-kanal (SPEC §3, push-kobling — abonnementene bor i tilbuds-appen) ──
// Tilbuds-appen nøkler abonnementer/innstillinger på FORNAVN i små bokstaver
// («joachim», «stefan» …), ikke e-post — vi mapper via fornavnet i navnet.
export function pushNokkelForNavn(navn) {
  return String(navn || '').trim().split(/\s+/)[0].toLowerCase();
}

export function byggPushIndeks(interapp) {
  const subs = {};
  for (const a of (interapp && interapp.abonnementer) || []) {
    if (!a || !a.endpoint || !a.keys) continue;
    (subs[a.bruker] = subs[a.bruker] || []).push(a);
  }
  const innstillinger = (interapp && interapp.innstillinger) || {};
  return {
    subsFor: navn => subs[pushNokkelForNavn(navn)] || [],
    innstillingFor: navn => innstillinger[pushNokkelForNavn(navn)] || {},
    antall: ((interapp && interapp.abonnementer) || []).length,
  };
}

// Kanalvalg per mottaker ut fra bemanning-brukerens digestKanal og hvorvidt
// personen har push-enheter. E-post er alltid fallback:
//  - 'epost'          → e-post
//  - 'begge'          → push (hvis enheter) + e-post
//  - 'push' m/enheter → push; e-post KUN hvis push feiler (styrt i digest.js,
//                       og respekterer tilbuds-appens epostFallback=false)
//  - 'push' u/enheter → e-post (ellers får personen stille ingenting)
export function bestemKanaler({ kanal, antallEnheter }) {
  const k = kanal === 'push' || kanal === 'begge' ? kanal : 'epost';
  const vilPush = k !== 'epost' && antallEnheter > 0;
  return { push: vilPush, epost: k === 'epost' || k === 'begge' || !vilPush, kanal: k, antallEnheter: antallEnheter || 0 };
}

// Push-payloader — MÅ matche tilbuds-appens sw.js: { tittel, tekst, url, hendelse }.
function kortNavnListe(saker, maks = 3) {
  const navn = saker.map(s => s.befaring.kontaktNavn || s.befaring.adresse || 'ukjent');
  return navn.slice(0, maks).join(', ') + (navn.length > maks ? ` +${navn.length - maks} til` : '');
}
export function lagDigestPush(d, appUrl) {
  const dagTekst = s => s.dager < 0 ? `${-s.dager} d` : s.dager === 0 ? 'i dag' : `om ${s.dager} d`;
  const topp = d.egne.slice(0, 2).map(s => `${s.befaring.kontaktNavn || s.befaring.adresse} (${dagTekst(s)})`);
  let tekst = topp.join(', ') + (d.egne.length > 2 ? ' …' : '');
  if ((d.varme || []).length) {
    const fornavn = String(d.varme[0].befaring.kontaktNavn || d.varme[0].befaring.adresse || 'Kunden').split(/\s+/)[0];
    tekst = `🔥 ${fornavn} leser tilbudet ditt` + (tekst ? ' · ' + tekst : '');
  }
  if (!tekst) tekst = kortNavnListe(d.tilAdmin.map(x => x.sak));
  return {
    tittel: `Morgenbrief: ${d.antall} å ringe${d.forfalt ? ` (${d.forfalt} forfalt)` : ''}`,
    tekst, url: appUrl, hendelse: 'oppfolging-digest',
  };
}
export function lagEskaleringPush(gruppe, appUrl) {
  const saker = gruppe.saker || [];
  return {
    tittel: saker.length === 1
      ? `Eskalering: ${saker[0].sak.befaring.kontaktNavn || saker[0].sak.befaring.adresse}`
      : `Eskalering: ${saker.length} saker forfalt >7 dager`,
    tekst: kortNavnListe(saker.map(e => e.sak)),
    url: appUrl, hendelse: 'oppfolging-eskalering',
  };
}
export function lagUkesdigestPush(u, appUrl) {
  const verst = u.rader.filter(r => r.forfalt > 0).slice(0, 3)
    .map(r => `${r.navn} ${r.forfalt} forfalt`).join(' · ');
  return {
    tittel: `Oppfølging sist uke (${u.fra} – ${u.til_dato})`,
    tekst: verst || 'Ingen forfalte saker — godt jobbet.',
    url: appUrl, hendelse: 'oppfolging-ukesdigest',
  };
}
