# Trackr

A personal wealth manager: bank accounts & savings pockets, budget tracking,
investment portfolio, all in one place. No install, no server, no coding —
just open a file in your browser.

## First-time setup

1. Keep this folder somewhere permanent, e.g. `Documents/trackr`.
2. Open **Claude Code** (desktop app) and point it at this folder.
3. Double-click `index.html` to open Trackr in your browser any time.
   (You can also ask Claude Code to open it for you.)

## What's inside

- `index.html` / `styles.css` / `app.js` — the app itself. No build step,
  no dependencies beyond a Google Fonts link — just open `index.html`.
- `assets/logos/` — bank & broker logo images used by the app.
- `Logos/` — your original logo source files. Safe to keep or remove;
  the app uses its own copy in `assets/logos/`.

Your original design reference screenshots (`Base44 - Trackr/`) and the
spec doc (`trackr-structure-v2.md`) live on the Desktop, outside this
folder — the app doesn't read from either at runtime.

## Pages

- **Dashboard** — net worth, available/pockets/invested, P&L, net worth
  evolution chart, portfolio performance, allocation, a live watchlist.
- **Accounts** — bank accounts with expandable savings "pockets" (goals
  with a target amount and progress bar).
- **Budget** — monthly transactions, a calendar view, and category
  management (income/expense).
- **Investments** — brokers, a portfolio-wide breakdown, and three tabs:
  **Stocks & ETFs**, **Other Assets** (Private Equity, Gold, Real Estate, ...),
  and **Crypto**. Each asset can hold entries from multiple brokers/exchanges —
  quantity and average price always recalculate live from those entries, never
  hand-typed. A **Manual Prices** screen overrides live prices for any holding
  (also round-trips via CSV, or export the full database as JSON, in
  Settings → Asset List Export).
- **Settings** — 7 selectable color themes (applied instantly), a full
  palette color picker for accounts/pockets, display preferences, categories,
  asset categories, notifications, logo downloads, and CSV/JSON export/import.

All amounts everywhere in the app respect the **privacy toggle** (the eye
icon at the bottom of the sidebar) — click it to mask every number in the
app at once.

## Using it on your iPhone (or any other device)

The app's *code* (this repo) can be hosted publicly for free via GitHub
Pages — it's just the program, it never contains any of your actual data.
Your real data syncs separately through your own **Supabase** project, in
**Settings → Supabase Sync**: create a free Supabase project, run the
one-time setup SQL shown in that Settings section, copy the Project URL and
anon public key, and pick your own secret code. Enter all three on every
device you want synced — no server to run, works from anywhere with
internet, and checks for changes every few seconds.

## How to update it

**A. Directly in the browser** — every page has add/edit/delete controls.
Changes save automatically to that browser's local storage, so refreshing
or reopening the page keeps your data.

**B. Ask Claude Code in plain English** — e.g.:
- "Add a new position: Prosus, Stocks, 10 shares at €35 on Trading 212"
- "Rename the 'Emergency fund' pocket to 'Safety net'"
- "Add a new expense category called Subscriptions"
- "Change the default currency to USD"

Claude Code will edit the `defaultData()` function near the top of
`app.js` directly. Note: it edits the *starting* data baked into the file —
if you've also made edits in the browser (option A), those live separately
in that browser's local storage and won't show file edits until you clear
local storage or open the page in a fresh browser/profile. Pick one method
as your main way of updating and stick with it — probably (B) if you're
working with Claude Code regularly, since it keeps one clean source of
truth in the file itself.

## Extending it

Because this is a real project on your computer, you can ask Claude Code
for anything further — new report views, more chart types, additional
settings, real live-price fetching, etc. No pressure to do any of this —
the app works as-is.
