/* ===================== Closing a pocket, and Completed goals =====================
 * Loaded after goals.js and photos.js. A pocket that reaches its goal amount says so ("Goal
 * reached") with a Close pocket button: you decide, it never closes by itself.
 *
 * Closing asks where what's left goes, so the money always lands somewhere:
 *   - back to the account's main balance (a transfer inside the account),
 *   - to another pocket (a transfer),
 *   - spent on the goal: an expense paid from the pocket (or, if you already recorded what you
 *     bought, the pocket is just emptied, which you choose knowingly).
 * Then it keeps the story: p.closed = { at, finalAmount, goalAmount, startedAt, days, note, photo,
 * how, txId }. p.finishedAt = the day, as for any finished pocket, so it leaves the bank page and
 * the pickers. Budget → Completed goals lists them (count, total saved); Reopen brings one back
 * (its story moves to p.closedBefore, the money stays where it went).
 * pocketCloseFacts() and completedGoalsSummary() are pure (Node-tested). */

/* When the pocket started (its own date, else its first move) and how long it took. */
function pocketCloseFacts(p, moveDates, today) {
  const dates = (moveDates || []).filter(Boolean).sort();
  const startedAt = (p && p.createdAt ? String(p.createdAt).slice(0, 10) : '') || dates[0] || null;
  const days = startedAt ? Math.max(0, Math.round((new Date(today + 'T12:00:00') - new Date(startedAt + 'T12:00:00')) / 864e5)) : null;
  return { startedAt, days, finalAmount: Math.round((+(p && p.amountSaved) || 0) * 100) / 100, goalAmount: +(p && p.targetAmount) || null };
}
/* "3 months", "1 year 2 months", "12 days". */
function pocketDuration(days) {
  if (days == null) return '';
  if (days < 45) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30.44), y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} year${y > 1 ? 's' : ''}` : '', m ? `${m} month${m > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ');
}
/* Completed goals: how many, and what they saved (each in euros at the time it closed). */
function completedGoalsSummary(list) {
  const done = (list || []).filter(x => x && x.closed);
  return { count: done.length, totalSaved: Math.round(done.reduce((s, x) => s + (+x.closed.finalAmountEUR || +x.closed.finalAmount || 0), 0) * 100) / 100 };
}
const pocketReached = p => !!(p && !p.finishedAt && +p.targetAmount > 0 && +p.amountSaved + 0.005 >= +p.targetAmount);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pocketCloseFacts, pocketDuration, completedGoalsSummary, pocketReached };
} else {
  /* ---- On the bank page: the reached state ---- */
  window.pocketReachedHtml = function (acc, p) {
    if (!pocketReached(p)) return '';
    return `<div class="pk-reached"><span>Goal reached 🎉</span><button class="btn small primary" onclick="openPocketClose('${escHtml(acc.id)}','${escHtml(p.id)}')">Close pocket</button></div>`;
  };

  /* ---- The closing window ---- */
  window.openPocketClose = function (accId, pkId) {
    const a = accountById(accId), p = a && (a.pockets || []).find(x => x.id === pkId); if (!p) return;
    ui.modal = { type: 'pocketClose', payload: { accId, pkId, how: 'main', to: '', record: true, name: p.name, categoryId: '', date: todayYmd(), note: '', photo: '' } };
    render();
  };
  const otherPockets = (accId, pkId) => data.accounts.flatMap(a => (a.pockets || []).filter(k => !k.finishedAt && !(a.id === accId && k.id === pkId)).map(k => ({ ref: `pk:${a.id}:${k.id}`, label: a.id === accId ? k.name : `${a.name} › ${k.name}` })));
  window.__modalRenderers.pocketClose = function (m) {
    const a = accountById(m.accId), p = a && (a.pockets || []).find(x => x.id === m.pkId);
    if (!p) return '';
    const left = +p.amountSaved || 0, ccy = a.currency;
    const facts = pocketCloseFacts(p, pocketMoves(`pk:${a.id}:${p.id}`).map(x => x.date), todayYmd());
    const radio = (v, label, sub) => `<label class="pc-opt ${m.how === v ? 'on' : ''}"><input type="radio" name="pc-how" value="${v}" ${m.how === v ? 'checked' : ''} onchange="pocketCloseSet('how','${v}')"><span><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span></label>`;
    const others = otherPockets(a.id, p.id);
    const cats = (data.categories && data.categories.expense) || [];
    return `
      <div class="modal-head"><div class="modal-title">Close ${escHtml(p.name)}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="pc-sum">
        <div><span class="dim">Saved</span><b class="num">${fmtMoney(left, ccy)}</b></div>
        ${facts.goalAmount ? `<div><span class="dim">Goal</span><b class="num">${fmtMoney(facts.goalAmount, ccy)}</b></div>` : ''}
        ${facts.days != null ? `<div><span class="dim">Took</span><b>${escHtml(pocketDuration(facts.days))}</b></div>` : ''}
      </div>
      ${left > 0.004 ? `<div class="tx-label">Where does the ${fmtMoney(left, ccy)} go?</div>
        <div class="pc-opts">
          ${radio('main', `Back to ${escHtml(mainBalanceName(a))}`, escHtml(a.name))}
          ${others.length ? radio('pocket', 'To another pocket', '') : ''}
          ${radio('spent', 'Spent on the goal', 'What you bought with it')}
        </div>
        ${m.how === 'pocket' ? `<label class="field"><span class="label-text">Pocket</span><select id="pc-to" onchange="pocketCloseSet('to',this.value)"><option value="">Pick a pocket</option>${others.map(o => `<option value="${escHtml(o.ref)}" ${o.ref === m.to ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}</select></label>` : ''}
        ${m.how === 'spent' ? `<label class="pc-check"><input type="checkbox" ${m.record ? 'checked' : ''} onchange="pocketCloseSet('record',this.checked)"> Record it as an expense paid from the pocket</label>
          ${m.record ? `<div class="form-grid"><label class="field"><span class="label-text">What</span><input id="pc-name" value="${escHtml(m.name)}" oninput="ui.modal.payload.name=this.value"></label>
            <label class="field"><span class="label-text">Category</span><select id="pc-cat" onchange="ui.modal.payload.categoryId=this.value"><option value="">No category</option>${cats.map(c => `<option value="${escHtml(c.id)}" ${c.id === m.categoryId ? 'selected' : ''}>${escHtml((c.icon ? c.icon + ' ' : '') + c.name)}</option>`).join('')}</select></label>
            <label class="field"><span class="label-text">Date</span><input id="pc-date" type="date" value="${escHtml(m.date)}" max="${todayYmd()}" onchange="ui.modal.payload.date=this.value"></label></div>`
            : '<div class="ib-warn" style="margin:6px 0 0;">The pocket is emptied without a record: only if you already recorded what you bought.</div>'}` : ''}`
        : '<div class="dim" style="margin-bottom:12px;">It\'s empty: nothing to move.</div>'}
      <label class="field" style="margin-top:12px;"><span class="label-text">A note <span style="opacity:.6;">(optional)</span></span><textarea id="pc-note" rows="2" placeholder="What it was for, how it went" oninput="ui.modal.payload.note=this.value">${escHtml(m.note)}</textarea></label>
      <div class="pc-photo">${m.photo ? `<span class="pc-thumb">${photoUrl(m.photo) ? `<img src="${photoUrl(m.photo)}" alt="">` : ''}</span>` : ''}<label class="btn small">${ic('photo', 14)} ${m.photo ? 'Change the photo' : 'Add a photo'}<input type="file" accept="image/*" hidden onchange="pocketClosePhoto(this.files);this.value=''"></label></div>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="closePocket()">Close the pocket</button></div>`;
  };
  window.pocketCloseSet = function (k, v) { ui.modal.payload[k] = v; render(); };
  window.pocketClosePhoto = async function (files) {
    const got = await addPhotoFiles(files);
    if (got[0] && ui.modal) { ui.modal.payload.photo = got[0].id; render(); }
  };
  window.closePocket = function () {
    const m = ui.modal.payload, a = accountById(m.accId), p = a && (a.pockets || []).find(x => x.id === m.pkId);
    if (!p) return;
    const ref = `pk:${a.id}:${p.id}`, left = Math.round((+p.amountSaved || 0) * 100) / 100, day = todayYmd();
    if (left > 0.004 && m.how === 'pocket' && !transferEndpoint(m.to)) { alert('Pick the pocket it goes to.'); return; }
    const before = JSON.stringify(data);
    const facts = pocketCloseFacts(p, pocketMoves(ref).map(x => x.date), day);
    let txId = null;
    if (left > 0.004) {
      const base = { id: uid('tx'), date: day, categoryId: null, subCategoryId: null, nature: 'Variable', paymentMethodId: null, currency: a.currency, amount: left, location: '', description: `Closing ${p.name}`, logo: '', impact: '' };
      let rec = null;
      if (m.how === 'main') rec = Object.assign(base, { type: 'transfer', accountId: null, comment: `${p.name} closed`, from: ref, to: 'acc:' + a.id, fromLabel: p.name, toLabel: a.name });
      else if (m.how === 'pocket') rec = Object.assign(base, { type: 'transfer', accountId: null, comment: `${p.name} closed`, from: ref, to: m.to, fromLabel: p.name, toLabel: transferEndpoint(m.to).label });
      else if (m.record) rec = Object.assign(base, { type: 'expense', accountId: a.id, pocketId: p.id, date: m.date || day, categoryId: m.categoryId || null, comment: String(m.name || p.name).trim(), reviewed: true });
      const budgetOnly = typeof balancesFromTx === 'function' && balancesFromTx();
      // Only Budget moves balances: "already spent and recorded" empties it by a Balance correction.
      if (!rec && budgetOnly) rec = Object.assign(base, { type: 'transfer', accountId: null, comment: `${p.name} closed`, description: 'Already spent and recorded', from: ref, to: 'adj:correction', fromLabel: p.name, toLabel: 'Balance correction', correction: true });
      // …and the closing transaction waits in the Budget form: the pocket closes once it's saved.
      if (rec && budgetOnly && typeof budgetConfirm === 'function') { budgetConfirm([rec], ids => finishClose(ids[0] || null)); return; }
      if (rec) { data.budgetTransactions.push(rec); applyTxToAccountBalance(rec, 1); txId = rec.id; }
      else p.amountSaved = 0; // spent, already recorded: emptied, as you chose
    }
    finishClose(txId);
    function finishClose(txId) {
    p.amountSaved = Math.round((+p.amountSaved || 0) * 100) / 100;
    p.finishedAt = day;
    p.closed = { at: day, finalAmount: facts.finalAmount, finalAmountEUR: Math.round(toEUR(facts.finalAmount, a.currency) * 100) / 100, currency: a.currency, goalAmount: facts.goalAmount, startedAt: facts.startedAt, days: facts.days, note: String(m.note || '').trim(), photo: m.photo || '', how: left > 0.004 ? m.how : 'empty', txId };
    // Its goal is reached with it.
    const g = typeof goalForPocket === 'function' && goalForPocket(a.id, p.id);
    if (g && !g.reachedAt) Object.assign(g, { reachedAt: day, reachedAmount: facts.finalAmount });
    save(); closeModal();
    if (typeof offerUndo === 'function') offerUndo(`${p.name} closed`, before);
    if (typeof fxSuccess === 'function') fxSuccess('Pocket closed');
    }
  };
  /* Back to an open pocket. The money stays where it went; the story is kept. */
  window.reopenClosedPocket = function (accId, pkId) {
    const a = accountById(accId), p = a && (a.pockets || []).find(x => x.id === pkId); if (!p) return;
    const before = JSON.stringify(data);
    if (p.closed) { p.closedBefore = (p.closedBefore || []).concat(p.closed); delete p.closed; }
    delete p.finishedAt;
    const g = typeof goalForPocket === 'function' && goalForPocket(accId, pkId);
    if (g && g.reachedAt) { delete g.reachedAt; delete g.reachedAmount; }
    save(); render();
    if (typeof offerUndo === 'function') offerUndo(`${p.name} reopened`, before);
  };

  /* ---- Budget → Completed goals ---- */
  const closedPockets = () => data.accounts.flatMap(a => (a.pockets || []).filter(p => p.closed).map(p => ({ a, p, closed: p.closed })))
    .sort((x, y) => (x.closed.at < y.closed.at ? 1 : -1));
  window.completedGoalsHtml = function () {
    const list = closedPockets();
    if (!list.length) return '';
    const s = completedGoalsSummary(list), open = !!ui.completedOpen;
    const tile = ({ a, p, closed: c }) => {
      const url = c.photo ? photoUrl(c.photo) : null;
      return `<div class="cg-tile">
        <div class="cg-top">${url ? `<img src="${url}" alt="">` : `<span class="cg-icon">${escHtml(p.icon || '🎯')}</span>`}</div>
        <div class="cg-body">
          <b>${escHtml(p.name)}</b>
          <div class="num cg-amt">${fmtMoney(c.finalAmount, c.currency || a.currency)}${c.goalAmount ? `<span class="dim"> / ${fmtMoney(c.goalAmount, c.currency || a.currency)}</span>` : ''}</div>
          <div class="dim">${escHtml(shortDay(c.at))}${c.days != null ? ` · ${escHtml(pocketDuration(c.days))}` : ''} · ${escHtml(a.name)}</div>
          ${c.note ? `<div class="cg-note">${escHtml(c.note)}</div>` : ''}
          <button class="link-btn" onclick="reopenClosedPocket('${escHtml(a.id)}','${escHtml(p.id)}')">Reopen</button>
        </div>
      </div>`;
    };
    return `<section class="cg">
      <button class="cg-head" aria-expanded="${open}" onclick="ui.completedOpen=${!open};render()">
        <span><b>Completed goals</b> <span class="dim">· ${s.count} · ${fmtMoney(s.totalSaved)} saved</span></span>${ic(open ? 'chevronDown' : 'chevronRight', 16)}
      </button>
      ${open ? `<div class="cg-grid">${list.map(tile).join('')}</div>` : ''}
    </section>`;
  };
}
