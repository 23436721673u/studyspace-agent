import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function filesUnder(dir){const out=[];for(const e of await readdir(resolve(root,dir),{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())out.push(...await filesUnder(p));else if(e.isFile())out.push(p);}return out;}
async function hashFiles(paths){const out={};for(const p of [...new Set(paths)].sort()){const b=await readFile(resolve(root,p));out[p.replaceAll('\\','/') ]={bytes:b.length,sha256:sha(b)};}return out;}
const summaryPath='results/phase06-final-summary.json';
const summary=JSON.parse(await readFile(resolve(root,summaryPath),'utf8'));
summary.testRuns=[
 {suite:'product-e2e-original-full-run',report:'results/phase06-product-e2e-2026-10-11T06-50-03.533Z-64a013d0-6cbf-4d87-bbdb-ebdf5d06dd20/summary.json',passed:4,failed:1,status:'fail-preserved'},
 {suite:'product-e2e-targeted-budget-and-invalid',report:'results/phase06-product-e2e-2026-10-11T07-06-56.990Z-f85b70ff-a1ba-4d1b-b279-ee3018b1e5a6/summary.json',passed:2,failed:0,status:'pass'},
 {suite:'assets-before-one-seat-fixture-correction',report:'results/assets/2026-10-11T07-09-26.082Z-84c7874e-1964-48ee-8d8e-e11bdcfc3567/suite.json',passed:15,failed:6,status:'fail-preserved',reason:'six one-seat cases inherited requiredSeats=2 while targetSeats=1; schema correctly rejected'},
 {suite:'assets-corrected',report:'results/assets/2026-10-11T07-14-25.420Z-35bed3fc-9ec7-4ea5-9af3-0a617ce1b9bb/suite.json',passed:21,failed:0,status:'pass',reason:'fixture targetSeats and requiredSeats both 1; schema unchanged'},
 {suite:'core-fixtures-before-one-seat-fixture-correction',report:'results/phase-02-fixtures-2026-10-11T07-11-12.585Z-1de5a489-fac1-4555-ba1b-607c941fb474.json',passed:17,failed:2,status:'fail-preserved'},
 {suite:'core-fixtures-corrected',report:'results/phase-02-fixtures-2026-10-11T07-15-55.528Z-8fbea2b7-d0ce-4fd2-a989-0dd6ee0bd339.json',passed:19,failed:0,status:'pass'},
 {suite:'phase06-special',report:'results/phase06-special-2026-10-11T07-16-05.402Z-9094010a-760d-4f12-bedd-a246e4665f4d/report.json',passed:24,failed:0,status:'pass'}
];
const codeFiles=[...(await Promise.all(['bin','src','tests','vendor'].map(filesUnder))).flat(),...['workbench.html','viewer.html','package.json','pnpm-lock.yaml']];
summary.currentSourceSha256=await hashFiles(codeFiles);
const evidenceDirs=[
 'results/phase06-product-e2e-2026-10-11T06-50-03.533Z-64a013d0-6cbf-4d87-bbdb-ebdf5d06dd20',
 'results/phase06-product-e2e-2026-10-11T07-06-56.990Z-f85b70ff-a1ba-4d1b-b279-ee3018b1e5a6',
 'results/assets/2026-10-11T07-09-26.082Z-84c7874e-1964-48ee-8d8e-e11bdcfc3567',
 'results/assets/2026-10-11T07-14-25.420Z-35bed3fc-9ec7-4ea5-9af3-0a617ce1b9bb',
 'results/phase06-special-2026-10-11T07-16-05.402Z-9094010a-760d-4f12-bedd-a246e4665f4d'
];
const reportFiles=[
 'results/phase-02-fixtures-2026-10-11T07-11-12.585Z-1de5a489-fac1-4555-ba1b-607c941fb474.json',
 'results/phase-02-fixtures-2026-10-11T07-15-55.528Z-8fbea2b7-d0ce-4fd2-a989-0dd6ee0bd339.json'
];
const jobIds=['3aae3239ed8e47b88d26414cc282b83c','e30277b5afe94de9904bc5e5ddd870c9','736d0edbc60847138fd356cd383104ff','7f7fa22dfb1047c4a95357a1942aa83c'];
const jobFiles=(await Promise.all(jobIds.map(id=>filesUnder(`results/jobs/${id}`)))).flat();
const evidence=await Promise.all(evidenceDirs.map(filesUnder));
summary.evidenceSha256=await hashFiles([...reportFiles,...evidence.flat(),...jobFiles]);
summary.productJobArtifactSha256=Object.fromEntries(await Promise.all(jobIds.map(async id=>[id,await hashFiles(await filesUnder(`results/jobs/${id}`))])));
summary.inputOutputSha256={
 productJobInputs:Object.fromEntries(await Promise.all(jobIds.map(async id=>{const p=`results/jobs/${id}/input.json`;return[id,(await hashFiles([p]))[p]];}))),
 capturedPostInputs:await hashFiles([...await filesUnder('results/phase06-product-e2e-2026-10-11T06-50-03.533Z-64a013d0-6cbf-4d87-bbdb-ebdf5d06dd20'),...await filesUnder('results/phase06-product-e2e-2026-10-11T07-06-56.990Z-f85b70ff-a1ba-4d1b-b279-ee3018b1e5a6')].filter(p=>p.endsWith('-post-input.json')))
};
summary.hashManifest={algorithm:'SHA-256',sourceFileCount:Object.keys(summary.currentSourceSha256).length,evidenceFileCount:Object.keys(summary.evidenceSha256).length,scope:'project bin/src/tests/vendor plus entry/config files; preserved E2E/assets/special/core reports and product job directories'};
await writeFile(resolve(root,summaryPath),JSON.stringify(summary,null,2)+'\n',{flag:'w'});
console.log(JSON.stringify({summary:summaryPath,sourceFiles:summary.hashManifest.sourceFileCount,evidenceFiles:summary.hashManifest.evidenceFileCount,productJobs:jobIds.length},null,2));
