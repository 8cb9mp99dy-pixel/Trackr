/* ===================== Goals =====================
 * Its own file, loaded after app.js (shares its globals).
 *
 * Goals tab: a target amount, the money that counts toward it (any mix of bank accounts,
 * pockets, brokers, positions, coins — or simply your whole net worth), and a progress bar.
 * "When will I get there" uses how fast that money really grew over the last 3 months (from the
 * daily snapshots; needs at least 30 days of them), or a monthly amount you type instead.
 * With a target date, the goal is "on track" if that pace reaches it in time, "behind" if not.
 *
 * Emergency savings tab: a cushion of N months of your real spending (average of your last full
 * months in Budget), counted from the accounts and pockets you tick.
 *
 * A timeline across the top places each goal on the year it should be reached.
 */

/* ---- The money a goal can follow ---- */
function goalSources() {
  const list = [
    { id: 'nw', group: 'Everything', label: 'My whole net worth' },
    { id: 'pf', group: 'Everything', label: 'All my investments' },
  ];
  (data.accounts || []).forEach(a => {
    list.push({ id: 'acc:' + a.id, group: 'Bank accounts', label: a.name });
    (a.pockets || []).forEach(p => list.push({ id: 'pk:' + a.id + ':' + p.id, group: 'Pockets', label: `${p.name} (${a.name})` }));
  });
  (data.brokers || []).forEach(b => list.push({ id: 'brk:' + b.id, group: 'Brokers', label: b.name }));
  if ((data.cryptoAssets || []).some(c => cryptoAssetStats(c.symbol).quantity > 0)) list.push({ id: 'crypto', group: 'Crypto', label: 'All my crypto' });
  (data.assets || []).filter(a => assetStats(a.id).quantity > 0).forEach(a => list.push({ id: 'a:' + a.id, group: 'Positions', label: a.name || a.ticker }));
  (data.cryptoAssets || []).filter(c => cryptoAssetStats(c.symbol).quantity > 0).forEach(c => list.push({ id: 'c:' + c.symbol, group: 'Positions', label: c.name || c.symbol }));
  return list;
}
function sourceLabel(id) { const s = goalSources().find(x => x.id === id); return s ? s.label : null; }
/* Today's value of one source, in EUR. */
function sourceValue(id) {
  const [kind, x, y] = id.split(':');
  if (kind === 'nw') return netWorthTotal();
  if (kind === 'pf') return portfolioValue();
  if (kind === 'crypto') return (data.cryptoAssets || []).reduce((s, c) => s + cryptoAssetStats(c.symbol).marketValueEUR, 0);
  if (kind === 'acc') { const a = accountById(x); return a ? toEUR(accountTotal(a), a.currency) : 0; }
  if (kind === 'pk') { const a = accountById(x), p = a && (a.pockets || []).find(q => q.id === y); return p ? toEUR(+p.amountSaved || 0, a.currency) : 0; }
  if (kind === 'brk') { const b = brokerById(x); return b ? brokerValue(b.id) : 0; }
  if (kind === 'a') { const a = assetById(x); return a ? toEUR(assetStats(a.id).value, a.priceCurrency) : 0; }
  if (kind === 'c') return cryptoAssetStats(x).marketValueEUR || 0;
  return 0;
}
/* The same source's value on a saved day (null when that day has nothing for it). */
function sourceValueOn(id, h) {
  const [kind, x] = id.split(':');
  if (kind === 'nw') return typeof h.netWorth === 'number' ? h.netWorth : null;
  if (kind === 'pf') return typeof h.portfolioValue === 'number' ? h.portfolioValue : null;
  if (!h.pos) return null;
  const sum = test => { const ks = Object.keys(h.pos).filter(test); return ks.length ? ks.reduce((s, k) => s + h.pos[k], 0) : 0; };
  if (kind === 'crypto') return sum(k => k.startsWith('c:'));
  if (kind === 'acc') return sum(k => k === 'acc:' + x || k.startsWith('pk:' + x + ':'));
  if (kind === 'pk') return h.pos[id] || 0;
  if (kind === 'brk') { const ids = (data.assetEntries || []).filter(e => e.broker === x).map(e => 'e:' + e.id); return sum(k => ids.includes(k) || k === 'bc:' + x); }
  if (kind === 'a') { const ids = entriesFor(x).map(e => 'e:' + e.id); return sum(k => ids.includes(k)); }
  if (kind === 'c') return sum(k => k.startsWith('c:' + x + '@'));
  return null;
}
function linksValue(links) { return (links || []).reduce((s, id) => s + sourceValue(id), 0); }
/* How much the linked money grew per month: over the last 3 months, or since the oldest saved
   day if that's at least 30 days ago. null = not enough history yet. */
function linksMonthlyPace(links) {
  if (!links || !links.length) return null;
  const hist = (data.history || []).filter(h => h.date < todayYmd());
  const from = dateToYmd(new Date(Date.now() - 91 * 86400000));
  const base = hist.find(h => h.date >= from && links.every(id => sourceValueOn(id, h) != null));
  if (!base) return null;
  const days = (Date.now() - ymdToDate(base.date).getTime()) / 86400000;
  if (days < 30) return null;
  const past = links.reduce((s, id) => s + sourceValueOn(id, base), 0);
  return { perMonth: (linksValue(links) - past) / (days / 30.44), since: base.date };
}

function goalState(g) {
  const current = linksValue(g.links), target = +g.target || 0;
  const pace = linksMonthlyPace(g.links);
  const typed = +g.monthly > 0 ? +g.monthly : null;
  const perMonth = typed != null ? typed : pace ? pace.perMonth : null;
  const left = Math.max(0, target - current);
  let months = left === 0 ? 0 : perMonth > 0 ? left / perMonth : null;
  const eta = months != null ? new Date(Date.now() + months * 30.44 * 86400000) : null;
  let status = 'none';
  if (target && current >= target) status = 'done';
  else if (g.targetDate && eta) status = eta <= ymdToDate(g.targetDate) ? 'on' : 'behind';
  else if (g.targetDate && perMonth != null && perMonth <= 0) status = 'behind';
  else if (eta) status = 'on';
  return { current, target, pct: target ? Math.min(100, current / target * 100) : 0, perMonth, typed: typed != null, pace, months, eta, status, left };
}
function durationText(months) {
  if (months == null) return '';
  const m = Math.ceil(months);
  if (m <= 0) return 'now';
  const y = Math.floor(m / 12), r = m % 12;
  return 'in ' + [y ? `${y} year${y > 1 ? 's' : ''}` : '', r ? `${r} month${r > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ');
}
const GOAL_STATUS = { done: ['Reached', 'up'], on: ['On track', 'up'], behind: ['Behind', 'down'], none: ['No estimate yet', ''] };

/* ---- Average spending (also used by Analysis) ---- */
/* Average spending of your last n full months (or this month so far if there's none yet).
   exclude: expense category ids left out — e.g. gifts and travel for the emergency cushion.
   Also returns the same average per category, for the list where you choose. */
function avgMonthlyExpenses(n, exclude) {
  n = n || 3;
  const skip = new Set(exclude || []);
  const now = appToday(), min = budgetMinMonth();
  const months = [];
  for (let i = 1; i <= 24 && months.length < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    if (d < min) break;
    months.push(d);
  }
  const spentIn = d => {
    const byCat = {};
    monthTransactions(d).filter(t => t.type === 'expense').forEach(t => { const k = t.categoryId || '_none'; byCat[k] = (byCat[k] || 0) + toEUR(t.amount, t.currency); });
    return byCat;
  };
  let used = months.map(spentIn).filter(m => Object.keys(m).length);
  let partial = false;
  if (!used.length) { const cur = spentIn(now); if (Object.keys(cur).length) { used = [cur]; partial = true; } }
  if (!used.length) return { avg: 0, all: 0, months: 0, partial: false, byCat: {} };
  const byCat = {};
  used.forEach(m => Object.keys(m).forEach(k => { byCat[k] = (byCat[k] || 0) + m[k] / used.length; }));
  const all = Object.values(byCat).reduce((t, v) => t + v, 0);
  const avg = Object.keys(byCat).filter(k => !skip.has(k)).reduce((t, k) => t + byCat[k], 0);
  return { avg, all, months: partial ? 0 : used.length, partial, byCat };
}

/* ---- Page ---- */
function renderGoals() {
  const tab = ui.goalsTab === 'emergency' ? 'emergency' : 'goals';
  const ef = data.emergencyFund || {};
  return `
  <div class="page surface-light">
    <div class="page-head"><div><h1 class="page-title">Goals</h1><div class="page-subtitle">Where your money is heading</div></div></div>
    ${goalsTimelineHtml()}
    <div class="tab-row" style="margin:20px 0;width:auto;">
      <button class="tab-btn ${tab === 'goals' ? 'active' : ''}" onclick="ui.goalsTab='goals';render()">Goals${(data.goals || []).length ? ` (${data.goals.length})` : ''}</button>
      <button class="tab-btn ${tab === 'emergency' ? 'active' : ''}" onclick="ui.goalsTab='emergency';render()">Emergency savings ${ef.enabled ? '' : '<span class="dim">· not set</span>'}</button>
    </div>
    ${tab === 'emergency' ? emergencyTabHtml() : goalsTabHtml()}
  </div>`;
}
function goalsTimelineHtml() {
  const now = new Date(), y0 = now.getFullYear();
  const marks = (data.goals || []).map(g => ({ g, s: goalState(g) })).filter(x => x.s.eta || x.g.targetDate).map(x => ({ name: x.g.name, icon: x.g.icon || '🎯', date: x.s.status === 'done' ? now : (x.s.eta || ymdToDate(x.g.targetDate)), status: x.s.status }));
  const ef = data.emergencyFund || {};
  if (ef.enabled) { const s = emergencyState(); if (s.eta) marks.push({ name: 'Emergency savings', icon: '🛟', date: s.eta, status: s.status }); }
  const lastYear = Math.max(y0 + 10, ...marks.map(m => m.date.getFullYear() + 1));
  const span = new Date(lastYear, 0, 1) - now;
  const at = d => Math.max(0, Math.min(100, (d - now) / span * 100));
  const step = Math.max(1, Math.ceil((lastYear - y0) / 6));
  const years = []; for (let y = y0 + step; y < lastYear; y += step) years.push(y);
  return `
    <div class="card goal-timeline">
      <div class="gt-axis">
        <span class="gt-tick" style="left:0;">Today</span>
        ${years.map(y => `<span class="gt-tick" style="left:${at(new Date(y, 0, 1)).toFixed(2)}%;">${y}</span>`).join('')}
        <span class="gt-tick end" style="left:100%;">${lastYear}</span>
        <div class="gt-line"></div>
        ${marks.map(m => `<span class="gt-mark ${m.status}" style="left:${at(m.date).toFixed(2)}%;" title="${escHtml(m.name)} · ${m.date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}">${escHtml(m.icon)}</span>`).join('')}
      </div>
      ${marks.length ? '' : '<div style="font-size:12.5px;opacity:.55;margin-top:6px;">Your goals appear here on the year they should be reached.</div>'}
    </div>`;
}
function goalsTabHtml() {
  const goals = data.goals || [];
  return `
    <button class="btn primary" style="margin-bottom:14px;" onclick="openGoalForm()">${ic('plus', 15)} Add a goal</button>
    ${goals.length ? `<div class="goal-grid">${goals.map(goalCardHtml).join('')}</div>` : `
      <div class="card"><div class="empty-state"><div class="title">No goals yet</div><div class="sub">A trip, a flat deposit, financial independence… set an amount and pick the money that counts toward it.</div></div></div>`}`;
}
function goalCardHtml(g) {
  const s = goalState(g);
  const [label, tone] = GOAL_STATUS[s.status];
  const paceTxt = s.perMonth == null
    ? 'Needs 30 days of history to estimate — or type a monthly amount'
    : s.typed ? `${fmtMoney(s.perMonth)} a month (typed by you)`
    : `${s.perMonth >= 0 ? '+' : '−'}${fmtMoney(Math.abs(s.perMonth))} a month since ${shortDay(s.pace.since)}`;
  return `
    <div class="card goal-card">
      <div class="row-flex" style="gap:8px;align-items:flex-start;">
        <div style="display:flex;gap:10px;align-items:center;min-width:0;"><span class="goal-icon">${escHtml(g.icon || '🎯')}</span><div class="nm"><div class="nm-1" style="font-size:15px;">${escHtml(g.name)}</div><div class="nm-2">${s.status === 'done' ? 'Target reached' : s.eta ? durationText(s.months) + ' · ' + s.eta.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'No date yet'}${g.targetDate ? ` · aim: ${ymdToDate(g.targetDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}</div></div></div>
        <span class="status-pill ${tone}">${label}</span>
      </div>
      <div class="goal-amounts"><b>${fmtMoney(s.current)}</b><span>of ${fmtMoney(s.target)}</span><span class="goal-pct">${s.pct.toFixed(0)}%</span></div>
      <div class="goal-bar"><span style="width:${s.pct.toFixed(1)}%;"></span></div>
      <div style="font-size:12px;opacity:.6;margin-top:8px;">${paceTxt}</div>
      <div class="chip-scroll" style="margin-top:10px;">${(g.links || []).map(id => `<span class="chip" style="font-size:11.5px;">${escHtml(sourceLabel(id) || 'Removed')}</span>`).join('') || '<span class="dim">No money linked</span>'}</div>
      <div style="display:flex;gap:8px;margin-top:12px;"><button class="btn small" onclick="openGoalForm('${g.id}')">${ic('edit', 14)} Edit</button><button class="btn small ghost" style="color:var(--negative);" onclick="deleteGoal('${g.id}')">${ic('trash', 14)} Delete</button></div>
    </div>`;
}

/* ---- Goal form ---- */
function openGoalForm(id) {
  const g = id ? (data.goals || []).find(x => x.id === id) : null;
  ui.modal = { type: 'goal', payload: { id: id || null, links: g ? (g.links || []).slice() : [] } };
  render();
}
window.__modalRenderers.goal = function (p) {
  const g = p.id ? (data.goals || []).find(x => x.id === p.id) : null;
  const v = g || { name: '', icon: '🎯', target: '', targetDate: '', monthly: '' };
  const sources = goalSources();
  const groups = Array.from(new Set(sources.map(s => s.group)));
  const nw = p.links.includes('nw');
  return `
    <div class="modal-head"><div class="modal-title">${g ? 'Edit goal' : 'Add a goal'}</div><button class="close-x" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <label class="field" style="max-width:90px;"><span class="label-text">Icon</span><input id="gf-icon" value="${escHtml(v.icon || '🎯')}" maxlength="4"></label>
      <label class="field"><span class="label-text">Name</span><input id="gf-name" value="${escHtml(v.name)}" placeholder="e.g. Trip to Japan"></label>
      <label class="field"><span class="label-text">Target amount (€)</span><input id="gf-target" type="number" step="any" inputmode="decimal" value="${escHtml(String(v.target))}"></label>
      <label class="field"><span class="label-text">Aim to reach it by <span style="opacity:.6;">(optional)</span></span><input id="gf-date" type="date" value="${escHtml(v.targetDate || '')}"></label>
      <label class="field span-2"><span class="label-text">Monthly amount you put in <span style="opacity:.6;">(optional — leave empty to use the real pace from your history)</span></span><input id="gf-monthly" type="number" step="any" inputmode="decimal" value="${escHtml(String(v.monthly || ''))}"></label>
    </div>
    <div style="font-weight:600;font-size:13px;margin:14px 0 6px;">Money that counts toward it</div>
    <div class="link-list">
      ${groups.map(gr => `<div class="ll-group">${escHtml(gr)}</div>${sources.filter(s => s.group === gr).map(s => {
        const disabled = nw && s.id !== 'nw';
        return `<label class="ll-row ${disabled ? 'disabled' : ''}"><input type="checkbox" ${p.links.includes(s.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="toggleGoalLink('${escHtml(s.id)}')"><span>${escHtml(s.label)}</span><span class="dim" style="margin-left:auto;">${fmtMoney(sourceValue(s.id))}</span></label>`;
      }).join('')}`).join('')}
    </div>
    ${nw ? '<div style="font-size:12px;opacity:.6;margin-top:6px;">Your whole net worth already includes everything else.</div>' : ''}
    <div id="gf-err" style="display:none;color:var(--negative);font-size:12.5px;margin-top:8px;"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveGoal()">Save</button></div>`;
};
/* Ticking a box keeps what's typed in the fields above (they're read back before redrawing). */
function toggleGoalLink(id) {
  const p = ui.modal && ui.modal.payload; if (!p) return;
  const keep = ['gf-icon', 'gf-name', 'gf-target', 'gf-date', 'gf-monthly'].map(k => [k, (document.getElementById(k) || {}).value]);
  p.links = p.links.includes(id) ? p.links.filter(x => x !== id) : (id === 'nw' ? ['nw'] : p.links.concat(id));
  render();
  keep.forEach(([k, val]) => { const el = document.getElementById(k); if (el && val != null) el.value = val; });
}
function saveGoal() {
  const p = ui.modal.payload;
  const g = k => document.getElementById(k).value.trim();
  const name = g('gf-name'), target = parseFloat(g('gf-target').replace(',', '.'));
  const err = document.getElementById('gf-err');
  const fail = m => { err.textContent = m; err.style.display = ''; };
  if (!name) return fail('Give the goal a name.');
  if (!(target > 0)) return fail('Type the amount you want to reach.');
  if (!p.links.length) return fail('Tick at least one place where the money is.');
  const monthly = parseFloat(g('gf-monthly').replace(',', '.'));
  const rec = { name, icon: g('gf-icon') || '🎯', target, targetDate: g('gf-date') || '', monthly: monthly > 0 ? monthly : null, links: p.links.slice() };
  if (!Array.isArray(data.goals)) data.goals = [];
  if (p.id) Object.assign(data.goals.find(x => x.id === p.id) || {}, rec);
  else data.goals.push(Object.assign({ id: uid('goal'), createdAt: new Date().toISOString() }, rec));
  save(); closeModal();
}
function deleteGoal(id) {
  const g = (data.goals || []).find(x => x.id === id); if (!g) return;
  if (!confirm(`Delete the goal "${g.name}"? Your money isn't touched.`)) return;
  data.goals = data.goals.filter(x => x.id !== id);
  save(); render();
}

/* ---- Emergency savings ---- */
function defaultEmergencyLinks() {
  const ids = [];
  (data.accounts || []).forEach(a => {
    if (isSavingsName(a.name)) ids.push('acc:' + a.id);
    else (a.pockets || []).filter(p => isSavingsName(p.name)).forEach(p => ids.push('pk:' + a.id + ':' + p.id));
  });
  return ids.length ? ids : (data.accounts || []).filter(a => a.visibleInTotals).map(a => 'acc:' + a.id);
}
function emergencyState() {
  const ef = data.emergencyFund || {};
  const spend = avgMonthlyExpenses(3, ef.excludeCats);
  const links = ef.links || defaultEmergencyLinks();
  const current = linksValue(links), months = +ef.months || 6;
  const target = spend.avg * months;
  const covered = spend.avg ? current / spend.avg : null;
  const pace = linksMonthlyPace(links);
  const left = Math.max(0, target - current);
  const eta = left === 0 ? new Date() : pace && pace.perMonth > 0 ? new Date(Date.now() + left / pace.perMonth * 30.44 * 86400000) : null;
  return { spend, links, current, months, target, covered, pace, left, eta, status: !spend.avg ? 'none' : current >= target ? 'done' : eta ? 'on' : 'behind' };
}
function emergencyTabHtml() {
  const ef = data.emergencyFund || {};
  if (!ef.enabled) return `
    <div class="card"><div class="empty-state">
      <div class="title">No safety cushion yet</div>
      <div class="sub" style="max-width:460px;margin:0 auto;">Money kept aside for the unexpected (a repair, a job change…), usually 3 to 6 months of what you spend. Trackr measures it with your real spending from Budget.</div>
      <button class="btn primary" style="margin-top:16px;" onclick="enableEmergencyFund()">${ic('plus', 15)} Add a safety cushion</button>
    </div></div>`;
  const s = emergencyState();
  const pct = s.target ? Math.min(100, s.current / s.target * 100) : 0;
  const [label, tone] = s.status === 'done' ? ['Enough', 'up'] : s.status === 'none' ? ['No spending logged', ''] : ['Not enough yet', 'down'];
  const accounts = goalSources().filter(x => x.group === 'Bank accounts' || x.group === 'Pockets');
  return `
    <div class="card goal-card" style="max-width:720px;">
      <div class="row-flex" style="align-items:flex-start;gap:8px;">
        <div style="display:flex;gap:10px;align-items:center;"><span class="goal-icon">🛟</span><div><div style="font-weight:700;font-size:15px;">Emergency savings</div><div class="nm-2">${s.months} months of spending</div></div></div>
        <span class="status-pill ${tone}">${label}</span>
      </div>
      ${s.spend.avg ? `
        <div class="goal-amounts"><b>${fmtMoney(s.current)}</b><span>of ${fmtMoney(s.target)}</span><span class="goal-pct">${s.covered.toFixed(1)} months</span></div>
        <div class="goal-bar"><span style="width:${pct.toFixed(1)}%;"></span></div>
        <div style="font-size:12.5px;opacity:.65;margin-top:8px;line-height:1.5;">Your essential spending is about <b>${fmtMoney(s.spend.avg)}</b> a month${s.spend.avg < s.spend.all - 0.005 ? ` (out of ${fmtMoney(s.spend.all)} in total — the categories you left out below don't count)` : ''}, ${s.spend.partial ? 'from this month so far' : `the average of your last ${s.spend.months} full month${s.spend.months > 1 ? 's' : ''}`}. ${s.left ? `${fmtMoney(s.left)} to go${s.eta ? ', reached ' + durationText((s.eta - Date.now()) / 2629800000) + ' at your current pace' : ''}.` : 'Your cushion is complete.'}</div>`
        : `<div style="font-size:13px;opacity:.7;margin-top:12px;">Log your expenses in Budget: the target is computed from what you really spend.</div>`}
      ${emergencyCategoriesHtml(s)}
      <div class="form-grid" style="margin-top:16px;">
        <label class="field"><span class="label-text">Months of spending to keep</span><input type="number" min="1" max="24" step="1" value="${s.months}" onchange="setEmergencyMonths(this.value)"></label>
      </div>
      <div style="font-weight:600;font-size:13px;margin:12px 0 6px;">Money that counts</div>
      <div class="link-list">${accounts.map(x => `<label class="ll-row"><input type="checkbox" ${s.links.includes(x.id) ? 'checked' : ''} onchange="toggleEmergencyLink('${escHtml(x.id)}')"><span>${escHtml(x.label)}</span><span class="dim" style="margin-left:auto;">${fmtMoney(sourceValue(x.id))}</span></label>`).join('') || '<div class="dim">Add a bank account first.</div>'}</div>
      <button class="btn small ghost" style="margin-top:12px;color:var(--negative);" onclick="disableEmergencyFund()">Remove the cushion</button>
    </div>`;
}
function enableEmergencyFund() { data.emergencyFund = Object.assign({ months: 6 }, data.emergencyFund, { enabled: true, links: (data.emergencyFund || {}).links || defaultEmergencyLinks() }); save(); render(); }
function disableEmergencyFund() { if (!confirm('Remove the emergency savings goal? Your money isn\'t touched.')) return; data.emergencyFund.enabled = false; save(); render(); }
function setEmergencyMonths(v) { const n = Math.round(parseFloat(v)); if (n >= 1 && n <= 24) { data.emergencyFund.months = n; save(); } render(); }
/* Which spending counts: every expense category of the months used, with its monthly average.
   Untick the ones you'd stop in an emergency (gifts, travel, restaurants…). */
function emergencyCategoriesHtml(s) {
  const ids = Object.keys(s.spend.byCat || {}).sort((a, b) => s.spend.byCat[b] - s.spend.byCat[a]);
  if (!ids.length) return '';
  const ex = new Set((data.emergencyFund || {}).excludeCats || []);
  return `
      <div style="font-weight:600;font-size:13px;margin:16px 0 4px;">Spending that counts in an emergency</div>
      <div class="dim" style="margin-bottom:6px;">Untick what you'd stop paying if you had to live on this cushion — gifts, travel, going out…</div>
      <div class="link-list">${ids.map(id => {
        const c = id === '_none' ? null : categoryById('expense', id);
        return `<label class="ll-row"><input type="checkbox" ${ex.has(id) ? '' : 'checked'} onchange="toggleEmergencyCategory('${escHtml(id)}')"><span>${c ? `${c.icon || ''} ${escHtml(c.name)}` : 'Uncategorized'}</span><span class="dim" style="margin-left:auto;${ex.has(id) ? 'text-decoration:line-through;' : ''}">${fmtMoney(s.spend.byCat[id])}/month</span></label>`;
      }).join('')}</div>`;
}
function toggleEmergencyCategory(id) {
  const ef = data.emergencyFund;
  const l = ef.excludeCats || [];
  ef.excludeCats = l.includes(id) ? l.filter(x => x !== id) : l.concat(id);
  save(); render();
}
function toggleEmergencyLink(id) {
  const ef = data.emergencyFund;
  const l = ef.links || defaultEmergencyLinks();
  ef.links = l.includes(id) ? l.filter(x => x !== id) : l.concat(id);
  save(); render();
}
