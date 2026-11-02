/* Tap a figure, see what's behind it: In and Out in Budget, the totals, a day on the calendar or
   the heatmap, a weekday, a price change, a category, the balances on Accounts. The list opens in
   one window, each row opens its transaction, and "Edit all" takes them to Budget's bulk edit.
   tapAfterRender makes every tappable thing work from the keyboard too. */

/* The transactions a figure stands for. f: { from, to, types, categoryId, subCategoryId, weekday, dayToDay }
 * weekday: 0 = Monday. dayToDay leaves out bills and other recurring payments, like Patterns. */
function drillFilter(txs, f) {
  return (txs || []).filter(t => {
    if (f.types && !f.types.includes(t.type)) return false;
    if (!t.date || (f.from && t.date < f.from) || (f.to && t.date > f.to)) return false;
    if (f.categoryId !== undefined && (t.categoryId || null) !== f.categoryId) return false;
    if (f.subCategoryId !== undefined && (t.subCategoryId || null) !== f.subCategoryId) return false;
    if (f.dayToDay && (t.recurringId || t.nature === 'Fixed' || t.auto)) return false;
    if (f.weekday !== undefined) {
      const [y, m, d] = t.date.split('-').map(Number);
      if ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 !== f.weekday) return false;
    }
    return true;
  });
}
/* Keyboard stops for what's tapped: not the real controls, nor what opts out. */
function tapTarget(tag, classes, attrs) {
  if (/^(button|a|input|select|textarea|label|summary|option)$/i.test(tag)) return false;
  return !/(^|\s)modal-backdrop(\s|$)/.test(classes || '') && !attrs.includes('tabindex') && !attrs.includes('data-plain');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { drillFilter, tapTarget };
} else {
  const LIST_MAX = 300;
  const show = (title, list, opts) => { ui.modal = { type: 'drill', payload: Object.assign({ title, ids: list.map(t => t.id) }, opts) }; render(); };
  const all = () => data.budgetTransactions;
  const month = () => monthLabel(ui.budgetMonth);
  const heldBack = t => t.nature === 'Fixed' && t.date > todayYmd(); // Totals doesn't count what's still to come
  const dayName = d => ymdToDate(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  window.__modalRenderers.drill = function (p) {
    const list = (p.ids || []).map(id => all().find(t => t.id === id)).filter(Boolean).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const groups = groupTransactionsByDay(list.slice(0, LIST_MAX));
    const n = list.length;
    return `
      <div class="modal-head"><div class="modal-title">${escHtml(p.title)}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      ${p.total != null ? `<div class="big-number drill-total ${p.tone || ''}">${fmtMoney(p.total)}</div>` : ''}
      <div class="dim drill-sub">${[p.sub, p.ids ? `${n} transaction${n === 1 ? '' : 's'}` : ''].filter(Boolean).map(escHtml).join(' · ')}</div>
      ${(p.rows || []).length ? `<div class="drill-rows">${p.rows.map(r => `<div class="row-flex" ${r.tap ? `onclick="${r.tap}" style="cursor:pointer;"` : ''}><span>${escHtml(r.label)}${r.sub ? ` <span class="dim">${escHtml(r.sub)}</span>` : ''}</span><b>${r.money}</b></div>`).join('')}</div>` : ''}
      ${groups.map(g => dayGroupHtml(g)).join('')}
      ${n > LIST_MAX ? `<div class="dim" style="margin-top:12px;">The newest ${LIST_MAX} are shown.</div>` : ''}
      ${n > 1 ? `<div class="modal-actions"><button class="btn" onclick="drillEditAll()">Edit all ${n}</button></div>` : ''}`;
  };
  window.drillEditAll = function () {
    const ids = {}; ui.modal.payload.ids.forEach(id => { ids[id] = true; });
    ui.txSelect = { ids };
    bulkOpen();
  };

  /* Budget → Transactions: the four figures of the month. */
  window.drillMonth = function (kind) {
    const m = ui.budgetMonth, txs = monthTransactions(m), inc = monthIncome(m), out = monthExpenses(m), sub = month();
    if (kind === 'in') show('In', txs.filter(t => t.type === 'income'), { total: inc, tone: 'positive', sub });
    if (kind === 'out') show('Out', txs.filter(t => t.type === 'expense'), { total: out, tone: 'negative', sub });
    if (kind === 'net') show('Balance', txs.filter(t => t.type !== 'transfer'), { total: inc - out, tone: inc >= out ? 'positive' : 'negative', sub });
    if (kind === 'invested') show('Invested', txs.filter(t => (t.type === 'transfer' && isInvestingEndpoint(t.to) !== isInvestingEndpoint(t.from)) || (t.type === 'expense' && INVESTED_SUBCATEGORY_IDS.includes(t.subCategoryId))), { total: monthInvested(m).net, sub });
  };
  /* Budget → Totals, for the period chosen there. */
  window.drillTotals = function (kind) {
    const r = budgetTotalsRange(), types = kind === 'in' ? ['income'] : kind === 'out' ? ['expense'] : ['income', 'expense'];
    const inc = budgetTotalsData('income').total, out = budgetTotalsData('expense').total, total = kind === 'in' ? inc : kind === 'out' ? out : inc - out;
    show({ in: 'Received', out: 'Spent', net: 'Left over' }[kind], drillFilter(all(), { types, from: r.from, to: r.to }).filter(t => !heldBack(t)), { total, tone: total >= 0 && kind !== 'out' ? 'positive' : 'negative', sub: r.label });
  };
  /* A category, or one of its sub-categories ('_none' for what has none), in that same period. */
  window.drillCategory = function (kind, categoryId, subId) {
    const r = budgetTotalsRange(), cat = categoryById(kind, categoryId);
    const f = { types: [kind], from: r.from, to: r.to, categoryId: cat ? cat.id : undefined };
    if (subId && subId !== '_none') f.subCategoryId = subId;
    let list = drillFilter(all(), f).filter(t => !heldBack(t));
    if (!cat) list = list.filter(t => !categoryById(kind, t.categoryId));
    if (subId === '_none') list = list.filter(t => !((cat && cat.subcategories) || []).some(s => s.id === t.subCategoryId));
    const sub = subId && subId !== '_none' ? ((cat.subcategories || []).find(s => s.id === subId) || {}).name : '';
    show(sub ? `${cat.name} · ${sub}` : cat ? cat.name : 'Uncategorized', list, { total: list.reduce((s, t) => s + toEUR(t.amount, t.currency), 0), tone: kind === 'income' ? 'positive' : 'negative', sub: r.label });
  };

  /* Budget → Recurring: what a monthly figure is made of. */
  window.drillFixed = function (type) {
    const series = activeRecurringSeries().filter(x => x.model.type === type);
    show({ income: 'Fixed income', expense: 'Fixed expenses', transfer: 'Moved' }[type], series.map(x => x.model), { total: series.reduce((s, x) => s + toEUR(x.perMonth, x.model.currency), 0), sub: 'Per month' });
  };
  window.drillRecurringState = function (state, ym, label) {
    show(label, activeRecurringSeries().filter(x => recurringMonthState(x, ym).state === state).map(x => x.model), { sub: monthLabel(ymdToDate(ym + '-01')) });
  };
  /* A day on the recurring calendar: what's logged, and what's due or spotted that day. */
  window.drillCalendarDay = function (date) {
    const day = +date.slice(8, 10), logged = all().filter(t => t.date === date);
    const due = recurringForMonth(ymdToDate(date)).filter(it => it.day === day && !logged.some(t => t.recurringId && t.recurringId === it.model.recurringId));
    show(dayName(date), logged, { rows: due.map(it => ({ label: it.name || it.model.comment || 'Recurring', sub: it.kind === 'detected' ? 'spotted in your history' : 'due', money: fmtMoney(it.kind === 'detected' ? it.avg : it.model.amount, it.kind === 'detected' ? undefined : it.model.currency), tap: `openTxForm('${it.model.id}')` })) });
  };

  /* Patterns: same selection as the heatmap (day-to-day spending only). */
  window.drillSpendDay = function (date) {
    const list = drillFilter(all(), { types: ['expense'], from: date, to: date, dayToDay: true });
    show(dayName(date), list, { total: list.reduce((s, t) => s + toEUR(t.amount, t.currency), 0), tone: 'negative', sub: 'Day-to-day spending' });
  };
  window.drillHeat = function (e) { const d = e.target && e.target.dataset && e.target.dataset.d; if (d) drillSpendDay(d); };
  window.drillWeekday = function (weekday, from, name) {
    const list = drillFilter(all(), { types: ['expense'], from, to: todayYmd(), weekday, dayToDay: true });
    show(`${name}s`, list, { total: list.reduce((s, t) => s + toEUR(t.amount, t.currency), 0), tone: 'negative', sub: 'All your day-to-day spending on this weekday' });
  };
  window.drillName = function (name) {
    const k = txNameKey(name);
    show(name, all().filter(t => txNameKey(t.comment) === k), { sub: 'Every time' });
  };
  window.drillCategoryName = function (name) {
    const label = t => { const c = categoryById('expense', t.categoryId); return c ? c.name : 'Other'; };
    const list = drillFilter(all(), { types: ['expense'], from: dateToYmd(new Date(appToday().getTime() - 730 * 864e5)), to: todayYmd() }).filter(t => label(t) === name);
    show(name, list, { sub: 'Last 24 months' });
  };



  /* Accounts: which accounts or pockets make up the figure. */
  window.drillBalances = function (kind) {
    const accs = data.accounts.filter(a => a.visibleInTotals !== false);
    const rows = kind === 'main'
      ? accs.map(a => ({ label: a.name, money: fmtMoney(a.balance, a.currency), tap: `openAccountForm('${a.id}')` }))
      : accs.flatMap(a => (a.pockets || []).map(p => ({ label: p.name, sub: a.name, money: fmtMoney(p.amountSaved, a.currency), tap: `openPocketForm('${a.id}','${p.id}')` })));
    ui.modal = { type: 'drill', payload: { title: kind === 'main' ? 'Main balances' : 'In pockets', rows, sub: rows.length ? 'Tap one to open it' : 'Nothing here yet' } };
    render();
  };

  window.drillScroll = function (selector) {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  /* Tappable rows and tiles are <div onclick>: they get a keyboard stop, and Enter or Space taps them. */
  window.tapAfterRender = function (root) {
    root.querySelectorAll('[onclick]').forEach(el => {
      if (el.hasAttribute('data-tap') || !tapTarget(el.tagName, el.getAttribute('class'), el.getAttributeNames())) return;
      el.setAttribute('data-tap', '');
      el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role') && !el.querySelector('button, a, input, select, textarea, [tabindex], [onclick]')) el.setAttribute('role', 'button');
    });
  };
  document.addEventListener('keydown', e => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.hasAttribute || !e.target.hasAttribute('data-tap')) return;
    e.preventDefault();
    e.target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}
