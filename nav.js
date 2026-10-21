/* ===================== Navigation =====================
 * Its own file. Pages are grouped in four tabs (the default since Oct 2026); Settings → Display
 * → "Classic navigation" brings back the old side bar with every page in it. Every page and every
 * goPage('…') id stays the same — only how they're grouped changes:
 *
 *   Home      Overview
 *   Money     Budget (Transactions · Recurring · Forecast · Totals · Categories · Import) · Receipts · Freelance
 *   Wealth    Overview · Cash (the old Accounts page) · Investments (+ each account) · Watchlist · Debts
 *   Plan      Goals · Future · Emergency · Insights (the old Analysis page)
 *   Trading, Settings — on the phone under "More" (5 tabs: Home · Money · Wealth · Plan · More)
 *
 * Pages grouped under one tab get a row of section tabs at the top. (The old `newNav` setting
 * from the beta is kept in the data but no longer read.)
 */
const NEW_NAV = [
  { id: 'dashboard', label: 'Home', icon: 'home', phone: true, pages: ['dashboard'] },
  { id: 'budget', label: 'Money', icon: 'receipt', phone: true, pages: ['budget', 'receipts', 'freelance'] },
  { id: 'wealth', label: 'Wealth', icon: 'pie', phone: true, pages: ['wealth', 'accounts', 'investments', 'investAccount', 'manual-prices', 'positions-import', 'watchlist'] },
  { id: 'goals', label: 'Plan', icon: 'target', phone: true, pages: ['goals', 'analysis'] },
  { id: 'trading', label: 'Trading', icon: 'bolt', pages: ['trading'] },
  { id: 'settings', label: 'Settings', icon: 'settings', pages: ['settings'] },
];
function newNavOn() { return !(typeof data !== 'undefined' && data && data.settings && data.settings.classicNav); }
function currentNavItems() { return newNavOn() ? NEW_NAV : NAV_ITEMS; }
function navItemActive(item) {
  if (newNavOn()) return (item.pages || [item.id]).includes(ui.page);
  return ui.page === item.id || (item.id === 'investments' && ['investAccount', 'watchlist'].includes(ui.page)) || (item.id === 'budget' && ui.page === 'receipts');
}
function goWealthSection(tab) { ui.wealthTab = tab === 'liabilities' ? 'liabilities' : 'assets'; goPage('wealth'); }
function goPlanSection(tab) { ui.goalsTab = ['emergency', 'future'].includes(tab) ? tab : 'goals'; goPage('goals'); }
const SECTION_TABS = {
  budget: [
    ['Budget', "goPage('budget')", () => ui.page === 'budget'],
    ['Receipts', "goPage('receipts')", () => ui.page === 'receipts'],
    ['Freelance', "goPage('freelance')", () => ui.page === 'freelance'],
  ],
  wealth: [
    ['Overview', "goWealthSection('assets')", () => ui.page === 'wealth' && ui.wealthTab !== 'liabilities'],
    ['Cash', "goPage('accounts')", () => ui.page === 'accounts'],
    ['Investments', "goPage('investments')", () => ['investments', 'investAccount', 'manual-prices', 'positions-import'].includes(ui.page)],
    ['Watchlist', "goPage('watchlist')", () => ui.page === 'watchlist'],
    ['Debts', "goWealthSection('liabilities')", () => ui.page === 'wealth' && ui.wealthTab === 'liabilities'],
  ],
  goals: [
    ['Goals', "goPlanSection('goals')", () => ui.page === 'goals' && !['emergency', 'future'].includes(ui.goalsTab)],
    ['Future', "goPlanSection('future')", () => ui.page === 'goals' && ui.goalsTab === 'future'],
    ['Emergency', "goPlanSection('emergency')", () => ui.page === 'goals' && ui.goalsTab === 'emergency'],
    ['Insights', "goPage('analysis')", () => ui.page === 'analysis'],
  ],
};
function sectionTabsHtml() {
  if (!newNavOn()) return '';
  const item = NEW_NAV.find(navItemActive);
  const tabs = item && SECTION_TABS[item.id];
  if (!tabs) return '';
  return `<nav class="section-tabs" aria-label="${escHtml(item.label)}">${tabs.map(([label, go, on]) => `<button class="${on() ? 'on' : ''}" onclick="${go}">${label}</button>`).join('')}</nav>`;
}
