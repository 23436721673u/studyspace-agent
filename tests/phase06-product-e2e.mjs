import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { fixtures } from '../src/fixtures.mjs';
import { businessOutcome } from '../src/agh-runner.mjs';

const root = resolve(import.meta.dirname, '..');
const port = 4398;
const baseUrl = `http://127.0.0.1:${port}`;
const runId = `${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}`;
const out = resolve(root, 'results', `phase06-product-e2e-${runId}`);
await mkdir(out, { recursive: false });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = [];
const selectedCases = process.env.STUDYSPACE_E2E_CASES ? new Set(process.env.STUDYSPACE_E2E_CASES.split(',').map(x=>x.trim()).filter(Boolean)) : null;
const includeCase = name => !selectedCases || selectedCases.has(name);
const browserErrors = [];
const api = spawn(process.execPath, ['src/task-api.mjs'], { cwd: root, env: { ...process.env, STUDYSPACE_PORT: String(port) }, windowsHide: true, stdio: ['ignore','ignore','pipe'] });
let apiStderr = '';
api.stderr.on('data', data => { apiStderr += data.toString(); });
let browser;
const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));

function equalDoorBoundary() {
  const f = structuredClone(fixtures.find(x => x.name === 'normal-manual-two-seats').input);
  f.scenarioLabel = '模拟场景—边界门宽等于通道宽';
  f.simulatedScenario = true;
  f.door.width = f.passageWidth;
  return f;
}
function validButUnfound() {
  const f = structuredClone(fixtures.find(x => x.name === 'normal-manual-two-seats').input);
  f.scenarioLabel = '模拟场景—有效输入有限预算未找到';
  f.simulatedScenario = true;
  f.room = { width: 6, depth: 5 };
  f.targetSeats = 12;
  f.requiredSeats = 12;
  f.gridSize = 0.2;
  f.searchBudget = { maxAttempts: 1, maxMs: 1 };
  return f;
}
const compact = {
  scenarioLabel: '模拟场景—6×5固定边角柜六座', simulatedScenario: true,
  room: { width: 6, depth: 5 },
  door: { wall: 'south', offset: 2, width: 1, swing: 'inward', hinge: 'low' },
  obstacles: [{ id: 'corner-cabinet', x: 5.55, z: 4.55, width: 0.5, depth: 0.5, height: 1.8 }],
  seatTemplate: { tableWidth: 1, tableDepth: 0.6, tableHeight: 0.75, chairWidth: 0.5, chairDepth: 0.5, chairClearance: 0.6, approachWidth: 0.5 },
  targetSeats: 6, requiredSeats: 6, passageWidth: 0.8, orientations: [0,90], gridSize: 0.2, tolerance: 1e-6,
  seed: 'phase06-e2e-compact-six', searchBudget: { maxAttempts: 30000, maxMs: 10000 },
  userRequest: '模拟场景。请遵守所有原始房间、门、固定柜体、座位目标和通道约束，生成并独立验收六座布局。'
};

async function ready() {
  for (let i=0;i<80;i++) {
    if (api.exitCode !== null) throw Error(`temporary API exited ${api.exitCode}: ${apiStderr}`);
    try { const r = await fetch(baseUrl); if (r.ok) { await wait(150); if (api.exitCode !== null) throw Error(`temporary API exited ${api.exitCode}: ${apiStderr}`); return; } } catch (error) { if (String(error.message).startsWith('temporary API exited')) throw error; }
    await wait(250);
  }
  throw Error(`temporary API did not start: ${apiStderr}`);
}
async function postJob(input, mode='normal') {
  const requestBody = JSON.stringify({input,mode});
  const response = await fetch(`${baseUrl}/api/jobs`, { method:'POST', headers:{'content-type':'application/json'}, body:requestBody });
  const body = await response.json();
  if (response.status !== 202) throw Error(`job submission ${response.status}: ${JSON.stringify(body)}`);
  return {...body,requestBody};
}
async function waitJob(jobId, timeoutMs=240000) {
  const deadline = Date.now()+timeoutMs;
  while (Date.now()<deadline) {
    const response = await fetch(`${baseUrl}/api/jobs/${jobId}`);
    const value = await response.json();
    const status = value.job?.business?.status;
    if (['pass','constraints-not-satisfied','not-completed'].includes(status) || ['adapter-error','connection-unknown'].includes(value.connection?.status)) return value;
    await wait(1000);
  }
  throw Error(`job ${jobId} timed out; status retained on disk`);
}
async function verifyRecoveryOutcome(jobId,jobDir,priorCount,timeoutMs=120000) {
  const response=await fetch(`${baseUrl}/api/jobs/recover?id=${jobId}`,{method:'POST'});
  const body=await response.json();
  if(response.status!==202||body.jobId!==jobId)throw Error(`recovery request failed ${response.status}: ${JSON.stringify(body)}`);
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    let entries=[];try{entries=(await readFile(resolve(jobDir,'adapter.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);}catch{}
    const outcomes=entries.filter(e=>e.kind==='terminal-business-outcome'&&e.data?.path==='recovery-short-circuit');
    if(outcomes.length>priorCount){const job=JSON.parse(await readFile(resolve(jobDir,'job.json'),'utf8'));return {httpStatus:response.status,response:body,jobBusiness:job.business,outcome:outcomes.at(-1),recoveryOutcomeCount:outcomes.length};}
    const current=JSON.parse(await readFile(resolve(jobDir,'job.json'),'utf8'));
    if(['adapter-error','connection-unknown'].includes(current.connection?.status))throw Error(`recovery failed: ${JSON.stringify(current.connection)}`);
    await wait(500);
  }
  throw Error(`recovery did not produce a terminal-business-outcome event for ${jobId}`);
}
async function fetchJobFile(jobId, name) {
  const response = await fetch(`${baseUrl}/api/jobs/${jobId}/files/${name}`);
  if (!response.ok) throw Error(`${name} HTTP ${response.status}`);
  return response;
}
async function nativeCalls(jobId, steps) {
  const response = await fetchJobFile(jobId,'agh-events.jsonl');
  const events = (await response.text()).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const calls = new Map(), results = new Map();
  for (const event of events) {
    const d = event.data || {};
    if (event.type === 'tool/call' && d.name === 'shell') {
      for (const step of steps) if (String(d.args?.command||'').includes(`job.mjs' ${step} ${jobId}`)) calls.set(step,event);
    }
    if (event.type === 'tool/result') results.set(d.toolUseId,event);
  }
  return {events,calls,results};
}
async function checkApiCase(name,input,mode,expectedBusiness,expectedSteps,{testRecovery=false}={}) {
  const submitted = await postJob(input,mode);
  const status = await waitJob(submitted.jobId);
  const jobDir = resolve(root,'results','jobs',submitted.jobId);
  const manifest = JSON.parse(await readFile(resolve(jobDir,'job.json'),'utf8'));
  const storedInput = await readFile(resolve(jobDir,'input.json'));
  const inputHash = sha(storedInput);
  const postedBody = JSON.parse(submitted.requestBody);
  const postedInput = Buffer.from(JSON.stringify(postedBody.input,null,2));
  const postRequestPath = resolve(out,`${name}-post-request.json`);
  const postInputPath = resolve(out,`${name}-post-input.json`);
  await writeFile(postRequestPath,submitted.requestBody,{flag:'wx'});
  await writeFile(postInputPath,postedInput,{flag:'wx'});
  const postInputHash = sha(postedInput);
  const postedInputMatches = postedInput.equals(storedInput);
  const evRes = await fetchJobFile(submitted.jobId,'events.jsonl');
  const stepEvents = (await evRes.text()).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const trace = await nativeCalls(submitted.jobId,expectedSteps);
  const stepsPresent = expectedSteps.every(s=>stepEvents.some(e=>e.step===s));
  const nativePresent = expectedSteps.every(s=>trace.calls.has(s)&&trace.results.has(trace.calls.get(s).data.toolUseId));
  let repairFeedback = null;
  if (mode==='repair-test') repairFeedback = JSON.parse(await readFile(resolve(jobDir,'check-draft.json'),'utf8'));
  const verify = await fetchJobFile(submitted.jobId,'verify.json').then(r=>r.json()).catch(()=>null);
  const search = await fetchJobFile(submitted.jobId,'search.json').then(r=>r.json()).catch(()=>null);
  const inspect = await fetchJobFile(submitted.jobId,'inspect.json').then(r=>r.json()).catch(()=>null);
  const classifiedOutcome=businessOutcome({inspect,search,verify});
  const outcomeRuleChecks={finiteSearch:businessOutcome({search:{found:false,status:'budget-exhausted-or-candidates-ended'}}),schemaFailure:businessOutcome({inspect:{status:'schema-fail'}}),incomplete:businessOutcome({})};
  const assets=[];
  for (const assetName of ['scene.glb','editable.json','geometry-report.json']) {
    const response=await fetch(`${baseUrl}/api/jobs/${submitted.jobId}/assets/${assetName}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    const item={name:assetName,httpStatus:response.status,contentType:response.headers.get('content-type'),missing:response.status===404,bytes:response.ok?bytes.length:null,sha256:response.ok?sha(bytes):null};
    if(response.ok&&assetName==='scene.glb') item.glbValid=bytes.length>=12&&bytes.toString('ascii',0,4)==='glTF'&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length;
    if(response.ok&&assetName==='editable.json') { try { const value=JSON.parse(bytes.toString('utf8')); item.jsonValid=value.format==='studyspace.asset-input.v1'&&value.units==='m'&&!!value.input&&!!value.layout; } catch { item.jsonValid=false; } }
    if(response.ok&&assetName==='geometry-report.json') { try { const value=JSON.parse(bytes.toString('utf8')); item.geometryStatus=value.status; item.geometryValid=value.status==='pass'; } catch { item.geometryValid=false; } }
    assets.push(item);
  }
  const assetOutcome=expectedBusiness==='pass'?assets.length===3&&assets.every(x=>x.httpStatus===200&&x.bytes>0)&&assets.find(x=>x.name==='scene.glb')?.glbValid===true&&assets.find(x=>x.name==='editable.json')?.jsonValid===true&&assets.find(x=>x.name==='geometry-report.json')?.geometryValid===true:assets.length===3&&assets.every(x=>x.httpStatus===404&&x.missing&&x.bytes===null);
  const output={name,jobId:submitted.jobId,sessionKey:submitted.sessionKey,sessionId:status.connection?.sessionId??null,mode:manifest.mode,testOnly:manifest.testOnly??false,simulatedScenario:manifest.simulatedScenario,inputHashManifest:manifest.inputHash,inputHashStored:inputHash,inputHashPosted:postInputHash,inputHashMatches:manifest.inputHash===inputHash&&postedInputMatches,postedInputMatches,postRequest:{path:postRequestPath,sha256:sha(submitted.requestBody),bytes:Buffer.byteLength(submitted.requestBody)},postInput:{path:postInputPath,sha256:postInputHash,bytes:postedInput.length},expectedBusiness,actualBusiness:status.job?.business?.status,nativeStatus:status.job?.native?.status,nativeReason:status.job?.native?.reason,model:status.job?.model,expectedSteps,stepEvents,stepsPresent,nativeEventCount:trace.events.length,nativeCalls:[...trace.calls].map(([step,event])=>({step,seq:event.seq,time:event.ts,sessionId:event.data?.sessionId??status.connection?.sessionId,toolUseId:event.data?.toolUseId})),nativeResults:[...trace.results.values()].map(e=>({seq:e.seq,toolUseId:e.data?.toolUseId,isError:e.data?.isError??null})),nativePresent,repairFeedback,verify,search,assets,assetOutcome};
  output.businessReason=status.job?.business?.reason??null;output.outcomeClassification=classifiedOutcome;output.outcomeRuleChecks=outcomeRuleChecks;
  output.assertions={session:!!output.sessionId,model:status.job?.model?.alias==='gpt-6-astra'&&status.job?.model?.usage?.model?.id==='gpt-6-astra',mode:manifest.mode===mode,testMarker:mode!=='repair-test'||manifest.testOnly===true,inputUnchanged:output.inputHashMatches,expectedStatus:output.actualBusiness===expectedBusiness,classificationConsistent:classifiedOutcome.status===output.actualBusiness&&classifiedOutcome.reason===output.businessReason,finiteSearchRule:outcomeRuleChecks.finiteSearch.status==='constraints-not-satisfied'&&outcomeRuleChecks.finiteSearch.reason==='finite-search-not-found-within-budget'&&outcomeRuleChecks.finiteSearch.proof==='not-proof-of-impossibility',schemaFailureRule:outcomeRuleChecks.schemaFailure.status==='constraints-not-satisfied'&&outcomeRuleChecks.schemaFailure.reason==='schema-fail',incompleteRule:outcomeRuleChecks.incomplete.status==='not-completed',normalOrRepairCompleted:expectedBusiness!=='pass'||status.job?.native?.status==='completed',stepSet:stepsPresent,nativeCallEvidence:nativePresent,repairFailureFeedback:mode!=='repair-test'||repairFeedback?.status==='fail',independentFinalPass:expectedBusiness!=='pass'||verify?.status==='pass',boundedSearchNotFound:expectedBusiness!=='constraints-not-satisfied'||search?.found===false&&search?.status==='budget-exhausted-or-candidates-ended'&&status.job?.business?.reason==='finite-search-not-found-within-budget',assets:assetOutcome};
  if(testRecovery){
    let priorCount=0;try{priorCount=(await readFile(resolve(jobDir,'adapter.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(e=>e.kind==='terminal-business-outcome'&&e.data?.path==='recovery-short-circuit').length;}catch{}
    output.recovery=await verifyRecoveryOutcome(submitted.jobId,jobDir,priorCount);
    output.assertions.recoveryClassification=output.recovery.jobBusiness.status===output.actualBusiness&&output.recovery.outcome.data.status===output.actualBusiness&&output.recovery.outcome.data.reason===output.recovery.jobBusiness.reason;
  }
  const reportPath=resolve(out,`${name}.json`);await writeFile(reportPath,JSON.stringify(output,null,2),{flag:'wx'});
  const row={name,jobId:output.jobId,sessionId:output.sessionId,mode,expectedBusiness,actualBusiness:output.actualBusiness,assertions:output.assertions,reportPath};
  rows.push(row);
  return {output,status};
}
async function browserCase(name, mode, input) {
  const page = await browserContext.newPage();
  const postBodies=[];
  page.on('request', request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/jobs')postBodies.push(request.postData());});
  page.on('pageerror', error => browserErrors.push({case:name,type:'pageerror',message:error.message,stack:error.stack}));
  page.on('console', message => { if(message.type()==='error') browserErrors.push({case:name,type:'console',message:message.text()}); });
  const failedResponses=[];
  page.on('response', response=>{if(response.status()>=400)failedResponses.push({url:response.url(),status:response.status()});});
  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>localStorage.removeItem('studyspace.jobId'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#scenario').fill(input.scenarioLabel);
  await page.locator('#roomW').fill(String(input.room.width));
  await page.locator('#roomD').fill(String(input.room.depth));
  await page.locator('#doorWall').selectOption(input.door.wall);
  await page.locator('#doorWidth').fill(String(input.door.width));
  await page.locator('#doorOffset').fill(String(input.door.offset));
  await page.locator('#targetSeats').fill(String(input.targetSeats));
  await page.locator('#passage').fill(String(input.passageWidth));
  await page.locator('#orientation').selectOption('both');
  await page.locator('#gridSize').fill(String(input.gridSize));
  await page.locator('#obstacles').fill(JSON.stringify(input.obstacles));
  await page.locator('#request').fill(input.userRequest);
  if(mode==='repair-test') await page.locator('#repairTest').check();
  else await page.locator('#repairTest').uncheck();
  await page.screenshot({path:resolve(out,`${name}-submitted.png`),fullPage:true});
  await page.locator('#generate').click();
  await page.waitForFunction(()=>{const b=document.querySelector('#business')?.textContent;const n=document.querySelector('#native')?.textContent;return b==='pass'&&n?.includes('completed')||b==='约束下未找到'||b==='未完成'},null,{timeout:360000});
  await page.waitForFunction(()=>{const rows=[...document.querySelectorAll('#trace [data-step]')];return rows.some(x=>x.dataset.step==='verify'&&x.dataset.status==='pass')||document.querySelector('#business')?.textContent==='约束下未找到'||document.querySelector('#business')?.textContent==='未完成'},null,{timeout:30000});
  const jobId=(await page.locator('#jobId').textContent()).trim();
  await page.screenshot({path:resolve(out,`${name}-final.png`),fullPage:true});
  const rendered=await page.locator('#trace [data-step]').evaluateAll(nodes=>nodes.map(n=>({step:n.dataset.step,status:n.dataset.status,time:n.dataset.eventTime,sessionId:n.dataset.sessionId,nativeCall:n.dataset.nativeCall,nativeResult:n.dataset.nativeResult,text:n.innerText})));
  const expectedSteps=mode==='repair-test'?['inspect','draft','check-draft','search','check-search','export','verify']:['inspect','search','check-search','export','verify'];
  const visibleSteps=expectedSteps.every(s=>rendered.some(x=>x.step===s));
  const finalPass=rendered.some(x=>x.step==='verify'&&x.status==='pass');
  const nativeVisible=rendered.filter(x=>expectedSteps.includes(x.step)).every(x=>!!x.nativeCall&&!!x.nativeResult&&!!x.time&&!!x.sessionId);
  const failureVisible=mode!=='repair-test'||rendered.some(x=>x.step==='check-draft'&&x.status==='fail');
  const browserRow={name,jobId,mode,expectedSteps,rendered,visibleSteps,finalPass,nativeVisible,failureVisible,pageErrors:browserErrors.filter(x=>x.case===name),failedResponses,screenshots:[`${name}-submitted.png`,`${name}-final.png`]};
  const response=await fetch(`${baseUrl}/api/jobs/${jobId}`),status=await response.json();
  const jobDir=resolve(root,'results','jobs',jobId),manifest=JSON.parse(await readFile(resolve(jobDir,'job.json'),'utf8'));
  const events=(await (await fetchJobFile(jobId,'events.jsonl')).text()).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const inputBytes=await readFile(resolve(jobDir,'input.json'));
  if(postBodies.length!==1||typeof postBodies[0]!=='string') throw Error(`${name}: expected exactly one captured API POST body, found ${postBodies.length}`);
  const postBody=JSON.parse(postBodies[0]);
  const postedInput=Buffer.from(JSON.stringify(postBody.input,null,2));
  const postRequestPath=resolve(out,`${name}-post-request.json`),postInputPath=resolve(out,`${name}-post-input.json`);
  await writeFile(postRequestPath,postBodies[0],{flag:'wx'});await writeFile(postInputPath,postedInput,{flag:'wx'});
  const postedInputMatches=postedInput.equals(inputBytes);
  const verify=await fetchJobFile(jobId,'verify.json').then(r=>r.json()).catch(()=>null);
  browserRow.sessionId=status.connection?.sessionId??null;
  browserRow.business=status.job?.business?.status;browserRow.nativeStatus=status.job?.native?.status;
  browserRow.model=status.job?.model;browserRow.inputHash=sha(inputBytes);browserRow.manifestInputHash=manifest.inputHash;
  browserRow.postRequest={path:postRequestPath,sha256:sha(postBodies[0]),bytes:Buffer.byteLength(postBodies[0])};
  browserRow.postInput={path:postInputPath,sha256:sha(postedInput),bytes:postedInput.length};
  browserRow.inputHashMatches=browserRow.inputHash===browserRow.manifestInputHash&&postedInputMatches;browserRow.postedInputMatches=postedInputMatches;
  browserRow.stepEvents=events;browserRow.verify=verify;
  browserRow.assertions={session:!!browserRow.sessionId,completed:browserRow.business==='pass'&&browserRow.nativeStatus==='completed',usage:browserRow.model?.usage?.model?.id==='gpt-6-astra',stepCount:rendered.length===expectedSteps.length,visibleSteps,finalPass,failureVisible,nativeVisible,inputUnchanged:browserRow.inputHashMatches,postCapture:postBodies.length===1,noPageErrors:browserRow.pageErrors.length===0,finalVerify:verify?.status==='pass'};
  await writeFile(resolve(out,`${name}-browser.json`),JSON.stringify(browserRow,null,2),{flag:'wx'});
  rows.push({name,jobId,sessionId:browserRow.sessionId,mode,actualBusiness:browserRow.business,nativeStatus:browserRow.nativeStatus,assertions:browserRow.assertions,browserReport:`${name}-browser.json`});
  await page.close();
  return browserRow;
}

let fatalError=null;
let browserContext;
try {
  await ready();
  browser=await chromium.launch({headless:true,channel:'msedge'});
  browserContext=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  let normal,repair,boundaryJob,unfoundJob,bad;
  if(includeCase('ui-normal-compact-six')) normal=await browserCase('ui-normal-compact-six','normal',compact);
  if(includeCase('ui-repair-test-compact-six')) repair=await browserCase('ui-repair-test-compact-six','repair-test',compact);
  if(includeCase('api-boundary-door-equals-passage')) { const boundary=equalDoorBoundary();boundaryJob=await checkApiCase('api-boundary-door-equals-passage',boundary,'normal','pass',['inspect','search','check-search','export','verify']); }
  if(includeCase('api-valid-budget-unfound')) { const unfound=validButUnfound();unfoundJob=await checkApiCase('api-valid-budget-unfound',unfound,'normal','constraints-not-satisfied',['inspect','search'],{testRecovery:true}); }
  if(includeCase('api-illegal-input-rejected')) {
    const invalid={...structuredClone(fixtures.find(x=>x.name==='normal-manual-two-seats').input),scenarioLabel:'模拟场景—非法座位目标失败',targetSeats:13,requiredSeats:13,simulatedScenario:true};
    const badResponse=await fetch(`${baseUrl}/api/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input:invalid})});
    const badBody=await badResponse.json();
    bad={name:'api-illegal-input-rejected',httpStatus:badResponse.status,response:badBody,expected:422,pass:badResponse.status===422&&badBody.status==='schema-fail'};
    await writeFile(resolve(out,'api-illegal-input-rejected.json'),JSON.stringify(bad,null,2),{flag:'wx'});
    rows.push({name:bad.name,assertions:{rejectedAtSchema:bad.pass},httpStatus:bad.httpStatus});
  }
  await writeFile(resolve(out,'browser-errors.json'),JSON.stringify({errors:browserErrors,apiStderr},null,2),{flag:'wx'});
  if((normal?.pageErrors.length??0)||(repair?.pageErrors.length??0)) throw Error('Browser reported page errors');
  if(normal&&(normal.assertions.completed!==true||normal.assertions.finalVerify!==true||normal.assertions.visibleSteps!==true||normal.assertions.stepCount!==true||normal.assertions.nativeVisible!==true||normal.assertions.usage!==true||normal.assertions.inputUnchanged!==true)) throw Error('Normal browser AGH trace did not satisfy all required assertions');
  if(repair&&(repair.assertions.completed!==true||repair.assertions.finalVerify!==true||repair.assertions.visibleSteps!==true||repair.assertions.stepCount!==true||repair.assertions.nativeVisible!==true||repair.assertions.failureVisible!==true||repair.assertions.usage!==true||repair.assertions.inputUnchanged!==true)) throw Error('Repair-test browser trace did not satisfy all required assertions');
  if(boundaryJob&&(boundaryJob.output.actualBusiness!=='pass'||boundaryJob.output.nativeStatus!=='completed'||!boundaryJob.output.assertions.nativeCallEvidence||!boundaryJob.output.assertions.assets||!boundaryJob.output.assertions.inputUnchanged)) throw Error('Boundary AGH job did not complete and pass');
  if(unfoundJob&&(unfoundJob.output.actualBusiness!=='constraints-not-satisfied'||unfoundJob.output.businessReason!=='finite-search-not-found-within-budget'||unfoundJob.output.search?.found!==false||unfoundJob.output.search?.status!=='budget-exhausted-or-candidates-ended'||unfoundJob.output.search?.note?.includes('not a proof of impossibility')!==true||!unfoundJob.output.assertions.assets||!unfoundJob.output.assertions.nativeCallEvidence||!unfoundJob.output.assertions.inputUnchanged||unfoundJob.output.assertions.recoveryClassification!==true)) throw Error('Valid-but-unfound case did not preserve bounded-search and recovery classification evidence');
  if(bad&&!bad.pass) throw Error('Invalid input was not rejected');
} catch(error) {
  fatalError={name:error.name,message:error.message,stack:error.stack};
} finally {
  if(browserContext) await browserContext.close().catch(()=>{});
  if(browser) await browser.close().catch(()=>{});
  if(api.exitCode===null&&api.signalCode===null) {
    await new Promise(resolveExit=>{const timer=setTimeout(resolveExit,3000);api.once('exit',()=>{clearTimeout(timer);resolveExit();});api.kill();});
  }
  const sourceFiles=['workbench.html','src/task-api.mjs','src/agh-runner.mjs','src/schema.mjs','src/search.mjs','src/baseline.mjs','src/validator.mjs','src/asset-check.mjs','src/glb.mjs','tests/phase06-product-e2e.mjs'];
  const codeHashes={};for(const file of sourceFiles)codeHashes[file]=sha(await readFile(resolve(root,file)));
  const summary={runId,createdAt:new Date().toISOString(),simulatedScenario:true,selectedCases:selectedCases?[...selectedCases]:['ui-normal-compact-six','ui-repair-test-compact-six','api-boundary-door-equals-passage','api-valid-budget-unfound','api-illegal-input-rejected'],apiPort:port,node:process.version,expectedModels:{name:'gpt-6-astra',endpoint:'https://totokens.cc/v1',api:'Responses'},total:rows.length,rows,browserErrors,apiStderr,fatalError,codeHashes,screenshots:await readdir(out).then(a=>a.filter(x=>x.endsWith('.png')))};
  summary.passed=rows.filter(row=>Object.values(row.assertions??{}).every(Boolean)).length;
  summary.failed=summary.total-summary.passed;
  summary.status=!fatalError&&summary.failed===0?'pass':'fail';
  await writeFile(resolve(out,'summary.json'),JSON.stringify(summary,null,2),{flag:'wx'});
  console.log(JSON.stringify({out,status:summary.status,total:summary.total,passed:summary.passed,failed:summary.failed,fatalError,report:resolve(out,'summary.json')},null,2));
  if(summary.status!=='pass')process.exitCode=1;
}
