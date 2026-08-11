-- Core sync data is owned exclusively by the authenticated user.
create table if not exists public.liangli_sync_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  core_version integer not null default 1 check (core_version between 1 and 2147483647),
  initialized_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.liangli_tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  client_updated_at bigint not null check (client_updated_at between 0 and 9007199254740991),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.liangli_growth_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  client_updated_at bigint not null check (client_updated_at between 0 and 9007199254740991),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.liangli_goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  client_updated_at bigint not null check (client_updated_at between 0 and 9007199254740991),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.liangli_focus_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  client_updated_at bigint not null check (client_updated_at between 0 and 9007199254740991),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.liangli_mood_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  client_updated_at bigint not null check (client_updated_at between 0 and 9007199254740991),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_liangli_core_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.client_updated_at <= old.client_updated_at then
    return old;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_liangli_sync_profile_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists liangli_sync_profiles_updated_at on public.liangli_sync_profiles;
create trigger liangli_sync_profiles_updated_at before update on public.liangli_sync_profiles
for each row execute function public.set_liangli_sync_profile_updated_at();
drop trigger if exists liangli_tasks_updated_at on public.liangli_tasks;
create trigger liangli_tasks_updated_at before update on public.liangli_tasks
for each row execute function public.set_liangli_core_updated_at();
drop trigger if exists liangli_growth_items_updated_at on public.liangli_growth_items;
create trigger liangli_growth_items_updated_at before update on public.liangli_growth_items
for each row execute function public.set_liangli_core_updated_at();
drop trigger if exists liangli_goals_updated_at on public.liangli_goals;
create trigger liangli_goals_updated_at before update on public.liangli_goals
for each row execute function public.set_liangli_core_updated_at();
drop trigger if exists liangli_focus_sessions_updated_at on public.liangli_focus_sessions;
create trigger liangli_focus_sessions_updated_at before update on public.liangli_focus_sessions
for each row execute function public.set_liangli_core_updated_at();
drop trigger if exists liangli_mood_entries_updated_at on public.liangli_mood_entries;
create trigger liangli_mood_entries_updated_at before update on public.liangli_mood_entries
for each row execute function public.set_liangli_core_updated_at();

create index if not exists liangli_tasks_owner_updated on public.liangli_tasks(user_id, client_updated_at);
create index if not exists liangli_tasks_owner_deleted on public.liangli_tasks(user_id, deleted_at);
create index if not exists liangli_growth_items_owner_updated on public.liangli_growth_items(user_id, client_updated_at);
create index if not exists liangli_growth_items_owner_deleted on public.liangli_growth_items(user_id, deleted_at);
create index if not exists liangli_goals_owner_updated on public.liangli_goals(user_id, client_updated_at);
create index if not exists liangli_goals_owner_deleted on public.liangli_goals(user_id, deleted_at);
create index if not exists liangli_focus_sessions_owner_updated on public.liangli_focus_sessions(user_id, client_updated_at);
create index if not exists liangli_focus_sessions_owner_deleted on public.liangli_focus_sessions(user_id, deleted_at);
create index if not exists liangli_mood_entries_owner_updated on public.liangli_mood_entries(user_id, client_updated_at);
create index if not exists liangli_mood_entries_owner_deleted on public.liangli_mood_entries(user_id, deleted_at);

alter table public.liangli_sync_profiles enable row level security;
alter table public.liangli_tasks enable row level security;
alter table public.liangli_growth_items enable row level security;
alter table public.liangli_goals enable row level security;
alter table public.liangli_focus_sessions enable row level security;
alter table public.liangli_mood_entries enable row level security;

revoke all on public.liangli_sync_profiles from anon;
revoke all on public.liangli_tasks from anon;
revoke all on public.liangli_growth_items from anon;
revoke all on public.liangli_goals from anon;
revoke all on public.liangli_focus_sessions from anon;
revoke all on public.liangli_mood_entries from anon;
grant select, insert, update, delete on public.liangli_sync_profiles to authenticated;
grant select, insert, update, delete on public.liangli_tasks to authenticated;
grant select, insert, update, delete on public.liangli_growth_items to authenticated;
grant select, insert, update, delete on public.liangli_goals to authenticated;
grant select, insert, update, delete on public.liangli_focus_sessions to authenticated;
grant select, insert, update, delete on public.liangli_mood_entries to authenticated;

create policy "owners select liangli_sync_profiles" on public.liangli_sync_profiles for select using (auth.uid() = user_id);
create policy "owners insert liangli_sync_profiles" on public.liangli_sync_profiles for insert with check (auth.uid() = user_id);
create policy "owners update liangli_sync_profiles" on public.liangli_sync_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owners delete liangli_sync_profiles" on public.liangli_sync_profiles for delete using (auth.uid() = user_id);

create policy "owners select liangli_tasks" on public.liangli_tasks for select using (auth.uid() = user_id);
create policy "owners insert liangli_tasks" on public.liangli_tasks for insert with check (auth.uid() = user_id);
create policy "owners update liangli_tasks" on public.liangli_tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owners delete liangli_tasks" on public.liangli_tasks for delete using (auth.uid() = user_id);

create policy "owners select liangli_growth_items" on public.liangli_growth_items for select using (auth.uid() = user_id);
create policy "owners insert liangli_growth_items" on public.liangli_growth_items for insert with check (auth.uid() = user_id);
create policy "owners update liangli_growth_items" on public.liangli_growth_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owners delete liangli_growth_items" on public.liangli_growth_items for delete using (auth.uid() = user_id);

create policy "owners select liangli_goals" on public.liangli_goals for select using (auth.uid() = user_id);
create policy "owners insert liangli_goals" on public.liangli_goals for insert with check (auth.uid() = user_id);
create policy "owners update liangli_goals" on public.liangli_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owners delete liangli_goals" on public.liangli_goals for delete using (auth.uid() = user_id);

create policy "owners select liangli_focus_sessions" on public.liangli_focus_sessions for select using (auth.uid() = user_id);
create policy "owners insert liangli_focus_sessions" on public.liangli_focus_sessions for insert with check (auth.uid() = user_id);
create policy "owners update liangli_focus_sessions" on public.liangli_focus_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owners delete liangli_focus_sessions" on public.liangli_focus_sessions for delete using (auth.uid() = user_id);

create policy "owners select liangli_mood_entries" on public.liangli_mood_entries for select using (auth.uid() = user_id);
create policy "owners insert liangli_mood_entries" on public.liangli_mood_entries for insert with check (auth.uid() = user_id);
create policy "owners update liangli_mood_entries" on public.liangli_mood_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owners delete liangli_mood_entries" on public.liangli_mood_entries for delete using (auth.uid() = user_id);
