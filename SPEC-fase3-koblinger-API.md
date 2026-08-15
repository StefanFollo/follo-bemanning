# Fase 3: Koblinger-API — kontrakt for tilbuds-appen

Bemannings-appens reparasjonsverktøy («Reparer koblinger» på Befaring-siden,
admin) er levert. Tilbuds-appens del er liten: én knapp som sender
koblingslista, og (valgfritt, men anbefalt) en henting av løsningene.

## 1. Send koblingslista (knappetrykk i tilbuds-appen)

```
POST https://follo-bemanning.vercel.app/api/befaringer/koblinger
Authorization: Bearer <INTER_APP_TOKEN>
Content-Type: application/json

{
  "koblinger": [
    {
      "tilbudId": 123,                  // påkrevd
      "kildeBefaringId": "bf-...",      // påkrevd (null hvis mangler)
      "salgsStatus": "tilbud-sendt",    // påkrevd: kladd|tilbud-sendt|vunnet|tapt|avvist|trukket
      "kundenavn": "Kari Kunde",        // STERKT anbefalt — driver fuzzy-forslagene
      "adresse": "Regneveien 4",        // STERKT anbefalt — driver fuzzy-forslagene
      "tilbudLink": "https://.../t/x",  // valgfritt — kopieres til befaringen ved kobling
      "tilbudPayload": { ... }          // valgfritt — kopieres hvis befaringen mangler payload
    }
  ]
}
→ { "ok": true, "antall": N }
```

Ny POST ERSTATTER forrige liste (send alltid komplett liste). Stefans
avgjørelser (løsningene) overlever.

## 2. Hent løsningene (etter at Stefan har reparert)

```
GET https://follo-bemanning.vercel.app/api/befaringer/koblinger?losninger=1
Authorization: Bearer <INTER_APP_TOKEN>

→ { "losninger": {
      "123": { "nyKildeBefaringId": "bf-...", "avgjortAv": "Stefan", "dato": "..." },
      "124": { "behold": "befaring", "status": "godkjent", ... },
      "125": { "status": "tapt", ... }
   } }
```

Tilbuds-appens handling per løsning:
- `nyKildeBefaringId` finnes → oppdater tilbudets kildeBefaringId til denne
  (samme mekanisme som fallback-svaret fra event-endepunktet)
- `behold: "befaring"` + `status` → befaringens status ble beholdt; synk gjerne
  tilbudets salgsstatus mot den hvis dere ønsker
- `status` alene → befaringen ble flyttet til tilbudets status; ingenting å
  gjøre hos dere
- En tilbudId som FORSVINNER fra løsningene var angret — behandle som uavgjort

Ingen sletting noe sted; rapporten kan re-sendes når som helst.
