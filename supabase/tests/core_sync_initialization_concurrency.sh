#!/usr/bin/env bash
# Disposable database only. Requires migration 004 and a privileged test connection.
set -euo pipefail

: "${CORE_SYNC_TEST_DATABASE_URL:?Set CORE_SYNC_TEST_DATABASE_URL to a disposable Postgres/Supabase test database.}"
OWNER_ID="${CORE_SYNC_TEST_OWNER_ID:-55555555-5555-4555-8555-555555555555}"
TASK_ID="${CORE_SYNC_TEST_TASK_ID:-66666666-6666-4666-8666-666666666666}"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

owner_setup="set local role authenticated;
select set_config('request.jwt.claim.sub', '${OWNER_ID}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);"
winner_call="select public.initialize_liangli_core_sync(
  '[{\"id\":\"${TASK_ID}\",\"payload\":{\"id\":\"${TASK_ID}\",\"name\":\"winner\",\"energy\":25,\"done\":false,\"dayKey\":\"2026-08-11\",\"startTime\":null,\"endTime\":null,\"helper\":\"none\",\"helperRef\":null,\"helperRefs\":{},\"pomodoroCount\":0,\"createdAt\":1700000000000,\"updatedAt\":1700000000000,\"deletedAt\":null},\"client_updated_at\":1700000000000,\"deleted_at\":null}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);"

psql "$CORE_SYNC_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('${OWNER_ID}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'core-concurrency@example.test', '', now(), now())
on conflict (id) do nothing;
delete from public.liangli_sync_profiles where user_id='${OWNER_ID}';
delete from public.liangli_tasks where user_id='${OWNER_ID}';
SQL

# Connection A holds the same owner advisory lock, then commits the one valid winner initialization.
(psql "$CORE_SYNC_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
begin;
${owner_setup}
select pg_advisory_xact_lock(hashtextextended('${OWNER_ID}', 0));
select pg_sleep(2);
${winner_call}
commit;
SQL
) >"$work_dir/a.out" 2>"$work_dir/a.err" &
pid_a=$!
sleep 0.2

# Connection B must remain blocked until A commits, then fail cleanly rather than deleting winner rows.
(psql "$CORE_SYNC_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=0 <<SQL
begin;
${owner_setup}
${winner_call}
rollback;
SQL
) >"$work_dir/b.out" 2>"$work_dir/b.err" &
pid_b=$!
sleep 0.5
if ! kill -0 "$pid_b" 2>/dev/null; then
  echo "connection B did not block on the owner advisory lock" >&2
  exit 1
fi
wait "$pid_a"
wait "$pid_b" || true
if ! grep -q 'liangli_core_already_initialized' "$work_dir/b.err"; then
  echo "connection B did not receive liangli_core_already_initialized" >&2
  cat "$work_dir/b.err" >&2
  exit 1
fi

winner="$(psql "$CORE_SYNC_TEST_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "select payload->>'name' from public.liangli_tasks where id='${TASK_ID}' and user_id='${OWNER_ID}'")"
manifest="$(psql "$CORE_SYNC_TEST_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from public.liangli_sync_profiles where user_id='${OWNER_ID}'")"
test "$winner" = "winner"
test "$manifest" = "1"
echo "two-connection initializer acceptance passed: blocked loser preserved winner rows"
