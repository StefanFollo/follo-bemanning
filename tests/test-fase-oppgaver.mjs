// Test av oppgave-modellen under faser (postkasse-oppdrag 15).
// Kjør: node tests/test-fase-oppgaver.mjs
import {
  oppgaverPaaFase, migrerFase, leggTilOppgaver, endreOppgave, oppgaveStat, oppdaterFaseTildelt,
} from '../src/faseOppgaver.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}

console.log('\n-- Migrering av gammel oppgaveTekst --');
{
  const gammel = { id: 'f1', name: 'Råbygg', oppgaveTekst: 'Kapp lekter til gavl', tildelt: ['A1', 'A2'] };
  const m = migrerFase(gammel, { av: 'Tommy' });
  sjekk('oppgaveTekst → én oppgave med fasens tildelte', m.oppgaver.length === 1
    && m.oppgaver[0].tekst === 'Kapp lekter til gavl' && JSON.stringify(m.oppgaver[0].tildelt) === '["A1","A2"]'
    && m.oppgaver[0].status === 'apen');
  sjekk('Migrering skjer bare én gang', migrerFase(m).oppgaver === m.oppgaver);
  sjekk('Fase uten tekst → tom liste', migrerFase({ id: 'f2' }).oppgaver.length === 0);
}

console.log('\n-- Legg til: én, flere linjer, grenser --');
{
  let f = { id: 'f1', name: 'Råbygg', tildelt: [] };
  f = leggTilOppgaver(f, 'Kapp lekter', { tildelt: ['A1'], av: 'Tommy' });
  f = leggTilOppgaver(f, ['Skru gips\n', '  Montér vindu  ', '', 'Rydd'], { tildelt: ['A2'], av: 'Tommy' });
  const synlige = oppgaverPaaFase(f);
  sjekk('1 + 3 oppgaver (tomme linjer hoppes over)', synlige.length === 4);
  sjekk('Tekster trimmes', synlige[2].tekst === 'Montér vindu');
  sjekk('Unike id-er', new Set(synlige.map(o => o.id)).size === 4);
  sjekk('fase.tildelt = union av oppgavenes tildelte', JSON.stringify([...f.tildelt].sort()) === '["A1","A2"]');
  sjekk('opprettetAv/opprettet satt', synlige.every(o => o.opprettetAv === 'Tommy' && o.opprettet));
}

console.log('\n-- Endre: ferdig med hvem/når, tildeling, fjernet --');
{
  let f = leggTilOppgaver({ id: 'f1', name: 'Råbygg' }, ['O1', 'O2', 'O3'], { tildelt: ['A1'], av: 'AL' });
  const [o1, o2] = oppgaverPaaFase(f);
  f = endreOppgave(f, o1.id, { ferdig: true }, { av: 'Muhammed Sarr' });
  const ferdig = oppgaverPaaFase(f).find(o => o.id === o1.id);
  sjekk('Ferdig logges med hvem og når', ferdig.status === 'ferdig' && ferdig.ferdigAv === 'Muhammed Sarr' && !!ferdig.ferdigDato);
  f = endreOppgave(f, o1.id, { ferdig: false }, { av: 'AL' });
  sjekk('Gjenåpning nullstiller hvem/når', oppgaverPaaFase(f)[0].status === 'apen' && oppgaverPaaFase(f)[0].ferdigAv === null);
  f = endreOppgave(f, o2.id, { tildelt: ['A3'] });
  sjekk('Om-tildeling oppdaterer fasens union', f.tildelt.includes('A3') && f.tildelt.includes('A1'));
  f = endreOppgave(f, o2.id, { fjernet: true }, { av: 'AL' });
  sjekk('Fjernet SKJULES men ligger i dataene (aldri slettet)', oppgaverPaaFase(f).length === 2 && f.oppgaver.length === 3);
  sjekk('Fjernet teller ikke i union', !f.tildelt.includes('A3'));
  sjekk('Ukjent oppgave-id → null', endreOppgave(f, 'finnes-ikke', { ferdig: true }) === null);
}

console.log('\n-- Statistikk («3/7 ferdig») --');
{
  let f = leggTilOppgaver({ id: 'f1' }, ['a', 'b', 'c', 'd'], { av: 'AL' });
  const ids = oppgaverPaaFase(f).map(o => o.id);
  f = endreOppgave(f, ids[0], { ferdig: true }, { av: 'X' });
  f = endreOppgave(f, ids[1], { ferdig: true }, { av: 'X' });
  f = endreOppgave(f, ids[2], { fjernet: true });
  const s = oppgaveStat(f);
  sjekk('2 ferdig av 3 synlige (fjernet teller ikke)', s.ferdig === 2 && s.totalt === 3);
  sjekk('Fase uten oppgaver → 0/0', JSON.stringify(oppgaveStat({ id: 'x' })) === '{"totalt":0,"ferdig":0}');
  sjekk('oppdaterFaseTildelt rører ikke fase uten oppgaver', oppdaterFaseTildelt({ id: 'x', tildelt: ['A9'] }).tildelt[0] === 'A9');
}

console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil > 0 ? 1 : 0);
