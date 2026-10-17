const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
  value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
  classList: {toggle() {}}, focus() { this.focused = true; },
}]));
const context = {Date, Intl, document: {getElementById: id => elements.get(id)}};
vm.createContext(context);
vm.runInContext([
  script.slice(script.indexOf('const I18N='), script.indexOf('let lang =')),
  'let lang="zh"; const T=k=>I18N[lang][k];',
  script.slice(script.indexOf('function localDayKey('), script.indexOf('function dayOrdinal')),
  script.slice(script.indexOf('const MAX_LIFE_CALORIES='), script.indexOf('function normalizeTaskDays')),
  script.slice(script.indexOf('function esc('), script.indexOf('function renderAll(')),
  script.slice(script.indexOf('function currentLocalDateTimeValue('), script.indexOf('function foodLocalDateTimeValue(')),
  'const S={budgetCycles:[],expenses:[],activeBudgetCycleId:null};',
  script.slice(script.indexOf('/* ============ 钱包'), script.indexOf('/* ============ 记录')),
  'globalThis.wallet={S,renderWallet,renderExpenseTimeline};',
  'localDayKey=()=>"2026-08-31";',
].join('\n'), context);

const cycle = {id:'active',startDay:'2026-08-01',endExclusive:'2026-09-01',totalCents:10000,savingsBps:2000,openingCarryCents:-500};
function expense(id, amountCents, category, extra={}) {
  return {id,cycleId:'active',name:id,amountCents,category,spentAt:'2026-08-31T12:00:00Z',spentDay:'2026-08-31',deletedAt:null,...extra};
}
context.wallet.S.budgetCycles=[cycle];
context.wallet.S.activeBudgetCycleId=cycle.id;
context.wallet.S.expenses=[expense('Lunch',1200,'餐饮'),expense('Snack',300,'Food'),expense('Bus',250,'交通'),expense('Legacy',50,undefined),expense('Deleted',999,'餐饮',{deletedAt:'2026-08-31T14:00:00Z'}),expense('Other cycle',999,'餐饮',{cycleId:'past'})];
context.wallet.renderWallet();
assert.ok(elements.has('walletCycleSpent'), 'wallet must display cycle spending, not only daily spending');
assert.equal(elements.get('walletCycleSpent').textContent,'¥18.00');
assert.equal(elements.get('walletCycleRemaining').textContent,'¥57.00','remaining excludes savings and includes negative carry');

vm.runInContext('globalThis.insights={walletCycleInsights,recentWalletCategories,chooseExpenseCategory,setWalletCategoryFilter};',context);
const api=context.insights;
const original=JSON.stringify(context.wallet.S.expenses);
let report=api.walletCycleInsights(cycle,context.wallet.S.expenses);
assert.deepEqual(JSON.parse(JSON.stringify(report.categories)),[
  {category:'餐饮',amountCents:1500,count:2},
  {category:'交通',amountCents:250,count:1},
  {category:'',amountCents:50,count:1},
]);
assert.equal(JSON.stringify(context.wallet.S.expenses),original,'viewing insights never migrates or rewrites records');
assert.equal(api.walletCycleInsights({...cycle,totalCents:0,savingsBps:0,openingCarryCents:0},[]).remainingCents,0);
assert.equal(api.walletCycleInsights({...cycle,totalCents:0,savingsBps:0,openingCarryCents:0},context.wallet.S.expenses).remainingCents,-1800,'overspending remains negative');
assert.equal(api.walletCycleInsights({...cycle,savingsBps:10000,openingCarryCents:0},[]).remainingCents,0);
assert.equal(api.walletCycleInsights({...cycle,openingCarryCents:500},[]).remainingCents,8500);
assert.match(elements.get('walletCategoryBreakdown').innerHTML,/83\.3%/,'category share uses full-cycle spending');
assert.doesNotMatch(elements.get('walletCategoryBreakdown').innerHTML,/NaN|Infinity/);

api.setWalletCategoryFilter(JSON.stringify('餐饮'));
assert.match(elements.get('expenseTimeline').innerHTML,/Lunch/);
assert.match(elements.get('expenseTimeline').innerHTML,/Snack/,'legacy English category shares the preset filter');
assert.doesNotMatch(elements.get('expenseTimeline').innerHTML,/Bus|Legacy|Deleted|Other cycle/);
assert.equal(elements.get('walletCycleSpent').textContent,'¥18.00','filtering does not change the budget');
api.setWalletCategoryFilter(JSON.stringify(''));
assert.match(elements.get('expenseTimeline').innerHTML,/Legacy/);
assert.doesNotMatch(elements.get('expenseTimeline').innerHTML,/Lunch/);
api.setWalletCategoryFilter('null');
assert.match(elements.get('expenseTimeline').innerHTML,/Bus/);

const recent=[expense('old',1,'餐饮',{updatedAt:'2026-08-29T12:00:00Z'}),expense('new',1,'Food',{updatedAt:'2026-08-31T12:00:00Z'}),expense('custom',1,'Coffee',{cycleId:'past',updatedAt:'2026-08-30T12:00:00Z'}),expense('gone',1,'Deleted category',{deletedAt:'2026-08-31T14:00:00Z',updatedAt:'2026-08-31T14:00:00Z'})];
assert.deepEqual(Array.from(api.recentWalletCategories(recent)),['餐饮','Coffee']);
assert.equal(api.recentWalletCategories(Array.from({length:8},(_,i)=>expense('e'+i,1,'Custom '+i))).length,4);
elements.get('expenseName').value='Keep my draft';
api.chooseExpenseCategory('交通');
assert.equal(elements.get('expenseCategory').value,'交通');
assert.equal(elements.get('expenseName').value,'Keep my draft');
elements.get('expenseCategory').disabled=true;
api.chooseExpenseCategory('餐饮');
assert.equal(elements.get('expenseCategory').value,'交通','shortcut cannot bypass closed-cycle controls');
elements.get('expenseCategory').disabled=false;

context.wallet.S.expenses.push(expense('<script>name</script>',100,'<img src=x onerror=alert(1)>'));
context.wallet.renderWallet();
assert.doesNotMatch(elements.get('walletCategoryBreakdown').innerHTML,/<img|<script/);
assert.doesNotMatch(elements.get('walletCategoryFilter').innerHTML,/<img/);
assert.doesNotMatch(elements.get('expenseTimeline').innerHTML,/<script>/);
api.setWalletCategoryFilter(JSON.stringify('交通'));
context.wallet.S.expenses=context.wallet.S.expenses.map(e=>e.id==='Bus'?{...e,deletedAt:'2026-08-31T14:00:00Z'}:e);
context.wallet.renderWallet();
assert.match(elements.get('expenseTimeline').innerHTML,/Lunch/,'removed filter category resets to all');
context.wallet.S.expenses=context.wallet.S.expenses.map(e=>e.id==='Lunch'?{...e,amountCents:100,category:'学习'}:e);
context.wallet.renderWallet();
assert.equal(elements.get('walletCycleSpent').textContent,'¥5.50','editing an expense updates totals');
assert.match(elements.get('walletCategoryBreakdown').innerHTML,/学习/);
vm.runInContext('lang="en";',context);
context.wallet.renderWallet();
assert.match(elements.get('walletCategoryBreakdown').innerHTML,/Study/);
assert.match(elements.get('walletCategoryChoices').innerHTML,/Shopping/);
api.chooseExpenseCategory('餐饮');
assert.equal(elements.get('expenseCategory').value,'Food','English shortcut fills an English label, not Chinese');
context.wallet.S.expenses=[];
context.wallet.renderWallet();
assert.equal(elements.get('walletCycleSpent').textContent,'CN¥0.00');
assert.doesNotMatch(elements.get('walletCategoryBreakdown').innerHTML,/NaN|Infinity/);
assert.match(elements.get('expenseTimeline').innerHTML,/No expenses/);
console.log('wallet insights: totals, legacy categories, filtering, shortcuts, escaping and updates passed');
