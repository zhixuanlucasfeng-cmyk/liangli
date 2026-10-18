const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
  const app=await electron.launch({args:['.'],env:{...process.env,POWY_TEST_PROFILE:fs.mkdtempSync(path.join(os.tmpdir(),'powy-review-test-'))}});
  try{
    const page=await app.firstWindow();await page.waitForSelector('#workspaceTitle');
    if(await page.locator('#accountWelcome').isVisible())await page.locator('#accountWelcomeContinue').click();
    await page.setViewportSize({width:1280,height:720});
    await page.evaluate(()=>{document.getElementById('flashcardOverlay').hidden=false;document.getElementById('flashcardLibrary').hidden=true;document.getElementById('reviewPanel').hidden=false;document.getElementById('reviewFront').textContent='长卡片正文\n'.repeat(80);});
    const position=await page.evaluate(()=>({card:document.getElementById('reviewCard').getBoundingClientRect().top,front:document.getElementById('reviewFront').getBoundingClientRect().top}));
    assert(position.front>=position.card,'The start of a long flashcard must remain reachable at scrollTop=0');
    fs.mkdirSync('.impeccable/review/fixes',{recursive:true});
    await page.screenshot({path:'.impeccable/review/fixes/long-review.png',fullPage:true});
    await page.evaluate(()=>{document.getElementById('flashcardOverlay').hidden=true;toggleLang();});
    await page.setViewportSize({width:390,height:844});await page.locator('nav [data-route=wallet]').click();
    const right=await page.locator('#walletTabs [data-pane=budget]').evaluate(el=>el.getBoundingClientRect().right);
    assert(right<=390,'English budget navigation must fit on mobile');
    await page.screenshot({path:'.impeccable/review/fixes/mobile-wallet-en.png',fullPage:true});
    await page.evaluate(()=>{lifeStateStorageStatus='invalid';showLifeStorageStatus();});
    assert(await page.locator('#lifeImportStatus').isVisible(),'Storage recovery errors remain visible from Wallet after moving backup into its own route');
    console.log('Long review content is reachable');
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
