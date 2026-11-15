import {readFile,writeFile,open,unlink,rename,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
export const digest=x=>createHash('sha256').update(x).digest('hex');
export const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
export async function optionalJson(p){try{return await readJson(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function atomicJson(p,value){const tmp=`${p}.${randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(value,null,2));await rename(tmp,p);}
export async function acquireLock(path){
 const identity={pid:process.pid,runId:randomUUID(),createdAt:new Date().toISOString()};
 try{const f=await open(path,'wx');await f.writeFile(JSON.stringify(identity));await f.close();}
 catch(e){if(e.code!=='EEXIST')throw e;const prior=await readJson(path);let active=true;try{process.kill(prior.pid,0);}catch(err){if(err.code==='ESRCH')active=false;else throw err;}
  if(active)throw Error(`Active lock owned by PID ${prior.pid}`);
  await rename(path,`${path}.stale-${randomUUID()}`);return acquireLock(path);
 }
 return async()=>{const now=await optionalJson(path);if(now?.runId===identity.runId)await unlink(path);};
}
export async function codeDigest(root){const files=['bin/job.mjs',...(await readdir(resolve(root,'src'))).filter(x=>x.endsWith('.mjs')&&!x.startsWith('agh-')).sort().map(x=>`src/${x}`)];return digest(Buffer.concat(await Promise.all(files.map(async f=>Buffer.concat([Buffer.from(f+'\n'),await readFile(resolve(root,f))])))));}
const dependencyMap={inspect:[],draft:['inspect'],'check-draft':['draft'],search:['inspect'],'check-search':['search'],export:['search','check-search'],verify:['export','search']};
export async function stepContext(dir,step,mode,inputHash,codeHash){
 const names=[...dependencyMap[step]];if(step==='search'&&mode==='repair-test')names.push('check-draft');
 const dependencies={};for(const name of names){await checkReceipt(dir,name,mode,inputHash,codeHash);dependencies[name]=digest(await readFile(`${dir}/${name}.json`));}
 return {inputHash,codeHash,dependencies};
}
export async function checkReceipt(dir,step,mode,inputHash,codeHash){
 const receipt=await optionalJson(`${dir}/${step}.receipt.json`);if(!receipt)throw Error(`Unverified previous step ${step}; preserve record and create a new job for revalidation`);
 const context=await stepContext(dir,step,mode,inputHash,codeHash);
 if(JSON.stringify(receipt.context)!==JSON.stringify(context)||receipt.outputHash!==digest(await readFile(`${dir}/${step}.json`)))throw Error(`Stale or altered ${step}; preserve record and revalidate in a new job`);
 for(const [name,expected] of Object.entries(receipt.assets??{}))if(digest(await readFile(`${dir}/assets/${name}`))!==expected)throw Error(`Asset changed: ${name}`);
 return readJson(`${dir}/${step}.json`);
}
export async function saveReceipt(dir,step,context){const assets={};if(['export','verify'].includes(step))for(const name of await readdir(`${dir}/assets`))assets[name]=digest(await readFile(`${dir}/assets/${name}`));await writeFile(`${dir}/${step}.receipt.json`,JSON.stringify({context,outputHash:digest(await readFile(`${dir}/${step}.json`)),assets},null,2),{flag:'wx'});}
