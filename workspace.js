function pageWindow(total, requested, capacity) {
  const size=Math.max(1,Math.floor(capacity)||1), pages=Math.max(1,Math.ceil(total/size));
  const page=Math.max(0,Math.min(pages-1,Math.floor(requested)||0));
  return {page,pages,start:page*size,end:Math.min(total,(page+1)*size)};
}
/* Workspace DOM */
(() => {
  const $=id=>document.getElementById(id);
  const zh=()=>lang==='zh';
  const text=(cn,en)=>zh()?cn:en;
  const main=document.querySelector('main'), nav=document.querySelector('nav');
  const routes={today:['今日','Today','把精力留给重要的事。','Make room for what matters.'],pool:['想法','Ideas','先收下灵感，准备好再开始。','A little space for your next idea.'],goals:['目标','Goals','用小步积累，看到长期进展。','Small steps, visible progress.'],focus:['专注','Focus','一次只做一件事。','One thing at a time.'],wallet:['钱包','Wallet','预算、记录和每一笔去向。','Your budget, spending and balance.'],nutrition:['饮食','Nutrition','记录饮食，了解每天的摄入。','A clear view of your daily intake.'],journal:['日记','Journal','留一点空间，记录真实的一天。','A little space to reflect.'],backup:['数据备份','Data backup','导出一份副本，再放心继续。','Keep a copy of what matters.']};
  const icons={wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8h18M16 12h5v4h-5z"/>',nutrition:'<path d="M7 3v7m-3-7v7a3 3 0 006 0V3M7 13v8M18 3v18m0-18c-5 4-5 10 0 10"/>',journal:'<path d="M4 4h12a3 3 0 013 3v14H7a3 3 0 010-6h12M7 4v11M10 8h6"/>',cards:'<rect x="7" y="7" width="14" height="14" rx="2"/><path d="M17 7V3H3v14h4M11 12h6M11 16h4"/>',backup:'<path d="M4 4h16v16H4zM8 4v6h8V4M8 20v-6h8v6"/>'};
  const lifeButton=nav.querySelector('[data-v=life]');lifeButton.remove();
  for(const route of ['wallet','nutrition','journal','cards','backup']){
    if(route==='wallet'||route==='cards'){const divider=document.createElement('div');divider.className='nav-divider';nav.append(divider);}
    const button=document.createElement('button');button.type='button';button.dataset.route=route;
    if(route==='wallet')button.dataset.v='life';
    button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[route]}</svg><span></span>`;
    button.addEventListener('click',()=>route==='cards'?openFlashcards():navigate(route));nav.append(button);
  }
  nav.setAttribute('aria-label','Workspace');
  const foot=document.createElement('div');foot.className='nav-foot';nav.append(foot);
  const head=document.createElement('div');head.className='workspace-head';head.innerHTML='<div><h1 id="workspaceTitle"></h1><p id="workspaceSubtitle"></p></div>';main.prepend(head);
  // Storage recovery must remain visible even when the backup route is closed.
  head.after($('lifeImportStatus'));
  const compact=document.createElement('div');compact.className='compact-switch';compact.innerHTML='<button type="button" data-mode="entry"></button><button type="button" data-mode="records"></button>';head.after(compact);
  const backup=document.createElement('section');backup.className='view';backup.id='v-backup';backup.append($('lifeBackupPanel'));main.append(backup);
  const walletTabs=document.createElement('div');walletTabs.className='workspace-tabs';walletTabs.id='walletTabs';walletTabs.hidden=true;
  for(const [pane,cn,en] of [['overview','概览','Overview'],['entry','记一笔','Add expense'],['history','记录','History'],['categories','分类','Categories'],['budget','预算','Budget']]){
    const button=document.createElement('button');button.type='button';button.dataset.pane=pane;button.dataset.cn=cn;button.dataset.en=en;button.addEventListener('click',()=>showWalletPane(pane));walletTabs.append(button);
  }
  compact.after(walletTabs);
  let current='today',walletPane='overview';
  const pageModes=new Map();
  for(const [selector,editor,records] of [
    ['#v-today','.task-entry-panel','.task-list-panel'],['#v-pool','.pool-entry-panel','.pool-list-panel'],['#v-goals','.goal-entry-panel','.goal-list-panel'],['#v-focus','.timer-panel','.dashboard-panel'],['#lifeNutrition','.nutrition-entry-panel','.nutrition-timeline-panel'],['#lifeJournal','.journal-entry-panel','.journal-list-panel']]){
    const panel=document.querySelector(selector);panel.querySelector(editor).classList.add('workspace-editor');panel.querySelector(records).classList.add('workspace-records');panel.dataset.compact='entry';
  }
  // Move the category report alongside the budget summary, not below it.
  const categoryBox=$('walletCategoryBreakdown');
  const categoryPanel=categoryBox.closest('.card');
  if(categoryPanel)categoryPanel.classList.add('wallet-category-panel');
  const summary=document.querySelector('.wallet-summary-panel');
  document.querySelector('.wallet-cycle-panel').append($('walletCycleEnd'));
  const renewal=document.createElement('button');renewal.className='btn ghost';renewal.style.marginTop='12px';renewal.onclick=()=>showWalletPane('budget');summary.append(renewal);
  if(categoryPanel===summary){
    const panel=document.createElement('section');panel.className='card wallet-category-panel';
    const heading=document.createElement('h2');heading.dataset.i='walletCategoryTitle';panel.append(heading,categoryBox);summary.after(panel);
  }
  function modePanel(){return current==='nutrition'?$('lifeNutrition'):current==='journal'?$('lifeJournal'):$('v-'+current);}
  compact.addEventListener('click',event=>{
    const mode=event.target.closest('[data-mode]')?.dataset.mode;if(!mode)return;
    pageModes.set(current,mode);modePanel().dataset.compact=mode;refreshChrome();paginateAll();
  });
  function refreshChrome(){
    const themeButton=$('themeToggle');themeButton.title=text('夜间模式','Night mode');themeButton.setAttribute('aria-label',themeButton.title);PowvyTheme.refresh();
    const route=routes[current];$('workspaceTitle').textContent=route[zh()?0:1];$('workspaceSubtitle').textContent=route[zh()?2:3];
    for(const button of nav.querySelectorAll('button')){
      const key=button.dataset.route||button.dataset.v;
      const label=key==='cards'?text('卡片学习','Flashcards'):routes[key]?.[zh()?0:1];
      if(label){button.querySelector('span').textContent=label;button.title=label;button.setAttribute('aria-label',label);}
      button.classList.toggle('active',key===current);if(key===current)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
    foot.textContent=text('Powvy Habit · 你的个人工作台','Powvy Habit · Your personal workspace');
    compact.hidden=!['today','pool','goals','focus','nutrition','journal'].includes(current);
    const mode=pageModes.get(current)||'entry';
    compact.querySelectorAll('button').forEach(button=>{button.textContent=button.dataset.mode==='entry'?text('编辑 / 操作','Edit / actions'):text('记录 / 数据','Records / data');button.setAttribute('aria-pressed',String(button.dataset.mode===mode));});
    walletTabs.hidden=current!=='wallet';walletTabs.querySelectorAll('button').forEach(button=>{button.textContent=button.dataset[zh()?'cn':'en'];button.setAttribute('aria-pressed',String(button.dataset.pane===walletPane));});
  }
  function showWalletPane(pane){
    walletPane=pane;$('lifeWallet').dataset.pane=pane;
    for(const [selector,visible] of [['.wallet-cycle-panel',pane==='budget'],['.wallet-summary-panel',pane==='overview'],['.wallet-expense-panel',pane==='entry'],['.wallet-timeline-panel',pane==='history'],['.wallet-category-panel',pane==='overview'||pane==='categories']]){
      document.querySelectorAll('#lifeWallet '+selector).forEach(panel=>panel.hidden=!visible);
    }
    $('walletEmptyState').hidden=Boolean(activeBudgetCycle())||pane==='budget';
    renewal.hidden=!activeBudgetCycle()||!budgetCycleHasEnded(activeBudgetCycle());renewal.textContent=text('周期已结束 · 前往续期','Cycle ended · Renew budget');
    const ended=Boolean(activeBudgetCycle()&&budgetCycleHasEnded(activeBudgetCycle()));
    $('budgetCycleForm').hidden=ended;$('createBudgetButton').parentElement.hidden=ended;
    refreshChrome();requestAnimationFrame(paginateAll);
  }
  const baseGo=go;
  function navigate(route){
    current=route;
    if(['wallet','nutrition','journal'].includes(route)){
      setLifeTab(route,false);baseGo('life',nav.querySelector('[data-v=life]'));
      if(route==='wallet')showWalletPane(activeBudgetCycle()?walletPane:'budget');
    }else baseGo(route,nav.querySelector(`[data-route="${route}"], [data-v="${route}"]`));
    refreshChrome();requestAnimationFrame(paginateAll);
  }
  go=(view)=>navigate(view==='life'?activeLifeTab:view);
  const baseLang=applyLang;applyLang=()=>{baseLang();refreshChrome();paginateAll();};
  const baseWallet=renderWallet;renderWallet=()=>{const result=baseWallet();showWalletPane(activeBudgetCycle()?walletPane:'budget');return result;};
  const baseCreateBudget=createBudgetCycle;createBudgetCycle=()=>{const result=baseCreateBudget();if(result)showWalletPane('overview');return result;};
  const baseWalletStatus=showWalletStatus;showWalletStatus=message=>{baseWalletStatus(message);if(message)toast(message);};
  const baseExpenseEdit=setExpenseForEdit;setExpenseForEdit=id=>{showWalletPane('entry');return baseExpenseEdit(id);};
  const baseFoodEdit=setFoodEntryForEdit;
  setFoodEntryForEdit=id=>{pageModes.set('nutrition','entry');$('lifeNutrition').dataset.compact='entry';refreshChrome();return baseFoodEdit(id);};

  function makeDialog(title){
    const dialog=document.createElement('dialog');dialog.className='detail-dialog';
    const heading=document.createElement('div');heading.className='dialog-head';const h=document.createElement('h2');h.textContent=title;h.id='dialog-'+Math.random().toString(36).slice(2);dialog.setAttribute('aria-labelledby',h.id);
    const close=document.createElement('button');close.type='button';close.className='btn ghost';close.textContent='×';close.setAttribute('aria-label','Close / 关闭');close.onclick=()=>dialog.close();heading.append(h,close);
    const body=document.createElement('div');body.className='dialog-body';dialog.append(heading,body);document.body.append(dialog);return {dialog,body,h};
  }
  const detail=makeDialog(text('完整内容','Full details'));
  function showDetail(value){detail.h.textContent=text('完整内容','Full details');detail.body.textContent='';const p=document.createElement('p');p.textContent=value;detail.body.append(p);detail.dialog.showModal();}
  const schedule=makeDialog(text('任务安排','Task schedule'));schedule.body.append($('taskSchedule'));
  const scheduleDone=document.createElement('button');scheduleDone.className='btn full';scheduleDone.textContent=text('完成','Done');scheduleDone.style.marginTop='18px';scheduleDone.onclick=()=>schedule.dialog.close();schedule.body.append(scheduleDone);
  toggleTaskMore=()=>{$('taskSchedule').hidden=false;$('taskMore').setAttribute('aria-expanded','true');schedule.h.textContent=text('任务安排','Task schedule');scheduleDone.textContent=text('完成','Done');schedule.dialog.showModal();};
  schedule.dialog.addEventListener('close',()=>{$('taskMore').setAttribute('aria-expanded','false');$('taskSchedule').hidden=true;});
  const listIds=['taskList','ideaList','goalList','logList','expenseTimeline','foodTimeline','walletCategoryBreakdown','deckList','cardList'];
  const pagers=new Map();
  for(const id of listIds){
    const list=$(id);list.classList.add('paged-list');
    const bar=document.createElement('div');bar.className='pager';bar.innerHTML='<span role="status" aria-live="polite"></span><div class="pager-controls"><button type="button" data-dir="-1">‹</button><button type="button" data-dir="1">›</button></div>';list.after(bar);
    const state={list,bar,page:0};pagers.set(id,state);
    bar.addEventListener('click',event=>{const dir=event.target.closest('[data-dir]')?.dataset.dir;if(dir){state.page+=Number(dir);paginate(state);}});
    new MutationObserver(()=>{prepareDetails(list);paginate(state);}).observe(list,{childList:true});
    new ResizeObserver(()=>paginate(state)).observe(list);
    prepareDetails(list);
  }
  function prepareDetails(list){
    for(const el of list.querySelectorAll('.t,.gt b,.log p,.food-entry-name,.expense-entry-name,.deck-main strong,.flashcard-item-main strong')){
      if(el.querySelector('.detail-link'))continue;
      const nodes=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE);const value=nodes.map(n=>n.textContent).join('');if(!value.trim())continue;
      const button=document.createElement('button');button.type='button';button.className='detail-link';button.textContent=value;button.title=value;button.addEventListener('click',()=>showDetail(value));
      nodes.forEach(n=>n.remove());el.prepend(button);
    }
  }
  function paginate(state){
    const {list,bar}=state;if(!list.getClientRects().length)return;
    const items=[...list.children].filter(el=>!el.classList.contains('empty')&&!el.classList.contains('flash-empty'));
    let rowHeight=1;items.forEach(el=>{el.hidden=false;rowHeight=Math.max(rowHeight,el.getBoundingClientRect().height);});
    const size=Math.max(1,Math.floor(list.clientHeight/rowHeight));
    const range=pageWindow(items.length,state.page,size);state.page=range.page;
    items.forEach((el,index)=>el.hidden=index<range.start||index>=range.end);
    bar.hidden=items.length===0;bar.firstElementChild.textContent=text(`${range.start+1}–${range.end} / ${items.length} 条`,`${range.start+1}–${range.end} of ${items.length}`);
    const buttons=bar.querySelectorAll('button');buttons[0].disabled=range.page===0;buttons[1].disabled=range.page>=range.pages-1;
    buttons[0].setAttribute('aria-label',text('上一页','Previous page'));buttons[1].setAttribute('aria-label',text('下一页','Next page'));
  }
  function paginateAll(){for(const state of pagers.values())paginate(state);}
  const baseOpenCards=openFlashcards;openFlashcards=async(...args)=>{await baseOpenCards(...args);requestAnimationFrame(paginateAll);};
  const cardsBack=document.createElement('button');cardsBack.className='btn ghost sm';cardsBack.textContent='← '+text('牌组','Decks');cardsBack.onclick=()=>{$('deckEditor').hidden=true;paginateAll();};$('activeDeckName').after(cardsBack);
  window.addEventListener('resize',()=>requestAnimationFrame(paginateAll));
  navigate('today');
})();
