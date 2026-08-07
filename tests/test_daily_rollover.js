const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function localDayKey');
const end = script.indexOf('const today=', start);
assert.notEqual(start, -1, 'localDayKey must exist');
assert.notEqual(end, -1, 'daily rollover block end marker must exist');

const rolloverCode = script.slice(start, end);
const context = {Date, console};
vm.createContext(context);
vm.runInContext(`${rolloverCode}\n;globalThis.daily={localDayKey,normalizeTaskDays,migrateDailyState};`, context);

const {localDayKey, normalizeTaskDays, migrateDailyState} = context.daily;

assert.equal(localDayKey(new Date(2026, 7, 7, 23, 59)), '2026-08-07');
assert.equal(localDayKey(new Date(2026, 7, 8, 0, 1)), '2026-08-08');

const normalized = normalizeTaskDays([{id: 9, name: 'legacy'}], '2026-08-07');
assert.equal(normalized[0].dayKey, '2026-08-07');

const initial = {
  tasks: [
    {id: 1, name: 'unfinished', energy: 25, done: false, dayKey: '2026-08-05'},
    {id: 2, name: 'finished', energy: 10, done: true, dayKey: '2026-08-05'},
  ],
  ideas: [],
  focusMin: 30,
  pomo: 2,
  week: [1, 2, 3, 4, 5, 6, 7],
  lastDay: '2026-08-05',
};
const first = migrateDailyState(initial, '2026-08-08');
assert.equal(first.tasks.length, 2, 'task history remains stored locally');
assert.equal(first.ideas.filter(item => item.rolloverSourceId === 1).length, 1);
assert.equal(first.focusMin, 0);
assert.equal(first.pomo, 0);
assert.deepEqual(Array.from(first.week), [4, 5, 6, 7, 0, 0, 0]);
assert.equal(first.lastDay, '2026-08-08');

const second = migrateDailyState(first, '2026-08-08');
assert.equal(second.ideas.filter(item => item.rolloverSourceId === 1).length, 1);
assert.equal(second.changed, false, 'same-day checks are idempotent');

console.log('daily rollover behavior: ok');
