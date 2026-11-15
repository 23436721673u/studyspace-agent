import { buildOccupancy, rectOverlap } from './geometry.mjs';
import { validateLayout } from './validator.mjs';

export function fixedGridBaseline(workspace, options = {}) {
  const started = performance.now(), budget = options.maxAttempts ?? workspace.searchBudget.maxAttempts;
  const maxMs = options.maxMs ?? workspace.searchBudget.maxMs, deadline = started + maxMs;
  const seats = []; let attempts = 0, termination = 'candidate space ended';
  const step = workspace.gridSize;
  outer: for (let z = step; z < workspace.room.depth; z += step) for (let x = step; x < workspace.room.width; x += step) for (const orientation of workspace.orientations) {
    if (attempts >= budget) { termination = 'baseline attempt budget exhausted'; break outer; }
    if (performance.now() >= deadline) { termination = 'baseline time budget exhausted'; break outer; }
    attempts++;
    const candidate = { id: `baseline-seat-${seats.length + 1}`, x: Number(x.toFixed(6)), z: Number(z.toFixed(6)), orientation };
    const g = buildOccupancy(workspace, candidate);
    if (seats.some(s => { const prior = buildOccupancy(workspace, s); return g.all.some(a => prior.all.some(b => rectOverlap(a, b, workspace.tolerance))); })) continue;
    const trial = { seats: [...seats, candidate] };
    const partialWorkspace = { ...workspace, targetSeats: trial.seats.length, requiredSeats: trial.seats.length };
    const partialValidation = validateLayout(partialWorkspace, trial, { deadline });
    if (partialValidation.status === 'pass') seats.push(candidate);
    if (seats.length >= workspace.targetSeats) {
      const finalValidation = validateLayout(workspace, { seats }, { deadline });
      if (finalValidation.status === 'pass') return { found: true, status: 'found', attempts, budget, maxMs, elapsedMs: performance.now() - started, layout: { layoutId: 'fixed-grid-baseline', seats }, validation: finalValidation, termination: 'validated candidate found' };
      if (performance.now() >= deadline) { termination = 'baseline time budget exhausted during final validation'; break outer; }
      seats.pop();
    }
  }
  if (attempts >= budget && termination === 'candidate space ended') termination = 'baseline attempt budget exhausted';
  return { found: false, status: 'budget-exhausted-or-candidates-ended', attempts, budget, maxMs, elapsedMs: performance.now() - started, termination, validation: { status: 'not-found-within-budget', finalTargetSeats: workspace.targetSeats, finalRequiredSeats: workspace.requiredSeats }, note: 'Baseline did not find a candidate within its finite budget; this is not a proof of impossibility.' };
}
