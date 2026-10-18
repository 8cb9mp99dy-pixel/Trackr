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
    // The first plan (VAT, Invest 25 %, Day-to-day 25 % kept) becomes the new default order if
    // it was never edited: savings first, pockets second, 25 % to Revolut for the month.
    if (p.version !== 2) {
      const sig = (p.steps || []).map(x => [x.id, x.label, x.pct, x.to || '', !!x.setAside, x.onlyCat || ''].join('|')).join(';');
      if (sig === 'ip_vat|VAT|21||true|inc_freelance;ip_invest|Invest|25||false|;ip_daily|Day-to-day spending|25|stay|false|') p.steps = cloneJson(defaultData().incomePlan.steps);
      p.version = 2;
    }
    return p;
  };

  /* Where a step's money goes when you haven't chosen yet: a pocket or broker whose name fits. */
  window.incomeStepTarget = function (s) {
    if (s.to) return s.to;
    const pockets = data.accounts.flatMap(a => (a.pockets || []).map(p => ({ ref: `pk:${a.id}:${p.id}`, name: p.name })));
    if (/vat|btw|tva|tax/i.test(s.label)) { const p = pockets.find(x => /vat|btw|tva|tax/i.test(x.name)); return p ? p.ref : ''; }
    if (/invest|saving/i.test(s.label)) {
      const b = data.brokers.find(x => /trade republic/i.test(x.name)) || data.brokers[0];
      return b ? 'brk:' + b.id : '';
    }
    if (/pocket/i.test(s.label)) {
      // A pocket still short of its target (not the VAT one), else any other pocket.
      const all = data.accounts.flatMap(a => (a.pockets || []).map(p => ({ ref: `pk:${a.id}:${p.id}`, p }))).filter(x => !/vat|btw|tva|tax/i.test(x.p.name));
      const open = all.find(x => x.p.targetAmount > 0 && x.p.amountSaved < x.p.targetAmount) || all[0];
      return open ? open.ref : '';
    }
    if (/month|day|spend|expense/i.test(s.label)) {
      const r = data.accounts.find(a => /revolut/i.test(a.name));
      return r ? 'acc:' + r.id : 'stay';
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
  /* The sheet reads as a short list (part → place → amount). "Change" shows the inputs. */
  const placeText = (ref, from) => (ref === 'stay' || (from && ref === 'acc:' + from) ? 'stays in the account' : !ref ? 'choose where' : shortPlace({ ref, label: (transferEndpoint(ref) || {}).label || 'choose where' }));
  window.__modalRenderers.incomeSplit = function (p) {
    const t = data.budgetTransactions.find(x => x.id === p.txId);
    if (!t) return '';
    const cat = categoryById('income', t.categoryId);
    const used = p.lines.filter(l => l.on).reduce((s, l) => s + (+l.amount || 0), 0);
    const rest = Math.round((t.amount - used) * 100) / 100;
    const src = accountById(p.from);
    const missing = p.lines.some(l => l.on && !l.to && l.amount > 0);
    const rows = p.edit ? p.lines.map((l, i) => `
        <div class="split-line ${l.on ? '' : 'off'}">
          <input type="checkbox" ${l.on ? 'checked' : ''} onchange="ui.modal.payload.lines[${i}].on=this.checked;render();" aria-label="Use ${escHtml(l.label)}">
          <div class="split-what"><div style="font-weight:600;">${escHtml(l.label)} <span style="opacity:.5;font-weight:500;">${l.pct}%</span></div>
            <select class="mini-select" onchange="ui.modal.payload.lines[${i}].to=this.value;render();" aria-label="Where ${escHtml(l.label)} goes">${placeOptions(l.to, true)}</select></div>
          <input class="split-amt" type="number" step="0.01" min="0" value="${(+l.amount || 0).toFixed(2)}" onchange="ui.modal.payload.lines[${i}].amount=Math.max(0, parseFloat(this.value)||0);render();" aria-label="Amount for ${escHtml(l.label)}">
        </div>`).join('')
      : p.lines.filter(l => l.on).map(l => `
        <div class="split-row"><span class="split-row-what">${escHtml(l.label)} <span class="dim">${l.pct}%</span></span><span class="split-row-to ${l.to ? '' : 'negative'}">${escHtml(placeText(l.to, p.from))}</span><b>${fmtMoney(l.amount, t.currency)}</b></div>`).join('');
    return `
      <div class="modal-head"><div class="modal-title">Split this income</div><button class="close-x" onclick="closeModal()">✕</button></div>
      <div class="split-head"><div style="font-weight:700;">${escHtml(t.comment || (cat ? cat.name : 'Income'))} · ${fmtMoney(t.amount, t.currency)}</div>
        <div style="font-size:12.5px;opacity:.6;">${escHtml(cat ? cat.name : '')} · ${escHtml(shortDay(t.date))} · in ${escHtml(src ? src.name : '?')}</div></div>
      ${p.edit ? `<label class="field"><span class="label-text">It landed in</span>
        <select id="is-from" onchange="ui.modal.payload.from=this.value;render();">${data.accounts.map(a => `<option value="${a.id}" ${p.from === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select></label>` : ''}
      <div class="split-lines">${rows}
        <div class="split-row split-rest"><span class="split-row-what">Left</span><span class="split-row-to">stays in ${escHtml(src ? src.name : 'the account')}</span><b class="${rest < 0 ? 'negative' : ''}">${fmtMoney(rest, t.currency)}</b></div>
      </div>
      ${rest < -0.004 ? '<div class="negative" style="font-size:12.5px;margin-top:6px;">That is more than the income. Lower an amount.</div>' : ''}
      ${missing ? `<div style="font-size:12.5px;margin-top:6px;">Choose where each part goes${p.edit ? '' : ' (Change)'}.</div>` : ''}
      <button type="button" class="link-btn" style="margin:10px 0 14px;" onclick="ui.modal.payload.edit=!ui.modal.payload.edit;render();">${p.edit ? 'Done changing' : 'Change amounts or places'}</button>
      <div class="grid-2">
        <button class="btn primary" onclick="applyIncomeSplit()" ${rest < -0.004 || !src || missing ? 'disabled' : ''}>Split now</button>
        <button class="btn" onclick="skipIncomeSplit('${t.id}')">Not this one</button>
      </div>
      <div style="font-size:11.5px;opacity:.5;margin-top:10px;">Saved as transfers in Trackr. Do the same moves in your banking app.</div>`;
  };
  window.applyIncomeSplit = function () {
    const p = ui.modal && ui.modal.payload;
    const t = p && data.budgetTransactions.find(x => x.id === p.txId);
    const src = p && accountById(p.from);
    if (!t || !src) return;
    const lines = p.lines.filter(l => l.on && l.amount > 0 && l.to !== 'stay' && l.to !== 'acc:' + src.id);
    if (lines.some(l => !l.to || !transferEndpoint(l.to))) { alert('Choose where each part goes.'); return; }
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

  /* ---- Budget → Income plan ----
     The plan has two parts: VAT, set aside first (from freelance), and then your own split of
     what's left. In data it's one list: the VAT step has setAside: true, the others don't. */
  const vatStep = p => p.steps.find(x => x.setAside) || null;
  const partSteps = p => p.steps.filter(x => !x.setAside);
  window.toggleIncomePlan = function () { const p = incomePlan(); p.on = !p.on; save(); render(); };
  /* Kept for small edits from elsewhere (and tests): field = label | pct | to | onlyCat. */
  window.setIncomeStep = function (i, field, value) {
    const s = incomePlan().steps[i];
    if (!s) return;
    s[field] = field === 'pct' ? Math.max(0, Math.min(100, parseFloat(String(value).replace(',', '.')) || 0)) : value;
    save(); render();
  };

  /* The editor: two short steps on a copy of the plan, saved at the end. */
  window.openIncomePlanEditor = function (step) {
    const p = incomePlan(), v = vatStep(p);
    ui.modal = { type: 'incomePlanEdit', payload: {
      step: step || 1, cats: p.triggerCats.slice(),
      vatOn: !!v, vatPct: v ? v.pct : 21, vatTo: v ? incomeStepTarget(v) : incomeStepTarget({ label: 'VAT', to: '' }), vatCat: v ? (v.onlyCat || '') : 'inc_freelance',
      parts: partSteps(p).map(x => ({ id: x.id, label: x.label, pct: x.pct, to: incomeStepTarget(x) })),
    } };
    render();
  };
  const D = () => ui.modal.payload;
  window.ipSet = function (field, value, i) {
    const d = D();
    const num = v => Math.max(0, Math.min(100, parseFloat(String(v).replace(',', '.')) || 0));
    if (i == null) d[field] = field === 'vatPct' ? num(value) : value;
    else d.parts[i][field] = field === 'pct' ? num(value) : value;
    render();
  };
  window.ipToggleCat = function (id) { const d = D(); d.cats = d.cats.includes(id) ? d.cats.filter(c => c !== id) : d.cats.concat([id]); render(); };
  window.ipAddPart = function () { D().parts.push({ id: uid('ip'), label: '', pct: 10, to: 'stay' }); render(); };
  window.ipRemovePart = function (i) { D().parts.splice(i, 1); render(); };
  window.saveIncomePlan = function () {
    const d = D(), p = incomePlan();
    if (!d.cats.length) { alert('Choose at least one kind of income.'); return; }
    const parts = d.parts.filter(x => (x.label || '').trim() || x.pct > 0).map(x => ({ id: x.id, label: (x.label || '').trim() || 'Part', pct: x.pct, setAside: false, onlyCat: '', to: x.to || 'stay' }));
    p.triggerCats = d.cats.slice();
    p.steps = (d.vatOn ? [{ id: (vatStep(p) || {}).id || 'ip_vat', label: 'VAT', pct: d.vatPct, setAside: true, onlyCat: d.cats.includes(d.vatCat) ? d.vatCat : '', to: d.vatTo || '' }] : []).concat(parts);
    p.on = true;
    save(); closeModal();
  };
  window.__modalRenderers.incomePlanEdit = function (d) {
    const cats = data.categories.income || [];
    const head = `<div class="modal-head"><div class="modal-title">Income plan</div><button class="close-x" onclick="closeModal()">✕</button></div>
      <div class="tx-steps">${[['Which payments', 1], ['Your split', 2]].map(([l, n]) => `<button type="button" class="tx-step ${d.step === n ? 'on' : ''}" onclick="ui.modal.payload.step=${n};render();"><span>${n}</span>${l}</button>`).join('')}</div>`;
    if (d.step === 1) {
      return `${head}
        <div class="tx-label">Which payments do you want to split?</div>
        <div class="tx-chips">${cats.map(c => `<button type="button" class="tx-chip ${d.cats.includes(c.id) ? 'on' : ''}" onclick="ipToggleCat('${c.id}')">${c.icon || ''} ${escHtml(c.name)}</button>`).join('')}</div>
        <div class="ip-vat">
          <label class="switch-row"><button class="toggle ${d.vatOn ? 'on' : ''}" onclick="ipSet('vatOn', ${!d.vatOn})" aria-label="Set VAT aside"></button><span style="font-weight:600;">Set VAT aside first</span></label>
          ${d.vatOn ? `<div class="ip-vat-row">
            <span class="split-pct"><input type="number" min="0" max="100" step="0.5" value="${d.vatPct}" onchange="ipSet('vatPct', this.value)" aria-label="VAT percent">%</span>
            <span>of</span>
            <select class="mini-select" onchange="ipSet('vatCat', this.value)" aria-label="Which income pays VAT">
              ${cats.filter(c => d.cats.includes(c.id)).map(c => `<option value="${c.id}" ${d.vatCat === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}<option value="" ${!d.vatCat ? 'selected' : ''}>every payment</option></select>
            <span>to</span>
            <select class="mini-select" onchange="ipSet('vatTo', this.value)" aria-label="Where VAT goes">${placeOptions(d.vatTo, false)}</select>
          </div>` : ''}
        </div>
        <button class="btn primary full" style="margin-top:16px;" onclick="ui.modal.payload.step=2;render();" ${d.cats.length ? '' : 'disabled'}>Next</button>`;
    }
    const total = d.parts.reduce((s, x) => s + (+x.pct || 0), 0);
    const exCat = d.vatOn && d.vatCat && d.cats.includes(d.vatCat) ? d.vatCat : d.cats[0];
    const ex = incomeSplit(1000, exCat, (d.vatOn ? [{ id: 'v', label: 'VAT', pct: d.vatPct, setAside: true, onlyCat: d.vatCat }] : []).concat(d.parts.map(x => ({ id: x.id, label: x.label || 'Part', pct: x.pct }))));
    const exName = (categoryById('income', exCat) || {}).name || 'income';
    return `${head}
      <div class="tx-label">${d.vatOn ? 'After VAT, how do you split the rest?' : 'How do you split it?'}</div>
      <div class="ip-parts">
        ${d.parts.map((x, i) => `
        <div class="ip-part">
          <input class="ip-name" value="${escHtml(x.label)}" placeholder="e.g. Invest" onchange="ipSet('label', this.value, ${i})" aria-label="Name">
          <span class="split-pct"><input type="number" min="0" max="100" step="1" value="${x.pct}" onchange="ipSet('pct', this.value, ${i})" aria-label="Percent">%</span>
          <select class="mini-select ip-to" onchange="ipSet('to', this.value, ${i})" aria-label="Where it goes">${placeOptions(x.to, true)}</select>
          <button class="icon-btn-round" style="width:28px;height:28px;background:none;border:none;" onclick="ipRemovePart(${i})" aria-label="Remove">${ic('trash')}</button>
        </div>`).join('')}
      </div>
      <button class="btn small" style="margin-top:8px;" onclick="ipAddPart()">+ Add a part</button>
      <div class="ip-left ${total > 100 ? 'negative' : ''}">${total > 100 ? `That's ${total}%. Keep it at 100% or less.` : `${100 - total}% left stays in the account.`}</div>
      <div class="split-example"><div class="eyebrow">${escHtml(exName)} of ${fmtMoney(1000)}</div>
        ${ex.lines.map(l => `<div class="split-row"><span class="split-row-what">${escHtml(l.step.label)}</span><b>${fmtMoney(l.amount)}</b></div>`).join('')}
        <div class="split-row split-rest"><span class="split-row-what">Stays in the account</span><b>${fmtMoney(ex.rest)}</b></div></div>
      <div class="grid-2" style="margin-top:14px;">
        <button class="btn" onclick="ui.modal.payload.step=1;render();">Back</button>
        <button class="btn primary" onclick="saveIncomePlan()" ${total > 100 ? 'disabled' : ''}>Save plan</button>
      </div>`;
  };

  window.incomePlanTab = function () {
    const p = incomePlan(), v = vatStep(p), parts = partSteps(p);
    const catNames = p.triggerCats.map(id => (categoryById('income', id) || {}).name).filter(Boolean);
    const total = parts.reduce((s, x) => s + (+x.pct || 0), 0);
    const pending = incomePlanPending();
    const vatCat = v && v.onlyCat ? (categoryById('income', v.onlyCat) || {}).name : '';
    const exCat = v && v.onlyCat ? v.onlyCat : p.triggerCats[0];
    const ex = exCat ? incomeSplit(1000, exCat, p.steps) : null;
    return `
    <div class="card" style="margin-bottom:16px;">
      <div class="row-flex" style="gap:10px;">
        <div style="min-width:0;"><div style="font-weight:700;font-size:16px;">Income plan</div>
          <div style="font-size:12.5px;opacity:.6;">When you get paid, Trackr suggests how to split it.</div></div>
        <label class="switch-row"><button class="toggle ${p.on ? 'on' : ''}" onclick="toggleIncomePlan()" aria-label="Income plan on"></button><span>${p.on ? 'On' : 'Off'}</span></label>
      </div>
      <div class="ip-summary">
        <div class="ip-sum-row dim">For ${escHtml(catNames.join(', ') || 'no income yet')}</div>
        ${v ? `<div class="ip-sum-row"><b class="ip-pct">${v.pct}%</b><span>VAT${vatCat ? ` on ${escHtml(vatCat)}` : ''}</span><span class="dim">${escHtml(placeText(incomeStepTarget(v)))}</span></div>` : ''}
        ${v && parts.length ? '<div class="ip-sum-row dim" style="padding-left:2px;">Then, of what\'s left:</div>' : ''}
        ${parts.map(x => `<div class="ip-sum-row"><b class="ip-pct">${x.pct}%</b><span>${escHtml(x.label)}</span><span class="dim">${escHtml(placeText(incomeStepTarget(x)))}</span></div>`).join('')}
        ${total < 100 ? `<div class="ip-sum-row"><b class="ip-pct dim">${100 - total}%</b><span class="dim">Left</span><span class="dim">stays in the account</span></div>` : ''}
      </div>
      ${ex ? `<div class="split-example" style="margin-top:12px;"><div class="eyebrow">Example: ${escHtml((categoryById('income', exCat) || {}).name || '')} of ${fmtMoney(1000)}</div>
        <div style="font-size:13px;">${ex.lines.map(l => `${escHtml(l.step.label)} <b>${fmtMoney(l.amount)}</b>`).join(' · ')} · stays <b>${fmtMoney(ex.rest)}</b></div></div>` : ''}
      <button class="btn primary" style="margin-top:14px;" onclick="openIncomePlanEditor()">Edit plan</button>
    </div>
    ${pending.length ? `<div class="card"><div class="eyebrow" style="margin-bottom:8px;">Waiting to be split</div>
      ${pending.map(t => `<div class="split-row"><span class="split-row-what">${escHtml(t.comment || 'Income')} <span class="dim">· ${escHtml(shortDay(t.date))}</span></span><b>${fmtMoney(t.amount, t.currency)}</b><span style="display:flex;gap:6px;justify-content:flex-end;"><button class="btn small primary" onclick="openIncomeSplit('${t.id}')">Split</button><button class="btn small" onclick="skipIncomeSplit('${t.id}')">Skip</button></span></div>`).join('')}</div>` : ''}`;
  };
}
