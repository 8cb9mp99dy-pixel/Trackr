// @ts-nocheck
// Trackr inbox for Claude: a small MCP server, run as a Supabase Edge Function named "trackr-inbox".
// Claude (a custom connector) calls it; it drops what Claude read from your receipts and
// screenshots into the Trackr inbox, where Trackr asks you to review each item.
// Its URL is your project URL + /functions/v1/trackr-inbox/ + your inbox key (Trackr makes it).
// The key can add to the review queue, read back, correct or withdraw what still waits, and read
// names, plus the quantity and average buy price of what you hold at each broker (no balances,
// values or cash). It can't touch anything already reviewed. It is checked by the database
// (003_trackr_inbox.sql), never stored here. No other secret is needed.
// Deploy: Supabase → Edge Functions → Deploy a new function → Via editor → name "trackr-inbox",
// paste this file, Deploy. Then in its settings turn OFF "Verify JWT" (Claude has no Supabase login).

const SERVER = { name: 'trackr-inbox', title: 'Trackr', version: '1.2.0' };
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, authorization' };

const str = d => ({ type: 'string', description: d });
const num = d => ({ type: 'number', description: d });
const BUDGET_ITEM = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['expense', 'income', 'transfer'], description: 'expense, income, or transfer between two of my own accounts or pockets' },
    date: str('YYYY-MM-DD'),
    amount: num('Positive amount'),
    currency: str('ISO code, e.g. EUR'),
    name: str('Shop, company or person, short (e.g. "Albert Heijn")'),
    category_id: str('Category id from get_trackr_context (categories.expense / categories.income)'),
    subcategory_id: str('Sub-category id of that category'),
    account_id: str('Account id it was paid from / into (accounts[].id); leave out if unsure'),
    pocket_id: str('Expense or income: the pocket it was paid from / into, id or name (accounts[].pockets). Leave out for the main balance. An unknown name is kept and I am asked about it.'),
    payment_method_id: str('Payment method id (paymentMethods[].id), e.g. card or cash'),
    from_account: str('Transfer only: account or broker name the money leaves'),
    from_pocket: str('Transfer only: the pocket inside from_account, id or name. Leave out for the main balance.'),
    to_account: str('Transfer only: account or broker name it goes to (the same account as from_account for a move between its pockets)'),
    to_pocket: str('Transfer only: the pocket inside to_account, id or name. Leave out for the main balance.'),
    note: str('Short note, e.g. what was bought'),
  },
  required: ['type', 'date', 'amount', 'name'],
};
const INVEST_ITEM = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['buy', 'sell', 'dividend', 'deposit', 'withdrawal'], description: 'buy / sell a position; dividend received; deposit (cash from a bank account to the broker) or withdrawal (back to the bank)' },
    date: str('Trade or payment date, YYYY-MM-DD'),
    broker_key: str('The broker key from get_trackr_context (investAccounts[].key)'),
    broker: str('Broker name if no key fits'),
    asset_key: str('The asset key from get_trackr_context (investAccounts[].assets[].key)'),
    ticker: str('Ticker or coin symbol'),
    isin: str('ISIN when shown'),
    asset: str('Asset name'),
    quantity: num('Number of shares / coins'),
    price: num('Price per share / coin'),
    amount: num('Total value of the trade, or the cash amount of a dividend / deposit / withdrawal'),
    fee: num('Fees paid, if any'),
    currency: str('ISO code, e.g. EUR, USD'),
    bank_account: str('Deposit / withdrawal: the bank account name (accounts[].name)'),
    note: str('Short note'),
  },
  required: ['action', 'date'],
};
const SNAP_POSITION = {
  type: 'object',
  properties: {
    asset_key: str('The asset key from get_trackr_context (investAccounts[].assets[].key)'),
    ticker: str('Ticker or coin symbol'),
    isin: str('ISIN when shown'),
    asset: str('Asset name'),
    quantity: num('How many shares / coins I hold now'),
    avg_price: num('My average buy price per share / coin, as the broker shows it'),
    currency: str('Currency of avg_price, ISO code, e.g. EUR'),
    avg_price_alt: num('A second average buy price when the broker shows one in another currency (e.g. the $ figure next to the € one)'),
    alt_currency: str('Currency of avg_price_alt, e.g. USD'),
  },
  required: ['quantity', 'avg_price'],
};
const itemsInput = item => ({
  type: 'object',
  properties: { items: { type: 'array', minItems: 1, maxItems: 50, items: item }, source: str('What I sent, e.g. "Revolut screenshot"') },
  required: ['items'],
});
const ITEM_FIELDS = Object.assign({}, SNAP_POSITION.properties, INVEST_ITEM.properties, BUDGET_ITEM.properties);
const TOOLS = [
  {
    name: 'get_trackr_context', title: 'Trackr names',
    description: 'My Trackr categories and sub-categories, accounts with their pockets (the one marked default is the main balance), payment methods, brokers and the assets at each (ids, names, tickers, ISINs; for what I hold there, the quantity and average buy price), and today\'s date. No balances, values or cash. Call it once per conversation before adding items, and use its ids.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'add_budget_items', title: 'Send expenses to Trackr',
    description: 'Send expenses, incomes or transfers to my Trackr inbox (up to 50 at once). They wait there until I review them in Trackr: nothing is added to my accounts before I approve it.',
    inputSchema: itemsInput(BUDGET_ITEM),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'add_investment_items', title: 'Send trades to Trackr',
    description: 'Send executed buys, sells, dividends, deposits or withdrawals to my Trackr inbox (up to 50 at once). They wait there until I review them in Trackr: nothing changes before I approve it.',
    inputSchema: itemsInput(INVEST_ITEM),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'add_position_snapshots', title: 'Send my positions to Trackr',
    description: 'Send what one broker shows I hold now (a portfolio / positions overview: quantity and average buy price per holding, up to 50), NOT trades. Trackr compares each one with what it holds and asks me, card by card: more than Trackr = a buy of the difference, less = the holding is corrected (never a sale). Nothing changes before I approve it. For executed orders use add_investment_items.',
    inputSchema: {
      type: 'object',
      properties: {
        broker_key: str('The broker key from get_trackr_context (investAccounts[].key)'),
        broker: str('Broker name if no key fits'),
        date: str('The day the overview shows, YYYY-MM-DD'),
        positions: { type: 'array', minItems: 1, maxItems: 50, items: SNAP_POSITION },
        source: str('What I sent, e.g. "Trading 212 portfolio screenshot"'),
      },
      required: ['date', 'positions'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'list_inbox_items', title: 'List what waits in Trackr',
    description: 'What was sent to my Trackr inbox, newest first, with the ids that update_inbox_item and delete_inbox_items need. Items waiting for review come in full; items already reviewed only say their status, date and name.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['new', 'added', 'rejected', 'all'], description: 'new (waiting for review, the default), added, rejected, or all' },
        date_from: str('Earliest item date, YYYY-MM-DD'),
        date_to: str('Latest item date, YYYY-MM-DD'),
        source: str('Part of the source text, e.g. "Revolut"'),
        limit: num('At most this many, 300 at most (default 100)'),
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'update_inbox_item', title: 'Correct something waiting in Trackr',
    description: 'Correct one item still waiting for my review: the fields given replace the same fields, the others stay. Items already reviewed cannot be changed: ask me to fix those in Trackr.',
    inputSchema: {
      type: 'object',
      properties: { id: str('The item id from list_inbox_items'), changes: { type: 'object', description: 'Only the fields to change, named as in add_budget_items / add_investment_items', properties: ITEM_FIELDS } },
      required: ['id', 'changes'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'delete_inbox_items', title: 'Withdraw items waiting in Trackr',
    description: 'Take items still waiting for my review out of the inbox (up to 50 at once). Items already reviewed are left alone.',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', minItems: 1, maxItems: 50, items: str('An item id from list_inbox_items') } },
      required: ['ids'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];

async function rpc(env, fetchFn, fn, body) {
  const res = await fetchFn(env.url + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: env.anon, Authorization: 'Bearer ' + env.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch (e) { /* not JSON */ }
    if (/could not find the function|schema cache/i.test(msg)) msg = 'this needs the latest Trackr SQL: Settings → Claude inbox → step 1, run it again.';
    throw new Error(msg || 'HTTP ' + res.status);
  }
  return text ? JSON.parse(text) : null;
}

async function callTool(name, args, key, env, fetchFn) {
  if (name === 'get_trackr_context') return rpc(env, fetchFn, 'inbox_context', { inbox_key: key });
  if (name === 'add_budget_items' || name === 'add_investment_items') {
    const items = args && Array.isArray(args.items) ? args.items.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : [];
    if (!items.length) throw new Error('items must be a non-empty list of objects');
    if (items.length > 50) throw new Error('at most 50 items at once');
    const source = args && typeof args.source === 'string' ? args.source.slice(0, 200) : null;
    return rpc(env, fetchFn, 'inbox_add', { inbox_key: key, items, source, channel: name === 'add_budget_items' ? 'budget' : 'invest' });
  }
  if (name === 'add_position_snapshots') {
    const a = args || {}, text = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);
    const list = Array.isArray(a.positions) ? a.positions.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : [];
    if (!list.length) throw new Error('positions must be a non-empty list of objects');
    if (list.length > 50) throw new Error('at most 50 positions at once');
    if (!text(a.broker_key, 120) && !text(a.broker, 80)) throw new Error('broker_key (or broker) is needed: one broker per call');
    // One id for the whole overview: Trackr lists what you hold there that it doesn't show.
    const batch = crypto.randomUUID();
    const items = list.map(p => Object.assign({}, p, { action: 'snapshot', date: text(a.date, 10), broker_key: text(a.broker_key, 120), broker: text(a.broker, 80), batch, batch_size: list.length }));
    const source = text(a.source, 200) || null;
    return rpc(env, fetchFn, 'inbox_add', { inbox_key: key, items, source, channel: 'invest' });
  }
  if (name === 'list_inbox_items') {
    const a = args || {}, text = v => (typeof v === 'string' && v ? v.slice(0, 200) : null);
    return { items: await rpc(env, fetchFn, 'inbox_find', { inbox_key: key, status: text(a.status) || 'new', date_from: text(a.date_from), date_to: text(a.date_to), source: text(a.source), max_items: typeof a.limit === 'number' ? a.limit : 100 }) };
  }
  if (name === 'update_inbox_item') {
    const c = args && args.changes;
    if (!args || typeof args.id !== 'string' || !args.id) throw new Error('id is needed');
    if (!c || typeof c !== 'object' || Array.isArray(c) || !Object.keys(c).length) throw new Error('changes must be an object with at least one field');
    return rpc(env, fetchFn, 'inbox_update', { inbox_key: key, item_id: args.id, changes: c });
  }
  if (name === 'delete_inbox_items') {
    const ids = args && Array.isArray(args.ids) ? args.ids.filter(x => typeof x === 'string' && x) : [];
    if (!ids.length) throw new Error('ids must be a non-empty list');
    if (ids.length > 50) throw new Error('at most 50 ids at once');
    return rpc(env, fetchFn, 'inbox_withdraw', { inbox_key: key, ids });
  }
  const e = new Error('Unknown tool: ' + name);
  e.code = -32602;
  throw e;
}

async function handleMessage(msg, key, env, fetchFn) {
  const id = msg && msg.id !== undefined ? msg.id : null;
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid request' } };
  if (msg.id === undefined || msg.method.startsWith('notifications/')) return null; // nothing to answer
  const reply = result => ({ jsonrpc: '2.0', id, result });
  if (msg.method === 'initialize') {
    const asked = msg.params && msg.params.protocolVersion;
    return reply({
      protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER,
      instructions: 'Trackr is my personal finance app. Use get_trackr_context for my category, account and broker ids (and what I hold at each broker), then send what you read with add_budget_items or add_investment_items (executed trades), or add_position_snapshots (what a broker shows I hold now: quantity and average buy price). Items wait for my review in Trackr. To correct what still waits, use list_inbox_items, then update_inbox_item or delete_inbox_items. What I already reviewed can only be changed by me, in Trackr.',
    });
  }
  if (msg.method === 'ping') return reply({});
  if (msg.method === 'tools/list') return reply({ tools: TOOLS });
  if (msg.method === 'tools/call') {
    const p = msg.params || {};
    try {
      const out = await callTool(p.name, p.arguments || {}, key, env, fetchFn);
      return reply({ content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out && typeof out === 'object' && !Array.isArray(out) ? out : undefined });
    } catch (e) {
      if (e.code === -32602) return { jsonrpc: '2.0', id, error: { code: -32602, message: e.message } };
      return reply({ content: [{ type: 'text', text: 'Trackr inbox: ' + e.message }], isError: true });
    }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + msg.method } };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) });

async function handle(req, env, fetchFn) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const key = decodeURIComponent(parts[parts.length - 1] || '');
  if (!/^trk_[A-Za-z0-9_-]{20,200}$/.test(key)) return json(404, { error: 'The URL must end with your inbox key: …/trackr-inbox/<key> (Trackr → Settings → Claude inbox).' });
  if (req.method !== 'POST') return new Response('Trackr inbox (MCP). Add this URL to Claude as a custom connector.', { status: 405, headers: Object.assign({ Allow: 'POST, OPTIONS' }, CORS) });
  let body;
  try { body = await req.json(); } catch (e) { return json(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  const msgs = Array.isArray(body) ? body : [body];
  const out = [];
  for (const m of msgs) {
    const r = await handleMessage(m, key, env, fetchFn);
    if (r) out.push(r);
  }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return json(200, Array.isArray(body) ? out : out[0]);
}

if (typeof Deno !== 'undefined') {
  Deno.serve(req => handle(req, { url: Deno.env.get('SUPABASE_URL'), anon: Deno.env.get('SUPABASE_ANON_KEY') }, fetch));
}
if (typeof module !== 'undefined') module.exports = { handle, TOOLS };
