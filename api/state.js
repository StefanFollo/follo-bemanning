import { Redis } from '@upstash/redis';
import { lesStateOgVer, skrivStateCas } from './_stateCas.js';
import { appendAuditLog, byggAuditEntry } from './_dataIntegritet.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function getSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  return await redis.get(`fbs_session:${token}`);
}

// Sammenlign to elementer uten _endret-stempelet, ufølsom for nøkkelrekkefølge
// på toppnivå. Brukes for å avgjøre om innholdet FAKTISK er endret.
function likUtenStempel(a, b) {
  const ka = Object.keys(a).filter(k => k !== '_endret').sort();
  const kb = Object.keys(b).filter(k => k !== '_endret').sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if (JSON.stringify(a[ka[i]]) !== JSON.stringify(b[kb[i]])) return false;
  }
  return true;
}

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Ikke autorisert' });

  if (req.method === 'GET') {
    try {
      const state = await redis.get('fbs_state');
      res.status(200).json(state || {});
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else if (req.method === 'POST') {
    const WRITE_ROLES = ['admin', 'kontor', 'befaring'];
    // Manglende rolle skal AVVISES, ikke slippes gjennom (fail-closed)
    if (!WRITE_ROLES.includes(session.role)) {
      return res.status(403).json({ error: 'Rollen din har ikke skrivetilgang.' });
    }
    try {
      // ── CAS-LØKKE (fase 1 sync-reparasjon aug 2026) ──
      // Les state + versjon, flett, skriv KUN hvis versjonen er uendret.
      // Skrev noen (f.eks. /api/befaringer/event) i mellomtiden, feiler
      // skrivingen og vi fletter PÅ NYTT mot fersk tilstand. Uten dette ble
      // event-opprettede befaringer visket ut av klient-lagringer som hadde
      // lest state før eventet skrev (les→skriv-vinduet var flere hundre ms).
      const MAKS_FORSOK = 4;
      let backupTatt = false;

      for (let forsok = 1; forsok <= MAKS_FORSOK; forsok++) {
      let newState = req.body;
      let serverEndretYtre = false; // ble sky-elementer flettet inn i klientens lagring?
      const beholdtNyeServerElementer = {}; // felt → antall sky-elementer klienten ikke hadde
      const { ver, state: currentState } = await lesStateOgVer(redis);
      if (currentState) {
        // ── Tombstones: bevisste slettinger (bygges FØR guards, så guards kan
        // se bort fra elementer som er slettet med vilje — ellers oppstår en
        // evig 409-løkke når f.eks. et prosjekt med mange tildelinger slettes) ──
        const innSlettinger = Array.isArray(newState._slettinger) ? newState._slettinger : [];
        const skyTombstones = Array.isArray(currentState._tombstones) ? currentState._tombstones : [];
        const tombMap = new Map(); // id → nyeste slette-ts
        for (const t of [...skyTombstones, ...innSlettinger]) {
          if (!t || t.id == null) continue;
          const eks = tombMap.get(t.id);
          if (!eks || t.ts > eks) tombMap.set(t.id, t.ts);
        }
        const erSlettet = x => x && x.id != null && (tombMap.get(x.id) || 0) > (x._endret || 0);

        // Sikkerhetssperrer: blokker lagring som reduserer antall drastisk
        // (utover det som er bevisst slettet via tombstones)
        const GUARDS = [
          { felt: 'befaringer', margin: 5 },
          { felt: 'tildelinger', margin: 10 },
          { felt: 'ansatte', margin: 3 },
        ];
        for (const { felt, margin } of GUARDS) {
          if (!Array.isArray(currentState[felt]) || !Array.isArray(newState[felt])) continue;
          const cur = currentState[felt].filter(x => !erSlettet(x)).length;
          const nxt = newState[felt].length;
          if (nxt < cur - margin) {
            return res.status(409).json({
              error: `Konflikt: forsøker å lagre ${nxt} ${felt}, men det finnes ${cur} i skyen. Last inn siden på nytt.`,
              field: felt, currentCount: cur, newCount: nxt,
            });
          }
        }
        // ── PER-ELEMENT MERGE (hindrer at samtidige/utdaterte klienter overskriver hverandre) ──
        // Tidligere tapte vi data fordi hele arrayet ble overskrevet av sistemann
        // som lagret — selv om de to brukerne redigerte FORSKJELLIGE elementer,
        // eller en iPad våknet fra dvale med gårsdagens kopi.
        // Nå flettes hvert element for seg: nyeste _endret-stempel vinner.
        const ITEM_FELT = [
          'ansatte', 'prosjekter', 'tildelinger', 'oppgaver', 'teams',
          'rorTimer', 'rorPlaner', 'befaringer', 'reklamasjoner', 'serviceJobber', 'biler',
        ];
        const cloudFieldTs = currentState._fieldTs || {};
        const incomingFieldTs = newState._fieldTs || {};
        const mergedFieldTs = { ...incomingFieldTs };
        const nu = Date.now();
        let serverEndret = false;
        const beholdtOversikt = [];

        for (const felt of ITEM_FELT) {
          const cloudArr = currentState[felt];
          const inArr = newState[felt];
          if (!Array.isArray(cloudArr) || !Array.isArray(inArr)) continue;
          const cloudById = new Map(cloudArr.filter(x => x && x.id != null).map(x => [x.id, x]));
          const inIds = new Set(inArr.filter(x => x && x.id != null).map(x => x.id));
          let beholdt = 0;
          const cloudTsFelt = cloudFieldTs[felt] || 0;
          const inTsFelt = incomingFieldTs[felt] || 0;

          const resultat = inArr.map(item => {
            if (!item || item.id == null) return item;
            const c = cloudById.get(item.id);
            if (!c) {
              // Ikke i skyen: sjekk tombstone mot ORIGINALT stempel FØR vi
              // stempler nytt — ellers gjenoppstår slettede elementer fra
              // utdaterte klienter (stemplet ville alltid vunnet over tombstonen).
              if (erSlettet(item)) return null;
              // Nytt element fra klienten — stemple hvis mangler
              return item._endret ? item : { ...item, _endret: nu };
            }
            const ct = c._endret || 0;
            const it = item._endret || 0;
            if (ct > it) { beholdt++; return c; }        // skyen er nyere for DETTE elementet
            if (it > ct) {
              // Klienten er nyere for DETTE elementet. RE-STEMPLE med SERVER-tid
              // når innholdet faktisk er endret — klient-klokker kan ikke stoles
              // på (en enhet med klokka foran kunne ellers «vinne» for alltid).
              // Identisk innhold → behold skyens stempel (unngå stempel-inflasjon).
              return likUtenStempel(c, item) ? c : { ...item, _endret: nu };
            }
            // Uten stempler (gamle data): felt-tidsstempel avgjør; hvis klienten
            // vinner og innholdet faktisk er endret, stemple det nå slik at
            // fremtidig fletting har noe å sammenligne med.
            const ulikt = !likUtenStempel(c, item);
            if (cloudTsFelt > inTsFelt) { if (ulikt) beholdt++; return c; }
            if (ulikt) return { ...item, _endret: nu };
            return item;
          });

          // Elementer som finnes i sky men ikke hos klienten: BEHOLD alltid —
          // de er enten lagt til av andre (f.eks. event-opprettede befaringer),
          // eller klienten er utdatert.
          // (Bevisste slettinger fjernes av tombstone-filteret under.)
          for (const c of cloudArr) {
            if (!c || c.id == null || inIds.has(c.id)) continue;
            resultat.push(c);
            if (!erSlettet(c)) {
              beholdt++;
              beholdtNyeServerElementer[felt] = (beholdtNyeServerElementer[felt] || 0) + 1;
            }
          }

          // Tombstone-filter: fjern alt som er slettet med vilje (og null fra over)
          const filtrert = resultat.filter(x => x && !erSlettet(x));

          // Rekkefølge: hvis skyen har nyere felt-tidsstempel, bruk skyens
          // rekkefølge som fasit (bevarer f.eks. drag-sortering av team).
          if (cloudTsFelt > inTsFelt) {
            const pos = new Map(cloudArr.filter(x => x && x.id != null).map((x, i) => [x.id, i]));
            filtrert.sort((a, b) =>
              (pos.has(a?.id) ? pos.get(a.id) : Infinity) - (pos.has(b?.id) ? pos.get(b.id) : Infinity)
            );
          }

          if (beholdt > 0) {
            serverEndret = true;
            beholdtOversikt.push(`${felt}:${beholdt}`);
          }
          newState = { ...newState, [felt]: filtrert };
          mergedFieldTs[felt] = Math.max(cloudTsFelt, inTsFelt);
        }

        // Lagre tombstones i sky-state (trim: 30 dager / maks 1000) og fjern
        // klient-feltet _slettinger fra det som lagres.
        const grense = nu - 30 * 24 * 3600 * 1000;
        const nyeTombstones = [...tombMap.entries()]
          .map(([id, ts]) => ({ id, ts }))
          .filter(t => t.ts > grense)
          .slice(-1000);
        const { _slettinger, ...utenSlettinger } = newState;
        newState = { ...utenSlettinger, _tombstones: nyeTombstones };

        // 'fag' (strenger, ingen id): felt-nivå som før
        if ((cloudFieldTs.fag || 0) > (incomingFieldTs.fag || 0) && currentState.fag !== undefined) {
          newState = { ...newState, fag: currentState.fag };
          mergedFieldTs.fag = cloudFieldTs.fag;
        }

        newState = { ...newState, _fieldTs: mergedFieldTs };
        const cloudUpd = currentState._updatedAt || 0;
        // _updatedAt settes ALLTID av SERVEREN, garantert stigende.
        // Tidligere kom verdien fra klient-klokker: en enhet med klokka foran
        // «låste» _updatedAt fremover i tid, og andres lagringer (med korrekt
        // klokke) passerte aldri verdien → polling så aldri endringene deres.
        newState = { ...newState, _updatedAt: Math.max(nu, cloudUpd + 1) };
        serverEndretYtre = serverEndret;
        if (serverEndret) {
          console.log(`[state] Per-element-merge beholdt: ${beholdtOversikt.join(', ')}`);
        }
      }
      // Klient-feltet _slettinger skal aldri lagres (dekker også første lagring
      // mot tom sky, der merge-blokken over ikke kjører)
      if (newState._slettinger !== undefined) {
        const { _slettinger, ...utenSlettingerYtre } = newState;
        newState = utenSlettingerYtre;
      }
      // Rullerende backup: bevar siste 5 lagringer i 7 dager.
      // Kun på FØRSTE forsøk — retry skal ikke rotere backupene flere ganger.
      if (!backupTatt) {
        backupTatt = true;
        try {
          const b4 = await redis.get('fbs_backup_4');
          if (b4) await redis.set('fbs_backup_5', b4, { ex: 7 * 24 * 3600 });
          const b3 = await redis.get('fbs_backup_3');
          if (b3) await redis.set('fbs_backup_4', b3, { ex: 7 * 24 * 3600 });
          const b2 = await redis.get('fbs_backup_2');
          if (b2) await redis.set('fbs_backup_3', b2, { ex: 7 * 24 * 3600 });
          const b1 = await redis.get('fbs_backup_1');
          if (b1) await redis.set('fbs_backup_2', b1, { ex: 7 * 24 * 3600 });
          if (currentState) await redis.set('fbs_backup_1', { ...currentState, _backedUpAt: Date.now() }, { ex: 7 * 24 * 3600 });
        } catch { /* backup-feil stopper ikke lagring */ }
      }

      // Atomisk skriving: kun hvis ingen andre har skrevet siden vi leste.
      const skrevet = await skrivStateCas(redis, ver, newState);
      if (!skrevet) {
        console.log(`[state] CAS-kollisjon (forsøk ${forsok}/${MAKS_FORSOK}) — noen skrev i mellomtiden, fletter på nytt`);
        continue;
      }

      // Audit-logg når klient-lagringen fikk flettet inn server-opprettede
      // elementer klienten ikke kjente til (f.eks. event-opprettede befaringer)
      const bevarte = Object.entries(beholdtNyeServerElementer);
      if (bevarte.length > 0) {
        try {
          await appendAuditLog(redis, byggAuditEntry({
            objekt: 'state',
            objektId: 'klient-lagring',
            felt: 'merge',
            fraVerdi: null,
            tilVerdi: bevarte.map(([f, n]) => `${f}:${n}`).join(', '),
            endretAv: session.navn || session.email || 'ukjent',
            kilde: 'state-merge',
            begrunnelse: `Beholdt ${bevarte.map(([f, n]) => `${n} ${f}`).join(', ')} som klienten ikke hadde (server-opprettet/annen bruker) ved klient-lagring`,
          }));
        } catch { /* audit-feil stopper ikke lagring */ }
      }

      // updatedAt: serverens tidsstempel → klientens polle-referanse (ikke egen klokke).
      // merged: serveren beholdt sky-elementer klienten ikke hadde → klienten
      // må hente resultatet straks i stedet for å vente på neste poll.
      return res.status(200).json({
        ok: true,
        updatedAt: newState._updatedAt || 0,
        merged: serverEndretYtre,
      });
      } // slutt CAS-løkke

      // Alle forsøk brukt opp — ekstremt samtidig trafikk. Klienten prøver
      // igjen automatisk ved neste endring/poll; ingenting er tapt.
      console.error(`[state] CAS ga opp etter ${MAKS_FORSOK} forsøk`);
      return res.status(503).json({ error: 'Svært mange samtidige lagringer — prøver igjen automatisk.' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
