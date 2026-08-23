# SPEC: Oppfølgings-modul — "Ring i dag" per PL med varsler og eskalering

**Godkjent retning fra Stefan 24.08.2026.** Bakgrunn: 8 kunder med 62–87 dager forfalt oppfølging ble funnet i analysen — varme leads som råtner. Stefans kjernebehov: **PL-ene skal eie oppfølgingen selv** — systemet skal purre dem direkte, ikke gå via Stefan. Stefan skal bare se at det skjer.

---

## 🛑 Rammer

- Modulen LESER eksisterende data (neste kontakt-datoer, tilbudsfrister, ansvarlig) — den endrer aldri status eller datoer selv. Alle handlinger er PL-ens klikk.
- Ingen sletting. "Utsett"-handlinger logges.
- Bygges i bemanningsplanleggeren (der Befaring-dataene bor). Push-infrastrukturen fra push-SPECen gjenbrukes når den er live; e-post (Resend) er fallback fra dag én.

---

## 1. Datagrunnlag — hva som teller som "oppfølging"

Én samlet kø bygget fra:

| Kilde | Regel |
|---|---|
| Befaring/tilbud med "Neste kontakt"-dato | Forfalt når dato < i dag |
| Tilbud sendt med tilbudsfrist | Varsel 3 dager FØR frist ("frist løper ut — ring kunden"), forfalt etter |
| Tilbud sendt UTEN neste kontakt-dato | Etter 7 dager uten kundeaktivitet: "trenger oppfølgingsdato" |
| Leads uten aktivitet | Etter 5 dager: "følg opp lead" |

Ansvarlig = kortets "Ansvarlig tilbud/befaring". Mangler ansvarlig → havner hos admin (Stefan) med merkelapp "mangler ansvarlig".

## 2. "Ring i dag"-listen (hjertet)

### Plassering
- **Oversikt-siden:** eksisterende "Oppfølging — neste kontakt"-seksjon oppgraderes til dette
- Filtrert på INNLOGGET bruker som standard: Joachim ser sine, Lars sine. Admin ser alle + kan filtrere per PL

### Visning per rad
```
[Kunde] · [adresse] · [telefon — klikkbar tel:-lenke]
[Status-badge] · [X dager forfalt / frist om Y dager]
[💬 siste notat/kundeaktivitet — én linje]
Knapper: [✓ Ringt] [📅 Ny dato] [Åpne kort]
```

- Sortert: mest forfalt øverst
- **[✓ Ringt]:** åpner mini-dialog: "Utfall?" → fritekst-notat + ny neste kontakt-dato (foreslår +7 dager) ELLER "ingen ny oppfølging" (bevisst valg). Logges: hvem, når, notat.
- **[📅 Ny dato]:** bare flytte datoen — logges også (så utsettelser er synlige)
- Mobilvennlig: listen er det PL åpner på telefonen om morgenen

## 3. Varsler (gjenbruk push-infra + Resend)

| Varsel | Til | Når |
|---|---|---|
| Daglig digest: "Du har N oppfølginger i dag (M forfalt)" | Hver PL med ikke-tom liste | Hverdager 07:30 — push hvis abonnert, ellers e-post |
| Frist-varsel: "Tilbudsfrist [kunde] løper ut om 3 dager" | Ansvarlig PL | Én gang, 3 dager før |
| Eskalering: sak >7 dager forfalt | PL + Stefan (admin) | Én gang ved passering + i Stefans ukesdigest |
| Ukesdigest til admin: oversikt per PL (antall håndtert / forfalt / utsatt) | Stefan | Mandag 07:00 |

- ALDRI mer enn én digest per dag per person (ingen pling-bombardement)
- Ferie/fravær: enkel "borte til [dato]"-flagg per bruker → sakene vises hos admin i mellomtiden

## 4. Admin-innsyn (Stefans kontrollpanel)

Liten seksjon på Oversikt (kun admin):
```
Oppfølging denne uka:
Joachim: 12 håndtert · 2 forfalt · 3 utsatt
Lars:     4 håndtert · 0 forfalt · 1 utsatt
Kenneth:  6 håndtert · 5 forfalt ⚠
```
Klikk på navn → PL-ens liste. Dette er "at PL gjør jobben"-innsynet — uten at Stefan må mase.

## 5. Datamodell (kun tillegg)

```js
befaring/tilbud: {
  oppfolgingsLogg: [{ dato, av, handling: 'ringt'|'utsatt'|'ny-dato', notat, nyDato }]
}
bruker: { borteTil: dato|null, digestKanal: 'push'|'epost'|'begge' }
```

## 6. Test-krav

1. PL ser KUN egne saker som standard; admin ser alle
2. ✓ Ringt-flyt: notat + ny dato lagres i logg, saken forsvinner fra listen til ny dato
3. Digest sendes maks 1x/dag, kun til de med saker
4. Eskalering ved >7 dager treffer PL + admin én gang
5. Ingen data endres uten PL-klikk; telling av befaringer/tilbud uendret
6. tel:-lenker fungerer på mobil

## 7. Utrulling

1. Kø-logikk + Ring i dag-listen på Oversikt (verdi fra dag én, uten varsler)
2. Digest via e-post (Resend finnes)
3. Push-kobling når push-SPECen er live
4. Admin-ukesdigest + borte-flagg

Kan leveres i 2 PR-er (1–2 først).
