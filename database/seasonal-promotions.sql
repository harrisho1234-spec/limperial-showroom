-- Deployment script for the existing Sales Tracking Supabase project.
-- Run in its SQL Editor before releasing campaign management.
-- Does not touch inventory, pricing, quotes, users, or Apps Script saved lists.
begin;

create table if not exists public.showroom_promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  badge text not null default 'SEASONAL OFFER',
  start_date date not null,
  end_date date not null,
  is_enabled boolean not null default false,
  discount_percent numeric,
  theme_preset text,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.showroom_promotion_campaigns
  add column if not exists theme_preset text;

alter table public.showroom_promotion_campaigns
  drop constraint if exists showroom_promotion_campaigns_theme_preset_check;

alter table public.showroom_promotion_campaigns
  add constraint showroom_promotion_campaigns_theme_preset_check
  check (
    theme_preset is null
    or theme_preset in (
      'international_new_year',
      'chinese_new_year',
      'khmer_new_year',
      'pchum_ben',
      'water_festival',
      'christmas'
    )
  );

-- Fail closed if the existing Sales Tracking authorization function is absent.
do $$ begin
  if to_regprocedure('public.current_app_role()') is null then
    raise exception 'Deploy the existing Sales Tracking role function first';
  end if;
end $$;

create or replace function public.validate_showroom_campaign()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare item jsonb; seen text[] := array[]::text[]; item_code text;
begin
  if new.name is null or length(btrim(new.name)) not between 2 and 120
     or new.badge is null or length(new.badge) > 40
     or new.start_date is null or new.end_date is null or new.end_date < new.start_date
     or new.is_enabled is null
     or (new.discount_percent is not null and
       (new.discount_percent < 0 or new.discount_percent > 100))
     or (new.theme_preset is not null and new.theme_preset not in (
       'international_new_year',
       'chinese_new_year',
       'khmer_new_year',
       'pchum_ben',
       'water_festival',
       'christmas'
     )) then
    raise exception 'Invalid campaign details';
  end if;
  if new.items is null or jsonb_typeof(new.items) <> 'array' then
    raise exception 'Campaign items must be an array';
  end if;
  if jsonb_array_length(new.items) not between 1 and 300 then
    raise exception 'Select 1 to 300 campaign products';
  end if;
  for item in select value from jsonb_array_elements(new.items) loop
    item_code := upper(btrim(item->>'code'));
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'code') <> 'string'
       or item_code is null or length(item_code) not between 1 and 120
       or item_code = any(seen) then
      raise exception 'Invalid or duplicate campaign product';
    end if;
    if item ? 'promo_price' and item->'promo_price' <> 'null'::jsonb then
      if jsonb_typeof(item->'promo_price') <> 'number' then
        raise exception 'Promo price must be a number';
      end if;
      if (item->>'promo_price')::numeric < 0 then
        raise exception 'Promo price cannot be negative';
      end if;
    end if;
    seen := array_append(seen,item_code);
  end loop;
  new.name := btrim(new.name);
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.validate_showroom_campaign() from public, anon, authenticated;
drop trigger if exists validate_showroom_campaign on public.showroom_promotion_campaigns;
create trigger validate_showroom_campaign before insert or update
on public.showroom_promotion_campaigns for each row execute function public.validate_showroom_campaign();

alter table public.showroom_promotion_campaigns enable row level security;
revoke all on public.showroom_promotion_campaigns from public, anon, authenticated;
grant select on public.showroom_promotion_campaigns to anon, authenticated;
grant insert, update on public.showroom_promotion_campaigns to authenticated;

-- Replace policies only on this dedicated campaign table. The broken original
-- public policy calls current_app_role(), which anon intentionally cannot execute.
do $$ declare p record; begin
  for p in select policyname from pg_policies
    where schemaname='public' and tablename='showroom_promotion_campaigns'
  loop
    execute format('drop policy %I on public.showroom_promotion_campaigns',p.policyname);
  end loop;
end $$;

create policy showroom_campaign_public_read on public.showroom_promotion_campaigns
for select to anon, authenticated using (
  is_enabled and start_date <= (now() at time zone 'Asia/Phnom_Penh')::date
  and end_date >= (now() at time zone 'Asia/Phnom_Penh')::date
);
-- Role lookup is deliberately limited to authenticated users.
create policy showroom_campaign_manager_read on public.showroom_promotion_campaigns
for select to authenticated using (
  (select public.current_app_role()) in ('super_admin','admin')
);
create policy showroom_campaign_manager_insert on public.showroom_promotion_campaigns
for insert to authenticated with check (
  (select public.current_app_role()) in ('super_admin','admin')
);
-- Preserve the deployed Sales Tracking table's existing author check when present.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='showroom_promotion_campaigns' and column_name='created_by') then
    execute $policy$alter policy showroom_campaign_manager_insert
      on public.showroom_promotion_campaigns with check (
        (select public.current_app_role()) in ('super_admin','admin')
        and created_by = (select auth.uid()))$policy$;
  end if;
end $$;
create policy showroom_campaign_manager_update on public.showroom_promotion_campaigns
for update to authenticated using (
  (select public.current_app_role()) in ('super_admin','admin')
) with check (
  (select public.current_app_role()) in ('super_admin','admin')
);
commit;

