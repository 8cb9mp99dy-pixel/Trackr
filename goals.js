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
    list.push({ id: 'acc:' + a.id, group: 'Bank accounts', label: (a.pockets || []).length ? `${a.name} (with its pockets)` : a.name });
    // The main balance alone (outside the pockets), so a pocket is never counted twice.
    if ((a.pockets || []).length) list.push({ id: 'main:' + a.id, group: 'Main balances', label: `${a.name} — main balance` });
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
  if (kind === 'main') { const a = accountById(x); return a ? toEUR(+a.balance || 0, a.currency) : 0; }
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
  if (kind === 'main') return h.pos['acc:' + x] || 0;
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
  const current = linksValue(g.links), target = goalTarget(g);
  // A pocket goal: the pace is what you really moved into the pocket over the last 3 months
  // (at least one month counted). Otherwise: how fast the followed money grew (daily history).
  let pace = null;
  if (g.pocket) {
    const from = dateToYmd(new Date(Date.now() - 91 * 86400000));
    const mv = pocketMoves(g.pocket).filter(m => m.date >= from);
    if (mv.length) {
      const since = mv[mv.length - 1].date;
      const months = Math.max(1, (Date.now() - ymdToDate(since).getTime()) / (30.44 * 86400000));
      pace = { perMonth: mv.reduce((t, m) => t + m.amount, 0) / months, since };
    }
  } else pace = linksMonthlyPace(g.links);
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
  const tab = ['emergency', 'future'].includes(ui.goalsTab) ? ui.goalsTab : 'goals';
  const ef = data.emergencyFund || {};
  return `
  <div class="page surface-light">
    <div class="page-head"><div><h1 class="page-title">Goals</h1><div class="page-subtitle">Where your money is heading</div></div>${tab === 'goals' ? `<button class="btn primary" onclick="openGoalForm()">${ic('plus', 15)} New goal</button>` : ''}</div>
    ${tab === 'goals' ? goalsOverviewHtml() : ''}
    ${typeof newNavOn === 'function' && newNavOn() ? '' : `<div class="tab-row" style="margin:20px 0;width:auto;">
      <button class="tab-btn ${tab === 'goals' ? 'active' : ''}" onclick="ui.goalsTab='goals';render()">Goals${(data.goals || []).length ? ` (${data.goals.length})` : ''}</button>
      <button class="tab-btn ${tab === 'emergency' ? 'active' : ''}" onclick="ui.goalsTab='emergency';render()">Emergency savings ${ef.enabled ? '' : '<span class="dim">· not set</span>'}</button>
      ${typeof futureTabHtml === 'function' ? `<button class="tab-btn ${tab === 'future' ? 'active' : ''}" onclick="ui.goalsTab='future';render()">Future</button>` : ''}
    </div>`}
    ${tab === 'emergency' ? emergencyTabHtml() : tab === 'future' && typeof futureTabHtml === 'function' ? futureTabHtml() : goalsTabHtml()}
  </div>`;
}
/* ---- Goals and pockets ----
   A goal usually lives in a pocket (Accounts → an account → its pockets): the goal's progress is
   the pocket's balance — which your transfers in Budget already keep up to date — and the goal's
   target is the pocket's target (change one, the other follows). A goal can instead follow other
   money (whole net worth, investments, accounts…). */
function pocketByRef(ref) {
  const m = /^pk:([^:]+):(.+)$/.exec(ref || '');
  const a = m && accountById(m[1]);
  const p = a && (a.pockets || []).find(x => x.id === m[2]);
  return p ? { a, p, ref } : null;
}
function goalForPocket(accId, pkId) { return (data.goals || []).find(g => g.pocket === `pk:${accId}:${pkId}`) || null; }
function goalTarget(g) {
  const pk = pocketByRef(g.pocket);
  return pk && +pk.p.targetAmount > 0 ? toEUR(+pk.p.targetAmount, pk.a.currency) : (+g.target || 0);
}
/* Money moved into / out of a pocket through Budget transfers, newest first. */
function pocketMoves(ref) {
  return (data.budgetTransactions || []).filter(t => t.type === 'transfer' && (t.to === ref || t.from === ref))
    .map(t => ({ date: t.date, amount: (t.to === ref ? 1 : -1) * toEUR(t.amount, t.currency), other: t.to === ref ? (t.fromLabel || '') : (t.toLabel || ''), comment: t.comment || '' }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
function goalColor(g) { return g.color || hashColor(g.name || 'goal'); }

function goalsTabHtml() { return goalsListHtml(); }

/* ---- One goal, full view: gallery, story, money ---- */
let goalGalleryTimer = null;
function openGoalView(id) { ui.modal = { type: 'goalView', payload: { id, slide: 0 } }; render(); startGoalGallery(); }
function startGoalGallery() {
  clearInterval(goalGalleryTimer);
  goalGalleryTimer = setInterval(() => {
    if (!ui.modal || ui.modal.type !== 'goalView') { clearInterval(goalGalleryTimer); return; }
    if (!document.hidden && !document.querySelector('.gv-gallery:hover')) goalGalleryGo(1, true);
  }, 5000);
}
/* Changes the photo without redrawing the window (crossfade). */
function goalGalleryGo(delta, auto, to) {
  const p = ui.modal && ui.modal.payload; if (!p) return;
  const slides = document.querySelectorAll('.gv-slide'), dots = document.querySelectorAll('.gv-dot, .gv-thumb');
  if (slides.length < 2) return;
  p.slide = to != null ? to : (p.slide + delta + slides.length) % slides.length;
  slides.forEach((el, i) => el.classList.toggle('on', i === p.slide));
  dots.forEach(el => el.classList.toggle('on', +el.dataset.i === p.slide));
  if (!auto) startGoalGallery();
}
window.__modalRenderers.goalView = function (p) {
  const g = (data.goals || []).find(x => x.id === p.id); if (!g) return '';
  const s = goalState(g);
  const [label, tone] = GOAL_STATUS[s.status];
  const photos = g.photos || [];
  const pk = pocketByRef(g.pocket);
  const moves = pk ? pocketMoves(pk.ref) : [];
  const putIn = moves.filter(m => m.amount > 0).reduce((t, m) => t + m.amount, 0), takenOut = -moves.filter(m => m.amount < 0).reduce((t, m) => t + m.amount, 0);
  const startedWith = pk ? s.current - (putIn - takenOut) : null;
  const details = String(g.details || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ['', l]; });
  const paceTxt = s.perMonth == null ? (g.pocket ? 'No transfer into the pocket in the last 3 months' : 'Needs 30 days of history — or type a monthly amount') : `${s.perMonth >= 0 ? '+' : '−'}${fmtMoney(Math.abs(s.perMonth))} a month${s.typed ? ' (typed by you)' : g.pocket ? ' put in' : ''}`;
  return `
    <div class="gv">
      <div class="gv-gallery" style="--gs-c:${goalColor(g)};">
        ${photos.length ? photos.map((ph, i) => { const u = photoUrl(ph.id); return u ? `<img class="gv-slide ${i === (p.slide || 0) ? 'on' : ''}" src="${u}" alt="">` : `<div class="gv-slide gv-missing ${i === (p.slide || 0) ? 'on' : ''}">${ic('photo', 26)}<span>Loading the photo…</span></div>`; }).join('')
          : `<div class="gv-slide on gv-hero"><span>${escHtml(g.icon || '🎯')}</span></div>`}
        ${photos.length > 1 ? `<button class="gv-arrow l" onclick="event.stopPropagation();goalGalleryGo(-1)" aria-label="Previous photo">${ic('chevronLeft', 20)}</button><button class="gv-arrow r" onclick="event.stopPropagation();goalGalleryGo(1)" aria-label="Next photo">${ic('chevronRight', 20)}</button>
          <div class="gv-dots">${photos.map((_, i) => `<span class="gv-dot ${i === (p.slide || 0) ? 'on' : ''}" data-i="${i}" onclick="goalGalleryGo(0,false,${i})"></span>`).join('')}</div>` : ''}
        <button class="gv-close" onclick="closeModal()" aria-label="Close">${ic('x', 18)}</button>
      </div>
      <div class="gv-info">
        <div class="row-flex" style="gap:10px;align-items:flex-start;">
          <div><div class="gv-name">${escHtml(g.icon || '')} ${escHtml(g.name)}</div><div class="nm-2" style="font-size:13px;">${s.status === 'done' ? 'Target reached' : s.eta ? `${durationText(s.months)} · ${s.eta.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` : 'No date yet'}${g.targetDate ? ` · aim: ${ymdToDate(g.targetDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}</div></div>
          <span class="status-pill ${tone}">${label}</span>
        </div>
        ${g.description ? `<p class="gv-desc">${escHtml(g.description).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="gv-money">
          <div class="gv-big"><b class="count-up">${fmtMoney(s.current)}</b><span>of ${fmtMoney(s.target)} · ${s.pct.toFixed(0)}%</span></div>
          <div class="goal-bar gs-bar"><span style="width:${s.pct.toFixed(1)}%;"></span></div>
          <div class="gv-stats">
            <div><span class="eyebrow">Still to save</span><b>${fmtMoney(s.left)}</b></div>
            <div><span class="eyebrow">Pace</span><b style="font-size:13px;">${paceTxt}</b></div>
            ${pk ? `<div><span class="eyebrow">Put in</span><b class="positive">+${fmtMoney(putIn)}</b></div><div><span class="eyebrow">Taken out</span><b>${takenOut ? '−' + fmtMoney(takenOut) : '—'}</b></div>` : ''}
          </div>
        </div>
        ${details.length ? `<div class="gv-details">${details.map(([k, v]) => `<div>${k ? `<span>${escHtml(k)}</span>` : ''}<b>${escHtml(v)}</b></div>`).join('')}</div>` : ''}
        ${g.link ? `<a class="btn small" href="${escHtml(g.link)}" target="_blank" rel="noopener noreferrer" style="align-self:flex-start;">${ic('share', 14)} Open the link</a>` : ''}
        <div class="gv-where">${ic('wallet', 15)}<span>${pk ? `In the pocket <b>${escHtml(pk.p.name)}</b> of <b>${escHtml(pk.a.name)}</b> — your transfers in Budget update it.` : g.pocket ? 'The pocket of this goal was removed — edit the goal to pick another one.' : `Follows: ${escHtml((g.links || []).map(id => sourceLabel(id) || 'Removed').join(', '))}`}</span></div>
        ${pk ? `<div class="gv-moves"><div class="eyebrow" style="margin-bottom:6px;">Money in and out</div>
          ${moves.slice(0, 6).map(m => `<div class="row-flex"><span>${escHtml(fmtDate(ymdToDate(m.date)))} <span class="dim">${escHtml(m.comment || m.other)}</span></span><b class="${m.amount >= 0 ? 'positive' : ''}">${m.amount >= 0 ? '+' : '−'}${fmtMoney(Math.abs(m.amount))}</b></div>`).join('') || '<div class="dim">No transfers yet.</div>'}
          ${startedWith > 0.005 ? `<div class="row-flex"><span class="dim">Already in the pocket before</span><b>${fmtMoney(startedWith)}</b></div>` : ''}
        </div>` : ''}
        <div class="gv-actions">
          ${pk ? `<button class="btn primary" onclick="addMoneyToGoal('${g.id}')">${ic('plus', 15)} Add money</button>` : ''}
          <button class="btn" onclick="openGoalForm('${g.id}')">${ic('edit', 15)} Edit</button>
          <button class="btn ghost" style="color:var(--negative);" onclick="deleteGoal('${g.id}')" aria-label="Delete">${ic('trash', 15)}</button>
        </div>
      </div>
    </div>`;
};
/* "Add money": a Budget transfer into the goal's pocket, ready to fill in. */
function addMoneyToGoal(id) {
  const g = (data.goals || []).find(x => x.id === id); if (!g || !pocketByRef(g.pocket)) return;
  openTxForm();
  Object.assign(ui.modal.payload, { type: 'transfer', to: g.pocket, comment: `To ${g.name}` });
  render();
}

/* ---- Goal form ---- */
const GOAL_FORM_FIELDS = ['gf-icon', 'gf-name', 'gf-target', 'gf-date', 'gf-monthly', 'gf-desc', 'gf-link', 'gf-details', 'gf-pocket'];
function goalFormKeep() { return GOAL_FORM_FIELDS.map(k => [k, (document.getElementById(k) || {}).value]); }
function goalFormRedraw(change) {
  const kept = goalFormKeep();
  if (change) change(ui.modal.payload);
  render();
  kept.forEach(([k, v]) => { const el = document.getElementById(k); if (el && v != null) el.value = v; });
}
function openGoalForm(id) {
  const g = id ? (data.goals || []).find(x => x.id === id) : null;
  const firstAcc = (data.accounts || []).find(a => a.visibleInTotals) || (data.accounts || [])[0];
  ui.modal = { type: 'goal', payload: {
    id: id || null,
    mode: g ? (g.pocket ? 'pocket' : 'other') : (firstAcc ? 'pocket' : 'other'),
    pocket: g && g.pocket ? g.pocket : (firstAcc ? 'new:' + firstAcc.id : ''),
    links: g ? (g.links || []).filter(l => l !== g.pocket) : [],
    photos: g ? (g.photos || []).map(x => Object.assign({}, x)) : [],
  } };
  render();
}
window.__modalRenderers.goal = function (p) {
  const g = p.id ? (data.goals || []).find(x => x.id === p.id) : null;
  const v = g || { name: '', icon: '🎯', target: '', targetDate: '', monthly: '', description: '', link: '', details: '' };
  const pocketTarget = g ? goalTarget(g) : '';
  const sources = goalSources().filter(s => !s.id.startsWith('pk:'));
  const groups = Array.from(new Set(sources.map(s => s.group)));
  const nw = p.links.includes('nw');
  const accs = data.accounts || [];
  return `
    <div class="modal-head"><div class="modal-title">${g ? 'Edit goal' : 'New goal'}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
    <div class="gf-photos">
      ${p.photos.map((ph, i) => { const u = photoUrl(ph.id); return `<div class="gf-ph ${i === 0 ? 'cover' : ''}">${u ? `<img src="${u}" alt="">` : `<span>${ic('photo', 18)}</span>`}
        ${i === 0 ? '<span class="gf-ph-tag">Cover</span>' : `<button class="gf-ph-btn star" title="Use as cover" onclick="goalFormRedraw(p=>p.photos.unshift(p.photos.splice(${i},1)[0]))">★</button>`}
        <button class="gf-ph-btn del" title="Remove" onclick="goalFormRedraw(p=>p.photos.splice(${i},1))">✕</button></div>`; }).join('')}
      <label class="gf-ph gf-ph-add">${ic('plus', 20)}<span>Add photos</span><input type="file" accept="image/*" multiple onchange="goalAddPhotos(this.files);this.value=''"></label>
    </div>
    ${photoCloud === false ? '<div class="dim" style="margin:-6px 0 10px;">Photos stay on this device until you run the updated setup SQL in Supabase (Settings → Supabase Sync → setup SQL).</div>' : ''}
    <div class="form-grid">
      <label class="field" style="max-width:90px;"><span class="label-text">Icon</span><input id="gf-icon" value="${escHtml(v.icon || '🎯')}" maxlength="4"></label>
      <label class="field"><span class="label-text">Name</span><input id="gf-name" value="${escHtml(v.name)}" placeholder="e.g. Trip to Japan"></label>
      <label class="field"><span class="label-text">Target amount (€)</span><input id="gf-target" type="number" step="any" inputmode="decimal" value="${escHtml(String(g ? (pocketTarget || v.target) : ''))}"></label>
      <label class="field"><span class="label-text">Aim to reach it by <span style="opacity:.6;">(optional)</span></span><input id="gf-date" type="date" value="${escHtml(v.targetDate || '')}"></label>
      <label class="field span-2"><span class="label-text">Description <span style="opacity:.6;">(optional)</span></span><textarea id="gf-desc" rows="3" placeholder="Why it matters, what's the plan…">${escHtml(v.description || '')}</textarea></label>
      <label class="field span-2"><span class="label-text">Extra details <span style="opacity:.6;">(optional — one per line, e.g. "Flight: €850")</span></span><textarea id="gf-details" rows="3" placeholder="Flight: €850&#10;Hotel: 12 nights&#10;When: April 2027">${escHtml(v.details || '')}</textarea></label>
      <label class="field span-2"><span class="label-text">Link <span style="opacity:.6;">(optional — the product, the trip, the flat…)</span></span><input id="gf-link" type="url" inputmode="url" value="${escHtml(v.link || '')}" placeholder="https://…"></label>
    </div>
    <div style="font-weight:600;font-size:13px;margin:16px 0 6px;">Where the money is</div>
    <div class="seg-row" style="margin-bottom:10px;">
      <button class="seg ${p.mode === 'pocket' ? 'on' : ''}" onclick="goalFormRedraw(p=>{p.mode='pocket'})">${ic('wallet', 14)} A pocket</button>
      <button class="seg ${p.mode === 'other' ? 'on' : ''}" onclick="goalFormRedraw(p=>{p.mode='other'})">Other money</button>
    </div>
    ${p.mode === 'pocket' ? (accs.length ? `
      <label class="field"><span class="label-text">Pocket</span><select id="gf-pocket" onchange="ui.modal.payload.pocket=this.value">
        ${accs.map(a => `<option value="new:${a.id}" ${p.pocket === 'new:' + a.id ? 'selected' : ''}>＋ New pocket in ${escHtml(a.name)}</option>`).join('')}
        ${accs.flatMap(a => (a.pockets || []).map(pk => { const ref = `pk:${a.id}:${pk.id}`, other = goalForPocket(a.id, pk.id); return `<option value="${ref}" ${p.pocket === ref ? 'selected' : ''} ${other && other.id !== p.id ? 'disabled' : ''}>${escHtml(pk.icon || '')} ${escHtml(pk.name)} · ${escHtml(a.name)} · ${fmtMoney(pk.amountSaved, a.currency)}${other && other.id !== p.id ? ' (goal: ' + escHtml(other.name) + ')' : ''}</option>`; })).join('')}
      </select></label>
      <div class="dim" style="margin-top:6px;">The goal shows the pocket's balance, kept up to date by your transfers in Budget. Its target becomes the pocket's target.</div>`
      : '<div class="dim">Add a bank account first (Accounts) to keep this goal in a pocket.</div>') : `
      <div class="link-list">
        ${groups.map(gr => `<div class="ll-group">${escHtml(gr)}</div>${sources.filter(s => s.group === gr).map(s => {
          const disabled = nw && s.id !== 'nw';
          return `<label class="ll-row ${disabled ? 'disabled' : ''}"><input type="checkbox" ${p.links.includes(s.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="toggleGoalLink('${escHtml(s.id)}')"><span>${escHtml(s.label)}</span><span class="dim" style="margin-left:auto;">${fmtMoney(sourceValue(s.id))}</span></label>`;
        }).join('')}`).join('')}
      </div>
      <label class="field" style="margin-top:10px;"><span class="label-text">Monthly amount you put in <span style="opacity:.6;">(optional — else the real pace from your history)</span></span><input id="gf-monthly" type="number" step="any" inputmode="decimal" value="${escHtml(String(v.monthly || ''))}"></label>`}
    <div id="gf-err" style="display:none;color:var(--negative);font-size:12.5px;margin-top:8px;"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveGoal()">Save</button></div>`;
};
function toggleGoalLink(id) {
  goalFormRedraw(p => { p.links = p.links.includes(id) ? p.links.filter(x => x !== id) : (id === 'nw' ? ['nw'] : p.links.concat(id)); });
}
async function goalAddPhotos(files) {
  if (!files || !files.length) return;
  const added = await addPhotoFiles(files);
  if (ui.modal && ui.modal.type === 'goal') goalFormRedraw(p => { p.photos = p.photos.concat(added); });
}
function saveGoal() {
  const p = ui.modal.payload;
  const g = k => { const el = document.getElementById(k); return el ? el.value.trim() : ''; };
  const name = g('gf-name'), target = parseFloat(g('gf-target').replace(',', '.'));
  const err = document.getElementById('gf-err');
  const fail = m => { err.textContent = m; err.style.display = ''; };
  if (!name) return fail('Give the goal a name.');
  if (!(target > 0)) return fail('Type the amount you want to reach.');
  let link = g('gf-link');
  if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
  const rec = { name, icon: g('gf-icon') || '🎯', target, targetDate: g('gf-date') || '', description: g('gf-desc'), details: g('gf-details'), link, photos: p.photos.slice() };
  if (p.mode === 'pocket') {
    let ref = g('gf-pocket') || p.pocket;
    if (!ref) return fail('Pick a pocket, or a new one.');
    if (ref.startsWith('new:')) {
      const a = accountById(ref.slice(4)); if (!a) return fail('That account no longer exists.');
      const pk = { id: uid('pk'), icon: rec.icon, name, amountSaved: 0, targetAmount: Math.round(convertCurrency(target, 'EUR', a.currency) * 100) / 100, color: hashColor(name) };
      if (!Array.isArray(a.pockets)) a.pockets = [];
      a.pockets.push(pk);
      ref = `pk:${a.id}:${pk.id}`;
    } else {
      const pk = pocketByRef(ref); if (!pk) return fail('That pocket no longer exists.');
      pk.p.targetAmount = Math.round(convertCurrency(target, 'EUR', pk.a.currency) * 100) / 100; // one target for both
    }
    Object.assign(rec, { pocket: ref, links: [ref], monthly: null });
  } else {
    if (!p.links.length) return fail('Tick at least one place where the money is.');
    const monthly = parseFloat(g('gf-monthly').replace(',', '.'));
    Object.assign(rec, { pocket: null, links: p.links.slice(), monthly: monthly > 0 ? monthly : null });
  }
  if (!Array.isArray(data.goals)) data.goals = [];
  let saved;
  if (p.id) { saved = data.goals.find(x => x.id === p.id); Object.assign(saved, rec); }
  else { saved = Object.assign({ id: uid('goal'), createdAt: new Date().toISOString() }, rec); data.goals.push(saved); }
  save();
  ui.modal = { type: 'goalView', payload: { id: saved.id, slide: 0 } };
  render(); startGoalGallery();
  setTimeout(() => photoCleanup().catch(() => {}), 500);
}
function deleteGoal(id) {
  const g = (data.goals || []).find(x => x.id === id); if (!g) return;
  if (!confirm(`Delete the goal "${g.name}"? Your money${g.pocket ? ' and its pocket' : ''} aren't touched.`)) return;
  data.goals = data.goals.filter(x => x.id !== id);
  ui.modal = null;
  save(); render();
}

/* ---- Emergency savings ---- */
function defaultEmergencyLinks() {
  const ids = [];
  (data.accounts || []).forEach(a => {
    if (isSavingsName(a.name)) ids.push('main:' + a.id, ...(a.pockets || []).map(p => 'pk:' + a.id + ':' + p.id));
    else (a.pockets || []).filter(p => isSavingsName(p.name)).forEach(p => ids.push('pk:' + a.id + ':' + p.id));
  });
  return ids.length ? ids : (data.accounts || []).filter(a => a.visibleInTotals).map(a => 'main:' + a.id);
}
/* The emergency cushion's money: main balances and pockets, each ticked on its own. A whole
   account ticked before (acc:, main balance + pockets) reads as its main balance and each of
   its pockets — same total, and each pocket can then be unticked. */
function emergencyLinks() {
  const ef = data.emergencyFund || {};
  const out = [];
  (ef.links || defaultEmergencyLinks()).forEach(id => {
    const [kind, x] = id.split(':');
    const a = kind === 'acc' && accountById(x);
    if (a) out.push('main:' + a.id, ...(a.pockets || []).map(p => 'pk:' + a.id + ':' + p.id));
    else out.push(id);
  });
  return Array.from(new Set(out));
}
function emergencyState() {
  const ef = data.emergencyFund || {};
  const spend = avgMonthlyExpenses(3, ef.excludeCats);
  const links = emergencyLinks();
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
  // Bank accounts and pockets apart: each bank's main balance, then its pockets.
  const box = (id, label, sub) => `<label class="ll-row ${sub ? 'sub' : ''}"><input type="checkbox" ${s.links.includes(id) ? 'checked' : ''} onchange="toggleEmergencyLink('${escHtml(id)}')"><span>${label}</span><span class="dim" style="margin-left:auto;">${fmtMoney(sourceValue(id))}</span></label>`;
  const banks = (data.accounts || []).map(a => `<div class="ll-group"><div class="ll-head">${escHtml(a.name)}</div>
      ${box('main:' + a.id, (a.pockets || []).length ? 'Main balance <span class="dim">(outside pockets)</span>' : 'Balance')}
      ${(a.pockets || []).map(p => box('pk:' + a.id + ':' + p.id, `${escHtml(p.icon || '')} ${escHtml(p.name)} <span class="dim">· pocket</span>`, true)).join('')}
    </div>`).join('');
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
      <div class="dim" style="margin:-2px 0 6px;">Each bank's main balance and its pockets are ticked apart, so a pocket for a trip or a bike doesn't count as your cushion.</div>
      <div class="link-list">${banks || '<div class="dim">Add a bank account first.</div>'}</div>
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
  const l = emergencyLinks();
  ef.links = l.includes(id) ? l.filter(x => x !== id) : l.concat(id);
  save(); render();
}
