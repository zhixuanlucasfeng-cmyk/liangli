const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function mergeFlashcard(');
const end = script.indexOf('function normalizeTaskDays', start);
assert.notEqual(start, -1, 'mergeFlashcard must exist');
assert.notEqual(end, -1, 'sync helpers end marker must exist');

const context = {};
vm.createContext(context);
vm.runInContext(`${script.slice(start, end)}\n;globalThis.syncHelpers={mergeFlashcard,mergeReviews,coalesceSyncOps};`, context);
const {mergeFlashcard, mergeReviews, coalesceSyncOps} = context.syncHelpers;

assert.ok(script.includes("ignoreDuplicates:true"), 'review retries must ignore existing immutable UUIDs');
const syncSource = script.slice(script.indexOf('async function syncFlashcards('), script.indexOf('function normalizeTaskDays'));
for (const privateName of ['S.tasks', 'S.logs', 'S.goals', 'focusMin', 'pickedMood']) {
  assert.equal(syncSource.includes(privateName), false, `${privateName} must never enter cloud sync`);
}

const base = {id: 'c', front: 'old', back: 'A', updatedAt: 100, lastReviewedAt: 100, intervalDays: 2, dueAt: 200};
const contentMerged = mergeFlashcard(base, {...base, front: 'new', updatedAt: 200});
assert.equal(contentMerged.front, 'new');

const scheduleMerged = mergeFlashcard(
  {...base, front: 'local-new', updatedAt: 400, lastReviewedAt: 100, intervalDays: 2},
  {...base, front: 'remote-old', updatedAt: 200, lastReviewedAt: 300, intervalDays: 9, dueAt: 900},
);
assert.equal(scheduleMerged.front, 'local-new');
assert.equal(scheduleMerged.intervalDays, 9);
assert.equal(scheduleMerged.dueAt, 900);

const deleted = mergeFlashcard(base, {...base, updatedAt: 300, deletedAt: 350});
assert.equal(deleted.deletedAt, 350);

const pending = mergeFlashcard({...base, front: 'unsent', pendingSync: true}, {...base, front: 'remote'});
assert.equal(pending.front, 'unsent');

const reviews = mergeReviews([{id: 'r1', grade: 'good'}], [{id: 'r1', grade: 'good'}, {id: 'r2', grade: 'easy'}]);
assert.deepEqual(JSON.parse(JSON.stringify(reviews)), [{id: 'r1', grade: 'good'}, {id: 'r2', grade: 'easy'}]);

const coalesced = coalesceSyncOps([
  {id: 1, type: 'card', entityId: 'c1', updatedAt: 1, payload: {front: 'old'}},
  {id: 2, type: 'card', entityId: 'c1', updatedAt: 2, payload: {front: 'new'}},
  {id: 3, type: 'review', entityId: 'r1', updatedAt: 2},
]);
assert.equal(coalesced.filter(op => op.type === 'card').length, 1);
assert.equal(coalesced.find(op => op.type === 'card').payload.front, 'new');

console.log('flashcard sync merge: ok');
