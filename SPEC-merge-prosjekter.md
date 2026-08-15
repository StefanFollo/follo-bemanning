# SPEC: Slå sammen duplikat-prosjekter — uten mulighet for datatap

**Godkjent retning fra Stefan 15.08.2026.** Bakgrunn: duplikater oppstår naturlig — PL regner manuelt og oppretter prosjekt, senere kommer samme jobb inn via "Opprett prosjekt" fra godkjent befaring. I tillegg skrives adresser av og til feil, så matching kan ikke stole på adresse alene.

**Absolutt krav fra Stefan: "Kan vi ikke garantere at ikke ting forsvinner så gjør vi ikke noe."**

---

## 🔒 Sikkerhets-design — sletting er UMULIG i denne funksjonen

Merge-operasjonen inneholder INGEN slette-kode. Den gjør nøyaktig to ting:

1. **KOPIERER TIL hovedprosjektet** etter felt-reglene under.
2. **ARKIVERER sekundærprosjektet** — tombstone med all data 100 % intakt: `arkivert: true, mergetInn: {hovedId, dato, av}`. Vises i Arkivert-fanen som "🔗 Slått sammen med [hovedprosjekt]".

### Felt-regler — TILBUDSDATA VINNER ALLTID (Stefans krav 15.08)

Feltene deles i to grupper med ulik prioritet:

**Gruppe A — Tilbudsfelter (fra tilbuds-appen):**
`poster, fag, pristype, belop, estimertSum, valgteOpsjoner, tilbudLink, kildeBefaringId, befaringId, tilbudPayload, oppstartTekst, varighetTekst, varighetUker`

Regel: Hvis ETT av de to prosjektene har tilbuds-kobling, følger HELE gruppe A med til det sammenslåtte prosjektet — **også når hovedprosjektet har manuelt utfylte verdier i disse feltene**. Tilbudets kalkyle skal aldri tapes til fordel for grove manuelle anslag.
- Manuelle verdier som erstattes vises eksplisitt i forhåndsvisningen ("belop: 44 000 manuell → 44 300 fra tilbud") og lagres i merge-loggen (gjenopprettes ved angre)
- Per felt kan Stefan krysse av "behold manuell" hvis den manuelle faktisk er riktig — default er at tilbudet vinner
- Hvis BEGGE prosjektene har tilbuds-kobling (sjeldent): Stefan velger i forhåndsvisningen hvilket tilbud som er det riktige

**Gruppe B — Drifts-/bemanningsfelter:**
`bemanning/tildelinger, startDato, sluttDato, status, farge, prosjektlederId, beskrivelse, KS-sjekklister, framdriftsplan`

Regel: Hovedprosjektets verdier beholdes; tomme felter fylles fra sekundær. (Her er det manuelle arbeidet i bemannings-appen fasiten — typisk er hovedprosjektet det PL har bemannet og styrt.)

**Angre:** Én knapp på det arkiverte prosjektet OG i audit-loggen: "Angre sammenslåing" → sekundær gjenopprettes nøyaktig som før, felter som ble kopiert til hovedprosjektet fjernes IGJEN kun hvis de fortsatt har verdien fra kopieringen (manuelt endrede felter etterpå røres ikke).

**Backup:** Før HVER merge lagres begge prosjektenes komplette JSON i en merge-logg (`fbs_merge_historikk`) — så selv om angre-logikken skulle feile, ligger originalene der ordrett.

**Én om gangen:** Ingen bulk-merge. Hver sammenslåing er et bevisst valg med forhåndsvisning.

---

## Flyt

### 1. Inngang — to veier

**A. Fra duplikat-hintet:** Rader med "🔗 ligner på X" får valget "Slå sammen…" i ⋯-menyen.

**B. Manuelt valg (viktig pga. feilskrevne adresser):** "Velg to prosjekter"-modus: klikk ⋯ → "Slå sammen med…" → søkefelt der Stefan velger HVILKET SOM HELST annet prosjekt. Systemets forslag er hjelp, aldri begrensning.

### 2. Forslags-motor (fuzzy)

Foreslå kandidater basert på (vektes sammen):
- Normalisert adresse (lowercase, fjern tegnsetting/mellomrom, "vei/veien/vn" likestilles)
- Levenshtein-avstand ≤ 3 på gatenavn (fanger skrivefeil)
- Husnummer må matche eksakt (11 ≠ 13!)
- Samme kundenavn (normalisert) teller sterkt
- Postnummer-avvik hindrer IKKE forslag (mangler ofte)

Forslag vises kun som hint — aldri auto-handling.

### 3. Forhåndsvisning (side-om-side)

```
┌──────────────────────────────────────────────────────┐
│ Slå sammen prosjekter                                 │
├───────────────────────┬──────────────────────────────┤
│ ⭐ HOVEDPROSJEKT       │ 📦 SLÅS INN (arkiveres)      │
│ [Bagerens vei 11    ▾]│ Bagerens Vei 11, 1542 Vestby │
│ (bytt hvilken som er   │                              │
│  hoved med ett klikk)  │                              │
├───────────────────────┴──────────────────────────────┤
│ Adresse: (⦿) Bagerens vei 11  ( ) Bagerens Vei 11,   │
│           1542 Vestby   ← Stefan velger riktig        │
├──────────────────────────────────────────────────────┤
│ 📦 TILBUDSDATA (følger ALLTID med fra tilbudet):      │
│  + poster: 6 stk · fag: tømrer, pl · opsjoner        │
│  + belop: 44 000 (manuell) → 44 300 (fra tilbud)     │
│    [ ] behold manuell verdi i stedet                  │
│  + tilbudLink, kildeBefaringId, tilbudPayload         │
│ 👷 DRIFTSDATA (hovedprosjektet beholder sitt):        │
│  ✓ bemanning (2 mann), startdato, status, farge      │
│ Ingenting slettes. [Sekundær arkiveres — kan angres]  │
├──────────────────────────────────────────────────────┤
│              [Avbryt]   [🔗 Slå sammen]              │
└──────────────────────────────────────────────────────┘
```

### 4. Etter merge

- Hovedprosjektet får `mergetFra: [{id, dato, av}]`
- Bemanningstildelinger, KS-sjekklister og framdriftsplan som peker på sekundær-ID-en RE-PEKES til hoved-ID (peker-oppdatering, ikke flytting av data — og gamle peker-verdier lagres i merge-loggen for angre)
- Audit-logg: "Slo sammen X inn i Y — N felter kopiert, adresse satt til Z"
- Toast med angre-lenke i 30 sekunder + permanent angre i Arkivert-fanen

### 5. Angre-garantien (test-krav)

Angre skal gjenopprette EKSAKT tilstand før merge:
1. Sekundær: arkivert → aktiv, alle felter urørt
2. Hovedprosjekt: kopierte felter tilbakestilles (kun hvis uendret siden)
3. Pekere (tildelinger/KS/framdrift): tilbake til sekundær-ID
4. Verifiseres med automatisk test: JSON-diff før merge vs. etter angre = tom

---

## Datamodell (kun tillegg)

```js
prosjekt: {
  // NYE valgfrie felter
  mergetInn: { hovedId, dato, av } | null,      // på arkivert sekundær
  mergetFra: [{ id, dato, av, kopierteFelter: [] }],  // på hoved
}

// Ny lagringsnøkkel:
fbs_merge_historikk: [{
  dato, av,
  hovedFør: {...komplett JSON...},
  sekundærFør: {...komplett JSON...},
  pekereFør: { tildelinger: [], ks: [], framdrift: [] },
  valgtAdresse: string
}]
```

Merge-historikken skal ALDRI tømmes automatisk.

---

## Test-krav før deploy (alle må passere)

1. Merge to test-prosjekter → begge teller fortsatt i totalen (aktiv + arkivert)
2. Sekundærens JSON i arkivet === original (diff = tom)
3. Angre → JSON-diff mot før-tilstand = tom for BEGGE
4. **Tilbudsdata-garantien: etter merge har det sammenslåtte prosjektet ALLE gruppe A-felter fra tilbudet (poster, fag, belop, payload, lenke) — uansett hvilket prosjekt som var hoved og hva som sto der fra før**
5. Gruppe B: hovedprosjektets bemanning/status/datoer uendret
6. Tildelinger/KS peker riktig etter merge OG etter angre
7. Merge-historikk-innslag komplett (inkl. overskrevne manuelle verdier)
8. Telling før/etter hele testsyklusen: identisk

## Avgrensning

- Gjelder PROSJEKTER først. Befaringer kan få samme mønster senere (fase 3).
- Ingen auto-merge, ingen bulk, ingen opprydding av eksisterende duplikater i denne leveransen — Stefan gjør hver merge manuelt når verktøyet er verifisert.
