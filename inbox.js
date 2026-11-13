/* ===================== Claude inbox =====================
 * Its own file, loaded after invest.js and before safety.js.
 *
 * Two Claude projects ("Trackr Budget", "Trackr Investments") read what you send them (receipts,
 * screenshots of a bank or broker app, plain text) and, through a custom connector, drop each
 * transaction into an inbox in your own Supabase:
 *   Claude → connector URL …/functions/v1/trackr-inbox/<inbox key> (the MCP server in
 *   supabase/functions/trackr-inbox/index.ts, an Edge Function) → inbox_add (the SQL in
 *   supabase/migrations/003_trackr_inbox.sql) → Trackr fetches it with your sync secret.
 * Every item waits on the page Money → Inbox: nothing touches your data until you approve it here.
 * Apple Pay payments land in the same inbox (channel 'applepay', sent by an iPhone Shortcut with
 * its own write-only token: applepay.js reads them with walletItem()).
 *   - Budget items: "Add" (ready ones), "Edit" (the expense form, filled in) or "Reject".
 *   - Investment items: a positions screenshot is one card (snapshots.js) that replaces what you
 *     hold at that broker; dividend, deposit and withdrawal open the transaction form filled in.
 *     Buys and sells are no longer recorded (the user's choice, 13 Nov 2026): one still waiting
 *     can only be rejected.
 *   - No connector, or it failed: Claude gives a JSON block you paste in Add → Paste from Claude.
 *
 * The key: one per connector, made here; Supabase only keeps its hash. It can add items to the
 * queue, read back, correct or withdraw the ones still waiting, and read the names Trackr publishes
 * for it (categories, accounts and pockets, brokers, assets: no balances). What you already reviewed
 * is out of its reach, and your own edit of an item stays yours. It lives on this device (localStorage 'trackr-inbox-keys', never synced);
 * data.settings.inboxChannels says the inbox is on, so every device fetches it.
 * Fetched items and answers not sent yet: localStorage 'trackr-inbox'.
 *
 * inboxNormalize(), inboxClean(), inboxMatch(), inboxRepeats(), inboxRoundTrips(), inboxParsePasted() and inboxInstructions() are pure (Node-tested), and the
 * SQL and function texts are kept equal to their files by a test.
 */
// The SQL and the Edge Function, word for word (a test keeps them equal to the files).
const INBOX_SQL_TEXT = String.raw`-- Trackr inbox — Claude (your "Trackr Budget" and "Trackr Investments" projects, through the
-- trackr-inbox connector) drops expenses and trades here; Trackr shows them for review and only
-- adds what you approve.
-- An inbox key can ADD items to this queue, read back, correct or withdraw the ones still waiting,
-- and read the names Trackr published (categories, accounts and pockets, brokers, assets: no
-- balances). It can't read or change your data, or anything already reviewed.
-- Apple Pay: an iPhone Shortcut sends each payment with its own token (add_inbox_item, at the end).
-- That token can only add payments: it reads nothing, and the other functions refuse it.
-- Your sync secret never leaves Trackr. Safe to run on a project that has Trackr's setup SQL, and
-- safe to re-run. (Settings → Claude inbox → "Copy the SQL" gives this same text.)

create table if not exists trackr_inbox_keys (
  key_hash text primary key,                 -- sha256 of the key; the key itself is never stored
  data_id text not null,                     -- the trackr_data row it files into
  channel text not null,                     -- 'claude' (sends to both), 'budget' / 'invest', or 'applepay'
  created_at timestamptz not null default now(),
  unique (data_id, channel)
);
alter table trackr_inbox_keys drop constraint if exists trackr_inbox_keys_channel_check;
alter table trackr_inbox_keys add constraint trackr_inbox_keys_channel_check check (channel in ('claude', 'budget', 'invest', 'applepay'));
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
-- The same Apple Pay payment sent twice is kept once (minute + amount text + shop, see add_inbox_item).
alter table trackr_inbox add column if not exists dedupe_key text;
create unique index if not exists trackr_inbox_dedupe on trackr_inbox (data_id, dedupe_key) where dedupe_key is not null;
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
  if channel not in ('claude', 'budget', 'invest', 'applepay') or key_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad key'; end if;
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

-- The names Claude may see (Trackr sends them; nothing with an amount in it).
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

-- ---- Called by the trackr-inbox connector (with an inbox key) ----
-- The key's row, or the error Claude should see.
create or replace function trackr_inbox_key(inbox_key text)
returns trackr_inbox_keys language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys;
begin
  select * into k from trackr_inbox_keys where key_hash = encode(digest(coalesce(inbox_key, ''), 'sha256'), 'hex');
  if not found or k.channel = 'applepay' then raise exception 'Unknown inbox key. Make a new one in Trackr: Settings → Claude inbox.'; end if;
  return k;
end $$;
revoke all on function trackr_inbox_key(text) from public, anon;

create or replace function inbox_context(inbox_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys := trackr_inbox_key(inbox_key);
begin
  return jsonb_build_object('channel', k.channel, 'today', to_char(now() at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
    'context', coalesce((select context from trackr_inbox_context where data_id = k.data_id), '{}'::jsonb));
end $$;

-- channel: 'budget' or 'invest' (a 'claude' key sends to either; a single-channel key ignores it).
drop function if exists inbox_add(text, jsonb, text);
create or replace function inbox_add(inbox_key text, items jsonb, source text default null, channel text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys := trackr_inbox_key(inbox_key); n integer; open_now integer; ch text;
begin
  ch := case when k.channel = 'claude' then coalesce(nullif(inbox_add.channel, ''), 'budget') else k.channel end;
  if ch not in ('budget', 'invest') then raise exception 'channel must be budget or invest'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'items must be a non-empty array'; end if;
  if jsonb_array_length(items) > 50 then raise exception 'at most 50 items per call'; end if;
  select count(*) into open_now from trackr_inbox where data_id = k.data_id and status = 'new';
  if open_now + jsonb_array_length(items) > 300 then raise exception 'Trackr already has 300 items waiting for review: review them in Trackr first.'; end if;
  insert into trackr_inbox (data_id, channel, item, source)
  select k.data_id, ch, it, left(source, 200) from jsonb_array_elements(items) it
   where jsonb_typeof(it) = 'object' and octet_length(it::text) <= 8000;
  get diagnostics n = row_count;
  return jsonb_build_object('added', n, 'skipped', jsonb_array_length(items) - n, 'waiting_for_review', open_now + n,
    'message', 'Saved in the Trackr inbox. Nothing is added to the accounts until it is approved in Trackr (Action required).');
end $$;

-- What the connector sent. Waiting: all of it. Already reviewed: only id, status, date and name,
-- read-only, so Claude can tell what became of an item without reading amounts back.
create or replace function inbox_find(inbox_key text, status text default 'new', date_from text default null, date_to text default null, source text default null, max_items integer default 100)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys := trackr_inbox_key(inbox_key); st text := coalesce(nullif(inbox_find.status, ''), 'new');
begin
  if st not in ('new', 'added', 'rejected', 'all') then raise exception 'status must be new, added, rejected or all'; end if;
  return coalesce((select jsonb_agg(case when x.status = 'new'
      then jsonb_build_object('id', x.id, 'status', x.status, 'channel', x.channel, 'source', x.source, 'created_at', x.created_at, 'item', x.item)
      else jsonb_build_object('id', x.id, 'status', x.status, 'channel', x.channel, 'date', x.item->'date', 'name', coalesce(x.item->'name', x.item->'asset', x.item->'ticker')) end order by x.created_at)
    from (select * from trackr_inbox i
           where i.data_id = k.data_id and ((k.channel = 'claude' and i.channel <> 'applepay') or i.channel = k.channel)
             and (st = 'all' or i.status = st)
             and (inbox_find.date_from is null or i.item->>'date' >= inbox_find.date_from)
             and (inbox_find.date_to is null or i.item->>'date' <= inbox_find.date_to)
             and (inbox_find.source is null or i.source ilike '%' || inbox_find.source || '%')
           order by i.created_at desc limit least(greatest(coalesce(max_items, 100), 1), 300)) x), '[]'::jsonb);
end $$;

-- Corrects an item still waiting: the fields given replace the same fields, the others stay.
create or replace function inbox_update(inbox_key text, item_id uuid, changes jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys := trackr_inbox_key(inbox_key); out_item jsonb;
begin
  if jsonb_typeof(changes) <> 'object' or changes = '{}'::jsonb then raise exception 'changes must be an object with at least one field'; end if;
  update trackr_inbox i set item = i.item || changes
   where i.id = item_id and i.data_id = k.data_id and ((k.channel = 'claude' and i.channel <> 'applepay') or i.channel = k.channel)
     and i.status = 'new' and octet_length((i.item || changes)::text) <= 8000
  returning i.item into out_item;
  if not found then raise exception 'No item with this id is waiting for review. What was already reviewed in Trackr cannot be changed.'; end if;
  return jsonb_build_object('updated', 1, 'id', item_id, 'item', out_item);
end $$;

-- Takes items still waiting out of the queue. They stay 30 days like anything rejected, then go.
create or replace function inbox_withdraw(inbox_key text, ids uuid[])
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys := trackr_inbox_key(inbox_key); n integer;
begin
  if coalesce(cardinality(ids), 0) not between 1 and 50 then raise exception 'ids must list 1 to 50 items'; end if;
  update trackr_inbox i set status = 'rejected', resolved_at = now()
   where i.id = any(ids) and i.data_id = k.data_id and ((k.channel = 'claude' and i.channel <> 'applepay') or i.channel = k.channel) and i.status = 'new';
  get diagnostics n = row_count;
  return jsonb_build_object('deleted', n, 'skipped', cardinality(ids) - n,
    'message', 'Only items still waiting for review can be deleted. What was already reviewed in Trackr is untouched.');
end $$;

-- ---- Called by the iPhone Shortcut (with the Apple Pay token) ----
-- One payment as Wallet shows it: { amount_raw: '€12,50', merchant, card, occurred_at }. Trackr
-- reads the amount itself (iOS writes it the way your region does). Write-only: it answers
-- {"ok":true,"id":"…"} or {"ok":false,"error":"…"}, nothing else, and never raises, so the
-- Shortcut can check the answer. The ok answer is written without spaces on purpose.
create or replace function add_inbox_item(p_token text, p_item jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys; amt text; merchant text; card text; occ text; at timestamptz; dk text; new_id uuid; open_now integer;
  bad constant text := '{"ok":false,"error":"%s"}';
begin
  if p_token is null or length(p_token) > 200 then return format(bad, 'unknown token')::json; end if;
  select * into k from trackr_inbox_keys where key_hash = encode(digest(p_token, 'sha256'), 'hex') and channel = 'applepay';
  if not found then return format(bad, 'unknown token')::json; end if;
  if p_item is null or jsonb_typeof(p_item) <> 'object' then return format(bad, 'p_item must be an object')::json; end if;
  if octet_length(p_item::text) > 2048 then return format(bad, 'payload too big')::json; end if;
  amt := left(btrim(regexp_replace(coalesce(p_item->>'amount_raw', ''), '\s+', ' ', 'g')), 40);
  merchant := left(btrim(regexp_replace(coalesce(p_item->>'merchant', ''), '\s+', ' ', 'g')), 120);
  card := left(btrim(regexp_replace(coalesce(p_item->>'card', ''), '\s+', ' ', 'g')), 80);
  occ := left(btrim(coalesce(p_item->>'occurred_at', '')), 40);
  if amt = '' then return format(bad, 'amount_raw is missing')::json; end if;
  begin at := case when occ ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' then occ::timestamptz end; exception when others then at := null; end;
  if at is null then
    at := now();
    occ := to_char(now() at time zone 'Europe/Amsterdam', 'YYYY-MM-DD"T"HH24:MI:SS');
  end if;
  dk := md5(to_char(date_trunc('minute', at at time zone 'UTC'), 'YYYY-MM-DD HH24:MI') || '|' || amt || '|' || lower(merchant));
  select id into new_id from trackr_inbox where data_id = k.data_id and dedupe_key = dk;
  if found then return format('{"ok":true,"id":"%s"}', new_id)::json; end if;
  select count(*) into open_now from trackr_inbox where data_id = k.data_id and status = 'new';
  if open_now >= 300 then return format(bad, 'inbox full: review it in Trackr')::json; end if;
  insert into trackr_inbox (data_id, channel, item, source, dedupe_key)
  values (k.data_id, 'applepay', jsonb_strip_nulls(jsonb_build_object('amount_raw', amt, 'merchant', nullif(merchant, ''), 'card', nullif(card, ''), 'occurred_at', occ)), 'Apple Pay', dk)
  on conflict (data_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into new_id;
  if new_id is null then select id into new_id from trackr_inbox where data_id = k.data_id and dedupe_key = dk; end if;
  return format('{"ok":true,"id":"%s"}', new_id)::json;
exception when others then
  return format(bad, 'not saved')::json;
end $$;

revoke all on function inbox_set_key(text, text, text), inbox_drop_key(text, text), inbox_status(text), inbox_set_context(text, jsonb),
  inbox_list(text), inbox_resolve(text, uuid[], text), inbox_context(text), inbox_add(text, jsonb, text, text),
  inbox_find(text, text, text, text, text, integer), inbox_update(text, uuid, jsonb), inbox_withdraw(text, uuid[]), add_inbox_item(text, jsonb) from public;
grant execute on function inbox_set_key(text, text, text), inbox_drop_key(text, text), inbox_status(text), inbox_set_context(text, jsonb),
  inbox_list(text), inbox_resolve(text, uuid[], text), inbox_context(text), inbox_add(text, jsonb, text, text),
  inbox_find(text, text, text, text, text, integer), inbox_update(text, uuid, jsonb), inbox_withdraw(text, uuid[]), add_inbox_item(text, jsonb) to anon;
notify pgrst, 'reload schema';
`;
const INBOX_FUNCTION_TEXT = String.raw`// @ts-nocheck
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

const SERVER = { name: 'trackr-inbox', title: 'Trackr', version: '1.3.1' };
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
    action: { type: 'string', enum: ['dividend', 'deposit', 'withdrawal'], description: 'dividend received; deposit (cash from a bank account to the broker) or withdrawal (back to the bank). Buys and sells are not recorded: send what I hold with add_position_snapshots' },
    date: str('Payment date, YYYY-MM-DD'),
    broker_key: str('The broker key from get_trackr_context (investAccounts[].key)'),
    broker: str('Broker name if no key fits'),
    asset_key: str('The asset key from get_trackr_context (investAccounts[].assets[].key)'),
    ticker: str('Ticker or coin symbol'),
    isin: str('ISIN when shown'),
    asset: str('Asset name'),
    amount: num('The cash amount of the dividend / deposit / withdrawal'),
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
    asset_type: str('For a holding not in get_trackr_context: ETF, stock, bond, commodity or crypto'),
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
    name: 'add_investment_items', title: 'Send dividends and deposits to Trackr',
    description: 'Send dividends, deposits or withdrawals to my Trackr inbox (up to 50 at once). They wait there until I review them in Trackr. Buys and sells are NOT recorded: for what I hold, use add_position_snapshots.',
    inputSchema: itemsInput(INVEST_ITEM),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'add_position_snapshots', title: 'Send my positions to Trackr',
    description: 'Send EVERYTHING one broker shows I hold now (a portfolio / positions overview: quantity and average buy price per holding, up to 50) in ONE call. When I approve it in Trackr it REPLACES what Trackr holds at that broker: new positions are added, quantities and averages updated, and positions missing from the list are removed. So never send a partial list: if the overview spans several screenshots, send all their lines together. No buy or sale is recorded.',
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
      instructions: 'Trackr is my personal finance app. Use get_trackr_context for my category, account and broker ids (and what I hold at each broker), then send what you read with add_budget_items, add_position_snapshots (everything a broker shows I hold now: quantity and average buy price; it replaces what Trackr holds there once I approve) or add_investment_items (dividends, deposits, withdrawals; buys and sells are not recorded). Items wait for my review in Trackr. To correct what still waits, use list_inbox_items, then update_inbox_item or delete_inbox_items. What I already reviewed can only be changed by me, in Trackr.',
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
  // Health check: open the connector link with ?check in a browser. Says the function runs, its
  // version, and whether it reaches the database with this key (nothing else is shown).
  if (req.method === 'GET' && new URL(req.url).searchParams.has('check')) {
    const t0 = Date.now();
    try {
      await rpc(env, fetchFn, 'inbox_context', { inbox_key: key });
      return json(200, { ok: true, server: SERVER.name, version: SERVER.version, database: 'reached, key accepted', ms: Date.now() - t0 });
    } catch (e) {
      return json(200, { ok: false, server: SERVER.name, version: SERVER.version, database: String(e && e.message || e).slice(0, 200), ms: Date.now() - t0 });
    }
  }
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
`;

const INBOX_BUDGET_KINDS = ['expense', 'income', 'transfer'];
const INBOX_INVEST_KINDS = ['buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'snapshot'];

/* One item from Claude → what Trackr would add, and what to check first.
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
  /* A pocket by id or name, inside one account: { main: true } for its main balance. */
  const pocketIn = (a, v) => {
    const k = inboxNameKey(v);
    if (!k) return null;
    if (k === 'main' || k === 'mainbalance' || k === inboxNameKey(a.mainName)) return { main: true };
    return (a.pockets || []).find(p => p.id === str(v, 80) || inboxNameKey(p.name) === k) || null;
  };
  /* No account named: a pocket's name says which, if only one account has it. */
  const pocketAnywhere = v => {
    const hits = (ctx.accounts || []).map(a => ({ a, p: pocketIn(a, v) })).filter(h => h.p && !h.p.main);
    return hits.length === 1 ? hits[0] : null;
  };
  const unknownPockets = [];
  const unknownPocket = (a, name, side) => {
    unknownPockets.push({ accountId: a.id, account: a.name, name, side, mainNamed: !!a.mainName });
    warn(`Unknown pocket: ${name}`, true);
  };
  const result = (kind, form, draft) => {
    const ok = !problems.some(p => p.block);
    return { channel, kind, form, draft, problems, ok, ready: ok && !problems.length, unknownPockets };
  };

  if (channel === 'invest' || INBOX_INVEST_KINDS.includes(kindRaw)) {
    const kind = INBOX_INVEST_KINDS.includes(kindRaw) ? kindRaw : '';
    if (!kind) warn('Unknown action: buy, sell, dividend, deposit or withdrawal?', true);
    const accs = ctx.investAccounts || [];
    const brokerId = str(it.broker_key || it.broker_id, 120), brokerName = str(it.broker || it.account, 80);
    const acc = accs.find(a => brokerId && a.key === brokerId) || accs.find(a => brokerName && low(a.name) === low(brokerName))
      || accs.find(a => brokerName && low(a.name).includes(low(brokerName))) || (accs.length === 1 ? accs[0] : null);
    if (!acc) warn(brokerName ? `No broker called "${brokerName}" in Trackr.` : 'Which broker?', true);
    /* A position from a broker's overview (add_position_snapshots): compared with the holding by snapshots.js. */
    function snapshotItem() {
      const assets = acc ? acc.assets || [] : [];
      const key = str(it.asset_key, 120), tick = low(it.ticker || it.symbol), isin = low(it.isin), nm = low(it.asset || it.asset_name || '');
      const asset = assets.find(a => key && a.key === key) || assets.find(a => isin && low(a.isin) === isin) || assets.find(a => tick && low(a.ticker) === tick)
        || assets.find(a => nm && low(a.name).includes(nm));
      const label = str(it.ticker || it.symbol || it.asset || it.isin, 60);
      // Not in Trackr yet: a new position, made when you update (snapshots.js).
      const qty = num(it.quantity), avg = num(it.avg_price != null ? it.avg_price : it.price), alt = num(it.avg_price_alt);
      if (!(qty >= 0) || !(avg >= 0)) warn('The quantity or the average buy price can\'t be read.', true);
      const altCcy = /^[A-Za-z]{3}$/.test(str(it.alt_currency, 3)) ? str(it.alt_currency, 3).toUpperCase() : '';
      return result('snapshot', 'snapshot', { date, broker: acc ? acc.name : brokerName, accountKey: acc ? acc.key : '', from: asset ? asset.key : '',
        assetLabel: asset ? asset.name : label, ticker: asset ? asset.ticker : label, qty: qty >= 0 ? qty : NaN, avg: avg >= 0 ? avg : NaN, ccy: currency,
        alt: alt > 0 && altCcy ? { avg: alt, ccy: altCcy } : null, isin: str(it.isin, 20), name: str(it.asset || it.asset_name, 80), type: str(it.asset_type, 30), batch: str(it.batch, 80) || `${brokerName || (acc && acc.name) || ''}|${date}`, note });
    }
    if (kind === 'snapshot') return snapshotItem();
    const toEur = (v, c) => (c === 'EUR' || !ctx.toEUR ? v : ctx.toEUR(v, c));
    let qty = num(it.quantity), price = num(it.price), amount = num(it.amount != null ? it.amount : it.total), fee = num(it.fee);
    if (!(fee > 0)) fee = 0;
    if (currency !== 'EUR' && kind !== 'deposit' && kind !== 'withdrawal' && kind !== 'dividend') {
      if (ctx.toEUR) { if (price > 0) price = toEur(price, currency); if (amount > 0) amount = toEur(amount, currency); if (fee > 0) fee = toEur(fee, currency); warn(`Amounts were in ${currency}: changed to EUR at today's rate.`); }
      else warn(`Amounts are in ${currency}.`);
    }
    const base = { date, note: [name, note].filter(Boolean).join(' · ').slice(0, 200), broker: acc ? acc.name : brokerName };
    if (kind === 'buy' || kind === 'sell') {
      warn('Buys and sells aren\'t recorded any more: send a screenshot of your positions instead. Reject this one.', true);
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
    const ref = (id, nm, pocket, side) => {
      const pk = str(pocket, 80), a = accountFor(id, nm);
      if (a) {
        if (!pk) return 'acc:' + a.id;
        const hit = pocketIn(a, pk);
        if (hit) return hit.main ? 'acc:' + a.id : `pk:${a.id}:${hit.id}`;
        unknownPocket(a, pk, side);
        return 'acc:' + a.id;
      }
      const b = (ctx.investAccounts || []).find(x => (id && x.key === id) || (nm && low(x.name) === low(nm)));
      if (b) { if (pk) warn(`${b.name} has no pockets: "${pk}" was left out.`); return b.ref; }
      const only = pocketAnywhere(pk || nm);
      return only ? `pk:${only.a.id}:${only.p.id}` : '';
    };
    draft.from = ref(str(it.from_account_id, 120), it.from_account || it.from, it.from_pocket, 'from');
    draft.to = ref(str(it.to_account_id, 120), it.to_account || it.to, it.to_pocket, 'to');
    if (!draft.from || !draft.to) warn('Where from and where to?', true);
    else if (draft.from === draft.to && !unknownPockets.length) warn('Both sides are the same place: which pocket?', true);
    return result(kind, 'tx', draft);
  }
  const cats = ctx.categories[kind] || [];
  const cat = byIdOrName(cats, str(it.category_id, 80), it.category);
  const sub = cat ? byIdOrName(cat.subcategories, str(it.subcategory_id, 80), it.subcategory) : null;
  if (!cat) warn(it.category ? `No category "${str(it.category, 40)}": pick one.` : 'Pick a category.', true);
  let acc = accountFor(it.account_id, it.account);
  const pocketRaw = str(it.pocket_id || it.pocket, 80);
  const pocketHome = !acc && pocketRaw && !(it.account_id || it.account) ? pocketAnywhere(pocketRaw) : null;
  if (pocketHome) acc = pocketHome.a;
  const fallback = byIdOrName(ctx.accounts, ctx.defaultAccountId, '');
  if (!acc && (it.account_id || it.account)) warn(`No account "${str(it.account || it.account_id, 40)}": ${fallback ? fallback.name : 'pick one'} is used.`, !fallback);
  else if (!acc && !fallback) warn('Which account?', true);
  const pm = byIdOrName(ctx.paymentMethods, str(it.payment_method_id, 80), it.payment_method || it.paid_with);
  const home = acc || fallback;
  const pocket = home && pocketRaw ? pocketIn(home, pocketRaw) : null;
  if (home && pocketRaw && !pocket) unknownPocket(home, pocketRaw, 'pocket');
  return result(kind, 'tx', Object.assign(draft, { categoryId: cat ? cat.id : '', subCategoryId: sub ? sub.id : '', accountId: (home || {}).id || '', pocketId: pocket && !pocket.main ? pocket.id : '', paymentMethodId: pm ? pm.id : '' }));
}

/* What arrives keeps only its own fields: a key starting with _ is Trackr's own (_draft is your
   edit, and would skip every check). */
function inboxClean(item) {
  const out = {};
  Object.keys(item && typeof item === 'object' ? item : {}).forEach(k => { if (k[0] !== '_') out[k] = item[k]; });
  return out;
}

/* What you rejected stays on its tab for 30 days, like the copy on the server. */
function inboxKeptRejected(list, today, days) {
  const from = new Date(new Date(today + 'T00:00:00Z').getTime() - (days || 30) * 864e5).toISOString().slice(0, 10);
  return (list || []).filter(x => x.rejectedOn >= from);
}

/* A name in a form two sources can agree on: no case, accents, spaces or punctuation. */
const inboxNameKey = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/* "Temper" = "Temper (Finqle)", "TradeRepublic" = "Trade Republic", "ALBERT HEIJN 1234" = "Albert Heijn". */
function inboxSameName(a, b) {
  const ka = inboxNameKey(a), kb = inboxNameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (short.length >= 4 && long.includes(short)) return true;
  const first = s => inboxNameKey(String(s).trim().split(/\s+/)[0]);
  const fa = first(a);
  return fa.length >= 4 && fa === first(b);
}
/* Which items are already in Trackr. Each existing transaction answers for one item only, so two
 * €45 transfers and one saved are one match and one new: the closest pairs are taken first.
 * items: [{ id, type, date, amount, currency, name, from?, to?, tol? }]; existing: same, without tol.
 * → { [item id]: { id: existing id, level: 'same' | 'maybe' } } */
function inboxMatch(items, existing, days) {
  const near = days == null ? 3 : days;
  const dayNo = d => Math.round(Date.parse(d + 'T00:00:00Z') / 86400000);
  const pairs = [];
  items.forEach(it => {
    if (!(it.amount > 0)) return;
    const tol = it.tol || 0.005;
    existing.forEach(e => {
      if (e.type !== it.type || (e.currency || 'EUR') !== (it.currency || 'EUR') || Math.abs(e.amount - it.amount) >= tol) return;
      // Transfers are compared by their places, not their names: back the other way is a new one.
      const ends = it.type === 'transfer' && !!it.from && !!it.to && !!e.from && !!e.to;
      if (ends && it.from === e.to && it.to === e.from) return;
      const gap = Math.abs(dayNo(e.date) - dayNo(it.date));
      if (!(gap <= near)) return;
      const similar = ends ? it.from === e.from && it.to === e.to : inboxSameName(it.name, e.name);
      const score = similar ? (gap === 0 ? 3 : gap === 1 ? 2 : 0) : gap === 0 ? 1 : -1;
      if (score >= 0) pairs.push({ item: it.id, other: e.id, score, gap });
    });
  });
  pairs.sort((a, b) => b.score - a.score || a.gap - b.gap);
  const out = {}, taken = new Set();
  pairs.forEach(p => {
    if (out[p.item] || taken.has(p.other)) return;
    taken.add(p.other);
    out[p.item] = { id: p.other, level: p.score >= 2 ? 'same' : 'maybe' };
  });
  return out;
}
/* The same thing sent again in a later batch (batch = when it arrived): two coffees on one
 * statement are two coffees, the same statement sent twice is not.
 * → { [repeated item id]: id of the item it repeats } */
function inboxRepeats(items) {
  const seen = {}, out = {};
  items.slice().sort((a, b) => (a.batch < b.batch ? -1 : a.batch > b.batch ? 1 : 0)).forEach(it => {
    const k = [it.type, it.date, it.amount, it.currency, inboxNameKey(it.name), it.from || '', it.to || ''].join('|');
    const s = seen[k];
    if (!s) seen[k] = { batch: it.batch, left: 1, first: it.id };
    else if (s.batch === it.batch) s.left++;
    else if (s.left > 0) { s.left--; out[it.id] = s.first; }
  });
  return out;
}

/* A move there and back: same day, same amount, the two places swapped, so together they change
 * nothing. Each item pairs once. → [[id, id], …] */
function inboxRoundTrips(items) {
  const moves = items.filter(it => it.type === 'transfer' && it.from && it.to && it.amount > 0), used = new Set(), out = [];
  moves.forEach(a => {
    if (used.has(a.id)) return;
    const b = moves.find(x => x.id !== a.id && !used.has(x.id) && x.date === a.date && x.amount === a.amount && (x.currency || 'EUR') === (a.currency || 'EUR') && x.from === a.to && x.to === a.from);
    if (b) { used.add(a.id); used.add(b.id); out.push([a.id, b.id]); }
  });
  return out;
}

/* Text pasted from Claude → [{ channel, item }]. Takes the JSON block it gave ({"trackr":
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
      .map(x => ({ channel: ch || (INBOX_INVEST_KINDS.includes(String(x.action || x.type || '').toLowerCase()) ? 'invest' : 'budget'), item: inboxClean(x) }));
    if (out.length) return out;
  }
  return [];
}

/* A Claude project's instructions (the key is in the connector's URL, not here). */
function inboxInstructions(channel) {
  const invest = channel === 'invest';
  return (invest ? [
    'You are Trackr Investments. You keep what I hold in my Trackr app up to date with the Trackr connector. About once a month I send screenshots of what a broker shows I hold (Trading 212, Trade Republic…): each one is an UPDATE of my positions there, never trades.',
    '',
    'Every time:',
    '1. Call get_trackr_context once per conversation to get my brokers (investAccounts: key, name), the assets at each one (key, ticker, name, isin; for what I hold there also quantity, avg_price and currency), my bank accounts and today\'s date. Use those keys.',
    '2. An overview of what I hold (positions or portfolio: each holding with how many I own and my average buy price, often with its value and gain) → add_position_snapshots. ONE call per broker with EVERY line: once I approve it, Trackr replaces what it holds at that broker with this list (new positions added, quantities and averages updated, positions not in the list removed). If the overview spans several screenshots, wait until I have sent them all, then send all their lines in that one call. If you think a screenshot is cut off, ask me before sending.',
    '3. Each line: asset_key (match by ISIN first, then ticker, then name), quantity, avg_price (the AVERAGE BUY price per share or coin, never the current price, the value or the gain) and its currency; date = the day the overview shows (today if none). If the broker shows the average in two currencies (e.g. €40.00 and $46.50), send the second as avg_price_alt with alt_currency. A holding not in the context: send its ticker, isin, asset name and asset_type (ETF, stock, bond, commodity or crypto): Trackr adds it as a new position. Leave out values, gains and cash.',
    '4. Buys and sells are NOT recorded in Trackr: if I send an order confirmation or a transaction history, tell me to send a screenshot of my positions instead. Dividends, deposits and withdrawals (cash) can go with add_investment_items: action, date, broker_key, amount, currency, bank_account.',
    '5. Never invent a number; if one is unreadable, leave it out and tell me.',
    '6. Then reply with a short table (asset, quantity, average buy price) and say it waits in Trackr → Inbox: one card for that broker, with what is new, changed and removed. Nothing changes in Trackr until I press Update positions there.',
  ] : [
    'You are Trackr Budget. You file my spending into my Trackr app with the Trackr connector: I send receipts, screenshots of my bank or card apps, photos, or plain text ("12,40 bakery yesterday").',
    '',
    'Every time:',
    '1. Call get_trackr_context once per conversation to get my categories and sub-categories (ids and names), accounts with their pockets, payment methods and today\'s date. Use those ids.',
    '2. Read every transaction: type (expense, income, or transfer between two of my own accounts), date (YYYY-MM-DD; turn "yesterday" etc. into a date from today), amount as a positive number, currency, name (the shop, company or person, short and normally capitalised), the best category_id and subcategory_id, account_id when it is clear which account paid (else leave it out: Trackr uses my main account), pocket_id when it was paid from or into a pocket, payment_method_id when visible, and a short note (e.g. what was bought).',
    '   A move between two pockets of one account is a transfer with from_account and to_account both that account, and from_pocket and to_pocket (the pocket marked default is the main balance). Never file it as an expense or income. If a pocket is not in the context, send its name anyway: Trackr will ask me what to do.',
    '3. Only completed transactions count: skip pending or declined payments, balances, ads and totals. A receipt is ONE expense (its total), not one per line. Never invent an amount.',
    '4. Send everything with ONE add_budget_items call (up to 50 items), with source saying what I sent (e.g. "Revolut screenshot").',
    '5. Then reply with a short table (date, name, amount, category) and say it waits in Trackr → Action required for my review. Nothing is added to my accounts until I approve it there.',
  ]).concat([
    '',
    'If I correct something you filed: while it still waits, find it with list_inbox_items and fix it with update_inbox_item or delete_inbox_items. Once I have reviewed it you cannot change it: tell me what to change in Trackr.',
    `If the Trackr connector is off or fails, give me the items as one JSON code block {"trackr": "${invest ? 'invest' : 'budget'}", "items": [...]} with the same fields${invest ? ' (a position: action "snapshot", broker_key, date, and its fields)' : ''}, so I can paste it in Trackr (Add → Paste from Claude).`,
    'Reply in the language I write in. Keep answers short.',
  ]).join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { INBOX_SQL_TEXT, INBOX_FUNCTION_TEXT, inboxNormalize, inboxClean, inboxSameName, inboxMatch, inboxRepeats, inboxRoundTrips, inboxKeptRejected, inboxParsePasted, inboxInstructions };
} else {
  const STATE_KEY = 'trackr-inbox', KEYS_KEY = 'trackr-inbox-keys';
  const readLs = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { return d; } };
  const writeLs = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: kept in memory only */ } };
  // { items: [{ id, channel, item, source, created_at, local? }], done: { id: 'added' | 'rejected' }, edits: { id: fields you changed here, _draft: the form as you left it }, ctxSig, missing }
  const state = readLs(STATE_KEY, { items: [], done: {}, edits: {}, ctxSig: '', missing: false });
  const keys = readLs(KEYS_KEY, {});
  const saveState = () => writeLs(STATE_KEY, state);
  const channelsOn = () => Object.keys((data.settings && data.settings.inboxChannels) || {}).filter(c => data.settings.inboxChannels[c]);
  const cfg = () => (typeof loadSupabaseSyncConfig === 'function' ? loadSupabaseSyncConfig() : null);
  let busy = false, lastError = '';

  const openItems = () => state.items.filter(x => !state.done[x.id]);
  function ctxForNormalize() {
    return {
      today: todayYmd(), currency: data.settings.defaultCurrency || 'EUR', categories: data.categories,
      accounts: (data.accounts || []).map(a => ({ id: a.id, name: a.name, mainName: a.mainName || '', pockets: (a.pockets || []).map(p => ({ id: p.id, name: p.name })) })), defaultAccountId: typeof defaultMoneyAccountId === 'function' ? defaultMoneyAccountId() : '',
      paymentMethods: (data.paymentMethods || []).map(p => ({ id: p.id, name: p.name })),
      investAccounts: typeof investAccounts === 'function' ? investAccounts().map(acc => ({ key: acc.kind + ':' + acc.id, name: acc.name, ref: investTransferRef(acc),
        assets: tradeableAssets(acc).map(a => { const as = a.key.startsWith('a:') && typeof assetById === 'function' ? assetById(a.key.slice(2)) : null; return { key: a.key, ticker: a.ticker, name: (as && as.name) || a.label, isin: (as && as.isin) || '' }; }) })) : [],
      toEUR: (v, c) => toEUR(v, c),
    };
  }
  /* What Claude may read: names and ids, never an amount (holdings: quantity and average buy price). */
  function publicContext() {
    const c = ctxForNormalize();
    const cats = list => (list || []).map(x => ({ id: x.id, name: x.name, subcategories: (x.subcategories || []).map(s => ({ id: s.id, name: s.name })) }));
    return {
      currency: c.currency, mainAccountId: c.defaultAccountId,
      categories: { expense: cats(data.categories.expense), income: cats(data.categories.income) },
      accounts: (data.accounts || []).map(a => {
        // A finished pocket stays while it holds money: Claude may still see it move out.
        const pockets = (a.pockets || []).filter(p => !p.finishedAt || +p.amountSaved > 0).map(p => ({ id: p.id, name: p.name }));
        return Object.assign({ id: a.id, name: a.name, currency: a.currency || 'EUR' }, pockets.length || a.mainName ? { pockets: [{ id: 'main', name: mainBalanceName(a), default: true }].concat(pockets) } : {});
      }),
      // What you hold at each broker: quantity and average buy price only (your choice, 12 Nov 2026), so
      // Claude can tell a new buy from a position it already knows. No value, no cash.
      paymentMethods: c.paymentMethods, investAccounts: c.investAccounts.map(a => {
        const acc = investAccountByKey(a.key);
        return { key: a.key, name: a.name, assets: a.assets.map(x => { const h = acc && typeof snapContextHolding === 'function' ? snapContextHolding(acc, x.key) : null; return h ? Object.assign({}, x, h) : x; }) };
      }),
    };
  }
  async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function newKey() {
    const b = crypto.getRandomValues(new Uint8Array(24));
    return 'trk_claude_' + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  const missingFn = e => e && (e.status === 404 || /inbox_|function .* does not exist|schema cache/i.test(e.message || ''));

  /* Fetch what waits, send the answers given offline, publish the names if they changed. */
  async function inboxRefresh(force) {
    const c = cfg();
    if (busy || !c || !c.secret || (!channelsOn().length && !force)) return;
    busy = true;
    const openIds = () => openItems().map(x => x.id).join();
    const before = openIds();
    let again = false;
    try {
      const pending = Object.keys(state.done).filter(id => !id.startsWith('local_'));
      for (const status of ['added', 'rejected']) {
        const ids = pending.filter(id => state.done[id] === status);
        if (ids.length) await supabaseRpc('inbox_resolve', { secret: c.secret, ids, status });
      }
      const list = await supabaseRpc('inbox_list', { secret: c.secret }) || [];
      const locals = state.items.filter(x => x.local);
      state.items = list.map(x => ({ id: x.id, channel: x.channel, item: inboxClean(x.item), source: x.source, created_at: x.created_at })).concat(locals);
      // Only what was sent: an answer given while this ran goes out on the next round.
      pending.forEach(id => { delete state.done[id]; });
      Object.keys(state.edits).forEach(id => { if (!state.items.some(x => x.id === id)) delete state.edits[id]; });
      again = Object.keys(state.done).some(id => !id.startsWith('local_'));
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
    if (openIds() !== before || (force && ui.page === 'inbox')) (typeof renderWhenIdle === 'function' ? renderWhenIdle : render)();
    if (again) inboxRefresh();
  }
  window.inboxRefresh = inboxRefresh;
  function resolveItem(id, status, later) {
    if (String(id).startsWith('local_')) state.items = state.items.filter(x => x.id !== id);
    else state.done[id] = status;
    saveState();
    if (!later && !window.__quietBatch) inboxRefresh();
  }

  /* ---- Review: a page like Budget, day by day ---- */
  window.openInbox = function () { goPage('inbox'); inboxRefresh(); };
  // A positions screenshot counts once, however many lines it has.
  window.inboxCount = () => {
    const o = openItems(), snap = x => x.item && x.item.action === 'snapshot';
    const batch = x => x.item.batch || `${x.item.broker_key || x.item.broker || ''}|${x.item.date || ''}`; // as inboxNormalize groups them
    return o.filter(x => !snap(x)).length + new Set(o.filter(snap).map(batch)).size;
  };
  /* The Wallet card names payments came with (for Settings → Apple Pay). */
  window.inboxWalletCards = () => Array.from(new Set(state.items.filter(x => x.channel === 'applepay' && x.item && x.item.card).map(x => String(x.item.card).trim())));
  window.inboxTabOn = () => openItems().length > 0 || channelsOn().length > 0 || ui.page === 'inbox' || rejectedNow().length > 0;
  const rejectedNow = () => inboxKeptRejected(data.inboxRejected, todayYmd());
  const failed = {}; // id → why it couldn't be added in a batch (a transfer bigger than the pocket…)
  /* What you taught Trackr comes first: your rules, then the name you've used before. Claude's
   * category stays for a name only partly known; its account is kept if it named one. */
  function normalized(x, ctx) {
    const wallet = x.channel === 'applepay' && typeof walletItem === 'function' ? walletItem(x.item, walletOpts()) : null;
    const channel = wallet ? 'budget' : x.channel;
    const item = Object.assign({}, wallet ? wallet.item : x.item, state.edits[x.id]);
    if (item._draft) return { channel: x.channel, kind: item._draft.type, form: 'tx', draft: Object.assign({}, item._draft), problems: [], ok: true, ready: true, edited: true, wallet };
    let n = inboxNormalize(item, channel, ctx);
    if (wallet) n = walletChecks(walletGuess(n, item, ctx, x), wallet);
    if (n.form !== 'tx') return n;
    const d = n.draft;
    if (d.type === 'transfer') {
      d.logo = endpointLogo(d.to) || endpointLogo(d.from) || builtinLogoFor(d.comment);
      return n;
    }
    let past = null, ch = null;
    if (!(state.edits[x.id] && state.edits[x.id].category_id)) {
      const rule = typeof ruleForTx === 'function' ? ruleForTx({ name: d.comment, amount: +d.amount || 0, type: d.type, accountId: d.accountId }) : null;
      ch = rule ? ruleChanges(rule, d.type) : null;
      past = learnedTxFor(d.comment, d.type);
      const known = past && (!d.categoryId || txNameKey(past.comment) === txNameKey(d.comment));
      const use = ch && ch.categoryId ? ch : known ? past : null;
      if (use) { item.category_id = use.categoryId; item.subcategory_id = use.subCategoryId || ''; }
      // A Wallet card says its own account (an unknown card stays without one, to check).
      if (past && !wallet && !item.account_id && !item.account && !item.pocket_id && !item.pocket && past.accountId) item.account_id = past.accountId;
      if (past && !item.payment_method_id && past.paymentMethodId) item.payment_method_id = past.paymentMethodId;
      n = inboxNormalize(item, channel, ctx);
      if (wallet) n = walletChecks(walletGuess(n, item, ctx, x), wallet);
      if (ch && ch.comment) n.draft.comment = ch.comment;
      if (ch && ch.nature) n.draft.nature = ch.nature;
    }
    n.draft.logo = txLogoForName(n.draft.comment) || (past && past.logo) || builtinLogoFor(n.draft.comment);
    return n;
  }
  /* Apple Pay: nothing taught Trackr this shop's category yet, so its name may say (Albert Heijn →
     Groceries). Your rules and past names, tried just after, still come first. */
  function walletGuess(n, item, ctx, x) {
    const d = n.draft;
    if (n.form !== 'tx' || d.type !== 'expense' || d.categoryId || (state.edits[x.id] && state.edits[x.id].category_id)) return n;
    const g = walletGuessCategory(d.comment, ctx.categories.expense);
    if (!g) return n;
    item.category_id = g.categoryId; item.subcategory_id = g.subCategoryId;
    return inboxNormalize(item, 'budget', ctx);
  }
  /* What only a payment from Wallet needs to say (the amount it couldn't read, an unknown card…). */
  function walletChecks(n, wallet) {
    const own = wallet.problems, noAmount = own.some(p => /amount/.test(p.text) && p.block);
    n.problems = own.concat(n.problems.filter(p => !(noAmount && p.text === 'No amount.')));
    n.ok = !n.problems.some(p => p.block);
    n.ready = n.ok && !n.problems.length;
    n.wallet = wallet;
    // An unknown card: no account, rather than your main one, until you pick it.
    if (!wallet.linked && n.form === 'tx') { n.draft.accountId = ''; n.draft.pocketId = ''; }
    return n;
  }
  function endpointLogo(ref) {
    const ep = parseTransferRef(ref);
    if (!ep) return '';
    if (ep.kind === 'brk') { const b = brokerById(ep.brokerId); return (b && b.logo) || (b ? builtinLogoFor(b.name) : ''); }
    if (ep.kind === 'cx') return cryptoBrokerLogo(ep.exchange);
    return '';
  }
  /* Everything waiting, with what it is compared with what Trackr already holds:
   * 'same' (already in), 'check' (needs a look), 'new'. */
  function reviewRows() {
    const ctx = ctxForNormalize();
    const rows = openItems().map(x => ({ x, n: normalized(x, ctx) }));
    const keyOf = ({ x, n }) => {
      const d = n.draft, batch = x.created_at;
      if (n.form === 'snapshot') return { id: x.id, batch, type: 'snap:' + x.id, date: d.date, amount: 0, currency: 'EUR', name: '' };
      if (n.form === 'trade') { const total = +d.amount || (+d.qty * +d.price) || 0; return { id: x.id, batch, type: n.kind + ':' + d.from, date: d.date, amount: total, currency: 'EUR', name: d.from, tol: Math.max(0.01, total * 0.002) }; }
      return { id: x.id, batch, type: d.type, date: d.date, amount: +d.amount || 0, currency: d.currency, name: d.comment, from: d.from, to: d.to };
    };
    const txs = (data.budgetTransactions || []).map(t => ({ id: t.id, type: t.type, date: t.date, amount: Math.abs(+t.amount || 0), currency: t.currency || 'EUR', name: t.comment, from: t.from, to: t.to }));
    const trades = (data.investmentTransactions || []).filter(t => t.action === 'Buy' || t.action === 'Sell').map(t => ({ id: t.id, trade: true, type: t.action.toLowerCase() + ':' + t.assetKey, date: t.date, amount: +t.amount || 0, currency: 'EUR', name: t.assetKey }));
    const keys = rows.map(keyOf), existing = txs.concat(trades);
    const found = inboxMatch(keys, existing), twice = inboxRepeats(keys);
    const backAgain = {};
    inboxRoundTrips(keys.filter(k => !found[k.id])).forEach(([a, b]) => { backAgain[a] = b; backAgain[b] = a; });
    rows.forEach(r => {
      const id = r.x.id, m = found[id], first = twice[id], e = state.edits[id];
      r.pair = backAgain[id] || '';
      r.claudeChanged = !!(e && e._seen && e._seen !== JSON.stringify(r.x.item));
      r.other = m ? existing.find(e => e.id === m.id) : null;
      r.twice = !!first && !m;
      const same = (m && m.level === 'same') || (first && found[first] && found[first].level === 'same');
      r.fail = failed[id] || '';
      r.status = same ? 'same' : !r.n.ok || r.n.problems.length || m || first || r.fail || r.pair ? 'check' : 'new';
    });
    return rows;
  }
  const signedEUR = n => { const d = n.draft, v = toEUR(+d.amount || 0, d.currency || 'EUR'); return n.form !== 'tx' ? 0 : d.type === 'income' ? v : d.type === 'expense' ? -v : 0; };
  const sourceName = s => String(s || '').replace(/\s*[—–-]\s*part\s*\d+\s*\/\s*\d+\s*$/i, '').trim() || 'No source';
  const isAddable = r => r.n.form === 'tx' && r.n.ok;
  const isPicked = r => ((ui.ibPick || {})[r.x.id] !== undefined ? ui.ibPick[r.x.id] : r.status !== 'check');
  function tabOf(rows) {
    const has = t => rows.some(r => r.status === t && r.n.form !== 'snapshot');
    return has(ui.ibTab) ? ui.ibTab : ['new', 'check', 'same'].find(has) || 'new';
  }
  function shownRows(rows) {
    // Positions screenshots are cards of their own (snapshots.js), never in a tab.
    const tab = tabOf(rows), inTab = rows.filter(r => r.status === tab && r.n.form !== 'snapshot');
    return ui.ibSource && inTab.some(r => sourceName(r.x.source) === ui.ibSource) ? inTab.filter(r => sourceName(r.x.source) === ui.ibSource) : inTab;
  }
  function itemLine(n) {
    const d = n.draft;
    if (n.form === 'snapshot') return { title: `${d.assetLabel || '?'} · position`, amount: '', cls: '', meta: [d.broker, isFinite(d.qty) ? `${fmtQty(d.qty)} @ ${fmtMoney(+d.avg || 0, d.ccy)}` : ''].filter(Boolean).join(' · ') };
    if (n.form === 'trade') {
      return { title: `${n.kind === 'buy' ? 'Buy' : 'Sell'} ${d.assetLabel || '?'}`, amount: d.amount ? fmtMoney(+d.amount) : d.qty && d.price ? fmtMoney(+d.qty * +d.price) : '—', cls: '',
        meta: [d.qty ? `${d.qty} × ${d.price ? fmtMoney(+d.price) : '?'}` : '', d.broker, d.fee ? `fee ${fmtMoney(+d.fee)}` : ''].filter(Boolean).join(' · ') };
    }
    const cat = d.categoryId ? categoryById(d.type, d.categoryId) : null;
    const sub = cat && d.subCategoryId ? (cat.subcategories || []).find(s => s.id === d.subCategoryId) : null;
    const acc = d.accountId ? accountById(d.accountId) : null;
    const asked = s => (n.unknownPockets || []).find(u => u.side === s);
    const place = (ref, s) => (asked(s) ? `${asked(s).account} · ${asked(s).name} ?` : ref && transferEndpoint(ref) ? transferEndpoint(ref).label : '?');
    /* Inside one account: its name once, then the two pockets. */
    const inner = (ref, s) => { const ep = parseTransferRef(ref) || {}, a = accountById(ep.accountId), pk = ep.pocketId && a && (a.pockets || []).find(p => p.id === ep.pocketId); return asked(s) ? `${asked(s).name} ?` : pk ? pk.name : mainBalanceName(a); };
    const ends = [parseTransferRef(d.from) || {}, parseTransferRef(d.to) || {}];
    const move = ends[0].accountId && ends[0].accountId === ends[1].accountId && accountById(ends[0].accountId)
      ? `${accountById(ends[0].accountId).name} · ${inner(d.from, 'from')} → ${inner(d.to, 'to')}` : `${place(d.from, 'from')} → ${place(d.to, 'to')}`;
    const pocket = asked('pocket') ? `${asked('pocket').name} ?` : (txPocket(d) || {}).name || '';
    return { title: d.comment || (d.type === 'income' ? 'Income' : d.type === 'transfer' ? 'Transfer' : 'Expense'),
      amount: `${d.type === 'income' ? '+' : d.type === 'expense' ? '-' : ''}${d.amount ? fmtMoney(+d.amount, d.currency) : '—'}`, cls: d.type === 'income' ? 'positive' : d.type === 'expense' ? 'negative' : 'ib-move',
      meta: (d.type === 'transfer' ? [move] : [cat ? `${cat.name}${sub ? ' · ' + sub.name : ''}` : '', acc ? acc.name : n.wallet && !n.wallet.linked ? 'No account' : '', pocket]).filter(Boolean).join(' · ') };
  }
  function avatarOf(n) {
    if (n.form === 'tx') return txAvatarHtml(n.draft);
    const acc = n.draft.accountKey ? investAccountByKey(n.draft.accountKey) : null;
    const a = acc ? tradeableAssets(acc).find(x => x.key === n.draft.from) : null;
    return assetLogoHtml(a ? a.logo : '', a ? a.type : 'Stock', 38);
  }
  const categoryPicker = (r, id) => {
    const type = r.n.draft.type, cats = data.categories[type === 'income' ? 'income' : 'expense'] || [];
    return `<select class="ib-fix" aria-label="Category" onchange="inboxSetCategory('${id}',this.value)"><option value="">Pick a category…</option>${cats.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>${(c.subcategories || []).map(s => `<option value="${escHtml(c.id)}|${escHtml(s.id)}">${escHtml(c.name)} · ${escHtml(s.name)}</option>`).join('')}`).join('')}</select>`;
  };
  function rowHtml(r) {
    const { x, n } = r, id = escHtml(x.id), l = itemLine(n), d = n.draft;
    const needsCat = n.form === 'tx' && d.type !== 'transfer' && !d.categoryId;
    const fixes = (n.unknownPockets || []).map((u, i) => `<button class="ib-act" onclick="inboxFixPocket('${id}',${i},'create')">${ic('plus', 14)} Create pocket ${escHtml(u.name)}</button>${u.mainNamed ? '' : `<button class="ib-act" onclick="inboxFixPocket('${id}',${i},'main')">It's the main balance</button>`}`);
    if (r.pair) fixes.push(`<button class="ib-act" title="Together they change nothing. Both move to the Rejected tab." onclick="inboxCancelPair('${id}')">${ic('x', 14)} Reject both</button>`);
    const hints = n.problems.filter(p => !(needsCat && /category/i.test(p.text))).map(p => `<li class="${p.block ? 'block' : ''}">${escHtml(p.text)}</li>`);
    if (r.other) {
      const what = `${escHtml(r.other.name || 'a transaction')}, ${escHtml(shortDay(r.other.date))}`;
      hints.unshift(`<li>${r.status === 'same' ? 'Already in Trackr' : 'Maybe in Trackr'}: ${r.other.trade ? what : `<button class="link-btn" onclick="openTxForm('${escHtml(r.other.id)}')">${what}</button>`}</li>`);
    }
    if (r.twice) hints.unshift(`<li>${x.channel === 'applepay' ? 'Apple Pay' : 'Claude'} sent this twice.</li>`);
    if (r.pair) hints.unshift('<li>A move there and back the same day: together they change nothing.</li>');
    if (r.claudeChanged) hints.push('<li>Claude changed this after your edit. Your version is kept.</li>');
    if (r.fail) hints.unshift(`<li class="block">${escHtml(r.fail)}</li>`);
    if (n.edited) hints.push('<li>Edited by you.</li>');
    const addLabel = r.status === 'new' || !isAddable(r) ? 'Add' : 'Add anyway';
    return `<div class="ib-item ${n.ok ? '' : 'blocked'}" title="${escHtml(x.local ? 'Pasted' : x.source || '')}">
      <input class="ib-tick" type="checkbox" aria-label="Select ${escHtml(l.title)}" ${isPicked(r) ? 'checked' : ''} onchange="inboxPick('${id}',this.checked)">
      <div class="ib-mid">
        <button class="ib-open" onclick="inboxOpen('${id}')" ${n.form === 'trade' ? 'disabled' : ''}>${avatarOf(n)}<span class="ib-txt"><b>${escHtml(l.title)}</b><span>${escHtml(l.meta || '—')}</span></span></button>
        ${n.wallet ? walletLineHtml(n) : ''}
        ${needsCat ? categoryPicker(r, id) : ''}
        ${hints.length ? `<ul class="ib-probs">${hints.join('')}</ul>` : ''}
        ${fixes.length ? `<div class="ib-fixes">${fixes.join('')}</div>` : ''}
      </div>
      <div class="ib-end">
        <b class="num ${l.cls}">${l.amount}</b>
        <span class="ib-btns">
          ${n.form === 'tx' ? `<button class="ib-act on" ${isAddable(r) ? '' : 'disabled title="Fill in what\'s missing first"'} onclick="inboxAdd('${id}')">${ic('check', 14)} ${addLabel}</button>
          <button class="ib-act" title="Change it before it goes in" onclick="inboxOpen('${id}')">${ic('edit', 14)} Edit</button>` : ''}
          <button class="ib-act" title="Don't add it. It moves to the Rejected tab." onclick="inboxReject('${id}')">${ic('x', 14)} Reject</button>
        </span>
      </div>
    </div>`;
  }
  /* Apple Pay · the card · the time · what Wallet wrote, when Trackr cleaned it · ≈ € for another currency. */
  function walletLineHtml(n) {
    const w = n.wallet, d = n.draft, raw = String(w.merchant || '').trim();
    const eur = d.currency && d.currency !== 'EUR' && +d.amount ? `≈ ${fmtMoney(toEUR(+d.amount, d.currency))}` : '';
    const parts = ['Apple Pay', w.card, w.time, raw && raw !== d.comment ? `“${raw}”` : '', eur].filter(Boolean);
    return `<span class="ib-wallet dim">${parts.map(escHtml).join(' · ')}</span>`;
  }
  function rejectedRowHtml({ x, n }) {
    const id = escHtml(x.id), l = itemLine(n);
    return `<div class="ib-item ib-gone">
      <div class="ib-mid"><div class="ib-open">${avatarOf(n)}<span class="ib-txt"><b>${escHtml(l.title)}</b><span>${escHtml(l.meta || '—')}</span></span></div></div>
      <div class="ib-end">
        <b class="num ${l.cls}">${l.amount}</b>
        <span class="ib-btns"><button class="ib-act" onclick="inboxPutBack('${id}')">${ic('refresh', 14)} Put back</button></span>
      </div>
    </div>`;
  }
  function daysHtml(rows, html) {
    const days = {};
    rows.forEach(r => { (days[r.n.draft.date] = days[r.n.draft.date] || []).push(r); });
    return Object.keys(days).sort().reverse().map(date => {
      const net = html ? 0 : days[date].reduce((s, r) => s + signedEUR(r.n), 0);
      return `<div class="row-flex ib-day"><div>${dayLabel(date)}</div>${net ? `<div class="${net > 0 ? 'positive' : 'negative'}">${net > 0 ? '+' : ''}${fmtMoney(net)}</div>` : ''}</div>
        <div class="card ib-card">${days[date].map(html || rowHtml).join('')}</div>`;
    }).join('');
  }
  window.__pageRenderers.inbox = function () {
    const all = reviewRows(), rows = all.filter(r => r.n.form !== 'snapshot'), shown = shownRows(rows), on = channelsOn();
    const cards = typeof snapBatchesHtml === 'function' ? snapBatchesHtml(all) : '', waitingN = rows.length + (typeof snapBatchCount === 'function' ? snapBatchCount(all) : 0);
    const ctx = ctxForNormalize(), gone = rejectedNow().map(x => ({ x, n: normalized(x, ctx) }));
    const tab = ui.ibTab === 'rejected' && gone.length ? 'rejected' : tabOf(rows);
    const count = t => (t === 'rejected' ? gone.length : rows.filter(r => r.status === t).length);
    const waiting = rows.filter(r => r.status !== 'same');
    const sum = sign => waiting.reduce((s, r) => { const v = signedEUR(r.n); return s + (v * sign > 0 ? Math.abs(v) : 0); }, 0);
    const sources = {};
    rows.filter(r => r.status === tab).forEach(r => { const k = sourceName(r.x.source); sources[k] = (sources[k] || 0) + 1; });
    const names = Object.keys(sources);
    const picked = shown.filter(isPicked), adds = picked.filter(isAddable), net = sign => adds.reduce((s, r) => { const v = signedEUR(r.n); return s + (v * sign > 0 ? Math.abs(v) : 0); }, 0);
    const js = v => escHtml(String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
    const labels = { new: 'New', check: 'To check', same: 'Already in Trackr', rejected: 'Rejected' };
    const nothing = `<div class="card"><div class="empty-state"><div class="title">Nothing to review</div><div class="sub">${on.length ? 'Pay with Apple Pay, or send a screenshot or a statement to your Trackr project in Claude: it shows up here.' : 'Set up Apple Pay or Claude in Settings, or paste what Claude gave you.'}</div></div></div>`;
    const ready = rows.filter(r => r.status === 'new' && isAddable(r));
    return `
    <div class="page surface-light">
      <div class="page-head">
        <div><h1 class="page-title">Inbox</h1><div class="page-subtitle">${waitingN ? `${waitingN} waiting · nothing is in Trackr until you add it` : 'Your Apple Pay payments, and what Claude reads from your screenshots'}</div></div>
        <div class="row-flex" style="gap:8px;">
          ${ready.length ? `<button class="btn primary" onclick="inboxAddReady()">${ic('check', 15)} Add all ready (${ready.length})</button>` : ''}
          <button class="btn" onclick="openInboxPaste()">${ic('copy', 15)} Paste</button>
          ${on.length ? '<button class="btn" onclick="inboxRefresh(true)">↻ Check now</button>' : '<button class="btn" onclick="goPage(\'settings\');ui.settingsOpenSections={claude:true};render()">Set up</button>'}
        </div>
      </div>
      ${state.missing ? '<div class="ib-warn">The inbox isn\'t in your Supabase yet: Settings → Claude inbox → step 1.</div>' : lastError ? `<div class="ib-warn">${escHtml(lastError)}</div>` : ''}
      ${cards}
      ${rows.length || gone.length ? `
      ${rows.length ? `<div class="card bt-summary">
        <div><div class="eyebrow">To add</div><b>${waiting.length}</b></div>
        <div><div class="eyebrow">In</div><b class="positive">${fmtMoney(sum(1))}</b></div>
        <div><div class="eyebrow">Out</div><b class="negative">${fmtMoney(sum(-1))}</b></div>
        <div><div class="eyebrow">Already in Trackr</div><b>${count('same')}</b></div>
      </div>` : ''}
      <div class="tab-row ib-tabs">${['new', 'check', 'same'].concat(gone.length ? ['rejected'] : []).map(t => `<button class="tab-btn ${tab === t ? 'active' : ''}" onclick="inboxTab('${t}')">${labels[t]} <span class="ib-n">${count(t)}</span></button>`).join('')}</div>
      ${names.length > 1 ? `<div class="ib-sources"><button class="ib-src ${ui.ibSource && names.includes(ui.ibSource) ? '' : 'on'}" onclick="inboxSource('')">All</button>${names.map(s => `<button class="ib-src ${ui.ibSource === s ? 'on' : ''}" onclick="inboxSource('${js(s)}')">${escHtml(s)} <span class="ib-n">${sources[s]}</span></button>`).join('')}</div>` : names.length ? `<div class="ib-from">${escHtml(names[0])}</div>` : ''}
      ${tab === 'same' ? '<div class="ib-note">These match transactions you already have, each one only once. Reject them, or add the one that really is new.</div>' : ''}
      ${tab === 'rejected' ? `<div class="ib-note">None of these went into Trackr. They stay here for 30 days, then they're deleted. Put one back to review it again.</div>${daysHtml(gone, rejectedRowHtml)}` : !rows.length ? (cards ? '' : nothing) : `${daysHtml(shown)}
      <div class="ib-bar">
        <label class="ib-all"><input class="ib-tick" type="checkbox" aria-label="Select all" ${picked.length === shown.length ? 'checked' : ''} onchange="inboxPickAll(this.checked)"><span>${picked.length} selected</span></label>
        <span class="ib-sum">${adds.length ? [net(1) ? `<span class="positive">+${fmtMoney(net(1))}</span>` : '', net(-1) ? `<span class="negative">-${fmtMoney(net(-1))}</span>` : ''].filter(Boolean).join(' ') : ''}</span>
        <span class="ib-bar-acts">${tab === 'same'
          ? `${adds.length ? `<button class="btn small" onclick="inboxAddPicked()">Add anyway</button>` : ''}<button class="btn small primary" ${picked.length ? '' : 'disabled'} onclick="inboxRejectPicked()">Reject ${picked.length}</button>`
          : `<button class="btn small" ${picked.length ? '' : 'disabled'} onclick="inboxRejectPicked()">Reject ${picked.length}</button><button class="btn small primary" ${adds.length ? '' : 'disabled'} onclick="inboxAddPicked()">Add ${adds.length}</button>`}</span>
      </div>`}` : cards ? '' : nothing}
    </div>`;
  };
  window.inboxTab = function (t) { ui.ibTab = t; render(); };
  window.inboxSource = function (s) { ui.ibSource = s; render(); };
  window.inboxPick = function (id, on) { ui.ibPick = ui.ibPick || {}; ui.ibPick[id] = on; render(); };
  window.inboxPickAll = function (on) { ui.ibPick = ui.ibPick || {}; shownRows(reviewRows()).forEach(r => { ui.ibPick[r.x.id] = on; }); render(); };
  /* The category you pick goes to everything else waiting under that name without one. */
  window.inboxSetCategory = function (id, value) {
    if (!value) return;
    const [category_id, subcategory_id] = value.split('|');
    const rows = reviewRows(), r0 = rows.find(r => r.x.id === id); if (!r0) return;
    const key = txNameKey(r0.n.draft.comment);
    rows.filter(r => r === r0 || (key && r.n.form === 'tx' && r.n.draft.type === r0.n.draft.type && !r.n.draft.categoryId && txNameKey(r.n.draft.comment) === key))
      .forEach(r => { state.edits[r.x.id] = Object.assign({}, state.edits[r.x.id], { category_id, subcategory_id: subcategory_id || '', _seen: JSON.stringify(r.x.item) }); });
    saveState(); render();
  };
  const findItem = id => state.items.find(x => x.id === id);
  const isDone = id => !!state.done[id] || !findItem(id);
  /* Undo puts them back to review, as copies on this device: the server may already have them closed. */
  const putBack = list => {
    const copies = list.map(x => ({ channel: x.channel, item: Object.assign({}, x.item, state.edits[x.id]), source: x.source }));
    return () => {
      const t = new Date().toISOString();
      copies.forEach(c => state.items.push(Object.assign(c, { id: uid('local'), created_at: t, local: true })));
      saveState();
    };
  };
  /* Add as they are: the expense form's own save (same checks, logo, balance, recurring…), with
   * one save and one redraw for all of them, and no popup. What it refuses stays here, with why. */
  function addRows(rows) {
    const before = JSON.stringify(data), done = [], realAlert = window.alert;
    let said = '';
    window.alert = m => { said = m; };
    // Oldest first, then again for what was refused: a later move may fill the pocket it needed.
    let left = rows.slice().sort((a, b) => (a.n.draft.date < b.n.draft.date ? -1 : a.n.draft.date > b.n.draft.date ? 1 : 0));
    try {
      quietBatch(() => {
        for (let moved = true; moved && left.length;) {
          moved = false;
          left = left.filter(r => {
            const id = r.x.id;
            said = ''; delete failed[id];
            ui.modal = { type: 'tx', payload: Object.assign(blankTxDraft(), r.n.draft, { _inboxId: id, step: 1 }) };
            saveTxForm();
            ui.modal = null;
            if (isDone(id)) { done.push(r.x); moved = true; return false; }
            failed[id] = said || 'Trackr could not add this one: open it to see why.';
            return true;
          });
        }
      });
    } finally { window.alert = realAlert; }
    inboxRefresh();
    if (done.length) offerUndo(`${done.length} added`, before, putBack(done));
    render();
  }
  /* Rejected: never in Trackr, kept on its own tab so it can be put back. */
  function rejectRows(rows) {
    const before = JSON.stringify(data), list = rows.map(r => r.x), back = putBack(list), on = todayYmd();
    data.inboxRejected = rejectedNow().concat(list.map(x => ({ id: x.id, channel: x.channel, item: Object.assign({}, x.item, state.edits[x.id]), source: x.source, rejectedOn: on })));
    list.forEach(x => resolveItem(x.id, 'rejected', true));
    save();
    inboxRefresh();
    if (list.length) offerUndo(`${list.length} rejected: not in Trackr, see the Rejected tab`, before, back);
    render();
  }
  window.inboxPutBack = function (id) {
    const x = (data.inboxRejected || []).find(q => q.id === id); if (!x) return;
    data.inboxRejected = data.inboxRejected.filter(q => q !== x);
    state.items.push({ id: uid('local'), channel: x.channel, item: x.item, source: x.source, created_at: new Date().toISOString(), local: true });
    saveState(); save(); render();
    safetyToast('<span>Back in review</span>', { ms: 3000 });
  };
  window.inboxAdd = function (id) {
    const r = reviewRows().find(q => q.x.id === id); if (!r) return;
    if (!isAddable(r)) return inboxOpen(id);
    addRows([r]);
  };
  /* For snapshots.js: the rows, close one item, reject several, and a copy for Undo. */
  window.inboxReviewRows = () => reviewRows();
  window.inboxRejectIds = ids => rejectRows(reviewRows().filter(r => ids.includes(r.x.id)));
  window.inboxResolve = id => resolveItem(id, 'added');
  window.inboxPutBackCopy = id => { const x = findItem(id); return x ? putBack([x]) : null; };
  window.inboxReject = function (id) { const r = reviewRows().find(q => q.x.id === id); if (r) rejectRows([r]); };
  window.inboxCancelPair = function (id) {
    const rows = reviewRows(), r = rows.find(q => q.x.id === id), o = r && rows.find(q => q.x.id === r.pair);
    if (o) rejectRows([r, o]);
  };
  /* An unknown pocket, in one click: make it (it starts empty, so no total moves), or say it's what
     your bank calls the main balance. Everything waiting under that name follows. */
  window.inboxFixPocket = function (id, i, how) {
    const r = reviewRows().find(q => q.x.id === id), u = r && r.n.unknownPockets[i], acc = u && accountById(u.accountId);
    if (!acc) return;
    if (how === 'main') acc.mainName = u.name;
    else {
      if (!Array.isArray(acc.pockets)) acc.pockets = [];
      acc.pockets.push({ id: uid('pk'), icon: '🎯', name: u.name, amountSaved: 0, targetAmount: null, color: POCKET_COLORS[0] });
    }
    save(); render(); inboxRefresh();
    safetyToast(`<span>${how === 'main' ? `${escHtml(u.name)} is the main balance of ${escHtml(acc.name)}` : `Pocket ${escHtml(u.name)} made in ${escHtml(acc.name)}, empty for now`}</span>`, { ms: 4000 });
  };
  /* Everything under New: nothing to check, nothing missing. */
  window.inboxAddReady = function () { addRows(reviewRows().filter(r => r.status === 'new' && isAddable(r))); };
  window.inboxAddPicked = function () { addRows(shownRows(reviewRows()).filter(r => isPicked(r) && isAddable(r))); };
  window.inboxRejectPicked = function () { rejectRows(shownRows(reviewRows()).filter(isPicked)); };
  /* Open it where you'd normally enter it, filled in: nothing goes in until you say so. */
  window.inboxOpen = function (id) {
    const x = findItem(id); if (!x) return;
    const n = normalized(x, ctxForNormalize());
    if (n.form === 'snapshot' || n.form === 'trade') return;
    openTxForm(null, Object.assign({}, n.draft, { _inboxId: id }));
  };
  /* In the form: keep your changes here to add later, or add it now. */
  window.inboxFormActions = () => '<button class="btn" onclick="inboxKeepEdit()">Save changes</button><button class="btn primary" onclick="saveTxForm()">Save and add</button>';
  window.inboxKeepEdit = function () {
    const p = ui.modal.payload, id = p._inboxId, draft = Object.assign({}, p), x = findItem(id);
    delete draft.step; delete draft._inboxId;
    state.edits[id] = Object.assign({}, state.edits[id], { _draft: draft, _seen: x ? JSON.stringify(x.item) : '' });
    delete failed[id];
    saveState(); closeModal();
    const r = reviewRows().find(q => q.x.id === id);
    safetyToast(`<span>Changes saved${r ? `, under ${{ new: 'New', check: 'To check', same: 'Already in Trackr' }[r.status]}` : ''}. Not in Trackr until you add it.</span>`, { ms: 4000 });
  };
  // Saved through the form: that item is done.
  const origSaveTx = window.saveTxForm;
  window.saveTxForm = function () {
    const p = ui.modal && ui.modal.type === 'tx' ? ui.modal.payload : null;
    const id = p && p._inboxId, n0 = (data.budgetTransactions || []).length;
    const r = origSaveTx.apply(this, arguments);
    if (id && (data.budgetTransactions || []).length > n0 && !(ui.modal && ui.modal.payload === p)) resolveItem(id, 'added');
    return r;
  };

  /* ---- Paste (no connector needed) ---- */
  window.openInboxPaste = function () { ui.modal = { type: 'inboxPaste', payload: { text: '', error: '' } }; render(); };
  window.__modalRenderers.inboxPaste = function (p) {
    return `
      <div class="modal-head"><div class="modal-title">Paste from Claude</div><button class="close-x" aria-label="Close" onclick="closeModal()">✕</button></div>
      <p class="dim" style="font-size:13px;margin:0 0 12px;">Paste Claude's answer with its JSON block. The items wait for your review, like the ones the connector sends.</p>
      ${p.error ? `<div class="ib-warn">${escHtml(p.error)}</div>` : ''}
      <label class="field"><span class="label-text">Claude's answer</span><textarea id="ib-paste" rows="8" placeholder='{"trackr": "budget", "items": [ … ]}' oninput="ui.modal.payload.text=this.value">${escHtml(p.text)}</textarea></label>
      <div class="modal-actions"><button class="btn" onclick="openInbox()">Back</button><button class="btn primary" onclick="inboxPasteSave()">Review them</button></div>`;
  };
  window.inboxPasteSave = function () {
    const p = ui.modal.payload, got = inboxParsePasted(p.text);
    if (!got.length) { p.error = 'No items found. Paste the whole answer, with the block that starts with {"trackr"'; render(); return; }
    const t = new Date().toISOString();
    got.forEach(g => state.items.push({ id: uid('local'), channel: g.channel, item: g.item, source: 'pasted', created_at: t, local: true }));
    saveState(); openInbox();
  };

  /* ---- Settings → Claude inbox ---- */
  const fnUrl = c => `${String(c.url || '').replace(/\/+$/, '')}/functions/v1/trackr-inbox/${keys.claude || ''}`;
  window.inboxSettingsHtml = function () {
    const c = cfg();
    if (!c || !c.secret) return `<div class="ib-note">The inbox lives in your Supabase project, so turn on <b>Supabase Sync</b> first (above). You can still paste what Claude gives you: Add → Paste from Claude.</div>`;
    const ref = (String(c.url).match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
    const dash = path => ref ? `<a class="btn small" href="https://supabase.com/dashboard/project/${escHtml(ref)}/${path}" target="_blank" rel="noopener">Open in Supabase ${ic('chevronRight', 14)}</a>` : '';
    const on = channelsOn().length > 0, has = !!keys.claude;
    const copyBtn = (label, what, ch) => `<button class="btn small" onclick="inboxCopy('${what}','${ch || ''}')">${ic('copy', 14)} ${label}</button>`;
    return `
      <div class="ib-note">Send receipts and screenshots to two projects in Claude, <b>Trackr Budget</b> and <b>Trackr Investments</b>. Through a connector, each item waits in <b>Money → Inbox</b> until you add it. Claude only gets an inbox key: it can drop items there, correct or withdraw the ones still waiting, and read your category, account, pocket and asset names. It never sees a balance, and what you've reviewed is out of its reach.</div>
      <div class="ib-step"><b>1. Add the inbox to Supabase</b> <span class="dim">(once)</span>
        <div class="ib-row">${copyBtn('Copy the SQL', 'sql')}${dash('sql/new')}<button class="btn small" onclick="inboxCheck()">Check</button></div>
        <div class="dim" style="font-size:12px;">SQL editor → New query → paste → Run, then Check. After an update, run it again: your data isn't touched.${state.missing ? ' <b>Not there yet.</b>' : ''}</div>
      </div>
      <div class="ib-step"><b>2. Add the connector to Supabase</b> <span class="dim">(once)</span>
        <div class="ib-row">${copyBtn('Copy the function', 'function')}${dash('functions')}</div>
        <div class="dim" style="font-size:12px;">Edge Functions → Deploy a new function → Via editor. Name it <code>trackr-inbox</code>, paste, Deploy. Then in its Details turn off <b>Verify JWT</b> (Claude has no Supabase login) and save. After an update, open the function, replace its code and deploy: <b>Test</b> below says if it's up to date.</div>
      </div>
      <div class="ib-step"><div class="row-flex"><b>3. Connect Claude</b><span class="dim" style="font-size:12px;">${on ? (has ? 'on' : 'on (key made on another device)') : 'off'}</span></div>
        <div class="ib-row">${has ? `${copyBtn('Copy the connector URL', 'url')}<button class="btn small" onclick="inboxTest()">Test</button><button class="btn small ghost" onclick="inboxMakeKey()">New key</button><button class="btn small ghost" onclick="inboxTurnOff()">Turn off</button>`
          : `<button class="btn small primary" onclick="inboxMakeKey()">${on ? 'Make a key on this device' : 'Make the key'}</button>`}</div>
        ${has ? `<div class="dim" style="font-size:12px;">Claude → Settings → Connectors → <b>Add custom connector</b>. Name it <b>Trackr</b>, paste the URL, Add. The key is in the URL: keep it to yourself. New key = paste the new URL in Claude.</div>` : ''}
      </div>
      <div class="ib-step"><b>4. Make the two projects in Claude</b>
        <div class="dim" style="font-size:12px;">Claude → Projects → New project. In its instructions paste:</div>
        <div class="ib-row">${copyBtn('Trackr Budget instructions', 'instructions', 'budget')}${copyBtn('Trackr Investments instructions', 'instructions', 'invest')}</div>
        <div class="dim" style="font-size:12px;">In each chat, the Trackr connector must be on (the tools button under the message box). Then send a screenshot to try.</div>
      </div>`;
  };
  window.inboxCopy = async function (what, ch) {
    const c = cfg() || {};
    const text = what === 'sql' ? INBOX_SQL_TEXT : what === 'function' ? INBOX_FUNCTION_TEXT : what === 'url' ? fnUrl(c) : inboxInstructions(ch);
    try { await navigator.clipboard.writeText(text || ''); if (typeof fxSuccess === 'function') fxSuccess('Copied'); } catch (e) { prompt('Copy this:', text || ''); }
  };
  /* Calls the connector like Claude would (initialize, then the names), from here: says what's
     wrong in plain words (no function, Verify JWT on, the function doesn't start, no answer in
     25 s like Claude's 30-s limit, an older version), else its version and how fast it answered. */
  window.inboxTest = async function () {
    const c = cfg(); if (!c || !keys.claude) return;
    const latest = (INBOX_FUNCTION_TEXT.match(/version: '([\d.]+)'/) || [])[1];
    const t0 = Date.now();
    const post = async (id, method, params) => {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl && setTimeout(() => ctl.abort(), 25000);
      let res;
      try { res = await fetch(fnUrl(c), { method: 'POST', signal: ctl ? ctl.signal : undefined, headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }); }
      catch (e) { throw new Error(e && e.name === 'AbortError' ? 'No answer within 25 seconds, so Claude gives up too. Supabase isn\'t starting the function: paste it again (step 2: Copy the function → Deploy), and check Edge Functions → trackr-inbox → Logs. If the project is paused, restore it.' : 'No answer from the function: is it deployed (step 2)?'); }
      finally { if (timer) clearTimeout(timer); }
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) throw new Error(res.status === 401 ? 'Supabase asks for a login: turn off "Verify JWT" on the trackr-inbox function (step 2).' : res.status === 404 ? 'No trackr-inbox function yet (step 2).' : res.status >= 500 ? `The function doesn't start (Supabase answered ${res.status}). Paste it again (step 2: Copy the function → Deploy) and check Edge Functions → trackr-inbox → Logs. If the project is paused, restore it.` : `The function answered ${res.status}.`);
      return body;
    };
    try {
      const init = await post(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'trackr-test', version: '1' } });
      const version = init.result && init.result.serverInfo && init.result.serverInfo.version;
      const r = await post(2, 'tools/call', { name: 'get_trackr_context', arguments: {} });
      if (r.result && r.result.isError) throw new Error(r.result.content[0].text);
      const tools = await post(3, 'tools/list', {});
      const names = ((tools.result && tools.result.tools) || []).map(t => t.name);
      const old = !names.includes('add_position_snapshots') || (latest && version && version !== latest);
      const ms = Date.now() - t0;
      alert(old ? `Claude can reach your Trackr inbox, but the connector is an older version (${version || '?'}; this Trackr has ${latest}). Redo step 2 to give it the new tools, then remove and add the connector in Claude again.`
        : `It works: Claude can reach your Trackr inbox (connector ${version}, answered in ${ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s'}). If Claude still can't connect, remove the Trackr connector in Claude and add it again.`);
    } catch (e) { alert(e && e.message ? e.message : 'No answer from the function: is it deployed (step 2)?'); }
  };
  window.inboxCheck = async function () {
    const c = cfg(); if (!c) return;
    try { await supabaseRpc('inbox_status', { secret: c.secret }); state.missing = false; saveState(); if (typeof fxSuccess === 'function') fxSuccess('Inbox ready'); }
    catch (e) { state.missing = missingFn(e); saveState(); alert(state.missing ? 'The inbox isn\'t in Supabase yet: run the SQL first.' : (e.message || String(e))); }
    render();
  };
  window.inboxMakeKey = async function () {
    const c = cfg(); if (!c) return;
    const ch = 'claude';
    if (keys[ch] && !confirm('Make a new key? Claude stops reaching Trackr until you paste the new connector URL.')) return;
    const key = newKey();
    try { await supabaseRpc('inbox_set_key', { secret: c.secret, channel: ch, key_hash: await sha256Hex(key) }); }
    catch (e) { state.missing = missingFn(e); saveState(); alert(state.missing ? 'Run the SQL in Supabase first (step 1).' : (e.message || String(e))); render(); return; }
    keys[ch] = key; writeLs(KEYS_KEY, keys);
    data.settings.inboxChannels = Object.assign({}, data.settings.inboxChannels, { [ch]: todayYmd() });
    state.ctxSig = ''; state.missing = false; saveState();
    save(); render(); inboxRefresh(true);
  };
  window.inboxTurnOff = async function () {
    const ch = 'claude';
    const c = cfg(); if (!c || !confirm('Turn it off? Claude can no longer send anything.')) return;
    try { await supabaseRpc('inbox_drop_key', { secret: c.secret, channel: ch }); } catch (e) { alert(e.message || String(e)); return; }
    delete keys[ch]; writeLs(KEYS_KEY, keys);
    const next = Object.assign({}, data.settings.inboxChannels); delete next[ch]; data.settings.inboxChannels = next;
    save(); render();
  };

  /* ---- Where it shows ---- */
  window.__attention.push(() => {
    const n = inboxCount();
    return n ? [{ key: 'inbox:' + n, icon: `<span class="add-ic" style="width:30px;height:30px;">${ic('receipt', 16)}</span>`,
      name: `${n} in your inbox to review`, detail: 'From Apple Pay and Claude. Nothing is in Trackr until you add it.',
      actions: [{ label: 'Review', onclick: 'closeModal();openInbox()', primary: true }] }] : [];
  });
  window.__addMenu.push({ label: 'Paste from Claude', sub: 'Review what it read', icon: 'copy', go: 'openInboxPaste()' });
  window.__palette.push(add => { add('Actions', 'Inbox', 'Review your Apple Pay payments and what Claude sent', () => openInbox(), 'receipt'); add('Pages', 'Claude inbox setup', 'Settings → Claude inbox', () => { goPage('settings'); ui.settingsOpenSections = { claude: true }; render(); }, 'settings'); });

  // Fetch at start, when you come back to the app, and every minute while it's open.
  setTimeout(() => inboxRefresh(), 2500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) inboxRefresh(); });
  setInterval(() => { if (!document.hidden) inboxRefresh(); }, 60000);
}
