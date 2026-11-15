// 可复现真实浏览器演示捕获：Edge隔离context、产品UI真实输入、一个本轮AGH任务、历史回放清晰标记。
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync=promisify(execFile), root=resolve(import.meta.dirname,'..');
const base='http://127.0.0.1:4319', stamp=new Date().toISOString().replaceAll(':','-');
const out=resolve(root,'media','results',stamp), clips=resolve(out,'raw-clips');
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(root,'.cache','ms-playwright');
process.env.TEMP=process.env.TMP=resolve(root,'.tmp');
const ffmpeg=resolve(root,'.cache','ms-playwright','ffmpeg-1011','ffmpeg-win64.exe');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const sha=b=>createHash('sha256').update(b).digest('hex');
const checks=[], recordings=[], screenshots=[], jobs=[], downloads=[], selected=[]; let fatal=null;
console.log(JSON.stringify({recordingOutput:out}));
await mkdir(clips,{recursive:true});
const check=(name,pass,detail=null)=>checks.push({name,pass:Boolean(pass),detail});
async function capture(name, body, {size={width:1440,height:900}, viewport=size}={}){
 const videoDir=resolve(clips,name); await mkdir(videoDir);
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const ctx=await browser.newContext({viewport,recordVideo:{dir:videoDir,size}});
 const page=await ctx.newPage(); let errorList=[];
 page.on('pageerror',e=>errorList.push({type:'pageerror',message:e.message}));
 page.on('console',m=>{if(m.type()==='error')errorList.push({type:'console',message:m.text()})});
 const started=Date.now(); let value=null, thrown=null;
 ctx.on('page',p=>{p.on('pageerror',e=>errorList.push({type:'popup-pageerror',message:e.message}));p.on('console',m=>{if(m.type()==='error')errorList.push({type:'popup-console',message:m.text()})})});
 try{value=await body({browser,ctx,page,caption:async(text,color='#174b3b')=>page.evaluate(({text,color})=>{let b=document.querySelector('#demo-caption');if(!b){b=document.createElement('div');b.id='demo-caption';Object.assign(b.style,{position:'fixed',zIndex:2147483647,right:'12px',top:'8px',maxWidth:'48vw',background:'#174b3b',color:'white',padding:'10px 14px',borderRadius:'5px',font:'bold 16px/1.4 system-ui',boxShadow:'0 2px 12px #0005'});document.body.appendChild(b)}b.style.background=color;b.textContent=text},{text,color}),pause:ms=>wait(ms),shot:async file=>{const p=resolve(out,file);await page.screenshot({path:p});screenshots.push(file);return p}})}catch(e){thrown={name:e.name,message:e.message,stack:e.stack};fatal??=thrown}
 const pageVideo=page.video();
 await ctx.close(); await browser.close();
 const saved=pageVideo?await pageVideo.path().catch(e=>{thrown??={message:e.message};return null}):null;
 if(saved){const target=resolve(clips,`${name}.webm`);await (await import('node:fs/promises')).copyFile(saved,target);const bytes=await readFile(target); recordings.push({name,path:target,bytes:bytes.length,sha256:sha(bytes),wallElapsedMs:Date.now()-started,errors:errorList});}
 else recordings.push({name,path:null,errors:errorList,error:thrown});
 check(`${name}: browser page video saved`,Boolean(saved),{saved,error:thrown});
 check(`${name}: no browser console/page errors`,errorList.length===0,errorList);
 return {value,pageVideo:saved,errors:errorList};
}
async function shotPage(page,name){const path=resolve(out,name);await page.screenshot({path});screenshots.push(name)}
async function loadWorkbench(page,clear=true){await page.goto(base,{waitUntil:'domcontentloaded'});if(clear){await page.evaluate(()=>localStorage.removeItem('studyspace.jobId'));await page.reload({waitUntil:'domcontentloaded'})}}

let freshJob=null;
await capture('01-live-repair-test',async({page,caption,pause})=>{
 await loadWorkbench(page); await caption('本轮真实操作｜模拟房间输入 → 创建新的AGH产品任务');
 const fields={scenario:'模拟场景—录屏新建repair-test六座',roomW:'6',roomD:'5',doorWall:'south',doorWidth:'1',doorOffset:'2',targetSeats:'6',obstacles:'[{"id":"corner-cabinet","x":5.55,"z":4.55,"width":0.5,"depth":0.5,"height":1.8}]',passage:'0.8',orientation:'both',gridSize:'0.2',request:'模拟场景。请保留房间、门、柜体、六座目标及0.8米通道约束，检查草稿并在反馈后搜索、导出和独立验收。'};
 for(const [id,value] of Object.entries(fields)){const el=page.locator(`#${id}`);if(id==='doorWall'||id==='orientation')await el.selectOption(value);else await el.fill(value)}
 await page.locator('#repairTest').check();check('repair-test checked in actual UI',await page.locator('#repairTest').isChecked());
 await shotPage(page,'01-simulated-input-repair-test.png');await pause(7000);
 await caption('一键设计：浏览器 POST /api/jobs，创建本轮新任务');await page.locator('#generate').click();
 await page.waitForFunction(()=>/^[a-f0-9]{32}$/.test(document.querySelector('#jobId')?.textContent.trim()||''),null,{timeout:20000});
 freshJob=(await page.locator('#jobId').textContent()).trim();jobs.push({kind:'new-product-job',jobId:freshJob});
 check('new 32-hex job id shown in UI',/^[a-f0-9]{32}$/.test(freshJob),freshJob);
 console.log(JSON.stringify({freshJob}));
 const start=Date.now();await page.waitForFunction(()=>{const b=document.querySelector('#business')?.textContent.trim(),n=document.querySelector('#native')?.textContent.trim()||'';return b==='pass'&&n.includes('completed')||['约束下未找到','未完成','失败','连接未知','not-completed','constraints-not-satisfied','failed','blocked','error','adapter-error','connection-unknown'].includes(b)||/adapter-error|connection-unknown|failed|blocked|error|unknown/.test(n)},null,{timeout:240000});
 await pause(1500);
 const snapshot=await page.evaluate(()=>({id:document.querySelector('#jobId').textContent.trim(),business:document.querySelector('#business').textContent.trim(),native:document.querySelector('#native').textContent.trim(),trace:[...document.querySelectorAll('#trace [data-step]')].map(x=>({step:x.dataset.step,status:x.dataset.status,call:x.dataset.nativeCall,result:x.dataset.nativeResult,session:x.dataset.sessionId})),checks:document.querySelector('#checks').innerText,compare:document.querySelector('#compare').innerText,seats:document.querySelector('#seatList').innerText,log:document.querySelector('#log').innerText}));
 check('new real AGH product job ends pass/completed',snapshot.business==='pass'&&snapshot.native.includes('completed'),snapshot);
 check('injected draft remains an explicit check-draft failure',snapshot.trace.some(x=>x.step==='check-draft'&&x.status==='fail'));
 check('final independent verify passes',snapshot.trace.some(x=>x.step==='verify'&&x.status==='pass'));
 check('all displayed steps have actual native tool-call/result and session IDs',snapshot.trace.length===7&&snapshot.trace.every(x=>x.call&&x.result&&x.session));
 check('job completes within browser wait window',Date.now()-start<=240000,Date.now()-start);
 await writeFile(resolve(out,'live-ui-snapshot.json'),JSON.stringify(snapshot,null,2));
 if(snapshot.business!=='pass'||!snapshot.native.includes('completed'))throw Error(`Live AGH task did not pass: ${snapshot.business} / ${snapshot.native}`);
 await page.locator('#trace [data-step="check-draft"]').scrollIntoViewIfNeeded();await caption('测试故障注入｜check-draft = fail；原始失败保留，不改写为成功','#884328');
 await shotPage(page,'02-check-draft-fail.png');await pause(11000);
 await page.locator('#trace [data-step="verify"]').scrollIntoViewIfNeeded();await caption('本轮真实任务｜verify = pass；原生调用/结果编号与产品会话可追溯');
 await shotPage(page,'03-final-verify-pass.png');await pause(11000);
 await page.locator('[data-seat="seat-3"]').click();await caption('二维结果｜点击 seat-3 查看实际可达路径；桌、椅及使用空间参与验收');
 await page.locator('#plan').scrollIntoViewIfNeeded();await shotPage(page,'04-2d-seat-path.png');await pause(10000);
 return snapshot;
});
async function annotation(page,text,color='#174b3b'){
 await page.evaluate(({text,color})=>{let el=document.querySelector('#demo-caption');if(!el){el=document.createElement('div');el.id='demo-caption';document.body.appendChild(el)}Object.assign(el.style,{position:'fixed',zIndex:2147483647,right:'12px',top:'8px',maxWidth:'48vw',background:color,color:'white',padding:'10px 14px',borderRadius:'5px',font:'bold 16px/1.4 system-ui'});el.textContent=text},{text,color});
}
async function openHistory(page,id){
 await page.goto(base);await page.evaluate(id=>localStorage.setItem('studyspace.jobId',id),id);await page.reload();
 await page.waitForFunction(id=>document.querySelector('#jobId')?.textContent.trim()===id,id);
}
if(!fatal)await capture('02-download-and-popup',async({page,caption,pause})=>{
 await openHistory(page,freshJob);
 await page.waitForFunction(()=>document.querySelectorAll('#downloads a').length===8);
 await page.locator('#downloads').scrollIntoViewIfNeeded();await caption('本轮任务资产下载｜scene.glb 与 editable.json；来源均为同一真实任务');
 for(const file of ['scene.glb','editable.json']){
  const pending=page.waitForEvent('download');await page.locator(`#downloads a[download][href$="/${file}"]`).click();
  const d=await pending, dest=resolve(out,`download-${file}`);await d.saveAs(dest);
  const bytes=await readFile(dest), original=await readFile(resolve(root,'results','jobs',freshJob,'assets',file));
  downloads.push({file,path:dest,bytes:bytes.length,sha256:sha(bytes),sourceSha256:sha(original)});
  check(`download ${file} byte-identical to job asset`,sha(bytes)===sha(original));await pause(5000);
 }
 await shotPage(page,'05-downloaded-assets.png');await pause(10000);
 const popupPending=page.waitForEvent('popup');await page.click('#view3d');const viewer=await popupPending;
 const openedAt=Date.now();await viewer.waitForFunction(()=>document.querySelector('#canvas')?.dataset.tables==='6',null,{timeout:30000});
 await annotation(viewer,'实际3D弹窗｜从本轮 scene.glb 读取六座；接下来拖动旋转与缩放');
 const data=await viewer.locator('#canvas').evaluate(e=>({...e.dataset}));
 check('popup WebGL actual six tables and furniture',data.tables==='6'&&data.depthTest==='true'&&+data.backs>=6&&+data.legs>=24,data);
 await shotPage(viewer,'06-3d-initial.png');await pause(8000);
 const box=await viewer.locator('#canvas').boundingBox();
 await viewer.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await viewer.mouse.down();await viewer.mouse.move(box.x+box.width*.5+200,box.y+box.height*.5+60,{steps:45});await viewer.mouse.up();await viewer.mouse.wheel(0,-100);
 await annotation(viewer,'实际鼠标拖动后的3D视角｜桌椅、柜体、门与房间来自同一导出资产');
 await pause(3000);await shotPage(viewer,'07-3d-rotated.png');await pause(8000);
 await viewer.locator('#walls').check();await annotation(viewer,'显示墙体｜复核房间与门位置；本演示不是消防认证');await shotPage(viewer,'08-3d-walls.png');await pause(8000);
 await viewer.locator('#walls').uncheck();await viewer.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await viewer.mouse.down();await viewer.mouse.move(box.x+box.width*.5-140,box.y+box.height*.5+20,{steps:35});await viewer.mouse.up();
 await annotation(viewer,'可打开的标准GLB资产｜原始录屏保留；各片段均为1×真实操作速度');
 await pause(Math.max(5000,40000-(Date.now()-openedAt)));
 const video=viewer.video();await viewer.close();const path=await video.path(),bytes=await readFile(path);
 recordings.push({name:'03-actual-3d-popup',path,bytes:bytes.length,sha256:sha(bytes),wallElapsedMs:Date.now()-openedAt,errors:[]});
 check('actual popup video saved',bytes.length>0);
});
const history=JSON.parse(await readFile(resolve(root,'results','phase06-final-summary.json'),'utf8')).productCases;
for(const [name,caseName,isFailure] of [['04-history-boundary','boundary-door-width-equals-passage',false],['05-history-budget-failure','finite-budget-unfound-and-recovery',true]]){
 if(fatal)break;
 const id=history.find(x=>x.case===caseName)?.jobId;
 await capture(name,async({page,caption,pause})=>{
  jobs.push({kind:'historical-replay-no-new-generation',case:caseName,jobId:id});
  const inputResponse=await page.request.get(`${base}/api/jobs/${id}/files/input.json`),input=await inputResponse.json();
  await page.goto(`${base}/api/jobs/${id}/files/input.json`);
  await caption(isFailure?'历史回放（非本轮生成）｜模拟低预算测试；查看原始输入 searchBudget':'历史回放（非本轮生成）｜门宽 = 通行宽度 = 0.8m 的模拟边界场景',isFailure?'#884328':'#174b3b');
  await shotPage(page,`${name}-input.png`);await pause(9000);
  await openHistory(page,id);await page.waitForFunction(()=>{const b=document.querySelector('#business')?.textContent.trim();return ['pass','约束下未找到','未完成','constraints-not-satisfied','not-completed'].includes(b)});
  const state=await page.evaluate(()=>({business:document.querySelector('#business').textContent,native:document.querySelector('#native').textContent,log:document.querySelector('#log').textContent}));
  const actual=await page.request.get(`${base}/api/jobs/${id}`).then(r=>r.json());
  await writeFile(resolve(out,`${name}-snapshot.json`),JSON.stringify({historical:true,jobId:id,input,state,actual},null,2));
  if(isFailure){
   check('historical budget failure retains unsuccessful business status',actual.job.business.status==='constraints-not-satisfied',actual.job.business);
   await page.locator('#trace [data-step="search"]').scrollIntoViewIfNeeded();
   await caption('历史失败测试｜有限预算未找到；不等于绝对无解。未点击恢复、不新建任务。','#884328');
   await shotPage(page,'10-history-budget-failure.png');await pause(15000);
   await page.locator('#log').scrollIntoViewIfNeeded();await caption('保留原始失败与模型/原生状态｜失败任务没有被包装为成功；无资产导出','#884328');
  }else{
   check('historical door-width boundary passes',input.door.width===input.passageWidth&&input.door.width===.8&&actual.job.business.status==='pass',{door:input.door,passageWidth:input.passageWidth,business:actual.job.business});
   await page.locator('#trace [data-step="verify"]').scrollIntoViewIfNeeded();await caption('历史边界案例｜真实原生步骤与最终复核；左侧默认表单不是历史输入');
   await shotPage(page,'09-history-boundary-pass.png');await pause(15000);
   await page.locator('#plan').scrollIntoViewIfNeeded();await caption('历史边界案例的二维结果｜全部模拟场景，无实测、部署或真人试验声明');
  }
  await pause(16000);
 });
}
// SEGMENT_IMPLEMENTATION_DONE
async function ff(args){try{return await execFileAsync(ffmpeg,args,{cwd:root,maxBuffer:8*1024*1024,windowsHide:true})}catch(e){await writeFile(resolve(out,`ffmpeg-error-${Date.now()}.json`),JSON.stringify({args,message:e.message,stderr:e.stderr},null,2));throw e}}
async function measure(path){
 let stderr='';try{({stderr}=await execFileAsync(ffmpeg,['-hide_banner','-i',path],{windowsHide:true}))}catch(e){stderr=e.stderr||''}
 const d=/Duration: (\d+):(\d+):(\d+\.\d+)/.exec(stderr),size=/Video:.*? (\d{3,5})x(\d{3,5})/.exec(stderr);
 if(!d||!size)throw Error(`Cannot measure media ${path}: ${stderr}`);
 return {durationSeconds:+d[1]*3600 + +d[2]*60 + +d[3],width:+size[1],height:+size[2],probeText:stderr};
}
let finalVideo=null,timeline=[],mediaError=null;
try{
 for(const r of recordings)if(r.path)r.media=await measure(r.path);
 if(!fatal){
  const get=n=>recordings.find(r=>r.name===n),live=get('01-live-repair-test');
  // Continuous excerpts only: omit the middle of a long model wait, never accelerate or synthesize frames.
  if(live.media.durationSeconds>95){selected.push({r:live,start:0,duration:15},{r:live,start:live.media.durationSeconds-65,duration:65})}
  else selected.push({r:live,start:0,duration:live.media.durationSeconds});
  const dl=get('02-download-and-popup');selected.push({r:dl,start:0,duration:22});
  for(const n of ['03-actual-3d-popup','04-history-boundary','05-history-budget-failure']){const r=get(n);selected.push({r,start:0,duration:r.media.durationSeconds})}
  await mkdir(resolve(out,'selected-clips'));
  let at=0;
  for(let i=0;i<selected.length;i++){
   const s=selected[i],dest=resolve(out,'selected-clips',`${String(i+1).padStart(2,'0')}.webm`);
   await ff(['-hide_banner','-y','-i',s.r.path,'-ss',String(s.start),'-t',String(s.duration),'-an','-c:v','libvpx','-b:v','1500k','-threads','2',dest]);
   const media=await measure(dest),bytes=await readFile(dest);
   timeline.push({index:i+1,source:relative(root,s.r.path),sourceSha256:s.r.sha256,sourceStartSeconds:s.start,requestedDurationSeconds:s.duration,outputStartSeconds:at,outputEndSeconds:at+media.durationSeconds,speed:1,path:dest,sha256:sha(bytes),media});at+=media.durationSeconds;
  }
  const list=resolve(out,'concat.txt');await writeFile(list,timeline.map(t=>`file '${t.path.replaceAll('\\','/')}'`).join('\n'));
  const path=resolve(out,'studyspace-actual-demo.webm');await ff(['-hide_banner','-y','-f','concat','-safe','0','-i',list,'-c','copy',path]);
  const media=await measure(path),bytes=await readFile(path);finalVideo={path,bytes:bytes.length,sha256:sha(bytes),...media};
  check('video is 180–300 seconds',media.durationSeconds>=180&&media.durationSeconds<=300,media.durationSeconds);
  check('all segments use 1440x900 and speed 1',timeline.every(t=>t.media.width===1440&&t.media.height===900&&t.speed===1));
  check('final webm is 1440x900',media.width===1440&&media.height===900);
  const decoded=await ff(['-hide_banner','-v','error','-i',path,'-f','null','-']);check('entire final video decodes without error',!decoded.stderr.trim(),decoded.stderr);
 }
}catch(e){mediaError={message:e.message,stack:e.stack};check('media processing completes',false,mediaError)}
const hashes={};for(const file of ['tests/record-demo.mjs','workbench.html','viewer.html','src/viewer-webgl.mjs'])hashes[file]=sha(await readFile(resolve(root,file)));
const screenshotHashes=[];for(const file of screenshots){const b=await readFile(resolve(out,file));screenshotHashes.push({file,bytes:b.length,sha256:sha(b)})}
let product=null;if(freshJob){try{product=await fetch(`${base}/api/jobs/${freshJob}`).then(r=>r.json());await writeFile(resolve(out,'new-product-job.json'),JSON.stringify(product,null,2));check('actual product model route matches',product.job.model.name==='gpt-6-astra'&&product.job.model.endpoint==='https://totokens.cc/v1',product.job.model)}catch(e){check('read final product metadata',false,e.message)}}
const report={scope:'phase07 actual demo video only',stamp,out,finishedAt:new Date().toISOString(),pass:!fatal&&!mediaError&&!!finalVideo&&checks.every(c=>c.pass),fatal,mediaError,finalVideo,timeline,recordings,screenshots:screenshotHashes,downloads,jobs,checks,sourceSha256:hashes,model:product?.job?.model,policy:{simulatedScenes:true,newJobMode:'repair-test',historicalReplayExplicit:true,originalFailuresPreserved:true,sourceClipsPreserved:true,speed:1,screenshotFramesInserted:false,audio:'none; visible Chinese annotations',wholeMaterialsStageComplete:false}};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
await writeFile(resolve(out,'report.md'),`# 实际操作视频验收\n\n仅完成阶段07视频子项；不表示全部材料完成。\n\n- 验收：${report.pass?'通过':'未通过（见原始错误）'}\n- 实测时长：${finalVideo?.durationSeconds??'未生成'} 秒\n- 分辨率：${finalVideo?`${finalVideo.width}×${finalVideo.height}`:'未生成'}\n- 视频 SHA-256：${finalVideo?.sha256??'无'}\n- 本轮真实 AGH repair-test 任务：${freshJob}\n- 模型：gpt-6-astra，经 ToTokens Responses 接口；实际用量及状态见 new-product-job.json。\n- 字幕为演示注释，不修改业务数据。历史案例明确标历史；测试草稿失败保留。\n- 无音轨；中文屏幕注释。所有源片保留在 raw-clips；时间线见 report.json。仅连续片段按1×速度合并，未插入截图或生成操作。\n- 所有场景为模拟；不是消防认证、全局最优证明或绝对无解证明。\n\n|检查|结果|\n|---|---|\n${checks.map(c=>`|${c.name}|${c.pass?'PASS':'FAIL'}|`).join('\n')}\n`);
console.log(JSON.stringify({out,pass:report.pass,finalVideo,fatal,mediaError,failedChecks:checks.filter(c=>!c.pass)},null,2));process.exitCode=report.pass?0:1;
