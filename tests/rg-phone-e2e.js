// Ende-zu-Ende-Test der Handy-Ansicht von overview.html: steuert ein fensterloses Chromium ueber das DevTools-Protokoll
// in Handygroesse (360x740, Touch), tippt die App wirklich an (Trefferpruefung am Bildschirmpunkt) und vermisst das Layout.
// Daten: ein Gist-Snapshot (nie ins Repo); ohne Token, also ohne jeden Netzzugriff.
// Aufruf: node tests/rg-phone-e2e.js <snapshot.json> [--shots <ordner>] [--chrome <pfad>] [--old <alte overview.html>]
//         (braucht `ws` im NODE_PATH; --old vergleicht zusaetzlich die Desktop-Ansicht mit einem frueheren Stand)
const fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process');
const WebSocket=require('ws');
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:null;};
const SNAP=args[0];if(!SNAP||SNAP.startsWith('--')){console.error('usage: node rg-phone-e2e.js <snapshot.json> [--shots dir] [--chrome path] [--old file]');process.exit(2);}
const APP=path.join(__dirname,'..','overview.html'),SHOTS=opt('--shots'),OLD=opt('--old');
const CHROME=opt('--chrome')||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!CHROME){console.error('no Chromium found — pass --chrome <path>');process.exit(2);}
const fileUrl=p=>'file:///'+path.resolve(p).replace(/\\/g,'/').replace(/^\//,'');
const doc=fs.readFileSync(SNAP,'utf8');
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  FAIL:',m);}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const STEP=8000; // Obergrenze je Protokollaufruf; ein haengender Schritt bricht den Lauf ab, statt ihn warten zu lassen

(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rg-phone-e2e-'));
  const chrome=spawn(CHROME,['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-gpu','--hide-scrollbars','--allow-file-access-from-files','about:blank'],{stdio:['ignore','ignore','pipe']});
  let ws=null;
  const quit=async code=>{try{if(ws)await send('Browser.close');}catch(e){}try{chrome.kill();}catch(e){}await sleep(300);try{fs.rmSync(profile,{recursive:true,force:true});}catch(e){}process.exit(code);};
  const wsUrl=await new Promise((res,rej)=>{let buf='';const t=setTimeout(()=>rej(new Error('browser did not start')),15000);
    chrome.stderr.on('data',d=>{buf+=d;const m=buf.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(t);res(m[1]);}});
    chrome.on('exit',c=>rej(new Error('browser exited: '+c)));}).catch(e=>{console.error(e.message);process.exit(2);});
  ws=new WebSocket(wsUrl,{perMessageDeflate:false,maxPayload:256*1024*1024});
  await new Promise((res,rej)=>{ws.once('open',res);ws.once('error',rej);});
  let seq=0;const waiting=new Map(),events=[];let sid=null;
  ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id&&waiting.has(m.id)){const w=waiting.get(m.id);waiting.delete(m.id);clearTimeout(w.t);m.error?w.rej(new Error(w.method+': '+m.error.message)):w.res(m.result);}else if(m.method)events.push(m);});
  function send(method,params,noSession){return new Promise((res,rej)=>{const id=++seq;const t=setTimeout(()=>{waiting.delete(id);rej(new Error('no answer within '+STEP+' ms: '+method));},STEP);
    waiting.set(id,{res,rej,t,method});ws.send(JSON.stringify({id,method,params:params||{},...(sid&&!noSession?{sessionId:sid}:{})}));});}
  try{
    const {targetId}=await send('Target.createTarget',{url:'about:blank'},true);
    sid=(await send('Target.attachToTarget',{targetId,flatten:true},true)).sessionId;
    await send('Page.enable');await send('Runtime.enable');
    const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error('page error: '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text)+'\n   in: '+expr.slice(0,160));return r.result.value;};
    const settle=()=>ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(1))))');
    const waitFor=async(expr,what)=>{const t0=Date.now();for(;;){if(await ev('!!('+expr+')'))return true;if(Date.now()-t0>2500){ok(false,'timeout waiting for: '+(what||expr));return false;}await sleep(40);}};
    const metrics=async(w,h,mobile,dpr)=>{await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:dpr||(mobile?3:1),mobile:!!mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:!!mobile,maxTouchPoints:mobile?5:1});await settle();};
    const load=async file=>{events.length=0;await send('Page.navigate',{url:fileUrl(file)});const t0=Date.now();while(!events.some(e=>e.method==='Page.loadEventFired')){if(Date.now()-t0>STEP)throw new Error('page did not load: '+file);await sleep(30);}await settle();};
    const shot=async name=>{if(!SHOTS)return;fs.mkdirSync(SHOTS,{recursive:true});const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(SHOTS,name+'.png'),Buffer.from(r.data,'base64'));};
    // Antippen: Element in den Blick holen, pruefen, dass der Punkt in seiner Mitte wirklich zu ihm gehoert (nichts liegt darueber), dann echte Tipp-Geste
    const tap=async(sel,what)=>{
      const p=await ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return null;el.scrollIntoView({block:'center',inline:'center'});const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);return {x,y,hit:!!h&&(h===el||el.contains(h)||h.contains(el)&&h.closest('[data-act]')===el.closest('[data-act]')),got:h?h.tagName+'.'+h.className:''};})()`);
      if(!p){ok(false,'nothing to tap: '+(what||sel));return false;}
      if(!p.hit){ok(false,'covered by '+p.got+': '+(what||sel));return false;}
      // touchStart + touchEnd: daraus macht der Browser selbst Tipp und Klick (synthesizeTapGesture loest fensterlos keinen Klick aus)
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:Math.round(p.x),y:Math.round(p.y)}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();await sleep(30);await settle();return true;};
    const type=async text=>{await send('Input.insertText',{text});await settle();};
    const enter=async()=>{const k={key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r'};await send('Input.dispatchKeyEvent',{type:'keyDown',...k});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await settle();};
    // Vermessung: nichts ragt seitlich aus dem Bildschirm, alles Antippbare ist gross genug, keine Schrift unter 12 px
    const AUDIT=`(()=>{const W=innerWidth,H=innerHeight,o={over:[],small:[],tiny:[]};
      const name=el=>el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\\s+/).join('.'):'')+(el.dataset&&el.dataset.act?'['+el.dataset.act+']':'');
      const box=el=>{const r=el.getBoundingClientRect();if(r.width<1||r.height<1)return null;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')return null;return r;};
      const scroller=el=>el.closest('.tabs,.cal-leg,.md .tbl,.md pre');
      const top=document.querySelector('.dscrim')||document.querySelector('.drawer')||document.getElementById('app');
      top.querySelectorAll('*').forEach(el=>{const r=box(el);if(!r||scroller(el))return;if(r.right>W+1||r.left<-1)o.over.push(name(el)+' '+Math.round(r.left)+'..'+Math.round(r.right));});
      top.querySelectorAll('button,input,select,textarea,[data-act]').forEach(el=>{const r=box(el);if(!r)return;if(el.matches('.scrim,.dscrim,.sec-h,.s.folded-n'))return;
        let w=r.width,h=r.height;if(el.classList.contains('cb')){w+=18;h+=18;}
        if(h<21.5||w<21.5||(w<29.5&&h<29.5))o.small.push(name(el)+' '+Math.round(w)+'x'+Math.round(h));});
      const tw=document.createTreeWalker(top,NodeFilter.SHOW_TEXT);let n;const seen=new Set();
      while((n=tw.nextNode())){if(!n.nodeValue.trim())continue;const el=n.parentElement;if(!el||seen.has(el)||!box(el))continue;seen.add(el);const fs=parseFloat(getComputedStyle(el).fontSize)*(parseFloat(getComputedStyle(document.querySelector('.zoomer')||el).zoom)||1&&1);if(fs<12)o.tiny.push(name(el)+' '+fs+'px “'+n.nodeValue.trim().slice(0,20)+'”');}
      const uniq=a=>[...new Set(a)];return {over:uniq(o.over).slice(0,12),small:uniq(o.small).slice(0,12),tiny:uniq(o.tiny).slice(0,12),sw:document.documentElement.scrollWidth,W};})()`;
    const audit=async where=>{const a=await ev(AUDIT);
      ok(a.sw<=a.W,where+': page scrolls sideways ('+a.sw+' > '+a.W+')');
      ok(!a.over.length,where+': outside the screen: '+a.over.join(' | '));
      ok(!a.small.length,where+': too small to tap: '+a.small.join(' | '));
      ok(!a.tiny.length,where+': text under 12 px: '+a.tiny.join(' | '));};

    // ── Start in Handygroesse mit den echten Daten ──
    await metrics(360,740,true);
    await load(APP);
    await ev(`(()=>{localStorage.clear();localStorage.setItem('rg3_theme','light');writeLocal(${doc});return 1;})()`); // helles Thema als fester Ausgangspunkt
    await load(APP);
    ok(await ev('document.documentElement.hasAttribute("data-phone")'),'phone layout is on at 360 px');
    ok(await ev('matchMedia("(pointer:coarse)").matches'),'emulation reports a coarse pointer');
    const nProj=await ev('visibleProjects().length');
    ok(nProj>0,'snapshot has visible projects');
    ok(await ev('document.querySelectorAll(".ptabs .tabs button[data-act=pickOne]").length')===nProj,'one tab per visible project');
    ok(await ev('document.querySelectorAll(".pages.bot button").length')===4,'four pages at the bottom');
    ok(await ev('!document.querySelector(".col")&&!!document.querySelector(".one")&&!document.querySelector(".col-h")'),'one project on screen, no columns');
    ok(await ev('(()=>{const b=document.querySelector(".pages.bot").getBoundingClientRect();return Math.abs(b.bottom-innerHeight)<1;})()'),'page bar sits on the bottom edge');
    ok(await ev('document.querySelector(".ptabs .tabs button.on .n").textContent')===String(await ev('countNum(projById(onePid()),S.data[onePid()])')),'active tab carries the number of open tasks');
    await audit('tasks');await shot('01-tasks');

    // ── Projekt wechseln ──
    if(nProj>1){
      const first=await ev('onePid()');
      await tap('.ptabs .tabs button[data-act=pickOne]:not(.on)','another project tab');
      ok(await ev('onePid()')!==first,'tapping a tab switches the project');
      ok(await ev('document.querySelector(".one").dataset.k')==='one-'+await ev('onePid()'),'the screen shows the chosen project');
      await tap(`.ptabs .tabs button[data-pid="${first}"]`,'first project tab');
      ok(await ev('onePid()')===first,'and back');
    }
    // Projekt mit den meisten offenen Tasks nehmen, darin eine offene Task mit Schritten
    const pid=await ev('visibleProjects().map(p=>[p.id,S.data[p.id].todos.filter(t=>tSt(t)==="open"&&!isArch(t)&&(t.subtasks||[]).some(s=>!isArch(s))).length]).sort((a,b)=>b[1]-a[1])[0][0]');
    await tap(`.ptabs .tabs button[data-pid="${pid}"]`,'project with open tasks');
    await ev('(()=>{ui.folded.clear();ui.hideDone=false;ui.q="";renderNow();return 1;})()');
    const tid=await ev(`(()=>{const f=focusOf(S.data[${JSON.stringify(pid)}]);const t=S.data[${JSON.stringify(pid)}].todos.filter(t=>tSt(t)==="open"&&!isArch(t)&&(!f||f.id!==t.id)&&(t.subtasks||[]).some(s=>!isArch(s)))[0];return t?t.id:null;})()`);
    ok(!!tid,'snapshot has an open task with steps');
    const T=`[data-k="t-${tid}"]`,find=`findT(${JSON.stringify(pid)},${JSON.stringify(tid)})`;
    ok(await ev(`(()=>{const r=document.querySelector('${T} .addst'),f=document.querySelector('${T} .fold'),v=e=>e&&getComputedStyle(e).visibility==='visible';return v(r)&&v(f);})()`),'＋ step and the fold arrow are visible without hovering');

    // ── Status ueber die Auswahl unter der Zeile ──
    await tap(`${T} > .cb`,'status box');
    await waitFor(`document.querySelector('${T} + .stpick')`,'status picker under the row');
    await audit('status picker');await shot('02-status-picker');
    await tap(`${T} + .stpick button[data-v="in_progress"]`,'In progress');
    ok(await ev(`rawSt(${find})`)==='in_progress','status set to in progress by two taps');
    ok(await ev('!document.querySelector(".stpick")'),'picker closes after the choice');
    await tap(`${T} > .cb`,'status box again');await tap(`${T} + .stpick button[data-v="open"]`,'Open');
    ok(await ev(`rawSt(${find})`)==='open','and back to open');

    // ── Prioritaet: ein Knopf, Auswahl darunter ──
    const pr0=await ev(`tPr(${find})`),pr1=pr0==='high'?'low':'high';
    await tap(`${T} .prio.pb`,'priority bars');
    await waitFor(`document.querySelector('.stpick[data-k="pp-${tid}"]')`,'priority picker');
    await audit('priority picker');
    await tap(`.stpick[data-k="pp-${tid}"] button[data-v="${pr1}"]`,'priority '+pr1);
    ok(await ev(`tPr(${find})`)===pr1,'priority set');
    ok(await ev('!document.querySelector(".stpick")'),'priority picker closes after the choice');
    await tap(`${T} .prio.pb`,'priority bars');await tap(`.stpick[data-k="pp-${tid}"] button[data-v="${pr0}"]`,'priority back');
    ok(await ev(`tPr(${find})`)===pr0,'priority back');

    // ── Schritt anlegen, Status des Schritts, einklappen ──
    const n0=await ev(`${find}.subtasks.length`);
    await tap(`${T} .addst`,'＋ step');
    await waitFor(`document.activeElement&&document.activeElement.matches('.sub-in')`,'step input has the cursor');
    await type('Phone test step');await enter();
    ok(await ev(`${find}.subtasks.length`)===n0+1&&await ev(`${find}.subtasks.at(-1).text`)==='Phone test step','step added with the keyboard');
    await audit('step input');
    await tap(`${T} .addst`,'＋ step again');
    ok(await ev('!document.querySelector(".sub-in")'),'second tap on ＋ puts the input away');
    const sidNew=await ev(`${find}.subtasks.at(-1).id`);
    await tap(`[data-k="s-${sidNew}"] > .cb`,'step status box');
    await tap(`[data-k="s-${sidNew}"] + .stpick button[data-v="done"]`,'step done');
    ok(await ev(`sSt(${find}.subtasks.at(-1))`)==='done','step set to done');
    await tap(`${T} .fold`,'fold');
    ok(await ev(`ui.folded.has(${JSON.stringify(pid+'|'+tid)})&&!!document.querySelector('[data-k="ss-${tid}"] .folded-n')`),'steps folded to one counter line');
    await tap(`[data-k="ss-${tid}"] .folded-n`,'counter line');
    ok(await ev(`!ui.folded.has(${JSON.stringify(pid+'|'+tid)})`),'tap on the counter line unfolds');

    // ── Details: ganzer Bildschirm, Zurueck-Taste schliesst ──
    const hist0=await ev('history.length');
    await tap(`${T} .tt`,'task title');
    await waitFor('document.querySelector(".drawer")','details');
    ok(await ev('(()=>{const r=document.querySelector(".drawer").getBoundingClientRect();return Math.round(r.width)===innerWidth&&Math.round(r.left)===0;})()'),'details fill the screen');
    await audit('task details');await shot('03-task-details');
    ok(await ev('history.length')===hist0+1,'opening details adds one history entry');
    await ev('(history.back(),1)');await waitFor('!document.querySelector(".drawer")','back closes the details');
    await tap(`${T} .tt`,'task title');await waitFor('document.querySelector(".drawer")','details again');
    await tap('.dr-x','close button');ok(await ev('!ui.drawer'),'✕ closes the details');
    await sleep(150);ok(await ev('history.length')===hist0+1&&await ev('history.state')===null,'closing in the app takes its history entry back — the next Back leaves the app');

    // ── Task anlegen, Menue, Rueckgaengig ──
    const nT=await ev(`S.data[${JSON.stringify(pid)}].todos.length`);
    await tap('.sec-h .add[data-act=startAdd]','＋ in a section head');
    await waitFor(`document.activeElement&&document.activeElement.matches('.add-in')`,'task input has the cursor');
    await type('Phone test task');await enter();
    ok(await ev(`S.data[${JSON.stringify(pid)}].todos.length`)===nT+1,'task added');
    await tap('.sec-h .add[data-act=startAdd]','＋ again');
    await tap('.top .icon[data-act=menu]','menu');
    await waitFor('document.querySelector(".menu")','menu open');
    ok(await ev('(()=>{const r=document.querySelector(".menu").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()'),'menu lies inside the screen');
    ok(await ev('["toggleDone","undo","redo","theme","feedback","newProject","archived","openSync","help"].every(a=>document.querySelector(".menu [data-act="+a+"]"))&&document.querySelectorAll(".menu .zoom button").length===2'),'menu holds everything the desktop header offers');
    await audit('menu');await shot('04-menu');
    await tap('.menu [data-act=undo]','Undo');
    ok(await ev(`S.data[${JSON.stringify(pid)}].todos.length`)===nT,'Undo from the menu takes the task back');
    ok(await ev('!ui.menu'),'menu closes with the choice');
    await tap('.top .icon[data-act=menu]','menu');await tap('.menu .zoom button[data-v="10"]','size +');
    ok(await ev('ui.zoom')===110&&await ev('ui.menu')==='main','size changes, menu stays open');
    await tap('.menu .zoom button[data-v="-10"]','size −');ok(await ev('ui.zoom')===100,'size back');
    const th0=await ev('document.documentElement.dataset.theme');
    await tap('.menu [data-act=theme]','other theme');
    ok(await ev('document.documentElement.dataset.theme')===(th0==='dark'?'light':'dark'),'light/dark switch from the menu');
    await audit('tasks, other theme');await shot('05-tasks-other-theme');
    await tap('.top .icon[data-act=menu]','menu');await tap('.menu [data-act=theme]','first theme');
    ok(await ev('document.documentElement.dataset.theme')===th0,'and back');
    await tap('.top .icon[data-act=menu]','menu');await tap('.menu [data-act=help]','help');
    await waitFor('ui.dialog&&ui.dialog.type==="help"','help');
    ok(await ev('document.querySelector(".dlg").textContent.includes("tabs at the top")&&!document.querySelector(".dlg").textContent.includes("Ctrl+Z")'),'help describes the phone layout');
    await audit('help');
    await ev('(history.back(),1)');await waitFor('!ui.dialog','back closes the dialog');
    // jedes Fenster aus den beiden Menues einmal oeffnen und vermessen
    for(const [where,act] of [['.top','openSync'],['.top','feedback'],['.top','newProject'],['.top','archived'],['.ptabs','editProject'],['.ptabs','newList'],['.ptabs','projArchive']]){
      await tap(where+' .icon[data-act=menu]','menu for '+act);await tap(`${where} .menu [data-act=${act}]`,act);
      if(await waitFor('ui.dialog','window for '+act)){await audit('window '+act);if(act==='openSync')await shot('15-github-connection');await ev('(history.back(),1)');await waitFor('!ui.dialog','back closes '+act);}
    }
    await tap('.ptabs .icon[data-act=menu]','project menu');
    await waitFor('document.querySelector(".ptabs .menu")','project menu open');
    ok(await ev('["editProject","newList","removeList","freeze","projArchive","archiveProject"].every(a=>document.querySelector(".ptabs .menu [data-act="+a+"]"))'),'project menu complete');
    await audit('project menu');
    await ev('(history.back(),1)');await waitFor('!ui.menu','back closes the menu');

    // ── Suche: Trefferzahlen an den Seiten unten ──
    await tap('.top .search input','search');
    const word=await ev(`(${find}.text.match(/[A-Za-z]{4,}/)||["a"])[0]`);
    await type(word);
    ok(await ev('document.querySelectorAll(".pages.bot .hc").length')===4,'search shows the number of matches on every page');
    await audit('search');
    await tap('.top .search button[data-act=clearQ]','clear search');ok(await ev('ui.q')==='','search cleared');
    await ev('(document.activeElement&&document.activeElement.blur(),1)');

    // ── Board ──
    await tap('.pages.bot button[data-v=board]','Board');
    ok(await ev('ui.page')==='board','Board page');
    const pe=await ev('visibleProjects().map(p=>[p.id,S.data[p.id].elements.filter(e=>!isArch(e)&&e.status!=="abandoned").length]).sort((a,b)=>b[1]-a[1])[0]');
    await tap(`.ptabs .tabs button[data-pid="${pe[0]}"]`,'project with elements');
    await audit('board');await shot('06-board');
    if(pe[1]){await tap('.el','an element');await waitFor('ui.drawer&&ui.drawer.type==="element"','element details');await audit('element details');await shot('07-element-details');await ev('(history.back(),1)');await waitFor('!ui.drawer','back');}
    await tap('[data-act=elNew]','＋ New element');await waitFor('ui.dialog&&ui.dialog.type==="elnew"','new element window');
    await audit('new element');await shot('08-new-element');
    await tap('.dlg [data-act=closeDialog]','Cancel');ok(await ev('!ui.dialog'),'Cancel closes the window');

    // ── Journal ──
    await tap('.pages.bot button[data-v=journal]','Journal');
    ok(await ev('ui.page')==='journal','Journal page');
    const pj=await ev('visibleProjects().map(p=>[p.id,S.data[p.id].journal.length]).sort((a,b)=>b[1]-a[1])[0]');
    await tap(`.ptabs .tabs button[data-pid="${pj[0]}"]`,'project with a journal');
    await audit('journal');await shot('09-journal');
    if(pj[1]){await tap('.jd','a journal day');await waitFor('ui.drawer&&ui.drawer.type==="entry"','journal day');await audit('journal day');await shot('10-journal-day');await tap('.dr-x','close');}
    await tap('[data-act=jwrite]','＋ Write a journal entry');await waitFor('ui.dialog&&ui.dialog.type==="jwrite"','journal window');
    await audit('journal window');
    await ev('(history.back(),1)');await waitFor('!ui.dialog','back closes the journal window');

    // ── Kalender: ein Tag pro Zeile, alle Projekte ──
    await tap('.pages.bot button[data-v=calendar]','Calendar');
    await waitFor('document.querySelector(".cal-g")','calendar');
    ok(await ev('getComputedStyle(document.querySelector(".cal-g")).gridTemplateColumns.trim().split(/\\s+/).length')===1,'one day per row');
    ok(await ev('(()=>{const g=document.querySelector(".cal-g"),c=g.querySelector(".cd.now");if(!c)return false;const a=g.getBoundingClientRect(),b=c.getBoundingClientRect();return b.top>=a.top-1&&b.top<a.top+60;})()'),'calendar opens with today at the top');
    ok(await ev('!!document.querySelector(".ptabs .tabs button.all.on")&&calProjects().length===visibleProjects().length'),'calendar starts over all projects');
    ok(await ev('document.querySelector(".cd.now .wd").textContent')===await ev('new Date().toLocaleDateString("en-GB",{weekday:"short"})'),'each day names its weekday');
    await audit('calendar');await shot('11-calendar');
    await tap(`.ptabs .tabs button[data-pid="${pid}"]`,'one project in the calendar');
    ok(await ev('calProjects().length')===1,'a project tab narrows the calendar to that project');
    await tap('.ptabs .tabs button.all','All');ok(await ev('calProjects().length===visibleProjects().length'),'All shows every project again');
    const nEv=await ev('calEvents(true).filter(x=>x.src==="own").length');
    await tap('.cd.now .cadd','＋ in today');await waitFor('ui.dialog&&ui.dialog.type==="calnew"','new entry window');
    ok(await ev('ui.dialog.sd')===await ev('todayStr()'),'the window starts on the tapped day');
    await audit('new calendar entry');await shot('12-new-calendar-entry');
    await tap('#cnt','title field');await type('Phone test entry');
    await tap('.dlg [data-act=calSave]','Add entry');
    ok(await ev('calEvents(true).filter(x=>x.src==="own").length')===nEv+1,'calendar entry added');
    ok(await ev('[...document.querySelectorAll(".cd.now .ce.gc")].some(e=>e.textContent.includes("Phone test entry"))'),'and it shows in today');
    const title0=await ev('document.querySelector(".cal-h h2").textContent');
    await tap('.cal-h [data-act=calNav][data-v="1"]','next month');await sleep(120);await settle();
    ok(await ev('document.querySelector(".cal-h h2").textContent')!==title0,'› jumps to the next month');
    ok(await ev('(()=>{const g=document.querySelector(".cal-g"),c=[...g.querySelectorAll(".cd.m1")].find(c=>{const a=g.getBoundingClientRect(),b=c.getBoundingClientRect();return b.top>=a.top-2&&b.top<a.top+40;});return !!c;})()'),'the first of the month is at the top');
    const before=await ev('document.querySelectorAll(".cd").length');
    await ev('(()=>{const g=document.querySelector(".cal-g");g.scrollTop=g.scrollHeight;return 1;})()');await sleep(200);await settle();
    ok(await ev('document.querySelectorAll(".cd").length')>before,'scrolling to the end loads more days');
    await tap('.cal-h [data-act=calNav][data-v="0"]','Today');await sleep(120);await settle();
    ok(await ev('(()=>{const g=document.querySelector(".cal-g"),c=g.querySelector(".cd.now");const a=g.getBoundingClientRect(),b=c.getBoundingClientRect();return b.top>=a.top-1&&b.top<a.top+60;})()'),'Today brings today back to the top');
    await audit('calendar after jumps');

    // ── Breite wechseln: Desktop-Layout bei breitem Fenster, Handy quer ──
    await metrics(1300,800,false);await settle();
    ok(await ev('!document.documentElement.hasAttribute("data-phone")&&!document.querySelector(".ptabs")&&!document.querySelector(".pages.bot")'),'wide window: desktop layout');
    await metrics(740,360,true);await settle();
    ok(await ev('document.documentElement.hasAttribute("data-phone")'),'phone held sideways keeps the phone layout');
    await ev('(()=>{ui.page="tasks";renderNow();return 1;})()');await audit('tasks, sideways');await shot('13-tasks-sideways');
    await metrics(412,915,true);await ev('(renderNow(),1)');await audit('tasks, 412 px');
    await metrics(320,640,true);await ev('(renderNow(),1)');await audit('tasks, 320 px');await shot('14-tasks-320');
    await ev('(()=>{ui.page="calendar";renderNow();return 1;})()');await settle();await audit('calendar, 320 px');

    // ── Desktop unveraendert: gleiche Daten, gleicher Zustand → gleiches HTML wie der fruehere Stand ──
    if(OLD){
      await metrics(1600,900,false);
      const grab=async file=>{await load(file);const o={};for(const mode of['all','one'])for(const page of['tasks','board','journal','calendar']){
        o[mode+'/'+page]=await ev(`(()=>{ui.mode=${JSON.stringify(mode)};ui.page=${JSON.stringify(page)};ui.q='';ui.drawer=null;ui.dialog=null;ui.menu=null;ui.toast=null;renderNow();return document.getElementById('app').innerHTML;})()`);}return o;};
      await ev(`(()=>{localStorage.clear();writeLocal(${doc});return 1;})()`);
      const a=await grab(OLD),b=await grab(APP);
      for(const k of Object.keys(a))ok(a[k]===b[k],'desktop '+k+' renders as before'+(a[k]===b[k]?'':' (differs at '+[...a[k]].findIndex((c,i)=>c!==b[k][i])+': …'+b[k].slice(Math.max(0,[...a[k]].findIndex((c,i)=>c!==b[k][i])-60),[...a[k]].findIndex((c,i)=>c!==b[k][i])+80)+'…)'));
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    await quit(fail?1:0);
  }catch(e){console.log('  ABORT:',e.message);console.log(`\n${pass} passed, ${fail+1} failed`);await quit(1);}
})();
