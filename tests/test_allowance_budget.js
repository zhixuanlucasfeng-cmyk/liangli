const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const localDayStart = script.indexOf('function localDayKey(');
const localDayEnd = script.indexOf('function dayOrdinal', localDayStart);
const start = script.indexOf('function moneyToCents(');
const end = script.indexOf('function normalizeTaskDays', start);
assert.notEqual(localDayStart, -1, 'localDayKey must exist');
assert.notEqual(localDayEnd, -1, 'localDayKey block end marker must exist');
assert.notEqual(start, -1, 'moneyToCents must exist');
assert.notEqual(end, -1, 'budget block end marker must exist');

const context = {Date};
vm.createContext(context);
vm.runInContext(`${script.slice(localDayStart, localDayEnd)}\n${script.slice(start, end)}\n;globalThis.allowance={moneyToCents,budgetEndExclusive,budgetDayCount,allocateDailyCents,computeBudgetLedger};`, context);
const {moneyToCents, budgetEndExclusive, budgetDayCount, allocateDailyCents, computeBudgetLedger} = context.allowance;

assert.equal(moneyToCents('12.34'), 1234);
assert.equal(moneyToCents('-1'), null);
assert.equal(budgetEndExclusive('2028-02-01', 'month', 1), '2028-03-01');
assert.equal(budgetEndExclusive('2028-02-29', 'year', 1), '2029-03-01');
assert.equal(budgetEndExclusive('2026-08-10', 'day', 3), '2026-08-13');
assert.equal(budgetEndExclusive('2026-08-10', 'week', 2), '2026-08-24');
assert.deepEqual(Array.from(allocateDailyCents(10, 3)), [4, 3, 3]);

assert.throws(() => budgetDayCount('2026-08-10', '2026-08-10'), /at least one day/);
assert.throws(() => allocateDailyCents(10, 0), /at least one day/);
assert.equal(budgetEndExclusive('2026-01-15', 'month', 3), '2026-04-15');
assert.equal(budgetEndExclusive('2024-02-29', 'year', 2), '2026-03-01');

const cycle = {
  id: 'c1', startDay: '2026-08-10', endExclusive: '2026-08-17',
  totalCents: 87500, savingsBps: 2000, openingCarryCents: 0,
};
const ledger = computeBudgetLedger(cycle, [
  {id: 'e1', amountCents: 13000, spentAt: '2026-08-10T23:00:00+08:00'},
], '2026-08-11');
assert.equal(ledger[0].baseCents, 10000);
assert.equal(ledger[0].carryCents, -3000);
assert.equal(ledger[1].availableCents, 7000);
assert.equal(
  computeBudgetLedger(cycle, [], '2026-08-16').reduce((total, day) => total + day.baseCents, 0),
  70000,
);

const positiveCarry = computeBudgetLedger({
  id: 'c2', startDay: '2026-08-10', endExclusive: '2026-08-13',
  totalCents: 300, savingsBps: 0, openingCarryCents: 100,
}, [], '2026-08-12');
assert.deepEqual(JSON.parse(JSON.stringify(positiveCarry.map(day => day.baseCents))), [134, 133, 133]);
assert.equal(positiveCarry[1].availableCents, 267);

const afterExpense = computeBudgetLedger({
  id: 'c3', startDay: '2026-08-10', endExclusive: '2026-08-12',
  totalCents: 200, savingsBps: 0, openingCarryCents: 0,
}, [{id: 'deleted-later', amountCents: 50, spentAt: '2026-08-10T23:00:00+08:00'}], '2026-08-11');
const afterDeletion = computeBudgetLedger({
  id: 'c3', startDay: '2026-08-10', endExclusive: '2026-08-12',
  totalCents: 200, savingsBps: 0, openingCarryCents: 0,
}, [], '2026-08-11');
assert.equal(afterExpense[1].availableCents, 150);
assert.equal(afterDeletion[1].availableCents, 200);

const defaultSavings = computeBudgetLedger({
  id: 'c4', startDay: '2026-08-10', endExclusive: '2026-08-11', totalCents: 10000, openingCarryCents: 0,
}, [], '2026-08-10');
assert.equal(defaultSavings[0].baseCents, 8000);
assert.equal(computeBudgetLedger({
  id: 'c5', startDay: '2026-08-10', endExclusive: '2026-08-11', totalCents: 10000, savingsBps: 0, openingCarryCents: 0,
}, [], '2026-08-10')[0].baseCents, 10000);
assert.equal(computeBudgetLedger({
  id: 'c6', startDay: '2026-08-10', endExclusive: '2026-08-11', totalCents: 10000, savingsBps: 10000, openingCarryCents: 0,
}, [], '2026-08-10')[0].baseCents, 0);
assert.throws(() => computeBudgetLedger({
  id: 'c7', startDay: '2026-08-10', endExclusive: '2026-08-11', totalCents: 10000, savingsBps: -1, openingCarryCents: 0,
}, [], '2026-08-10'), /Savings basis points/);
assert.throws(() => computeBudgetLedger({
  id: 'c8', startDay: '2026-08-10', endExclusive: '2026-08-11', totalCents: 10000, savingsBps: 10001, openingCarryCents: 0,
}, [], '2026-08-10'), /Savings basis points/);

const localOffsetTime = new Date('2026-08-10T00:30:00+14:00');
const localOffsetDay = `${localOffsetTime.getFullYear()}-${String(localOffsetTime.getMonth() + 1).padStart(2, '0')}-${String(localOffsetTime.getDate()).padStart(2, '0')}`;
const timezoneLedger = computeBudgetLedger({
  id: 'c9', startDay: '2026-08-09', endExclusive: '2026-08-11', totalCents: 200, savingsBps: 0, openingCarryCents: 0,
}, [
  {id: 'offset', amountCents: 25, spentAt: '2026-08-10T00:30:00+14:00'},
  {id: 'invalid', amountCents: 75, spentAt: 'not-a-timestamp'},
], '2026-08-10');
assert.equal(timezoneLedger.find(day => day.dayKey === localOffsetDay).spentCents, 25);
assert.equal(timezoneLedger.reduce((total, day) => total + day.spentCents, 0), 25);

console.log('allowance budget behavior: ok');
