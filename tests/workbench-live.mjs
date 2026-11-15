import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeAndValidate} from '../src/schema.mjs';
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--job'&&/^[a-f0-9]{32}$/.test(args[1])))throw Error('Usage: node tests/workbench-live.mjs [--job 32hexID]');
const resumeId=args[1],root=resolve(import.meta.dirname,'..'),base='http://127.0.0.1:4319';
const historical='c13f1131a17f4160be0654a4d08ee475',steps=['inspect','search','check-search','export','verify'];
const out=resolve(root,'results',`workbench-live-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await mkdir(out,{recursive:true});
const report={started:new Date().toISOString(),mode:resumeId?'read-only continuation':'single live normal submission',status:'running',jobId:resumeId??null,posts:[],checks:[],pageErrors:[],screenshots:[],sourceSha256:{},artifactSha256:{}};
const hash=b=>createHash('sha256').update(b).digest('hex');
async function persist(){await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2))}
async function check(name,fn){try{await fn();report.checks.push({name,status:'pass'})}catch(e){report.checks.push({name,status:'fail',error:e.message});throw e}finally{await persist()}}
async function json(path){const r=await fetch(base+path,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(`GET ${path}: HTTP ${r.status}`);return r.json()}
async function shot(page,name){await page.screenshot({path:resolve(out,name),fullPage:true});report.screenshots.push(name);await persist()}
for(const file of ['tests/workbench-live.mjs','workbench.html','src/workbench-ui.js','src/task-api.mjs','src/agh-runner.mjs','src/schema.mjs'])report.sourceSha256[file]=hash(await readFile(resolve(root,file)));
await persist();
let browser,page;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 context.on('page',p=>p.on('pageerror',e=>report.pageErrors.push(e.message)));
 context.on('request',req=>{if(req.method()==='POST'){report.posts.push({url:req.url(),body:req.postData(),time:new Date().toISOString()});void persist()}});
 page=await context.newPage();await page.goto(base);
 await page.waitForFunction(()=>document.querySelector('.furniture-cards tbody').rows.length===1);
 if(resumeId){
  await page.evaluate(id=>openJob(id,false),resumeId);
  await shot(page,'start.png');
 }else{
  await check('six-seat draft 6x5, one cabinet, normal mode',async()=>{assert.equal(await page.locator('#roomW').inputValue(),'6');assert.equal(await page.locator('#roomD').inputValue(),'5');assert.equal(await page.locator('#targetSeats').inputValue(),'6');assert.equal(await page.locator('.furniture-cards tbody tr').count(),1);assert.equal(await page.locator('#repairTest').isChecked(),false)});
  await shot(page,'start.png');
  // This is the only submission in this script. No intercept, retry or recovery POST.
  const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/jobs');
  await page.locator('#generate').click();
  const response=await responsePromise,data=await response.json();
  report.submission={httpStatus:response.status(),response:data};report.jobId=data.jobId??null;await persist();
  await check('one POST produces new ID and locks input',async()=>{assert.equal(response.ok(),true);assert.match(report.jobId,/^[a-f0-9]{32}$/);assert.notEqual(report.jobId,historical);assert.equal(report.posts.length,1);assert.equal(await page.locator('#roomW').isDisabled(),true);assert.equal(await page.locator('#repairTest').isDisabled(),true);assert.equal(await page.locator('#generate').isDisabled(),true)});
 }
 assert.match(report.jobId,/^[a-f0-9]{32}$/);
 const id=report.jobId,deadline=Date.now()+300000;report.waitStarted=new Date().toISOString();await persist();
 while(true){
  const d=await json(`/api/jobs/${id}`);report.lastState=d;report.lastObserved=new Date().toISOString();await persist();
  if(d.job?.business?.status==='pass'&&d.job?.native?.status==='completed')break;
  const cs=d.connection?.status||d.job?.connection?.status;
  if(['adapter-error','connection-unknown','failed','blocked','error'].includes(cs)||['not-completed','constraints-not-satisfied'].includes(d.job?.business?.status)||['failed','blocked','error'].includes(d.job?.native?.status))throw Error(`Task stopped: ${JSON.stringify({business:d.job.business,native:d.job.native,connection:d.connection})}`);
  if(Date.now()>=deadline){report.status='timeout';throw Error('300-second observation deadline; original task remains unchanged; use --job ID for read-only continuation')}
  await page.waitForTimeout(Math.min(2000,deadline-Date.now()));
 }
 await check('normal task, model route and recorded usage',async()=>{const j=report.lastState.job;assert.equal(j.mode,'normal');assert.equal(j.business.status,'pass');assert.equal(j.native.status,'completed');assert.equal(j.model.name,'gpt-6-astra');assert.equal(j.model.endpoint,'https://totokens.cc/v1');assert.equal(j.model.api,'Responses');assert.ok(j.model.usage?.totals);report.model=j.model;report.sessionId=j.sessionId});
 const input=await json(`/api/jobs/${id}/files/input.json`),verify=await json(`/api/jobs/${id}/files/verify.json`),editable=await json(`/api/jobs/${id}/assets/editable.json`);
 await check('input snapshot and independent verification',async()=>{assert.equal(input.room.width,6);assert.equal(input.room.depth,5);assert.equal(input.targetSeats,6);assert.equal(input.obstacles.length,1);assert.equal(verify.status,'pass');const normalized=normalizeAndValidate(input);assert.equal(normalized.ok,true,JSON.stringify(normalized.issues));assert.deepEqual(editable.input,normalized.value);report.input=input;report.normalizedInput=normalized.value;report.inputComparison='editable.input equals normalizeAndValidate(raw snapshot).value; original snapshot retained unchanged';report.rawInputSha256=hash(await readFile(resolve(root,'results/jobs',id,'input.json')));report.verifyStatus=verify.status});
 for(const file of ['input.json','job.json','search.json','verify.json','events.jsonl','agh-events.jsonl'])report.artifactSha256[file]=hash(await readFile(resolve(root,'results/jobs',id,file)));
 const nativeText=await readFile(resolve(root,'results/jobs',id,'agh-events.jsonl'),'utf8'),events=nativeText.split(/\r?\n/).filter(Boolean).map(JSON.parse);
 await check('five actual native shell call/result pairs',async()=>{report.nativeEventCount=events.length;report.nativeToolCallCount=events.filter(e=>e.type==='tool/call').length;report.nativeToolResultCount=events.filter(e=>e.type==='tool/result').length;report.toolPairs=steps.map(step=>{const call=events.find(e=>e.type==='tool/call'&&e.data?.name==='shell'&&e.data.args?.command?.includes(`job.mjs' ${step} ${id}`));assert.ok(call,`missing native call ${step}`);const result=events.find(e=>e.type==='tool/result'&&e.data?.toolUseId===call.data.toolUseId);assert.ok(result,`missing native result ${step}`);assert.notEqual(result.data.isError,true);return {step,toolUseId:call.data.toolUseId,callSeq:call.seq,resultSeq:result.seq}})});
 await page.waitForFunction(()=>!document.getElementById('view3d').disabled,{},{timeout:20000});
 await check('same job in UI, form, trace and downloads',async()=>{assert.equal(await page.locator('#jobId').textContent(),id);assert.equal(await page.locator('#roomW').inputValue(),String(input.room.width));assert.equal(await page.locator('#roomD').inputValue(),String(input.room.depth));assert.deepEqual(JSON.parse(await page.locator('#obstacles').inputValue()),input.obstacles);for(const step of steps){const row=page.locator(`#trace [data-step="${step}"]`);assert.ok(await row.getAttribute('data-native-call'));assert.ok(await row.getAttribute('data-native-result'))}const links=await page.locator('#downloads a').evaluateAll(a=>a.map(x=>x.href));assert.ok(links.length);assert.ok(links.every(url=>url.includes(`/api/jobs/${id}/`)));assert.equal(await page.locator('#business').textContent(),'通过验收');assert.match(await page.locator('#native').textContent(),/已完成/)});
 await shot(page,'complete.png');
 await check('actual GLB opens in WebGL and browser download matches asset',async()=>{const response=await fetch(`${base}/api/jobs/${id}/assets/scene.glb`,{signal:AbortSignal.timeout(10000)});assert.equal(response.ok,true);const b=Buffer.from(await response.arrayBuffer());assert.equal(b.readUInt32LE(0),0x46546c67);report.artifactSha256['scene.glb']=hash(b);report.glbBytes=b.length;const popupPromise=page.waitForEvent('popup');await page.locator('#view3d').click();const popup=await popupPromise;await popup.waitForFunction(()=>document.getElementById('status').textContent.includes('已从GLB二进制读取'));assert.ok(popup.url().includes(`job=${id}`));report.viewerStatus=await popup.locator('#status').textContent();await shot(popup,'3D.png');await popup.close();const downloadPromise=page.waitForEvent('download');await page.locator('#downloads a').filter({hasText:'scene.glb 下载'}).click();const download=await downloadPromise;assert.equal(await download.failure(),null);const dest=resolve(out,'scene.glb');await download.saveAs(dest);assert.equal(hash(await readFile(dest)),hash(b));report.downloadSha256=hash(b)});
 await check('no pageerror and allowed POST count',async()=>{assert.deepEqual(report.pageErrors,[]);assert.equal(report.posts.length,resumeId?0:1);if(!resumeId){const body=JSON.parse(report.posts[0].body);assert.equal(body.mode,'normal');assert.equal(body.input.room.width,input.room.width);assert.equal(body.input.room.depth,input.room.depth);assert.deepEqual(body.input.obstacles,input.obstacles)}});
 report.status='pass';
}catch(e){if(report.status!=='timeout')report.status='fail';report.error=e.stack;process.exitCode=1;try{if(page)await shot(page,'failure.png')}catch{}}
finally{report.ended=new Date().toISOString();await persist();if(browser)await browser.close();console.log(JSON.stringify({status:report.status,jobId:report.jobId,report:resolve(out,'report.json'),posts:report.posts.length,error:report.error},null,2))}
