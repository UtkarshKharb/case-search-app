# Causa Analytica

A small full-stack app for finding and viewing FERA/FEMA court cases by their 16-character
CNR (Case Number Record). Node/Express JSON API, MongoDB via Mongoose, and a simple
HTML/CSS/JS frontend.

## Local setup

**Prerequisites**: [Node.js](https://nodejs.org/) and a local [MongoDB](https://www.mongodb.com/try/download/search-in-community) server (Community Server, running on the default port).

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template and adjust if your MongoDB isn't on the default local URL:
   ```bash
   cp .env.example .env
   ```
3. Load the sample data into MongoDB:
   ```bash
   npm run db:populate
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open [http://localhost:3000](http://localhost:3000).

| Script | What it does |
|---|---|
| `npm start` | Runs the Express server (`server.js`) at the port in `.env` (default `3000`). |
| `npm run db:populate` | Reads `SE_AsyncTask_FERA.xlsx`, samples ~100 cases, and loads them into MongoDB. Clears existing data first, so it's safe to re-run. |
| `npm run db:drain` | Empties all four collections without reloading — a clean-slate reset. |

## How the site and the code work

The stack is a Node/Express JSON API backed by MongoDB (via Mongoose), with a
HTML/CSS/JS SPA frontend.

### Data model

Four MongoDB collections — `Matter`, `Advocate`, `Hearing`, `LowerCourt` — one per source
sheet, joined by the source's own `case_id`. `Advocate`
documents represent one appearance, not a resolved person, since the source has no stable
identity across cases; `LowerCourt` entries aren't 1:1 with a case and don't necessarily form a
single linear appellate chain.

### Ingestion

`scripts/ingest.js` reads the source spreadsheet, stratified-samples ~100 of the 134 matters
(preserving the real Pending/Disposed ratio, seeded for reproducibility), and loads all four
collections. Two modes: `populate` and `drain`.

`routes/cases.js` exposes a small JSON API (`/api/health`, `/api/cases`, `/api/cases/:cnr`)
that the frontend calls via axios. The frontend (`public/js/app.js`) uses
hash-based client-side routing (`#/`, `#/cases`, `#/case/:cnr`). It handles its own theming (dark/light, persisted to `localStorage`) and uses the
View Transitions API for animated navigation, falling back gracefully where that's unsupported.

## Project structure

```
config/db.js              Mongoose connection helper, shared by server.js and ingest.js
models/
  Matter.js                One case/matter record
  Advocate.js               One advocate's appearance on one side of one case
  Hearing.js                 One hearing event
  LowerCourt.js               One forum in a case's procedural history
routes/cases.js            The JSON API: /api/health, /api/cases, /api/cases/:cnr
scripts/ingest.js          Data ingestion — populate/drain modes
public/
  index.html                Single page shell: nav bar + empty view-root
  css/style.css               All styling: theme tokens, layout, components
  js/api.js                   Thin axios wrapper around the API
  js/app.js                   Router, rendering, theming — the whole frontend
  vendor/axios.min.js         Vendored dependency (no CDN, works offline)
  img/                        Logo assets
app.js                     Express app: middleware + route mounting (no .listen())
server.js                  Entry point: loads .env, connects MongoDB, starts listening
SE_AsyncTask_FERA.xlsx     Source dataset (read-only; ingestion never modifies it)
```

## Hero features

### Hearings timeline

Every case detail page has a **Hearings** section that expands into a chronological timeline
of that case's hearings — most recent first, each one showing its date, type (listing or
order), the bench, a plain-English summary, and (when available) the full order text behind
its own toggle. Hearings that ended the case are marked with a distinct "disposal order"
marker on the timeline.
