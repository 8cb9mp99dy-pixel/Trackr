/* ===================== Apple Pay → Inbox =====================
 * Its own file, loaded before inbox.js. Asked for by the user on 4 Nov 2026.
 *
 * Each time you pay with Apple Pay, an iPhone Shortcut (Wallet "Transaction" automation, runs
 * silently) sends the payment as Wallet shows it to Supabase:
 *   POST …/rest/v1/rpc/add_inbox_item { p_token, p_item: { amount_raw: '€12,50', merchant, card, occurred_at } }
 * (the SQL is in supabase/migrations/003_trackr_inbox.sql, the guide in docs/apple-pay-shortcut.md).
 * It waits in Money → Inbox like what Claude sends (channel 'applepay', source 'Apple Pay'), and
 * nothing is in Trackr until you add it.
 *
 * The token is its own (channel 'applepay' in trackr_inbox_keys, hash only), made here and shown
 * once: it can add payments and nothing else. Your sync secret never goes in the Shortcut.
 * Trackr reads the amount itself (walletAmount: iOS writes it the way your region does), cleans
 * the shop's name (walletMerchant), finds the account from the card (data.settings.walletCards:
 * [{ name: 'Wallet card name', ref: 'acc:ID' | 'pk:ACC:POCKET' }]) and guesses a category from
 * your rules, the names you've used before, then a few keywords (walletGuessCategory).
 * A negative amount is a refund: added as money in, to check (the user's choice).
 *
 * walletAmount(), walletMerchant(), walletGuessCategory() and walletItem() are pure (Node-tested).
 */
const WALLET_CODES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'INR', 'CNY', 'HKD', 'SGD', 'THB', 'MXN', 'BRL', 'ZAR', 'AED', 'ILS', 'KRW', 'ISK'];
// Longest first: "US$" before "$".
const WALLET_SYMBOLS = [['US$', 'USD'], ['CA$', 'CAD'], ['C$', 'CAD'], ['A$', 'AUD'], ['NZ$', 'NZD'], ['HK$', 'HKD'], ['S$', 'SGD'], ['R$', 'BRL'], ['zł', 'PLN'], ['Kč', 'CZK'], ['Ft', 'HUF'], ['€', 'EUR'], ['£', 'GBP'], ['$', 'USD'], ['¥', 'JPY'], ['₹', 'INR'], ['₺', 'TRY'], ['₩', 'KRW'], ['₪', 'ILS'], ['฿', 'THB'], ['Fr.', 'CHF']];

/* "€12,50", "12,50 €", "€1.234,56", "$4.99", "-€3,00", "1 234,56 kr" → { amount, currency, refund,
   unknownCurrency } with a positive amount, or null when there's no number in it.
   currency is '' when nothing says which: the caller uses your default currency. */
function walletAmount(raw) {
  const s = String(raw == null ? '' : raw).normalize('NFKC').trim();
  if (!s || s.length > 40) return null;
  const up = s.toUpperCase();
  let currency = (up.match(/(?:^|[^A-Z])([A-Z]{3})(?![A-Z])/g) || []).map(m => m.replace(/[^A-Z]/g, '')).find(c => WALLET_CODES.includes(c)) || '';
  if (!currency) { const hit = WALLET_SYMBOLS.find(([sym]) => s.includes(sym)); if (hit) currency = hit[1]; }
  // Spaces and apostrophes group thousands (1 234,56 · 1'234.56).
  const core = s.replace(/[\s'’]/g, '').replace(/[^\d.,\-−–()]/g, '');
  const refund = /^[-−–(]/.test(core) || /[-−–)]$/.test(core);
  const d = core.replace(/[^\d.,]/g, '');
  if (!/\d/.test(d)) return null;
  const lastDot = d.lastIndexOf('.'), lastComma = d.lastIndexOf(',');
  let dec = '';
  if (lastDot >= 0 && lastComma >= 0) dec = lastDot > lastComma ? '.' : ',';
  else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',', parts = d.split(sep);
    // One separator: decimals, unless exactly three digits follow it (1.234 / 1,234 = a thousand).
    dec = parts.length === 2 && (parts[1].length !== 3 || /^0*$/.test(parts[0])) ? sep : '';
  }
  const plain = dec ? d.split(dec).map((p, i, a) => (i === a.length - 1 ? p : p.replace(/[.,]/g, ''))).join('.') : d.replace(/[.,]/g, '');
  if (!/^\d+(\.\d+)?$/.test(plain)) return null;
  const n = Math.round(parseFloat(plain) * 100) / 100;
  if (!(n > 0)) return null;
  const unknownCurrency = !currency && /[^\d\s.,'’\-−–()+]/.test(s);
  return { amount: n, currency, refund, unknownCurrency };
}

const walletKey = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Payment processors iOS sometimes shows instead of the shop: "SumUp *Bakker Bart", "Zettle_Café".
const WALLET_PREFIX = /^(?:sumup|sum ?up|sq|square|zettle|izettle|izp|iz|paypal|pp|sp|tst|ccv|mollie|stripe|adyen|myp|wpy|ptp|gpay|google|pay\.nl|payvision|worldline|ingenico)\s*[*_:]+\s*/i;
const WALLET_CITIES = ['amsterdam', 'rotterdam', 'den haag', 's gravenhage', 'the hague', 'utrecht', 'eindhoven', 'maastricht', 'heerlen', 'sittard', 'geleen', 'kerkrade', 'venlo', 'roermond', 'weert', 'valkenburg', 'nijmegen', 'arnhem', 'groningen', 'leiden', 'haarlem', 'tilburg', 'breda', 'delft', 'zwolle', 'almere', 'amersfoort', 'den bosch', 's hertogenbosch', 'schiphol', 'aachen', 'koln', 'cologne', 'dusseldorf', 'berlin', 'munchen', 'munich', 'hamburg', 'frankfurt', 'brussel', 'brussels', 'bruxelles', 'antwerpen', 'antwerp', 'liege', 'luik', 'gent', 'hasselt', 'genk', 'paris', 'lyon', 'lille', 'london', 'luxembourg', 'madrid', 'barcelona', 'lisboa', 'lisbon', 'roma', 'rome', 'milano', 'milan', 'wien', 'vienna', 'zurich', 'geneve', 'geneva'];
const WALLET_COUNTRIES = ['nl', 'nld', 'de', 'deu', 'be', 'bel', 'fr', 'fra', 'lu', 'lux', 'es', 'esp', 'it', 'ita', 'gb', 'gbr', 'uk', 'us', 'usa', 'at', 'aut', 'ch', 'che', 'pt', 'prt', 'ie', 'irl'];

const WALLET_CAPS = ['AH', 'NS', 'OV', 'DA', 'DM', 'BP', 'GVB', 'RET', 'HTM', 'KLM', 'IKEA', 'HEMA', 'ANWB', 'C&A', 'H&M'];
/* A shop's name as Wallet or the card terminal wrote it → the name you'd type. */
function walletMerchant(raw) {
  const orig = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, 120);
  let s = orig;
  for (let i = 0; i < 3 && WALLET_PREFIX.test(s); i++) s = s.replace(WALLET_PREFIX, '');
  s = s.replace(/[*_]+/g, ' ').replace(/\s+/g, ' ').trim();
  let words = s.split(' ');
  // A store number or a reference ends the name: "Albert Heijn 1234 Maastricht", "Shell #0042".
  const cut = words.findIndex((w, i) => i > 0 && (/^#?\d{2,}$/.test(w) || /\d{3,}/.test(w) || /^(?:nr|no|store|filiaal|fil|kassa)\.?$/i.test(w)));
  if (cut > 0) words = words.slice(0, cut);
  const tail = n => walletKey(words.slice(-n).join(' '));
  for (let again = true; again && words.length > 1;) {
    again = false;
    if (WALLET_COUNTRIES.includes(tail(1))) { words.pop(); again = true; continue; }
    const city = [3, 2, 1].find(n => words.length > n && WALLET_CITIES.includes(tail(n)));
    if (city) { words = words.slice(0, -city); again = true; }
  }
  s = words.join(' ').replace(/[\s,.\-–:;/]+$/, '').trim();
  if (!s) return orig;
  // ALL CAPS → Title Case; short words without a vowel, and a few known ones, stay (AH, NS, KFC, H&M).
  if (/\p{L}/u.test(s) && s === s.toUpperCase()) {
    s = s.split(' ').map(w => (WALLET_CAPS.includes(w) || (w.length <= 3 && !/[AEIOUY]/i.test(w)) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');
  }
  return s;
}

// What a shop's name says about the category: names your categories may have, most precise first.
const WALLET_KEYWORDS = [
  { re: /albert heijn|^ah\b|\bah to go\b|jumbo|lidl|aldi|\bplus\b|dirk|\bcoop\b|\bspar\b|picnic|carrefour|delhaize|colruyt|rewe|edeka|kaufland|penny|netto|ekoplaza|vomar|hoogvliet|deen|supermar|marqt|crisp|flink|getir|intermarche|leclerc|auchan|monoprix|tesco|sainsbury/i, cats: ['groceries', 'grocery', 'supermarket', 'supermarkets', 'boodschappen', 'courses'] },
  { re: /bakker|bakery|boulangerie|b[aä]ckerei/i, cats: ['bakery', 'bakeries'] },
  { re: /thuisbezorgd|uber ?eats|deliveroo|just ?eat|wolt\b/i, cats: ['takeaway', 'delivery', 'restaurants', 'eating out'] },
  { re: /starbucks|coffee|koffie|espresso|caf[eé]\b/i, cats: ['cafes', 'cafe', 'coffee', 'restaurants', 'eating out'] },
  { re: /mcdonald|burger king|\bkfc\b|subway|domino|new york pizza|five guys|febo|fast ?food/i, cats: ['fast food', 'takeaway', 'restaurants', 'eating out'] },
  { re: /\bbar\b|bistro|brasserie|restaurant|eetcaf|pizz|sushi|kebab|snackbar|friet|lunchroom|trattoria|grill/i, cats: ['restaurants', 'restaurant', 'eating out', 'dining out', 'dining', 'food and drink'] },
  { re: /netflix|spotify|disney|videoland|hbo|youtube|apple\.com\/bill|icloud/i, cats: ['subscriptions', 'streaming', 'entertainment'] },
  { re: /^ns\b|\bns (?:reizigers|international)|ov.?chip|arriva|connexxion|\bqbuzz|\bret\b|\bgvb\b|\bhtm\b|db bahn|deutsche bahn|sncb|nmbs|\bsncf\b|eurostar|\buber\b|\bbolt\b|\btaxi|swapfiets|\bovfiets/i, cats: ['transport', 'public transport', 'travel', 'commute'] },
  { re: /\bshell\b|\besso\b|\bbp\b|totalenergies|\btotal\b|tango|tinq|\bq8\b|texaco|\baral\b|avia|tankstation|fuel|parkeer|parking|q-park|easypark|parkmobile/i, cats: ['fuel', 'petrol', 'parking', 'car', 'transport'] },
  { re: /kruidvat|\betos\b|trekpleister|holland ?& ?barrett|apotheek|pharma|apotheke|\bdm\b|rossmann|\bda drogist/i, cats: ['pharmacy', 'drugstore', 'personal care', 'health'] },
  { re: /\bhema\b|\baction\b|zara|h ?& ?m|primark|uniqlo|c ?& ?a|we fashion|zeeman|bol\.?com|amazon|coolblue|mediamarkt|media markt|decathlon|blokker|xenos|ikea|gamma|praxis|karwei|hornbach|bijenkorf|apple store|fnac/i, cats: ['shopping', 'household'] },
  { re: /path[eé]|kinepolis|vue\b|cinema|bioscoop|steam|playstation|nintendo|theater|theatre|museum|concert|ticketmaster/i, cats: ['entertainment', 'leisure', 'going out', 'movies', 'cinema', 'concerts', 'games', 'museums culture', 'theatre shows'] },
  { re: /basic-?fit|fitness|\bgym\b|sportcity|anytime fitness|trainmore/i, cats: ['gym membership', 'fitness', 'sport', 'sports', 'health'] },
];
/* A category from the shop's name alone: { categoryId, subCategoryId } or null.
   cats: your expense categories [{ id, name, subcategories: [{ id, name }] }]. */
function walletGuessCategory(name, cats) {
  const n = String(name || '');
  if (!n) return null;
  const list = cats || [];
  for (const k of WALLET_KEYWORDS.filter(x => x.re.test(n))) {
    for (const want of k.cats) {
      // The whole name, or one of its words ("Food & Groceries" has "groceries"): never part of a word.
      const has = x => { const w = walletKey(x.name); return w === want || (' ' + w + ' ').includes(' ' + want + ' '); };
      // A category named for it (Shopping), with its best sub-category; else a sub-category anywhere (Fuel).
      const cat = list.find(has);
      if (cat) {
        const subs = cat.subcategories || [], sub = k.cats.map(w => subs.find(x => { const n = walletKey(x.name); return n === w || (w !== want && (' ' + n + ' ').includes(' ' + w + ' ')); })).find(Boolean);
        return { categoryId: cat.id, subCategoryId: sub ? sub.id : '' };
      }
      for (const c of list) {
        const sub = (c.subcategories || []).find(has);
        if (sub) return { categoryId: c.id, subCategoryId: sub.id };
      }
    }
  }
  return null;
}

/* One payment from the Shortcut → an inbox item Trackr understands (for inboxNormalize), and what
   to check. opts: { cards: [{ name, ref }], accounts: [{ id, pockets: [{ id }] }], paymentMethodId }
   → { item, problems: [{ text, block }], card, time, merchant (as sent), linked } */
function walletItem(raw, opts) {
  const it = raw && typeof raw === 'object' ? raw : {}, o = opts || {}, problems = [];
  const amountRaw = String(it.amount_raw == null ? '' : it.amount_raw).trim();
  const amt = walletAmount(amountRaw);
  const name = walletMerchant(it.merchant);
  const occ = String(it.occurred_at || '');
  const card = String(it.card || '').replace(/\s+/g, ' ').trim();
  const item = { type: amt && amt.refund ? 'income' : 'expense', name };
  if (/^\d{4}-\d{2}-\d{2}/.test(occ)) item.date = occ.slice(0, 10);
  if (amt) { item.amount = amt.amount; if (amt.currency) item.currency = amt.currency; }
  else problems.push({ text: `Couldn't read the amount "${amountRaw.slice(0, 40)}": type it in.`, block: true });
  if (amt && amt.refund) problems.push({ text: 'A negative amount: added as a refund (money in). Check it.', block: false });
  if (amt && amt.unknownCurrency) problems.push({ text: `Currency not recognised in "${amountRaw}": check it.`, block: false });
  if (!name) problems.push({ text: 'No shop name.', block: false });
  const link = card ? (o.cards || []).find(c => c && c.ref && walletKey(c.name) === walletKey(card)) : null;
  const [kind, accId, pkId] = link ? String(link.ref).split(':') : [];
  const acc = accId && (o.accounts || []).find(a => a.id === accId);
  const pocketOk = kind !== 'pk' || (acc && (acc.pockets || []).some(p => p.id === pkId));
  if (acc && pocketOk && (kind === 'acc' || kind === 'pk')) { item.account_id = accId; if (kind === 'pk') item.pocket_id = pkId; }
  else problems.push({ text: card ? `The card "${card}" isn't linked to an account yet: Settings → Apple Pay.` : 'No card name: which account?', block: true });
  if (o.paymentMethodId) item.payment_method_id = o.paymentMethodId;
  return { item, problems, card, time: (/T(\d{2}:\d{2})/.exec(occ) || [])[1] || '', merchant: String(it.merchant || ''), linked: !!item.account_id };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { walletAmount, walletMerchant, walletGuessCategory, walletItem, walletKey };
} else {
  const cfg = () => (typeof loadSupabaseSyncConfig === 'function' ? loadSupabaseSyncConfig() : null);
  const q = s => escHtml(String(s)).replace(/'/g, '&#39;');
  const cards = () => (Array.isArray(data.settings.walletCards) ? data.settings.walletCards : (data.settings.walletCards = []));
  const GUIDE = 'https://github.com/8cb9mp99dy-pixel/Trackr/blob/main/docs/apple-pay-shortcut.md';

  /* What inbox.js needs to read a payment. */
  window.walletOpts = () => ({
    cards: cards(),
    accounts: (data.accounts || []).map(a => ({ id: a.id, pockets: (a.pockets || []).map(p => ({ id: p.id })) })),
    paymentMethodId: ((data.paymentMethods || []).find(m => /apple ?pay/i.test(m.name)) || (data.paymentMethods || []).find(m => /card|kaart|carte/i.test(m.name)) || {}).id || '',
  });
  /* Where a card's payments go: accounts, then their pockets (finished ones only if already linked). */
  function placeOptions(cur) {
    const opts = ['<option value="">Pick an account…</option>'];
    (data.accounts || []).filter(a => a.kind !== 'cash' || cur === 'acc:' + a.id).forEach(a => {
      opts.push(`<option value="acc:${escHtml(a.id)}" ${cur === 'acc:' + a.id ? 'selected' : ''}>${escHtml(a.name)}${(a.pockets || []).length ? ` · ${escHtml(mainBalanceName(a))}` : ''}</option>`);
      (a.pockets || []).filter(p => !p.finishedAt || cur === `pk:${a.id}:${p.id}`).forEach(p => {
        const ref = `pk:${a.id}:${p.id}`;
        opts.push(`<option value="${escHtml(ref)}" ${cur === ref ? 'selected' : ''}>${escHtml(a.name)} · ${escHtml(p.name)}</option>`);
      });
    });
    return opts.join('');
  }
  window.walletCardSet = function (i, field, value) {
    const list = cards();
    if (!list[i]) return;
    list[i][field] = String(value || '').trim().slice(0, 80);
    save(); render();
  };
  window.walletCardAdd = function (name) {
    cards().push({ name: String(name || '').slice(0, 80), ref: '' });
    save(); render();
  };
  window.walletCardRemove = function (i) { cards().splice(i, 1); save(); render(); };

  window.applePaySettingsHtml = function () {
    const c = cfg();
    if (!c || !c.secret) return '<div class="ib-note">Payments go through your Supabase project, so turn on <b>Supabase Sync</b> first (above).</div>';
    const on = !!(data.settings.inboxChannels || {}).applepay;
    const list = cards(), known = new Set(list.map(x => walletKey(x.name)));
    const seen = (typeof inboxWalletCards === 'function' ? inboxWalletCards() : []).filter(n => !known.has(walletKey(n)));
    const copy = (label, what) => `<button class="btn small" onclick="applePayCopy('${what}')">${ic('copy', 14)} ${label}</button>`;
    return `
      <div class="ib-note">Each time you pay with Apple Pay, a Shortcut on your iPhone sends the payment to your Supabase, silently. It waits in <b>Money → Inbox</b> until you add it. The Shortcut gets its own token: it can add payments, nothing else. It can't read your data.</div>
      <div class="ib-step"><b>1. The SQL</b> <span class="dim">(once, and after an update)</span>
        <div class="dim" style="font-size:12px;">Copy it, then Supabase → SQL editor → New query → paste → Run. It's the same SQL as the Claude inbox, safe to run again: your data isn't touched.</div>
        <div class="ib-row">${copy('Copy the SQL', 'sql')}</div>
      </div>
      <div class="ib-step"><div class="row-flex"><b>2. The token</b><span class="dim" style="font-size:12px;">${on ? `on since ${escHtml(shortDay(data.settings.inboxChannels.applepay))}` : 'off'}</span></div>
        <div class="ib-row">${on ? `<button class="btn small" onclick="applePayMakeToken()">New token</button><button class="btn small ghost" onclick="applePayTurnOff()">Turn off</button>`
          : '<button class="btn small primary" onclick="applePayMakeToken()">Make the token</button>'}</div>
        <div class="dim" style="font-size:12px;">It's shown once, to paste in the Shortcut. A new token stops the old one: paste the new one in the Shortcut.</div>
      </div>
      <div class="ib-step"><b>3. The Shortcut</b>
        <div class="ib-row">${copy('Copy the URL', 'url')}${copy('Copy the anon key', 'anon')}<a class="btn small" href="${GUIDE}" target="_blank" rel="noopener">The guide ${ic('chevronRight', 14)}</a></div>
        <div class="dim" style="font-size:12px;">Shortcuts → Automation → Transaction, then follow the guide step by step.</div>
      </div>
      <div class="ib-step"><b>4. Your cards</b>
        <div class="dim" style="font-size:12px;">The card's name as Wallet shows it, and where its payments go. An unknown card waits in To check.</div>
        ${list.length ? `<div class="ap-cards">${list.map((x, i) => `<div class="ap-card">
          <input aria-label="Wallet card name" placeholder="e.g. Revolut" value="${escHtml(x.name || '')}" onchange="walletCardSet(${i},'name',this.value)">
          <select aria-label="Account for ${escHtml(x.name || 'this card')}" onchange="walletCardSet(${i},'ref',this.value)">${placeOptions(x.ref || '')}</select>
          <button class="icon-btn-round" aria-label="Remove ${escHtml(x.name || 'this card')}" onclick="walletCardRemove(${i})">${ic('trash', 15)}</button>
        </div>`).join('')}</div>` : ''}
        <div class="ib-row">${seen.map(n => `<button class="btn small" onclick="walletCardAdd('${q(n)}')">${ic('plus', 14)} ${escHtml(n)}</button>`).join('')}<button class="btn small ghost" onclick="walletCardAdd('')">${ic('plus', 14)} Add a card</button></div>
        ${seen.length ? '<div class="dim" style="font-size:12px;">Cards seen in the inbox, not linked yet.</div>' : ''}
      </div>`;
  };
  window.applePayCopy = async function (what) {
    const c = cfg() || {};
    const text = what === 'sql' ? (typeof INBOX_SQL_TEXT !== 'undefined' ? INBOX_SQL_TEXT : '')
      : what === 'anon' ? c.anonKey || '' : `${String(c.url || '').replace(/\/+$/, '')}/rest/v1/rpc/add_inbox_item`;
    try { await navigator.clipboard.writeText(text); if (typeof fxSuccess === 'function') fxSuccess('Copied'); } catch (e) { prompt('Copy this:', text); }
  };
  async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  window.applePayMakeToken = async function () {
    const c = cfg(); if (!c || !c.secret) return;
    const on = !!(data.settings.inboxChannels || {}).applepay;
    if (on && !confirm('Make a new token? The Shortcut stops working until you paste the new one in it.')) return;
    const b = crypto.getRandomValues(new Uint8Array(24));
    const token = 'trk_pay_' + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    try { await supabaseRpc('inbox_set_key', { secret: c.secret, channel: 'applepay', key_hash: await sha256Hex(token) }); }
    catch (e) { alert(/bad key|inbox_set_key|does not exist|schema cache/i.test((e && e.message) || '') || (e && e.status === 404) ? 'Run the SQL in Supabase first (step 1), then try again.' : (e && e.message) || String(e)); return; }
    data.settings.inboxChannels = Object.assign({}, data.settings.inboxChannels, { applepay: todayYmd() });
    save();
    // Only in this window: Trackr doesn't keep it anywhere.
    ui.modal = { type: 'applePayToken', payload: { token } };
    render();
  };
  window.__modalRenderers.applePayToken = function (p) {
    return `
      <div class="modal-head"><div class="modal-title">Your Apple Pay token</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <p class="dim" style="font-size:13px;margin:0 0 12px;">Paste it in the Shortcut now, in the <b>p_token</b> field. It's shown only this once: Trackr and Supabase don't keep it (Supabase keeps a fingerprint to check it).</p>
      <label class="field"><span class="label-text">Token</span><input id="ap-token" readonly value="${escHtml(p.token)}" onfocus="this.select()"></label>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Done</button><button class="btn primary" onclick="applePayCopyToken()">${ic('copy', 15)} Copy</button></div>`;
  };
  window.applePayCopyToken = async function () {
    const t = ui.modal && ui.modal.payload && ui.modal.payload.token;
    if (!t) return;
    try { await navigator.clipboard.writeText(t); if (typeof fxSuccess === 'function') fxSuccess('Copied'); } catch (e) { const el = document.getElementById('ap-token'); if (el) el.select(); }
  };
  window.applePayTurnOff = async function () {
    const c = cfg(); if (!c || !confirm('Turn it off? The Shortcut can no longer send payments.')) return;
    try { await supabaseRpc('inbox_drop_key', { secret: c.secret, channel: 'applepay' }); } catch (e) { alert((e && e.message) || String(e)); return; }
    const next = Object.assign({}, data.settings.inboxChannels); delete next.applepay; data.settings.inboxChannels = next;
    save(); render();
  };
  window.__palette.push(add => add('Pages', 'Apple Pay setup', 'Settings → Apple Pay', () => { goPage('settings'); ui.settingsOpenSections = { applepay: true }; render(); }, 'settings'));
}
