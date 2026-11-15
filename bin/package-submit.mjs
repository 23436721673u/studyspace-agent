import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { collectPlan, officialRoot, runtime, reports } from './package-submit-plan.mjs';
import { sha256, safeName, scanSecrets, scanZipSecrets, verifyCopy, verifyZip, auditImports, selfTest } from './package-submit-audit.mjs';

const root = path.resolve(import.meta.dirname, '..');
const deliverables = path.join(root, 'deliverables');
const packageName = '本科生组-U316-智习空间队-陈炳然';
const normalize = value => value.replaceAll('\\', '/');
const inside = (base, candidate) => { const rel = path.relative(base, candidate); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel); };
const forbidden = /(^|\/)(node_modules|state|credentials|secrets|slides|controls?|logs|\.cache|\.tmp|\.git)(\/|$)|\.(pptx?|key)$/i;
const textName = /\.(?:js|mjs|cjs|json|md|txt|html|css|ps1|cmd|yaml|yml|lock)$/i;
const files = [];
const failures = [];
function stop(code) { const error = new Error(code); error.code = code; throw error; }
function exists(value) { return fs.access(value).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error)); }
async function addFile(stage, source, target, external = false) {
  const label = normalize(target || source);
  if (!safeName(label) || files.some(item => item.path === label) || forbidden.test(label)) stop('UNSAFE_PACKAGE_PATH');
  const real = await fs.realpath(source);
  const rootReal = await fs.realpath(root);
  const exportReal = await fs.realpath(officialRoot);
  if (!(inside(rootReal, real) || (external && inside(exportReal, real)))) stop('SOURCE_BOUNDARY_VIOLATION');
  const stat = await fs.stat(real); if (!stat.isFile()) stop('SOURCE_NOT_FILE');
  const destination = path.resolve(stage, label); if (!inside(stage, destination)) stop('DESTINATION_BOUNDARY_VIOLATION');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const data = await fs.readFile(real); await fs.writeFile(destination, data, { flag: 'wx' });
  const record = { path: label, bytes: data.length, sha256: sha256(data) }; await verifyCopy(stage, record); files.push(record);
}
async function copyPlan(stage, plan) {
  for (const item of plan.entries) {
    try { await addFile(stage, item.source, item.path, item.external); }
    catch (error) { failures.push({ source: item.path, code: error.code || 'COPY_FAILED' }); }
  }
  if (failures.length) stop('REQUIRED_SOURCE_COPY_FAILED');
}
function createZip(stage, zip) {
  const base = stage.replaceAll("'", "''"); const output = zip.replaceAll("'", "''");
  const command = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open('${output}',[IO.Compression.ZipArchiveMode]::Create); try { foreach($f in [IO.Directory]::GetFiles('${base}','*',[IO.SearchOption]::AllDirectories)) { $entry=$f.Substring('${base}'.Length+1).Replace([char]92,[char]47); $item=$z.CreateEntry($entry,[IO.Compression.CompressionLevel]::Optimal); $input=[IO.File]::OpenRead($f); try { $stream=$item.Open(); try { $input.CopyTo($stream) } finally { $stream.Dispose() } } finally { $input.Dispose() } } } finally { $z.Dispose() }`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'inherit' });
}
async function scanStage(stage) {
  const results = [];
  async function walk(dir) { for (const item of await fs.readdir(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isDirectory()) await walk(file); else { const relative = normalize(path.relative(stage, file)); if (forbidden.test(relative)) stop('FORBIDDEN_STAGED_FILE'); if (textName.test(relative)) results.push({ path: relative, ...(await scanSecrets(file)) }); } } }
  await walk(stage); return { scope: 'Selected text extensions up to 8 MiB per file; heuristic only, not a guarantee for binaries or all secrets', results, suspect: results.some(item => item.suspect) };
}
async function addRecord(stage, record) { const data = await fs.readFile(path.join(stage, record.path)); if (data.length !== record.bytes || sha256(data) !== record.sha256) stop('GENERATED_RECORD_MISMATCH'); files.push(record); }
async function writeGenerated(stage, relative, value) { const data = Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8'); const target = path.join(stage, relative); await fs.writeFile(target, data, { flag: 'wx' }); await addRecord(stage, { path: relative, bytes: data.length, sha256: sha256(data) }); }
async function checkSources() {
  const plan = await collectPlan(root);
  const tempRoot = path.join(root, '.tmp'); await fs.mkdir(tempRoot, { recursive: true });
  const importStage = await fs.mkdtemp(path.join(tempRoot, 'submission-import-check-'));
  let importAudit;
  try {
    for (const item of plan.entries.filter(item => /^(src|bin|vendor)\//.test(item.path) || item.path === 'package.json')) {
      if (!safeName(item.path)) stop('UNSAFE_IMPORT_PATH');
      const real = await fs.realpath(item.source);
      if (!inside(await fs.realpath(root), real)) stop('IMPORT_SOURCE_BOUNDARY');
      const target = path.join(importStage, item.path); await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(real, target);
    }
    importAudit = await auditImports(importStage, runtime);
    if (!importAudit.pass) stop('STAGE_IMPORT_FAILED');
  } finally {
    try {
      const rootReal = await fs.realpath(root);
      const tempStat = await fs.lstat(tempRoot), stageStat = await fs.lstat(importStage);
      const tempReal = await fs.realpath(tempRoot), stageReal = await fs.realpath(importStage);
      const expectedTemp = path.join(rootReal, '.tmp');
      const stageName = path.basename(stageReal), relativeStage = path.relative(tempReal, stageReal);
      const safeToRemove = !tempStat.isSymbolicLink() && tempStat.isDirectory() &&
        path.relative(expectedTemp, tempReal) === '' &&
        !stageStat.isSymbolicLink() && stageStat.isDirectory() &&
        stageName.startsWith('submission-import-check-') && stageName.length > 'submission-import-check-'.length &&
        relativeStage === stageName && inside(tempReal, stageReal);
      if (safeToRemove) await fs.rm(stageReal, { recursive: true, force: true });
    } catch { /* Unverified temporary paths are intentionally left in place. */ }
  }
  const officialReal = await fs.realpath(officialRoot);
  for (const item of plan.entries) if (item.external) { const sourceReal = await fs.realpath(item.source); if (!inside(officialReal, sourceReal)) stop('OFFICIAL_SOURCE_BOUNDARY'); }
  return { plan, importAudit };
}
async function build() {
  const { plan, importAudit } = await checkSources();
  const packageId = `submission-20261015-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${crypto.randomUUID().slice(0, 8)}`;
  const folder = path.join(deliverables, packageId); const stage = path.join(folder, packageName); const zip = path.join(folder, `${packageName}.zip`); const auditPath = path.join(folder, `${packageName}-AUDIT.json`);
  await fs.mkdir(folder, { recursive: true }); if (await exists(stage) || await exists(zip) || await exists(auditPath)) stop('OUTPUT_ALREADY_EXISTS'); await fs.mkdir(stage);
  await copyPlan(stage, plan);
  const stagedImports = await auditImports(stage, runtime); if (!stagedImports.pass) stop('STAGE_IMPORT_FAILED');
  const sourceScan = await scanStage(stage); if (sourceScan.suspect) stop('STAGED_SECRET_SUSPECT');
  const artifact = { generatedAt: new Date().toISOString(), algorithm: 'SHA-256', files: [...files] };
  await writeGenerated(stage, 'results/submission-artifacts-sha256.json', artifact);
  const names = files.map(item => item.path); const required = ['src/task-api.mjs','bin/agh-job.mjs','bin/job.mjs','bin/studyspace.mjs','bin/assets.mjs','vendor/agh/agh-sdk.mjs','docs/成员声明.md','docs/提交表单填写.txt','media/submission-20261015/新版工作台操作演示.mp4'];
  const missing = required.filter(item => !names.includes(item)); if (missing.length) stop('REQUIRED_PACKAGE_FILE_MISSING');
  const total = files.reduce((sum, item) => sum + item.bytes, 0); if (total >= 200000000) stop('STAGED_BYTES_NOT_UNDER_200MB');
  const preAudit = { generatedAt: new Date().toISOString(), packageId, simulatedScenario: true, status: 'pre-zip-pass', sourceScope: 'explicit whitelist; no PPT, package scripts, controls, chats, node_modules, state or credentials', counts: { files: files.length, bytes: total }, required, missing, importAudit, sourceScan, knownStatus: { core: '19/19', special: '24/24', assets: '21/21', ui: '10/10', live: '8/8', declaration: 'unsigned; student review required', publication: 'not published; URL/date/screenshot pending' } };
  await writeGenerated(stage, 'PACKAGE-AUDIT.json', preAudit);
  createZip(stage, zip);
  const zipAudit = await verifyZip(zip, files);
  const nested = [];
  for (const item of zipAudit.entries) if (item.path.startsWith('evidence/official-agh-exports/') && item.path.endsWith('.zip')) {
    const nestedScan = await scanZipSecrets(item.data);
    nested.push({ path: item.path, scope: 'Nested ZIP selected text extensions up to 8 MiB per entry; heuristic only, binaries and other text excluded', suspect: nestedScan.suspect, entries: nestedScan.entries.map(entry => ({ path: entry.path, suspect: entry.suspect })) });
  }
  const finalAudit = { ...preAudit, status: zipAudit.under200MB && nested.every(item => !item.suspect) ? 'pass' : 'fail', zip: { path: normalize(path.relative(root, zip)), bytes: zipAudit.bytes, sha256: zipAudit.sha256, under200MB: zipAudit.under200MB, entries: zipAudit.entries.map(({ data, ...entry }) => entry) }, nestedZipSecretScan: nested };
  await fs.writeFile(auditPath, JSON.stringify(finalAudit, null, 2) + '\n', { flag: 'wx' }); process.stdout.setDefaultEncoding('utf8'); console.log(JSON.stringify({ status: finalAudit.status, files: files.length, zipBytes: zipAudit.bytes, zipSha256: zipAudit.sha256, auditPath }, null, 2));
  if (finalAudit.status !== 'pass') process.exitCode = 1;
}
function artifactBytes(value) { return Buffer.byteLength(JSON.stringify(value, null, 2) + '\n'); }
function artifactHash(value) { return sha256(Buffer.from(JSON.stringify(value, null, 2) + '\n')); }
function preAuditBytes(value) { return Buffer.byteLength(JSON.stringify(value, null, 2) + '\n'); }
function preAuditHash(value) { return sha256(Buffer.from(JSON.stringify(value, null, 2) + '\n')); }
async function main() { const mode = process.argv[2]; if (mode === '--self-test') { console.log(JSON.stringify(selfTest(), null, 2)); return; } if (mode !== '--check' && mode !== '--build') stop('USE_CHECK_OR_BUILD'); const checked = await checkSources(); if (mode === '--check') { process.stdout.setDefaultEncoding('utf8'); console.log(JSON.stringify({ status: 'preflight-pass', packagingExecuted: false, entries: checked.plan.entries.length, jobs: checked.plan.jobChecks.length, importAudit: { pass: checked.importAudit.pass, sourceCount: checked.importAudit.sourceCount, relativeImports: checked.importAudit.relativeImports.length, runnerLoad: checked.importAudit.runnerLoad, scope: checked.importAudit.scope } }, null, 2)); return; } await build(); }
main().catch(error => { process.stdout.setDefaultEncoding('utf8'); console.error(JSON.stringify({ status: 'fail', code: error.code || 'PACKAGE_FAILED', message: 'Packaging stopped; no success claimed and no source or secret values printed.' })); process.exitCode = 1; });
