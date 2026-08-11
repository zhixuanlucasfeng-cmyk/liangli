begin;
create extension if not exists pgtap;
select plan(28);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'core-one@example.test', '', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'core-two@example.test', '', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.liangli_sync_profiles (user_id, core_version) values (auth.uid(), 1);
insert into public.liangli_tasks (id, user_id, payload, client_updated_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', auth.uid(), '{"state":"owner-one"}', 1);
insert into public.liangli_growth_items (id, user_id, payload, client_updated_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', auth.uid(), '{"state":"owner-one"}', 1);
insert into public.liangli_goals (id, user_id, payload, client_updated_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', auth.uid(), '{"state":"owner-one"}', 1);
insert into public.liangli_focus_sessions (id, user_id, payload, client_updated_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', auth.uid(), '{"state":"owner-one"}', 1);
insert into public.liangli_mood_entries (id, user_id, payload, client_updated_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', auth.uid(), '{"state":"owner-one"}', 1);
select is((select count(*)::int from public.liangli_sync_profiles), 1, 'owner can select own sync profile');
select is((select count(*)::int from public.liangli_tasks), 1, 'owner can select own task');
select is((select count(*)::int from public.liangli_growth_items), 1, 'owner can select own growth item');
select is((select count(*)::int from public.liangli_goals), 1, 'owner can select own goal');
select is((select count(*)::int from public.liangli_focus_sessions), 1, 'owner can select own focus session');
select is((select count(*)::int from public.liangli_mood_entries), 1, 'owner can select own mood entry');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*)::int from public.liangli_sync_profiles), 0, 'other user cannot select sync profile');
select is((select count(*)::int from public.liangli_tasks), 0, 'other user cannot select task');
select is((select count(*)::int from public.liangli_growth_items), 0, 'other user cannot select growth item');
select is((select count(*)::int from public.liangli_goals), 0, 'other user cannot select goal');
select is((select count(*)::int from public.liangli_focus_sessions), 0, 'other user cannot select focus session');
select is((select count(*)::int from public.liangli_mood_entries), 0, 'other user cannot select mood entry');

-- RLS filters both cross-owner updates and deletes; the owner checks below prove neither operation changed the stored rows.
update public.liangli_sync_profiles set core_version = 2 where user_id = '11111111-1111-4111-8111-111111111111';
delete from public.liangli_sync_profiles where user_id = '11111111-1111-4111-8111-111111111111';
update public.liangli_tasks set payload = '{"state":"other-user"}', client_updated_at = 2 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
delete from public.liangli_tasks where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
update public.liangli_growth_items set payload = '{"state":"other-user"}', client_updated_at = 2 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
delete from public.liangli_growth_items where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
update public.liangli_goals set payload = '{"state":"other-user"}', client_updated_at = 2 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
delete from public.liangli_goals where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
update public.liangli_focus_sessions set payload = '{"state":"other-user"}', client_updated_at = 2 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
delete from public.liangli_focus_sessions where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
update public.liangli_mood_entries set payload = '{"state":"other-user"}', client_updated_at = 2 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';
delete from public.liangli_mood_entries where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is((select core_version from public.liangli_sync_profiles), 1, 'other user cannot update or delete sync profile');
select is((select payload->>'state' from public.liangli_tasks), 'owner-one', 'other user cannot update or delete task');
select is((select payload->>'state' from public.liangli_growth_items), 'owner-one', 'other user cannot update or delete growth item');
select is((select payload->>'state' from public.liangli_goals), 'owner-one', 'other user cannot update or delete goal');
select is((select payload->>'state' from public.liangli_focus_sessions), 'owner-one', 'other user cannot update or delete focus session');
select is((select payload->>'state' from public.liangli_mood_entries), 'owner-one', 'other user cannot update or delete mood entry');

update public.liangli_tasks set payload = '{"state":"newer"}', client_updated_at = 10;
update public.liangli_growth_items set payload = '{"state":"newer"}', client_updated_at = 10;
update public.liangli_goals set payload = '{"state":"newer"}', client_updated_at = 10;
update public.liangli_focus_sessions set payload = '{"state":"newer"}', client_updated_at = 10;
update public.liangli_mood_entries set payload = '{"state":"newer"}', client_updated_at = 10;
update public.liangli_tasks set payload = '{"state":"stale"}', client_updated_at = 10;
update public.liangli_growth_items set payload = '{"state":"stale"}', client_updated_at = 10;
update public.liangli_goals set payload = '{"state":"stale"}', client_updated_at = 10;
update public.liangli_focus_sessions set payload = '{"state":"stale"}', client_updated_at = 10;
update public.liangli_mood_entries set payload = '{"state":"stale"}', client_updated_at = 10;
update public.liangli_tasks set payload = '{"state":"lower-version"}', client_updated_at = 9;
update public.liangli_growth_items set payload = '{"state":"lower-version"}', client_updated_at = 9;
update public.liangli_goals set payload = '{"state":"lower-version"}', client_updated_at = 9;
update public.liangli_focus_sessions set payload = '{"state":"lower-version"}', client_updated_at = 9;
update public.liangli_mood_entries set payload = '{"state":"lower-version"}', client_updated_at = 9;
select is((select payload->>'state' from public.liangli_tasks), 'newer', 'lower-version stale liangli_tasks update retains the newer payload');
select is((select client_updated_at from public.liangli_tasks), 10::bigint, 'lower-version stale liangli_tasks update retains the newer version');
select is((select payload->>'state' from public.liangli_growth_items), 'newer', 'lower-version stale liangli_growth_items update retains the newer payload');
select is((select client_updated_at from public.liangli_growth_items), 10::bigint, 'lower-version stale liangli_growth_items update retains the newer version');
select is((select payload->>'state' from public.liangli_goals), 'newer', 'lower-version stale liangli_goals update retains the newer payload');
select is((select client_updated_at from public.liangli_goals), 10::bigint, 'lower-version stale liangli_goals update retains the newer version');
select is((select payload->>'state' from public.liangli_focus_sessions), 'newer', 'lower-version stale liangli_focus_sessions update retains the newer payload');
select is((select client_updated_at from public.liangli_focus_sessions), 10::bigint, 'lower-version stale liangli_focus_sessions update retains the newer version');
select is((select payload->>'state' from public.liangli_mood_entries), 'newer', 'lower-version stale liangli_mood_entries update retains the newer payload');
select is((select client_updated_at from public.liangli_mood_entries), 10::bigint, 'lower-version stale liangli_mood_entries update retains the newer version');

select * from finish();
rollback;
