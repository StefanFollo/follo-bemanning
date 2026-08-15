// Test av utkast-logikken (SPEC-trinn4b, test-krav 6–10 minus AI-innhold).
// Kjør: node tests/test-framdrift-utkast.mjs
import { beregnAktivering, beregnForkast, byggFdTasksFraFaser, kalkyleSammendrag, harKalkyle } from '../src/framdriftUtkast.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  ✅ ${navn}`); }
  else { feil++; console.log(`  ❌ ${navn}${detalj ? ' — ' + detalj : ''}`); }
}
function jsonDiff(a, b) {
  const diff = [];
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) diff.push(f);
  }
  return diff;
}

const utkast = {
  status: 'utkast', generertFra: 'tilbud-kalkyle', generertDato: '2026-08-15T14:00:00.000Z',
  oppstartUke: 35, oppstartAar: 2026, totalVarighetUker: 4, estimertSluttUke: 38,
  faser: [
    { id: 'fase-1', navn: 'Riving', fag: ['tomrer'], startUke: 35, varighetDager: 3, estimertTimer: 24, avhengerAv: [] },
    { id: 'fase-2', navn: 'Rør skjult', fag: ['rorlegger'], startUke: 36, varighetDager: 4, estimertTimer: 30, avhengerAv: [0] },
    { id: 'fase-3', navn: 'Membran og flis', fag: ['flis'], startUke: 37, varighetDager: 8, estimertTimer: 60, avhengerAv: [1], kritisk: true },
  ],
  merknader: ['Membran må herde 2 døgn før flislegging'],
};

const prosjektUtenPlan = {
  id: 'P1', navn: 'Test', adresse: 'Utkastveien 1', status: 'aktiv',
  startDato: '2026-08-24', belop: 200000,
  tilbudPayload: { poster: [{ navn: 'Riving', kalkyle: { timer: [{ fag: 'tømrer', antall: 24 }] } }], fagBreakdown: { tomrer: { timer: 114 } }, totalTimer: 114 },
  framdriftsplanUtkast: utkast,
  _endret: 1,
};

console.log('\n── Forkast (krav 7) ──');
{
  const { nyProsjekt } = beregnForkast(prosjektUtenPlan);
  const diff = jsonDiff(nyProsjekt, prosjektUtenPlan);
  sjekk('Forkast endrer KUN utkast-feltet', diff.length === 1 && diff[0] === 'framdriftsplanUtkast', 'diff: ' + diff.join(','));
  sjekk('Utkastet er borte', nyProsjekt.framdriftsplanUtkast === null);
  sjekk('Prosjektet består (telling uendret)', nyProsjekt.id === 'P1');
}

console.log('\n── Aktivering uten eksisterende plan (krav 8) ──');
{
  const { nyProsjekt } = beregnAktivering(prosjektUtenPlan, utkast, { av: 'Petra PL', dato: '2026-08-15T15:00:00.000Z' });
  sjekk('framdriftsplan aktivert', nyProsjekt.framdriftsplan?.status === 'aktiv' && nyProsjekt.framdriftsplan.aktivertAv === 'Petra PL');
  sjekk('Utkast-feltet nullstilt', nyProsjekt.framdriftsplanUtkast === null);
  sjekk('Ingen historikk (fantes ingen plan)', !nyProsjekt.framdriftsplanHistorikk);
  sjekk('fdTasks avledet (3 faser)', nyProsjekt.fdTasks?.length === 3);
  sjekk('fdTasks dag-offset riktig (uke 36 → dag 5)', nyProsjekt.fdTasks[1].start === 5 && nyProsjekt.fdTasks[1].dur === 4);
  sjekk('Teller-kravene: fdGenAv=AI + kildeTilbudData satt', nyProsjekt.fdGenAv === 'AI' && !!nyProsjekt.kildeTilbudData);
  sjekk('fdStartWeek/fdTotalWeeks satt', nyProsjekt.fdStartWeek === 35 && nyProsjekt.fdTotalWeeks === 4);
  sjekk('Driftsdata urørt', nyProsjekt.status === 'aktiv' && nyProsjekt.belop === 200000 && nyProsjekt.startDato === '2026-08-24');
}

console.log('\n── Aktivering MED eksisterende plan (krav 9) ──');
{
  const gammelPlan = { status: 'aktiv', generertDato: '2026-07-01T10:00:00.000Z', faser: [{ id: 'g1', navn: 'Gammel fase' }] };
  const prosjektMedPlan = { ...prosjektUtenPlan, framdriftsplan: gammelPlan, fdTasks: [{ id: 'x', name: 'Gammel', start: 0, dur: 5 }] };
  const { nyProsjekt } = beregnAktivering(prosjektMedPlan, utkast, { av: 'Petra PL', dato: '2026-08-15T15:00:00.000Z' });
  sjekk('Gammel plan i historikk', nyProsjekt.framdriftsplanHistorikk?.length === 1 && nyProsjekt.framdriftsplanHistorikk[0].faser?.[0]?.navn === 'Gammel fase');
  sjekk('Historikk-innslag har arkivertDato/Av', !!nyProsjekt.framdriftsplanHistorikk[0].arkivertDato && nyProsjekt.framdriftsplanHistorikk[0].arkivertAv === 'Petra PL');
  sjekk('Ny plan er aktiv', nyProsjekt.framdriftsplan.generertDato === utkast.generertDato);
  // To aktiveringer på rad → historikken VOKSER (aldri slettes)
  const { nyProsjekt: p2 } = beregnAktivering({ ...nyProsjekt, framdriftsplanUtkast: utkast }, utkast, { av: 'X', dato: 'd2' });
  sjekk('Historikk vokser ved neste aktivering (aldri slettes)', p2.framdriftsplanHistorikk.length === 2);
}

console.log('\n── Gammelt fdTasks-format uten framdriftsplan-objekt ──');
{
  const prosjektKunFdTasks = { ...prosjektUtenPlan, fdTasks: [{ id: 'x', name: 'Fra tilbuds-appen', start: 0, dur: 5 }] };
  const { nyProsjekt } = beregnAktivering(prosjektKunFdTasks, utkast, { av: 'T', dato: 'd' });
  sjekk('fdTasks-snapshot arkivert i historikk', nyProsjekt.framdriftsplanHistorikk?.[0]?.fraFdTasks === true && nyProsjekt.framdriftsplanHistorikk[0].fdTasks.length === 1);
}

console.log('\n── Kalkyle-sammendrag (krav 6/10) ──');
{
  const s = kalkyleSammendrag(prosjektUtenPlan);
  sjekk('Sammendrag: poster/timer/fag', s.poster === 1 && s.timer === 114 && s.fag === 1, JSON.stringify(s));
  sjekk('harKalkyle: med payload → true', harKalkyle(prosjektUtenPlan));
  sjekk('harKalkyle: uten payload → false (krav 10: ingen generer-knapp)', !harKalkyle({ id: 'x', navn: 'Tomt' }));
  const tasks = byggFdTasksFraFaser(utkast);
  sjekk('byggFdTasksFraFaser: timer-sum i faser = kalkylens ånd (3 faser, riktig fag)', tasks.length === 3 && tasks[2].fag === 'flis');
}

console.log(`\n═══ ${ok} OK, ${feil} FEIL ═══`);
process.exit(feil > 0 ? 1 : 0);
