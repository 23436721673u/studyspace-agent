import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import gltfValidator from 'gltf-validator';
import {exportAssets} from '../src/export-assets.mjs';
import {checkAsset,sha256} from '../src/asset-check.mjs';
const [command,...args]=process.argv.slice(2),json=async p=>JSON.parse(await readFile(p,'utf8'));
try {
 if(command==='export'){const [input,layout,out]=args;if(!out)throw Error('export <input.json> <layout.json> <new-output-directory>');console.log(JSON.stringify(await exportAssets(await json(input),await json(layout),out),null,2));}
 else if(command==='verify'){const [dir]=args;if(!dir)throw Error('verify <asset-directory>');const editable=await json(`${dir}/editable.json`),bytes=await readFile(`${dir}/scene.glb`),geometry=checkAsset(bytes,editable.input,editable.layout),official=await gltfValidator.validateBytes(new Uint8Array(bytes),{uri:'scene.glb',format:'glb',maxIssues:0}),manifest=await json(`${dir}/manifest.json`),hashChecks=[];for(const [name,e] of Object.entries(manifest.files)){if(!['editable.json','scene.glb','plan.svg','geometry-report.json','gltf-validator-report.json'].includes(name))throw Error('unexpected manifest file');const b=await readFile(`${dir}/${name}`);hashChecks.push({name,pass:sha256(b)===e.sha256&&b.length===e.bytes});}const report={status:geometry.status==='pass'&&official.issues.numErrors===0&&hashChecks.length===5&&hashChecks.every(x=>x.pass)?'pass':'fail',geometry,official,hashChecks};const root=resolve(import.meta.dirname,'..'),out=resolve(root,'results','asset-rechecks');const rel=relative(root,out);if(rel.startsWith('..')||isAbsolute(rel))throw Error('output outside project');await mkdir(out,{recursive:true});const path=`${out}/${randomUUID()}.json`;await writeFile(path,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,path}));if(report.status!=='pass')process.exitCode=1;}
 else throw Error('Usage: node bin/assets.mjs export|verify ...');
}catch(e){console.error(e.stack);process.exitCode=1;}
