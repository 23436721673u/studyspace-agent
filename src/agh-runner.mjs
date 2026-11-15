import {readFile,writeFile,appendFile,open,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createClient,wsTransport,memoryJournal} from '../vendor/agh/agh-sdk.mjs';
import {acquireLock,atomicJson,optionalJson,codeDigest,checkReceipt} from './job-integrity.mjs';
const root=resolve(import.meta.dirname,'..');
const quotePowerShell=value=>`'${String(value).replaceAll("'","''")}'`;
export const steps=['inspect','draft','check-draft','search','check-search','export','verify'];
export function businessOutcome({inspect,search,verify}){
 if(verify)return {status:verify.status,reason:verify.status==='pass'?'independent-verification-pass':'independent-verification-failed'};
 if(inspect?.status==='schema-fail')return {status:'constraints-not-satisfied',reason:'schema-fail'};
 if(search?.found===false)return {status:'constraints-not-satisfied',reason:search.status==='budget-exhausted-or-candidates-ended'?'finite-search-not-found-within-budget':'search-candidates-not-found',searchStatus:search.status,proof:'not-proof-of-impossibility'};
 return {status:'not-completed',reason:'required-artifact-missing-or-incomplete'};
}
export const commandFor=(id,step)=>`& ${quotePowerShell(process.execPath)} ${quotePowerShell(resolve(root,'bin','job.mjs'))} ${step} ${id}`;
const aghBaseUrl=()=>process.env.AGH_URL??process.env.STUDYSPACE_AGH_URL??'http://127.0.0.1:4177';
export async function runJob(id,{recoverOnly=false}={}){
 if(!/^[a-f0-9]{32}$/.test(id))throw Error('invalid job ID');
 const dir=resolve(root,'results/jobs',id),job=JSON.parse(await readFile(`${dir}/job.json`,'utf8'));
 const release=await acquireLock(`${dir}/adapter.lock`);let client;let state={status:'connecting',sessionKey:job.sessionKey,sessionId:null};
 const log=async(kind,data)=>appendFile(`${dir}/adapter.jsonl`,JSON.stringify({time:new Date().toISOString(),kind,data})+'\n');
 const persist=async()=>{await atomicJson(`${dir}/connection.json`,state);job.sessionId=state.sessionId??job.sessionId??null;job.connection={status:state.status,sessionId:job.sessionId};job.business={status:state.businessStatus??'pending',...(state.businessReason?{reason:state.businessReason}:{})};job.native={status:state.nativeStatus??null,reason:state.nativeReason??state.turnResult?.reason??null,stopReason:state.turnResult?.stopReason??null};if(state.usage){const {version,...modelMetadata}=job.model??{};job.model={...modelMetadata,usage:state.usage,alias:state.usage.model?.id??modelMetadata.alias??modelMetadata.name??'gpt-6-astra',snapshotVersion:modelMetadata.snapshotVersion??null};}await atomicJson(`${dir}/job.json`,job);};
 try{
  try{state=JSON.parse(await readFile(`${dir}/connection.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const baseUrl=aghBaseUrl();
  const html=await fetch(new URL('/',baseUrl),{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error(`local service HTTP ${r.status}`);return r.text();});
  const meta=html.match(/<meta\b[^>]*\bid=["']agnes-config["'][^>]*>/i)?.[0];
  const address=meta?.match(/\bdata-ws=["']([^"']+)["']/)?.[1];if(!address)throw Error('agnes-config data-ws not found');
  const url=new URL(address,baseUrl);if(url.protocol==='http:')url.protocol='ws:';
  if(!['ws:','wss:'].includes(url.protocol)||!['127.0.0.1','localhost'].includes(url.hostname))throw Error('unexpected nonlocal AGH socket');
  client=createClient({transport:{kind:'ws',url:url.href,protocols:['agnes-v1']},auth:{kind:'local'},journal:memoryJournal(),transportFactories:{ws:options=>wsTransport({...options,headers:{Origin:new URL(baseUrl).origin}})},clientId:`studyspace-${id}`,locale:'zh-CN'});
  await log('initialize',await client.initialize());await client.workspace.add(root);
  const config=await client.config.get();
  const provider=config?.provider;
  const configured=Boolean(config?.configured&&provider?.credentialConfigured);
  const model=provider?.model,route=provider?.route,endpoint=provider?.baseUrl;
  if(!configured||model!=='gpt-6-astra'||typeof route!=='string'||typeof endpoint!=='string')throw Error('AGH config is not configured for gpt-6-astra');
  state.config={configured:Boolean(config.configured),profile:config.profile??null,revision:config.revision??null,provider:{id:provider.id??null,baseUrl:endpoint,model,route,credentialConfigured:Boolean(provider.credentialConfigured)}};
  job.model={...job.model,name:model,alias:model,route,endpoint,provider:'not-independently-verified',driverProviderId:provider.id??null,channel:endpoint==='https://totokens.cc/v1'?'ToTokens':'configured endpoint',api:'Responses',snapshotVersion:null,providerVerification:'底层实际模型提供方未独立核实'};await persist();
  if(!state.sessionId&&state.creationAttempted){const listing=await client.session.list({q:{cwd:root,prefix:job.sessionKey},limit:100});await log('creation-reconciliation',listing);const match=listing.items?.find(item=>item.sessionId===job.sessionKey||item._meta?.sessionKey===job.sessionKey);if(match){state.sessionId=match.sessionId;job.sessionId=match.sessionId;job.connection={status:'reconciled',sessionId:match.sessionId};await atomicJson(`${dir}/job.json`,job);await persist();}else throw Error('Session creation outcome unknown; no exact sessionKey match, refusing duplicate creation');}
  const permission=async request=>{
   const tc=request.toolCall,args=tc.rawInput;
   const ok=tc._meta?.['ai.agnes.harness']?.tool==='shell'&&request.sessionId===state.sessionId&&args&&typeof args==='object'&&typeof args.command==='string'&&steps.some(s=>args.command===commandFor(id,s))&&(!args.cwd||resolve(args.cwd)===root)&&!args.background&&Object.keys(args).every(k=>['command','cwd','timeoutMs','background'].includes(k));
   await log('permission',{request,decision:ok?'allowed-once':'rejected'});return {verdict:ok?'allowed-once':'rejected'};
  };
  let session,isNewSession=false;
  if(state.sessionId)session=await client.session.load(state.sessionId,{cwd:root,onPermissionRequest:permission});
  else{isNewSession=true;state.status='creating-session';state.creationAttempted=true;await persist();const created=await client.session.new({cwd:root,preset:'standard-windows',sessionKey:job.sessionKey});state.sessionId=created.id;state.status='session-created';job.sessionId=created.id;job.connection={status:'connected',sessionId:created.id};await atomicJson(`${dir}/job.json`,job);await persist();session=await client.session.load(created.id,{cwd:root,onPermissionRequest:permission});}
  const seen=new Set();try{for(const line of (await readFile(`${dir}/agh-events.jsonl`,'utf8')).trim().split('\n').filter(Boolean))seen.add(JSON.parse(line).id);}catch(e){if(e.code!=='ENOENT')throw e;}
  const stream=(async()=>{for await(const event of session.events()){if(seen.has(event.id))continue;await appendFile(`${dir}/agh-events.jsonl`,JSON.stringify(event)+'\n');seen.add(event.id);await atomicJson(`${dir}/cursor.json`,{sessionId:session.id,seq:event.seq,id:event.id,meta:event._meta});}})();
  stream.catch(e=>log('event-stream-error',{message:e.message}));
  if(isNewSession)for(const slot of ['primary','escalation','fast','compaction','verifier'])await log('set-model',{slot,result:await session.setModel({slot,route:state.config.provider.route,model:state.config.provider.model,thinking:'medium'})});
  let ui=await session.projectUI();
  if(ui.opState||ui.pendingInputs?.length||ui.turns.at(-1)?.status==='running'){state.status='observing';await persist();while(ui.opState||ui.pendingInputs?.length||ui.turns.at(-1)?.status==='running'){await new Promise(r=>setTimeout(r,2000));ui=await session.projectUI();await atomicJson(`${dir}/live-ui.json`,ui);}}
  if(['prompt-submitting','connection-unknown'].includes(state.status)&&!ui.turns.length)throw Error('Prompt outcome unknown; refuse duplicate submission');
  const last=ui.turns.at(-1);if(last){await atomicJson(`${dir}/recovered-ui.json`,ui);state.usage=ui.usage??null;state.lastTurn=last;state.nativeStatus=last.status;state.nativeReason=last.reason??null;if(/quota|account|unsupported.model|credit|余额/i.test(JSON.stringify(last.error??{})))throw Error('Account/model error: no automatic retry');}
  const codeHash=await codeDigest(root),completed=[];
  for(const step of steps){if(await optionalJson(`${dir}/${step}.json`)){await checkReceipt(dir,step,job.mode,job.inputHash,codeHash);completed.push(step);}}
  const artifactOutcome=businessOutcome({inspect:await optionalJson(`${dir}/inspect.json`),search:await optionalJson(`${dir}/search.json`),verify:await optionalJson(`${dir}/verify.json`)});
  if(completed.includes('verify')||(completed.includes('inspect')&&(await optionalJson(`${dir}/inspect.json`)).status==='schema-fail')||(completed.includes('search')&&!(await optionalJson(`${dir}/search.json`)).found)){state.status='turn-ended';state.businessStatus=artifactOutcome.status;state.businessReason=artifactOutcome.reason;state.nativeStatus=last?.status??null;state.nativeReason=last?.reason??null;await log('terminal-business-outcome',{path:'recovery-short-circuit',...artifactOutcome});await persist();return state;}
  await log('resume-decision',{previousNativeTurn:last?{id:last.id,status:last.status,reason:last.reason,endSeq:last.endSeq}:null,opState:ui.opState,pendingInputs:ui.pendingInputs??[],verifiedSteps:completed,action:last?'continue-only-missing-steps':'initial-prompt'});
  const chosen=(job.mode==='repair-test'?steps:steps.filter(s=>!['draft','check-draft'].includes(s))).filter(s=>!completed.includes(s));
  const recoveryContext=last?`这是同一任务的续跑，上一回合已终止：${last.reason??last.status}。已经校验并复用步骤：${completed.join(',')}。仅执行下列未完成步骤，不创建新任务。` : '';
  const requestText=String(job.userRequest??'');
  const prompt=`${recoveryContext}你正在执行一间好自习产品任务，job=${id}。项目根目录为 ${root}，cwd 必须使用该目录。当前用户原始自然语言需求（必须原样理解并在 inspect 记录，不得静默改写）：\n---\n${requestText}\n---\n只使用当前 gpt-6-astra。唯一允许的工具是 shell，参数仅 command（字符串）和 cwd（字符串），按 shell 已声明 schema 调用。绝不调用 computer_use、子代理或任何其他工具，也不能把 command 参数传给 computer_use。先说明简短计划，再逐步使用 shell 工具运行下列精确命令，cwd 为 ${root}。每次读取命令返回的真实结果再决定下一步。输入和故障草稿不可修改，禁止其他文件写入或命令。所有场景为模拟场景，repair-test 的 draft 是明确测试故障。inspect 读取需求；draft/check-draft 生成测试草稿并读取独立失败反馈；search 在原约束下重新布置并运行同行列基线；check-search 独立检查；仅通过后 export；最后 verify 复核资产及原始输入。若 schema-fail 或搜索未找到或验收失败，停止并准确报告未完成，不能放松硬约束。不能将工具成功返回当作设计通过。命令：\n${chosen.map(s=>commandFor(id,s)).join('\n')}\n最终报告真实工具结果和修改的座位信息；不得声称全局最优、消防认证或实测。`;
  const promptHash=createHash('sha256').update(prompt).digest('hex');await writeFile(`${dir}/prompt-${promptHash}.txt`,prompt,{flag:'wx'});state.promptHash=promptHash;state.status='prompt-submitting';await persist();
  const result=await session.prompt(prompt);await log('prompt-result',result);state.status='turn-ended';state.turnResult=result;await persist();
  ui=await session.projectUI();await writeFile(`${dir}/final-ui.json`,JSON.stringify(ui,null,2));state.usage=ui.usage??null;state.turns=ui.turns;state.nativeStatus=ui.turns.at(-1)?.status??null;state.nativeReason=ui.turns.at(-1)?.reason??result.reason;
  const outcome=businessOutcome({inspect:await optionalJson(`${dir}/inspect.json`),search:await optionalJson(`${dir}/search.json`),verify:await optionalJson(`${dir}/verify.json`)});state.businessStatus=outcome.status;state.businessReason=outcome.reason;
  await persist();return state;
 }catch(e){state.status=state.status==='prompt-submitting'?'connection-unknown':'adapter-error';state.error={name:e.name,message:e.message,code:e.code??null,category:/fetch|HTTP|agnes-config|socket/i.test(e.message)?'local-service':/transport|connection/i.test(e.message)?'transport-unknown':/quota|account|model/i.test(e.message)?'model-service':'adapter-or-tool'};await persist();await log('error',state.error);throw e;}
 finally{if(client)await client.close();await release();}
}
