-- Liangli syncs Flashcards only. Every row is scoped to the authenticated owner.
create extension if not exists pgcrypto;

create table if not exists public.flashcard_decks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 120),
  client_updated_at bigint not null check (client_updated_at >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  front text not null check (char_length(front) between 1 and 10000),
  back text not null check (char_length(back) between 1 and 10000),
  interval_days integer not null default 0 check (interval_days between 0 and 36500),
  ease double precision not null default 2.5 check (ease between 1.3 and 5),
  repetitions integer not null default 0 check (repetitions >= 0),
  due_at timestamptz,
  last_reviewed_at timestamptz,
  client_updated_at bigint not null check (client_updated_at >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcard_reviews (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  card_id uuid not null references public.flashcards(id) on delete cascade,
  grade text not null check (grade in ('again','hard','good','easy')),
  previous_interval_days integer not null check (previous_interval_days between 0 and 36500),
  was_new boolean not null default false,
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create or replace function public.set_flashcard_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.client_updated_at <= old.client_updated_at then
    return old;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists flashcard_decks_updated_at on public.flashcard_decks;
create trigger flashcard_decks_updated_at before update on public.flashcard_decks
for each row execute function public.set_flashcard_updated_at();
drop trigger if exists flashcards_updated_at on public.flashcards;
create trigger flashcards_updated_at before update on public.flashcards
for each row execute function public.set_flashcard_updated_at();

create index if not exists flashcard_decks_owner_updated on public.flashcard_decks(user_id, client_updated_at);
create index if not exists flashcards_owner_updated on public.flashcards(user_id, client_updated_at);
create index if not exists flashcards_owner_due on public.flashcards(user_id, due_at);
create index if not exists flashcard_reviews_owner_reviewed on public.flashcard_reviews(user_id, reviewed_at);

alter table public.flashcard_decks enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;

revoke all on public.flashcard_decks, public.flashcards, public.flashcard_reviews from anon;
grant select, insert, update, delete on public.flashcard_decks, public.flashcards to authenticated;
grant select, insert on public.flashcard_reviews to authenticated;

create policy "owners select decks" on public.flashcard_decks for select using (auth.uid() = user_id);
create policy "owners insert decks" on public.flashcard_decks for insert with check (auth.uid() = user_id);
create policy "owners update decks" on public.flashcard_decks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owners delete decks" on public.flashcard_decks for delete using (auth.uid() = user_id);

create policy "owners select cards" on public.flashcards for select using (auth.uid() = user_id);
create policy "owners insert cards in own decks" on public.flashcards for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.flashcard_decks d where d.id = deck_id and d.user_id = auth.uid()
  )
);
create policy "owners update cards in own decks" on public.flashcards for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (
    select 1 from public.flashcard_decks d where d.id = deck_id and d.user_id = auth.uid()
  )
);
create policy "owners delete cards" on public.flashcards for delete using (auth.uid() = user_id);

create policy "owners select reviews" on public.flashcard_reviews for select using (auth.uid() = user_id);
create policy "owners insert reviews for own cards" on public.flashcard_reviews for insert with check (
  auth.uid() = user_id and
  exists (select 1 from public.flashcard_decks d where d.id = deck_id and d.user_id = auth.uid()) and
  exists (select 1 from public.flashcards c where c.id = card_id and c.deck_id = deck_id and c.user_id = auth.uid())
);
