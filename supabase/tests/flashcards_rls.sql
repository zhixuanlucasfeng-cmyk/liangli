begin;
create extension if not exists pgtap;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','one@example.test','',now(),now()),
  ('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','two@example.test','',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.flashcard_decks (id,user_id,name,client_updated_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'User one',1);
select is((select count(*)::int from public.flashcard_decks),1,'owner can select own deck');

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select is((select count(*)::int from public.flashcard_decks),0,'other user cannot select deck');
select throws_ok(
  $$insert into public.flashcards (id,user_id,deck_id,front,back,client_updated_at)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',auth.uid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','x','y',1)$$,
  '42501',null,'cannot attach a card to another owner deck'
);

insert into public.flashcard_decks (id,user_id,name,client_updated_at)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',auth.uid(),'User two',1);
insert into public.flashcards (id,user_id,deck_id,front,back,client_updated_at)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',auth.uid(),'cccccccc-cccc-4ccc-8ccc-cccccccccccc','Q','A',1);
select is((select count(*)::int from public.flashcards),1,'owner can insert and select own card');
update public.flashcards set front='Updated',client_updated_at=2 where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select is((select front from public.flashcards where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),'Updated','owner can update own card');
insert into public.flashcard_reviews (id,user_id,deck_id,card_id,grade,previous_interval_days,was_new,reviewed_at)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',auth.uid(),'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd','good',0,true,now());
select is((select count(*)::int from public.flashcard_reviews),1,'owner can insert immutable review');
select throws_ok(
  $$update public.flashcard_reviews set grade='easy' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'$$,
  '42501',null,'authenticated client cannot update review history'
);
select throws_ok(
  $$delete from public.flashcard_reviews where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'$$,
  '42501',null,'authenticated client cannot delete review history'
);
update public.flashcards set front='Newest',client_updated_at=10 where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
update public.flashcards set front='Stale',client_updated_at=5 where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select is((select front from public.flashcards where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),'Newest','server rejects stale concurrent writes');

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is((select count(*)::int from public.flashcards),0,'other user cannot select card');
select is((select count(*)::int from public.flashcard_decks),1,'user one still sees only own deck');
delete from public.flashcard_decks where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select is((select count(*)::int from public.flashcard_decks),1,'cannot delete another owner deck');

select * from finish();
rollback;
