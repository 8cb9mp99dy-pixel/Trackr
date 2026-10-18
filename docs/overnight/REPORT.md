# Overnight report — 18 Oct 2026

Everything is on local branches. **Nothing was pushed and `main` is untouched**, so the live app is exactly as you left it.

I didn't push because `gh` isn't installed on this Mac, and your rules say to skip pushing in that case. That also means no draft pull requests and no GitHub issues were created.

## 1. Try it in 5 minutes

```
cd ~/Desktop/Claude\ Code/Trackr
git switch overnight/2026-10-18      # everything except the new navigation
node tools/dev/serve.js 8080         # then open http://127.0.0.1:8080
```

- **Opening it.** 127.0.0.1 is a separate address from your live app, so your real data isn't there. To test with invented data: `npm ci` once, then `npx playwright test`. Or paste `tests/fixtures/demo-data.json` into Settings → Backup & Restore → restore a JSON backup, but do that **only on 127.0.0.1**.
- **Things to look at:**
  - Budget → Forecast
  - Analysis → X-ray and Returns
  - Budget → Categories → Rules
  - Cmd+K (Jump to…)
  - an account page → Edit
- **Settings to switch on:** Settings → Display → **Category budgets (beta)**, **Update holdings when I record a trade**, **Dutch box 3 estimate**.
- **New navigation:** run `git switch overnight/navigation`, then Settings → Display → **New navigation (beta)**.
- **Before / after screenshots:** `docs/overnight/screens/before/` and `docs/overnight/screens/after/`, with the same file names.

## 2. Done (branch `overnight/2026-10-18` unless noted)

| What | Commit |
|---|---|
| **Brokers and exchanges editable** (your request during the night): Edit on every account page; an exchange rename carries through every place its name is stored | 26b0d2f |
| Goal photos inside JSON and Excel backups; old backups still restore | c87cd76 |
| Category budgets back as a Settings beta (off); one entry point for categories; one shared allocation card | c87cd76 |
| Notification centre (in Action required), app badge, calendar reminders (.ics); weekly summary no longer counts transfers | f6aa5cb |
| **Returns:** TWR (time-weighted return), XIRR (money-weighted return), Modified Dietz, FIFO realised gains, dividends per holding, each labelled with its method | 6f2b099 |
| **Budget → Forecast:** 30/90/365 days, what-if scenarios, lowest point | 9104775 |
| **X-ray:** 9 checks with editable thresholds, shown in Action required (snooze 30 days) | 4a8b366 |
| **Transaction rules:** if/then rules, preview, apply to ticked past transactions; used when adding and importing | dfa0ddf |
| Apple Pay quick-add link (pre-fills, never saves) + `docs/apple-pay-shortcut.md` | 694e72c |
| "Apply to holdings" for Buy/Sell/Convert (off by default, asks first, undo) | 33ab84a |
| Tests: old-format migration, every page, eye, loan never in net worth, offline | 49adf99 |
| Data-quality score · Dutch box 3 estimate (off) · emergency pack · Cmd+K · Overview insights | 3658a43 · c99f087 · 13bd815 · bf30329 · 39e8727 |
| CI, CodeQL, Dependabot, issue and PR templates · integration templates (not active) · CLAUDE.md | a6fdac2 · 25e6095 · f83ec95 |
| **New navigation (beta)**: Home · Money · Wealth · Plan + More (branch `overnight/navigation`) | 12d30a8 |

**Tests:** 37 unit tests and 70 end-to-end tests, at desktop and phone width, all passing. There are no console errors on any page.

**Docs:** RESEARCH.md, PLAN.md (answers your 4-part brief), BACKLOG.md and DECISIONS.md are in `docs/overnight/`. The feature map was rebuilt at `docs/trackr-feature-map.pdf`.

## 3. Not done, and why

- **Historical FX** (converting each transaction at the rate of its own date). It touches about 60 totals at once and needs its own reviewed branch; the design is in BACKLOG.md.
- **Goal photos in the Mac's daily Excel backup** (`tools/backup.js`). Building and checking it needs the real Supabase, which was off-limits tonight. Photos *are* in the app's own JSON and Excel backups.
- **App side of the server-side snapshots.** Only the SQL, the function and the security review are written.
- **Pushing, pull requests, issues:** no `gh` on this Mac.

## 4. Decisions for you (my recommendation in brackets)

1. **Edit brokers and exchanges.** Ship it now by cherry-picking 26b0d2f onto main? (Yes — it's self-contained and tested.)
2. **Merge `overnight/2026-10-18` into main**, then try the navigation beta separately? (Yes, after a quick look. Everything new is either additive or behind a switch that's off.)
3. **X-ray adds its failing checks to "Action required"** (5 instead of 2 on the test data). Keep that, or show X-ray only in Analysis? (Keep it, and snooze or turn off the checks you don't care about.)
4. **Your Twelve Data API key** is written in `app.js` defaults, and `loan.js` holds your real loan figures. Both are already public on GitHub. Replace the key and keep it in Settings only? (Yes. I didn't touch either.)
5. **Server-side snapshots** (`docs/integrations/server-snapshot`). Turn on? (Later: it needs your sync secret stored as a Supabase function secret. Read its security review first.)
6. **Install `gh`** (`brew install gh` then `gh auth login`) so future nights can push branches and open draft pull requests? (Yes, if you want PRs to review on your phone.)

## 5. Risks, data shape and sync

**New keys,** all added by `deepDefaults`. An old document still loads unchanged, which `migration.spec.js` checks:
- `exchangeLogos`, `forecastScenarios`, `txRules`;
- `settings.budgetLimitsBeta`, `applyTradesToHoldings`, `xray`, `xraySnooze`, `box3`, `forecastUsual`, `forecastFloor`;
- `settings.newNav` (navigation branch only).

No field was removed.

**Kept on each device, not synced:** the notification log, dismissed insights, and the weekly-summary "seen" state.

**Backups:**
- JSON and Excel backups now include an `_photos` part. The importer takes it out before loading, so it never enters your data.
- An **encrypted backup** (from the emergency pack) can be restored only with its passphrase.

**Changes that touch existing data:**
- **Renaming an exchange** rewrites its name in holdings, purchases, stakes, cash, transfers, plans and history keys.
- **Applying a rule to the past** changes the category and name of the transactions you tick.
- **"Apply to holdings"** changes quantities and cash.

All three have 10 s of undo and are e2e-tested.

**The loan** is untouched in net worth everywhere, and this is tested. It appears only in X-ray ("loan covered") and in the box 3 estimate, where it can be switched off.

**Independent review.** A fresh reviewer, who saw only the diff, the rules and PLAN.md, found **no critical issue**. It found 5 important issues and 12 minor ones. All 5 important ones are fixed and covered by new tests. Of the minor ones, 10 are fixed and 2 are kept on purpose (DECISIONS.md, entries 30–31):

- **Photos:** a restore now never downgrades your full-size photos.
- **Exchange merge:** renaming an exchange into another one never overwrites its cash.
- **Rules:** a rule that only renames no longer turns off learned categories on import.
- **Rule editor:** "Tick all" now only ticks the rows you can see.
- **Navigation branch:** rebased so it holds everything.

## 6. Top 10 by value against effort (from PLAN.md)

Value and effort are scored 1–5. Score = value × 2 − effort.

| # | Item | Value | Effort | Score | Status |
|---|---|---|---|---|---|
| 1 | Transaction rules engine | 5 | 3 | 7 | done |
| 2 | Cash-flow forecast + what-ifs | 5 | 3 | 7 | done |
| 3 | Apple Pay pre-fill link | 4 | 1 | 7 | done |
| 4 | X-ray checks | 4 | 2 | 6 | done |
| 5 | Notification centre | 4 | 2 | 6 | done |
| 6 | Returns: XIRR/TWR, realised gains, dividends | 4 | 3 | 5 | done |
| 7 | New navigation (beta) | 4 | 3 | 5 | done (own branch) |
| 8 | Historical FX (ECB rates via Frankfurter) | 3 | 2 | 4 | not done |
| 9 | Emergency pack | 3 | 2 | 4 | done |
| 10 | Apply trades to holdings | 4 | 4 | 4 | done (off by default) |
