const {app,BrowserWindow,protocol,session,Menu,dialog}=require('electron');
const path=require('node:path');
const {readFileSync}=require('node:fs');
const root=path.resolve(__dirname,'..');
const allowed=new Set(['index.html','workspace.css','workspace.js','account-sync.js','app-icon.svg','app-icon.png','manifest.json']);
protocol.registerSchemesAsPrivileged([{scheme:'powy',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
app.setName('Powy');
// Test runs get their own isolated profile; production always uses Electron's durable userData.
if(process.env.POWY_TEST_PROFILE&&!app.isPackaged)app.setPath('userData',process.env.POWY_TEST_PROFILE);
let window;
function isAppPage(url){try{const parsed=new URL(url);return parsed.protocol==='powy:'&&parsed.host==='app';}catch{return false;}}
function createWindow(){
  window=new BrowserWindow({width:1360,height:860,minWidth:900,minHeight:700,backgroundColor:'#f5f6f8',title:'Powy',icon:path.join(root,'app-icon.png'),show:false,
    webPreferences:{sandbox: true,nodeIntegration: false,contextIsolation: true,webSecurity:true,allowRunningInsecureContent:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(!isAppPage(url))event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.once('ready-to-show',()=>window.show());
  window.loadURL('powy://app/index.html');
  window.on('closed',()=>{window=null;});
}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.whenReady().then(()=>{
    protocol.handle('powy',request=>{
      const url=new URL(request.url),file=url.pathname==='/'?'index.html':url.pathname.slice(1);
      if(url.host!=='app'||!allowed.has(file))return new Response('Not found',{status:404});
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
      try{return new Response(readFileSync(path.join(root,file)),{headers:{'Content-Type':types[path.extname(file)],'X-Content-Type-Options':'nosniff'}});}
      catch{return new Response('Not found',{status:404});}
    });
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    // The renderer only needs its packaged files and the existing Supabase endpoint.
    session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{
      const url=new URL(details.url);
      const permitted=isAppPage(details.url)||url.protocol==='devtools:'||url.protocol==='blob:'||
        (url.protocol==='https:'&&url.hostname==='rczhmavbzppssffgdnoh.supabase.co');
      callback({cancel:!permitted});
    });
    const template=[...(process.platform==='darwin'?[{role:'appMenu'}]:[]),{role:'editMenu'},{label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
      {label:'Help',submenu:[{label:'About Powy',click:()=>dialog.showMessageBox(window,{type:'info',title:'Powy',message:`Powy ${app.getVersion()}`,detail:'Preview build · 本机钱包与饮食数据不会自动迁移。请在「数据备份」中导出/导入。账号同步为可选功能。'})}]}];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));createWindow();
    app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
  });
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
