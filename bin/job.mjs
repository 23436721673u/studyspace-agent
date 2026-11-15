import {mkdir,readFile,writeFile,open,unlink,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {normalizeAndValidate} from '../src/schema.mjs';
import {searchLayouts} from '../src/search.mjs';
import {fixedGridBaseline} from '../src/baseline.mjs';
import {validateLayout} from '../src/validator.mjs';
import {exportAssets} from '../src/export-assets.mjs';
import {checkAsset} from '../src/asset-check.mjs';
import gltfValidator from 'gltf-validator';
import {acquireLock,codeDigest,stepContext,checkReceipt,saveReceipt,optionalJson} from '../src/job-integrity.mjs';
const root=resolve(import.meta.dirname,'..'),jobs=resolve(root,'results/jobs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async(p,v)=>writeFile(p,JSON.stringify(v,null,2),{flag:'wx'});
const [op,id,arg]=process.argv.slice(2);
const allowed=['inspect','draft','check-draft','search','check-search','export','verify'];
async function main(){
 if(op==='create'){
  // Only a project-local input can be imported; each invocation creates a new explicit job.
  const source=resolve(root,id??'');if(!source.startsWith(root+'\\')&&!source.startsWith(root+'/'))throw Error('input must be project-local');
  const input=await readFile(source);const parsedInput=JSON.parse(input);const jobId=randomUUID().replaceAll('-','');
  const dir=resolve(jobs,jobId);await mkdir(dir,{recursive:true});await writeFile(`${dir}/input.json`,input,{flag:'wx'});
  const manifest={jobId,sessionKey:`agnes:local:local-dev:cli:workspace:${jobId}`,sessionId:null,createdAt:new Date().toISOString(),inputHash:hash(input),mode:arg==='repair-test'?'repair-test':'normal',simulatedScenario:true,userRequest:String(parsedInput.userRequest??''),model:{name:'gpt-6-astra',route:'account-studyspace-astra-api',channel:'ToTokens',endpoint:'https://totokens.cc/v1',api:'Responses',version:'not-observed',provider:'not-independently-verified',driverProviderId:null,providerVerification:'底层实际模型提供方未独立核实',usage:null},connection:{status:'not-connected',reason:'Awaiting product session creation; live session identity is in connection.json'}};
  await save(`${dir}/job.json`,manifest);console.log(JSON.stringify(manifest));return;
 }
 if(!/^[a-f0-9]{32}$/.test(id??''))throw Error('invalid job ID');
 const dir=resolve(jobs,id),manifest=await json(`${dir}/job.json`);
 if(op==='status'){let state=null;try{state=await readFile(`${dir}/events.jsonl`,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}console.log(JSON.stringify({manifest,events:state?.trim().split('\n').filter(Boolean).map(JSON.parse)??[]}));return;}
 if(!allowed.includes(op))throw Error('unsupported job step');
 const release=await acquireLock(`${dir}/step.lock`);
 try{
  const bytes=await readFile(`${dir}/input.json`);if(hash(bytes)!==manifest.inputHash)throw Error('original input hash mismatch');
  const input=JSON.parse(bytes),parsed=normalizeAndValidate(input),codeHash=await codeDigest(root);
  const context=await stepContext(dir,op,manifest.mode,hash(bytes),codeHash);
  if(await optionalJson(`${dir}/${op}.json`)){const result=await checkReceipt(dir,op,manifest.mode,hash(bytes),codeHash);console.log(JSON.stringify({jobId:id,step:op,reused:true,result}));return;}
  const requireStep=async name=>checkReceipt(dir,name,manifest.mode,hash(bytes),codeHash);
  let result;
  if(op==='inspect')result={status:parsed.ok?'ready':'schema-fail',input,inputHash:manifest.inputHash,issues:parsed.issues??[],mode:manifest.mode};
  else if(op==='draft'){
   await requireStep('inspect');if(manifest.mode!=='repair-test')throw Error('draft injection allowed only in explicit repair-test');
   result={status:'test-injection',label:'测试：刻意放置越界座位，以验证失败反馈修复',layout:{seats:Array.from({length:input.targetSeats},(_,i)=>({id:`draft-${i+1}`,x:-2-i,z:-2,orientation:0}))}};
  }else if(op==='check-draft'||op==='check-search'){
   const prior=await requireStep(op==='check-draft'?'draft':'search');
   result={...validateLayout(input,prior.layout),inputHash:hash(bytes),layoutHash:hash(JSON.stringify(prior.layout??null))};
  }else if(op==='search'){
   await requireStep('inspect');if(manifest.mode==='repair-test'){const feedback=await requireStep('check-draft');if(feedback.status!=='fail')throw Error('repair requires saved failed draft feedback');}
   if(!parsed.ok)result={status:'schema-fail',issues:parsed.issues};
   else result={...searchLayouts(parsed.value),baseline:fixedGridBaseline(parsed.value),inputHash:hash(bytes),adjustment:manifest.mode==='repair-test'?'Replace invalid seat positions using bounded search; all input constraints unchanged':null};
  }else if(op==='export'){
   const check=await requireStep('check-search'),search=await requireStep('search');
   if(check.status!=='pass'||check.inputHash!==manifest.inputHash||check.layoutHash!==hash(JSON.stringify(search.layout)))throw Error('independent check missing or stale');
   result=await exportAssets(input,search.layout,`${dir}/assets`);
  }else if(op==='verify'){
   await requireStep('export');const editable=await json(`${dir}/assets/editable.json`),glb=await readFile(`${dir}/assets/scene.glb`),search=await requireStep('search');
   const inputMatches=JSON.stringify(editable.input)===JSON.stringify(parsed.value),layoutMatches=JSON.stringify(editable.layout)===JSON.stringify(search.layout);
   const geometry=checkAsset(glb,editable.input,editable.layout),layout=validateLayout(input,editable.layout);
   const official=await gltfValidator.validateBytes(new Uint8Array(glb),{uri:'scene.glb',format:'glb',maxIssues:0});
   const assetManifest=await json(`${dir}/assets/manifest.json`),names=['editable.json','scene.glb','plan.svg','geometry-report.json','gltf-validator-report.json'];
   const hashes=await Promise.all(names.map(async name=>{const b=await readFile(`${dir}/assets/${name}`);return {name,pass:assetManifest.files[name]?.sha256===hash(b)&&assetManifest.files[name]?.bytes===b.length};}));
   result={status:inputMatches&&layoutMatches&&geometry.status==='pass'&&layout.status==='pass'&&official.issues.numErrors===0&&hashes.every(x=>x.pass)?'pass':'fail',inputHash:hash(bytes),inputMatches,layoutMatches,geometry,layout,official,hashes,scope:'deterministic business artifact verification; not proof of product SDK integration'};
  }
  await save(`${dir}/${op}.json`,result);
  await saveReceipt(dir,op,context);
  const connection=await optionalJson(`${dir}/connection.json`);
  await appendFile(`${dir}/events.jsonl`,JSON.stringify({time:new Date().toISOString(),step:op,status:result.status??(result.found?'found':'not-found'),result:`${op}.json`,execution:'AGH-invoked deterministic CLI',productSessionId:connection?.sessionId??null})+'\n');
  console.log(JSON.stringify({jobId:id,step:op,resultPath:`${dir}/${op}.json`,result}));
 }catch(e){await appendFile(`${dir}/events.jsonl`,JSON.stringify({time:new Date().toISOString(),step:op,status:'tool-error',error:e.message})+'\n');throw e;}
 finally{await release();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
