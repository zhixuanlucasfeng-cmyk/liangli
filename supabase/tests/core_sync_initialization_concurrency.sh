#!/usr/bin/env bash
# Disposable database only. Requires migration 004 and a privileged test connection.
set -euo pipefail

: "${CORE_SYNC_TEST_DATABASE_URL:?Set CORE_SYNC_TEST_DATABASE_URL to a disposable Postgres/Supabase test database.}"
: "${CORE_SYNC_TEST_DISPOSABLE:?Set CORE_SYNC_TEST_DISPOSABLE=1 to confirm this database may be destructively tested.}"
if [[ "$CORE_SYNC_TEST_DISPOSABLE" != "1" ]]; then
  echo "CORE_SYNC_TEST_DISPOSABLE must equal 1" >&2
  exit 64
fi
OWNER_ID="${CORE_SYNC_TEST_OWNER_ID:-55555555-5555-4555-8555-555555555555}"
TASK_ID="${CORE_SYNC_TEST_TASK_ID:-66666666-6666-4666-8666-666666666666}"
work_dir="$(mktemp -d)"
initialized_marker="$work_dir/a-initialized"
release_marker="$work_dir/release-a"
pid_a=""
pid_b=""
cleanup() {
  touch "$release_marker" 2>/dev/null || true
  for pid in "$pid_a" "$pid_b"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; fi
    if [[ -n "$pid" ]]; then wait "$pid" 2>/dev/null || true; fi
  done
  rm -rf "$work_dir"
}
trap cleanup EXIT

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

# Connection A initializes inside an outer transaction. The RPC returns while its advisory
# transaction lock is still held, then the client-side marker exposes that exact condition.
(psql "$CORE_SYNC_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
begin;
${owner_setup}
${winner_call}
\! touch "$initialized_marker"
\! while [ ! -f "$release_marker" ]; do sleep 0.05; done
commit;
SQL
) >"$work_dir/a.out" 2>"$work_dir/a.err" &
pid_a=$!
for ((attempt=0; attempt<200; attempt++)); do
  [[ -f "$initialized_marker" ]] && break
  if ! kill -0 "$pid_a" 2>/dev/null; then
    echo "connection A exited before returning from initialization" >&2
    cat "$work_dir/a.err" >&2
    exit 1
  fi
  sleep 0.05
done
if [[ ! -f "$initialized_marker" ]]; then
  echo "timed out waiting for connection A to initialize and hold its advisory lock" >&2
  exit 1
fi

# Connection B must remain blocked until A commits, then fail cleanly rather than deleting winner rows.
b_application_name="liangli_core_initializer_b_${OWNER_ID//-/}"
(psql "$CORE_SYNC_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=0 <<SQL
set application_name = '${b_application_name}';
begin;
${owner_setup}
${winner_call}
rollback;
SQL
) >"$work_dir/b.out" 2>"$work_dir/b.err" &
pid_b=$!

# A third connection observes both the activity wait event and the ungranted advisory pg_locks row.
blocked="f"
for ((attempt=0; attempt<200; attempt++)); do
  blocked="$(psql "$CORE_SYNC_TEST_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "
    select exists(
      select 1
      from pg_stat_activity activity
      join pg_locks locks on locks.pid = activity.pid
      where activity.application_name = '${b_application_name}'
        and activity.wait_event_type = 'Lock'
        and activity.wait_event = 'advisory'
        and locks.locktype = 'advisory'
        and not locks.granted
    );
  ")"
  [[ "$blocked" == "t" ]] && break
  if ! kill -0 "$pid_b" 2>/dev/null; then
    echo "connection B exited before waiting on the owner advisory lock" >&2
    cat "$work_dir/b.err" >&2
    exit 1
  fi
  sleep 0.05
done
if [[ "$blocked" != "t" ]]; then
  echo "timed out waiting for connection B's AdvisoryLock wait evidence" >&2
  exit 1
fi

touch "$release_marker"
wait "$pid_a"
wait "$pid_b"
pid_a=""
pid_b=""
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
