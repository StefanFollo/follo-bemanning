// ═══ Oppgaver under faser (postkasse-oppdrag 15) ═══
// En fase i fdTasks kan deles i mange oppgaver som fordeles på ansatte.
// REN logikk — brukes av PC-gantten, ansattflate-API-et og testene.
//
// Datamodell (tillegg på hver fase):
//   oppgaver: [{ id, tekst, tildelt: [ansattId], status: 'apen'|'ferdig',
//                ferdigAv, ferdigDato, opprettetAv, opprettet,
//                dag: null|'YYYY-MM-DD', fjernet?: true }]
// - Aldri sletting: «fjernet» skjuler oppgaven (loggføres av kalleren).
// - fase.tildelt («hvem er på fasen») = union av oppgavenes tildelte når
//   oppgaver finnes — vedlikeholdes automatisk her.
// - Migrering: gammel fase.oppgaveTekst blir første oppgave (én gang).

function nyId() {
  return 'op' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Synlige (ikke-fjernede) oppgaver — tåler faser uten oppgaver-array
export function oppgaverPaaFase(fase) {
  return (Array.isArray(fase?.oppgaver) ? fase.oppgaver : []).filter(o => o && !o.fjernet);
}

// Materialiser oppgaver-arrayen; gammel oppgaveTekst → én oppgave med
// fasens tildelt[] (kjøres implisitt av alle skrivende funksjoner)
export function migrerFase(fase, { av } = {}) {
  if (Array.isArray(fase.oppgaver)) return fase;
  const oppgaver = [];
  if (fase.oppgaveTekst) {
    oppgaver.push({
      id: nyId(), tekst: String(fase.oppgaveTekst).slice(0, 300),
      tildelt: [...(fase.tildelt || [])], status: 'apen',
      opprettetAv: av || 'migrering', opprettet: new Date().toISOString(), dag: null,
    });
  }
  return { ...fase, oppgaver };
}

// fase.tildelt = union av synlige oppgavers tildelte (kun når oppgaver finnes)
export function oppdaterFaseTildelt(fase) {
  const synlige = oppgaverPaaFase(fase);
  if (!synlige.length) return fase;
  return { ...fase, tildelt: [...new Set(synlige.flatMap(o => o.tildelt || []))] };
}

// Legg til én eller flere oppgaver (én per tekstlinje, maks 50 om gangen)
export function leggTilOppgaver(fase, tekster, { tildelt = [], av = '', dag = null } = {}) {
  const f = migrerFase(fase, { av });
  const nye = (Array.isArray(tekster) ? tekster : [tekster])
    .map(t => String(t || '').trim()).filter(Boolean).slice(0, 50)
    .map(t => ({
      id: nyId(), tekst: t.slice(0, 300), tildelt: [...tildelt], status: 'apen',
      opprettetAv: av, opprettet: new Date().toISOString(), dag,
    }));
  return oppdaterFaseTildelt({ ...f, oppgaver: [...f.oppgaver, ...nye] });
}

// Endre én oppgave: tekst / tildelt / dag / fjernet / ferdig (med hvem+når)
export function endreOppgave(fase, oppgaveId, endring, { av = '' } = {}) {
  const f = migrerFase(fase, { av });
  let funnet = false;
  const oppgaver = f.oppgaver.map(o => {
    if (!o || o.id !== oppgaveId) return o;
    funnet = true;
    const ny = { ...o };
    if (endring.tekst !== undefined) ny.tekst = String(endring.tekst).slice(0, 300);
    if (endring.tildelt !== undefined) ny.tildelt = [...endring.tildelt];
    if (endring.dag !== undefined) ny.dag = endring.dag || null;
    if (endring.fjernet !== undefined) ny.fjernet = !!endring.fjernet;
    if (endring.ferdig !== undefined) {
      ny.status = endring.ferdig ? 'ferdig' : 'apen';
      ny.ferdigAv = endring.ferdig ? av : null;
      ny.ferdigDato = endring.ferdig ? new Date().toISOString() : null;
    }
    return ny;
  });
  return funnet ? oppdaterFaseTildelt({ ...f, oppgaver }) : null;
}

// «3/7 oppgaver ferdig»
export function oppgaveStat(fase) {
  const synlige = oppgaverPaaFase(fase);
  return { totalt: synlige.length, ferdig: synlige.filter(o => o.status === 'ferdig').length };
}
