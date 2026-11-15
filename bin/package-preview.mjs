import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const outRoot = path.join(root, 'deliverables');
const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${crypto.randomUUID().slice(0, 8)}`;
const name = `studyspace-preview-${runId}`;
const stage = path.join(outRoot, name);
const zip = path.join(outRoot, `${name}.zip`);
const auditPath = path.join(outRoot, `${name}-AUDIT.json`);
const exportsRoot = 'F:/AGH/exports';
const jobIds = [
  '736d0edbc60847138fd356cd383104ff', '7f7fa22dfb1047c4a95357a1942aa83c',
  '9837e4c89ff347e195df9222d7812ae1', 'c13f1131a17f4160be0654a4d08ee475',
  'cc4d792f8ecd48b38a48432046988007', 'd9351dff81b14bdc8929d7a731d7262f'
];
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const files = [];
const failures = [];

function inside(base, candidate) {
  const rel = path.relative(base, candidate);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
function safeName(value) {
  return typeof value === 'string' && value.length > 0 && !/[\\:\x00]/.test(value)
    && !path.isAbsolute(value) && value.split('/').every(p => p && p !== '.' && p !== '..');
}
async function sourcePath(source) {
  const absolute = path.isAbsolute(source);
  const src = path.resolve(root, source);
  const base = await fs.realpath(absolute ? exportsRoot : root);
  const real = await fs.realpath(src);
  if (!inside(base, real)) throw new Error('source boundary violation');
  if (absolute && (path.dirname(real) !== base || !jobIds.some(id => path.basename(real).startsWith(`agh-${id}-`))
    || !/\.(jsonl|manifest\.json)$/.test(real))) throw new Error('export not allowed');
  return real;
}
async function addFile(source, target) {
  try {
    const label = (target || source).replaceAll('\\', '/');
    if (!safeName(label) || files.some(f => f.path === label)) throw new Error('unsafe or duplicate target');
    const src = await sourcePath(source);
    const dst = path.resolve(stage, label);
    if (!inside(stage, dst)) throw new Error('destination boundary violation');
    const st = await fs.stat(src);
    if (!st.isFile()) throw new Error('not a file');
    await fs.mkdir(path.dirname(dst), { recursive: true });
    if (!inside(await fs.realpath(stage), await fs.realpath(path.dirname(dst))) && path.dirname(dst) !== stage) throw new Error('destination real boundary violation');
    const original = await fs.readFile(src);
    await fs.writeFile(dst, original, { flag: 'wx' });
    const data = await fs.readFile(dst);
    if (hash(data) !== hash(original)) throw new Error('copy mismatch');
    files.push({ path: label, bytes: original.length, sha256: hash(original) });
  } catch (e) { failures.push({ source, error: e.message }); }
}
async function addDir(source, target, excludes = []) {
  const base = path.isAbsolute(source) ? source : path.join(root, source);
  async function walk(dir, rel = '') {
    const current = await sourcePath(path.join(source, rel));
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(rel, entry.name);
      const normalized = child.replaceAll(path.sep, '/');
      if (excludes.some(x => normalized === x || normalized.startsWith(`${x}/`))) continue;
      if (entry.isSymbolicLink()) throw new Error('symlink source rejected');
      if (entry.isDirectory()) await walk(dir, child);
      else if (entry.isFile()) await addFile(path.join(source, child), path.join(target, child));
    }
  }
  try { await walk(base); } catch (e) { failures.push({ source, error: e.message }); }
}

async function main() {
  await fs.mkdir(outRoot, { recursive: true });
  if (await fs.realpath(outRoot) !== path.join(await fs.realpath(root), 'deliverables')) throw new Error('deliverables boundary violation');
  for (const dest of [stage, zip, auditPath]) if (!inside(outRoot, dest)) throw new Error('output boundary violation');
  await fs.mkdir(stage);
  for (const dir of ['src', 'bin', 'vendor']) await addDir(dir, dir, ['package-preview.mjs']);
  await addDir('tests', 'tests', [
    'navigation-cancel-validation.mjs', 'navigation-cancellation-check.mjs',
    'navigation-cancellation-final.mjs', 'record-continuous.mjs', 'record-demo.mjs', 'visual-replay.mjs'
  ]);
  for (const file of [
    'README.md', 'package.json', 'pnpm-lock.yaml', 'viewer.html', 'workbench.html',
    'docs/API.md', 'docs/REPRODUCE.md', 'docs/PROJECT_SUBMISSION.md', 'docs/MODEL_USAGE.json',
    'docs/SOURCES.md', 'docs/THIRD_PARTY_NOTICES.md', 'docs/VALIDATION.md', 'docs/PHASE06_REPORT.md',
    'docs/SUBMISSION_CHECKLIST.md', 'docs/SUBMISSION_FIELDS.md', 'docs/DECLARATION_UNSIGNED.md',
    'config/runtime.example.json',
    'slides/20261012-U316-r5/studyspace-roadshow-draft.pptx', 'slides/20261012-U316-r5/verification-report.json',
    'slides/20261012-U316-r5/SPEAKER_NOTES.md', 'slides/20261012-U316-r5/VISUAL_REVIEW.md',
    'slides/20261012-U316-r5/SHA256SUMS.json', 'slides/20261012-U316-r5/build-deck.ps1'
  ]) await addFile(file);

  for (const id of jobIds) await addDir(`results/jobs/${id}`, `results/jobs/${id}`, ['step.lock']);
  await addDir('results/session-load-verification-2026-10-11T13-31-58.630Z', 'results/session-load-verification-2026-10-11T13-31-58.630Z');
  for (const dir of [
    'results/phase06-special-2026-10-11T07-16-05.402Z-9094010a-760d-4f12-bedd-a246e4665f4d',
    'results/assets/2026-10-11T07-14-25.420Z-35bed3fc-9ec7-4ea5-9af3-0a617ce1b9bb',
    'results/assets/2026-10-11T07-09-26.082Z-84c7874e-1964-48ee-8d8e-e11bdcfc3567',
    'results/phase06-product-e2e-2026-10-11T06-50-03.533Z-64a013d0-6cbf-4d87-bbdb-ebdf5d06dd20',
    'results/phase06-product-e2e-2026-10-11T07-06-56.990Z-f85b70ff-a1ba-4d1b-b279-ee3018b1e5a6',
    'slides/20261012-U316-r5/png'
  ]) await addDir(dir, dir);
  for (const file of [
    'results/phase-02-fixtures-2026-10-11T07-15-55.528Z-8fbea2b7-d0ce-4fd2-a989-0dd6ee0bd339.json',
    'results/phase-02-fixtures-2026-10-11T07-11-12.585Z-1de5a489-fac1-4555-ba1b-607c941fb474.json',
    'results/phase06-final-summary.json'
  ]) await addFile(file);

  const media = 'media/continuous/2026-10-11T15-05-31.302Z';
  for (const file of [
    'studyspace-continuous-original.webm', 'report.json', 'report.md', 'VIDEO_REVIEW_NOTES.md',
    'agh-events.jsonl', 'product-events.jsonl', 'live-input.json', 'live-job.json', 'live-ui-snapshot.json',
    'download-editable.json', 'download-scene.glb', '12-live-final-report.png',
    'history-boundary-door-equals-passage-input.png', 'history-boundary-door-equals-passage-snapshot.json',
    'history-boundary-door-equals-passage-trace.png', 'history-finite-budget-failure-input.png',
    'history-finite-budget-failure-snapshot.json', 'history-finite-budget-failure-trace.png',
    '01-simulated-input-repair-test.png', '02-live-job-running.png', '03-check-draft-fail.png',
    '04-final-verify-pass.png', '05-live-2d-plan.png', '06-downloads-live-assets.png',
    '07-glb-viewer-initial.png', '08-glb-viewer-rotated-zoomed.png'
  ]) await addFile(`${media}/${file}`, `${media}/${file}`);

  for (const file of await fs.readdir(exportsRoot)) {
    if (jobIds.some(id => file.startsWith(`agh-${id}-`)) && (file.endsWith('.jsonl') || file.endsWith('.manifest.json'))) {
      await addFile(path.join(exportsRoot, file), `evidence/agh-exports/${file}`);
    }
  }

  for (const id of jobIds) {
    const matched = files.filter(f => f.path.startsWith(`evidence/agh-exports/agh-${id}-`));
    if (!matched.some(f => f.path.endsWith('.jsonl')) || !matched.some(f => f.path.endsWith('.manifest.json'))) failures.push({ source: id, error: 'missing native export pair' });
  }
  if (files.filter(f => /^slides\/20261012-U316-r5\/png\/[^/]+\.png$/i.test(f.path)).length !== 8) failures.push({ source: 'r5/png', error: 'expected eight PNGs' });
  const artifactManifest = 'results/submission-artifacts-sha256.json';
  const artifactData = Buffer.from(JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'packaged source and evidence; historical reports unchanged; excludes this manifest and package audit metadata', files: [...files] }, null, 2));
  await fs.writeFile(path.join(stage, artifactManifest), artifactData, { flag: 'wx' });
  files.push({ path: artifactManifest, bytes: artifactData.length, sha256: hash(artifactData) });
  const names = files.map(x => x.path);
  const forbidden = /(^|[\\/])(node_modules|\.cache|\.tmp|state|credentials|cache)([\\/]|$)/i;
  const pathPass = names.every(x => !x.includes('..') && !path.isAbsolute(x) && !forbidden.test(x));
  const required = [
    'README.md', 'package.json', 'pnpm-lock.yaml', 'src/task-api.mjs', 'vendor/licenses',
    'docs/PROJECT_SUBMISSION.md', 'docs/MODEL_USAGE.json',
    'slides/20261012-U316-r5/studyspace-roadshow-draft.pptx',
    'media/continuous/2026-10-11T15-05-31.302Z/studyspace-continuous-original.webm'
  ];
  const missing = required.filter(x => x === 'vendor/licenses' ? !names.some(n => n.startsWith('vendor/licenses/')) : !names.includes(x));
  const suspicious = { files: [], categories: { keyLike: 0, credentialPath: 0 } };
  let scannedFiles = 0;
  let skippedLargeFiles = 0;
  for (const item of files) {
    if (item.bytes > 8 * 1024 * 1024) { skippedLargeFiles++; continue; }
    scannedFiles++;
    const text = await fs.readFile(path.join(stage, item.path), 'utf8');
    if (/(sk-[A-Za-z0-9]{24,}|AIza[0-9A-Za-z_-]{30,}|(?:bearer|token|secret)\s*[:=]\s*['\"][A-Za-z0-9_\-]{24,}['\"])/i.test(text)) { suspicious.files.push(item.path); suspicious.categories.keyLike++; }
    if (/(^|[\\/])(credentials|secrets|\.env)([\\/]|$)/i.test(item.path)) { suspicious.files.push(item.path); suspicious.categories.credentialPath++; }
  }
  const audit = {
    generatedAt: new Date().toISOString(), simulatedScenario: true, packageName: name,
    sourceScope: 'explicit whitelist; no whole-project recursive packaging',
    status: failures.length === 0 && pathPass && missing.length === 0 && suspicious.files.length === 0 ? 'pass' : 'fail',
    counts: { files: files.length, bytes: files.reduce((n, x) => n + x.bytes, 0) },
    failures, missingRequired: missing,
    files,
    pathPolicy: { pass: pathPass, excluded: ['node_modules', '.cache', '.tmp', 'AGH state', 'credentials', 'control/development sessions'] },
    secretScan: { pass: suspicious.files.length === 0, scope: 'UTF-8 pattern scan of files <=8MiB; larger and embedded/compressed binary content not inspected; no guarantee of exhaustive secret detection; configuration placeholders are not real keys', scannedFiles, skippedLargeFiles, suspectFileCount: new Set(suspicious.files).size, categories: suspicious.categories },
    videoDisclosure: { originalSeconds: 229.6, businessChecks: 19, fullDecode: true, strictPass: false, abortedCancellationCount: 26, note: 'strict report remains false; cancellations are not reclassified' },
    knownStatus: { core: '19/19', special: '24/24', assets: '21/21', targetedE2E: '2/2', oldFullE2E: '4/5 preserved', oldCore: '17/19 preserved', oldAssets: '15/21 preserved', declaration: 'unsigned; student review required', submission: 'not submitted or published' }
  };
  await fs.writeFile(path.join(stage, 'PACKAGE-MANIFEST.json'), JSON.stringify({ generatedAt: audit.generatedAt, excludes: ['PACKAGE-MANIFEST.json', 'PACKAGE-AUDIT.json'], files }, null, 2), { flag: 'wx' });
  await fs.writeFile(path.join(stage, 'PACKAGE-AUDIT.json'), JSON.stringify({ ...audit, scope: 'pre-ZIP staging audit; ZIP bytes verified separately in external audit' }, null, 2), { flag: 'wx' });
  if (audit.status !== 'pass') {
    await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ status: 'fail', zipCreated: false, failures: failures.length, missing: missing.length, suspectFileCount: new Set(suspicious.files).size }));
    process.exitCode = 1;
    return;
  }
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $base='${stage.replaceAll("'", "''")}'; $z=[IO.Compression.ZipFile]::Open('${zip.replaceAll("'", "''")}', [IO.Compression.ZipArchiveMode]::Create); try { foreach($f in [IO.Directory]::GetFiles($base,'*',[IO.SearchOption]::AllDirectories)) { $entry=$f.Substring($base.Length+1).Replace([char]92,[char]47); $e=$z.CreateEntry($entry,[IO.Compression.CompressionLevel]::Optimal); $inputStream=[IO.File]::OpenRead($f); try { $outputStream=$e.Open(); try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() } } finally { $inputStream.Dispose() } } } finally { $z.Dispose() }`], { stdio: 'inherit' });

  const zipBytes = (await fs.stat(zip)).size;
  const zipHash = hash(await fs.readFile(zip));
  const ps = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem
$z=[IO.Compression.ZipFile]::OpenRead('${zip.replaceAll("'", "''")}')
try {
  $rows=@(foreach($e in $z.Entries) {
    $s=$e.Open(); $h=[Security.Cryptography.SHA256]::Create(); $n=[long]0; $buffer=New-Object byte[] 65536
    try {
      while(($r=$s.Read($buffer,0,$buffer.Length)) -gt 0) { $null=$h.TransformBlock($buffer,0,$r,$buffer,0); $n+=$r }
      $null=$h.TransformFinalBlock($buffer,0,0)
      [pscustomobject]@{path=$e.FullName; bytes=$n; sha256=([BitConverter]::ToString($h.Hash)).Replace('-','').ToLowerInvariant()}
    } finally { $s.Dispose(); $h.Dispose() }
  })
  ConvertTo-Json -InputObject $rows -Compress
} finally { $z.Dispose() }`;
  const listed = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const expected = [...files];
  // These two hashes live only in the external audit, never in themselves.
  for (const meta of ['PACKAGE-MANIFEST.json', 'PACKAGE-AUDIT.json']) {
    const data = await fs.readFile(path.join(stage, meta));
    expected.push({ path: meta, bytes: data.length, sha256: hash(data) });
  }
  const stageNames = expected.map(x => x.path).sort();
  const zipNames = listed.map(x => x.path).sort();
  const expectedMap = new Map(expected.map(x => [x.path, x]));
  const entriesVerified = listed.every(x => {
    const source = expectedMap.get(x.path);
    return safeName(x.path) && !forbidden.test(x.path) && source && x.bytes === source.bytes && x.sha256 === source.sha256;
  }) && new Set(zipNames).size === zipNames.length;
  audit.zipEntryVerification = { pass: entriesVerified, method: 'ZIP entry decompression streams; no extraction files', entries: listed };
  audit.zip = { path: path.relative(root, zip).replaceAll('\\', '/'), bytes: zipBytes, sha256: zipHash, under200MB: zipBytes <= 200 * 1024 * 1024, entryCount: listed.length, entriesExact: JSON.stringify(stageNames) === JSON.stringify(zipNames) };
  audit.status = audit.status === 'pass' && audit.zip.under200MB && audit.zip.entriesExact && entriesVerified ? 'pass' : 'fail';
  await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ status: audit.status, package: audit.zip.path, audit: path.relative(root, auditPath).replaceAll('\\', '/'), files: files.length, zipBytes, zipSha256: zipHash, entryCount: listed.length, entriesExact: audit.zip.entriesExact, entriesVerified, failures: failures.length, missing: missing.length, suspiciousFiles: suspicious.files.length }, null, 2));
  if (audit.status !== 'pass') process.exitCode = 1;
}
main().catch(e => { console.error(`PACKAGE_FAILED: ${e.message}`); process.exitCode = 1; });
