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

- [ ] **A3 Goal photos in backups.**
  - AC: the JSON backup and the Excel backup include goal photos, shrunk to at most 1000 px and JPEG 0.7.
  - AC: restoring writes them back to the device's photo store.
  - AC: old backups without photos still restore.
  - AC: the backup notes the photo count and size.
- [ ] **A4 Notification centre.**
  - AC: one list that keeps budget alerts, negative balance, weekly summary and goal reached, with read/unread state.
  - AC: the list is merged into the Action required window as a "Notifications" tab.
  - AC: an unread dot on the top bar.
  - AC: the app badge (`setAppBadge`) where supported.
  - AC: a `.ics` reminders download ("check balances" monthly, "1 January snapshot").
  - AC: no push.
- [ ] **A5 Budgets behind a setting.**
  - AC: Settings → Display → "Category budgets (beta)", off by default.
  - AC: when on, the Budgets tab, the alerts and the glance card return. When off, everything looks as it does today.
- [ ] **A6 One component each.**
  - AC: Settings → Categories shows a link to Budget → Categories; the same editor is kept, with one entry point.
  - AC: Analysis's recurring card links to Budget → Recurring instead of drawing a second scanner.
  - AC: one `allocationCardHtml(scope)` is used by Overview, Wealth and Investments.

## Tier B

- [ ] **B1 Returns** (`returns.js`, pure functions plus Node tests).
  - AC: `xirr(flows)` matches the Excel test values to 4 decimals and returns null without at least one positive and one negative flow.
  - AC: `twrFromSnapshots(values, flows)` and `modifiedDietz(...)` pass test 6 from RESEARCH.md.
  - AC: realised gains with FIFO lots from recorded Sell trades.
  - AC: dividends per position from Budget income in the "Investment Returns › Dividends" sub-category, matched by name.
  - AC: UI in Analysis → "Returns": portfolio TWR from snapshots (method shown); XIRR per broker and portfolio from dated flows (Budget transfers to and from brokers or exchanges, plus today's value); realised gains and dividends per holding.
  - AC: every number shows how it was computed.
- [ ] **B2 Cash-flow forecast** (`forecast.js`).
  - AC: daily projected balance per bank account and in total for 30, 90 and 365 days.
  - AC: built from active recurring series (income and expenses), net of entries already logged this month.
  - AC: what-if scenarios (name, amount, date or monthly), each toggled on or off and saved in `data.forecastScenarios`.
  - AC: a "lowest point" warning when the total goes below 0 or below a threshold.
  - AC: a Budget → Forecast tab.
  - AC: unit tests.
- [ ] **B3 X-ray rules** (`xray.js`).
  - AC: rules for single-position concentration, broker/exchange concentration, currency cluster (look-through where splits exist), crypto share, emergency-fund coverage, TER fee drag, stale prices and loan share.
  - AC: every threshold editable and each rule switchable, saved in `data.settings.xray`.
  - AC: "not applicable" when there is no data.
  - AC: results shown in Analysis, and failing rules feed Action required.
  - AC: unit tests.
- [ ] **B4 Transaction rules engine** (`rules.js`).
  - AC: rule = conditions (name contains / is / starts with; amount between; account is; type is) plus actions (category and sub-category, rename, mark recurring).
  - AC: stored in `data.txRules`.
  - AC: applied on manual add (pre-fill) and on import (before learned categories), with a badge naming the rule.
  - AC: a "preview: N past transactions match" and "apply to them" dialog with checkboxes.
  - AC: case-insensitive matching.
  - AC: unit tests.
- [ ] **B5 Apple Pay pre-fill link.**
  - AC: `#add=expense&amount=12.50&merchant=…` (and `?add=` for compatibility) opens the add-transaction sheet pre-filled, with rules and learned category applied. It never saves on its own.
  - AC: the link is removed from the address bar afterwards.
  - AC: `docs/apple-pay-shortcut.md` with honest limits (Safari vs Home Screen app storage).
- [ ] **B7 Apply to holdings.**
  - AC: setting "Update holdings when I record a trade", off by default.
  - AC: when on, Buy/Sell/Convert shows a confirmation sheet with the changes (quantity, average price, broker cash), applies them, offers undo for 10 s, and records FIFO realised gains on Sell.
  - AC: nothing changes when off.

## Tier C

- [ ] **C New navigation (beta)** on branch `overnight/navigation`.
  - AC: setting off by default.
  - AC: Home · Money · Wealth (Overview/Cash/Investments/Debts) · Plan (Goals/Emergency/Insights) · More.
  - AC: old `goPage()` ids still work.
  - AC: phone tabs ≤ 5.

## Tier D (smallest first, if time)

- [ ] **Data-quality score** in Action required.
- [ ] **Historical FX** (Frankfurter v2, `providers=ecb`), cached per day.
- [ ] **Box 3 estimate** (off by default).
- [ ] **Emergency pack export.**
- [ ] **Command palette** (Cmd+K).
- [ ] **Insight cards** plus price-increase detection.

## Phase 4 — GitHub (files only; nothing activated that needs a secret)

- [ ] `ci.yml`, `codeql.yml`, `dependabot.yml`, issue templates, pull-request template, cache-version check.
- [ ] `docs/integrations/` templates: nightly backup to the private repo, Supabase keep-alive, server-side daily snapshot, price/FX cache job, Claude Code routine.
