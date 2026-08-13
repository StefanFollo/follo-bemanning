# SPEC: Nytt fargetema — "Lys og strammet" (Tema 2, oppstrammet)

**Godkjent av Stefan 13.08.2026.** Lys, moderne SaaS-stil — men strammet opp: mindre lekent enn ren pastell, fastere kanter, tydelig hierarki. Hele appen får temaet i én leveranse.

---

## 🛑 Rammer

- KUN visuelt: CSS/design-tokens + klassebytter. INGEN endring i data, logikk, API eller lagring.
- Merge-lagringen (fase 1) og all funksjonalitet skal være urørt.
- Bygg som design-tokens (CSS-variabler) i ÉN sentral fil — aldri hardkodede farger i komponenter.
- Emoji-ikonene i navigasjonen kan beholdes i denne runden (ikonbibliotek kan vurderes senere).

---

## Design-tokens

### Farger — grunnpalett

```css
:root {
  /* Flater */
  --bg-app: #fafbfc;          /* sidebakgrunn */
  --bg-surface: #ffffff;       /* kort, rader, paneler */
  --bg-subtle: #f1f5f9;        /* sekundærflater, hover */
  --bg-header: #ffffff;        /* topp-bar — LYS, ikke mørk */

  /* Tekst */
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;

  /* Primær-aksent (FBS marine — beholder identiteten) */
  --accent: #1e40af;           /* knapper, aktive faner, lenker */
  --accent-hover: #1e3a8a;
  --accent-subtle: #eff6ff;    /* aktiv fane-bakgrunn, valgt rad */

  /* Semantiske */
  --success: #15803d;  --success-bg: #f0fdf4;  --success-border: #bbf7d0;
  --warning: #b45309;  --warning-bg: #fffbeb;  --warning-border: #fde68a;
  --danger:  #b91c1c;  --danger-bg:  #fef2f2;  --danger-border: #fecaca;

  /* Kanter og skygger — STRAMMET */
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --radius-sm: 6px;            /* badges, knapper */
  --radius-md: 8px;            /* rader, inputs */
  --radius-lg: 10px;           /* kort, paneler — IKKE 16px+ */
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-panel: 0 4px 16px rgba(15, 23, 42, 0.10);
}
```

### "Strammet opp" betyr konkret

| Ren Tema 2 (pastell-SaaS) | Vår oppstrammede versjon |
|---|---|
| Store avrundinger (12-16px) | Maks 10px på kort, 6-8px ellers |
| Pastell-KPI-er (lyseblå/lysegrønn bakgrunn) | Hvite KPI-kort med farget VENSTRE-KANT (3px) + farget talltekst |
| Myke, nesten usynlige kanter | Synlige 1px kanter (#e2e8f0) på alle kort/rader |
| Lekne pille-badges overalt | Badges kun for status/varsler, rektangulære med radius 6px |
| Font-weight 400/500 | 500 for titler/tall, 400 brødtekst — ALDRI 600+ unntatt KPI-tall |
| Mye luft | Kompakt: rad-padding 10-12px, seksjons-gap 16-20px |

### Topp-bar

- Hvit bakgrunn, 1px bunn-kant (--border)
- FBS-logo: marineblå boks (--accent) med hvit tekst
- Aktiv fane: --accent-subtle bakgrunn + --accent tekst
- Inaktive faner: --text-secondary
- "Lagre nå"-knappen: --accent bakgrunn, hvit tekst (eneste fylte knapp i baren)
- "✓ Alt lagret": --text-muted, ingen bakgrunn

### Komponenter (fra PR1-designsystemet — oppdater tokens)

- **KPI-kort:** hvit flate, 1px kant, 3px venstre-kant i semantisk farge, tall i samme farge
- **Status-faner:** aktiv = --accent-subtle bg + --accent tekst + 500-vekt; inaktiv = transparent + --text-secondary
- **Kompakte rader:** hvit, 1px kant, radius 8px. Varsel-rader: 3px venstre-kant (rød/gul) + varseltekst i semantisk farge — IKKE hel farget bakgrunn
- **⋯-meny:** hvit dropdown, --shadow-panel, 1px kant
- **Detaljpanel:** hvit, --shadow-panel, 1px venstre-kant
- **Varsel-bannere:** --danger-bg/--warning-bg bakgrunn + 1px semantisk kant + semantisk tekst. Kompakte (8-10px padding)
- **Knapper:** Primær = fylt --accent. Sekundær = hvit med 1px --border-strong. Fare = hvit med --danger tekst/kant (fylt rød KUN i bekreftelses-dialoger)
- **Tabeller (Ansatte/Biler):** hvit, 1px radskiller, header i --text-muted uppercase 11px

### Typografi

- Beholder eksisterende font-familie (ingen ny font-innlasting i denne runden)
- Sidetittel: 20px/500 · Seksjonstittel: 15px/500 · Brødtekst: 13-14px/400 · Meta: 11-12px i --text-muted

---

## Omfang og rekkefølge

1. Opprett tokens-fil + koble på alle 13 faner (finn-og-erstatt hardkodede farger)
2. Topp-bar: mørk → lys
3. Prosjekt-sidens PR1-komponenter: bytt til tokens (de blir malen)
4. Øvrige faner: flater, kort, tabeller, badges over på tokens
5. Kontrast-sjekk: all tekst skal klare WCAG AA (4.5:1) — spesielt --text-muted på --bg-subtle

**Én leveranse. Ingen funksjonelle endringer.**

## Test etter deploy

1. Alle 13 faner åpnes uten visuelle brudd (tekst på tekst, usynlige knapper)
2. Ingen funksjonell endring: lagring, faner, paneler, drag-drop virker som før
3. 72 prosjekter / alle tellinger uendret
4. Mobil-sjekk: topp-bar og rader leselige på smal skjerm
5. Skjermbilder av Oversikt + Prosjekter + Befaring før/etter til Stefan
