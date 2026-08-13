# SPEC: Ny Prosjekt-side (layout C) + designsystem for hele appen

**Godkjent av Stefan 08.08.2026.** Retning: behold toppmeny-navigasjonen, innfør ETT designsystem med faste komponenter. Prosjekt-siden bygges først og blir malen for resten av appen.

---

## 🛑 ABSOLUTT KRAV — INGEN DATA SKAL FJERNES

- ❌ INGEN sletting av prosjekter, befaringer, tildelinger eller andre data
- ❌ "Slett"-knappen ERSTATTES med "Arkiver" — som setter `arkivert: true` + `arkivertDato` + `arkivertAv` (tombstone). ALDRI fysisk sletting.
- ❌ INGEN migrering/opprydding av eksisterende data (duplikatene tas i sync-fase 3 separat)
- ❌ IKKE rør merge-lagringslogikken fra fase 1 (nylig deployet og verifisert)
- ✅ KUN visnings-/UI-endringer + nye valgfrie felter
- ✅ Arkiverte prosjekter vises i egen "Arkivert"-visning og kan gjenopprettes med ett klikk

---

## Del 1 — Designsystem-komponenter (gjenbrukes på alle faner senere)

Bygg disse som gjenbrukbare komponenter, ikke engangs-løsninger:

### 1.1 KPI-kort (klikkbart)
- Tall + label + valgfri sum ("32 Pågående · 4,5M")
- Klikk = filtrerer/hopper til tilhørende status-fane
- Varsel-variant med rød/gul bakgrunn for ting som krever handling

### 1.2 Status-faner
- Horisontal fanelinje: én fane per status med teller + sum
- Aktiv fane har farget bakgrunn
- "Fullført/Arkivert"-faner er dempet (grå tekst)

### 1.3 Kompakt rad
- Én linje per element: tittel + varsel-tekst, meta-linje under (dato, ansvarlig)
- Høyre side: nøkkeltall + mini fremdrifts-bar + ⋯-meny
- Farget venstre-kant ved varsel (rød = frist over, gul = mangler noe)
- Klikk på raden = åpne detaljpanel

### 1.4 ⋯-meny (handlinger)
- Rediger / Fullfør / Arkiver / (kontekst-spesifikke)
- ALDRI synlige knapper på hver rad — alt bak ⋯

### 1.5 Detaljpanel (skyver inn fra høyre)
- Header med tittel + lukk
- Mini-faner inni panelet (innhold varierer per side)
- Handlings-knapper nederst
- Kan lukkes med Esc eller klikk utenfor

### 1.6 Varsel-banner
- Topp av siden: oppsummering av ting som krever handling
- Klikk på banner = filtrer listen til de sakene

---

## Del 2 — Prosjekt-siden (layout C)

### 2.1 Toppseksjon

```
Prosjekter                    [🔍 Søk] [+ Nytt prosjekt]

[⚠ 3 over frist]  [👷 4 uten bemanning neste uke]   ← varsel-bannere (kun hvis aktuelt)

[🔨 Pågående 32 · 4,5M] [✅ Godkjent 9 · 4,2M] [📋 Vi jobber med 7] [🏁 Fullført 20] [🗄 Arkivert]
      ↑ status-FANER (klikkbare, ikke bare KPI-kort)

Sorter: [⚠ Trenger handling først] [Frist] [Sum] [A–Å]     Visning: [Liste | Gantt]     [👤 PL-filter ▾]
```

- KPI-kortene og status-fanene slås sammen til klikkbare faner med tall + sum
- "Trenger handling først" er DEFAULT sortering
- PL-filter husker sist valgte per bruker (localStorage)
- Fullført og Arkivert vises IKKE i "Alle" — de har egne faner

### 2.2 Prosjektliste (kompakte rader)

Hver rad viser KUN:
- Prosjektnavn + varsel-tekst hvis aktuelt ("⚠ 2d over frist", "👷 ingen bemanning uke 33")
- Meta-linje: datoer · varighet · PL · neste milepæl (hvis framdriftsplan finnes)
- Høyre: 👷 X (bemannede), sum kr, mini fremdrifts-bar, KS-indikator (X/Y hvis KS-sjekklister finnes), ⋯-meny

Rader med varsler:
- Farget venstre-kant (rød/gul)
- Hurtigknapp for å LØSE problemet: "Forleng frist" (åpner dato-felt), "+ Bemann" (går til bemanningsplan med prosjektet valgt)
- Sorteres øverst når "Trenger handling først" er valgt

FJERNES fra raden (flyttes til detaljpanel):
- Årstidslinjen (2026 Apr Jul Okt 2027...) per rad
- De 4 status-knappene (Vi jobber med/Godkjent/Pågående/Fullført)
- Rediger / ✓ Fullfør / Slett-knappene

### 2.3 Detaljpanel (klikk på rad)

Skyver inn fra høyre, ca. 40% bredde. Mini-faner:

| Fane | Innhold |
|---|---|
| 📊 Framdrift | Tidslinje-bar for DETTE prosjektet (relevant tidsvindu, i-dag-strek), milepæler, AI-plan-knapp hvis ingen plan |
| 👷 Bemanning | Hvem er tildelt, hvilke uker, + Bemann-knapp → bemanningsplan |
| ✅ KS | Tildelte sjekklister med status (gjenbruk fra KS-fanen), avvik |
| 📦 Tilbudsdata | Full tilbudPayload hvis prosjektet kom fra tilbud (gjenbruk eksisterende komponent) |
| 📜 Logg | Audit-logg for prosjektet (status-endringer, hvem, når) |

Nederst i panelet: [Endre status ▾] [Rediger] [✓ Fullfør] [🗄 Arkiver]

- "Endre status" er dropdown — erstatter de 4 knappene
- "Arkiver" krever bekreftelse: "Prosjektet skjules fra listene men slettes IKKE. Gjenopprett når som helst fra Arkivert-fanen."

### 2.4 Gantt-visning (toggle)

- Viser KUN prosjektene i aktiv fane (32 pågående — ikke alle 68)
- Tidsvindu: 1 måned bak + 4 måneder frem fra i dag (IKKE 2 hele år)
- Rad-høyde stor nok til at barene er lesbare
- I-dag-strek (rød vertikal)
- Klikk på bar = samme detaljpanel
- Zoom-knapper: [3 mnd] [6 mnd] [12 mnd]

### 2.5 Arkivert-fane

- Viser prosjekter med arkivert=true
- Hver rad: navn, arkivertDato, arkivertAv + [↩ Gjenopprett]-knapp
- Gjenopprett = arkivert:false + audit-logg

### 2.6 Duplikat-hint (visning, IKKE handling)

- Når to prosjekter har nesten lik adresse (normalisert sammenligning): vis "🔗 ligner på [navn]" som liten grå tekst på raden
- INGEN merge/slett-funksjon her — kun synliggjøring. Oppryddingen skjer i sync-fase 3.
- Dedup-knappen i topbaren FJERNES fra UI (den sletter fysisk — farlig). Ikke slett koden, bare skjul knappen.

---

## Del 3 — Datamodell (kun tillegg, ingen endringer av eksisterende felter)

```js
prosjekt = {
  // ALLE eksisterende felter beholdes uendret
  
  // NYE valgfrie felter:
  arkivert: boolean,          // default false/undefined
  arkivertDato: ISO_date,
  arkivertAv: string,
  fristUtvidelser: [{ fraDato, tilDato, endretAv, endretDato }]  // historikk ved "Forleng frist"
}
```

Statusverdiene endres IKKE. Ingen migrering av eksisterende prosjekter.

---

## Del 4 — Implementasjonsrekkefølge

| Steg | Hva | Omfang |
|---|---|---|
| 1 | Designsystem-komponentene (1.1–1.6) som gjenbrukbare | Stor |
| 2 | Prosjektliste med status-faner + kompakte rader + ⋯-meny | Middels |
| 3 | Detaljpanel med 5 mini-faner | Stor |
| 4 | Varsel-bannere + "Trenger handling først"-sortering + hurtigknapper | Middels |
| 5 | Arkiver-flyt (erstatter Slett) + Arkivert-fane + Gjenopprett | Middels |
| 6 | Ny gantt-visning (fane-filtrert, relevant tidsvindu) | Middels |
| 7 | Duplikat-hint + skjul Dedup-knapp | Liten |

Del i 2-3 PR-er. Steg 1+2 først — da kan Stefan se og justere før resten bygges.

---

## Del 5 — Test-krav før hver deploy

1. Telling før/etter: 68 prosjekter før = 68 prosjekter etter (arkiverte teller med!)
2. Arkiver → prosjektet forsvinner fra Pågående, finnes i Arkivert, Gjenopprett bringer det tilbake
3. Ingen endring i fbs_prosjekter-datastruktur utover nye valgfrie felter
4. Merge-lagringen fra fase 1 fungerer fortsatt (event-opprettet befaring overlever klient-lagring)
5. Eksisterende Rediger-modal fungerer som før fra ⋯-menyen

---

## Del 6 — Senere faner (IKKE nå, kun til orientering)

Når Prosjekt-siden sitter, gjenbrukes komponentene på:
- Befaring (status-faner finnes allerede — får kompakte rader + detaljpanel)
- Service (+ ufakturert-varsel-banner)
- Reklamasjon (+ frist-varsler)
- Biler (kompakte rader + EU-varsel-banner)
- Oversikt (klikkbare KPI-er + varsel-bannere fra alle moduler)
