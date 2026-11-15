import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),node=process.execPath;
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const pause=()=>new Promise(r=>setTimeout(r,300));
const job=JSON.parse(execFileSync(node,['bin/job.mjs','create','tests/sample-6-seat.json'],{cwd:root,encoding:'utf8'}));
const dir=resolve(root,'results/jobs',job.jobId),events=[];
const record=async(type,data)=>{events.push({time:new Date().toISOString(),type,...data});await writeFile(`${dir}/connection-fault-test.json`,JSON.stringify({label:'测试：只终止本测试创建的适配器子进程，不取消宿主任务',jobId:job.jobId,events},null,2));};
function start(recover=false){const p=spawn(node,['bin/agh-job.mjs',job.jobId,...(recover?['--recover']:[])],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);const done=new Promise(r=>p.on('exit',(code,signal)=>r({code,signal,output})));return {p,done};}
const first=start();await record('started',{pid:first.p.pid});let connected;
const deadline=Date.now()+180000;
while(Date.now()<deadline){try{connected=await json(`${dir}/connection.json`);const inspected=await json(`${dir}/inspect.receipt.json`);if(connected.sessionId&&inspected)break;}catch{}await pause();}
if(!connected?.sessionId)throw Error('No saved session: no fault injected');
await json(`${dir}/inspect.receipt.json`);const inputBefore=createHash('sha256').update(await readFile(`${dir}/input.json`)).digest('hex');
first.p.kill();const killed=await first.done;await record('adapter-terminated',{pid:first.p.pid,sessionId:connected.sessionId,result:killed});
const second=start(true);await record('recovery-started',{pid:second.p.pid});const recovered=await second.done;await record('recovery-exited',recovered);
const after=await json(`${dir}/connection.json`),verify=await json(`${dir}/verify.json`),rows=(await readFile(`${dir}/events.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
const counts={};for(const e of rows)if(e.status!=='tool-error')counts[e.step]=(counts[e.step]??0)+1;
const inputAfter=createHash('sha256').update(await readFile(`${dir}/input.json`)).digest('hex');
const native=(await readFile(`${dir}/agh-events.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
const assertions={sameSession:after.sessionId===connected.sessionId,inputUnchanged:inputBefore===inputAfter&&inputAfter===job.inputHash,stepsNotRepeated:Object.values(counts).every(n=>n===1),uniqueNativeEvents:new Set(native.map(e=>e.id)).size===native.length,assetVerified:verify.status==='pass',oneUserMessage:native.filter(e=>e.type==='user/message').length===1};
await record('assertions',{assertions,counts,nativeReason:after.nativeReason,businessStatus:after.businessStatus});
console.log(JSON.stringify({jobId:job.jobId,assertions,nativeReason:after.nativeReason}));if(Object.values(assertions).some(x=>!x))process.exitCode=1;
