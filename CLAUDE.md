# Trackr — notes for Claude

A personal finance PWA for one person in the EU, EUR first. It is zero-build vanilla JavaScript on GitHub Pages (repo `8cb9mp99dy-pixel/Trackr`, **public**; Pages serves `main`). Data lives in localStorage and syncs to the user's own Supabase project.

## Hard rules

1. **Look.** Minimalist design, very few emojis. Don't change the logo.
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
| `allocation.js` | Budget → Income plan: split a salary / freelance income (VAT first, then % to invest, day-to-day…) into transfers |
| `future.js` | Goals → Future: net worth projected 5–40 years (band cautious/good, today's euros, milestones, financial-freedom number, what-if sliders) |
| `nwmoves.js` | Wealth → "Why your net worth moved": a month split into saved / markets / other (from daily history + transactions) |
| `freelance.js` | Freelance page: invoices (paid → income + split offer), VAT per quarter (Dutch deadlines), VAT pocket short/extra, business expenses |
| `receipts.js` | Receipts (photo/PDF, stored like goal photos) and warranties on expenses; Budget → Receipts (searchable); reminder a month before a warranty ends |
| `watchlist.js` | Investments → Watchlist: prices you follow without owning them (ISIN via TradingView, coins via CoinGecko), alerts below/above your levels (bar, notification centre, Action required); never buys |
| `planner.js` | Wealth → Compare: "where should new money go" (to the types below target, no selling) |
| `wallet.js` | Accounts → cash wallet (an account with `kind: 'cash'`): add cash, spent, withdraw, count; "Paid with: Cash" picks it |
| `budget-import.js` / `rules.js` / `excel-import.js` / `trade-import.js` | Excel/CSV imports (transfers included); transaction rules engine; positions import; trades import |
| `notify.js` / `insights.js` / `palette.js` / `quickadd.js` / `emergency.js` | alerts and notification centre, weekly summary and `.ics`; Overview insights; Cmd+K palette; Apple Pay quick-add link; emergency pack |
| `ticker.js`, `report.js`, `motion.js`, `backup-excel.js`, `safety.js`, `sw.js` | live price bar, PDF/share, animations, Excel backup, undo/restore points/offline, service worker |
| `nav.js` | Navigation: grouped by default (Home · Money: budget, receipts, freelance · Wealth: overview, cash, investments, watchlist, debts · Plan: goals, future, emergency, insights) with section tabs; Settings → Display → "Classic navigation" brings back every page in the side bar |

Pure maths in `returns.js`, `forecast.js`, `xray.js`, `rules.js`, `box3.js`, `quickadd.js`, `insights.js`, `planner.js`, `yearreview.js`, `freelance.js`, `future.js`, `nwmoves.js`, `watchlist.js` and `receipts.js` is exported with `module.exports` and unit-tested in Node.

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
