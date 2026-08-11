-- Atomic first-login initialization for the five fixed core-sync entity tables.
create or replace function public.initialize_liangli_core_sync(
  p_tasks jsonb,
  p_growth_items jsonb,
  p_goals jsonb,
  p_focus_sessions jsonb,
  p_mood_entries jsonb
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'liangli_core_authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_tasks) <> 'array'
    or jsonb_typeof(p_growth_items) <> 'array'
    or jsonb_typeof(p_goals) <> 'array'
    or jsonb_typeof(p_focus_sessions) <> 'array'
    or jsonb_typeof(p_mood_entries) <> 'array' then
    raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  if exists (select 1 from public.liangli_sync_profiles where user_id = v_owner) then
    raise exception 'liangli_core_already_initialized' using errcode = 'P0001';
  end if;

  delete from public.liangli_tasks where user_id = v_owner;
  delete from public.liangli_growth_items where user_id = v_owner;
  delete from public.liangli_goals where user_id = v_owner;
  delete from public.liangli_focus_sessions where user_id = v_owner;
  delete from public.liangli_mood_entries where user_id = v_owner;

  insert into public.liangli_tasks (id, user_id, payload, client_updated_at, deleted_at)
  select row.id, v_owner, row.payload, row.client_updated_at, row.deleted_at
  from jsonb_to_recordset(p_tasks) as row(id uuid, payload jsonb, client_updated_at bigint, deleted_at timestamptz);
  insert into public.liangli_growth_items (id, user_id, payload, client_updated_at, deleted_at)
  select row.id, v_owner, row.payload, row.client_updated_at, row.deleted_at
  from jsonb_to_recordset(p_growth_items) as row(id uuid, payload jsonb, client_updated_at bigint, deleted_at timestamptz);
  insert into public.liangli_goals (id, user_id, payload, client_updated_at, deleted_at)
  select row.id, v_owner, row.payload, row.client_updated_at, row.deleted_at
  from jsonb_to_recordset(p_goals) as row(id uuid, payload jsonb, client_updated_at bigint, deleted_at timestamptz);
  insert into public.liangli_focus_sessions (id, user_id, payload, client_updated_at, deleted_at)
  select row.id, v_owner, row.payload, row.client_updated_at, row.deleted_at
  from jsonb_to_recordset(p_focus_sessions) as row(id uuid, payload jsonb, client_updated_at bigint, deleted_at timestamptz);
  insert into public.liangli_mood_entries (id, user_id, payload, client_updated_at, deleted_at)
  select row.id, v_owner, row.payload, row.client_updated_at, row.deleted_at
  from jsonb_to_recordset(p_mood_entries) as row(id uuid, payload jsonb, client_updated_at bigint, deleted_at timestamptz);

  insert into public.liangli_sync_profiles (user_id, core_version, initialized_at, updated_at)
  values (v_owner, 1, now(), now());
  return jsonb_build_object('initialized', true);
end;
$$;

revoke all on function public.initialize_liangli_core_sync(jsonb, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.initialize_liangli_core_sync(jsonb, jsonb, jsonb, jsonb, jsonb) from anon;
revoke all on function public.initialize_liangli_core_sync(jsonb, jsonb, jsonb, jsonb, jsonb) from service_role;
grant execute on function public.initialize_liangli_core_sync(jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
