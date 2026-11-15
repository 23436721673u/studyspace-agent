import {mkdir,readFile,writeFile} from 'node:fs/promises';
import gltfValidator from 'gltf-validator';
import {resolve,relative,isAbsolute} from 'node:path';
import {normalizeAndValidate} from './schema.mjs';
import {validateLayout} from './validator.mjs';
import {buildScene} from './scene.mjs';
import {encodeGlb} from './glb.mjs';
import {checkAsset,sha256} from './asset-check.mjs';
import {planSvg} from './plan-svg.mjs';
export async function exportAssets(input,layout,destination) {
 const root=resolve(import.meta.dirname,'..'),dir=resolve(destination),rel=relative(root,dir);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('asset destination must be inside project');
 const parsed=normalizeAndValidate(input);if(!parsed.ok)throw Error(`schema rejected: ${JSON.stringify(parsed.issues)}`);const w=parsed.value,validation=validateLayout(w,layout);if(validation.status!=='pass')throw Error(`layout rejected: ${JSON.stringify(validation.issues)}`);
 await mkdir(dir,{recursive:false}); // Never overwrite a prior run.
 const scene=buildScene(w,layout),editable={format:'studyspace.asset-input.v1',units:'m',simulatedScenario:true,input:w,layout,style:scene.style};
 await writeFile(`${dir}/editable.json`,JSON.stringify(editable,null,2));await writeFile(`${dir}/scene.glb`,encodeGlb(scene));await writeFile(`${dir}/plan.svg`,planSvg(w,layout));
 const bytes=await readFile(`${dir}/scene.glb`),reread=JSON.parse(await readFile(`${dir}/editable.json`,'utf8')),report=checkAsset(bytes,reread.input,reread.layout);await writeFile(`${dir}/geometry-report.json`,JSON.stringify(report,null,2));
 const official=await gltfValidator.validateBytes(new Uint8Array(bytes),{uri:'scene.glb',format:'glb',maxIssues:0});await writeFile(`${dir}/gltf-validator-report.json`,JSON.stringify(official,null,2));
 const status=report.status==='pass'&&official.issues.numErrors===0?'pass':'fail';
 const files={};for(const name of ['editable.json','scene.glb','plan.svg','geometry-report.json','gltf-validator-report.json']){const b=await readFile(`${dir}/${name}`);files[name]={sha256:sha256(b),bytes:b.length};}
 const manifest={version:'phase03-v1',createdAt:new Date().toISOString(),simulatedScenario:true,tool:{kind:'deterministic-code',name:'parametric-glb-export'},status,officialValidator:gltfValidator.version(),files};await writeFile(`${dir}/manifest.json`,JSON.stringify(manifest,null,2));return {dir,status,parts:report.partCount,triangles:report.triangles,sha256:report.sha256,officialErrors:official.issues.numErrors,officialWarnings:official.issues.numWarnings};
}
