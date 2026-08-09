const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function flashcardOffset(');
const end = script.indexOf('function normalizeTaskDays', start);
assert.notEqual(start, -1, 'flashcardOffset must exist');
assert.notEqual(end, -1, 'scheduler block end marker must exist');

const context = {};
vm.createContext(context);
vm.runInContext(`${script.slice(start, end)}\n;globalThis.scheduler={previewIntervals,scheduleReview};`, context);
const {previewIntervals, scheduleReview} = context.scheduler;

const now = Date.parse('2026-08-08T08:00:00.000Z');
const fresh = {id: 'card-a', intervalDays: 0, ease: 2.5, repetitions: 0};
const preview = previewIntervals(fresh, now);
assert.equal(preview.again, '10m');
assert.equal(preview.hard, '1d');
assert.equal(preview.good, '1d');
assert.equal(preview.easy, '4d');

const again = scheduleReview(fresh, 'again', now);
assert.equal(again.dueAt, now + 10 * 60 * 1000);
assert.equal(again.repetitions, 0);

for (const grade of ['hard', 'good', 'easy']) {
  const result = scheduleReview(fresh, grade, now);
  assert.equal(result.dueAt, now + Number(preview[grade].slice(0, -1)) * 86400000);
  assert.equal(result.repetitions, 1);
}

const mature = {id: 'card-b', intervalDays: 20, ease: 2.5, repetitions: 5};
const hard = scheduleReview(mature, 'hard', now);
const good = scheduleReview(mature, 'good', now);
const easy = scheduleReview(mature, 'easy', now);
assert.ok(hard.intervalDays < good.intervalDays);
assert.ok(good.intervalDays < easy.intervalDays);
assert.equal(scheduleReview({...mature, intervalDays: 36000}, 'easy', now).intervalDays, 36500);
assert.deepEqual(scheduleReview(mature, 'good', now), scheduleReview(mature, 'good', now));
assert.throws(() => scheduleReview(fresh, 'unknown', now), /grade/i);

console.log('flashcard scheduler: ok');
