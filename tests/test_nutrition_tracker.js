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
vm.runInContext(`${script.slice(localDayStart, localDayEnd)}\n${script.slice(start, end)}\n;globalThis.nutrition={localDayKey,normalizeFoodEntry,estimateFoodCalories,summarizeCalories,foodEntriesForDay};`, context);
const {localDayKey, normalizeFoodEntry, estimateFoodCalories, summarizeCalories, foodEntriesForDay} = context.nutrition;

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

const uiStart = script.indexOf('let selectedNutritionDay=');
const uiEnd = script.indexOf('/* ============ 记录 ============ */', uiStart);
assert.notEqual(uiStart, -1, 'Nutrition timeline UI controller must exist');
assert.notEqual(uiEnd, -1, 'Nutrition timeline UI controller must precede journal UI');

function element(value='') {
  return {
    value,
    textContent:'',
    innerHTML:'',
    hidden:false,
    checked:false,
    attributes:{},
    focusCount:0,
    focus(){ this.focusCount += 1; },
    setAttribute(key,value){ this.attributes[key]=String(value); },
  };
}
const elements = new Map([
  ['calorieTarget', element('2000')],
  ['foodName', element('')],
  ['foodPortion', element('')],
  ['foodCalories', element('')],
  ['foodEatenAt', element('')],
  ['foodEstimateControls', element('')],
  ['foodEstimateStatus', element('')],
  ['foodFormStatus', element('')],
  ['foodTimeline', element('')],
  ['nutritionSummary', element('')],
  ['nutritionDateLabel', element('')],
  ['favoriteFoodOptions', element('')],
  ['saveFoodButton', element('')],
  ['foodModeManual', element('manual')],
  ['foodModeEstimate', element('estimate')],
]);
const document = {
  getElementById(id){ return elements.get(id); },
};
const stored = new Map();
let getCalls=0,setCalls=0,failGetAt=null,failSetAt=null,failSetsAfterFailure=false,setFailureTriggered=false;
function resetStorageFaults(){
  getCalls=0;setCalls=0;failGetAt=null;failSetAt=null;failSetsAfterFailure=false;setFailureTriggered=false;
}
const localStorage = {
  getItem(key){
    getCalls += 1;
    if(getCalls===failGetAt)throw new Error('security');
    return stored.has(key)?stored.get(key):null;
  },
  setItem(key,value){
    setCalls += 1;
    if(setCalls===failSetAt||(setFailureTriggered&&failSetsAfterFailure)){
      setFailureTriggered=true;
      throw new Error('quota');
    }
    stored.set(key,value);
  },
  removeItem(key){ stored.delete(key); },
};
const uiState = {
  calorieTarget:2000,
  foodEntries:[],
  favoriteFoods:[],
};
const messages = {
  foodManualNeeded:'No estimate found. Enter calories manually.',
  foodNameNeeded:'Enter a food name.',
  foodCaloriesInvalid:'Enter valid calories.',
  foodDateInvalid:'Choose a valid time.',
  foodStoreError:'Could not save. Your form is unchanged.',
  foodSaved:'Food saved.',
  foodUpdated:'Food updated.',
  foodDeleted:'Food deleted.',
  foodFavoriteSaved:'Favorite saved.',
  foodEmptyDay:'No food logged for this day.',
  editFood:'Edit food',
  deleteFood:'Delete food',
  caloriesConsumed:'consumed',
  caloriesRemaining:'remaining',
  calorieUnit:'kcal',
  saveFood:'Save food',
  updateFood:'Update food',
};
const uiContext = {
  document,
  localStorage,
  S:uiState,
  T:key=>messages[key]||key,
  toast(){},
  esc:value=>String(value).replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char])),
  localDayKey,
  estimateFoodCalories,
  summarizeCalories,
  foodEntriesForDay,
  Date,
  Math,
};
uiContext.saveLifeState = () => {
  try {
    localStorage.setItem('ll_lifeState', JSON.stringify({
      version: 1,
      calorieTarget: uiState.calorieTarget,
      foodEntries: uiState.foodEntries,
      favoriteFoods: uiState.favoriteFoods,
      walletState: {version: 1, budgetCycles: [], expenses: [], activeBudgetCycleId: null},
    }));
    return true;
  } catch (error) { return false; }
};
vm.createContext(uiContext);
vm.runInContext(
  `${script.slice(uiStart, uiEnd)}\n;globalThis.nutritionUI={`+
  `currentLocalDateTimeValue,setFoodMode,applyFoodEstimate,addFoodEntry,deleteFoodEntry,`+
  `setFoodEntryForEdit,saveFavoriteFood,renderNutrition,shiftNutritionDay,`+
  `setSelectedDay(day){selectedNutritionDay=day;renderNutrition();}};`,
  uiContext,
);
const ui = uiContext.nutritionUI;

assert.equal(
  ui.currentLocalDateTimeValue(new Date(2026, 7, 9, 8, 5, 42)),
  '2026-08-09T08:05',
  'datetime-local defaults use local date parts',
);

elements.get('foodName').value='两个鸡蛋';
elements.get('foodPortion').value='2 个';
ui.setFoodMode('estimate');
ui.applyFoodEstimate();
assert.equal(elements.get('foodCalories').value, '140');
assert.match(elements.get('foodEstimateStatus').textContent, /^≈\s*140/);
assert.equal(elements.get('foodEstimateControls').hidden, false);

elements.get('foodName').value='完全未知食物';
elements.get('foodCalories').value='321';
ui.applyFoodEstimate();
assert.equal(elements.get('foodCalories').value, '321', 'unmatched estimates keep editable calories');
assert.equal(
  elements.get('foodFormStatus').textContent,
  messages.foodManualNeeded,
  'manual-entry guidance is announced in the always-visible form status',
);
assert.equal(
  elements.get('foodEstimateStatus').textContent,
  '',
  'the hidden estimate disclosure does not retain the unmatched guidance',
);
assert.equal(elements.get('foodCalories').focusCount, 1);
assert.equal(elements.get('foodModeManual').checked, true, 'unmatched estimates select manual mode');
assert.equal(elements.get('foodModeEstimate').checked, false);
assert.equal(elements.get('foodModeManual').attributes['aria-checked'], 'true');
assert.equal(elements.get('foodModeEstimate').attributes['aria-checked'], 'false');
assert.equal(elements.get('foodEstimateControls').hidden, true);

elements.get('foodName').value='';
elements.get('foodPortion').value='1 碗';
elements.get('foodCalories').value='500';
elements.get('foodEatenAt').value='2026-08-09T12:30';
assert.equal(ui.addFoodEntry(), false);
assert.equal(elements.get('foodPortion').value, '1 碗', 'validation errors preserve the form');
assert.equal(elements.get('foodCalories').value, '500');
assert.equal(elements.get('foodEatenAt').value, '2026-08-09T12:30');

elements.get('foodName').value='午饭';
failSetAt=1;
assert.equal(ui.addFoodEntry(), false);
resetStorageFaults();
assert.equal(uiState.foodEntries.length, 0, 'failed storage rolls state back');
assert.equal(elements.get('foodName').value, '午饭', 'snapshot read errors preserve the form');
assert.equal(elements.get('foodPortion').value, '1 碗');
assert.equal(elements.get('foodCalories').value, '500');
assert.equal(elements.get('foodEatenAt').value, '2026-08-09T12:30');
assert.equal(elements.get('foodFormStatus').textContent, messages.foodStoreError);

assert.equal(ui.addFoodEntry(), true);
assert.equal(uiState.foodEntries.length, 1);
assert.equal(JSON.parse(stored.get('ll_lifeState')).foodEntries.length, 1, 'nutrition writes the single canonical Life payload');
const lunchId=uiState.foodEntries[0].id;
assert.equal(uiState.foodEntries[0].mode, 'manual');
ui.renderNutrition();
assert.ok(!elements.get('foodTimeline').innerHTML.includes('≈'), 'manual fallback entries do not render as approximate');

ui.setFoodEntryForEdit(lunchId);
assert.equal(elements.get('foodName').value, '午饭');
assert.equal(elements.get('foodCalories').value, '500');
elements.get('foodCalories').value='510';
assert.equal(ui.addFoodEntry(), true);
assert.equal(uiState.foodEntries.length, 1, 'editing updates instead of duplicating');
assert.equal(uiState.foodEntries[0].calories, 510);

elements.get('foodName').value='<b>苹果 & 梨</b>';
elements.get('foodPortion').value='"大"份';
elements.get('foodCalories').value='95';
elements.get('foodEatenAt').value='2026-08-09T19:00';
ui.setFoodMode('manual');
assert.equal(ui.addFoodEntry(), true);
ui.renderNutrition();
const timeline=elements.get('foodTimeline').innerHTML;
assert.ok(timeline.includes('&lt;b&gt;苹果 &amp; 梨&lt;/b&gt;'));
assert.ok(timeline.includes('&quot;大&quot;份'));
assert.ok(!timeline.includes('<b>苹果'));
assert.match(timeline, /<button type="button" class="food-action"/);
assert.ok(timeline.includes('aria-label="Edit food: &lt;b&gt;苹果 &amp; 梨&lt;/b&gt;"'));
assert.ok(timeline.includes('aria-label="Delete food: &lt;b&gt;苹果 &amp; 梨&lt;/b&gt;"'));

elements.get('foodName').value='苹果';
assert.equal(ui.saveFavoriteFood(), true);
assert.deepEqual(JSON.parse(JSON.stringify(uiState.favoriteFoods)), ['苹果']);
assert.ok(elements.get('favoriteFoodOptions').innerHTML.includes('苹果'));

assert.equal(ui.deleteFoodEntry(lunchId), true);
assert.equal(uiState.foodEntries.some(entry=>entry.id===lunchId), false);

ui.setSelectedDay('2026-03-01');
ui.shiftNutritionDay(-1);
assert.equal(elements.get('nutritionDateLabel').textContent, '2026-02-28', 'previous crosses a month boundary');
ui.shiftNutritionDay(1);
assert.equal(elements.get('nutritionDateLabel').textContent, '2026-03-01', 'next restores the exact day');
ui.shiftNutritionDay(1);
assert.equal(elements.get('nutritionDateLabel').textContent, '2026-03-02', 'next advances exactly one day');

console.log('nutrition tracker behavior: ok');
