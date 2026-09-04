// Test av kundeportal-lenkelogikken (postkasse-oppdrag 8).
// Kjør: node tests/test-kundeportal.mjs
import { kundeportalToken, kundeportalUrl, TILBUDSAPP_URL } from '../src/kundeportal.js';

let feil = 0, ok = 0;
function sjekk(navn, betingelse, detalj = '') {
  if (betingelse) { ok++; console.log(`  OK  ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? ' — ' + detalj : ''}`); }
}

const befaringer = [
  { id: 'B1', tilbudPayload: { publicToken: 'tok-abc123' } },
  { id: 'B2', tilbudPayload: { public_token: 'tok-snake' } },
  { id: 'B3' },
];

console.log('\n-- kundeportalToken --');
sjekk('Prosjekt med egen tilbudPayload.publicToken',
  kundeportalToken({ tilbudPayload: { publicToken: 'direkte' } }) === 'direkte');
sjekk('snake_case public_token godtas',
  kundeportalToken({ tilbudPayload: { public_token: 'snake' } }) === 'snake');
sjekk('Fallback via befaringId → befaringens payload',
  kundeportalToken({ befaringId: 'B1' }, befaringer) === 'tok-abc123');
sjekk('Fallback via kildeBefaringId (Koble-dialogen)',
  kundeportalToken({ kildeBefaringId: 'B2' }, befaringer) === 'tok-snake');
sjekk('Egen payload vinner over befaring-oppslag',
  kundeportalToken({ tilbudPayload: { publicToken: 'egen' }, befaringId: 'B1' }, befaringer) === 'egen');
sjekk('Befaring uten payload → null (aldri død lenke)',
  kundeportalToken({ befaringId: 'B3' }, befaringer) === null);
sjekk('Ukjent befaring → null', kundeportalToken({ befaringId: 'X' }, befaringer) === null);
sjekk('Uten kobling → null', kundeportalToken({}, befaringer) === null);
sjekk('null-objekt → null', kundeportalToken(null, befaringer) === null);
sjekk('Befaring direkte (Ring i dag-kortet)',
  kundeportalToken(befaringer[0]) === 'tok-abc123');

console.log('\n-- kundeportalUrl --');
sjekk('Intern åpning har ALLTID ?intern=1',
  kundeportalUrl('tok-abc123') === `${TILBUDSAPP_URL}/t/tok-abc123?intern=1`);
sjekk('Kundelenken (kopier) er UTEN intern=1',
  kundeportalUrl('tok-abc123', { intern: false }) === `${TILBUDSAPP_URL}/t/tok-abc123`);
sjekk('Fane-hash legges etter intern-flagget',
  kundeportalUrl('tok-abc123', { intern: true, fane: 'framdrift' }) === `${TILBUDSAPP_URL}/t/tok-abc123?intern=1#framdrift`);
sjekk('Token URL-enkodes', kundeportalUrl('a/b') === `${TILBUDSAPP_URL}/t/a%2Fb?intern=1`);
sjekk('Uten token → null', kundeportalUrl(null) === null && kundeportalUrl('') === null);

console.log(`\n=== ${ok} OK, ${feil} FEIL ===`);
process.exit(feil > 0 ? 1 : 0);
