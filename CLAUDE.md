# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About the App

**FolloByggService (FBS)** — a Norwegian construction company's internal staffing and project management tool. Single-page React app with no backend except a Vercel KV (Upstash Redis) cloud sync endpoint. The UI is in Norwegian throughout.

Deployed automatically to Vercel on every push to `main` (GitHub: `StefanFollo/follo-bemanning`).

## Commands

```bash
npm run dev       # Start dev server on http://localhost:5174
npm run build     # Production build
npm run lint      # ESLint check
```

No test suite exists.

## Architecture

### State management

All app state lives in a single React Context (`src/context/AppContext.jsx`) backed by `useReducer`. Every page accesses state via:

```js
const { state, dispatch } = useApp();
```

**State shape:**
- `ansatte` — employees (flags: `innleie` = temp hire, `utenforBemanningsplan` = office/admin, excluded from capacity)
- `prosjekter` — projects (also carry Gantt fields: `fdTasks`, `fdProgress`, `fdStatus`, `fdStartWeek`, `fdTotalWeeks`)
- `tildelinger` — employee↔project date-range assignments (startDato/sluttDato ISO strings)
- `oppgaver` — checklist tasks per project
- `fag` — list of trade/craft labels
- `rorTimer` — plumbing hours log
- `befaringer` — site survey / sales pipeline entries
- `reklamasjoner` — warranty/complaint cases
- `serviceJobber` — service job records

### Persistence

`src/store.js` handles all persistence:
- **localStorage** is the primary store. All keys are prefixed `fbs_` (e.g. `fbs_ansatte`, `fbs_tildelinger`).
- Every `save()` call also sets `fbs_updated_at` (epoch ms) — this timestamp determines cloud sync priority.
- **Vercel KV** (Upstash Redis) via `api/state.js` is the cloud backup. On startup, cloud state wins only if `cloudUpdatedAt > localUpdatedAt`. Auto-saves 1 second after any state change.

### One-time migrations

`loadState()` in `store.js` runs one-time data imports guarded by localStorage flags (`fbs_*_done`). When adding new seed data or migrations, follow this pattern and pick a unique flag name.

### Routing

No router — `App.jsx` uses a `useState('dashboard')` tab switcher. Nine tabs: `dashboard`, `befaring`, `reklamasjon`, `service`, `prosjekter`, `ansatte`, `bemanningsplan`, `rorlegger`, `framdrift`.

### Authentication

Frontend-only. Credentials from `VITE_APP_USER` / `VITE_APP_PASS` env vars (defaults: `admin` / `follo2026`). Auth state stored as `fbs_auth: 'ok'` in localStorage.

## Key Patterns

**Capacity filtering** — always exclude office/admin employees from bemanningsplan calculations:
```js
const planAnsatte = state.ansatte.filter(a => !a.utenforBemanningsplan);
```

**Updating a project** (merge extra fields onto existing):
```js
dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...proj, ...extra } });
```

**New IDs** — always use `uid()` from `src/store.js`.

**Dates** — all stored as ISO strings (`YYYY-MM-DD`). Use `isoToDate()`, `dateToIso()`, `addDays()`, `overlaps()` from `store.js`. Use `dateToIso()` (not `.toISOString()`) to avoid UTC timezone drift in Norwegian timezone.

**Date overlap check:**
```js
import { overlaps } from '../store';
overlaps(aStart, aEnd, bStart, bEnd) // inclusive both ends
```

**Norwegian holidays** — `src/holidays.js` exports `getHolidayMap(fromYear, toYear)` returning an ISO-date→label map. Used in Bemanningsplan to mark røde dager.

## Pages Overview

| Page | File | Purpose |
|------|------|---------|
| Oversikt | `Dashboard.jsx` | KPIs, today's capacity, tilbud pipeline stats, upcoming deadlines |
| Befaring | `BefaringPlan.jsx` | Sales pipeline: befaring → tilbud → godkjent → prosjekt |
| Reklamasjon | `Reklamasjon.jsx` | Warranty/complaint case tracking |
| Service | `Service.jsx` | Service job log |
| Prosjekter | `Prosjekter.jsx` | Project list, status, links to befaring |
| Ansatte | `Ansatte.jsx` | Employee management, fag/trade admin |
| Bemanningsplan | `Bemanningsplan.jsx` | Weekly/monthly drag-drop staffing calendar |
| Rørlegger | `RorleggerPlan.jsx` | Plumbing hours tracking per project |
| Framdrift | `Framdriftsplan.jsx` | SVG Gantt chart per project, auto-progress from task checkboxes |

## Environment Variables

Required in Vercel (and optionally `.env.local` for dev):
- `KV_REST_API_URL` — Upstash Redis URL
- `KV_REST_API_TOKEN` — Upstash Redis token
- `VITE_APP_USER` — login username
- `VITE_APP_PASS` — login password

## Postkasse fra Cowork-Claude

Når Stefan sier «sjekk postkassen»: les `../follo-befaring/Ansatte/POSTKASSE-bemanning.md`,
utfør oppdragene i rekkefølge, og flytt ferdige oppdrag til UTFØRT-seksjonen
nederst i fila med dato + commit-hash.
