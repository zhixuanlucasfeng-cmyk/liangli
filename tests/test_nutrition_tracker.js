const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const localDayStart = script.indexOf('function localDayKey(');
const localDayEnd = script.indexOf('function dayOrdinal', localDayStart);
const start = script.indexOf('const OFFLINE_FOODS=');
const end = script.indexOf('function migrateDailyState', start);
assert.notEqual(localDayStart, -1, 'localDayKey must exist');
assert.notEqual(localDayEnd, -1, 'localDayKey block end marker must exist');
assert.notEqual(start, -1, 'OFFLINE_FOODS must exist');
assert.notEqual(end, -1, 'nutrition block end marker must exist');

const context = {};
vm.createContext(context);
vm.runInContext(`${script.slice(localDayStart, localDayEnd)}\n${script.slice(start, end)}\n;globalThis.nutrition={normalizeFoodEntry,estimateFoodCalories,summarizeCalories,foodEntriesForDay};`, context);
const {normalizeFoodEntry, estimateFoodCalories, summarizeCalories, foodEntriesForDay} = context.nutrition;

const egg = normalizeFoodEntry({id:'1',name:'鸡蛋',calories:140,eatenAt:'2026-08-09T08:10:00+08:00'}, 0);
assert.equal(egg.portion, '');
assert.equal(egg.mode, 'manual');
assert.equal(estimateFoodCalories('两个鸡蛋', '2 个').matched, true);
assert.equal(estimateFoodCalories('完全未知食物', '1 份').calories, null);
const summary = summarizeCalories([
  egg,
  normalizeFoodEntry({id:'2',name:'饭',calories:300,eatenAt:'2026-08-09T12:00:00+08:00'}, 0),
], '2026-08-09', 400);
assert.deepEqual(JSON.parse(JSON.stringify(summary)), {consumed:440,target:400,remaining:-40});
const summaryInputLate = normalizeFoodEntry({id:'late',name:'苹果',calories:95,eatenAt:'2026-08-09T19:00:00+08:00'}, 0);
const summaryInputEarly = normalizeFoodEntry({id:'early',name:'鸡蛋',calories:70,eatenAt:'2026-08-09T07:00:00+08:00'}, 0);
assert.deepEqual(
  foodEntriesForDay([summaryInputLate, summaryInputEarly], '2026-08-09').map(x=>x.id),
  ['early','late'],
);

console.log('nutrition tracker behavior: ok');
