/* ===================== Wealth → Pockets =====================
 * Loaded after goals.js and pockets-close.js. Every pocket of every account in one place, and
 * every move in and out of them: transfers to / from a pocket, and incomes or expenses paid
 * through a pocket (t.pocketId). Tap a move to change it in the usual form (balances follow:
 * saveTxForm reverses the old move and applies the new one), or delete it (Undo). "Put money in"
 * and "Take out" open a transfer between the pocket and its account's main balance.
 * "Not from a move" is what the pocket holds that no recorded move explains: typed in by hand on
 * the account, or there before you recorded moves. Asked for by the user on 3 Nov 2026.
 * pocketRows() and pocketSums() are pure (Node-tested). */

/* The moves that touch any of `refs` (pk:acc:pocket), newest first. sign: +1 into them, −1 out,
   0 for a move between two of them (in "All pockets"). eur: the signed amount in euros. */
function pocketRows(txs, refs, eur) {
  const set = new Set(refs || []), conv = eur || (x => +x || 0);
  return (txs || []).map(t => {
    let sign = 0, touches = false;
    if (t.type === 'transfer') {
      const i = set.has(t.to), o = set.has(t.from);
      touches = i || o; sign = (i ? 1 : 0) - (o ? 1 : 0);
    } else if (t.pocketId && set.has(`pk:${t.accountId}:${t.pocketId}`)) {
      touches = true; sign = t.type === 'income' ? 1 : -1;
    }
    return touches ? { t, sign, eur: Math.round(sign * conv(+t.amount || 0, t.currency) * 100) / 100 } : null;
  }).filter(Boolean).sort((a, b) => (a.t.date < b.t.date ? 1 : a.t.date > b.t.date ? -1 : 0));
}
/* What went in and out, from `since` (yyyy-mm-dd, optional) on. */
function pocketSums(rows, since) {
  const r = (rows || []).filter(x => !since || x.t.date >= since);
  const round = v => Math.round(v * 100) / 100;
  return { in: round(r.filter(x => x.eur > 0).reduce((s, x) => s + x.eur, 0)), out: round(-r.filter(x => x.eur < 0).reduce((s, x) => s + x.eur, 0)), n: r.length };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pocketRows, pocketSums };
} else {
  const allPockets = () => (data.accounts || []).flatMap(a => (a.pockets || []).map(p => ({ a, p, ref: `pk:${a.id}:${p.id}` })));
  const q = s => escHtml(String(s)).replace(/'/g, '&#39;');
  window.goPockets = function (ref) { ui.pocketsSel = ref || ''; goPage('pockets'); };
  window.pocketMoveIn = function (ref) { const pk = pocketByRef(ref); if (pk) openTxForm(null, { type: 'transfer', from: 'acc:' + pk.a.id, to: ref, currency: pk.a.currency, comment: '' }); };
  window.pocketMoveOut = function (ref) { const pk = pocketByRef(ref); if (pk) openTxForm(null, { type: 'transfer', from: ref, to: 'acc:' + pk.a.id, currency: pk.a.currency, comment: '' }); };

  const label = ref => (transferEndpoint(ref) || {}).label;
  /* Inside one account the account's name is said once: "Main → Trip fund", not "Bank → Bank › Trip fund". */
  const accOf = ref => (/^(?:acc|pk):([^:]+)/.exec(ref || '') || [])[1];
  function sideName(ref, other, saved) {
    const same = accOf(ref) && accOf(ref) === accOf(other), a = same && accountById(accOf(ref));
    if (a && /^acc:/.test(ref)) return mainBalanceName(a);
    const pk = same && pocketByRef(ref);
    return pk ? pk.p.name : label(ref) || saved || '—';
  }
  function moveRowHtml(x) {
    const t = x.t, transfer = t.type === 'transfer';
    const route = transfer ? `${sideName(t.from, t.to, t.fromLabel)} → ${sideName(t.to, t.from, t.toLabel)}`
      : (t.type === 'income' ? 'Received into the pocket' : 'Paid from the pocket');
    const name = t.comment || (transfer ? 'Transfer' : t.type === 'income' ? 'Income' : 'Expense');
    const tone = x.sign > 0 ? 'positive' : x.sign < 0 ? 'negative' : '';
    return `<div class="pkp-move" onclick="openTxForm('${q(t.id)}')" title="Change this move">
      <span class="pkp-dir ${tone}" aria-hidden="true">${x.sign > 0 ? '+' : x.sign < 0 ? '−' : '↔'}</span>
      <div class="pkp-txt"><b>${escHtml(name)}</b><span class="dim">${escHtml(shortDay(t.date))} · ${escHtml(route)}</span></div>
      <b class="num pkp-amt ${tone}">${x.sign > 0 ? '+' : x.sign < 0 ? '−' : ''}${fmtMoney(Math.abs(+t.amount || 0), t.currency)}</b>
      <button class="icon-btn-round pkp-del" aria-label="Delete this move" title="Delete" onclick="event.stopPropagation();deleteBudgetTx('${q(t.id)}')">${ic('trash', 15)}</button>
    </div>`;
  }
  function movesHtml(rows) {
    if (!rows.length) return '<div class="dim pkp-empty">No moves yet. Put money in or take some out: each move shows here, and you can change it.</div>';
    const months = [];
    rows.forEach(x => { const k = x.t.date.slice(0, 7); if (!months.length || months[months.length - 1].k !== k) months.push({ k, rows: [] }); months[months.length - 1].rows.push(x); });
    return months.map(m => {
      const s = pocketSums(m.rows);
      return `<div class="pkp-month"><span>${escHtml(monthLabel(new Date(m.k + '-15T12:00:00')))}</span><span class="dim">${s.in ? `+${fmtMoney(s.in)}` : ''}${s.in && s.out ? ' · ' : ''}${s.out ? `−${fmtMoney(s.out)}` : ''}</span></div>
        ${m.rows.map(moveRowHtml).join('')}`;
    }).join('');
  }
  function cardHtml(x, on) {
    const { a, p, ref } = x, pct = +p.targetAmount > 0 ? Math.min(100, (+p.amountSaved || 0) / p.targetAmount * 100) : null;
    return `<button class="pkp-card ${on ? 'on' : ''}" aria-pressed="${on}" onclick="ui.pocketsSel=${on ? "''" : `'${q(ref)}'`};render()">
      <span class="pkp-icon">${escHtml(p.icon || '🎯')}</span>
      <span class="pkp-name">${escHtml(p.name)}</span>
      <span class="dim pkp-acc">${escHtml(a.name)}${p.finishedAt ? ' · Finished' : ''}</span>
      <span class="num pkp-val">${fmtMoney(+p.amountSaved || 0, a.currency)}${pct !== null ? `<span class="dim"> / ${fmtMoney(+p.targetAmount, a.currency)}</span>` : ''}</span>
      ${pct !== null ? `<span class="pkp-bar"><i style="width:${pct}%;background:${escHtml(p.color || 'var(--fx-ink)')};"></i></span>` : ''}
    </button>`;
  }

  window.__pageRenderers.pockets = function () {
    const all = allPockets(), done = all.filter(x => x.p.finishedAt).length;
    const shown = all.filter(x => ui.pocketsShowDone || !x.p.finishedAt || x.ref === ui.pocketsSel);
    const pk = ui.pocketsSel ? pocketByRef(ui.pocketsSel) : null;
    if (!pk) ui.pocketsSel = '';
    const rows = pocketRows(data.budgetTransactions, pk ? [pk.ref] : all.map(x => x.ref), toEUR);
    const month = pocketSums(rows, todayYmd().slice(0, 7) + '-01');
    const total = (pk ? [pk] : all).reduce((s, x) => s + toEUR(+x.p.amountSaved || 0, x.a.currency), 0);
    const untracked = pk ? Math.round((toEUR(+pk.p.amountSaved || 0, pk.a.currency) - rows.reduce((s, x) => s + x.eur, 0)) * 100) / 100 : 0;
    const accId = typeof defaultMoneyAccountId === 'function' ? defaultMoneyAccountId() : '';
    const head = `<div class="page-head"><div><h1 class="page-title">Pockets</h1><div class="page-subtitle">Money set aside in your accounts, and every move in and out</div></div>
      <div class="row-flex" style="gap:8px;">
        ${all.length ? `<button class="btn" onclick="openTxForm(null,{type:'transfer',comment:''})">${ic('swap', 15)} Move money</button>` : ''}
        ${accId ? `<button class="btn primary" onclick="openPocketForm('${q(accId)}')">${ic('plus', 15)} New pocket</button>` : ''}
      </div></div>`;
    if (!all.length) {
      return `<div class="page surface-light pkp-page">${head}<div class="card"><div style="font-weight:700;margin-bottom:6px;">No pockets yet</div>
        <div class="dim">A pocket is money set aside inside a bank account, for a goal or a bill. ${accId ? 'Make one here, or from an account in Cash.' : 'Add a bank account in Cash first.'}</div></div></div>`;
    }
    return `<div class="page surface-light pkp-page">${head}
      <div class="pkp-sum card">
        <div><span class="dim">${pk ? escHtml(pk.p.name) : `In ${all.length - done} pocket${all.length - done === 1 ? '' : 's'}`}</span><b class="num">${fmtMoney(total)}</b></div>
        <div><span class="dim">Put in this month</span><b class="num ${month.in ? 'positive' : ''}">${month.in ? '+' : ''}${fmtMoney(month.in)}</b></div>
        <div><span class="dim">Taken out this month</span><b class="num ${month.out ? 'negative' : ''}">${month.out ? '−' : ''}${fmtMoney(month.out)}</b></div>
      </div>
      <div class="pkp-grid">${shown.map(x => cardHtml(x, x.ref === ui.pocketsSel)).join('')}</div>
      ${done ? `<button class="link-btn pkp-done" onclick="ui.pocketsShowDone=${!ui.pocketsShowDone};render()">${ui.pocketsShowDone ? 'Hide' : 'Show'} finished pockets (${done})</button>` : ''}
      <div class="card pkp-moves-card">
        <div class="row-flex pkp-moves-head">
          <div><div class="eyebrow">Moves</div><div class="pkp-title">${pk ? `${escHtml(pk.p.icon || '🎯')} ${escHtml(pk.p.name)} <span class="dim">· ${escHtml(pk.a.name)}</span>` : 'All pockets'}</div></div>
          ${pk ? `<div class="pkp-acts">
            <button class="btn small" onclick="pocketMoveIn('${q(pk.ref)}')">${ic('plus', 14)} Put money in</button>
            <button class="btn small" onclick="pocketMoveOut('${q(pk.ref)}')">Take out</button>
            <button class="btn small" onclick="openPocketForm('${q(pk.a.id)}','${q(pk.p.id)}')">${ic('edit', 14)} Edit pocket</button>
          </div>` : '<div class="dim">Tap a pocket to see only its moves</div>'}
        </div>
        ${pk && typeof pocketReachedHtml === 'function' ? pocketReachedHtml(pk.a, pk.p) : ''}
        ${pk && Math.abs(untracked) >= 0.005 ? `<div class="pkp-untracked dim" title="Typed in by hand on the account, or there before you recorded moves. Edit pocket to correct the amount.">Not from a move: <b class="num">${untracked < 0 ? '−' : ''}${fmtMoney(Math.abs(untracked))}</b> · typed in by hand, or there before</div>` : ''}
        <div class="pkp-list">${movesHtml(rows)}</div>
      </div>
    </div>`;
  };
}
