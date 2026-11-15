import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),base='http://127.0.0.1:4398',jobId='4a024c78093e46dab1faaed0c166e99b';
const out=resolve(root,'results/browser-runs',new Date().toISOString().replaceAll(':','-')+'-visual-replay');await mkdir(out,{recursive:true});
const report={mode:'replay of the new real six-seat task; no generation',jobId,checks:[],errors:[],screenshots:[],server:{base,ownership:'test child',external4319Untouched:true}};
const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,detail});
const child=spawn(process.execPath,['src/task-api.mjs'],{cwd:root,env:{...process.env,STUDYSPACE_PORT:'4398'},windowsHide:true,stdio:['ignore','ignore','pipe']});let exited=false;child.on('error',e=>report.errors.push({childError:e.message}));child.on('exit',(code)=>{exited=true;if(code)report.errors.push({childExit:code})});child.stderr.on('data',d=>report.errors.push({childStderr:String(d)}));let browser;
try{
for(let i=0;i<40;i++){if(exited)throw Error('test child exited');try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,150));}
browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1600,height:1000}});
await context.addInitScript(id=>{localStorage.setItem('studyspace.jobId',id);window.paintCalls=[];const proto=CanvasRenderingContext2D.prototype;for(const name of ['fillRect','strokeRect','fillText','lineTo']){const f=proto[name];proto[name]=function(...args){window.paintCalls.push({name,args,color:name==='fillRect'?this.fillStyle:this.strokeStyle});return f.apply(this,args)}}},jobId);
const page=await context.newPage();function observe(p){p.on('pageerror',e=>report.errors.push({pageerror:e.message}));p.on('console',m=>{if(m.type()==='error')report.errors.push({console:m.text(),location:m.location()})});p.on('response',r=>{if(r.status()>=400)report.errors.push({http:r.status(),url:r.url()})})}observe(page);
await page.goto(base);await page.waitForFunction(()=>document.querySelectorAll('#downloads a').length===6);
const paint=await page.evaluate(()=>paintCalls);const chairs=paint.filter(p=>p.name==='fillRect'&&p.color==='#277b80'&&p.args.every(Number.isFinite));check('six finite chair rectangles rendered',chairs.length>=6,{chairs:chairs.slice(-6)});check('actual path segments drawn',paint.filter(p=>p.name==='lineTo').length>20,null);check('six seat labels rendered',new Set(paint.filter(p=>p.name==='fillText'&&String(p.args[0]).startsWith('座位 ')).map(p=>p.args[0])).size===6,null);
await page.locator('[data-seat="seat-3"]').click();check('selection highlights list',await page.locator('[data-seat="seat-3"]').evaluate(e=>e.style.outline.includes('2px')),null);
await page.screenshot({path:resolve(out,'2d-six-chairs-paths.png'),fullPage:true});report.screenshots.push('2d-six-chairs-paths.png');
const pp=page.waitForEvent('popup');await page.click('#view3d');const viewer=await pp;observe(viewer);await viewer.waitForFunction(()=>document.querySelector('#canvas').dataset.tables==='6');
const data=await viewer.locator('#canvas').evaluate(e=>({...e.dataset}));check('WebGL depth test and six table meshes',data.depthTest==='true'&&data.tables==='6',data);check('chair backs and legs present',+data.backs>=6&&+data.legs>=24,data);
await viewer.waitForTimeout(500);await viewer.screenshot({path:resolve(out,'3d-six-seats.png'),fullPage:true});report.screenshots.push('3d-six-seats.png');
await viewer.locator('#walls').check();await viewer.screenshot({path:resolve(out,'3d-walls.png'),fullPage:true});report.screenshots.push('3d-walls.png');await viewer.locator('#walls').uncheck();
const box=await viewer.locator('#canvas').boundingBox();await viewer.mouse.move(box.x+box.width/2,box.y+box.height/2);await viewer.mouse.down();await viewer.mouse.move(box.x+box.width/2+120,box.y+box.height/2+40,{steps:12});await viewer.mouse.up();await viewer.mouse.wheel(0,-150);await viewer.waitForTimeout(500);await viewer.screenshot({path:resolve(out,'3d-rotated.png'),fullPage:true});report.screenshots.push('3d-rotated.png');
await page.fill('#roomW','9');check('edit clears old seat list and downloads',await page.locator('[data-seat]').count()===0&&await page.locator('#downloads a').count()===0&&await page.locator('#generate').isEnabled(),null);
}catch(e){report.errors.push({test:e.stack})}finally{if(browser)await browser.close();child.kill();report.pass=report.errors.length===0&&report.checks.length>=7&&report.checks.every(c=>c.pass);await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,pass:report.pass,errors:report.errors},null,2));process.exitCode=report.pass?0:1}
