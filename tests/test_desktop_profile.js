const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8');
function boot({testProfile,packaged=true,override=false}={}){
  const appData=fs.mkdtempSync(path.join(os.tmpdir(),'powvy-profile-contract-'));
  const paths={},names=[];
  const app={isPackaged:packaged,commandLine:{hasSwitch:()=>override},getPath:()=>appData,setName:name=>names.push(name),
    // Electron documents that setPath rejects a nonexistent directory.
    setPath(name,value){assert(fs.existsSync(value),'Create a clean-install data directory before passing it to Electron');paths[name]=value;},
    requestSingleInstanceLock:()=>false,quit(){}};
  const electron={app,protocol:{registerSchemesAsPrivileged(){}}};
  vm.runInNewContext(source,{require:name=>name==='electron'?electron:require(name),__dirname:path.join(__dirname,'../desktop'),process:{env:{POWY_TEST_PROFILE:testProfile},platform:process.platform}});
  return {appData,paths,names};
}
const clean=boot();
assert.equal(clean.paths.userData,path.join(clean.appData,'Powy'),'Renaming must preserve the established data directory');
assert.equal(clean.paths.sessionData,clean.paths.userData,'Cookies and IndexedDB stay alongside the existing profile');
assert.equal(clean.names[0],'Powvy Habit');
const custom=boot({override:true});assert.deepEqual(custom.paths,{},'Respect explicit user-data-dir overrides');
const testProfile=fs.mkdtempSync(path.join(os.tmpdir(),'powvy-isolated-'));
const isolated=boot({testProfile,packaged:false});assert.equal(isolated.paths.userData,testProfile);assert(!fs.existsSync(path.join(isolated.appData,'Powy')),'Tests must not touch the default app profile');
assert.notEqual(boot({testProfile,packaged:true}).paths.userData,testProfile,'Packaged apps must ignore development-only test variables');
console.log('Clean installs, rename continuity, session storage and isolated profiles passed');
