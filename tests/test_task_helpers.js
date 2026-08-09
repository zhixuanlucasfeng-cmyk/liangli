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
vm.runInContext(`${script.slice(start, end)}\n;globalThis.helpers={normalizeTask,validateTaskTimes,taskHelperRoute,recordPomodoroCompletion};`, context);
const {normalizeTask, validateTaskTimes, taskHelperRoute, recordPomodoroCompletion} = context.helpers;

const legacy = normalizeTask(
  {id: 1, name: 'Read', energy: 25, done: false},
  '2026-08-08',
);
assert.equal(legacy.dayKey, '2026-08-08');
assert.equal(legacy.startTime, null);
assert.equal(legacy.endTime, null);
assert.equal(legacy.helper, 'none');
assert.equal(legacy.helperRef, null);
assert.deepEqual(JSON.parse(JSON.stringify(legacy.helperRefs)), {});
assert.equal(legacy.pomodoroCount, 0);

assert.equal(validateTaskTimes('', ''), true);
assert.equal(validateTaskTimes('09:00', ''), true);
assert.equal(validateTaskTimes('', '10:00'), true);
assert.equal(validateTaskTimes('09:00', '10:00'), true);
assert.equal(validateTaskTimes('10:00', '10:00'), false);
assert.equal(validateTaskTimes('10:01', '10:00'), false);
assert.equal(validateTaskTimes('bad', '10:00'), false);

assert.equal(taskHelperRoute({helper: 'pomodoro'}), 'focus');
assert.equal(taskHelperRoute({helper: 'flashcards'}), 'flashcards');
assert.equal(taskHelperRoute({helper: 'quiz'}), 'quiz');
assert.equal(taskHelperRoute({helper: 'checklist'}), 'checklist');
assert.equal(taskHelperRoute({helper: 'none'}), 'none');

const completed = recordPomodoroCompletion({
  pomo: 1,
  focusMin: 25,
  week: [0, 0, 0, 0, 0, 0, 25],
  tasks: [
    {...legacy, id: 1, pomodoroCount: 2},
    {...legacy, id: 2, pomodoroCount: 4},
  ],
}, 1);
assert.equal(completed.pomo, 2);
assert.equal(completed.focusMin, 50);
assert.deepEqual(Array.from(completed.week), [0, 0, 0, 0, 0, 0, 50]);
assert.equal(completed.tasks.find(task => task.id === 1).pomodoroCount, 3);
assert.equal(completed.tasks.find(task => task.id === 2).pomodoroCount, 4);

console.log('task helper behavior: ok');
