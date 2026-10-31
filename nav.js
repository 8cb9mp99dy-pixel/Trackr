/* ===================== Navigation =====================
 * Its own file. Pages are grouped in four tabs (the default since Oct 2026); Settings → Display
 * → "Classic navigation" brings back the old side bar with every page in it. Every page and every
 * goPage('…') id stays the same — only how they're grouped changes:
 *
 *   Home      Overview
 *   Money     Budget (Transactions · Recurring · Forecast · Totals · Categories · Import) · Receipts · Trips · IOUs · Contracts · Freelance · From Claude (once connected)
 *   Wealth    Overview · Cash (the old Accounts page) · Investments (+ each account) · Watchlist · Debts
 *   Plan      Goals · Yearly bills · Future · Emergency · Patterns · Insights (the old Analysis page)
 *   Settings
 *
 * On a computer the side bar lists every page under its group, so any page is one click away and
 * there are no section tabs. On a tablet and a phone: the four tabs (+ Settings or More), the
 * section tabs at the top, and More shows every page. The Trading page was removed at the user's
 * request (31 Oct 2026): don't bring it back. data.trades stays in the data and backups.
 *
 * Pages grouped under one tab get a row of section tabs at the top. (The old `newNav` setting
 * from the beta is kept in the data but no longer read.)
 */
const NEW_NAV = [
  { id: 'dashboard', label: 'Home', icon: 'home', phone: true, pages: ['dashboard'] },
  { id: 'budget', label: 'Money', icon: 'receipt', phone: true, pages: ['budget', 'receipts', 'trips', 'ious', 'contracts', 'freelance', 'inbox'] },
  { id: 'wealth', label: 'Wealth', icon: 'pie', phone: true, pages: ['wealth', 'accounts', 'investments', 'investAccount', 'manual-prices', 'positions-import', 'watchlist'] },
  { id: 'goals', label: 'Plan', icon: 'target', phone: true, pages: ['goals', 'yearly', 'patterns', 'analysis'] },
  { id: 'settings', label: 'Settings', icon: 'settings', pages: ['settings'] },
];
function newNavOn() { return !(typeof data !== 'undefined' && data && data.settings && data.settings.classicNav); }
function currentNavItems() { return newNavOn() ? NEW_NAV : NAV_ITEMS; }
function navItemActive(item) {
  if (newNavOn()) return (item.pages || [item.id]).includes(ui.page);
  return ui.page === item.id || (item.id === 'investments' && ['investAccount', 'watchlist'].includes(ui.page)) || (item.id === 'budget' && ['receipts', 'trips', 'ious', 'contracts', 'inbox'].includes(ui.page)) || (item.id === 'goals' && ['yearly', 'patterns'].includes(ui.page));
}
function goWealthSection(tab) { ui.wealthTab = tab === 'liabilities' ? 'liabilities' : 'assets'; goPage('wealth'); }
function goPlanSection(tab) { ui.goalsTab = ['emergency', 'future'].includes(tab) ? tab : 'goals'; goPage('goals'); }
const SECTION_TABS = {
  budget: [
    ['Budget', "goPage('budget')", () => ui.page === 'budget'],
    ['Receipts', "goPage('receipts')", () => ui.page === 'receipts'],
    ['Trips', "ui.tripId=null;goPage('trips')", () => ui.page === 'trips'],
    ['IOUs', "goPage('ious')", () => ui.page === 'ious'],
    ['Contracts', "goPage('contracts')", () => ui.page === 'contracts'],
    ['Freelance', "goPage('freelance')", () => ui.page === 'freelance'],
    ['From Claude', "goPage('inbox')", () => ui.page === 'inbox', () => typeof inboxTabOn === 'function' && inboxTabOn()],
  ],
  wealth: [
    ['Net worth', "goWealthSection('assets')", () => ui.page === 'wealth' && ui.wealthTab !== 'liabilities'],
    ['Cash', "goPage('accounts')", () => ui.page === 'accounts'],
    ['Investments', "goPage('investments')", () => ['investments', 'investAccount', 'manual-prices', 'positions-import'].includes(ui.page)],
    ['Watchlist', "goPage('watchlist')", () => ui.page === 'watchlist'],
    ['Debts', "goWealthSection('liabilities')", () => ui.page === 'wealth' && ui.wealthTab === 'liabilities'],
  ],
  goals: [
    ['Goals', "goPlanSection('goals')", () => ui.page === 'goals' && !['emergency', 'future'].includes(ui.goalsTab)],
    ['Yearly bills', "goPage('yearly')", () => ui.page === 'yearly'],
    ['Future', "goPlanSection('future')", () => ui.page === 'goals' && ui.goalsTab === 'future'],
    ['Emergency', "goPlanSection('emergency')", () => ui.page === 'goals' && ui.goalsTab === 'emergency'],
    ['Patterns', "goPage('patterns')", () => ui.page === 'patterns'],
    ['Insights', "goPage('analysis')", () => ui.page === 'analysis'],
  ],
};
const sectionTabs = id => (SECTION_TABS[id] || []).filter(t => !t[3] || t[3]());
function sectionTabsHtml() {
  if (!newNavOn()) return '';
  const item = NEW_NAV.find(navItemActive);
  if (!item || !SECTION_TABS[item.id]) return '';
  return `<nav class="section-tabs" aria-label="${escHtml(item.label)}">${sectionTabs(item.id).map(([label, go, on]) => `<button class="${on() ? 'on' : ''}" onclick="${go}">${label}</button>`).join('')}</nav>`;
}
/* The side bar on a computer: every page, under its group. */
function navTreeHtml() {
  const top = (item, go, badge) => `<li><button class="nav-item ${navItemActive(item) ? 'active' : ''}" onclick="${go}"><span class="nav-icon">${ic(item.icon, 19)}${badge || ''}</span><span class="label">${item.label}</span></button></li>`;
  return `<ul class="nav-list nav-tree">
    ${top(NEW_NAV[0], "goPage('dashboard')")}
    ${NEW_NAV.filter(i => SECTION_TABS[i.id]).map(i => `<li class="nav-head">${i.label}</li>${sectionTabs(i.id).map(([label, go, on]) => `<li><button class="nav-item nav-sub ${on() ? 'active' : ''}" onclick="${go}"><span class="label">${label}</span></button></li>`).join('')}`).join('')}
    <li class="nav-end"></li>
    ${top(NEW_NAV[NEW_NAV.length - 1], settingsNavItemOnClick(), navSyncBadgeHtml())}
  </ul>`;
}
/* The phone's More sheet: the same map. */
function navMapHtml() {
  return `${NEW_NAV.filter(i => SECTION_TABS[i.id]).map(i => `<div class="eyebrow more-head">${ic(i.icon, 15)} ${i.label}</div>
    <div class="more-grid">${sectionTabs(i.id).map(([label, go, on]) => `<button class="more-tile ${on() ? 'active' : ''}" onclick="${go}">${label}</button>`).join('')}</div>`).join('')}`;
}
/* A redraw puts the scrolling bars back at their start: keep the side bar where you left it, and
   the section you're on in view. */
let navTreeTop = 0;
document.addEventListener('scroll', e => { if (e.target.classList && e.target.classList.contains('nav-tree')) navTreeTop = e.target.scrollTop; }, true);
function navAfterRender(app) {
  const tree = app.querySelector('.nav-tree'), tabs = app.querySelector('.section-tabs'), on = tabs && tabs.querySelector('button.on');
  if (tree) tree.scrollTop = navTreeTop;
  if (on) tabs.scrollLeft = on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2;
}
