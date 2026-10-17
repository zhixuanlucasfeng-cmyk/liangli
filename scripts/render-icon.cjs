// Rasterize our authored vector mark for operating-system installer icons.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
app.whenReady().then(async()=>{
  const window=new BrowserWindow({width:512,height:512,useContentSize:true,show:false,transparent:true,webPreferences:{sandbox:true}});
  const svg=fs.readFileSync('app-icon.svg','utf8');
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:512px;height:512px}</style>'+svg));
  const image=await window.webContents.capturePage({x:0,y:0,width:512,height:512});
  fs.writeFileSync('app-icon.png',image.resize({width:1024,height:1024}).toPNG());app.quit();
});
