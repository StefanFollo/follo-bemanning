// Underprosjekter / grupper (SPEC-underprosjekter.md §1, §3 — oppdrag 32).
// Kjør: node tests/test-grupper.mjs
import {
  gruppeMedlemmer, gruppeNavn, medlemsNavn, visningsnavn, gruppeFarge, fargeVariant,
  samleIGrupper, gruppeAvvik, gruppeSum, leggIGruppe, losneFraGruppe, giGruppeNavn,
  grupperDigestLinjer, sammeGruppe,
} from '../src/grupper.js';
import { pipelineListe, pipelineDigestLinje } from '../src/pipeline.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}

const fasade = { id: 'F', navn: 'Rickard Berzelius – Greverudveien 15B', adresse: 'Greverudveien 15B', jobbType: 'Fasade jobb', farge: '#2563eb', belop: '247590', kunde: { navn: 'Rickard Berzelius' }, opprettet: '2026-05-22' };
const bad = { id: 'B', navn: 'Richard Bad – Greverudveien 15 Bad', adresse: 'Greverudveien 15 Bad', jobbType: 'Bad', farge: '#16a34a', belop: '517500', kunde: { navn: 'Richard Bad' }, opprettet: '2026-09-11' };
const annet = { id: 'X', navn: 'Trollveien 2', adresse: 'Trollveien 2', farge: '#dc2626', belop: '100000' };

console.log('\n-- Uten gruppe: alt som før (regresjon, test-krav 5) --');
{
  sjekk('visningsnavn uten gruppe = adresse', visningsnavn(fasade, [fasade, bad]) === 'Greverudveien 15B');
  sjekk('gruppeFarge uten gruppe = egen farge', gruppeFarge(bad, [fasade, bad]) === '#16a34a');
  const s = samleIGrupper([fasade, bad, annet]);
  sjekk('samleIGrupper uten grupper = tre enkle rader i samme rekkefølge', s.length === 3 && s.every(x => x.type === 'enkel') && s[2].prosjekt.id === 'X');
  sjekk('gruppeMedlemmer uten id = tom', gruppeMedlemmer([fasade], null).length === 0);
  sjekk('losneFraGruppe på prosjekt uten gruppe = null', losneFraGruppe(bad) === null);
}

console.log('\n-- Legg i gruppe (test-krav 3) --');
let F, B;
{
  const r = leggIGruppe(bad, fasade, { av: 'Stefan', naa: 1000 });
  sjekk('leggIGruppe: nytt gruppeId = malens id (første medlem)', r.prosjekt.gruppeId === 'F' && r.mal.gruppeId === 'F');
  sjekk('leggIGruppe: begge logges, ingenting annet endres', /Lagt i gruppe/.test(r.prosjekt.pipelineLogg.at(-1).tekst) && /Gruppe opprettet/.test(r.mal.pipelineLogg.at(-1).tekst) && r.prosjekt.belop === '517500' && r.mal.navn === fasade.navn);
  F = r.mal; B = r.prosjekt;
  sjekk('samme prosjekt kan ikke legges i gruppe med seg selv', leggIGruppe(bad, bad) === null);
  const r2 = leggIGruppe(annet, B, { av: 'x', naa: 2000 });
  sjekk('legg til tredje via et medlem som alt har gruppe: mal uendret (null), samme gruppeId', r2.mal === null && r2.prosjekt.gruppeId === 'F');
  sjekk('sammeGruppe', sammeGruppe(F, B) && !sammeGruppe(F, annet));
}

console.log('\n-- Navn, farge og visning --');
{
  const alle = [F, B, annet];
  sjekk('gruppeNavn utledes av første medlems adresse: «Greverudveien 15B»', gruppeNavn(alle, 'F') === 'Greverudveien 15B', gruppeNavn(alle, 'F'));
  sjekk('medlemsNavn: «Bad» (jobbType) og «Fasade jobb»', medlemsNavn(B, alle) === 'Bad' && medlemsNavn(F, alle) === 'Fasade jobb', medlemsNavn(B, alle) + ' / ' + medlemsNavn(F, alle));
  sjekk('visningsnavn: «Greverudveien 15B · Bad»', visningsnavn(B, alle) === 'Greverudveien 15B · Bad', visningsnavn(B, alle));
  const navngitt = giGruppeNavn([F, B], 'Berzelius-huset', { av: 'Stefan', naa: 3000 });
  sjekk('giGruppeNavn: alle medlemmer får navnet + logg', navngitt.every(p => p.gruppeNavn === 'Berzelius-huset') && /Berzelius-huset/.test(navngitt[0].pipelineLogg.at(-1).tekst));
  sjekk('gruppeNavn bruker satt navn', gruppeNavn([...navngitt, annet], 'F') === 'Berzelius-huset');
  const tomt = giGruppeNavn(navngitt, '', { av: 'x' });
  sjekk('tomt navn fjerner feltet → utledet igjen', tomt.every(p => !('gruppeNavn' in p)) && gruppeNavn(tomt, 'F') === 'Greverudveien 15B');
  sjekk('medlemsNavn med satt medlemsNavn', medlemsNavn({ ...B, medlemsNavn: 'Bad 2. etg' }, alle) === 'Bad 2. etg');
  sjekk('medlemsNavn: adressens hale vinner over generisk jobbType («Greverudveien 15 Bad» + «Ny bygg» → «Bad»)', medlemsNavn({ ...B, jobbType: 'Ny bygg' }, alle) === 'Bad', medlemsNavn({ ...B, jobbType: 'Ny bygg' }, alle));
  sjekk('medlemsNavn: adresse uten hale faller tilbake på jobbType', medlemsNavn({ ...F, jobbType: 'Fasade' }, alle) === 'Fasade');
  sjekk('medlemsNavn uten jobbType renser navnet for kunde/adresse', medlemsNavn({ id: 'K', gruppeId: 'F', navn: 'Rickard Berzelius – Greverudveien 15B – Kjøkken', adresse: 'Greverudveien 15B', kunde: { navn: 'Rickard Berzelius' } }, alle) === 'Kjøkken');
  sjekk('fargeVariant: idx 0 = basisfarge, idx 1/2 ulike, gyldig hex', fargeVariant('#2563eb', 0) === '#2563eb' && /^#[0-9a-f]{6}$/.test(fargeVariant('#2563eb', 1)) && fargeVariant('#2563eb', 1) !== fargeVariant('#2563eb', 2) && fargeVariant('#2563eb', 1) !== '#2563eb');
  sjekk('gruppeFarge: første medlem = basis, Bad = variant av Fasade-fargen', gruppeFarge(F, alle) === '#2563eb' && gruppeFarge(B, alle) === fargeVariant('#2563eb', 1));
  const m = gruppeMedlemmer(alle, 'F');
  sjekk('gruppeMedlemmer: eldst først (Fasade før Bad)', m.length === 2 && m[0].id === 'F' && m[1].id === 'B');
  sjekk('arkiverte medlemmer utelates som standard', gruppeMedlemmer([...alle, { id: 'G', gruppeId: 'F', arkivert: true }], 'F').length === 2);
}

console.log('\n-- Liste, avvik, sum --');
{
  const alle = [annet, F, B];
  const s = samleIGrupper(alle);
  sjekk('samleIGrupper: enkel + én gruppe med to medlemmer der første medlem sto', s.length === 2 && s[0].type === 'enkel' && s[1].type === 'gruppe' && s[1].medlemmer.length === 2 && s[1].navn === 'Greverudveien 15B');
  sjekk('gruppeSum', gruppeSum(s[1].medlemmer) === 247590 + 517500);
  sjekk('gruppeAvvik: «1 hull · 1 i pipeline», ok telles ikke', gruppeAvvik([{ type: 'bemanning' }, { type: 'pipeline' }, { type: 'ok' }]) === '1 hull · 1 i pipeline');
  sjekk('gruppeAvvik tom ved bare ok', gruppeAvvik([{ type: 'ok' }]) === '');
}

console.log('\n-- Løsne --');
{
  const l = losneFraGruppe({ ...B, gruppeNavn: 'X' }, { av: 'Stefan', naa: 4000 });
  sjekk('losneFraGruppe fjerner gruppeId/gruppeNavn, logger, sletter ingenting annet', !('gruppeId' in l) && !('gruppeNavn' in l) && l.belop === '517500' && /Løsnet fra gruppen «X»/.test(l.pipelineLogg.at(-1).tekst));
}

console.log('\n-- Pipeline-rullegardin + digest bruker gruppenavn --');
{
  const alle = [F, { ...B, pipeline: { forventetStart: '2026-09-21', forventetUker: 2, forventetFolk: 2, sikkerhet: 'fast' } }, annet];
  const liste = pipelineListe(alle, [], '2026-09-14');
  sjekk('pipelineListe: én rad per medlem, etikett «Gruppe · Medlem»', liste.some(r => r.prosjektId === 'B' && r.navn === 'Greverudveien 15B · Bad') && liste.some(r => r.prosjektId === 'F' && r.navn === 'Greverudveien 15B · Fasade jobb'));
  const d = pipelineDigestLinje(alle, [], '2026-09-14');
  sjekk('pipelineDigestLinje nevner gruppen', typeof d === 'string' && /Greverudveien 15B: /.test(d) && /Bad/.test(d), d);
  const g = grupperDigestLinjer([{ prosjektId: 'B', tekst: 'starter u39 uten folk' }, { prosjektId: 'X', tekst: 'hull u40' }, { prosjektId: 'F', tekst: 'hull u40' }], alle);
  sjekk('grupperDigestLinjer: «Greverudveien 15B: Bad starter u39 uten folk; Fasade jobb hull u40» + enkel linje', g.length === 2 && g[0] === 'Greverudveien 15B: Bad starter u39 uten folk; Fasade jobb hull u40' && g[1] === 'hull u40', JSON.stringify(g));
}

console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil ? 1 : 0);
