const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function normalizeTask(');
const end = script.indexOf('function migrateDailyState', start);
assert.notEqual(start, -1, 'normalizeTask must exist');
assert.notEqual(end, -1, 'task helper block end marker must exist');

const context = {};
vm.createContext(context);
vm.runInContext(`${script.slice(start, end)}\n;globalThis.helpers={normalizeTask,validateTaskTimes};`, context);
const {normalizeTask, validateTaskTimes} = context.helpers;

const legacy = normalizeTask(
  {id: 1, name: 'Read', energy: 25, done: false},
  '2026-08-08',
);
assert.equal(legacy.dayKey, '2026-08-08');
assert.equal(legacy.startTime, null);
assert.equal(legacy.endTime, null);
assert.equal(legacy.helper, 'none');
assert.equal(legacy.helperRef, null);
assert.equal(legacy.pomodoroCount, 0);

assert.equal(validateTaskTimes('', ''), true);
assert.equal(validateTaskTimes('09:00', ''), true);
assert.equal(validateTaskTimes('', '10:00'), true);
assert.equal(validateTaskTimes('09:00', '10:00'), true);
assert.equal(validateTaskTimes('10:00', '10:00'), false);
assert.equal(validateTaskTimes('10:01', '10:00'), false);
assert.equal(validateTaskTimes('bad', '10:00'), false);

console.log('task helper behavior: ok');
