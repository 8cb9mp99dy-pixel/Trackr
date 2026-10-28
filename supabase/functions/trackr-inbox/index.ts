// @ts-nocheck
// Trackr inbox for Claude: a small MCP server, run as a Supabase Edge Function named "trackr-inbox".
// Claude (a custom connector) calls it; it drops what Claude read from your receipts and
// screenshots into the Trackr inbox, where Trackr asks you to review each item.
// Its URL is your project URL + /functions/v1/trackr-inbox/ + your inbox key (Trackr makes it).
// The key can only add to the review queue and read names (no amounts); it is checked by the
// database (003_trackr_inbox.sql), never stored here. No other secret is needed.
// Deploy: Supabase → Edge Functions → Deploy a new function → Via editor → name "trackr-inbox",
// paste this file, Deploy. Then in its settings turn OFF "Verify JWT" (Claude has no Supabase login).

const SERVER = { name: 'trackr-inbox', title: 'Trackr', version: '1.0.0' };
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, authorization' };

const str = d => ({ type: 'string', description: d });
const num = d => ({ type: 'number', description: d });
const BUDGET_ITEM = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['expense', 'income', 'transfer'], description: 'expense, income, or transfer between two of my own accounts' },
    date: str('YYYY-MM-DD'),
    amount: num('Positive amount'),
    currency: str('ISO code, e.g. EUR'),
    name: str('Shop, company or person, short (e.g. "Albert Heijn")'),
    category_id: str('Category id from get_trackr_context (categories.expense / categories.income)'),
    subcategory_id: str('Sub-category id of that category'),
    account_id: str('Account id it was paid from / into (accounts[].id); leave out if unsure'),
    payment_method_id: str('Payment method id (paymentMethods[].id), e.g. card or cash'),
    from_account: str('Transfer only: account or broker name the money leaves'),
    to_account: str('Transfer only: account or broker name it goes to'),
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
const itemsInput = item => ({
  type: 'object',
  properties: { items: { type: 'array', minItems: 1, maxItems: 50, items: item }, source: str('What I sent, e.g. "Revolut screenshot"') },
  required: ['items'],
});
const TOOLS = [
  {
    name: 'get_trackr_context', title: 'Trackr names',
    description: 'My Trackr categories and sub-categories, accounts, payment methods, brokers and the assets at each (ids, names, tickers, ISINs), and today\'s date. Names only: no amounts. Call it once per conversation before adding items, and use its ids.',
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
      instructions: 'Trackr is my personal finance app. Use get_trackr_context for my category, account and broker ids, then send what you read with add_budget_items or add_investment_items. Items wait for my review in Trackr.',
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
