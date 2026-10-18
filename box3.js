/* ===================== Dutch box 3 estimate (Analysis, off by default) =====================
 * Its own file. Settings → Display → "Dutch box 3 estimate". An ESTIMATE of the Dutch wealth tax
 * (box 3) from your figures on 1 January (the reference date), with the 2026 rules as published
 * by the Belastingdienst (checked 18 Oct 2026 — see docs/overnight/RESEARCH.md):
 *   tax-free allowance €59,357 per person · 36 % · deemed returns 1.28 % bank (provisional),
 *   6.00 % other assets, 2.70 % debts (provisional) · debts count above €3,800.
 * Every rate can be changed. It is not tax advice: the real figures come from your return.
 *
 * The invested bank loan: for the tax, the investments bought with it are your assets and the
 * loan is your debt — so both are included here (switchable). This is the ONLY place the loan's
 * numbers are added up with yours; it never enters your net worth.
 *
 * Calculation (Belastingdienst, "berekening box 3-inkomen 2026"):
 *   debts counted = max(0, debts − threshold)
 *   deemed return = bank × r_bank + other × r_other − debts counted × r_debt
 *   base          = bank + other − debts counted
 *   taxable       = deemed return × (base − allowance) / base      (0 when base ≤ allowance)
 *   tax           = taxable × 36 %
 */
const BOX3_2026 = { allowance: 59357, rateBank: 1.28, rateOther: 6.0, rateDebt: 2.7, debtThreshold: 3800, tax: 36 };
function box3Estimate(v, r) {
  r = Object.assign({}, BOX3_2026, r || {});
  const partners = v.partner ? 2 : 1;
  const bank = Math.max(0, +v.bank || 0), other = Math.max(0, +v.other || 0), debts = Math.max(0, +v.debts || 0);
  const debtCounted = Math.max(0, debts - r.debtThreshold * partners);
  const deemed = bank * r.rateBank / 100 + other * r.rateOther / 100 - debtCounted * r.rateDebt / 100;
  const base = bank + other - debtCounted;
  const allowance = r.allowance * partners;
  const taxable = base > allowance && deemed > 0 ? deemed * (base - allowance) / base : 0;
  return { bank, other, debts, debtCounted, deemed, base, allowance, taxable, tax: taxable * r.tax / 100, effective: base > 0 ? taxable * r.tax / 100 / base : 0 };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { box3Estimate, BOX3_2026 };

if (typeof window !== 'undefined') {
  window.box3On = function () { return !!(data.settings.box3 && data.settings.box3.enabled); };
  /* Your figures on 1 January of `year` from the daily snapshots, or today's when there's no
     snapshot for that day (then labelled "today — estimate for next 1 January"). */
  window.box3Figures = function (year, withLoan) {
    const day = `${year}-01-01`;
    const h = (data.history || []).find(x => x.date === day) || null;
    let bank, other, source;
    if (h && h.pos) {
      // Per-holding values of that day: bank accounts and pockets vs everything else.
      const keys = Object.keys(h.pos);
      bank = keys.filter(k => /^(acc|pk):/.test(k)).reduce((s2, k) => s2 + h.pos[k], 0);
      other = keys.filter(k => /^(e|c|bc|cx):/.test(k)).reduce((s2, k) => s2 + h.pos[k], 0);
      source = 'snapshot';
    } else if (h && typeof h.netWorth === 'number' && typeof h.portfolioValue === 'number') {
      // Older snapshots only have totals: bank = net worth − investments + the debts you added.
      other = h.portfolioValue;
      bank = h.netWorth - h.portfolioValue + (typeof manualLiabilitiesTotal === 'function' ? manualLiabilitiesTotal() : 0);
      source = 'snapshot';
    } else {
      bank = bankTotal();
      other = portfolioValue();
      source = 'today';
    }
    let debts = (data.liabilities || []).reduce((s, l) => s + toEUR(+l.amount || 0, l.currency), 0);
    let loanValue = 0, loanOwed = 0;
    if (withLoan && typeof loanList === 'function' && typeof loanModel === 'function') {
      loanList().forEach(L => {
        try {
          const M = loanModel(L);
          const past = (L.history || []).filter(x => x.date <= day).pop();
          loanValue += source === 'snapshot' && past ? +past.value || 0 : M.valueNow || 0;
          loanOwed += M.debtNow || 0;
        } catch (e) { /* a loan without terms is left out */ }
      });
      other += loanValue; debts += loanOwed;
    }
    return { bank, other, debts, source, day, loanValue, loanOwed };
  };
  window.box3CardHtml = function () {
    if (!box3On()) return '';
    const s = data.settings.box3 || {};
    const year = +(s.year || appToday().getFullYear());
    const withLoan = s.withLoan !== false;
    const F = box3Figures(year, withLoan);
    const r = Object.assign({}, BOX3_2026, s.rates || {});
    const E = box3Estimate(Object.assign({ partner: !!s.partner }, F), r);
    const rate = (k, label, step) => `<label class="b3-rate"><span>${label}</span><input class="mini-input" type="number" step="${step}" value="${r[k]}" onchange="setBox3Rate('${k}', this.value)"></label>`;
    return `
    <div class="card" style="margin-top:20px;">
      <div class="row-flex" style="gap:10px;flex-wrap:wrap;"><div><div class="eyebrow">Dutch box 3 — estimate</div><div style="font-size:12.5px;opacity:.6;">${F.source === 'today' ? `No saved figures from 1 January ${year} (the reference date) — today's figures are used instead` : `Your figures on 1 January ${year} (the reference date)`}</div></div>
        <select class="mini-select" onchange="setBox3('year', +this.value)" aria-label="Year">${[year - 1, year, year + 1].map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
      <div class="ret-grid">
        <div><div class="eyebrow">Bank savings</div><div class="ret-big">${fmtMoney(E.bank)}</div></div>
        <div><div class="eyebrow">Other assets</div><div class="ret-big">${fmtMoney(E.other)}</div><div class="ret-sub">investments, crypto, cash at brokers${withLoan && F.loanValue ? ` (incl. ${fmtMoney(F.loanValue)} bought with the loan)` : ''}</div></div>
        <div><div class="eyebrow">Debts</div><div class="ret-big">${fmtMoney(E.debts)}</div><div class="ret-sub">${fmtMoney(E.debtCounted)} counted (above ${fmtMoney(r.debtThreshold * (s.partner ? 2 : 1))})${F.source === 'snapshot' ? ' · debts use today\'s figures (approximate)' : ''}</div></div>
      </div>
      <div class="b3-result">${E.taxable > 0
        ? `Estimated box 3 tax: <strong class="negative">${fmtMoney(E.tax)}</strong> <span style="opacity:.6;">· deemed return ${fmtMoney(E.deemed)}, taxable ${fmtMoney(E.taxable)} (above the ${fmtMoney(E.allowance)} allowance)</span>`
        : `Estimated box 3 tax: <strong class="positive">${fmtMoney(0)}</strong> <span style="opacity:.6;">· your base of ${fmtMoney(Math.max(0, E.base))} is under the ${fmtMoney(E.allowance)} allowance</span>`}</div>
      <div class="fc-opts">
        <label class="switch-row"><button class="toggle ${withLoan ? 'on' : ''}" onclick="setBox3('withLoan', ${!withLoan})" aria-label="Include the invested loan"></button><span>Include the invested loan (its investments and what you owe — for the tax only, never in net worth)</span></label>
        <label class="switch-row"><button class="toggle ${s.partner ? 'on' : ''}" onclick="setBox3('partner', ${!s.partner})" aria-label="Fiscal partner"></button><span>With a fiscal partner (double allowance and threshold)</span></label>
      </div>
      <details style="margin-top:10px;font-size:13px;"><summary style="cursor:pointer;opacity:.75;">Rates (2026, change them if they're updated)</summary>
        <div class="b3-rates">${rate('rateBank', 'Bank %', 0.01)}${rate('rateOther', 'Other %', 0.01)}${rate('rateDebt', 'Debts %', 0.01)}${rate('allowance', 'Allowance €', 1)}${rate('debtThreshold', 'Debt threshold €', 1)}${rate('tax', 'Tax %', 0.5)}</div>
        <div class="ret-sub" style="margin-top:6px;">The bank and debt percentages for 2026 are provisional (set early 2027). <button class="link-btn" style="font-size:12px;" onclick="setBox3('rates', {})">Back to the published figures</button></div>
      </details>
      <div class="ret-note">An estimate to plan with, not tax advice. If your real return was lower than the deemed one, the Belastingdienst lets you prove it (tegenbewijsregeling). A DUO study loan is a box 3 debt unless it can still become a gift.</div>
    </div>`;
  };
  window.setBox3 = function (k, v) { data.settings.box3 = Object.assign({ enabled: true }, data.settings.box3, { [k]: v }); save(); render(); };
  window.setBox3Rate = function (k, v) {
    const n = parseFloat(String(v).replace(',', '.'));
    const rates = Object.assign({}, (data.settings.box3 || {}).rates);
    if (isFinite(n)) rates[k] = n; else delete rates[k];
    setBox3('rates', rates);
  };
}
