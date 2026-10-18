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
-- Writes come only from the scheduled job using the service role (see
-- docs/integrations/price-fx-cache.yml); anon can't write.
