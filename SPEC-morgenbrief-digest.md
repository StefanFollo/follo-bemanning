# SPEC: Morgenbrief — oppgradert daglig digest (e-post + push)

**Godkjent av Stefan 25.08.2026.** Dagens digest sier bare «Du har N oppfølginger». Den skal bli en komplett morgenbrief per PL: alt de trenger for å starte dagen, rett i innboksen — uten å måtte åpne appen.

---

## 🛑 Rammer

- Kun innhold/utforming av digest-e-posten og push-teksten — ingen endring i kø-logikk, datamodell eller sendetidspunkt (07:30-cronen står)
- Alle eksisterende vern beholdes uendret: maks 1 digest/person/dag på tvers av kanaler, kun egne saker per PL, borteTil-flagg, digestKanal-valg, admin-kopier via OPPFOLGING_ADMIN_EPOST
- Ingen nye varsler eller sendinger — samme triggere, bedre innhold

## 1. E-postens struktur (per PL, i denne rekkefølgen)

### Emne
`Morgenbrief 26.08: 3 å ringe (2 forfalt) · 1 befaring i dag`
— tallene tilpasses; delene utelates når de er 0.

### A. Varme signaler — kundeaktivitet siste døgn (øverst!)
Kun PL-ens egne tilbud, kun hvis aktivitet finnes:
```
🔥 VARME NÅ
Samuel Vigdal — Nybrottveien 38 · åpnet tilbudet 3x i går kveld
tlf 982 19 448
```
Dette er de viktigste å ringe — kunden sitter og leser tilbudet.

### B. Ring i dag — full liste
Hele PL-ens kø, mest forfalt øverst, maks 8 rader + «… og N til — åpne appen»:
```
RING I DAG (5 · 3 forfalt)
1. Kåre Elvesæther — Svaleveien 13C, Siggerud
   Planlagt befaring · 96 d forfalt · 986 78 096
   «Marius har vart på befaring»
2. …
```
- Telefonnummer som klikkbar `tel:`-lenke (mobil er hovedflaten)
- Siste notat/kundeaktivitet i kursiv, maks én linje
- Hver rad lenker til kortet i appen (dyplenke)

### C. Dagens avtaler + frister
```
I DAG
• Befaring kl. 11:00 — Arja Hakala, Gydas vei 59 (kun hvis PL-en er ansvarlig)
• Tilbudsfrist løper ut: [kunde] (3 dager igjen)
```
Utelates helt hvis tom.

### D. Ukens tall (fot)
```
Din uke så langt: 4 håndtert · 2 forfalt igjen · 1 utsatt
```
Samme tall som «Oppfølging denne uka»-panelet, filtrert på PL-en.

### Design
- Enkel, mobil-først HTML: marine `#0f2942` topplinje med «Follo Byggservice · Morgenbrief», oransje `#f59e0b` aksenter, lys bakgrunn — matcher appene
- Ren tekst-fallback for e-postklienter uten HTML
- Knapp nederst: «Åpne Ring i dag-listen» → appens Oversikt

## 2. Push-teksten (samme innhold, komprimert)

- Tittel: `Morgenbrief: 3 å ringe (2 forfalt)`
- Tekst: de to øverste sakene med navn: `Kåre Elvesæther (96 d), Line Næss (64 d) …` — pluss `🔥 Samuel leser tilbudet ditt` hvis varmt signal finnes
- Klikk åpner Oversikt/Ring i dag (som i dag)
- Samme tag-strategi som nå (ny digest erstatter gammel)

## 3. Admin-variantene

- Stefans/Katerynas admin-kopi (eskaleringer + ukesdigest): uendret logikk, men samme nye utforming
- Ukesdigesten (mandag) får per-PL-tabellen i samme drakt: `Joachim: 12 håndtert · 2 forfalt · 3 utsatt`

## 4. Test-krav

1. PL med tom kø og ingen aktivitet/avtaler → INGEN e-post (som i dag)
2. Seksjon A/C utelates når tomme — aldri tomme overskrifter
3. tel:-lenker fungerer på mobil; dyplenker åpner riktig kort
4. Maks 8 rader i B, resten som «og N til»
5. Tørrkjøringen (Forhåndsvis digest) viser de nye seksjonene per mottaker
6. Dedup uendret: fortsatt maks 1/dag på tvers av kanaler
7. Ukens tall stemmer med Oppfølging denne uka-panelet
