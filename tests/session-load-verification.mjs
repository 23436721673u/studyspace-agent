import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=`results/session-load-verification-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});
const input=JSON.parse(await readFile('results/jobs/cc4d792f8ecd48b38a48432046988007/input.json','utf8'));
const report={out,runnerSha256:createHash('sha256').update(await readFile('src/agh-runner.mjs')).digest('hex'),rows:[]};
for(const mode of ['normal','repair-test']){
 const row={mode};report.rows.push(row);
 try{
  const r=await fetch('http://127.0.0.1:4319/api/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input,mode})});
  const created=await r.json();if(r.status!==202)throw Error(JSON.stringify(created));row.jobId=created.jobId;console.log(JSON.stringify({mode,jobId:row.jobId}));
  const deadline=Date.now()+300000;let data;
  while(Date.now()<deadline){data=await fetch(`http://127.0.0.1:4319/api/jobs/${row.jobId}`).then(r=>r.json());if(['pass','not-completed','constraints-not-satisfied'].includes(data.job.business.status)||['adapter-error','connection-unknown'].includes(data.connection.status))break;await new Promise(r=>setTimeout(r,1500))}
  row.job=data.job;row.connectionStatus=data.connection.status;
  const dir=`results/jobs/${row.jobId}`;
  const events=(await readFile(`${dir}/agh-events.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const steps=(await readFile(`${dir}/events.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  row.steps=steps.map(x=>({step:x.step,status:x.status}));
  row.calls=events.filter(e=>e.type==='tool/call').map(e=>({seq:e.seq,toolUseId:e.data.toolUseId,name:e.data.name,args:e.data.args}));
  row.results=events.filter(e=>e.type==='tool/result').map(e=>({seq:e.seq,toolUseId:e.data.toolUseId}));
  const expected=mode==='repair-test'?7:5;
  row.pass=data.job.business.status==='pass'&&data.job.native.status==='completed'&&data.job.sessionId===created.sessionKey&&steps.length===expected&&row.calls.length===expected&&row.calls.every(c=>c.name==='shell'&&row.results.some(r=>r.toolUseId===c.toolUseId))&&steps.some(s=>s.step==='verify'&&s.status==='pass')&&(mode!=='repair-test'||steps.some(s=>s.step==='check-draft'&&s.status==='fail'));
 }catch(e){row.error=e.stack;row.pass=false}
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({mode,jobId:row.jobId,pass:row.pass,error:row.error}));if(!row.pass)break;
}
report.pass=report.rows.length===2&&report.rows.every(r=>r.pass);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({out,pass:report.pass}));process.exitCode=report.pass?0:1;
