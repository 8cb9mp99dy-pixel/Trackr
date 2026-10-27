# Trackr — notes for Claude

A personal finance PWA for one person in the EU, EUR first. It is zero-build vanilla JavaScript on GitHub Pages (repo `8cb9mp99dy-pixel/Trackr`, **public**; Pages serves `main`). Data lives in localStorage and syncs to the user's own Supabase project.

## Hard rules

1. **Look.** Minimalist black and white, very few emojis. Don't change the logo. No new hues (since 23 Oct 2026): greys and opacities of ink/paper only (`futuristic.css` tokens); green/red only for gains and losses, user-chosen colours for categories. Chart slices use `fxShade(i, n)` / `chartShade(type, i, n)` (app.js): greys by size, or the colour the user picked for that type. Animate only transform and opacity; every animation needs a still fallback under reduced motion.
2. **No connections.** Nothing connects to banks or brokers. Data is typed in, imported from Excel/CSV, or priced from free public market data.
3. **No real money.** Nothing places a real order or moves real money. Buy/Sell/Convert only *record* a trade; "apply to holdings" is opt-in and asks first.
4. **The loan.** The invested bank loan is "not my money" and stays OUT of net worth everywhere. It appears only on its own card and page, in X-ray "loan covered", and in the box 3 estimate (as an asset plus a debt, for tax only).
5. **Hide amounts.** Every amount must be hideable with the eye. Format money with `fmtMoney()`; it applies the eye. This covers pages, charts, tooltips, notifications, PDFs and exports. The live price bar is the one exception: it shows public market prices, not the user's amounts.
6. **No build step.** Stays zero-build vanilla JS. `package.json` is dev-only. No runtime framework.
7. **No social features.** Nothing social, multi-user, subscription-based or ranked.
8. **Git.** Work on a branch, then push to `main` automatically once a change passes the checks and the secret check (the user asked for this on 18 Oct 2026); confirm the live site serves the new cache version. Never force-push. Do not add or edit files in `.github/workflows/`: this Mac's token can't push them (they wait in `docs/integrations/github-workflows/`). Overnight work goes on `overnight/<date>` branches.
9. **Real Supabase.** Never query or write it from tools or tests. SQL changes go in `supabase/migrations/` as proposals.
10. **Secrets.** Never read, print or commit them. Run `bash tools/dev/secret-check.sh` before every commit.
11. **Test data.** Never use real financial data in tests or commits. Use the invented `tests/fixtures/demo-data.json`.
12. **Data shape.** Must stay backward compatible: add new keys to `defaultData()` (`deepDefaults` fills them in for old documents), never drop fields. `tests/e2e/migration.spec.js` checks it.
13. **Service worker.** When app files change, bump `CACHE` in `sw.js` and add new files to its `SHELL` (CI checks this).
14. **Language.** Explain simply. Reply in French when the user writes in French.

## Architecture

- `index.html` loads classic scripts **in order**. They share globals: `data`, `ui`, `save()`, `render()`, `fmtMoney()`, `toEUR()`, `ic()` and so on.
  - `app.js` comes first. It holds the data model, persistence and sync, prices and the core pages.
  - Each later file adds one area.
  - `safety.js` is last and calls `render()` once more.
- **Rendering.**
  - `render()` redraws everything from `ui` and `data`.
  - Modals are `ui.modal = { type, payload }`, drawn by `window.__modalRenderers[type]`.
  - Background redraws use `renderWhenIdle()` so they never wipe what the user is typing.
- **Persistence.**
  - `save()` writes localStorage, records today's history snapshot (`recordHistorySnapshot`: netWorth, portfolioValue, byType, per-holding `pos`), then syncs.
  - Sync goes through the Supabase RPCs `get_trackr_data` / `set_trackr_data`, with a stale-write guard.
- **Feature hooks.** Files add themselves through registries made in app.js: `window.__pageRenderers` (pages), `__attention` (Action required), `__notifiers`, `__addMenu`, `__palette`, `__aiSheets` (Export for AI), `__overviewCards`, `__txFormBlocks` (the expense form); `runHooks(name, fn)` calls them safely.
- **Undo.** Destructive or big actions are listed in `UNDO_ACTIONS` (`safety.js`); each gets 10 s of undo.

### File map

| File | Area |
|---|---|
| `app.js` | data model, sync, prices (TradingView, CoinGecko, Twelve Data), Overview, Accounts, Budget, Investments, Trading, Settings, backups |
| `topbar.js` | top bar, Action required (+ Notifications tab, data quality), Add menu, More sheet |
| `overview.js` / `wealth.js` | Overview cards, the shared `allocationCardHtml`, the Wealth page |
| `goals.js` / `photos.js` | goals showroom, emergency savings; goal photos and receipt files (IndexedDB + Supabase; included in backups) |
| `cashflow.js` / `forecast.js` | Totals, Sankey, recurring calendar and scanner; Budget → Forecast with what-ifs |
| `analysis.js` / `returns.js` / `xray.js` / `box3.js` | Analysis: fees, passive income, diversification; returns (TWR/XIRR/FIFO); X-ray rules; Dutch box 3 estimate |
| `invest.js` / `staking.js` / `loan.js` | broker/exchange pages (Buy/Sell/Convert, plans, apply to holdings, edit/rename); staking; the invested loan |
| `yearreview.js` | Year in review: swipeable cards (Budget → Totals → Year, and an insight in Dec/Jan) |
| `ai-export.js` | Settings → Backup & Restore → "Export for AI": one readable workbook (Read me, Summary, Monthly, Transactions, holdings…) |
| `spend.js` | Overview → Safe to spend (main balances − recurring bills/transfers before payday − buffer, per day until payday; payday guessed from the biggest recurring income or `settings.payday`); "Can I afford it?" (from main balances or savings: per day left, emergency months, goal delays, days of spending, working days) |
| `ious.js` | Money → IOUs (`data.ious`): lent / borrowed / split per person, settle, copy a reminder (never sends), "Split with someone" on a saved expense; not in net worth |
| `contracts.js` | Money → Contracts (`data.contracts`): cost, term end, renewal, notice → "cancel by"; Action required 30 days before (terms ≥ 3 months), notification 14 days before; "From recurring" |
| `setaside.js` | Plan → Yearly bills (`data.yearlyBills`): per-month amount to put aside, optional pocket (on track / behind / ready), "Paid" adds the expense and moves the date |
| `trips.js` | Money → Trips (`data.trips`, `tx.tripId`): budget, per day, pace, day bars, by category; expenses by date (bills excluded) or tagged; Overview card during a trip |
| `patterns.js` | Plan → Patterns: heatmap of day-to-day spending, no-spend streaks, weekday averages, your own inflation (recurring price changes, categories vs a year before) |
| `monthclose.js` | Month-end check (`data.monthClose`), offered from the 26th to the 7th: balances, to review, recurring, prices, invoices; the month in numbers; a note; Month notes journal |
| `snap.js` | Add → Scan a receipt: Claude reads the photo (official SDK `assets/vendor/anthropic-sdk.min.js`, loaded on first scan; Opus 5.5, structured JSON output) and opens the expense form filled in, with the photo attached as the receipt. The user's own API key is typed in its window and kept in localStorage `trackr-claude` (device only, never synced or backed up). Sage, the chat assistant, was removed at the user's request (24 Oct 2026): don't bring it back |
| `inbox.js` | ChatGPT inbox: two GPTs (budget, investments) send items through Supabase RPCs (`003_chatgpt_inbox.sql`, also `INBOX_SQL` in the file, kept equal by a test) with their own inbox key (hash only in Supabase; the key in localStorage `trackr-inbox-keys`, device only); Trackr publishes names only (no amounts) and lists items in Action required → From ChatGPT: Add / Edit (tx form) / Reject, buys and sells through the broker's trade panel; Add → Paste from ChatGPT without an action. `data.settings.inboxChannels`. Setup: `docs/integrations/chatgpt-inbox.md` |
| `allocation.js` | Budget → Income plan: split a salary / freelance income (VAT first, then % to invest, day-to-day…) into transfers |
| `future.js` | Goals → Future: net worth projected 5–40 years (band cautious/good, today's euros, milestones, financial-freedom number, what-if sliders) |
| `nwmoves.js` | Wealth → "Why your net worth moved": a month split into saved / markets / other (from daily history + transactions) |
| `freelance.js` | Freelance page: invoices (paid → income + split offer), VAT per quarter (Dutch deadlines), VAT pocket short/extra, business expenses |
| `receipts.js` | Receipts (photo/PDF, stored like goal photos) and warranties on expenses; Budget → Receipts (searchable); reminder a month before a warranty ends |
| `interest.js` | Interest on pockets: central bank rate (ECB / Fed fetched, others typed) or own rate, optional cap; per day/week/month/year, growth, "Record interest received" (pocket + income) |
| `appearance.js` | Light / Dark / Auto (this device only, set before the first frame in index.html); dark is the same black-and-white design inverted; switching wipes the screen in a circle from the button |
| `features.css` | Styles of the feature pages above (same tokens as futuristic.css) |
| `futuristic.css` / `fx.js` | The look, loaded after `styles.css`: design tokens (ink/paper greys, spacing, corners, durations, easings, gradients), equal-width digits (numbers keep Plus Jakarta Sans; the user didn't like a monospace font), hairlines, dot grid; fx.js: boot scan, sliding nav/tab indicators, digit roll on changed amounts, sync dot pulse/shake, "Saved" check, View Transitions on page changes. Only transform/opacity move; all still with reduced motion. Green/red stay for gains/losses, user colours for categories |
| `goals-visual.js` | Goals: floating bubbles filled with liquid up to each goal's progress; the goal calendar (months as a road, pins, pace ghosts, "Next up" countdown) |
| `overview-hero.js` | Overview top: net worth with its change and a self-drawing chart (1M/3M/1Y/All, point to read a day), what it's made of (main balances · pockets · invested), this month (in/out bars, % kept ring, 6-month columns) |
| `portfolio-chart.js` | Investments: ring of positions (logos + shares around it) or of investment types, list beside it, hover/tap to light a slice, sort, sweep-in animation |
| `watchlist.js` | Investments → Watchlist: prices you follow without owning them (ISIN via TradingView, coins via CoinGecko), alerts below/above your levels (bar, notification centre, Action required); never buys |
| `planner.js` | Wealth → Compare: "where should new money go" (to the types below target, no selling) |
| `wallet.js` | Accounts → cash wallet (an account with `kind: 'cash'`): add cash, spent, withdraw, count; "Paid with: Cash" picks it |
| `budget-import.js` / `rules.js` / `excel-import.js` / `trade-import.js` | Excel/CSV imports (transfers included); transaction rules engine; positions import; trades import |
| `notify.js` / `insights.js` / `palette.js` / `quickadd.js` / `emergency.js` | alerts and notification centre, weekly summary and `.ics`; Overview insights; Cmd+K palette; Apple Pay quick-add link; emergency pack |
| `ticker.js`, `report.js`, `motion.js` (calls `fxAfterRender`), `backup-excel.js`, `safety.js`, `sw.js` | live price bar, PDF/share, animations, Excel backup, undo/restore points/offline, service worker |
| `nav.js` | Navigation: grouped by default (Home · Money: budget, receipts, trips, IOUs, contracts, freelance · Wealth: overview, cash, investments, watchlist, debts · Plan: goals, yearly bills, future, emergency, patterns, insights) with section tabs; Settings → Display → "Classic navigation" brings back every page in the side bar |

Pure maths in `returns.js`, `forecast.js`, `xray.js`, `rules.js`, `box3.js`, `quickadd.js`, `insights.js`, `planner.js`, `yearreview.js`, `freelance.js`, `future.js`, `nwmoves.js`, `watchlist.js`, `receipts.js`, `interest.js`, `portfolio-chart.js`, `overview-hero.js`, `goals-visual.js`, `spend.js`, `ious.js`, `contracts.js`, `setaside.js`, `trips.js`, `patterns.js`, `monthclose.js`, `snap.js` and `inbox.js` is exported with `module.exports` and unit-tested in Node.

## How to test

```
npm ci                                # dev tools only
node tools/dev/serve.js 8080          # http://127.0.0.1:8080 — a separate origin, so your real data isn't there
node tools/dev/make-fixture.js --old  # rebuilds the invented fixtures
npm run check && npx eslint . && npm test && npx playwright test
SCREENS=after npx playwright test screens   # screenshots of every page, desktop + phone
node tools/dev/shot.js out.png --js "goPage('analysis')"   # one screenshot
```

The e2e tests block every request outside 127.0.0.1, so prices and Supabase are never reached. They also fix the clock at 18 Oct 2026, the fixture's day.
