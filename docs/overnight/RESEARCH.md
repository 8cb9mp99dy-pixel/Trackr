# Research — 18 Oct 2026

Three parallel research passes: wealth and portfolio apps, budgeting and cash-flow apps, and technical, data and tax topics. Each pass read official sites, docs, GitHub source and changelogs.

Web content was treated as data. **"unverified"** marks anything the official sources did not confirm. Ghostfolio, Wealthfolio and Firefolio are **AGPL-3.0**, so Trackr re-implements their *ideas* from the formulas noted here and copies no code.

---

## Wealth & portfolio apps

### 1. Finary

**Worth stealing**
- **Goals with a computed status.** A goal has a target, a date, an optional contribution and frequency, and linked assets. Finary computes the annual return the goal *needs* and compares it with what the asset mix can deliver.
  - Statuses: On track, Challenging, Overshooting, Overfunded, Underfunded, Completed, Overdue.
  - Levers offered: change the contribution, the date or the target, or link more assets.
  - Source: [help](https://help.finary.com/en/articles/15301061-creating-and-tracking-my-goals).
- **No double counting.** An asset linked to several goals is split between them: the safety net (cash only) is funded first, then the other goals by nearest date. Same source.
- **One line per product** (since 25 June 2026), even when a contract holds several funds. Source: [update](https://finary.com/fr/actualites-produit/un-portefeuille-repense-et-un-cap-pour-avancer).
- **Fee scanner.** Fund TER plus contract fees, shown as one %, with cheaper alternatives suggested. How alternatives are chosen is *unverified*. Source: [help](https://help.finary.com/en/articles/6521721-what-are-hidden-fees).
- **Passive income.** A 12-month projection from payment history, with confirmed and expected payments kept apart, on a calendar. Sources: [insights](https://finary.com/en/insights/dividend-tracker), [update](https://finary.com/en/product-updates/track-your-dividends).
- **Wealth simulator.** Two classes (stocks / other), each with its own return and tax; a withdrawal rate (4% is the benchmark) and inflation. Source: [simulator](https://finary.com/en/simulateur-de-patrimoine).

**For Trackr**
- **Goal status.** A pure `goalStatus()` that solves the required rate by bisection and compares it with the expected return per linked asset type.
- **Funding order.** Emergency fund first, then goals by date.
- **Fees.** A TER per ISIN, a weighted portfolio TER, € per year, and a 10- or 20-year drag shown as an estimate.

**Avoid**
- An opaque diversification score. Forum users report it penalises world indexes; *unverified*, see the [forum](https://community.finary.com/t/score-diversification-geographique/8406).
- Paywalls and upsell.

### 2. Kubera

**Worth stealing**
- **Balance sheet.** Assets and debts on one page, with a daily snapshot from the first day. Source: [home](https://www.kubera.com/).
- **Dead Man's Switch.**
  - After 90 days of inactivity Kubera emails a Check-In.
  - With no response to 5 notifications over 10 days, the emergency contact gets an Excel file and a ZIP of documents.
  - The download link stays valid for 3 months.
  - Source: [help](https://help.kubera.com/article/10-ensure-safe-transfer-portfolio-to-beneficiary).
- **Documents vault.** Kubera says explicitly *not* to store passwords there. Source: [blog](https://www.kubera.com/blog/which-important-financial-documents-should-you-safekeep).
- **Inline currency entry** (`EUR 500`). Source: [help](https://help.kubera.com/article/11-portfolio-with-multiple-currency-support).

**For Trackr**
- **Handover pack instead of a switch.** A zero-backend app can't send email, so offer:
  - a printable summary plus a JSON backup;
  - an in-app "not reviewed for N days" reminder.
- **Recap.** A period table: start, end, net flows, market change. The loan stays out of net worth.

**Avoid**
- Anything that suggests Trackr contacts someone automatically.

### 3. Ghostfolio

**Correction to the brief.** Ghostfolio's README advertises *Return on Average Investment* (ROAI). Its `twr` and `mwr` calculator classes only throw "Method not implemented". Sources: [README](https://github.com/ghostfolio/ghostfolio/blob/main/README.md), [twr](https://github.com/ghostfolio/ghostfolio/blob/main/apps/api/src/app/portfolio/calculator/twr/portfolio-calculator.ts).

**X-ray rules.** Defaults come from [`rule-settings.ts`](https://github.com/ghostfolio/ghostfolio/blob/main/apps/api/src/models/rules/rule-settings.ts). Each rule can be switched on or off and its thresholds edited.

| Category | Rule | Default |
|---|---|---|
| Liquidity | BuyingPower | min 0 |
| Emergency fund | Setup / Coverage | set, and covered |
| Currency cluster | Largest currency ≠ base · largest currency share | max 50% |
| Asset class | Equity / Fixed income | 78–82% / 18–22% |
| Account cluster | Largest account share · single account | max 50% |
| Markets | Developed / Emerging | 68–72% / 28–32% |
| Regions | NA / Europe / EM / Japan / APAC | 65–69 / 11–15 / 8–12 / 4–6 / 2–3% |
| Fees | fees ÷ total buy + sell volume | max 1% |

**Notes**
- **Currency rules use the listing currency.** A EUR-listed world ETF counts as 100% EUR, which is misleading.
- **Other features.** A FIRE calculator with closed-form monthly compounding and safe withdrawal rates (SWR) of 2.5–4.5%, plus benchmarks and a dividend timeline. Sources: [fire service](https://github.com/ghostfolio/ghostfolio/blob/main/libs/ui/src/lib/fire-calculator/fire-calculator.service.ts), [CHANGELOG](https://github.com/ghostfolio/ghostfolio/blob/main/CHANGELOG.md).

**For Trackr**
- **Rule shape.** An array of `{key, defaults, slider, evaluate(ctx, settings) → {ok, text}}`, with per-rule on/off and thresholds saved in settings.
- **Defaults.** EU-sensible, seeded from the user's own target allocation.
- **Currency rule.** Look-through by ISIN where the user filled in the splits.
- **Fees rule.** The main one is TER-weighted cost, since order fees at low-cost EU brokers are about €0–1.
- **Loan rule.** "Loan-funded share of the portfolio".
- **No data.** A rule without data shows "not applicable" rather than failing.

### 4. Wealthfolio

The repository is now at `github.com/wealthfolio/wealthfolio`.

**Worth stealing**
- **Local-first.** Source: [README](https://github.com/wealthfolio/wealthfolio/blob/main/README.md).
- **Honest returns.** TWR (time-weighted return) is chain-linked. IRR (internal rate of return) is found by bisection and annualised. The method and a data-quality flag appear next to each number.
  - Holdings-snapshot accounts only show value vs cost. Mixing them into TWR once produced returns of thousands of percent.
  - Sources: [engine](https://github.com/wealthfolio/wealthfolio/blob/main/docs/architecture/portfolio-engine.md), [semantics](https://github.com/wealthfolio/wealthfolio/blob/main/docs/features/performance-semantics-design.md).
- **Activity types.** BUY, SELL (FIFO), DEPOSIT, WITHDRAWAL, DIVIDEND, INTEREST, FEE, TAX…, with a table of each type's effect on cash, holdings, cost basis and net contribution. Source: [activity-types](https://github.com/wealthfolio/wealthfolio/blob/main/docs/activities/activity-types.md).
- **CSV import.** Column mappings saved per account, row fingerprints for de-duplication, a prompt when DD/MM is ambiguous, and Draft / Needs review states. Source: [guide](https://wealthfolio.app/docs/guide/csv-import/).
- **Goals.**
  - Each account funds goals by percentage, at most 100% in total.
  - Projection with ±2% scenarios.
  - Statuses: on track; at risk (projected 90–100% of target); off track (below 90%).
  - Source: [goals](https://wealthfolio.app/docs/guide/goals/).
- **Addons.**
  - Fees tracker addon: [link](https://github.com/wealthfolio/wealthfolio-addons/tree/main/official/investment-fees-tracker-addon).
  - Swingfolio trading journal (win rate, profit factor, expectancy, drawdown, P/L calendar heatmap): [link](https://github.com/wealthfolio/wealthfolio-addons/tree/main/official/swingfolio-addon).
- **Greedy cash-flow-only rebalancer.** Source: [rebalance](https://github.com/wealthfolio/wealthfolio/blob/main/docs/features/allocations/rebalance-algorithm.md).

**For Trackr**
- Label every return with its method.
- Trackr's holdings are *snapshot entries* without dates. So a real per-holding IRR is only possible where dated flows exist: crypto lots, recorded trades, plans, and Budget transfers to brokers. Everything else stays "value vs cost". This matters for B1.

### 5. Firefolio

Firefolio is the closest match to Trackr's stack. Source: [repo](https://github.com/diogogithub/firefolio).

**Structure.** One build-free `app.js` holds a pure engine that is also exported to Node (`module.exports`) and tested with `node:test`. Imports are keyed by content hash.

**Analytics**
- **TWR.** Daily return r = (Vₜ − Vₜ₋₁ − Fₜ) / Vₜ₋₁, chain-linked.
- **MWR / XIRR.** ACT/365.25 day count, bisection over [−99%, +1000%].
- **Modified Dietz.** (V₁ − V₀ − ΣF) / (V₀ + Σ wᵢFᵢ), with wᵢ = (T − tᵢ)/T.
- **New-money planner.** The contribution is split pro rata across positive deficits to target.
- **"Doctor".** Data-quality score = 100 − 22·critical − 7·warning − 1·info. Nudges can be snoozed for 30 days.

**Avoid**
- Skipping "big flow" days in TWR, which biases it.
- Drawdown on raw value; use the TWR index instead.
- Silently valuing unpriced holdings at cost.

---

## Budgeting & cash-flow apps

### 1. Actual Budget

**Rules model.** Source: [rules.ts](https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/shared/rules.ts), [docs](https://actualbudget.org/docs/budgeting/rules/).
- Rules run in stages pre / default / post. Within a stage they rank by specificity, so `is` comes before `contains`.
- **Condition fields:** payee, imported_payee, notes, amount (inflow/outflow), date, category, account.
- **Operators:** is, contains, oneOf, matches (regex), isapprox, isbetween, gt/lt.
- **Actions:** set any field, split, link-schedule, prepend/append notes.
- The rule editor shows the transactions that currently match, and "Apply actions" runs a rule on existing ones.

**Schedules.** Source: [schedules](https://actualbudget.org/docs/schedules).
- Amount can be exact, approximate (±7.5%) or a range. Dates match within ±2 days.
- "Find schedules" suggests them from history.

**Sync.** CRDT (conflict-free replicated data type) with a hybrid logical clock and a Merkle trie. Overkill for one user: per-record `updatedAt` is enough. Source: [crdt](https://github.com/actualbudget/actual/blob/master/packages/crdt/src/crdt/timestamp.ts).

**For Trackr**
- **Rules engine.** A JSON rule `{conditions:[{field, op, value}], actions:[{field, value}]}` and one evaluator used on manual add and on import.
- **Raw bank text.** Keep it alongside the cleaned name.
- **Live preview.** Show "N transactions match" while editing a rule.
- **Recurring.** Add an amount tolerance to recurring series.

### 2. Monarch Money

- **Cash-flow Sankey.** A savings-rate tile, transfers excluded, and a shareable image with amounts hidden. Sources: [reports](https://help.monarch.com/hc/en-us/articles/21846787088916-Using-Reports), [blog](https://www.monarch.com/blog/visualize-your-cash-flow-like-never-before).
- **Weekly recap.** Spending and what drove it, subscription changes, and net-worth change over the week. Source: [winter release](https://www.monarch.com/blog/winter-release).
- **Recurring calendar.** Paid as expected, paid a different amount, upcoming, missed. Source: [help](https://help.monarch.com/hc/en-us/articles/4890751141908-Tracking-Recurring-Expenses-and-Bills).
- **Forecast.** Baseline is the 12-month average, with defaults of 3% inflation, 7% on investments and 3% on cash. Scenarios and events can be added. Source: [forecasting](https://help.monarch.com/hc/en-us/articles/48344305092244-Forecasting-in-Monarch).
- **Goals.** On track / ahead / at risk. A "spending reduces progress" flag suits an emergency fund that refills. Source: [goals 3.0](https://help.monarch.com/hc/en-us/articles/44373110771860-Introducing-Goals-3-0).
- **For Trackr:**
  - Write recaps from fixed templates rather than AI.
  - Let the user choose the averaging window (3 or 6 months), since a student's income changes every semester.
  - Skip US retirement maths.

### 3. Copilot Money

- **Categorisation.**
  - It kicks in only after 30 transactions have been reviewed, and only auto-applies when confident.
  - Learned categories carry a visible badge.
  - The top-2 suggestions are pinned first in the category picker.
  - Source: [help](https://help.copilot.money/en/articles/8182433-copilot-intelligence-for-spending).
- **Recurrings.** Matched on a constant name fragment, an amount range and a date window, with several per merchant allowed. Source: [help](https://help.copilot.money/en/articles/3783499-optimizing-recurrings).
- **Month and Year in Review.** Shareable slides. Source: [help](https://help.copilot.money/en/articles/10310024-month-and-year-in-review).
- **For Trackr.** Give learned categories a confidence score (share of past transactions with that name that got the category). Auto-apply at ≥0.8 with at least 3 examples; below that, show a suggestion chip.

### 4. PocketSmith

- **Forecast.** Today's balance plus every scheduled event on its date, per day. Non-bill budgets land in full on their first day, and early payments are double-counted. Source: [troubleshooting](https://learn.pocketsmith.com/article/1247-troubleshooting-the-calendar-and-forecast-graph).
- **Scenarios.** What-if layers that hold only the *difference*, toggled on and off. Source: [scenarios](https://learn.pocketsmith.com/article/1248-everything-you-need-to-know-about-scenarios-in-pocketsmith).
- **For Trackr.** `forecast(day) = balance today + remaining recurring occurrences + active scenario events`.
  - Net out occurrences already logged this month.
  - Spread variable spending by day rather than landing it all on one date.
  - Cap the horizon at 12 months.

### 5. Lunch Money

- **Rules.** Source: [rules](https://support.lunchmoney.app/setup/rules).
  - **Conditions:** payee (contains, starts with, exact), amount (between, =, <, >), day-of-month range, account, category.
  - **Actions:** rename, set category, tags, link recurring, mark reviewed, delete placeholder.
  - **Preview:** "Create & Apply" shows the existing transactions that would change and lets you deselect some first.
- **Recurring statuses.** Linked, overdue, upcoming. Source: [recurring](https://support.lunchmoney.app/finances/recurring-items/the-basics-of-recurring).
- **Multi-currency.** Each transaction keeps its own currency and is converted at its date's rate. Source: [multicurrency](https://support.lunchmoney.app/settings/multicurrency).
- **For Trackr.** Match payees *case-insensitively*, since EU bank exports mix cases. Keep one clear order: rules first, then learned categories.

### 6. YNAB

- **Age of Money.** "How many days go by, on average, between earning your money and when you spend it". It averages the last 10 outflows, excludes transfers, and 30–50 days is good. Oldest-money-first is *unverified*. Sources: [support](https://support.ynab.com/en_us/age-of-money-H1ZS84W1s), [blog](https://www.ynab.com/blog/what-is-the-ideal-age-of-money).
- **Targets.** "Refill up to" vs "set aside another". Source: [targets](https://www.ynab.com/blog/ynab-targets).
- **For Trackr.**
  - Age of Money as a buffer number, computed with FIFO income buckets and shown only once there are 10 outflows.
  - "Unassigned this month → move to pocket/goal" instead of full envelope budgeting.

### 7. Apple Wallet "Transaction" automation (Shortcuts, iOS 17+)

- **Trigger.** Runs when you tap a chosen card. It provides the card, the merchant and the amount. Sources: [Apple](https://support.apple.com/guide/shortcuts/transaction-trigger-apd65c67538a/ios), [Cassinelli](https://matthewcassinelli.com/shortcuts-automations-ios-ipados-transaction-display-stage-manager/).
- **Runs without asking.** Transaction is on Apple's list of triggers that can run silently. Source: [Apple](https://support.apple.com/guide/shortcuts/create-a-new-personal-automation-apdfbdbd7123/ios).
- **Reliability.**
  - Merchant is sometimes blank and amount sometimes 0, and Apple says these values are system-provided ([forum](https://developer.apple.com/forums/thread/797233)).
  - It can fire for declined payments ([forum](https://developer.apple.com/forums/thread/850369)).
  - It can time out ([forum](https://developer.apple.com/forums/thread/765516)).
- **Opening a URL.** "Open URLs" opens a URL ([Apple](https://support.apple.com/guide/shortcuts/use-another-apps-url-scheme-apd68802640c/ios)). It probably opens **Safari, not the installed Home Screen app**, and the two don't share storage (*unverified*).
- **For Trackr.**
  - Pre-fill only; never save automatically.
  - If the link opens in Safari, the page can't reach the app's data. Copying a pre-filled link, or reading the clipboard in the installed app, is the safe path.
  - The CSV import stays the source of truth: match Apple Pay entries by amount ±2 days so they aren't duplicated.

---

## Technical, data sources and tax

### 1. Notifications on iPhone and Mac Home Screen web apps (EU)

**What works today**
- **Web Push**
  - Available since iOS 16.4, only for apps added to the Home Screen, and only after a user tap ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). iOS 18.4 added Declarative Web Push ([WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/)).
  - In the EU, Apple removed Home Screen web apps in the iOS 17.4 betas, then **reversed** that on 1 March 2024 ([The Register](https://www.theregister.com/2024/02/16/apple_web_apps/), [Notificare](https://notificare.com/blog/2024/03/08/apple-reverse-decision-to-remove-pwa/)).
  - No primary source shows a later removal, but 2026 guides disagree, so EU push is *unverified*. Test it on your own iPhone.
- **Badging API:** `navigator.setAppBadge(n)` works in Home Screen apps, but only after notification permission is granted ([WebKit](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/)). Mac Dock apps get push and badges ([WebKit](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)).
- **No background work:** Background Sync and Periodic Sync are unsupported in every Safari version ([caniuse](https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/background-sync.json)). Nothing can run while the app is closed.

**Why push doesn't fit Trackr:** push needs a server holding the VAPID key (the sender's identity) and your subscription. Trackr has no backend.

**Design adopted**
1. **In-app notification centre.** Checks run on open, on every change and when the app becomes visible. Alerts are de-duplicated and have read/unread state.
2. **App badge** = unread count, where supported, "as of last open".
3. **`.ics` calendar file.** Events with a stable UID, an RRULE (repeat rule) and a VALARM (alarm). The calendar fires the reminders even while Trackr is closed.
4. **Share sheet** for the weekly summary.

### 2. Return maths (used by B1)

- **XIRR**
  - Σ Pᵢ (1+r)^(−tᵢ) = 0, with tᵢ = (dᵢ − d₁)/365. Newton's method, falling back to bisection.
  - Excel: guess 0.1, 100 iterations; `#NUM!` without at least one positive and one negative flow ([Microsoft](https://support.microsoft.com/en-us/office/xirr-function-de1242ec-6477-445b-b11b-a303ad9adc9d)).
- **Test cases**
  - Case 1 is Microsoft's published example. Cases 2–5 come from two independent solvers that agree to 1e-12 but weren't re-run in Excel.

| # | Cash flows | Expected |
|---|---|---|
| 1 | 2008-01-01 −10000; 2008-03-01 2750; 2008-10-30 4250; 2009-02-15 3250; 2009-04-01 2750 | 0.373362535 |
| 2 | 2024-01-01 −1000; 2025-01-01 1100 | 0.099714 |
| 3 | 2025-01-15 −1000; 2025-06-30 −500; 2026-03-01 1400 | −0.068653 |
| 4 | 2025-01-01/02-01/03-01/04-01 −200 each; 2025-12-31 900 | 0.144172 |
| 5 | 2021-01-01 −1000; 2022-01-01 2300; 2023-01-01 −1320 | two roots: 0.10 (guess 0.1), 0.20 (guess 0.25) |

- **TWR from snapshots, end-of-day flows:** rₜ = (Vₜ − Fₜ)/Vₜ₋₁ − 1, chain-linked. Annualise only for a span of 1 year or more. Moves between your own places are not external flows.
- **Modified Dietz:** R = (V₁ − V₀ − ΣF)/(V₀ + Σ wᵢFᵢ), with wᵢ = (T − tᵢ)/T.
- **Test 6:** 1000 on 1 Jan 2026; 1050 then +500 on 31 Mar; 1500 then −200 on 30 Jun; 1400 on 31 Dec. Expected: TWR 0.094293, Modified Dietz 0.078330, XIRR 0.078653.

### 3. Dutch box 3, 2026

Checked on [belastingdienst.nl](https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/berekening-box-3-inkomen-2026) on 18 Oct 2026.

**Figures**
- **Tax-free allowance:** €59,357 per person (€118,714 with a fiscal partner). ✔
- **Rate:** 36%. ✔
- **Deemed returns:**
  - savings 1.28% (✔ *provisional*);
  - other assets 6.00% (✔ final);
  - debts 2.70% (✔ *provisional*, set early 2027).
- **Debt threshold:** €3,800 per person.
- **Reference date:** 1 January 00:00 ([source](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/vermogen_en_aanmerkelijk_belang/vermogen/belasting_betalen_over_uw_vermogen/waarde_en_peildatum)).

**Method**
1. Deemed return = 1.28%·bank + 6%·other − 2.70%·max(0, debts − 3,800).
2. Base = bank + other − max(0, debts − 3,800).
3. Taxable = deemed return × (base − 59,357)/base.
4. Tax = 36% of taxable.

**Actual-return rebuttal (tegenbewijs):** if your real return is lower, the lower figure applies ([source](https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/wat-is-mijn-werkelijk-rendement)).

**Real-return system:** **not law yet**.
- The Tweede Kamer passed it on 12 Feb 2026 ([SRA](https://www.sra.nl/nieuws/004501/2026/02/tweede-kamer-akkoord-met-nieuw-box-3-stelsel-vanaf-2028)).
- The Senate postponed its vote on 30 Jun 2026 ([Eerste Kamer](https://www.eerstekamer.nl/nieuws/20260630/senaat_houdt_stemming_box_3_wet)).
- A Kamerbrief of 29 Sep 2026 proposes a capital-gains tax on securities from 2028 ([Deloitte](https://www.deloitte.com/nl/nl/services/tax/perspectives/kamerbrief-toekomst-box-3.html)).

**DUO study loan**
- It **is** a box 3 debt, unless it can still become a gift (prestatiebeurs) ([source](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/vermogen_en_aanmerkelijk_belang/vermogen/wat_zijn_uw_bezittingen_en_schulden/uw_schulden/wat_zijn_uw_schulden)). Only the part above €3,800 counts.
- **Trackr's invested bank loan:** in the box 3 *estimate* it is a debt. That is the only place it appears, and it never enters net worth.

**France:** forms 3916/3916-bis apply to people "domiciliées ou établies en France" ([notice](https://static.impots.gouv.fr/tdir/static/2026-03-30T16:36:08Z/aide/notices/notices2020/3916/notice3916.pdf)).
- A genuine non-resident has no obligation.
- **But** a student under 25 attached to the parents' French tax household must have his foreign accounts on the parents' 3916. Check with the SIP; *unverified* for your situation.

**Luxembourg:** no wealth tax on individuals since 2006 ([ACD](https://impotsdirects.public.lu/content/dam/acd/fr/legislation/legi06/Eval__53.pdf)).

### 4. Free keyless data sources (tested 18 Oct 2026)

- **Frankfurter** `https://api.frankfurter.dev` ([docs](https://frankfurter.dev/))
  - v2 is current: `/v2/rates?base=EUR&quotes=USD&date=…` or `from/to`.
  - By default it blends 104 providers; pass `providers=ecb` for ECB reference rates.
  - v1 (`/v1/2024-01-02`) is deprecated but kept.
  - CORS `*`, no quotas.
- **OpenFIGI:** the mapping endpoint works without a key (25 requests/min), but **CORS blocks browsers**: it only allows openfigi.com. Trackr can't call it from the app, so it's rejected for in-app use ([docs](https://www.openfigi.com/api/documentation)).
- **justETF:** there is no API, its terms forbid automated price queries, and pages send no CORS header. Use manual TER entry plus a link instead ([T&Cs](https://www.justetf.com/documents/justETF_general_terms_and_conditions.pdf)).
- **CoinGecko** (keyless): CORS `*`, `/market_chart` and `/history` endpoints, **last 365 days only** without a key. Rate limits are IP-based and unpublished (a 429 came after about 5 quick calls). Cache, and back off on 429 ([docs](https://docs.coingecko.com/v3.0.1/reference/coins-id-market-chart)).
