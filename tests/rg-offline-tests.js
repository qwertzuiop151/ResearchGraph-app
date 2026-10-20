// Offline-Tests fuer overview.html (ResearchGraph v3): echte Daten (Gist-Snapshot, nie ins Repo), jsdom, GitHub komplett simuliert
// (Revisionen, Historie, ETag/304, raw_url) inkl. eines "Agenten", der gleichzeitig schreibt.
// Aufruf: node tests/rg-offline-tests.js <gist-snapshot.json>   (braucht jsdom@24 im NODE_PATH)
const fs=require('fs'),path=require('path'),nodeCrypto=require('crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const APP=path.join(__dirname,'..','overview.html');
const SNAP=process.argv[2];if(!SNAP){console.error('usage: node rg-offline-tests.js <snapshot.json>');process.exit(2);}
const html=fs.readFileSync(APP,'utf8');
const snapText=fs.readFileSync(SNAP,'utf8');const snap=JSON.parse(snapText);
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  FAIL:',m);}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ── Simuliertes GitHub ──
function makeGitHub(initialText){
  const revs=[{v:'r0',text:initialText}];let n=0;const log=[];let hook=null;
  const head=()=>revs[revs.length-1];
  const res=(status,body,headers)=>{const t=typeof body==='string'?body:JSON.stringify(body);return {ok:status>=200&&status<300,status,headers:{get:k=>(headers||{})[k]||null},json:async()=>JSON.parse(t),text:async()=>t};};
  const commitsEtag=()=>'"c-'+head().v+'"';
  const gistBody=r=>({id:'G',history:revs.slice().reverse().map(x=>({version:x.v})),files:{'researchgraph_data.json':{truncated:true,content:r.text.slice(0,100),raw_url:'https://raw.test/'+r.v}}});
  const write=(text)=>{n++;const v='r'+n;revs.push({v,text});return v;};
  async function fetch(url,init){
    const m=(init&&init.method)||'GET';log.push(m+' '+url);
    if(url==='https://api.github.com/user')return res(200,{login:'tester'});
    if(url.startsWith('https://raw.test/')){const v=url.slice('https://raw.test/'.length);const r=revs.find(x=>x.v===v);return r?res(200,r.text):res(404,'');}
    let mm;
    if((mm=url.match(/\/gists\/G\/commits\?per_page=(\d+)$/))){
      const inm=init&&init.headers&&init.headers['If-None-Match'];
      if(inm&&inm===commitsEtag())return res(304,'');
      return res(200,revs.slice().reverse().slice(0,+mm[1]).map(x=>({version:x.v})),{ETag:commitsEtag()});
    }
    if((mm=url.match(/\/gists\/G\/(r\d+)$/))){const r=revs.find(x=>x.v===mm[1]);return r?res(200,gistBody(r)):res(404,{});}
    if(url==='https://api.github.com/gists/G'&&m==='GET'){if(hook&&hook.onGet)await hook.onGet();return res(200,gistBody(head()));}
    if(url==='https://api.github.com/gists/G'&&m==='PATCH'){if(hook&&hook.beforePatch){const h=hook.beforePatch;hook.beforePatch=null;await h();}const c=JSON.parse(init.body).files['researchgraph_data.json'].content;const v=write(c);return res(200,{id:'G',history:[{version:v}]});}
    return res(404,{message:'not mocked '+url});
  }
  // Agent: liest den Kopf, aendert, schreibt (wie der MCP: read-modify-write der ganzen Datei)
  function agentWrite(fn){const doc=JSON.parse(head().text);fn(doc);doc.saved=new Date().toISOString();return write(JSON.stringify(doc,null,2));}
  return {fetch,revs,head,log,agentWrite,setHook:h=>{hook=h;},doc:()=>JSON.parse(head().text)};
}
function seed(ls,data,extra){
  ls.setItem('rg_projects',JSON.stringify(data.projects.map(p=>({id:p.id,name:p.name,color:p.color}))));
  data.projects.forEach(p=>['nodes','elements','tags','statuses','todos','journal','ideas'].forEach(k=>ls.setItem('rg_'+p.id+'_'+k,JSON.stringify(p[k]))));
  Object.entries(extra||{}).forEach(([k,v])=>ls.setItem(k,v));
}
function boot(gh,opts){
  opts=opts||{};const errors=[];const vc=new VirtualConsole();
  vc.on('jsdomError',e=>errors.push('jsdomError: '+(e.stack||e.message)));
  vc.on('error',(...a)=>errors.push('console.error: '+a.map(String).join(' ')));
  const dom=new JSDOM(html,{url:'https://rg.test/researchgraph-v3.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.crypto.randomUUID=()=>nodeCrypto.randomUUID();w.CSS=w.CSS||{escape:s=>s};
    w.__RG_TIMING=Object.assign({poll:400,push:150,cap:30},opts.timing||{});
    if(opts.seed)opts.seed(w.localStorage);
    w.fetch=(u,i)=>gh.fetch(u,i);
    w.addEventListener('error',e=>errors.push('window.error: '+e.message));
    w.addEventListener('unhandledrejection',e=>errors.push('unhandled: '+(e.reason&&e.reason.stack||e.reason)));
  }});
  return {dom,w:dom.window,doc:dom.window.document,errors};
}
const click=(env,sel,i)=>{const el=env.doc.querySelectorAll(sel)[i||0];if(!el)throw new Error('missing '+sel);el.dispatchEvent(new env.w.MouseEvent('click',{bubbles:true}));return el;};
const key=(env,el,k,o)=>el.dispatchEvent(new env.w.KeyboardEvent('keydown',Object.assign({key:k,bubbles:true},o||{})));
const typeIn=(env,el,v)=>{el.focus();el.value=v;el.dispatchEvent(new env.w.Event('input',{bubbles:true}));};
const tick=()=>sleep(10);
const until=async(cond,ms)=>{const t0=Date.now();while(Date.now()-t0<(ms||8000)){if(cond())return true;await sleep(40);}return false;};
const P0=snap.projects[0].id,P1=snap.projects[1].id;

(async()=>{
  // ── 1. Start: laedt von GitHub, zeigt alle Projekte als Spalten, schreibt nichts ──
  console.log('1. boot + render');
  let gh=makeGitHub(snapText);
  let env=boot(gh,{timing:{cap:1000,wcap:1000,wcapH:100000},seed:ls=>seed(ls,{projects:[]},{rg_gh_token:'tok',rg_gh_user:'tester',rg_gh_gist:'G'})});
  ok(await until(()=>env.doc.querySelectorAll('.col').length===3),'3 project columns after load');
  ok(env.errors.length===0,'no errors at boot: '+env.errors.join('\n'));
  ok(gh.log.every(l=>l.startsWith('GET')),'loading writes nothing');
  ok(gh.revs.length===1,'no revision created by loading');
  // Jede offene Subtask sichtbar (Regel 7), wenn "done steps" gezeigt werden
  const openSubs=snap.projects.reduce((n,p)=>n+p.todos.filter(t=>t.status!=='done').reduce((m,t)=>m+(t.subtasks||[]).length,0),0);
  ok(env.doc.querySelectorAll('.col .subs .s:not(.hidden-n)').length===openSubs,'all subtasks of open tasks shown ('+openSubs+')');
  const openTodos=snap.projects.reduce((n,p)=>n+p.todos.filter(t=>t.status!=='done').length,0);
  ok(env.doc.querySelectorAll('.col .t').length===openTodos,'every open task shown, no done task ('+openTodos+')');
  const ideasN=snap.projects.reduce((n,p)=>n+p.ideas.filter(i=>!i.archived).length,0);
  ok(env.doc.querySelectorAll('.col .idea').length===ideasN,'all open ideas shown ('+ideasN+')');
  ok(env.doc.querySelectorAll('.col .t.focus').length===snap.projects.filter(p=>p.todos.some(t=>t.focus&&t.status!=='done')).length,'one focus task marked per project');
  // Board + Journal + jede Schublade
  for(const pg of ['board','journal','tasks']){click(env,`[data-act="page"][data-v="${pg}"]`);await tick();ok(env.doc.querySelectorAll('.col').length===3,'3 columns on '+pg);}
  let opened=0;
  for(const p of snap.projects){
    const items=[...p.todos.map(t=>({type:'todo',id:t.id})),...p.todos.flatMap(t=>(t.subtasks||[]).map(s=>({type:'step',id:t.id,sid:s.id}))),...p.ideas.map(i=>({type:'idea',id:i.id})),...p.elements.map(e=>({type:'element',id:e.id})),...p.journal.map(e=>({type:'entry',id:e.id}))];
    for(const it of items){env.w.eval(`openDrawer(${JSON.stringify({...it,pid:p.id})})`);await tick();const dr=env.doc.querySelector('.drawer');if(dr&&dr.textContent.length>3)opened++;else console.log('  no drawer for',it);}
  }
  const total=snap.projects.reduce((n,p)=>n+p.todos.length+p.todos.reduce((m,t)=>m+(t.subtasks||[]).length,0)+p.ideas.length+p.elements.length+p.journal.length,0);ok(opened===total,'every item opens in the drawer ('+opened+'/'+total+')');
  env.w.eval('ui.drawer=null;render()');await tick();
  ok(env.errors.length===0,'no errors while browsing: '+env.errors.slice(0,3).join('\n'));

  // ── 2. Abhaken: eine Op, ein PATCH, Rest der Datei bytegleich ──
  console.log('2. tick a step');
  const t0=snap.projects[0].todos.find(t=>t.status!=='done'&&(t.subtasks||[]).some(s=>s.status!=='done'));
  const s0=t0.subtasks.find(s=>s.status!=='done');
  click(env,`[data-act="cycleStep"][data-sid="${s0.id}"]`);await tick();
  ok(env.doc.querySelector(`[data-act="cycleStep"][data-sid="${s0.id}"]`).className.includes('s-'+({open:'in_progress',in_progress:'done'}[s0.status||'open'])),'step cycles one state at once on screen');
  ok(await until(()=>gh.revs.length===2),'one upload after the click');
  let remote=gh.doc();
  const rs=remote.projects[0].todos.find(t=>t.id===t0.id).subtasks.find(s=>s.id===s0.id);
  ok(rs.status===({open:'in_progress',in_progress:'done'}[s0.status||'open']),'remote has the new step status');
  const exp=JSON.parse(snapText);const es=exp.projects[0].todos.find(t=>t.id===t0.id);es.subtasks.find(s=>s.id===s0.id).status=rs.status;es.modifiedAt=remote.projects[0].todos.find(t=>t.id===t0.id).modifiedAt;
  ok(JSON.stringify(remote.projects)===JSON.stringify(exp.projects),'everything else on GitHub is unchanged');
  ok(await until(()=>env.doc.querySelector('.sync').textContent.includes('Live')),'status shows Live again');

  // ── 3. Agent schreibt -> App zeigt es ohne F5 ──
  console.log('3. agent writes, app shows it');
  gh.agentWrite(doc=>{doc.projects[1].todos.push({id:'t_agent1',text:'AGENT NEW TASK',notes:'',status:'open',category:'labor',order:999,subtasks:[{id:'st_a1',text:'agent step',status:'open'}],priority:'high',focus:false});});
  ok(await until(()=>env.doc.body.textContent.includes('AGENT NEW TASK'),5000),'agent task appears by itself');
  ok(env.doc.body.textContent.includes('agent step'),'agent step appears');

  // ── 4. Gleichzeitig: Agent schreibt genau zwischen App-Lesen und App-PATCH -> beides bleibt ──
  console.log('4. agent writes inside the upload window');
  gh.setHook({beforePatch:async()=>{gh.agentWrite(doc=>{doc.projects[0].ideas.push({id:'idea_agent',title:'AGENT IDEA DURING UPLOAD',desc:'',createdAt:new Date().toISOString()});});}});
  env.w.eval(`ui.adding=${JSON.stringify(P0+'|labor')};render()`);await tick();
  let inp=env.doc.querySelector('.add-in[data-add="todo"]');typeIn(env,inp,'MY TASK DURING AGENT WRITE');key(env,inp,'Enter');
  ok(await until(()=>{const d=gh.doc();return d.projects[0].todos.some(t=>t.text==='MY TASK DURING AGENT WRITE')&&d.projects[0].ideas.some(i=>i.id==='idea_agent');},6000),'both my task and the agent idea are on GitHub');
  remote=gh.doc();
  ok(remote.projects[1].todos.some(t=>t.id==='t_agent1'),'earlier agent task still there');
  ok(remote.projects[0].todos.filter(t=>t.text==='MY TASK DURING AGENT WRITE').length===1,'my task exactly once');
  ok(await until(()=>env.doc.body.textContent.includes('AGENT IDEA DURING UPLOAD')),'app shows the agent idea too');

  // ── 5. App hat alten Stand, Agent hat inzwischen geschrieben, Nutzer hakt ab -> kein Verlust, kein Dialog ──
  console.log('5. stale view + tick');
  env.w.document.dispatchEvent(new env.w.Event('visibilitychange'));
  const agentOnlyV=gh.agentWrite(doc=>{doc.projects[0].todos.find(t=>t.id===t0.id).notes+='\nAGENT NOTE LINE';});
  // sofort (bevor die App pollt) abhaken
  const s1=t0.subtasks.find(s=>s.id!==s0.id&&s.status!=='done')||s0;
  click(env,`[data-act="cycleStep"][data-sid="${s1.id}"]`);
  ok(await until(()=>{const d=gh.doc();const tt=d.projects[0].todos.find(t=>t.id===t0.id);return tt.notes.includes('AGENT NOTE LINE')&&tt.subtasks.find(s=>s.id===s1.id).status!==(snap.projects[0].todos.find(t=>t.id===t0.id).subtasks.find(s=>s.id===s1.id).status||'open');},6000),'agent note AND my tick both on GitHub');
  ok(!env.doc.querySelector('.dlg'),'no conflict dialog');

  // ── 6. Detail-Schublade: Notiz bearbeiten, Status, Prioritaet, Focus exklusiv ──
  console.log('6. drawer editing');
  const mine=gh.doc().projects[0].todos.find(t=>t.text==='MY TASK DURING AGENT WRITE');
  env.w.eval(`openDrawer({type:'todo',pid:${JSON.stringify(P0)},id:${JSON.stringify(mine.id)}})`);await tick();
  click(env,'.drawer [data-act="edit"]');await tick();
  let ta=env.doc.querySelector('textarea[data-in="draft"]');typeIn(env,ta,'**bold** note\n\n| a | b |\n|---|---|\n| 1 | 2 |');key(env,ta,'Enter',{ctrlKey:true});await tick();
  ok(env.doc.querySelector('.drawer .md table'),'notes render as markdown table');
  click(env,'.drawer [data-act="setStatus"][data-v="blocked"]');await tick();
  const bb=env.doc.querySelector('.drawer textarea[data-key^="todo.blockedBy"]');bb.value='primers ordered';bb.dispatchEvent(new env.w.Event('change',{bubbles:true}));await tick();
  click(env,'.drawer [data-act="setPrio"][data-v="high"]');await tick();
  click(env,'.drawer [data-act="toggleFocus"]');await tick();
  ok(await until(()=>{const tt=gh.doc().projects[0].todos.find(t=>t.id===mine.id);return tt.status==='blocked'&&tt.blockedBy==='primers ordered'&&tt.priority==='high'&&tt.focus===true&&tt.notes.startsWith('**bold**');},6000),'drawer edits uploaded');
  ok(gh.doc().projects[0].todos.filter(t=>t.focus).length===1,'focus exclusive in the project');
  ok(gh.doc().projects[1].todos.filter(t=>t.focus).length===snap.projects[1].todos.filter(t=>t.focus).length,'other project focus untouched');
  ok(env.doc.querySelector('.col .t.blocked .sl.block').textContent.includes('primers ordered'),'blocked reason visible in the row');
  // Schritt anlegen + Focus-Step
  inp=env.doc.querySelector('.drawer input[data-add="step"]');typeIn(env,inp,'my new step');key(env,inp,'Enter');await tick();
  const st=findStep=()=>gh.doc().projects[0].todos.find(t=>t.id===mine.id).subtasks;
  ok(await until(()=>st().some(s=>s.text==='my new step')),'step uploaded');
  // zurueck zum alten Focus
  const oldF=snap.projects[0].todos.find(t=>t.focus);
  if(oldF){env.w.eval(`openDrawer({type:'todo',pid:${JSON.stringify(P0)},id:${JSON.stringify(oldF.id)}})`);await tick();click(env,'.drawer [data-act="toggleFocus"]');ok(await until(()=>gh.doc().projects[0].todos.find(t=>t.id===oldF.id).focus===true&&!gh.doc().projects[0].todos.find(t=>t.id===mine.id).focus),'focus moved back');}
  // Loeschen mit Rueckfrage
  env.w.eval(`openDrawer({type:'todo',pid:${JSON.stringify(P0)},id:${JSON.stringify(mine.id)}})`);await tick();
  click(env,'.drawer [data-act="delTodo"]');await tick();
  ok(env.doc.querySelector('.dlg .choice'),'delete asks first');
  click(env,'.dlg .choice',0);
  ok(await until(()=>!gh.doc().projects[0].todos.some(t=>t.id===mine.id)),'task deleted on GitHub');

  // ── 7. Projekt einfrieren / auftauen ──
  let revsBefore7b;
  console.log('7. freeze');
  const P2=snap.projects[2].id;
  env.w.eval(`ui.menu='p:${P2}';render()`);await tick();
  click(env,`[data-act="freeze"][data-pid="${P2}"]`);await tick();
  ok(env.doc.querySelectorAll('.col').length===2,'frozen project hidden');
  ok(await until(()=>gh.doc().projects[2].frozen===true),'frozen flag on GitHub');
  click(env,'[data-act="toggleFrozen"]');await tick();
  ok(env.doc.querySelectorAll('.col').length===3,'show frozen brings it back');
  env.w.eval(`ui.menu='p:${P2}';render()`);await tick();click(env,`[data-act="freeze"][data-pid="${P2}"]`);
  ok(await until(()=>!('frozen' in gh.doc().projects[2])),'unfreeze removes the flag');
  // Projekt umbenennen mit sichtbarer Farbwahl
  env.w.eval(`ui.menu='p:${P2}';render()`);await tick();click(env,`[data-act="editProject"][data-pid="${P2}"]`);await tick();
  click(env,'.dlg [data-act="pickColor"][data-c="#0050ff"]');await tick();
  ok(env.doc.querySelector('.dlg .sw.on').textContent.includes('Blue')&&env.doc.querySelector('.dlg .sw.on i').textContent==='✓','chosen colour visibly ticked');
  click(env,'.dlg [data-act="saveProject"]');
  ok(await until(()=>gh.doc().projects[2].color==='#0050ff'),'colour saved via button');
  ok(env.errors.length===0,'no errors in editing: '+env.errors.slice(0,3).join('\n'));

  // ── 7b. Spalten einklappen und Ein-Projekt-Modus ──
  console.log('7b. collapse + one-project mode');
  await sleep(800);revsBefore7b=gh.revs.length;
  click(env,`[data-act="collapse"][data-pid="${P1}"]`);await tick();
  ok(env.doc.querySelectorAll('.col').length===2&&env.doc.querySelector('.strip'),'collapsed column becomes a strip');
  click(env,'.strip');await tick();
  ok(env.doc.querySelectorAll('.col').length===3&&!env.doc.querySelector('.strip'),'strip click expands it again');
  click(env,`[data-act="solo"][data-pid="${P1}"]`);await tick();
  ok(env.doc.querySelector('.one')&&env.doc.querySelector('.one .col-h h2').textContent.includes(snap.projects[1].name),'solo shows only that project');
  ok(env.doc.querySelectorAll('.one-b>div').length===3,'one-project mode: Lab | General | Ideas side by side');
  click(env,`[data-act="pickOne"][data-pid="${P0}"]`);await tick();
  ok(env.doc.querySelector('.one .col-h h2').textContent.includes(snap.projects[0].name),'project tab switches with one click');
  click(env,'[data-act="mode"][data-v="all"]');await tick();
  ok(env.doc.querySelectorAll('.col').length===3,'back to all projects');
  ok(gh.revs.length===revsBefore7b,'layout changes write nothing to GitHub');

  // ── 8. Rest der Daten unberuehrt ──
  console.log('8. untouched data');
  remote=gh.doc();
  ['nodes','elements','tags','statuses','journal'].forEach(k=>ok(snap.projects.every((p,i)=>JSON.stringify(remote.projects[i][k])===JSON.stringify(p[k])),k+' byte-identical on GitHub'));
  const changedTodoIds=new Set([t0.id,mine.id,oldF&&oldF.id].filter(Boolean));
  ok(snap.projects.every((p,i)=>p.todos.filter(t=>!changedTodoIds.has(t.id)).every(t=>JSON.stringify(remote.projects[i].todos.find(x=>x.id===t.id))===JSON.stringify(t))),'all other todos byte-identical');
  env.w.close();

  // ── 9. Bremse: Endlosschleife von Aenderungen + ausgefallener Upload -> nie mehr als cap Anfragen/Minute ──
  console.log('9. rate guard');
  gh=makeGitHub(snapText);
  const failing=Object.create(gh);let calls=0;
  failing.fetch=async(u,i)=>{calls++;if(i&&i.method==='PATCH')return {ok:false,status:500,headers:{get:()=>null},json:async()=>({}),text:async()=>''};return gh.fetch(u,i);};
  env=boot(failing,{timing:{poll:50,push:20,cap:30},seed:ls=>seed(ls,snap,{rg_gh_token:'tok',rg_gh_user:'tester',rg_gh_gist:'G'})});
  await sleep(300);
  const t2=snap.projects[0].todos.find(t=>t.status!=='done');
  for(let k=0;k<40;k++){env.w.eval(`(()=>{const t=findT(${JSON.stringify(P0)},${JSON.stringify(t2.id)});change(${JSON.stringify(P0)},()=>{t.notes=(t.notes||'')+'x';});})()`);await sleep(25);}
  await sleep(2500);
  ok(calls<=30,'at most 30 requests in the burst (got '+calls+')');
  ok(env.doc.querySelector('.sync.err'),'paused state visible');
  ok(env.w.eval('PENDING.length')>0,'changes kept while paused');
  env.w.close();

  // ── 10. 403 von GitHub -> Pause, keine weiteren Anfragen ──
  console.log('10. 403 backoff');
  gh=makeGitHub(snapText);let after403=0,got403=false;
  const limited=Object.create(gh);
  limited.fetch=async(u,i)=>{if(got403)after403++;if(i&&i.method==='PATCH'){got403=true;return {ok:false,status:403,headers:{get:k=>k==='Retry-After'?'60':null},json:async()=>({}),text:async()=>''};}return gh.fetch(u,i);};
  env=boot(limited,{timing:{poll:50,push:20,cap:30},seed:ls=>seed(ls,snap,{rg_gh_token:'tok',rg_gh_user:'tester',rg_gh_gist:'G'})});
  await sleep(300);
  env.w.eval(`(()=>{const t=findT(${JSON.stringify(P0)},${JSON.stringify(t2.id)});change(${JSON.stringify(P0)},()=>{t.notes='y';});})()`);
  await sleep(1500);
  ok(got403&&after403===0,'no request after a 403 until Retry-After (got '+after403+')');
  ok(env.doc.querySelector('.sync.err'),'pause shown');
  env.w.close();

  // ── 11. Ohne Token: Aenderung bleibt lokal und wird nach dem Verbinden hochgeladen ──
  console.log('11. offline then connect');
  gh=makeGitHub(snapText);
  env=boot(gh,{seed:ls=>seed(ls,snap,{rg_gh_gist:'G'})});await sleep(100);
  ok(env.doc.querySelectorAll('.col').length===3,'local copy shown without token');
  click(env,`[data-act="cycle"][data-id="${t2.id}"]`);await tick();
  ok(gh.log.length===0,'no network without token');
  click(env,'[data-act="openSync"]');await tick();
  typeIn(env,env.doc.querySelector('#tok'),'tok');click(env,'[data-act="connect"]');
  ok(await until(()=>{const tt=gh.doc().projects[0].todos.find(t=>t.id===t2.id);return tt.status!==(t2.status||'open');},5000),'offline change uploaded after connect');
  ok(env.errors.length===0,'no errors: '+env.errors.join('\n'));
  env.w.close();

  // ── 12. Schnelles Abhaken vieler Schritte mit echter Bremse (45/min): alles kommt an, keine Pause ──
  console.log('12. rapid ticking under the real cap');
  gh=makeGitHub(snapText);
  env=boot(gh,{timing:{poll:10000,push:300,burst:3000},seed:ls=>seed(ls,snap,{rg_gh_token:'tok',rg_gh_user:'tester',rg_gh_gist:'G'})});
  ok(await until(()=>env.doc.querySelectorAll('.col').length===3),'loaded');
  const steps=[];snap.projects.forEach(p=>p.todos.filter(t=>t.status!=='done').forEach(t=>(t.subtasks||[]).filter(s=>s.status!=='done').forEach(s=>steps.push({pid:p.id,tid:t.id,sid:s.id,was:s.status||'open'}))));
  const pick=steps.slice(0,15);const reqBefore=gh.log.length;
  for(const x of pick){click(env,`[data-act="cycleStep"][data-sid="${x.sid}"]`);await sleep(700);}
  ok(await until(()=>{const d=gh.doc();return pick.every(x=>{const t=d.projects.find(p=>p.id===x.pid).todos.find(t=>t.id===x.tid);return (t.subtasks.find(s=>s.id===x.sid).status||'open')!==x.was;});},40000),'all 15 ticks reached GitHub');
  ok(!env.doc.querySelector('.sync.err'),'no pause or error');
  console.log('   requests for 15 ticks:',gh.log.length-reqBefore,'| revisions:',gh.revs.length-1);
  env.w.close();

  // ── 13. Direkt in der Zeile: Prioritaet, Schritt anlegen; Strg+Z / Strg+Y; Feedback ──
  console.log('13. inline priority + step, undo/redo, feedback');
  gh=makeGitHub(snapText);
  env=boot(gh,{timing:{cap:1000,wcap:1000,wcapH:100000},seed:ls=>seed(ls,snap,{rg_gh_token:'tok',rg_gh_user:'tester',rg_gh_gist:'G'})});
  ok(await until(()=>env.doc.querySelectorAll('.col').length===3),'loaded');
  const tq=snap.projects[0].todos.find(t=>t.status!=='done'&&!t.focus);
  const prOld=typeof tq.priority==='boolean'?(tq.priority?'high':'low'):(tq.priority||'low'),prNew=prOld==='high'?'low':'high';
  ok(!env.doc.querySelector('.drawer'),'no drawer open');
  click(env,`.col .t [data-act="setPrio"][data-id="${tq.id}"][data-v="${prNew}"]`);await tick();
  ok(!env.doc.querySelector('.drawer'),'priority changed without opening the drawer');
  ok(await until(()=>gh.doc().projects[0].todos.find(t=>t.id===tq.id).priority===prNew),'inline priority uploaded');
  ok(env.doc.querySelectorAll(`.col .t [data-act="setPrio"][data-id="${tq.id}"].on`).length===(prNew==='high'?3:1),'bars show the new priority');
  // Schritt direkt anlegen
  click(env,`.col .t [data-act="startAdd"][data-v="${P0}|step|${tq.id}"]`);await tick();
  inp=env.doc.querySelector(`.sub-in[data-id="${tq.id}"]`);ok(inp&&env.doc.activeElement===inp,'step input appears under the task, focused');
  typeIn(env,inp,'INLINE STEP 1');key(env,inp,'Enter');await tick();
  inp=env.doc.querySelector(`.sub-in[data-id="${tq.id}"]`);ok(inp,'input stays for the next step');
  typeIn(env,inp,'INLINE STEP 2');key(env,inp,'Enter');await tick();key(env,inp,'Escape');await tick();
  ok(!env.doc.querySelector('.sub-in'),'Esc closes the input');
  ok(!env.doc.querySelector('.drawer'),'still no drawer');
  ok(await until(()=>{const s=gh.doc().projects[0].todos.find(t=>t.id===tq.id).subtasks||[];return s.slice(-2).map(x=>x.text).join('|')==='INLINE STEP 1|INLINE STEP 2';}),'both steps uploaded in order');
  // Strg+Z: Aenderungen nacheinander zuruecknehmen, waehrend der Agent anderswo schreibt
  gh.agentWrite(doc=>{doc.projects[0].todos.find(t=>t.id===tq.id).notes='AGENT NOTE DURING UNDO';});
  ok(await until(()=>env.w.eval(`findT(${JSON.stringify(P0)},${JSON.stringify(tq.id)}).notes`)==='AGENT NOTE DURING UNDO'),'agent note arrived');
  const body=env.doc.body,z=o=>key(env,body,'z',Object.assign({ctrlKey:true},o||{}));
  z();await tick();
  ok(await until(()=>{const s=gh.doc().projects[0].todos.find(t=>t.id===tq.id).subtasks||[];return !s.some(x=>x.text==='INLINE STEP 2')&&s.some(x=>x.text==='INLINE STEP 1');}),'Ctrl+Z removes the last step only');
  ok(env.doc.querySelector('.toast')&&env.doc.querySelector('.toast').textContent.includes('INLINE STEP 2'),'toast names what was undone');
  z();await tick();z();await tick();
  ok(await until(()=>{const t=gh.doc().projects[0].todos.find(t=>t.id===tq.id);return !(t.subtasks||[]).some(x=>x.text.startsWith('INLINE STEP'))&&t.priority===tq.priority;}),'two more Ctrl+Z: step 1 gone, old priority back');
  ok(gh.doc().projects[0].todos.find(t=>t.id===tq.id).notes==='AGENT NOTE DURING UNDO','undo keeps what the agent wrote meanwhile');
  key(env,body,'y',{ctrlKey:true});await tick();
  ok(await until(()=>gh.doc().projects[0].todos.find(t=>t.id===tq.id).priority===prNew),'Ctrl+Y redoes the priority');
  // Versehentlich abgehakt -> Strg+Z (der gemeldete Fall)
  const tz=snap.projects[1].todos.find(t=>t.status==='open'||!t.status);
  click(env,`[data-act="cycle"][data-id="${tz.id}"]`);click(env,`[data-act="cycle"][data-id="${tz.id}"]`);await tick();
  ok(await until(()=>gh.doc().projects[1].todos.find(t=>t.id===tz.id).status==='done'),'task ticked done by two clicks');
  z();await tick();z();await tick();
  ok(await until(()=>{const t=gh.doc().projects[1].todos.find(t=>t.id===tz.id);return (t.status||'open')===(tz.status||'open')&&(t.completedAt??null)===(tz.completedAt??null);}),'Ctrl+Z twice restores status and completedAt');
  // Geloeschte Aufgabe kommt mit allen Schritten zurueck
  const td=snap.projects[0].todos.find(t=>t.status!=='done'&&(t.subtasks||[]).length>1&&t.id!==tq.id);
  env.w.eval(`openDrawer({type:'todo',pid:${JSON.stringify(P0)},id:${JSON.stringify(td.id)}})`);await tick();
  click(env,'.drawer [data-act="delTodo"]');await tick();click(env,'.dlg .choice',0);
  ok(await until(()=>!gh.doc().projects[0].todos.some(t=>t.id===td.id)),'task deleted');
  z();await tick();
  ok(await until(()=>JSON.stringify(gh.doc().projects[0].todos.find(t=>t.id===td.id))===JSON.stringify(td)),'Ctrl+Z restores the deleted task byte-identical');
  // Neue Idee: Strg+Z archiviert, loescht nie
  env.w.eval(`ui.adding=${JSON.stringify(P0+'|idea')};render()`);await tick();
  inp=env.doc.querySelector('.add-in[data-add="idea"]');typeIn(env,inp,'UNDO IDEA');key(env,inp,'Enter');key(env,inp,'Escape');await tick();
  ok(await until(()=>gh.doc().projects[0].ideas.some(i=>i.title==='UNDO IDEA')),'idea added');
  z();await tick();
  ok(await until(()=>gh.doc().projects[0].ideas.find(i=>i.title==='UNDO IDEA').archived===true),'Ctrl+Z archives the new idea instead of deleting it');
  // In Textfeldern bleibt Strg+Z das Text-Rueckgaengig
  const nUndo=env.w.eval('UNDO.length');const s=env.doc.querySelector('.search input');s.focus();key(env,s,'z',{ctrlKey:true});await tick();
  ok(env.w.eval('UNDO.length')===nUndo,'Ctrl+Z in a text field does not undo data');
  // Feedback-Dialog: ohne Token -> Tokenfeld; Fehlklick daneben verliert nichts
  env.doc.activeElement.blur();
  click(env,'[data-act="feedback"]');await tick();
  ok(env.doc.querySelector('.dlg #fbt')&&env.doc.querySelector('.dlg #fbk'),'feedback dialog with token field (no token yet)');
  ok(env.doc.querySelector('.dlg').textContent.includes('App: v3'),'context shown');
  typeIn(env,env.doc.querySelector('#fbt'),'Test title');
  env.doc.querySelector('.dscrim').dispatchEvent(new env.w.MouseEvent('click',{bubbles:true}));await tick();
  ok(env.doc.querySelector('.dlg #fbt'),'click beside a started report does not close it');
  let issue=null;const ghFetch=gh.fetch;gh.fetch=async(u,i)=>{if(u.endsWith('/repos/qwertzuiop151/ResearchGraph-app/issues')){issue={u,i};return {ok:true,status:201,headers:{get:()=>null},json:async()=>({number:42})};}return ghFetch(u,i);};
  typeIn(env,env.doc.querySelector('#fbk'),'github_pat_x');click(env,'[data-act="fbSend"]');
  ok(await until(()=>!env.doc.querySelector('.dlg')),'dialog closes after sending');
  ok(issue&&JSON.parse(issue.i.body).title==='Test title'&&issue.i.headers.Authorization==='Bearer github_pat_x','issue posted with the feedback token');
  ok(env.w.localStorage.getItem('rg_fb_token')==='github_pat_x','working token remembered');
  ok(env.doc.querySelector('.toast').textContent.includes('#42'),'issue number shown');
  ok(!html.includes('github_pat_')||!/github_pat_[A-Za-z0-9]{20,}/.test(html),'no token inside the app file');
  ok(env.errors.length===0,'no errors: '+env.errors.slice(0,3).join('\n'));
  env.w.close();

  console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error('HARNESS CRASH',e);process.exit(2);});
