# Plan — answer to the 4-part brief

Inputs: the feature map (rebuilt from the source; it is now at `docs/trackr-feature-map.pdf`), RESEARCH.md, and a fresh read of every script.

**Abbreviations**
- **TWR**: time-weighted return. Performance with deposits and withdrawals taken out.
- **XIRR / MWR**: money-weighted return. The yearly rate that makes your dated cash flows add up; Excel calls it XIRR.
- **TER**: total expense ratio, a fund's yearly cost.
- **FX**: exchange rates.
- **PWA**: progressive web app.
- **ECB**: European Central Bank.

---

## Part 1 — Deepen each existing page

**Overview**
- **Insight cards.** Short lines such as "Groceries +35% vs your 3-month average", "StreamBox went up €2", "Cash idle at Sample Broker for 60 days". They are written from fixed templates, never AI. *Why:* you see what changed without opening four pages.
- **Single cash summary.** The account chips duplicate Wealth and Accounts. Replace them with one "Cash" line that links to the Cash tab.
- **Shared allocation component.** Allocation is drawn three different ways today; use one component everywhere (see Part 3).
- **Method label on performance.** Show "value vs cost" today, and TWR or XIRR once B1 lands. *Why:* honest numbers, as Wealthfolio does.

**Wealth**
- **Period-change table.** Start, end, money added, market change (the Kubera "recap").
- **Data-quality badge.** The share of values checked recently. This feeds Action required.
- **Inline currency entry** ("USD 1200") in value fields.

**Goals**
- **Required-return status** (Finary): "needs 9%/yr, your mix delivers about 5% → Challenging".
- **±2% scenario band** on the projection (Wealthfolio).
- **Funding order** when goals share money: emergency fund first, then the nearest target date.
- **Runway** in the Emergency tab: months you could live on liquid money at your real spending, with the categories you excluded honoured.

**Analysis**
- **X-ray rules** with editable thresholds (B3). They replace the static diversification text and feed Action required.
- **Fees.** A TER-weighted portfolio cost and a 10- or 20-year drag estimate.
- **Passive income.** Separate "received" from "expected" on a 12-month calendar.
- **Simulator.** Add an inflation toggle and a safe-withdrawal-rate line (Ghostfolio's FIRE maths).
- **Box 3 helper** (off by default). An estimate on the 1 January figures. The loan counts as a debt there: this is the only place it appears, and it is not net worth.

**Budget**
- **Rules engine** (B4): "if name contains X and amount between A and B → category, rename, recurring". Applied on add and on import, with a preview.
- **Forecast** (B2): daily projected balance for 30/90/365 days, what-if scenarios toggled on and off, and a lowest-point warning.
- **Recurring calendar states.** Paid, paid a different amount, upcoming, missed. Plus price-increase detection.
- **Confidence on learned categories.** Auto-apply only at ≥0.8 with at least 3 examples; otherwise show a suggestion chip.
- **Budgets** back on behind a setting (A5).
- **Age of Money**, YNAB-style, shown once there are 10 or more outflows.

**Investments and account pages**
- **Apply to holdings** for Buy/Sell/Convert, off by default (B7). Closes the double entry.
- **Realised gains** (FIFO), **dividends per position**, and **XIRR per holding** where dated flows exist (B1).
- **New-money planner**: "where should my next €250 go?" (Firefolio).

**Trading**
- **Journal stats** on closed trades: win rate, profit factor, expectancy, P/L calendar (Swingfolio).

**Settings**
- **Notification centre** settings (A4).
- **New navigation (beta)** toggle (C).
- **Emergency pack export.**

## Part 2 — Brand-new features

- **Cash-flow forecast with what-ifs.** Projected balance for the next 30/90/365 days from recurring items, a lowest-point warning, and scenarios you toggle.
- **Transaction rules engine.** Your own if/then rules, applied when adding and importing, previewed before they change anything.
- **X-ray.** Concentration, broker, currency, crypto share, emergency coverage, fee drag and stale prices, each with an editable threshold.
- **Real returns.** XIRR and TWR, realised gains and dividends, labelled with their method.
- **Apple Pay quick-add.** A link that only pre-fills the add sheet. Shortcuts guide in `docs/apple-pay-shortcut.md`.
- **Emergency pack.** A printable summary plus a JSON backup to hand to family. Trackr never sends it.
- **Historical FX** (Frankfurter, ECB rates). Old transactions convert at the rate of their own date.
- **Command palette** (Cmd+K). Jump to any page, holding or account, or "add transaction".
- **Notification centre.** One list for alerts and Action required, with read/unread, the app badge where supported, and optional `.ics` calendar reminders ("check balances", "1 January snapshot").
- **Year in review.** Swipeable cards; amounts hidden when the eye is off.
- **Data-quality score.** "82% of your values were checked in the last 30 days".
- **Box 3 estimate.** Off by default, every rate editable.

**Rejected**
- **CRDT sync.** One user doesn't need it; last-writer-wins plus the existing conflict prompt is enough.
- **ML categorisation.** Frequency-based confidence gives most of the benefit.
- **Dead-man email switch.** Impossible without a server, and the rules forbid Trackr contacting anyone.
- **Envelope budgeting as the default.** It doubles data entry; "unassigned → pocket" is enough.
- **AI-written recaps.**

## Part 3 — New navigation

### Problems today
1. **Balances shown three times.** Accounts, Wealth and the Overview chips all show bank balances.
2. **Three allocation views.** The Investments breakdown, the Wealth donut and the Overview card are each built differently.
3. **Recurring scanner twice.** In Budget → Recurring and again in Analysis.
4. **Category editor twice.** In Budget → Categories and in Settings. It is the same code, but two entry points.
5. **Pages hidden on the phone.** Goals, Analysis, Accounts and Trading sit under "More", although pockets (Accounts) drive Goals.

### Proposed structure (behind "New navigation (beta)"; every old page id keeps working)

```
Trackr
├── Home            (Overview)          insights · net worth · ticker · recap/week cards · history · performance
├── Money           (Budget)            Transactions · Recurring (+ scanner) · Forecast · Totals · Categories · Import
├── Wealth                              Overview (net worth, allocation, period table)
│                                       Cash (old Accounts page: accounts + pockets)
│                                       Investments (old Investments page + account pages)
│                                       Debts (liabilities; loan shown, never counted)
├── Plan                                Goals · Emergency & runway · Insights (old Analysis: X-ray, fees,
│                                       passive income, simulator, profile)
└── More / desktop sidebar extras       Trading · Settings · Notification centre
```

Phone tabs (5): **Home · Money · Wealth · Plan · More**.
Desktop sidebar: Home, Money, Wealth, Plan, Trading, Settings, with the sub-tabs inside each page.

| Before | After |
|---|---|
| Overview | Home (account chips → one Cash line) |
| Wealth | Wealth → Overview |
| Accounts | Wealth → Cash |
| Investments | Wealth → Investments |
| Wealth → Liabilities | Wealth → Debts |
| Goals | Plan → Goals, Plan → Emergency |
| Analysis | Plan → Insights (its recurring scanner becomes a link to Money → Recurring) |
| Budget | Money (+ Forecast tab) |
| Settings → Categories | link to Money → Categories (same editor) |
| Trading | stays (desktop sidebar; More on phone) |
| 3 allocation views | one `allocationCardHtml` component, scoped by context |

## Part 4 — Top 10 by value against effort

Value and effort are scored 1–5. Score = value × 2 − effort.

| # | Item | Value | Effort | Score | Notes |
|---|---|---|---|---|---|
| 1 | Transaction rules engine (B4) | 5 | 3 | 7 | Imports become much less work |
| 2 | Cash-flow forecast + what-ifs (B2) | 5 | 3 | 7 | "Will I be short before payday?" |
| 3 | Apple Pay pre-fill link (B5) | 4 | 1 | 7 | Small; limits documented honestly |
| 4 | X-ray rules (B3) | 4 | 2 | 6 | Builds on existing analysis data |
| 5 | Notification centre (A4) | 4 | 2 | 6 | Makes the toggles real and keeps a history |
| 6 | Returns: XIRR/TWR, realised, dividends (B1) | 4 | 3 | 5 | Limited by undated holdings; labelled |
| 7 | New navigation beta (C) | 4 | 3 | 5 | Fixes the 5 overlaps |
| 8 | Historical FX (Frankfurter) | 3 | 2 | 4 | Keyless, CORS allowed, no quota (checked 18 Oct) |
| 9 | Emergency pack export | 3 | 2 | 4 | Nothing is sent automatically |
| 10 | Apply to holdings (B7) | 4 | 4 | 4 | Off by default; risk of data change |

Close behind: Box 3 helper (3/2), data-quality score (3/1), insight cards (3/2), command palette (2/2).

**Quick wins for half-built items**
- **Done before tonight** (17 Oct): compact mode, performance indicators, Trading import, notifications.
- **Tonight:**
  - goal photos in backups (A3);
  - Budgets behind a setting (A5);
  - one entry point each for the category editor and the recurring scanner, and one allocation component (A6);
  - weekly summary counts transfers as transactions → fix.

**Rule flags**
- **Apply to holdings** is fine because it is opt-in and never places an order (rule 3).
- **Apple Pay** must never save on its own (rule 3).
- **Box 3** shows the loan as a debt only inside that estimate (rule 4).
- **Every new number** goes through `fmtMoney` so the eye hides it (rule 5).
- **Supabase templates** are files only, never applied (rule 10).
- **Rejected for the rules:** a "Dead Man's Switch" that emails someone (rule 2/3 spirit), and anything social (rule 7).
