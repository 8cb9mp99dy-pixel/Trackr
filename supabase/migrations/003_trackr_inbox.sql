-- Trackr inbox — Claude (your "Trackr Budget" and "Trackr Investments" projects, through the
-- trackr-inbox connector) drops expenses and trades here; Trackr shows them for review and only
-- adds what you approve.
-- An inbox key can only ADD items to this queue and read the names Trackr published (categories,
-- accounts, brokers, assets: no amounts, no balances). It can't read or change your data.
-- Your sync secret never leaves Trackr. Safe to run on a project that has Trackr's setup SQL, and
-- safe to re-run. (Settings → Claude inbox → "Copy the SQL" gives this same text.)

create table if not exists trackr_inbox_keys (
  key_hash text primary key,                 -- sha256 of the key; the key itself is never stored
  data_id text not null,                     -- the trackr_data row it files into
  channel text not null,                     -- 'claude' (sends to both), or 'budget' / 'invest'
  created_at timestamptz not null default now(),
  unique (data_id, channel)
);
alter table trackr_inbox_keys drop constraint if exists trackr_inbox_keys_channel_check;
alter table trackr_inbox_keys add constraint trackr_inbox_keys_channel_check check (channel in ('claude', 'budget', 'invest'));
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
  if channel not in ('claude', 'budget', 'invest') or key_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad key'; end if;
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
create or replace function inbox_context(inbox_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys;
begin
  select * into k from trackr_inbox_keys where key_hash = encode(digest(coalesce(inbox_key, ''), 'sha256'), 'hex');
  if not found then raise exception 'Unknown inbox key. Make a new one in Trackr: Settings → Claude inbox.'; end if;
  return jsonb_build_object('channel', k.channel, 'today', to_char(now() at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
    'context', coalesce((select context from trackr_inbox_context where data_id = k.data_id), '{}'::jsonb));
end $$;

-- channel: 'budget' or 'invest' (a 'claude' key sends to either; a single-channel key ignores it).
drop function if exists inbox_add(text, jsonb, text);
create or replace function inbox_add(inbox_key text, items jsonb, source text default null, channel text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k trackr_inbox_keys; n integer; open_now integer; ch text;
begin
  select * into k from trackr_inbox_keys where key_hash = encode(digest(coalesce(inbox_key, ''), 'sha256'), 'hex');
  if not found then raise exception 'Unknown inbox key. Make a new one in Trackr: Settings → Claude inbox.'; end if;
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

revoke all on function inbox_set_key(text, text, text), inbox_drop_key(text, text), inbox_status(text), inbox_set_context(text, jsonb),
  inbox_list(text), inbox_resolve(text, uuid[], text), inbox_context(text), inbox_add(text, jsonb, text, text) from public;
grant execute on function inbox_set_key(text, text, text), inbox_drop_key(text, text), inbox_status(text), inbox_set_context(text, jsonb),
  inbox_list(text), inbox_resolve(text, uuid[], text), inbox_context(text), inbox_add(text, jsonb, text, text) to anon;
notify pgrst, 'reload schema';
