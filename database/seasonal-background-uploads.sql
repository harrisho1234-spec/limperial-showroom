-- Adds administrator-managed custom seasonal background uploads.
-- Safe to rerun after database/seasonal-promotions.sql.
begin;

alter table public.showroom_promotion_campaigns
  add column if not exists custom_background_path text,
  add column if not exists custom_background_name text,
  add column if not exists custom_background_updated_at timestamptz;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'showroom-seasonal-backgrounds',
  'showroom-seasonal-backgrounds',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public=true,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists showroom_seasonal_backgrounds_manager_select on storage.objects;
create policy showroom_seasonal_backgrounds_manager_select
on storage.objects for select
to authenticated
using (
  bucket_id='showroom-seasonal-backgrounds'
  and (storage.foldername(name))[1]='campaigns'
  and (select public.current_app_role()) in ('super_admin','admin')
);

drop policy if exists showroom_seasonal_backgrounds_manager_insert on storage.objects;
create policy showroom_seasonal_backgrounds_manager_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id='showroom-seasonal-backgrounds'
  and (storage.foldername(name))[1]='campaigns'
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
  and (select public.current_app_role()) in ('super_admin','admin')
);

drop policy if exists showroom_seasonal_backgrounds_manager_update on storage.objects;
create policy showroom_seasonal_backgrounds_manager_update
on storage.objects for update
to authenticated
using (
  bucket_id='showroom-seasonal-backgrounds'
  and (storage.foldername(name))[1]='campaigns'
  and (select public.current_app_role()) in ('super_admin','admin')
)
with check (
  bucket_id='showroom-seasonal-backgrounds'
  and (storage.foldername(name))[1]='campaigns'
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
  and (select public.current_app_role()) in ('super_admin','admin')
);

drop policy if exists showroom_seasonal_backgrounds_manager_delete on storage.objects;
create policy showroom_seasonal_backgrounds_manager_delete
on storage.objects for delete
to authenticated
using (
  bucket_id='showroom-seasonal-backgrounds'
  and (storage.foldername(name))[1]='campaigns'
  and (select public.current_app_role()) in ('super_admin','admin')
);

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
       'international_new_year','chinese_new_year','khmer_new_year',
       'pchum_ben','water_festival','christmas'
     )) then
    raise exception 'Invalid campaign details';
  end if;

  if new.custom_background_path is not null then
    if length(new.custom_background_path) > 500
       or new.custom_background_path not like 'campaigns/%'
       or position('..' in new.custom_background_path) > 0 then
      raise exception 'Invalid custom background path';
    end if;
  end if;
  if new.custom_background_name is not null and length(new.custom_background_name) > 255 then
    raise exception 'Custom background name is too long';
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

commit;
