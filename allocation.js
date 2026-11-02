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
 *   account, '' = guessed from the label), color (a slice colour for a place that isn't a pocket) }],
 *   vatModes: { catId: 'incl' | 'excl' }, vatRoundUp, presets } — the VAT rate is the VAT step's pct.
 * A real payment is always split as VAT included (it's what landed in the bank); the incl./excl.
 * choice is for planning, e.g. from an invoice's amount before it's paid.
 * An income that was split (or skipped) keeps { split: { at, skipped?, transfers: [ids] } }.
 * The first half is pure and tested in Node (tests/unit/allocation.test.js).
 */

/* VAT on an amount at rate %. mode 'incl': the amount already holds the VAT (what lands in the
   bank), VAT = amount × rate / (100 + rate). mode 'excl': the amount is before VAT (an invoice's
   net), VAT = amount × rate / 100 comes on top. roundUp sets aside the VAT rounded up to the next
   whole euro (the user would rather keep €1 too much for the tax office than too little); those
   extra cents come out of what is split, so VAT + splittable is always exactly what's received. */
const r2 = n => Math.round(n * 100) / 100;
function vatSplit(amount, rate, mode, roundUp) {
  const a = Math.max(0, +amount || 0), r = Math.max(0, +rate || 0);
  const exact = r2(mode === 'excl' ? a * r / 100 : a * r / (100 + r));
  const received = r2(mode === 'excl' ? a + exact : a);
  const vat = roundUp && exact > 0 ? Math.min(received, Math.ceil(exact - 1e-9)) : exact;
  return { vat, exact, splittable: r2(received - vat), received };
}
/* Shares a total out by weights, in whole cents, so the shares always add up to the total
   exactly: everyone gets the cents below their exact share, then the cents left over go to the
   biggest fractions (largest-remainder method; ties to the first). */
function largestRemainder(total, weights) {
  const cents = Math.round(Math.max(0, +total || 0) * 100);
  const w = (weights || []).map(x => Math.max(0, +x || 0)), sum = w.reduce((a, b) => a + b, 0);
  if (!sum) return w.map(() => 0);
  const exact = w.map(x => cents * x / sum), out = exact.map(x => Math.floor(x + 1e-9));
  let left = cents - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]]++;
  return out.map(c => c / 100);
}
/* Percentages never add up to more than 100: once 100 is used, later parts get what remains. */
function capPercents(pcts) {
  let used = 0;
  return (pcts || []).map(p => { const v = Math.max(0, Math.min(+p || 0, 100 - used)); used += v; return v; });
}
/* Steps that apply to an income of this category, with their amounts. The VAT step (setAside) is
   taken first, as above (opts.vatMode, 'incl' by default: a payment that lands in the bank holds
   its VAT; opts.vatRoundUp, on unless false); the parts' percentages are of what's left after it (the splittable amount). Parts and
   what stays add up to the splittable amount to the cent. */
function incomeSplit(amount, catId, steps, opts) {
  const gross = Math.max(0, +amount || 0);
  const mine = (steps || []).filter(s => (+s.pct || 0) > 0 && (!s.onlyCat || s.onlyCat === catId));
  const vatStep = mine.find(s => s.setAside) || null;
  const o = opts || {};
  const V = vatStep ? vatSplit(gross, vatStep.pct, o.vatMode || 'incl', o.vatRoundUp !== false) : { vat: 0, exact: 0, splittable: r2(gross), received: r2(gross) };
  const parts = mine.filter(s => s !== vatStep);
  const pcts = capPercents(parts.map(s => s.pct));
  const used = pcts.reduce((a, b) => a + b, 0);
  const shares = largestRemainder(V.splittable, pcts.concat([Math.max(0, 100 - used)]));
  const lines = (vatStep ? [{ step: vatStep, pct: +vatStep.pct, amount: V.vat, vat: true }] : [])
    .concat(parts.map((s, i) => ({ step: s, pct: pcts[i], amount: shares[i] })));
  return { gross, base: V.splittable, received: V.received, vat: V.vat, vatExact: V.exact, lines, rest: shares[shares.length - 1] };
}
/* What a payment does to a pocket's goal: before and after (0–1 of the target), whether this one
   completes it, and how many more payments like it are needed after this one. */
function goalImpact(before, add, target) {
  const b = Math.max(0, +before || 0), a = Math.max(0, +add || 0), t = +target || 0;
  const after = r2(b + a);
  if (!(t > 0)) return { after, target: 0 };
  const already = b >= t - 0.004, completes = !already && after >= t - 0.004;
  const more = already || completes ? 0 : a > 0 ? Math.ceil((t - after) / a - 1e-9) : null;
  return { after, target: t, before: b, shareBefore: Math.min(1, b / t), shareAfter: Math.min(1, after / t), already, completes, more };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { incomeSplit, vatSplit, largestRemainder, capPercents, goalImpact };

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
      const all = data.accounts.flatMap(a => (a.pockets || []).filter(p => !p.finishedAt).map(p => ({ ref: `pk:${a.id}:${p.id}`, p }))).filter(x => !/vat|btw|tva|tax/i.test(x.p.name));
      const open = all.find(x => x.p.targetAmount > 0 && x.p.amountSaved < x.p.targetAmount) || all[0];
      return open ? open.ref : '';
    }
    if (/month|day|spend|expense/i.test(s.label)) {
      const r = data.accounts.find(a => /revolut/i.test(a.name));
      return r ? 'acc:' + r.id : 'stay';
    }
    return 'stay';
  };
  /* A destination's own name (a pocket, an account, a broker), used when a part has no name. */
  window.ipPlaceName = function (ref) {
    const ep = parseTransferRef(ref);
    if (!ep) return ref === 'stay' ? 'Keep' : '';
    if (ep.kind === 'pk') { const a = accountById(ep.accountId), pk = a && (a.pockets || []).find(p => p.id === ep.pocketId); return pk ? pk.name : ''; }
    if (ep.kind === 'acc') { const a = accountById(ep.accountId); return a ? a.name : ''; }
    if (ep.kind === 'brk') { const b = brokerById(ep.brokerId); return b ? b.name : ''; }
    return ep.exchange || '';
  };
  window.ipPartName = x => String((x && x.label) || '').trim() || ipPlaceName(x && (x.to || incomeStepTarget(x))) || 'Part';
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
    const S = incomeSplit(t.amount, t.categoryId, incomePlan().steps, { vatMode: 'incl', vatRoundUp: incomePlan().vatRoundUp !== false });
    ui.modal = { type: 'incomeSplit', payload: {
      txId, from: t.accountId || (data.accounts.find(a => !(typeof isCashWallet === 'function' && isCashWallet(a))) || {}).id || '',
      lines: S.lines.map(l => ({ id: l.step.id, label: ipPartName(l.step), pct: l.pct, amount: l.amount, to: incomeStepTarget(l.step), on: true })),
    } };
    render();
  };
  /* Offered right after you add an income by hand. */
  window.incomePlanOffer = function (t) {
    if (incomePlanTriggers(t) && !t.split && incomeSplit(t.amount, t.categoryId, incomePlan().steps, { vatMode: 'incl' }).lines.length) openIncomeSplit(t.id);
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
  /* A line that takes a pocket to (or past) its goal with this payment. */
  const fillsGoal = l => { const P = ipPlaceInfo(l.to); return P.kind === 'pk' && P.target > 0 && goalImpact(P.balance, l.amount, P.target).completes; };
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
        <div class="split-row"><span class="split-row-what">${escHtml(l.label)} <span class="dim">${l.pct}%</span></span><span class="split-row-to ${l.to ? '' : 'negative'}">${escHtml(placeText(l.to, p.from))}</span><b>${fmtMoney(l.amount, t.currency)}</b></div>
        ${fillsGoal(l) ? `<label class="ip-check split-close"><input type="checkbox" ${l.close ? 'checked' : ''} onchange="ui.modal.payload.lines[${p.lines.indexOf(l)}].close=this.checked"> 🎉 This reaches ${escHtml(ipPlaceInfo(l.to).name)}'s goal. Close the pocket after the transfer?</label>` : ''}`).join('');
    return `
      <div class="modal-head"><div class="modal-title">Split this income</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
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
    // Pockets you chose to close once their goal is reached: the closing window opens for the first.
    const close = lines.find(l => l.close && findPocket(l.to));
    save(); closeModal();
    if (close && typeof openPocketClose === 'function') { const ep = parseTransferRef(close.to); openPocketClose(ep.accountId, ep.pocketId); }
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
      vatMode: (p.vatModes || {})[(v && v.onlyCat) || '*'] || 'incl', vatRoundUp: p.vatRoundUp !== false,
      parts: partSteps(p).map(x => ({ id: x.id, label: x.label, pct: x.pct, to: incomeStepTarget(x), color: x.color || '' })),
    } };
    ipFixColors(ui.modal.payload);
    render();
  };
  const D = () => ui.modal.payload;
  /* ---- Undo inside the window (Cmd/Ctrl+Z, or the Undo button): every change keeps the plan
     as it was just before; nothing here touches your data until Save plan. ---- */
  const SNAP_KEYS = ['vatOn', 'vatPct', 'vatTo', 'vatCat', 'vatMode', 'vatRoundUp', 'parts'];
  const snap = d => JSON.stringify(SNAP_KEYS.map(k => d[k]));
  window.ipRemember = function () {
    const d = D(); if (!d) return;
    if (!d.hist) d.hist = [];
    const now = snap(d);
    if (d.hist[d.hist.length - 1] !== now) d.hist.push(now);
    if (d.hist.length > 60) d.hist.shift();
  };
  window.ipUndo = function () {
    const d = ui.modal && ui.modal.type === 'incomePlanEdit' && ui.modal.payload;
    if (!d || !d.hist || !d.hist.length) return false;
    const now = snap(d);
    let was = d.hist.pop();
    while (was === now && d.hist.length) was = d.hist.pop();
    if (was === now) return false;
    JSON.parse(was).forEach((v, n) => { d[SNAP_KEYS[n]] = v; });
    d.sel = null; d.pick = null; d.np = null;
    render();
    return true;
  };
  document.addEventListener('keydown', ev => {
    if (!(ev.metaKey || ev.ctrlKey) || ev.shiftKey || ev.altKey || String(ev.key).toLowerCase() !== 'z') return;
    if (!ui.modal || ui.modal.type !== 'incomePlanEdit') return;
    // A field you're typing in keeps its own undo until you leave it.
    const el = ev.target;
    if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && /^(text|number|search|)$/.test(el.type || '') && el.value !== el.defaultValue) return;
    if (ipUndo()) ev.preventDefault();
  });
  window.ipSet = function (field, value, i) {
    const d = D();
    ipRemember();
    const num = v => Math.max(0, Math.min(100, parseFloat(String(v).replace(',', '.')) || 0));
    if (i == null) d[field] = field === 'vatPct' ? Math.min(50, num(value)) : value;
    else if (field === 'pct') {
      // The total never goes past 100 %: a % that would is lowered, and what stays shakes.
      const c = sdClampPart(d.parts.map(x => +x.pct || 0), i, num(value));
      d.parts[i].pct = c.value;
      if (c.clamped) d.shake = Date.now();
    } else d.parts[i][field] = value;
    render();
  };
  window.ipToggleCat = function (id) { const d = D(); d.cats = d.cats.includes(id) ? d.cats.filter(c => c !== id) : d.cats.concat([id]); render(); };
  window.ipAddPart = function () { const d = D(); ipRemember(); d.parts.push({ id: uid('ip'), label: '', pct: Math.min(10, sdClampPart(d.parts.map(x => +x.pct || 0).concat([0]), d.parts.length, 10).value), to: 'stay' }); ipFixColors(d); render(); };
  /* A part that isn't a pocket keeps one colour wherever it moves: the first chart colour no other
     part uses (a pocket's part takes the pocket's colour). */
  window.ipFixColors = function (d) {
    const taken = new Set(d.parts.map(x => x.color).filter(Boolean));
    d.parts.forEach(x => {
      if (x.color || findPocket(x.to)) return;
      const slot = [0, 1, 2, 3, 4, 5, 6, 7].map(n => `var(--chart-${n + 1})`).find(c => !taken.has(c)) || 'var(--chart-other)';
      x.color = slot; taken.add(slot);
    });
  };
  window.ipRemovePart = function (i) { const d = D(); ipRemember(); d.parts.splice(i, 1); d.sel = null; render(); };
  window.saveIncomePlan = function () {
    const d = D(), p = incomePlan();
    if (!d.cats.length) { alert('Choose at least one kind of income.'); return; }
    // No place for VAT yet: a 🧾 VAT pocket is made in the account your income lands in.
    if (d.vatOn && (!d.vatTo || d.vatTo === 'new:vat' || !transferEndpoint(d.vatTo))) d.vatTo = makePocket(homeAccount(), { icon: '🧾', name: 'VAT', color: POCKET_COLORS[0] }) || '';
    // A part with no name takes its place's name (a pocket's, a broker's…), never "Part".
    const parts = d.parts.filter(x => (x.label || '').trim() || x.pct > 0).map(x => Object.assign({ id: x.id, label: ipPartName(x), pct: x.pct, setAside: false, onlyCat: '', to: x.to || 'stay' }, x.color && !findPocket(x.to) ? { color: x.color } : {}));
    const vatCat = d.cats.includes(d.vatCat) ? d.vatCat : '';
    p.triggerCats = d.cats.slice();
    p.steps = (d.vatOn ? [{ id: (vatStep(p) || {}).id || 'ip_vat', label: 'VAT', pct: d.vatPct, setAside: true, onlyCat: vatCat, to: d.vatTo || '' }] : []).concat(parts);
    if (!p.vatModes || typeof p.vatModes !== 'object') p.vatModes = {};
    p.vatModes[vatCat || '*'] = d.vatMode === 'excl' ? 'excl' : 'incl';
    p.vatRoundUp = d.vatRoundUp !== false;
    p.on = true;
    save(); closeModal();
  };
  window.__modalRenderers.incomePlanEdit = function (d) {
    const cats = data.categories.income || [];
    const head = `<div class="modal-head"><div class="modal-title">Income plan</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="tx-steps">${[['Which payments', 1], ['Your split', 2]].map(([l, n]) => `<button type="button" class="tx-step ${d.step === n ? 'on' : ''}" onclick="ui.modal.payload.step=${n};render();"><span>${n}</span>${l}</button>`).join('')}</div>`;
    if (d.step === 1) {
      return `${head}
        <div class="tx-label">Which payments do you want to split?</div>
        <div class="tx-chips">${cats.map(c => `<button type="button" class="tx-chip ${d.cats.includes(c.id) ? 'on' : ''}" onclick="ipToggleCat('${c.id}')">${c.icon || ''} ${escHtml(c.name)}</button>`).join('')}</div>
        <div class="ip-vat">
          <label class="switch-row"><button class="toggle ${d.vatOn ? 'on' : ''}" onclick="ipSet('vatOn', ${!d.vatOn})" aria-label="Set VAT aside"></button><span style="font-weight:600;">Set VAT aside first</span></label>
          ${d.vatOn ? `<div class="ip-vat-row">
            <span>On</span>
            <select class="mini-select" onchange="ipSet('vatCat', this.value)" aria-label="Which income pays VAT">
              ${cats.filter(c => d.cats.includes(c.id)).map(c => `<option value="${c.id}" ${d.vatCat === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}<option value="" ${!d.vatCat ? 'selected' : ''}>every payment</option></select>
            <span class="dim">· rate and where it goes on the next step</span>
          </div>` : ''}
        </div>
        <button class="btn primary full" style="margin-top:16px;" onclick="ui.modal.payload.step=2;render();" ${d.cats.length ? '' : 'disabled'}>Next</button>`;
    }
    const total = d.parts.reduce((s, x) => s + (+x.pct || 0), 0);
    const { catId: exCat, amount: exAmt, ex } = ipPreview(d);
    const exName = (categoryById('income', exCat) || {}).name || 'income';
    const partLine = x => ex.lines.find(l => l.step.id === x.id) || { amount: 0 };
    window.sdHost = ipHost;
    return `${head}
      ${splitDonutHtml(ipDonutModel(d, ex))}
      <div class="sd-hint">Drag a handle between two slices${matchMedia('(pointer: coarse)').matches ? ' (hold still first for 1 % steps)' : ' (Shift for 1 % steps)'}, or tap a slice.</div>
      ${ipToolsHtml(d, exAmt)}
      ${d.vatOn ? ipVatLineHtml(d, ex) : ''}
      <div class="tx-label">${d.vatOn ? 'After VAT, how do you split the rest?' : 'How do you split it?'}</div>
      <div class="ip-parts" data-sortable>
        ${d.parts.map((x, i) => `
        <div class="ip-part ${d.sel === i ? 'sel' : ''}" data-i="${i}" onfocusin="ipRowFocus(${i})">
          <span class="ip-grip" style="color:${ipPartColor(x, i)}" title="Drag to reorder" aria-hidden="true">${ic('grip', 18)}</span>
          <input class="ip-name" value="${escHtml(x.label)}" placeholder="${escHtml(ipPlaceName(x.to) || 'e.g. Invest')}" onchange="ipSet('label', this.value, ${i})" aria-label="Name">
          <span class="split-pct"><input type="number" min="0" max="100" step="1" value="${x.pct}" onchange="ipSet('pct', this.value, ${i})" aria-label="Percent">%</span>
          <button class="icon-btn-round ip-del" onclick="ipRemovePart(${i})" aria-label="Remove ${escHtml(ipPartName(x))}">${ic('trash')}</button>
          <div class="ip-to">${ipPlaceButton(x.to, ipPartColor(x, i), i, ipPartName(x))}</div>
          <div class="ip-imp">${ipImpactHtml(x.to, partLine(x).amount)}</div>
          ${d.pick === i ? `<div class="ip-pickwrap">${ipPickerHtml(i)}</div>` : ''}
        </div>`).join('')}
      </div>
      <button class="btn small" style="margin-top:8px;" onclick="ipAddPart()">+ Add a part</button>
      <div class="ip-left ${total > 100 ? 'negative' : ''}">${total > 100 ? `That's ${total}%. Keep it at 100% or less.` : `${100 - total}% left stays in the account.`}</div>
      ${ipExampleCard(d, exName, exAmt, ex)}
      <div class="grid-2" style="margin-top:14px;">
        <button class="btn" onclick="ui.modal.payload.step=1;render();">Back</button>
        <button class="btn primary" onclick="saveIncomePlan()" ${total > 100 ? 'disabled' : ''}>Save plan</button>
      </div>`;
  };
  window.ipExampleCard = (d, exName, exAmt, ex) => `<div class="split-example"><div class="eyebrow">${escHtml(exName)} of ${fmtMoney(exAmt)}${d.vatOn && ex.vat ? ` · VAT ${d.vatMode === 'excl' ? 'on top' : 'included'}` : ''}</div>
        ${ex.lines.map(l => `<div class="split-row"><span class="split-row-what">${escHtml(l.vat ? 'VAT' : ipPartName(l.step))}</span><b>${fmtMoney(l.amount)}</b></div>`).join('')}
        <div class="split-row split-rest"><span class="split-row-what">Stays in the account</span><b>${fmtMoney(ex.rest)}</b></div></div>`;
  /* ---- Presets and "try another amount" ---- */
  const BUILT_IN = [
    { id: 'p503020', name: '50/30/20', pcts: [50, 30, 20], names: ['Needs', 'Wants', 'Savings'] },
    { id: 'even', name: 'Even split' },
  ];
  window.ipToolsHtml = function (d, amt) {
    const presets = incomePlan().presets || [];
    const max = Math.max(10000, Math.ceil(amt / 1000) * 1000);
    return `<div class="ip-tools">
        <div class="ip-presets" role="group" aria-label="Presets">
          ${BUILT_IN.map(b => `<button type="button" class="chip" onclick="ipApplyPreset('${b.id}')">${escHtml(b.name)}</button>`).join('')}
          ${presets.map(pr => `<span class="chip ip-preset-own"><button type="button" onclick="ipApplyPreset('${escHtml(pr.id)}')">${escHtml(pr.name)}</button><button type="button" class="ip-preset-x" aria-label="Delete preset ${escHtml(pr.name)}" onclick="removeIncomePreset('${escHtml(pr.id)}')">${ic('x', 12)}</button></span>`).join('')}
          <button type="button" class="chip ip-preset-save" onclick="saveIncomePreset()">${ic('plus', 12)} Save current as preset</button>
          <button type="button" class="chip ip-undo" onclick="ipUndo()" ${d.hist && d.hist.length ? '' : 'disabled'} aria-label="Undo" title="Undo (${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}+Z)">${ic('undo', 14)} Undo</button>
        </div>
        <label class="ip-try"><span>Try another amount <small>(only a preview, no payment changes)</small></span>
          <span class="ip-try-row"><input type="range" min="0" max="${max}" step="10" value="${amt}" aria-label="Amount to preview" oninput="ipTry(this.value, true)" onchange="ipTry(this.value)">
          <input type="number" min="0" step="10" class="ip-try-num" value="${amt}" aria-label="Amount to preview in euros" onchange="ipTry(this.value)"></span></label>
      </div>`;
  };
  /* The preview amount: while the slider moves only the numbers change, then the window redraws. */
  window.ipTry = function (v, live) {
    const d = D();
    d.amt = Math.max(0, parseFloat(String(v).replace(',', '.')) || 0) || 0.01;
    if (!live) { render(); return; }
    const num = document.querySelector('.ip-try-num'); if (num) num.value = Math.round(d.amt);
    ipLive();
  };
  window.ipApplyPreset = function (id) {
    const d = D(), own = (incomePlan().presets || []).find(p => p.id === id);
    ipRemember();
    if (own) d.parts = own.parts.map(x => ({ id: uid('ip'), label: x.label || '', pct: +x.pct || 0, to: x.to || 'stay', color: x.color || '' }));
    else if (id === 'even') {
      if (!d.parts.length) d.parts = [{ id: uid('ip'), label: '', pct: 0, to: 'stay' }];
      const shares = largestRemainder(1, d.parts.map(() => 1)); // whole % that add up to 100
      d.parts.forEach((x, n) => { x.pct = Math.round(shares[n] * 100); });
    } else {
      const b = BUILT_IN.find(x => x.id === id);
      if (d.parts.length === b.pcts.length) d.parts.forEach((x, n) => { x.pct = b.pcts[n]; });
      else {
        // Needs stay in the account; savings go where your first saving part goes.
        const saving = d.parts.find(x => x.to && x.to !== 'stay');
        d.parts = b.pcts.map((pct, n) => ({ id: uid('ip'), label: b.names[n], pct, to: n === 2 && saving ? saving.to : 'stay', color: '' }));
      }
    }
    ipFixColors(d);
    d.sel = null; d.pick = null;
    render();
  };
  window.saveIncomePreset = function () {
    const d = D(), name = prompt('Name this split', d.parts.map(x => `${Math.round(x.pct)}`).join('/'));
    if (name == null || !String(name).trim()) return;
    const p = incomePlan();
    if (!Array.isArray(p.presets)) p.presets = [];
    p.presets.push({ id: uid('ipp'), name: String(name).trim().slice(0, 40), parts: d.parts.map(x => ({ label: x.label || '', pct: +x.pct || 0, to: x.to || 'stay', color: x.color || '' })) });
    save(); render();
  };
  window.removeIncomePreset = function (id) {
    const p = incomePlan();
    p.presets = (p.presets || []).filter(x => x.id !== id);
    save(); render();
  };
  /* The editor's plan (VAT + parts) split for an amount, the way it would be saved. */
  window.ipExample = function (d, catId, amount) {
    const steps = (d.vatOn ? [{ id: 'ip_vat_x', label: 'VAT', pct: d.vatPct, setAside: true, onlyCat: d.vatCat }] : []).concat(d.parts.map(x => ({ id: x.id, label: x.label, pct: x.pct, to: x.to })));
    return incomeSplit(amount, catId, steps, { vatMode: d.vatMode, vatRoundUp: d.vatRoundUp });
  };
  /* The amount the editor shows its split for: €1,000 of the first kind of income chosen. */
  window.ipPreview = function (d) {
    const catId = d.vatOn && d.vatCat && d.cats.includes(d.vatCat) ? d.vatCat : d.cats[0];
    if (!(d.amt > 0)) {
      // Start from your latest payment of this kind (what you'd really split), else €1,000.
      const last = data.budgetTransactions.filter(t => t.type === 'income' && t.categoryId === catId && +t.amount > 0).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      d.amt = last && last.currency === 'EUR' ? Math.round(+last.amount * 100) / 100 : 1000;
    }
    const amount = d.amt;
    return { catId, amount, ex: ipExample(d, catId, amount) };
  };
  /* A part's colour: its pocket's, else the one you gave it, else the chart colour of its place. */
  window.ipPartColor = function (x, i) {
    const ep = parseTransferRef(x.to);
    if (ep && ep.kind === 'pk') { const a = accountById(ep.accountId), pk = a && (a.pockets || []).find(p => p.id === ep.pocketId); if (pk && pk.color) return pk.color; }
    return x.color || chartColor(i);
  };
  const ipEmoji = x => { const ep = parseTransferRef(x.to); if (!ep || ep.kind !== 'pk') return ''; const a = accountById(ep.accountId), pk = a && (a.pockets || []).find(p => p.id === ep.pocketId); return (pk && pk.icon) || ''; };
  window.ipDonutModel = function (d, ex) {
    const pcts = capPercents(d.parts.map(x => x.pct)), used = pcts.reduce((a, b) => a + b, 0);
    return {
      key: 'ip', interactive: true, sel: d.sel, lifted: Date.now() - (d.liftAt || 0) < 400, shake: Date.now() - (d.shake || 0) < 700,
      parts: d.parts.map((x, i) => ({ id: x.id, name: ipPartName(x), pct: pcts[i], amount: (ex.lines.find(l => l.step.id === x.id) || { amount: 0 }).amount, color: ipPartColor(x, i), emoji: ipEmoji(x) })),
      rest: { pct: 100 - used, amount: ex.rest },
      vat: d.vatOn && ex.vat > 0 ? { amount: ex.vat, share: ex.received ? ex.vat / ex.received : 0 } : null,
      center: { amount: ex.base, label: 'to split', sub: d.vatOn && ex.vat > 0 ? `VAT set aside: ${fmtMoney(ex.vat)}` : '' },
    };
  };
  /* While a handle moves, only the donut and the numbers are redrawn (the window stays put). */
  function ipLive() {
    const d = D(), { ex } = ipPreview(d), total = d.parts.reduce((s, x) => s + (+x.pct || 0), 0);
    splitDonutPaint(ipDonutModel(d, ex));
    document.querySelectorAll('.ip-part[data-i]').forEach(row => {
      const x = d.parts[+row.dataset.i]; if (!x) return;
      const inp = row.querySelector('input[aria-label="Percent"]'); if (inp) inp.value = x.pct;
      const a0 = (ex.lines.find(l => l.step.id === x.id) || { amount: 0 }).amount;
      const imp = row.querySelector('.ip-imp'); if (imp) imp.innerHTML = ipImpactHtml(x.to, a0);
    });
    const left = document.querySelector('.ip-left'); if (left) left.textContent = `${Math.round((100 - total) * 100) / 100}% left stays in the account.`;
    const va = document.querySelector('.ip-vat-amt'); if (va) va.textContent = fmtMoney(ex.vat);
    const vi = document.querySelector('.ip-vatline > .ip-impact'); if (vi) vi.outerHTML = ipImpactHtml(d.vatTo || 'new:vat', ex.vat);
    const card = document.querySelector('.split-example'), P = ipPreview(d);
    if (card) card.outerHTML = ipExampleCard(d, (categoryById('income', P.catId) || {}).name || 'income', P.amount, ex);
  }
  const ipHost = {
    pcts: () => D().parts.map(x => +x.pct || 0),
    set(pcts, phase) {
      if (phase === 'start') { ipRemember(); return; }
      const d = D();
      pcts.forEach((p, i) => { if (d.parts[i]) d.parts[i].pct = p; });
      if (phase === 'move') { ipLive(); return; }
      const h = document.activeElement && document.activeElement.closest && document.activeElement.closest('.sd-handle');
      render();
      if (h) { const again = document.querySelector(`.sd-handle[data-k="${h.dataset.k}"]`); if (again) again.focus(); }
    },
    select(i) {
      const d = D();
      d.sel = d.sel === i ? null : i; d.liftAt = Date.now();
      render();
      if (d.sel != null) { const inp = document.querySelector(`.ip-part[data-i="${i}"] input[aria-label="Percent"]`); if (inp) inp.focus({ preventScroll: false }); }
    },
    tip(pcts, k) {
      const d = D(), saved = d.parts.map(x => x.pct);
      pcts.forEach((p, i) => { d.parts[i].pct = p; });
      const { ex } = ipPreview(d);
      d.parts.forEach((x, i) => { x.pct = saved[i]; });
      const amt = x => fmtMoney((ex.lines.find(l => l.step.id === x.id) || { amount: 0 }).amount);
      const a = d.parts[k], b = d.parts[k + 1];
      const used = pcts.reduce((s, x) => s + x, 0);
      return `<span><i style="background:${ipPartColor(a, k)}"></i>${escHtml(ipPartName(a))} <b>${pcts[k]}%</b> ${amt(a)}</span>`
        + (b ? `<span><i style="background:${ipPartColor(b, k + 1)}"></i>${escHtml(ipPartName(b))} <b>${pcts[k + 1]}%</b> ${amt(b)}</span>` : `<span><i class="rest"></i>Stays <b>${Math.round((100 - used) * 100) / 100}%</b> ${fmtMoney(ex.rest)}</span>`);
    },
  };
  /* Focusing a row lights up its slice (without redrawing the window, so the field keeps focus). */
  window.ipRowFocus = function (i) {
    const d = D();
    if (d.sel === i) return;
    d.sel = i; d.liftAt = Date.now();
    splitDonutPaint(ipDonutModel(d, ipPreview(d).ex));
    document.querySelectorAll('.ip-part[data-i]').forEach(r => r.classList.toggle('sel', +r.dataset.i === i));
  };
  /* ---- Where a part goes: the place picker ----
     Pockets first (emoji, colour, balance, goal), then accounts and brokers, then "+ New pocket".
     A place that isn't a pocket gets a slice colour you choose. */
  const findPocket = ref => { const ep = parseTransferRef(ref); if (!ep || ep.kind !== 'pk') return null; const a = accountById(ep.accountId), pk = a && (a.pockets || []).find(p => p.id === ep.pocketId); return pk ? { a, pk } : null; };
  const initial = n => String(n || '').trim().charAt(0).toUpperCase();
  window.ipPlaceInfo = function (ref) {
    if (!ref || ref === 'stay') return { kind: 'stay', name: 'Keep in the account', balance: null };
    if (ref === 'new:vat') return { kind: 'new', name: 'New VAT pocket', emoji: '🧾', balance: null };
    const ep = parseTransferRef(ref), P = findPocket(ref);
    if (P) return { kind: 'pk', name: P.pk.name, sub: P.a.name, emoji: P.pk.icon || '', color: P.pk.color || '', ccy: P.a.currency, balance: +P.pk.amountSaved || 0, target: +P.pk.targetAmount || 0 };
    const e = transferEndpoint(ref);
    if (!ep || !e) return { kind: 'missing', name: 'Choose where', balance: null };
    if (ep.kind === 'acc') { const a = accountById(ep.accountId); return { kind: 'acc', name: a.name, emoji: a.icon || '', ccy: a.currency, balance: +a.balance || 0 }; }
    if (ep.kind === 'brk') { const b = brokerById(ep.brokerId); return { kind: 'brk', name: b.name, sub: 'cash', emoji: initial(b.name), ccy: brokerCashCurrency(b), balance: brokerCash(b) }; }
    return { kind: ep.kind, name: ep.exchange || e.label, sub: 'cash', emoji: initial(ep.exchange || e.label), ccy: e.ccy, balance: e.get() };
  };
  /* "+€206.50 → ✈️ Trip fund: €450.00 → €656.50", with the goal before / after for a pocket. */
  window.ipImpactHtml = function (ref, amount, opts) {
    const P = ipPlaceInfo(ref), add = +amount || 0;
    if (P.kind === 'stay') return `<div class="ip-impact dim">${fmtMoney(add)} stays in the account it lands in</div>`;
    if (P.kind === 'missing') return `<div class="ip-impact negative">Choose where it goes</div>`;
    if (P.kind === 'new') return `<div class="ip-impact">+${fmtMoney(add)} → ${P.emoji} ${escHtml(P.name)} <span class="dim">(made when you save)</span></div>`;
    const sameCcy = !P.ccy || P.ccy === 'EUR';
    const line = `<div class="ip-impact">+${fmtMoney(add)} → ${P.emoji && (P.kind === 'pk' || P.kind === 'acc') ? escHtml(P.emoji) + ' ' : ''}${escHtml(P.name)}${P.balance != null && sameCcy ? `: ${fmtMoney(P.balance)} → <b>${fmtMoney(P.balance + add)}</b>` : ''}</div>`;
    if (P.kind !== 'pk' || !(P.target > 0) || !sameCcy) return line;
    const G = goalImpact(P.balance, add, P.target);
    const note = G.already ? 'Goal already reached' : G.completes ? '<span class="ip-badge">🎉 This payment reaches the goal</span>' + (opts && opts.closeHint ? ' <span class="dim">You can close the pocket after the transfer.</span>' : '')
      : G.more == null ? '' : `Goal reached after ${G.more} more payment${G.more === 1 ? '' : 's'} like this`;
    return `${line}
      <div class="ip-goal" role="img" aria-label="Goal ${fmtMoney(P.target)}: ${Math.round(G.shareBefore * 100)}% now, ${Math.round(G.shareAfter * 100)}% after">
        <span class="ip-goal-bar"><i class="was" style="width:${(G.shareBefore * 100).toFixed(1)}%;background:${P.color || 'var(--fx-ink)'}"></i><i class="add" style="left:${(G.shareBefore * 100).toFixed(1)}%;width:${((G.shareAfter - G.shareBefore) * 100).toFixed(1)}%;background:${P.color || 'var(--fx-ink)'}"></i></span>
        <span class="ip-goal-txt">${Math.round(G.shareBefore * 100)}% → ${Math.round(G.shareAfter * 100)}% of ${fmtMoney(P.target)} · ${note}</span>
      </div>`;
  };
  window.ipPlaceButton = function (ref, color, i, label) {
    const P = ipPlaceInfo(ref), d = D();
    return `<button type="button" class="ip-place ${P.kind === 'missing' ? 'missing' : ''}" onclick="ipPick(${JSON.stringify(i).replace(/"/g, '&quot;')})" aria-expanded="${d.pick === i}" aria-label="Where ${escHtml(label)} goes: ${escHtml(P.name)}">
        <span class="ip-place-ic" style="${P.kind === 'stay' || !color ? '' : `background:${color}`}">${P.emoji ? escHtml(P.emoji) : ''}</span>
        <span class="ip-place-name">${escHtml(P.name)}${P.sub ? ` <span class="dim">· ${escHtml(P.sub)}</span>` : ''}</span>
        ${P.balance != null ? `<span class="ip-place-bal">${fmtMoney(P.balance, P.ccy)}</span>` : ''}${ic('chevronDown', 14)}
      </button>`;
  };
  const SLICE_COLORS = [0, 1, 2, 3, 4, 5, 6, 7].map(n => `var(--chart-${n + 1})`);
  window.ipPickerHtml = function (i) {
    const d = D(), isVat = i === 'vat', cur = isVat ? d.vatTo : d.parts[i].to;
    const opt = (ref, ic0, color, name, sub, right) => `<button type="button" class="ip-opt ${ref === cur ? 'on' : ''}" onclick="ipChoose(${JSON.stringify(i).replace(/"/g, '&quot;')}, '${escHtml(ref)}')">
        <span class="ip-place-ic" style="${color ? `background:${color}` : ''}">${ic0 ? escHtml(ic0) : ''}</span>
        <span class="ip-opt-name">${escHtml(name)}${sub ? `<small>${sub}</small>` : ''}</span><span class="ip-opt-right">${right || ''}</span></button>`;
    const pockets = data.accounts.flatMap(a => (a.pockets || []).filter(p => !p.finishedAt || `pk:${a.id}:${p.id}` === cur).map(p => {
      const t = +p.targetAmount || 0, sh = t > 0 ? Math.min(1, (+p.amountSaved || 0) / t) : 0;
      return opt(`pk:${a.id}:${p.id}`, p.icon || '', p.color || '', p.name, `${escHtml(a.name)}${t > 0 ? ` · goal ${fmtMoney(t, a.currency)} <span class="ip-mini"><i style="width:${(sh * 100).toFixed(0)}%;background:${p.color || 'var(--fx-ink)'}"></i></span>` : ''}`, fmtMoney(+p.amountSaved || 0, a.currency));
    })).join('');
    const others = (isVat ? '' : opt('stay', '', '', 'Keep in the account', 'it stays where the payment lands', ''))
      + data.accounts.filter(a => !(typeof isCashWallet === 'function' && isCashWallet(a))).map(a => opt('acc:' + a.id, a.icon || '🏦', '', a.name, mainBalanceName(a), fmtMoney(+a.balance || 0, a.currency))).join('')
      + data.brokers.map(b => opt('brk:' + b.id, initial(b.name), '', b.name, 'broker · cash', fmtMoney(brokerCash(b), brokerCashCurrency(b)))).join('')
      + cryptoBrokerNames().map(n => opt('cx:' + n, initial(n), '', n, 'exchange · cash', '')).join('');
    const np = d.np && d.np.for === i ? d.np : null;
    const notPocket = !isVat && !findPocket(cur) && cur !== 'stay';
    return `<div class="ip-pick" role="group" aria-label="Where it goes">
        ${pockets ? `<div class="ip-pick-h">Pockets</div>${pockets}` : ''}
        <div class="ip-pick-h">Accounts & brokers</div>${others}
        ${np ? `<div class="ip-np">
            <div class="ip-pick-h">New pocket</div>
            <div class="ip-np-row"><input class="ip-np-ic" maxlength="4" value="${escHtml(np.icon)}" aria-label="Emoji" oninput="ui.modal.payload.np.icon=this.value"><input class="ip-np-name" value="${escHtml(np.name)}" placeholder="Name, e.g. Holidays" aria-label="Pocket name" oninput="ui.modal.payload.np.name=this.value"></div>
            <div class="ip-np-colors" role="group" aria-label="Colour">${POCKET_COLORS.map(c => `<button type="button" class="swatch-dot ${np.color === c ? 'selected' : ''}" style="background:${c}" aria-label="Colour ${c}" aria-pressed="${np.color === c}" onclick="ui.modal.payload.np.color='${c}';render();"></button>`).join('')}</div>
            <div class="ip-np-row"><label class="ip-np-goal">Goal <input inputmode="decimal" value="${escHtml(np.target)}" placeholder="optional" aria-label="Goal amount" oninput="ui.modal.payload.np.target=this.value"></label>
              <select class="mini-select" aria-label="In which account" onchange="ui.modal.payload.np.acc=this.value">${data.accounts.filter(a => !(typeof isCashWallet === 'function' && isCashWallet(a))).map(a => `<option value="${a.id}" ${np.acc === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select></div>
            <div class="ip-np-row"><button type="button" class="btn small" onclick="ui.modal.payload.np=null;render();">Cancel</button><button type="button" class="btn small primary" onclick="ipCreatePocket()">Create pocket</button></div>
            <div class="dim" style="font-size:11.5px;">The pocket is made right away, with nothing in it.</div>
          </div>` : `<button type="button" class="ip-opt ip-opt-new" onclick="ipNewPocket(${JSON.stringify(i).replace(/"/g, '&quot;')})"><span class="ip-place-ic">${ic('plus', 14)}</span><span class="ip-opt-name">New pocket</span></button>`}
        ${notPocket ? `<div class="ip-pick-h">Slice colour</div><div class="ip-np-colors" role="group" aria-label="Slice colour">${SLICE_COLORS.map((c, n) => `<button type="button" class="swatch-dot ${ipPartColor(d.parts[i], i) === c ? 'selected' : ''}" style="background:${c}" aria-label="Colour ${n + 1}" onclick="ipSetColor(${i}, '${c}')"></button>`).join('')}</div>` : ''}
      </div>`;
  };
  window.ipPick = function (i) { const d = D(); d.pick = d.pick === i ? null : i; d.np = null; render(); };
  window.ipChoose = function (i, ref) {
    const d = D();
    ipRemember();
    if (i === 'vat') d.vatTo = ref; else d.parts[i].to = ref;
    ipFixColors(d);
    d.pick = null; render();
  };
  window.ipSetColor = function (i, c) { ipRemember(); D().parts[i].color = c; render(); };
  /* The account a new pocket goes in: where your latest income of this kind landed, else the first. */
  const homeAccount = () => {
    const d = D(), t = data.budgetTransactions.filter(x => x.type === 'income' && d.cats.includes(x.categoryId) && x.accountId).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const ok = a => a && !(typeof isCashWallet === 'function' && isCashWallet(a));
    return (t && ok(accountById(t.accountId)) && t.accountId) || ((data.accounts.find(ok) || {}).id) || '';
  };
  window.ipNewPocket = function (i) {
    const d = D(), used = new Set(data.accounts.flatMap(a => (a.pockets || []).map(p => p.color)));
    d.np = { for: i, name: i === 'vat' ? 'VAT' : '', icon: i === 'vat' ? '🧾' : '🎯', color: POCKET_COLORS.find(c => !used.has(c)) || POCKET_COLORS[0], target: '', acc: homeAccount() };
    render();
  };
  function makePocket(accId, o) {
    const a = accountById(accId);
    if (!a) return '';
    if (!Array.isArray(a.pockets)) a.pockets = [];
    const pk = { id: uid('pk'), icon: o.icon || '🎯', name: o.name, amountSaved: 0, targetAmount: Math.max(0, parseFloat(String(o.target || '').replace(',', '.')) || 0), color: o.color || POCKET_COLORS[0], createdAt: new Date().toISOString() };
    a.pockets.push(pk);
    return `pk:${a.id}:${pk.id}`;
  }
  window.ipCreatePocket = function () {
    const d = D(), np = d.np;
    if (!np || !String(np.name || '').trim()) { alert('Give the pocket a name.'); return; }
    const ref = makePocket(np.acc, { icon: String(np.icon || '').trim(), name: String(np.name).trim(), target: np.target, color: np.color });
    if (!ref) return;
    save();
    ipRemember();
    if (np.for === 'vat') d.vatTo = ref; else d.parts[np.for].to = ref;
    d.np = null; d.pick = null;
    render();
  };
  /* VAT moved into its place this quarter (any transfer into it), for the quarterly return. */
  window.ipVatQuarter = function (ref) {
    if (!ref || typeof vatQuarterRange !== 'function') return null;
    const t = todayYmd(), Q = vatQuarterRange(+t.slice(0, 4), Math.floor((+t.slice(5, 7) - 1) / 3) + 1);
    const sum = data.budgetTransactions.filter(x => x.type === 'transfer' && x.to === ref && x.date >= Q.from && x.date <= Q.to).reduce((s, x) => s + toEUR(+x.amount || 0, x.currency), 0);
    return { key: Q.key.replace('-', ' '), sum: Math.round(sum * 100) / 100 };
  };
  /* Rows drag into order (SortableJS); the slices follow. */
  window.incomePlanAfterRender = function () {
    const list = document.querySelector('.ip-parts[data-sortable]');
    if (!list || list.dataset.bound || typeof loadSortable !== 'function') return;
    list.dataset.bound = '1';
    loadSortable().then(Sortable => {
      if (!document.body.contains(list)) return;
      Sortable.create(list, {
        handle: '.ip-grip', animation: 160, forceFallback: true, fallbackOnBody: true, delayOnTouchOnly: true, delay: 120,
        onEnd: ev => {
          if (ev.oldIndex === ev.newIndex) return;
          ipRemember();
          const d = D(), [x] = d.parts.splice(ev.oldIndex, 1);
          d.parts.splice(ev.newIndex, 0, x);
          d.sel = null; d.pick = null;
          render();
        },
      });
    }).catch(() => {});
  };
  /* VAT: a locked first line, taken before your split and not part of its 100 %. */
  const VAT_RATES = [21, 9, 0];
  window.ipVatLineHtml = function (d, ex) {
    const other = !VAT_RATES.includes(+d.vatPct);
    return `
      <div class="ip-vatline">
        <div class="ip-vatline-top"><span class="ip-lock" aria-hidden="true">${ic('lock', 15)}</span><b>VAT</b><span class="dim">set aside first · not part of your split</span><b class="ip-vat-amt">${fmtMoney(ex.vat)}</b></div>
        <div class="ip-vat-opts">
          <div class="seg-row" role="group" aria-label="VAT rate">${VAT_RATES.map(r => `<button type="button" class="seg ${+d.vatPct === r ? 'on' : ''}" aria-pressed="${+d.vatPct === r}" onclick="ipSet('vatPct', ${r})">${r}%</button>`).join('')}
            <span class="split-pct ip-vat-other ${other ? 'on' : ''}"><input type="number" min="0" max="50" step="0.5" value="${other ? d.vatPct : ''}" placeholder="other" onchange="ipSet('vatPct', this.value)" aria-label="Another VAT rate">%</span></div>
          <div class="seg-row" role="group" aria-label="The amount entered is">${[['incl', 'incl. VAT'], ['excl', 'excl. VAT']].map(([m, l]) => `<button type="button" class="seg ${d.vatMode === m ? 'on' : ''}" aria-pressed="${d.vatMode === m}" onclick="ipSet('vatMode', '${m}')">${l}</button>`).join('')}</div>
        </div>
        <div class="ip-vat-note">${d.vatMode === 'excl' ? 'Amount entered is before VAT (planning from an invoice): VAT comes on top.' : 'Amount entered is what lands in the bank, VAT included.'} A payment you receive is always split as VAT included.</div>
        <label class="ip-check"><input type="checkbox" ${d.vatRoundUp !== false ? 'checked' : ''} onchange="ipSet('vatRoundUp', this.checked)"> Round VAT up to the euro${ex.vatExact != null && ex.vatExact !== ex.vat ? ` <span class="dim">(${fmtMoney(ex.vatExact)} exactly)</span>` : ''}</label>
        ${ipPlaceButton(d.vatTo || 'new:vat', ipPlaceInfo(d.vatTo || 'new:vat').color || '', 'vat', 'VAT')}
        ${d.pick === 'vat' ? ipPickerHtml('vat') : ''}
        ${ipImpactHtml(d.vatTo || 'new:vat', ex.vat)}
        ${(() => { const q = ipVatQuarter(d.vatTo); return q ? `<div class="ip-vat-q">VAT set aside this quarter (${escHtml(q.key)}): <b>${fmtMoney(q.sum)}</b></div>` : ''; })()}
      </div>`;
  };

  /* The plan's pie on the tab (not interactive): the saved parts for €1,000. */
  function ipTabDonut(p) {
    const v = vatStep(p), parts = partSteps(p).map(x => ({ id: x.id, label: x.label, pct: x.pct, to: incomeStepTarget(x), color: x.color || '' }));
    if (!parts.length) return '';
    const d = { vatOn: !!v, vatPct: v ? v.pct : 0, vatCat: v ? v.onlyCat || '' : '', vatMode: (p.vatModes || {})[(v && v.onlyCat) || '*'] || 'incl', vatRoundUp: p.vatRoundUp !== false, cats: p.triggerCats, parts, amt: 1000 };
    const m = ipDonutModel(d, ipPreview(d).ex);
    return splitDonutHtml(Object.assign(m, { key: 'ip-tab', interactive: false, small: true, sel: null, center: { amount: m.center.amount, label: `of ${fmtMoney(1000)}` } }));
  }
  window.incomePlanTab = function () {
    const p = incomePlan(), v = vatStep(p), parts = partSteps(p);
    const catNames = p.triggerCats.map(id => (categoryById('income', id) || {}).name).filter(Boolean);
    const total = parts.reduce((s, x) => s + (+x.pct || 0), 0);
    const pending = incomePlanPending();
    const vatCat = v && v.onlyCat ? (categoryById('income', v.onlyCat) || {}).name : '';
    const exCat = v && v.onlyCat ? v.onlyCat : p.triggerCats[0];
    const ex = exCat ? incomeSplit(1000, exCat, p.steps, { vatMode: (p.vatModes || {})[(v && v.onlyCat) || '*'] || 'incl', vatRoundUp: p.vatRoundUp !== false }) : null;
    return `
    <div class="card" style="margin-bottom:16px;">
      <div class="row-flex" style="gap:10px;">
        <div style="min-width:0;"><div style="font-weight:700;font-size:16px;">Income plan</div>
          <div style="font-size:12.5px;opacity:.6;">When you get paid, Trackr suggests how to split it.</div></div>
        <label class="switch-row"><button class="toggle ${p.on ? 'on' : ''}" onclick="toggleIncomePlan()" aria-label="Income plan on"></button><span>${p.on ? 'On' : 'Off'}</span></label>
      </div>
      <div class="ip-summary-wrap">${ipTabDonut(p)}<div class="ip-summary">
        <div class="ip-sum-row dim">For ${escHtml(catNames.join(', ') || 'no income yet')}</div>
        ${v ? `<div class="ip-sum-row"><b class="ip-pct">${v.pct}%</b><span>VAT${vatCat ? ` on ${escHtml(vatCat)}` : ''}</span><span class="dim">${escHtml(placeText(incomeStepTarget(v)))}</span></div>` : ''}
        ${v && parts.length ? '<div class="ip-sum-row dim" style="padding-left:2px;">Then, of what\'s left:</div>' : ''}
        ${parts.map(x => `<div class="ip-sum-row"><b class="ip-pct">${x.pct}%</b><span>${escHtml(ipPartName(x))}</span><span class="dim">${escHtml(placeText(incomeStepTarget(x)))}</span></div>`).join('')}
        ${total < 100 ? `<div class="ip-sum-row"><b class="ip-pct dim">${100 - total}%</b><span class="dim">Left</span><span class="dim">stays in the account</span></div>` : ''}
      </div></div>
      ${ex ? `<div class="split-example" style="margin-top:12px;"><div class="eyebrow">Example: ${escHtml((categoryById('income', exCat) || {}).name || '')} of ${fmtMoney(1000)}</div>
        <div style="font-size:13px;">${ex.lines.map(l => `${escHtml(l.vat ? 'VAT' : ipPartName(l.step))} <b>${fmtMoney(l.amount)}</b>`).join(' · ')} · stays <b>${fmtMoney(ex.rest)}</b></div></div>` : ''}
      <button class="btn primary" style="margin-top:14px;" onclick="openIncomePlanEditor()">Edit plan</button>
    </div>
    ${pending.length ? `<div class="card"><div class="eyebrow" style="margin-bottom:8px;">Waiting to be split</div>
      ${pending.map(t => `<div class="split-row"><span class="split-row-what">${escHtml(t.comment || 'Income')} <span class="dim">· ${escHtml(shortDay(t.date))}</span></span><b>${fmtMoney(t.amount, t.currency)}</b><span style="display:flex;gap:6px;justify-content:flex-end;"><button class="btn small primary" onclick="openIncomeSplit('${t.id}')">Split</button><button class="btn small" onclick="skipIncomeSplit('${t.id}')">Skip</button></span></div>`).join('')}</div>` : ''}`;
  };
}
