import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),port=4397,base=`http://127.0.0.1:${port}`;
const api=spawn(process.execPath,['src/task-api.mjs'],{cwd:root,env:{...process.env,STUDYSPACE_PORT:String(port)},windowsHide:true,stdio:['ignore','ignore','pipe']});
let stderr='',result={test:'task-api-smoke',label:'HTTP end-to-end test with a real AGH task',startedAt:new Date().toISOString(),port,assertions:{}};api.stderr.on('data',b=>stderr+=b);
const exited=new Promise(r=>api.once('exit',(code,signal)=>r({code,signal})));
try{
 let ready=false;for(let i=0;i<50;i++){if(api.exitCode!==null)throw Error(`Own API exited: ${stderr}`);try{await fetch(base);ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}if(!ready)throw Error(`API did not start: ${stderr}`);
 const invalidCases=[['malformed-json','/api/jobs',String.fromCharCode(123),400],['null-body','/api/jobs','null',422],['null-input','/api/jobs','{"input":null}',422],['missing-recovery-id','/api/jobs/recover',null,422],['path-recovery-id','/api/jobs/recover?id=..%2F..%2Fdocs',null,422],['nonhex-recovery-id','/api/jobs/recover?id='+('g'.repeat(32)),null,422]];
 result.invalidInputs=[];for(const [name,path,body,expected] of invalidCases){const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},...(body===null?{}:{body})});const data=await response.json();result.invalidInputs.push({name,status:response.status,expected,data});result.assertions[name]=response.status===expected&&!!(data.error?.code||data.issues?.length);}
 if(Object.values(result.assertions).some(x=>!x))throw Error('Invalid-input HTTP assertions failed');
 const input=JSON.parse(await readFile(resolve(root,'tests/boundary-door-equals-passage.json'),'utf8'));input.scenarioLabel='模拟场景—task API端到端';input.simulatedScenario=true;
 const created=await fetch(`${base}/api/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input})});const accepted=await created.json();if(created.status!==202)throw Error(`POST /api/jobs ${created.status}: ${JSON.stringify(accepted)}`);
 let status,deadline=Date.now()+240000;while(Date.now()<deadline){const response=await fetch(`${base}/api/jobs/${accepted.jobId}`);if(response.status===200){status=await response.json();if(['turn-ended','adapter-error','connection-unknown'].includes(status.connection.status))break;}await new Promise(r=>setTimeout(r,1000));}
 Object.assign(result,{jobId:accepted.jobId,sessionKey:accepted.sessionKey,httpAccepted:created.status,connection:status?.connection?.status,sessionId:status?.connection?.sessionId,businessStatus:status?.job?.business?.status,native:status?.job?.native,model:status?.job?.model});
 Object.assign(result.assertions,{created:created.status===202,hasRealSession:!!status?.connection?.sessionId,modelObserved:status?.job?.model?.alias==='gpt-6-astra'&&status?.job?.model?.usage?.model?.id==='gpt-6-astra',snapshotNotClaimed:status?.job?.model?.snapshotVersion===null,independentVerificationPass:status?.job?.business?.status==='pass',nativeStateRecorded:!!status?.job?.native?.reason,nativeCompleted:status?.job?.native?.reason==='completed'});
 if(Object.values(result.assertions).some(x=>!x))process.exitCode=1;
}catch(e){result.error={message:e.message,stack:e.stack};console.error(e.stack);process.exitCode=1;}
finally{if(api.exitCode===null&&api.signalCode===null)api.kill();result.serverExit=await exited;result.stderr=stderr;result.finishedAt=new Date().toISOString();result.status=!result.error&&Object.values(result.assertions).every(Boolean)?'pass':'fail';const reportPath=resolve(root,'results',`task-api-smoke-${result.finishedAt.replaceAll(':','-')}.json`);await writeFile(reportPath,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({reportPath,...result}));}
