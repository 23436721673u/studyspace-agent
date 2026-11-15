import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {normalizeAndValidate} from './schema.mjs';
const root=resolve(import.meta.dirname,'..'),jobs=resolve(root,'results/jobs');
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const unsupportedRequests=text=>{const value=String(text??'');const items=[];if(/采光|窗户|日照|自然光/i.test(value))items.push('采光/窗户：当前版本未纳入几何约束');return items;};
export async function handle(req,res){
 const url=new URL(req.url,'http://localhost');
 if(req.method==='POST'&&url.pathname==='/api/jobs'){
  let body;try{let text='';for await(const c of req){text+=c;if(text.length>256*1024)throw Error('request too large');}body=JSON.parse(text);}catch(e){return send(res,400,{error:{code:'invalid-json',message:e.message}});}
  if(!body||typeof body!=='object'||Array.isArray(body))return send(res,422,{status:'schema-fail',issues:[{code:'request.type',path:'',message:'request body must be an object with input'}]});
  const parsed=normalizeAndValidate(body.input);if(!parsed.ok)return send(res,422,{status:'schema-fail',issues:parsed.issues});
  const id=randomUUID().replaceAll('-',''),sessionKey=`agnes:local:local-dev:cli:workspace:${id}`,dir=resolve(jobs,id),bytes=Buffer.from(JSON.stringify(body.input,null,2));await mkdir(dir,{recursive:true});await writeFile(`${dir}/input.json`,bytes,{flag:'wx'});await writeFile(`${dir}/user-request.txt`,String(body.input.userRequest??''),{flag:'wx'});
  const mode=body.mode==='repair-test'?'repair-test':'normal';
  const job={jobId:id,sessionKey,sessionId:null,createdAt:new Date().toISOString(),inputHash:createHash('sha256').update(bytes).digest('hex'),mode,testOnly:mode==='repair-test',simulatedScenario:body.input.simulatedScenario===true,userRequest:String(body.input.userRequest??''),supportedConstraints:['room','door','obstacles','seatTemplate','targetSeats','requiredSeats','passageWidth','orientations'],unsupportedRequests:unsupportedRequests(body.input.userRequest),model:{name:'gpt-6-astra',alias:'gpt-6-astra',provider:'not-independently-verified',driverProviderId:null,channel:'ToTokens',endpoint:'https://totokens.cc/v1',api:'Responses',snapshotVersion:null,providerVerification:'底层实际模型提供方未独立核实',usage:null},connection:{status:'queued',sessionId:null},native:{status:'not-started',reason:null},business:{status:'pending'}};
  await writeFile(`${dir}/job.json`,JSON.stringify(job,null,2),{flag:'wx'});
  const child=spawn(process.execPath,[resolve(root,'bin/agh-job.mjs'),id],{cwd:root,detached:true,stdio:'ignore',windowsHide:true});child.unref();
  await writeFile(`${dir}/api-launch.json`,JSON.stringify({launchedAt:new Date().toISOString(),pid:child.pid,sessionKey},null,2),{flag:'wx'});
  return send(res,202,{jobId:id,sessionKey,status:'connecting',statusUrl:`/api/jobs/${id}`});
 }
 if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){const html=await readFile(resolve(root,'workbench.html'),'utf8');res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);}
 if(req.method==='GET'&&url.pathname==='/viewer.html'){const html=await readFile(resolve(root,'viewer.html'),'utf8');res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);}
 if(req.method==='GET'&&url.pathname==='/guide.html'){const html=await readFile(resolve(root,'guide.html'),'utf8');res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);}
 const localModules={'/local/workbench-ui.js':'src/workbench-ui.js','/local/viewer-webgl.js':'src/viewer-webgl.mjs','/utils/BufferGeometryUtils.js':'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js','/local/three.js':'node_modules/three/build/three.module.js','/local/three.core.js':'node_modules/three/build/three.core.js','/local/GLTFLoader.js':'node_modules/three/examples/jsm/loaders/GLTFLoader.js','/local/OrbitControls.js':'node_modules/three/examples/jsm/controls/OrbitControls.js','/local/BufferGeometryUtils.js':'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'};
 if(req.method==='GET'&&localModules[url.pathname]){const data=await readFile(resolve(root,localModules[url.pathname]));res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});return res.end(data);}
 const asset=url.pathname.match(/^\/api\/jobs\/([a-f0-9]{32})\/assets\/([a-z0-9._-]+)$/i);if(req.method==='GET'&&asset){const file=resolve(jobs,asset[1],'assets',asset[2]);if(!file.startsWith(resolve(jobs,asset[1])+'\\'))return send(res,400,{error:'invalid path'});try{const data=await readFile(file);const type=asset[2].endsWith('.glb')?'model/gltf-binary':asset[2].endsWith('.svg')?'image/svg+xml':'application/json';res.writeHead(200,{'content-type':type});return res.end(data);}catch(e){if(e.code==='ENOENT')return send(res,404,{error:'asset not found'});throw e;}}
 const artifact=url.pathname.match(/^\/api\/jobs\/([a-f0-9]{32})\/files\/(input|search|verify|check-search|export|inspect|connection|final-ui)\.json$/i);if(req.method==='GET'&&artifact){const file=resolve(jobs,artifact[1],`${artifact[2]}.json`);if(!file.startsWith(resolve(jobs,artifact[1])+'\\'))return send(res,400,{error:'invalid path'});try{const data=await readFile(file);res.writeHead(200,{'content-type':'application/json; charset=utf-8'});return res.end(data);}catch(e){if(e.code==='ENOENT')return send(res,404,{error:'artifact not ready'});throw e;}}
 const eventLog=url.pathname.match(/^\/api\/jobs\/([a-f0-9]{32})\/files\/(events|agh-events)\.jsonl$/i);if(req.method==='GET'&&eventLog){try{const data=await readFile(resolve(jobs,eventLog[1],`${eventLog[2]}.jsonl`),'utf8');res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8'});return res.end(data);}catch(e){if(e.code==='ENOENT'){res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','x-trace-state':'pending'});return res.end('');}throw e;}}
 const match=url.pathname.match(/^\/api\/jobs\/([a-f0-9]{32})$/);if(req.method==='GET'&&match){const dir=resolve(jobs,match[1]);try{const job=JSON.parse(await readFile(`${dir}/job.json`,'utf8'));let connection=job.connection;try{connection=JSON.parse(await readFile(`${dir}/connection.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}return send(res,200,{job,connection});}catch(e){if(e.code==='ENOENT')return send(res,404,{error:'job not found'});throw e;}}
 if(req.method==='POST'&&url.pathname==='/api/jobs/recover'){
  const rawId=url.searchParams.get('id');if(!rawId||!/^[a-f0-9]{32}$/i.test(rawId))return send(res,422,{error:{code:'invalid-job-id',message:'id must be 32 hexadecimal characters'}});
  const id=rawId.toLowerCase();let job;try{job=JSON.parse(await readFile(resolve(jobs,id,'job.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return send(res,404,{error:{code:'job-not-found',message:'job not found'}});throw e;}
  if(job?.jobId!==id)return send(res,409,{error:{code:'job-id-mismatch',message:'stored job ID does not match request'}});
  const child=spawn(process.execPath,[resolve(root,'bin/agh-job.mjs'),id,'--recover'],{cwd:root,detached:true,stdio:'ignore',windowsHide:true});child.unref();return send(res,202,{jobId:id,sessionId:job.sessionId??null,status:'recovering'});
 }
 return send(res,404,{error:'not found'});
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){const server=createServer((req,res)=>handle(req,res).catch(e=>send(res,500,{error:e.message})));server.listen(Number(process.env.STUDYSPACE_PORT??4319),'127.0.0.1');}
