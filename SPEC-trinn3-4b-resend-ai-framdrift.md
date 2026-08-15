# SPEC trinn 3 + 4b: Re-send tilbudsdata + AI-framdriftsplan fra kalkylen

**Godkjent av Stefan 15.08.2026.** Samlet leveranse. Trinn 3 fyller de historiske datahullene (kun 7 av 78 aktive befaringer har full payload), trinn 4b bruker dataene til å generere framdriftsplan-utkast.

---

## 🛑 Rammer (som alltid)

- Alt er additivt. INGEN sletting, INGEN endring av eksisterende data, INGEN bulk-operasjoner.
- Re-send skjer manuelt, ETT tilbud om gangen. Ingen "send alle"-knapp — bulk-fixSync var det som skapte kaoset i mai.
- AI-generert framdriftsplan er et UTKAST som PL godkjenner/redigerer — aldri auto-aktivert.
- Eksisterende framdriftsplaner overskrives ALDRI uten eksplisitt bekreftelse.

---

## Trinn 3 — "📤 Send data på nytt" (tilbuds-appen)

### 3.1 Knapp per tilbud

På hvert lagret tilbud (i listen og/eller tilbuds-detaljen): "📤 Send data på nytt" i en meny (ikke som stor synlig knapp — dette er et vedlikeholdsverktøy).

### 3.2 Hva den gjør

1. Bygger komplett payload med `byggBemanningsData()` (eksisterende funksjon — alle 36 felter)
2. POST til /api/bemanning-event med type `payload-oppdatering` (NY event-type):
   - Oppdaterer KUN `befaring.tilbudPayload` (+ `_mottattDato`, `_mottattType: 'payload-oppdatering'`)
   - Endrer ALDRI befaringens status, kolonne eller andre felter
   - Bruker kildeBefaringId → adresse-fallback som andre events
   - Merge-lagring beskytter (fase 1)
3. Respons vises: "✅ Data sendt til befaring [adresse]" eller "⚠ Fant ingen befaring — opprett kobling manuelt"
4. Hvis server matchet via fallback og returnerer ny kildeBefaringId: oppdater lokalt (eksisterende logikk)

### 3.3 Server-side (bemannings-appen)

Ny event-type `payload-oppdatering` i /api/befaringer/event:
- Finn befaring (kildeBefaringId → adresse-fallback)
- Sett tilbudPayload = innkommende data. Hvis befaringen ALLEREDE har payload med NYERE _mottattDato: behold den nyeste, svar "beholdt nyere versjon"
- Audit-logg + snapshot (eksisterende systemer)
- IKKE røre status/kolonne — dette er ren data-påfylling
- Idempotent (dedup som andre events)

### 3.4 Synlighet i tilbuds-appen

Ved tilbud som mangler sync-kobling: liten indikator "📤 Data ikke sendt til bemanning" så Stefan ser hvilke som trenger re-send. Ingen automatikk.

---

## Trinn 4b — "✨ Generer framdriftsplan" fra kalkylen (bemannings-appen)

### 4b.1 Inngang

Prosjekt-detaljpanelets Framdrift-fane. I dag: "🗓 Ingen framdriftsplan generert ennå". Ny tilstand når prosjektet HAR tilbudPayload:

```
🗓 Ingen framdriftsplan ennå
Dette prosjektet har full kalkyle fra tilbudet
(6 poster · 238 timer · 3 fag)
[✨ Generer utkast fra kalkylen]
```

Uten payload: behold dagens melding + tips om "Koble til tilbud".

### 4b.2 Generering (AI)

Bruk claude-sonnet (som øvrig AI-generering i appene). Input til prompten:
- Postene (navn, beskrivelse, kalkyletimer per post)
- fagBreakdown (timer per fag), totalTimer
- Varighet (varighetUker), oppstartTekst
- Prosjektets start-/sluttdato hvis satt
- ByggInfo og soner (kontekst)

Output (strukturert JSON):
```js
framdriftsplan: {
  generertFra: 'tilbud-kalkyle',
  generertDato, generertAv,
  status: 'utkast',                    // ALLTID utkast først
  faser: [{
    navn: 'Riving og forberedelse',    // logisk gruppering av poster
    posterRef: [postId, ...],
    estimertTimer: 46,
    fag: ['tomrer', 'rive'],
    startUke, sluttUke,                // sekvensert med avhengigheter
    avhengerAv: [faseIndex, ...]       // f.eks. membran før flis
  }],
  merknader: ['Membran må herde 2 døgn før flislegging', ...]
}
```

AI-en skal bruke bygg-logikk i sekvenseringen: riving → grunnarbeid → tekniske fag → tetting/membran → overflater → sluttkontroll. Faser med ulike fag kan overlappe der det er faglig fornuftig.

### 4b.3 Utkast-flyt (viktig)

1. Generert plan vises som UTKAST i panelet — tydelig merket "✨ Utkast — ikke aktivert"
2. PL kan: redigere faser (navn, uker, timer), slette/legge til faser, dra rekkefølge
3. [✓ Aktiver plan] → planen blir prosjektets framdriftsplan og synes i Framdrift-fanen
4. [🗑 Forkast utkast] → utkastet fjernes, INGENTING annet påvirkes (utkast er ikke data-sletting)
5. Hvis prosjektet ALLEREDE har framdriftsplan: knappen heter "✨ Generer nytt utkast" og aktivering krever bekreftelse: "Erstatte eksisterende plan? Den gamle arkiveres og kan gjenopprettes" → gammel plan lagres i `framdriftsplanHistorikk` (aldri slettes)

### 4b.4 Kobling til Framdrift-fanen (hovedfanen)

Aktivert plan vises i den eksisterende Framdrift-siden som i dag ("48 aktive prosjekter · 0 med AI-plan" → telleren begynner å telle). Ingen endring i Framdrift-sidens struktur i denne leveransen.

---

## Datamodell (kun tillegg)

```js
befaring.tilbudPayload._mottattType: 'payload-oppdatering'  // ny verdi
prosjekt.framdriftsplan: {...}                               // se 4b.2
prosjekt.framdriftsplanHistorikk: [{...gammel plan, arkivertDato, arkivertAv}]
```

---

## Test-krav

**Trinn 3:**
1. Re-send på tilbud med gyldig kobling → befaringen får payload, status/kolonne UENDRET
2. Re-send på tilbud med spøkelse-ID → adresse-fallback finner riktig, lokal ID oppdateres
3. Re-send når befaringen har NYERE payload → nyeste beholdes, svar forklarer
4. Ingen bulk-mulighet finnes i UI
5. Telling av befaringer/prosjekter uendret

**Trinn 4b:**
6. Generer utkast på prosjekt med payload → faser i faglig fornuftig rekkefølge, timer stemmer med kalkylen
7. Forkast utkast → ingenting annet endret (JSON-diff på prosjektet = kun utkast-feltet)
8. Aktiver plan → vises i Framdrift-fanen, teller øker
9. Generer nytt utkast på prosjekt MED plan → gammel plan i historikk etter aktivering, kan sees
10. Prosjekt uten payload → ingen generer-knapp, tips om Koble til tilbud

---

## Etter denne leveransen (i kø, egne runder)

- 4a: KS-sjekkliste-forslag fra tilbudets fag
- 4c: Timeanslag fra kalkyle vs. faktisk bemanning i Bemanning-fanen
