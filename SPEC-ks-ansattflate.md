# SPEC: KS ut til ansatte — mobil sjekkliste-flate med SMS-tilgang

**Godkjent av Stefan 25.08.2026.** KS/HMS-systemet i bemanningsappen er bygget (fase-gruppering, sjekklistegrupper, KS-forslag fra fag) — men bare PL/admin kan bruke det. Nå skal de som står på byggeplassen fylle ut sjekklistene selv, på mobilen.

Stefans krav, ordrett tolket:
1. Enklest mulig innlogging basert på info vi allerede har på ansatte — men sikkert
2. Føre sjekklister på mobilen med bilder m.m. + kunne se de viktigste HMS-rutinene
3. Utfylte lister lagres på prosjektet

---

## 🛑 Rammer

- Ingen endring i eksisterende KS-fane-logikk for PL/admin — ansattflaten er et tillegg
- Ingen sletting: utfylte/signerte lister er låst; senere endringer logges som ny versjon
- Ansattflaten viser KUN KS-data for ansattens egne prosjekter — aldri kunder, priser, tilbud, økonomi, andre ansatte
- Bilder lagres i Vercel Blob (finnes allerede i prosjektet)

## 1. Tilgang: personlig magic-lenke på SMS

- Hver ansatt får én personlig, varig lenke: `/ks/<token>` (lang tilfeldig token, samme mønster som kundesidens publicToken)
- Sendes på SMS til telefonnummeret på ansattkortet — «Lagre denne meldingen, lenken er din faste inngang»
- PL/admin-knapp på Ansatte-siden: «Send KS-lenke» (én ansatt) + status-kolonne (sendt/åpnet/aldri sendt)
- Sikkerhet:
  - Token kan regenereres per ansatt (gammel lenke dør) — knapp «Ny lenke»
  - Arkivert ansatt → lenken deaktiveres automatisk
  - Rate-limit på endepunktet; ingen opplisting av tokens
  - Første åpning: ansatt bekrefter med å taste de 4 siste sifrene i eget telefonnummer (lett for dem, stopper videresendte lenker)
- SMS: gjenbruk Twilio-oppsettet fra tilbuds-appen (samme konto; legg TWILIO_* env-varer i bemanning-prosjektet, eller send via inter-app-endepunkt — velg det som er enklest/robust)
- NB datakvalitet: flere ansatte mangler telefonnummer i dag — flaten må vise «mangler telefon» tydelig på Ansatte-siden så Stefan kan fylle inn

## 2. Ansattflaten (mobil-først, /ks/<token>)

### Hjem
- «Hei [fornavn]» + liste over ansattens AKTIVE prosjekter (fra bemanningsplanen/tildelinger)
- Per prosjekt: tildelte sjekklister med status (ikke startet / påbegynt / ferdig)
- Egen fane/seksjon: «HMS-rutiner» (se §4)

### Utfylling av sjekkliste
- Punktliste, ett trykk for å kvittere ✓ per punkt
- Per punkt: valgfritt kommentarfelt + kamera/galleri for bilder (flere bilder per punkt)
- «Ikke aktuelt»-valg per punkt (med kort begrunnelse)
- Autolagring underveis (nett kan være dårlig på byggeplass — lagre per handling, tåle refresh)
- Ferdig: «Signer og lever» → navn (forhåndsutfylt fra ansattkortet) + dato/tid låses inn
- Etter signering: listen er skrivebeskyttet for den ansatte

### Design
- Samme marine/oransje-designsystem, store touchflater, fungerer i solskinn (god kontrast)
- Ingen nav til resten av appen — flaten er lukket

## 3. Lagring og PL-innsyn

- Utfylt liste lagres PÅ PROSJEKTET: hvem, når, punkter, kommentarer, bilder, signatur
- KS/HMS-fanen (PL/admin) viser status per liste: hvem den er tildelt, fremdrift (7/12 punkter), signert-dato
- Prosjektsidens KS-minifane viser samme status
- Tildeling: PL tildeler sjekkliste → velger ansvarlig ansatt (fra prosjektets bemanning) → ansatt ser den i sin flate
- Historikk-nøkkel `fbs_ks_utfylling_historikk` — aldri auto-slettet

## 4. HMS-rutiner for ansatte

- Rutiner-fanen (199 Holte-elementer) får et flagg per rutine: «Vis for ansatte»
- Admin/PL huker av de viktigste (SJA, stillas, varmt arbeid, personlig verneutstyr osv.)
- Ansattflaten viser disse som enkel lesevisning, gruppert etter kategori, med søk
- Kun lesing — ingen redigering fra ansattflaten

## 5. Test-krav

1. Token gir KUN tilgang til egen KS-flate — direkte-URL til andre data avvises
2. Regenerert token: gammel lenke gir «lenken er utløpt, kontakt din prosjektleder»
3. 4-sifret verifisering: feil siffer 5x → lenken sperres til PL sender ny
4. Utfylling overlever refresh/mistet nett (autolagring per handling)
5. Signert liste kan ikke endres fra ansattflaten; PL ser komplett innhold med bilder
6. Ansatt ser kun prosjekter der hen er tildelt i bemanningsplanen
7. Bilder: opplasting fra kamera fungerer på iPhone og Android; store bilder komprimeres klient-side
8. Ingen eksisterende KS-funksjoner endres for PL/admin

## 6. Utrulling (forslag: 3 PR-er)

1. **PR1:** Token-modell + ansattflate med utfylling (uten bilder) + lagring på prosjekt + tildeling i KS-fanen
2. **PR2:** Bilder + signering + autolagring/offline-robusthet + SMS-utsending med Twilio
3. **PR3:** HMS-rutiner («Vis for ansatte»-flagg + lesevisning) + status-kolonner på Ansatte-siden

Senere påbygg (ikke nå): avviksmelding med varsel til PL, PDF-rapport av signert liste, PL-godkjenningsflyt.
