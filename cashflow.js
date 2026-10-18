/* ===================== Budget: cashflow, recurring calendar, detected repeats =====================
 * Its own file, loaded after app.js (shares its globals: budgetTotalsRange, categoryById,
 * activeRecurringSeries, recurringOccurrences, attachToRecurringSeries, runRecurring,
 * txAvatarHtml, txNameKey, isInvestingEndpoint, svgDonut…).
 *
 * 1. Cashflow diagram (Budget → Totals): where the money of the period came from (income
 *    categories, left) and where it went (spending categories, money sent to brokers/exchanges,
 *    and what's left over, right). Trackr doesn't know which euro paid for what, so each source
 *    feeds each destination in proportion — like any cashflow chart. Tap a destination to see
 *    its sub-categories in the donut next to it. Filters: sub-categories, one account. Export to
 *    CSV, full screen.
 * 2. Recurring (Budget → Recurring): a calendar of the month with each recurring payment on its
 *    day (or the list), and the expense scanner: payments seen in at least 3 different months at
 *    a similar amount that aren't recurring items yet — one tap makes them one.
 */

/* ---- 1. Cashflow ---- */
function cashflowTxs() {
  const r = budgetTotalsRange(), today = todayYmd(), acc = ui.cfAccount || '';
  return data.budgetTransactions.filter(t => t.date >= r.from && t.date <= r.to && !(t.nature === 'Fixed' && t.date > today)
    && (!acc || t.accountId === acc || t.from === 'acc:' + acc || t.to === 'acc:' + acc));
}
function cashflowModel() {
  const subs = !!ui.cfSubs;
  const left = {}, right = {};
  const node = (map, key, label, icon, color) => (map[key] = map[key] || { key, label, icon, color, value: 0, count: 0, subs: {} });
  let invested = 0;
  cashflowTxs().forEach(t => {
    const eur = toEUR(t.amount, t.currency);
    if (t.type === 'transfer') {
      const toInv = isInvestingEndpoint(t.to), fromInv = isInvestingEndpoint(t.from);
      if (toInv && !fromInv) invested += eur; else if (fromInv && !toInv) invested -= eur;
      return;
    }
    const kind = t.type === 'income' ? 'income' : 'expense';
    const cat = categoryById(kind, t.categoryId);
    const sub = cat ? (cat.subcategories || []).find(s => s.id === t.subCategoryId) : null;
    const useSub = subs && sub;
    const key = (useSub ? 'sub:' + sub.id : 'cat:' + (cat ? cat.id : '_none'));
    const label = useSub ? `${cat.name} · ${sub.name}` : (cat ? cat.name : 'Uncategorized');
    const n = node(kind === 'income' ? left : right, kind + ':' + key, label, (useSub ? sub.icon : cat && cat.icon) || '', hashColor(cat ? cat.name : 'Uncategorized'));
    n.value += eur; n.count++;
    n.catId = cat ? cat.id : '_none';
    const sk = sub ? sub.id : '_none';
    const sc = n.subs[sk] || (n.subs[sk] = { label: sub ? sub.name : 'No sub-category', icon: sub ? sub.icon : '', value: 0, count: 0 });
    sc.value += eur; sc.count++;
  });
  const L = Object.values(left).sort((a, b) => b.value - a.value);
  const R = Object.values(right).sort((a, b) => b.value - a.value);
  const income = L.reduce((s, n) => s + n.value, 0), spent = R.reduce((s, n) => s + n.value, 0);
  if (invested > 0.005) R.push({ key: 'invested', label: 'Invested', icon: '📈', color: 'var(--accent-1)', value: invested, count: 0, subs: {}, special: true });
  const leftover = income - spent - Math.max(0, invested);
  if (leftover > 0.005) R.push({ key: 'saved', label: 'Left over', icon: '🏦', color: '#22A39F', value: leftover, count: 0, subs: {}, special: true });
  else if (leftover < -0.005) L.push({ key: 'savings', label: 'From your savings', icon: '🏦', color: '#9AA3B5', value: -leftover, count: 0, subs: {}, special: true });
  return { L, R, income, spent, invested, leftover };
}
/* Three columns, so nothing crosses: each income flows into one "Income" bar in the middle,
   which then splits into where the money went (spending categories, Invested, Left over). With
   many spending categories the smallest are grouped into "Other categories" (tap it to see them
   in the donut), so every label stays readable. */
const SANKEY_MAX_RIGHT = 8;
function sankeyRight(M) {
  const spend = M.R.filter(n => !n.special), special = M.R.filter(n => n.special);
  if (spend.length <= SANKEY_MAX_RIGHT) return M.R;
  const keep = spend.slice(0, SANKEY_MAX_RIGHT - 1), rest = spend.slice(SANKEY_MAX_RIGHT - 1);
  const other = { key: 'grouped', label: `Other categories (${rest.length})`, icon: '', color: '#A9B0BF', value: 0, count: 0, subs: {}, grouped: true };
  rest.forEach(n => { other.value += n.value; other.count += n.count; other.subs[n.key] = { label: n.label, icon: n.icon, value: n.value, count: n.count }; });
  return keep.concat([other], special);
}
function sankeyHtml(M, opts) {
  opts = opts || {};
  const R = sankeyRight(M);
  const total = Math.max(M.L.reduce((s, n) => s + n.value, 0), R.reduce((s, n) => s + n.value, 0));
  if (!total) return '';
  const rows = Math.max(M.L.length, R.length);
  const H = opts.h || Math.max(260, rows * 46 + 20), gap = 10, pad = 6, minH = 24;
  // Every bar gets at least minH px so its label stays readable; the rest is shared in proportion.
  const layout = list => {
    const usable = H - pad * 2 - gap * Math.max(0, list.length - 1) - minH * list.length;
    const sum = list.reduce((s, n) => s + n.value, 0) || 1;
    let y = pad;
    return list.map(n => { const h = minH + Math.max(0, usable) * n.value / sum; const o = { n, y, h }; y += h + gap; return o; });
  };
  const Lp = layout(M.L), Rp = layout(R);
  const sel = ui.cfSel;
  // The middle bar: one block, as tall as the space; bands join and leave it stacked in order.
  const midY = pad, midH = H - pad * 2, X0 = 12, XM0 = 494, XM1 = 506, X1 = 988;
  const band = (xa, ya, ha, xb, yb, hb, color, on) => {
    const c = (xa + xb) / 2;
    return `<path d="M${xa},${ya} C${c},${ya} ${c},${yb} ${xb},${yb} L${xb},${yb + hb} C${c},${yb + hb} ${c},${ya + ha} ${xa},${ya + ha} Z" fill="${color}" fill-opacity="${on ? 0.3 : 0.08}"/>`;
  };
  const sumL = M.L.reduce((s, n) => s + n.value, 0) || 1, sumR = R.reduce((s, n) => s + n.value, 0) || 1;
  let mIn = midY, mOut = midY;
  const inBands = Lp.map(p => { const hm = midH * p.n.value / sumL, b = band(X0, p.y, p.h, XM0, mIn, hm, p.n.color, !sel || sel === p.n.key); mIn += hm; return b; });
  const outBands = Rp.map(p => { const hm = midH * p.n.value / sumR, b = band(XM1, mOut, hm, X1, p.y, p.h, p.n.color, !sel || sel === p.n.key); mOut += hm; return b; });
  const label = (p, side) => `<button class="sk-label ${side} ${sel === p.n.key ? 'on' : ''}" style="top:${(p.y + p.h / 2).toFixed(1)}px;" onclick="setCashflowSel('${p.n.key}')" title="${escHtml(p.n.label)}"><span class="sk-name">${escHtml(p.n.label)}</span><span class="sk-val">${fmtMoney(p.n.value)}</span></button>`;
  const income = M.L.filter(n => !n.special).reduce((s, n) => s + n.value, 0);
  return `
    <div class="sankey" style="height:${H}px;">
      <svg width="100%" height="${H}" viewBox="0 0 1000 ${H}" preserveAspectRatio="none" aria-hidden="true">
        ${inBands.join('')}${outBands.join('')}
        ${Lp.map(p => `<rect x="0" y="${p.y}" width="12" height="${p.h}" rx="2" fill="${p.n.color}" opacity="${!sel || sel === p.n.key ? 1 : 0.35}"/>`).join('')}
        <rect x="${XM0}" y="${midY}" width="${XM1 - XM0}" height="${midH}" rx="2" fill="var(--accent-1)"/>
        ${Rp.map(p => `<rect x="988" y="${p.y}" width="12" height="${p.h}" rx="2" fill="${p.n.color}" opacity="${!sel || sel === p.n.key ? 1 : 0.35}"/>`).join('')}
      </svg>
      ${Lp.map(p => label(p, 'left')).join('')}
      <div class="sk-label mid" style="top:${(midY + midH / 2).toFixed(1)}px;"><span class="sk-name">Income</span><span class="sk-val">${fmtMoney(income)}</span></div>
      ${Rp.map(p => label(p, 'right')).join('')}
    </div>`;
}
function setCashflowSel(key) { ui.cfSel = ui.cfSel === key ? null : key; if (ui.modal && ui.modal.type === 'cashflowFull') { render(); return; } render(); }
function cashflowControlsHtml() {
  const accounts = data.accounts || [];
  return `
    <div class="cf-controls">
      <label class="switch-row"><button class="toggle ${ui.cfSubs ? 'on' : ''}" onclick="ui.cfSubs=!ui.cfSubs;ui.cfSel=null;render()" aria-label="Sub-categories"></button><span>Sub-categories</span></label>
      ${accounts.length ? `<select class="mini-select" onchange="ui.cfAccount=this.value;ui.cfSel=null;render()" aria-label="Account"><option value="">All accounts</option>${accounts.map(a => `<option value="${a.id}" ${ui.cfAccount === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select>` : ''}
      <button class="tb-btn" style="width:34px;height:34px;" title="Export as CSV" onclick="exportCashflowCsv()">${ic('download', 16)}</button>
      <button class="tb-btn" style="width:34px;height:34px;" title="Full screen" onclick="ui.modal={type:'cashflowFull'};render()">${ic('maximize', 16)}</button>
    </div>`;
}
function cashflowDonutHtml(M) {
  const node = ui.cfSel ? M.L.concat(sankeyRight(M)).find(n => n.key === ui.cfSel) : null;
  const spendNodes = M.R.filter(n => !n.special);
  let segs, title, total, count;
  if (node && !node.special) {
    segs = Object.values(node.subs).sort((a, b) => b.value - a.value).map(s => ({ label: s.label, value: s.value, color: hashColor(s.label + node.label), icon: s.icon, count: s.count }));
    title = node.label; total = node.value; count = node.count;
  } else {
    segs = spendNodes.map(n => ({ label: n.label, value: n.value, color: n.color, icon: n.icon, count: n.count }));
    title = node ? node.label : 'Total spent'; total = node ? node.value : M.spent; count = spendNodes.reduce((s, n) => s + n.count, 0);
  }
  const base = M.spent || 1;
  return `
    <div class="cf-donut">
      <div class="donut-wrap" style="width:150px;height:150px;">${svgDonut(segs.length ? segs : [{ value: 1, color: 'var(--dark-card-2)' }], { size: 150, stroke: 20 })}
        <div class="donut-center"><b>${node && M.L.includes(node) ? '+' : '−'}${fmtMoney(total)}</b><span>${escHtml(title)}</span></div></div>
      <div class="cf-donut-facts">
        ${count ? `<div>${count} transaction${count === 1 ? '' : 's'}${node && !node.special && (M.R.includes(node) || node.grouped) ? ` · ${(node.value / base * 100).toFixed(1)}% of spending` : ''}</div>` : ''}
        ${segs.slice(0, 6).map(s => `<div class="donut-legend-row"><span class="donut-swatch" style="background:${s.color};"></span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.icon || ''} ${escHtml(s.label)}</span><b style="margin-left:auto;">${fmtMoney(s.value)}</b></div>`).join('')}
        ${node ? `<button class="link-btn" onclick="setCashflowSel('${node.key}')">Show everything</button>` : '<div class="dim">Tap a category in the chart to see its details.</div>'}
      </div>
    </div>`;
}
function cashflowCardHtml() {
  const M = cashflowModel();
  const has = M.L.length || M.R.length;
  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="row-flex" style="gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <div><div class="eyebrow">Cashflow</div><div style="font-size:12.5px;opacity:.6;">${escHtml(budgetTotalsRange().label)}</div></div>
        ${has ? cashflowControlsHtml() : ''}
      </div>
      ${has ? `<div class="cf-body">${sankeyHtml(M)}${cashflowDonutHtml(M)}</div>
        <div style="font-size:11.5px;opacity:.5;margin-top:8px;">Transfers between your own accounts aren't counted. Money sent to a broker or exchange counts as Invested.</div>`
        : `<div class="empty-state" style="padding:24px 10px;"><div class="title">No data yet</div><div class="sub">Log income and expenses for this period to see where your money goes.</div><button class="btn primary" style="margin-top:12px;" onclick="openTxForm()">${ic('plus', 15)} Add a transaction</button></div>`}
    </div>`;
}
window.__modalRenderers.cashflowFull = function () {
  const M = cashflowModel();
  return `
    <div class="modal-head"><div class="modal-title">Cashflow · ${escHtml(budgetTotalsRange().label)}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    ${cashflowControlsHtml().replace(/<button class="tb-btn"[^>]*title="Full screen"[^>]*>[\s\S]*?<\/button>/, '')}
    <div style="margin-top:12px;">${sankeyHtml(M, { h: Math.max(420, Math.max(M.L.length, M.R.length) * 54) }) || '<div class="dim">Nothing in this period.</div>'}</div>
    ${cashflowDonutHtml(M)}`;
};
function exportCashflowCsv() {
  const M = cashflowModel();
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['From', 'To', 'Amount (EUR)'].map(q).join(',')];
  M.L.forEach(l => lines.push([q(l.label), q('Income'), l.value.toFixed(2)].join(',')));
  M.R.forEach(r => lines.push([q('Income'), q(r.label), r.value.toFixed(2)].join(',')));
  lines.push('', [q('Category'), q('Side'), q('Total (EUR)'), q('Transactions')].join(','));
  M.L.forEach(n => lines.push([q(n.label), q('In'), n.value.toFixed(2), n.count].join(',')));
  M.R.forEach(n => lines.push([q(n.label), q('Out'), n.value.toFixed(2), n.count].join(',')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `trackr-cashflow-${budgetTotalsRange().label.replace(/[^\w-]+/g, '-')}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* Totals tab: Outflows / Inflows / Recurring, one at a time. */
function budgetTotalsTabsHtml() {
  const t = ui.totalsTab || 'expense';
  const inc = budgetTotalsData('income').total, exp = budgetTotalsData('expense').total;
  const rec = activeRecurringSeries().filter(x => x.model.type === 'expense').reduce((s, x) => s + toEUR(x.model.amount, x.model.currency), 0);
  const tab = (k, label, v, cls) => `<button class="tot-tab ${t === k ? 'on' : ''}" onclick="ui.totalsTab='${k}';render()"><span>${label}</span><b class="${cls}">${v}</b></button>`;
  return `
    <div class="tot-tabs">
      ${tab('expense', 'Outflows', '−' + fmtMoney(exp), 'negative')}
      ${tab('income', 'Inflows', '+' + fmtMoney(inc), 'positive')}
      ${tab('recurring', 'Recurring / month', '−' + fmtMoney(rec), '')}
      <div class="tot-actions">
        ${typeof budgetLimitsOn !== 'function' || budgetLimitsOn() ? `<button class="tb-btn" style="width:36px;height:36px;" title="Budget targets per category" onclick="setBudgetTab('budgets')">${ic('target', 17)}</button>` : ''}
        <button class="tb-btn" style="width:36px;height:36px;" title="Add a transaction" onclick="openTxForm()">${ic('plus', 17)}</button>
      </div>
    </div>
    ${t === 'recurring' ? recurringTotalsHtml() : budgetTotalsSectionHtml(t)}`;
}
function recurringTotalsHtml() {
  const series = activeRecurringSeries().filter(x => x.model.type === 'expense');
  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="eyebrow" style="margin-bottom:12px;">Recurring expenses</div>
      ${series.length ? `<div class="stack-gap-12">${series.map(({ model, st, next }) => `<div class="row-flex" style="gap:10px;">
        <div style="display:flex;gap:10px;align-items:center;min-width:0;">${txAvatarHtml(model)}<div class="nm"><div class="nm-1">${escHtml(model.comment || (categoryById('expense', model.categoryId) || {}).name || 'Recurring')}</div><div class="nm-2">Every month on the ${ordinalDay(st.day)} · next ${shortDay(next)}</div></div></div>
        <b class="negative">−${fmtMoney(model.amount, model.currency)}</b></div>`).join('')}</div>` : '<div class="dim">No recurring expenses yet — see Budget → Recurring.</div>'}
      <button class="link-btn" style="margin-top:12px;" onclick="setBudgetTab('recurring')">Calendar and detected payments ${ic('chevronRight', 14)}</button>
    </div>`;
}
/* "€x left under target" on a spending category, for the period (monthly target × months). */
function categoryTargetNote(catId, spent, months) {
  if (typeof budgetLimitsOn === 'function' && !budgetLimitsOn()) return '';
  const limit = parseFloat(budgetLimits()[catId]);
  if (!(limit > 0)) return '';
  const target = limit * (months || 1), left = target - spent;
  return left >= 0 ? `<span class="target-note ok">${fmtMoney(left)} left under the target</span>` : `<span class="target-note over">${fmtMoney(-left)} over the target</span>`;
}

/* ---- 2. Recurring: calendar + scanner ---- */
function recurringForMonth(monthDate) {
  const y = monthDate.getFullYear(), m = monthDate.getMonth(), last = new Date(y, m + 1, 0).getDate();
  const out = [];
  activeRecurringSeries().forEach(x => out.push({ day: Math.min(x.st.day, last), model: x.model, kind: 'series' }));
  detectRecurring().forEach(d => out.push({ day: Math.min(d.day, last), model: d.model, kind: 'detected', name: d.name, avg: d.avg }));
  return out;
}
function recurringCalendarHtml() {
  const m = ui.budgetMonth, y = m.getFullYear(), mo = m.getMonth();
  const first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const items = recurringForMonth(m);
  const today = appToday(), isThis = today.getFullYear() === y && today.getMonth() === mo;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell empty"></div>');
  for (let d = 1; d <= days; d++) {
    const here = items.filter(it => it.day === d);
    cells.push(`<div class="cal-cell ${isThis && today.getDate() === d ? 'today' : ''}"><span class="cal-d">${d}</span><div class="cal-marks">${here.slice(0, 3).map(it => `<span class="cal-mark ${it.kind}" title="${escHtml((it.model.comment || it.name || '') + ' · ' + (it.kind === 'detected' ? 'detected, not recurring yet' : 'recurring'))}">${txAvatarHtml(it.model)}</span>`).join('')}${here.length > 3 ? `<span class="cal-more">+${here.length - 3}</span>` : ''}</div></div>`);
  }
  return `
    <div class="cal">
      <div class="cal-head">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
    </div>
    <div style="font-size:11.5px;opacity:.55;margin-top:8px;">Solid: your recurring items. Dashed: detected in your history, not recurring yet.</div>`;
}
/* Payments seen in at least 3 different months (last 6) at a similar amount (within 25 % of the
   usual one), under the same name, that aren't recurring items yet and that you didn't dismiss. */
function detectRecurring() {
  const from = dateToYmd(new Date(appToday().getFullYear(), appToday().getMonth() - 6, 1));
  const ignored = (data.settings && data.settings.recurringIgnored) || [];
  const active = new Set(activeRecurringSeries().map(x => x.id));
  const by = {};
  data.budgetTransactions.forEach(t => {
    if (t.type !== 'expense' || !t.comment || t.recurringId || t.date < from) return;
    const k = txNameKey(t.comment);
    if (!k || ignored.includes(k) || active.has('rs_expense_' + k)) return;
    (by[k] = by[k] || []).push(t);
  });
  return Object.keys(by).map(k => {
    const list = by[k].sort((a, b) => (a.date < b.date ? -1 : 1));
    const months = new Set(list.map(t => ymOf(t.date)));
    if (months.size < 3) return null;
    const amounts = list.map(t => toEUR(t.amount, t.currency)).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    if (!amounts.every(a => Math.abs(a - median) <= median * 0.25)) return null;
    const daysOf = list.map(t => +t.date.slice(8, 10)).sort((a, b) => a - b);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    return { key: k, name: list[list.length - 1].comment, model: list[list.length - 1], months: months.size, avg, day: daysOf[Math.floor(daysOf.length / 2)] };
  }).filter(Boolean).sort((a, b) => b.avg - a.avg);
}
function makeRecurringFromDetected(key) {
  const d = detectRecurring().find(x => x.key === key); if (!d) return;
  const t = data.budgetTransactions.find(x => x.id === d.model.id); if (!t) return;
  t.nature = 'Fixed';
  attachToRecurringSeries(t);
  runRecurring();
  save(); render();
}
function ignoreDetected(key) {
  if (!data.settings.recurringIgnored) data.settings.recurringIgnored = [];
  data.settings.recurringIgnored.push(key);
  save(); render();
}
function expenseScannerHtml() {
  const list = detectRecurring();
  return `
    <div class="card" style="margin-top:20px;">
      <div class="eyebrow">Expense scanner</div>
      <div style="font-size:12.5px;opacity:.6;margin:4px 0 12px;">Payments that came back in at least 3 different months at a similar amount.</div>
      ${list.length ? `<div class="stack-gap-12">${list.map(d => `<div class="row-flex" style="gap:10px;flex-wrap:wrap;">
        <div style="display:flex;gap:10px;align-items:center;min-width:0;">${txAvatarHtml(d.model)}<div class="nm"><div class="nm-1">${escHtml(d.name)}</div><div class="nm-2">About ${fmtMoney(d.avg)} · ${d.months} months · around the ${ordinalDay(d.day)}</div></div></div>
        <div style="display:flex;gap:6px;"><button class="btn small primary" onclick="makeRecurringFromDetected('${escHtml(d.key)}')">Make recurring</button><button class="btn small ghost" onclick="ignoreDetected('${escHtml(d.key)}')">Not recurring</button></div>
      </div>`).join('')}</div>` : '<div class="dim">Nothing detected — no payment repeats in 3 different months yet, or they\'re all recurring items already.</div>'}
    </div>`;
}
