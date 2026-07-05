/* ===================== Constants ===================== */
const STORAGE_KEY = 'trackr-v1';

const THEMES = [
  { id: 'default', name: 'Default', sub: 'Indigo dark', swatches: ['#0A0A14', '#6C63FF', '#34C77B', '#E8963C'] },
  { id: 'maritime', name: 'Maritime', sub: 'Navy · Gold · Aqua', swatches: ['#163944', '#C79A5B', '#B8C4CC', '#6FA8AA'] },
  { id: 'emerald', name: 'Emerald Pine', sub: 'Forest · Lime · Green', swatches: ['#1B3A26', '#C7E36B', '#D9EFC8', '#6FBF7F'] },
  { id: 'arctic', name: 'Arctic', sub: 'Deep Teal · Mint · Warm Yellow', swatches: ['#16332E', '#8FE0C9', '#E8A93C', '#16332E'] },
  { id: 'palladian', name: 'Palladian', sub: 'Warm neutrals · Blue · Flame', swatches: ['#3A4356', '#EDE8DE', '#E0895A', '#EDE4D2'] },
  { id: 'neon', name: 'Neon Lime', sub: 'Black · Lime · Gray', swatches: ['#0A0A0A', '#C6E92F', '#FFFFFF', '#8A8A8A'] },
  { id: 'clean', name: 'Clean White', sub: 'Minimal · Light · Modern', swatches: ['#FFFFFF', '#12141C', '#9CA3AF'] },
];

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'];
const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£', CHF: 'Fr' };

const ACCOUNT_COLORS = ['#6C63FF', '#34C77B', '#E8963C', '#4FA6D9', '#E5484D', '#C79A5B', '#8FE0C9', '#EDE4D2', '#E0895A', '#C6E92F'];
const POCKET_COLORS = ['#6C63FF', '#34C77B', '#E8963C', '#4FA6D9', '#E5484D', '#C79A5B', '#8FE0C9', '#EDE4D2'];
// Full palette color picker (item 8) — a grid of curated colors plus a "More colors" custom
// swatch backed by a native <input type="color">, similar in spirit to the Microsoft 365
// color picker (a theme/standard grid + a custom-color option for anything outside it).
const FULL_COLOR_PALETTE = [
  ['#12141C', '#4B4F5A', '#8A8DA0', '#C7C9D6', '#EDE4D2', '#6C63FF', '#4FA6D9', '#34C77B', '#E8963C', '#E5484D'],
  ['#C79A5B', '#8FE0C9', '#E0895A', '#C6E92F', '#9B5DE5', '#F15BB5', '#00BBF9', '#00F5D4', '#FEE440', '#FF7A5C'],
];
const ASSET_TYPE_COLORS = { Stocks: '#6C63FF', ETFs: '#4FA6D9', Crypto: '#E8963C', 'Private Equity': '#C79A5B', Gold: '#E8A93C', 'Real Estate': '#34C77B', Other: '#8A8DA0' };
/* User-customizable override on top of the ASSET_TYPE_COLORS defaults (persisted per asset-type
   name in data.settings.assetTypeColors) — lets the Portfolio breakdown's colors be repainted
   from the same full palette used everywhere else, including for custom asset categories the
   user added themselves (which otherwise all fall back to the same gray). */
function assetTypeColor(type) {
  return (data.settings.assetTypeColors && data.settings.assetTypeColors[type]) || ASSET_TYPE_COLORS[type] || '#8A8DA0';
}
function setAssetTypeColor(type, color) {
  data.settings.assetTypeColors = data.settings.assetTypeColors || {};
  data.settings.assetTypeColors[type] = color;
  ui.assetColorPickerOpen = null;
  save(); render();
}
function toggleAssetColorPicker(type) { ui.assetColorPickerOpen = ui.assetColorPickerOpen === type ? null : type; render(); }
function saveAssetColorFromPicker(i, type) {
  const el = document.querySelector('#breakdown-color-picker-' + i + ' .swatch-dot.selected');
  if (!el) return;
  setAssetTypeColor(type, el.dataset.color);
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'accounts', label: 'Accounts', icon: '🏦' },
  { id: 'budget', label: 'Budget', icon: '🧾' },
  { id: 'investments', label: 'Investments', icon: '📈' },
  { id: 'trading', label: 'Trading', icon: '⚡' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];
// Common trade types + platforms, offered as datalist suggestions on top of a free-text field
// (like crypto exchange names elsewhere) — never a closed list, since leveraged/derivative
// products vary a lot by broker.
const TRADE_TYPES = ['Futures', 'CFD', 'Options', 'Forex', 'Perpetual Swap', 'Spot Margin', 'Other'];
const TRADE_DIRECTIONS = ['Long', 'Short'];
const COMMON_TRADING_PLATFORMS = ['Binance Futures', 'Bybit', 'IG', 'eToro', 'Interactive Brokers', 'MetaTrader'];

/* Single source of truth for budget categories — used both to seed defaultData() (fresh
   installs) and by migrateBudgetCategories() (existing saves, reconciled by id so nothing the
   user already added/renamed is ever touched, only missing icons/categories/subcategories are
   backfilled in). Keeping one copy avoids the two ever drifting apart. */
const BUDGET_CATEGORIES_TEMPLATE = {
  income: [
    { id: 'inc_salary', name: 'Salary', icon: '💼', subcategories: [] },
    { id: 'inc_freelance', name: 'Freelance', icon: '🧑‍💻', subcategories: [] },
    { id: 'inc_invret', name: 'Investment Returns', icon: '📈', subcategories: [] },
    { id: 'inc_rental', name: 'Rental Income', icon: '🏠', subcategories: [] },
    { id: 'inc_gifts', name: 'Gifts Received', icon: '🎁', subcategories: [] },
    { id: 'inc_other', name: 'Other', icon: '💰', subcategories: [] },
  ],
  expense: [
    { id: 'exp_housing', name: 'Housing', icon: '🏠', subcategories: [
      { id: 'sc_rent', name: 'Rent', icon: '🏠' }, { id: 'sc_mortgage', name: 'Mortgage', icon: '🏦' },
      { id: 'sc_utilities', name: 'Utilities', icon: '💡' }, { id: 'sc_homeinsurance', name: 'Home Insurance', icon: '🛡️' },
      { id: 'sc_maintenance', name: 'Maintenance', icon: '🔧' },
    ] },
    { id: 'exp_food', name: 'Food & Groceries', icon: '🛒', subcategories: [
      { id: 'sc_groceries', name: 'Groceries', icon: '🛒' }, { id: 'sc_coffeesnacks', name: 'Coffee & Snacks', icon: '☕' },
      { id: 'sc_delivery', name: 'Delivery', icon: '🛵' },
    ] },
    { id: 'exp_transport', name: 'Transport', icon: '🚗', subcategories: [
      { id: 'sc_fuel', name: 'Fuel', icon: '⛽' }, { id: 'sc_publictransport', name: 'Public Transport', icon: '🚌' },
      { id: 'sc_parking', name: 'Parking', icon: '🅿️' }, { id: 'sc_carmaintenance', name: 'Car Maintenance', icon: '🔧' },
      { id: 'sc_ridehailing', name: 'Ride-hailing', icon: '🚕' },
    ] },
    { id: 'exp_restaurants', name: 'Restaurants', icon: '🍽️', subcategories: [
      { id: 'sc_diningout', name: 'Dining Out', icon: '🍽️' }, { id: 'sc_takeaway', name: 'Takeaway', icon: '🥡' }, { id: 'sc_bars', name: 'Bars', icon: '🍹' },
    ] },
    { id: 'exp_subscriptions', name: 'Subscriptions', icon: '📱', subcategories: [
      { id: 'sc_streaming', name: 'Streaming', icon: '📺' }, { id: 'sc_software', name: 'Software', icon: '💻' },
      { id: 'sc_memberships', name: 'Memberships', icon: '🎫' }, { id: 'sc_news', name: 'News', icon: '📰' },
    ] },
    { id: 'exp_leisure', name: 'Entertainment', icon: '🎬', subcategories: [
      { id: 'sc_movies', name: 'Movies', icon: '🎬' }, { id: 'sc_concerts', name: 'Concerts', icon: '🎵' },
      { id: 'sc_games', name: 'Games', icon: '🎮' }, { id: 'sc_hobbies', name: 'Hobbies', icon: '🎨' },
    ] },
    { id: 'exp_shopping', name: 'Shopping', icon: '🛍️', subcategories: [
      { id: 'sc_clothing', name: 'Clothing', icon: '👕' }, { id: 'sc_electronics', name: 'Electronics', icon: '🔌' },
      { id: 'sc_homegoods', name: 'Home Goods', icon: '🛋️' },
    ] },
    { id: 'exp_health', name: 'Health', icon: '💊', subcategories: [
      { id: 'sc_doctor', name: 'Doctor', icon: '🩺' }, { id: 'sc_pharmacy', name: 'Pharmacy', icon: '💊' },
      { id: 'sc_healthinsurance', name: 'Insurance', icon: '🛡️' }, { id: 'sc_fitness', name: 'Fitness', icon: '🏋️' },
    ] },
    { id: 'exp_bills', name: 'Bills', icon: '🧾', subcategories: [{ id: 'sc_phone', name: 'Phone', icon: '📱' }, { id: 'sc_internet', name: 'Internet', icon: '📶' }] },
    { id: 'exp_savings', name: 'Savings', icon: '💵', subcategories: [
      { id: 'sc_emergencyfund', name: 'Emergency Fund', icon: '🛟' }, { id: 'sc_investmentcontrib', name: 'Investment Contribution', icon: '📈' },
    ] },
    { id: 'exp_travel', name: 'Travel', icon: '✈️', subcategories: [
      { id: 'sc_flights', name: 'Flights', icon: '✈️' }, { id: 'sc_hotels', name: 'Hotels', icon: '🏨' }, { id: 'sc_activities', name: 'Activities', icon: '🗺️' },
    ] },
    { id: 'exp_education', name: 'Education', icon: '📚', subcategories: [
      { id: 'sc_tuition', name: 'Tuition', icon: '🎓' }, { id: 'sc_books', name: 'Books', icon: '📚' }, { id: 'sc_courses', name: 'Courses', icon: '🧑‍🏫' },
    ] },
    { id: 'exp_personalcare', name: 'Personal Care', icon: '💅', subcategories: [
      { id: 'sc_haircare', name: 'Haircare', icon: '💇' }, { id: 'sc_cosmetics', name: 'Cosmetics', icon: '💄' }, { id: 'sc_spa', name: 'Spa', icon: '💆' },
    ] },
    { id: 'exp_gifts', name: 'Gifts & Donations', icon: '🎁', subcategories: [
      { id: 'sc_gifts', name: 'Gifts', icon: '🎁' }, { id: 'sc_charity', name: 'Charity', icon: '❤️' },
    ] },
    { id: 'exp_other', name: 'Other', icon: '📦', subcategories: [] },
  ],
};
const DEFAULT_PAYMENT_METHODS = [
  { id: 'pm_card', name: 'Card', icon: '💳' },
  { id: 'pm_transfer', name: 'Transfer', icon: '🏦' },
  { id: 'pm_cash', name: 'Cash', icon: '💵' },
  { id: 'pm_dd', name: 'Direct Debit', icon: '📝' },
];
function cloneJson(v) { return JSON.parse(JSON.stringify(v)); }

/* ===================== Default data ===================== */
function defaultData() {
  return {
    settings: {
      theme: 'default',
      defaultCurrency: 'EUR',
      showCents: true,
      showPerformanceIndicators: true,
      compactMode: false,
      privacyMode: false,
      eurUsdRate: 1.08, // used to blend USD crypto purchases into one EUR average price
      eurUsdRateAuto: true, // true = kept in sync from a live FX rate; false = manually overridden
      eurUsdRateUpdatedAt: null,
      // Used for ticker search + live stock/ETF prices in the Add/update position form.
      // Free tier at twelvedata.com — editable here in case you need to rotate it.
      twelveDataApiKey: '449bd06556804d5086f156ca66a74e12',
      notifications: {
        budgetLimitAlerts: true,
        negativeBalanceWarning: true,
        weeklySummary: false,
        goalAchieved: true,
      },
    },
    categories: {
      income: cloneJson(BUDGET_CATEGORIES_TEMPLATE.income),
      expense: cloneJson(BUDGET_CATEGORIES_TEMPLATE.expense),
      asset: [
        { id: 'at_stocks', name: 'Stocks' },
        { id: 'at_etfs', name: 'ETFs' },
        { id: 'at_crypto', name: 'Crypto' },
        { id: 'at_pe', name: 'Private Equity' },
        { id: 'at_gold', name: 'Gold' },
        { id: 'at_re', name: 'Real Estate' },
        { id: 'at_other', name: 'Other' },
      ],
    },
    paymentMethods: cloneJson(DEFAULT_PAYMENT_METHODS),
    accounts: [
      { id: 'acc_rabobank', icon: '🏦', name: 'Rabobank', currency: 'EUR', balance: 0, description: '', logo: 'assets/logos/Revolut.png', logoKind: 'emoji', color: '#6C63FF', visibleInTotals: true, pockets: [] },
      { id: 'acc_bunq', icon: '🏦', name: 'BUNQ', currency: 'EUR', balance: 0, description: '', logo: '', logoKind: 'emoji', color: '#34C77B', visibleInTotals: true, pockets: [] },
      { id: 'acc_revolut', icon: '🏦', name: 'Revolut', currency: 'EUR', balance: 21, description: '', logo: 'assets/logos/Revolut.png', logoKind: 'image', color: '#E8963C', visibleInTotals: true,
        pockets: [
          { id: 'pk_holidays', icon: '🎯', name: 'Holidays', amountSaved: 420, targetAmount: 1200, color: '#4FA6D9' },
        ] },
      { id: 'acc_traderepublic', icon: '🏦', name: 'Trade Republic', currency: 'EUR', balance: 613, description: '', logo: 'assets/logos/Trade_Republic.png', logoKind: 'image', color: '#E5484D', visibleInTotals: true,
        pockets: [
          { id: 'pk_emergency', icon: '🎯', name: 'Emergency fund', amountSaved: 1722, targetAmount: 3000, color: '#34C77B' },
        ] },
      { id: 'acc_bnp', icon: '🏦', name: 'BGL BNP Paribas', currency: 'EUR', balance: 2235.12, description: '', logo: 'assets/logos/BGL_BNP_Paribas.png', logoKind: 'image', color: '#C79A5B', visibleInTotals: true, pockets: [] },
    ],
    budgetTransactions: [],
    // cashBalance is uninvested cash sitting at that broker — it counts toward the broker's
    // total value and net worth, but (unlike positions) has no cost basis, so it's excluded
    // from P&L. cashInterestRate is informational (APY, shown next to the balance) — the app
    // doesn't simulate accrual over time, it just displays what you tell it.
    // Crypto exchanges (Binance, Coinbase, Bitstack, ...) are NOT registered here — they're
    // tracked as free-text names on crypto lots/snapshots instead (see cryptoBrokerNames()),
    // with their logo resolved via COMMON_EXCHANGE_LOGOS. Registering them as brokers too would
    // create zero-activity "ghost" entries cluttering the Stocks & ETFs Brokers list.
    brokers: [
      { id: 'brk_t212', name: 'Trading 212', logo: 'assets/logos/Trading_212_Invest.png', cashBalance: 214.20, cashCurrency: 'EUR', cashInterestBearing: true, cashInterestRate: 3.5 },
    ],
    // Each non-crypto asset is tracked once (ticker+type), with one or more broker "entries"
    // (broker, quantity, price paid, currency — no date, same snapshot idea as crypto). Quantity
    // and average price are always derived from those entries (see assetStats()), never stored
    // directly, so they recalculate live whenever an entry is added/edited/removed.
    assets: [
      { id: 'asset_vwce', ticker: 'VWCE', name: 'Vanguard FTSE All-World', assetType: 'ETFs', logo: '', priceCurrency: 'EUR', currentPrice: 112.4, manualPrice: null, priceUpdatedAt: null },
      { id: 'asset_aapl', ticker: 'AAPL', name: 'Apple Inc.', assetType: 'Stocks', logo: '', priceCurrency: 'USD', currentPrice: 191.3, manualPrice: null, priceUpdatedAt: null },
      { id: 'asset_nvda', ticker: 'NVDA', name: 'NVIDIA Corp.', assetType: 'Stocks', logo: '', priceCurrency: 'USD', currentPrice: 498.2, manualPrice: null, priceUpdatedAt: null },
    ],
    assetEntries: [
      { id: 'ae_1', assetId: 'asset_vwce', broker: 'brk_t212', quantity: 45, price: 108.2, currency: 'EUR' },
      { id: 'ae_2', assetId: 'asset_aapl', broker: 'brk_t212', quantity: 8, price: 178.5, currency: 'USD' },
      { id: 'ae_3', assetId: 'asset_nvda', broker: 'brk_t212', quantity: 3, price: 612.0, currency: 'USD' },
    ],
    investmentTransactions: [],
    // Each crypto asset is tracked in one of two modes:
    //  - 'snapshot': a per-broker holding snapshot — broker, quantity, avg price, currency, no
    //    date — for coins you don't want to log purchase-by-purchase but did buy across several
    //    exchanges (see asset.snapshots below).
    //  - 'lots': detailed purchase history (see cryptoLots below); quantity & average prices are
    //    always derived from those lots (see cryptoAssetStats()).
    // Prices are fetched live in USD and EUR (coingeckoId below); manualPrice/manualPriceCurrency
    // is a real user-entered override used only when a live price isn't available.
    cryptoAssets: [
      { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin', mode: 'snapshot',
        snapshots: [
          { id: 'snap_1', broker: 'Binance', quantity: 0.045, price: 51200, currency: 'EUR' },
          { id: 'snap_2', broker: 'Bitstack', quantity: 0.012, price: 49800, currency: 'EUR' },
        ],
        currentPriceUSD: null, currentPriceEUR: null, manualPrice: null, manualPriceCurrency: 'USD', priceAuto: true, priceUpdatedAt: null, logo: '' },
      { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum', mode: 'lots',
        currentPriceUSD: null, currentPriceEUR: null, manualPrice: null, manualPriceCurrency: 'USD', priceAuto: true, priceUpdatedAt: null, logo: '' },
      { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana', mode: 'lots',
        currentPriceUSD: null, currentPriceEUR: null, manualPrice: null, manualPriceCurrency: 'USD', priceAuto: true, priceUpdatedAt: null, logo: '' },
    ],
    cryptoLots: [
      { id: 'lot_3', symbol: 'ETH', broker: 'Binance', date: '2025-12-05', currency: 'EUR', amountPaid: 2412, quantity: 0.9 },
      { id: 'lot_4', symbol: 'SOL', broker: 'Coinbase', date: '2026-02-20', currency: 'USD', amountPaid: 1656, quantity: 12 },
    ],
    // Leveraged/derivative trades (futures, CFDs, options, forex, ...) — tracked separately from
    // the Investments page since these are margin/collateral positions, not outright ownership.
    trades: [],
    // Uninvested cash sitting at a crypto exchange (e.g. idle EUR/USDT on Binance) — the crypto
    // equivalent of a broker's cashBalance, kept separate since exchanges are free-text names,
    // not data.brokers records.
    cryptoExchangeCash: [],
    // Real daily snapshots of net worth & portfolio value, recorded automatically by save()
    // (today's entry is updated in place every time something changes; past days are frozen).
    // Starts empty — no fabricated history — and grows for real as you use the app.
    history: [],
    updatedAt: new Date().toISOString(),
  };
}

/* ===================== State ===================== */
let data = null;
let ui = {
  page: 'dashboard',
  budgetTab: 'transactions',
  budgetMonth: new Date(),
  dashboardNetWorthPeriod: '6M',
  dashboardPortfolioPeriod: '1M',
  modal: null,        // {type, payload}
  openAccountId: null, // expanded account card
  openBrokerId: null, // expanded broker sub-portfolio
  settingsOpenSections: {}, // every accordion starts collapsed
  investmentsTab: 'stocks', // 'stocks' | 'other' | 'crypto'
  tradingTab: 'open', // 'open' | 'closed'
  categoryEditOpen: null, // key of category/subcategory/payment-method currently being renamed
  emojiPickerOpen: null, // key of category/subcategory/payment-method with its icon picker open
  addingSubcatFor: null, // category id currently showing the "+ Sub-category" input
  txSuggestions: [], // name-match suggestions live-patched while typing in the tx form
};

function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
// No transaction history exists before this month — the Budget timeline can't be browsed
// earlier than this, but has no upper bound (future months are always reachable by paging
// forward, so the timeline naturally extends as time passes).
const BUDGET_MIN_MONTH = new Date(2026, 6, 1);

/* ===================== Persistence ===================== */
/* GitHub-as-a-database sync: a private GitHub repo (see Settings > GitHub Sync) holds this
   app's entire data as one JSON file, read/written via GitHub's Contents API. This is entirely
   separate from where the app's *code* lives (a public repo/GitHub Pages is fine — it never
   contains any personal data); only this device's own owner/repo/token config, kept in its own
   localStorage key (never synced anywhere), decides which private repo it talks to. Works from
   anywhere with internet — no local server to run, no same-WiFi requirement. */
const GH_SYNC_KEY = 'trackr-github-sync';
function loadGhSyncConfig() {
  try { return JSON.parse(localStorage.getItem(GH_SYNC_KEY)); } catch (e) { return null; }
}
function saveGhSyncConfig(cfg) { localStorage.setItem(GH_SYNC_KEY, JSON.stringify(cfg)); }
function clearGhSyncConfig() { localStorage.removeItem(GH_SYNC_KEY); }
/* atob/btoa are Latin1-only — this round-trips real UTF-8 (accents, emoji in category icons,
   transaction names, ...) through them safely. */
function utf8ToBase64(str) { return btoa(unescape(encodeURIComponent(str))); }
function base64ToUtf8(b64) { return decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))); }
let ghLastSha = null; // GitHub requires the file's current sha to accept the next update
async function ghFetchData() {
  const cfg = loadGhSyncConfig();
  if (!cfg) return null;
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}`, {
    headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' },
  });
  if (res.status === 404) return { json: null, sha: null };
  if (!res.ok) throw new Error('GitHub API error ' + res.status);
  const body = await res.json();
  return { json: JSON.parse(base64ToUtf8(body.content)), sha: body.sha };
}
async function ghPushData(jsonData, sha) {
  const cfg = loadGhSyncConfig();
  if (!cfg) return null;
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Update Trackr data', content: utf8ToBase64(JSON.stringify(jsonData)), sha: sha || undefined }),
  });
  if (!res.ok) throw new Error('GitHub API error ' + res.status);
  return (await res.json()).content.sha;
}
let syncPollTimer = null;
/* Every 30s, pick up changes saved from another device (e.g. an edit made on the iPhone while
   this tab is also open) without needing a manual refresh. Skips the swap while a modal is open
   so an in-progress edit is never yanked out from under the user; last-write-wins via
   data.updatedAt (an ISO string, so plain string comparison already sorts chronologically). */
function startSyncPolling() {
  if (syncPollTimer) return;
  syncPollTimer = setInterval(async () => {
    if (ui.modal) return;
    try {
      const remote = await ghFetchData();
      if (!remote) return;
      ghLastSha = remote.sha;
      if (remote.json && remote.json.updatedAt && (!data.updatedAt || remote.json.updatedAt > data.updatedAt)) {
        data = remote.json;
        migrateCryptoModel();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        render();
      }
    } catch (e) { /* offline or GitHub unreachable for a moment — retried automatically next tick */ }
  }, 30000);
}
async function load() {
  let loadedFromRemote = false;
  if (loadGhSyncConfig()) {
    try {
      const remote = await ghFetchData();
      ghLastSha = remote.sha;
      if (remote.json) {
        data = remote.json;
        migrateCryptoModel();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
        loadedFromRemote = true;
      }
    } catch (e) { console.error('GitHub sync unreachable, falling back to local data', e); }
  }
  if (!loadedFromRemote) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error('no data');
      data = JSON.parse(raw);
      migrateCryptoModel();
    } catch (e) {
      data = defaultData();
    }
    await save(); // persists locally + seeds GitHub (if configured) the first time
  }
  applyTheme();
  render();
  if (data.settings.eurUsdRateAuto !== false && eurUsdRateIsStale()) fetchEurUsdRate();
  fetchCryptoPrices();
  fetchAssetPrices();
  if (loadGhSyncConfig()) startSyncPolling();
}

/* Upgrades pre-existing saves (Crypto tracked as aggregated `positions`) to the
   lot-based model, without losing any previously-recorded quantity/value. */
const COMMON_COINGECKO_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano', XRP: 'ripple', DOGE: 'dogecoin',
  DOT: 'polkadot', LTC: 'litecoin', LINK: 'chainlink', AVAX: 'avalanche-2', TRX: 'tron',
  MATIC: 'matic-network', SHIB: 'shiba-inu', UNI: 'uniswap', ATOM: 'cosmos', BNB: 'binancecoin', TAO: 'bittensor',
};

function migrateCryptoModel() {
  if (data.settings.eurUsdRate == null) data.settings.eurUsdRate = 1.08;
  if (data.settings.eurUsdRateAuto == null) data.settings.eurUsdRateAuto = true;
  if (data.settings.eurUsdRateUpdatedAt === undefined) data.settings.eurUsdRateUpdatedAt = null;
  if (!data.settings.twelveDataApiKey) data.settings.twelveDataApiKey = '449bd06556804d5086f156ca66a74e12';
  // Replace fabricated demo history/watchlist from earlier versions with real tracking.
  if (!Array.isArray(data.history)) data.history = [];
  delete data.netWorthHistory;
  delete data.watchlist;
  if (!data.cryptoLots) {
    data.cryptoAssets = [];
    data.cryptoLots = [];
    const legacyCrypto = (data.positions || []).filter(p => p.assetType === 'Crypto');
    legacyCrypto.forEach(p => {
      if (!data.cryptoAssets.find(c => c.symbol === p.ticker)) {
        data.cryptoAssets.push({ symbol: p.ticker, name: p.name || p.ticker, manualPrice: p.manualPrice || null, manualPriceCurrency: 'EUR', legacyPriceEUR: p.currentPrice || p.avgPrice });
      }
      const broker = brokerById(p.brokerId);
      data.cryptoLots.push({
        id: uid('lot'), symbol: p.ticker, broker: broker ? broker.name : '', date: new Date().toISOString().slice(0, 10),
        currency: p.currency || 'EUR', amountPaid: p.quantity * p.avgPrice, quantity: p.quantity,
      });
    });
    data.positions = (data.positions || []).filter(p => p.assetType !== 'Crypto');
  }

  // Add cash tracking to any broker created before this existed.
  data.brokers.forEach(b => {
    if (b.cashBalance == null) b.cashBalance = 0;
    if (b.cashCurrency == null) b.cashCurrency = 'EUR';
    if (b.cashInterestBearing == null) b.cashInterestBearing = false;
    if (b.cashInterestRate === undefined) b.cashInterestRate = null;
  });
  // Per-asset logo, added after positions/crypto assets already existed for some users.
  // (data.positions itself may already be gone — migrateAssetsModel() deletes it once
  // converted below — so this only needs to guard, not backfill; asset logos are backfilled
  // in migrateAssetsModel() instead.)
  (data.positions || []).forEach(p => { if (p.logo == null) p.logo = ''; });
  data.cryptoAssets.forEach(c => { if (c.logo == null) c.logo = ''; });

  // Upgrade each asset to the live-price model (coingeckoId, USD+EUR live prices, mode).
  data.cryptoAssets.forEach(c => {
    if (c.mode == null) c.mode = 'lots';
    if (c.coingeckoId === undefined) c.coingeckoId = COMMON_COINGECKO_IDS[c.symbol] || null;
    if (c.currentPriceUSD === undefined) c.currentPriceUSD = null;
    if (c.currentPriceEUR === undefined || c.legacyPriceEUR != null) c.currentPriceEUR = c.legacyPriceEUR != null ? c.legacyPriceEUR : null;
    delete c.legacyPriceEUR;
    if (c.manualPriceEUR !== undefined) { // old singular EUR-only manual override
      if (c.manualPrice == null && c.manualPriceEUR != null) { c.manualPrice = c.manualPriceEUR; c.manualPriceCurrency = 'EUR'; }
      delete c.manualPriceEUR;
    }
    if (c.manualPriceCurrency == null) c.manualPriceCurrency = 'USD';
    if (c.priceAuto == null) c.priceAuto = true;
    if (c.priceUpdatedAt === undefined) c.priceUpdatedAt = null;
  });

  // One-time: fold Bitcoin's purchase history into per-broker snapshots (broker, quantity, avg
  // price, currency — no dates), since individual dated purchases are no longer wanted for BTC.
  // Preserves broker breakdown and real numbers; never resets to zero.
  const btc = cryptoAssetBySymbol('BTC');
  if (btc && btc.mode === 'lots' && !btc.snapshotConverted) {
    const btcLots = lotsFor('BTC');
    if (btcLots.length) {
      btc.snapshots = aggregateLotsToSnapshots(btcLots);
      data.cryptoLots = data.cryptoLots.filter(l => l.symbol !== 'BTC');
    }
    btc.mode = 'snapshot';
    btc.snapshotConverted = true;
  }

  // Any snapshot-mode asset still using the older single {quantity, price, currency} shape
  // (rather than per-broker rows) gets wrapped into one row — no data lost, just re-shaped.
  data.cryptoAssets.forEach(c => {
    if (c.mode === 'snapshot' && !Array.isArray(c.snapshots)) {
      c.snapshots = c.snapshotQuantity ? [{ id: uid('snap'), broker: '', quantity: c.snapshotQuantity, price: c.snapshotPrice || 0, currency: c.snapshotCurrency || 'EUR' }] : [];
    }
    delete c.snapshotQuantity; delete c.snapshotPrice; delete c.snapshotCurrency;
  });

  migrateAssetsModel();
  migrateGhostCryptoAssets();
  cleanupGhostCryptoBrokers();
  migrateBudgetCategories();
  migrateBudgetTransactions();
  migrateTradingModel();
}
function migrateTradingModel() {
  if (!Array.isArray(data.trades)) data.trades = [];
  if (!data.settings.assetTypeColors) data.settings.assetTypeColors = {};
  if (!Array.isArray(data.cryptoExchangeCash)) data.cryptoExchangeCash = [];
}

/* Reconciles existing saves against BUDGET_CATEGORIES_TEMPLATE / DEFAULT_PAYMENT_METHODS by
   id: backfills a missing icon, adds a category/subcategory the user doesn't have yet. Never
   touches `name` on anything that already exists — a category the user renamed keeps their
   name — and never removes anything, including categories the user added themselves that
   aren't in the template at all. */
function migrateBudgetCategories() {
  ['income', 'expense'].forEach(kind => {
    BUDGET_CATEGORIES_TEMPLATE[kind].forEach(tmplCat => {
      let cat = data.categories[kind].find(c => c.id === tmplCat.id);
      if (!cat) { data.categories[kind].push(cloneJson(tmplCat)); return; }
      if (cat.icon == null) cat.icon = tmplCat.icon;
      if (!Array.isArray(cat.subcategories)) cat.subcategories = [];
      (tmplCat.subcategories || []).forEach(tmplSub => {
        const sub = cat.subcategories.find(s => s.id === tmplSub.id);
        if (!sub) cat.subcategories.push(cloneJson(tmplSub));
        else if (sub.icon == null) sub.icon = tmplSub.icon;
      });
    });
    // Any category/subcategory that predates icons entirely (custom, user-added) gets a
    // generic fallback icon rather than staying undefined forever.
    data.categories[kind].forEach(c => {
      if (c.icon == null) c.icon = kind === 'income' ? '💰' : '📦';
      (c.subcategories || []).forEach(s => { if (s.icon == null) s.icon = c.icon; });
    });
  });
  DEFAULT_PAYMENT_METHODS.forEach(tmplPm => {
    const pm = data.paymentMethods.find(p => p.id === tmplPm.id);
    if (!pm) data.paymentMethods.push(cloneJson(tmplPm));
    else if (pm.icon == null) pm.icon = tmplPm.icon;
  });
  data.paymentMethods.forEach(pm => { if (pm.icon == null) pm.icon = '💳'; });
}
/* Backfills the new location/description/logo fields (item 10/8) on transactions logged
   before these existed — never fabricated, just empty until the user fills them in. */
function migrateBudgetTransactions() {
  data.budgetTransactions.forEach(t => {
    if (t.location == null) t.location = '';
    if (t.description == null) t.description = '';
    if (t.logo == null) t.logo = '';
  });
}

/* Earlier versions registered crypto exchanges as regular brokers purely so their name could
   be matched up for a logo — now redundant since cryptoBrokerLogo() already has a built-in
   fallback (COMMON_EXCHANGE_LOGOS) for exactly these exchanges. Those leftover records show up
   as confusing zero-activity "0 assets · €0.00" rows in the Stocks & ETFs Brokers list, so any
   broker whose name matches a crypto exchange AND genuinely has no stock holdings or cash is
   removed. A broker with any real activity (positions or cash) is never touched, even if it
   happens to share a name with a crypto exchange. */
function cleanupGhostCryptoBrokers() {
  const cryptoNames = new Set(cryptoBrokerNames().map(n => n.trim().toLowerCase()));
  data.brokers = data.brokers.filter(b => {
    const isCryptoNamed = cryptoNames.has(b.name.trim().toLowerCase());
    const isEmpty = !(b.cashBalance > 0) && positionsByBroker(b.id).length === 0;
    return !(isCryptoNamed && isEmpty);
  });
}

/* Upgrades pre-existing saves (Stocks/ETFs/other non-crypto holdings tracked as one flat
   record per broker) to the asset+entries model: one asset per ticker+type, with a broker
   entry per former record, so quantity/avg price recalculate live from those entries instead
   of being separately-editable fields. No data lost, just re-shaped. */
function migrateAssetsModel() {
  if (!data.assetEntries) {
    data.assets = [];
    data.assetEntries = [];
    (data.positions || []).forEach(p => {
      let asset = data.assets.find(a => a.ticker === p.ticker && a.assetType === p.assetType);
      if (!asset) {
        asset = { id: uid('asset'), ticker: p.ticker, name: p.name || p.ticker, assetType: p.assetType, logo: p.logo || '', priceCurrency: p.currency, currentPrice: p.currentPrice, manualPrice: p.manualPrice != null ? p.manualPrice : null };
        data.assets.push(asset);
      }
      data.assetEntries.push({ id: uid('ae'), assetId: asset.id, broker: p.brokerId || '', quantity: p.quantity, price: p.avgPrice, currency: p.currency });
    });
    delete data.positions;
  }
  data.assets.forEach(a => {
    if (a.logo == null) a.logo = '';
    if (a.manualPrice === undefined) a.manualPrice = null;
    if (a.priceUpdatedAt === undefined) a.priceUpdatedAt = null;
  });
}
/* Defensive cleanup: the shared "Add position" form used to let "Crypto" be picked as an asset
   type, which silently created the holding in the Stocks/ETFs data model (data.assets) instead
   of the crypto one — invisible everywhere (excluded from both the Stocks & ETFs and Other
   Assets tabs, never in the Crypto tab either) despite still counting in totals. That option no
   longer exists, but if any such ghost entry was already created, fold it into a real crypto
   asset (creating one if needed) so the holding becomes visible and gets live prices, instead
   of just deleting real quantity/cost data the user entered. */
function migrateGhostCryptoAssets() {
  const ghosts = data.assets.filter(a => a.assetType === 'Crypto');
  if (!ghosts.length) return;
  ghosts.forEach(a => {
    let asset = cryptoAssetBySymbol(a.ticker);
    if (!asset) {
      asset = {
        symbol: a.ticker, name: a.name || a.ticker, coingeckoId: COMMON_COINGECKO_IDS[a.ticker] || null, mode: 'snapshot', snapshots: [],
        currentPriceUSD: null, currentPriceEUR: null, manualPrice: a.manualPrice, manualPriceCurrency: a.priceCurrency === 'USD' ? 'USD' : 'EUR',
        priceAuto: true, priceUpdatedAt: null, logo: a.logo || '',
      };
      data.cryptoAssets.push(asset);
    }
    data.assetEntries.filter(e => e.assetId === a.id).forEach(e => {
      const brokerName = (brokerById(e.broker) || {}).name || e.broker || '';
      asset.snapshots.push({ id: uid('snap'), broker: brokerName, quantity: e.quantity, price: e.price, currency: e.currency });
    });
  });
  const ghostIds = new Set(ghosts.map(g => g.id));
  data.assetEntries = data.assetEntries.filter(e => !ghostIds.has(e.assetId));
  data.assets = data.assets.filter(a => !ghostIds.has(a.id));
}

/* Groups purchase lots by (broker, currency) into per-broker snapshot rows — used when
   switching a coin from detailed purchases to the simpler snapshot mode. */
function aggregateLotsToSnapshots(lots) {
  const groups = {};
  lots.forEach(l => {
    const key = (l.broker || '') + '|' + l.currency;
    if (!groups[key]) groups[key] = { id: uid('snap'), broker: l.broker || '', currency: l.currency, quantity: 0, amountPaid: 0 };
    groups[key].quantity += l.quantity;
    groups[key].amountPaid += l.amountPaid;
  });
  return Object.values(groups).map(g => ({ id: g.id, broker: g.broker, currency: g.currency, quantity: g.quantity, price: g.quantity ? +(g.amountPaid / g.quantity).toFixed(8) : 0 }));
}
/* Turns snapshot rows into purchase lots (today's date as a placeholder) — used when switching
   a coin from snapshot mode to detailed purchases. */
function snapshotsToLots(symbol, snapshots) {
  const today = new Date().toISOString().slice(0, 10);
  return (snapshots || []).filter(s => s.quantity).map(s => ({
    id: uid('lot'), symbol, broker: s.broker || '', date: today, currency: s.currency, amountPaid: s.quantity * s.price, quantity: s.quantity,
  }));
}

async function save() {
  data.updatedAt = new Date().toISOString();
  recordHistorySnapshot();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch (e) { console.error('save failed', e); }
  if (loadGhSyncConfig()) {
    try {
      ghLastSha = await ghPushData(data, ghLastSha);
    } catch (e) { console.error('GitHub sync push failed, changes stay local for now', e); }
  }
}

/* Upserts today's {netWorth, portfolioValue} into data.history. Real, not fabricated:
   today's entry always reflects the current state; once a day passes, that entry is
   frozen and a new one starts, so the Dashboard's "over time" charts are an honest
   (if initially sparse) record of your actual numbers. */
function recordHistorySnapshot() {
  if (!data.history) data.history = [];
  const today = new Date().toISOString().slice(0, 10);
  const netWorth = netWorthTotal();
  const pv = portfolioValue();
  const last = data.history[data.history.length - 1];
  if (last && last.date === today) {
    last.netWorth = netWorth;
    last.portfolioValue = pv;
  } else {
    data.history.push({ date: today, netWorth, portfolioValue: pv });
  }
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', data.settings.theme);
}

/* ===================== Live EUR/USD rate ===================== */
function eurUsdRateIsStale() {
  if (!data.settings.eurUsdRateUpdatedAt) return true;
  return (Date.now() - new Date(data.settings.eurUsdRateUpdatedAt).getTime()) > 60 * 60 * 1000; // 1h
}
async function fetchEurUsdRate() {
  ui.eurUsdRateFetching = true;
  ui.eurUsdRateFetchError = false;
  if (ui.page === 'investments') render();
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
    if (!res.ok) throw new Error('bad response');
    const json = await res.json();
    const rate = json.rates && json.rates.USD;
    if (!rate) throw new Error('no rate in response');
    data.settings.eurUsdRate = rate;
    data.settings.eurUsdRateAuto = true;
    data.settings.eurUsdRateUpdatedAt = new Date().toISOString();
    save();
    return true;
  } catch (e) {
    console.error('EUR/USD live rate fetch failed, keeping last known rate', e);
    ui.eurUsdRateFetchError = true;
    return false;
  } finally {
    ui.eurUsdRateFetching = false;
    if (ui.page === 'investments') render();
  }
}
function setEurUsdRateManual(v) {
  const rate = parseFloat(v);
  if (isNaN(rate) || rate <= 0) return;
  data.settings.eurUsdRate = rate;
  data.settings.eurUsdRateAuto = false;
  data.settings.eurUsdRateUpdatedAt = new Date().toISOString();
  save(); render();
}

/* ===================== Live crypto prices (CoinGecko, USD + EUR) ===================== */
function cryptoPriceIsStale(asset) {
  if (!asset.priceUpdatedAt) return true;
  return (Date.now() - new Date(asset.priceUpdatedAt).getTime()) > 60 * 60 * 1000; // 1h
}
/* Fetches live USD+EUR prices for every auto-tracked coin with a coingeckoId, in one request.
   Never invents a price: on failure (or for coins missing a coingeckoId) the existing
   live/manual price is left untouched, so the UI can prompt for a manual entry instead. */
async function fetchCryptoPrices(force) {
  // A forced (explicit ↻ click) refresh always fetches every tracked coin, including ones
  // with a manual override — clicking refresh should always get you the live price. The
  // passive background fetch (force=false) is more conservative: it skips coins you've
  // manually overridden and coins whose price isn't stale yet.
  const toFetch = data.cryptoAssets.filter(c => c.coingeckoId && (force || (c.priceAuto !== false && cryptoPriceIsStale(c))));
  if (!toFetch.length) return false;
  ui.cryptoPriceFetching = true;
  ui.cryptoPriceFetchError = false;
  if (ui.page === 'investments') render();
  try {
    const ids = Array.from(new Set(toFetch.map(c => c.coingeckoId))).join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,eur`);
    if (!res.ok) throw new Error('bad response');
    const json = await res.json();
    let any = false;
    toFetch.forEach(c => {
      const p = json[c.coingeckoId];
      if (p && p.usd != null) {
        c.currentPriceUSD = p.usd;
        c.currentPriceEUR = p.eur != null ? p.eur : null;
        c.manualPrice = null; // a refresh always shows the live price, not a stale manual one
        c.priceAuto = true;
        c.priceUpdatedAt = new Date().toISOString();
        any = true;
      }
    });
    if (any) { ui.cryptoManualEntryOpen = null; save(); }
    if (!any) ui.cryptoPriceFetchError = true;
    return any;
  } catch (e) {
    console.error('Crypto live price fetch failed, keeping last known price(s)', e);
    ui.cryptoPriceFetchError = true;
    return false;
  } finally {
    ui.cryptoPriceFetching = false;
    if (ui.page === 'investments') render();
  }
}
function setCryptoPriceManual(symbol, value, currency) {
  const v = parseFloat(value);
  if (isNaN(v) || v <= 0) return;
  const asset = cryptoAssetBySymbol(symbol);
  if (!asset) return;
  asset.manualPrice = v;
  asset.manualPriceCurrency = currency;
  asset.priceAuto = false;
  asset.priceUpdatedAt = new Date().toISOString();
  save(); render();
}
function clearCryptoPriceManual(symbol) {
  const asset = cryptoAssetBySymbol(symbol);
  if (!asset) return;
  asset.manualPrice = null;
  asset.priceAuto = true;
  fetchCryptoPrices(true);
}

/* ===================== Live Stock/ETF/other-asset prices (Twelve Data) ===================== */
function assetPriceIsStale(asset) {
  if (!asset.priceUpdatedAt) return true;
  return (Date.now() - new Date(asset.priceUpdatedAt).getTime()) > 60 * 60 * 1000; // 1h, same cadence as crypto
}
/* Fetches live prices for every tracked Stock/ETF/other asset in one batched Twelve Data
   request (one call for every ticker, not one per ticker — the free tier's rate limit is
   tight). Never invents a price: on failure, or for tickers Twelve Data can't find, the
   existing price is left untouched. A manually-overridden asset (manualPrice set) is skipped
   during the passive background refresh so it doesn't get silently clobbered — only an
   explicit forced refresh (the ↻ button, or clearing the override) touches it, matching how
   crypto's live-price refresh already works. */
async function fetchAssetPrices(force) {
  const apiKey = data.settings.twelveDataApiKey;
  if (!apiKey) return false;
  const toFetch = data.assets.filter(a => force || (a.manualPrice == null && assetPriceIsStale(a)));
  if (!toFetch.length) return false;
  ui.assetPriceFetching = true;
  ui.assetPriceFetchError = false;
  if (ui.page === 'investments') render();
  try {
    const symbols = Array.from(new Set(toFetch.map(a => a.ticker)));
    const res = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${encodeURIComponent(apiKey)}`);
    if (!res.ok) throw new Error('bad response');
    const json = await res.json();
    let any = false;
    toFetch.forEach(a => {
      const entry = symbols.length === 1 ? json : json[a.ticker];
      const priceNum = entry && parseFloat(entry.price);
      if (entry && !isNaN(priceNum)) {
        a.currentPrice = priceNum;
        a.manualPrice = null; // a refresh always shows the live price, not a stale manual one
        a.priceUpdatedAt = new Date().toISOString();
        any = true;
      }
    });
    if (any) save();
    if (!any) ui.assetPriceFetchError = true;
    return any;
  } catch (e) {
    console.error('Stock/ETF live price fetch failed, keeping last known price(s)', e);
    ui.assetPriceFetchError = true;
    return false;
  } finally {
    ui.assetPriceFetching = false;
    if (ui.page === 'investments') render();
  }
}
function clearAssetPriceManual(assetId) {
  const asset = assetById(assetId);
  if (!asset) return;
  asset.manualPrice = null;
  fetchAssetPrices(true);
}

/* ===================== Formatters ===================== */
function fmtMoney(n, currency) {
  if (data.settings.privacyMode) return '•••••';
  currency = currency || data.settings.defaultCurrency;
  const sym = CURRENCY_SYMBOL[currency] || currency;
  const digits = data.settings.showCents ? 2 : 0;
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-IE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (n < 0 ? '-' : '') + sym + str;
}
function fmtQty(n) { return +(+n).toFixed(8); } // trims binary floating-point noise (0.045+0.012 → 0.057, not 0.05699999999999999995)
function fmtPct(n, withSign) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  withSign = withSign !== false;
  return (withSign && n > 0 ? '+' : '') + n.toFixed(1) + '%';
}
function escHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function fmtDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function monthLabel(d) { return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }

/* ===================== Derived data helpers ===================== */
// Each account carries its own currency (a.currency) — pockets have no currency of their own,
// they're a sub-allocation within their parent account so they always share it. Totals that
// combine multiple accounts must convert each one to EUR first (toEUR(), defined below with
// the rest of the investments currency handling) — summing raw balances across a EUR and a USD
// account previously treated both as if they were the same currency.
function bankTotal() { return data.accounts.filter(a => a.visibleInTotals).reduce((s, a) => s + toEUR(a.balance, a.currency), 0); }
function bankAvailable() { return data.accounts.filter(a => a.visibleInTotals).reduce((s, a) => s + toEUR(a.balance - pocketsTotalFor(a), a.currency), 0); }
function pocketsTotalFor(acc) { return (acc.pockets || []).reduce((s, p) => s + p.amountSaved, 0); }
function pocketsTotal() { return data.accounts.reduce((s, a) => s + toEUR(pocketsTotalFor(a), a.currency), 0); }

/* Converts an amount from `currency` into EUR — the single currency every aggregate total in
   the app (portfolio value, category/broker totals, sort order) is expressed in, same anchor
   crypto's blendedCostEUR already uses. Uses the live/last-known EUR/USD rate for USD; GBP/CHF
   have no live rate tracked, so (matching crypto's existing behavior for untracked pairs)
   they pass through at face value rather than silently being treated as free money or throwing. */
function toEUR(amount, currency) {
  if (!currency || currency === 'EUR') return amount;
  if (currency === 'USD') return amount / (data.settings.eurUsdRate || 1.08);
  return amount;
}

function positionPrice(p) { return p.manualPrice != null ? p.manualPrice : p.currentPrice; }
/* Both convert to EUR before returning — positions can be priced in USD (e.g. AAPL) while
   others are EUR (e.g. VWCE); summing raw quantity*price across positions without conversion
   silently mixed currencies as if they were equal (a real bug: an $8,000 USD holding and an
   €8,000 EUR holding were previously added as if both were €8,000). Per-row displays that want
   the *native* currency (e.g. "avg $178.50 · now $191.30") should keep using p.avgPrice /
   positionPrice(p) / p.currency directly instead of these. */
function positionValue(p) { return toEUR(p.quantity * positionPrice(p), p.currency); }
function positionCost(p) { return toEUR(p.quantity * p.avgPrice, p.currency); }

/* ===================== Assets (Stocks/ETFs/Gold/... — snapshot-entry model) ===================== */
function assetById(id) { return data.assets.find(a => a.id === id); }
function entriesFor(assetId) { return data.assetEntries.filter(e => e.assetId === assetId); }
function assetPrice(asset) { return asset.manualPrice != null ? asset.manualPrice : asset.currentPrice; }
function assetHasPrice(asset) { return asset.manualPrice != null || asset.currentPrice != null; }

/* Quantity, blended average cost, and live value — always derived fresh from this asset's
   broker entries, never stored, so they update immediately whenever an entry is added,
   edited, or removed. Entries in a different currency than the asset's priceCurrency are
   converted via the EUR/USD rate when possible; other currency pairs (e.g. GBP/CHF, for which
   the app has no live rate) are included at face value, matching how mixed-currency totals
   were already handled elsewhere in the app. */
function assetStats(assetId) {
  const asset = assetById(assetId);
  const entries = entriesFor(assetId);
  const rate = data.settings.eurUsdRate || 1.08;
  const quantity = entries.reduce((s, e) => s + e.quantity, 0);
  let cost = 0;
  entries.forEach(e => {
    const v = e.quantity * e.price;
    if (e.currency === asset.priceCurrency) cost += v;
    else if (e.currency === 'EUR' && asset.priceCurrency === 'USD') cost += v * rate;
    else if (e.currency === 'USD' && asset.priceCurrency === 'EUR') cost += v / rate;
    else cost += v;
  });
  const avgPrice = quantity ? cost / quantity : null;
  const price = assetPrice(asset) || 0;
  const value = quantity * price;
  const pl = value - cost;
  const plPct = cost ? (pl / cost * 100) : 0;
  return { assetId, entries, quantity, avgPrice, cost, price, value, pl, plPct, hasPrice: assetHasPrice(asset) };
}

/* One synthetic "position" per asset, aggregated across all its broker entries — mirrors
   derivedCryptoPositions() below so every total in the app (net worth, portfolio value,
   asset-type breakdown) works the same way for both models without double-counting. */
function derivedAssetPositions() {
  return data.assets.map(a => {
    const s = assetStats(a.id);
    return { id: 'asset_' + a.id, brokerId: null, ticker: a.ticker, name: a.name, assetType: a.assetType, quantity: s.quantity, avgPrice: s.avgPrice || 0, currentPrice: a.currentPrice, manualPrice: a.manualPrice, currency: a.priceCurrency, logo: a.logo, assetRef: a.id };
  }).filter(p => p.quantity > 0);
}

/* Non-crypto holdings (Stocks/ETFs/Gold/...) plus one synthetic "position" per
   crypto asset (derived live from its purchase lots) so every total in the app
   (net worth, portfolio value, asset-type breakdown) accounts for crypto without
   double-counting or needing crypto-specific code at every call site. */
function allInvestmentPositions() { return derivedAssetPositions().concat(derivedCryptoPositions()); }

// Each broker's uninvested cash carries its own cashCurrency — same mixed-currency summing bug
// as accounts/positions/transactions, fixed the same way (convert each to EUR before adding).
function totalBrokerCash() { return data.brokers.reduce((s, b) => s + toEUR(b.cashBalance || 0, b.cashCurrency), 0); }
function investedTotal() { return allInvestmentPositions().reduce((s, p) => s + positionCost(p), 0); }
// Total value includes uninvested broker/exchange cash (it's real money sitting there); P&L
// doesn't, since cash has no cost basis — including it there would inflate P&L by the balance.
function portfolioValue() { return allInvestmentPositions().reduce((s, p) => s + positionValue(p), 0) + totalBrokerCash() + totalCryptoExchangeCash(); }
function portfolioPL() { return (portfolioValue() - totalBrokerCash() - totalCryptoExchangeCash()) - investedTotal(); }
function portfolioPLPct() { const inv = investedTotal(); return inv ? (portfolioPL() / inv * 100) : 0; }
function netWorthTotal() { return bankTotal() + portfolioValue(); }

/* Per-broker rows are entry-level (not asset-level): each row shows just that broker's own
   quantity/price for a ticker, so the broker sub-portfolio view reflects what's actually held
   there rather than the ticker's total across every broker. */
function positionsByBroker(brokerId) {
  return data.assetEntries.filter(e => e.broker === brokerId).map(e => {
    const asset = assetById(e.assetId);
    if (!asset) return null;
    return { id: e.id, brokerId, ticker: asset.ticker, name: asset.name, assetType: asset.assetType, quantity: e.quantity, avgPrice: e.price, currentPrice: asset.currentPrice, manualPrice: asset.manualPrice, currency: e.currency, logo: asset.logo, entryRef: e.id, assetRef: asset.id };
  }).filter(Boolean);
}
function brokerValue(brokerId) {
  const b = brokerById(brokerId) || {};
  const cash = toEUR(b.cashBalance || 0, b.cashCurrency);
  return positionsByBroker(brokerId).reduce((s, p) => s + positionValue(p), 0) + cash;
}
function positionsByAssetType(type) { return allInvestmentPositions().filter(p => p.assetType === type); }

/* Item 10: the Dashboard's "By broker" view should represent every holding, including crypto
   exchanges — not just Stocks/ETFs brokers. Crypto lots/snapshots store their exchange as a
   free-text name (there's no brokerId FK for them, unlike stock brokers), so this merges by
   name: an exchange that happens to share a name with a registered broker (e.g. you also added
   "Binance" as a broker) is folded into that broker's total instead of listed twice. */
function cryptoBrokerNames() {
  const names = new Set();
  data.cryptoLots.forEach(l => { if (l.broker) names.add(l.broker); });
  data.cryptoAssets.forEach(c => (c.snapshots || []).forEach(r => { if (r.broker) names.add(r.broker); }));
  data.cryptoExchangeCash.forEach(c => { if (c.exchange) names.add(c.exchange); });
  return Array.from(names);
}
function cryptoExchangeCashFor(name) {
  const key = name.trim().toLowerCase();
  return data.cryptoExchangeCash.find(c => (c.exchange || '').trim().toLowerCase() === key);
}
function cryptoExchangeCashValueEUR(name) {
  const entry = cryptoExchangeCashFor(name);
  return entry ? toEUR(entry.amount, entry.currency) : 0;
}
// Same "uninvested cash counts toward value/net worth, never toward P&L" rule as broker cash.
function totalCryptoExchangeCash() { return data.cryptoExchangeCash.reduce((s, c) => s + toEUR(c.amount, c.currency), 0); }
function cryptoValueForBrokerName(name) {
  const key = name.trim().toLowerCase();
  let total = 0;
  data.cryptoAssets.forEach(c => {
    const price = cryptoMarketPrice(c.symbol, 'EUR') || 0;
    if (c.mode === 'snapshot') {
      (c.snapshots || []).forEach(r => { if ((r.broker || '').trim().toLowerCase() === key) total += r.quantity * price; });
    } else {
      data.cryptoLots.filter(l => l.symbol === c.symbol && (l.broker || '').trim().toLowerCase() === key).forEach(l => total += l.quantity * price);
    }
  });
  return total + cryptoExchangeCashValueEUR(name);
}
/* Per-coin breakdown at one exchange — the crypto equivalent of positionsByBroker(), needed
   because a coin's snapshot/lot rows (not a single asset-level record) are what actually carry
   the exchange name, and one coin can be split across several exchanges at once. */
/* Same position shape as derivedCryptoPositions() (id, brokerId, ticker, name, logo, assetType,
   quantity, avgPrice, currentPrice, manualPrice, currency, cryptoRef) so this per-exchange
   breakdown can be rendered with positionRowHtml() — the exact same row component the Stocks &
   ETFs Brokers card uses — giving crypto exchanges the identical look (avg vs. now price, value,
   gain/loss %, edit/refresh/delete) instead of a simplified bespoke row. avgPrice is blended
   just from this exchange's own rows (mirroring cryptoAssetStats' EUR/USD blending), not the
   coin's overall average across every exchange. */
function cryptoHoldingsAtExchange(name) {
  const key = name.trim().toLowerCase();
  const rate = data.settings.eurUsdRate || 1.08;
  const rows = [];
  data.cryptoAssets.forEach(c => {
    const price = cryptoMarketPrice(c.symbol, 'EUR') || 0;
    const matches = c.mode === 'snapshot'
      ? (c.snapshots || []).filter(r => (r.broker || '').trim().toLowerCase() === key)
      : data.cryptoLots.filter(l => l.symbol === c.symbol && (l.broker || '').trim().toLowerCase() === key);
    let qty = 0, investedEUR = 0, investedUSD = 0;
    matches.forEach(r => {
      qty += r.quantity;
      const paid = r.amountPaid != null ? r.amountPaid : r.quantity * r.price;
      if (r.currency === 'USD') investedUSD += paid; else investedEUR += paid;
    });
    if (qty > 0) {
      const blendedCostEUR = investedEUR + investedUSD / rate;
      rows.push({
        id: 'cryptoexch_' + c.symbol, brokerId: null, ticker: c.symbol, name: c.name, logo: c.logo,
        assetType: 'Crypto', quantity: qty, avgPrice: qty ? blendedCostEUR / qty : 0,
        currentPrice: price, manualPrice: null, currency: 'EUR', cryptoRef: c.symbol,
      });
    }
  });
  return rows.sort((a, b) => positionValue(b) - positionValue(a));
}
function toggleCryptoExchangeExpand(name) { ui.openCryptoExchange = ui.openCryptoExchange === name ? null : name; render(); }
function deleteCryptoExchange(name) {
  const holdings = cryptoHoldingsAtExchange(name);
  if (!confirm(`Remove all crypto holdings at ${name} (${holdings.length} coin${holdings.length !== 1 ? 's' : ''})? This can't be undone.`)) return;
  const key = name.trim().toLowerCase();
  data.cryptoAssets.forEach(c => { if (c.snapshots) c.snapshots = c.snapshots.filter(r => (r.broker || '').trim().toLowerCase() !== key); });
  data.cryptoLots = data.cryptoLots.filter(l => (l.broker || '').trim().toLowerCase() !== key);
  save(); render();
}
function saveEurUsdRateInline() {
  const el = document.getElementById('eurusd-rate-input');
  if (!el) return;
  ui.eurUsdRateEditOpen = false;
  setEurUsdRateManual(el.value);
}
function dashboardBrokerBreakdown() {
  const cryptoNames = cryptoBrokerNames();
  const stockRows = data.brokers.map(b => {
    const matchingCrypto = cryptoNames.find(n => n.trim().toLowerCase() === b.name.trim().toLowerCase());
    return { name: b.name, logo: b.logo, value: brokerValue(b.id) + (matchingCrypto ? cryptoValueForBrokerName(matchingCrypto) : 0) };
  });
  const stockNamesLower = new Set(data.brokers.map(b => b.name.trim().toLowerCase()));
  const cryptoOnlyRows = cryptoNames.filter(n => !stockNamesLower.has(n.trim().toLowerCase()))
    .map(n => ({ name: n, logo: cryptoBrokerLogo(n), value: cryptoValueForBrokerName(n) }));
  return stockRows.concat(cryptoOnlyRows).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
}

// A few well-known exchanges whose logo is already bundled in assets/logos, for when a crypto
// lot/snapshot's free-text broker name isn't also a registered Stocks/ETFs broker.
const COMMON_EXCHANGE_LOGOS = {
  binance: 'assets/logos/Binance.png',
  coinbase: 'assets/logos/Coinbase.png',
  bitstack: 'assets/logos/Bitstack.png',
};
/* Crypto lots/snapshots store their exchange as free text, not a broker-record FK — so looking
   up a logo for one means: reuse a registered broker's logo if the names match (you also added
   that exchange as a broker), else fall back to the small built-in map above for exchanges we
   already ship a logo for. Never fabricates one — anything else just falls back to the usual
   neutral bank-icon placeholder wherever this is rendered. */
function cryptoBrokerLogo(name) {
  if (!name) return '';
  const key = name.trim().toLowerCase();
  if (!key) return '';
  const matchingBroker = data.brokers.find(b => b.name.trim().toLowerCase() === key);
  if (matchingBroker && matchingBroker.logo) return matchingBroker.logo;
  return COMMON_EXCHANGE_LOGOS[key] || '';
}
/* Live path: swaps the small logo icon next to a broker/exchange text field as the user types,
   without a full render() (which would drop focus mid-typing) — same pattern already used for
   the row's other fields (onSnapRowInput/onLotInput). */
function updateCryptoBrokerLogoPreview(elId, name) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = logoImg(cryptoBrokerLogo(name), 20);
}

/* ===================== Crypto (purchase-lot model) ===================== */
function lotsFor(symbol) { return data.cryptoLots.filter(l => l.symbol === symbol); }
function cryptoAssetBySymbol(symbol) { return data.cryptoAssets.find(c => c.symbol === symbol); }

/* Resolves the current market price for a coin, in whichever currency is asked for.
   Never fabricated: manual override (if set) wins, otherwise the live-fetched price;
   if neither is available yet, returns null so the UI can say so instead of showing 0. */
function cryptoMarketPrice(symbol, currency) {
  const a = cryptoAssetBySymbol(symbol);
  if (!a) return null;
  const rate = data.settings.eurUsdRate || 1.08;
  if (a.manualPrice != null) {
    if (a.manualPriceCurrency === currency) return a.manualPrice;
    return currency === 'USD' ? a.manualPrice * rate : a.manualPrice / rate;
  }
  if (currency === 'USD') return a.currentPriceUSD != null ? a.currentPriceUSD : (a.currentPriceEUR != null ? a.currentPriceEUR * rate : null);
  return a.currentPriceEUR != null ? a.currentPriceEUR : (a.currentPriceUSD != null ? a.currentPriceUSD / rate : null);
}
function cryptoHasPrice(symbol) { return cryptoMarketPrice(symbol, 'EUR') != null; }
function cryptoPriceIsManual(symbol) { const a = cryptoAssetBySymbol(symbol); return a ? a.manualPrice != null : false; }

function cryptoAssetStats(symbol) {
  const asset = cryptoAssetBySymbol(symbol);
  const rate = data.settings.eurUsdRate || 1.08;
  let lots = [], snapshots = [], quantity, qtyEUR, qtyUSD, investedEUR, investedUSD, avgPriceEUR, avgPriceUSD;

  if (asset && asset.mode === 'snapshot') {
    snapshots = asset.snapshots || [];
    const eurRows = snapshots.filter(r => r.currency === 'EUR');
    const usdRows = snapshots.filter(r => r.currency === 'USD');
    qtyEUR = eurRows.reduce((s, r) => s + r.quantity, 0);
    qtyUSD = usdRows.reduce((s, r) => s + r.quantity, 0);
    investedEUR = eurRows.reduce((s, r) => s + r.quantity * r.price, 0);
    investedUSD = usdRows.reduce((s, r) => s + r.quantity * r.price, 0);
    quantity = qtyEUR + qtyUSD;
    avgPriceEUR = qtyEUR ? investedEUR / qtyEUR : null;
    avgPriceUSD = qtyUSD ? investedUSD / qtyUSD : null;
  } else {
    lots = lotsFor(symbol);
    const eurLots = lots.filter(l => l.currency === 'EUR');
    const usdLots = lots.filter(l => l.currency === 'USD');
    qtyEUR = eurLots.reduce((s, l) => s + l.quantity, 0);
    qtyUSD = usdLots.reduce((s, l) => s + l.quantity, 0);
    investedEUR = eurLots.reduce((s, l) => s + l.amountPaid, 0);
    investedUSD = usdLots.reduce((s, l) => s + l.amountPaid, 0);
    quantity = qtyEUR + qtyUSD;
    avgPriceEUR = qtyEUR ? investedEUR / qtyEUR : null;
    avgPriceUSD = qtyUSD ? investedUSD / qtyUSD : null;
  }

  // investedEUR/investedUSD above only total the rows *denominated* in that currency — useful
  // on their own, but showing them as "Invested EUR" / "Invested USD" is misleading for an
  // asset held entirely in the other currency (e.g. an all-USD coin showed "€0.00 · —" here,
  // even though it has a real EUR-equivalent cost basis). blendedCost{EUR,USD} are the true
  // fully-converted totals — the whole cost basis, expressed in each currency — and are what
  // the UI should actually display, matching what P&L is computed from below.
  const blendedCostEUR = investedEUR + investedUSD / rate;
  const blendedCostUSD = investedUSD + investedEUR * rate;
  const blendedAvgPriceEUR = quantity ? blendedCostEUR / quantity : null;
  const blendedAvgPriceUSD = quantity ? blendedCostUSD / quantity : null;

  const marketPriceEUR = cryptoMarketPrice(symbol, 'EUR') || 0;
  const marketValueEUR = quantity * marketPriceEUR;
  const plEUR = marketValueEUR - blendedCostEUR;
  const plPct = blendedCostEUR ? (plEUR / blendedCostEUR * 100) : 0;

  return { symbol, lots, snapshots, quantity, qtyEUR, qtyUSD, investedEUR, investedUSD, avgPriceEUR, avgPriceUSD, blendedCostEUR, blendedCostUSD, blendedAvgPriceEUR, blendedAvgPriceUSD, marketPriceEUR, marketValueEUR, plEUR, plPct, hasPrice: cryptoHasPrice(symbol) };
}

/* Same shape as derivedAssetPositions() (see below) — including cryptoRef, the crypto
   equivalent of assetRef — so crypto coins can be rendered with the exact same row component
   (positionRowHtml) as Stocks/ETFs/other assets instead of a bespoke layout. */
function derivedCryptoPositions() {
  return data.cryptoAssets.map(c => cryptoAssetStats(c.symbol)).filter(s => s.quantity > 0).map(s => {
    const a = cryptoAssetBySymbol(s.symbol) || {};
    return {
      id: 'crypto_' + s.symbol, brokerId: null, ticker: s.symbol, name: a.name || s.symbol, logo: a.logo,
      assetType: 'Crypto', quantity: s.quantity, avgPrice: s.blendedAvgPriceEUR || 0, currentPrice: s.marketPriceEUR, manualPrice: null, currency: 'EUR',
      cryptoRef: s.symbol,
    };
  });
}

/* Holdings whose market price can be overridden, spanning both the classic
   position model and crypto assets — used by Manual Prices and Asset List Export. */
function allPriceableHoldings() {
  const positions = data.assets.map(a => ({
    kind: 'asset', key: a.id, ticker: a.ticker, name: a.name, assetType: a.assetType, currency: a.priceCurrency, logo: a.logo,
    livePrice: a.currentPrice, manualPrice: a.manualPrice,
    // Sort key only (never displayed raw) — must be EUR-converted since it's compared directly
    // against crypto's already-EUR value below; otherwise a USD asset's raw dollar figure would
    // be sorted as if it were the same-magnitude euro figure.
    value: toEUR(assetStats(a.id).value, a.priceCurrency),
    setManual: v => { a.manualPrice = v; },
  }));
  const crypto = data.cryptoAssets.map(c => ({
    kind: 'crypto', key: c.symbol, ticker: c.symbol, name: c.name, assetType: 'Crypto', currency: 'EUR', logo: c.logo,
    livePrice: c.currentPriceEUR != null ? c.currentPriceEUR : cryptoMarketPrice(c.symbol, 'EUR'), manualPrice: c.manualPrice != null ? cryptoMarketPrice(c.symbol, 'EUR') : null,
    value: cryptoAssetStats(c.symbol).marketValueEUR,
    setManual: v => { c.manualPrice = v; c.manualPriceCurrency = 'EUR'; },
  }));
  return positions.concat(crypto).sort((a, b) => b.value - a.value);
}

function monthTransactions(monthDate) {
  const m = monthDate.getMonth(), y = monthDate.getFullYear();
  return data.budgetTransactions.filter(t => { const d = new Date(t.date); return d.getMonth() === m && d.getFullYear() === y; });
}
// Each transaction can carry its own currency (t.currency) — same mixed-currency summing bug
// as accounts/positions applies here too, so each amount is converted to EUR before totaling.
function monthIncome(monthDate) { return monthTransactions(monthDate).filter(t => t.type === 'income').reduce((s, t) => s + toEUR(t.amount, t.currency), 0); }
function monthExpenses(monthDate) { return monthTransactions(monthDate).filter(t => t.type === 'expense').reduce((s, t) => s + toEUR(t.amount, t.currency), 0); }

function categoryById(kind, id) { return data.categories[kind].find(c => c.id === id); }
function paymentMethodById(id) { return data.paymentMethods.find(p => p.id === id); }
function brokerById(id) { return data.brokers.find(b => b.id === id); }
function accountById(id) { return data.accounts.find(a => a.id === id); }

/* ===================== SVG chart helpers ===================== */
function svgDonut(segments, opts) {
  opts = opts || {};
  const size = opts.size || 160, stroke = opts.stroke || 20;
  const r = (size - stroke) / 2, c = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const arcs = segments.filter(s => s.value > 0).map(seg => {
    const frac = seg.value / total;
    const dash = frac * circumference;
    const gap = circumference - dash;
    const rotation = (offset / total) * 360 - 90;
    offset += seg.value;
    return `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${gap}" transform="rotate(${rotation} ${c} ${c})" stroke-linecap="butt"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}</svg>`;
}

function svgArea(points, opts) {
  opts = opts || {};
  const w = opts.w || 560, h = opts.h || 160, pad = 10;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals, 0), max = Math.max(...vals);
  const range = (max - min) || 1;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (p.value - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const line = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
  const areaPath = line + ` L${coords[coords.length - 1][0].toFixed(1)} ${h - pad} L${coords[0][0].toFixed(1)} ${h - pad} Z`;
  const zeroY = pad + (1 - (0 - min) / range) * (h - pad * 2);
  const gid = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--light-accent-1)" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="var(--light-accent-1)" stop-opacity="0"/>
    </linearGradient></defs>
    ${min < 0 && max > 0 ? `<line x1="${pad}" y1="${zeroY}" x2="${w - pad}" y2="${zeroY}" stroke="currentColor" stroke-opacity="0.15" stroke-dasharray="4 4"/>` : ''}
    <path d="${areaPath}" fill="url(#${gid})" stroke="none"/>
    <path d="${line}" fill="none" stroke="var(--light-accent-1)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/* ===================== Root render ===================== */
function render() {
  const app = document.getElementById('app');
  const pageRenderers = {
    dashboard: renderDashboard,
    accounts: renderAccounts,
    budget: renderBudget,
    investments: renderInvestments,
    trading: renderTrading,
    settings: renderSettings,
    'manual-prices': renderManualPrices,
  };
  const pageHtml = pageRenderers[ui.page] ? pageRenderers[ui.page]() : '';

  app.innerHTML = `
    <div class="shell">
      <div class="sidebar">
        <div class="sidebar-logo">Trackr</div>
        <ul class="nav-list">
          ${NAV_ITEMS.map(item => `
            <li>
              <button class="nav-item ${ui.page === item.id ? 'active' : ''}" onclick="goPage('${item.id}')">
                <span class="nav-icon">${item.icon}</span><span class="label">${item.label}</span>
              </button>
            </li>`).join('')}
        </ul>
        <div class="sidebar-footer">
          <button class="privacy-toggle ${data.settings.privacyMode ? 'on' : ''}" onclick="togglePrivacy()">
            <div class="toggle ${data.settings.privacyMode ? 'on' : ''}"></div><span>${data.settings.privacyMode ? 'Hidden' : 'Visible'}</span>
          </button>
        </div>
      </div>
      <div class="main">
        ${pageHtml}
      </div>
    </div>
    ${renderModal()}
  `;
}

function goPage(page) { ui.page = page; ui.modal = null; render(); }
function togglePrivacy() { data.settings.privacyMode = !data.settings.privacyMode; save(); render(); }
function closeModal() { ui.modal = null; render(); }

/* ===================== Modal dispatcher (filled in per-page) ===================== */
function renderModal() {
  if (!ui.modal) return '';
  const renderers = window.__modalRenderers || {};
  const fn = renderers[ui.modal.type];
  if (!fn) return '';
  return `<div class="modal-backdrop" onclick="if(event.target===this) closeModal()"><div class="modal">${fn(ui.modal.payload)}</div></div>`;
}
window.__modalRenderers = {};

/* ===================== Dashboard ===================== */
function renderDashboard() {
  const now = new Date();
  const total = bankTotal();
  const avail = bankAvailable();
  const pockets = pocketsTotal();
  const invested = portfolioValue();
  const pl = portfolioPL(), plPct = portfolioPLPct();
  const netWorth = netWorthTotal();

  const accountChips = data.accounts.filter(a => a.visibleInTotals).slice().sort((a, b) => toEUR(b.balance, b.currency) - toEUR(a.balance, a.currency)).map(a => `
    <span class="chip">${accountIconHtml(a, 16)} ${escHtml(a.name)} <span class="${a.balance >= 0 ? 'positive' : 'negative'}">${fmtMoney(a.balance, a.currency)}</span></span>
  `).join('');

  const income = monthIncome(now), expenses = monthExpenses(now), balance = income - expenses;

  const nwPoints = historyPoints(periodToDays(ui.dashboardNetWorthPeriod), 'netWorth');
  const pfPoints = historyPoints(periodToDays(ui.dashboardPortfolioPeriod), 'portfolioValue');
  const thisMonthDelta = historyDeltaSince(new Date(now.getFullYear(), now.getMonth(), 1));
  const thisYearDelta = historyDeltaSince(new Date(now.getFullYear(), 0, 1));
  const allTimeDelta = data.history.length ? netWorth - data.history[0].netWorth : null;

  const byBroker = dashboardBrokerBreakdown();
  const byBrokerMax = Math.max(...byBroker.map(x => x.value), 1);

  const allocSegments = [
    { label: 'Bank', value: total, color: 'var(--light-accent-2)' },
    { label: 'Portfolio', value: invested, color: 'var(--light-accent-1)' },
  ].filter(s => s.value > 0).sort((a, b) => b.value - a.value);
  const allocTotal = allocSegments.reduce((s, x) => s + x.value, 0) || 1;

  return `
  <div class="page surface-light">
    <div class="page-head">
      <div>
        <h1 class="page-title">Overview</h1>
        <div class="page-subtitle">${monthLabel(now)}</div>
      </div>
      <button class="icon-btn-round" title="Detailed statistics">📊</button>
    </div>

    <div class="card stack-gap-16" style="margin-bottom:20px;">
      <div>
        <div class="eyebrow">Total net worth</div>
        <div class="big-number">${fmtMoney(netWorth)}</div>
      </div>
      <div class="grid-3">
        <div class="card-nested"><div class="eyebrow">Available</div><div style="font-size:19px;font-weight:700;" class="${avail >= 0 ? '' : 'negative'}">${fmtMoney(avail)}</div></div>
        <div class="card-nested"><div class="eyebrow">Pockets</div><div style="font-size:19px;font-weight:700;color:var(--light-accent-1)">${fmtMoney(pockets)}</div></div>
        <div class="card-nested"><div class="eyebrow">Invested</div><div style="font-size:19px;font-weight:700;color:var(--light-accent-2)">${fmtMoney(invested)}</div></div>
      </div>
      <div class="card-nested" style="background:${pl >= 0 ? 'rgba(34,181,115,0.10)' : 'rgba(229,72,77,0.08)'};">
        <div class="eyebrow">P&amp;L</div>
        <div style="font-size:19px;font-weight:700;" class="${pl >= 0 ? 'positive' : 'negative'}">${fmtMoney(pl)} <span style="font-weight:500;font-size:14px;">(${fmtPct(plPct)})</span></div>
      </div>
      <div class="chip-scroll">${accountChips || '<span style="opacity:.5;font-size:13px;">No accounts yet</span>'}</div>
    </div>

    <div class="grid-3" style="margin-bottom:20px;">
      <div class="card"><div class="row-flex"><div><div class="eyebrow">Income</div><div style="font-size:20px;font-weight:700;" class="positive">${fmtMoney(income)}</div></div><span style="font-size:20px;">📈</span></div></div>
      <div class="card"><div class="row-flex"><div><div class="eyebrow">Expenses</div><div style="font-size:20px;font-weight:700;" class="negative">${fmtMoney(expenses)}</div></div><span style="font-size:20px;">📉</span></div></div>
      <div class="card"><div class="row-flex"><div><div class="eyebrow">Balance</div><div style="font-size:20px;font-weight:700;color:var(--light-accent-2)">${fmtMoney(balance)}</div></div><span style="font-size:20px;">👛</span></div></div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="row-flex" style="margin-bottom:14px;">
        <div style="font-weight:700;">NET WORTH EVOLUTION</div>
        <div class="tab-row" style="margin:0;width:auto;">
          ${['3M', '6M', 'All'].map(p => `<button class="tab-btn ${ui.dashboardNetWorthPeriod === p ? 'active' : ''}" style="padding:6px 14px;" onclick="setNwPeriod('${p}')">${p}</button>`).join('')}
        </div>
      </div>
      ${trendChartOrPlaceholder(nwPoints, 150)}
      <div class="grid-3" style="margin-top:14px;">
        <div class="card-nested"><div class="eyebrow">This month</div><div style="font-weight:700;">${thisMonthDelta != null ? fmtMoney(thisMonthDelta) : '—'}</div></div>
        <div class="card-nested"><div class="eyebrow">This year</div><div style="font-weight:700;">${thisYearDelta != null ? fmtMoney(thisYearDelta) : '—'}</div></div>
        <div class="card-nested"><div class="eyebrow">All time</div><div style="font-weight:700;">${allTimeDelta != null ? fmtMoney(allTimeDelta) : '—'}</div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="row-flex" style="margin-bottom:14px;">
        <div style="font-weight:700;">Portfolio Performance</div>
        <div class="tab-row" style="margin:0;width:auto;">
          ${['1D', '1W', '1M', '3M', '1Y', 'All'].map(p => `<button class="tab-btn ${ui.dashboardPortfolioPeriod === p ? 'active' : ''}" style="padding:5px 10px;font-size:12px;" onclick="setPfPeriod('${p}')">${p}</button>`).join('')}
        </div>
      </div>
      <div class="${pl >= 0 ? 'positive' : 'negative'}" style="font-weight:700;margin-bottom:8px;">${fmtMoney(pl)} (${fmtPct(plPct)})</div>
      ${trendChartOrPlaceholder(pfPoints, 120)}
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div style="font-weight:700;margin-bottom:14px;">BY BROKER</div>
      <div class="stack-gap-12">
        ${byBroker.length ? byBroker.map(({ name, logo, value }) => `
          <div>
            <div class="row-flex" style="margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:10px;">${logoImg(logo, 26)} <span style="font-weight:600;font-size:13.5px;">${escHtml(name)}</span></div>
              <div style="font-weight:700;font-size:13.5px;">${fmtMoney(value)} <span style="opacity:.5;font-weight:500;">${(value / (invested || 1) * 100).toFixed(0)}%</span></div>
            </div>
            <div style="height:6px;border-radius:4px;background:var(--light-border);overflow:hidden;"><div style="height:100%;width:${(value / byBrokerMax * 100).toFixed(1)}%;background:var(--light-accent-1);border-radius:4px;"></div></div>
          </div>`).join('') : '<div style="opacity:.5;font-size:13px;">No broker holdings yet</div>'}
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div style="font-weight:700;margin-bottom:14px;">Wealth allocation</div>
      <div style="display:flex;align-items:center;gap:26px;flex-wrap:wrap;">
        ${svgDonut(allocSegments, { size: 140, stroke: 22 })}
        <div class="stack-gap-8">
          ${allocSegments.map(s => `<div style="display:flex;align-items:center;gap:8px;font-size:13.5px;"><span style="width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block;"></span>${s.label} · ${(s.value / allocTotal * 100).toFixed(0)}%</div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card-dark">
      <div class="row-flex" style="margin-bottom:14px;">
        <div style="font-weight:700;">Holdings</div>
        <div style="font-size:11px;opacity:.5;" class="mono">As of ${new Date(data.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
      </div>
      <div class="stack-gap-12">
        ${dashboardHoldingsList().map(w => `
          <div class="row-flex">
            <div style="display:flex;align-items:center;gap:10px;">
              ${assetLogoHtml(w.logo, w.assetType, 26)}
              <div><div style="font-weight:600;font-size:13.5px;">${escHtml(w.symbol)}</div><div style="font-size:11.5px;opacity:.55;">${escHtml(w.name)}</div></div>
            </div>
            <div style="text-align:right;">
              <div class="${w.plPct >= 0 ? 'positive' : 'negative'}" style="font-weight:700;font-size:13.5px;">${w.plPct >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(w.plPct), false)}</div>
              <div style="font-size:11px;opacity:.5;">vs. cost</div>
            </div>
          </div>`).join('') || '<div style="opacity:.5;font-size:13px;">No holdings yet — add a position or crypto purchase in Investments.</div>'}
      </div>
    </div>
  </div>`;
}
function setNwPeriod(p) { ui.dashboardNetWorthPeriod = p; render(); }
function setPfPeriod(p) { ui.dashboardPortfolioPeriod = p; render(); }

function periodToDays(p) { return { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 182, '1Y': 365, 'All': null }[p] ?? null; }
function historyPoints(days, key) {
  const hist = data.history || [];
  const filtered = days ? hist.filter(h => new Date(h.date).getTime() >= Date.now() - days * 86400000) : hist;
  return filtered.map(h => ({ label: fmtDate(h.date), value: h[key] }));
}
/* Finds the last recorded value strictly before cutoff and returns (current - that value),
   or null if there's no real data from before that period yet (shown as "—", not a fake 0). */
function historyDeltaSince(cutoffDate) {
  const hist = data.history || [];
  if (!hist.length) return null;
  let base = null;
  for (const h of hist) { if (new Date(h.date) < cutoffDate) base = h; else break; }
  if (!base) return null;
  return hist[hist.length - 1].netWorth - base.netWorth;
}
function trendChartOrPlaceholder(points, height) {
  if (points.length < 2) {
    return `<div style="text-align:center;padding:${Math.max(20, height / 2 - 20)}px 10px;opacity:.5;font-size:12.5px;">Not enough history yet — check back tomorrow to see a trend.</div>`;
  }
  return `<div style="color:var(--light-text)">${svgArea(points, { h: height })}</div>`;
}
/* Real holdings (crypto + stocks/ETFs/etc.) sorted by value, with real unrealized P&L vs cost. */
function dashboardHoldingsList() {
  const cryptoRows = data.cryptoAssets.map(c => cryptoAssetStats(c.symbol)).filter(s => s.quantity > 0)
    .map(s => { const a = cryptoAssetBySymbol(s.symbol) || {}; return { symbol: s.symbol, name: a.name || s.symbol, value: s.marketValueEUR, plPct: s.plPct, logo: a.logo, assetType: 'Crypto' }; });
  const assetRows = data.assets.map(a => {
    const s = assetStats(a.id);
    // value is a sort key only (never displayed raw, only plPct is shown) — EUR-converted so
    // ranking against crypto's already-EUR value is meaningful across mixed currencies.
    return { symbol: a.ticker, name: a.name, value: toEUR(s.value, a.priceCurrency), plPct: s.plPct, logo: a.logo, assetType: a.assetType };
  }).filter(r => r.value > 0);
  return cryptoRows.concat(assetRows).sort((a, b) => b.value - a.value).slice(0, 8);
}

function accountIconHtml(acc, size) {
  size = size || 20;
  if (acc.logoKind === 'image' && acc.logo) return logoImg(acc.logo, size);
  return `<span style="font-size:${size - 4}px;">${acc.icon || '🏦'}</span>`;
}
function logoImg(src, size) {
  if (!src) return `<span class="institution-icon emoji" style="width:${size}px;height:${size}px;">🏛️</span>`;
  return `<img class="institution-icon" src="${escHtml(src)}" style="width:${size}px;height:${size}px;" onerror="this.style.display='none'">`;
}

/* Every logo URL already in use anywhere in the app (bank accounts, brokers, stocks/ETFs/other
   assets, crypto, and transaction payees), deduped by URL — the single source of truth behind
   both the Settings "Logos & Images" library and the "choose from used logos" picker attached
   to every Logo URL field, so a logo only ever needs to be typed once. */
function allLogoItems() {
  const items = [
    ...data.accounts.filter(a => a.logoKind === 'image' && a.logo).map(a => ({ name: a.name, type: 'Bank', logo: a.logo })),
    ...data.brokers.filter(b => b.logo).map(b => ({ name: b.name, type: 'Broker', logo: b.logo })),
    ...data.assets.filter(a => a.logo).map(a => ({ name: a.name || a.ticker, type: a.assetType || 'Asset', logo: a.logo })),
    ...data.cryptoAssets.filter(c => c.logo).map(c => ({ name: c.name || c.symbol, type: 'Crypto', logo: c.logo })),
    ...data.budgetTransactions.filter(t => t.logo).map(t => ({ name: t.comment || 'Transaction', type: 'Transaction', logo: t.logo })),
  ];
  const seen = new Set();
  return items.filter(it => { if (seen.has(it.logo)) return false; seen.add(it.logo); return true; }).sort((a, b) => a.name.localeCompare(b.name));
}
/* The small 🖼 button that goes next to any Logo URL input, plus its popover — kept as two
   separate pieces so the button can sit inline with the input while the popover (which needs
   to be full-width) can be placed below it, inside the same <label>. Toggling only touches the
   DOM directly (no render()), so it never disturbs unsaved values in any other field on
   whatever form/modal it's attached to. */
function logoPickerButtonHtml(inputId) {
  return `<button type="button" class="icon-btn-round" style="width:30px;height:30px;background:none;border:none;flex:none;" title="Choose from logos already used in Trackr" onclick="toggleLogoPicker('${inputId}')">🖼</button>`;
}
function logoPickerPopoverHtml(inputId) {
  const items = allLogoItems();
  return `<div id="logo-picker-${inputId}" style="display:none;flex-wrap:wrap;gap:8px;margin-top:8px;padding:10px;background:rgba(128,128,128,0.06);border-radius:var(--radius-sm);max-height:170px;overflow:auto;">
    ${items.map(it => `<span style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;width:54px;" title="${escHtml(it.name)} (${escHtml(it.type)})" onclick="pickLogoInto('${inputId}','${escHtml(it.logo).replace(/'/g, "\\'")}')">${logoImg(it.logo, 28)}<span style="font-size:9px;opacity:.6;max-width:54px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(it.name)}</span></span>`).join('') || '<span style="opacity:.5;font-size:12px;">No logos used yet — type a URL instead.</span>'}
  </div>`;
}
function toggleLogoPicker(inputId) {
  const pop = document.getElementById('logo-picker-' + inputId);
  if (!pop) return;
  pop.style.display = pop.style.display === 'none' ? 'flex' : 'none';
}
function pickLogoInto(inputId, url) {
  const el = document.getElementById(inputId);
  if (el) { el.value = url; el.dispatchEvent(new Event('change')); el.dispatchEvent(new Event('input')); }
  const pop = document.getElementById('logo-picker-' + inputId);
  if (pop) pop.style.display = 'none';
}

/* Logo for an individual asset (position or crypto coin) — falls back to an asset-type emoji
   badge if no logo URL is set, or if the URL fails to load. Used everywhere a ticker is shown,
   so setting a logo once (Edit position / Edit crypto) updates every place it's mentioned. */
function assetLogoHtml(logo, assetType, size) {
  size = size || 24;
  const emoji = assetTypeEmoji(assetType);
  const bg = assetTypeColor(assetType) + '22';
  const fallback = `<span style="display:${logo ? 'none' : 'inline-flex'};align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:6px;background:${bg};font-size:${Math.round(size * 0.55)}px;flex:none;">${emoji}</span>`;
  if (!logo) return fallback;
  return `<img src="${escHtml(logo)}" style="width:${size}px;height:${size}px;border-radius:6px;object-fit:cover;flex:none;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';">${fallback}`;
}

/* ===================== Accounts ===================== */
function renderAccounts() {
  const active = data.accounts.filter(a => a.visibleInTotals).length;
  const hidden = data.accounts.length - active;
  const total = bankTotal(), avail = bankAvailable(), pockets = pocketsTotal();
  const sortedAccounts = data.accounts.slice().sort((a, b) => toEUR(b.balance, b.currency) - toEUR(a.balance, a.currency));
  const chips = sortedAccounts.map(a => `<span class="chip">${accountIconHtml(a, 16)} ${escHtml(a.name)} <span>${fmtMoney(a.balance, a.currency)}</span></span>`).join('');

  return `
  <div class="page surface-dark">
    <div class="page-head">
      <div>
        <h1 class="page-title">Accounts</h1>
        <div class="page-subtitle">${active} active · ${hidden} hidden</div>
      </div>
    </div>

    <div class="card-dark stack-gap-16" style="margin-bottom:20px;">
      <div class="row-flex">
        <div>
          <div class="eyebrow">Bank total</div>
          <div class="big-number">${fmtMoney(total)}</div>
        </div>
        <button class="icon-btn-round" style="background:var(--dark-card-2);border-color:var(--dark-border);">👛</button>
      </div>
      <div class="grid-2">
        <div class="card-nested"><div class="eyebrow">💳 Available</div><div style="font-size:18px;font-weight:700;" class="${avail >= 0 ? 'positive' : 'negative'}">${fmtMoney(avail)}</div></div>
        <div class="card-nested"><div class="eyebrow">🎯 In pockets</div><div style="font-size:18px;font-weight:700;color:var(--accent-1);">${fmtMoney(pockets)}</div></div>
      </div>
      <div class="chip-scroll">${chips || '<span style="opacity:.5;font-size:13px;">No accounts yet</span>'}</div>
    </div>

    <button class="btn primary full" style="margin-bottom:22px;" onclick="openAccountForm()">+ &nbsp;Add account</button>

    <div class="stack-gap-16">
      ${sortedAccounts.map(accountCardHtml).join('') || `<div class="empty-state"><div class="emoji">🏦</div><div class="title">No accounts yet</div><div class="sub">Add your first account to get started.</div></div>`}
    </div>
  </div>`;
}

function accountCardHtml(acc) {
  const expanded = ui.openAccountId === acc.id;
  const pocketsTot = pocketsTotalFor(acc);
  return `
  <div class="card-dark" style="border-bottom:3px solid ${acc.color}; padding-bottom:19px;">
    <div class="row-flex">
      <div style="display:flex;align-items:center;gap:12px;">
        ${accountIconHtml(acc, 30)}
        <div>
          <div style="font-weight:700;font-size:15px;">${escHtml(acc.name)} <span class="badge" style="background:var(--dark-card-2);color:var(--dark-text-dim);margin-left:4px;">${acc.currency}</span></div>
        </div>
      </div>
      <div style="display:flex;gap:2px;align-items:center;">
        <button class="icon-btn-round" style="width:32px;height:32px;background:none;border:none;" onclick="toggleAccountExpand('${acc.id}')">${expanded ? '⌃' : '⌄'}</button>
        <button class="icon-btn-round" style="width:32px;height:32px;background:none;border:none;" onclick="openAccountForm('${acc.id}')">✎</button>
        <button class="icon-btn-round" style="width:32px;height:32px;background:none;border:none;" onclick="deleteAccount('${acc.id}')">🗑</button>
      </div>
    </div>
    <div class="row-flex" style="margin-top:14px;">
      <div><div class="eyebrow">Total</div><div style="font-weight:700;font-size:17px;">${fmtMoney(acc.balance, acc.currency)}</div></div>
      ${pocketsTot > 0 ? `<div style="text-align:right;"><div class="eyebrow">In pockets</div><div style="font-weight:700;font-size:17px;color:var(--accent-1);">${fmtMoney(pocketsTot, acc.currency)}</div></div>` : ''}
    </div>
    ${expanded ? accountExpandedHtml(acc) : ''}
  </div>`;
}

function accountExpandedHtml(acc) {
  const pocketsTot = pocketsTotalFor(acc);
  const avail = acc.balance - pocketsTot;
  return `
    <div style="margin-top:18px;padding-top:18px;border-top:1px solid var(--dark-border);">
      <div class="grid-2" style="margin-bottom:14px;">
        <div class="card-nested"><div class="eyebrow">Available</div><div style="font-weight:700;">${fmtMoney(avail, acc.currency)}</div></div>
        <div class="card-nested"><div class="eyebrow">In pockets</div><div style="font-weight:700;">${fmtMoney(pocketsTot, acc.currency)}</div></div>
      </div>
      <div style="margin-bottom:16px;">
        <label class="field"><span class="label-text">Update balance…</span>
          <div style="display:flex;gap:8px;">
            <input type="number" step="0.01" id="quickbal-${acc.id}" placeholder="${acc.balance}">
            <button class="btn primary" onclick="quickUpdateBalance('${acc.id}')">Set</button>
          </div>
        </label>
      </div>
      <div class="row-flex" style="margin-bottom:10px;">
        <div style="font-weight:700;font-size:13.5px;">Pockets · ${fmtMoney(pocketsTot, acc.currency)} allocated</div>
        <button class="btn small" onclick="openPocketForm('${acc.id}')">+ Add pocket</button>
      </div>
      <div class="stack-gap-8">
        ${(acc.pockets || []).slice().sort((a, b) => b.amountSaved - a.amountSaved).map(p => pocketRowHtml(acc, p)).join('') || '<div style="opacity:.5;font-size:13px;">No pockets yet.</div>'}
      </div>
    </div>`;
}

function pocketRowHtml(acc, p) {
  const pct = p.targetAmount ? Math.min(100, (p.amountSaved / p.targetAmount * 100)) : null;
  return `
  <div class="card-nested">
    <div class="row-flex">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:15px;">${p.icon || '🎯'}</span>
        <div>
          <div style="font-weight:600;font-size:13.5px;">${escHtml(p.name)}</div>
          <div style="font-size:12px;opacity:.6;">${fmtMoney(p.amountSaved, acc.currency)}${p.targetAmount ? ' / ' + fmtMoney(p.targetAmount, acc.currency) + ' · ' + pct.toFixed(0) + '%' : ''}</div>
        </div>
      </div>
      <div style="display:flex;gap:2px;">
        <button class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" onclick="openPocketForm('${acc.id}','${p.id}')">✎</button>
        <button class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" onclick="deletePocket('${acc.id}','${p.id}')">🗑</button>
      </div>
    </div>
    ${pct !== null ? `<div style="height:5px;border-radius:4px;background:var(--dark-border);overflow:hidden;margin-top:9px;"><div style="height:100%;width:${pct}%;background:${p.color};"></div></div>` : ''}
  </div>`;
}

function toggleAccountExpand(id) { ui.openAccountId = ui.openAccountId === id ? null : id; render(); }
function toggleBrokerExpand(id) { ui.openBrokerId = ui.openBrokerId === id ? null : id; render(); }
function quickUpdateBalance(id) {
  const el = document.getElementById('quickbal-' + id);
  const v = parseFloat(el.value);
  if (isNaN(v)) return;
  accountById(id).balance = v;
  save(); render();
}
function deleteAccount(id) { data.accounts = data.accounts.filter(a => a.id !== id); save(); render(); }
function deletePocket(accId, pkId) { const acc = accountById(accId); acc.pockets = acc.pockets.filter(p => p.id !== pkId); save(); render(); }

/* ---- Account form modal ---- */
function openAccountForm(id) { ui.modal = { type: 'account', payload: { id: id || null } }; render(); }
window.__modalRenderers.account = function (payload) {
  const acc = payload.id ? accountById(payload.id) : null;
  return `
    <div class="modal-head"><div class="modal-title">${acc ? 'Edit account' : 'New account'}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="stack-gap-12">
      <label class="field"><span class="label-text">Icon</span><input id="af-icon" value="${escHtml(acc ? acc.icon : '🏦')}" maxlength="4"></label>
      <label class="field"><span class="label-text">Account name</span><input id="af-name" placeholder="Account name (e.g. Revolut, BNP...)" value="${escHtml(acc ? acc.name : '')}"></label>
      <div class="form-grid">
        <label class="field"><span class="label-text">Current balance</span><input id="af-balance" type="number" step="0.01" value="${acc ? acc.balance : ''}"></label>
        <label class="field"><span class="label-text">Currency</span><select id="af-currency">${CURRENCIES.map(c => `<option ${acc && acc.currency === c ? 'selected' : (!acc && c === 'EUR' ? 'selected' : '')}>${c}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span class="label-text">Description / note</span><input id="af-desc" value="${escHtml(acc ? acc.description || '' : '')}"></label>
      <label class="field"><span class="label-text">Logo / image URL</span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="af-logo" style="flex:1;" value="${escHtml(acc ? (acc.logoKind === 'image' ? acc.logo : '') : '')}" placeholder="https://…">${logoPickerButtonHtml('af-logo')}</div>
        ${logoPickerPopoverHtml('af-logo')}
      </label>
      <div>
        <span class="label-text" style="font-size:12px;opacity:.7;">Card color</span>
        ${colorPickerHtml(acc ? acc.color : ACCOUNT_COLORS[0])}
      </div>
      <div class="row-flex" style="padding-top:4px;">
        <span class="label-text" style="font-size:13px;">Visible in totals &amp; dashboard</span>
        <div class="toggle ${!acc || acc.visibleInTotals ? 'on' : ''}" id="af-visible" onclick="this.classList.toggle('on')"></div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="saveAccountForm('${acc ? acc.id : ''}')">✓ Save</button>
      <button class="btn ghost" onclick="closeModal()">✕</button>
    </div>`;
};
/* Full palette selector: a curated color grid plus a "more colors" custom swatch backed by a
   native <input type="color">. Selection state lives entirely in the DOM (a .selected class +
   data-color), read back by the form's save function — same contract the old fixed-swatch
   picker used, so callers didn't need to change. */
function colorPickerHtml(current) {
  const flat = FULL_COLOR_PALETTE.flat();
  const isCustom = !flat.includes(current);
  return `
    <div class="color-picker" style="margin-top:6px;">
      ${FULL_COLOR_PALETTE.map(row => `<div class="color-picker-row">${row.map(c => `<span class="swatch-dot ${current === c ? 'selected' : ''}" data-color="${c}" style="background:${c};" title="${c}" onclick="selectSwatch(this)"></span>`).join('')}</div>`).join('')}
      <div class="color-picker-row">
        <label class="swatch-dot swatch-custom ${isCustom ? 'selected' : ''}" data-color="${isCustom ? current : '#6C63FF'}" style="${isCustom ? `background:${current};` : ''}" title="More colors…">
          <input type="color" value="${isCustom ? current : '#6C63FF'}" oninput="selectCustomSwatch(this)">
        </label>
        <span style="font-size:11px;opacity:.55;align-self:center;">More colors…</span>
      </div>
    </div>`;
}
function selectSwatch(el) {
  const container = el.closest('.color-picker') || el.parentElement;
  container.querySelectorAll('.swatch-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
}
function selectCustomSwatch(input) {
  const label = input.parentElement;
  label.dataset.color = input.value;
  label.style.background = input.value;
  selectSwatch(label);
}
function saveAccountForm(id) {
  const name = document.getElementById('af-name').value.trim();
  if (!name) return;
  const balance = parseFloat(document.getElementById('af-balance').value);
  if (isNaN(balance)) return;
  const icon = document.getElementById('af-icon').value.trim() || '🏦';
  const currency = document.getElementById('af-currency').value;
  const description = document.getElementById('af-desc').value.trim();
  const logo = document.getElementById('af-logo').value.trim();
  const selectedSwatch = document.querySelector('#app .modal .swatch-dot.selected');
  const color = selectedSwatch ? selectedSwatch.dataset.color : ACCOUNT_COLORS[0];
  const visibleInTotals = document.getElementById('af-visible').classList.contains('on');

  if (id) {
    const acc = accountById(id);
    Object.assign(acc, { name, balance, icon, currency, description, color, visibleInTotals });
    if (logo) { acc.logo = logo; acc.logoKind = 'image'; } else { acc.logoKind = 'emoji'; }
  } else {
    data.accounts.push({ id: uid('acc'), icon, name, currency, balance, description, logo: logo || '', logoKind: logo ? 'image' : 'emoji', color, visibleInTotals, pockets: [] });
  }
  save(); closeModal();
}

/* ---- Pocket form modal ---- */
function openPocketForm(accId, pkId) { ui.modal = { type: 'pocket', payload: { accId, pkId: pkId || null } }; render(); }
window.__modalRenderers.pocket = function (payload) {
  const acc = accountById(payload.accId);
  const pk = payload.pkId ? acc.pockets.find(p => p.id === payload.pkId) : null;
  return `
    <div class="modal-head"><div class="modal-title">${pk ? 'Edit pocket' : 'Add pocket'}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="stack-gap-12">
      <label class="field"><span class="label-text">Icon</span><input id="pf-icon" value="${escHtml(pk ? pk.icon : '🎯')}" maxlength="4"></label>
      <label class="field"><span class="label-text">Pocket name</span><input id="pf-name" value="${escHtml(pk ? pk.name : '')}"></label>
      <div class="form-grid">
        <label class="field"><span class="label-text">Amount saved</span><input id="pf-saved" type="number" step="0.01" value="${pk ? pk.amountSaved : ''}"></label>
        <label class="field"><span class="label-text">Target amount</span><input id="pf-target" type="number" step="0.01" value="${pk && pk.targetAmount ? pk.targetAmount : ''}"></label>
      </div>
      <div>
        <span class="label-text" style="font-size:12px;opacity:.7;">Color</span>
        ${colorPickerHtml(pk ? pk.color : POCKET_COLORS[0])}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="savePocketForm('${payload.accId}','${payload.pkId || ''}')">✓ Save</button>
      <button class="btn ghost" onclick="closeModal()">✕</button>
    </div>`;
};
function savePocketForm(accId, pkId) {
  const name = document.getElementById('pf-name').value.trim();
  const amountSaved = parseFloat(document.getElementById('pf-saved').value);
  if (!name || isNaN(amountSaved)) return;
  const targetRaw = document.getElementById('pf-target').value;
  const targetAmount = targetRaw === '' ? null : parseFloat(targetRaw);
  const icon = document.getElementById('pf-icon').value.trim() || '🎯';
  const selectedSwatch = document.querySelector('#app .modal .swatch-dot.selected');
  const color = selectedSwatch ? selectedSwatch.dataset.color : POCKET_COLORS[0];
  const acc = accountById(accId);
  if (pkId) {
    Object.assign(acc.pockets.find(p => p.id === pkId), { name, amountSaved, targetAmount, icon, color });
  } else {
    acc.pockets.push({ id: uid('pk'), icon, name, amountSaved, targetAmount, color });
  }
  save(); closeModal();
}
/* ===================== Budget ===================== */
function renderBudget() {
  const tabs = [
    { id: 'transactions', label: '🧾 Transactions' },
    { id: 'recurring', label: '🔄 Recurring' },
    { id: 'categories', label: '🏷️ Categories' },
  ];
  return `
  <div class="page surface-light">
    <div class="page-head">
      <div><h1 class="page-title">Budget</h1><div class="page-subtitle">${data.budgetTransactions.length} transaction${data.budgetTransactions.length !== 1 ? 's' : ''} logged</div></div>
    </div>
    <div class="tab-row">
      ${tabs.map(t => `<button class="tab-btn ${ui.budgetTab === t.id ? 'active' : ''}" onclick="setBudgetTab('${t.id}')">${t.label}</button>`).join('')}
    </div>
    ${ui.budgetTab === 'transactions' ? budgetTransactionsTab() : ''}
    ${ui.budgetTab === 'recurring' ? budgetRecurringTab() : ''}
    ${ui.budgetTab === 'categories' ? `<div class="card">${categoryEditorHtml()}</div>` : ''}
  </div>`;
}
function setBudgetTab(t) { ui.budgetTab = t; render(); }

function budgetTransactionsTab() {
  const m = ui.budgetMonth;
  const txs = monthTransactions(m).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const income = monthIncome(m), expenses = monthExpenses(m), balance = income - expenses;
  const dayGroups = groupTransactionsByDay(txs);
  const trendPoints = monthSpendTrendPoints(m);
  const categorySegments = categorySpendingSegments(m);
  const categoryTotal = categorySegments.reduce((s, x) => s + x.value, 0) || 1;
  const atMin = m.getFullYear() === BUDGET_MIN_MONTH.getFullYear() && m.getMonth() === BUDGET_MIN_MONTH.getMonth();
  return `
    <div class="row-flex" style="margin-bottom:10px;">
      <button class="icon-btn-round" onclick="shiftBudgetMonth(-1)" ${atMin ? 'style="opacity:.3;cursor:default;" disabled' : ''}>‹</button>
      <div style="font-weight:700;font-size:16px;">${monthLabel(m)}</div>
      <button class="icon-btn-round" onclick="shiftBudgetMonth(1)">›</button>
    </div>
    ${budgetMonthPillsHtml(m)}

    <div class="grid-3" style="margin-bottom:20px;">
      <div class="card"><div class="row-flex"><div><div class="eyebrow">Income</div><div style="font-size:20px;font-weight:700;" class="positive">${fmtMoney(income)}</div></div><span style="font-size:20px;">📈</span></div></div>
      <div class="card"><div class="row-flex"><div><div class="eyebrow">Expenses</div><div style="font-size:20px;font-weight:700;" class="negative">${fmtMoney(expenses)}</div></div><span style="font-size:20px;">📉</span></div></div>
      <div class="card"><div class="row-flex"><div><div class="eyebrow">Balance</div><div style="font-size:20px;font-weight:700;" class="${balance >= 0 ? 'positive' : 'negative'}">${fmtMoney(balance)}</div></div><span style="font-size:20px;">👛</span></div></div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="eyebrow" style="margin-bottom:10px;">Spending trend</div>
      ${trendChartOrPlaceholder(trendPoints, 120)}
    </div>

    <button class="btn primary full" style="margin-bottom:10px;" onclick="openTxForm()">+ Add transaction</button>
    <button class="btn full" style="margin-bottom:22px;" onclick="exportBudgetTransactionsExcel()" title="Every logged transaction — date, type, category, sub-category, amount, and more">⬇ Export all to Excel</button>

    ${dayGroups.length ? dayGroups.map(dayGroupHtml).join('') : `
      <div class="card" style="margin-bottom:20px;"><div class="empty-state"><div class="emoji">📭</div><div class="title">No transactions yet for this month</div><div class="sub">Start tracking your finances by adding your first transaction.</div></div></div>`}

    <div class="card" style="margin-top:8px;margin-bottom:20px;">
      <div class="eyebrow" style="margin-bottom:14px;">Spending by category</div>
      ${categorySegments.length ? `
        <div style="display:flex;align-items:center;gap:26px;flex-wrap:wrap;">
          ${svgDonut(categorySegments, { size: 140, stroke: 22 })}
          <div class="stack-gap-8">
            ${categorySegments.map(s => `<div style="display:flex;align-items:center;gap:8px;font-size:13.5px;"><span style="width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block;"></span>${s.icon || ''} ${escHtml(s.label)} · ${(s.value / categoryTotal * 100).toFixed(0)}%</div>`).join('')}
          </div>
        </div>` : `<div style="opacity:.5;font-size:13px;">No expenses yet this month.</div>`}
    </div>

    <div class="card">
      <div class="eyebrow" style="margin-bottom:14px;">Income vs expenses</div>
      ${cashflowBarsHtml(m)}
    </div>`;
}

/* Rolling 6-month strip ending at the currently-viewed month (slides as you navigate further
   forward — never earlier than BUDGET_MIN_MONTH, since no data exists before it) — click any
   pill to jump straight to that month, Revolut-style. Always includes every future month you
   page into, so the timeline naturally keeps extending as time passes. */
function budgetMonthPillsHtml(m) {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(m.getFullYear(), m.getMonth() - i, 1);
    if (d >= BUDGET_MIN_MONTH) months.push(d);
  }
  if (!months.length) months.push(new Date(m.getFullYear(), m.getMonth(), 1));
  return `<div class="chip-scroll" style="margin-bottom:18px;">
    ${months.map(d => {
      const active = d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
      return `<span class="chip" style="cursor:pointer;${active ? 'background:var(--light-accent-1);border-color:var(--light-accent-1);color:#fff;' : ''}" onclick="setBudgetMonthTo(${d.getFullYear()},${d.getMonth()})">${d.toLocaleDateString('en-US', { month: 'short' })}</span>`;
    }).join('')}
  </div>`;
}
function setBudgetMonthTo(year, month) {
  const d = new Date(year, month, 1);
  ui.budgetMonth = d < BUDGET_MIN_MONTH ? new Date(BUDGET_MIN_MONTH) : d;
  render();
}

/* Cumulative expenses by day of month — a real running total from actual transaction dates,
   truncated at today for the current month so the line doesn't flatline through unlived days. */
function monthSpendTrendPoints(monthDate) {
  const y = monthDate.getFullYear(), m = monthDate.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = y === today.getFullYear() && m === today.getMonth();
  const maxDay = isCurrentMonth ? today.getDate() : daysInMonth;
  const dayTotals = {};
  monthTransactions(monthDate).filter(t => t.type === 'expense').forEach(t => {
    const d = new Date(t.date).getDate();
    dayTotals[d] = (dayTotals[d] || 0) + toEUR(t.amount, t.currency);
  });
  let running = 0;
  const points = [];
  for (let d = 1; d <= maxDay; d++) {
    running += (dayTotals[d] || 0);
    points.push({ label: String(d), value: running });
  }
  return points;
}

/* Groups (already date-sorted, descending) transactions into per-day buckets, preserving
   order — powers the Revolut-style "Today / Yesterday / 3 July" day sections. */
function groupTransactionsByDay(txs) {
  const groups = {}, order = [];
  txs.forEach(t => {
    if (!groups[t.date]) { groups[t.date] = []; order.push(t.date); }
    groups[t.date].push(t);
  });
  return order.map(date => ({ date, txs: groups[date] }));
}
function dayLabel(dateStr) {
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
function dayGroupHtml(group) {
  const netEUR = group.txs.reduce((s, t) => s + toEUR(t.type === 'income' ? t.amount : -t.amount, t.currency), 0);
  return `
    <div class="row-flex" style="margin:18px 0 8px;">
      <div style="font-weight:700;font-size:14px;">${dayLabel(group.date)}</div>
      <div class="${netEUR >= 0 ? 'positive' : 'negative'}" style="font-weight:600;font-size:13px;">${netEUR >= 0 ? '+' : ''}${fmtMoney(netEUR)}</div>
    </div>
    <div class="card stack-gap-16">
      ${group.txs.map(txRowDisplayHtml).join('')}
    </div>`;
}
/* Deterministic color from the app's existing full palette (see FULL_COLOR_PALETTE) — same
   label always gets the same color, without inventing a new ad-hoc color system. */
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const flat = FULL_COLOR_PALETTE.flat();
  return flat[h % flat.length];
}
/* Avatar circle — shows the transaction's own logo if it has one (item 8: same img+fallback
   swap pattern as assetLogoHtml/logoImg elsewhere), else the category/sub-category's emoji
   (item 3) in a color derived from the transaction's label, plus a small income/expense badge.
   Never fabricates a merchant logo — only ever shows one the user actually set. */
function txAvatarHtml(t) {
  const cat = categoryById(t.type === 'income' ? 'income' : 'expense', t.categoryId);
  const subcat = cat ? (cat.subcategories || []).find(s => s.id === t.subCategoryId) : null;
  const emoji = (subcat && subcat.icon) || (cat && cat.icon) || (t.type === 'income' ? '💰' : '💸');
  const label = t.comment || (cat ? cat.name : '?');
  const color = hashColor(label);
  const fallback = `<span style="display:${t.logo ? 'none' : 'flex'};width:38px;height:38px;border-radius:50%;background:${color};align-items:center;justify-content:center;font-size:17px;">${emoji}</span>`;
  const img = t.logo ? `<img src="${escHtml(t.logo)}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : '';
  return `<div style="position:relative;width:38px;height:38px;flex:none;">
    ${img}${fallback}
    <span style="position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:var(--light-card);border:1px solid var(--light-border);display:flex;align-items:center;justify-content:center;font-size:9px;">${t.type === 'income' ? '💰' : '💸'}</span>
  </div>`;
}
function txRowDisplayHtml(t) {
  const cat = categoryById(t.type === 'income' ? 'income' : 'expense', t.categoryId);
  const subcat = cat ? (cat.subcategories || []).find(s => s.id === t.subCategoryId) : null;
  const pm = paymentMethodById(t.paymentMethodId);
  const label = t.comment || (cat ? cat.name : '—');
  const catLabel = subcat ? `${cat.name} · ${subcat.name}` : (cat ? cat.name : '');
  const subtitle = t.comment ? catLabel : (pm ? pm.name : '');
  return `
    <div class="row-flex" style="cursor:pointer;" onclick="openTxForm('${t.id}')">
      <div style="display:flex;align-items:center;gap:12px;">
        ${txAvatarHtml(t)}
        <div>
          <div style="font-weight:600;font-size:14px;">${escHtml(label)}${t.nature === 'Fixed' ? ' <span style="font-size:11px;opacity:.5;">🔄</span>' : ''}${t.impact === 'positive' ? ' <span style="font-size:11px;" title="Positive impact">🙂</span>' : t.impact === 'negative' ? ' <span style="font-size:11px;" title="Negative impact">🙁</span>' : ''}</div>
          <div style="font-size:12px;opacity:.55;">${escHtml(subtitle || '—')}${t.location ? ' · ' + escHtml(t.location) : ''}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <div class="${t.type === 'income' ? 'positive' : 'negative'}" style="font-weight:700;font-size:14.5px;">${t.type === 'income' ? '+' : '-'}${fmtMoney(Math.abs(t.amount), t.currency)}</div>
        <button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" onclick="event.stopPropagation();deleteBudgetTx('${t.id}')">🗑</button>
      </div>
    </div>`;
}

/* Item 7: same card/row language as the Transactions tab (grid-2/3 stat cards, txRowDisplayHtml
   rows with avatars) instead of a bare data-table — the two tabs now feel like one page. */
function budgetRecurringTab() {
  const recurring = data.budgetTransactions.filter(t => t.nature === 'Fixed').sort((a, b) => new Date(b.date) - new Date(a.date));
  const fixedIncome = recurring.filter(t => t.type === 'income').reduce((s, t) => s + toEUR(t.amount, t.currency), 0);
  const fixedExpenses = recurring.filter(t => t.type === 'expense').reduce((s, t) => s + toEUR(t.amount, t.currency), 0);
  return `
    <div class="grid-2" style="margin-bottom:20px;">
      <div class="card"><div class="row-flex"><div><div class="eyebrow">Fixed income</div><div style="font-size:20px;font-weight:700;" class="positive">${fmtMoney(fixedIncome)}</div></div><span style="font-size:20px;">📈</span></div></div>
      <div class="card"><div class="row-flex"><div><div class="eyebrow">Fixed expenses</div><div style="font-size:20px;font-weight:700;" class="negative">${fmtMoney(fixedExpenses)}</div></div><span style="font-size:20px;">📉</span></div></div>
    </div>
    ${recurring.length ? `<div class="card stack-gap-16">${recurring.map(txRowDisplayHtml).join('')}</div>` : `
      <div class="card"><div class="empty-state"><div class="emoji">🔄</div><div class="title">No recurring items yet</div><div class="sub">Mark a transaction "Fixed / Recurring" to see it here.</div></div></div>`}`;
}

/* Item 2: the calendar grid was removed entirely (no real purpose) in favor of the month-pill
   timeline above plus the spending/cashflow charts below. Forward navigation stays unbounded;
   backward is clamped at BUDGET_MIN_MONTH since no data exists before it. */
function shiftBudgetMonth(delta) {
  const d = new Date(ui.budgetMonth); d.setMonth(d.getMonth() + delta);
  if (d < BUDGET_MIN_MONTH) return;
  ui.budgetMonth = d; render();
}
/* Real per-category expense totals for the month, powering the "Spending by category" donut —
   same color-per-label convention as the transaction avatars (hashColor). */
function categorySpendingSegments(monthDate) {
  const byCategory = {};
  monthTransactions(monthDate).filter(t => t.type === 'expense').forEach(t => {
    const cat = categoryById('expense', t.categoryId);
    const key = cat ? cat.id : 'uncategorized';
    if (!byCategory[key]) byCategory[key] = { label: cat ? cat.name : 'Uncategorized', icon: cat ? cat.icon : '❓', value: 0 };
    byCategory[key].value += toEUR(t.amount, t.currency);
  });
  return Object.values(byCategory).map(x => ({ ...x, color: hashColor(x.label) })).sort((a, b) => b.value - a.value);
}
/* Real month-by-month income/expense bars (item 4's "cashflow" chart) — bounded the same way
   the timeline is, never showing months before real data could exist. */
function cashflowTrendData(monthDate) {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(monthDate.getFullYear(), monthDate.getMonth() - i, 1);
    if (d >= BUDGET_MIN_MONTH) months.push(d);
  }
  if (!months.length) months.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
  return months.map(d => ({ label: d.toLocaleDateString('en-US', { month: 'short' }), income: monthIncome(d), expenses: monthExpenses(d) }));
}
function cashflowBarsHtml(monthDate) {
  const months = cashflowTrendData(monthDate);
  const maxVal = Math.max(...months.flatMap(x => [x.income, x.expenses]), 1);
  return `
    <div style="display:flex;gap:14px;align-items:flex-end;height:110px;margin-bottom:10px;">
      ${months.map(x => `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div style="display:flex;gap:3px;align-items:flex-end;height:80px;">
            <div style="width:12px;height:${Math.max(4, (x.income / maxVal) * 80)}px;background:var(--positive);border-radius:3px 3px 0 0;" title="Income ${fmtMoney(x.income)}"></div>
            <div style="width:12px;height:${Math.max(4, (x.expenses / maxVal) * 80)}px;background:var(--negative);border-radius:3px 3px 0 0;" title="Expenses ${fmtMoney(x.expenses)}"></div>
          </div>
          <div style="font-size:10px;opacity:.55;">${x.label}</div>
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:16px;font-size:12px;opacity:.7;">
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--positive);margin-right:5px;"></span>Income</span>
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--negative);margin-right:5px;"></span>Expenses</span>
    </div>`;
}
function deleteBudgetTx(id) { data.budgetTransactions = data.budgetTransactions.filter(t => t.id !== id); save(); render(); }

/* ---- Category editor (shared between Budget>Categories and Settings>Categories) ----
   Item 3/6: every category and subcategory shows a clickable emoji (opens a picker) and is
   fully renameable in place, plus payment methods get the same treatment — all reusing one
   shared row/picker pattern instead of three separate ad-hoc UIs. */
const EMOJI_PICKER_SET = [
  '🏠', '🏢', '🏦', '🏨', '🏥', '🏫', '🏋️', '💼', '🧑‍💻', '🧑‍🏫', '🎓',
  '🛒', '🍔', '🍕', '🍽️', '🥡', '☕', '🍹', '🛵',
  '🚗', '🚌', '🚕', '🚆', '✈️', '⛽', '🅿️', '🔧',
  '📱', '📺', '💻', '🎫', '📰', '🎬', '🎵', '🎮', '🎨', '🗺️',
  '👕', '👗', '🔌', '🛋️', '🛍️',
  '💊', '🩺', '🛡️', '💆', '💇', '💄', '💅',
  '🎁', '❤️', '🎉', '🐾', '⚽', '🏖️',
  '💡', '📶', '🧾', '📝', '💳', '💵',
  '💰', '📈', '📉', '🛟', '🚀', '⭐', '📦', '❓',
];
function categoryEditorHtml() {
  return `
    ${categoryGroupHtml('income', 'Income categories')}
    ${categoryGroupHtml('expense', 'Expense categories')}
    ${paymentMethodsEditorHtml()}`;
}
function categoryGroupHtml(kind, title) {
  return `
    <div style="margin-bottom:26px;">
      <div style="font-weight:700;margin-bottom:12px;">${title}</div>
      <div class="stack-gap-8">
        ${data.categories[kind].map(c => categoryRowHtml(kind, c)).join('') || '<div style="opacity:.5;font-size:13px;">No categories yet.</div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <input id="new-${kind}-cat" placeholder="Add ${kind} category…">
        <button class="btn primary" onclick="addCategory('${kind}')">+</button>
      </div>
    </div>`;
}
function categoryRowHtml(kind, cat) {
  return `
    <div class="card-nested">
      ${categoryNodeRowHtml(kind, cat.id, null)}
      ${(cat.subcategories || []).length ? `
        <div style="margin:10px 0 0 30px;display:flex;flex-direction:column;gap:8px;">
          ${cat.subcategories.map(sc => categoryNodeRowHtml(kind, cat.id, sc.id)).join('')}
        </div>` : ''}
      <div style="margin-left:30px;margin-top:8px;">
        ${ui.addingSubcatFor === cat.id
          ? `<div style="display:flex;gap:6px;"><input id="new-subcat-${cat.id}" placeholder="Sub-category name…" style="max-width:200px;"><button class="btn small primary" onclick="saveNewSubcategory('${kind}','${cat.id}')">Add</button></div>`
          : `<button class="btn small" onclick="toggleAddSubcategory('${cat.id}')">+ Sub-category</button>`}
      </div>
    </div>`;
}
function categoryNodeKey(catId, subId) { return subId ? catId + '::' + subId : catId; }
function getCategoryNode(kind, catId, subId) {
  const cat = data.categories[kind].find(c => c.id === catId);
  if (!cat) return null;
  if (!subId) return cat;
  return (cat.subcategories || []).find(s => s.id === subId) || null;
}
function categoryNodeRowHtml(kind, catId, subId) {
  const node = getCategoryNode(kind, catId, subId);
  if (!node) return '';
  const key = categoryNodeKey(catId, subId);
  const editing = ui.categoryEditOpen === key;
  const pickerOpen = ui.emojiPickerOpen === key;
  return `
    <div>
      <div class="row-flex">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="cursor:pointer;font-size:${subId ? '16px' : '20px'};" onclick="toggleEmojiPicker('${key}')" title="Change icon">${node.icon || (subId ? '📎' : '📦')}</span>
          ${editing
            ? `<input id="cat-rename-${key}" value="${escHtml(node.name)}" style="max-width:180px;" onkeydown="if(event.key==='Enter')saveCategoryRename('${kind}','${catId}',${subId ? `'${subId}'` : 'null'})">`
            : `<span style="font-weight:${subId ? 500 : 600};font-size:${subId ? '12.5px' : '13.5px'};">${escHtml(node.name)}</span>`}
        </div>
        <div style="display:flex;gap:2px;">
          ${editing
            ? `<button class="btn small primary" style="padding:4px 10px;" onclick="saveCategoryRename('${kind}','${catId}',${subId ? `'${subId}'` : 'null'})">Save</button>`
            : `<button class="icon-btn-round" style="width:24px;height:24px;background:none;border:none;" onclick="toggleCategoryRename('${key}')">✎</button>`}
          <button class="icon-btn-round" style="width:24px;height:24px;background:none;border:none;" onclick="${subId ? `removeSubcategory('${kind}','${catId}','${subId}')` : `removeCategory('${kind}','${catId}')`}">🗑</button>
        </div>
      </div>
      ${pickerOpen ? emojiPickerHtml(kind, catId, subId) : ''}
    </div>`;
}
function emojiPickerHtml(kind, catId, subId) {
  const key = categoryNodeKey(catId, subId);
  return `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;padding:10px;background:rgba(128,128,128,0.06);border-radius:var(--radius-sm);align-items:center;">
      ${EMOJI_PICKER_SET.map(e => `<span style="cursor:pointer;font-size:18px;padding:4px;" onclick="setCategoryIcon('${kind}','${catId}',${subId ? `'${subId}'` : 'null'},'${e}')">${e}</span>`).join('')}
      <input id="emoji-custom-${key}" placeholder="Custom" style="max-width:70px;" maxlength="4">
      <button class="btn small" onclick="setCategoryIconFromInput('${kind}','${catId}',${subId ? `'${subId}'` : 'null'})">Use</button>
    </div>`;
}
function toggleEmojiPicker(key) { ui.emojiPickerOpen = ui.emojiPickerOpen === key ? null : key; ui.categoryEditOpen = null; render(); }
function toggleCategoryRename(key) { ui.categoryEditOpen = ui.categoryEditOpen === key ? null : key; ui.emojiPickerOpen = null; render(); }
function setCategoryIcon(kind, catId, subId, emoji) {
  const node = getCategoryNode(kind, catId, subId);
  if (!node) return;
  node.icon = emoji;
  ui.emojiPickerOpen = null;
  save(); render();
}
function setCategoryIconFromInput(kind, catId, subId) {
  const key = categoryNodeKey(catId, subId);
  const el = document.getElementById('emoji-custom-' + key);
  const val = el ? el.value.trim() : '';
  if (!val) return;
  setCategoryIcon(kind, catId, subId, val);
}
function saveCategoryRename(kind, catId, subId) {
  const key = categoryNodeKey(catId, subId);
  const el = document.getElementById('cat-rename-' + key);
  const val = el ? el.value.trim() : '';
  if (!val) return;
  const node = getCategoryNode(kind, catId, subId);
  if (!node) return;
  node.name = val;
  ui.categoryEditOpen = null;
  save(); render();
}
function toggleAddSubcategory(catId) { ui.addingSubcatFor = ui.addingSubcatFor === catId ? null : catId; render(); }
function saveNewSubcategory(kind, catId) {
  const input = document.getElementById('new-subcat-' + catId);
  const name = input.value.trim();
  if (!name) return;
  const cat = data.categories[kind].find(c => c.id === catId);
  if (!cat) return;
  if (!Array.isArray(cat.subcategories)) cat.subcategories = [];
  cat.subcategories.push({ id: uid('sc'), name, icon: cat.icon || '📎' });
  ui.addingSubcatFor = null;
  save(); render();
}
function removeSubcategory(kind, catId, subId) {
  const cat = data.categories[kind].find(c => c.id === catId);
  if (!cat) return;
  cat.subcategories = (cat.subcategories || []).filter(s => s.id !== subId);
  save(); render();
}
function addCategory(kind) {
  const input = document.getElementById('new-' + kind + '-cat');
  const name = input.value.trim();
  if (!name) return;
  data.categories[kind].push({ id: uid('cat'), name, icon: kind === 'income' ? '💰' : '📦', subcategories: [] });
  save(); render();
}
function removeCategory(kind, id) { data.categories[kind] = data.categories[kind].filter(c => c.id !== id); save(); render(); }

/* ---- Payment methods editor (item 6: genuinely useful, previously not editable at all) ---- */
function paymentMethodsEditorHtml() {
  return `
    <div>
      <div style="font-weight:700;margin-bottom:12px;">Payment methods</div>
      <div class="stack-gap-8">
        ${data.paymentMethods.map(pm => paymentMethodRowHtml(pm)).join('') || '<div style="opacity:.5;font-size:13px;">No payment methods yet.</div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <input id="new-pm" placeholder="Add payment method…">
        <button class="btn primary" onclick="addPaymentMethod()">+</button>
      </div>
    </div>`;
}
function paymentMethodRowHtml(pm) {
  const key = 'pm::' + pm.id;
  const editing = ui.categoryEditOpen === key;
  const pickerOpen = ui.emojiPickerOpen === key;
  return `
    <div class="card-nested">
      <div class="row-flex">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="cursor:pointer;font-size:20px;" onclick="toggleEmojiPicker('${key}')" title="Change icon">${pm.icon || '💳'}</span>
          ${editing
            ? `<input id="cat-rename-${key}" value="${escHtml(pm.name)}" style="max-width:180px;" onkeydown="if(event.key==='Enter')savePaymentMethodRename('${pm.id}')">`
            : `<span style="font-weight:600;font-size:13.5px;">${escHtml(pm.name)}</span>`}
        </div>
        <div style="display:flex;gap:2px;">
          ${editing
            ? `<button class="btn small primary" style="padding:4px 10px;" onclick="savePaymentMethodRename('${pm.id}')">Save</button>`
            : `<button class="icon-btn-round" style="width:24px;height:24px;background:none;border:none;" onclick="toggleCategoryRename('${key}')">✎</button>`}
          <button class="icon-btn-round" style="width:24px;height:24px;background:none;border:none;" onclick="removePaymentMethod('${pm.id}')">🗑</button>
        </div>
      </div>
      ${pickerOpen ? `
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;padding:10px;background:rgba(128,128,128,0.06);border-radius:var(--radius-sm);">
          ${EMOJI_PICKER_SET.map(e => `<span style="cursor:pointer;font-size:18px;padding:4px;" onclick="setPaymentMethodIcon('${pm.id}','${e}')">${e}</span>`).join('')}
        </div>` : ''}
    </div>`;
}
function setPaymentMethodIcon(pmId, emoji) {
  const pm = paymentMethodById(pmId);
  if (!pm) return;
  pm.icon = emoji;
  ui.emojiPickerOpen = null;
  save(); render();
}
function savePaymentMethodRename(pmId) {
  const key = 'pm::' + pmId;
  const el = document.getElementById('cat-rename-' + key);
  const val = el ? el.value.trim() : '';
  if (!val) return;
  const pm = paymentMethodById(pmId);
  if (!pm) return;
  pm.name = val;
  ui.categoryEditOpen = null;
  save(); render();
}
function addPaymentMethod() {
  const input = document.getElementById('new-pm');
  const name = input.value.trim();
  if (!name) return;
  data.paymentMethods.push({ id: uid('pm'), name, icon: '💳' });
  save(); render();
}
function removePaymentMethod(id) { data.paymentMethods = data.paymentMethods.filter(p => p.id !== id); save(); render(); }

/* ---- Add/Edit transaction modal (single transaction — item 5: the old multi-row "+Row"
   batch-add flow was dropped as redundant now that each transaction carries a lot more detail
   (name-suggestions, logo, location, description) that doesn't fit well crammed N-at-a-time.
   The same modal/payload serves both "Add" (no id) and "Edit" (existing id) — item 1. ---- */
function blankTxDraft() {
  return { type: 'expense', categoryId: '', subCategoryId: '', nature: 'Variable', paymentMethodId: '', currency: data.settings.defaultCurrency, amount: '', date: new Date().toISOString().slice(0, 10), comment: '', location: '', description: '', logo: '', impact: '' };
}
function openTxForm(id) {
  const existing = id ? data.budgetTransactions.find(t => t.id === id) : null;
  ui.modal = { type: 'tx', payload: existing ? Object.assign({}, existing) : blankTxDraft() };
  ui.txSuggestions = [];
  render();
}
window.__modalRenderers.tx = function (payload) {
  const isEdit = !!payload.id;
  const cats = data.categories[payload.type === 'income' ? 'income' : 'expense'];
  const selectedCat = cats.find(c => c.id === payload.categoryId);
  const subcats = selectedCat ? (selectedCat.subcategories || []) : [];
  return `
    <div class="modal-head"><div class="modal-title">${isEdit ? 'Edit transaction' : 'Add transaction'}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <label class="field span-2"><span class="label-text">Name / payee</span>
        <input id="tx-name" value="${escHtml(payload.comment || '')}" placeholder="e.g. Albert Heijn" oninput="onTxNameInput(this.value)" onchange="updateTxField('comment',this.value)">
      </label>
      <div class="span-2" id="tx-suggestions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:-6px;">
        ${(ui.txSuggestions || []).map(s => `<span class="chip" style="cursor:pointer;font-size:12px;padding:6px 10px;" onclick="applyTxSuggestion('${escHtml(s).replace(/'/g, "\\'")}')">${escHtml(s)}</span>`).join('')}
      </div>
      <label class="field span-2"><span class="label-text">Date</span><input type="date" value="${payload.date}" onchange="updateTxField('date',this.value)"></label>
      <label class="field"><span class="label-text">Type</span>
        <select onchange="updateTxField('type',this.value)">
          <option value="expense" ${payload.type === 'expense' ? 'selected' : ''}>💸 Expense</option>
          <option value="income" ${payload.type === 'income' ? 'selected' : ''}>💰 Income</option>
        </select>
      </label>
      <label class="field"><span class="label-text">Category</span>
        <select onchange="updateTxField('categoryId',this.value)">
          <option value="">Select…</option>
          ${cats.map(c => `<option value="${c.id}" ${payload.categoryId === c.id ? 'selected' : ''}>${c.icon || ''} ${escHtml(c.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span class="label-text">Sub-category</span>
        <select onchange="updateTxField('subCategoryId',this.value)" ${subcats.length ? '' : 'disabled'}>
          <option value="">${subcats.length ? 'Select…' : '—'}</option>
          ${subcats.map(sc => `<option value="${sc.id}" ${payload.subCategoryId === sc.id ? 'selected' : ''}>${sc.icon || ''} ${escHtml(sc.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span class="label-text">Recurring</span>
        <select onchange="updateTxField('nature',this.value)">
          <option value="Variable" ${payload.nature === 'Variable' ? 'selected' : ''}>One-off / Variable</option>
          <option value="Fixed" ${payload.nature === 'Fixed' ? 'selected' : ''}>🔄 Fixed / Recurring</option>
        </select>
      </label>
      <label class="field"><span class="label-text">Payment method</span>
        <select onchange="updateTxField('paymentMethodId',this.value)">
          <option value="">Select…</option>
          ${data.paymentMethods.map(pm => `<option value="${pm.id}" ${payload.paymentMethodId === pm.id ? 'selected' : ''}>${pm.icon || ''} ${escHtml(pm.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span class="label-text">Personal impact <span style="opacity:.6;">(optional)</span></span>
        <select onchange="updateTxField('impact',this.value)">
          <option value="" ${!payload.impact ? 'selected' : ''}>— Neutral</option>
          <option value="positive" ${payload.impact === 'positive' ? 'selected' : ''}>🙂 Positive (e.g. donation)</option>
          <option value="negative" ${payload.impact === 'negative' ? 'selected' : ''}>🙁 Negative (e.g. tobacco)</option>
        </select>
      </label>
      <label class="field"><span class="label-text">Currency</span>
        <select onchange="updateTxField('currency',this.value)">${CURRENCIES.map(c => `<option ${payload.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label-text">Amount</span><input type="number" step="0.01" value="${payload.amount}" onchange="updateTxField('amount',this.value)"></label>
      <label class="field span-2"><span class="label-text">Location <span style="opacity:.6;">(optional)</span></span><input value="${escHtml(payload.location || '')}" placeholder="e.g. Amsterdam" onchange="updateTxField('location',this.value)"></label>
      <label class="field span-2"><span class="label-text">Description <span style="opacity:.6;">(optional)</span></span><input value="${escHtml(payload.description || '')}" placeholder="Any extra detail" onchange="updateTxField('description',this.value)"></label>
      <label class="field span-2"><span class="label-text">Logo URL <span style="opacity:.6;">(optional — reused automatically next time you log this name)</span></span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="tf-logo" style="flex:1;" value="${escHtml(payload.logo || '')}" placeholder="https://…" onchange="updateTxField('logo',this.value)">${logoPickerButtonHtml('tf-logo')}</div>
        ${logoPickerPopoverHtml('tf-logo')}
      </label>
      ${payload.logo ? `<div class="span-2" style="display:flex;align-items:center;gap:8px;">${assetLogoHtml(payload.logo, 'Other', 28)}<span style="font-size:12px;opacity:.6;">Current logo</span></div>` : ''}
    </div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn danger ghost" onclick="deleteBudgetTx('${payload.id}')">🗑 Delete</button>` : ''}
      <button class="btn primary" onclick="saveTxForm()">✓ Save</button>
    </div>`;
};
function updateTxField(field, value) {
  if (!ui.modal) return;
  ui.modal.payload[field] = value;
  if (field === 'type') { ui.modal.payload.categoryId = ''; ui.modal.payload.subCategoryId = ''; }
  if (field === 'categoryId') { ui.modal.payload.subCategoryId = ''; }
  render();
}
/* Item 9: live suggestion list as you type a name — patches just the suggestion strip (no
   full render, so the name field never loses focus mid-keystroke), same pattern used
   elsewhere (onSnapRowInput, onEntryInput, updateCryptoBrokerLogoPreview). */
function onTxNameInput(value) {
  if (!ui.modal) return;
  ui.modal.payload.comment = value;
  const q = value.trim().toLowerCase();
  const matches = q.length >= 2
    ? Array.from(new Set(data.budgetTransactions.filter(t => t.comment && t.comment.toLowerCase().includes(q) && t.comment.toLowerCase() !== q).map(t => t.comment))).slice(0, 4)
    : [];
  ui.txSuggestions = matches;
  const container = document.getElementById('tx-suggestions');
  if (container) container.innerHTML = matches.map(s => `<span class="chip" style="cursor:pointer;font-size:12px;padding:6px 10px;" onclick="applyTxSuggestion('${escHtml(s).replace(/'/g, "\\'")}')">${escHtml(s)}</span>`).join('');
}
/* Item 9: clicking a suggestion auto-fills every field that can reasonably be reused from the
   most recent past transaction with that exact name — category, sub-category, logo, location,
   description, payment method, recurring status, currency — leaving amount/date for the user
   to set fresh (a full re-render is fine here since it's a deliberate click, not a keystroke). */
function applyTxSuggestion(name) {
  if (!ui.modal) return;
  const match = data.budgetTransactions.filter(t => t.comment === name).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  if (!match) return;
  const p = ui.modal.payload;
  Object.assign(p, {
    comment: name, type: match.type, categoryId: match.categoryId, subCategoryId: match.subCategoryId || '',
    paymentMethodId: match.paymentMethodId || '', nature: match.nature, currency: match.currency,
    location: match.location || '', description: match.description || '', logo: match.logo || '', impact: match.impact || '',
  });
  ui.txSuggestions = [];
  render();
}
function saveTxForm() {
  const p = ui.modal.payload;
  if (!p.categoryId || p.amount === '' || isNaN(parseFloat(p.amount))) return;
  const comment = (p.comment || '').trim();
  // Item 8: logo persists automatically for future transactions with the same name — never
  // overwrites a logo the user explicitly set this time, only fills in a blank one.
  let logo = (p.logo || '').trim();
  if (!logo && comment) {
    const prior = data.budgetTransactions.find(t => t.id !== p.id && t.logo && t.comment && t.comment.toLowerCase() === comment.toLowerCase());
    if (prior) logo = prior.logo;
  }
  const record = {
    id: p.id || uid('tx'), date: p.date, type: p.type, categoryId: p.categoryId, subCategoryId: p.subCategoryId || null,
    nature: p.nature, paymentMethodId: p.paymentMethodId || null, currency: p.currency, amount: Math.abs(parseFloat(p.amount)),
    comment, location: (p.location || '').trim(), description: (p.description || '').trim(), logo, impact: p.impact || '',
  };
  if (p.id) {
    const idx = data.budgetTransactions.findIndex(t => t.id === p.id);
    if (idx !== -1) data.budgetTransactions[idx] = record;
  } else {
    data.budgetTransactions.push(record);
  }
  save(); closeModal();
}
/* ===================== Investments ===================== */
function renderInvestments() {
  const value = portfolioValue(), invested = investedTotal(), pl = portfolioPL(), plPct = portfolioPLPct();
  const byPositionValueDesc = (a, b) => positionValue(b) - positionValue(a);
  const byTypeValueDesc = (a, b) => b.positions.reduce((s, p) => s + positionValue(p), 0) - a.positions.reduce((s, p) => s + positionValue(p), 0);
  // Whole-portfolio summary (every asset class, incl. crypto) stays at the page level, shared
  // across tabs — but anything broker/exchange-specific now lives INSIDE each tab, scoped to
  // what that tab actually shows, so switching to Crypto never surfaces Stocks & ETFs brokers.
  const allByType = data.categories.asset
    .map(t => ({ type: t.name, positions: positionsByAssetType(t.name).slice().sort(byPositionValueDesc) }))
    .filter(x => x.positions.length).sort(byTypeValueDesc);
  const breakdownSegments = allByType.map(x => ({ label: x.type, value: x.positions.reduce((s, p) => s + positionValue(p), 0), color: assetTypeColor(x.type) })).sort((a, b) => b.value - a.value);
  const breakdownTotal = breakdownSegments.reduce((s, x) => s + x.value, 0) || 1;

  return `
  <div class="page surface-dark">
    <div class="page-head">
      <div><h1 class="page-title">Portfolio</h1><div class="page-subtitle">Investment overview</div></div>
      <button class="btn" onclick="refreshPrices()" title="Fetch the latest live price for every Stock/ETF/other asset (Twelve Data) and every crypto holding (CoinGecko)">${ui.assetPriceFetching || ui.cryptoPriceFetching ? '…' : '↻'} Refresh</button>
    </div>

    <div class="card-dark stack-gap-8" style="margin-bottom:20px;">
      <div class="eyebrow">Total value — whole portfolio (${data.settings.defaultCurrency})</div>
      <div class="big-number">${fmtMoney(value)}</div>
      <div class="${pl >= 0 ? 'positive' : 'negative'}" style="font-weight:700;">${pl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(pl))} (${fmtPct(Math.abs(plPct), false)})</div>
      <div style="font-size:12.5px;opacity:.55;">Invested: ${fmtMoney(invested)} · EUR/USD: ${(data.settings.eurUsdRate || 1.08).toFixed(4)}</div>
    </div>

    <div class="card-dark" style="margin-bottom:20px;">
      <div style="font-weight:700;margin-bottom:14px;">Portfolio breakdown</div>
      <div style="display:flex;align-items:center;gap:26px;flex-wrap:wrap;">
        ${svgDonut(breakdownSegments, { size: 140, stroke: 22 })}
        <div class="stack-gap-8">
          ${breakdownSegments.map((s, i) => `
            <div>
              <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;">
                <span style="width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block;"></span>
                ${escHtml(s.label)} · ${(s.value / breakdownTotal * 100).toFixed(0)}%
                <button class="icon-btn-round" style="width:20px;height:20px;background:none;border:none;" title="Change color" onclick="toggleAssetColorPicker('${escHtml(s.label).replace(/'/g, "\\'")}')">🎨</button>
              </div>
              ${ui.assetColorPickerOpen === s.label ? `
                <div id="breakdown-color-picker-${i}" style="margin:6px 0 10px 18px;">
                  ${colorPickerHtml(s.color)}
                  <button class="btn small primary" style="margin-top:6px;" onclick="saveAssetColorFromPicker(${i},'${escHtml(s.label).replace(/'/g, "\\'")}')">Save color</button>
                </div>` : ''}
            </div>`).join('') || '<span style="opacity:.5;font-size:13px;">No positions yet</span>'}
        </div>
      </div>
    </div>

    <div class="tab-row" style="margin-bottom:20px;">
      <button class="tab-btn ${ui.investmentsTab === 'stocks' ? 'active' : ''}" onclick="setInvestmentsTab('stocks')">Stocks &amp; ETFs</button>
      <button class="tab-btn ${ui.investmentsTab === 'crypto' ? 'active' : ''}" onclick="setInvestmentsTab('crypto')">🪙 Crypto</button>
      <button class="tab-btn ${ui.investmentsTab === 'other' ? 'active' : ''}" onclick="setInvestmentsTab('other')">Other Assets</button>
    </div>

    ${ui.investmentsTab === 'other' ? renderOtherAssetsTab() : ui.investmentsTab === 'crypto' ? renderCryptoTab() : renderStocksEtfTab()}
  </div>`;
}
function setInvestmentsTab(t) { ui.investmentsTab = t; render(); }

/* Shared "add position" quick actions — identical on the Stocks & ETFs and Other Assets tabs. */
/* Same three quick actions on every Investments tab — only the primary action's label/handler
   changes (e.g. Crypto's "+ Add crypto"), so Stocks & ETFs / Crypto / Other Assets look and
   behave identically here. */
function positionQuickActionsHtml(opts) {
  const { addLabel = '+ Add position', addAction = 'openTxnForm()' } = opts || {};
  return `
    <div class="grid-3" style="margin-bottom:22px;">
      <button class="btn primary" onclick="${addAction}">${addLabel}</button>
      <button class="btn" onclick="alert('Import Excel: choose a .xlsx file exported from your broker (format TBD).')">📄 Import Excel</button>
      <button class="btn" style="background:#F5E7C4;color:#12141C;border-color:#F5E7C4;" onclick="goManualPrices()">📝 Manual Prices</button>
    </div>`;
}
/* Shared "Brokers" card, used the same way on both the Stocks & ETFs tab (full detail: cash
   balance, APY, "+ Add broker") and the Other Assets tab (scoped to non-Stock/ETF/Crypto
   positions only, no cash — cash is a whole-broker balance already shown once on the Stocks &
   ETFs instance, so repeating it here would double-count it). Crypto has its own analogous
   "Exchanges" card instead (see renderCryptoTab()) since exchanges are free-text, not broker
   records. */
function brokersCardHtml(opts) {
  const { assetTypes = null, showCash = true, showAddBroker = true } = opts || {};
  const rows = data.brokers.map(b => {
    const positions = (assetTypes ? positionsByBroker(b.id).filter(p => assetTypes.includes(p.assetType)) : positionsByBroker(b.id))
      .slice().sort((a, b2) => positionValue(b2) - positionValue(a));
    const hasCash = showCash && b.cashBalance > 0;
    const val = positions.reduce((s, p) => s + positionValue(p), 0) + (hasCash ? toEUR(b.cashBalance || 0, b.cashCurrency) : 0);
    return { b, positions, hasCash, val };
  }).filter(r => r.positions.length || r.hasCash).sort((a, b) => b.val - a.val);
  if (!rows.length && !showAddBroker) return '';
  return `
    <div class="card-dark" style="margin-bottom:20px;">
      <div class="row-flex" style="margin-bottom:14px;">
        <div style="font-weight:700;">Brokers</div>
        ${showAddBroker ? `<button class="btn small" onclick="openBrokerForm()">+ Add broker</button>` : ''}
      </div>
      <div class="stack-gap-12">
        ${rows.map(({ b, positions, hasCash, val }) => {
          const expanded = ui.openBrokerId === b.id;
          return `<div class="card-nested">
            <div class="row-flex">
              <div style="display:flex;align-items:center;gap:10px;">${logoImg(b.logo, 30)}<div>
                <div style="font-weight:600;font-size:13.5px;">${escHtml(b.name)}</div>
                <div style="font-size:11.5px;opacity:.55;">
                  ${positions.length} asset${positions.length !== 1 ? 's' : ''}${hasCash ? ` · ${fmtMoney(b.cashBalance, b.cashCurrency)} cash` : ''}
                  ${hasCash && b.cashInterestBearing ? `<span class="badge" style="background:rgba(34,181,115,0.18);color:var(--positive);margin-left:4px;">${b.cashInterestRate}% APY</span>` : ''}
                </div>
              </div></div>
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="font-weight:700;font-size:13.5px;">${fmtMoney(val)}</div>
                <button class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" title="${expanded ? 'Hide' : 'Show'} holdings" onclick="toggleBrokerExpand('${b.id}')">${expanded ? '⌃' : '⌄'}</button>
                ${showAddBroker ? `<button class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" onclick="openBrokerForm('${b.id}')">✎</button>
                <button class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" onclick="deleteBroker('${b.id}')">🗑</button>` : ''}
              </div>
            </div>
            ${expanded ? `
              <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--dark-border);">
                ${hasCash ? `<div class="card-nested" style="margin-bottom:8px;"><div class="row-flex"><div style="font-weight:600;font-size:13px;">💶 Cash</div><div style="display:flex;align-items:center;gap:8px;"><div style="font-weight:700;font-size:13px;">${fmtMoney(b.cashBalance, b.cashCurrency)}</div>${showAddBroker ? `<button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" title="Edit cash" onclick="openBrokerForm('${b.id}')">✎</button>` : ''}</div></div></div>` : ''}
                <div class="stack-gap-8">
                  ${positions.map(p => positionRowHtml(p)).join('') || '<div style="opacity:.5;font-size:13px;">No positions here yet.</div>'}
                </div>
              </div>
            ` : ''}
            <button class="btn small" style="margin-top:10px;" onclick="openTxnForm('${b.id}')">+ Add position</button>
          </div>`;
        }).join('') || '<div style="opacity:.5;font-size:13px;">No brokers yet.</div>'}
      </div>
    </div>`;
}

/* Item 2: strictly scoped to Stocks and ETFs only — no crypto, no other asset classes. */
/* Mirrors the Crypto tab's "Total value — crypto" card, scoped to whatever positions the
   calling tab shows, so all three tabs (Stocks & ETFs / Crypto / Other Assets) present the
   same at-a-glance value + P&L summary before their own quick actions and holdings. */
function positionsSummaryCardHtml(label, positions) {
  const value = positions.reduce((s, p) => s + positionValue(p), 0);
  const cost = positions.reduce((s, p) => s + positionCost(p), 0);
  const pl = value - cost, plPct = cost ? (pl / cost * 100) : 0;
  return `
    <div class="card-dark stack-gap-8" style="margin-bottom:20px;">
      <div class="eyebrow">Total value — ${escHtml(label)}</div>
      <div class="big-number">${fmtMoney(value)}</div>
      <div class="${pl >= 0 ? 'positive' : 'negative'}" style="font-weight:700;">${pl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(pl))} (${fmtPct(Math.abs(plPct), false)})</div>
      <div style="font-size:12.5px;opacity:.55;">Invested: ${fmtMoney(cost)}</div>
    </div>`;
}
function renderStocksEtfTab() {
  const byPositionValueDesc = (a, b) => positionValue(b) - positionValue(a);
  const byTypeValueDesc = (a, b) => b.positions.reduce((s, p) => s + positionValue(p), 0) - a.positions.reduce((s, p) => s + positionValue(p), 0);
  const byType = data.categories.asset.filter(t => t.name === 'Stocks' || t.name === 'ETFs')
    .map(t => ({ type: t.name, positions: positionsByAssetType(t.name).slice().sort(byPositionValueDesc) }))
    .filter(x => x.positions.length).sort(byTypeValueDesc);
  return positionsSummaryCardHtml('stocks & ETFs', byType.flatMap(x => x.positions)) + positionQuickActionsHtml() + brokersCardHtml({ assetTypes: ['Stocks', 'ETFs'] }) + (byType.length ? byType.map(x => categoryPositionsCard(x)).join('') : `
    <div class="empty-state"><div class="emoji">📈</div><div class="title">No stocks or ETFs yet</div><div class="sub">Click "+ Add position" above to add one.</div></div>`);
}
/* Private Equity, Gold, Real Estate, and any custom asset category — everything that isn't
   Stocks/ETFs (handled above) or Crypto (its own tab). Same "Brokers" card as the Stocks & ETFs
   tab, scoped to just these positions and without cash (cash is a whole-broker balance, already
   shown once on the Stocks & ETFs instance) — only shown at all once a broker actually holds
   one of these positions, so it doesn't clutter the page for people who never assign a broker
   to Private Equity/Gold/Real Estate. */
function renderOtherAssetsTab() {
  const byPositionValueDesc = (a, b) => positionValue(b) - positionValue(a);
  const byTypeValueDesc = (a, b) => b.positions.reduce((s, p) => s + positionValue(p), 0) - a.positions.reduce((s, p) => s + positionValue(p), 0);
  const otherTypeNames = data.categories.asset.filter(t => t.name !== 'Stocks' && t.name !== 'ETFs' && t.name !== 'Crypto').map(t => t.name);
  const byType = otherTypeNames
    .map(name => ({ type: name, positions: positionsByAssetType(name).slice().sort(byPositionValueDesc) }))
    .filter(x => x.positions.length).sort(byTypeValueDesc);
  return positionsSummaryCardHtml('other assets', byType.flatMap(x => x.positions)) + positionQuickActionsHtml() + brokersCardHtml({ assetTypes: otherTypeNames, showCash: false, showAddBroker: false }) + (byType.length ? byType.map(x => categoryPositionsCard(x)).join('') : `
    <div class="empty-state"><div class="emoji">📦</div><div class="title">No other assets yet</div><div class="sub">Private Equity, Gold, Real Estate, and anything else you add will show up here.</div></div>`);
}

function categoryPositionsCard(x) {
  const total = x.positions.reduce((s, p) => s + positionValue(p), 0);
  const cost = x.positions.reduce((s, p) => s + positionCost(p), 0);
  const pl = total - cost, plPct = cost ? (pl / cost * 100) : 0;
  return `
  <div class="card-dark" style="margin-bottom:16px;">
    <div class="row-flex" style="margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="width:32px;height:32px;border-radius:9px;background:${assetTypeColor(x.type)}22;display:flex;align-items:center;justify-content:center;">${assetTypeEmoji(x.type)}</span>
        <div><div style="font-weight:700;font-size:14px;">${escHtml(x.type)}</div><div style="font-size:11.5px;opacity:.55;">${x.positions.length} position${x.positions.length !== 1 ? 's' : ''}</div></div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700;">${fmtMoney(total)}</div>
        <div class="${pl >= 0 ? 'positive' : 'negative'}" style="font-size:12px;">${fmtPct(plPct)}</div>
      </div>
    </div>
    <div class="stack-gap-8">
      ${x.positions.map(p => positionRowHtml(p)).join('')}
    </div>
  </div>`;
}
/* Shared row for every holding type — Stocks/ETFs/other assets AND crypto (via cryptoRef) —
   so a coin looks and behaves exactly like a stock in every list it appears in, rather than
   crypto having its own bespoke layout. */
function positionRowHtml(p) {
  const val = positionValue(p), pcost = positionCost(p), ppl = val - pcost, pplPct = pcost ? (ppl / pcost * 100) : 0;
  const broker = brokerById(p.brokerId);
  const refreshKey = p.cryptoRef || p.assetRef;
  const refreshOpen = ui.positionRefreshOpen === refreshKey;
  const curPrice = positionPrice(p);
  // Item 7: color-code the current price against the average buy price specifically
  // (not just overall P&L), so a glance at "avg vs now" tells you gain/loss at a glance.
  const priceUp = curPrice != null && curPrice >= p.avgPrice;
  const editAction = p.cryptoRef ? `openCryptoAssetEditor('${p.cryptoRef}')` : `openPositionForm('${p.assetRef}')`;
  const deleteAction = p.cryptoRef ? `deleteCryptoAsset('${p.cryptoRef}')` : `deletePositionRow('${p.entryRef || ''}','${p.assetRef}')`;
  const deleteTitle = p.cryptoRef ? 'Delete crypto asset' : (p.entryRef ? 'Remove this broker holding' : 'Delete asset');
  const setRefreshAction = p.cryptoRef ? `saveCryptoPositionRefresh('${p.cryptoRef}')` : `savePositionRefresh('${p.assetRef}')`;
  return `<div class="card-nested" data-position="${p.id}">
    <div class="row-flex">
      <div style="display:flex;align-items:center;gap:10px;">
        ${assetLogoHtml(p.logo, p.assetType, 28)}
        <div>
          <div style="font-weight:600;font-size:13.5px;">${escHtml(p.ticker)} <span style="opacity:.55;font-weight:400;">${escHtml(p.name)}</span></div>
          <div style="font-size:11.5px;opacity:.55;">${fmtQty(p.quantity)} · avg <span style="opacity:.85;">${fmtMoney(p.avgPrice, p.currency)}</span> · now <span class="${priceUp ? 'positive' : 'negative'}" style="font-weight:700;">${curPrice != null ? fmtMoney(curPrice, p.currency) : '—'}</span> ${broker ? `· <span class="badge" style="background:var(--dark-card-2);">${escHtml(broker.name)}</span>` : ''}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700;font-size:13.5px;">${fmtMoney(val)}</div>
        <div class="${ppl >= 0 ? 'positive' : 'negative'}" style="font-size:11.5px;">${ppl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(ppl))} (${fmtPct(Math.abs(pplPct), false)})</div>
      </div>
    </div>
    <div class="row-flex" style="margin-top:8px;">
      <div></div>
      <div style="display:flex;gap:2px;">
        <button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" title="${p.cryptoRef ? 'Edit crypto asset' : 'Edit asset'}" onclick="${editAction}">✎</button>
        <button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" title="Update current price" onclick="togglePositionRefresh('${refreshKey}')">↻</button>
        <button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" title="${deleteTitle}" onclick="${deleteAction}">🗑</button>
      </div>
    </div>
    ${refreshOpen ? `
      <div style="display:flex;gap:8px;margin-top:8px;">
        <input type="number" step="any" id="pos-refresh-${refreshKey}" placeholder="New current price" value="${p.currentPrice != null ? p.currentPrice : ''}">
        <button class="btn small primary" onclick="${setRefreshAction}">Set</button>
      </div>` : ''}
  </div>`;
}
function assetTypeEmoji(type) {
  const m = { Stocks: '📈', ETFs: '📊', Crypto: '🪙', 'Private Equity': '🏢', Gold: '🥇', 'Real Estate': '🏠', Other: '📦' };
  return m[type] || '📦';
}

/* ---- Position actions: edit / refresh price / delete ---- */
function togglePositionRefresh(assetId) { ui.positionRefreshOpen = ui.positionRefreshOpen === assetId ? null : assetId; render(); }
function savePositionRefresh(assetId) {
  const el = document.getElementById('pos-refresh-' + assetId);
  const v = parseFloat(el.value);
  if (isNaN(v)) return;
  const asset = assetById(assetId);
  if (!asset) return;
  asset.currentPrice = v;
  ui.positionRefreshOpen = null;
  save(); render();
}
/* Crypto equivalent of savePositionRefresh() — reuses the existing manual-price mechanism
   (EUR, since derivedCryptoPositions() always represents crypto rows in EUR) so this row-level
   quick action behaves exactly like the stock one it mirrors. */
function saveCryptoPositionRefresh(symbol) {
  const el = document.getElementById('pos-refresh-' + symbol);
  if (!el) return;
  ui.positionRefreshOpen = null;
  setCryptoPriceManual(symbol, el.value, 'EUR');
}
/* entryId deletes just that one broker's holding of the asset; falling back to assetId
   deletes the whole asset (every broker's holding of that ticker) — used when the row shown
   is an aggregated asset-level row rather than a single broker's entry. */
function deletePositionRow(entryId, assetId) {
  if (entryId) {
    const entry = data.assetEntries.find(e => e.id === entryId);
    if (!entry) return;
    const asset = assetById(entry.assetId);
    if (!confirm(`Remove this ${asset ? asset.ticker : ''} holding (${fmtQty(entry.quantity)} units at this broker)? This can't be undone.`)) return;
    data.assetEntries = data.assetEntries.filter(e => e.id !== entryId);
    save(); render();
  } else if (assetId) {
    const asset = assetById(assetId);
    if (!asset) return;
    if (!confirm(`Delete ${asset.ticker} and all its holdings across every broker? This can't be undone.`)) return;
    data.assets = data.assets.filter(a => a.id !== assetId);
    data.assetEntries = data.assetEntries.filter(e => e.assetId !== assetId);
    save(); render();
  }
}

function openPositionForm(assetId) { ui.modal = { type: 'position', payload: { id: assetId } }; render(); }
window.__modalRenderers.position = function (payload) {
  const a = assetById(payload.id);
  if (!a) return '';
  const s = assetStats(a.id);
  const rows = entriesFor(a.id).slice().sort((x, y) => (y.quantity * y.price) - (x.quantity * x.price));
  return `
    <div class="modal-head"><div class="modal-title">Edit ${escHtml(a.ticker)}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="form-grid" style="margin-bottom:16px;">
      <label class="field"><span class="label-text">Ticker</span><input id="pf-ticker" value="${escHtml(a.ticker)}"></label>
      <label class="field"><span class="label-text">Full name</span><input id="pf-name" value="${escHtml(a.name)}"></label>
      <label class="field"><span class="label-text">Asset type</span>
        <select id="pf-assettype">${data.categories.asset.map(t => `<option value="${escHtml(t.name)}" ${a.assetType === t.name ? 'selected' : ''}>${escHtml(t.name)}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label-text">Price currency</span><select id="pf-currency">${CURRENCIES.map(c => `<option ${a.priceCurrency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field span-2"><span class="label-text">Logo URL <span style="opacity:.6;">(optional)</span></span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="pf-logo" style="flex:1;" value="${escHtml(a.logo || '')}" placeholder="https://…">${logoPickerButtonHtml('pf-logo')}</div>
        ${logoPickerPopoverHtml('pf-logo')}
      </label>
      ${a.logo ? `<div style="display:flex;align-items:center;gap:8px;">${assetLogoHtml(a.logo, a.assetType, 32)}<span style="font-size:12px;opacity:.6;">Current logo</span></div>` : ''}
    </div>

    <div class="card-nested" style="margin-bottom:16px;">
      <div class="row-flex" style="margin-bottom:0;">
        <div class="eyebrow" style="margin-bottom:0;">Price <span class="badge" style="background:${a.manualPrice != null ? 'rgba(232,150,60,0.18)' : 'rgba(34,181,115,0.18)'};color:${a.manualPrice != null ? 'var(--manual-accent)' : 'var(--positive)'};margin-left:4px;">${a.manualPrice != null ? 'manual override' : 'auto'}</span></div>
        <button type="button" class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" title="Refresh live price" onclick="fetchAssetPrices(true)">${ui.assetPriceFetching ? '…' : '↻'}</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px;">
        <label class="field" style="max-width:150px;"><span class="label-text">Current price</span><input type="number" step="any" id="pf-current" value="${a.currentPrice != null ? a.currentPrice : ''}"></label>
        <label class="field" style="max-width:150px;"><span class="label-text">Manual override</span><input type="number" step="any" id="pf-manual" placeholder="Leave blank to use current" value="${a.manualPrice != null ? a.manualPrice : ''}"></label>
        ${a.manualPrice != null ? `<button type="button" class="btn small" style="align-self:flex-end;" onclick="clearAssetPriceManual('${a.id}')">Use live instead</button>` : ''}
      </div>
      <div style="font-size:11px;opacity:.5;margin-top:4px;">${a.priceUpdatedAt ? 'Updated ' + new Date(a.priceUpdatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + '. ' : (ui.assetPriceFetchError ? '<span style="color:var(--negative);">Couldn\'t fetch a live price for this ticker — enter one manually below.</span> ' : 'Not fetched yet. ')}If a manual override is set, it's shown instead of the current price — use it when a looked-up price is wrong.</div>
    </div>

    <div style="font-weight:700;margin-bottom:8px;">Holdings by broker</div>
    <table class="data-table" style="margin-bottom:10px;">
      <thead><tr><th>Broker</th><th>Ccy</th><th class="num">Quantity</th><th class="num">Price paid</th><th class="num">Invested</th><th></th></tr></thead>
      <tbody id="asset-entries-body">
        ${rows.map(r => assetEntryRowHtml(r)).join('') || `<tr><td colspan="6" style="opacity:.5;padding:14px 10px;">No holdings yet — add a broker below.</td></tr>`}
      </tbody>
    </table>
    <button type="button" class="btn small" onclick="addAssetEntryRow('${a.id}')">+ Add broker</button>

    <div class="grid-2" style="margin-top:16px;">
      <div class="card-nested"><div class="eyebrow">Total quantity</div><div id="pf-summary-qty" style="font-weight:700;">${fmtQty(s.quantity)}</div></div>
      <div class="card-nested"><div class="eyebrow">Value</div><div id="pf-summary-value" style="font-weight:700;">${s.hasPrice ? fmtMoney(s.value, a.priceCurrency) : '—'}</div></div>
      <div class="card-nested"><div class="eyebrow">Avg price</div><div id="pf-summary-avg" style="font-weight:700;">${s.avgPrice != null ? fmtMoney(s.avgPrice, a.priceCurrency) : '—'}</div></div>
      <div class="card-nested"><div class="eyebrow">Performance</div><div id="pf-summary-pl" class="${s.pl >= 0 ? 'positive' : 'negative'}" style="font-weight:700;">${s.hasPrice ? `${s.pl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(s.pl), a.priceCurrency)} (${fmtPct(Math.abs(s.plPct), false)})` : '—'}</div></div>
    </div>

    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn primary" onclick="savePositionForm('${a.id}')">✓ Save</button>
      <button class="btn ghost" onclick="closeModal()">✕</button>
    </div>`;
};
function assetEntryRowHtml(entry) {
  return `
    <tr data-entry="${entry.id}">
      <td><select style="min-width:120px;" onchange="onEntryInput('${entry.id}','broker',this.value); onEntryBlur();">${data.brokers.map(b => `<option value="${b.id}" ${entry.broker === b.id ? 'selected' : ''}>${escHtml(b.name)}</option>`).join('')}</select></td>
      <td>
        <select style="min-width:72px;" onchange="onEntryInput('${entry.id}','currency',this.value); onEntryBlur();">
          ${CURRENCIES.map(c => `<option value="${c}" ${entry.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </td>
      <td class="num"><input id="entryrow-qty-${entry.id}" type="number" step="any" value="${entry.quantity}" style="width:90px;" oninput="onEntryInput('${entry.id}','quantity',this.value)" onblur="onEntryBlur()"></td>
      <td class="num"><input id="entryrow-price-${entry.id}" type="number" step="any" value="${entry.price}" style="width:90px;" oninput="onEntryInput('${entry.id}','price',this.value)" onblur="onEntryBlur()"></td>
      <td class="num mono" id="entryrow-invested-${entry.id}">${fmtMoney(entry.quantity * entry.price, entry.currency)}</td>
      <td class="num"><button type="button" class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" onclick="deleteAssetEntryRow('${entry.id}')">🗑</button></td>
    </tr>`;
}
/* Live path: patch only this asset's summary numbers on every keystroke (no full render() →
   no lost focus/cursor while typing), same pattern as the crypto snapshot rows. Persist to
   localStorage on blur; full render() only for structural add/remove. */
function onEntryInput(entryId, field, value) {
  const entry = data.assetEntries.find(e => e.id === entryId);
  if (!entry) return;
  entry[field] = (field === 'quantity' || field === 'price') ? (parseFloat(value) || 0) : value;
  const investedEl = document.getElementById('entryrow-invested-' + entryId);
  if (investedEl) investedEl.textContent = fmtMoney(entry.quantity * entry.price, entry.currency);
  patchAssetSummary(entry.assetId);
}
function onEntryBlur() { save(); }
function patchAssetSummary(assetId) {
  const a = assetById(assetId);
  if (!a) return;
  const s = assetStats(assetId);
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('pf-summary-qty', fmtQty(s.quantity));
  set('pf-summary-avg', s.avgPrice != null ? fmtMoney(s.avgPrice, a.priceCurrency) : '—');
  set('pf-summary-value', s.hasPrice ? fmtMoney(s.value, a.priceCurrency) : '—');
  set('pf-summary-pl', s.hasPrice ? `${s.pl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(s.pl), a.priceCurrency)} (${fmtPct(Math.abs(s.plPct), false)})` : '—');
  const plEl = document.getElementById('pf-summary-pl');
  if (plEl) plEl.className = s.pl >= 0 ? 'positive' : 'negative';
}
function addAssetEntryRow(assetId) {
  data.assetEntries.push({ id: uid('ae'), assetId, broker: (data.brokers[0] || {}).id || '', quantity: 0, price: 0, currency: 'EUR' });
  save(); render();
}
function deleteAssetEntryRow(entryId) {
  data.assetEntries = data.assetEntries.filter(e => e.id !== entryId);
  save(); render();
}
function savePositionForm(id) {
  const asset = assetById(id);
  if (!asset) return;
  const ticker = document.getElementById('pf-ticker').value.trim().toUpperCase();
  if (!ticker) return;
  const manualRaw = document.getElementById('pf-manual').value;
  Object.assign(asset, {
    ticker,
    name: document.getElementById('pf-name').value.trim() || ticker,
    assetType: document.getElementById('pf-assettype').value,
    priceCurrency: document.getElementById('pf-currency').value,
    currentPrice: parseFloat(document.getElementById('pf-current').value),
    manualPrice: manualRaw.trim() === '' ? null : parseFloat(manualRaw),
    logo: document.getElementById('pf-logo').value.trim(),
  });
  if (isNaN(asset.currentPrice)) asset.currentPrice = null;
  save(); closeModal();
}
/* Forces a live refresh of every Stock/ETF/other-asset price (Twelve Data) and every crypto
   price (CoinGecko) in one go, then re-records today's snapshot. This used to just re-save
   whatever was already set (no real fetch) — now it actually pulls current market prices,
   same as the individual crypto refresh already did. */
async function refreshPrices() {
  await Promise.all([fetchAssetPrices(true), fetchCryptoPrices(true)]);
  save(); render();
}
function deleteBroker(id) {
  data.brokers = data.brokers.filter(b => b.id !== id);
  data.assetEntries = data.assetEntries.filter(e => e.broker !== id);
  save(); render();
}

/* ===================== Crypto tab ===================== */
function cryptoPortfolioTotals() {
  const stats = data.cryptoAssets.map(c => cryptoAssetStats(c.symbol));
  const coinsValue = stats.reduce((s, x) => s + x.marketValueEUR, 0);
  const cash = totalCryptoExchangeCash();
  const value = coinsValue + cash;
  const invested = stats.reduce((s, x) => s + x.blendedCostEUR, 0);
  const pl = coinsValue - invested;
  const plPct = invested ? (pl / invested * 100) : 0;
  return { value, invested, pl, plPct, cash };
}

/* Mirrors the Stocks & ETFs tab's structure exactly (quick actions → Brokers-equivalent card
   → one category card of rows) instead of the old one-big-card-per-coin layout, so switching
   tabs feels like the same app rather than a different one bolted on. */
function renderCryptoTab() {
  const brokerSuggestions = Array.from(new Set([
    ...data.brokers.map(b => b.name),
    ...data.cryptoLots.map(l => l.broker),
    ...data.cryptoAssets.flatMap(c => (c.snapshots || []).map(r => r.broker)),
  ].filter(Boolean)));
  const t = cryptoPortfolioTotals();
  const exchangeRows = cryptoBrokerNames()
    .map(n => ({ name: n, logo: cryptoBrokerLogo(n), value: cryptoValueForBrokerName(n), holdings: cryptoHoldingsAtExchange(n) }))
    .filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const cryptoPositions = derivedCryptoPositions().slice().sort((a, b) => positionValue(b) - positionValue(a));
  const rateEditOpen = ui.eurUsdRateEditOpen;

  return `
  <div class="crypto-tab">
    <div class="card-dark stack-gap-8" style="margin-bottom:20px;">
      <div class="eyebrow">Total value — crypto</div>
      <div class="big-number" id="crypto-total-value">${fmtMoney(t.value)}</div>
      <div id="crypto-total-pl" class="${t.pl >= 0 ? 'positive' : 'negative'}" style="font-weight:700;">${t.pl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(t.pl))} (${fmtPct(Math.abs(t.plPct), false)})</div>
      <div style="font-size:12.5px;opacity:.55;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span>Invested: <span id="crypto-total-invested">${fmtMoney(t.invested)}</span></span>
        ${t.cash > 0 ? `<span>·</span><span>Cash: <span id="crypto-total-cash">${fmtMoney(t.cash)}</span></span>` : ''}
        <span>·</span>
        ${rateEditOpen ? `
          <span style="display:inline-flex;gap:6px;align-items:center;">
            EUR/USD: <input id="eurusd-rate-input" type="number" step="0.0001" value="${data.settings.eurUsdRate || 1.08}" style="width:70px;padding:2px 6px;font-size:11px;">
            <button class="btn small" style="padding:2px 8px;" onclick="saveEurUsdRateInline()">Save</button>
          </span>
        ` : `
          <span>EUR/USD: ${(data.settings.eurUsdRate || 1.08).toFixed(4)}</span>
          <span class="badge" style="background:${data.settings.eurUsdRateAuto ? 'rgba(34,181,115,0.18)' : 'rgba(232,150,60,0.18)'};color:${data.settings.eurUsdRateAuto ? 'var(--positive)' : 'var(--manual-accent)'};">${data.settings.eurUsdRateAuto ? 'live' : 'manual'}</span>
          <button class="icon-btn-round" style="width:22px;height:22px;background:none;border:none;" title="Refresh live EUR/USD rate" onclick="fetchEurUsdRate()">${ui.eurUsdRateFetching ? '…' : '↻'}</button>
          <span style="cursor:pointer;text-decoration:underline;" onclick="ui.eurUsdRateEditOpen=true;render();">✎ edit</span>
        `}
      </div>
      ${ui.eurUsdRateFetchError ? `<div style="font-size:11px;color:var(--negative);">Couldn't reach the rate service — try again, or edit the rate above.</div>` : ''}
    </div>

    ${positionQuickActionsHtml({ addLabel: '+ Add crypto', addAction: 'openCryptoAssetForm()' })}

    <datalist id="crypto-broker-list">${brokerSuggestions.map(b => `<option value="${escHtml(b)}">`).join('')}</datalist>

    <div class="card-dark" style="margin-bottom:20px;">
      <div class="row-flex" style="margin-bottom:14px;">
        <div style="font-weight:700;">Exchanges</div>
        <button class="btn small" onclick="openCryptoExchangeCashForm('')">+ Add cash</button>
      </div>
      <div class="stack-gap-12">
        ${exchangeRows.map(x => {
          const expanded = ui.openCryptoExchange === x.name;
          const safeName = escHtml(x.name).replace(/'/g, "\\'");
          const cashEntry = cryptoExchangeCashFor(x.name);
          const hasCash = !!cashEntry && cashEntry.amount > 0;
          return `<div class="card-nested">
            <div class="row-flex">
              <div style="display:flex;align-items:center;gap:10px;">${logoImg(x.logo, 30)}<div>
                <div style="font-weight:600;font-size:13.5px;">${escHtml(x.name)}</div>
                <div style="font-size:11.5px;opacity:.55;">
                  ${x.holdings.length} coin${x.holdings.length !== 1 ? 's' : ''}${hasCash ? ` · ${fmtMoney(cashEntry.amount, cashEntry.currency)} cash` : ''}
                  ${hasCash && cashEntry.interestBearing ? `<span class="badge" style="background:rgba(34,181,115,0.18);color:var(--positive);margin-left:4px;">${cashEntry.interestRate}% APY</span>` : ''}
                </div>
              </div></div>
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="font-weight:700;font-size:13.5px;">${fmtMoney(x.value)}</div>
                <button class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" title="${expanded ? 'Hide' : 'Show'} holdings" onclick="toggleCryptoExchangeExpand('${safeName}')">${expanded ? '⌃' : '⌄'}</button>
                <button class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" title="Remove all holdings at this exchange" onclick="deleteCryptoExchange('${safeName}')">🗑</button>
              </div>
            </div>
            ${expanded ? `
              <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--dark-border);">
                ${hasCash ? `<div class="card-nested" style="margin-bottom:8px;"><div class="row-flex"><div style="font-weight:600;font-size:13px;">💶 Cash</div><div style="display:flex;align-items:center;gap:8px;"><div style="font-weight:700;font-size:13px;">${fmtMoney(cashEntry.amount, cashEntry.currency)}</div><button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" title="Edit cash" onclick="openCryptoExchangeCashForm('${safeName}')">✎</button></div></div></div>` : ''}
                <div class="stack-gap-8">
                  ${x.holdings.map(h => positionRowHtml(h)).join('') || '<div style="opacity:.5;font-size:13px;">No holdings here.</div>'}
                </div>
              </div>
            ` : ''}
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="btn small" onclick="openCryptoAssetForm('${safeName}')">+ Add crypto</button>
              <button class="btn small" onclick="openCryptoExchangeCashForm('${safeName}')">${hasCash ? '✎ Edit cash' : '+ Add cash'}</button>
            </div>
          </div>`;
        }).join('') || '<div style="opacity:.5;font-size:13px;">No exchanges yet — add a coin or some cash below.</div>'}
      </div>
    </div>

    ${cryptoPositions.length ? categoryPositionsCard({ type: 'Crypto', positions: cryptoPositions }) : `
      <div class="empty-state"><div class="emoji">🪙</div><div class="title">No cryptocurrencies yet</div><div class="sub">Click "+ Add crypto" above to start tracking a coin.</div></div>`}
  </div>`;
}

/* Edit modal for a single crypto asset — same role as the Stocks & ETFs "Edit asset" modal
   (openPositionForm/window.__modalRenderers.position): symbol/name/logo, price (live + manual
   override), and the entries/lots table, all in one place instead of a page-filling card. */
function openCryptoAssetEditor(symbol) { ui.modal = { type: 'cryptoAssetEdit', payload: { symbol } }; render(); }
window.__modalRenderers.cryptoAssetEdit = function (payload) {
  const asset = cryptoAssetBySymbol(payload.symbol);
  if (!asset) return '';
  const s = cryptoAssetStats(asset.symbol);
  const sym = asset.symbol;
  return `
    <div class="modal-head"><div class="modal-title">Edit ${escHtml(sym)}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="form-grid" style="margin-bottom:16px;">
      <label class="field"><span class="label-text">Symbol</span><input id="ca-edit-symbol" value="${escHtml(sym)}"></label>
      <label class="field"><span class="label-text">Full name</span><input id="ca-edit-name" value="${escHtml(asset.name)}"></label>
      <label class="field span-2"><span class="label-text">Logo URL <span style="opacity:.6;">(optional)</span></span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="ca-edit-logo" style="flex:1;" value="${escHtml(asset.logo || '')}" placeholder="https://…">${logoPickerButtonHtml('ca-edit-logo')}</div>
        ${logoPickerPopoverHtml('ca-edit-logo')}
      </label>
      ${asset.logo ? `<div style="display:flex;align-items:center;gap:8px;">${assetLogoHtml(asset.logo, 'Crypto', 32)}<span style="font-size:12px;opacity:.6;">Current logo</span></div>` : ''}
    </div>

    ${cryptoPriceRowHtml(sym)}

    <div class="grid-3" style="margin-bottom:10px;">
      <div class="card-nested"><div class="eyebrow">Market value</div><div id="cs-value-${sym}" style="font-weight:700;">${s.hasPrice ? fmtMoney(s.marketValueEUR) : '—'}</div></div>
      <div class="card-nested"><div class="eyebrow">Total quantity</div><div id="cs-qty-${sym}" style="font-weight:700;">${fmtQty(s.quantity)}</div></div>
      <div class="card-nested"><div class="eyebrow">Performance</div><div id="cs-pl-${sym}" class="${s.plEUR >= 0 ? 'positive' : 'negative'}" style="font-weight:700;">${s.hasPrice ? `${s.plEUR >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(s.plEUR))} (${fmtPct(Math.abs(s.plPct), false)})` : '—'}</div></div>
    </div>
    <div class="grid-2" style="margin-bottom:16px;">
      <div class="card-nested">
        <div class="eyebrow">Invested EUR / avg price</div>
        <div><span id="cs-investedeur-${sym}" style="font-weight:700;">${fmtMoney(s.blendedCostEUR)}</span> <span style="opacity:.5;">·</span> <span id="cs-avgeur-${sym}" style="opacity:.75;">${s.blendedAvgPriceEUR != null ? fmtMoney(s.blendedAvgPriceEUR) : '—'}</span></div>
      </div>
      <div class="card-nested">
        <div class="eyebrow">Invested USD / avg price</div>
        <div><span id="cs-investedusd-${sym}" style="font-weight:700;">${fmtMoney(s.blendedCostUSD, 'USD')}</span> <span style="opacity:.5;">·</span> <span id="cs-avgusd-${sym}" style="opacity:.75;">${s.blendedAvgPriceUSD != null ? fmtMoney(s.blendedAvgPriceUSD, 'USD') : '—'}</span></div>
      </div>
    </div>

    <div class="row-flex" style="margin-bottom:8px;">
      <div style="font-weight:700;">Holdings by exchange</div>
      <button class="close-x" style="font-size:11px;padding:0;opacity:.6;" onclick="switchCryptoMode('${sym}','${asset.mode === 'snapshot' ? 'lots' : 'snapshot'}')">${asset.mode === 'snapshot' ? 'Switch to detailed purchases' : 'Switch to simple snapshot'}</button>
    </div>
    ${asset.mode === 'snapshot' ? cryptoSnapshotFormHtml(asset) : `
      <table class="data-table" style="margin-bottom:10px;">
        <thead><tr><th>Date</th><th>Exchange</th><th>Ccy</th><th class="num">Amount paid</th><th class="num">Quantity</th><th class="num">Price/unit</th><th></th></tr></thead>
        <tbody>
          ${s.lots.slice().sort((a, b) => b.amountPaid - a.amountPaid).map(lotRowHtml).join('') || `<tr><td colspan="7" style="opacity:.5;padding:14px 10px;">No purchases yet.</td></tr>`}
        </tbody>
      </table>
      <button class="btn small" onclick="addCryptoLot('${sym}')">+ Add purchase</button>
    `}

    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn primary" onclick="saveCryptoAssetEditForm('${sym}')">✓ Save</button>
      <button class="btn ghost" onclick="closeModal()">✕</button>
    </div>`;
};
function saveCryptoAssetEditForm(symbol) {
  const asset = cryptoAssetBySymbol(symbol);
  if (!asset) return;
  const newSymbol = document.getElementById('ca-edit-symbol').value.trim().toUpperCase() || symbol;
  if (newSymbol !== symbol && data.cryptoAssets.some(c => c !== asset && c.symbol === newSymbol)) {
    alert(`${newSymbol} already exists as a separate crypto asset — pick a different symbol.`);
    return;
  }
  asset.name = document.getElementById('ca-edit-name').value.trim() || newSymbol;
  asset.logo = document.getElementById('ca-edit-logo').value.trim();
  if (newSymbol !== symbol) {
    asset.symbol = newSymbol;
    data.cryptoLots.forEach(l => { if (l.symbol === symbol) l.symbol = newSymbol; });
    if (ui.cryptoDisplayCcy && symbol in ui.cryptoDisplayCcy) { ui.cryptoDisplayCcy[newSymbol] = ui.cryptoDisplayCcy[symbol]; delete ui.cryptoDisplayCcy[symbol]; }
  }
  save(); closeModal();
}

/* Cash sitting at a crypto exchange (e.g. idle EUR/USDT) — the crypto equivalent of a broker's
   cashBalance/cashInterestBearing/cashInterestRate, kept in data.cryptoExchangeCash since
   exchanges are free-text names, not data.brokers records. The exchange name itself is editable
   here too (with the same datalist suggestions as adding a coin) so this same form doubles as
   "add cash to an existing exchange" and "add a brand-new cash-only exchange". */
function openCryptoExchangeCashForm(exchangeName) {
  ui.modal = { type: 'cryptoExchangeCash', payload: { exchange: exchangeName || '' } };
  render();
}
window.__modalRenderers.cryptoExchangeCash = function (payload) {
  const existing = payload.exchange ? cryptoExchangeCashFor(payload.exchange) : null;
  return `
    <div class="modal-head"><div class="modal-title">${existing ? 'Edit' : 'Add'} exchange cash</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="form-grid" style="margin-bottom:16px;">
      <label class="field span-2"><span class="label-text">Exchange</span><input id="cec-exchange" list="crypto-broker-list" value="${escHtml(payload.exchange || '')}" placeholder="e.g. Binance"></label>
      <label class="field"><span class="label-text">Amount</span><input id="cec-amount" type="number" step="0.01" value="${existing ? existing.amount : ''}"></label>
      <label class="field"><span class="label-text">Currency</span><select id="cec-currency">
        <option value="EUR" ${!existing || existing.currency === 'EUR' ? 'selected' : ''}>EUR</option>
        <option value="USD" ${existing && existing.currency === 'USD' ? 'selected' : ''}>USD</option>
      </select></label>
    </div>
    <div class="row-flex" style="padding-top:4px;margin-bottom:12px;">
      <span class="label-text" style="font-size:13px;">Interest-bearing</span>
      <div class="toggle ${existing && existing.interestBearing ? 'on' : ''}" id="cec-interest-on" onclick="this.classList.toggle('on'); document.getElementById('cec-rate').disabled = !this.classList.contains('on');"></div>
    </div>
    <label class="field"><span class="label-text">Interest rate (% APY)</span><input id="cec-rate" type="number" step="0.01" placeholder="e.g. 4" value="${existing && existing.interestRate != null ? existing.interestRate : ''}" ${existing && existing.interestBearing ? '' : 'disabled'}></label>
    <div class="modal-actions" style="margin-top:16px;">
      ${existing ? `<button class="btn danger ghost" onclick="deleteCryptoExchangeCash('${escHtml(payload.exchange).replace(/'/g, "\\'")}')">🗑 Remove</button>` : ''}
      <button class="btn primary" onclick="saveCryptoExchangeCashForm('${existing ? escHtml(payload.exchange).replace(/'/g, "\\'") : ''}')">✓ Save</button>
    </div>`;
};
function saveCryptoExchangeCashForm(previousName) {
  const exchange = document.getElementById('cec-exchange').value.trim();
  const amount = parseFloat(document.getElementById('cec-amount').value);
  if (!exchange || isNaN(amount)) return;
  const currency = document.getElementById('cec-currency').value;
  const interestBearing = document.getElementById('cec-interest-on').classList.contains('on');
  const rateRaw = document.getElementById('cec-rate').value;
  const interestRate = rateRaw === '' ? null : parseFloat(rateRaw);
  let entry = previousName ? cryptoExchangeCashFor(previousName) : null;
  if (entry) {
    Object.assign(entry, { exchange, amount, currency, interestBearing, interestRate });
  } else {
    data.cryptoExchangeCash.push({ id: uid('cec'), exchange, amount, currency, interestBearing, interestRate });
  }
  save(); closeModal();
}
function deleteCryptoExchangeCash(exchangeName) {
  const key = exchangeName.trim().toLowerCase();
  data.cryptoExchangeCash = data.cryptoExchangeCash.filter(c => (c.exchange || '').trim().toLowerCase() !== key);
  save(); closeModal();
}

function cryptoSnapshotFormHtml(asset) {
  const sym = asset.symbol;
  const rows = (asset.snapshots || []).slice().sort((a, b) => (b.quantity * b.price) - (a.quantity * a.price));
  return `
    <table class="data-table" style="margin-bottom:10px;">
      <thead><tr><th>Broker</th><th>Ccy</th><th class="num">Quantity</th><th class="num">Avg price</th><th class="num">Invested</th><th></th></tr></thead>
      <tbody>
        ${rows.map(r => snapshotRowHtml(sym, r)).join('') || `<tr><td colspan="6" style="opacity:.5;padding:14px 10px;">No holdings yet — add a broker below.</td></tr>`}
      </tbody>
    </table>
    <button class="btn small" onclick="addSnapshotRow('${sym}')">+ Add broker</button>`;
}
function snapshotRowHtml(symbol, row) {
  return `
    <tr data-snap="${row.id}">
      <td><div style="display:flex;align-items:center;gap:6px;">
        <span id="snaprow-logo-${row.id}">${logoImg(cryptoBrokerLogo(row.broker), 20)}</span>
        <input type="text" list="crypto-broker-list" value="${escHtml(row.broker)}" placeholder="Exchange" style="min-width:100px;" oninput="onSnapRowInput('${symbol}','${row.id}','broker',this.value); updateCryptoBrokerLogoPreview('snaprow-logo-${row.id}',this.value)" onblur="onSnapRowBlur()">
      </div></td>
      <td>
        <select style="min-width:72px;" onchange="onSnapRowInput('${symbol}','${row.id}','currency',this.value); onSnapRowBlur();">
          <option value="EUR" ${row.currency === 'EUR' ? 'selected' : ''}>EUR</option>
          <option value="USD" ${row.currency === 'USD' ? 'selected' : ''}>USD</option>
        </select>
      </td>
      <td class="num"><input id="snaprow-qty-${row.id}" type="number" step="any" value="${row.quantity}" style="width:100px;" oninput="onSnapRowInput('${symbol}','${row.id}','quantity',this.value)" onblur="onSnapRowBlur()"></td>
      <td class="num"><input id="snaprow-price-${row.id}" type="number" step="any" value="${row.price}" style="width:100px;" oninput="onSnapRowInput('${symbol}','${row.id}','price',this.value)" onblur="onSnapRowBlur()"></td>
      <td class="num mono" id="snaprow-invested-${row.id}">${fmtMoney(row.quantity * row.price, row.currency)}</td>
      <td class="num"><button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" onclick="deleteSnapshotRow('${symbol}','${row.id}')">🗑</button></td>
    </tr>`;
}
function onSnapRowInput(symbol, rowId, field, value) {
  const asset = cryptoAssetBySymbol(symbol);
  const row = asset && (asset.snapshots || []).find(r => r.id === rowId);
  if (!row) return;
  row[field] = (field === 'quantity' || field === 'price') ? (parseFloat(value) || 0) : value;
  const investedEl = document.getElementById('snaprow-invested-' + rowId);
  if (investedEl) investedEl.textContent = fmtMoney(row.quantity * row.price, row.currency);
  patchCryptoSummary(symbol);
}
function onSnapRowBlur() { save(); }
function addSnapshotRow(symbol) {
  const asset = cryptoAssetBySymbol(symbol);
  if (!asset) return;
  if (!asset.snapshots) asset.snapshots = [];
  asset.snapshots.push({ id: uid('snap'), broker: '', quantity: 0, price: 0, currency: 'EUR' });
  save(); render();
}
function deleteSnapshotRow(symbol, rowId) {
  const asset = cryptoAssetBySymbol(symbol);
  if (!asset) return;
  asset.snapshots = (asset.snapshots || []).filter(r => r.id !== rowId);
  save(); render();
}

function switchCryptoMode(symbol, mode) {
  const asset = cryptoAssetBySymbol(symbol);
  if (!asset || asset.mode === mode) return;
  if (mode === 'snapshot') {
    asset.snapshots = aggregateLotsToSnapshots(lotsFor(symbol));
    data.cryptoLots = data.cryptoLots.filter(l => l.symbol !== symbol);
  } else {
    data.cryptoLots.push(...snapshotsToLots(symbol, asset.snapshots));
    asset.snapshots = [];
  }
  asset.mode = mode;
  save(); render();
}

/* ---- Live price row (shared by snapshot & lots mode cards) ---- */
function cryptoPriceRowHtml(symbol) {
  const asset = cryptoAssetBySymbol(symbol);
  ui.cryptoDisplayCcy = ui.cryptoDisplayCcy || {};
  const ccy = ui.cryptoDisplayCcy[symbol] || 'USD';
  const price = cryptoMarketPrice(symbol, ccy);
  const isManual = cryptoPriceIsManual(symbol);
  const manualOpen = ui.cryptoManualEntryOpen === symbol || price == null;
  return `
    <div class="card-nested" style="margin-bottom:14px;">
      <div class="row-flex" style="margin-bottom:8px;">
        <div class="eyebrow" style="margin-bottom:0;">
          Live price
          <span class="badge" style="background:${isManual ? 'rgba(232,150,60,0.18)' : 'rgba(34,181,115,0.18)'};color:${isManual ? 'var(--manual-accent)' : 'var(--positive)'};margin-left:4px;">${isManual ? 'manual' : 'live'}</span>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="btn small ${ccy === 'USD' ? 'primary' : ''}" style="padding:4px 10px;" onclick="setCryptoDisplayCcy('${symbol}','USD')">USD</button>
          <button class="btn small ${ccy === 'EUR' ? 'primary' : ''}" style="padding:4px 10px;" onclick="setCryptoDisplayCcy('${symbol}','EUR')">EUR</button>
        </div>
      </div>
      ${price != null ? `
        <div class="row-flex">
          <div id="cs-price-${symbol}" style="font-size:22px;font-weight:800;">${fmtMoney(price, ccy)}</div>
          <div style="display:flex;gap:2px;align-items:center;">
            ${asset.priceUpdatedAt ? `<span style="font-size:11px;opacity:.5;margin-right:4px;">${new Date(asset.priceUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
            <button class="icon-btn-round" style="width:30px;height:30px;background:none;border:none;" title="Refresh live price" onclick="fetchCryptoPrices(true)">${ui.cryptoPriceFetching ? '…' : '↻'}</button>
            <button class="icon-btn-round" style="width:30px;height:30px;background:none;border:none;" title="Enter price manually" onclick="toggleCryptoManualEntry('${symbol}')">✎</button>
          </div>
        </div>
      ` : `<div style="opacity:.65;font-size:13px;">No live price yet — enter it manually below.</div>`}
      ${ui.cryptoPriceFetchError ? `<div style="font-size:11px;color:var(--negative);margin-top:6px;">Couldn't reach the price service — try again, or enter it manually below.</div>` : ''}
      ${manualOpen ? `
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <input type="number" step="any" id="manual-price-${symbol}" placeholder="Price" style="max-width:140px;" value="${isManual ? asset.manualPrice : ''}">
          <select id="manual-price-ccy-${symbol}" style="max-width:90px;">
            <option value="USD" ${(isManual ? asset.manualPriceCurrency : 'USD') === 'USD' ? 'selected' : ''}>USD</option>
            <option value="EUR" ${(isManual ? asset.manualPriceCurrency : 'USD') === 'EUR' ? 'selected' : ''}>EUR</option>
          </select>
          <button class="btn small primary" onclick="saveCryptoManualPrice('${symbol}')">Save</button>
          ${isManual ? `<button class="btn small" onclick="clearCryptoPriceManual('${symbol}')">Use live instead</button>` : ''}
        </div>
      ` : ''}
      <div style="margin-top:8px;font-size:11px;opacity:.5;">
        ${ui.cryptoIdEditOpen === symbol ? `
          <span style="display:inline-flex;gap:6px;align-items:center;">
            CoinGecko ID: <input id="coingecko-id-${symbol}" value="${escHtml(asset.coingeckoId || '')}" placeholder="e.g. bitcoin" style="width:120px;padding:4px 8px;font-size:11px;">
            <button class="btn small" style="padding:3px 8px;" onclick="saveCoingeckoId('${symbol}')">Save</button>
          </span>
        ` : `CoinGecko ID: ${asset.coingeckoId ? escHtml(asset.coingeckoId) : 'not set'} <span style="cursor:pointer;text-decoration:underline;" onclick="ui.cryptoIdEditOpen='${symbol}';render();">✎ edit</span>`}
      </div>
      <div style="margin-top:4px;font-size:11px;opacity:.5;">
        ${ui.cryptoLogoEditOpen === symbol ? `
          <span style="display:inline-flex;gap:6px;align-items:center;">
            Logo URL: <input id="crypto-logo-${symbol}" value="${escHtml(asset.logo || '')}" placeholder="https://…" style="width:180px;padding:4px 8px;font-size:11px;">
            ${logoPickerButtonHtml('crypto-logo-' + symbol)}
            <button class="btn small" style="padding:3px 8px;" onclick="saveCryptoLogo('${symbol}')">Save</button>
          </span>
          ${logoPickerPopoverHtml('crypto-logo-' + symbol)}
        ` : `Logo: ${asset.logo ? 'set' : 'not set'} <span style="cursor:pointer;text-decoration:underline;" onclick="ui.cryptoLogoEditOpen='${symbol}';render();">✎ edit</span>`}
      </div>
    </div>`;
}
function saveCoingeckoId(symbol) {
  const asset = cryptoAssetBySymbol(symbol);
  const val = document.getElementById('coingecko-id-' + symbol).value.trim();
  if (asset) asset.coingeckoId = val || null;
  ui.cryptoIdEditOpen = null;
  save(); render();
  if (val) fetchCryptoPrices(true);
}
function saveCryptoLogo(symbol) {
  const asset = cryptoAssetBySymbol(symbol);
  const val = document.getElementById('crypto-logo-' + symbol).value.trim();
  if (asset) asset.logo = val;
  ui.cryptoLogoEditOpen = null;
  save(); render();
}
function setCryptoDisplayCcy(symbol, ccy) { ui.cryptoDisplayCcy = ui.cryptoDisplayCcy || {}; ui.cryptoDisplayCcy[symbol] = ccy; render(); }
function toggleCryptoManualEntry(symbol) { ui.cryptoManualEntryOpen = ui.cryptoManualEntryOpen === symbol ? null : symbol; render(); }
function saveCryptoManualPrice(symbol) {
  const val = document.getElementById('manual-price-' + symbol).value;
  const ccy = document.getElementById('manual-price-ccy-' + symbol).value;
  ui.cryptoManualEntryOpen = null;
  setCryptoPriceManual(symbol, val, ccy);
}

function lotRowHtml(lot) {
  const price = lot.quantity ? lot.amountPaid / lot.quantity : 0;
  return `
    <tr data-lot="${lot.id}">
      <td><input type="date" value="${lot.date}" style="min-width:130px;" oninput="onLotInput('${lot.id}','date',this.value)" onblur="onLotBlur()"></td>
      <td><div style="display:flex;align-items:center;gap:6px;">
        <span id="lotrow-logo-${lot.id}">${logoImg(cryptoBrokerLogo(lot.broker), 20)}</span>
        <input type="text" list="crypto-broker-list" value="${escHtml(lot.broker)}" placeholder="Exchange" style="min-width:100px;" oninput="onLotInput('${lot.id}','broker',this.value); updateCryptoBrokerLogoPreview('lotrow-logo-${lot.id}',this.value)" onblur="onLotBlur()">
      </div></td>
      <td>
        <select style="min-width:72px;" onchange="onLotInput('${lot.id}','currency',this.value); onLotBlur();">
          <option value="EUR" ${lot.currency === 'EUR' ? 'selected' : ''}>EUR</option>
          <option value="USD" ${lot.currency === 'USD' ? 'selected' : ''}>USD</option>
        </select>
      </td>
      <td class="num"><input id="lot-amount-${lot.id}" type="number" step="any" value="${lot.amountPaid}" style="width:100px;" oninput="onLotInput('${lot.id}','amountPaid',this.value)" onblur="onLotBlur()"></td>
      <td class="num"><input id="lot-qty-${lot.id}" type="number" step="any" value="${lot.quantity}" style="width:100px;" oninput="onLotInput('${lot.id}','quantity',this.value)" onblur="onLotBlur()"></td>
      <td class="num"><input id="lot-price-${lot.id}" type="number" step="any" value="${price ? +price.toFixed(8) : ''}" style="width:100px;" oninput="onLotInput('${lot.id}','price',this.value)" onblur="onLotBlur()"></td>
      <td class="num"><button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" onclick="deleteCryptoLot('${lot.id}')">🗑</button></td>
    </tr>`;
}

/* Live path: mutate state + patch only this crypto's summary numbers on every
   keystroke (no full render → no lost focus/cursor while typing). Persist to
   localStorage on blur. Full render() only happens for structural changes
   (add/remove lot or coin) where there's no in-progress typing to protect. */
function onLotInput(lotId, field, valueRaw) {
  const lot = data.cryptoLots.find(l => l.id === lotId);
  if (!lot) return;
  if (field === 'amountPaid' || field === 'quantity') {
    const v = parseFloat(valueRaw);
    lot[field] = isNaN(v) ? 0 : v;
    const priceEl = document.getElementById('lot-price-' + lotId);
    if (priceEl && document.activeElement !== priceEl) {
      priceEl.value = lot.quantity ? +(lot.amountPaid / lot.quantity).toFixed(8) : '';
    }
  } else if (field === 'price') {
    const v = parseFloat(valueRaw);
    if (!isNaN(v) && lot.quantity) {
      lot.amountPaid = +(v * lot.quantity).toFixed(2);
      const amtEl = document.getElementById('lot-amount-' + lotId);
      if (amtEl && document.activeElement !== amtEl) amtEl.value = lot.amountPaid;
    }
  } else {
    lot[field] = valueRaw;
  }
  patchCryptoSummary(lot.symbol);
}
function onLotBlur() { save(); }

function patchCryptoSummary(symbol) {
  const s = cryptoAssetStats(symbol);
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('cs-qty-' + symbol, fmtQty(s.quantity));
  set('cs-value-' + symbol, fmtMoney(s.marketValueEUR));
  set('cs-pl-' + symbol, `${s.plEUR >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(s.plEUR))} (${fmtPct(Math.abs(s.plPct), false)})`);
  const plEl = document.getElementById('cs-pl-' + symbol);
  if (plEl) plEl.className = s.plEUR >= 0 ? 'positive' : 'negative';
  set('cs-investedeur-' + symbol, fmtMoney(s.blendedCostEUR));
  set('cs-avgeur-' + symbol, s.blendedAvgPriceEUR != null ? fmtMoney(s.blendedAvgPriceEUR) : '—');
  set('cs-investedusd-' + symbol, fmtMoney(s.blendedCostUSD, 'USD'));
  set('cs-avgusd-' + symbol, s.blendedAvgPriceUSD != null ? fmtMoney(s.blendedAvgPriceUSD, 'USD') : '—');

  // Keep the "value of my crypto investment" total at the top of the page live too.
  const t = cryptoPortfolioTotals();
  set('crypto-total-value', fmtMoney(t.value));
  set('crypto-total-pl', `${t.pl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(t.pl))} (${fmtPct(Math.abs(t.plPct), false)})`);
  const totalPlEl = document.getElementById('crypto-total-pl');
  if (totalPlEl) totalPlEl.className = t.pl >= 0 ? 'positive' : 'negative';
  set('crypto-total-invested', fmtMoney(t.invested));
}

function addCryptoLot(symbol) {
  data.cryptoLots.push({ id: uid('lot'), symbol, broker: '', date: new Date().toISOString().slice(0, 10), currency: 'EUR', amountPaid: 0, quantity: 0 });
  save(); render();
}
function deleteCryptoLot(id) { data.cryptoLots = data.cryptoLots.filter(l => l.id !== id); save(); render(); }
function deleteCryptoAsset(symbol) {
  if (!confirm(`Remove ${symbol} and all ${lotsFor(symbol).length} purchase(s)? This can't be undone.`)) return;
  data.cryptoAssets = data.cryptoAssets.filter(c => c.symbol !== symbol);
  data.cryptoLots = data.cryptoLots.filter(l => l.symbol !== symbol);
  save(); render();
}

/* One-step add — mirrors openTxnForm/saveTxnForm exactly (symbol/ticker, quantity, price,
   currency, exchange, all at once, no separate "create the coin" then "add a holding" steps),
   so crypto works identically to Stocks & ETFs instead of needing an extra step. "Exchange" is
   still free text (not a data.brokers FK) — crypto exchanges are deliberately kept separate
   from Stocks/ETFs brokers (see cleanupGhostCryptoBrokers) — but the flow itself is the same. */
function openCryptoAssetForm(exchange) { ui.modal = { type: 'cryptoAsset', payload: { exchange: exchange || '' } }; render(); }
window.__modalRenderers.cryptoAsset = function (payload) {
  const exchangeSuggestions = Array.from(new Set([
    ...data.cryptoLots.map(l => l.broker),
    ...data.cryptoAssets.flatMap(c => (c.snapshots || []).map(r => r.broker)),
  ].filter(Boolean)));
  return `
    <div class="modal-head"><div class="modal-title">🪙 Add crypto</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div style="font-size:12px;opacity:.6;margin-bottom:14px;">Enter the coin's symbol, then how much you hold and at what price — same coin at the same exchange updates that holding directly, no buy/sell history.</div>
    <datalist id="crypto-exchange-list">${exchangeSuggestions.map(b => `<option value="${escHtml(b)}">`).join('')}</datalist>
    <div class="form-grid">
      <label class="field"><span class="label-text">Symbol / ticker</span><input id="ca-symbol" placeholder="e.g. BTC" style="text-transform:uppercase;" oninput="autofillCoingeckoId()"></label>
      <label class="field"><span class="label-text">CoinGecko ID <span style="opacity:.6;">(for live prices)</span></span><input id="ca-coingecko" placeholder="e.g. bitcoin"></label>
      <label class="field span-2"><span class="label-text">Full name</span><input id="ca-name" placeholder="e.g. Bitcoin"></label>
      <label class="field"><span class="label-text">Exchange</span><input id="ca-exchange" list="crypto-exchange-list" placeholder="e.g. Binance" value="${escHtml(payload.exchange || '')}"></label>
      <label class="field"><span class="label-text">Quantity owned</span><input id="ca-qty" type="number" step="any"></label>
      <label class="field"><span class="label-text">Price</span><input id="ca-price" type="number" step="any"></label>
      <label class="field"><span class="label-text">Currency</span><select id="ca-currency"><option value="EUR" selected>EUR</option><option value="USD">USD</option></select></label>
      <label class="field"><span class="label-text">Logo URL <span style="opacity:.6;">(optional)</span></span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="ca-logo" style="flex:1;" placeholder="https://…">${logoPickerButtonHtml('ca-logo')}</div>
        ${logoPickerPopoverHtml('ca-logo')}
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="saveCryptoAssetForm()">✓ Save</button>
      <button class="btn ghost" onclick="closeModal()">✕</button>
    </div>`;
};
function autofillCoingeckoId() {
  const symEl = document.getElementById('ca-symbol'), idEl = document.getElementById('ca-coingecko');
  const guess = COMMON_COINGECKO_IDS[symEl.value.trim().toUpperCase()];
  if (guess && !idEl.value) idEl.value = guess;
}
/* Same find-or-create-asset + find-or-create-entry shape as saveTxnForm(): same symbol+exchange
   updates that holding in place, otherwise a new snapshot row is added. currentPrice/coingeckoId
   are only set when the coin is first tracked — adding another exchange's holding later must
   never overwrite the live price with that entry's purchase price (same rule saveTxnForm
   already follows for Stocks/ETFs). */
function saveCryptoAssetForm() {
  const symbol = document.getElementById('ca-symbol').value.trim().toUpperCase();
  const qty = parseFloat(document.getElementById('ca-qty').value);
  const price = parseFloat(document.getElementById('ca-price').value);
  if (!symbol || isNaN(qty) || isNaN(price)) return;
  const exchange = document.getElementById('ca-exchange').value.trim();
  const currency = document.getElementById('ca-currency').value;
  const name = document.getElementById('ca-name').value.trim() || symbol;
  const coingeckoId = document.getElementById('ca-coingecko').value.trim() || COMMON_COINGECKO_IDS[symbol] || null;
  const logo = document.getElementById('ca-logo').value.trim();

  let asset = cryptoAssetBySymbol(symbol);
  const isNewAsset = !asset;
  if (!asset) {
    asset = {
      symbol, name, coingeckoId, mode: 'snapshot', snapshots: [],
      currentPriceUSD: null, currentPriceEUR: null, manualPrice: null, manualPriceCurrency: 'USD', priceAuto: true, priceUpdatedAt: null, logo,
    };
    data.cryptoAssets.push(asset);
  } else {
    if (logo) asset.logo = logo;
    if (name) asset.name = name;
  }
  // A coin still in the older detailed-purchases mode gets folded into snapshot mode (same
  // conversion switchCryptoMode already does) so this one-step add works uniformly either way.
  if (asset.mode !== 'snapshot') {
    asset.snapshots = aggregateLotsToSnapshots(lotsFor(symbol));
    data.cryptoLots = data.cryptoLots.filter(l => l.symbol !== symbol);
    asset.mode = 'snapshot';
  }
  const row = (asset.snapshots || []).find(r => r.broker === exchange && r.currency === currency);
  if (row) {
    Object.assign(row, { quantity: qty, price });
  } else {
    asset.snapshots.push({ id: uid('snap'), broker: exchange, quantity: qty, price, currency });
  }
  save(); closeModal();
  if (isNewAsset && coingeckoId) fetchCryptoPrices(true);
}

/* ---- Add broker ---- */
function openBrokerForm(id) { ui.modal = { type: 'broker', payload: { id: id || null } }; render(); }
window.__modalRenderers.broker = function (payload) {
  const b = payload.id ? brokerById(payload.id) : null;
  const interestOn = b ? b.cashInterestBearing : false;
  return `
    <div class="modal-head"><div class="modal-title">${b ? 'Edit broker' : 'Add broker'}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="stack-gap-12">
      <label class="field"><span class="label-text">Broker name</span><input id="bf-name" placeholder="e.g. Interactive Brokers" value="${escHtml(b ? b.name : '')}"></label>
      <label class="field"><span class="label-text">Logo URL (optional)</span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="bf-logo" style="flex:1;" placeholder="https://…" value="${escHtml(b ? (b.logo || '') : '')}">${logoPickerButtonHtml('bf-logo')}</div>
        ${logoPickerPopoverHtml('bf-logo')}
      </label>
      ${b && b.logo ? `<div style="display:flex;align-items:center;gap:8px;">${logoImg(b.logo, 32)}<span style="font-size:12px;opacity:.6;">Current logo</span></div>` : ''}
      <div class="form-grid">
        <label class="field"><span class="label-text">Cash held here</span><input id="bf-cash" type="number" step="0.01" value="${b ? b.cashBalance : ''}" placeholder="0"></label>
        <label class="field"><span class="label-text">Currency</span><select id="bf-cash-currency">${CURRENCIES.map(c => `<option ${(b ? b.cashCurrency : 'EUR') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      <div class="row-flex">
        <span class="label-text" style="font-size:13px;">This cash earns interest</span>
        <div class="toggle ${interestOn ? 'on' : ''}" id="bf-cash-interest-on" onclick="this.classList.toggle('on'); document.getElementById('bf-cash-rate').disabled = !this.classList.contains('on');"></div>
      </div>
      <label class="field"><span class="label-text">Interest rate (% APY)</span><input id="bf-cash-rate" type="number" step="0.01" value="${b && b.cashInterestRate != null ? b.cashInterestRate : ''}" placeholder="e.g. 3.5" ${interestOn ? '' : 'disabled'}></label>
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="saveBrokerForm('${b ? b.id : ''}')">✓ Save</button>
      <button class="btn ghost" onclick="closeModal()">✕</button>
    </div>`;
};
function saveBrokerForm(id) {
  const name = document.getElementById('bf-name').value.trim();
  if (!name) return;
  const logo = document.getElementById('bf-logo').value.trim();
  const cashBalance = parseFloat(document.getElementById('bf-cash').value) || 0;
  const cashCurrency = document.getElementById('bf-cash-currency').value;
  const cashInterestBearing = document.getElementById('bf-cash-interest-on').classList.contains('on');
  const cashInterestRate = cashInterestBearing ? (parseFloat(document.getElementById('bf-cash-rate').value) || 0) : null;
  const fields = { name, logo, cashBalance, cashCurrency, cashInterestBearing, cashInterestRate };
  if (id) {
    Object.assign(brokerById(id), fields);
  } else {
    data.brokers.push({ id: uid('brk'), ...fields });
  }
  save(); closeModal();
}

/* ---- New Transaction (Buy/Sell) ---- */
function openTxnForm(brokerId) { ui.modal = { type: 'txn', payload: { brokerId: brokerId || null } }; render(); }
window.__modalRenderers.txn = function (payload) {
  return `
    <div class="modal-head"><div class="modal-title">Add / update position</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div style="font-size:12px;opacity:.6;margin-bottom:14px;">Enter the ticker's details, then how much you hold and at what price — same coin/ticker at the same broker updates that position directly, no buy/sell history.</div>
    <div class="form-grid">
      <label class="field"><span class="label-text">Ticker</span>
        <div style="display:flex;gap:6px;">
          <input id="tn-ticker" placeholder="e.g. AAPL" style="flex:1;">
          <button type="button" id="tn-lookup-btn" class="icon-btn-round" style="width:38px;height:38px;flex:none;" title="Look up ticker/ISIN" onclick="lookupTickerInfo()">🔍</button>
        </div>
      </label>
      <label class="field"><span class="label-text">ISIN <span style="opacity:.6;">(optional, helps find it)</span></span><input id="tn-isin" placeholder="e.g. IE00B4L5Y983"></label>
      <div id="tn-lookup-error" style="display:none;grid-column:1/-1;font-size:11px;color:var(--negative);">Couldn't find that ticker/ISIN — check it, or fill in the details manually.</div>
      <label class="field span-2"><span class="label-text">Full name</span><input id="tn-fullname" placeholder="e.g. Apple Inc."></label>
      <label class="field"><span class="label-text">Asset type</span>
        <select id="tn-assettype">
          ${data.categories.asset.filter(t => t.name !== 'Crypto').map(t => `<option value="${escHtml(t.name)}">${escHtml(t.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span class="label-text">Broker</span>
        <select id="tn-broker">${data.brokers.map(b => `<option value="${b.id}" ${payload.brokerId === b.id ? 'selected' : ''}>${escHtml(b.name)}</option>`).join('')}</select>
      </label>
      <div class="span-2" style="font-size:11px;opacity:.55;">Adding crypto? Use "+ Add crypto" in the Crypto tab instead — it tracks live prices via CoinGecko.</div>
      <label class="field"><span class="label-text">Quantity owned</span><input id="tn-qty" type="number" step="any"></label>
      <label class="field"><span class="label-text">Price</span><input id="tn-price" type="number" step="any"></label>
      <label class="field"><span class="label-text">Currency</span><select id="tn-currency">${CURRENCIES.map(c => `<option ${c === 'EUR' ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span class="label-text">Logo URL <span style="opacity:.6;">(optional)</span></span>
        <div style="display:flex;gap:6px;align-items:center;"><input id="tn-logo" style="flex:1;" placeholder="https://…">${logoPickerButtonHtml('tn-logo')}</div>
        ${logoPickerPopoverHtml('tn-logo')}
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn primary" onclick="saveTxnForm()">✓ Save</button>
      <button class="btn ghost" onclick="closeModal()">✕</button>
    </div>`;
};

// Bloomberg-style exchange codes (as returned by OpenFIGI) mapped to the suffix Yahoo Finance
// expects on the ticker. Best-effort — covers the exchanges people actually hold ETFs/stocks on.
/* Looks up a ticker (or ISIN as a fallback/alternative) via Twelve Data — needs a free API key
   from twelvedata.com (stored in Settings), since the earlier keyless attempt (OpenFIGI) turned
   out not to support anonymous browser requests at all (CORS preflight rejected outright).
   Only runs when the magnifying-glass button is clicked, never on keystroke. Patches fields
   directly (no render()), so nothing else typed in the form gets wiped. Never invents a price:
   if the match or its price can't be found, the Price field is simply left blank. */
async function lookupTickerInfo() {
  const btn = document.getElementById('tn-lookup-btn');
  const tickerEl = document.getElementById('tn-ticker');
  const isinEl = document.getElementById('tn-isin');
  const errEl = document.getElementById('tn-lookup-error');
  const ticker = tickerEl.value.trim().toUpperCase();
  const isin = isinEl.value.trim().toUpperCase();
  const query = ticker || isin;
  if (!query) return;

  const apiKey = data.settings.twelveDataApiKey;
  if (!apiKey) {
    if (errEl) { errEl.textContent = 'Add a Twelve Data API key in Settings first (free at twelvedata.com).'; errEl.style.display = ''; }
    return;
  }

  const originalBtnHtml = btn.innerHTML;
  btn.innerHTML = '…';
  btn.disabled = true;
  if (errEl) errEl.style.display = 'none';
  try {
    let res;
    try {
      res = await fetch(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=5&apikey=${encodeURIComponent(apiKey)}`);
    } catch (networkErr) {
      throw new Error('network'); // fetch itself threw — can't reach the service at all (offline/CORS)
    }
    if (!res.ok) throw new Error('network');
    const json = await res.json();
    if (json.status === 'error') throw new Error(json.message && json.message.toLowerCase().includes('api key') ? 'bad-key' : 'no-match');
    const info = json.data && json.data[0];
    if (!info) throw new Error('no-match');

    document.getElementById('tn-fullname').value = info.instrument_name || document.getElementById('tn-fullname').value;
    if (!ticker && info.symbol) tickerEl.value = info.symbol;
    const mappedType = mapTwelveDataType(info.instrument_type);
    if (mappedType) {
      document.getElementById('tn-assettype').value = mappedType;
      document.getElementById('tn-coingecko-wrap').style.display = mappedType === 'Crypto' ? '' : 'none';
    }
    if (info.currency) {
      const ccySelect = document.getElementById('tn-currency');
      if (Array.from(ccySelect.options).some(o => o.value === info.currency)) ccySelect.value = info.currency;
    }

    // Asset identified — now try for a live price on that exact symbol/exchange. Any failure
    // here just leaves Price blank rather than guessing.
    await tryFillLivePrice(info.symbol, info.exchange, apiKey);
  } catch (e) {
    console.error('Ticker/ISIN lookup failed', e);
    if (errEl) {
      errEl.textContent = e.message === 'network' ? "Couldn't reach the lookup service (network/offline) — fill in the details manually."
        : e.message === 'bad-key' ? 'That Twelve Data API key was rejected — check it in Settings.'
        : "No match for that ticker/ISIN — check it, or fill in the details manually.";
      errEl.style.display = '';
    }
  } finally {
    btn.innerHTML = originalBtnHtml;
    btn.disabled = false;
  }
}
async function tryFillLivePrice(symbol, exchange, apiKey) {
  try {
    const res = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange || '')}&apikey=${encodeURIComponent(apiKey)}`);
    if (!res.ok) return;
    const json = await res.json();
    if (!json.price) return;
    document.getElementById('tn-price').value = json.price;
  } catch (e) {
    console.error('Live price fetch failed, leaving price blank for manual entry', e);
  }
}
function mapTwelveDataType(instrumentType) {
  const t = (instrumentType || '').toLowerCase();
  if (t.includes('etf')) return 'ETFs';
  if (t.includes('common stock')) return 'Stocks';
  if (t.includes('reit')) return 'Real Estate';
  // Crypto is never routed through this form — it has its own dedicated flow (CoinGecko-backed
  // live prices, exchange-scoped snapshots), so a Twelve Data "digital currency" match here is
  // left unmapped rather than silently creating a broken entry outside that model.
  return null; // don't guess for categories Twelve Data can't reliably tell us (Private Equity, Gold, Other)
}
/* Directly sets quantity/price for one broker's holding of a ticker — no buy/sell history,
   same "just tell me what you hold" model as the crypto snapshot rows. Same ticker+broker
   updates that entry in place; otherwise a new entry is added. The asset's currentPrice is
   only set when the asset is first created — adding another broker's entry later must never
   overwrite the live/current price with that entry's (possibly old) purchase price. Average
   price is never stored here; it's always derived fresh from every entry (see assetStats()). */
function saveTxnForm() {
  const ticker = document.getElementById('tn-ticker').value.trim().toUpperCase();
  const qty = parseFloat(document.getElementById('tn-qty').value);
  const price = parseFloat(document.getElementById('tn-price').value);
  if (!ticker || isNaN(qty) || isNaN(price)) return;
  const brokerId = document.getElementById('tn-broker').value;
  const assetType = document.getElementById('tn-assettype').value;
  const currency = document.getElementById('tn-currency').value;
  const fullName = document.getElementById('tn-fullname').value.trim() || ticker;
  const logoInput = document.getElementById('tn-logo').value.trim();

  let asset = data.assets.find(a => a.ticker === ticker && a.assetType === assetType);
  if (!asset) {
    asset = { id: uid('asset'), ticker, name: fullName, assetType, logo: logoInput, priceCurrency: currency, currentPrice: price, manualPrice: null, priceUpdatedAt: null };
    data.assets.push(asset);
  } else {
    if (logoInput) asset.logo = logoInput;
    if (fullName) asset.name = fullName;
  }
  const entry = data.assetEntries.find(e => e.assetId === asset.id && e.broker === brokerId);
  if (entry) {
    Object.assign(entry, { quantity: qty, price, currency });
  } else {
    data.assetEntries.push({ id: uid('ae'), assetId: asset.id, broker: brokerId, quantity: qty, price, currency });
  }
  save(); closeModal();
}

/* ---- Manual Prices ---- */
function goManualPrices() { ui.page = 'manual-prices'; render(); }
function renderManualPrices() {
  return `
  <div class="page surface-dark">
    <div class="page-head">
      <div><h1 class="page-title">Manual Prices</h1><div class="page-subtitle">Override the live price for any holding</div></div>
      <button class="btn" onclick="goPage('investments')">← Back to Portfolio</button>
    </div>
    <div class="card-dark">
      <table class="data-table">
        <thead><tr><th>Ticker / Name</th><th class="num">Auto price</th><th class="num">Manual price</th><th></th></tr></thead>
        <tbody>
          ${allPriceableHoldings().map(h => `
            <tr>
              <td><div style="display:flex;align-items:center;gap:8px;">${assetLogoHtml(h.logo, h.assetType, 22)}<span>${escHtml(h.ticker)} <span style="opacity:.55;">${escHtml(h.name)}</span>${h.kind === 'crypto' ? ` <span class="badge" style="background:${assetTypeColor('Crypto')}22;color:${assetTypeColor('Crypto')};">crypto</span>` : ''}</span></div></td>
              <td class="num mono">${fmtMoney(h.livePrice, h.currency)}</td>
              <td class="num"><input style="width:110px;display:inline-block;" type="number" step="any" id="mp-${h.kind}-${h.key}" value="${h.manualPrice != null ? h.manualPrice : ''}" placeholder="—"></td>
              <td class="num">
                <span class="badge" style="background:${h.manualPrice != null ? 'rgba(232,150,60,0.18)' : 'rgba(34,181,115,0.18)'};color:${h.manualPrice != null ? 'var(--manual-accent)' : 'var(--positive)'};">${h.manualPrice != null ? 'manual' : 'auto'}</span>
              </td>
            </tr>`).join('') || `<tr><td colspan="4" style="opacity:.5;padding:14px 10px;">No holdings yet.</td></tr>`}
        </tbody>
      </table>
      <div style="margin-top:18px;text-align:right;">
        <button class="btn primary" onclick="saveManualPrices()">✓ Save changes</button>
      </div>
    </div>
  </div>`;
}
function saveManualPrices() {
  allPriceableHoldings().forEach(h => {
    const el = document.getElementById('mp-' + h.kind + '-' + h.key);
    if (!el) return;
    const v = el.value.trim();
    h.setManual(v === '' ? null : parseFloat(v));
  });
  save(); render();
}

/* ===================== Trading (leveraged / derivative positions) ===================== */
/* Kept fully separate from the Investments page's assets/crypto models — these are
   margin/collateral positions (futures, CFDs, options, forex...), not outright ownership, so
   they're never folded into portfolioValue()/netWorthTotal(); this page is a standalone tracker
   for what's currently being traded, not another net-worth input. */
function tradeById(id) { return data.trades.find(t => t.id === id); }
function openTrades() { return data.trades.filter(t => t.status !== 'closed').slice().sort((a, b) => new Date(b.openDate) - new Date(a.openDate)); }
function closedTrades() { return data.trades.filter(t => t.status === 'closed').slice().sort((a, b) => new Date(b.closeDate || b.openDate) - new Date(a.closeDate || a.openDate)); }
function tradeDirSign(t) { return t.direction === 'Short' ? -1 : 1; }
/* Unrealized (open) or realized (closed) P&L, in the trade's own currency — leverage affects
   how much collateral a given quantity needs, not the raw P&L math, so it isn't a factor here. */
function tradePL(t) {
  const refPrice = t.status === 'closed' ? t.closePrice : t.currentPrice;
  if (refPrice == null || t.entryPrice == null || t.quantity == null) return null;
  return (refPrice - t.entryPrice) * t.quantity * tradeDirSign(t);
}
function tradePLPct(t) {
  const pl = tradePL(t);
  if (pl == null || !t.collateral) return null;
  return pl / t.collateral * 100;
}
function tradePotential(t, targetPrice) {
  if (targetPrice == null || t.entryPrice == null || t.quantity == null) return null;
  return (targetPrice - t.entryPrice) * t.quantity * tradeDirSign(t);
}
function tradingTotals() {
  const open = openTrades();
  const collateral = open.reduce((s, t) => s + toEUR(t.collateral || 0, t.currency), 0);
  const pl = open.reduce((s, t) => { const p = tradePL(t); return s + (p != null ? toEUR(p, t.currency) : 0); }, 0);
  return { collateral, pl, openCount: open.length };
}
function tradingPlatformSuggestions() {
  return Array.from(new Set([
    ...data.brokers.map(b => b.name),
    ...cryptoBrokerNames(),
    ...data.trades.map(t => t.platform).filter(Boolean),
    ...COMMON_TRADING_PLATFORMS,
  ].filter(Boolean)));
}
function renderTrading() {
  const totals = tradingTotals();
  const trades = ui.tradingTab === 'closed' ? closedTrades() : openTrades();
  return `
  <div class="page surface-dark">
    <div class="page-head">
      <div><h1 class="page-title">Trading</h1><div class="page-subtitle">Leveraged &amp; derivative positions</div></div>
    </div>

    <div class="grid-3" style="margin-bottom:20px;">
      <div class="card-dark stack-gap-8">
        <div class="eyebrow">Open trades</div>
        <div class="big-number">${totals.openCount}</div>
      </div>
      <div class="card-dark stack-gap-8">
        <div class="eyebrow">Collateral at risk (EUR)</div>
        <div class="big-number">${fmtMoney(totals.collateral)}</div>
      </div>
      <div class="card-dark stack-gap-8">
        <div class="eyebrow">Unrealized P&amp;L (EUR)</div>
        <div class="big-number ${totals.pl >= 0 ? 'positive' : 'negative'}">${totals.pl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(totals.pl))}</div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:22px;">
      <button class="btn primary" onclick="openTradeForm()">+ Add trade</button>
      <button class="btn" onclick="alert('Import Excel: choose a .xlsx file exported from your broker (format TBD).')">📄 Import Excel</button>
    </div>

    <div class="tab-row" style="margin-bottom:20px;">
      <button class="tab-btn ${ui.tradingTab === 'open' ? 'active' : ''}" onclick="setTradingTab('open')">Open</button>
      <button class="tab-btn ${ui.tradingTab === 'closed' ? 'active' : ''}" onclick="setTradingTab('closed')">Closed</button>
    </div>

    <div class="card-dark">
      <div class="stack-gap-8">
        ${trades.map(t => tradeRowHtml(t)).join('') || `
        <div class="empty-state"><div class="emoji">⚡</div><div class="title">No ${ui.tradingTab} trades</div><div class="sub">${ui.tradingTab === 'open' ? 'Click "+ Add trade" above to log one.' : 'Trades you close will show up here.'}</div></div>`}
      </div>
    </div>
  </div>`;
}
function setTradingTab(t) { ui.tradingTab = t; render(); }
function tradeRowHtml(t) {
  const pl = tradePL(t);
  const plPct = tradePLPct(t);
  const dirColor = t.direction === 'Short' ? 'var(--negative)' : 'var(--positive)';
  const statusBadge = t.status === 'closed'
    ? `<span class="badge" style="background:rgba(138,141,160,0.18);color:#8A8DA0;">Closed</span>`
    : `<span class="badge" style="background:rgba(34,181,115,0.18);color:var(--positive);">Open</span>`;
  const tpPotential = t.takeProfit != null ? tradePotential(t, t.takeProfit) : null;
  const slPotential = t.stopLoss != null ? tradePotential(t, t.stopLoss) : null;
  return `<div class="card-nested" data-trade="${t.id}">
    <div class="row-flex">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="width:32px;height:32px;border-radius:9px;background:${dirColor}22;display:flex;align-items:center;justify-content:center;font-size:15px;flex:none;">${t.direction === 'Short' ? '📉' : '📈'}</span>
        <div>
          <div style="font-weight:600;font-size:13.5px;">${escHtml(t.instrument)} <span style="opacity:.55;font-weight:400;">${escHtml(t.tradeType)}</span></div>
          <div style="font-size:11.5px;opacity:.55;">
            <span style="color:${dirColor};font-weight:600;">${t.direction}</span> · ${fmtQty(t.quantity)} · entry ${fmtMoney(t.entryPrice, t.currency)}
            ${t.status === 'closed' ? ` · closed ${t.closePrice != null ? fmtMoney(t.closePrice, t.currency) : '—'}` : ` · now <span style="font-weight:700;">${t.currentPrice != null ? fmtMoney(t.currentPrice, t.currency) : '—'}</span>`}
            ${t.platform ? ` · <span class="badge" style="background:var(--dark-card-2);">${escHtml(t.platform)}</span>` : ''}
          </div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700;font-size:13.5px;">${pl != null ? fmtMoney(Math.abs(pl), t.currency) : '—'}</div>
        <div class="${pl != null && pl >= 0 ? 'positive' : 'negative'}" style="font-size:11.5px;">${pl != null ? `${pl >= 0 ? '▲' : '▼'}${plPct != null ? ' ' + fmtPct(Math.abs(plPct), false) : ''}` : ''}</div>
      </div>
    </div>
    <div style="font-size:11px;opacity:.55;margin-top:8px;display:flex;gap:10px;flex-wrap:wrap;">
      <span>Collateral: <strong style="opacity:.9;">${fmtMoney(t.collateral || 0, t.currency)}</strong>${t.leverage ? ` (${t.leverage}x)` : ''}</span>
      ${t.takeProfit != null ? `<span>TP ${fmtMoney(t.takeProfit, t.currency)} → potential <strong class="positive">${fmtMoney(Math.abs(tpPotential), t.currency)}</strong></span>` : ''}
      ${t.stopLoss != null ? `<span>SL ${fmtMoney(t.stopLoss, t.currency)} → potential <strong class="negative">${fmtMoney(Math.abs(slPotential), t.currency)}</strong></span>` : ''}
    </div>
    <div class="row-flex" style="margin-top:8px;">
      <div>${statusBadge}</div>
      <div style="display:flex;gap:2px;">
        <button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" title="Edit trade" onclick="openTradeForm('${t.id}')">✎</button>
        ${t.status !== 'closed' ? `<button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" title="Close trade" onclick="quickCloseTrade('${t.id}')">✔</button>` : ''}
        <button class="icon-btn-round" style="width:26px;height:26px;background:none;border:none;" title="Delete trade" onclick="deleteTrade('${t.id}')">🗑</button>
      </div>
    </div>
  </div>`;
}
function quickCloseTrade(id) {
  const t = tradeById(id);
  if (!t) return;
  if (!confirm(`Close ${t.instrument}? This records today as the close date and uses the current price as the close price — you can fine-tune it after via Edit.`)) return;
  t.status = 'closed';
  t.closePrice = t.currentPrice;
  t.closeDate = new Date().toISOString().slice(0, 10);
  save(); render();
}
function blankTradeDraft() {
  return {
    instrument: '', tradeType: 'CFD', direction: 'Long', platform: '', currency: data.settings.defaultCurrency,
    entryPrice: '', currentPrice: '', quantity: '', leverage: '', collateral: '',
    stopLoss: '', takeProfit: '', status: 'open', openDate: new Date().toISOString().slice(0, 10),
    closeDate: '', closePrice: '', notes: '',
  };
}
function openTradeForm(id) {
  const existing = id ? tradeById(id) : null;
  ui.modal = { type: 'trade', payload: existing ? Object.assign({}, existing) : blankTradeDraft() };
  render();
}
window.__modalRenderers.trade = function (payload) {
  const isEdit = !!payload.id;
  return `
    <div class="modal-head"><div class="modal-title">${isEdit ? 'Edit trade' : 'Add trade'}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <label class="field span-2"><span class="label-text">Instrument / symbol</span><input id="tr-instrument" value="${escHtml(payload.instrument || '')}" placeholder="e.g. BTC/USD, NVDA, EUR/USD"></label>
      <label class="field"><span class="label-text">Trade type</span><input id="tr-type" list="trade-type-list" value="${escHtml(payload.tradeType || '')}" placeholder="e.g. Futures, CFD"></label>
      <label class="field"><span class="label-text">Direction</span>
        <select id="tr-direction">${TRADE_DIRECTIONS.map(d => `<option ${payload.direction === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
      </label>
      <label class="field span-2"><span class="label-text">Platform <span style="opacity:.6;">(optional)</span></span><input id="tr-platform" list="trade-platform-list" value="${escHtml(payload.platform || '')}" placeholder="e.g. Binance Futures"></label>
      <label class="field"><span class="label-text">Currency</span><select id="tr-currency">${CURRENCIES.map(c => `<option ${payload.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span class="label-text">Quantity / size</span><input id="tr-quantity" type="number" step="any" value="${payload.quantity}"></label>
      <label class="field"><span class="label-text">Entry price</span><input id="tr-entry" type="number" step="any" value="${payload.entryPrice}"></label>
      <label class="field"><span class="label-text">Current / mark price</span><input id="tr-current" type="number" step="any" value="${payload.currentPrice}"></label>
      <label class="field"><span class="label-text">Leverage <span style="opacity:.6;">(optional, e.g. 10)</span></span><input id="tr-leverage" type="number" step="any" value="${payload.leverage}"></label>
      <label class="field"><span class="label-text">Collateral / margin</span><input id="tr-collateral" type="number" step="any" value="${payload.collateral}"></label>
      <label class="field"><span class="label-text">Stop loss <span style="opacity:.6;">(optional)</span></span><input id="tr-sl" type="number" step="any" value="${payload.stopLoss}"></label>
      <label class="field"><span class="label-text">Take profit <span style="opacity:.6;">(optional)</span></span><input id="tr-tp" type="number" step="any" value="${payload.takeProfit}"></label>
      <label class="field"><span class="label-text">Open date</span><input id="tr-opendate" type="date" value="${payload.openDate}"></label>
      <label class="field"><span class="label-text">Status</span>
        <select id="tr-status" onchange="toggleTradeCloseFields(this.value)">
          <option value="open" ${payload.status !== 'closed' ? 'selected' : ''}>Open</option>
          <option value="closed" ${payload.status === 'closed' ? 'selected' : ''}>Closed</option>
        </select>
      </label>
      <div class="span-2" id="trade-close-fields" style="display:${payload.status === 'closed' ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:16px;">
        <label class="field"><span class="label-text">Close date</span><input id="tr-closedate" type="date" value="${payload.closeDate || ''}"></label>
        <label class="field"><span class="label-text">Close price</span><input id="tr-closeprice" type="number" step="any" value="${payload.closePrice}"></label>
      </div>
      <label class="field span-2"><span class="label-text">Notes <span style="opacity:.6;">(optional)</span></span><input id="tr-notes" value="${escHtml(payload.notes || '')}"></label>
    </div>
    <datalist id="trade-type-list">${TRADE_TYPES.map(t => `<option value="${t}">`).join('')}</datalist>
    <datalist id="trade-platform-list">${tradingPlatformSuggestions().map(p => `<option value="${escHtml(p)}">`).join('')}</datalist>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn danger ghost" onclick="deleteTrade('${payload.id}')">🗑 Delete</button>` : ''}
      <button class="btn primary" onclick="saveTradeForm()">✓ Save</button>
    </div>`;
};
function toggleTradeCloseFields(status) {
  const el = document.getElementById('trade-close-fields');
  if (el) el.style.display = status === 'closed' ? 'grid' : 'none';
}
function saveTradeForm() {
  const p = ui.modal.payload;
  const instrument = document.getElementById('tr-instrument').value.trim();
  const quantity = parseFloat(document.getElementById('tr-quantity').value);
  const entryPrice = parseFloat(document.getElementById('tr-entry').value);
  if (!instrument || isNaN(quantity) || isNaN(entryPrice)) return;
  const currentRaw = document.getElementById('tr-current').value;
  const leverageRaw = document.getElementById('tr-leverage').value;
  const collateralRaw = document.getElementById('tr-collateral').value;
  const slRaw = document.getElementById('tr-sl').value;
  const tpRaw = document.getElementById('tr-tp').value;
  const status = document.getElementById('tr-status').value;
  const closeDateEl = document.getElementById('tr-closedate');
  const closePriceEl = document.getElementById('tr-closeprice');
  const record = {
    id: p.id || uid('trade'),
    instrument, tradeType: document.getElementById('tr-type').value.trim() || 'Other',
    direction: document.getElementById('tr-direction').value,
    platform: document.getElementById('tr-platform').value.trim(),
    currency: document.getElementById('tr-currency').value,
    quantity, entryPrice,
    currentPrice: currentRaw === '' ? null : parseFloat(currentRaw),
    leverage: leverageRaw === '' ? null : parseFloat(leverageRaw),
    collateral: collateralRaw === '' ? 0 : parseFloat(collateralRaw),
    stopLoss: slRaw === '' ? null : parseFloat(slRaw),
    takeProfit: tpRaw === '' ? null : parseFloat(tpRaw),
    openDate: document.getElementById('tr-opendate').value,
    status,
    closeDate: status === 'closed' ? ((closeDateEl && closeDateEl.value) || new Date().toISOString().slice(0, 10)) : null,
    closePrice: status === 'closed' ? (closePriceEl && closePriceEl.value !== '' ? parseFloat(closePriceEl.value) : null) : null,
    notes: document.getElementById('tr-notes').value.trim(),
  };
  if (p.id) {
    const idx = data.trades.findIndex(t => t.id === p.id);
    if (idx !== -1) data.trades[idx] = record;
  } else {
    data.trades.push(record);
  }
  save(); closeModal();
}
function deleteTrade(id) {
  if (!confirm("Delete this trade? This can't be undone.")) return;
  data.trades = data.trades.filter(t => t.id !== id);
  save(); closeModal();
}

/* ===================== Settings ===================== */
const SETTINGS_SECTIONS = [
  { id: 'githubsync', icon: '🔄', title: 'GitHub Sync (iPhone access)' },
  { id: 'appearance', icon: '🎨', title: 'Appearance & Colors' },
  { id: 'display', icon: '🖥️', title: 'Display Preferences' },
  { id: 'categories', icon: '🏷️', title: 'Categories' },
  { id: 'assetcategories', icon: '📦', title: 'Asset Categories' },
  { id: 'notifications', icon: '🔔', title: 'Notifications' },
  { id: 'logos', icon: '🖼️', title: 'Logos & Images' },
  { id: 'exportdata', icon: '⬇️', title: 'Export Data' },
  { id: 'assetexport', icon: '💹', title: 'Asset List Export' },
  { id: 'about', icon: 'ℹ️', title: 'About' },
];
const SETTINGS_BODY = {
  githubsync: settingsGithubSyncHtml,
  appearance: settingsAppearanceHtml,
  display: settingsDisplayHtml,
  categories: () => categoryEditorHtml(),
  assetcategories: settingsAssetCategoriesHtml,
  notifications: settingsNotificationsHtml,
  logos: settingsLogosHtml,
  exportdata: settingsExportDataHtml,
  assetexport: settingsAssetExportHtml,
  about: settingsAboutHtml,
};

function renderSettings() {
  return `
  <div class="page surface-dark">
    <div class="page-head"><h1 class="page-title">Settings</h1></div>
    ${SETTINGS_SECTIONS.map(s => `
      <div class="accordion ${ui.settingsOpenSections[s.id] ? 'open' : ''}">
        <div class="accordion-head" onclick="toggleSettingsSection('${s.id}')">
          <span class="acc-icon">${s.icon}</span>
          <span class="acc-title">${s.title}</span>
          <span class="chevron">⌄</span>
        </div>
        ${ui.settingsOpenSections[s.id] ? `<div class="accordion-body">${SETTINGS_BODY[s.id]()}</div>` : ''}
      </div>`).join('')}
  </div>`;
}
function toggleSettingsSection(id) { ui.settingsOpenSections[id] = !ui.settingsOpenSections[id]; render(); }

function settingsAppearanceHtml() {
  return `
    <div style="opacity:.6;font-size:13px;margin-bottom:16px;">Choose a color theme for the entire app. Applied instantly.</div>
    <div class="grid-2">
      ${THEMES.map(t => `
        <div onclick="setTheme('${t.id}')" style="cursor:pointer;border-radius:16px;padding:16px;background:${t.swatches[0]};border:2px solid ${data.settings.theme === t.id ? 'var(--accent-1)' : 'transparent'};position:relative;">
          <div style="display:flex;gap:6px;margin-bottom:26px;">${t.swatches.map(c => `<span style="width:20px;height:20px;border-radius:50%;background:${c};border:1px solid rgba(255,255,255,0.15);display:inline-block;"></span>`).join('')}</div>
          <div style="font-weight:700;color:${isLight(t.swatches[0]) ? '#12141C' : '#fff'};">${t.name}</div>
          <div style="font-size:12px;color:${isLight(t.swatches[0]) ? '#4B4F5A' : '#C7C9D6'};">${t.sub}</div>
          ${data.settings.theme === t.id ? `<span style="position:absolute;top:14px;right:14px;width:22px;height:22px;border-radius:50%;background:var(--accent-1);color:var(--on-accent-1);display:flex;align-items:center;justify-content:center;font-size:12px;">✓</span>` : ''}
        </div>`).join('')}
    </div>`;
}
function isLight(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}
function setTheme(id) { data.settings.theme = id; save(); applyTheme(); render(); }

function settingsDisplayHtml() {
  const s = data.settings;
  return `
    <div class="stack-gap-16">
      <label class="field"><span class="label-text">Default currency</span>
        <select onchange="updateSetting('defaultCurrency', this.value)">${CURRENCIES.map(c => `<option ${s.defaultCurrency === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </label>
      ${boolSettingRow('Show cents (decimals)', 'showCents')}
      ${boolSettingRow('Show performance indicators', 'showPerformanceIndicators')}
      ${boolSettingRow('Compact mode', 'compactMode')}
      ${boolSettingRow('Privacy mode', 'privacyMode')}
      <label class="field"><span class="label-text">Twelve Data API key <span style="opacity:.6;">(ticker search &amp; live prices)</span></span>
        <input id="settings-twelvedata-key" value="${escHtml(s.twelveDataApiKey || '')}" placeholder="Paste your free API key from twelvedata.com" onchange="updateSetting('twelveDataApiKey', this.value.trim())">
      </label>
    </div>`;
}
function boolSettingRow(label, key) {
  return `<div class="row-flex"><span style="font-size:13.5px;">${label}</span><div class="toggle ${data.settings[key] ? 'on' : ''}" onclick="toggleSetting('${key}')"></div></div>`;
}
function toggleSetting(key) { data.settings[key] = !data.settings[key]; save(); render(); }
function updateSetting(key, value) { data.settings[key] = value; save(); render(); }

function settingsAssetCategoriesHtml() {
  return `
    <div style="font-weight:700;margin-bottom:10px;">Asset categories</div>
    <div class="chip-scroll" style="flex-wrap:wrap;">
      ${data.categories.asset.map(c => `<span class="chip">${escHtml(c.name)} <button class="close-x" style="font-size:12px;padding:0;" onclick="removeCategory('asset','${c.id}')">✕</button></span>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <input id="new-asset-cat" placeholder="Add asset category…">
      <button class="btn primary" onclick="addCategory('asset')">+</button>
    </div>`;
}

function settingsNotificationsHtml() {
  const items = [
    { key: 'budgetLimitAlerts', title: 'Budget limit alerts', desc: 'Notify when spending exceeds a category limit' },
    { key: 'negativeBalanceWarning', title: 'Negative balance warning', desc: 'Notify when monthly balance goes negative' },
    { key: 'weeklySummary', title: 'Weekly summary', desc: 'Receive a weekly financial summary' },
    { key: 'goalAchieved', title: 'Goal achieved', desc: 'Notify when a financial goal is completed' },
  ];
  return `<div class="stack-gap-16">${items.map(it => `
    <div class="row-flex">
      <div><div style="font-weight:600;font-size:13.5px;">${it.title}</div><div style="font-size:12px;opacity:.55;">${it.desc}</div></div>
      <div class="toggle ${data.settings.notifications[it.key] ? 'on' : ''}" onclick="toggleNotification('${it.key}')"></div>
    </div>`).join('')}</div>`;
}
function toggleNotification(key) { data.settings.notifications[key] = !data.settings.notifications[key]; save(); render(); }

/* Every logo used anywhere in the app (banks, brokers, stocks/ETFs/other assets, crypto,
   transaction payees) in one library — ready to download, copy the URL from, or reuse via the
   matching "choose from used logos" picker attached to every Logo URL field elsewhere. */
function settingsLogosHtml() {
  const items = allLogoItems();
  return `
    <div class="grid-2" style="margin-bottom:16px;">
      ${items.map(it => `
        <div class="card-nested" style="display:flex;align-items:center;gap:10px;">
          ${logoImg(it.logo, 34)}
          <div style="flex:1;"><div style="font-weight:600;font-size:13px;">${escHtml(it.name)}</div><div style="font-size:11px;opacity:.55;">${escHtml(it.type)}</div></div>
          <button class="icon-btn-round" style="width:30px;height:30px;background:none;border:none;" title="Copy URL" onclick="copyLogoUrl(this,'${escHtml(it.logo).replace(/'/g, "\\'")}')">📋</button>
          <a class="icon-btn-round" style="width:30px;height:30px;background:none;border:none;text-decoration:none;" href="${escHtml(it.logo)}" download="${escHtml(it.name)}.png" title="Download">⬇</a>
        </div>`).join('') || '<div style="opacity:.5;font-size:13px;">No logos yet.</div>'}
    </div>
    <button class="btn" onclick="downloadAllLogos()">⬇ Download all (${items.length} images)</button>`;
}
function copyLogoUrl(btn, url) {
  const done = () => { const prev = btn.textContent; btn.textContent = '✓'; setTimeout(() => { btn.textContent = prev; }, 1200); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopyText(url, done));
  } else {
    fallbackCopyText(url, done);
  }
}
function fallbackCopyText(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) {}
  document.body.removeChild(ta);
}
function downloadAllLogos() {
  const items = allLogoItems().map(it => it.logo);
  items.forEach((src, i) => { setTimeout(() => { const a = document.createElement('a'); a.href = src; a.download = ''; a.click(); }, i * 200); });
}

function settingsExportDataHtml() {
  ui.exportKind = ui.exportKind || 'transactions';
  ui.exportFields = ui.exportFields || ['Date', 'Type', 'Category', 'Amount'];
  const allFields = Object.keys(BUDGET_TX_EXPORT_COLUMNS);
  const rowCount = ui.exportKind === 'transactions' ? data.budgetTransactions.length : data.investmentTransactions.length;
  return `
    <div class="tab-row" style="margin-bottom:16px;">
      <button class="tab-btn ${ui.exportKind === 'transactions' ? 'active' : ''}" onclick="setExportKind('transactions')">Transactions</button>
      <button class="tab-btn ${ui.exportKind === 'investments' ? 'active' : ''}" onclick="setExportKind('investments')">Investments</button>
    </div>
    <label class="field" style="margin-bottom:14px;"><span class="label-text">Period</span>
      <select id="export-period"><option>Current month</option><option>Last month</option><option>This year</option><option selected>All time</option></select>
    </label>
    <div class="label-text" style="margin-bottom:8px;">Fields to export</div>
    <div class="chip-scroll" style="flex-wrap:wrap;margin-bottom:16px;">
      ${allFields.map(f => `<span class="chip" style="cursor:pointer;${ui.exportFields.includes(f) ? '' : 'opacity:.4;'}" onclick="toggleExportField('${f}')">${f}</span>`).join('')}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn primary" onclick="exportDataCsv()">⬇ Export CSV (${rowCount} rows)</button>
      <button class="btn" onclick="exportDataExcel()">⬇ Export Excel (${rowCount} rows)</button>
    </div>`;
}
function setExportKind(k) { ui.exportKind = k; render(); }
function toggleExportField(f) {
  ui.exportFields = ui.exportFields.includes(f) ? ui.exportFields.filter(x => x !== f) : [...ui.exportFields, f];
  render();
}
function downloadCSV(filename, header, rows) {
  const esc = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [header.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
/* A real, Excel-native file (SpreadsheetML — Excel's plain-XML format since Excel 2003) rather
   than just a renamed CSV. Needs no external library/CDN dependency (this app has no build
   step and must keep working fully offline). `columns` is [{header, width, type}] — type
   'Date' gets a real Excel date (sortable/filterable, not a text string), 'Number' gets a
   right-aligned 2-decimal number format; both plus a bold/colored header row and a frozen
   header make the export usable as a real spreadsheet, not just a data dump. */
function downloadExcelXml(filename, sheetName, columns, rows) {
  const escXml = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cellXml = (v, col) => {
    const blank = v == null || v === '';
    if (col.style) return blank ? `<Cell ss:StyleID="${col.style}"></Cell>` : `<Cell ss:StyleID="${col.style}"><Data ss:Type="${col.type === 'Number' ? 'Number' : 'String'}">${escXml(v)}</Data></Cell>`;
    if (col.type === 'Date' && v) return `<Cell ss:StyleID="DateCell"><Data ss:Type="DateTime">${v}T00:00:00.000</Data></Cell>`;
    if (col.type === 'Number' && typeof v === 'number' && isFinite(v)) return `<Cell ss:StyleID="AmountCell"><Data ss:Type="Number">${v}</Data></Cell>`;
    return `<Cell ss:StyleID="Cell"><Data ss:Type="String">${escXml(v)}</Data></Cell>`;
  };
  const colXml = columns.map(c => `<Column ss:Width="${c.width || 100}"/>`).join('');
  const headerRow = `<Row>${columns.map(c => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escXml(c.header)}</Data></Cell>`).join('')}</Row>`;
  const dataRows = rows.map(r => `<Row>${r.map((v, i) => cellXml(v, columns[i])).join('')}</Row>`).join('');
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
 <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/><Interior ss:Color="#4F46E5" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style>
 <Style ss:ID="Cell"><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/></Borders></Style>
 <Style ss:ID="DateCell"><NumberFormat ss:Format="dd/mm/yyyy"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/></Borders></Style>
 <Style ss:ID="AmountCell"><NumberFormat ss:Format="#,##0.00"/><Alignment ss:Vertical="Center" ss:Horizontal="Right"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/></Borders></Style>
 <Style ss:ID="PriceInput"><NumberFormat ss:Format="#,##0.00"/><Interior ss:Color="#FDE4BF" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Right"/><Font ss:Color="#7A4A12"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8963C"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8963C"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8963C"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8963C"/></Borders></Style>
</Styles>
<Worksheet ss:Name="${escXml(sheetName)}">
<Table>${colXml}${headerRow}${dataRows}</Table>
<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane><Panes><Pane><Number>3</Number></Pane><Pane><Number>2</Number><ActiveRow>0</ActiveRow></Pane></Panes></WorksheetOptions>
</Worksheet>
</Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
/* Shared by the CSV export, the Excel export, and the Budget page's own quick-export button,
   so every "export my transactions" path resolves fields (sub-category name, not just its id;
   payment method name; etc.) exactly the same way, and shares one column order/type/width
   definition so the two export formats never drift apart. */
const BUDGET_TX_EXPORT_COLUMNS = {
  'Date': { width: 85, type: 'Date', value: t => t.date },
  'Name / Payee': { width: 170, type: 'String', value: t => t.comment || '' },
  'Category': { width: 150, type: 'String', value: t => (categoryById(t.type, t.categoryId) || {}).name || '' },
  'Sub-category': { width: 150, type: 'String', value: t => { const cat = categoryById(t.type, t.categoryId); const sub = cat ? (cat.subcategories || []).find(s => s.id === t.subCategoryId) : null; return sub ? sub.name : ''; } },
  'Amount': { width: 95, type: 'Number', value: t => t.amount },
  'Currency': { width: 70, type: 'String', value: t => t.currency },
  'Type': { width: 75, type: 'String', value: t => t.type },
  'Nature': { width: 90, type: 'String', value: t => t.nature },
  'Payment Method': { width: 125, type: 'String', value: t => (paymentMethodById(t.paymentMethodId) || {}).name || '' },
  'Personal Impact': { width: 100, type: 'String', value: t => t.impact === 'positive' ? 'Positive' : t.impact === 'negative' ? 'Negative' : '' },
  'Location': { width: 130, type: 'String', value: t => t.location || '' },
  'Description': { width: 220, type: 'String', value: t => t.description || '' },
};
/* Chronological (oldest first), like a real statement/ledger — not insertion order. */
function budgetTxExportRows(fields) {
  return data.budgetTransactions.slice().sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(t => fields.map(f => BUDGET_TX_EXPORT_COLUMNS[f].value(t)));
}
/* Budget page quick-export ("extract every transaction, dated, with amount, name, category +
   sub-category, location...") — full field set, no picker needed since it's a one-click action
   right where the transactions live. */
function exportBudgetTransactionsExcel() {
  const fields = Object.keys(BUDGET_TX_EXPORT_COLUMNS);
  const columns = fields.map(f => ({ header: f, width: BUDGET_TX_EXPORT_COLUMNS[f].width, type: BUDGET_TX_EXPORT_COLUMNS[f].type }));
  downloadExcelXml('trackr-budget-transactions.xls', 'Transactions', columns, budgetTxExportRows(fields));
}
function exportDataExcel() {
  if (ui.exportKind === 'transactions') {
    const fields = ui.exportFields.filter(f => BUDGET_TX_EXPORT_COLUMNS[f]);
    const columns = fields.map(f => ({ header: f, width: BUDGET_TX_EXPORT_COLUMNS[f].width, type: BUDGET_TX_EXPORT_COLUMNS[f].type }));
    downloadExcelXml('trackr-transactions.xls', 'Transactions', columns, budgetTxExportRows(fields));
  } else {
    const columns = [{ header: 'Date', width: 85, type: 'Date' }, { header: 'Action', width: 80 }, { header: 'Ticker', width: 90 }, { header: 'Quantity', width: 90, type: 'Number' }, { header: 'Unit Price', width: 90, type: 'Number' }, { header: 'Currency', width: 70 }];
    downloadExcelXml('trackr-investments.xls', 'Investments', columns,
      data.investmentTransactions.map(t => [t.date, t.action, t.ticker, t.quantity, t.unitPrice, t.currency]));
  }
}
function exportDataCsv() {
  if (ui.exportKind === 'transactions') {
    const fields = ui.exportFields.filter(f => BUDGET_TX_EXPORT_COLUMNS[f]);
    downloadCSV('trackr-transactions.csv', fields, budgetTxExportRows(fields));
  } else {
    downloadCSV('trackr-investments.csv', ['Date', 'Action', 'Ticker', 'Quantity', 'Unit Price', 'Currency'],
      data.investmentTransactions.map(t => [fmtDate(t.date), t.action, t.ticker, t.quantity, t.unitPrice, t.currency]));
  }
}

function settingsAssetExportHtml() {
  return `
    <div style="opacity:.65;font-size:13px;margin-bottom:16px;">Export your holdings with current prices, correct them in the file, then re-import to update everything at once — the same source of truth used by Manual Prices.</div>
    <table class="data-table" style="margin-bottom:16px;">
      <thead><tr><th>Ticker</th><th>Name</th><th>Type</th><th class="num">Price</th><th>Currency</th></tr></thead>
      <tbody>
        ${allPriceableHoldings().map(h => `<tr>
          <td class="mono"><div style="display:flex;align-items:center;gap:8px;">${assetLogoHtml(h.logo, h.assetType, 20)}${escHtml(h.ticker)}</div></td><td>${escHtml(h.name)}</td><td>${escHtml(h.assetType)}</td>
          <td class="num" style="color:${h.manualPrice != null ? '#E8963C' : 'var(--positive)'};">${h.manualPrice != null ? h.manualPrice : h.livePrice}${h.manualPrice != null ? ' ✎' : ''}</td>
          <td>${h.currency}</td>
        </tr>`).join('') || `<tr><td colspan="5" style="opacity:.5;padding:14px 10px;">No holdings yet.</td></tr>`}
      </tbody>
    </table>
    <div class="row-flex" style="flex-wrap:wrap;gap:10px;">
      <button class="btn primary" onclick="exportAssetListCsv()">⬇ Export CSV with prices (${allPriceableHoldings().length} assets)</button>
      <label class="btn" style="cursor:pointer;">
        📤 Choose corrected CSV to import
        <input type="file" accept=".csv" style="display:none;" onchange="importAssetListCsv(this.files[0])">
      </label>
    </div>
    <div style="opacity:.65;font-size:13px;margin:16px 0 10px;">Or the same round-trip as a genuine Excel file — every asset you own, with a blank <span style="color:#E8963C;font-weight:600;">orange "New Price"</span> column per row ready to fill in, then re-import to update everything at once. When saving in Excel, choose "Keep Current Format" rather than converting it, so it can be read back in.</div>
    <div class="row-flex" style="flex-wrap:wrap;gap:10px;">
      <button class="btn primary" style="background:#F5E7C4;color:#12141C;border-color:#F5E7C4;" onclick="exportAssetPricesExcel()">⬇ Export Excel with blank price column (${allPriceableHoldings().length} assets)</button>
      <label class="btn" style="cursor:pointer;">
        📤 Choose filled-in Excel to import
        <input type="file" accept=".xls" style="display:none;" onchange="importAssetPricesExcel(this.files[0])">
      </label>
    </div>
    <div style="opacity:.65;font-size:13px;margin:16px 0 10px;">Or export the full database of everything you own — quantities, per-broker holdings, and P&amp;L, not just current prices.</div>
    <button class="btn" onclick="exportAssetsJson()">⬇ Export full asset database (JSON)</button>`;
}
/* The complete "owned assets" database — quantities, per-broker/exchange breakdown, and
   P&L for every Stock/ETF/other asset and every tracked crypto coin. JSON (rather than CSV)
   since holdings here are naturally nested (one asset → many broker entries), which a flat
   CSV can't represent without duplicating rows awkwardly. */
function fullAssetDatabaseJson() {
  const stocksAndOtherAssets = data.assets.map(a => {
    const s = assetStats(a.id);
    return {
      ticker: a.ticker, name: a.name, assetType: a.assetType, currency: a.priceCurrency,
      currentPrice: a.currentPrice, manualPrice: a.manualPrice,
      quantity: s.quantity, avgPrice: s.avgPrice, value: s.value, unrealizedPL: s.pl, unrealizedPLPct: s.plPct,
      holdings: entriesFor(a.id).map(e => ({ broker: (brokerById(e.broker) || {}).name || e.broker || '', quantity: e.quantity, price: e.price, currency: e.currency })),
    };
  });
  const crypto = data.cryptoAssets.map(c => {
    const s = cryptoAssetStats(c.symbol);
    return {
      symbol: c.symbol, name: c.name, currentPriceEUR: c.currentPriceEUR, currentPriceUSD: c.currentPriceUSD,
      manualPrice: c.manualPrice, manualPriceCurrency: c.manualPriceCurrency,
      quantity: s.quantity, avgPriceEUR: s.blendedAvgPriceEUR, avgPriceUSD: s.blendedAvgPriceUSD, valueEUR: s.marketValueEUR, unrealizedPLEUR: s.plEUR, unrealizedPLPct: s.plPct,
      holdings: c.mode === 'snapshot'
        ? (c.snapshots || []).map(r => ({ broker: r.broker, quantity: r.quantity, price: r.price, currency: r.currency }))
        : lotsFor(c.symbol).map(l => ({ broker: l.broker, date: l.date, quantity: l.quantity, amountPaid: l.amountPaid, currency: l.currency })),
    };
  });
  return { exportedAt: new Date().toISOString(), eurUsdRate: data.settings.eurUsdRate, stocksAndOtherAssets, crypto };
}
function exportAssetsJson() {
  const blob = new Blob([JSON.stringify(fullAssetDatabaseJson(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'trackr-assets.json'; a.click();
  URL.revokeObjectURL(url);
}
function exportAssetListCsv() {
  downloadCSV('trackr-asset-prices.csv', ['ticker', 'name', 'type', 'price', 'currency'],
    allPriceableHoldings().map(h => [h.ticker, h.name, h.assetType, h.manualPrice != null ? h.manualPrice : h.livePrice, h.currency]));
}
function importAssetListCsv(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const tickerIdx = header.indexOf('ticker'), priceIdx = header.indexOf('price');
    if (tickerIdx === -1 || priceIdx === -1) { alert('CSV must have "ticker" and "price" columns.'); return; }
    let updated = 0;
    lines.slice(1).forEach(line => {
      const cols = line.split(',');
      const ticker = (cols[tickerIdx] || '').trim();
      const price = parseFloat(cols[priceIdx]);
      if (!ticker || isNaN(price)) return;
      allPriceableHoldings().filter(h => h.ticker === ticker).forEach(h => { h.setManual(price); updated++; });
    });
    save(); render();
    alert(`Updated ${updated} holding(s) from CSV.`);
  };
  reader.readAsText(file);
}
/* Same round-trip as the CSV pair above, but as a genuine polished .xls (see
   exportBudgetTransactionsExcel) — the "New Price" column is left deliberately blank per row
   and highlighted orange (the "PriceInput" style) instead of pre-filling the current price for
   in-place editing, so it reads as a clear fill-in-the-blank template rather than a data dump. */
function exportAssetPricesExcel() {
  const columns = [
    { header: 'Ticker', width: 90 },
    { header: 'Name', width: 190 },
    { header: 'Type', width: 110 },
    { header: 'Currency', width: 70 },
    { header: 'Current Price', width: 110, type: 'Number' },
    { header: 'New Price (fill in)', width: 140, style: 'PriceInput' },
  ];
  const rows = allPriceableHoldings().map(h => [h.ticker, h.name, h.assetType, h.currency, h.manualPrice != null ? h.manualPrice : (h.livePrice != null ? h.livePrice : ''), '']);
  downloadExcelXml('trackr-asset-prices.xls', 'Prices', columns, rows);
}
/* Reads back the exact plain-XML SpreadsheetML this app generates (readAsText — no ZIP/OOXML
   parsing needed, since this legacy "XML Spreadsheet 2003" format round-trips as plain text as
   long as Excel is told to "Keep Current Format" on save rather than converting to .xlsx).
   Cells are read by their ss:Index when present (Excel renumbers cells with gaps using this
   attribute instead of emitting empty <Cell> placeholders) so a re-saved file still lines up
   correctly even if formatting/whitespace changed around it. */
function importAssetPricesExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) {
      alert('Couldn\'t read this as a Trackr Excel export. If Excel asked to convert the format when you saved, choose "Keep Current Format" — or use the CSV import instead.');
      return;
    }
    const ns = 'urn:schemas-microsoft-com:office:spreadsheet';
    const rowEls = Array.from(doc.getElementsByTagNameNS(ns, 'Row'));
    if (rowEls.length < 2) { alert('No rows found in this file.'); return; }
    const rowCellsByIndex = row => {
      const out = {};
      let nextIdx = 1;
      Array.from(row.getElementsByTagNameNS(ns, 'Cell')).forEach(cell => {
        const idxAttr = cell.getAttribute('ss:Index') || cell.getAttributeNS(ns, 'Index');
        const idx = idxAttr ? parseInt(idxAttr, 10) : nextIdx;
        const dataEl = cell.getElementsByTagNameNS(ns, 'Data')[0];
        out[idx] = dataEl ? dataEl.textContent : '';
        nextIdx = idx + 1;
      });
      return out;
    };
    let updated = 0;
    rowEls.slice(1).forEach(row => {
      const cells = rowCellsByIndex(row);
      const ticker = (cells[1] || '').trim();
      const newPriceRaw = (cells[6] || '').trim();
      if (!ticker || newPriceRaw === '') return;
      const price = parseFloat(newPriceRaw);
      if (isNaN(price)) return;
      allPriceableHoldings().filter(h => h.ticker === ticker).forEach(h => { h.setManual(price); updated++; });
    });
    save(); render();
    alert(`Updated ${updated} holding(s) from Excel.`);
  };
  reader.readAsText(file);
}

function settingsAboutHtml() {
  const bytes = new Blob([JSON.stringify(data)]).size;
  return `
    <table class="data-table">
      <tbody>
        <tr><td style="opacity:.6;">Version</td><td style="text-align:right;">1.0.0</td></tr>
        <tr><td style="opacity:.6;">Application</td><td style="text-align:right;font-weight:700;">Trackr</td></tr>
        <tr><td style="opacity:.6;">Stored data</td><td style="text-align:right;">${(bytes / 1024).toFixed(1)} KB · ${data.accounts.length} accounts · ${data.budgetTransactions.length} transactions · ${data.assets.length} assets · ${data.cryptoAssets.length} crypto</td></tr>
      </tbody>
    </table>`;
}
/* GitHub-as-a-database: config (owner/repo/token) is entered separately on every device and
   kept in that device's own localStorage only (see GH_SYNC_KEY) — never part of the synced
   data itself, since a device needs it before it can even reach GitHub. Connecting pulls
   whatever's already in the repo if it exists, or seeds the repo from this device's current
   data if the repo is still empty — so the same "Connect" button handles both "this is the
   first device" and "join a repo another device already seeded" without a separate flow. */
function settingsGithubSyncHtml() {
  const cfg = loadGhSyncConfig();
  return `
    <div style="opacity:.65;font-size:13px;margin-bottom:16px;">
      Sync your data between devices (e.g. this Mac and your iPhone) through a private GitHub repo — no server to run, works from anywhere with internet. Your data only goes to the private repo below; it's never public.
    </div>
    ${cfg ? `
      <div class="card-nested" style="margin-bottom:16px;">
        <div class="row-flex">
          <div>
            <div style="font-weight:700;">🔄 Connected</div>
            <div style="font-size:12.5px;opacity:.6;margin-top:2px;">${escHtml(cfg.owner)}/${escHtml(cfg.repo)}</div>
          </div>
          <button class="btn small" onclick="disconnectGithubSync()">Disconnect</button>
        </div>
        <div style="font-size:12px;opacity:.6;margin-top:10px;">If this device's data should replace what's currently in the repo (e.g. this is the device with your real, existing data), use:</div>
        <button class="btn small" style="margin-top:8px;" onclick="pushGithubSyncOverwrite()">⬆ Push this device's data (overwrite the repo)</button>
      </div>
    ` : `
      <div class="card-nested" style="margin-bottom:16px;">
        <div style="font-weight:700;margin-bottom:8px;">One-time setup</div>
        <ol style="font-size:12.5px;opacity:.75;margin:0 0 12px;padding-left:18px;line-height:1.6;">
          <li>On <strong>github.com</strong>, create a new <strong>private</strong> repository just for this data (e.g. "trackr-data") — an empty repo is fine, don't add a README.</li>
          <li>Go to <strong>github.com/settings/personal-access-tokens/new</strong>, create a fine-grained token scoped to <strong>only that repository</strong>, with <strong>Contents: Read and write</strong> permission.</li>
          <li>Enter the details below, on every device you want synced (this Mac, your iPhone, ...).</li>
        </ol>
      </div>
      <div class="form-grid" style="margin-bottom:12px;">
        <label class="field"><span class="label-text">GitHub username</span><input id="gh-owner" placeholder="e.g. arthurlm05"></label>
        <label class="field"><span class="label-text">Repository name</span><input id="gh-repo" placeholder="e.g. trackr-data"></label>
        <label class="field span-2"><span class="label-text">Personal access token</span><input id="gh-token" type="password" placeholder="github_pat_…"></label>
      </div>
      <div class="row-flex" style="flex-wrap:wrap;gap:10px;">
        <button class="btn primary" onclick="connectGithubSync()">🔄 Connect (pull existing data, if any)</button>
        <button class="btn" onclick="connectGithubSync(true)">⬆ Connect &amp; push THIS device's data instead</button>
      </div>
      <div style="font-size:11.5px;opacity:.55;margin-top:8px;">Use the second button on whichever device holds your real, existing data (e.g. an index.html you'd been using directly) — it overwrites the repo with what's here instead of pulling from it.</div>
    `}
    <div id="gh-sync-status" style="margin-top:10px;font-size:12.5px;"></div>`;
}
async function connectGithubSync(forcePush) {
  const owner = document.getElementById('gh-owner').value.trim();
  const repo = document.getElementById('gh-repo').value.trim();
  const token = document.getElementById('gh-token').value.trim();
  const status = document.getElementById('gh-sync-status');
  if (!owner || !repo || !token) { if (status) status.textContent = 'Fill in all three fields.'; return; }
  saveGhSyncConfig({ owner, repo, token, path: 'trackr-data.json' });
  if (status) status.textContent = forcePush ? 'Pushing…' : 'Connecting…';
  try {
    const remote = await ghFetchData();
    ghLastSha = remote.sha;
    if (remote.json && !forcePush) {
      data = remote.json;
      migrateCryptoModel();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      // Push this device's current data as-is — pushed directly (not via save()) so a real
      // repo/token problem surfaces here instead of being silently swallowed.
      data.updatedAt = new Date().toISOString();
      recordHistorySnapshot();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      ghLastSha = await ghPushData(data, remote.sha);
    }
    startSyncPolling();
    render();
  } catch (e) {
    clearGhSyncConfig();
    if (status) status.textContent = "Couldn't connect — check the username, repo name, and token, then try again.";
  }
}
/* Manual override for a device that's already connected — e.g. you connected the wrong way
   round the first time, or want to force this device's current data to become authoritative
   again after experimenting on another device. */
async function pushGithubSyncOverwrite() {
  const status = document.getElementById('gh-sync-status');
  if (status) status.textContent = 'Pushing…';
  try {
    const remote = await ghFetchData();
    data.updatedAt = new Date().toISOString();
    recordHistorySnapshot();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    ghLastSha = await ghPushData(data, remote ? remote.sha : null);
    if (status) status.textContent = '✓ Pushed — this device\'s data is now what the repo has.';
  } catch (e) {
    if (status) status.textContent = "Couldn't push — check your connection and try again.";
  }
}
function disconnectGithubSync() {
  clearGhSyncConfig();
  if (syncPollTimer) { clearInterval(syncPollTimer); syncPollTimer = null; }
  render();
}

load();
