-- Trackr inbox — Claude (your "Trackr Budget" and "Trackr Investments" projects, through the
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
