/* ===================== Budget → Income plan =====================
 * When a salary or a freelance payment comes in, Trackr offers to split it the way you decided:
 * e.g. VAT 21 % to the "VAT Storage" pocket (freelance only), 25 % invested at your broker,
 * 25 % kept for day-to-day spending. Applying it records ordinary transfers from the account
 * the income landed in, so pockets, broker cash and balances follow. Nothing moves real money:
 * it records what you do (or are about to do) in your banking app.
 *
 * data.incomePlan = { on, since (incomes from this day are offered), triggerCats: [income
 *   category ids], steps: [{ id, label, pct, setAside (taken first, from the whole amount),
 *   onlyCat ('' = every income in triggerCats), to (a transfer ref, 'stay' = stays in the
 *   account, '' = guessed from the label) }] }
 * An income that was split (or skipped) keeps { split: { at, skipped?, transfers: [ids] } }.
 * The first half is pure and tested in Node (tests/unit/allocation.test.js).
 */

/* Steps that apply to an income of this category, with their amounts. Set-aside steps (taxes)
   are taken from the whole amount first; the other percentages apply to what's left after them.
   Never gives out more than the income: once it's used up, later steps get what remains. */
function incomeSplit(amount, catId, steps) {
  const r2 = n => Math.round(n * 100) / 100;
  const gross = Math.max(0, +amount || 0);
  const mine = (steps || []).filter(s => (+s.pct || 0) > 0 && (!s.onlyCat || s.onlyCat === catId));
  let left = gross;
  const lines = [];
  const take = (s, want) => { const amt = r2(Math.min(left, Math.max(0, want))); left = r2(left - amt); lines.push({ step: s, pct: +s.pct, amount: amt }); };
  mine.filter(s => s.setAside).forEach(s => take(s, gross * s.pct / 100));
  const base = left;
  mine.filter(s => !s.setAside).forEach(s => take(s, base * s.pct / 100));
  return { gross, base, lines, rest: left };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { incomeSplit };

if (typeof window !== 'undefined') {
  window.incomePlan = function () {
    const p = data.incomePlan || (data.incomePlan = cloneJson(defaultData().incomePlan));
    if (!p.since) p.since = todayYmd(); // only incomes from the day the plan exists are offered
    return p;
  };

  /* Where a step's money goes when you haven't chosen yet: a pocket or broker whose name fits. */
  window.incomeStepTarget = function (s) {
    if (s.to) return s.to;
    const pockets = data.accounts.flatMap(a => (a.pockets || []).map(p => ({ ref: `pk:${a.id}:${p.id}`, name: p.name })));
    if (/vat|btw|tva|tax/i.test(s.label)) { const p = pockets.find(x => /vat|btw|tva|tax/i.test(x.name)); return p ? p.ref : ''; }
    if (/invest/i.test(s.label)) {
      const b = data.brokers.find(x => /trade republic/i.test(x.name)) || data.brokers[0];
      return b ? 'brk:' + b.id : '';
    }
    return 'stay';
  };
  const placeLabel = ref => (ref === 'stay' ? 'stays in the account' : ref && parseTransferRef(ref) && parseTransferRef(ref).kind === 'pk' ? shortPlace({ ref, label: (transferEndpoint(ref) || {}).label || '' }) : ((transferEndpoint(ref) || {}).label || 'choose where'));
  window.incomePlanTriggers = function (t) {
    const p = incomePlan();
    if (!p.on || !t || t.type !== 'income' || !(p.triggerCats || []).includes(t.categoryId)) return false;
    const acc = t.accountId && accountById(t.accountId);
    return !(acc && typeof isCashWallet === 'function' && isCashWallet(acc)); // cash in the wallet isn't split
  };
  /* Incomes waiting to be split: from the plan's start, not split or skipped yet, already received. */
  window.incomePlanPending = function () {
    const p = incomePlan(), today = todayYmd();
    return data.budgetTransactions.filter(t => incomePlanTriggers(t) && !t.split && t.date >= p.since && t.date <= today)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  };

  /* ---- The split sheet ---- */
  window.openIncomeSplit = function (txId) {
    const t = data.budgetTransactions.find(x => x.id === txId);
    if (!t) return;
    const S = incomeSplit(t.amount, t.categoryId, incomePlan().steps);
    ui.modal = { type: 'incomeSplit', payload: {
      txId, from: t.accountId || (data.accounts.find(a => !(typeof isCashWallet === 'function' && isCashWallet(a))) || {}).id || '',
      lines: S.lines.map(l => ({ id: l.step.id, label: l.step.label, pct: l.pct, amount: l.amount, to: incomeStepTarget(l.step), on: true })),
    } };
    render();
  };
  /* Offered right after you add an income by hand. */
  window.incomePlanOffer = function (t) {
    if (incomePlanTriggers(t) && !t.split && incomeSplit(t.amount, t.categoryId, incomePlan().steps).lines.length) openIncomeSplit(t.id);
  };
  const placeOptions = (sel, withStay) => `${withStay ? `<option value="stay" ${sel === 'stay' ? 'selected' : ''}>Keep in the account</option>` : ''}
    <option value="" ${!sel ? 'selected' : ''} disabled>Choose where…</option>
    ${transferEndpointOptions().map(g => `<optgroup label="${escHtml(g.label)}">${g.items.map(it => `<option value="${escHtml(it.ref)}" ${it.ref === sel ? 'selected' : ''}>${escHtml(shortPlace(it))}</option>`).join('')}</optgroup>`).join('')}`;
  /* Pockets read "VAT Storage · Bank" here, so a narrow select still shows the pocket's name. */
  const shortPlace = it => {
    const ep = parseTransferRef(it.ref);
    if (!ep || ep.kind !== 'pk') return it.label;
    const a = accountById(ep.accountId), pk = a && (a.pockets || []).find(p => p.id === ep.pocketId);
    return pk ? `${pk.icon || ''} ${pk.name} · ${a.name}`.trim() : it.label;
  };
  window.__modalRenderers.incomeSplit = function (p) {
    const t = data.budgetTransactions.find(x => x.id === p.txId);
    if (!t) return '';
    const cat = categoryById('income', t.categoryId);
    const used = p.lines.filter(l => l.on).reduce((s, l) => s + (+l.amount || 0), 0);
    const rest = Math.round((t.amount - used) * 100) / 100;
    const src = accountById(p.from);
    return `
      <div class="modal-head"><div class="modal-title">Split this income</div><button class="close-x" onclick="closeModal()">✕</button></div>
      <div class="split-head"><div style="font-weight:700;">${escHtml(t.comment || (cat ? cat.name : 'Income'))}</div>
        <div style="font-size:12.5px;opacity:.6;">${escHtml(cat ? cat.name : '')} · ${escHtml(shortDay(t.date))} · <b>${fmtMoney(t.amount, t.currency)}</b></div></div>
      <label class="field"><span class="label-text">It landed in</span>
        <select id="is-from" onchange="ui.modal.payload.from=this.value;render();">${data.accounts.map(a => `<option value="${a.id}" ${p.from === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select></label>
      <div class="split-lines">
        ${p.lines.map((l, i) => `
        <div class="split-line ${l.on ? '' : 'off'}">
          <input type="checkbox" ${l.on ? 'checked' : ''} onchange="ui.modal.payload.lines[${i}].on=this.checked;render();" aria-label="Use ${escHtml(l.label)}">
          <div class="split-what"><div style="font-weight:600;">${escHtml(l.label)} <span style="opacity:.5;font-weight:500;">${l.pct}%</span></div>
            <select class="mini-select" onchange="ui.modal.payload.lines[${i}].to=this.value;render();" aria-label="Where ${escHtml(l.label)} goes">${placeOptions(l.to, true)}</select></div>
          <input class="split-amt" type="number" step="0.01" min="0" value="${(+l.amount || 0).toFixed(2)}" onchange="ui.modal.payload.lines[${i}].amount=Math.max(0, parseFloat(this.value)||0);render();" aria-label="Amount for ${escHtml(l.label)}">
        </div>`).join('')}
        <div class="split-line rest"><span></span><div class="split-what"><div style="font-weight:600;">Not assigned</div><div style="font-size:12px;opacity:.6;">stays in ${escHtml(src ? src.name : 'the account')}</div></div>
          <b class="${rest < 0 ? 'negative' : ''}" style="text-align:right;">${fmtMoney(rest, t.currency)}</b></div>
      </div>
      ${rest < -0.004 ? '<div class="negative" style="font-size:12.5px;margin-top:6px;">That is more than the income. Lower an amount.</div>' : ''}
      ${p.lines.some(l => l.on && !l.to && l.amount > 0) ? '<div style="font-size:12.5px;margin-top:6px;opacity:.75;">Choose where each part goes.</div>' : ''}
      <div style="font-size:12px;opacity:.55;margin:10px 0 14px;">Recorded as transfers from ${escHtml(src ? src.name : 'the account')}, so pockets and broker cash follow. Make the same moves in your banking app.</div>
      <div class="grid-2">
        <button class="btn primary" onclick="applyIncomeSplit()" ${rest < -0.004 || !src ? 'disabled' : ''}>Split now</button>
        <button class="btn" onclick="skipIncomeSplit('${t.id}')">Not this one</button>
      </div>`;
  };
  window.applyIncomeSplit = function () {
    const p = ui.modal && ui.modal.payload;
    const t = p && data.budgetTransactions.find(x => x.id === p.txId);
    const src = p && accountById(p.from);
    if (!t || !src) return;
    const lines = p.lines.filter(l => l.on && l.amount > 0 && l.to !== 'stay');
    if (lines.some(l => !l.to || !transferEndpoint(l.to))) { alert('Choose where each part goes.'); return; }
    if (lines.some(l => l.to === 'acc:' + src.id)) { alert(`One part goes back to ${src.name}, where the income already is. Pick "Keep in the account" instead.`); return; }
    const date = t.date > todayYmd() ? t.date : todayYmd();
    const ids = [];
    lines.forEach(l => {
      const rec = { id: uid('tx'), date, type: 'transfer', categoryId: null, subCategoryId: null, nature: 'Variable', paymentMethodId: null, accountId: null,
        currency: t.currency, amount: Math.round(l.amount * 100) / 100, comment: `${l.label} · ${t.comment || 'income'}`, location: '', description: `Income plan (${l.pct}%)`, logo: '', impact: '',
        from: 'acc:' + src.id, to: l.to, fromLabel: src.name, toLabel: transferEndpoint(l.to).label, splitOf: t.id };
      data.budgetTransactions.push(rec);
      applyTxToAccountBalance(rec, 1);
      ids.push(rec.id);
    });
    t.split = { at: new Date().toISOString(), transfers: ids };
    save(); closeModal();
  };
  window.skipIncomeSplit = function (txId) {
    const t = data.budgetTransactions.find(x => x.id === txId);
    if (!t) return;
    t.split = { at: new Date().toISOString(), skipped: true, transfers: [] };
    save();
    if (ui.modal && ui.modal.type === 'incomeSplit') closeModal(); else render();
  };

  /* ---- Budget → Income plan tab ---- */
  window.setIncomeStep = function (i, field, value) {
    const s = incomePlan().steps[i];
    if (!s) return;
    if (field === 'pct') s.pct = Math.max(0, Math.min(100, parseFloat(String(value).replace(',', '.')) || 0));
    else if (field === 'setAside') s.setAside = !s.setAside;
    else s[field] = value;
    save(); render();
  };
  window.addIncomeStep = function () { incomePlan().steps.push({ id: uid('ip'), label: 'New part', pct: 10, setAside: false, onlyCat: '', to: '' }); save(); render(); };
  window.removeIncomeStep = function (i) { incomePlan().steps.splice(i, 1); save(); render(); };
  window.moveIncomeStep = function (i, d) { const st = incomePlan().steps, j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; save(); render(); };
  window.toggleIncomeTrigger = function (catId) {
    const p = incomePlan();
    p.triggerCats = p.triggerCats.includes(catId) ? p.triggerCats.filter(c => c !== catId) : p.triggerCats.concat([catId]);
    save(); render();
  };
  window.toggleIncomePlan = function () { const p = incomePlan(); p.on = !p.on; save(); render(); };

  window.incomePlanTab = function () {
    const p = incomePlan(), cats = data.categories.income || [];
    const pending = incomePlanPending();
    const recent = data.budgetTransactions.filter(t => t.type === 'income' && t.split && !t.split.skipped).sort((a, b) => (a.split.at < b.split.at ? 1 : -1)).slice(0, 4);
    const example = catId => {
      const S = incomeSplit(1000, catId, p.steps), c = categoryById('income', catId);
      return `<div class="split-example"><div class="eyebrow">${escHtml(c ? c.name : 'Income')} of ${fmtMoney(1000)}</div>
        ${S.lines.map(l => `<div class="split-ex-row"><span>${escHtml(l.step.label)} <span style="opacity:.5;">${l.pct}%${l.step.setAside ? '' : S.base !== S.gross ? ' of ' + fmtMoney(S.base) : ''}</span></span><span style="opacity:.6;">${escHtml(placeLabel(incomeStepTarget(l.step)))}</span><b>${fmtMoney(l.amount)}</b></div>`).join('')}
        <div class="split-ex-row" style="opacity:.7;"><span>Not assigned</span><span>stays in the account</span><b>${fmtMoney(S.rest)}</b></div></div>`;
    };
    const total = p.steps.filter(s => !s.setAside).reduce((s, x) => s + (+x.pct || 0), 0);
    return `
    <div class="card" style="margin-bottom:16px;">
      <div class="row-flex" style="gap:10px;flex-wrap:wrap;">
        <div style="min-width:0;"><div style="font-weight:700;font-size:16px;">Income plan</div>
          <div style="font-size:12.5px;opacity:.6;">When one of these incomes comes in, Trackr offers to split it.</div></div>
        <label class="switch-row"><button class="toggle ${p.on ? 'on' : ''}" onclick="toggleIncomePlan()" aria-label="Income plan on"></button><span>${p.on ? 'On' : 'Off'}</span></label>
      </div>
      <div class="tx-label" style="margin-top:14px;">Incomes to split</div>
      <div class="tx-chips">${cats.map(c => `<button type="button" class="tx-chip ${p.triggerCats.includes(c.id) ? 'on' : ''}" onclick="toggleIncomeTrigger('${c.id}')">${c.icon || ''} ${escHtml(c.name)}</button>`).join('')}</div>
      <div class="tx-label" style="margin-top:16px;">Parts, in order</div>
      <div class="split-steps">
        ${p.steps.map((s, i) => `
        <div class="split-step">
          <div class="split-step-top">
            <input class="split-step-name" value="${escHtml(s.label)}" onchange="setIncomeStep(${i},'label',this.value)" aria-label="Name of this part">
            <span class="split-pct"><input type="number" min="0" max="100" step="0.5" value="${s.pct}" onchange="setIncomeStep(${i},'pct',this.value)" aria-label="Percent">%</span>
            <button class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" onclick="moveIncomeStep(${i},-1)" aria-label="Move up" ${i ? '' : 'disabled'}>↑</button>
            <button class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" onclick="removeIncomeStep(${i})" aria-label="Remove this part">${ic('trash')}</button>
          </div>
          <div class="split-step-opts">
            <select class="mini-select" onchange="setIncomeStep(${i},'onlyCat',this.value)" aria-label="Which incomes">
              <option value="">Every income above</option>${cats.filter(c => p.triggerCats.includes(c.id)).map(c => `<option value="${c.id}" ${s.onlyCat === c.id ? 'selected' : ''}>Only ${escHtml(c.name)}</option>`).join('')}</select>
            <select class="mini-select" onchange="setIncomeStep(${i},'to',this.value)" aria-label="Where it goes">${placeOptions(incomeStepTarget(s), true)}</select>
            <label class="switch-row" title="Taken first, from the whole amount (for taxes like VAT). The other parts are a share of what's left."><button class="toggle ${s.setAside ? 'on' : ''}" onclick="setIncomeStep(${i},'setAside')" aria-label="Taken first"></button><span style="font-size:12.5px;">Taken first (tax)</span></label>
          </div>
        </div>`).join('')}
      </div>
      <button class="btn small" style="margin-top:10px;" onclick="addIncomeStep()">+ Add a part</button>
      ${total > 100 ? `<div class="negative" style="font-size:12.5px;margin-top:8px;">The parts add up to ${total}%. Later parts get only what's left.</div>` : ''}
      <div class="split-examples">${p.triggerCats.map(example).join('')}</div>
    </div>
    ${pending.length ? `<div class="card" style="margin-bottom:16px;"><div class="eyebrow" style="margin-bottom:8px;">Waiting to be split</div>
      ${pending.map(t => `<div class="split-ex-row"><span>${escHtml(t.comment || 'Income')} <span style="opacity:.5;">· ${escHtml(shortDay(t.date))}</span></span><b>${fmtMoney(t.amount, t.currency)}</b><span style="display:flex;gap:6px;justify-content:flex-end;"><button class="btn small primary" onclick="openIncomeSplit('${t.id}')">Split</button><button class="btn small" onclick="skipIncomeSplit('${t.id}')">Not this one</button></span></div>`).join('')}</div>` : ''}
    ${recent.length ? `<div class="card"><div class="eyebrow" style="margin-bottom:8px;">Recently split</div>
      ${recent.map(t => `<div class="split-ex-row"><span>${escHtml(t.comment || 'Income')} <span style="opacity:.5;">· ${escHtml(shortDay(t.date))}</span></span><span style="opacity:.6;">${t.split.transfers.length} transfer${t.split.transfers.length === 1 ? '' : 's'}</span><b>${fmtMoney(t.amount, t.currency)}</b></div>`).join('')}</div>` : ''}`;
  };
}
