/* ===================== Scan a receipt =====================
 * Its own file, loaded after sage.js and receipts.js. Add → "Scan a receipt": take a photo of a
 * receipt (or pick one); Claude reads it (with Sage's key: Sage → Setup) and the expense form
 * opens filled in: the shop, the date, the total and its currency, the category it fits best
 * among yours, and the photo attached as the receipt. Nothing is saved until you check it and
 * press Save. Only the photo and your category names are sent, when you scan.
 *
 * snapSchema() and snapClean() are pure (Node-tested).
 */
/* The answer's shape: the category is one of yours (or empty). */
function snapSchema(categoryIds) {
  return {
    type: 'object',
    properties: {
      is_receipt: { type: 'boolean', description: 'false if the picture is not a receipt or invoice' },
      merchant: { type: 'string', description: 'Shop or company name, short and capitalised normally' },
      date: { type: 'string', description: 'Purchase date as YYYY-MM-DD, or empty if not printed' },
      total: { type: 'number', description: 'The total paid, tax included' },
      currency: { type: 'string', description: 'ISO code such as EUR, USD, GBP' },
      category_id: { type: 'string', enum: [''].concat(categoryIds || []) },
      subcategory_id: { type: 'string', description: 'One of the sub-category ids of that category, or empty' },
      items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, amount: { type: 'number' } }, required: ['name', 'amount'], additionalProperties: false } },
    },
    required: ['is_receipt', 'merchant', 'date', 'total', 'currency', 'category_id', 'subcategory_id', 'items'],
    additionalProperties: false,
  };
}
/* Claude's JSON → a safe prefill for the expense form (or { error }). */
function snapClean(raw, cats, today) {
  let o;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return { error: "The answer couldn't be read." }; }
  if (!o || o.is_receipt === false) return { error: "That doesn't look like a receipt. Try a sharper photo of the whole receipt." };
  const total = Math.round((+o.total || 0) * 100) / 100;
  if (!(total > 0)) return { error: "No total found on it. Try a sharper photo of the whole receipt." };
  const cat = (cats || []).find(c => c.id === o.category_id);
  const sub = cat && (cat.subcategories || []).find(s => s.id === o.subcategory_id);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') && o.date <= today && o.date >= '2000-01-01' ? o.date : today;
  const currency = /^[A-Z]{3}$/.test(String(o.currency || '').toUpperCase()) ? String(o.currency).toUpperCase() : null;
  const items = (Array.isArray(o.items) ? o.items : []).filter(i => i && i.name).slice(0, 30);
  return {
    type: 'expense', amount: String(total), currency, date, comment: String(o.merchant || '').trim().slice(0, 80),
    categoryId: cat ? cat.id : '', subCategoryId: sub ? sub.id : '',
    description: items.length ? items.map(i => `${String(i.name).trim()} ${(+i.amount || 0).toFixed(2)}`).join(', ').slice(0, 500) : '',
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { snapSchema, snapClean };
} else {
  window.openSnap = function () { ui.modal = { type: 'snap', payload: { state: 'pick' } }; render(); };
  window.__modalRenderers.snap = function (p) {
    const hasKey = (() => { try { return !!JSON.parse(localStorage.getItem('trackr-sage') || '{}').apiKey; } catch (e) { return false; } })();
    return `
      <div class="modal-head"><div class="modal-title">Scan a receipt</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      ${!hasKey ? `<p class="dim" style="font-size:13px;margin:0 0 14px;">Claude reads the receipt for you, with your Claude API key. Set it up once in Sage (the round face in the corner).</p>
        <div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="closeModal();sageOpenSetup()">Set up Sage</button></div>`
      : p.state === 'reading' ? `<div class="sn-reading">${p.preview ? `<img src="${p.preview}" alt="The receipt">` : ''}<div class="sn-scan"></div></div><p class="dim" style="text-align:center;font-size:13px;">Reading the receipt…</p>`
      : `<p class="dim" style="font-size:13px;margin:0 0 14px;">Take a photo of the whole receipt, flat and sharp. The expense form opens filled in, for you to check. The photo is sent to Claude to read it, and kept as the receipt.</p>
        ${p.error ? `<div class="sn-error">${escHtml(p.error)}</div>` : ''}
        <label class="btn primary full sn-pick">${ic('photo', 18)} Take or pick a photo<input type="file" accept="image/*" capture="environment" onchange="snapRead(this.files[0])"></label>`}`;
  };
  window.snapRead = async function (file) {
    if (!file) return;
    let preview = null;
    try { preview = (await resizePhoto(file)).data; } catch (e) { ui.modal.payload = { state: 'pick', error: e.message || String(e) }; render(); return; }
    ui.modal.payload = { state: 'reading', preview };
    render();
    try {
      const c = await sageClaude();
      if (!c) throw new Error('Set up Sage first (your Claude API key).');
      const cats = data.categories.expense || [];
      const catList = cats.map(x => `${x.id}: ${x.name}${(x.subcategories || []).length ? ` (sub-categories: ${x.subcategories.map(s => `${s.id}: ${s.name}`).join(', ')})` : ''}`).join('\n');
      const params = {
        model: c.model, max_tokens: 4000, output_config: { effort: 'low', format: { type: 'json_schema', schema: snapSchema(cats.map(x => x.id)) } },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: preview.split(',')[1] } },
          { type: 'text', text: `Read this receipt for a personal budget app. Today is ${todayYmd()}. Give the shop, the purchase date, the total paid and its currency, the main items, and the best matching category and sub-category from this list (ids before the colon; leave empty if none fits):\n${catList}` },
        ] }],
      };
      if (c.fallbacks) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
      const msg = await c.client.beta.messages.create(params);
      if (msg.stop_reason === 'refusal') throw new Error("Claude couldn't read this one.");
      const text = (msg.content.find(b => b.type === 'text') || {}).text || '';
      const r = snapClean(text, cats, todayYmd());
      if (r.error) throw new Error(r.error);
      if (!r.currency || !(typeof CURRENCY_SYMBOL !== 'undefined' && CURRENCY_SYMBOL[r.currency])) { if (r.currency && r.currency !== data.settings.defaultCurrency) r.description = `Paid in ${r.currency}. ${r.description}`.trim(); r.currency = data.settings.defaultCurrency; }
      const receipts = typeof addReceiptFiles === 'function' ? await addReceiptFiles([file]) : [];
      if (!ui.modal || ui.modal.type !== 'snap') return; // closed meanwhile
      openTxForm(null, Object.assign(r, receipts.length ? { receipts } : {}));
      if (typeof safetyToast === 'function') safetyToast('<span>Filled in from the receipt: check it, then save.</span>', { ms: 4000 });
    } catch (e) {
      const A = window.Anthropic;
      const why = A && e instanceof A.AuthenticationError ? 'Your Claude API key was refused. Check it in Sage → Setup.'
        : A && e instanceof A.APIConnectionError ? 'No connection to Claude. Are you online?'
        : A && e instanceof A.RateLimitError ? 'Claude is busy. Try again in a moment.'
        : A && e instanceof A.APIError ? `Claude returned an error (${e.status || '?'}).` : (e && e.message) || 'Something went wrong.';
      if (ui.modal && ui.modal.type === 'snap') { ui.modal.payload = { state: 'pick', error: why }; render(); }
    }
  };
  window.__addMenu.unshift({ label: 'Scan a receipt', sub: 'Claude fills in the expense', icon: 'photo', go: 'openSnap()' });
  window.__palette.push(add => add('Add', 'Scan a receipt', 'Claude fills in the expense', () => openSnap(), 'photo'));
}
