const {app, utilityProcess, Tray, Menu, nativeImage, dialog, shell} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
app.setName('ReplyMate');
const smoke = process.argv.includes('--smoke-test');
const smokeData = smoke ? fs.mkdtempSync(path.join(os.tmpdir(), 'replymate-desktop-test-')) : null;
if (smokeData) app.setPath('userData', smokeData);
let child, tray, origin, stopping = false, timer;
function finish(){tray?.destroy();if(smokeData)fs.rmSync(smokeData,{recursive:true,force:true});app.exit(process.exitCode||0);}
function openApp() { if (origin) shell.openExternal(origin); }
function stop() {
  if (stopping) return;
  stopping = true; clearTimeout(timer);
  if (child) {
    child.postMessage({type:'shutdown'});
    setTimeout(() => { child?.kill(); finish(); }, 2500).unref();
  } else finish();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', openApp);
  app.on('activate', openApp);
  app.on('before-quit', event => { if (!stopping && child) { event.preventDefault(); stop(); } });
  app.on('will-quit', () => { tray?.destroy(); if (smokeData) fs.rmSync(smokeData,{recursive:true,force:true}); });
  app.whenReady().then(() => {
    const root = path.join(__dirname, '..');
    const runtime = app.isPackaged ? path.join(process.resourcesPath,'codex') : path.join(root,'build','codex');
    const bin = path.join(runtime,'bin',process.platform === 'win32' ? 'codex.exe' : 'codex');
    if (!fs.existsSync(bin)) throw Error('安装包缺少 AI 组件，请重新下载完整安装包。');
    const dataDir = path.join(app.getPath('userData'),'data');
    const codexHome = path.join(app.getPath('userData'),'account');
    fs.mkdirSync(codexHome,{recursive:true,mode:0o700});
    const image = nativeImage.createFromPath(path.join(__dirname,'icon.png')).resize({width:22,height:22});
    if (!smoke) {
      tray = new Tray(image); tray.setToolTip('ReplyMate · 答伴');
      tray.setContextMenu(Menu.buildFromTemplate([{label:'打开答伴',click:openApp},{type:'separator'},{label:'退出答伴',click:stop}]));
      tray.on('click',openApp);
      Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'ReplyMate',submenu:[{label:'打开答伴',click:openApp},{type:'separator'},{label:'退出答伴',accelerator:'CmdOrCtrl+Q',click:stop}]}]));
    }
    child = utilityProcess.fork(path.join(root,'server.mjs'),[],{
      cwd:app.getPath('userData'),stdio:'pipe',serviceName:'ReplyMate',
      env:{...process.env,PORT:'0',QA_BACKEND:'auto',QA_FAST_MODEL:'',QA_SECONDARY_MODEL:'',QA_FAST_EFFORT:'',QA_SECONDARY_EFFORT:'',CODEX_BIN:bin,REPLYMATE_DATA_DIR:dataDir,REPLYMATE_CODEX_HOME:codexHome,REPLYMATE_DESKTOP:'1',WHISPER_BIN:'',WHISPER_MODEL:''}
    });
    child.stdout.on('data',()=>{}); child.stderr.on('data',()=>{});
    child.on('exit',code=>{
      clearTimeout(timer);child=null;
      if (!stopping && code) { if(!smoke)dialog.showErrorBox('答伴未能启动','请重新打开应用。如果仍有问题，请重新下载完整安装包。');process.exitCode=1; }
      finish();
    });
    timer=setTimeout(()=>{if(!smoke)dialog.showErrorBox('启动超时','答伴未能启动，请退出后重新打开。');process.exitCode=1;stop();},30000);
    child.on('message',async message=>{
      if(message?.type==='quit'){stop();return;}
      if(message?.type!=='ready')return;
      if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(message.origin))return;
      origin=message.origin;clearTimeout(timer);
      if(smoke){
        try{
          const s=await (await fetch(origin+'/api/status')).json();
          if(s.version!=='2.4.0'||!s.desktop||s.backend!=='demo'||s.auth.signedIn||s.auth.error)throw Error('Clean first-run state did not pass');
          const html=await (await fetch(origin)).text();
          if(!html.includes('会议问答助手')||!html.includes('选择资料'))throw Error('Desktop UI did not load');
          console.log('DESKTOP_SMOKE_OK '+process.platform+' '+process.arch);
        }catch(e){console.error(e.message);process.exitCode=1;}finally{stop();}
      } else openApp();
    });
  }).catch(error=>{if(smoke)console.error(error.message);else dialog.showErrorBox('答伴未能启动',error.message);process.exitCode=1;stop();});
}
