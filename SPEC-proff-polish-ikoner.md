# SPEC: Proff polish — fjern alle emojier, innfør ikonbibliotek

**Godkjent av Stefan 15.08.2026.** Siste polish-runde: appen skal se profesjonell ut. Alle emojier erstattes med Lucide-ikoner. Fargepaletten fra "Lys og strammet"-temaet BEHOLDES uendret — dette er en ikon- og typografi-runde, ikke ny fargerunde.

---

## 🛑 Rammer

- KUN visuelt (ikoner, tekst-styling). Ingen endring i data, logikk, API eller lagring.
- Fargetokens fra SPEC-tema-lys-strammet beholdes som de er.
- Funksjonalitet, klikkeflater og layoutstruktur uendret — kun symbolene byttes.

---

## Ikonbibliotek

**lucide-react** (React-komponenter, tree-shakes til kun brukte ikoner — liten bundle-kost).

Standard: outline, strokeWidth 2 (1.75 i små størrelser), størrelse 16px i tekst/rader, 18px i navigasjon, 20px i KPI/tomtilstander. Farge: arver tekstfargen (currentColor) — semantiske steder bruker eksisterende tokens (--danger, --warning, --success, --accent).

## Emoji → ikon-mapping (hovedlisten)

### Navigasjon (topp-bar)
| Emoji | Lucide |
|---|---|
| 🏠 Oversikt | House |
| 🔍 Befaring | Search |
| ⚠️ Reklamasjon | ShieldAlert |
| ⚡ Service | Zap |
| 🏗 Prosjekter | Building2 |
| 👷 Ansatte | HardHat |
| 📅 Bemanningsplan | CalendarDays |
| 🔧 Rørlegger | Wrench |
| 📊 Framdrift | ChartGantt (el. BarChart3) |
| ✅ KS / HMS | ClipboardCheck |
| 🚐 Biler | Truck |
| 📘 Rutiner | BookOpen |
| 👥 Brukere | Users |
| 💾/✓ Lagre / Alt lagret | Save / Check |
| 🚪 Logg ut | LogOut |

### Statuser og varsler
| Emoji | Lucide |
|---|---|
| ⚠ (frist/varsel) | TriangleAlert |
| 👷 (bemanning) | Users el. HardHat |
| ✅ (godkjent/ferdig) | CircleCheck |
| ❌ (tapt/feil) | CircleX |
| 📤 (sendt/send) | Send |
| ✏️ (kladd/rediger) | Pencil |
| 📋 (planlagt/liste) | ClipboardList |
| 🌱 (lead) | Sprout |
| 🏁 (fullført) | Flag |
| 🗄 (arkiv) | Archive |
| 🔗 (kobling/merge) | Link2 |
| 👁 (se kundesiden) | Eye |
| 📄 (PDF) | FileText |
| 🧮 (tilbuds-app) | Calculator |
| ✨ (AI-generering) | Sparkles |
| 📦 (tilbudsdata) | Package |
| 📜 (logg) | ScrollText |
| ⏳ (venter/laster) | Loader (animert) el. Clock |
| 🗑 (slett — der den finnes) | Trash2 |
| 📱/✉️ (tlf/e-post) | Phone / Mail |
| 🎂 (bursdag) | Cake |
| 🏖 (ferie) | Palmtree |
| 🤒 (syk) | Thermometer |
| 💰/kr (beløp) | FJERNES — beløp vises som ren tekst "44 000 kr" |
| 🧑‍💼 (PL) | FJERNES — vis bare navnet, ev. UserCog ved behov |
| 💬 (kommentar) | MessageSquare |
| 📞 (neste kontakt) | PhoneCall |
| ⋯ (meny) | MoreHorizontal (beholdes som ikon) |
| ⛓ (avhengighet) | Link |
| 💡 (AI-merknad) | Lightbulb |

### Tekst-opprydding samtidig
- Beløp: alltid "44 000 kr" uten symbol foran
- Personnavn: uten emoji-prefiks
- Versjonstempel og småtekst: --text-muted
- Knapper: ikon + tekst med 6px gap, ikon 16px
- Tomtilstander: ett stort ikon (32-40px, --text-muted) + tekst — ikke emoji

## Omfang

ALLE 13 faner + modaler + detaljpaneler + kanban-kort + PDF-eksport (bemanningsplan-PDF og bil-rapport: bytt emoji til tekst-labels der ikoner ikke kan embeddes enkelt).

Tilbuds-appen tas i EGEN runde senere (denne speccen gjelder bemanningsplanleggeren). Unntak: ingen.

## Utrulling

1. Installer lucide-react + lag Ikon-wrapper med standardstørrelser
2. Navigasjon + topp-bar (mest synlig)
3. Prosjekter-siden (designsystem-komponentene: KPI, faner, rader, panel, varsler)
4. Befaring/kanban + Service + Reklamasjon
5. Resten (Ansatte, Bemanningsplan, Rørlegger, Framdrift, KS, Biler, Rutiner, Brukere)
6. PDF-eksportene

Kan leveres i 2 PR-er (1-3 og 4-6) hvis det er ryddigere.

## Test-krav

1. grep etter emoji-tegn i src etter utrulling → 0 treff (evt. bevisste unntak listes)
2. Alle 13 faner åpnes — ingen manglende ikoner (tomme felter der emoji sto)
3. Ingen funksjonell endring, tellinger identiske
4. Mørke/små skjermer: ikoner leselige (currentColor arver riktig)
5. PDF-eksport genereres uten emoji-artefakter
