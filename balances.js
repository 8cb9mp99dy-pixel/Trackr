/* ===================== Balances from transactions =====================
 * Its own file, loaded right after app.js. Asked for by the user on 10 Nov 2026: balances changed
 * on their own and some went negative, because a balance was a stored number that every action
 * added to or took from (applyTxToAccountBalance), never worked out again.
 *
 * Now every place money sits has a starting point, and its balance is that start plus the
 * transactions that touch it from that day on:
 *   bank account (main balance)  acc:<id>        a.openingBalance  / a.openingDate
 *   pocket                       pk:<acc>:<id>   p.openingAmount   / p.openingDate
 *   broker cash (own number)     brk:<id>        b.cashOpening     / b.cashOpeningDate
 *   exchange cash                cx:<exchange>   c.openingAmount   / c.openingDate
 * A broker with the same name as a bank account has no cash of its own: it is that account's
 * main balance (linkedAccountForBroker), as before.
 *
 * What moves a balance (dated on or after its start): Budget transactions only, i.e. incomes and
 * expenses with an account (and pocket) and transfers (from / to). Nothing else (the user's rule,
 * 10 Nov 2026: "only changes in the budget part should be able to move cash balances").
 * The stored numbers (a.balance, p.amountSaved, b.cashBalance, c.amount) are only a copy, written
 * again at every save: a copy changed any other way is simply put back. Balance fields outside
 * Budget are read-only with "Fix in Budget" (openBalanceFix): it fills in a "Balance correction"
 * transfer (from / to 'adj:correction') in the Budget form, and it moves the balance only when you
 * save it there. Buttons on other pages that make transactions (a deposit, the Income plan split,
 * closing a pocket, interest, an invoice paid, the cash wallet) fill in the Budget form or the "Add
 * to Budget" window instead (budgetConfirm). An applied trade never touches cash. A change that
 * would take any balance below zero is refused. An amount in another currency is converted once, when first counted, and kept on
 * the transaction (t.fxIn), so a rate moving never moves a balance.
 *
 * Until the user switches (data.settings.balanceModel === 'tx'), Trackr works as before; the
 * switch asks for a backup file first (this device + the cloud row), then the real balances from
 * the bank apps (the starting points), then shows what didn't match, for review. Nothing is fixed
 * automatically.
 *
 * Sync: balMerge() keeps both sides' transactions, the newer version of one changed on both
 * (t.updatedAt, stamped at save), and what was deleted (data.deletedTx), and says what it did.
 *
 * balPlaces(), balCompute(), balRefused(), balCounts(), balMerge(), balTxSig() are pure
 * (Node-tested in tests/unit/balances.test.js).
 */
const BAL_ADJ = 'adj:correction';
const balR2 = n => Math.round(n * 100) / 100;

/* Every place money sits, by ref. env.linkedAccountId(broker) → the bank account that is its cash. */
function balPlaces(doc, env) {
  const out = new Map();
  (doc.accounts || []).forEach(a => {
    out.set('acc:' + a.id, { ref: 'acc:' + a.id, kind: 'acc', ccy: a.currency || 'EUR', obj: a, key: 'balance', openKey: 'openingBalance', dateKey: 'openingDate', name: a.name });
    (a.pockets || []).forEach(p => out.set(`pk:${a.id}:${p.id}`, { ref: `pk:${a.id}:${p.id}`, kind: 'pk', ccy: a.currency || 'EUR', obj: p, key: 'amountSaved', openKey: 'openingAmount', dateKey: 'openingDate', name: `${a.name} › ${p.name}`, accountId: a.id }));
  });
  (doc.brokers || []).forEach(b => {
    if (env.linkedAccountId && env.linkedAccountId(b)) return;
    out.set('brk:' + b.id, { ref: 'brk:' + b.id, kind: 'brk', ccy: b.cashCurrency || 'EUR', obj: b, key: 'cashBalance', openKey: 'cashOpening', dateKey: 'cashOpeningDate', name: `${b.name} (cash)` });
  });
  (doc.cryptoExchangeCash || []).forEach(c => {
    const ref = 'cx:' + String(c.exchange || '').trim().toLowerCase();
    if (out.has(ref)) return; // the first one counts, as cryptoExchangeCashFor
    out.set(ref, { ref, kind: 'cx', ccy: c.currency || 'EUR', obj: c, key: 'amount', openKey: 'openingAmount', dateKey: 'openingDate', name: `${c.exchange} (cash)` });
  });
  out.forEach(p => {
    p.cache = Number.isFinite(+p.obj[p.key]) ? +p.obj[p.key] : 0;
    p.opening = Number.isFinite(+p.obj[p.openKey]) && p.obj[p.openKey] !== null && p.obj[p.openKey] !== '' ? +p.obj[p.openKey] : null;
    p.openingDate = typeof p.obj[p.dateKey] === 'string' && p.obj[p.dateKey] ? p.obj[p.dateKey] : null;
  });
  return out;
}
/* A transfer ref → the place it moves ('' if none: deleted, or a balance correction). */
function balResolve(ref, doc, env) {
  const s = String(ref || ''), i = s.indexOf(':');
  if (i < 0) return '';
  const kind = s.slice(0, i), rest = s.slice(i + 1);
  if (kind === 'acc' || kind === 'pk') return s;
  if (kind === 'cx') return 'cx:' + rest.trim().toLowerCase();
  if (kind === 'brk') {
    const b = (doc.brokers || []).find(x => x.id === rest);
    const acc = b && env.linkedAccountId ? env.linkedAccountId(b) : null;
    return acc ? 'acc:' + acc : s;
  }
  return '';
}
/* What a transaction moves in one currency, converted once and kept on it (t.fxIn[side]). */
function balAmountIn(t, side, ccy, env) {
  const amt = +t.amount || 0, from = t.currency || 'EUR';
  if (from === ccy || !amt) return amt;
  const sig = `${amt} ${from}>${ccy}`, kept = t.fxIn && t.fxIn[side];
  if (kept && kept.s === sig && Number.isFinite(kept.v)) return kept.v;
  const v = balR2(env.fx ? env.fx(amt, from, ccy) : amt);
  if (env.freeze) { if (!t.fxIn || typeof t.fxIn !== 'object') t.fxIn = {}; t.fxIn[side] = { s: sig, v }; }
  return v;
}
/* Every move: { ref, delta (in the place's currency), date, tx }. */
function balEffects(doc, env, txs, places) {
  const out = [];
  const ccyOf = ref => (places.get(ref) || {}).ccy;
  txs.forEach(t => {
    if (!t || !t.date) return;
    if (t.type === 'transfer') {
      const from = balResolve(t.from, doc, env), to = balResolve(t.to, doc, env);
      if (from && places.has(from)) out.push({ ref: from, delta: -balAmountIn(t, 'from', ccyOf(from), env), date: t.date, tx: t });
      if (to && places.has(to)) out.push({ ref: to, delta: balAmountIn(t, 'to', ccyOf(to), env), date: t.date, tx: t });
      return;
    }
    if ((t.type !== 'income' && t.type !== 'expense') || !t.accountId) return;
    const ref = t.pocketId ? `pk:${t.accountId}:${t.pocketId}` : 'acc:' + t.accountId;
    if (!places.has(ref)) return; // its pocket was deleted: it moves nothing, as before
    const v = balAmountIn(t, 'acc', ccyOf(ref), env);
    out.push({ ref, delta: t.type === 'income' ? v : -v, date: t.date, tx: t });
  });
  return out;
}
/* Every balance, worked out. opts.without: Set of transaction ids to leave out; opts.extra:
   transactions to add (a change being checked). A place with no start yet starts today at what it
   shows (its copy), so nothing jumps: anchors lists those. */
function balCompute(doc, env, opts) {
  opts = opts || {};
  const places = balPlaces(doc, env), today = env.today;
  const without = opts.without || null;
  const txs = (doc.budgetTransactions || []).filter(t => !without || !without.has(t.id)).concat(opts.extra || []);
  const sum = {}, sumToday = {}, moves = {};
  balEffects(doc, env, txs, places).forEach(e => {
    const p = places.get(e.ref);
    if (e.date >= today) sumToday[e.ref] = (sumToday[e.ref] || 0) + e.delta;
    if (e.date >= (p.openingDate || today)) {
      sum[e.ref] = (sum[e.ref] || 0) + e.delta;
      (moves[e.ref] || (moves[e.ref] = [])).push(e);
    }
  });
  const values = {}, anchors = [];
  places.forEach((p, ref) => {
    let opening = p.opening, date = p.openingDate;
    if (opening == null || !date) {
      date = today;
      opening = balR2(p.cache - (sumToday[ref] || 0));
      anchors.push({ ref, opening, date });
    }
    values[ref] = balR2(opening + (sum[ref] || 0));
  });
  return { values, places, anchors, moves };
}
/* Why a change can't be made ('' if it can): a balance would go below zero and lower than now. */
function balRefused(doc, env, records, removedIds) {
  const base = balCompute(doc, env).values;
  const without = new Set(removedIds || []);
  (records || []).forEach(r => { if (r && r.id) without.add(r.id); });
  const next = balCompute(doc, env, { without, extra: records || [] });
  const low = [];
  Object.keys(next.values).forEach(ref => {
    const v = next.values[ref], b = base[ref] == null ? 0 : base[ref];
    if (v < -0.005 && v < b - 0.005) low.push({ ref, name: next.places.get(ref).name, ccy: next.places.get(ref).ccy, value: v, before: b });
  });
  return low;
}
/* Does this transaction move a balance (its date is on or after the start of a place it touches)? */
function balCounts(doc, env, rec) {
  const places = balPlaces(doc, env);
  const refs = rec.type === 'transfer' ? [balResolve(rec.from, doc, env), balResolve(rec.to, doc, env)]
    : rec.accountId ? [rec.pocketId ? `pk:${rec.accountId}:${rec.pocketId}` : 'acc:' + rec.accountId] : [];
  return refs.some(ref => { const p = ref && places.get(ref); return !!p && rec.date >= (p.openingDate || env.today); });
}
/* A "Balance correction": a transfer from / to nowhere, so it shows in Budget and moves no budget. */
function balCorrection(ref, delta, today, ccy, name, id) {
  const r = { id, date: today, type: 'transfer', categoryId: null, subCategoryId: null, nature: 'Variable', paymentMethodId: null, accountId: null,
    currency: ccy, amount: balR2(Math.abs(delta)), comment: 'Balance correction', location: '', description: 'A balance set by hand, not by a transaction', logo: '', impact: '', correction: true };
  if (delta > 0) Object.assign(r, { from: BAL_ADJ, to: ref, fromLabel: 'Balance correction', toLabel: name });
  else Object.assign(r, { from: ref, to: BAL_ADJ, fromLabel: name, toLabel: 'Balance correction' });
  return r;
}
/* A transaction's content, for "did it change?" (not its stamp or its kept conversions). */
function balTxSig(t) {
  const c = Object.assign({}, t); delete c.updatedAt; delete c.fxIn;
  return JSON.stringify(c, Object.keys(c).sort());
}
/* Two copies that both changed: keep every transaction from both sides; one changed on both keeps
   its newer version (updatedAt; the same moment or unknown: the cloud's); one deleted on one side
   stays deleted unless the other side changed it afterwards. Everything else comes from the cloud,
   plus the accounts, pockets, brokers and exchange cash only this device has (their transactions
   need them). Returns { doc, report }. */
function balMerge(local, remote) {
  const L = (local && local.budgetTransactions) || [], R = (remote && remote.budgetTransactions) || [];
  const delL = (local && local.deletedTx) || {}, delR = (remote && remote.deletedTx) || {};
  const byL = new Map(L.map(t => [t.id, t])), byR = new Map(R.map(t => [t.id, t]));
  const report = { onlyHere: [], onlyThere: [], both: [], deletedHere: [], deletedThere: [], same: 0 };
  const out = [];
  const name = t => t.comment || t.type;
  R.forEach(r => {
    const l = byL.get(r.id);
    if (!l) {
      if (delL[r.id] && delL[r.id] >= (r.updatedAt || '')) { report.deletedHere.push(name(r)); return; }
      report.onlyThere.push(name(r)); out.push(r); return;
    }
    if (balTxSig(l) === balTxSig(r)) { report.same++; out.push((l.updatedAt || '') > (r.updatedAt || '') ? l : r); return; }
    const keep = (l.updatedAt || '') > (r.updatedAt || '') ? l : r;
    report.both.push({ name: name(keep), kept: keep === l ? 'this device' : 'the cloud' });
    out.push(keep);
  });
  L.forEach(l => {
    if (byR.has(l.id)) return;
    if (delR[l.id] && delR[l.id] >= (l.updatedAt || '')) { report.deletedThere.push(name(l)); return; }
    report.onlyHere.push(name(l)); out.push(l);
  });
  const doc = JSON.parse(JSON.stringify(remote || {}));
  doc.budgetTransactions = JSON.parse(JSON.stringify(out)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const del = Object.assign({}, delR);
  Object.keys(delL).forEach(id => { if (!del[id] || delL[id] > del[id]) del[id] = delL[id]; });
  Object.keys(del).forEach(id => { if (doc.budgetTransactions.some(t => t.id === id)) delete del[id]; });
  doc.deletedTx = del;
  // Places only this device knows.
  const addMissing = (key, sub) => {
    const there = new Set(((doc[key]) || []).map(x => x.id));
    ((local && local[key]) || []).forEach(x => { if (!there.has(x.id)) { (doc[key] || (doc[key] = [])).push(JSON.parse(JSON.stringify(x))); report.addedPlaces = (report.addedPlaces || 0) + 1; } });
    if (sub) ((local && local[key]) || []).forEach(x => {
      const d = (doc[key] || []).find(y => y.id === x.id); if (!d) return;
      const ids = new Set((d[sub] || []).map(y => y.id));
      (x[sub] || []).forEach(y => { if (!ids.has(y.id)) { (d[sub] || (d[sub] = [])).push(JSON.parse(JSON.stringify(y))); report.addedPlaces = (report.addedPlaces || 0) + 1; } });
    });
  };
  addMissing('accounts', 'pockets'); addMissing('brokers'); addMissing('cryptoExchangeCash');
  return { doc, report };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { balPlaces, balResolve, balAmountIn, balEffects, balCompute, balRefused, balCounts, balCorrection, balTxSig, balMerge, BAL_ADJ };
}

/* ===================== In the app ===================== */
if (typeof window !== 'undefined') {
  const env = freeze => ({
    today: todayYmd(), freeze,
    fx: (a, f, t) => convertCurrency(a, f, t),
    linkedAccountId: b => { const a = linkedAccountForBroker(b); return a ? a.id : null; },
  });
  let baseFor = null, baseValues = {}, baseSigs = new Map();
  const write = (places, values) => places.forEach((p, ref) => { if (values[ref] != null) p.obj[p.key] = values[ref]; });
  const resetInterim = () => { Object.keys(balanceInterim).forEach(k => delete balanceInterim[k]); };
  const takeSigs = () => { baseSigs = new Map((data.budgetTransactions || []).map(t => [t.id, balTxSig(t)])); };
  const anchor = (places, anchors) => anchors.forEach(a => { const p = places.get(a.ref); p.obj[p.openKey] = a.opening; p.obj[p.dateKey] = a.date; });
  /* After the data was swapped (opened, from the cloud, undo, restore): work balances out, no
     correction (nothing was typed). */
  window.balancesAfterLoad = function () {
    if (!data) return;
    if (!data.deletedTx || typeof data.deletedTx !== 'object') data.deletedTx = {};
    if (balancesFromTx()) {
      const r = balCompute(data, env(true));
      anchor(r.places, r.anchors);
      write(r.places, r.values);
      baseValues = r.values;
    } else baseValues = {};
    baseFor = data; resetInterim(); takeSigs();
  };
  /* Called by save() before it writes. Returns false when it refused the change (and put back the
     last saved version). */
  window.balancesBeforeSave = function (opts) {
    const now = new Date().toISOString(), fresh = baseFor !== data;
    // Stamp what changed and remember what went, for a merge with another device.
    if (!data.deletedTx || typeof data.deletedTx !== 'object') data.deletedTx = {};
    if (!fresh && balancesFromTx()) { // before the switch nothing changes: no stamp
      const ids = new Set();
      (data.budgetTransactions || []).forEach(t => { ids.add(t.id); const s = baseSigs.get(t.id); if (s !== balTxSig(t)) t.updatedAt = now; });
      baseSigs.forEach((s, id) => { if (!ids.has(id)) data.deletedTx[id] = now; });
    }
    const cut = new Date(Date.now() - 120 * 86400000).toISOString();
    Object.keys(data.deletedTx).forEach(id => { if (data.deletedTx[id] < cut) delete data.deletedTx[id]; });
    if (!balancesFromTx()) { baseFor = data; takeSigs(); resetInterim(); return true; }
    const E = env(true);
    const r = balCompute(data, E);
    // A copy changed without a Budget transaction is put back (written again below): only Budget moves balances.
    // Never below zero (unless it already was, and doesn't get lower).
    if (!fresh && !(opts && opts.repair)) {
      const low = Object.keys(r.values).filter(ref => r.values[ref] < -0.005 && r.values[ref] < (baseValues[ref] == null ? 0 : baseValues[ref]) - 0.005);
      if (low.length) {
        let back = null;
        try { back = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
        if (back) { data = back; window.balancesAfterLoad(); }
        const lines = low.map(ref => `• ${r.places.get(ref).name}: ${fmtMoney(r.values[ref], r.places.get(ref).ccy)}`).join('\n');
        alert(`That would take a balance below zero, so it wasn't saved:\n${lines}\n\nCheck the amount, or record the money coming in first.`);
        setTimeout(() => render(), 0);
        return false;
      }
    }
    anchor(r.places, r.anchors);
    write(r.places, r.values);
    baseValues = r.values; baseFor = data; resetInterim(); takeSigs();
    return true;
  };
  /* '' or why the change can't be made (records replace the transactions with the same id). */
  window.balanceWhyRefused = function (records, removedIds) {
    if (!balancesFromTx()) return '';
    const low = balRefused(data, env(false), records, removedIds);
    if (!low.length) return '';
    return `That would take ${low.map(l => `${l.name} to ${fmtMoney(l.value, l.ccy)}`).join(' and ')}. A balance can't go below zero: check the amount, or record the money coming in first.`;
  };
  window.balancesTxCounts = rec => balCounts(data, env(false), rec);
  /* Moves a balance's copy at once (the next save works it out from the transactions anyway). */
  window.balNudge = function (ref, d) {
    const r = balResolve(ref, data, env(false)), p = r && balPlaces(data, env(false)).get(r);
    if (!p) return;
    p.obj[p.key] = balR2((+p.obj[p.key] || 0) + d);
    balInterim(r, d);
  };
  window.balancesNow = () => balCompute(data, env(false));

  /* ---- Only Budget moves balances: other pages fill in Budget ----
     One transaction: the Budget form opens filled in. Several: the "Add to Budget" window lists
     them. Nothing moves until you save there; then(ids) finishes the other page's part. Returns
     false before the switch (the page then does as it always did). */
  const formKeys = () => Object.keys(blankTxDraft()).concat(['invoiceId', 'split', 'confirmed', 'oneOff', 'receipts', 'warrantyUntil', 'warrantyNoted', 'tripId', 'recurringId', 'business', 'vatRate']);
  const asDraft = r => {
    const keys = formKeys(), prefill = {}, extra = {};
    Object.keys(r).forEach(k => { if (k === 'id' || k === 'fromLabel' || k === 'toLabel') return; (keys.includes(k) ? prefill : extra)[k] = r[k]; });
    prefill.amount = String(r.amount);
    return { prefill, extra };
  };
  window.budgetConfirm = function (records, then, opts) {
    if (!balancesFromTx()) return false;
    records = (records || []).filter(Boolean);
    if (!records.length) { if (then) then([]); return true; }
    if (records.length === 1) {
      const d = asDraft(records[0]);
      openTxForm(null, Object.assign(d.prefill, { _extra: d.extra, _then: then || null }));
      return true;
    }
    ui.modal = { type: 'budgetConfirm', payload: { records, then, title: (opts && opts.title) || 'Add to Budget', error: '' } };
    render();
    return true;
  };
  window.budgetConfirmSave = function () {
    const p = ui.modal && ui.modal.payload; if (!p) return;
    const before = JSON.stringify(data), realAlert = window.alert, ids = [];
    let said = '', failed = false;
    window.alert = m => { if (!said) said = m; };
    try {
      quietBatch(() => {
        for (const r of p.records) {
          const d = asDraft(r), id = uid('tx');
          ui.modal = { type: 'tx', payload: Object.assign(blankTxDraft(), d.prefill, { id, _extra: d.extra, step: 1 }) };
          saveTxForm();
          if (!data.budgetTransactions.some(t => t.id === id)) { failed = true; break; }
          ids.push(id);
        }
        if (failed) { data = JSON.parse(before); window.balancesAfterLoad(); }
      });
    } finally { window.alert = realAlert; }
    if (failed) { ui.modal = { type: 'budgetConfirm', payload: Object.assign(p, { error: said || 'One of them could not be saved: open it in Budget to see why.' }) }; render(); return; }
    ui.modal = null;
    if (p.then) p.then(ids); else render();
  };
  window.__modalRenderers.budgetConfirm = function (p) {
    const line = r => {
      const where = r.type === 'transfer' ? `${(transferEndpoint(r.from) || {}).label || '?'} → ${(transferEndpoint(r.to) || {}).label || '?'}` : ((accountById(r.accountId) || {}).name || '');
      const sign = r.type === 'income' ? '+' : r.type === 'expense' ? '−' : '';
      return `<div class="lu-row"><div class="lu-txt"><b>${escHtml(r.comment || r.type)}</b><span class="dim">${escHtml(shortDay(r.date))} · ${escHtml(where)}</span></div><b class="num">${sign}${fmtMoney(+r.amount || 0, r.currency)}</b></div>`;
    };
    return `<div class="modal-head"><div class="modal-title">${escHtml(p.title)}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <p class="dim" style="font-size:12.5px;margin:0 0 10px;">Only Budget moves your balances. Check these ${p.records.length}: nothing moves until you save them. You can change each one in Budget afterwards.</p>
      <div class="lu-list">${p.records.map(line).join('')}</div>
      ${p.error ? `<div class="info-box" style="margin-top:10px;color:var(--negative);">${escHtml(p.error)}</div>` : ''}
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="budgetConfirmSave()">Save ${p.records.length} in Budget</button></div>`;
  };
  /* "Fix in Budget": what does the bank show? → a Balance correction in the Budget form. */
  window.openBalanceFix = function (ref, real) {
    ui.modal = { type: 'balanceFix', payload: { ref, real: real == null ? '' : String(real) } };
    render();
  };
  window.__modalRenderers.balanceFix = function (p) {
    const r = balancesNow(), key = balResolve(p.ref, data, env(false)), pl = r.places.get(key);
    const head = `<div class="modal-head"><div class="modal-title">Fix a balance in Budget</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>`;
    if (!pl) return `${head}<div class="modal-actions"><button class="btn primary" onclick="closeModal()">OK</button></div>`;
    return `${head}
      <p style="font-size:13px;margin:0 0 10px;"><b>${escHtml(pl.name)}</b> · Trackr: ${fmtMoney(r.values[key], pl.ccy)}</p>
      <label class="field"><span class="label-text">What your bank shows now${pl.kind === 'acc' ? ' (main balance, without pockets)' : ''}</span><input id="bf-real" inputmode="decimal" value="${escHtml(p.real)}" oninput="ui.modal.payload.real=this.value"></label>
      <p class="dim" style="font-size:12px;margin:8px 0 0;">The difference is filled in as a "Balance correction" in the Budget form: it moves the balance only when you save it there. Something missing? Better to add the real transaction in Budget instead.</p>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="balanceFixGo()">Continue in Budget</button></div>`;
  };
  window.balanceFixGo = function () {
    const p = ui.modal && ui.modal.payload; if (!p) return;
    const v = parseFloat(String(p.real).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(v)) { alert('Type the amount your bank shows.'); return; }
    const r = balancesNow(), key = balResolve(p.ref, data, env(false)), pl = r.places.get(key);
    if (!pl) { closeModal(); return; }
    const diff = balR2(v - r.values[key]);
    if (Math.abs(diff) < 0.005) { closeModal(); if (typeof fxSuccess === 'function') fxSuccess('Already right'); return; }
    budgetConfirm([balCorrection(p.ref, diff, todayYmd(), pl.ccy, pl.name, '')]);
  };

  /* ---- The switch: backup, real balances, review ---- */
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
  window.balancesDownloadBackup = async function () {
    const p = ui.modal && ui.modal.payload; if (!p) return;
    p.busy = true; render();
    let cloud = null, cloudError = '';
    if (loadSupabaseSyncConfig()) {
      try { const row = await supabaseFetchRow(); cloud = row ? { updated_at: row.updated_at, data: row.data } : null; if (!row) cloudError = 'The cloud row is empty.'; }
      catch (e) { cloudError = 'Couldn\'t read the cloud: ' + ((e && e.message) || 'unknown error'); }
    } else cloudError = 'Sync is not connected on this device.';
    const name = `trackr-backup-before-balances-${stamp()}.json`;
    const doc = { kind: 'trackr-backup-before-balances', savedAt: new Date().toISOString(), note: 'Taken before Trackr switched to balances from transactions. "device" is this device, "cloud" is the trackr_data row.', device: JSON.parse(JSON.stringify(data)), cloud, cloudError };
    const json = JSON.stringify(doc, null, 1);
    try { if (typeof safetyPut === 'function') await safetyPut({ key: 'before:' + Date.now(), kind: 'before-restore', day: todayYmd(), savedAt: doc.savedAt, summary: safetySummary(data), json: JSON.stringify(data), label: 'Before balances from transactions' }); } catch (e) {}
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Object.assign(p, { busy: false, backup: { name, at: doc.savedAt, cloud: !!cloud, cloudError } });
    render();
  };
  window.balancesSwitchOn = function () {
    const p = ui.modal && ui.modal.payload; if (!p || !p.backup) return;
    const before = {};
    balPlaces(data, env(false)).forEach((pl, ref) => { before[ref] = pl.cache; });
    data.settings.balanceModel = 'tx';
    data.balanceRepair = { backupAt: p.backup.at, backupFile: p.backup.name, switchedAt: new Date().toISOString(), before, checks: [] };
    baseFor = null; // fresh: every place starts today at what it shows
    save();
    p.step = 'real'; p.real = {};
    render();
  };
  const placeRows = () => { const r = balancesNow(); return [...r.places.values()].map(p => ({ ref: p.ref, name: p.name, ccy: p.ccy, value: r.values[p.ref], kind: p.kind })); };
  window.balancesSaveReal = function () {
    const p = ui.modal && ui.modal.payload; if (!p) return;
    const r = balancesNow(), checks = [];
    Object.keys(p.real || {}).forEach(ref => {
      const raw = String(p.real[ref]).trim().replace(/\s/g, '').replace(',', '.');
      if (raw === '') return;
      const v = parseFloat(raw), pl = r.places.get(ref);
      if (!Number.isFinite(v) || !pl) return;
      const diff = balR2(v - r.values[ref]);
      checks.push({ ref, name: pl.name, ccy: pl.ccy, trackr: r.values[ref], bank: v, diff });
      if (diff) pl.obj[pl.openKey] = balR2((+pl.obj[pl.openKey] || 0) + diff);
    });
    data.balanceRepair = Object.assign(data.balanceRepair || {}, { checkedAt: new Date().toISOString() });
    data.balanceRepair.checks = (data.balanceRepair.checks || []).concat(checks.map(c => Object.assign({ at: data.balanceRepair.checkedAt }, c)));
    baseFor = null; // the starts moved on purpose: no correction, no refusal
    save({ repair: true });
    p.step = 'review'; p.checks = checks;
    render();
  };
  /* What may explain a balance that didn't match, newest first: what Trackr added by itself, interest
     counted twice, other currencies, and everything since the balance was last checked. */
  window.balanceSuspects = function (ref) {
    const acc = ref.startsWith('acc:') || ref.startsWith('pk:') ? accountById(ref.split(':')[1]) : null;
    const since = acc && acc.balanceCheckedAt ? dateToYmd(new Date(acc.balanceCheckedAt)) : '';
    const places = balPlaces(data, env(false)), ccy = (places.get(ref) || {}).ccy || 'EUR';
    return balEffects(data, env(false), data.budgetTransactions || [], places).filter(e => e.ref === ref).map(e => {
      const t = e.tx, why = [];
      if (t.auto) why.push(t.confirmed ? 'added by Trackr (recurring), confirmed' : 'added by Trackr by itself (recurring), never confirmed');
      if (t.pocketInterest && t.accountId && !t.pocketId) why.push('interest that was already added to the pocket');
      if ((t.currency || 'EUR') !== ccy) why.push(`in ${t.currency}`);
      if (since && t.date <= since) why.push('before your last balance check: counted twice if you added it after');
      return { t, delta: e.delta, why, recent: !since || t.date > since };
    }).filter(x => x.why.length || x.recent).sort((a, b) => (a.t.date < b.t.date ? 1 : -1)).slice(0, 40);
  };
  window.openBalanceSwitch = function () {
    ui.modal = { type: 'balanceSwitch', payload: { step: balancesFromTx() ? 'real' : 'backup', real: {} } };
    render();
  };
  window.__modalRenderers.balanceSwitch = function (p) {
    const head = t => `<div class="modal-head"><div class="modal-title">${t}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>`;
    if (p.step === 'backup') return `${head('Balances from your transactions')}
      <p style="font-size:13.5px;line-height:1.55;margin:0 0 10px;">Today a balance is a number Trackr adds to and takes from, so it can drift: recurring items it adds by itself, a statement added after you typed the balance, interest counted twice. After this switch, each balance is <b>its starting point + its transactions</b>, and only a transaction moves it. Typing a new balance records a visible "Balance correction". A change that would take a balance below zero is refused.</p>
      <div class="card-nested" style="margin:12px 0;">
        <div style="font-weight:700;margin-bottom:6px;">1 · Back up first</div>
        <p class="dim" style="font-size:12.5px;margin:0 0 10px;">One file with this device's data and the cloud's copy (your trackr_data row), named with today's date and time. A copy also goes to Settings → Backup & Restore → Restore points.</p>
        ${p.backup ? `<div style="font-size:12.5px;">✓ Saved <b>${escHtml(p.backup.name)}</b>${p.backup.cloud ? ' (this device + the cloud)' : ` (this device only: ${escHtml(p.backup.cloudError)})`}</div>`
          : `<button class="btn primary" ${p.busy ? 'disabled' : ''} onclick="balancesDownloadBackup()">${p.busy ? 'Saving…' : 'Download the backup'}</button>`}
      </div>
      <div class="card-nested" style="margin:12px 0;opacity:${p.backup ? 1 : 0.5};">
        <div style="font-weight:700;margin-bottom:6px;">2 · Switch</div>
        <p class="dim" style="font-size:12.5px;margin:0 0 10px;">Nothing you see changes: every balance starts today at what it shows now. Next you type what your bank apps show, and Trackr lists what didn't match.</p>
        <button class="btn primary" ${p.backup ? '' : 'disabled'} onclick="balancesSwitchOn()">Switch and check my balances</button>
      </div>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Later</button></div>`;
    if (p.step === 'real') {
      const rows = placeRows();
      return `${head('What do your bank apps show today?')}
        <p class="dim" style="font-size:12.5px;margin:0 0 10px;">Type each number as the app shows it now (a pocket on its own line, the main balance without pockets). Leave a line empty to keep Trackr's number. This sets the starting point: transactions dated before today stay in your history and no longer move the balance.</p>
        <div class="lu-list">${rows.map(r => {
          const v = p.real[r.ref], n = v == null || String(v).trim() === '' ? null : parseFloat(String(v).replace(',', '.')), d = n == null || !Number.isFinite(n) ? null : balR2(n - r.value);
          return `<div class="lu-row"><div class="lu-txt"><b>${escHtml(r.name)}</b><span class="dim">Trackr: ${fmtMoney(r.value, r.ccy)}${d ? ` · difference ${d > 0 ? '+' : '−'}${fmtMoney(Math.abs(d), r.ccy)}` : ''}</span></div>
            <input class="mini-select" style="width:120px;" inputmode="decimal" aria-label="Real balance of ${escHtml(r.name)}" placeholder="${escHtml(String(r.value))}" value="${escHtml(v == null ? '' : String(v))}" onchange="ui.modal.payload.real['${r.ref}']=this.value;render()"></div>`;
        }).join('')}</div>
        <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Later</button><button class="btn primary" onclick="balancesSaveReal()">Save and review</button></div>`;
    }
    // Review
    const r = balancesNow(), before = (data.balanceRepair && data.balanceRepair.before) || {};
    const checks = p.checks || [];
    const look = new Set(checks.filter(c => c.diff).map(c => c.ref));
    Object.keys(r.values).forEach(ref => { if (r.values[ref] < 0 || (before[ref] != null && before[ref] < 0)) look.add(ref); });
    const list = [...look].map(ref => {
      const pl = r.places.get(ref); if (!pl) return '';
      const c = checks.find(x => x.ref === ref), sus = balanceSuspects(ref);
      return `<div class="card-nested" style="margin:10px 0;">
        <div style="font-weight:700;">${escHtml(pl.name)}</div>
        <div class="dim" style="font-size:12.5px;margin:2px 0 8px;">${before[ref] != null ? `Trackr had ${fmtMoney(before[ref], pl.ccy)}` : ''}${c ? ` · your bank: ${fmtMoney(c.bank, pl.ccy)} (difference ${c.diff > 0 ? '+' : '−'}${fmtMoney(Math.abs(c.diff), pl.ccy)})` : ''} · now ${fmtMoney(r.values[ref], pl.ccy)}${r.values[ref] < 0 ? ' · <b>below zero</b>' : ''}</div>
        ${sus.length ? `<div class="lu-list">${sus.map(s => `<div class="lu-row" onclick="closeModal();openTxForm('${escHtml(s.t.id)}')" style="cursor:pointer;"><div class="lu-txt"><b>${escHtml(s.t.comment || s.t.type)}</b><span class="dim">${escHtml(shortDay(s.t.date))}${s.why.length ? ' · ' + escHtml(s.why.join(' · ')) : ''}</span></div><b class="num ${s.delta >= 0 ? 'positive' : 'negative'}">${s.delta >= 0 ? '+' : '−'}${fmtMoney(Math.abs(s.delta), pl.ccy)}</b></div>`).join('')}</div>`
          : '<div class="dim" style="font-size:12.5px;">No transaction stands out.</div>'}
      </div>`;
    }).join('');
    return `${head('What to review')}
      <p style="font-size:13px;line-height:1.5;margin:0 0 8px;">Balances now follow your transactions. ${look.size ? 'These didn\'t match your bank or were below zero. The transactions listed may explain it: open one to fix or delete it. Nothing was changed for you.' : 'Everything matched: nothing to review.'}</p>
      <p class="dim" style="font-size:12px;margin:0 0 8px;">A transaction dated before today is history now: fixing it changes your Budget, not the balance (the balance is already what your bank says).</p>
      ${list}
      <div class="modal-actions"><button class="btn primary" onclick="data.balanceRepair.reviewedAt=new Date().toISOString();save();closeModal()">Done</button></div>`;
  };
  window.__attention.push(() => {
    if (!data.accounts || !data.accounts.length) return [];
    if (!balancesFromTx()) return [{ key: 'balances:switch', icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('bank', 16)}</span>`, name: 'Make balances follow your transactions',
      detail: 'Balances can drift today. Back up, switch, then check them against your bank apps.', actions: [{ label: 'Start', onclick: 'closeModal();openBalanceSwitch()', primary: true }] }];
    if (data.balanceRepair && data.balanceRepair.switchedAt && !data.balanceRepair.reviewedAt) return [{ key: 'balances:review', icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('bank', 16)}</span>`, name: 'Check your balances against the bank',
      detail: 'Type what your bank apps show, then review what didn\'t match.', actions: [{ label: 'Check', onclick: 'closeModal();openBalanceSwitch()', primary: true }] }];
    return [];
  });
  if (window.__palette) window.__palette.push(add => add('Accounts', 'Balance check', 'Compare with your bank apps', () => openBalanceSwitch(), 'bank'));
  /* ---- Two devices changed: keep both ---- */
  const mergeable = () => !!(syncState.conflict && balancesFromTx() && syncState.conflict.serverData && syncState.conflict.serverData.settings && syncState.conflict.serverData.settings.balanceModel === 'tx');
  window.syncMergeButtonHtml = (cls, before) => mergeable() ? `<button class="btn ${cls || ''}" onclick="${before || ''}resolveSyncConflictMerge()">Keep both (newest version of each transaction)</button>` : '';
  window.resolveSyncConflictMerge = async function () {
    const c = syncState.conflict; if (!c || !mergeable()) return;
    const m = balMerge(data, c.serverData);
    await syncKeepCopy(c.serverData, 'The cloud, before keeping both');
    await syncKeepCopy(data, 'This device, before keeping both');
    data = m.doc;
    try { migrateCryptoModel(); } catch (e) {}
    window.balancesAfterLoad();
    syncState.conflict = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
    syncUpdateConfig({ lastSeenUpdatedAt: c.serverUpdatedAt, pending: true });
    syncEditSeq++;
    ui.modal = { type: 'syncMerged', payload: m.report };
    applyTheme(); render();
    try { await syncPush(c.serverUpdatedAt); } catch (e) { console.error('Sending the merged copy failed: it is retried', e); }
    render();
  };
  window.__modalRenderers.syncMerged = function (r) {
    const li = (n, what, names) => n ? `<li>${n} ${what}${names && names.length ? `: ${escHtml(names.slice(0, 6).join(', '))}${names.length > 6 ? '…' : ''}` : ''}</li>` : '';
    return `<div class="modal-head"><div class="modal-title">Both kept</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <ul style="font-size:13px;line-height:1.6;margin:0 0 10px;padding-left:18px;">
        ${li(r.onlyHere.length, 'only on this device, kept', r.onlyHere)}
        ${li(r.onlyThere.length, 'only in the cloud, kept', r.onlyThere)}
        ${li(r.both.length, 'changed on both: the newer version kept', r.both.map(b => `${b.name} (${b.kept})`))}
        ${li(r.deletedHere.length, 'deleted on this device, stay deleted', r.deletedHere)}
        ${li(r.deletedThere.length, 'deleted on the other device, stay deleted', r.deletedThere)}
        ${r.addedPlaces ? `<li>${r.addedPlaces} account${r.addedPlaces === 1 ? '' : 's'} or pocket${r.addedPlaces === 1 ? '' : 's'} only on this device, kept</li>` : ''}
        <li>${r.same} the same on both</li>
      </ul>
      <p class="dim" style="font-size:12.5px;margin:0 0 10px;">Everything else (settings, goals, starting points…) is the cloud's. Balances are worked out again from the transactions. Both copies from before are in Settings → Backup & Restore → Restore points.</p>
      <div class="modal-actions"><button class="btn primary" onclick="closeModal()">OK</button></div>`;
  };
  // app.js opened the data before this file loaded.
  window.balancesAfterLoad();
}
