import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fixtures } from '../src/fixtures.mjs';
import { normalizeAndValidate } from '../src/schema.mjs';
import { validateLayout } from '../src/validator.mjs';
import { searchLayouts } from '../src/search.mjs';
import { fixedGridBaseline } from '../src/baseline.mjs';
import { buildOccupancy, doorEntry } from '../src/geometry.mjs';
import { findRoute, segmentClear } from '../src/routing.mjs';
import { exportAssets } from '../src/export-assets.mjs';
import { checkAsset } from '../src/asset-check.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(.)\:/, '$1:').replaceAll('/', '\\').replace(/\\$/, '');
const stamp = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
const out = `${root}\\results\\phase06-special-${stamp}`;
await mkdir(out, { recursive: true });
const base = structuredClone(fixtures.find(x => x.name === 'normal-manual-two-seats').input);
const baseLayout = { seats: [{ id: 'manual-a', x: 1.2, z: 3.5, orientation: 0 }, { id: 'manual-b', x: 4.5, z: 3.5, orientation: 0 }] };
const rows = [];
const hash = value => createHash('sha256').update(value).digest('hex');
const codeFiles = ['tests/phase06-special.mjs', 'src/schema.mjs', 'src/validator.mjs', 'src/routing.mjs', 'src/search.mjs', 'src/baseline.mjs', 'src/fixtures.mjs'];
const codeHashes = Object.fromEntries(await Promise.all(codeFiles.map(async file => [file, hash(await readFile(`${root}\\${file}`))])));
const noFalseFound = result => {
  if (!result || !Number.isInteger(result.attempts) || !Number.isInteger(result.budget) || result.attempts > result.budget || !Number.isFinite(result.elapsedMs) || typeof result.termination !== 'string' || !result.termination) return false;
  if (result.found === true) return result.validation?.status === 'pass';
  return result.found === false && /budget exhausted|candidate space ended/.test(result.termination);
};
const run = async (name, input, execute, assert) => {
  const started = performance.now(); let actual = null, error = null, pass = false;
  try {
    actual = await execute(normalizeAndValidate(input));
    if (actual === undefined) throw new Error('executor returned no result');
    const verdict = await assert(actual);
    if (typeof verdict !== 'boolean') throw new Error('assertion must return a boolean');
    pass = verdict;
  } catch (e) { error = { name: e.name, message: e.message, stack: e.stack }; }
  rows.push({ name, input, inputHash: hash(JSON.stringify(input)), expected: 'explicit async assertion', actual, error, elapsedMs: performance.now() - started, codeHashes, pass });
};

await run('default-orientation-normalization', { ...base }, async () => ({ schema: normalizeAndValidate(base), validation: validateLayout(base, baseLayout) }), actual => actual.schema.ok && actual.schema.value.orientations.join(',') === '0,90' && actual.validation.status === 'pass');
await run('raw-asset-input-default-orientation', { ...base }, async () => ({ schema: normalizeAndValidate(base), validation: validateLayout(base, baseLayout), normalizedEntityGap: normalizeAndValidate(base).value.seatTemplate.entityGap }), actual => actual.schema.ok && actual.normalizedEntityGap === 0.05 && actual.validation.status === 'pass');
await run('required-seats-greater-than-target', { ...base, targetSeats: 2, requiredSeats: 3 }, async () => normalizeAndValidate({ ...base, targetSeats: 2, requiredSeats: 3 }), actual => !actual.ok && actual.issues.some(x => x.code === 'seats.relation'));
const onlyZero = { ...base, targetSeats: 1, requiredSeats: 1, orientations: [0] };
await run('single-orientation-independent-rejection', onlyZero, async () => ({ schema: normalizeAndValidate(onlyZero), validation: validateLayout(onlyZero, { seats: [{ id: 'wrong', x: 3, z: 3, orientation: 90 }] }) }), actual => actual.schema.ok && actual.validation.status === 'fail' && actual.validation.issues.some(x => x.code === 'seat.orientation.not-allowed'));
const illegalDirections = { ...base, orientations: [0, 45] };
await run('explicit-illegal-orientation-schema', illegalDirections, async () => normalizeAndValidate(illegalDirections), actual => !actual.ok && actual.issues.some(x => x.code === 'constraint.orientations'));
await run('illegal-coordinate', base, async () => validateLayout(base, { seats: [{ id: 'nan', x: Number.NaN, z: 2, orientation: 0 }, { id: 'b', x: 4, z: 3, orientation: 0 }] }), actual => actual.status === 'fail' && actual.issues.some(x => x.code === 'seat.coordinate'));
const tiny = { ...base, gridSize: 0.01 };
await run('tiny-grid-resource-limit', tiny, async () => normalizeAndValidate(tiny), actual => !actual.ok && actual.issues.some(x => x.code === 'constraint.grid.limit'));
const hugeGrid = { ...base, room: { width: 100, depth: 100 }, gridSize: 0.02 };
await run('large-grid-resource-limit', hugeGrid, async () => normalizeAndValidate(hugeGrid), actual => !actual.ok && actual.issues.some(x => x.code === 'constraint.grid.nodes'));
await run('route-target-own-entity-rejected', base, async () => { const w = normalizeAndValidate(base).value; const seat = { id: 'own', x: 3, z: 3, orientation: 0 }; const own = buildOccupancy(w, seat); return findRoute(w, doorEntry(w), { x: own.table.x, z: own.table.z }, [own.table]); }, actual => actual.reachable === false && /target body intersects furniture/.test(actual.reason));
await run('thin-obstacle-and-final-segment-sweep', base, async () => { const w = normalizeAndValidate(base).value; return { direct: segmentClear(w, { x: 1, z: 1 }, { x: 3, z: 1 }, [{ x: 2, z: 1, width: 0.05, depth: 0.05 }]), final: segmentClear(w, { x: 2, z: 2 }, { x: 2.4, z: 2 }, [{ x: 2.2, z: 2, width: 0.05, depth: 0.05 }]) }; }, actual => actual.direct === false && actual.final === false);
const compact = { ...base, scenarioLabel: '模拟场景—紧凑障碍', room: { width: 6, depth: 5 }, targetSeats: 2, requiredSeats: 2, obstacles: [{ id: 'cabinet', x: 3, z: 3, width: 0.7, depth: 1.8, height: 1.8 }], searchBudget: { maxAttempts: 20000, maxMs: 5000 } };
await run('compact-fixed-obstacle-search-and-baseline', compact, async parsed => {
  const actualInput = parsed.ok ? parsed.value : null;
  return { parsed, search: actualInput ? searchLayouts(actualInput) : null, baseline: actualInput ? fixedGridBaseline(actualInput) : null };
}, actual => actual.parsed.ok && actual.search?.found === true && actual.search.validation?.status === 'pass' && actual.baseline?.found === true && actual.baseline.validation?.status === 'pass');
const compactSix = { ...base, scenarioLabel: '模拟场景—紧凑固定障碍6座', room: { width: 6, depth: 5 }, targetSeats: 6, requiredSeats: 6, gridSize: 0.2, obstacles: [{ id: 'corner-cabinet', x: 5.55, z: 4.55, width: 0.5, depth: 0.5, height: 1.8 }], searchBudget: { maxAttempts: 30000, maxMs: 10000 }, seed: 'phase06-compact-six-fixed-1' };
await run('compact-fixed-obstacle-six-seat-search-and-baseline', compactSix, async parsed => {
  const actualInput = parsed.ok ? parsed.value : null;
  return { parsed, search: actualInput ? searchLayouts(actualInput) : null, baseline: actualInput ? fixedGridBaseline(actualInput) : null };
}, actual => actual.parsed.ok && actual.search?.found === true && actual.search.layout?.seats.length === 6 && actual.search.validation?.status === 'pass' && actual.baseline?.found === true && actual.baseline.layout?.seats.length === 6 && actual.baseline.validation?.status === 'pass');
const twelve = { ...base, scenarioLabel: '模拟场景—12座上限', room: { width: 12, depth: 10 }, targetSeats: 12, requiredSeats: 12, gridSize: 0.5, searchBudget: { maxAttempts: 50000, maxMs: 10000 } };
await run('twelve-seat-supported-upper-bound', twelve, async parsed => {
  const actualInput = parsed.ok ? parsed.value : null;
  return { parsed, search: actualInput ? searchLayouts(actualInput) : null, baseline: actualInput ? fixedGridBaseline(actualInput) : null };
}, actual => actual.parsed.ok && actual.search?.found === true && actual.search.layout?.seats.length === 12 && actual.search.validation?.status === 'pass' && actual.baseline?.found === true && actual.baseline.layout?.seats.length === 12 && actual.baseline.validation?.status === 'pass');
for (const wall of ['north', 'south', 'east', 'west']) for (const hinge of ['low', 'high']) {
  const input = { ...base, targetSeats: 1, requiredSeats: 1, door: { wall, offset: 1, width: 0.8, swing: 'inward', hinge } };
  const doorLayout = { seats: [{ id: 'door-seat', x: 3, z: 3, orientation: 0 }] };
  await run(`door-${wall}-${hinge}`, input, async parsed => {
    const validation = validateLayout(input, doorLayout);
    const destination = `${out}\\door-${wall}-${hinge}`;
    const exported = parsed.ok && validation.status === 'pass' ? await exportAssets(input, doorLayout, destination) : null;
    const editable = exported ? JSON.parse(await readFile(`${destination}\\editable.json`, 'utf8')) : null;
    const asset = editable ? checkAsset(await readFile(`${destination}\\scene.glb`), input, editable.layout) : null;
    return { parsed, validation, exported, asset, assetDir: destination };
  }, actual => actual.parsed.ok && actual.validation.status === 'pass' && actual.exported?.status === 'pass' && actual.asset?.status === 'pass');
}
const low = { ...base, searchBudget: { maxAttempts: 1, maxMs: 1 } };
await run('low-budget-search-never-false-found', low, async parsed => ({ parsed, result: parsed.ok ? searchLayouts(parsed.value) : null }), actual => actual.parsed.ok && actual.result.found === false && noFalseFound(actual.result));
await run('low-budget-baseline-never-false-found', low, async parsed => ({ parsed, result: parsed.ok ? fixedGridBaseline(parsed.value) : null }), actual => actual.parsed.ok && actual.result.found === false && noFalseFound(actual.result));
const assetDir = `${out}\\raw-default-asset`;
await run('raw-default-asset-export-recheck', { ...base }, async () => {
  const exported = await exportAssets(base, baseLayout, assetDir); const editable = JSON.parse(await readFile(`${assetDir}\\editable.json`, 'utf8'));
  const report = checkAsset(await readFile(`${assetDir}\\scene.glb`), base, editable.layout);
  return { exported, editable, report };
}, actual => actual.exported.status === 'pass' && actual.report.status === 'pass' && actual.editable.input.seatTemplate.entityGap === 0.05);
const report = { test: 'phase06-special-v1', createdAt: new Date().toISOString(), simulatedScenario: true, codeHashes, rows, total: rows.length, passed: rows.filter(x => x.pass).length, failed: rows.filter(x => !x.pass).length };
await writeFile(`${out}\\report.json`, JSON.stringify(report, null, 2), { flag: 'wx' });
await writeFile(`${out}\\inputs-outputs.json`, JSON.stringify(rows, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ out, total: report.total, passed: report.passed, failed: report.failed, report: `${out}\\report.json` }, null, 2));
if (report.failed) process.exitCode = 1;
