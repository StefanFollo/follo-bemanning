# SPEC 4a + 4c: KS-sjekkliste-forslag fra fag + kalkyletimer mot bemanning

**Godkjent av Stefan 15.08.2026.** Siste del av del 2-planen. Utnytter at prosjekter nå har full tilbudspayload (fag, fagBreakdown, poster).

---

## 🛑 Rammer

- Alt er additivt og FORSLAG — ingen auto-tildeling som endrer data uten klikk, ingen sletting, ingen bulk.
- KS-forslag oppretter ALDRI sjekklister selv — de vises som forslag PL godkjenner med ett klikk.
- Timeanslag er ren VISNING (lesing av eksisterende data) — endrer ingenting.
- Eksisterende KS-tildelinger og bemanningstildelinger røres aldri.

---

## 4a — KS-sjekkliste-forslag fra tilbudets fag

### Hvor

To steder (samme logikk, gjenbrukbar komponent):

1. **Prosjektets detaljpanel → ✅ KS-fanen:** når prosjektet har tilbudPayload med fag, og det finnes maler for disse fagene som IKKE er tildelt
2. **KS/HMS-sidens prosjektvisning** (venstre kolonne "Tildelte"): samme forslag øverst

### Logikk

```
prosjektets fag (fra tilbudPayload.fag + fagBreakdown) 
  → match mot mal-bibliotekets fag/kategori-tagger
  → foreslå maler som matcher og IKKE allerede er tildelt
```

Mapping (gjenbruk kategori/fag-taggene fra KS-systemet):
- fag inneholder 'tomrer' → tomrer-maler (kategori-avhengig: se poster)
- fag inneholder 'ror' → rør-malene (VVS, sanitær, varmtvann)
- fag inneholder 'el' → el-malene
- fag inneholder 'flis'/'membran' eller poster nevner bad/våtrom → bad-malene
- poster nevner fasade/kledning/vindu → yttervegg-malene
- poster nevner tak → tak-malene
- ALLTID: HMS-pakken (HMS daglig, SHA, risikovurdering) hvis ikke tildelt

Post-tekst-matching er enkel nøkkelord-sjekk (bad|våtrom|membran|fasade|kledning|tak|vindu) på post-navnene — ikke AI i denne runden.

### UI

```
✅ KS-fanen (prosjekt med payload, ingen/få sjekklister):

💡 Forslag basert på tilbudet (tømrer · rive · 2 poster om grunnmur):
┌─────────────────────────────────────────────┐
│ ☑ HMS daglig sjekkliste       (obligatorisk)│
│ ☑ Risikovurdering oppstart    (obligatorisk)│
│ ☑ SHA-plan                    (obligatorisk)│
│ ☐ Riving innvendig            (fag: rive)   │
│ ☐ Bærekonstruksjoner          (post-match)  │
│ [✓ Tildel valgte (3)]    [Skjul forslag]    │
└─────────────────────────────────────────────┘
```

- Obligatoriske forhåndsvalgt, resten av forslagene ikke
- "Tildel valgte" = samme operasjon som manuell tildeling i KS-systemet (samme datamodell, tildeltAv: 'forslag:fag-match')
- "Skjul forslag" huskes per prosjekt (localStorage) — ikke masete
- Allerede tildelte maler vises aldri i forslag

---

## 4c — Kalkyletimer mot faktisk bemanning

### Hvor

**Prosjektets detaljpanel → 👷 Bemanning-fanen**, øverst, når prosjektet har fagBreakdown.

### Visning

```
📊 Kalkyle vs. bemannet
┌──────────────────────────────────────────────┐
│ Tømrer   ████████████░░░░  180 / 238 t  76%  │
│ Rive     ██████████████████  225 / 225 t ✓   │
│ PL       ████░░░░░░░░░░░░   16 / 50 t   32%  │
├──────────────────────────────────────────────┤
│ Totalt bemannet: 421 av 513 kalkyletimer     │
│ ⚠ Tømrer mangler ~58 t (≈1,5 ukesverk)       │
└──────────────────────────────────────────────┘
```

### Beregning

- **Kalkyletimer per fag:** tilbudPayload.fagBreakdown[fag].timer
- **Bemannede timer per fag:** summer tildelinger for prosjektet: antall dager × 7,5 t per person, gruppert på personens fag (fra ansatt-registeret). Innleie teller med.
- Fag i kalkylen uten bemanning: vis rad med 0 t og ⚠
- Bemanning på fag som ikke er i kalkylen: vis som egen rad "utenfor kalkyle" (informativt, ikke rødt)
- Prosjekter uten fagBreakdown: seksjonen vises ikke (ingen tom boks)

### Varsel-integrasjon (lett versjon)

Hvis prosjektet er Pågående og et fag ligger under 50 % bemannet med under 2 uker til sluttdato: legg til i prosjektlistens varsel-logikk ("👷 underbemannet mot kalkyle") — samme mønster som eksisterende varsler. IKKE nytt banner, gjenbruk rad-varselet.

---

## Datamodell

4a: ingen nye felter (bruker eksisterende ksSjekklister med tildeltAv: 'forslag:fag-match')
4c: ingen nye felter i det hele tatt (ren avledning ved visning)

---

## Test-krav

1. 4a: Prosjekt med fag tomrer+rive → forslag viser HMS-pakke + rive/tomrer-maler, IKKE bad/el-maler
2. 4a: Tildel valgte → sjekklistene ligger i prosjektets KS-liste, identisk med manuell tildeling
3. 4a: Allerede tildelte maler foreslås aldri på nytt
4. 4a: "Skjul forslag" holder seg etter reload
5. 4c: Timer-summering stemmer mot tildelinger (regn ut manuelt for ett testprosjekt)
6. 4c: Prosjekt uten fagBreakdown → ingen seksjon
7. Ingen endring i eksisterende KS-tildelinger eller bemanningsdata (telling før/etter)
