begin;

do $$
declare
  v_table text;
  v_out_of_range bigint;
begin
  foreach v_table in array array[
    'liangli_tasks',
    'liangli_growth_items',
    'liangli_goals',
    'liangli_focus_sessions',
    'liangli_mood_entries'
  ] loop
    execute format(
      'select count(*) from public.%I where client_updated_at < 0 or client_updated_at > 253402300799999',
      v_table
    ) into v_out_of_range;
    if v_out_of_range > 0 then
      raise exception
        'manual remediation required: public.% has % client_updated_at value(s) outside 0..253402300799999',
        v_table,
        v_out_of_range
        using errcode = '22023';
    end if;
  end loop;
end
$$;

alter table public.liangli_tasks
  drop constraint if exists liangli_tasks_client_updated_at_check,
  add constraint liangli_tasks_client_updated_at_canonical_check
    check (client_updated_at between 0 and 253402300799999);

alter table public.liangli_growth_items
  drop constraint if exists liangli_growth_items_client_updated_at_check,
  add constraint liangli_growth_items_client_updated_at_canonical_check
    check (client_updated_at between 0 and 253402300799999);

alter table public.liangli_goals
  drop constraint if exists liangli_goals_client_updated_at_check,
  add constraint liangli_goals_client_updated_at_canonical_check
    check (client_updated_at between 0 and 253402300799999);

alter table public.liangli_focus_sessions
  drop constraint if exists liangli_focus_sessions_client_updated_at_check,
  add constraint liangli_focus_sessions_client_updated_at_canonical_check
    check (client_updated_at between 0 and 253402300799999);

alter table public.liangli_mood_entries
  drop constraint if exists liangli_mood_entries_client_updated_at_check,
  add constraint liangli_mood_entries_client_updated_at_canonical_check
    check (client_updated_at between 0 and 253402300799999);

commit;
