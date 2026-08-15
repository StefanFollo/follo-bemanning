# SPEC del 2 (trinn 1+2): Full tilbudsdata inn i prosjektet + koble-knapp + kundelenker

**Godkjent av Stefan 15.08.2026.** Mål: All tilbudsdata følger jobben hele veien — fra godkjent tilbud til prosjekt. Manuelt regnede prosjekter kan kobles til tilbud i etterkant. Direktelenker til kundesiden fra prosjektet.

**Bakgrunn fra kartlegging:** "Opprett prosjekt" tar i dag med ~13 felter (poster, fag, belop, opsjoner...) men ikke hele payloaden (fagBreakdown, totalTimer, byggInfo, soner, befaringsnotater, tilbudPdfUrl, publicToken, prosjektStandard, detaljnivaa m.fl.). Manuelt opprettede prosjekter (PL som regner utenfor tilbuds-appen — helt legitimt) har ingen kobling.

---

## 🛑 Rammer

- ALT er additivt: nye felter, nye knapper, nye lenker. INGEN sletting, INGEN endring av eksisterende felter, INGEN bulk-operasjoner, INGEN migrering av historiske data.
- Merge-lagringen (fase 1) og merge-verktøyet røres ikke.
- Trinn 3 (re-send fra tilbuds-app) og trinn 4 (KS-forslag/AI-framdrift/bemanningssammenligning) er IKKE med i denne leveransen.

---

## Trinn 1 — "Opprett prosjekt" tar med ALT

### 1.1 Full payload-kopi

Når "Opprett prosjekt" kjøres fra en godkjent befaring:

```js
prosjekt.tilbudPayload = { ...befaring.tilbudPayload }   // HELE pakken, alle ~36 felter
// De eksisterende ~13 enkeltfeltene (poster, fag, belop osv.) settes som i dag — uendret
```

Payloaden lagres som ett objekt — UI trenger ikke vise alt, men ingenting skal gå tapt. ("Data over UI-flate"-prinsippet fra SPEC-full-info-overforing.)

### 1.2 📦 Tilbudsdata-fane i prosjektets detaljpanel

Prosjekt-detaljpanelet får samme Tilbudsdata-fane som befaringene har (gjenbruk komponenten). Vises kun når prosjektet har tilbudPayload eller tilbudLink.

Innhold:
- Nøkkeltall: totalSum (inkl/eks mva), totalTimer, fagBreakdown (timer + kr per fag)
- Poster-liste (komplett, med kalkyle)
- Opsjoner (alle + hvilke som ble valgt)
- ByggInfo (byggeår, byggtype, BRA, tilstand), soner, prosjektStandard, detaljnivå
- Befaringsnotater
- **Lenke-rad (se 1.3)**

### 1.3 Lenke-rad — tre knapper (Stefans godkjente forslag)

```
[👁 Se kundesiden]  [📄 Åpne tilbud-PDF]  [🧮 Åpne i tilbuds-appen]
```

- **👁 Se kundesiden:** åpner `https://follo-befaring.vercel.app/t/<publicToken>?intern=1` i ny fane
- **📄 Åpne tilbud-PDF:** åpner tilbudPdfUrl i ny fane
- **🧮 Åpne i tilbuds-appen:** åpner tilbudet i tilbuds-appens interne visning (tilbudLink / tilbuds-app-URL med tilbudId)
- Knapper vises kun når tilhørende data finnes (graceful når payload er delvis)

### 1.4 ⚠ KRITISK FØLGE-FIX I TILBUDS-APPEN: intern-flagg mot sporings-forurensing

Kundesiden (/t/token) sporer i dag alle besøk → "Åpnet tilbudet Nx" og kunde-aktivitet-feeden. Interne besøk fra bemannings-appen VILLE forurense statistikken (ser ut som kunden har åpnet 14x når det var PL).

Fix i tilbuds-appens public-side:
1. Hvis URL har `?intern=1`: IKKE registrer visning/aktivitet. Vis diskret banner øverst: "Intern visning — vises ikke i kunde-statistikk"
2. I TILLEGG (belt & braces): hvis den som åpner har gyldig fb_token i localStorage (innlogget ansatt i samme nettleser) → skip sporing uansett, også uten intern-flagg
3. Audit-logg gjerne interne visninger separat ("intern-visning av PL") — men ALDRI inn i kunde-telleren

---

## Trinn 2 — "🔗 Koble til tilbud"-knapp

For manuelt opprettede prosjekter (uten tilbuds-kobling).

### 2.1 Inngang

⋯-menyen + Tilbudsdata-fanens tomtilstand ("Dette prosjektet har ingen tilbudsdata — 🔗 Koble til tilbud") på prosjekter UTEN tilbudPayload/tilbudLink.

### 2.2 Koble-dialog

```
┌────────────────────────────────────────────────┐
│ Koble prosjekt til tilbud                       │
│                                                 │
│ 🔍 [Søk på adresse eller kundenavn...]         │
│                                                 │
│ Forslag (fuzzy — samme motor som merge):        │
│ ┌─────────────────────────────────────────┐    │
│ │ Bagerens vei 11 — 44 300 kr · 6 poster  │    │
│ │ Befaring: godkjent · tilbud sendt 12.05 │    │
│ └─────────────────────────────────────────┘    │
│ (viser befaringer som HAR tilbudPayload)        │
│                                                 │
│ Forhåndsvisning ved valg:                       │
│ + totalSum, poster, fag, timer kopieres inn     │
│ ✓ Bemanning, datoer, status røres IKKE          │
│                                                 │
│         [Avbryt]   [🔗 Koble til]              │
└────────────────────────────────────────────────┘
```

### 2.3 Regler (samme som merge gruppe A/B)

- Kobling KOPIERER tilbudsdata (gruppe A) inn på prosjektet: tilbudPayload + de 13 enkeltfeltene
- Hvis prosjektet har manuelle verdier i tilbudsfelter (f.eks. manuelt anslått belop): tilbudet vinner som default, forhåndsvisningen viser erstatningen med "behold manuell"-avkryssing per felt
- Driftsdata (gruppe B: bemanning, datoer, status, farge, PL, KS, framdrift) røres ALDRI
- Kobling logges: `prosjekt.tilbudKobletDato/, tilbudKobletAv` + audit-logg
- **"Fjern kobling"-mulighet:** i ⋯-menyen etter kobling — nullstiller KUN de kopierte tilbudsfeltene (verdiene før kobling lagres i `fbs_koble_historikk` slik at fjerning gjenoppretter eksakt). Aldri sletting av annen data.

### 2.4 Kilde for søket

Koble-dialogen søker i bemannings-appens egne befaringer (fbs_befaringer) som har tilbudPayload — IKKE direkte i tilbuds-appen. (Befaringer uten payload dukker opp når trinn 3 er levert.)

---

## Datamodell (kun tillegg)

```js
prosjekt: {
  tilbudPayload: {...} | null,        // full pakke
  tilbudKobletDato: ISO | null,       // ved manuell kobling
  tilbudKobletAv: string | null,
  tilbudsfelterFørKobling: {...} | null  // for "Fjern kobling"-gjenoppretting
}

// Ny nøkkel:
fbs_koble_historikk: [{ dato, av, prosjektId, befaringId, felterFør }]
```

---

## Test-krav før deploy

1. Opprett prosjekt fra godkjent befaring med payload → prosjektet har ALLE payload-felter + de 13 enkeltfeltene
2. Tilbudsdata-fanen viser nøkkeltall, poster, lenke-rad
3. De tre lenkene åpner riktig side (kundeside med ?intern=1, PDF, tilbuds-app)
4. **Sporings-testen:** åpne kundesiden med ?intern=1 → "Åpnet tilbudet"-telleren i tilbuds-appen øker IKKE, kunde-aktivitet-feeden får INGEN ny rad
5. Koble manuelt prosjekt til befaring → tilbudsdata inn, bemanning/datoer/status uendret (JSON-diff på gruppe B = tom)
6. "Fjern kobling" → prosjektet tilbake til eksakt før-tilstand (JSON-diff = tom)
7. Telling før/etter alle tester: identisk antall prosjekter og befaringer
