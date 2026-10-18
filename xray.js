/* ===================== X-ray (Analysis) =====================
 * Its own file. Checks on your money with thresholds you can change, inspired by Ghostfolio's
 * "X-ray" with EU-minded defaults. Each rule says ok, look, or "not applicable" when there's no
 * data for it (never a failure for missing data). Rules that need a look also appear in the top
 * bar's Action required, where each can be snoozed for 30 days.
 *
 * The first half (XRAY_RULES, xrayEvaluate) is pure — tested in Node (tests/unit/xray.test.js) —
 * and works on a small context object; the second half builds that context from Trackr's data
 * and draws the card. Settings: data.settings.xray = { ruleKey: { on, value } } and
 * data.settings.xraySnooze = { ruleKey: 'YYYY-MM-DD' }.
 *
 * Currency uses each holding's listing currency, so a world ETF listed in euros counts as euros
 * even though it owns US shares — the rule says so. The invested bank loan is never part of the
 * other rules; it has its own ("does the loan's portfolio still cover what you owe?").
 */
const XRAY_RULES = [
  { key: 'position', title: 'Single position', unit: '%', kind: 'max', def: 40, min: 5, max: 100, step: 5,
    help: 'Largest single investment, as a share of your investments (a fund counts as one).',
    evaluate(c, t) {
      if (!(c.invTotal > 0) || !c.positions.length) return null;
      const top = c.positions[0], pct = top.value / c.invTotal * 100;
      return { ok: pct <= t, value: pct, text: `${top.name} is ${pct.toFixed(0)}% of your investments` };
    } },
  { key: 'account', title: 'One broker or exchange', unit: '%', kind: 'max', def: 60, min: 10, max: 100, step: 5,
    help: 'Largest share held at one broker or exchange (investments and their cash).',
    evaluate(c, t) {
      if (!(c.invTotal > 0) || c.institutions.length < 1) return null;
      const top = c.institutions[0], pct = top.value / c.invTotal * 100;
      if (c.institutions.length === 1) return { ok: pct <= t, value: pct, text: `Everything is at ${top.name}` };
      return { ok: pct <= t, value: pct, text: `${top.name} holds ${pct.toFixed(0)}%` };
    } },
  { key: 'currency', title: 'Currency', unit: '%', kind: 'max', def: 50, min: 10, max: 100, step: 5,
    help: 'Share of investments listed in a currency other than the euro (listing currency, crypto left out).',
    evaluate(c, t) {
      const base = c.currencyTotal;
      if (!(base > 0)) return null;
      const other = Object.keys(c.currencies).filter(k => k !== 'EUR').sort((a, b) => c.currencies[b] - c.currencies[a]);
      const nonEur = other.reduce((s, k) => s + c.currencies[k], 0) / base * 100;
      return { ok: nonEur <= t, value: nonEur, text: other.length ? `${nonEur.toFixed(0)}% outside the euro (mostly ${other[0]})` : 'All in euros' };
    } },
  { key: 'crypto', title: 'Crypto share', unit: '%', kind: 'max', def: 10, min: 0, max: 100, step: 1,
    help: 'Crypto as a share of your net worth.',
    evaluate(c, t) {
      if (!(c.netWorth > 0)) return null;
      if (!(c.cryptoValue > 0)) return { ok: true, value: 0, text: 'No crypto' };
      const pct = c.cryptoValue / c.netWorth * 100;
      return { ok: pct <= t, value: pct, text: `${pct.toFixed(1)}% of your net worth` };
    } },
  { key: 'emergency', title: 'Emergency cushion', unit: 'months', kind: 'min', def: 3, min: 0, max: 24, step: 1,
    help: 'Months of your real spending covered by the money you set aside (Goals → Emergency savings).',
    evaluate(c, t) {
      if (!c.emergency || c.emergency.covered == null) return null;
      return { ok: c.emergency.covered >= t, value: c.emergency.covered, text: `${c.emergency.covered.toFixed(1)} months covered` };
    } },
  { key: 'fees', title: 'Fund fees', unit: '%', kind: 'max', def: 0.5, min: 0, max: 3, step: 0.05,
    help: 'Average yearly fee (TER) of the funds whose fee you know, weighted by value.',
    evaluate(c, t) {
      if (!(c.feeBase > 0)) return null;
      const pct = c.feeYearly / c.feeBase * 100;
      return { ok: pct <= t, value: pct, text: `${pct.toFixed(2)}% a year on average` };
    } },
  { key: 'idleCash', title: 'Idle cash at brokers', unit: '%', kind: 'max', def: 15, min: 0, max: 100, step: 5,
    help: 'Uninvested cash at brokers and exchanges, as a share of what you hold there.',
    evaluate(c, t) {
      if (!(c.invTotal > 0)) return null;
      const pct = c.brokerCash / c.invTotal * 100;
      return { ok: pct <= t, value: pct, text: `${pct.toFixed(0)}% waiting uninvested` };
    } },
  { key: 'stale', title: 'Prices up to date', unit: 'stale', kind: 'max', def: 0, min: 0, max: 20, step: 1,
    help: 'Holdings whose price is older than 7 days (30 for prices you type).',
    evaluate(c, t) {
      if (!c.priced) return null;
      return { ok: c.stale <= t, value: c.stale, text: c.stale ? `${c.stale} price${c.stale === 1 ? '' : 's'} out of date` : 'All prices recent' };
    } },
  { key: 'loan', title: 'Loan covered', unit: '%', kind: 'min', def: 100, min: 50, max: 150, step: 5,
    help: 'What the loan\'s investments are worth as a share of what you owe the bank (the loan is never in your net worth).',
    evaluate(c, t) {
      if (!c.loan || !(c.loan.owed > 0)) return null;
      const pct = c.loan.value / c.loan.owed * 100;
      return { ok: pct >= t, value: pct, text: `Its investments cover ${pct.toFixed(0)}% of what you owe` };
    } },
];
/* settings: { key: { on, value } }; returns [{ rule, on, threshold, result }] — result null = n/a. */
function xrayEvaluate(ctx, settings) {
  return XRAY_RULES.map(rule => {
    const s = (settings || {})[rule.key] || {};
    const on = s.on !== false;
    const threshold = s.value != null && isFinite(+s.value) ? +s.value : rule.def;
    let result = null;
    if (on) { try { result = rule.evaluate(ctx, threshold); } catch (e) { result = null; } }
    return { rule, on, threshold, result };
  });
}
if (typeof module !== 'undefined' && module.exports) module.exports = { XRAY_RULES, xrayEvaluate };

/* ---------- Trackr data → X-ray (browser only) ---------- */
if (typeof window !== 'undefined') {
  window.xrayContext = function () {
    const rows = (typeof wealthAssetRows === 'function' ? wealthAssetRows() : []).filter(r => !r.loan && r.value > 0);
    const invRows = rows.filter(r => !['Bank account', 'Savings'].includes(r.type));   // investments + cash at brokers/exchanges
    const holdings = invRows.filter(r => r.type !== 'Cash');
    const byGroup = {};
    holdings.forEach(r => { const g = byGroup[r.group] = byGroup[r.group] || { name: r.name, value: 0 }; g.value += r.value; });
    const byInst = {};
    invRows.forEach(r => { byInst[r.institution] = (byInst[r.institution] || 0) + r.value; });
    const currencies = {};
    holdings.forEach(r => {
      if (r.type === 'Crypto') return;
      const a = /^a:/.test(r.group) ? assetById(r.group.slice(2)) : null;
      const ccy = (a && a.priceCurrency) || 'EUR';
      currencies[ccy] = (currencies[ccy] || 0) + r.value;
    });
    const F = typeof feesModel === 'function' ? feesModel() : { rows: [] };
    const feeRows = F.rows.filter(r => r.pct != null && r.value > 0);
    let stale = 0, priced = 0;
    (data.assets || []).forEach(a => {
      if (!(assetStats(a.id).quantity > 0)) return;
      priced++;
      const days = a.priceUpdatedAt ? (Date.now() - new Date(a.priceUpdatedAt).getTime()) / 86400000 : Infinity;
      if (days > (a.manualPrice != null ? 30 : 7)) stale++;
    });
    let loan = null;
    if (typeof loanList === 'function' && loanList().length && typeof loanModel === 'function') {
      try {
        const ms = loanList().map(L => loanModel(L));
        loan = { owed: ms.reduce((s, M) => s + (M.debtNow || 0), 0), value: ms.reduce((s, M) => s + (M.valueNow || 0), 0) };
      } catch (e) { loan = null; }
    }
    const ef = data.emergencyFund || {};
    return {
      invTotal: invRows.reduce((s, r) => s + r.value, 0),
      positions: Object.values(byGroup).sort((a, b) => b.value - a.value),
      institutions: Object.keys(byInst).map(k => ({ name: k, value: byInst[k] })).sort((a, b) => b.value - a.value),
      currencies, currencyTotal: Object.values(currencies).reduce((s, v) => s + v, 0),
      netWorth: netWorthTotal(),
      cryptoValue: holdings.filter(r => r.type === 'Crypto').reduce((s, r) => s + r.value, 0),
      brokerCash: invRows.filter(r => r.type === 'Cash').reduce((s, r) => s + r.value, 0),
      emergency: ef.enabled && typeof emergencyState === 'function' ? emergencyState() : null,
      feeBase: feeRows.reduce((s, r) => s + r.value, 0), feeYearly: feeRows.reduce((s, r) => s + r.value * r.pct / 100, 0),
      stale, priced, loan,
    };
  };
  window.xrayResults = function () { return xrayEvaluate(xrayContext(), data.settings.xray || {}); };
  /* Rules that need a look and aren't snoozed — for Action required. */
  window.xrayAttention = function () {
    const snooze = data.settings.xraySnooze || {}, today = todayYmd();
    return xrayResults().filter(x => x.on && x.result && !x.result.ok && !(snooze[x.rule.key] && snooze[x.rule.key] > today));
  };
  window.xraySnooze = function (key) {
    const d = new Date(); d.setDate(d.getDate() + 30);
    data.settings.xraySnooze = Object.assign({}, data.settings.xraySnooze, { [key]: dateToYmd(d) });
    save(); render();
  };
  window.setXray = function (key, field, v) {
    const all = Object.assign({}, data.settings.xray);
    const s = Object.assign({}, all[key]);
    if (field === 'on') s.on = !!v;
    else { const n = parseFloat(String(v).replace(',', '.')); if (isFinite(n)) s.value = n; else delete s.value; }
    all[key] = s; data.settings.xray = all;
    save(); render();
  };
  const xrayFmt = (rule, v) => (rule.unit === '%' ? `${(+v).toFixed(rule.step < 1 ? 2 : 0)}%` : rule.unit === 'months' ? `${(+v).toFixed(1)} months` : `${v}`);
  window.xrayCardHtml = function () {
    const list = xrayResults();
    const edit = ui.xrayEdit;
    const looks = list.filter(x => x.on && x.result && !x.result.ok).length, oks = list.filter(x => x.on && x.result && x.result.ok).length;
    return `
    <div class="card" style="margin-top:20px;">
      <div class="row-flex" style="gap:10px;flex-wrap:wrap;margin-bottom:8px;">
        <div><div class="eyebrow">X-ray</div><div style="font-size:12.5px;opacity:.6;">${looks ? `${looks} need${looks === 1 ? 's' : ''} a look` : 'Nothing needs a look'} · ${oks} ok</div></div>
        <button class="btn small" onclick="ui.xrayEdit=!ui.xrayEdit;render()">${edit ? 'Done' : 'Adjust'}</button>
      </div>
      <div class="xr-list">${list.map(x => {
        const r = x.result, st = !x.on ? 'off' : !r ? 'na' : r.ok ? 'ok' : 'look';
        const snoozed = st === 'look' && (data.settings.xraySnooze || {})[x.rule.key] > todayYmd();
        return `<div class="xr-row xr-${st}">
          <span class="xr-dot" aria-hidden="true"></span>
          <div class="xr-txt"><div class="xr-name">${escHtml(x.rule.title)} <span class="xr-lim">${x.rule.kind === 'max' ? '≤' : '≥'} ${xrayFmt(x.rule, x.threshold)}</span></div>
            <div class="xr-detail">${!x.on ? 'Switched off' : r ? escHtml(r.text) + (snoozed ? ' · snoozed' : '') : 'Not applicable — no data for it yet'}</div>
            ${edit ? `<div class="xr-help">${escHtml(x.rule.help)}</div>` : ''}</div>
          ${edit ? `<div class="xr-edit"><input class="mini-input" type="number" min="${x.rule.min}" max="${x.rule.max}" step="${x.rule.step}" value="${x.threshold}" onchange="setXray('${x.rule.key}','value',this.value)" aria-label="Threshold for ${escHtml(x.rule.title)}"><button class="toggle ${x.on ? 'on' : ''}" onclick="setXray('${x.rule.key}','on',${!x.on})" aria-label="Use this rule"></button></div>` : ''}
        </div>`;
      }).join('')}</div>
      <div class="ret-note">Currency uses where each holding is listed: a world fund listed in euros counts as euros. The loan is checked on its own and never counts in your net worth.</div>
    </div>`;
  };
}
