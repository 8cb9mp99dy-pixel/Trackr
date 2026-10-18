-- PROPOSAL — not applied. A shared cache of public market data (ECB exchange rates, coin
-- prices) written once a day by a scheduled job, so Trackr opens with fresh rates even when the
-- public APIs are slow. Holds only public numbers — nothing personal — yet stays behind a
-- function like everything else.
create table if not exists trackr_market_cache (
  key text primary key,              -- e.g. 'fx:USD', 'coin:bitcoin'
  value numeric not null,
  as_of timestamptz not null default now()
);
alter table trackr_market_cache enable row level security;

create or replace function get_market_cache(keys text[])
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, jsonb_build_object('value', value, 'asOf', as_of)), '{}'::jsonb)
    from trackr_market_cache where key = any(keys);
$$;
grant execute on function get_market_cache(text[]) to anon;

-- Writes: only with your Trackr sync secret (same check as every other Trackr function), so the
-- scheduled job needs the anon key + that secret — never the service-role key.
create or replace function set_market_cache(secret text, rows jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from trackr_data where id = encode(digest(secret, 'sha256'), 'hex')) then raise exception 'unknown secret'; end if;
  insert into trackr_market_cache (key, value, as_of)
  select r->>'key', (r->>'value')::numeric, now() from jsonb_array_elements(rows) r
   where r->>'key' ~ '^(fx|coin):[A-Za-z0-9_-]{1,40}$' and (r->>'value')::numeric > 0
  on conflict (key) do update set value = excluded.value, as_of = excluded.as_of;
end $$;
revoke all on function set_market_cache(text, jsonb) from public;
grant execute on function set_market_cache(text, jsonb) to anon;
