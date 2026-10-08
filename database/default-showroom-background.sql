-- Adds a permanent showroom default background independent of seasonal campaigns.
-- Priority in the frontend:
-- campaign custom image -> campaign seasonal theme -> default custom image -> normal showroom background.
begin;

create table if not exists public.showroom_background_settings (
  id text primary key default 'default',
  custom_background_path text,
  custom_background_name text,
  custom_background_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint showroom_background_settings_singleton check (id='default'),
  constraint showroom_background_settings_path_check check (
    custom_background_path is null
    or (
      custom_background_path like 'defaults/%'
      and position('..' in custom_background_path)=0
      and length(custom_background_path)<=500
    )
  ),
  constraint showroom_background_settings_name_check check (
    custom_background_name is null or length(custom_background_name)<=255
  )
);

insert into public.showroom_background_settings(id)
values ('default')
on conflict (id) do nothing;

alter table public.showroom_background_settings enable row level security;

revoke all on public.showroom_background_settings from public,anon,authenticated;
grant select on public.showroom_background_settings to anon,authenticated;
grant insert,update on public.showroom_background_settings to authenticated;

drop policy if exists showroom_background_settings_public_read on public.showroom_background_settings;
create policy showroom_background_settings_public_read
on public.showroom_background_settings
for select
to anon,authenticated
using (id='default');

drop policy if exists showroom_background_settings_manager_insert on public.showroom_background_settings;
create policy showroom_background_settings_manager_insert
on public.showroom_background_settings
for insert
to authenticated
with check (
  id='default'
  and (select public.current_app_role()) in ('super_admin','admin')
);

drop policy if exists showroom_background_settings_manager_update on public.showroom_background_settings;
create policy showroom_background_settings_manager_update
on public.showroom_background_settings
for update
to authenticated
using (
  id='default'
  and (select public.current_app_role()) in ('super_admin','admin')
)
with check (
  id='default'
  and (select public.current_app_role()) in ('super_admin','admin')
);

drop policy if exists showroom_default_backgrounds_manager_select on storage.objects;
create policy showroom_default_backgrounds_manager_select
on storage.objects for select
to authenticated
using (
  bucket_id='showroom-seasonal-backgrounds'
  and (storage.foldername(name))[1]='defaults'
  and (select public.current_app_role()) in ('super_admin','admin')
);

drop policy if exists showroom_default_backgrounds_manager_insert on storage.objects;
create policy showroom_default_backgrounds_manager_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id='showroom-seasonal-backgrounds'
  and (storage.foldername(name))[1]='defaults'
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','gif')
  and (select public.current_app_role()) in ('super_admin','admin')
);

drop policy if exists showroom_default_backgrounds_manager_update on storage.objects;
create policy showroom_default_backgrounds_manager_update
on storage.objects for update
to authenticated
using (
  bucket_id='showroom-seasonal-backgrounds'
  and (storage.foldername(name))[1]='defaults'
  and (select public.current_app_role()) in ('super_admin','admin')
)
with check (
  bucket_id='showroom-seasonal-backgrounds'
  and (storage.foldername(name))[1]='defaults'
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','gif')
  and (select public.current_app_role()) in ('super_admin','admin')
);

drop policy if exists showroom_default_backgrounds_manager_delete on storage.objects;
create policy showroom_default_backgrounds_manager_delete
on storage.objects for delete
to authenticated
using (
  bucket_id='showroom-seasonal-backgrounds'
  and (storage.foldername(name))[1]='defaults'
  and (select public.current_app_role()) in ('super_admin','admin')
);

commit;
