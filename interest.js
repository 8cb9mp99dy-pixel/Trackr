/* ===================== Interest on pockets =====================
 * Its own file, loaded after wallet.js (shares the app's globals).
 *
 * A pocket can earn interest (Edit pocket → "Earns interest"): at the central bank's rate of its
 * account's currency (fetched by itself: ECB deposit rate for EUR, the Fed's effective rate for
 * USD — other currencies are typed), or at your own rate, optionally only up to a cap (e.g. a
 * bank paying on the first €50,000). Then:
 *   - the pocket shows its rate and about how much it earns a week and a year;
 *   - its window ("Interest") shows per day / week / month / year, the effective yearly yield
 *     with monthly payouts, what it grows to in 1, 5 and 10 years if left alone, and the interest
 *     you recorded so far;
 *   - "Record interest received" adds what the bank paid to the pocket and logs it as income
 *     (Investment returns → Interest), so it counts as passive income everywhere.
 * Estimates use today's balance and rate; a central bank rate moves, so they move with it.
 * Every amount goes through fmtMoney (the eye hides them).
 *
 * interestFigures() and interestGrowth() are pure (Node-tested).
 */
/* What a balance earns at `ratePct` % a year, on at most `cap` (null = no cap). */
function interestFigures(balance, ratePct, cap) {
  const base = Math.max(0, cap > 0 ? Math.min(balance, cap) : balance);
  const r = (+ratePct || 0) / 100;
  const yearly = base * r;
  return { base, rate: +ratePct || 0, daily: yearly / 365, weekly: yearly / 52, monthly: yearly / 12, yearly,
    apy: (Math.pow(1 + r / 12, 12) - 1) * 100 };   // paid monthly and left in the pocket
}
/* The balance after `years`, interest paid monthly and left in (nothing added or taken out). */
function interestGrowth(balance, ratePct, cap, years) {
  let b = Math.max(0, balance);
  const r = (+ratePct || 0) / 100 / 12;
  for (let m = 0; m < Math.round(years * 12); m++) b += Math.max(0, cap > 0 ? Math.min(b, cap) : b) * r;
  return b;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { interestFigures, interestGrowth };
} else {
  const CB_KEY = 'trackr-central-rates', CB_EVERY = 12 * 3600 * 1000;
  // Central banks Trackr can ask by itself (public data, no key). Others are typed.
  const CENTRAL = {
    EUR: { bank: 'ECB', label: 'ECB deposit rate', url: 'https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?lastNObservations=1&format=jsondata',
      parse: j => { const s = Object.values(j.dataSets[0].series)[0].observations; const k = Object.keys(s).pop(); return { rate: +s[k][0], date: j.structure.dimensions.observation[0].values[+k].id }; } },
    USD: { bank: 'Fed', label: 'Fed effective rate', url: 'https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json',
      parse: j => ({ rate: +j.refRates[0].percentRate, date: j.refRates[0].effectiveDate }) },
  };
  const OTHER_BANKS = { GBP: 'Bank of England', CHF: 'Swiss National Bank', JPY: 'Bank of Japan', CAD: 'Bank of Canada', AUD: 'Reserve Bank of Australia', SEK: 'Riksbank', NOK: 'Norges Bank', DKK: 'Danmarks Nationalbank', PLN: 'National Bank of Poland' };
  let cbCache = null, cbBusy = false;
  function cbAll() {
    if (cbCache) return cbCache;
    try { cbCache = JSON.parse(localStorage.getItem(CB_KEY)); } catch (e) {}
    if (!cbCache || typeof cbCache !== 'object') cbCache = {};
    return cbCache;
  }
  window.centralBankFor = ccy => CENTRAL[ccy] || null;
  window.centralBankName = ccy => (CENTRAL[ccy] ? CENTRAL[ccy].label : OTHER_BANKS[ccy] ? OTHER_BANKS[ccy] + ' rate' : 'Central bank rate');
  /* The last known central bank rate for a currency: { rate, date } or null. */
  window.centralRate = function (ccy) {
    const c = cbAll()[ccy];
    if (c && isFinite(c.rate)) return c;
    // Another device may have fetched it: the pockets keep the last rate they used.
    for (const a of data.accounts || []) if (a.currency === ccy) for (const p of a.pockets || []) if (p.interest && p.interest.lastRate != null) return { rate: +p.interest.lastRate, date: p.interest.lastRateDate || '' };
    return null;
  };
  window.refreshCentralRates = async function (force) {
    if (cbBusy) return;
    const need = new Set();
    (data.accounts || []).forEach(a => (a.pockets || []).forEach(p => { if (p.interest && p.interest.on && p.interest.source === 'central' && CENTRAL[a.currency]) need.add(a.currency); }));
    if (ui.modal && ui.modal.type === 'pocket') { const a = accountById(ui.modal.payload.accId); if (a && CENTRAL[a.currency]) need.add(a.currency); }
    const all = cbAll(), now = Date.now();
    const todo = Array.from(need).filter(c => force || !all[c] || now - (all[c].at || 0) > CB_EVERY);
    if (!todo.length) return;
    cbBusy = true;
    let changed = false;
    try {
      for (const ccy of todo) {
        try {
          const r = await fetchWithTimeout(CENTRAL[ccy].url, {}, 10000);
          const got = CENTRAL[ccy].parse(await r.json());
          if (isFinite(got.rate)) { all[ccy] = Object.assign(got, { at: now }); changed = true; }
        } catch (e) { /* offline: keep the last rate */ }
      }
      try { localStorage.setItem(CB_KEY, JSON.stringify(all)); } catch (e) {}
      // Remember it on the pockets too (synced), only when it changed.
      let saveIt = false;
      (data.accounts || []).forEach(a => (a.pockets || []).forEach(p => {
        const c = all[a.currency];
        if (p.interest && p.interest.source === 'central' && c && (p.interest.lastRate !== c.rate || p.interest.lastRateDate !== c.date)) { p.interest.lastRate = c.rate; p.interest.lastRateDate = c.date; saveIt = true; }
      }));
      if (saveIt) save();
    } finally {
      cbBusy = false;
      if (changed) renderWhenIdle();
    }
  };
  setTimeout(() => refreshCentralRates(), 4000);

  /* The rate a pocket earns now (%), or null when it doesn't earn any. */
  window.pocketRate = function (acc, p) {
    const i = p && p.interest;
    if (!i || !i.on) return null;
    if (i.source === 'central' && CENTRAL[acc.currency]) { const c = centralRate(acc.currency); return c ? c.rate : null; }
    return i.rate != null && isFinite(i.rate) ? +i.rate : null;
  };
  window.pocketInterest = function (acc, p) {
    const rate = pocketRate(acc, p);
    return rate == null ? null : interestFigures(+p.amountSaved || 0, rate, p.interest.cap);
  };
  /* Interest recorded for this pocket (income transactions made by "Record interest received"). */
  function recordedFor(pkId, from) {
    return (data.budgetTransactions || []).filter(t => t.type === 'income' && t.pocketInterest === pkId && (!from || t.date >= from));
  }

  /* ---- On the pocket's line (Accounts) ---- */
  window.pocketInterestLineHtml = function (acc, p) {
    const f = pocketInterest(acc, p);
    if (!p.interest || !p.interest.on) return '';
    if (!f) return `<button class="pk-int" onclick="event.stopPropagation();openPocketInterest('${acc.id}','${p.id}')">${ic('trend', 12)} Interest: rate unknown</button>`;
    return `<button class="pk-int" onclick="event.stopPropagation();openPocketInterest('${acc.id}','${p.id}')" title="See the interest">${ic('trend', 12)} ${f.rate.toFixed(2)}% · ≈ ${fmtMoney(f.weekly, acc.currency)}/week · ${fmtMoney(f.yearly, acc.currency)}/year</button>`;
  };

  /* ---- In the pocket form ---- */
  window.pocketInterestFormHtml = function (acc, pk) {
    const i = (pk && pk.interest) || {};
    const cb = CENTRAL[acc.currency];
    const src = i.source || 'central';
    const c = cb ? centralRate(acc.currency) : null;
    if (cb && !c) setTimeout(() => refreshCentralRates(true).then(() => { const el = document.getElementById('pi-cb-rate'); const r = centralRate(acc.currency); if (el && r) el.textContent = `${r.rate.toFixed(2)}% (${shortDay(r.date)})`; }), 0);
    const on = !!i.on;
    return `
      <div class="pi-box">
        <div class="row-flex" style="cursor:pointer;" onclick="piToggle()">
          <div><div style="font-weight:600;font-size:13.5px;">Earns interest</div><div style="font-size:12px;opacity:.65;">See what it earns a week, a month, a year</div></div>
          <div class="toggle ${on ? 'on' : ''}" id="pi-on"></div>
        </div>
        <div id="pi-fields" class="stack-gap-12" style="margin-top:12px;${on ? '' : 'display:none;'}">
          <input type="hidden" id="pi-src" value="${src}">
          <div class="seg-row" style="margin:0;">
            <button type="button" class="seg ${src === 'central' ? 'on' : ''}" data-src="central" onclick="piSource('central')">${cb ? `${cb.bank} rate` : 'Central bank'}</button>
            <button type="button" class="seg ${src === 'custom' ? 'on' : ''}" data-src="custom" onclick="piSource('custom')">My own rate</button>
          </div>
          <div id="pi-central" style="${src === 'central' ? '' : 'display:none;'}font-size:13px;">
            ${cb ? `${escHtml(cb.label)} (${escHtml(acc.currency)}): <b id="pi-cb-rate">${c ? `${c.rate.toFixed(2)}% (${escHtml(shortDay(c.date))})` : 'getting it…'}</b><div class="dim" style="font-size:12px;margin-top:4px;">Updated by itself: when the ${escHtml(cb.bank)} changes its rate, the pocket follows.</div>`
              : `<label class="field"><span class="label-text">${escHtml(centralBankName(acc.currency))} (${escHtml(acc.currency)}), % a year</span><input id="pi-cb-typed" type="number" step="0.01" inputmode="decimal" value="${i.source === 'central' && i.rate != null ? i.rate : ''}" placeholder="e.g. 4"></label>
                 <div class="dim" style="font-size:12px;">Trackr can only fetch the ECB (EUR) and Fed (USD) rates by itself — type this one, and change it when the bank does.</div>`}
          </div>
          <label class="field" id="pi-custom" style="${src === 'custom' ? '' : 'display:none;'}"><span class="label-text">Interest rate, % a year</span><input id="pi-rate" type="number" step="0.01" inputmode="decimal" value="${i.source === 'custom' && i.rate != null ? i.rate : ''}" placeholder="e.g. 2.25"></label>
          <label class="field"><span class="label-text">Paid only up to <span style="opacity:.6;">(optional, ${escHtml(acc.currency)})</span></span><input id="pi-cap" type="number" step="1" inputmode="decimal" value="${i.cap != null ? i.cap : ''}" placeholder="e.g. 50000"></label>
        </div>
      </div>`;
  };
  // The form is read when saved, so these switch what's shown without redrawing (typed values stay).
  window.piToggle = function () {
    const t = document.getElementById('pi-on'); if (!t) return;
    t.classList.toggle('on');
    document.getElementById('pi-fields').style.display = t.classList.contains('on') ? '' : 'none';
  };
  window.piSource = function (s) {
    document.getElementById('pi-src').value = s;
    document.querySelectorAll('.pi-box .seg').forEach(b => b.classList.toggle('on', b.dataset.src === s));
    document.getElementById('pi-central').style.display = s === 'central' ? '' : 'none';
    document.getElementById('pi-custom').style.display = s === 'custom' ? '' : 'none';
  };
  /* Reads the form: { interest } to store on the pocket, or { error }. */
  window.readPocketInterestForm = function (acc, old) {
    const t = document.getElementById('pi-on'); if (!t) return { interest: old || undefined };
    const num = id => { const el = document.getElementById(id); const v = el ? String(el.value).replace(',', '.').trim() : ''; return v === '' ? null : parseFloat(v); };
    const on = t.classList.contains('on');
    const prev = old || {};
    if (!on) return { interest: prev.source ? Object.assign({}, prev, { on: false }) : undefined };
    const source = document.getElementById('pi-src').value === 'central' ? 'central' : 'custom';
    let rate = null;
    if (source === 'custom') rate = num('pi-rate');
    else if (!CENTRAL[acc.currency]) rate = num('pi-cb-typed');
    if ((source === 'custom' || !CENTRAL[acc.currency]) && (rate == null || !(rate >= 0))) return { error: 'Type the interest rate (% a year).' };
    const cap = num('pi-cap');
    const c = source === 'central' ? centralRate(acc.currency) : null;
    return { interest: { on: true, source, rate, cap: cap > 0 ? cap : null, since: prev.since || todayYmd(),
      lastRate: c ? c.rate : prev.lastRate != null ? prev.lastRate : null, lastRateDate: c ? c.date : prev.lastRateDate || null } };
  };

  /* ---- The interest window ---- */
  window.openPocketInterest = function (accId, pkId) { ui.modal = { type: 'pocketInterest', payload: { accId, pkId } }; render(); refreshCentralRates(); };
  window.__modalRenderers.pocketInterest = function (pl) {
    const acc = accountById(pl.accId), p = acc && (acc.pockets || []).find(x => x.id === pl.pkId);
    if (!p) return '';
    const ccy = acc.currency, i = p.interest || {}, f = pocketInterest(acc, p);
    const m = v => fmtMoney(v, ccy);
    const c = i.source === 'central' && CENTRAL[ccy] ? centralRate(ccy) : null;
    const rec = recordedFor(p.id), yearAgo = dateToYmd(new Date(appToday().getTime() - 365 * 864e5));
    const recTotal = rec.reduce((s, t) => s + (+t.amount || 0), 0), recYear = rec.filter(t => t.date >= yearAgo).reduce((s, t) => s + (+t.amount || 0), 0);
    const head = `<div class="modal-head"><div class="modal-title">${escHtml(p.icon || '')} ${escHtml(p.name)} · interest</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>`;
    if (!f) return `${head}<div class="dim">The rate isn't known yet${c === null && i.source === 'central' ? ` (the ${escHtml(centralBankName(ccy))} couldn't be reached)` : ''}. Edit the pocket to type one.</div>
      <div class="modal-actions"><button class="btn" onclick="openPocketForm('${acc.id}','${p.id}')">Edit pocket</button></div>`;
    const years = [1, 5, 10].map(y => ({ y, v: interestGrowth(+p.amountSaved || 0, f.rate, i.cap, y) }));
    const top = Math.max(...years.map(x => x.v), 1);
    return `${head}
      <div class="pi-rate"><b>${f.rate.toFixed(2)}%</b><span>a year · ${i.source === 'central' ? `${escHtml(centralBankName(ccy))}${c && c.date ? `, ${escHtml(shortDay(c.date))}` : ''}` : 'your rate'}${i.cap ? ` · paid up to ${m(i.cap)}` : ''}</span></div>
      <div class="dim" style="font-size:12.5px;margin:-4px 0 12px;">On ${m(f.base)}${i.cap && p.amountSaved > i.cap ? ` (of ${m(p.amountSaved)}: the rest earns nothing)` : ''}. Paid monthly and left in, that's ${f.apy.toFixed(2)}% a year.</div>
      <div class="pi-grid">
        ${[['A day', f.daily], ['A week', f.weekly], ['A month', f.monthly], ['A year', f.yearly]].map(([l, v]) => `<div><span>${l}</span><b class="positive">+${m(v)}</b></div>`).join('')}
      </div>
      <div class="eyebrow" style="margin-top:16px;">If you leave it there</div>
      <div class="pi-bars">${years.map(x => `<div class="pi-bar-row"><span>${x.y} year${x.y > 1 ? 's' : ''}</span><div class="pi-track"><i style="width:${(x.v / top * 100).toFixed(1)}%"></i></div><b>${m(x.v)}</b><em class="positive">+${m(x.v - (+p.amountSaved || 0))}</em></div>`).join('')}</div>
      <div class="dim" style="font-size:12px;margin-top:6px;">Nothing added or taken out, at today's rate${i.source === 'central' ? ' (a central bank rate changes over time)' : ''}. Before tax.</div>
      <div class="eyebrow" style="margin-top:16px;">Received</div>
      <div class="pi-grid two"><div><span>Last 12 months</span><b>${m(recYear)}</b></div><div><span>Since you started recording</span><b>${m(recTotal)}</b></div></div>
      <div class="modal-actions">
        <button class="btn" onclick="openPocketForm('${acc.id}','${p.id}')">Edit</button>
        <button class="btn primary" onclick="recordPocketInterest('${acc.id}','${p.id}')">Record interest received</button>
      </div>`;
  };
  /* What the bank paid: added to the pocket and logged as income (Investment returns → Interest). */
  window.recordPocketInterest = function (accId, pkId) {
    const acc = accountById(accId), p = acc && (acc.pockets || []).find(x => x.id === pkId);
    if (!p) return;
    const f = pocketInterest(acc, p);
    const v = prompt(`How much interest did ${p.name} receive (${acc.currency})?`, f ? f.monthly.toFixed(2) : '');
    if (v == null) return;
    const amt = parseFloat(String(v).replace(',', '.'));
    if (!(amt > 0)) return;
    const cat = (data.categories.income || []).find(c => (c.subcategories || []).some(s => s.id === 'sci_interest'));
    p.amountSaved = Math.round(((+p.amountSaved || 0) + amt) * 100) / 100;
    data.budgetTransactions.push({ id: uid('tx'), date: todayYmd(), type: 'income', categoryId: cat ? cat.id : '', subCategoryId: cat ? 'sci_interest' : null, nature: 'Variable',
      paymentMethodId: null, accountId: null, currency: acc.currency, amount: amt, comment: `Interest · ${p.name}`, location: '', description: `Added to the pocket ${p.name} (${acc.name})`, logo: '', impact: '', pocketInterest: p.id, reviewed: true });
    save(); render();
  };
}
