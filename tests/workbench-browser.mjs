import { chromium } from 'playwright';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = 'http://127.0.0.1:4319';

const root = resolve(import.meta.dirname, '..');
const stamp = new Date().toISOString().replaceAll(':', '-');
const out = resolve(root, 'results', 'browser-runs', stamp);
await mkdir(out, { recursive: true });
const report = { stamp, browser: null, checks: [], errors: [], screenshots: [], jobId: null, server: null };
const check = (name, pass, detail) => report.checks.push({ name, pass: Boolean(pass), detail });
let browser;
const waitForServer = async () => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${base}/`); if (r.ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
};
try {
  report.server = { ownership: 'external', base, startedBy: 'control host', responsibility: 'HTTP infrastructure only; browser button invokes the product AGH workflow', spawnedByTest: false, stoppedByTest: false };
  const available = await waitForServer();
  check('external local server available', available, report.server);
  if (!available) throw new Error('External HTTP service is unavailable');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  report.browser = 'msedge';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push({ type: 'pageerror', message: e.message }));
  page.on('console', m => { if (m.type() === 'error') report.errors.push({ type: 'console', message: m.text() }); });
  const response = await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  check('workbench loads', response?.status() === 200, response?.status());
  check('initial canvas rendered', await page.locator('#plan').evaluate(e => e.width > 0 && e.height > 0), await page.locator('#plan').evaluate(e => ({ width: e.width, height: e.height })));
  await page.screenshot({ path: resolve(out, '01-initial.png'), fullPage: true }); report.screenshots.push('01-initial.png');

  await page.fill('#roomW', '9');
  await page.waitForTimeout(100);
  check('edit invalidates old result', (await page.locator('#checks').innerText()).includes('参数已修改'), await page.locator('#checks').innerText());
  check('generate remains enabled after edit', await page.locator('#generate').isEnabled(), null);
  await page.screenshot({ path: resolve(out, '02-invalidated.png'), fullPage: true }); report.screenshots.push('02-invalidated.png');

  await page.fill('#roomW', '10');
  await page.click('#generate');
  await page.waitForFunction(() => /^[a-f0-9]{32}$/.test(document.querySelector('#jobId').textContent.trim()), null, { timeout: 15000 });
  report.jobId = await page.locator('#jobId').innerText();
  check('generate starts a real 32-hex job', /^[a-f0-9]{32}$/.test(report.jobId), report.jobId);
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const business = await page.locator('#business').innerText();
    const native = await page.locator('#native').innerText();
    if (business === 'pass' && native.includes('completed')) break;
    if (business === '未完成' || native.includes('adapter-error') || native.includes('unknown')) break;
    await page.waitForTimeout(2000);
  }
  let business = await page.locator('#business').innerText();
  let native = await page.locator('#native').innerText();
  check('new AGH task is completed and business-pass', business === 'pass' && native.includes('completed'), { business, native, jobId: report.jobId });
  const jobSnapshot = await page.request.get(`${base}/api/jobs/${report.jobId}`).then(r => r.json());
  const model = jobSnapshot.job?.model ?? {};
  const jobDir = resolve(root, 'results', 'jobs', report.jobId);
  const promptName = (await readdir(jobDir)).find(name => /^prompt-[a-f0-9]+\.txt$/.test(name));
  const promptText = promptName ? await readFile(resolve(jobDir, promptName), 'utf8') : '';
  check('model metadata records alias route endpoint without secrets', model.name === 'gpt-6-astra' && model.alias === 'gpt-6-astra' && model.route === 'account-studyspace-astra-api' && model.endpoint === 'https://totokens.cc/v1' && !JSON.stringify(model).match(/api[_-]?key|secret/i), model);
  const promptResponse = await page.request.get(`${base}/api/jobs/${report.jobId}/files/input.json`);
  const inputSnapshot = await promptResponse.json();
  check('original natural-language request enters the AGH prompt', typeof inputSnapshot.userRequest === 'string' && inputSnapshot.userRequest.length > 0 && jobSnapshot.job.userRequest === inputSnapshot.userRequest && promptText.includes(inputSnapshot.userRequest), { userRequest: jobSnapshot.job.userRequest, promptFile: promptName });
  await page.screenshot({ path: resolve(out, '03-task-terminal.png'), fullPage: true }); report.screenshots.push('03-task-terminal.png');
  if (!(business === 'pass' && native.includes('completed'))) throw new Error(`normal task did not pass: ${business} / ${native}`);

  const seats = await page.locator('#seatList [data-seat]').count();
  const seatText = await page.locator('#seatList').innerText();
  const checksText = await page.locator('#checks').innerText();
  check('real result shows numbered seats and paths', seats > 0 && /seat-|座位/.test(seatText) && seatText.includes('路径'), { seats, seatText });
  check('real result shows independent access checks', checksText.includes('可达性') && checksText.includes('通过'), checksText);

  const links = await page.locator('#downloads a').evaluateAll(as => as.map(a => ({ name: a.textContent.trim(), href: a.href })));
  const statuses = [];
  for (const link of links) statuses.push({ name: link.name, status: (await page.request.get(link.href)).status() });
  report.downloads = statuses;
  check('all six displayed downloads return HTTP 200', statuses.length === 6 && statuses.every(x => x.status === 200), statuses);

  const beforeRefresh = report.jobId;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(id => document.querySelector('#jobId').textContent.trim() === id, beforeRefresh, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#business').textContent === 'pass', null, { timeout: 15000 });
  check('refresh resumes the same job from localStorage', (await page.locator('#jobId').innerText()) === beforeRefresh && (await page.locator('#seatList [data-seat]').count()) > 0, { beforeRefresh, afterRefresh: await page.locator('#jobId').innerText() });

  const popupPromise = page.waitForEvent('popup');
  await page.click('#view3d');
  const viewer = await popupPromise;
  await viewer.waitForLoadState('networkidle');
  await viewer.waitForTimeout(700);
  const viewerStatus = await viewer.locator('#status').innerText();
  check('GLB viewer auto-loads real job asset', viewerStatus.includes('已从GLB二进制读取'), viewerStatus);
  await viewer.screenshot({ path: resolve(out, '04-viewer-glb.png'), fullPage: true }); report.screenshots.push('04-viewer-glb.png');
  await viewer.close();

  await page.fill('#roomW', '9');
  await page.waitForTimeout(100);
  business = await page.locator('#business').innerText();
  check('editing after completion invalidates old acceptance', (await page.locator('#checks').innerText()).includes('参数已修改') && business === '未验证' && await page.locator('#generate').isEnabled(), { business, checks: await page.locator('#checks').innerText() });
  await page.screenshot({ path: resolve(out, '05-after-edit.png'), fullPage: true }); report.screenshots.push('05-after-edit.png');
  await context.close();
} catch (e) {
  report.errors.push({ type: 'test', message: e.stack || e.message });
} finally {
  if (browser) await browser.close();
  report.finishedAt = new Date().toISOString();
  report.pass = report.errors.length === 0 && report.checks.length > 0 && report.checks.every(x => x.pass);
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, pass: report.pass, checks: report.checks.length, errors: report.errors.length, jobId: report.jobId }, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}
