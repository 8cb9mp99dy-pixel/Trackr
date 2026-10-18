#!/usr/bin/env node
/* Builds tests/fixtures/demo-data.json — an INVENTED Trackr document used by tests and
   screenshots. Every name and amount is made up ("Demo Bank", "Sample Broker"…); nothing comes
   from real data. Deterministic: dates are counted back from a fixed day (FIXTURE_TODAY) so the
   file never changes between runs.

     node tools/dev/make-fixture.js            → writes tests/fixtures/demo-data.json
     node tools/dev/make-fixture.js --old      → writes tests/fixtures/old-format.json: the same
                                                  data without the keys added since Oct 2026, to
                                                  test that old documents still load. */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
const defs = require('../app-defaults.js')();

const FIXTURE_TODAY = '2026-10-18';
const day0 = new Date(FIXTURE_TODAY + 'T12:00:00Z');
const ymd = n => { const d = new Date(day0); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const iso = n => ymd(n) + 'T10:00:00.000Z';
const clone = v => JSON.parse(JSON.stringify(v));

const accounts = [
  { id: 'acc_demo1', icon: '🏦', name: 'Demo Bank Current', currency: 'EUR', balance: 1834.25, description: 'Invented account', logo: '', logoKind: 'emoji', color: '#3B5BDB', visibleInTotals: true, balanceCheckedAt: iso(3),
    pockets: [{ id: 'pk_demo1', icon: '✈️', name: 'Trip fund', amountSaved: 420, targetAmount: 1200, color: '#E8963C' }] },
  { id: 'acc_demo2', icon: '💰', name: 'Demo Savings', currency: 'EUR', balance: 3150, description: '', logo: '', logoKind: 'emoji', color: '#4FA6D9', visibleInTotals: true, balanceCheckedAt: iso(45),
    pockets: [{ id: 'pk_demo2', icon: '🛟', name: 'Rainy day', amountSaved: 900, targetAmount: 2000, color: '#22B573' }] },
  { id: 'acc_demo3', icon: '💳', name: 'Travel Card (GBP)', currency: 'GBP', balance: 85.4, description: '', logo: '', logoKind: 'emoji', color: '#8E6CEF', visibleInTotals: true, balanceCheckedAt: iso(10), pockets: [] },
];
const brokers = [
  { id: 'brk_demo1', name: 'Sample Broker', cashBalance: 140.5, cashCurrency: 'EUR', logo: '', cashInterestRate: 2.0, yearlyFee: 0 },
  { id: 'brk_demo2', name: 'Example Invest', cashBalance: 12, cashCurrency: 'EUR', logo: '', yearlyFee: 0 },
];
const A = (id, ticker, name, assetType, isin, priceCurrency, currentPrice, extra) => Object.assign({ id, ticker, name, assetType, isin, priceCurrency, currentPrice, manualPrice: null, priceUpdatedAt: iso(1), logo: '' }, extra || {});
const assets = [
  A('as_world', 'WRLD', 'Demo World Equity ETF', 'ETFs', 'IE00B4L5Y983', 'EUR', 104.2, { feePct: 0.2 }),
  A('as_sp', 'DSP5', 'Demo S&P 500 ETF', 'ETFs', 'IE00B5BMR087', 'EUR', 612.4, { feePct: 0.07 }),
  A('as_gold', 'DGLD', 'Demo Gold ETC', 'Gold', 'DE000A0S9GB0', 'EUR', 118.9, { feePct: 0 }),
  A('as_stock', 'DEMO', 'Demo Tech Corp', 'Stocks', 'US0000000001', 'USD', 212.5),
  A('as_pe', 'DPE', 'Demo Private Equity Fund', 'Private Equity', '', 'EUR', null, { manualPrice: 1050, priceUpdatedAt: iso(40) }),
];
const assetEntries = [
  { id: 'en_1', assetId: 'as_world', broker: 'brk_demo1', quantity: 24, price: 92.1, currency: 'EUR' },
  { id: 'en_2', assetId: 'as_world', broker: 'brk_demo2', quantity: 6, price: 98.4, currency: 'EUR' },
  { id: 'en_3', assetId: 'as_sp', broker: 'brk_demo1', quantity: 1.5, price: 540, currency: 'EUR' },
  { id: 'en_4', assetId: 'as_gold', broker: 'brk_demo1', quantity: 4, price: 101.3, currency: 'EUR' },
  { id: 'en_5', assetId: 'as_stock', broker: 'brk_demo2', quantity: 2, price: 180, currency: 'USD' },
  { id: 'en_6', assetId: 'as_pe', broker: 'brk_demo1', quantity: 1, price: 1000, currency: 'EUR' },
];
const cryptoAssets = [
  { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin', mode: 'snapshot', logo: '',
    snapshots: [{ id: 'cs_1', broker: 'Demo Exchange', quantity: 0.012, price: 52000, currency: 'EUR' }],
    currentPriceEUR: 61000, currentPriceUSD: 66500, manualPrice: null, priceAuto: true, priceUpdatedAt: iso(1),
    stakes: [] },
  { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum', mode: 'lots', logo: '', snapshots: [],
    currentPriceEUR: 2300, currentPriceUSD: 2510, manualPrice: null, priceAuto: true, priceUpdatedAt: iso(1),
    stakes: [{ id: 'st_1', exchange: 'Demo Exchange', amount: 0.4, apy: 3.5, compounding: true, since: ymd(120), lockedUntil: '', unbondingDays: 2, rewardsReceived: null, note: '' }] },
];
const cryptoLots = [
  { id: 'cl_1', symbol: 'ETH', broker: 'Demo Exchange', date: ymd(300), quantity: 0.5, amountPaid: 900, currency: 'EUR' },
  { id: 'cl_2', symbol: 'ETH', broker: 'Demo Exchange', date: ymd(90), quantity: 0.2, amountPaid: 420, currency: 'EUR' },
];
const cryptoExchangeCash = [{ id: 'cec_1', exchange: 'Demo Exchange', amount: 35, currency: 'EUR', interestBearing: false, interestRate: null }];

// Six months of invented budget lines.
const tx = [];
let n = 0;
const T = (type, amount, daysAgo, categoryId, comment, extra) => tx.push(Object.assign({ id: 'tx_' + (++n), type, amount, currency: 'EUR', date: ymd(daysAgo), categoryId, subCategoryId: null, comment, accountId: 'acc_demo1', nature: 'Variable', paymentMethodId: 'pm_card', location: '', description: '', logo: '', impact: '' }, extra || {}));
for (let m = 0; m < 6; m++) {
  const b = m * 30;
  T('income', 950, b + 2, 'inc_salary', 'Campus Cafe Job', { subCategoryId: 'sci_campusjob', nature: 'Fixed', paymentMethodId: 'pm_transfer', recurringId: 'rs_income_campuscafejob' });
  T('income', 300, b + 4, 'inc_family', 'Family allowance', { subCategoryId: 'sci_allowance', nature: 'Fixed', paymentMethodId: 'pm_transfer', recurringId: 'rs_income_familyallowance' });
  T('expense', 520, b + 3, 'exp_housing', 'Student Room Rent', { subCategoryId: 'sc_rent', nature: 'Fixed', paymentMethodId: 'pm_dd', recurringId: 'rs_expense_studentroomrent' });
  T('expense', 9.99 + (m < 2 ? 2 : 0), b + 6, 'exp_subscriptions', 'StreamBox', { subCategoryId: 'sc_streaming', nature: 'Fixed', recurringId: 'rs_expense_streambox' });
  T('expense', 64 + m * 7, b + 8, 'exp_food', 'Fresh Market', { subCategoryId: 'sc_groceries' });
  T('expense', 38 + (m % 3) * 11, b + 15, 'exp_food', 'Fresh Market', { subCategoryId: 'sc_groceries' });
  T('expense', 27.5, b + 11, 'exp_transport', 'Rail Pass Top-up', { subCategoryId: 'sc_publictransport' });
  T('expense', 18 + m * 2, b + 19, 'exp_restaurants', 'Corner Bistro', { subCategoryId: 'sc_diningout' });
  if (m % 2 === 0) T('expense', 45, b + 22, 'exp_gifts', 'Gift Shop', { subCategoryId: 'sc_gifts' });
  T('transfer', 50, b + 5, null, 'To Trip fund', { from: 'acc:acc_demo1', to: 'pk:acc_demo1:pk_demo1', fromLabel: 'Demo Bank Current', toLabel: 'Demo Bank Current › Trip fund', accountId: null, paymentMethodId: null });
  if (m < 3) T('transfer', 100, b + 9, null, 'Monthly ETF money', { from: 'acc:acc_demo1', to: 'brk:brk_demo1', fromLabel: 'Demo Bank Current', toLabel: 'Sample Broker (cash)', accountId: null, paymentMethodId: null });
}
T('income', 6.4, 40, 'inc_invret', 'Demo World Equity ETF dividend', { subCategoryId: 'sci_dividends', paymentMethodId: 'pm_transfer' });
T('expense', 189, 70, 'exp_travel', 'Budget Airline', { subCategoryId: 'sc_flights' });

const recurring = {};
['rs_income_campuscafejob', 'rs_income_familyallowance', 'rs_expense_studentroomrent', 'rs_expense_streambox'].forEach(id => {
  const last = tx.filter(t => t.recurringId === id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  recurring[id] = { day: +last.date.slice(8, 10), lastMonth: last.date.slice(0, 7), stopped: false };
});

// 75 days of invented history (net worth drifting up).
const history = [];
for (let i = 75; i >= 1; i--) {
  const nw = 9800 + (75 - i) * 14 + Math.round(Math.sin(i / 4) * 90);
  history.push({ date: ymd(i), netWorth: nw, portfolioValue: 5200 + (75 - i) * 8,
    byType: { ETFs: 3900 + (75 - i) * 6, Gold: 470, Stocks: 380, 'Private Equity': 1050, Crypto: 1650, Cash: 5400 },
    pos: { 'e:en_1': 2300 + (75 - i) * 4, 'e:en_3': 880 + (75 - i), 'acc:acc_demo1': 1700, 'c:BTC@Demo Exchange': 700 + (i % 9) * 6 } });
}

const loan = {
  id: 'loan_demo', name: 'Demo study loan', principal: 4000, rate: 2.5, myRate: 1.5, startDate: '2026-01-15', deferralType: 'total',
  deferralEndDate: '2030-12-31', deferralMonths: '', capitalization: 'semiannual', repayMonths: 96, spent: 300, spentAs: 'spent',
  investedAmount: 3700, investDate: '2026-01-20', scenarios: '3, 5, 7', holdings: [], statements: [{ id: 'ls_1', date: '2026-07-01', capitalDue: 4000, interest: 49.5, note: 'Invented statement' }],
  history: [{ date: ymd(30), value: 3790, cost: 3700 }, { date: ymd(1), value: 3862, cost: 3700 }],
  portfolio: { brokers: ['Loan Broker Demo'], positions: [
    { id: 'lp_1', broker: 'Loan Broker Demo', name: 'Demo Global Bond ETF', isin: 'IE00BDBRDM35', group: 'Bonds', invested: 1200, value: 1185, target: 30, expectedReturn: 3, quantity: '', price: '', priceAt: '', valueDate: ymd(2) },
    { id: 'lp_2', broker: 'Loan Broker Demo', name: 'Demo World Equity ETF', isin: 'IE00B4L5Y983', group: 'World equities', invested: 2500, value: 2677, target: 70, expectedReturn: 7, quantity: '', price: '', priceAt: '', valueDate: ymd(2) },
  ] },
};

const doc = {
  settings: { defaultCurrency: 'EUR', showCents: true, showPerformanceIndicators: true, compactMode: false, privacyMode: false, eurUsdRate: 1.09, eurUsdRateAuto: false,
    notifications: { budgetLimitAlerts: true, negativeBalanceWarning: true, weeklySummary: true, goalAchieved: true }, fxRates: { USD: 1.09, GBP: 0.84, CHF: 0.95 } },
  categories: { income: clone(defs.BUDGET_CATEGORIES_TEMPLATE.income), expense: clone(defs.BUDGET_CATEGORIES_TEMPLATE.expense),
    asset: [{ id: 'at_stocks', name: 'Stocks' }, { id: 'at_etfs', name: 'ETFs' }, { id: 'at_crypto', name: 'Crypto' }, { id: 'at_pe', name: 'Private Equity' }, { id: 'at_gold', name: 'Gold' }, { id: 'at_re', name: 'Real Estate' }, { id: 'at_other', name: 'Other' }] },
  paymentMethods: clone(defs.DEFAULT_PAYMENT_METHODS),
  accounts, budgetTransactions: tx, brokers, assets, assetEntries,
  investmentTransactions: [{ id: 'it_1', date: ymd(20), action: 'Buy', ticker: 'WRLD', quantity: 2, unitPrice: 101.5, currency: 'EUR', accountKey: 'broker:brk_demo1' }],
  cryptoAssets, cryptoLots, trades: [
    { id: 'tr_1', instrument: 'DEMO-PERP', tradeType: 'Perpetual Swap', direction: 'Long', platform: 'Demo Exchange', currency: 'USD', quantity: 0.5, entryPrice: 100, currentPrice: 104, leverage: 5, collateral: 10, stopLoss: 95, takeProfit: 120, status: 'open', openDate: ymd(6), closeDate: null, closePrice: null, notes: '' },
  ],
  cryptoExchangeCash, loans: [loan], budgetLimits: { exp_food: 220, exp_restaurants: 60 },
  liabilities: [{ id: 'li_1', name: 'Demo credit card', institution: 'Demo Bank', kind: 'Credit card', amount: 120, currency: 'EUR', rate: 0, note: 'Invented' }],
  targetAllocation: { ETFs: 60, Gold: 10, Stocks: 10, Crypto: 10, 'Private Equity': 10 },
  goals: [
    { id: 'g_demo1', name: 'Summer trip', icon: '✈️', target: 1200, targetDate: '2027-06-30', links: ['pk:acc_demo1:pk_demo1'], pocket: 'pk:acc_demo1:pk_demo1', photos: [], description: 'Invented goal', details: 'Where: Somewhere sunny', link: '', createdAt: iso(120) },
    { id: 'g_demo2', name: 'First 20k', icon: '🎯', target: 20000, targetDate: '2029-12-31', links: [], monthly: 250, photos: [], createdAt: iso(200) },
  ],
  emergencyFund: { enabled: true, months: 4, links: ['acc:acc_demo2', 'pk:acc_demo2:pk_demo2'], excludeCats: ['exp_gifts', 'exp_travel'] },
  investPlans: [{ id: 'plan_1', accountKey: 'broker:brk_demo1', asset: 'a:as_world', amount: 100, day: 9, startMonth: '2026-08', lastMonth: '2026-09' }],
  recurring,
  history,
  updatedAt: iso(0),
};

const out = path.join(root, 'tests', 'fixtures');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'demo-data.json'), JSON.stringify(doc, null, 1));
console.log(`Wrote tests/fixtures/demo-data.json (${tx.length} transactions, ${history.length} days of history)`);
if (process.argv.includes('--old')) {
  // "Before October 2026": none of the keys added since (goals, liabilities, emergencyFund…),
  // history without per-holding values, settings without notifications.
  const old = clone(doc);
  ['liabilities', 'targetAllocation', 'goals', 'emergencyFund', 'investPlans', 'recurring', 'budgetLimits', 'investmentTransactions'].forEach(k => delete old[k]);
  old.history.forEach(h => { delete h.pos; delete h.byType; });
  delete old.settings.notifications; delete old.settings.fxRates;
  old.cryptoAssets.forEach(c => { delete c.stakes; });
  old.loans.forEach(l => { delete l.portfolio; });
  fs.writeFileSync(path.join(out, 'old-format.json'), JSON.stringify(old, null, 1));
  console.log('Wrote tests/fixtures/old-format.json');
}
