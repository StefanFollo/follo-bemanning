# SPEC: Design v2 — "Marine dyp" + ren tekst-navigasjon (C/F-sporet)

**Godkjent av Stefan 15.08.2026.** Endelig design-retning: mørk marineblå topp-bar med REN TEKST-navigasjon på én linje (ingen ikoner i nav), oransje aksent, lyst innhold. Kombineres med PR2 av emoji-fjerningen (resten av fanene) i samme leveranse.

---

## 🛑 Rammer

- KUN visuelt (tokens + nav-markup + emoji→ikon-utskifting). Ingen endring i data/logikk/API.
- Lucide-ikonene BEHOLDES i innholdet (varsler, statuser, ⋯-menyer, handlinger) — det er NAVIGASJONEN som blir ren tekst.
- All funksjonalitet uendret.

---

## 1. Topp-bar (hovedendringen)

### Utseende

```
┌────────────────────────────────────────────────────────────────────┐
│ [FBS] Oversikt Befaring Prosjekter Service Reklamasjon Ansatte     │
│       Bemanningsplan Rørlegger Framdrift KS/HMS Biler Rutiner      │  ← ALT på ÉN linje
│       Brukere                    Stefan · Alt lagret · [Lagre] Ut  │
└────────────────────────────────────────────────────────────────────┘
```

- Bakgrunn: `#0f2942` (dyp marine)
- Én rad, hele bredden. 13 nav-punkter som REN TEKST — ingen ikoner, ingen emoji
- FBS-logo: oransje boks `#f59e0b` med marine tekst, radius 5px
- Nav-tekst: 13px. Inaktiv: `#94a9bd`. Hover: `#cdd9e4`. Aktiv: `#ffffff` + 600-vekt + 2px oransje understrek (`#f59e0b`)
- Navnene kortes ved behov for én-linje-plass: "Bemanningsplan" → "Bemanning", "KS / HMS" → "KS/HMS"
- Høyre side: brukernavn (`#94a9bd`), "Alt lagret" (`#7d94a9`, liten), "Lagre nå"-knapp = fylt oransje `#f59e0b` med marine tekst (eneste fylte element i baren), "Logg ut" som tekst
- Admin-badge: diskret outline (1px `#f59e0b`-kant, oransje tekst, transparent bakgrunn) — ikke fylt gul
- Under baren: ingen skygge, bare rett kant mot innholdet
- Smal skjerm (<1200px): nav-punktene kollapser til horisontal scroll ELLER "Mer ▾"-dropdown for de siste — IKKE to rader

### Versjonsstempel
Flyttes til diskret plassering (f.eks. tooltip på FBS-logoen eller nederst i footer) — ikke synlig i baren.

## 2. Fargetokens (endringer fra dagens)

```css
:root {
  --bg-header: #0f2942;          /* NY: mørk marine (var hvit) */
  --header-text: #94a9bd;
  --header-text-active: #ffffff;
  --header-accent: #f59e0b;      /* oransje: logo, aktiv-strek, Lagre-knapp */

  --accent: #0f2942;             /* primær-aksent: marine dyp (var #1e40af) */
  --accent-hover: #1a3a5c;
  --accent-subtle: #e8eef4;      /* aktiv fane-bg i innhold, valgt rad */

  /* UENDRET: bg-app #fafbfc, bg-surface hvit, tekstfarger,
     semantiske (danger/warning/success), kanter, radius, skygger */
}
```

- Alle knapper/faner/lenker i INNHOLDET som i dag bruker blå `#1e40af` → bytter til marine `#0f2942` via tokenet
- Fremdrifts-barer og info-elementer: marine i stedet for blå
- Oransje brukes SPARSOMT i innholdet: kun der det er FBS-aksent (ikke som ny varselfarge — gul/rød semantikk uendret)

## 3. PR2 av emoji-fjerningen (samme leveranse)

Fullfør ikon-utskiftingen per SPEC-proff-polish-ikoner.md på gjenstående flater (telling fra prod 15.08):
- Oversikt (18 rester — inkl. "God dag! 👋" → ren tekst, 🎯/📍-seksjonstitler → Lucide 16px i --text-muted)
- Befaring (18 — kanban-kort, status-pills, KPI-er)
- Service (12), Reklamasjon (12), Bemanningsplan (10), KS (5), Ansatte (4)
- Rørlegger, Framdrift, Biler, Rutiner, Brukere (ikke talt — ta alle)
- Nav-en trenger IKKE ikoner lenger (ren tekst) — så den ene manglende nav-SVG-en løses av seg selv
- PDF-eksportene: tekst-labels

## 4. Rekkefølge

1. Tokens + ny topp-bar med tekstnav (mest synlig, minst risiko)
2. Innholds-aksent blå→marine (token-bytte)
3. PR2 emoji-fjerning fane for fane (Oversikt → Befaring → resten)
4. PDF-eksporter

Kan gjerne leveres samlet — alt er visuelt.

## 5. Test-krav

1. Alle 13 nav-punkter på ÉN linje ved 1280px+ bredde, lesbare, aktiv-strek riktig
2. Ingen ikoner/emoji i topp-baren
3. emoji-grep i src = 0 (unntak listes hvis bevisste)
4. Kontrast-sjekk: #94a9bd på #0f2942 (inaktiv nav) skal klare WCAG AA for 13px — juster lysere ved behov
5. Alle 13 faner åpnes uten visuelle brudd; funksjonalitet uendret; tellinger identiske
6. Smal skjerm: nav håndterer plassmangel uten to rader
