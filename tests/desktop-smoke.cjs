const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'powy-desktop-test-'));
const root=path.resolve(__dirname,'..');
const screenshots=path.join(root,'.impeccable/review');fs.mkdirSync(screenshots,{recursive:true});
(async()=>{
  let app;
  try{
    app=await electron.launch({args:[root],env:{...process.env,POWY_TEST_PROFILE:profile}});
    const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForSelector('#workspaceTitle');
    if(await page.locator('#accountWelcome').isVisible())await page.locator('#accountWelcomeContinue').click();
    assert.equal(await page.evaluate(()=>typeof require),'undefined');
    assert.equal(await page.locator('nav [data-route=wallet]').count(),1);
    assert.equal(await page.locator('#companionStage,video').count(),0);
    assert.equal(await page.evaluate(async()=> (await fetch('powy://app/package.json')).status),404,'Protocol cannot read arbitrary packaged files');
    for(let i=1;i<=18;i++){await page.locator('#taskName').fill('验证任务 '+i);await page.locator('#taskName').press('Enter');}
    await page.waitForTimeout(150);
    const count=await page.locator('#taskList>.item:visible').count();assert(count>0&&count<18,'Tasks must be paginated');
    await page.locator('#taskList + .pager [data-dir="1"]').click();
    const nextText=await page.locator('#taskList').innerText();assert(!nextText.includes('验证任务 1\n'),'Next page must change records');
    await page.locator('nav [data-route=wallet]').click();
    await page.locator('#budgetTotalAmount').fill('1000');await page.locator('#createBudgetButton').click();
    await page.locator('#walletTabs [data-pane=entry]').click();
    await page.locator('#expenseName').fill('午餐');await page.locator('#expenseAmount').fill('25');
    await page.locator('#walletCategoryChoices [data-category="餐饮"]').click();await page.locator('#saveExpenseButton').click();
    await page.locator('#walletTabs [data-pane=overview]').click();assert((await page.locator('#walletCycleSpent').innerText()).includes('25.00'));
    await page.screenshot({path:path.join(screenshots,'wallet.png'),fullPage:true});
    // One batched layout inspection at the requested device classes.
    const sizes=[['desktop',1440,900],['laptop',1280,720],['ipad-landscape',1180,820],['ipad-portrait',820,1180],['mobile',390,844]];
    const overflows=[];
    for(const [name,width,height] of sizes){
      await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setMinimumSize(320,650),{width,height});
      await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
      await page.setViewportSize({width,height});
      for(const route of ['today','pool','goals','focus','wallet','nutrition','journal','backup']){
        await page.locator(`nav [data-route="${route}"],nav [data-v="${route}"]`).click();await page.waitForTimeout(60);
        async function checkLayout(label){const result=await page.evaluate(()=>{
          const main=document.querySelector('main');
          const bad=[...main.querySelectorAll('button,input,textarea,select,.pager')].filter(el=>el.getClientRects().length).filter(el=>{const r=el.getBoundingClientRect();return r.bottom>innerHeight+1||r.right>innerWidth+1||r.left<0;}).map(el=>el.id||el.className||el.tagName);
          return {overflow:document.documentElement.scrollHeight>innerHeight+1||main.scrollHeight>main.clientHeight+1,bad};
        });
        if(result.overflow||result.bad.length)overflows.push({name,route:label,...result});}
        await checkLayout(route);
        if(route==='wallet')for(const pane of ['overview','entry','history','categories','budget']){
          await page.locator(`#walletTabs [data-pane=${pane}]`).click();await page.waitForTimeout(60);await checkLayout('wallet-'+pane);
        }
        if(width<=850&&['today','pool','goals','focus','nutrition','journal'].includes(route)){
          await page.locator('.compact-switch [data-mode=records]').click();await page.waitForTimeout(60);await checkLayout(route+'-records');
          await page.locator('.compact-switch [data-mode=entry]').click();
        }
        if(route==='today')await page.screenshot({path:path.join(screenshots,name+'.png'),fullPage:true});
      }
    }
    await page.setViewportSize({width:1280,height:720});
    await page.locator('nav [data-route=cards]').click();await page.locator('#deckName').fill('测试牌组');await page.locator('[onclick="createDeck()"]').click();
    await page.locator('#cardFront').fill('What matters today?');await page.locator('#cardBack').fill('One thing at a time.');await page.locator('[onclick="addFlashcard()"]').click();
    await page.locator('[onclick="startReview()"]').click();await page.locator('#showAnswerBtn').click();await page.locator('[data-grade=good]').click();
    await page.locator('#flashcardClose').click();
    await page.locator('#langBtn').click();assert.equal(await page.locator('nav [data-route=wallet]').innerText(),'Wallet');
    fs.writeFileSync(path.join(screenshots,'layout-results.json'),JSON.stringify(overflows,null,2));
    console.log('Layout issues:',JSON.stringify(overflows));
    assert.deepEqual(errors,[],'No renderer errors');
    await app.close();app=null;
    app=await electron.launch({args:[root],env:{...process.env,POWY_TEST_PROFILE:profile}});
    const restored=await app.firstWindow();await restored.waitForSelector('#workspaceTitle');
    assert.equal(await restored.evaluate(()=>S.tasks.length),18,'Tasks persist after desktop restart');
    assert.equal(await restored.evaluate(()=>S.expenses.filter(x=>!x.deletedAt).length),1,'Wallet persists after desktop restart');
    console.log('Desktop navigation, pagination, wallet, isolation and restart persistence passed');
    assert.deepEqual(overflows,[],'Main workflows must fit the viewport');
  }finally{if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
