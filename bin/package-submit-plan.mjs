import { promises as fs } from 'node:fs';
import path from 'node:path';
export const officialRoot = 'F:/AGH/exports/official-ui-20261015';
export const runtime = ['bin/agh-job.mjs','bin/job.mjs','bin/studyspace.mjs','bin/assets.mjs','bin/start-workbench.ps1','vendor/agh/agh-sdk.mjs','vendor/agh/LICENSE'];
export const cases = [
 ['c13f1131a17f4160be0654a4d08ee475','pass'],
 ['de7f292bb1294c1fb871f4220bfe6741','pass'],
 ['6919b380ebcb414e888417fc822368a7','pass-after-video'],
 ['a0b411ae22004f068b985da31ae78c00','incomplete'],
 ['9837e4c89ff347e195df9222d7812ae1','repair-test'],
 ['736d0edbc60847138fd356cd383104ff','boundary-pass'],
 ['7f7fa22dfb1047c4a95357a1942aa83c','budget-not-found']
];
export const reports = {
 core:'results/phase-02-fixtures-2026-10-11T07-15-55.528Z-8fbea2b7-d0ce-4fd2-a989-0dd6ee0bd339.json',
 special:'results/phase06-special-2026-10-11T07-16-05.402Z-9094010a-760d-4f12-bedd-a246e4665f4d/report.json',
 assets:'results/assets/2026-10-11T07-14-25.420Z-35bed3fc-9ec7-4ea5-9af3-0a617ce1b9bb/suite.json',
 ui:'results/workbench-ux-2026-10-14T04-49-46-132Z/report.json',
 live:'results/workbench-live-2026-10-14T04-57-32-908Z/report.json',
 final:'results/phase06-final-summary.json'
};
const srcNames = ['agh-runner.mjs','asset-check.mjs','asset-oracle.mjs','baseline.mjs','export-assets.mjs','fixtures.mjs','geometry.mjs','glb.mjs','job-integrity.mjs','plan-svg.mjs','routing.mjs','scene.mjs','schema.mjs','search.mjs','task-api.mjs','validator.mjs','viewer-webgl.mjs','workbench-ui.js'];
export const oldMedia='media/continuous/2026-10-11T15-05-31.302Z';
export const newMedia='media/submission-20261015';
const assets=['editable.json','geometry-report.json','gltf-validator-report.json','manifest.json','plan.svg','scene.glb'];
export async function collectPlan(root) {
 const entries=[]; const jobChecks=[]; const exportPairs=[];
 const add=(file,target=file,external=false)=>entries.push({source:external?file:path.resolve(root,file),path:target,external});
 const exists=async file=>{try {await fs.access(path.resolve(root,file));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
 for(const file of [...srcNames.map(n=>'src/'+n),...runtime,
 'package.json','pnpm-lock.yaml','README.md','workbench.html','viewer.html','guide.html','一键打开工作台.cmd','工作台使用说明.txt',
 'docs/API.md','docs/REPRODUCE.md','docs/WORKBENCH_GUIDE.md','docs/MODEL_USAGE.json','docs/SOURCES.md','docs/THIRD_PARTY_NOTICES.md','docs/VALIDATION.md','docs/SUBMISSION_CHECKLIST.md','docs/成员声明.md','docs/提交表单填写.txt','config/runtime.example.json',
 'tests/assets.mjs','tests/phase06-special.mjs','tests/recovery-criteria.mjs','tests/task-api-smoke.mjs','tests/sample-6-seat.json',
 ...Object.values(reports)]) add(file);
 // Core fixtures live in src/fixtures.mjs. Real job inputs supply normal/boundary/budget cases.
 const licenseDir=path.resolve(root,'vendor/licenses');
 for(const item of await fs.readdir(licenseDir,{withFileTypes:true})){if(!item.isFile())throw new Error('LICENSE_NONFILE');add('vendor/licenses/'+item.name);}
 for(const [id,kind] of cases){
  const base='results/jobs/'+id;
  for(const n of ['input.json','job.json','connection.json','events.jsonl','agh-events.jsonl'])add(base+'/'+n);
  for(const n of ['user-request.txt','inspect.json','search.json','draft.json','check-draft.json','check-search.json','export.json','verify.json','final-ui.json','recovered-ui.json','inspect.receipt.json','search.receipt.json','draft.receipt.json','check-draft.receipt.json','check-search.receipt.json','export.receipt.json','verify.receipt.json'])if(await exists(base+'/'+n))add(base+'/'+n);
  const complete=!['incomplete','budget-not-found'].includes(kind);
  for(const n of assets)if(complete || await exists(base+'/assets/'+n))add(base+'/assets/'+n);
  if(complete){for(const n of ['search.json','check-search.json','export.json','verify.json'])if(!await exists(base+'/'+n))throw new Error('SUCCESS_EVIDENCE_MISSING');}
  if(kind==='repair-test')for(const n of ['draft.json','check-draft.json'])if(!await exists(base+'/'+n))throw new Error('REPAIR_EVIDENCE_MISSING');
  jobChecks.push({id,kind,complete,base});
 }
 for(const n of ['studyspace-continuous-original.webm','report.json','report.md','VIDEO_REVIEW_NOTES.md'])add(oldMedia+'/'+n);
 for(const n of ['新版工作台操作演示.mp4','新版工作台操作演示.media-report.md'])add(newMedia+'/'+n);
 for(const n of ['start.png','complete.png','3D.png'])add('results/workbench-live-2026-10-14T04-57-32-908Z/'+n);
 const official=await fs.readdir(officialRoot,{withFileTypes:true});
 for(const [id] of cases){
  const candidates=official.filter(e=>e.isFile()&&e.name.startsWith('agh-diagnostics-'+id.slice(0,8)+'-')&&e.name.endsWith('.zip'));
  if(candidates.length!==1)throw new Error('OFFICIAL_ZIP_PAIR_AMBIGUOUS');
  const name=candidates[0].name;
  for(const n of [name,name+'.manifest.json',id+'-official-button.png'])add(path.join(officialRoot,n),'evidence/official-agh-exports/'+n,true);
  exportPairs.push({id,zip:'evidence/official-agh-exports/'+name,manifest:'evidence/official-agh-exports/'+name+'.manifest.json'});
 }
 return {entries,jobChecks,exportPairs};
}
