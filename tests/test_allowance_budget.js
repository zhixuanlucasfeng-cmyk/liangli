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
vm.runInContext(`${script.slice(localDayStart, localDayEnd)}\n${script.slice(start, end)}\n;globalThis.allowance={moneyToCents,budgetEndExclusive,budgetDayCount,allocateDailyCents,computeBudgetLedger,normalizeBudgetCycle};`, context);
const {moneyToCents, budgetEndExclusive, budgetDayCount, allocateDailyCents, computeBudgetLedger, normalizeBudgetCycle} = context.allowance;

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

const legacyMonth = normalizeBudgetCycle({
  id: 'legacy-month', startDay: '2026-01-01', endExclusive: '2026-02-01', totalCents: 10000,
});
assert.equal(legacyMonth.periodUnit, 'month');
assert.equal(legacyMonth.periodCount, 1);
const legacyMonthEnd = normalizeBudgetCycle({
  id: 'legacy-month-end', startDay: '2026-01-31', endExclusive: '2026-03-03', totalCents: 10000,
});
assert.equal(legacyMonthEnd.periodUnit, 'month', 'month-end overflow retains a monthly renewal unit');
assert.equal(legacyMonthEnd.periodCount, 1, 'Jan 31 to Mar 3 is one JavaScript calendar-month increment');
const legacyOtherMonthEnd = normalizeBudgetCycle({
  id: 'legacy-other-month-end', startDay: '2026-08-31', endExclusive: '2026-10-01', totalCents: 10000,
});
assert.equal(legacyOtherMonthEnd.periodUnit, 'month');
assert.equal(legacyOtherMonthEnd.periodCount, 1);
const legacyCustomMonths = normalizeBudgetCycle({
  id: 'legacy-custom-months', startDay: '2026-01-31', endExclusive: '2026-05-01', totalCents: 10000,
});
assert.equal(legacyCustomMonths.periodUnit, 'month');
assert.equal(legacyCustomMonths.periodCount, 3);
const legacyLeapYear = normalizeBudgetCycle({
  id: 'legacy-year', startDay: '2024-02-29', endExclusive: '2025-03-01', totalCents: 10000,
});
assert.equal(legacyLeapYear.periodUnit, 'year');
assert.equal(legacyLeapYear.periodCount, 1);
const legacyIrregular = normalizeBudgetCycle({
  id: 'legacy-days', startDay: '2026-01-01', endExclusive: '2026-01-10', totalCents: 10000,
});
assert.equal(legacyIrregular.periodUnit, 'day');
assert.equal(legacyIrregular.periodCount, 9);

const walletStart = script.indexOf('/* ============ 钱包 ============ */');
const walletEnd = script.indexOf('/* ============ 记录 ============ */', walletStart);
assert.notEqual(walletStart, -1, 'Wallet timeline UI controller must exist');
assert.notEqual(walletEnd, -1, 'Wallet controller end marker must exist');

function element(value = '') {
  return {
    value,
    textContent: '',
    innerHTML: '',
    hidden: false,
    checked: false,
    disabled: false,
    focused: false,
    attributes: {},
    classList: {
      values: new Set(),
      toggle(name, enabled) {
        if (enabled) this.values.add(name);
        else this.values.delete(name);
      },
      contains(name) { return this.values.has(name); },
    },
    focus() { this.focused = true; },
    setAttribute(name, valueToSet) { this.attributes[name] = String(valueToSet); },
  };
}

const elements = Object.fromEntries([
  'budgetTotalAmount', 'budgetSavingsPercent', 'budgetStartDate', 'budgetPeriodUnit',
  'budgetPeriodCount', 'walletTotal', 'walletSaved', 'walletSpendable', 'walletToday',
  'walletSpent', 'walletNegativeNote', 'walletCycleDates', 'expenseName', 'expenseAmount',
  'expenseSpentAt', 'expenseCategory', 'expenseTimeline', 'walletCycleEnd',
  'budgetCarryForward', 'budgetRechargeTotal', 'walletFormStatus', 'saveExpenseButton',
  'budgetCycleForm', 'walletActiveCycle', 'walletEmptyState', 'walletExpenseAvailability',
].map(id => [id, element()]));

const storage = new Map();
const storageFaults = {get: false, failSetAt: 0, setCalls: 0, rollback: false};
const localStorage = {
  getItem(key) {
    if (storageFaults.get) throw new Error('storage read failed');
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storageFaults.setCalls += 1;
    if (storageFaults.failSetAt === storageFaults.setCalls || storageFaults.rollback) {
      throw new Error('storage write failed');
    }
    storage.set(key, String(value));
  },
  removeItem(key) {
    if (storageFaults.rollback) throw new Error('storage rollback failed');
    storage.delete(key);
  },
};
function resetStorageFaults() {
  storageFaults.get = false;
  storageFaults.failSetAt = 0;
  storageFaults.setCalls = 0;
  storageFaults.rollback = false;
}

context.Intl = Intl;
context.lang = 'en';
context.S = {budgetCycles: [], expenses: [], activeBudgetCycleId: null};
context.localStorage = localStorage;
context.document = {getElementById(id) { return elements[id]; }};
context.T = key => key;
context.esc = value => String(value).replace(/[&<>\"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[char]));
context.currentLocalDateTimeValue = (date = new Date()) => {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
vm.runInContext(`${script.slice(walletStart, walletEnd)}\n;globalThis.wallet={createBudgetCycle,renderWallet,addExpense,deleteExpense,setExpenseForEdit,renewBudgetCycle,formatCny,budgetRenewalStartDay};`, context);
const wallet = context.wallet;

elements.budgetTotalAmount.value = '875.00';
elements.budgetSavingsPercent.value = '20';
elements.budgetStartDate.value = '2026-08-10';
elements.budgetPeriodUnit.value = 'week';
elements.budgetPeriodCount.value = '1';
assert.equal(wallet.createBudgetCycle(), true);
assert.equal(context.S.budgetCycles.length, 1);
const weeklyCycle = context.S.budgetCycles[0];
assert.equal(weeklyCycle.totalCents, 87500);
assert.equal(weeklyCycle.savingsBps, 2000);
assert.equal(weeklyCycle.startDay, '2026-08-10');
assert.equal(weeklyCycle.endExclusive, '2026-08-17');
assert.equal(weeklyCycle.periodUnit, 'week');
assert.equal(weeklyCycle.periodCount, 1);
assert.equal(context.S.activeBudgetCycleId, weeklyCycle.id);
assert.match(elements.walletTotal.textContent, /875[.,]00/);
assert.match(wallet.formatCny(1234), /12[.,]34/);
const enCurrency=wallet.formatCny(1234);
context.lang='zh';
const zhCurrency=wallet.formatCny(1234);
assert.match(zhCurrency,/¥/);
assert.notEqual(zhCurrency,enCurrency,'currency formatting follows the active language');
context.lang='en';
assert.match(elements.walletCycleDates.textContent,/2026-08-10.*2026-08-16/);
assert.doesNotMatch(elements.walletCycleDates.textContent,/2026-08-17/,'endExclusive is not presented as an included date');
assert.equal(JSON.parse(storage.get('ll_walletState')).budgetCycles[0].totalCents, 87500);
assert.equal(storage.has('ll_budgetCycles'), false, 'Wallet mutations commit through one atomic payload');

const todayKey = context.localDayKey(new Date());
elements.budgetTotalAmount.value = '3.00';
elements.budgetSavingsPercent.value = '0';
elements.budgetStartDate.value = todayKey;
elements.budgetPeriodUnit.value = 'day';
elements.budgetPeriodCount.value = '2';
assert.equal(wallet.createBudgetCycle(), true);
const activeCycle = context.S.budgetCycles.find(item => item.id === context.S.activeBudgetCycleId);

elements.expenseName.value = '<b>Lunch & tea</b>';
elements.expenseAmount.value = '2.00';
elements.expenseSpentAt.value = `${todayKey}T12:00`;
elements.expenseCategory.value = 'food';
assert.equal(wallet.addExpense(), true);
const expenseId = context.S.expenses.at(-1).id;
assert.equal(context.S.expenses.at(-1).amountCents, 200);
assert.equal(context.S.expenses.at(-1).cycleId, activeCycle.id);
assert.equal(context.S.expenses.at(-1).category, 'food');
assert.match(elements.walletToday.textContent, /-.*0[.,]50/);
assert.equal(elements.walletNegativeNote.hidden, false);
assert.match(elements.expenseTimeline.innerHTML, /&lt;b&gt;Lunch &amp; tea&lt;\/b&gt;/);

const dayBeforeDate = new Date(`${todayKey}T12:00`);
dayBeforeDate.setDate(dayBeforeDate.getDate() - 1);
const dayBeforeCycle = context.localDayKey(dayBeforeDate);
elements.expenseName.value = 'Before cycle';
elements.expenseAmount.value = '0.10';
elements.expenseSpentAt.value = `${dayBeforeCycle}T12:00`;
const expenseCountBeforeBoundaryChecks = context.S.expenses.length;
assert.equal(wallet.addExpense(), false, 'an expense before the cycle is rejected');
assert.equal(context.S.expenses.length, expenseCountBeforeBoundaryChecks);
assert.equal(elements.walletFormStatus.textContent, 'expenseOutsideCycle');
elements.expenseSpentAt.value = `${activeCycle.endExclusive}T00:00`;
assert.equal(wallet.addExpense(), false, 'endExclusive is outside the cycle');
assert.equal(context.S.expenses.length, expenseCountBeforeBoundaryChecks);

assert.equal(wallet.setExpenseForEdit(expenseId), true);
assert.equal(elements.expenseName.value, '<b>Lunch & tea</b>');
elements.expenseAmount.value = '1.00';
assert.equal(wallet.addExpense(), true);
assert.equal(context.S.expenses.filter(item => item.id === expenseId).length, 1, 'edit preserves the stable ID');
assert.equal(context.S.expenses.find(item => item.id === expenseId).amountCents, 100);
assert.match(elements.walletToday.textContent, /0[.,]50/);

assert.equal(wallet.deleteExpense(expenseId), true);
assert.ok(context.S.expenses.find(item => item.id === expenseId).deletedAt, 'delete leaves a stable-ID tombstone');
assert.match(elements.walletToday.textContent, /1[.,]50/);
assert.doesNotMatch(elements.expenseTimeline.innerHTML, /Lunch/);

elements.expenseName.value = 'Keep this form';
elements.expenseAmount.value = '0.25';
elements.expenseSpentAt.value = `${todayKey}T13:00`;
elements.expenseCategory.value = 'other';
const expensesBeforeFailure = JSON.stringify(context.S.expenses);
const payloadBeforeExpenseFailure = storage.get('ll_walletState');
resetStorageFaults();
storageFaults.failSetAt = 1;
assert.equal(wallet.addExpense(), false);
assert.equal(JSON.stringify(context.S.expenses), expensesBeforeFailure, 'storage failures roll back memory');
assert.equal(storage.get('ll_walletState'), payloadBeforeExpenseFailure, 'a failed atomic write leaves persisted state unchanged');
assert.equal(elements.expenseName.value, 'Keep this form');
assert.equal(elements.expenseAmount.value, '0.25');
assert.equal(elements.walletFormStatus.textContent, 'walletStoreError');
resetStorageFaults();

const endedCycle = {
  id: 'ended-cycle', startDay: '2000-01-01', endExclusive: '2000-01-03',
  totalCents: 300, savingsBps: 0, openingCarryCents: 0,
  periodUnit: 'day', periodCount: 2, createdAt: '2000-01-01T00:00:00.000Z',
};
context.S.budgetCycles.push(endedCycle);
context.S.expenses.push({
  id: 'ended-expense', cycleId: endedCycle.id, name: 'Old', category: '',
  amountCents: 100, spentAt: '2000-01-01T12:00:00.000Z', deletedAt: null,
});
context.S.activeBudgetCycleId = endedCycle.id;
assert.equal(wallet.renderWallet(), true);
assert.equal(elements.walletCycleEnd.hidden, false, 'ended cycles wait on an inline decision');
assert.equal(context.S.activeBudgetCycleId, endedCycle.id, 'rendering never auto-renews');
for(const id of ['expenseName','expenseAmount','expenseSpentAt','expenseCategory','saveExpenseButton']){
  assert.equal(elements[id].disabled,true,`${id} is disabled after the cycle ends`);
}
assert.equal(elements.walletExpenseAvailability.textContent,'expenseCycleEnded');
elements.expenseName.value = 'After ended cycle';
elements.expenseAmount.value = '1.00';
elements.expenseSpentAt.value = '2000-01-02T14:00';
assert.equal(wallet.addExpense(), false, 'disabled ended cycles also reject an in-range programmatic add');
assert.equal(elements.walletFormStatus.textContent, 'expenseCycleEnded');

assert.equal(wallet.budgetRenewalStartDay('2026-08-09','2026-08-09'),'2026-08-09','on-time renewal starts at endExclusive');
assert.equal(wallet.budgetRenewalStartDay('2026-08-09','2026-08-12'),'2026-08-12','delayed renewal starts today');

assert.equal(wallet.renewBudgetCycle('same', true), true);
const carriedCycle = context.S.budgetCycles.find(item => item.id === context.S.activeBudgetCycleId);
assert.equal(carriedCycle.startDay, todayKey);
assert.equal(carriedCycle.endExclusive, budgetEndExclusive(todayKey,'day',2));
assert.equal(carriedCycle.totalCents, 300);
assert.equal(carriedCycle.openingCarryCents, 200);
assert.ok(carriedCycle.endExclusive>todayKey,'a delayed renewal is not born expired');
for(const id of ['expenseName','expenseAmount','expenseSpentAt','expenseCategory','saveExpenseButton']){
  assert.equal(elements[id].disabled,false,`${id} is re-enabled for the renewed cycle`);
}
assert.equal(elements.walletExpenseAvailability.textContent,'');

context.S.activeBudgetCycleId = endedCycle.id;
elements.budgetRechargeTotal.value = '5.00';
assert.equal(wallet.renewBudgetCycle('recharge', false), true);
const rechargedCycle = context.S.budgetCycles.find(item => item.id === context.S.activeBudgetCycleId);
assert.equal(rechargedCycle.totalCents, 500);
assert.equal(rechargedCycle.openingCarryCents, 0);
assert.equal(rechargedCycle.startDay,todayKey);

const delayedLegacyMonth={...legacyMonth,id:'ended-legacy-month',startDay:'2000-01-01',endExclusive:'2000-02-01'};
context.S.budgetCycles.push(delayedLegacyMonth);
context.S.activeBudgetCycleId=delayedLegacyMonth.id;
assert.equal(wallet.renewBudgetCycle('same',false),true);
const renewedLegacyMonth=context.S.budgetCycles.find(item=>item.id===context.S.activeBudgetCycleId);
assert.equal(renewedLegacyMonth.periodUnit,'month');
assert.equal(renewedLegacyMonth.periodCount,1);
assert.equal(renewedLegacyMonth.startDay,todayKey);
assert.equal(renewedLegacyMonth.endExclusive,budgetEndExclusive(todayKey,'month',1));

context.S.budgetCycles.push(legacyMonthEnd);
context.S.activeBudgetCycleId=legacyMonthEnd.id;
assert.equal(wallet.renewBudgetCycle('same',false),true);
const renewedMonthEnd=context.S.budgetCycles.find(item=>item.id===context.S.activeBudgetCycleId);
assert.equal(renewedMonthEnd.periodUnit,'month');
assert.equal(renewedMonthEnd.periodCount,1);
assert.equal(renewedMonthEnd.startDay,todayKey);
assert.equal(renewedMonthEnd.endExclusive,budgetEndExclusive(todayKey,'month',1));

context.S.activeBudgetCycleId = endedCycle.id;
assert.equal(wallet.renewBudgetCycle('pause', false), true);
assert.equal(context.S.activeBudgetCycleId, null);

context.S.activeBudgetCycleId = endedCycle.id;
elements.budgetRechargeTotal.value = '9.00';
const cyclesBeforeRenewFailure = JSON.stringify(context.S.budgetCycles);
resetStorageFaults();
storage.set('ll_walletState', JSON.stringify({
  version: 1,
  budgetCycles: context.S.budgetCycles,
  expenses: context.S.expenses,
  activeBudgetCycleId: context.S.activeBudgetCycleId,
}));
const payloadBeforeRenewFailure = storage.get('ll_walletState');
storageFaults.failSetAt = 1;
assert.equal(wallet.renewBudgetCycle('recharge', true), false);
assert.equal(JSON.stringify(context.S.budgetCycles), cyclesBeforeRenewFailure, 'partial storage failures roll back memory');
assert.equal(context.S.activeBudgetCycleId, endedCycle.id);
assert.equal(elements.budgetRechargeTotal.value, '9.00');
assert.equal(elements.walletFormStatus.textContent, 'walletStoreError');
assert.equal(storage.get('ll_walletState'), payloadBeforeRenewFailure, 'failed renewal cannot leave a reload-visible partial commit');
const reloadedWallet = JSON.parse(storage.get('ll_walletState'));
assert.equal(reloadedWallet.activeBudgetCycleId, endedCycle.id);
assert.equal(JSON.stringify(reloadedWallet.budgetCycles), cyclesBeforeRenewFailure);
resetStorageFaults();

console.log('allowance budget behavior: ok');
