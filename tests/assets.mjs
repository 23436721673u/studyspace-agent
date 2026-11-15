import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixtures} from '../src/fixtures.mjs';
import {exportAssets} from '../src/export-assets.mjs';
import {checkAsset,readGlb,sha256} from '../src/asset-check.mjs';
import {packGlb} from '../src/glb.mjs';
const runId=`${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}`,root=`results/assets/${runId}`;await mkdir(root,{recursive:true});
const read=async p=>JSON.parse(await readFile(p,'utf8'));const cases=[];
for(const name of ['normal-manual-two-seats','normal-rotation-90']){const f=fixtures.find(f=>f.name===name);cases.push({name,input:f.input,layout:f.layout});}
const cabinet=structuredClone(cases[1]);cabinet.name='normal-90-cabinet';cabinet.input.obstacles=[{id:'cabinet-1',x:1,z:4,width:.8,depth:.5,height:1.8}];cases.push(cabinet);
const mixed=structuredClone(cases[0]);mixed.name='normal-mixed';mixed.layout.seats[1].orientation=90;cases.push(mixed);
const source='results/runs/2026-10-10T05-31-01.918Z-1a5dd246-867a-4e89-8aff-bf75d0bf32d8';cases.push({name:'normal-six-seat',input:await read(`${source}/input.json`),layout:await read(`${source}/layout.json`)});
const boundary=structuredClone(cases[1]);boundary.name='boundary-door-corner';boundary.input.door.offset=0;boundary.input.door.width=.8;cases.push(boundary);
for(const wall of ['north','west','east']){const c=structuredClone(cases[1]);c.name=`normal-door-${wall}-high`;c.input.door={wall,offset:0,width:1,swing:'inward',hinge:'high'};cases.push(c);}
const rows=[];
for(const c of cases){try{const result=await exportAssets(c.input,c.layout,`${root}/${c.name}`);rows.push({name:c.name,category:c.name.startsWith('boundary')?'boundary':'normal',expected:'pass',pass:result.status==='pass',...result});}catch(e){rows.push({name:c.name,pass:false,error:e.stack});}}
const base=cases[0],bytes=await readFile(`${root}/${base.name}/scene.glb`);const faults=[
 ['delete-object',d=>{d.json.nodes.pop();d.json.scenes[0].nodes.pop();}],
 ['move-object',d=>{d.json.nodes.find(n=>n.extras.kind==='table').translation[0]+=.2;}],
 ['resize-object',d=>{d.json.nodes.find(n=>n.extras.kind==='chair').scale[0]*=1.2;}],
 ['duplicate-face',d=>{d.bin.copy(d.bin,576+12,576,576+12);}],
 ['bad-index',d=>{d.bin.writeUInt16LE(65000,576);}],
 ['vertex-deformation',d=>{d.bin.writeFloatLE(.4,0);}],
 ['hidden-unreferenced-node',d=>{d.json.nodes.push(structuredClone(d.json.nodes[0]));}],
 ['duplicate-active-scene-node-reference',d=>{d.json.scenes[0].nodes[1]=d.json.scenes[0].nodes[0];}],
 ['degenerate-triangle-topology',d=>{d.bin.writeUInt16LE(0,576+2);}],
 ['nonfinite-vertex-bytes',d=>{d.bin.writeFloatLE(Number.NaN,0);}]
];
await mkdir(`${root}/fault-injection`);
for(const [name,mutate] of faults){const d=readGlb(Buffer.from(bytes));mutate(d);const b=packGlb(d.json,d.bin),report=checkAsset(b,base.input,base.layout),inputHash=sha256(Buffer.from(JSON.stringify({input:base.input,layout:base.layout}))),outputHash=sha256(b);await writeFile(`${root}/fault-injection/${name}.glb`,b);const evidence={testOnly:true,simulatedScenario:true,injectedFault:name,input:base.input,layout:base.layout,inputHash,outputHash,inputGlbSha256:sha256(bytes),outputBytes:b.length,expected:'independent final asset check rejects mutated active-scene/mesh data',...report};await writeFile(`${root}/fault-injection/${name}.json`,JSON.stringify(evidence,null,2));rows.push({name,category:'failure-injection',inputHash,outputHash,actual:report.status,issues:report.issues,pass:report.status==='fail'});}
for(const [name,b] of [['truncated',bytes.subarray(0,bytes.length-7)],['corrupt-header',Buffer.from(bytes)]]){if(name==='corrupt-header')b.writeUInt32LE(0,0);const report=checkAsset(b,base.input,base.layout);await writeFile(`${root}/fault-injection/${name}.glb`,b);await writeFile(`${root}/fault-injection/${name}.json`,JSON.stringify({testOnly:true,...report},null,2));rows.push({name,category:'failure-injection',expected:'fail',actual:report.status,issues:report.issues,pass:report.status==='fail'});}
const codeHashes={};for(const file of ['src/scene.mjs','src/glb.mjs','src/asset-check.mjs','src/asset-oracle.mjs','src/export-assets.mjs','src/plan-svg.mjs','tests/assets.mjs','pnpm-lock.yaml'])codeHashes[file]=sha256(await readFile(file));
const report={runId,createdAt:new Date().toISOString(),simulatedScenario:true,toolKind:'deterministic-code',node:process.version,codeHashes,total:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,rows};await writeFile(`${root}/suite.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({root,total:report.total,passed:report.passed,failed:report.failed,rows},null,2));if(report.failed)process.exitCode=1;
