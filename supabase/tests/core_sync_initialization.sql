-- Authored acceptance tests for a disposable Supabase/Postgres database; not executed by this repository.
begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'initializer@example.test', '', now(), now())
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A duplicate key in the second supplied row proves that clearing and the first insert roll back together.
insert into public.liangli_tasks (id, user_id, payload, client_updated_at)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', auth.uid(), '{"state":"orphan"}', 1);
select throws_ok(
  $$select public.initialize_liangli_core_sync(
    '[{"id":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1","payload":{},"client_updated_at":2},{"id":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1","payload":{},"client_updated_at":3}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  )$$,
  '23505',
  'duplicate key value violates unique constraint',
  'duplicate key rolls back the fixed-table clear and every preceding insert'
);
select is((select count(*)::int from public.liangli_tasks where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'), 1, 'rollback preserves preexisting owner data');
select is((select count(*)::int from public.liangli_sync_profiles where user_id = auth.uid()), 0, 'rollback leaves the manifest absent');

select lives_ok(
  $$select public.initialize_liangli_core_sync('[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  'first initializer creates its manifest after the fixed table operations'
);
select throws_ok(
  $$select public.initialize_liangli_core_sync('[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  'P0001',
  'liangli_core_already_initialized',
  'a later initializer cannot clear the winner data'
);
select is((select count(*)::int from public.liangli_sync_profiles where user_id = auth.uid()), 1, 'only the winner manifest exists');
select is((select count(*)::int from public.liangli_tasks where user_id = auth.uid()), 0, 'the winning empty initializer clears the retained orphan row');

-- Two-session acceptance (run in two disposable DB sessions): session B blocks on the same advisory lock,
-- then receives liangli_core_already_initialized after session A commits; it must never delete winner rows.
select pass('two-session advisory-lock acceptance is authored for a disposable database run');

select * from finish();
rollback;
