// Atomisk skriving av fbs_state med versjonsnøkkel (compare-and-set).
//
// PROBLEMET DETTE LØSER (fase 1 av sync-reparasjon, aug 2026):
// Klient-lagring (api/state.js) leser fbs_state, fletter, og skriver tilbake.
// Mellom les og skriv ligger flere hundre ms (bl.a. backup-rotasjon). Hvis
// /api/befaringer/event (eller andre server-endepunkter) opprettet en befaring
// i det vinduet, ble den VISKET UT av klientens etterfølgende SET — flettingen
// var kjørt mot øyeblikksbildet fra FØR eventet. Resultat: «serveren svarte
// nySkapt:true, men befaringen er borte» (10 spøkelses-koblinger per 06.08).
//
// LØSNINGEN: en teller fbs_state_ver bumpes atomisk ved HVER skriving.
// Klient-lagringen skriver kun hvis telleren er uendret siden lesingen
// (Lua-script = atomisk i Redis). Har noen skrevet i mellomtiden, feiler
// skrivingen, og api/state.js leser på nytt og FLETTER PÅ NYTT mot fersk
// tilstand — ingenting går tapt.
//
// ALLE server-endepunkter som skriver fbs_state skal bruke skrivStateOgBump()
// i stedet for redis.set('fbs_state', ...) — ellers oppdages ikke skrivingen
// deres av CAS-sjekken.

const VER_KEY = 'fbs_state_ver';
const STATE_KEY = 'fbs_state';

// Skriv kun hvis versjonen er uendret; bump versjonen i samme atomiske script.
const CAS_SCRIPT = `
local v = redis.call('GET', KEYS[1])
if v == false then v = '0' end
if v ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2])
redis.call('INCR', KEYS[1])
return 1`;

// Siste-skriver-vinner (for server-endepunkter som selv har flettet inn sin
// endring i fersk tilstand), men bump versjonen atomisk slik at pågående
// klient-lagringer oppdager skrivingen og fletter på nytt.
const SET_BUMP_SCRIPT = `
redis.call('SET', KEYS[2], ARGV[1])
redis.call('INCR', KEYS[1])
return 1`;

export async function lesStateOgVer(redis) {
  // Sekvensielt med vilje: parallelle GET-er kan auto-batches av klienten,
  // og en ombytting av svarene ville gitt ver=state-objektet → NaN → CAS
  // som aldri treffer. To sekvensielle kall er entydig og koster ~1 ms.
  const ver = await redis.get(VER_KEY);
  const state = await redis.get(STATE_KEY);
  return { ver: Number(ver) || 0, state };
}

// true = skrevet; false = noen andre skrev i mellomtiden (les + flett på nytt)
export async function skrivStateCas(redis, forventetVer, newState) {
  const resultat = await redis.eval(
    CAS_SCRIPT,
    [VER_KEY, STATE_KEY],
    [String(forventetVer), JSON.stringify(newState)],
  );
  return Number(resultat) === 1;
}

export async function skrivStateOgBump(redis, newState) {
  await redis.eval(SET_BUMP_SCRIPT, [VER_KEY, STATE_KEY], [JSON.stringify(newState)]);
}
