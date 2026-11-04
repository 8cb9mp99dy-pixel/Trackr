/* ===================== Navigation =====================
 * Its own file. Pages are grouped in four tabs (the default since Oct 2026); Settings → Display
 * → "Classic navigation" brings back the old side bar with every page in it. Every page and every
 * goPage('…') id stays the same — only how they're grouped changes:
 *
 *   Home      Overview
 *   Money     Budget (Transactions · Totals · Recurring · Forecast · Budgets · Categories · Import) · Income plan · Freelance · Inbox (once Apple Pay or Claude is set up, with the count waiting)
 *             (Receipts, Trips, IOUs and Contracts were removed at the user's request, 2 Nov 2026: don't bring them back)
 *   Wealth    Overview · Cash (the old Accounts page) · Pockets (pockets.js) · Investments (+ each account) · Watchlist · Debts
 *   Plan      Goals · Yearly bills · Emergency · Insights (the old Analysis page)
 *             (Patterns was removed at the user's request, 3 Nov 2026: don't bring it back)
 *   Settings
 *
 * On a computer the side bar stays short: Home, the three groups with their icons, Settings. The
 * group you're in opens under its name to show its pages, the others stay closed (the user asked
 * for this on 31 Oct 2026: not a long flat list), and there are no section tabs. On a tablet and a phone: the four tabs (+ Settings or More), the
 * section tabs at the top, and More shows every page. The Trading page was removed at the user's
 * request (31 Oct 2026): don't bring it back. data.trades stays in the data and backups.
 *
 * Pages grouped under one tab get a row of section tabs at the top. (The old `newNav` setting
 * from the beta is kept in the data but no longer read.)
 */
const NEW_NAV = [
  { id: 'dashboard', label: 'Home', icon: 'home', phone: true, pages: ['dashboard'] },
  { id: 'budget', label: 'Money', icon: 'receipt', phone: true, pages: ['budget', 'income', 'freelance', 'inbox'] },
  { id: 'wealth', label: 'Wealth', icon: 'pie', phone: true, pages: ['wealth', 'accounts', 'pockets', 'investments', 'investAccount', 'manual-prices', 'positions-import', 'watchlist'] },
  { id: 'goals', label: 'Plan', icon: 'target', phone: true, pages: ['goals', 'yearly', 'analysis'] },
  { id: 'settings', label: 'Settings', icon: 'settings', pages: ['settings'] },
];
function newNavOn() { return !(typeof data !== 'undefined' && data && data.settings && data.settings.classicNav); }
function currentNavItems() { return newNavOn() ? NEW_NAV : NAV_ITEMS; }
function navItemActive(item) {
  if (newNavOn()) return (item.pages || [item.id]).includes(ui.page);
  return ui.page === item.id || (item.id === 'investments' && ['investAccount', 'watchlist'].includes(ui.page)) || (item.id === 'budget' && ui.page === 'inbox') || (item.id === 'accounts' && ui.page === 'pockets') || (item.id === 'goals' && ui.page === 'yearly');
}
function goWealthSection(tab) { ui.wealthTab = tab === 'liabilities' ? 'liabilities' : 'assets'; goPage('wealth'); }
function goPlanSection(tab) { ui.goalsTab = tab === 'emergency' ? tab : 'goals'; goPage('goals'); }
const SECTION_TABS = {
  budget: [
    ['Budget', "goPage('budget')", () => ui.page === 'budget'],
    ['Income plan', "goPage('income')", () => ui.page === 'income'],
    ['Freelance', "goPage('freelance')", () => ui.page === 'freelance'],
    ['Inbox', "goPage('inbox')", () => ui.page === 'inbox', () => typeof inboxTabOn === 'function' && inboxTabOn(), () => (typeof inboxCount === 'function' ? inboxCount() : 0)],
  ],
  wealth: [
    ['Net worth', "goWealthSection('assets')", () => ui.page === 'wealth' && ui.wealthTab !== 'liabilities'],
    ['Cash', "goPage('accounts')", () => ui.page === 'accounts'],
    ['Pockets', "goPockets()", () => ui.page === 'pockets'],
    ['Investments', "goPage('investments')", () => ['investments', 'investAccount', 'manual-prices', 'positions-import'].includes(ui.page)],
    ['Watchlist', "goPage('watchlist')", () => ui.page === 'watchlist'],
    ['Debts', "goWealthSection('liabilities')", () => ui.page === 'wealth' && ui.wealthTab === 'liabilities'],
  ],
  goals: [
    ['Goals', "goPlanSection('goals')", () => ui.page === 'goals' && ui.goalsTab !== 'emergency'],
    ['Yearly bills', "goPage('yearly')", () => ui.page === 'yearly'],
    ['Emergency', "goPlanSection('emergency')", () => ui.page === 'goals' && ui.goalsTab === 'emergency'],
    ['Insights', "goPage('analysis')", () => ui.page === 'analysis'],
  ],
};
const sectionTabs = id => (SECTION_TABS[id] || []).filter(t => !t[3] || t[3]());
/* How many wait on a page (the Inbox), as a small number after its name; on Money's icon too. */
const navCount = n => (n > 0 ? `<span class="nav-count" aria-label="${n} waiting">${n > 99 ? '99+' : n}</span>` : '');
const tabCount = t => navCount(t[4] ? t[4]() : 0);
function navGroupCountHtml(id) { return id === 'budget' && typeof inboxCount === 'function' ? navCount(inboxCount()) : ''; }
function sectionTabsHtml() {
  if (!newNavOn()) return '';
  const item = NEW_NAV.find(navItemActive);
  if (!item || !SECTION_TABS[item.id]) return '';
  return `<nav class="section-tabs" aria-label="${escHtml(item.label)}">${sectionTabs(item.id).map(t => `<button class="${t[2]() ? 'on' : ''}" onclick="${t[1]}">${t[0]}${tabCount(t)}</button>`).join('')}</nav>`;
}
/* The side bar on a computer: the groups, with the pages of the one you're in under it. A group's
   name opens its first page. */
function navTreeHtml() {
  const top = (item, go, badge) => `<li><button class="nav-item ${navItemActive(item) ? 'active' : ''}" onclick="${go}"><span class="nav-icon">${ic(item.icon, 19)}${badge || ''}</span><span class="label">${item.label}</span></button></li>`;
  const group = item => {
    const open = navItemActive(item), tabs = sectionTabs(item.id);
    return `<li><button class="nav-item nav-group ${open ? 'open' : ''}" aria-expanded="${open}" onclick="${tabs[0][1]}"><span class="nav-icon">${ic(item.icon, 19)}${open ? '' : navGroupCountHtml(item.id)}</span><span class="label">${item.label}</span><span class="nav-chev">${ic('chevronRight', 14)}</span></button>
      ${open ? `<ul class="nav-subs">${tabs.map(t => `<li><button class="nav-item nav-sub ${t[2]() ? 'active' : ''}" onclick="${t[1]}"><span class="label">${t[0]}</span>${tabCount(t)}</button></li>`).join('')}</ul>` : ''}</li>`;
  };
  return `<ul class="nav-list nav-tree">
    ${top(NEW_NAV[0], "goPage('dashboard')")}
    ${NEW_NAV.filter(i => SECTION_TABS[i.id]).map(group).join('')}
    <li class="nav-end"></li>
    ${top(NEW_NAV[NEW_NAV.length - 1], settingsNavItemOnClick(), navSyncBadgeHtml())}
  </ul>`;
}
/* The phone's More sheet: the same map. */
function navMapHtml() {
  return `${NEW_NAV.filter(i => SECTION_TABS[i.id]).map(i => `<div class="eyebrow more-head">${ic(i.icon, 15)} ${i.label}</div>
    <div class="more-grid">${sectionTabs(i.id).map(t => `<button class="more-tile ${t[2]() ? 'active' : ''}" onclick="${t[1]}">${t[0]}${tabCount(t)}</button>`).join('')}</div>`).join('')}`;
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
