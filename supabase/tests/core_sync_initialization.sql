-- Authored acceptance tests for a disposable Supabase/Postgres database; not executed by this repository.
begin;
create extension if not exists pgtap;
select plan(21);

create or replace function pg_temp.core_initialization_task(p_day text, p_timestamp bigint, p_deleted_at text default null)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(jsonb_build_object(
    'id', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'payload', jsonb_build_object(
      'id', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'name', 'fixture', 'energy', 25, 'done', false,
      'dayKey', p_day, 'startTime', null, 'endTime', null, 'helper', 'none', 'helperRef', null,
      'helperRefs', '{}'::jsonb, 'pomodoroCount', 0, 'createdAt', p_timestamp, 'updatedAt', p_timestamp,
      'deletedAt', case when p_deleted_at is null then null::bigint else p_timestamp end
    ),
    'client_updated_at', p_timestamp,
    'deleted_at', p_deleted_at
  ));
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'initializer@example.test', '', now(), now())
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Invalid inputs are rejected before any delete; the preserved orphan proves rollback/no mutation.
insert into public.liangli_tasks (id, user_id, payload, client_updated_at)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', auth.uid(), '{"state":"orphan"}', 1);
select throws_ok(
  $$select public.initialize_liangli_core_sync(null::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'SQL NULL p_tasks is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync('[]'::jsonb, null::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'SQL NULL p_growth_items is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync('[]'::jsonb, '[]'::jsonb, null::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'SQL NULL p_goals is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync('[]'::jsonb, '[]'::jsonb, '[]'::jsonb, null::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'SQL NULL p_focus_sessions is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync('[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, null::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'SQL NULL p_mood_entries is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync(
    '[{"id":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1","payload":{"id":"dddddddd-dddd-4ddd-8ddd-ddddddddddd1"},"client_updated_at":2,"deleted_at":null}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  )$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'id mismatch is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync('[{"id":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1","payload":{},"client_updated_at":2,"deleted_at":null,"extra":true}]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'extra key or wrong type is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync('[{"id":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1","payload":{"id":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1","deletedAt":2},"client_updated_at":2,"deleted_at":null}]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'tombstone mismatch is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync('[{"id":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1","payload":{},"client_updated_at":2,"deleted_at":null}]'::jsonb, '[{"id":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1","payload":{},"client_updated_at":2,"deleted_at":null}]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'cross-table duplicate is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync(jsonb_build_array(jsonb_build_object('id','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','payload',jsonb_build_object('id','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','name',repeat('x',70000)),'client_updated_at',2,'deleted_at',null)), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'oversize payload is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync(pg_temp.core_initialization_task('2026-02-29', 1700000000000), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'nonleap February day is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync(pg_temp.core_initialization_task('2026-04-31', 1700000000000), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'April 31 is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync(pg_temp.core_initialization_task('0000-01-01', 1700000000000), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'year zero is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync(pg_temp.core_initialization_task('+010000-01-01', 1700000000000), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'extended calendar year is rejected before deletes'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync(pg_temp.core_initialization_task('2024-02-29', 253402300800000), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '22023', 'liangli_core_invalid_initialization_payload', 'maximum timestamp plus one is rejected before deletes'
);
select is((select count(*)::int from public.liangli_tasks where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'), 1, 'SQL NULL calls preserve preexisting owner data');
select is((select count(*)::int from public.liangli_sync_profiles where user_id = auth.uid()), 0, 'SQL NULL calls leave the manifest absent');

select lives_ok(
  $$select public.initialize_liangli_core_sync(pg_temp.core_initialization_task('2024-02-29', 253402300799999, '9999-12-31T23:59:59.999Z'), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  'valid leap day and maximum timestamp initialize before the manifest'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync('[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  'P0001',
  'liangli_core_already_initialized',
  'a later initializer cannot clear the winner data'
);
select is((select count(*)::int from public.liangli_sync_profiles where user_id = auth.uid()), 1, 'only the winner manifest exists');
select is((select count(*)::int from public.liangli_tasks where user_id = auth.uid()), 1, 'the valid winner row remains intact');

-- See core_sync_initialization_concurrency.sh for the executable two-session psql acceptance.

select * from finish();
rollback;
