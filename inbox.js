/* ===================== ChatGPT inbox =====================
 * Its own file, loaded after invest.js (uses the trade panel) and before safety.js.
 *
 * Two GPTs in ChatGPT ("Trackr Budget", "Trackr Investments") read what you send them (receipts,
 * screenshots of a bank or broker app, plain text) and drop each transaction into an inbox in your
 * own Supabase (supabase/migrations/003_chatgpt_inbox.sql, same text as INBOX_SQL below). Trackr
 * fetches it and lists every item in Action required → "From ChatGPT": nothing touches your data
 * until you approve it here.
 *   - Budget items: "Add" (ready ones), "Edit" (the expense form, filled in) or "Reject".
 *   - Investment items: buy / sell open the broker's trade panel filled in (you press Buy / Sell
 *     there, as usual); dividend, deposit and withdrawal open the transaction form filled in.
 *   - No GPT action, or it failed: the GPT gives a JSON block you paste in Add → Paste from ChatGPT.
 *
 * Keys: each GPT gets its own inbox key, made here. Supabase only keeps its hash. A key can only
 * add items to the queue and read the names Trackr publishes for it (categories, accounts,
 * brokers, assets: no amounts). Keys live on this device (localStorage 'trackr-inbox-keys', never
 * synced); data.settings.inboxChannels says which channels are on, so every device fetches.
 * Fetched items and answers not sent yet: localStorage 'trackr-inbox'.
 *
 * inboxNormalize(), inboxParsePasted(), inboxOpenApi() and inboxInstructions() are pure
 * (Node-tested), and so is INBOX_SQL.
 */
const INBOX_SQL = [
  '-- Trackr inbox — ChatGPT (your "Trackr Budget" and "Trackr Investments" GPTs) drops expenses and',
  '-- trades here; Trackr shows them for review and only adds what you approve.',
  '-- An inbox key can only ADD items to this queue and read the names Trackr published (categories,',
  '-- accounts, brokers, assets: no amounts, no balances). It can\'t read or change your data.',
  '-- Your sync secret never leaves Trackr. Safe to run on a project that has Trackr\'s setup SQL, and',
  '-- safe to re-run. (Settings → ChatGPT inbox → "Copy the SQL" gives this same text.)',
];
// The SQL itself is long: it's kept in the migration file's words, joined at load (see the test).
INBOX_SQL.push(...`
create table if not exists trackr_inbox_keys (
  key_hash text primary key,                 -- sha256 of the key; the key itself is never stored
  data_id text not null,                     -- the trackr_data row it files into
  channel text not null check (channel in ('budget', 'invest')),
  created_at timestamptz not null default now(),
  unique (data_id, channel)
);
create table if not exists trackr_inbox (
  id uuid primary key default gen_random_uuid(),
  data_id text not null,
  channel text not null,
  item jsonb not null,
  source text,
  status text not null default 'new' check (status in ('new', 'added', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists trackr_inbox_open on trackr_inbox (data_id, status, created_at);
create table if not exists trackr_inbox_context (
  data_id text primary key,
  context jsonb not null,
  updated_at timestamptz not null default now()
);
alter table trackr_inbox_keys enable row level security;
alter table trackr_inbox enable row level security;
alter table trackr_inbox_context enable row level security;

-- The row a sync secret belongs to (internal: not callable from outside).
create or replace function trackr_inbox_owner(secret text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare h text := encode(digest(secret, 'sha256'), 'hex');
begin
  if secret is null or not exists (select 1 from trackr_data where id = h) then raise exception 'unknown secret'; end if;
  return h;
end $$;
revoke all on function trackr_inbox_owner(text) from public, anon;

-- ---- Called by Trackr (with your sync secret) ----
create or replace function inbox_set_key(secret text, channel text, key_hash text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare owner text := trackr_inbox_owner(secret);
begin
  if channel not in ('budget', 'invest') or key_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad key'; end if;
  delete from trackr_inbox_keys k where k.data_id = owner and k.channel = inbox_set_key.channel;
  insert into trackr_inbox_keys (key_hash, data_id, channel) values (key_hash, owner, channel);
end $$;

create or replace function inbox_drop_key(secret text, channel text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare owner text := trackr_inbox_owner(secret);
begin
  delete from trackr_inbox_keys k where k.data_id = owner and k.channel = inbox_drop_key.channel;
end $$;

create or replace function inbox_status(secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare owner text := trackr_inbox_owner(secret);
begin
  return jsonb_build_object(
    'keys', coalesce((select jsonb_agg(jsonb_build_object('channel', channel, 'created_at', created_at)) from trackr_inbox_keys where data_id = owner), '[]'::jsonb),
    'open', (select count(*) from trackr_inbox where data_id = owner and status = 'new'),
    'last', (select max(created_at) from trackr_inbox where data_id = owner));
end $$;

-- The names ChatGPT may see (Trackr sends them; nothing with an amount in it).
create or replace function inbox_set_context(secret text, context jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare owner text := trackr_inbox_owner(secret);
begin
  if octet_length(context::text) > 200000 then raise exception 'context too big'; end if;
  insert into trackr_inbox_context (data_id, context, updated_at) values (owner, context, now())
  on conflict (data_id) do update set context = excluded.context, updated_at = now();
end $$;

-- What waits for review (and a little tidying: answered items go after 30 days).
create or replace function inbox_list(secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare owner text := trackr_inbox_owner(secret);
begin
  delete from trackr_inbox where data_id = owner and status <> 'new' and resolved_at < now() - interval '30 days';
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'channel', channel, 'item', item, 'source', source, 'created_at', created_at) order by created_at)
    from (select * from trackr_inbox where data_id = owner and status = 'new' order by created_at limit 300) x), '[]'::jsonb);
end $$;

create or replace function inbox_resolve(secret text, ids uuid[], status text)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare owner text := trackr_inbox_owner(secret); n integer;
begin
  if status not in ('added', 'rejected') then raise exception 'bad status'; end if;
  update trackr_inbox i set status = inbox_resolve.status, resolved_at = now()
   where i.data_id = owner and i.id = any(ids) and i.status = 'new';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---- Called by ChatGPT (with an inbox key) ----
create or replace function inbox_context(inbox_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys;
begin
  select * into k from trackr_inbox_keys where key_hash = encode(digest(coalesce(inbox_key, ''), 'sha256'), 'hex');
  if not found then raise exception 'Unknown inbox key. Create a new one in Trackr: Settings → ChatGPT inbox.'; end if;
  return jsonb_build_object('channel', k.channel, 'today', to_char(now() at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
    'context', coalesce((select context from trackr_inbox_context where data_id = k.data_id), '{}'::jsonb));
end $$;

create or replace function inbox_add(inbox_key text, items jsonb, source text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys; n integer; open_now integer;
begin
  select * into k from trackr_inbox_keys where key_hash = encode(digest(coalesce(inbox_key, ''), 'sha256'), 'hex');
  if not found then raise exception 'Unknown inbox key. Create a new one in Trackr: Settings → ChatGPT inbox.'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'items must be a non-empty array'; end if;
  if jsonb_array_length(items) > 50 then raise exception 'at most 50 items per call'; end if;
  select count(*) into open_now from trackr_inbox where data_id = k.data_id and status = 'new';
  if open_now + jsonb_array_length(items) > 300 then raise exception 'Trackr already has 300 items waiting for review: review them in Trackr first.'; end if;
  insert into trackr_inbox (data_id, channel, item, source)
  select k.data_id, k.channel, it, left(source, 200) from jsonb_array_elements(items) it
   where jsonb_typeof(it) = 'object' and octet_length(it::text) <= 8000;
  get diagnostics n = row_count;
  return jsonb_build_object('added', n, 'skipped', jsonb_array_length(items) - n, 'waiting_for_review', open_now + n,
    'message', 'Saved in the Trackr inbox. Nothing is added to the accounts until it is approved in Trackr (Action required).');
end $$;

revoke all on function inbox_set_key(text, text, text), inbox_drop_key(text, text), inbox_status(text), inbox_set_context(text, jsonb),
  inbox_list(text), inbox_resolve(text, uuid[], text), inbox_context(text), inbox_add(text, jsonb, text) from public;
grant execute on function inbox_set_key(text, text, text), inbox_drop_key(text, text), inbox_status(text), inbox_set_context(text, jsonb),
  inbox_list(text), inbox_resolve(text, uuid[], text), inbox_context(text), inbox_add(text, jsonb, text) to anon;
notify pgrst, 'reload schema';
`.split('\n'));
const INBOX_SQL_TEXT = INBOX_SQL.join('\n');

const INBOX_BUDGET_KINDS = ['expense', 'income', 'transfer'];
const INBOX_INVEST_KINDS = ['buy', 'sell', 'dividend', 'deposit', 'withdrawal'];

/* One item from ChatGPT → what Trackr would add, and what to check first.
 * ctx: { today, currency, categories: { expense, income }, accounts: [{ id, name }], defaultAccountId,
 *        paymentMethods: [{ id, name }], investAccounts: [{ key, name, ref, assets: [{ key, ticker, name, isin }] }],
 *        toEUR?: (amount, currency) => number }
 * → { channel, kind, form: 'tx' | 'trade', draft, problems: [{ text, block }], ok, ready } */
function inboxNormalize(raw, channel, ctx) {
  const it = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const problems = [];
  const warn = (text, block) => problems.push({ text, block: !!block });
  const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const low = v => str(v, 200).toLowerCase();
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[\s €$£]/g, '').replace(',', '.')); return isFinite(n) ? n : NaN; };
  const byIdOrName = (list, id, name) => (list || []).find(x => id && x.id === id) || (list || []).find(x => name && low(x.name) === low(name)) || null;
  const today = ctx.today;
  let date = /^\d{4}-\d{2}-\d{2}$/.test(str(it.date, 10)) ? str(it.date, 10) : '';
  if (!date) { date = today; warn('No date: today is used.'); }
  else if (date > today) warn('The date is in the future.');
  const currency = /^[A-Za-z]{3}$/.test(str(it.currency, 3)) ? str(it.currency, 3).toUpperCase() : ctx.currency;
  const name = str(it.name || it.merchant || it.payee, 80);
  const note = str(it.note || it.description, 300);
  const kindRaw = low(it.type || it.action || it.kind);
  const accountFor = (id, nm) => byIdOrName(ctx.accounts, str(id, 80), str(nm, 80));
  const result = (kind, form, draft) => {
    const ok = !problems.some(p => p.block);
    return { channel, kind, form, draft, problems, ok, ready: ok && !problems.length };
  };

  if (channel === 'invest' || INBOX_INVEST_KINDS.includes(kindRaw)) {
    const kind = INBOX_INVEST_KINDS.includes(kindRaw) ? kindRaw : '';
    if (!kind) warn('Unknown action: buy, sell, dividend, deposit or withdrawal?', true);
    const accs = ctx.investAccounts || [];
    const brokerId = str(it.broker_key || it.broker_id, 120), brokerName = str(it.broker || it.account, 80);
    const acc = accs.find(a => brokerId && a.key === brokerId) || accs.find(a => brokerName && low(a.name) === low(brokerName))
      || accs.find(a => brokerName && low(a.name).includes(low(brokerName))) || (accs.length === 1 ? accs[0] : null);
    if (!acc) warn(brokerName ? `No broker called "${brokerName}" in Trackr.` : 'Which broker?', true);
    const toEur = (v, c) => (c === 'EUR' || !ctx.toEUR ? v : ctx.toEUR(v, c));
    let qty = num(it.quantity), price = num(it.price), amount = num(it.amount != null ? it.amount : it.total), fee = num(it.fee);
    if (!(fee > 0)) fee = 0;
    if (currency !== 'EUR' && kind !== 'deposit' && kind !== 'withdrawal' && kind !== 'dividend') {
      if (ctx.toEUR) { if (price > 0) price = toEur(price, currency); if (amount > 0) amount = toEur(amount, currency); if (fee > 0) fee = toEur(fee, currency); warn(`Amounts were in ${currency}: changed to EUR at today's rate.`); }
      else warn(`Amounts are in ${currency}.`);
    }
    const base = { date, note: [name, note].filter(Boolean).join(' · ').slice(0, 200), broker: acc ? acc.name : brokerName };
    if (kind === 'buy' || kind === 'sell') {
      const assets = acc ? acc.assets || [] : [];
      const key = str(it.asset_key, 120), tick = low(it.ticker || it.symbol), isin = low(it.isin), nm = low(it.asset || it.asset_name || it.security || '');
      const asset = assets.find(a => key && a.key === key) || assets.find(a => isin && low(a.isin) === isin) || assets.find(a => tick && low(a.ticker) === tick)
        || assets.find(a => nm && low(a.name).includes(nm));
      const label = str(it.ticker || it.symbol || it.asset || it.isin, 60);
      if (acc && !asset) warn(`${label || 'This asset'} isn't in Trackr yet: add the position first, then review this again.`, true);
      const have = [qty > 0, price > 0, amount > 0].filter(Boolean).length;
      if (have < 2) warn('Two of quantity, price and total are needed.', true);
      const locks = qty > 0 && amount > 0 ? ['qty', 'amount'] : qty > 0 && price > 0 ? ['qty', 'price'] : ['amount', 'price'];
      return result(kind, 'trade', Object.assign(base, {
        side: kind, accountKey: acc ? acc.key : '', from: asset ? asset.key : '', assetLabel: asset ? asset.name : label,
        qty: qty > 0 ? String(+qty.toFixed(8)) : '', price: price > 0 ? String(+price.toFixed(6)) : '', amount: amount > 0 ? String(Math.round(amount * 100) / 100) : '',
        fee: fee > 0 ? String(Math.round(fee * 100) / 100) : '', locks,
      }));
    }
    // Dividend, deposit, withdrawal: a transaction (income, or a transfer to / from the broker).
    if (!(amount > 0)) warn('No amount.', true);
    const bank = accountFor(it.account_id, it.bank_account) || byIdOrName(ctx.accounts, ctx.defaultAccountId, '');
    const draft = { date, amount: amount > 0 ? String(Math.round(amount * 100) / 100) : '', currency, comment: name || (acc ? acc.name : ''), description: note };
    if (kind === 'dividend') {
      const cat = (ctx.categories.income || []).find(c => /invest|dividend/i.test(c.name)) || null;
      if (!cat) warn('Pick a category.', true);
      warn('A dividend is added as income on a bank account: check which one.');
      return result(kind, 'tx', Object.assign(draft, { type: 'income', categoryId: cat ? cat.id : '', subCategoryId: '', accountId: bank ? bank.id : '', paymentMethodId: '', description: [`Dividend${str(it.ticker, 20) ? ' ' + str(it.ticker, 20) : ''}${acc ? ' · ' + acc.name : ''}`, note].filter(Boolean).join(' · ') }));
    }
    if (!bank) warn('Which bank account?', true);
    const bankRef = bank ? 'acc:' + bank.id : '', brokerRef = acc ? acc.ref : '';
    return result(kind, 'tx', Object.assign(draft, { type: 'transfer', from: kind === 'deposit' ? bankRef : brokerRef, to: kind === 'deposit' ? brokerRef : bankRef, comment: name || `${kind === 'deposit' ? 'Deposit to' : 'Withdrawal from'} ${acc ? acc.name : 'broker'}` }));
  }

  // Budget
  let kind = INBOX_BUDGET_KINDS.includes(kindRaw) ? kindRaw : '';
  const signed = num(it.amount);
  if (!kind) kind = signed > 0 && /income|refund|salary|revenu|rembours/.test(kindRaw) ? 'income' : 'expense';
  const amount = Math.abs(signed);
  if (!(amount > 0)) warn('No amount.', true);
  const draft = { type: kind, date, amount: amount > 0 ? String(Math.round(amount * 100) / 100) : '', currency, comment: name, description: note, categoryId: '', subCategoryId: '', accountId: '', paymentMethodId: '', from: '', to: '' };
  if (kind === 'transfer') {
    const ref = (id, nm) => {
      const a = accountFor(id, nm); if (a) return 'acc:' + a.id;
      const b = (ctx.investAccounts || []).find(x => (id && x.key === id) || (nm && low(x.name) === low(nm)));
      return b ? b.ref : '';
    };
    draft.from = ref(str(it.from_account_id, 120), it.from_account || it.from);
    draft.to = ref(str(it.to_account_id, 120), it.to_account || it.to);
    if (!draft.from || !draft.to) warn('Where from and where to?', true);
    return result(kind, 'tx', draft);
  }
  const cats = ctx.categories[kind] || [];
  const cat = byIdOrName(cats, str(it.category_id, 80), it.category);
  const sub = cat ? byIdOrName(cat.subcategories, str(it.subcategory_id, 80), it.subcategory) : null;
  if (!cat) warn(it.category ? `No category "${str(it.category, 40)}": pick one.` : 'Pick a category.', true);
  const acc = accountFor(it.account_id, it.account);
  const fallback = byIdOrName(ctx.accounts, ctx.defaultAccountId, '');
  if (!acc && (it.account_id || it.account)) warn(`No account "${str(it.account || it.account_id, 40)}": ${fallback ? fallback.name : 'pick one'} is used.`, !fallback);
  else if (!acc && !fallback) warn('Which account?', true);
  const pm = byIdOrName(ctx.paymentMethods, str(it.payment_method_id, 80), it.payment_method || it.paid_with);
  return result(kind, 'tx', Object.assign(draft, { categoryId: cat ? cat.id : '', subCategoryId: sub ? sub.id : '', accountId: (acc || fallback || {}).id || '', paymentMethodId: pm ? pm.id : '' }));
}

/* Text pasted from ChatGPT → [{ channel, item }]. Takes the JSON block it gave ({"trackr":
 * "budget" | "invest", "items": [...]}, or just an array), even with words around it. */
function inboxParsePasted(text) {
  const s = String(text || '');
  const tries = [];
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) tries.push(fence[1]);
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(s.slice(a, b + 1));
  const c = s.indexOf('['), d = s.lastIndexOf(']');
  if (c >= 0 && d > c) tries.push(s.slice(c, d + 1));
  for (const t of tries) {
    let v;
    try { v = JSON.parse(t); } catch (e) { continue; }
    const items = Array.isArray(v) ? v : v && Array.isArray(v.items) ? v.items : v && typeof v === 'object' ? [v] : [];
    const ch = v && !Array.isArray(v) && /invest/i.test(String(v.trackr || v.channel || '')) ? 'invest' : null;
    const out = items.filter(x => x && typeof x === 'object' && !Array.isArray(x)).slice(0, 100)
      .map(x => ({ channel: ch || (INBOX_INVEST_KINDS.includes(String(x.action || x.type || '').toLowerCase()) ? 'invest' : 'budget'), item: x }));
    if (out.length) return out;
  }
  return [];
}

/* The GPT's Action schema (OpenAPI 3.1), for your Supabase project. */
function inboxOpenApi(projectUrl, channel) {
  const invest = channel === 'invest';
  const str = d => ({ type: 'string', description: d });
  const n = d => ({ type: 'number', description: d });
  const item = invest ? {
    type: 'object',
    properties: {
      action: { type: 'string', enum: INBOX_INVEST_KINDS, description: 'buy / sell a position; dividend received; deposit (cash from a bank account to the broker) or withdrawal (back to the bank)' },
      date: str('Trade or payment date, YYYY-MM-DD'),
      broker_key: str('The broker\'s key from getTrackrContext (investAccounts[].key)'),
      broker: str('Broker name if no key fits'),
      asset_key: str('The asset\'s key from getTrackrContext (investAccounts[].assets[].key)'),
      ticker: str('Ticker or coin symbol'), isin: str('ISIN when shown'), asset: str('Asset name'),
      quantity: n('Number of shares / coins'), price: n('Price per share / coin'), amount: n('Total value of the trade, or the cash amount for dividend / deposit / withdrawal'),
      fee: n('Fees paid, if any'), currency: str('ISO code, e.g. EUR, USD'),
      bank_account: str('For deposit / withdrawal: the bank account name (accounts[].name)'),
      note: str('Short note'),
    },
    required: ['action', 'date'],
  } : {
    type: 'object',
    properties: {
      type: { type: 'string', enum: INBOX_BUDGET_KINDS, description: 'expense, income, or transfer between two of my own accounts' },
      date: str('YYYY-MM-DD'),
      amount: n('Positive amount'),
      currency: str('ISO code, e.g. EUR'),
      name: str('Shop, company or person, short (e.g. "Albert Heijn")'),
      category_id: str('Category id from getTrackrContext (categories.expense / categories.income)'),
      subcategory_id: str('Sub-category id from that category'),
      account_id: str('Account id it was paid from / into (accounts[].id); leave out if unsure'),
      payment_method_id: str('Payment method id (paymentMethods[].id), e.g. card or cash'),
      from_account: str('For a transfer: account or broker name it leaves'),
      to_account: str('For a transfer: account or broker name it goes to'),
      note: str('Short note, e.g. items bought'),
    },
    required: ['type', 'date', 'amount', 'name'],
  };
  const body = (props, req) => ({ required: true, content: { 'application/json': { schema: { type: 'object', properties: props, required: req } } } });
  const ok = d => ({ 200: { description: d, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } } });
  return JSON.stringify({
    openapi: '3.1.0',
    info: { title: invest ? 'Trackr investments inbox' : 'Trackr budget inbox', version: '1.0.0', description: 'Drops transactions into the Trackr inbox. Nothing is added to the accounts until it is approved in the Trackr app.' },
    servers: [{ url: String(projectUrl || 'https://YOUR-PROJECT.supabase.co').replace(/\/+$/, '') }],
    paths: {
      '/rest/v1/rpc/inbox_context': { post: { operationId: 'getTrackrContext', summary: invest ? 'My brokers, their assets (keys, tickers, ISINs), my bank accounts and today\'s date' : 'My categories, sub-categories, accounts, payment methods and today\'s date', requestBody: body({ inbox_key: str('My inbox key') }, ['inbox_key']), responses: ok('Names and ids only') } },
      '/rest/v1/rpc/inbox_add': { post: { operationId: 'addToTrackrInbox', summary: 'Send transactions to my Trackr inbox for review (up to 50 per call)', requestBody: body({ inbox_key: str('My inbox key'), source: str('What I sent, e.g. "Revolut screenshot"'), items: { type: 'array', maxItems: 50, items: item } }, ['inbox_key', 'items']), responses: ok('How many were saved and wait for review') } },
    },
  }, null, 2);
}

/* The GPT's instructions, with its inbox key. */
function inboxInstructions(channel, key) {
  const invest = channel === 'invest';
  return (invest ? [
    'You are Trackr Investments. You file my investment activity into my Trackr app: I send screenshots or notes from my broker apps (trades, order confirmations, dividends, deposits).',
    '',
    'Every time:',
    '1. Call getTrackrContext once per conversation to get my brokers (investAccounts: key, name) and the assets at each one (key, ticker, name, isin), my bank accounts and today\'s date. Use those keys.',
    '2. Read every executed trade or cash movement: action (buy, sell, dividend, deposit, withdrawal), date (YYYY-MM-DD), broker_key, asset_key (match by ISIN first, then ticker, then name), quantity, price per unit, total amount, fee, currency.',
    '3. Only executed orders count: skip pending, cancelled or rejected orders, price alerts and portfolio totals. Never invent a number; if one is unreadable, leave it out.',
    '4. If an asset is not in the context, still send it with ticker / isin / asset name: Trackr will ask me to add the position first.',
    '5. Send everything in ONE addToTrackrInbox call (up to 50 items), with source saying what I sent (e.g. "Trading 212 screenshot").',
    '6. Then reply with a short table (date, action, asset, quantity, total) and say it waits in Trackr → Action required for my review. Nothing changes in Trackr until I approve it there.',
  ] : [
    'You are Trackr Budget. You file my spending into my Trackr app: I send receipts, screenshots of my bank or card apps, photos, or plain text ("12,40 bakery yesterday").',
    '',
    'Every time:',
    '1. Call getTrackrContext once per conversation to get my categories and sub-categories (ids and names), accounts, payment methods and today\'s date. Use those ids.',
    '2. Read every transaction: type (expense, income, or transfer between two of my own accounts), date (YYYY-MM-DD; turn "yesterday" etc. into a date from today), amount as a positive number, currency, name (the shop, company or person, short and normally capitalised), the best category_id and subcategory_id, account_id when it is clear which account paid (else leave it out: Trackr uses my main account), payment_method_id when visible, and a short note (e.g. what was bought).',
    '3. Only completed transactions count: skip pending or declined payments, balances, ads and totals. A receipt is ONE expense (its total), not one per line. Never invent an amount.',
    '4. Send everything in ONE addToTrackrInbox call (up to 50 items), with source saying what I sent (e.g. "Revolut screenshot").',
    '5. Then reply with a short table (date, name, amount, category) and say it waits in Trackr → Action required for my review. Nothing is added to my accounts until I approve it there.',
  ]).concat([
    '',
    `If the action fails or is not available, give me the items as one JSON code block {"trackr": "${invest ? 'invest' : 'budget'}", "items": [...]} with the same fields, so I can paste it in Trackr (Add → Paste from ChatGPT).`,
    'Reply in the language I write in. Keep answers short.',
    '',
    `My inbox key (send it as inbox_key in every call, never show it): ${key || 'CREATE-A-KEY-IN-TRACKR'}`,
  ]).join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { INBOX_SQL_TEXT, inboxNormalize, inboxParsePasted, inboxOpenApi, inboxInstructions };
} else {
  const STATE_KEY = 'trackr-inbox', KEYS_KEY = 'trackr-inbox-keys';
  const CHANNELS = [['budget', 'Trackr Budget', 'Expenses, income and transfers: receipts, bank and card screenshots'], ['invest', 'Trackr Investments', 'Buys, sells, dividends and deposits: broker screenshots']];
  const readLs = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { return d; } };
  const writeLs = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: kept in memory only */ } };
  // { items: [{ id, channel, item, source, created_at, local? }], done: { id: 'added' | 'rejected' }, ctxSig, missing }
  const state = readLs(STATE_KEY, { items: [], done: {}, ctxSig: '', missing: false });
  const keys = readLs(KEYS_KEY, {});
  const saveState = () => writeLs(STATE_KEY, state);
  const channelsOn = () => Object.keys((data.settings && data.settings.inboxChannels) || {}).filter(c => data.settings.inboxChannels[c]);
  const cfg = () => (typeof loadSupabaseSyncConfig === 'function' ? loadSupabaseSyncConfig() : null);
  let busy = false, lastError = '';

  const openItems = () => state.items.filter(x => !state.done[x.id]);
  function ctxForNormalize() {
    return {
      today: todayYmd(), currency: data.settings.defaultCurrency || 'EUR', categories: data.categories,
      accounts: (data.accounts || []).map(a => ({ id: a.id, name: a.name })), defaultAccountId: typeof defaultMoneyAccountId === 'function' ? defaultMoneyAccountId() : '',
      paymentMethods: (data.paymentMethods || []).map(p => ({ id: p.id, name: p.name })),
      investAccounts: typeof investAccounts === 'function' ? investAccounts().map(acc => ({ key: acc.kind + ':' + acc.id, name: acc.name, ref: investTransferRef(acc),
        assets: tradeableAssets(acc).map(a => { const as = a.key.startsWith('a:') && typeof assetById === 'function' ? assetById(a.key.slice(2)) : null; return { key: a.key, ticker: a.ticker, name: (as && as.name) || a.label, isin: (as && as.isin) || '' }; }) })) : [],
      toEUR: (v, c) => toEUR(v, c),
    };
  }
  /* What the GPTs may read: names and ids, never an amount. */
  function publicContext() {
    const c = ctxForNormalize();
    const cats = list => (list || []).map(x => ({ id: x.id, name: x.name, subcategories: (x.subcategories || []).map(s => ({ id: s.id, name: s.name })) }));
    return {
      currency: c.currency, mainAccountId: c.defaultAccountId,
      categories: { expense: cats(data.categories.expense), income: cats(data.categories.income) },
      accounts: (data.accounts || []).map(a => ({ id: a.id, name: a.name, currency: a.currency || 'EUR' })),
      paymentMethods: c.paymentMethods, investAccounts: c.investAccounts.map(a => ({ key: a.key, name: a.name, assets: a.assets })),
    };
  }
  async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function newKey(channel) {
    const b = crypto.getRandomValues(new Uint8Array(24));
    return `trk_${channel}_` + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  const missingFn = e => e && (e.status === 404 || /inbox_|function .* does not exist|schema cache/i.test(e.message || ''));

  /* Fetch what waits, send the answers given offline, publish the names if they changed. */
  async function inboxRefresh(force) {
    const c = cfg();
    if (busy || !c || !c.secret || (!channelsOn().length && !force)) return;
    busy = true;
    const before = openItems().length;
    try {
      const pending = Object.keys(state.done).filter(id => !id.startsWith('local_'));
      for (const status of ['added', 'rejected']) {
        const ids = pending.filter(id => state.done[id] === status);
        if (ids.length) await supabaseRpc('inbox_resolve', { secret: c.secret, ids, status });
      }
      const list = await supabaseRpc('inbox_list', { secret: c.secret }) || [];
      const locals = state.items.filter(x => x.local);
      state.items = list.map(x => ({ id: x.id, channel: x.channel, item: x.item, source: x.source, created_at: x.created_at })).concat(locals);
      Object.keys(state.done).forEach(id => { if (!id.startsWith('local_')) delete state.done[id]; });
      state.missing = false; lastError = '';
      const ctx = JSON.stringify(publicContext());
      if (ctx !== state.ctxSig) { await supabaseRpc('inbox_set_context', { secret: c.secret, context: JSON.parse(ctx) }); state.ctxSig = ctx; }
    } catch (e) {
      if (missingFn(e)) state.missing = true;
      lastError = e && e.kind === 'network' ? 'Offline: answers are sent when you\'re back online.' : (e && e.message) || String(e);
    } finally {
      busy = false;
      saveState();
    }
    if (openItems().length !== before || ui.modal && ui.modal.type === 'inbox') (typeof renderWhenIdle === 'function' ? renderWhenIdle : render)();
  }
  window.inboxRefresh = inboxRefresh;
  function resolveItem(id, status) {
    if (String(id).startsWith('local_')) state.items = state.items.filter(x => x.id !== id);
    else state.done[id] = status;
    saveState();
    inboxRefresh();
  }

  /* ---- Review ---- */
  window.openInbox = function () { ui.modal = { type: 'inbox', payload: {} }; render(); inboxRefresh(); };
  const fmtWhen = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  function looksDuplicate(n) {
    if (n.form !== 'tx' || !n.draft.amount) return false;
    const amt = +n.draft.amount;
    return (data.budgetTransactions || []).some(t => t.date === n.draft.date && t.type === n.draft.type && Math.abs((+t.amount || 0) - amt) < 0.005 && t.currency === n.draft.currency);
  }
  function normalized(x) {
    const n = inboxNormalize(x.item, x.channel, ctxForNormalize());
    if (looksDuplicate(n)) { n.problems.push({ text: 'Maybe already in Trackr: same day, type and amount.', block: false }); n.ready = false; }
    return n;
  }
  function itemLine(x, n) {
    const d = n.draft;
    const cat = n.form === 'tx' && d.categoryId ? categoryById(d.type, d.categoryId) : null;
    const sub = cat && d.subCategoryId ? (cat.subcategories || []).find(s => s.id === d.subCategoryId) : null;
    const acc = n.form === 'tx' && d.accountId ? accountById(d.accountId) : null;
    if (n.form === 'trade') {
      return { title: `${n.kind === 'buy' ? 'Buy' : 'Sell'} ${d.assetLabel || '?'}`, amount: d.amount ? fmtMoney(+d.amount) : d.qty && d.price ? fmtMoney(+d.qty * +d.price) : '', sign: n.kind === 'buy' ? '−' : '+',
        meta: [shortDay(d.date), d.qty ? `${d.qty} × ${d.price ? fmtMoney(+d.price) : '?'}` : '', d.broker, d.fee ? `fee ${fmtMoney(+d.fee)}` : ''].filter(Boolean).join(' · ') };
    }
    const where = d.type === 'transfer' ? [d.from && transferEndpoint(d.from) ? transferEndpoint(d.from).label : '?', d.to && transferEndpoint(d.to) ? transferEndpoint(d.to).label : '?'].join(' → ') : acc ? acc.name : '';
    return { title: d.comment || (d.type === 'income' ? 'Income' : d.type === 'transfer' ? 'Transfer' : 'Expense'), amount: d.amount ? fmtMoney(+d.amount, d.currency) : '—', sign: d.type === 'income' ? '+' : d.type === 'expense' ? '−' : '',
      meta: [shortDay(d.date), cat ? `${cat.name}${sub ? ' › ' + sub.name : ''}` : '', where].filter(Boolean).join(' · '), income: d.type === 'income' };
  }
  window.__modalRenderers.inbox = function () {
    const list = openItems().slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const rows = list.map(x => ({ x, n: normalized(x) }));
    const ready = rows.filter(r => r.n.form === 'tx' && r.n.ready);
    const on = channelsOn();
    return `
      <div class="modal-head"><div class="modal-title">From ChatGPT</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <p class="dim" style="font-size:13px;margin:0 0 12px;">What your GPTs read from your screenshots and receipts. Nothing is in Trackr until you add it here.</p>
      ${state.missing ? '<div class="ib-warn">The inbox isn\'t in your Supabase yet: Settings → ChatGPT inbox → step 1.</div>' : lastError ? `<div class="ib-warn">${escHtml(lastError)}</div>` : ''}
      ${rows.length ? `<div class="ib-list">${rows.map(({ x, n }) => {
        const l = itemLine(x, n);
        return `<div class="ib-item ${n.ok ? '' : 'blocked'}">
          <div class="ib-top"><span class="ib-ch">${x.channel === 'invest' ? 'Investments' : 'Budget'}</span><span class="dim">${escHtml([x.source, x.local ? 'pasted' : fmtWhen(x.created_at)].filter(Boolean).join(' · '))}</span></div>
          <div class="ib-main"><div class="ib-txt"><b>${escHtml(l.title)}</b><span class="dim">${escHtml(l.meta)}</span></div><b class="num ${l.income ? 'positive' : ''}">${l.sign}${l.amount}</b></div>
          ${n.problems.length ? `<ul class="ib-probs">${n.problems.map(p => `<li class="${p.block ? 'block' : ''}">${escHtml(p.text)}</li>`).join('')}</ul>` : ''}
          <div class="ib-acts">
            <button class="btn small ghost" onclick="inboxReject('${escHtml(x.id)}')">Reject</button>
            ${n.form === 'trade' ? `<button class="btn small primary" ${n.draft.accountKey ? '' : 'disabled'} onclick="inboxOpen('${escHtml(x.id)}')">${n.ok ? 'Review the trade' : 'Open the broker'}</button>`
              : `<button class="btn small" onclick="inboxOpen('${escHtml(x.id)}')">Edit</button>${n.ok ? `<button class="btn small primary" onclick="inboxAdd('${escHtml(x.id)}')">Add</button>` : ''}`}
          </div></div>`;
      }).join('')}</div>` : `<div class="empty-state" style="padding:22px 10px;"><div class="title">Nothing to review</div><div class="sub">${on.length ? 'Send a screenshot or a receipt to your GPT: it shows up here.' : 'Set up your GPTs in Settings → ChatGPT inbox, or paste what ChatGPT gave you.'}</div></div>`}
      <div class="modal-actions">
        <button class="btn" onclick="openInboxPaste()">Paste from ChatGPT</button>
        ${ready.length > 1 ? `<button class="btn primary" onclick="inboxAddAllReady()">Add the ${ready.length} ready</button>` : on.length ? '<button class="btn" onclick="inboxRefresh(true)">Check now</button>' : '<button class="btn" onclick="closeModal();goPage(\'settings\');ui.settingsOpenSections={chatgpt:true};render()">Set up</button>'}
      </div>`;
  };
  const findItem = id => state.items.find(x => x.id === id);
  window.inboxReject = function (id) { resolveItem(id, 'rejected'); render(); };
  let bulk = false;
  /* Add as it is: the expense form's own save (same checks, logo, balance, recurring…). */
  window.inboxAdd = function (id) {
    const x = findItem(id); if (!x) return;
    const n = normalized(x);
    if (n.form !== 'tx' || !n.ok) return inboxOpen(id);
    openTxForm(null, Object.assign({}, n.draft, { _inboxId: id }));
    saveTxForm();
    if (ui.modal && ui.modal.type === 'tx') return; // the form said what's missing
  };
  window.inboxAddAllReady = function () {
    const ids = openItems().filter(x => { const n = normalized(x); return n.form === 'tx' && n.ready; }).map(x => x.id);
    bulk = true;
    let n = 0;
    try { ids.forEach(id => { inboxAdd(id); if (state.done[id] || !findItem(id)) n++; }); } finally { bulk = false; }
    if (!ui.modal) openInbox();
    if (typeof fxSuccess === 'function' && n) fxSuccess(`${n} added`);
  };
  /* Open it where you'd normally enter it, filled in. */
  window.inboxOpen = function (id) {
    const x = findItem(id); if (!x) return;
    const n = normalized(x);
    if (n.form === 'trade') {
      if (!n.draft.accountKey) return;
      openInvestAccount(n.draft.accountKey);
      if (n.draft.from) {
        ui.trade = Object.assign(tradeBlank(), { side: n.draft.side, from: n.draft.from, to: '', qty: n.draft.qty, price: n.draft.price, amount: n.draft.amount, fee: n.draft.fee, date: n.draft.date, note: n.draft.note, locks: n.draft.locks, details: true, _inboxId: id });
        ui.investTab = 'trade';
      }
      render();
      return;
    }
    openTxForm(null, Object.assign({}, n.draft, { _inboxId: id }));
  };
  // Saved through the form or the trade panel: that item is done.
  const origSaveTx = window.saveTxForm;
  window.saveTxForm = function () {
    const p = ui.modal && ui.modal.type === 'tx' ? ui.modal.payload : null;
    const id = p && p._inboxId, n0 = (data.budgetTransactions || []).length;
    const r = origSaveTx.apply(this, arguments);
    if (id && (data.budgetTransactions || []).length > n0 && !(ui.modal && ui.modal.payload === p)) {
      resolveItem(id, 'added');
      if (!bulk && !ui.modal && openItems().length) openInbox();
    }
    return r;
  };
  const origConfirmTrade = window.confirmTrade;
  window.confirmTrade = function () {
    const id = ui.trade && ui.trade._inboxId, n0 = (data.investmentTransactions || []).length;
    const r = origConfirmTrade.apply(this, arguments);
    if (id && (data.investmentTransactions || []).length > n0) {
      resolveItem(id, 'added');
      if (!ui.modal && openItems().length) openInbox();
    }
    return r;
  };

  /* ---- Paste (no GPT action needed) ---- */
  window.openInboxPaste = function () { ui.modal = { type: 'inboxPaste', payload: { text: '', error: '' } }; render(); };
  window.__modalRenderers.inboxPaste = function (p) {
    return `
      <div class="modal-head"><div class="modal-title">Paste from ChatGPT</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <p class="dim" style="font-size:13px;margin:0 0 12px;">Paste ChatGPT's answer with its JSON block. The items wait for your review, like the ones its action sends.</p>
      ${p.error ? `<div class="ib-warn">${escHtml(p.error)}</div>` : ''}
      <label class="field"><span class="label-text">ChatGPT's answer</span><textarea id="ib-paste" rows="8" placeholder='{"trackr": "budget", "items": [ … ]}' oninput="ui.modal.payload.text=this.value">${escHtml(p.text)}</textarea></label>
      <div class="modal-actions"><button class="btn" onclick="openInbox()">Back</button><button class="btn primary" onclick="inboxPasteSave()">Review them</button></div>`;
  };
  window.inboxPasteSave = function () {
    const p = ui.modal.payload, got = inboxParsePasted(p.text);
    if (!got.length) { p.error = 'No items found. Paste the whole answer, with the block that starts with {"trackr"'; render(); return; }
    const t = new Date().toISOString();
    got.forEach(g => state.items.push({ id: uid('local'), channel: g.channel, item: g.item, source: 'pasted', created_at: t, local: true }));
    saveState(); openInbox();
  };

  /* ---- Settings → ChatGPT inbox ---- */
  ui.inboxShow = ui.inboxShow || null;
  window.inboxSettingsHtml = function () {
    const c = cfg();
    if (!c || !c.secret) return `<div class="ib-note">The inbox lives in your Supabase project, so turn on <b>Supabase Sync</b> first (above). You can still paste what ChatGPT gives you: Add → Paste from ChatGPT.</div>`;
    const ref = (String(c.url).match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
    const on = channelsOn();
    const copyBtn = (label, what, ch) => `<button class="btn small" onclick="inboxCopy('${what}','${ch || ''}')">${ic('copy', 14)} ${label}</button>`;
    return `
      <div class="ib-note">Send receipts and screenshots to two GPTs in ChatGPT; each item waits in <b>Action required → From ChatGPT</b> until you add it. ChatGPT only gets an inbox key: it can drop items there and read your category, account and asset names, never an amount. You need ChatGPT Plus to make a GPT.</div>
      <div class="ib-step"><b>1. Add the inbox to Supabase</b> <span class="dim">(once)</span>
        <div class="ib-row">${copyBtn('Copy the SQL', 'sql')}${ref ? `<a class="btn small" href="https://supabase.com/dashboard/project/${escHtml(ref)}/sql/new" target="_blank" rel="noopener">Open the SQL editor ${ic('chevronRight', 14)}</a>` : ''}<button class="btn small" onclick="inboxCheck()">Check</button></div>
        <div class="dim" style="font-size:12px;">Paste it in a new query, press Run, then Check.${state.missing ? ' <b>Not there yet.</b>' : ''}</div>
      </div>
      ${CHANNELS.map(([ch, name, what]) => {
        const has = !!keys[ch], live = on.includes(ch), open = ui.inboxShow === ch && has;
        return `<div class="ib-step"><div class="row-flex"><b>${ch === 'budget' ? '2' : '3'}. ${name}</b><span class="dim" style="font-size:12px;">${live ? (has ? 'on' : 'on (key made on another device)') : 'off'}</span></div>
          <div class="dim" style="font-size:12px;">${what}</div>
          <div class="ib-row">${has ? `<button class="btn small ${open ? '' : 'primary'}" onclick="ui.inboxShow=${open ? 'null' : `'${ch}'`};render()">${open ? 'Hide the setup' : 'Show the GPT setup'}</button><button class="btn small ghost" onclick="inboxMakeKey('${ch}')">New key</button><button class="btn small ghost" onclick="inboxTurnOff('${ch}')">Turn off</button>`
            : `<button class="btn small primary" onclick="inboxMakeKey('${ch}')">${live ? 'Make a key on this device' : 'Create its key'}</button>`}</div>
          ${open ? `<ol class="ib-howto">
            <li>Open <a href="https://chatgpt.com/gpts/editor" target="_blank" rel="noopener">chatgpt.com/gpts/editor</a> → <b>Configure</b>.</li>
            <li>Name: <b>${name}</b>. Instructions: ${copyBtn('Copy the instructions', 'instructions', ch)}</li>
            <li><b>Create new action</b> → Authentication: <b>API Key</b>, Auth Type <b>Custom</b>, header name <code>apikey</code>, and as the key your Supabase anon key: ${copyBtn('Copy the anon key', 'anon', ch)}</li>
            <li>Schema: ${copyBtn('Copy the schema', 'schema', ch)}</li>
            <li>Save it for <b>Only me</b>. Then send it a screenshot to try.</li>
          </ol>
          <div class="dim" style="font-size:11.5px;">The key is in the instructions: keep the GPT private. New key = the old one stops working (paste the new instructions).</div>` : ''}
        </div>`;
      }).join('')}`;
  };
  window.inboxCopy = async function (what, ch) {
    const c = cfg() || {};
    const text = what === 'sql' ? INBOX_SQL_TEXT : what === 'anon' ? c.anonKey : what === 'schema' ? inboxOpenApi(c.url, ch) : inboxInstructions(ch, keys[ch]);
    try { await navigator.clipboard.writeText(text || ''); if (typeof fxSuccess === 'function') fxSuccess('Copied'); } catch (e) { prompt('Copy this:', text || ''); }
  };
  window.inboxCheck = async function () {
    const c = cfg(); if (!c) return;
    try { await supabaseRpc('inbox_status', { secret: c.secret }); state.missing = false; saveState(); if (typeof fxSuccess === 'function') fxSuccess('Inbox ready'); }
    catch (e) { state.missing = missingFn(e); saveState(); alert(state.missing ? 'The inbox isn\'t in Supabase yet: run the SQL first.' : (e.message || String(e))); }
    render();
  };
  window.inboxMakeKey = async function (ch) {
    const c = cfg(); if (!c) return;
    if (keys[ch] && !confirm('Make a new key? The GPT stops working until you paste its new instructions.')) return;
    const key = newKey(ch);
    try { await supabaseRpc('inbox_set_key', { secret: c.secret, channel: ch, key_hash: await sha256Hex(key) }); }
    catch (e) { state.missing = missingFn(e); saveState(); alert(state.missing ? 'Run the SQL in Supabase first (step 1).' : (e.message || String(e))); render(); return; }
    keys[ch] = key; writeLs(KEYS_KEY, keys);
    data.settings.inboxChannels = Object.assign({}, data.settings.inboxChannels, { [ch]: todayYmd() });
    state.ctxSig = ''; state.missing = false; saveState();
    ui.inboxShow = ch;
    save(); render(); inboxRefresh(true);
  };
  window.inboxTurnOff = async function (ch) {
    const c = cfg(); if (!c || !confirm('Turn it off? The GPT can no longer send anything.')) return;
    try { await supabaseRpc('inbox_drop_key', { secret: c.secret, channel: ch }); } catch (e) { alert(e.message || String(e)); return; }
    delete keys[ch]; writeLs(KEYS_KEY, keys);
    const next = Object.assign({}, data.settings.inboxChannels); delete next[ch]; data.settings.inboxChannels = next;
    save(); render();
  };

  /* ---- Where it shows ---- */
  window.__attention.push(() => {
    const n = openItems().length;
    return n ? [{ key: 'inbox:' + n, icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('receipt', 16)}</span>`,
      name: `${n} from ChatGPT to review`, detail: 'Read from your screenshots and receipts. Nothing is in Trackr until you add it.',
      actions: [{ label: 'Review', onclick: 'closeModal();openInbox()', primary: true }] }] : [];
  });
  window.__addMenu.push({ label: 'Paste from ChatGPT', sub: 'Review what it read', icon: 'copy', go: 'openInboxPaste()' });
  window.__palette.push(add => { add('Actions', 'From ChatGPT', 'Review what your GPTs sent', () => openInbox(), 'receipt'); add('Pages', 'ChatGPT inbox setup', 'Settings → ChatGPT inbox', () => { goPage('settings'); ui.settingsOpenSections = { chatgpt: true }; render(); }, 'settings'); });

  // Fetch at start, when you come back to the app, and every minute while it's open.
  setTimeout(() => inboxRefresh(), 2500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) inboxRefresh(); });
  setInterval(() => { if (!document.hidden) inboxRefresh(); }, 60000);
}
