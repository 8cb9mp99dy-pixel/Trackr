/* ===================== Freelance: invoices and VAT =====================
 * Its own file, loaded after allocation.js (uses its incomePlanOffer, and the app's globals).
 *
 * The Freelance page has two tabs:
 *   - Invoices: client, number, dates, amount before VAT, VAT %, status (draft / sent / paid,
 *     "late" once past its due date). "Payment received" records the income (Freelance) on the
 *     account it landed in and offers the income plan's split (VAT first…). Unpaid invoices are
 *     expected money in Budget → Forecast.
 *   - VAT: one card per quarter: VAT on your invoices (by invoice date, the usual rule) and on
 *     freelance income logged without an invoice (its amount counted as VAT included), minus the
 *     VAT on expenses marked "Business expense", what's due and by when (the end of the month
 *     after the quarter, as in the Netherlands). "Mark as paid" records the payment: from your
 *     VAT pocket back to its account, then an expense in Taxes & Fees › VAT.
 *   Your VAT pocket against what's still owed: short or extra.
 * Action required: invoices past due, and a VAT return due in the next 14 days.
 *
 * data.invoices = [{ id, number, client, issueDate, dueDate, net, vatRate, currency, status,
 *   paidDate, paidTxId, note }]
 * data.vat = { rate, pocket: 'pk:acc:pocket' | '', freelanceIncludesVat, paid: { '2026-Q3': {
 *   date, amount, txIds } } }
 *
 * Pure maths (vatQuarterRange, vatFor, invoiceGross) is exported for the Node tests.
 */
const r2v = n => Math.round((+n || 0) * 100) / 100;
function invoiceGross(inv) { return r2v((+inv.net || 0) * (1 + (+inv.vatRate || 0) / 100)); }
function invoiceVat(inv) { return r2v((+inv.net || 0) * (+inv.vatRate || 0) / 100); }
/* Quarter q (1–4) of a year: its first and last day, and the return deadline (end of the next month). */
function vatQuarterRange(year, q) {
  const pad = n => String(n).padStart(2, '0');
  const m0 = (q - 1) * 3 + 1, m2 = m0 + 2;
  const last = new Date(year, m2, 0).getDate();
  const dl = new Date(year, m2 + 1, 0); // last day of the month after the quarter
  return { key: `${year}-Q${q}`, from: `${year}-${pad(m0)}-01`, to: `${year}-${pad(m2)}-${pad(last)}`, deadline: `${dl.getFullYear()}-${pad(dl.getMonth() + 1)}-${pad(dl.getDate())}` };
}
/* VAT for a period. invoices: sent or paid ones count on their invoice date. incomes: freelance
   income without an invoice ({ date, eur }), counted as VAT included at `rate` when includesVat.
   expenses: business expenses ({ date, eur, rate }), their VAT deductible. */
function vatFor(period, invoices, incomes, expenses, rate, includesVat) {
  const inP = d => d >= period.from && d <= period.to;
  const fromInvoices = (invoices || []).filter(i => i.status !== 'draft' && inP(i.issueDate || '')).reduce((s, i) => s + invoiceVat(i), 0);
  const fromIncome = includesVat ? (incomes || []).filter(t => inP(t.date)).reduce((s, t) => s + t.eur * rate / (100 + rate), 0) : 0;
  const deductible = (expenses || []).filter(t => inP(t.date)).reduce((s, t) => { const r = t.rate != null ? +t.rate : rate; return s + t.eur * r / (100 + r); }, 0);
  const collected = r2v(fromInvoices + fromIncome), input = r2v(deductible);
  return { collected, fromInvoices: r2v(fromInvoices), fromIncome: r2v(fromIncome), deductible: input, due: r2v(collected - input) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { vatQuarterRange, vatFor, invoiceGross, invoiceVat };
} else {
  /* ---- Data helpers ---- */
  window.vatSettings = function () {
    if (!data.vat || typeof data.vat !== 'object') data.vat = { rate: 21, pocket: '', freelanceIncludesVat: true, paid: {} };
    if (data.vat.rate == null) data.vat.rate = 21;
    if (!data.vat.paid) data.vat.paid = {};
    if (data.vat.freelanceIncludesVat == null) data.vat.freelanceIncludesVat = true;
    return data.vat;
  };
  window.invoiceList = function () { if (!Array.isArray(data.invoices)) data.invoices = []; return data.invoices; };
  window.invoiceById = id => invoiceList().find(i => i.id === id) || null;
  window.invoiceState = function (inv) {
    if (inv.status === 'paid') return 'paid';
    if (inv.status === 'draft') return 'draft';
    return inv.dueDate && inv.dueDate < todayYmd() ? 'late' : 'sent';
  };
  const INV_LABEL = { draft: 'Draft', sent: 'Waiting', late: 'Late', paid: 'Paid' };
  /* The VAT pocket: the one you chose, else a pocket named VAT / BTW / TVA / tax. */
  window.vatPocketRef = function () {
    const v = vatSettings();
    if (v.pocket && transferEndpoint(v.pocket)) return v.pocket;
    for (const a of data.accounts || []) for (const p of a.pockets || []) if (/\b(vat|btw|tva|tax|taxes)\b/i.test(p.name || '')) return `pk:${a.id}:${p.id}`;
    return '';
  };
  function vatInputs() {
    const v = vatSettings();
    const incomes = (data.budgetTransactions || []).filter(t => t.type === 'income' && t.categoryId === 'inc_freelance' && !t.invoiceId).map(t => ({ date: t.date, eur: toEUR(+t.amount || 0, t.currency) }));
    const expenses = (data.budgetTransactions || []).filter(t => t.type === 'expense' && t.business).map(t => ({ date: t.date, eur: toEUR(+t.amount || 0, t.currency), rate: t.vatRate != null ? +t.vatRate : v.rate }));
    return { invoices: invoiceList().map(i => Object.assign({}, i, { net: toEUR(+i.net || 0, i.currency || 'EUR') })), incomes, expenses, rate: +v.rate || 0, includes: !!v.freelanceIncludesVat };
  }
  window.vatQuarter = function (year, q) {
    const P = vatQuarterRange(year, q), I = vatInputs();
    return Object.assign(P, vatFor(P, I.invoices, I.incomes, I.expenses, I.rate, I.includes), { paid: vatSettings().paid[P.key] || null });
  };
  /* Quarters with something in them, up to the current one, that aren't marked paid. */
  window.vatOpenQuarters = function () {
    const today = todayYmd(), y = +today.slice(0, 4), out = [];
    for (let year = y - 1; year <= y; year++) for (let q = 1; q <= 4; q++) {
      const Q = vatQuarter(year, q);
      if (Q.from > today || Q.paid || !(Q.due > 0.005)) continue;
      out.push(Q);
    }
    return out;
  };
  window.freelanceForecastEvents = function (today, to) {
    return invoiceList().filter(i => i.status === 'sent').map(i => {
      const d = i.dueDate && i.dueDate > today ? i.dueDate : fcAddDays(today, 1);
      return d <= to ? { date: d, amount: toEUR(invoiceGross(i), i.currency || 'EUR'), label: `Invoice ${i.number || ''} · ${i.client || ''}`.trim(), kind: 'invoice' } : null;
    }).filter(Boolean);
  };
  window.freelanceAttention = function () {
    const out = [], today = todayYmd();
    const late = invoiceList().filter(i => invoiceState(i) === 'late');
    if (late.length) out.push({ key: 'inv-late', icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('briefcase', 16)}</span>`, name: `${late.length} invoice${late.length > 1 ? 's' : ''} late`,
      detail: `${fmtMoney(late.reduce((s, i) => s + toEUR(invoiceGross(i), i.currency || 'EUR'), 0))} not paid after the due date`, actions: [{ label: 'See', onclick: "closeModal();openFreelance('invoices')", primary: true }] });
    vatOpenQuarters().forEach(Q => {
      const days = Math.round((ymdToDate(Q.deadline) - ymdToDate(today)) / 86400000);
      if (days > 14) return;
      out.push({ key: 'vat-' + Q.key, icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('receipt', 16)}</span>`, name: `VAT ${Q.key.replace('-', ' ')}`,
        detail: `${fmtMoney(Q.due)} to pay ${days < 0 ? `— ${-days} days late` : days === 0 ? 'today' : `by ${shortDay(Q.deadline)}`}`, actions: [{ label: 'See', onclick: "closeModal();openFreelance('vat')", primary: true }] });
    });
    return out;
  };

  /* ---- Page ---- */
  window.openFreelance = function (tab) { ui.freelanceTab = tab || ui.freelanceTab || 'invoices'; goPage('freelance'); };
  window.renderFreelance = function () {
    const tab = ui.freelanceTab || 'invoices';
    const unpaid = invoiceList().filter(i => ['sent', 'late'].includes(invoiceState(i)));
    const late = unpaid.filter(i => invoiceState(i) === 'late');
    const open = vatOpenQuarters(), owed = open.reduce((s, Q) => s + Q.due, 0);
    const pref = vatPocketRef(), pocket = pref ? transferEndpoint(pref) : null;
    const inPocket = pocket ? toEUR(pocket.get(), pocket.ccy) : null;
    const cur = (() => { const t = appToday(); return vatQuarter(t.getFullYear(), Math.floor(t.getMonth() / 3) + 1); })();
    return `
    <div class="page surface-light">
      <div class="page-head"><div><h1 class="page-title">Freelance</h1><div class="page-subtitle">Invoices and VAT</div></div>
        <button class="btn primary" onclick="openInvoiceForm()">${ic('plus', 15)} New invoice</button></div>
      <div class="grid-3" style="margin-bottom:16px;">
        <div class="card"><div class="eyebrow">Not paid yet</div><div class="fl-num">${fmtMoney(unpaid.reduce((s, i) => s + toEUR(invoiceGross(i), i.currency || 'EUR'), 0))}</div>
          <div class="dim">${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'}${late.length ? ` · <span class="negative">${late.length} late</span>` : ''}</div></div>
        <div class="card"><div class="eyebrow">VAT ${escHtml(cur.key.replace('-', ' '))} so far</div><div class="fl-num">${fmtMoney(Math.max(0, cur.due))}</div>
          <div class="dim">Due by ${escHtml(shortDay(cur.deadline))}${cur.paid ? ' · paid' : ''}</div></div>
        <div class="card"><div class="eyebrow">VAT pocket</div>
          ${pocket ? `<div class="fl-num">${fmtMoney(inPocket)}</div><div class="dim">${owed > 0.005 ? (inPocket >= owed ? `<span class="positive">${fmtMoney(inPocket - owed)} more than the ${fmtMoney(owed)} owed</span>` : `<span class="negative">${fmtMoney(owed - inPocket)} short of the ${fmtMoney(owed)} owed</span>`) : 'Nothing owed right now'}</div>`
            : '<div class="dim" style="margin-top:6px;">No VAT pocket yet. Name a pocket "VAT", or pick one in the VAT tab.</div>'}</div>
      </div>
      <div class="seg-row" style="margin-bottom:14px;"><button class="seg ${tab === 'invoices' ? 'on' : ''}" onclick="ui.freelanceTab='invoices';render()">Invoices</button><button class="seg ${tab === 'vat' ? 'on' : ''}" onclick="ui.freelanceTab='vat';render()">VAT</button></div>
      ${tab === 'vat' ? vatTabHtml() : invoicesTabHtml()}
    </div>`;
  };
  function invoicesTabHtml() {
    const f = ui.invoiceFilter || 'open';
    const list = invoiceList().slice().sort((a, b) => ((b.issueDate || '') < (a.issueDate || '') ? -1 : 1))
      .filter(i => f === 'all' || (f === 'paid' ? i.status === 'paid' : i.status !== 'paid'));
    return `
      <div class="chip-scroll" tabindex="0" role="group" aria-label="Filter" style="margin-bottom:12px;">${[['open', 'Not paid'], ['paid', 'Paid'], ['all', 'All']].map(([k, l]) => `<span class="chip" style="cursor:pointer;${f === k ? 'background:var(--light-accent-1);border-color:var(--light-accent-1);color:#fff;' : ''}" onclick="ui.invoiceFilter='${k}';render()">${l}</span>`).join('')}</div>
      <div class="card">${list.length ? `<div class="stack-gap-12">${list.map(i => {
        const st = invoiceState(i);
        return `<div class="inv-line">
          <div class="nm"><div class="nm-1">${escHtml(i.client || 'Client')} <span class="dim">${escHtml(i.number || '')}</span></div>
            <div class="nm-2">${escHtml(shortDay(i.issueDate))}${i.dueDate ? ` · due ${escHtml(shortDay(i.dueDate))}` : ''}${i.status === 'paid' && i.paidDate ? ` · paid ${escHtml(shortDay(i.paidDate))}` : ''} · ${fmtMoney(+i.net || 0, i.currency || 'EUR')} + ${+i.vatRate || 0}% VAT</div></div>
          <div class="inv-right"><b>${fmtMoney(invoiceGross(i), i.currency || 'EUR')}</b><span class="inv-state ${st}">${INV_LABEL[st]}</span></div>
          <div class="inv-acts">
            ${st === 'draft' ? `<button class="btn small" onclick="setInvoiceStatus('${i.id}','sent')">Mark sent</button>` : ''}
            ${st === 'sent' || st === 'late' ? `<button class="btn small primary" onclick="openInvoicePaid('${i.id}')">Payment received</button>` : ''}
            <button class="dots-btn" aria-label="Edit" onclick="openInvoiceForm('${i.id}')">${ic('edit', 16)}</button>
            <button class="dots-btn" aria-label="Delete" onclick="deleteInvoice('${i.id}')">${ic('trash', 16)}</button>
          </div>
        </div>`; }).join('')}</div>`
        : `<div class="empty-state"><div class="title">${f === 'open' ? 'Nothing waiting to be paid' : 'No invoices yet'}</div><div class="sub">Add the invoices you send: Trackr tracks when they're paid, the VAT on them, and shows the money coming in your Forecast.</div></div>`}</div>`;
  }
  function vatTabHtml() {
    const v = vatSettings(), year = ui.vatYear || appToday().getFullYear(), today = todayYmd();
    const pockets = (data.accounts || []).flatMap(a => (a.pockets || []).map(p => ({ ref: `pk:${a.id}:${p.id}`, label: `${p.icon || ''} ${a.name} › ${p.name}` })));
    const auto = vatPocketRef();
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><button class="icon-btn-round" aria-label="Previous year" onclick="ui.vatYear=${year - 1};render()">‹</button><div style="font-weight:700;min-width:60px;text-align:center;">${year}</div><button class="icon-btn-round" aria-label="Next year" onclick="ui.vatYear=${year + 1};render()">›</button></div>
      <div class="grid-2" style="margin-bottom:16px;">${[1, 2, 3, 4].map(q => {
        const Q = vatQuarter(year, q), future = Q.from > today, days = Math.round((ymdToDate(Q.deadline) - ymdToDate(today)) / 86400000);
        const state = Q.paid ? `<span class="inv-state paid">Paid ${escHtml(shortDay(Q.paid.date))}</span>` : future ? '<span class="inv-state draft">Coming</span>'
          : !(Q.due > 0.005) ? '<span class="inv-state paid">Nothing to pay</span>' : days < 0 ? `<span class="inv-state late">${-days} days late</span>` : `<span class="inv-state sent">${days === 0 ? 'Due today' : `Due in ${days} days`}</span>`;
        return `<div class="card vat-q">
          <div class="row-flex"><b>Q${q} · ${escHtml(shortDay(Q.from))} – ${escHtml(shortDay(Q.to))}</b>${state}</div>
          <div class="vat-line"><span>VAT on invoices</span><span>${fmtMoney(Q.fromInvoices)}</span></div>
          ${v.freelanceIncludesVat ? `<div class="vat-line"><span>VAT in freelance income without an invoice</span><span>${fmtMoney(Q.fromIncome)}</span></div>` : ''}
          <div class="vat-line"><span>VAT on business expenses</span><span>−${fmtMoney(Q.deductible)}</span></div>
          <div class="vat-line total"><span>To pay by ${escHtml(shortDay(Q.deadline))}</span><b>${fmtMoney(Math.max(0, Q.due))}</b></div>
          ${Q.due < -0.005 ? `<div class="dim">${fmtMoney(-Q.due)} to get back.</div>` : ''}
          ${!future && !Q.paid && Q.due > 0.005 ? `<button class="btn small primary" onclick="openVatPaid('${Q.key}')">Mark as paid</button>` : ''}
          ${Q.paid ? `<button class="btn small ghost" onclick="unmarkVatPaid('${Q.key}')">Not paid after all</button>` : ''}
        </div>`; }).join('')}</div>
      <div class="card stack-gap-12">
        <div class="eyebrow">VAT settings</div>
        <label class="field"><span class="label-text">VAT rate on your work (%)</span><input type="number" min="0" max="50" step="0.5" value="${escHtml(String(v.rate))}" onchange="vatSettings().rate=Math.max(0,parseFloat(this.value)||0);save();render()"></label>
        <label class="field"><span class="label-text">VAT pocket</span><select onchange="vatSettings().pocket=this.value;save();render()"><option value="">${auto ? 'Found by its name' : 'None'}</option>${pockets.map(p => `<option value="${escHtml(p.ref)}" ${v.pocket === p.ref ? 'selected' : ''}>${escHtml(p.label)}</option>`).join('')}</select></label>
        <div class="row-flex"><div><div style="font-size:13.5px;">Freelance income without an invoice includes VAT</div><div class="dim">Income in "Freelance" not linked to an invoice: its amount counts as VAT included.</div></div><div class="toggle ${v.freelanceIncludesVat ? 'on' : ''}" role="switch" aria-label="Freelance income includes VAT" onclick="vatSettings().freelanceIncludesVat=!vatSettings().freelanceIncludesVat;save();render()"></div></div>
        <div class="dim">Business expenses: when you add an expense, open "More options" and tick "Business expense". Deadlines follow the Dutch quarterly return (end of the month after the quarter). This is an estimate to plan with, not a tax return.</div>
      </div>`;
  }

  /* ---- Invoice form ---- */
  function nextInvoiceNumber() {
    const y = todayYmd().slice(0, 4);
    const n = invoiceList().map(i => String(i.number || '')).filter(s => s.startsWith(y + '-')).map(s => parseInt(s.slice(5), 10) || 0);
    return `${y}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`;
  }
  window.openInvoiceForm = function (id) {
    const i = id ? invoiceById(id) : null;
    const today = todayYmd();
    ui.modal = { type: 'invoice', payload: i ? Object.assign({}, i) : { client: '', number: nextInvoiceNumber(), issueDate: today, dueDate: fcAddDays(today, 30), net: '', vatRate: vatSettings().rate, currency: 'EUR', status: 'sent', note: '' } };
    render();
  };
  window.__modalRenderers.invoice = function (p) {
    const clients = Array.from(new Set(invoiceList().map(i => i.client).filter(Boolean)));
    const gross = invoiceGross(p);
    return `
      <div class="modal-head"><div class="modal-title">${p.id ? 'Edit invoice' : 'New invoice'}</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="stack-gap-12">
        <label class="field"><span class="label-text">Client</span><input list="inv-clients" value="${escHtml(p.client)}" placeholder="e.g. Studio Noord" oninput="ui.modal.payload.client=this.value"><datalist id="inv-clients">${clients.map(c => `<option value="${escHtml(c)}">`).join('')}</datalist></label>
        <div class="grid-2" style="gap:10px;">
          <label class="field"><span class="label-text">Number</span><input value="${escHtml(p.number || '')}" oninput="ui.modal.payload.number=this.value"></label>
          <label class="field"><span class="label-text">Status</span><select onchange="ui.modal.payload.status=this.value;render()">${[['draft', 'Draft'], ['sent', 'Sent'], ['paid', 'Paid']].map(([k, l]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span class="label-text">Invoice date</span><input type="date" value="${escHtml(p.issueDate || '')}" onchange="ui.modal.payload.issueDate=this.value"></label>
          <label class="field"><span class="label-text">Due date</span><input type="date" value="${escHtml(p.dueDate || '')}" onchange="ui.modal.payload.dueDate=this.value"></label>
          <label class="field"><span class="label-text">Amount before VAT (EUR)</span><input type="number" min="0" step="any" inputmode="decimal" value="${escHtml(String(p.net))}" oninput="ui.modal.payload.net=this.value;document.getElementById('inv-gross').textContent=invoiceGrossText()"></label>
          <label class="field"><span class="label-text">VAT %</span><input type="number" min="0" max="50" step="0.5" value="${escHtml(String(p.vatRate))}" oninput="ui.modal.payload.vatRate=this.value;document.getElementById('inv-gross').textContent=invoiceGrossText()"></label>
        </div>
        <div class="inv-total">Total with VAT: <b id="inv-gross">${gross ? fmtMoney(gross) : '—'}</b></div>
        <label class="field"><span class="label-text">Note <span style="opacity:.6;">(optional)</span></span><input value="${escHtml(p.note || '')}" placeholder="e.g. Website, October" oninput="ui.modal.payload.note=this.value"></label>
      </div>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveInvoice()">Save</button></div>`;
  };
  window.invoiceGrossText = function () { const g = invoiceGross(ui.modal.payload); return g ? fmtMoney(g) : '—'; };
  window.saveInvoice = function () {
    const p = ui.modal && ui.modal.payload; if (!p) return;
    const net = parseFloat(String(p.net).replace(',', '.'));
    if (!String(p.client || '').trim()) { alert('Who is the invoice for?'); return; }
    if (!(net > 0)) { alert('Enter the amount before VAT.'); return; }
    const rec = { id: p.id || uid('inv'), number: String(p.number || '').trim(), client: String(p.client).trim(), issueDate: p.issueDate || todayYmd(), dueDate: p.dueDate || '',
      net: r2v(net), vatRate: Math.max(0, parseFloat(p.vatRate) || 0), currency: 'EUR', status: p.status || 'sent', note: String(p.note || '').trim() };
    const old = p.id ? invoiceById(p.id) : null;
    if (old) { ['paidDate', 'paidTxId'].forEach(k => { if (old[k]) rec[k] = old[k]; }); Object.assign(old, rec); }
    else invoiceList().push(rec);
    if (rec.status === 'paid' && !rec.paidDate) rec.paidDate = todayYmd();
    save(); closeModal();
  };
  window.setInvoiceStatus = function (id, status) { const i = invoiceById(id); if (!i) return; i.status = status; save(); render(); };
  window.deleteInvoice = function (id) {
    const i = invoiceById(id); if (!i) return;
    data.invoices = invoiceList().filter(x => x !== i);
    // The income it created stays (it's real money), just no longer linked.
    (data.budgetTransactions || []).forEach(t => { if (t.invoiceId === id) delete t.invoiceId; });
    save(); render();
  };

  /* ---- Payment received ---- */
  window.openInvoicePaid = function (id) {
    const i = invoiceById(id); if (!i) return;
    const last = (data.budgetTransactions || []).filter(t => t.type === 'income' && t.categoryId === 'inc_freelance' && t.accountId).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    ui.modal = { type: 'invoicePaid', payload: { id, date: todayYmd(), amount: String(invoiceGross(i)), accountId: (last && last.accountId) || ((data.accounts || []).find(a => a.kind !== 'cash') || {}).id || '' } };
    render();
  };
  window.__modalRenderers.invoicePaid = function (p) {
    const i = invoiceById(p.id);
    if (!i) return '<div class="modal-head"><div class="modal-title">Invoice not found</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>';
    return `
      <div class="modal-head"><div class="modal-title">Payment received</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div style="font-size:13px;opacity:.7;margin-bottom:12px;">${escHtml(i.client)} · ${escHtml(i.number || '')} · ${fmtMoney(invoiceGross(i))}</div>
      <div class="stack-gap-12">
        <label class="field"><span class="label-text">Amount received (EUR)</span><input type="number" min="0" step="any" inputmode="decimal" value="${escHtml(p.amount)}" oninput="ui.modal.payload.amount=this.value"></label>
        <label class="field"><span class="label-text">On</span><input type="date" value="${escHtml(p.date)}" onchange="ui.modal.payload.date=this.value"></label>
        <label class="field"><span class="label-text">Into</span><select onchange="ui.modal.payload.accountId=this.value">${(data.accounts || []).map(a => `<option value="${escHtml(a.id)}" ${p.accountId === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select></label>
      </div>
      <div class="dim" style="margin-top:10px;">It's added to Budget as Freelance income, and its balance moves. Then you can split it with your income plan.</div>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="markInvoicePaid()">Save</button></div>`;
  };
  window.markInvoicePaid = function () {
    const p = ui.modal && ui.modal.payload; if (!p) return;
    const i = invoiceById(p.id); if (!i) { closeModal(); return; }
    const amt = parseFloat(String(p.amount).replace(',', '.'));
    if (!(amt > 0)) { alert('Enter the amount you received.'); return; }
    const t = { id: uid('tx'), date: p.date || todayYmd(), type: 'income', categoryId: 'inc_freelance', subCategoryId: null, nature: 'Variable', paymentMethodId: null,
      accountId: p.accountId || null, currency: 'EUR', amount: r2v(amt), comment: i.client, location: '', description: i.number ? `Invoice ${i.number}` : '', logo: (typeof txLogoForName === 'function' && txLogoForName(i.client)) || '', impact: '', invoiceId: i.id };
    data.budgetTransactions.push(t);
    applyTxToAccountBalance(t, 1);
    Object.assign(i, { status: 'paid', paidDate: t.date, paidTxId: t.id });
    save(); closeModal();
    if (typeof incomePlanOffer === 'function') incomePlanOffer(t);
  };

  /* ---- VAT paid ---- */
  window.openVatPaid = function (key) {
    const [y, q] = key.split('-Q').map(Number), Q = vatQuarter(y, q);
    const ref = vatPocketRef();
    ui.modal = { type: 'vatPaid', payload: { key, amount: String(Math.max(0, Q.due)), date: todayYmd(), from: ref || 'acc:' + (((data.accounts || [])[0]) || {}).id } };
    render();
  };
  window.__modalRenderers.vatPaid = function (p) {
    const places = transferEndpointOptions().filter(g => /Bank|Pocket/i.test(g.label)).flatMap(g => g.items);
    return `
      <div class="modal-head"><div class="modal-title">VAT ${escHtml(p.key.replace('-', ' '))} paid</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <div class="stack-gap-12">
        <label class="field"><span class="label-text">Amount paid (EUR)</span><input type="number" min="0" step="any" inputmode="decimal" value="${escHtml(p.amount)}" oninput="ui.modal.payload.amount=this.value"></label>
        <label class="field"><span class="label-text">On</span><input type="date" value="${escHtml(p.date)}" onchange="ui.modal.payload.date=this.value"></label>
        <label class="field"><span class="label-text">Paid from</span><select onchange="ui.modal.payload.from=this.value">${places.map(x => `<option value="${escHtml(x.ref)}" ${p.from === x.ref ? 'selected' : ''}>${escHtml(x.label)}</option>`).join('')}</select></label>
      </div>
      <div class="dim" style="margin-top:10px;">Recorded as an expense in Taxes &amp; Fees › VAT${/^pk:/.test(p.from) ? ', paid out of the pocket' : ''}.</div>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="markVatPaid()">Save</button></div>`;
  };
  function vatSubcategory() {
    const cat = categoryById('expense', 'exp_fees');
    if (!cat) return null;
    cat.subcategories = cat.subcategories || [];
    let s = cat.subcategories.find(x => /^(vat|btw)$/i.test(x.name));
    if (!s) { s = { id: 'sc_vat', name: 'VAT', icon: '🧾' }; cat.subcategories.push(s); }
    return s.id;
  }
  window.markVatPaid = function () {
    const p = ui.modal && ui.modal.payload; if (!p) return;
    const amt = r2v(parseFloat(String(p.amount).replace(',', '.')));
    if (!(amt > 0)) { alert('Enter the amount paid.'); return; }
    const src = parseTransferRef(p.from) || {};
    const accId = src.accountId; if (!accId || !accountById(accId)) { alert('Pick where it was paid from.'); return; }
    const txIds = [];
    if (src.kind === 'pk') {
      const ep = transferEndpoint(p.from);
      if (ep && ep.get() + 0.005 < amt) { alert(`${ep.label} only holds ${fmtMoney(ep.get(), ep.ccy)}.`); return; }
      const tr = { id: uid('tx'), date: p.date, type: 'transfer', categoryId: null, subCategoryId: null, nature: 'Variable', paymentMethodId: null, accountId: null, currency: 'EUR', amount: amt,
        comment: `VAT ${p.key.replace('-', ' ')}`, location: '', description: '', logo: '', impact: '', from: p.from, to: 'acc:' + accId, fromLabel: ep.label, toLabel: accountById(accId).name };
      data.budgetTransactions.push(tr); applyTxToAccountBalance(tr, 1); txIds.push(tr.id);
    }
    const ex = { id: uid('tx'), date: p.date, type: 'expense', categoryId: 'exp_fees', subCategoryId: vatSubcategory(), nature: 'Variable', paymentMethodId: null, accountId: accId, currency: 'EUR', amount: amt,
      comment: `VAT ${p.key.replace('-', ' ')}`, location: '', description: 'VAT return', logo: '', impact: '', reviewed: true };
    data.budgetTransactions.push(ex); applyTxToAccountBalance(ex, 1); txIds.push(ex.id);
    vatSettings().paid[p.key] = { date: p.date, amount: amt, txIds };
    save(); closeModal();
  };
  /* Undoes "Mark as paid": the payment it recorded goes too. */
  window.unmarkVatPaid = function (key) {
    const rec = vatSettings().paid[key]; if (!rec) return;
    (rec.txIds || []).forEach(id => { const t = data.budgetTransactions.find(x => x.id === id); if (t) { applyTxToAccountBalance(t, -1); data.budgetTransactions = data.budgetTransactions.filter(x => x !== t); } });
    delete vatSettings().paid[key];
    save(); render();
  };
}
