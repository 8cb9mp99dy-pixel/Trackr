/* ===================== Budget, live =====================
 * Loaded after pockets-close.js. Makes the Budget page quicker to work with, on a phone (tap,
 * long-press, swipe, drag) and on a computer (click, drag, keyboard):
 *  - Edit in place: tap a transaction's name or amount, a category's name. Enter or leaving the
 *    field saves, Escape puts it back. Every change has Undo (safety.js, 10 s).
 *  - Arrange: the parts of the Transactions tab and its charts, in your order
 *    (data.settings.budgetLayout, synced). Drag with SortableJS, or the arrows.
 *  - Drag categories into order (Categories tab), and a transaction onto a category to move it
 *    there (long-press on a phone; a tray of categories comes up).
 *  - Swipe the month header or the In / Out summary to change month.
 *  - Tap a slice or a line of the category charts: the list shows that category only (a chip
 *    takes the filter off). Tap a month's bars to open that month.
 *  - The month slides in the way you went; budget bars grow in. Still under reduced motion.
 * Nothing here deletes anything.
 */
const BUDGET_SECTIONS = [['months', 'Months'], ['summary', 'In, out, balance'], ['budgets', 'Budgets'], ['review', 'To review'], ['actions', 'Add, import, export'], ['charts', 'Charts'], ['list', 'Transactions']];
const BUDGET_CHARTS = [['category', 'By category'], ['invested', 'Invested'], ['trend', 'Spending trend'], ['cashflow', 'Income vs expenses']];

/* Your order: the ids you saved that still exist, then any new part in its usual place. */
function layoutOrder(saved, defaults) {
  const out = (Array.isArray(saved) ? saved : []).filter((id, i, a) => defaults.includes(id) && a.indexOf(id) === i);
  defaults.forEach((id, i) => {
    if (out.includes(id)) return;
    // A part you never placed goes after the one before it in the usual order.
    const prev = defaults.slice(0, i).reverse().find(p => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, id);
  });
  return out;
}
/* One step up (-1) or down (+1); nothing moves past the ends. */
function moveId(list, id, delta) {
  const out = list.slice(), i = out.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= out.length) return out;
  out.splice(i, 1); out.splice(j, 0, id);
  return out;
}
/* A finger that went mostly sideways, far and fast enough: swipe left = next month (+1). */
function swipeMonthStep(dx, dy, ms) {
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5 || ms > 900) return 0;
  return dx < 0 ? 1 : -1;
}
/* An amount as typed: "12,50", "1.234,56", "1,234.56", "€ 12.5". NaN when it isn't one. */
function parseAmountInput(str) {
  let s = String(str == null ? '' : str).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return NaN;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',', thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    // "1,234" with three digits after one comma is a thousand; "12,5" is a decimal.
    s = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(',').length > 2 ? s.split(',').join('') : s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) s = s.split('.').join('');
  const n = parseFloat(s);
  return isFinite(n) ? Math.abs(Math.round(n * 100) / 100) : NaN;
}
/* Does a transaction belong to the category picked on a chart? id null = "Uncategorized". */
function txInCategory(t, kind, id, known) {
  if (!t || t.type !== kind) return false;
  const own = t.categoryId && known(t.categoryId) ? t.categoryId : null;
  return own === (id || null);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { layoutOrder, moveId, swipeMonthStep, parseAmountInput, txInCategory, BUDGET_SECTIONS, BUDGET_CHARTS };
} else {
  const reduced = () => typeof motionReduced === 'function' && motionReduced();

  /* ---- Your order of the Budget page ---- */
  window.budgetLayout = function (kind) {
    const s = (data.settings && data.settings.budgetLayout) || {};
    return layoutOrder(s[kind], (kind === 'charts' ? BUDGET_CHARTS : BUDGET_SECTIONS).map(x => x[0]));
  };
  /* The parts drawn by app.js ({ id: html }), in your order. */
  window.budgetLayoutHtml = function (parts, kind) { return budgetLayout(kind).map(id => parts[id] || '').join(''); };
  function setLayout(kind, ids) {
    const now = budgetLayout(kind);
    if (ids.length === now.length && ids.every((id, i) => id === now[i])) return false;
    const before = JSON.stringify(data);
    if (!data.settings.budgetLayout || typeof data.settings.budgetLayout !== 'object') data.settings.budgetLayout = {};
    data.settings.budgetLayout[kind] = ids;
    save(); render();
    offerUndo('Budget page arranged', before);
    return true;
  }
  window.openBudgetArrange = function () { ui.modal = { type: 'budgetArrange' }; render(); };
  window.budgetLayoutMove = function (kind, id, delta) { setLayout(kind, moveId(budgetLayout(kind), id, delta)); };
  window.budgetLayoutReset = function () {
    const before = JSON.stringify(data);
    data.settings.budgetLayout = { sections: [], charts: [] };
    save(); render();
    if (before !== JSON.stringify(data)) offerUndo('Usual order back', before);
  };
  window.__modalRenderers.budgetArrange = function () {
    const list = (kind, items) => {
      const ids = budgetLayout(kind), label = Object.fromEntries(items);
      return `<div class="ba-list" data-kind="${kind}">${ids.map((id, i) => `
        <div class="ba-row" data-id="${id}">
          <span class="ba-h" aria-hidden="true">${ic('grip', 16)}</span>
          <span class="ba-name">${escHtml(label[id])}</span>
          <button class="icon-btn-round ba-arrow" ${i === 0 ? 'disabled' : ''} aria-label="Move ${escHtml(label[id])} up" onclick="budgetLayoutMove('${kind}','${id}',-1)">${ic('chevronUp', 14)}</button>
          <button class="icon-btn-round ba-arrow" ${i === ids.length - 1 ? 'disabled' : ''} aria-label="Move ${escHtml(label[id])} down" onclick="budgetLayoutMove('${kind}','${id}',1)">${ic('chevronDown', 14)}</button>
        </div>`).join('')}</div>`;
    };
    return `
      <div class="modal-head"><div class="modal-title">Arrange Budget</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="dim" style="font-size:13px;margin-bottom:14px;">Drag a line by its handle, or use the arrows. Your order is saved and goes to your other devices.</div>
      <div class="eyebrow">Transactions tab</div>
      ${list('sections', BUDGET_SECTIONS)}
      <div class="eyebrow" style="margin-top:18px;">Charts</div>
      ${list('charts', BUDGET_CHARTS)}
      <div class="modal-actions"><button class="btn ghost" onclick="budgetLayoutReset()">Usual order</button><button class="btn primary" onclick="closeModal()">Done</button></div>`;
  };

  /* ---- Edit in place ---- */
  /* Turns el into a field. Enter or leaving it saves (o.save returns an error to show, or
     nothing); Escape puts it back as it was. */
  function inlineEdit(el, o) {
    if (!el || el.querySelector('input')) return;
    const was = el.innerHTML, inp = document.createElement('input');
    inp.className = 'il-input';
    inp.value = o.value;
    inp.setAttribute('aria-label', o.label);
    if (o.decimal) inp.setAttribute('inputmode', 'decimal');
    inp.style.width = Math.max(o.decimal ? 80 : 120, Math.min(260, el.offsetWidth + 28)) + 'px';
    el.innerHTML = '';
    el.appendChild(inp);
    el.classList.add('editing');
    ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach(ev => inp.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
    let done = false;
    const finish = commit => {
      if (done) return;
      done = true;
      const v = inp.value.trim();
      const err = commit && v !== String(o.value).trim() ? o.save(v) : null;
      if (err) alert(err);
      // Saved: render() has drawn the new value. Otherwise put back what was there.
      if (el.isConnected && el.contains(inp)) { el.innerHTML = was; el.classList.remove('editing'); }
      if (ui.renderDeferred) setTimeout(renderWhenIdle, 0);
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
    inp.focus();
    inp.select();
  }
  window.inlineEdit = inlineEdit;

  const txById = id => (data.budgetTransactions || []).find(x => x.id === id);
  window.txInline = function (e, id, field) {
    e.stopPropagation();
    if (typeof bulkSelecting === 'function' && bulkSelecting()) { bulkToggle(id); return; }
    const t = txById(id); if (!t) return;
    const amount = field === 'amount';
    inlineEdit(e.currentTarget, {
      value: amount ? String(Math.abs(t.amount)) : (t.comment || ''),
      decimal: amount,
      label: amount ? `Amount of ${t.comment || 'this transaction'}` : 'Name of this transaction',
      save: v => txInlineSave(id, field, v),
    });
  };
  /* The same checks as the expense form: balances follow, a pocket never goes below zero. */
  window.txInlineSave = function (id, field, v) {
    const t = txById(id); if (!t) return null;
    const next = {};
    if (field === 'amount') {
      const n = parseAmountInput(v);
      if (!(n > 0)) return 'Enter an amount greater than zero.';
      if (n === Math.abs(t.amount)) return null;
      next.amount = t.amount < 0 ? -n : n;
    } else {
      if (v === (t.comment || '')) return null;
      next.comment = v;
      // One logo per name, like the expense form.
      if (v && t.type !== 'transfer') {
        const logo = txLogoForName(v, t.id) || (typeof builtinLogoFor === 'function' ? builtinLogoFor(v) : '');
        if (logo && logo !== t.logo) next.logo = logo;
      }
    }
    const before = JSON.stringify(data), oldEUR = toEUR(Math.abs(t.amount), t.currency);
    const record = Object.assign({}, t, next), src = txSource(record);
    applyTxToAccountBalance(t, -1);
    if (src && !txSourceHolds(src, record)) { applyTxToAccountBalance(t, 1); return `${src.label} doesn't hold enough for that.`; }
    Object.assign(t, next);
    applyTxToAccountBalance(t, 1);
    if (next.logo && t.comment) shareTxLogoByName(t.comment, next.logo);
    save(); render();
    offerUndo(field === 'amount' ? 'Amount changed' : 'Name changed', before);
    if (field === 'amount' && typeof budgetCheckAfterSave === 'function') budgetCheckAfterSave(t, toEUR(Math.abs(t.amount), t.currency) - oldEUR);
    return null;
  };
  window.catInline = function (e, kind, catId, subId) {
    e.stopPropagation();
    const node = getCategoryNode(kind, catId, subId); if (!node) return;
    const el = e.currentTarget.classList.contains('il') ? e.currentTarget : e.currentTarget.closest('.row-flex').querySelector('.il');
    inlineEdit(el, {
      value: node.name, label: `New name for ${node.name}`,
      save: v => {
        if (!v) return "A category needs a name.";
        const before = JSON.stringify(data);
        node.name = v;
        save(); render();
        offerUndo('Category renamed', before);
        return null;
      },
    });
  };

  /* ---- Charts that filter the list ---- */
  const knownCat = kind => id => !!categoryById(kind, id);
  window.budgetCatFilterOn = (kind, id) => !!(ui.txCatFilter && ui.txCatFilter.kind === kind && (ui.txCatFilter.id || null) === (id || null));
  window.budgetFilterTxs = function (txs) {
    const f = ui.txCatFilter;
    return f ? txs.filter(t => txInCategory(t, f.kind, f.id, knownCat(f.kind))) : txs;
  };
  window.budgetFilterCat = function (kind, id) {
    ui.txCatFilter = budgetCatFilterOn(kind, id) ? null : { kind, id: id || null };
    if (ui.txCatFilter) { ui.budgetTab = 'transactions'; ui.txSelect = null; }
    render();
    if (ui.txCatFilter && typeof drillScroll === 'function') setTimeout(() => drillScroll('.tx-list-tools'), 30);
  };
  window.budgetDonutTap = function (e, kind) {
    const seg = e.target.closest && e.target.closest('[data-cat]');
    if (seg) budgetFilterCat(kind, seg.getAttribute('data-cat') || null);
  };
  window.budgetFilterChipHtml = function (n) {
    const f = ui.txCatFilter; if (!f) return '';
    const c = f.id ? categoryById(f.kind, f.id) : null;
    const name = c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : 'Uncategorized';
    return `<div class="bl-filter"><span>${f.kind === 'income' ? 'Income' : 'Spending'}: <b>${escHtml(name)}</b> · ${n} transaction${n === 1 ? '' : 's'}</span><button class="btn small" onclick="budgetFilterCat('${f.kind}', ${f.id ? `'${escHtml(f.id)}'` : 'null'})" aria-label="Show every category">${ic('x', 13)} All categories</button></div>`;
  };

  /* ---- Drag: categories into order, a transaction onto a category ---- */
  function sortable(el, opts) {
    if (el.sortable || typeof loadSortable !== 'function') return;
    el.sortable = true;
    loadSortable().then(Sortable => {
      if (!el.isConnected) return;
      el.sortable = Sortable.create(el, Object.assign({ animation: reduced() ? 0 : 160, forceFallback: true, fallbackTolerance: 4, delay: 220, delayOnTouchOnly: true, touchStartThreshold: 6 }, opts));
    }).catch(() => { el.sortable = null; });
  }
  function reorderCategories(kind, catId, ids) {
    const before = JSON.stringify(data);
    if (catId) {
      const cat = (data.categories[kind] || []).find(c => c.id === catId); if (!cat) return;
      const by = new Map((cat.subcategories || []).map(s => [s.id, s]));
      const next = ids.map(id => by.get(id)).filter(Boolean);
      (cat.subcategories || []).forEach(s => { if (!next.includes(s)) next.push(s); });
      cat.subcategories = next;
    } else {
      const by = new Map((data.categories[kind] || []).map(c => [c.id, c]));
      const next = ids.map(id => by.get(id)).filter(Boolean);
      (data.categories[kind] || []).forEach(c => { if (!next.includes(c)) next.push(c); });
      data.categories[kind] = next;
    }
    if (before === JSON.stringify(data)) return;
    save(); render();
    offerUndo('Categories reordered', before);
  }
  window.reorderCategories = reorderCategories;

  /* Dragging a transaction: a tray of its categories comes up; let go on one to move it there. */
  let drag = null;
  const point = e => {
    const p = e && (e.changedTouches && e.changedTouches[0] || e.touches && e.touches[0] || e);
    return p && p.clientX != null ? [p.clientX, p.clientY] : null;
  };
  function trayAt(xy) {
    const el = xy && document.elementFromPoint(xy[0], xy[1]);
    return el && el.closest ? el.closest('.tx-tray-cat') : null;
  }
  function trackDrag(e) {
    if (!drag) return;
    const xy = point(e); if (!xy) return;
    drag.xy = xy;
    const over = trayAt(xy);
    if (over !== drag.over) { if (drag.over) drag.over.classList.remove('over'); if (over) over.classList.add('over'); drag.over = over; }
  }
  ['pointermove', 'mousemove', 'touchmove'].forEach(ev => document.addEventListener(ev, trackDrag, { passive: true }));
  function trayOpen(t) {
    const kind = t.type === 'income' ? 'income' : 'expense';
    const tray = document.createElement('div');
    tray.className = 'tx-tray';
    tray.innerHTML = `<div class="tx-tray-t">Drop on a category to move <b>${escHtml(t.comment || 'it')}</b></div>
      <div class="tx-tray-cats">${(data.categories[kind] || []).map(c => `<div class="tx-tray-cat ${c.id === t.categoryId ? 'cur' : ''}" data-cat="${escHtml(c.id)}">${c.icon ? `<span>${c.icon}</span>` : ''}${escHtml(c.name)}</div>`).join('')}</div>`;
    document.body.appendChild(tray);
    requestAnimationFrame(() => tray.classList.add('show'));
    return tray;
  }
  window.txSetCategory = function (id, catId) {
    const t = txById(id); if (!t || !catId || t.categoryId === catId) return;
    const kind = t.type === 'income' ? 'income' : 'expense', c = categoryById(kind, catId); if (!c) return;
    const before = JSON.stringify(data);
    t.categoryId = catId; t.subCategoryId = null;
    if (t.toReview || isToReview(t)) t.reviewed = true;
    delete t.toReview;
    save(); render();
    offerUndo(`Moved to ${c.name}`, before);
  };
  function txDraggable(day) {
    sortable(day, {
      sort: false, draggable: '[data-tx-kind="expense"], [data-tx-kind="income"]', filter: 'button, input, .editing', preventOnFilter: false,
      delay: 350, fallbackOnBody: true, ghostClass: 'tx-drag-ghost', chosenClass: 'tx-drag-chosen',
      onStart: evt => {
        const t = txById(evt.item.dataset.tx); if (!t) return;
        drag = { id: t.id, tray: trayOpen(t), over: null, xy: null };
        document.documentElement.classList.add('tx-dragging');
      },
      onEnd: evt => {
        const d = drag; drag = null;
        document.documentElement.classList.remove('tx-dragging');
        if (!d) return;
        const target = trayAt(point(evt.originalEvent) || d.xy) || d.over;
        d.tray.remove();
        if (target) txSetCategory(d.id, target.dataset.cat);
      },
    });
  }

  /* ---- Swipe a month ---- */
  let swallowUntil = 0;
  document.addEventListener('click', e => { if (Date.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
  function swipeable(el) {
    if (el.dataset.swipe) return;
    el.dataset.swipe = '1';
    let s = null;
    el.addEventListener('pointerdown', e => { s = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY, t: Date.now() }; }, { passive: true });
    el.addEventListener('pointercancel', () => { s = null; });
    el.addEventListener('pointerup', e => {
      if (!s) return;
      const step = swipeMonthStep(e.clientX - s.x, e.clientY - s.y, Date.now() - s.t);
      s = null;
      if (!step) return;
      swallowUntil = Date.now() + 400;
      ui.budgetSlide = step;
      shiftBudgetMonth(step);
    });
  }

  /* ---- After each redraw ---- */
  let lastView = null;
  window.budgetLiveAfterRender = function (app) {
    document.querySelectorAll('.ba-list').forEach(list => sortable(list, {
      handle: '.ba-h', delay: 0,
      onEnd: () => setLayout(list.dataset.kind, Array.from(list.children).map(el => el.dataset.id)),
    }));
    if (ui.page !== 'budget') { lastView = null; return; }
    app.querySelectorAll('.cat-sort').forEach(list => sortable(list, {
      handle: '.drag-cat', delay: 0,
      onEnd: () => reorderCategories(list.dataset.kind, null, Array.from(list.children).map(el => el.dataset.id)),
    }));
    app.querySelectorAll('.sub-sort').forEach(list => sortable(list, {
      handle: '.drag-sub', delay: 0,
      onEnd: () => reorderCategories(list.dataset.kind, list.dataset.cat, Array.from(list.children).map(el => el.dataset.id)),
    }));
    if (!(typeof bulkSelecting === 'function' && bulkSelecting())) app.querySelectorAll('.tx-day').forEach(txDraggable);
    app.querySelectorAll('.bt-head, .bt-summary').forEach(swipeable);
    // The month (or tab) changed: it slides in from the side you went to; budget bars grow in.
    const m = ui.budgetMonth, view = { tab: ui.budgetTab, ym: m ? m.getFullYear() * 12 + m.getMonth() : 0 };
    const page = app.querySelector('.page');
    if (page && lastView && !reduced() && (view.tab !== lastView.tab || view.ym !== lastView.ym)) {
      const dir = view.ym > lastView.ym ? 'next' : view.ym < lastView.ym ? 'prev' : 'tab';
      page.classList.add('bl-enter', 'bl-' + dir);
      setTimeout(() => page.classList.remove('bl-enter', 'bl-next', 'bl-prev', 'bl-tab'), 900);
    }
    ui.budgetSlide = 0;
    lastView = view;
  };
}
