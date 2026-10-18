# Backlog — 18 Oct 2026 overnight

Each item lists its acceptance criteria (AC) and a status. Ticks are added as items land, with their commits.

General AC for every item:
- No console errors on any page, at desktop or phone width.
- The eye hides every new amount.
- The loan stays out of net worth.
- Old documents still load.
- Unit tests cover the pure logic.
- The service-worker cache version is bumped.

## Done before tonight (17 Oct, already on main)

- [x] **A1 Compact mode and Show performance indicators** work. Commit 0c11e64 on main. Re-checked tonight with screenshots.
- [x] **A2 Trading "Import Excel".**
  - Shares the Budget importer's helpers: column-name matching, numbers, dates, date-order detection.
  - Adds a preview and duplicate flags.
  - Commit 0c11e64.
- [~] **A4 Notifications.** Real alerts for negative balance, weekly summary and goal reached (bottom bar, plus optional system notifications). The in-app centre is done tonight; see A4 below.
- [x] **B6 Weekly recap:** an Overview card plus a modal. Commit 0c11e64. Tonight: transfers must not count as transactions.

## User request during the night

- [x] **Edit brokers and exchanges.**
  - AC: an Edit button on every Investments account page.
  - AC: a broker opens its form, which now has Delete.
  - AC: an exchange can be renamed everywhere its name is stored, and its logo and cash set.
  - AC: undo works for 10 s.
  - AC: e2e test `edit-accounts.spec.js`.
  - Commit 26b0d2f.

## Tier A

- [x] **A3 Goal photos in backups.** Commit c87cd76 (`backup-photos.spec.js`).
  - AC: the JSON backup and the Excel backup include goal photos, shrunk to at most 1000 px and JPEG 0.7.
  - AC: restoring writes them back to the device's photo store.
  - AC: old backups without photos still restore.
  - AC: the backup notes the photo count and size.
- [x] **A4 Notification centre.** Commit f6aa5cb (`notifications.spec.js`).
  - AC: one list that keeps budget alerts, negative balance, weekly summary and goal reached, with read/unread state.
  - AC: the list is merged into the Action required window as a "Notifications" tab.
  - AC: an unread dot on the top bar.
  - AC: the app badge (`setAppBadge`) where supported.
  - AC: a `.ics` reminders download ("check balances" monthly, "1 January snapshot").
  - AC: no push.
- [x] **A5 Budgets behind a setting.** Commit c87cd76.
  - AC: Settings → Display → "Category budgets (beta)", off by default.
  - AC: when on, the Budgets tab, the alerts and the glance card return. When off, everything looks as it does today.
- [x] **A6 One component each.** Commit c87cd76.
  - AC: Settings → Categories shows a link to Budget → Categories; the same editor is kept, with one entry point.
  - AC: Analysis's recurring card links to Budget → Recurring instead of drawing a second scanner.
  - AC: one `allocationCardHtml(scope)` is used by Overview, Wealth and Investments.

## Tier B

- [x] **B1 Returns** (`returns.js`, pure functions plus Node tests). Commit 6f2b099, 14 unit tests.
  - AC: `xirr(flows)` matches the Excel test values to 4 decimals and returns null without at least one positive and one negative flow.
  - AC: `twrFromSnapshots(values, flows)` and `modifiedDietz(...)` pass test 6 from RESEARCH.md.
  - AC: realised gains with FIFO lots from recorded Sell trades.
  - AC: dividends per position from Budget income in the "Investment Returns › Dividends" sub-category, matched by name.
  - AC: UI in Analysis → "Returns": portfolio TWR from snapshots (method shown); XIRR per broker and portfolio from dated flows (Budget transfers to and from brokers or exchanges, plus today's value); realised gains and dividends per holding.
  - AC: every number shows how it was computed.
- [x] **B2 Cash-flow forecast** (`forecast.js`). Commit 9104775.
  - AC: daily projected balance per bank account and in total for 30, 90 and 365 days.
  - AC: built from active recurring series (income and expenses), net of entries already logged this month.
  - AC: what-if scenarios (name, amount, date or monthly), each toggled on or off and saved in `data.forecastScenarios`.
  - AC: a "lowest point" warning when the total goes below 0 or below a threshold.
  - AC: a Budget → Forecast tab.
  - AC: unit tests.
- [x] **B3 X-ray rules** (`xray.js`). Commit 4a8b366.
  - AC: rules for single-position concentration, broker/exchange concentration, currency cluster (look-through where splits exist), crypto share, emergency-fund coverage, TER fee drag, stale prices and loan share.
  - AC: every threshold editable and each rule switchable, saved in `data.settings.xray`.
  - AC: "not applicable" when there is no data.
  - AC: results shown in Analysis, and failing rules feed Action required.
  - AC: unit tests.
- [x] **B4 Transaction rules engine** (`rules.js`). Commit dfa0ddf.
  - AC: rule = conditions (name contains / is / starts with; amount between; account is; type is) plus actions (category and sub-category, rename, mark recurring).
  - AC: stored in `data.txRules`.
  - AC: applied on manual add (pre-fill) and on import (before learned categories), with a badge naming the rule.
  - AC: a "preview: N past transactions match" and "apply to them" dialog with checkboxes.
  - AC: case-insensitive matching.
  - AC: unit tests.
- [x] **B5 Apple Pay pre-fill link.** Commit 694e72c.
  - AC: `#add=expense&amount=12.50&merchant=…` (and `?add=` for compatibility) opens the add-transaction sheet pre-filled, with rules and learned category applied. It never saves on its own.
  - AC: the link is removed from the address bar afterwards.
  - AC: `docs/apple-pay-shortcut.md` with honest limits (Safari vs Home Screen app storage).
- [x] **B7 Apply to holdings.** Commit 33ab84a.
  - AC: setting "Update holdings when I record a trade", off by default.
  - AC: when on, Buy/Sell/Convert shows a confirmation sheet with the changes (quantity, average price, broker cash), applies them, offers undo for 10 s, and records FIFO realised gains on Sell.
  - AC: nothing changes when off.

## Tier C

- [x] **C New navigation (beta)** on branch `overnight/navigation`. Commit 0273a60 (rebased onto the full overnight branch).
  - AC: setting off by default.
  - AC: Home · Money · Wealth (Overview/Cash/Investments/Debts) · Plan (Goals/Emergency/Insights) · More.
  - AC: old `goPage()` ids still work.
  - AC: phone tabs ≤ 5.

## Tier D (smallest first, if time)

- [x] **Data-quality score** in Action required. Commit 3658a43.
- [ ] **Historical FX** (Frankfurter v2, `providers=ecb`), cached per day. **Not done.** Every total in the app converts with `toEUR(amount, currency)` at today's rate. Converting at the transaction's date needs a date-aware `txToEUR(t)` at about 60 call sites, plus a per-day rate cache. It changes many totals at once, so it deserves its own reviewed branch. Design: fetch `/v2/rates?from=…&to=…&quotes=USD,GBP,CHF&providers=ecb` once for the date range of your foreign-currency transactions, store `{date: {USD,…}}` in IndexedDB, and fall back to today's rate.
- [x] **Box 3 estimate** (off by default). Commit c99f087.
- [x] **Emergency pack export.** Commit 13bd815.
- [x] **Command palette** (Cmd+K). Commit bf30329.
- [x] **Insight cards** plus price-increase detection. Commit 39e8727.

## Phase 4 — GitHub (files only; nothing activated that needs a secret)

- [x] `ci.yml`, `codeql.yml`, `dependabot.yml`, issue templates, pull-request template, cache-version check. Commit a6fdac2.
- [x] `docs/integrations/` templates: nightly backup to the private repo, Supabase keep-alive, server-side daily snapshot, price/FX cache job, Claude Code routine. Commit 25e6095.

## Remaining backlog (for the next session)

- [ ] **Historical FX**, as described above.
- [ ] **Server-side snapshots, app side.** Read `get_server_snapshots` and fill in missing days in `data.history`; see `docs/integrations/server-snapshot/README.md`.
- [ ] **`tools/backup.js` (the Mac's daily Excel backup) should include goal photos.** They live in the cloud's `trackr_images` table. Not done: building and checking it means connecting to the real Supabase, which was off-limits tonight.
- [ ] **Recurring transfers** (monthly money into a pocket). Today a recurring series is income or expense only.
- [ ] **Recurring calendar states** (paid / different amount / missed), and amount tolerance (±7.5 %) on series.
- [ ] **Confidence score on learned categories**, with a "To review" list.
- [ ] **Year in review** (swipeable cards).
- [ ] **Age of Money**, YNAB-style.
- [ ] **New-money planner** ("where should my next €250 go").
- [ ] **Read the market cache** (`get_market_cache`) before the live fetch.
- [ ] **Accessibility:** clear the non-critical axe findings, which are listed in the Playwright report attachments.
