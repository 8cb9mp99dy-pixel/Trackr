/* ===================== Transaction rules (Budget → Categories → Rules) =====================
 * Its own file. Your own "if … then …" for income and expenses, used when you add a transaction
 * and when you import a file — before Trackr's learned categories, so a rule always wins.
 *
 *   IF   the name contains / is / starts with "…"   (case and accents ignored)
 *        and (optional) the amount is between A and B, it's income or spending, it's on account C
 *   THEN set the category (and sub-category), rename it to "…", mark it Fixed / Recurring.
 *
 * Rules are checked from the top of the list down; the first one that matches is used (move a
 * rule up to give it priority). Creating or editing a rule shows how many past transactions it
 * matches, and you can apply it to the ones you tick — nothing changes without that.
 *
 * data.txRules = [{ id, active, when: { op: 'contains'|'is'|'starts', text, type: ''|'expense'|'income',
 *   min, max, accountId }, then: { categoryId, subCategoryId, rename, recurring: true|null } }]
 * The first half is pure (tested in Node: tests/unit/rules.test.js).
 */
function ruleNorm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
/* tx: { name, amount (positive), type, accountId } */
function ruleMatches(rule, tx) {
  if (!rule || rule.active === false) return false;
  const w = rule.when || {};
  const text = ruleNorm(w.text), name = ruleNorm(tx.name);
  if (!text) return false;
  if (w.op === 'is' ? name !== text : w.op === 'starts' ? !name.startsWith(text) : !name.includes(text)) return false;
  if (w.type && w.type !== tx.type) return false;
  const amt = Math.abs(+tx.amount);
  if (w.min !== '' && w.min != null && isFinite(+w.min) && !(amt >= +w.min)) return false;
  if (w.max !== '' && w.max != null && isFinite(+w.max) && !(amt <= +w.max)) return false;
  if (w.accountId && w.accountId !== tx.accountId) return false;
  return true;
}
/* The first rule that matches, or null. */
function ruleFor(rules, tx) { return (rules || []).find(r => ruleMatches(r, tx)) || null; }
if (typeof module !== 'undefined' && module.exports) module.exports = { ruleNorm, ruleMatches, ruleFor };

/* ---------- In the app (browser only) ---------- */
if (typeof window !== 'undefined') {
  window.txRules = function () { if (!Array.isArray(data.txRules)) data.txRules = []; return data.txRules; };
  /* What a rule would set on a transaction draft (type decides which category list applies). */
  window.ruleChanges = function (rule, type) {
    const t = rule.then || {}, out = {};
    const cat = t.categoryId && categoryById(type, t.categoryId);
    if (cat) { out.categoryId = cat.id; out.subCategoryId = t.subCategoryId && (cat.subcategories || []).some(s => s.id === t.subCategoryId) ? t.subCategoryId : ''; }
    if (t.rename && t.rename.trim()) out.comment = t.rename.trim();
    if (t.recurring) out.nature = 'Fixed';
    return out;
  };
  window.ruleSummary = function (rule) {
    const w = rule.when || {}, t = rule.then || {};
    const opTxt = { is: 'is', starts: 'starts with', contains: 'contains' }[w.op] || 'contains';
    const ifs = [`name ${opTxt} “${w.text}”`];
    if (w.type) ifs.push(w.type === 'income' ? 'income' : 'spending');
    if (w.min !== '' && w.min != null && w.max !== '' && w.max != null) ifs.push(`${fmtMoney(+w.min)}–${fmtMoney(+w.max)}`);
    else if (w.min !== '' && w.min != null) ifs.push(`≥ ${fmtMoney(+w.min)}`);
    else if (w.max !== '' && w.max != null) ifs.push(`≤ ${fmtMoney(+w.max)}`);
    if (w.accountId) { const a = accountById(w.accountId); if (a) ifs.push(`on ${a.name}`); }
    const thens = [];
    const typ = w.type || 'expense';
    const cat = t.categoryId && (categoryById(typ, t.categoryId) || categoryById(typ === 'income' ? 'expense' : 'income', t.categoryId));
    if (cat) { const sub = t.subCategoryId && (cat.subcategories || []).find(s => s.id === t.subCategoryId); thens.push(`${cat.name}${sub ? ' › ' + sub.name : ''}`); }
    if (t.rename) thens.push(`rename “${t.rename}”`);
    if (t.recurring) thens.push('recurring');
    return { ifs: ifs.join(' · '), thens: thens.join(' · ') || 'nothing yet' };
  };
  /* Used by the add form (txNext) and by the importer. */
  window.ruleForTx = function (tx) { return ruleFor(txRules(), tx); };
  /* Past income and expenses a rule matches, newest first. */
  window.rulePastMatches = function (rule) {
    return (data.budgetTransactions || []).filter(t => (t.type === 'income' || t.type === 'expense') && ruleMatches(Object.assign({}, rule, { active: true }), { name: t.comment, amount: t.amount, type: t.type, accountId: t.accountId }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  };

  /* ---- List (Budget → Categories) ---- */
  window.rulesCardHtml = function () {
    const list = txRules();
    return `
    <div class="card" style="margin-top:20px;">
      <div class="row-flex" style="margin-bottom:6px;gap:10px;"><div><div class="eyebrow">Rules</div><div style="font-size:12.5px;opacity:.6;">Used when you add or import a transaction, before the categories Trackr learned. The first match wins.</div></div><button class="btn small" onclick="openRuleForm()">${ic('plus', 14)} New rule</button></div>
      ${list.length ? `<div class="stack-gap-8" style="margin-top:10px;">${list.map((r, i) => { const s = ruleSummary(r); return `
        <div class="rule-row ${r.active === false ? 'off' : ''}">
          <div class="rule-txt"><div><span class="dim">If</span> ${escHtml(s.ifs)}</div><div><span class="dim">then</span> <strong>${escHtml(s.thens)}</strong></div></div>
          <div class="rule-btns">
            <button class="icon-btn-round" style="width:30px;height:30px;" ${i ? '' : 'disabled'} onclick="moveRule('${r.id}',-1)" aria-label="Move up" title="Higher priority">↑</button>
            <button class="toggle ${r.active === false ? '' : 'on'}" onclick="toggleRule('${r.id}')" aria-label="Use this rule"></button>
            <button class="btn small ghost" onclick="openRuleForm('${r.id}')">Edit</button>
          </div>
        </div>`; }).join('')}</div>`
        : '<div class="ret-sub" style="margin-top:8px;">No rules yet. Example: if the name contains “albert heijn”, then Food & Groceries › Groceries.</div>'}
    </div>`;
  };
  window.toggleRule = function (id) { const r = txRules().find(x => x.id === id); if (r) { r.active = r.active === false; save(); render(); } };
  window.moveRule = function (id, d) {
    const l = txRules(), i = l.findIndex(x => x.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]]; save(); render();
  };
  window.deleteRule = function (id) { data.txRules = txRules().filter(x => x.id !== id); save(); closeModal(); };

  /* ---- Editor with live preview ---- */
  window.openRuleForm = function (id, seed) {
    const r = id ? txRules().find(x => x.id === id) : null;
    const base = r ? JSON.parse(JSON.stringify(r)) : { id: null, active: true, when: { op: 'contains', text: '', type: '', min: '', max: '', accountId: '' }, then: { categoryId: '', subCategoryId: '', rename: '', recurring: null } };
    if (seed) Object.assign(base.when, seed.when || {}), Object.assign(base.then, seed.then || {});
    ui.modal = { type: 'txRule', payload: Object.assign(base, { pick: {} }) };
    render();
  };
  /* Reads the form into the payload (so redraws keep what you typed). */
  window.ruleFormRead = function () {
    const p = ui.modal && ui.modal.payload; if (!p) return null;
    const v = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
    if (v('rf-text') !== undefined) {
      Object.assign(p.when, { op: v('rf-op'), text: v('rf-text'), type: v('rf-type'), min: v('rf-min'), max: v('rf-max'), accountId: v('rf-acc') });
      Object.assign(p.then, { categoryId: v('rf-cat'), subCategoryId: v('rf-sub'), rename: v('rf-rename'), recurring: document.getElementById('rf-rec').checked || null });
    }
    return p;
  };
  window.ruleFormRedraw = function () {
    const p = ruleFormRead(); if (!p) return;
    const cats = data.categories[p.when.type === 'income' ? 'income' : 'expense'] || [];
    if (p.then.categoryId && !cats.some(c => c.id === p.then.categoryId)) { p.then.categoryId = ''; p.then.subCategoryId = ''; }
    render();
    const el = document.getElementById('rf-text'); if (el && document.activeElement !== el && ui.ruleFocusText) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    ui.ruleFocusText = false;
  };
  window.__modalRenderers.txRule = function (p) {
    const w = p.when, t = p.then;
    const kind = w.type === 'income' ? 'income' : 'expense';
    const cats = data.categories[kind] || [];
    const cat = cats.find(c => c.id === t.categoryId);
    const matches = w.text.trim() ? rulePastMatches(p) : [];
    const changeOf = tx => { const ch = ruleChanges(p, tx.type); return (ch.categoryId && (ch.categoryId !== tx.categoryId || (ch.subCategoryId || '') !== (tx.subCategoryId || ''))) || (ch.comment && ch.comment !== tx.comment); };
    const changing = matches.filter(changeOf);
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? 'Edit rule' : 'New rule'}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="stack-gap-12">
        <div class="tx-label">If</div>
        <div class="form-grid">
          <label class="field"><span class="label-text">Name</span><select id="rf-op" onchange="ruleFormRedraw()">${[['contains', 'contains'], ['starts', 'starts with'], ['is', 'is exactly']].map(([k, l]) => `<option value="${k}" ${w.op === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span class="label-text">Text</span><input id="rf-text" value="${escHtml(w.text)}" placeholder="e.g. albert heijn" autocomplete="off" oninput="ui.ruleFocusText=true;clearTimeout(window._rfT);window._rfT=setTimeout(ruleFormRedraw,350)"></label>
        </div>
        <div class="form-grid">
          <label class="field"><span class="label-text">Type</span><select id="rf-type" onchange="ruleFormRedraw()"><option value="" ${!w.type ? 'selected' : ''}>Income or spending</option><option value="expense" ${w.type === 'expense' ? 'selected' : ''}>Spending</option><option value="income" ${w.type === 'income' ? 'selected' : ''}>Income</option></select></label>
          <label class="field"><span class="label-text">Account <span style="opacity:.65;">(optional)</span></span><select id="rf-acc" onchange="ruleFormRedraw()"><option value="">Any</option>${data.accounts.map(a => `<option value="${a.id}" ${w.accountId === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select></label>
        </div>
        <div class="form-grid">
          <label class="field"><span class="label-text">Amount from <span style="opacity:.65;">(optional)</span></span><input id="rf-min" type="number" step="0.01" min="0" inputmode="decimal" value="${escHtml(String(w.min == null ? '' : w.min))}" onchange="ruleFormRedraw()"></label>
          <label class="field"><span class="label-text">to</span><input id="rf-max" type="number" step="0.01" min="0" inputmode="decimal" value="${escHtml(String(w.max == null ? '' : w.max))}" onchange="ruleFormRedraw()"></label>
        </div>
        <div class="tx-label">Then</div>
        <div class="form-grid">
          <label class="field"><span class="label-text">Category${w.type ? '' : ' <span style="opacity:.65;">(pick a type first for income)</span>'}</span><select id="rf-cat" onchange="ruleFormRedraw()"><option value="">Leave as is</option>${cats.map(c => `<option value="${c.id}" ${t.categoryId === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span class="label-text">Sub-category</span><select id="rf-sub" ${cat ? '' : 'disabled'} onchange="ruleFormRedraw()"><option value="">${cat ? 'None' : '—'}</option>${cat ? (cat.subcategories || []).map(s => `<option value="${s.id}" ${t.subCategoryId === s.id ? 'selected' : ''}>${escHtml(s.name)}</option>`).join('') : ''}</select></label>
        </div>
        <label class="field"><span class="label-text">Rename to <span style="opacity:.65;">(optional)</span></span><input id="rf-rename" value="${escHtml(t.rename || '')}" placeholder="e.g. Albert Heijn" autocomplete="off"></label>
        <label class="switch-row" style="font-size:13px;"><input type="checkbox" id="rf-rec" ${t.recurring ? 'checked' : ''} style="width:18px;height:18px;"> <span>Mark new ones Fixed / Recurring</span></label>
        <div class="rule-preview">
          ${!w.text.trim() ? '<span class="ret-sub">Type a name to see which past transactions match.</span>' : `
          <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${matches.length} past transaction${matches.length === 1 ? '' : 's'} match${matches.length === 1 ? 'es' : ''}${changing.length ? ` · ${changing.length} would change` : ''}</div>
          ${changing.length ? `<div style="font-size:12px;opacity:.6;margin-bottom:6px;">Tick the ones to update now (category / name only)${changing.length > 60 ? ` — the first 60 are shown; save, then open the rule again for the rest` : ''}:</div>
          <div class="rule-matches">${changing.slice(0, 60).map(tx => { const ch = ruleChanges(p, tx.type), c0 = categoryById(tx.type, tx.categoryId), c1 = ch.categoryId ? categoryById(tx.type, ch.categoryId) : c0; return `<label class="rule-match"><input type="checkbox" ${p.pick[tx.id] ? 'checked' : ''} onchange="ui.modal.payload.pick['${tx.id}']=this.checked" style="width:16px;height:16px;flex:none;"><span class="rm-d">${escHtml(ymdToDate(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }))}</span><span class="rm-n">${escHtml(tx.comment || '—')}${ch.comment && ch.comment !== tx.comment ? ` → ${escHtml(ch.comment)}` : ''}</span><span class="rm-c">${escHtml(c0 ? c0.name : '—')}${c1 !== c0 ? ` → ${escHtml(c1 ? c1.name : '—')}` : ''}</span><span class="rm-a">${fmtMoney(tx.amount, tx.currency)}</span></label>`; }).join('')}</div>
          <div style="margin-top:6px;"><button class="link-btn" style="font-size:12.5px;" onclick="changingPick(true)">Tick all</button> · <button class="link-btn" style="font-size:12.5px;" onclick="changingPick(false)">None</button></div>` : ''}`}
        </div>
        <div id="rf-err" style="display:none;color:var(--negative);font-size:12.5px;"></div>
      </div>
      <div class="modal-actions">
        ${p.id ? `<button class="btn ghost" style="margin-right:auto;color:var(--negative);" onclick="deleteRule('${p.id}')">Delete</button>` : ''}
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="saveTxRule()">${(n => n ? `Save and update ${n} transaction${n === 1 ? '' : 's'}` : 'Save')(Object.values(p.pick).filter(Boolean).length)}</button>
      </div>`;
  };
  // Ticks only the rows on screen (the list shows up to 60), so nothing you didn't see changes.
  window.changingPick = function (on) {
    const p = ruleFormRead();
    const changing = rulePastMatches(p).filter(tx => { const ch = ruleChanges(p, tx.type); return (ch.categoryId && (ch.categoryId !== tx.categoryId || (ch.subCategoryId || '') !== (tx.subCategoryId || ''))) || (ch.comment && ch.comment !== tx.comment); });
    p.pick = {};
    changing.slice(0, 60).forEach(tx => { p.pick[tx.id] = on; });
    render();
  };
  window.saveTxRule = function () {
    const p = ruleFormRead(), err = document.getElementById('rf-err');
    if (!p.when.text.trim()) { err.textContent = 'Type the text the name must contain.'; err.style.display = 'block'; return; }
    if (!p.then.categoryId && !p.then.rename.trim() && !p.then.recurring) { err.textContent = 'Choose what the rule does: a category, a new name or recurring.'; err.style.display = 'block'; return; }
    const rule = { id: p.id || uid('rule'), active: p.active !== false, when: Object.assign({}, p.when, { text: p.when.text.trim() }), then: Object.assign({}, p.then, { rename: (p.then.rename || '').trim() }) };
    const list = txRules(), i = list.findIndex(x => x.id === rule.id);
    if (i >= 0) list[i] = rule; else list.push(rule);
    // Ticked past transactions: category / sub-category and name only (balances don't move).
    let n = 0;
    rulePastMatches(rule).forEach(tx => {
      if (!p.pick[tx.id]) return;
      const ch = ruleChanges(rule, tx.type);
      if (ch.categoryId) { tx.categoryId = ch.categoryId; tx.subCategoryId = ch.subCategoryId || null; }
      if (ch.comment) tx.comment = ch.comment;
      n++;
    });
    save(); closeModal();   // the bar at the bottom offers Undo for 10 s (safety.js)
  };
}
