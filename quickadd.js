/* ===================== Quick-add link (Apple Pay / Shortcuts) =====================
 * Its own file, loaded after app.js and rules.js. Opening Trackr with
 *
 *   …/Trackr/#add=expense&amount=12.50&merchant=Albert%20Heijn&card=ING
 *
 * opens "Add transaction" already filled in: amount, name, today's date, and — through your rules
 * and the categories Trackr learned — the category. It NEVER saves by itself: you check it and
 * press Save. The link is then removed from the address bar so a reload doesn't open it again.
 *
 * Use the part after "#" (the fragment): browsers don't send it to the server, so the amount and
 * the shop stay on your phone. "?add=…" works too, for links made before. See
 * docs/apple-pay-shortcut.md for the Shortcuts automation that builds this link on each payment.
 *
 * Parameters: add=expense|income · amount (12.50, 12,50, "€12.50", "12.50 EUR") · merchant ·
 * currency (EUR/USD/GBP/CHF) · card (written in the note) · date (YYYY-MM-DD, default today).
 */
function quickAddParse(href) {
  let u;
  try { u = new URL(href); } catch (e) { return null; }
  const raw = u.hash && u.hash.length > 1 && /(^|[#&])add=/.test(u.hash) ? u.hash.slice(1) : (u.searchParams.has('add') ? u.search.slice(1) : '');
  if (!raw) return null;
  const q = new URLSearchParams(raw);
  const type = /^inc/i.test(q.get('add') || '') ? 'income' : 'expense';
  const amtRaw = String(q.get('amount') || '').replace(/[^\d.,-]/g, '');
  let amount = '';
  if (amtRaw) {
    const s = amtRaw.includes(',') && !amtRaw.includes('.') ? amtRaw.replace(',', '.') : amtRaw.replace(/,(?=\d{3}\b)/g, '');
    const n = Math.abs(parseFloat(s));
    if (isFinite(n) && n > 0) amount = String(Math.round(n * 100) / 100);
  }
  const ccy = String(q.get('currency') || '').toUpperCase();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : '';
  return { type, amount, merchant: String(q.get('merchant') || '').trim().slice(0, 80), currency: ccy, card: String(q.get('card') || '').trim().slice(0, 40), date };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { quickAddParse };

if (typeof window !== 'undefined') {
  window.handleQuickAddLink = function () {
    const q = quickAddParse(location.href);
    if (!q || !data) return false;
    // Remove it from the address bar first: reloading must never open it twice.
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    openTxForm();
    const p = ui.modal.payload;
    Object.assign(p, {
      type: q.type, amount: q.amount, comment: q.merchant, date: q.date || todayYmd(),
      currency: (typeof CURRENCIES !== 'undefined' && CURRENCIES.includes(q.currency)) ? q.currency : p.currency,
      description: q.card ? `Apple Pay · ${q.card}` : 'Apple Pay',
      paymentMethodId: (data.paymentMethods.find(m => /card|carte|kaart/i.test(m.name)) || {}).id || p.paymentMethodId,
    });
    p._quickAdd = true;
    // With an amount and a name: fill the category from your rules / learned names and show the
    // last step (Save is right there). Otherwise stay on step 1 so you can complete it.
    if (p.amount && p.comment && typeof txNext === 'function') txNext(); else render();
    return true;
  };
  window.addEventListener('hashchange', () => { if (/(^|[#&])add=/.test(location.hash)) handleQuickAddLink(); });
}
