-- Strict semantic validation mirrors account-sync.js v1 entity constraints before any mutation.
create or replace function public.validate_liangli_core_initialization(
  p_tasks jsonb, p_growth_items jsonb, p_goals jsonb, p_focus_sessions jsonb, p_mood_entries jsonb
)
returns void
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_type text; v_rows jsonb; v_row jsonb; v_payload jsonb; v_id text; v_deleted_ms bigint; v_deleted_at timestamptz; v_calendar_day date;
  v_seen uuid[] := '{}'; v_keys text[];
begin
  if p_tasks is null or jsonb_typeof(p_tasks) is distinct from 'array'
    or p_growth_items is null or jsonb_typeof(p_growth_items) is distinct from 'array'
    or p_goals is null or jsonb_typeof(p_goals) is distinct from 'array'
    or p_focus_sessions is null or jsonb_typeof(p_focus_sessions) is distinct from 'array'
    or p_mood_entries is null or jsonb_typeof(p_mood_entries) is distinct from 'array' then
    raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023';
  end if;
  foreach v_type in array array['task','growth','goal','focus','mood'] loop
    v_rows := case v_type when 'task' then p_tasks when 'growth' then p_growth_items when 'goal' then p_goals when 'focus' then p_focus_sessions else p_mood_entries end;
    if v_rows is null or jsonb_typeof(v_rows) is distinct from 'array' or jsonb_array_length(v_rows) > 10000 then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
    for v_row in select value from jsonb_array_elements(v_rows) loop
      if jsonb_typeof(v_row) <> 'object' or (select count(*) from jsonb_object_keys(v_row)) <> 4 or not (v_row ?& array['id','payload','client_updated_at','deleted_at']) or jsonb_typeof(v_row->'id') <> 'string' or jsonb_typeof(v_row->'payload') <> 'object' or jsonb_typeof(v_row->'client_updated_at') <> 'number' or jsonb_typeof(v_row->'deleted_at') not in ('null','string') then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      v_id := v_row->>'id'; v_payload := v_row->'payload';
      -- One shared UUID set rejects duplicate IDs across the five fixed tables.
      if v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or v_id <> v_payload->>'id' or v_id::uuid = any(v_seen) or (v_row->>'client_updated_at') !~ '^[0-9]+$' or (v_row->>'client_updated_at')::numeric > 253402300799999 or octet_length(v_payload::text) > 65536 then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      v_seen := array_append(v_seen, v_id::uuid);
      if not (v_payload ?& array['id','createdAt','updatedAt','deletedAt']) or jsonb_typeof(v_payload->'createdAt') <> 'number' or jsonb_typeof(v_payload->'updatedAt') <> 'number' or jsonb_typeof(v_payload->'deletedAt') not in ('null','number') or (v_payload->>'createdAt') !~ '^[0-9]+$' or (v_payload->>'updatedAt') !~ '^[0-9]+$' or (v_payload->>'createdAt')::numeric > 253402300799999 or (v_payload->>'updatedAt')::numeric > 253402300799999 or (v_payload->>'updatedAt')::bigint < (v_payload->>'createdAt')::bigint then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      if jsonb_typeof(v_payload->'deletedAt') = 'null' then
        if jsonb_typeof(v_row->'deleted_at') <> 'null' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      else
        if (v_payload->>'deletedAt') !~ '^[0-9]+$' or (v_payload->>'deletedAt')::numeric > 253402300799999 or (v_payload->>'deletedAt')::bigint < (v_payload->>'updatedAt')::bigint or jsonb_typeof(v_row->'deleted_at') is distinct from 'string' or v_row->>'deleted_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        begin
          v_deleted_at := (v_row->>'deleted_at')::timestamptz;
          v_deleted_ms := floor(extract(epoch from v_deleted_at) * 1000)::bigint;
        exception when others then
          raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023';
        end;
        if to_char(v_deleted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> v_row->>'deleted_at' or v_deleted_ms <> (v_payload->>'deletedAt')::bigint then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      end if;
      if (v_row->>'client_updated_at')::bigint <> (v_payload->>'updatedAt')::bigint then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      v_keys := case v_type when 'task' then array['id','name','energy','done','dayKey','startTime','endTime','helper','helperRef','helperRefs','pomodoroCount','createdAt','updatedAt','deletedAt'] when 'growth' then array['id','name','energy','rolloverSourceId','createdAt','updatedAt','deletedAt'] when 'goal' then array['id','name','target','cur','unit','createdAt','updatedAt','deletedAt'] when 'focus' then case when v_payload->>'kind' = 'legacy-summary' then array['id','kind','minutes','pomodoroCount','dayKey','weekMinutes','createdAt','updatedAt','deletedAt'] else array['id','kind','minutes','pomodoroCount','dayKey','createdAt','updatedAt','deletedAt'] end else array['id','date','mood','text','createdAt','updatedAt','deletedAt'] end;
      if (select count(*) from jsonb_object_keys(v_payload)) <> cardinality(v_keys) or not ((select array_agg(key) from jsonb_object_keys(v_payload) key) @> v_keys and v_keys @> (select array_agg(key) from jsonb_object_keys(v_payload) key)) then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      if jsonb_typeof(v_payload->'name') = 'string' and (length(v_payload->>'name') = 0 or length(v_payload->>'name') > 1000 or btrim(v_payload->>'name') <> v_payload->>'name') then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      if v_type = 'task' then
        if jsonb_typeof(v_payload->'dayKey') is distinct from 'string' or v_payload->>'dayKey' !~ '^\d{4}-\d{2}-\d{2}$' or left(v_payload->>'dayKey', 4) = '0000' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        begin v_calendar_day := to_date(v_payload->>'dayKey','YYYY-MM-DD'); exception when others then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end;
        if to_char(v_calendar_day,'YYYY-MM-DD') <> v_payload->>'dayKey' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        if jsonb_typeof(v_payload->'name') <> 'string' or jsonb_typeof(v_payload->'energy') <> 'number' or (v_payload->>'energy') !~ '^[0-9]+$' or (v_payload->>'energy')::int > 100 or jsonb_typeof(v_payload->'done') <> 'boolean' or jsonb_typeof(v_payload->'startTime') not in ('null','string') or jsonb_typeof(v_payload->'endTime') not in ('null','string') or jsonb_typeof(v_payload->'helper') <> 'string' or v_payload->>'helper' not in ('none','pomodoro','flashcards','quiz','checklist') or jsonb_typeof(v_payload->'helperRef') not in ('null','string') or (jsonb_typeof(v_payload->'helperRef')='string' and (length(v_payload->>'helperRef')>1000 or btrim(v_payload->>'helperRef')<>v_payload->>'helperRef')) or jsonb_typeof(v_payload->'helperRefs') <> 'object' or jsonb_typeof(v_payload->'pomodoroCount') <> 'number' or (v_payload->>'pomodoroCount') !~ '^[0-9]+$' or (v_payload->>'pomodoroCount')::numeric > 1000000 then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        if jsonb_typeof(v_payload->'startTime') = 'string' and (v_payload->>'startTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (jsonb_typeof(v_payload->'endTime') = 'string' and v_payload->>'startTime' >= v_payload->>'endTime')) then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        if jsonb_typeof(v_payload->'endTime') = 'string' and v_payload->>'endTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        if (select count(*) from jsonb_object_keys(v_payload->'helperRefs')) > 32 or exists(select 1 from jsonb_each(v_payload->'helperRefs') ref where jsonb_typeof(ref.value)<>'string' or length(ref.key)=0 or length(ref.key)>120 or btrim(ref.key)<>ref.key or length(ref.value #>> '{}')=0 or length(ref.value #>> '{}')>1000 or btrim(ref.value #>> '{}')<>ref.value #>> '{}') then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      elsif v_type = 'growth' then
        if jsonb_typeof(v_payload->'name') <> 'string' or jsonb_typeof(v_payload->'energy') <> 'number' or (v_payload->>'energy') !~ '^[0-9]+$' or (v_payload->>'energy')::int > 100 or jsonb_typeof(v_payload->'rolloverSourceId') not in ('null','string') or (jsonb_typeof(v_payload->'rolloverSourceId')='string' and v_payload->>'rolloverSourceId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      elsif v_type = 'goal' then
        if jsonb_typeof(v_payload->'name') <> 'string' or jsonb_typeof(v_payload->'target') <> 'number' or (v_payload->>'target') !~ '^[0-9]+$' or (v_payload->>'target')::numeric < 1 or (v_payload->>'target')::numeric > 1000000000 or jsonb_typeof(v_payload->'cur') <> 'number' or (v_payload->>'cur') !~ '^[0-9]+$' or (v_payload->>'cur')::numeric > (v_payload->>'target')::numeric or jsonb_typeof(v_payload->'unit') <> 'string' or length(v_payload->>'unit') > 120 or btrim(v_payload->>'unit') <> v_payload->>'unit' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      elsif v_type = 'focus' then
        if jsonb_typeof(v_payload->'dayKey') is distinct from 'string' or v_payload->>'dayKey' !~ '^\d{4}-\d{2}-\d{2}$' or left(v_payload->>'dayKey', 4) = '0000' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        begin v_calendar_day := to_date(v_payload->>'dayKey','YYYY-MM-DD'); exception when others then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end;
        if to_char(v_calendar_day,'YYYY-MM-DD') <> v_payload->>'dayKey' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        if jsonb_typeof(v_payload->'kind') <> 'string' or v_payload->>'kind' not in ('pomodoro','legacy-summary') or jsonb_typeof(v_payload->'minutes') <> 'number' or (v_payload->>'minutes') !~ '^[0-9]+$' or (v_payload->>'minutes')::numeric > 1000000000 or jsonb_typeof(v_payload->'pomodoroCount') <> 'number' or (v_payload->>'pomodoroCount') !~ '^[0-9]+$' or (v_payload->>'pomodoroCount')::numeric > 1000000000 then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        if v_payload->>'kind' = 'pomodoro' and ((v_payload->>'minutes')::int <> 25 or (v_payload->>'pomodoroCount')::int <> 1) then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        if v_payload->>'kind' = 'legacy-summary' and (jsonb_typeof(v_payload->'weekMinutes') <> 'array' or jsonb_array_length(v_payload->'weekMinutes') <> 7 or exists(select 1 from jsonb_array_elements(v_payload->'weekMinutes') minute where jsonb_typeof(minute) <> 'number' or minute #>> '{}' !~ '^[0-9]+$' or (minute #>> '{}')::numeric > 1000000000)) then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      else
        if jsonb_typeof(v_payload->'date') is distinct from 'string' or v_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or left(v_payload->>'date', 4) = '0000' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        begin v_calendar_day := to_date(v_payload->>'date','YYYY-MM-DD'); exception when others then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end;
        if to_char(v_calendar_day,'YYYY-MM-DD') <> v_payload->>'date' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
        if jsonb_typeof(v_payload->'mood') <> 'string' or length(v_payload->>'mood') = 0 or length(v_payload->>'mood') > 40 or btrim(v_payload->>'mood') <> v_payload->>'mood' or jsonb_typeof(v_payload->'text') <> 'string' or length(v_payload->>'text') > 2000 or btrim(v_payload->>'text') <> v_payload->>'text' then raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023'; end if;
      end if;
    end loop;
  end loop;
end;
$$;

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
  if p_tasks is null or jsonb_typeof(p_tasks) is distinct from 'array'
    or p_growth_items is null or jsonb_typeof(p_growth_items) is distinct from 'array'
    or p_goals is null or jsonb_typeof(p_goals) is distinct from 'array'
    or p_focus_sessions is null or jsonb_typeof(p_focus_sessions) is distinct from 'array'
    or p_mood_entries is null or jsonb_typeof(p_mood_entries) is distinct from 'array' then
    raise exception 'liangli_core_invalid_initialization_payload' using errcode = '22023';
  end if;

  perform public.validate_liangli_core_initialization(p_tasks, p_growth_items, p_goals, p_focus_sessions, p_mood_entries);

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
revoke all on function public.validate_liangli_core_initialization(jsonb, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.validate_liangli_core_initialization(jsonb, jsonb, jsonb, jsonb, jsonb) from anon;
revoke all on function public.validate_liangli_core_initialization(jsonb, jsonb, jsonb, jsonb, jsonb) from service_role;
