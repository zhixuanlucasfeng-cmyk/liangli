const {_electron:electron}=require('playwright');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');

// Pass an already-built executable. Never use the user's normal app profile.
const executablePath=process.argv[2];
if(!executablePath)throw new Error('Usage: node tests/packaged-smoke.cjs <packaged executable>');
(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'powy-packaged-test-'));
  let app;
  try{
    app=await electron.launch({executablePath:path.resolve(executablePath),args:['--user-data-dir='+profile]});
    const actual=await app.evaluate(({app})=>({profile:app.getPath('userData'),packaged:app.isPackaged,version:app.getVersion()}));
    assert.equal(fs.realpathSync(actual.profile),fs.realpathSync(profile));
    assert.equal(actual.packaged,true);
    const page=await app.firstWindow();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.waitForSelector('#workspaceTitle');
    if(await page.locator('#accountWelcome').isVisible())await page.locator('#accountWelcomeContinue').click();
    await page.locator('nav [data-route=wallet]').click();
    assert.equal(await page.evaluate(()=>typeof require),'undefined');
    assert.equal(await page.evaluate(async()=> (await fetch('powy://app/package.json')).status),404);
    assert.deepEqual(errors,[]);
    console.log('Packaged application launch, wallet navigation and isolation passed:',actual);
  }finally{if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
