/* ===================== Wealth =====================
 * Its own file, loaded after app.js and loan.js (shares their globals).
 *
 * Everything you own and owe on one page:
 *   - your net worth with its history (the daily snapshots) over 1M / 3M / 1Y / All;
 *   - Assets / Liabilities tabs;
 *   - an allocation donut, grouped by asset, type or institution, with "Compare" against the
 *     allocation you aim for (data.targetAllocation, % per asset type);
 *   - a table: filters (type, institution), "group by type", search, sortable columns
 *     (name, type, allocation, value, +/- value, change over the period) and a "…" menu per row.
 *
 * One row = one place your money sits: a bank account (pockets included), one holding at one
 * broker, one coin at one exchange, a broker's or exchange's cash. The change over the period
 * comes from the per-holding values saved each day since 16 Oct 2026 (see holdingValueMap in
 * app.js); before that there's nothing to compare with, so it shows "—".
 *
 * The loan portfolio isn't your money: it's left out unless you tick "Show the loan" (then it's
 * clearly marked), and the loan itself is in Liabilities but not taken off your net worth.
 */

const WEALTH_PERIODS = [['1M', '1M'], ['3M', '3M'], ['1Y', '1Y'], ['All', 'All']];
const isSavingsName = n => /savings|épargne|epargne|spaar|livret|deposit|emergency|buffer/i.test(n || '');

function wealthAssetRows() {
  const rows = [];
  (data.accounts || []).filter(a => a.visibleInTotals).forEach(a => {
    rows.push({
      key: 'acc:' + a.id, group: 'acc:' + a.id, name: a.name, sub: (a.pockets || []).length ? `${a.pockets.length} pocket${a.pockets.length > 1 ? 's' : ''}` : '',
      type: isSavingsName(a.name) || (a.pockets || []).length ? 'Savings' : 'Bank account', institution: a.name,
      value: toEUR(accountTotal(a), a.currency), native: a.currency !== 'EUR' ? { amount: accountTotal(a), currency: a.currency } : null,
      cost: null, hist: ['acc:' + a.id].concat((a.pockets || []).map(p => 'pk:' + a.id + ':' + p.id)),
      icon: accountIconHtml(a, 26), edit: `openAccountForm('${a.id}')`, del: `deleteAccount('${a.id}')`,
    });
  });
  (data.assetEntries || []).forEach(e => {
    const a = assetById(e.assetId), b = brokerById(e.broker);
    if (!a || !(e.quantity > 0)) return;
    const nativeValue = e.quantity * (assetPrice(a) || 0);
    rows.push({
      key: 'e:' + e.id, group: 'a:' + a.id, name: a.name || a.ticker, sub: `${escHtml(b ? b.name : 'Unknown')} · ${fmtQty(e.quantity)} ${escHtml(a.ticker || '')}`,
      type: a.assetType || 'Other', institution: b ? b.name : 'Unknown',
      value: toEUR(nativeValue, a.priceCurrency), native: a.priceCurrency !== 'EUR' ? { amount: nativeValue, currency: a.priceCurrency } : null,
      cost: toEUR(convertCurrency(e.quantity * e.price, e.currency, a.priceCurrency), a.priceCurrency), hist: ['e:' + e.id],
      icon: assetLogoHtml(a.logo, a.assetType, 26), edit: `openPositionForm('${a.id}')`, del: `deletePositionRow('${e.id}','${a.id}')`,
    });
  });
  (data.cryptoAssets || []).forEach(c => cryptoByExchange(c.symbol).forEach(x => {
    rows.push({
      key: 'c:' + c.symbol + '@' + x.exchange, group: 'c:' + c.symbol, name: c.name || c.symbol, sub: `${escHtml(x.exchange)} · ${fmtQty(x.quantity)} ${escHtml(c.symbol)}`,
      type: 'Crypto', institution: x.exchange, value: x.valueEUR, native: { amount: x.valueEUR * eurUsd(), currency: 'USD' },
      cost: x.costEUR, hist: ['c:' + c.symbol + '@' + x.exchange],
      icon: assetLogoHtml(c.logo, 'Crypto', 26), edit: `openCryptoAssetEditor('${escHtml(c.symbol)}')`, del: `deleteCryptoAtExchange('${escHtml(c.symbol)}','${escHtml(x.exchange).replace(/'/g, "\\'")}')`,
    });
  }));
  (data.brokers || []).forEach(b => {
    if (brokerCashCountedInBank(b) || !(brokerCash(b) > 0)) return;
    rows.push({ key: 'bc:' + b.id, group: 'bc:' + b.id, name: `${b.name} — cash`, sub: 'Not invested', type: 'Cash', institution: b.name, value: toEUR(brokerCash(b), brokerCashCurrency(b)), native: brokerCashCurrency(b) !== 'EUR' ? { amount: brokerCash(b), currency: brokerCashCurrency(b) } : null, cost: null, hist: ['bc:' + b.id], icon: logoImg(b.logo, 26), edit: `openBrokerForm('${b.id}')` });
  });
  (data.cryptoExchangeCash || []).forEach(c => {
    if (!(+c.amount > 0)) return;
    const ex = escHtml(c.exchange).replace(/'/g, "\\'");
    rows.push({ key: 'cx:' + c.id, group: 'cx:' + c.id, name: `${c.exchange} — cash`, sub: 'Not invested', type: 'Cash', institution: c.exchange, value: toEUR(+c.amount, c.currency), native: c.currency !== 'EUR' ? { amount: +c.amount, currency: c.currency } : null, cost: null, hist: ['cx:' + c.id], icon: logoImg(cryptoBrokerLogo(c.exchange), 26), edit: `openCryptoExchangeCashForm('${ex}')`, del: `deleteCryptoExchangeCash('${ex}')` });
  });
  if (ui.wealthShowLoan && typeof loanList === 'function') loanList().forEach(L => loanPositions(L).forEach(p => {
    rows.push({ key: 'lp:' + p.id, group: 'lp:' + p.id, name: p.name, sub: 'Bought with the loan — not your money', type: 'Loan portfolio', institution: p.broker || 'Loan', value: loanPosValue(p), native: null, cost: +p.invested || null, hist: [], icon: ic('bank', 20), edit: `goLoanPage()`, loan: true });
  }));
  return rows;
}
function goLoanPage() { ui.modal = null; ui.page = 'investments'; ui.investmentsTab = 'loan'; render(); }

function wealthLiabilityRows() {
  const rows = (data.liabilities || []).map(l => ({
    key: 'l:' + l.id, group: 'l:' + l.id, name: l.name || 'Debt', sub: l.rate ? `${l.rate}% a year` : '', type: l.kind || 'Debt', institution: l.institution || '—',
    value: toEUR(+l.amount || 0, l.currency || 'EUR'), native: l.currency && l.currency !== 'EUR' ? { amount: +l.amount || 0, currency: l.currency } : null,
    cost: null, hist: [], icon: ic('alert', 20), edit: `openLiabilityForm('${l.id}')`, del: `deleteLiability('${l.id}')`, counted: true,
  }));
  if (typeof loanList === 'function') loanList().forEach(L => {
    if (!(+L.principal > 0)) return;
    const M = loanModel(L);
    rows.push({
      key: 'loan:' + L.id, group: 'loan:' + L.id, name: L.name || 'Bank loan', sub: `${loanEffectiveRate(L)}% a year · invested apart, not taken off your net worth`,
      type: 'Bank loan', institution: L.bank || 'Bank', value: M.debtNow, native: null, cost: null, hist: [], icon: ic('bank', 20), edit: 'goLoanPage()', counted: false,
    });
  });
  return rows;
}

/* The change of a row over the period, in € — from the per-holding values saved each day. null
   when there's no saved value that far back (or the row is new since). */
function wealthHistoryBase(period) {
  const hist = (data.history || []).filter(h => h.pos);
  if (!hist.length) return null;
  const days = periodToDays(period);
  if (!days) return hist[0];
  const from = dateToYmd(new Date(Date.now() - days * 86400000));
  return hist.find(h => h.date >= from) || null;
}
function rowChange(row, base) {
  if (!base || !row.hist.length || base.date === todayYmd()) return null;
  const keys = row.hist.filter(k => base.pos[k] != null);
  if (!keys.length) return null;
  const past = keys.reduce((s, k) => s + base.pos[k], 0);
  return { eur: row.value - past, pct: past ? (row.value - past) / past * 100 : null, since: base.date };
}

function wealthGroupKey(row, by) { return by === 'type' ? row.type : by === 'institution' ? row.institution : by === 'asset' ? row.group : row.key; }
function groupRows(rows, by) {
  if (by === 'none') return rows;
  const map = {};
  rows.forEach(r => {
    const k = wealthGroupKey(r, by);
    if (!map[k]) map[k] = Object.assign({}, r, { key: 'g:' + k, value: 0, cost: 0, hist: [], children: [], native: null, del: null });
    const g = map[k];
    g.children.push(r);
    g.value += r.value;
    // +/- value only when every line in the group has a cost (a bank account has none).
    g.cost = g.children.every(c => c.cost != null) ? g.children.reduce((sum, c) => sum + c.cost, 0) : null;
    g.hist = g.hist.concat(r.hist);
    if (by === 'type') { g.name = r.type; g.sub = ''; g.icon = typeDotHtml(r.type); g.edit = null; }
    if (by === 'institution') { g.name = r.institution; g.sub = ''; g.edit = null; }
  });
  return Object.values(map).map(g => {
    if (g.children.length > 1) {
      if (by === 'type' || by === 'institution') g.sub = `${g.children.length} lines`;
      else g.sub = g.children.map(c => c.institution).join(' · ');
      if (by === 'asset') g.del = null;
    } else if (g.children.length === 1 && by === 'asset') { g.del = g.children[0].del; g.key = g.children[0].key; }
    return g;
  });
}
/* A type's colour where there's no ranking to go by: the one you picked, else one of five greys
   (always the same for a name). Charts use chartShade() instead: greys by size. */
function typeColor(type) {
  const own = data.settings.assetTypeColors && data.settings.assetTypeColors[type];
  if (own) return own;
  let h = 0;
  for (const ch of String(type)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return fxShade(h % 5, 5);
}
function typeDotHtml(type) { return `<span style="width:26px;height:26px;border-radius:8px;background:color-mix(in srgb, ${typeColor(type)} 14%, transparent);display:inline-flex;align-items:center;justify-content:center;flex:none;"><span style="width:10px;height:10px;border-radius:3px;background:${typeColor(type)};"></span></span>`; }

function renderWealth() {
  const tab = ui.wealthTab === 'liabilities' ? 'liabilities' : 'assets';
  const period = ui.wealthPeriod || 'All';
  const assets = wealthAssetRows(), liabilities = wealthLiabilityRows();
  const assetsTotal = assets.filter(r => !r.loan).reduce((s, r) => s + r.value, 0);
  const debtTotal = liabilities.filter(r => r.counted).reduce((s, r) => s + r.value, 0);
  const netWorth = netWorthTotal();
  const pts = historyPoints(periodToDays(period), 'netWorth');
  const first = pts[0], change = first ? netWorth - first.value : null;
  return `
  <div class="page surface-light">
    <div class="page-head"><div><h1 class="page-title">Wealth</h1><div class="page-subtitle">Everything you own and owe</div></div></div>

    <div class="wealth-top">
      <div class="card">
        <div class="eyebrow">Net worth</div>
        <div class="big-number">${fmtMoney(netWorth)}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 12px;font-size:13px;">
          ${change != null && pts.length >= 2 ? `<span class="${change >= 0 ? 'positive' : 'negative'}" style="font-weight:700;">${change >= 0 ? '+' : '−'}${fmtMoney(Math.abs(change))}${first.value ? ` (${fmtPct(change / first.value * 100)})` : ''}</span><span style="opacity:.65;">since ${escHtml(first.label)}</span>` : '<span style="opacity:.65;">Assets minus the debts you added</span>'}
        </div>
        <div class="seg-row">${WEALTH_PERIODS.map(([k, l]) => `<button class="seg ${period === k ? 'on' : ''}" onclick="setWealthPeriod('${k}')">${l}</button>`).join('')}</div>
        ${trendChartOrPlaceholder(pts, 150, {}, 'Your net worth is saved once a day — the chart appears from the second day.')}
        <div class="wealth-split">
          <div><span class="eyebrow">Assets</span><b>${fmtMoney(assetsTotal)}</b></div>
          <div><span class="eyebrow">Debts</span><b class="${debtTotal ? 'negative' : ''}">${debtTotal ? '−' : ''}${fmtMoney(debtTotal)}</b></div>
        </div>
      </div>
      ${wealthAllocationCardHtml(tab === 'liabilities' ? liabilities : assets, tab)}
    </div>
    ${typeof nwMovesCardHtml === 'function' ? nwMovesCardHtml() : ''}

    <div class="card" style="margin-top:20px;">
      <div class="tab-row" style="margin-bottom:14px;width:auto;">
        <button class="tab-btn ${tab === 'assets' ? 'active' : ''}" onclick="setWealthTab('assets')">Assets</button>
        <button class="tab-btn ${tab === 'liabilities' ? 'active' : ''}" onclick="setWealthTab('liabilities')">Liabilities</button>
      </div>
      ${wealthTableHtml(tab === 'liabilities' ? liabilities : assets, tab, period)}
    </div>
  </div>`;
}
function setWealthTab(t) { ui.wealthTab = t; ui.wealthMenu = null; ui.wealthFilter = null; render(); }
function setWealthPeriod(p) { ui.wealthPeriod = p; render(); }

/* ---- Allocation donut ---- */
function wealthAllocationCardHtml(rows, tab) {
  const by = ui.wealthChartBy || 'type';
  const view = ui.wealthChartView || 'donut';
  const shown = rows.filter(r => !r.loan || tab === 'assets');
  const groups = groupRows(shown.filter(r => r.value > 0), by === 'asset' ? 'asset' : by).sort((a, b) => b.value - a.value);
  const total = groups.reduce((s, g) => s + g.value, 0);
  const segs = groups.map((g, i) => ({ label: g.name, value: g.value, color: by === 'type' ? chartShade(g.name, i, groups.length) : fxShade(i, groups.length) }));
  const focus = ui.wealthFocus != null ? segs[ui.wealthFocus] : null;
  const center = focus ? `<div class="donut-center"><b>${fmtMoney(focus.value)}</b><span>${escHtml(focus.label)} · ${(focus.value / (total || 1) * 100).toFixed(1)}%</span></div>` : `<div class="donut-center"><b>${fmtMoney(total)}</b><span>Total</span></div>`;
  return `
    <div class="card">
      <div class="row-flex" style="gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <div class="eyebrow">${tab === 'liabilities' ? 'Debts' : 'Allocation'}</div>
        <div style="display:flex;gap:6px;align-items:center;">
          <select class="mini-select" onchange="ui.wealthChartBy=this.value;ui.wealthFocus=null;render()" aria-label="Group the chart by">
            ${[['asset', 'By asset'], ['type', 'By type'], ['institution', 'By institution']].map(([k, l]) => `<option value="${k}" ${by === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <button class="tb-btn ${view === 'donut' ? 'on' : ''}" style="width:34px;height:34px;" title="Chart" onclick="ui.wealthChartView='donut';render()">${ic('pie', 16)}</button>
          <button class="tb-btn ${view === 'bars' ? 'on' : ''}" style="width:34px;height:34px;" title="List" onclick="ui.wealthChartView='bars';render()">${ic('list', 16)}</button>
        </div>
      </div>
      ${!segs.length ? `<div class="empty-state" style="padding:30px 10px;"><div class="title">No data yet</div><div class="sub">${tab === 'liabilities' ? 'No debts — good.' : 'Add a bank account or a position.'}</div><button class="btn primary" style="margin-top:12px;" onclick="${tab === 'liabilities' ? 'openLiabilityForm()' : 'openAddMenu()'}">${ic('plus', 15)} Add</button></div>` : `
      <div class="alloc-body ${view === 'bars' ? 'bars-only' : ''}">
        ${view === 'donut' ? `<div class="donut-wrap" onpointerleave="wealthDonutFocus(null)">${wealthDonutSvg(segs)}${center}</div>` : ''}
        <div class="alloc-legend">
          ${segs.map((s, i) => `<div class="alloc-row ${ui.wealthFocus === i ? 'on' : ''}" onpointerenter="wealthDonutFocus(${i})" onclick="wealthDonutFocus(${ui.wealthFocus === i ? 'null' : i})">
            <span class="alloc-name"><span class="donut-swatch" style="background:${s.color};"></span>${escHtml(s.label)}</span>
            <span class="alloc-bar"><span style="width:${(s.value / (segs[0].value || 1) * 100).toFixed(1)}%;background:${s.color};"></span></span>
            <span class="alloc-pct">${(s.value / (total || 1) * 100).toFixed(1)}%</span>
          </div>`).join('')}
        </div>
      </div>`}
      ${tab === 'assets' && segs.length ? `<button class="link-btn" style="margin-top:12px;" onclick="ui.wealthCompare=!ui.wealthCompare;render()">${ic('sort', 14)} ${ui.wealthCompare ? 'Hide comparison' : 'Compare with my target'}</button>${ui.wealthCompare ? wealthCompareHtml(rows) : ''}` : ''}
    </div>`;
}
/* Donut with each slice as its own path, so a slice can be hovered/tapped. */
function wealthDonutSvg(segs) {
  const size = 190, stroke = 26, r = (size - stroke - 8) / 2, c = size / 2; // room for the thicker hovered slice
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  let a0 = -Math.PI / 2;
  const gap = segs.length > 1 ? 0.012 : 0;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="wealth-donut">${segs.map((s, i) => {
    const a1 = a0 + s.value / total * Math.PI * 2;
    const sa = a0 + gap, ea = Math.max(sa + 0.001, a1 - gap);
    const large = ea - sa > Math.PI ? 1 : 0;
    const d = segs.length === 1
      ? `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r}`
      : `M ${c + r * Math.cos(sa)} ${c + r * Math.sin(sa)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(ea)} ${c + r * Math.sin(ea)}`;
    a0 = a1;
    const on = ui.wealthFocus === i, dim = ui.wealthFocus != null && !on;
    return `<path d="${d}" fill="none" stroke-width="${on ? stroke + 6 : stroke}" opacity="${dim ? 0.35 : 1}" style="stroke:${s.color};cursor:pointer;" onpointerenter="wealthDonutFocus(${i})" onclick="wealthDonutFocus(${i})"><title>${escHtml(s.label)}</title></path>`;
  }).join('')}</svg>`;
}
function wealthDonutFocus(i) { if (ui.wealthFocus === i) return; ui.wealthFocus = i; render(); }

/* Compare: your allocation by type vs the one you aim for. */
function wealthCompareHtml(rows) {
  const byType = {};
  rows.filter(r => !r.loan && r.value > 0).forEach(r => { byType[r.type] = (byType[r.type] || 0) + r.value; });
  const total = Object.values(byType).reduce((s, v) => s + v, 0) || 1;
  const t = data.targetAllocation || {};
  const types = Array.from(new Set(Object.keys(byType).concat(Object.keys(t)))).sort((a, b) => (byType[b] || 0) - (byType[a] || 0));
  const targetSum = types.reduce((s, k) => s + (+t[k] || 0), 0);
  return `
    <div class="compare-box">
      <div class="cmp-head"><span>Type</span><span>Now</span><span>Target</span><span>Gap</span></div>
      ${types.map(k => {
        const now = (byType[k] || 0) / total * 100, tgt = t[k] != null && t[k] !== '' ? +t[k] : null;
        const gapEur = tgt != null ? (tgt / 100 * total) - (byType[k] || 0) : null;
        return `<div class="cmp-row">
          <span class="alloc-name"><span class="donut-swatch" style="background:${chartShade(k, types.indexOf(k), types.length)};"></span>${escHtml(k)}</span>
          <span>${now.toFixed(1)}%</span>
          <span><input class="cmp-input" type="number" min="0" max="100" step="1" inputmode="decimal" value="${tgt != null ? tgt : ''}" placeholder="—" onchange="setTargetAllocation('${escHtml(k).replace(/'/g, "\\'")}', this.value)" aria-label="Target % for ${escHtml(k)}">%</span>
          <span class="${gapEur == null ? '' : gapEur >= 0 ? 'positive' : 'negative'}" style="font-size:12.5px;">${gapEur == null ? '—' : `${gapEur >= 0 ? '+' : '−'}${fmtMoney(Math.abs(gapEur))}`}</span>
        </div>`;
      }).join('')}
      <div style="font-size:12px;opacity:.6;margin-top:8px;">${targetSum ? `Targets add up to ${targetSum}%${Math.abs(targetSum - 100) > 0.5 ? ' — they should make 100%.' : '.'} Gap = what to add (+) or take out (−) to match.` : 'Type the % you aim for per type (e.g. 65 for ETFs). The gap says how much to add or take out.'}</div>
      ${typeof newMoneyPlannerHtml === 'function' ? newMoneyPlannerHtml(rows) : ''}
    </div>`;
}
function setTargetAllocation(type, v) {
  if (!data.targetAllocation) data.targetAllocation = {};
  const n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n)) delete data.targetAllocation[type]; else data.targetAllocation[type] = Math.max(0, Math.min(100, n));
  save(); render();
}

/* ---- Table ---- */
function wealthTableHtml(rows, tab, period) {
  const f = ui.wealthFilter || { types: [], insts: [] };
  const q = (ui.wealthSearch || '').trim().toLowerCase();
  const allTypes = Array.from(new Set(rows.map(r => r.type))).sort();
  const allInsts = Array.from(new Set(rows.map(r => r.institution))).sort((a, b) => a.localeCompare(b));
  let shown = rows.filter(r => (!f.types.length || f.types.includes(r.type)) && (!f.insts.length || f.insts.includes(r.institution))
    && (!q || (r.name + ' ' + r.type + ' ' + r.institution + ' ' + (r.sub || '')).toLowerCase().includes(q)));
  const base = wealthHistoryBase(period);
  const total = shown.filter(r => !r.loan && (tab === 'assets' || r.counted)).reduce((s, r) => s + r.value, 0);
  const grouped = ui.wealthGroupByType ? groupRows(shown, 'type') : shown;
  const sort = ui.wealthSort || { key: 'value', dir: -1 };
  const val = r => {
    if (sort.key === 'name') return r.name.toLowerCase();
    if (sort.key === 'type') return r.type.toLowerCase();
    if (sort.key === 'pl') return r.cost != null ? r.value - r.cost : -Infinity;
    if (sort.key === 'var') { const c = rowChange(r, base); return c ? c.eur : -Infinity; }
    return r.value; // value and allocation sort the same way
  };
  grouped.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  const sumCost = shown.filter(r => r.cost != null).reduce((s, r) => s + r.cost, 0);
  const sumValWithCost = shown.filter(r => r.cost != null).reduce((s, r) => s + r.value, 0);
  const totalChange = (() => { const cs = shown.map(r => rowChange(r, base)).filter(Boolean); return cs.length ? cs.reduce((s, c) => s + c.eur, 0) : null; })();
  const th = (key, label, cls) => `<button class="th ${cls || ''} ${sort.key === key ? 'on' : ''}" onclick="setWealthSort('${key}')">${label}${sort.key === key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</button>`;
  const chip = (kind, label, all, sel) => `
    <div class="filter-chip-wrap">
      <button class="filter-chip ${sel.length ? 'on' : ''}" onclick="toggleWealthFilterMenu('${kind}')">${sel.length ? escHtml(sel.length === 1 ? sel[0] : `${label} · ${sel.length}`) : `${ic('plus', 13)} ${label}`}</button>
      ${ui.wealthFilterMenu === kind ? `<div class="filter-menu">
        <button class="fm-row" onclick="setWealthFilter('${kind}', null)">${sel.length ? 'Clear' : 'Select all'}</button>
        ${all.map(v => `<label class="fm-row"><input type="checkbox" ${sel.includes(v) ? 'checked' : ''} onchange="toggleWealthFilterValue('${kind}', '${escHtml(v).replace(/'/g, "\\'")}')"> ${escHtml(v)}</label>`).join('')}
      </div>` : ''}
    </div>`;
  const periodLbl = period === 'All' ? 'All' : period;
  return `
    <div class="wt-tools">
      <label class="wt-search">${ic('search', 16)}<input id="wealth-search" placeholder="Search ${tab === 'liabilities' ? 'debts' : 'what you own'}" value="${escHtml(ui.wealthSearch || '')}" oninput="setWealthSearch(this.value)"></label>
      <div class="wt-filters">
        ${chip('types', 'Type', allTypes, f.types)}${chip('insts', 'Institution', allInsts, f.insts)}
        <button class="filter-chip ${ui.wealthGroupByType ? 'on' : ''}" role="switch" aria-checked="${!!ui.wealthGroupByType}" aria-label="Group by type" onclick="ui.wealthGroupByType=!ui.wealthGroupByType;render()">${ui.wealthGroupByType ? ic('check', 13) + ' ' : ''}Group by type</button>
        ${tab === 'assets' && typeof loanList === 'function' && loanList().some(L => loanPositions(L).length) ? `<button class="filter-chip ${ui.wealthShowLoan ? 'on' : ''}" role="switch" aria-checked="${!!ui.wealthShowLoan}" aria-label="Show the loan portfolio" onclick="ui.wealthShowLoan=!ui.wealthShowLoan;render()">${ui.wealthShowLoan ? ic('check', 13) + ' ' : ''}Loan portfolio</button>` : ''}
      </div>
      ${tab === 'assets' && ui.wealthShowLoan ? '<div class="wt-note">The loan portfolio is shown dimmed: not your money, never in the totals.</div>' : ''}
    </div>
    <div class="wt">
      <div class="wt-head">
        ${th('name', 'Name', 'c-name')}${th('type', 'Type', 'c-type')}${th('alloc', 'Allocation', 'c-alloc')}${th('value', 'Value', 'c-val')}${th('pl', '+/- value', 'c-pl')}${th('var', `Change ${periodLbl}`, 'c-var')}<span class="c-menu"></span>
      </div>
      <div class="wt-row wt-total">
        <div class="c-name"><span class="eyebrow">Total · ${shown.length} line${shown.length !== 1 ? 's' : ''}</span></div>
        <div class="c-type"></div><div class="c-alloc"></div>
        <div class="c-val"><b>${tab === 'liabilities' && total ? '−' : ''}${fmtMoney(total)}</b></div>
        <div class="c-pl">${sumCost ? plCellHtml(sumValWithCost - sumCost, sumCost) : '<span class="dim">—</span>'}</div>
        <div class="c-var">${totalChange != null ? changeCellHtml(totalChange, null) : '<span class="dim">—</span>'}</div>
        <div class="c-menu"></div>
      </div>
      ${grouped.map(r => wealthRowHtml(r, total, base, tab)).join('') || `<div class="empty-state" style="padding:30px 10px;"><div class="title">${rows.length ? 'Nothing matches' : 'No data yet'}</div><div class="sub">${rows.length ? 'Change the filters or the search.' : tab === 'liabilities' ? 'Add a debt (credit card, another loan…) if you have one.' : 'Add a bank account or a position.'}</div>${rows.length ? '' : `<button class="btn primary" style="margin-top:12px;" onclick="${tab === 'liabilities' ? 'openLiabilityForm()' : 'openAddMenu()'}">${ic('plus', 15)} Add</button>`}</div>`}
    </div>
    ${tab === 'liabilities' && rows.length ? `<button class="btn" style="margin-top:12px;" onclick="openLiabilityForm()">${ic('plus', 15)} Add a debt</button>` : ''}
    ${base && base.date !== todayYmd() ? '' : `<div style="font-size:12px;opacity:.65;margin-top:10px;">"Change" needs values from an earlier day: each line's value is saved once a day, so it fills in from tomorrow.</div>`}`;
}
function plCellHtml(eur, cost) {
  const pct = cost ? eur / cost * 100 : null;
  return `<span class="${eur >= 0 ? 'positive' : 'negative'}">${eur >= 0 ? '+' : '−'}${fmtMoney(Math.abs(eur))}</span>${pct != null ? `<span class="pct-pill ${eur >= 0 ? 'up' : 'down'}">${fmtPct(Math.abs(pct), false)}</span>` : ''}`;
}
function changeCellHtml(eur, pct) {
  return `<span class="${eur >= 0 ? 'positive' : 'negative'}">${eur >= 0 ? '+' : '−'}${fmtMoney(Math.abs(eur))}</span>${pct != null ? `<span class="pct-pill ${eur >= 0 ? 'up' : 'down'}">${fmtPct(Math.abs(pct), false)}</span>` : ''}`;
}
function wealthRowHtml(r, total, base, tab) {
  const ch = rowChange(r, base);
  const share = total && !r.loan && (tab === 'assets' || r.counted) ? r.value / total * 100 : null;
  const menuOpen = ui.wealthMenu === r.key;
  const actions = [r.edit ? `<button class="fm-row" onclick="ui.wealthMenu=null;${r.edit}">${ic('edit', 15)} ${r.children && r.children.length > 1 ? 'Open' : 'Edit'}</button>` : '', r.del ? `<button class="fm-row danger" onclick="ui.wealthMenu=null;${r.del}">${ic('trash', 15)} Delete</button>` : ''].filter(Boolean);
  return `
    <div class="wt-row ${r.loan ? 'is-loan' : ''} ${r.counted === false ? 'is-uncounted' : ''}">
      <div class="c-name">${r.icon}<div class="nm"><div class="nm-1">${escHtml(r.name)}</div>${r.sub ? `<div class="nm-2">${r.sub}</div>` : ''}</div></div>
      <div class="c-type"><span class="type-pill">${escHtml(r.type)}</span></div>
      <div class="c-alloc">${share != null ? `<span class="mini-bar"><span style="width:${Math.min(100, share).toFixed(1)}%;"></span></span><span>${share.toFixed(1)}%</span>` : '<span class="dim">—</span>'}</div>
      <div class="c-val"><b>${tab === 'liabilities' ? '−' : ''}${fmtMoney(r.value)}</b>${r.native ? `<span class="dim">${fmtMoney(r.native.amount, r.native.currency)}</span>` : ''}</div>
      <div class="c-pl">${r.cost != null ? plCellHtml(r.value - r.cost, r.cost) : '<span class="dim">—</span>'}</div>
      <div class="c-var">${ch ? changeCellHtml(ch.eur, ch.pct) : '<span class="dim">—</span>'}</div>
      <div class="c-menu">${actions.length ? `<button class="dots-btn" onclick="toggleWealthMenu('${escHtml(r.key).replace(/'/g, "\\'")}')" aria-label="Actions for ${escHtml(r.name)}">${ic('dots', 18)}</button>${menuOpen ? `<div class="filter-menu right">${actions.join('')}</div>` : ''}` : ''}</div>
    </div>`;
}
function setWealthSort(key) {
  const s = ui.wealthSort || { key: 'value', dir: -1 };
  ui.wealthSort = s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'name' || key === 'type' ? 1 : -1 };
  render();
}
function toggleWealthMenu(key) { ui.wealthMenu = ui.wealthMenu === key ? null : key; ui.wealthFilterMenu = null; render(); }
function toggleWealthFilterMenu(kind) { ui.wealthFilterMenu = ui.wealthFilterMenu === kind ? null : kind; ui.wealthMenu = null; render(); }
function setWealthFilter(kind, list) { ui.wealthFilter = Object.assign({ types: [], insts: [] }, ui.wealthFilter); ui.wealthFilter[kind] = list || []; ui.wealthFilterMenu = null; render(); }
function toggleWealthFilterValue(kind, v) {
  ui.wealthFilter = Object.assign({ types: [], insts: [] }, ui.wealthFilter);
  const l = ui.wealthFilter[kind];
  ui.wealthFilter[kind] = l.includes(v) ? l.filter(x => x !== v) : l.concat(v);
  render();
}
/* Typing re-draws the table but keeps the cursor in the search box. */
function setWealthSearch(v) {
  ui.wealthSearch = v;
  const el = document.getElementById('wealth-search'), pos = el ? el.selectionStart : null;
  render();
  const again = document.getElementById('wealth-search');
  if (again) { again.focus(); if (pos != null) again.setSelectionRange(pos, pos); }
}
// Clicking anywhere else closes an open "…" or filter menu.
document.addEventListener('click', e => {
  if (!ui.wealthMenu && !ui.wealthFilterMenu) return;
  if (e.target.closest && (e.target.closest('.filter-chip-wrap') || e.target.closest('.c-menu'))) return;
  ui.wealthMenu = null; ui.wealthFilterMenu = null; render();
});

/* Crypto at one exchange: removes that coin's holdings there (other exchanges untouched). */
function deleteCryptoAtExchange(symbol, exchange) {
  const c = cryptoAssetBySymbol(symbol); if (!c) return;
  if (!confirm(`Remove your ${symbol} at ${exchange}?`)) return;
  if (c.mode === 'snapshot') c.snapshots = (c.snapshots || []).filter(r => (r.broker || 'Unknown') !== exchange);
  else data.cryptoLots = data.cryptoLots.filter(l => !(l.symbol === symbol && (l.broker || 'Unknown') === exchange));
  save(); render();
}

/* ---- Debts added by hand ---- */
const LIABILITY_KINDS = ['Credit card', 'Personal loan', 'Student loan', 'Mortgage', 'Car loan', 'Owed to someone', 'Other debt'];
function openLiabilityForm(id) { ui.modal = { type: 'liability', payload: { id: id || null } }; render(); }
window.__modalRenderers.liability = function (p) {
  const l = p.id ? (data.liabilities || []).find(x => x.id === p.id) : null;
  const v = l || { name: '', institution: '', kind: 'Credit card', amount: '', currency: 'EUR', rate: '', note: '' };
  return `
    <div class="modal-head"><div class="modal-title">${l ? 'Edit debt' : 'Add a debt'}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
    <div style="font-size:12.5px;opacity:.65;margin-bottom:14px;">What you still owe today. It's taken off your net worth. (Your bank loan is already listed from the Loan page.)</div>
    <div class="form-grid">
      <label class="field span-2"><span class="label-text">Name</span><input id="lb-name" value="${escHtml(v.name)}" placeholder="e.g. Revolut credit card"></label>
      <label class="field"><span class="label-text">Kind</span><select id="lb-kind">${LIABILITY_KINDS.map(k => `<option ${v.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label class="field"><span class="label-text">Lender <span style="opacity:.6;">(optional)</span></span><input id="lb-inst" value="${escHtml(v.institution || '')}" placeholder="e.g. ING"></label>
      <label class="field"><span class="label-text">Amount owed</span><input id="lb-amount" type="number" step="any" inputmode="decimal" value="${escHtml(String(v.amount))}"></label>
      <label class="field"><span class="label-text">Currency</span><select id="lb-ccy">${CURRENCIES.map(c => `<option ${v.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span class="label-text">Interest rate % a year <span style="opacity:.6;">(optional)</span></span><input id="lb-rate" type="number" step="any" inputmode="decimal" value="${escHtml(String(v.rate || ''))}"></label>
      <label class="field"><span class="label-text">Note <span style="opacity:.6;">(optional)</span></span><input id="lb-note" value="${escHtml(v.note || '')}"></label>
    </div>
    <div id="lb-err" style="display:none;color:var(--negative);font-size:12.5px;margin-top:8px;"></div>
    <div class="modal-actions">${l ? `<button class="btn ghost" style="margin-right:auto;color:var(--negative);" onclick="closeModal();deleteLiability('${l.id}')">Delete</button>` : ''}<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveLiability('${l ? l.id : ''}')">Save</button></div>`;
};
function saveLiability(id) {
  const g = k => document.getElementById(k).value.trim();
  const name = g('lb-name'), amount = parseFloat(g('lb-amount').replace(',', '.'));
  const err = document.getElementById('lb-err');
  if (!name || isNaN(amount) || amount < 0) { err.textContent = !name ? 'Give it a name.' : 'Type the amount you still owe (0 or more).'; err.style.display = ''; return; }
  const rate = parseFloat(g('lb-rate').replace(',', '.'));
  const rec = { name, kind: g('lb-kind'), institution: g('lb-inst'), amount, currency: g('lb-ccy'), rate: isNaN(rate) ? null : rate, note: g('lb-note'), updatedAt: new Date().toISOString() };
  if (!Array.isArray(data.liabilities)) data.liabilities = [];
  if (id) Object.assign(data.liabilities.find(x => x.id === id) || {}, rec);
  else data.liabilities.push(Object.assign({ id: uid('debt') }, rec));
  save(); closeModal();
}
function deleteLiability(id) {
  const l = (data.liabilities || []).find(x => x.id === id); if (!l) return;
  if (!confirm(`Remove "${l.name}" from your debts?`)) return;
  data.liabilities = data.liabilities.filter(x => x.id !== id);
  save(); render();
}
