const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'powvy-theme-'));
  const app=await electron.launch({args:[path.resolve(__dirname,'..')],env:{...process.env,POWY_TEST_PROFILE:profile}});
  try{
    const page=await app.firstWindow();await page.waitForSelector('#workspaceTitle');
    if(await page.locator('#accountWelcome').isVisible())await page.locator('#accountWelcomeContinue').click();
    assert.equal(await page.locator('#themeToggle').count(),1,'A theme switch must be available');
    await page.evaluate(()=>localStorage.removeItem('powvy-habit-theme'));
    await page.emulateMedia({colorScheme:'dark'});await page.reload();
    await page.waitForSelector('#workspaceTitle');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark','First use follows the OS');
    await page.locator('#themeToggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    assert.equal(await page.locator('#themeToggle').getAttribute('aria-pressed'),'false');
    await page.reload();await page.waitForSelector('#workspaceTitle');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light','Explicit choice survives reload and overrides dark OS');
    await page.locator('#themeToggle').click();await page.reload();await page.waitForSelector('#workspaceTitle');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark','Night choice persists');
    assert.equal(await page.title(),'Powvy Habit');
    assert.equal(await page.locator('#appName').innerText(),'Powvy Habit');
    await page.locator('#langBtn').click();
    assert.equal(await page.locator('#themeToggle').getAttribute('aria-label'),'Night mode');
    assert.equal(await page.locator('#themeToggle').getAttribute('aria-pressed'),'true');
    const logo=page.locator('.logo img');assert(await logo.evaluate(el=>el.complete&&el.naturalWidth>0),'Cat logo must load in the desktop protocol');
    for(const route of ['today','wallet','nutrition','journal','backup']){
      await page.locator(`nav [data-route="${route}"],nav [data-v="${route}"]`).click();
      const colors=await page.locator('main').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
      assert.notEqual(colors.bg,'rgb(255, 255, 255)','Night pages must not retain a white canvas');
    }
    const out=path.resolve(__dirname,'../.impeccable/review/habit');fs.mkdirSync(out,{recursive:true});
    await page.locator('#langBtn').click();
    await page.locator('nav [data-v=today]').click();
    for(const task of ['复习今天的课堂笔记（示例）','读完一章书（示例）','放学后散步（示例）']){
      await page.locator('#taskName').fill(task);await page.locator('#taskName').press('Enter');
    }
    for(const [name,width,height] of [['desktop',1440,900],['ipad',820,1180],['mobile',390,844]]){
      await page.setViewportSize({width,height});
      for(const theme of ['light','dark']){
        if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#themeToggle').click();
        const pair=await page.evaluate(()=>{const style=getComputedStyle(document.documentElement);return ['--sub','--selected-bg'].map(key=>style.getPropertyValue(key).trim());});
        const luminance=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
        const [a,b]=pair.map(luminance);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'Secondary text must meet AA on highlighted panels');
        await page.waitForTimeout(180);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,'Theme must not introduce page scrolling');
        await page.screenshot({path:path.join(out,`${name}-${theme}.png`),fullPage:true});
      }
    }
    console.log('Theme follows OS, explicit choices persist, language labels and cat branding passed');
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
