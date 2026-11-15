import { buildDoorKeepout, buildOccupancy, containsRect, rectOverlap } from './geometry.mjs';
import { validateLayout } from './validator.mjs';
function candidates(w) { const out = []; for (let orientation of w.orientations) for (let z = w.gridSize; z <= w.room.depth - w.gridSize; z += w.gridSize) for (let x = w.gridSize; x <= w.room.width - w.gridSize; x += w.gridSize) out.push({ x: Number(x.toFixed(6)), z: Number(z.toFixed(6)), orientation }); return out; }
function canAdd(w, selected, seat) { if (!w.orientations.includes(seat.orientation)) return false; const g = buildOccupancy(w, seat); const forbidden = [buildDoorKeepout(w), ...w.obstacles.map(o => ({ x: o.x, z: o.z, width: o.width, depth: o.depth }))]; if (g.all.some(p => !containsRect(w.room, p, w.tolerance) || forbidden.some(f => rectOverlap(p, f, w.tolerance)))) return false; return selected.every(s => { const prior = buildOccupancy(w, s); return g.all.every(a => prior.all.every(b => !rectOverlap(a, b, w.tolerance))); }); }
export function searchLayouts(workspaceInput, options = {}) {
  const started = performance.now(), budget = options.maxAttempts ?? workspaceInput.searchBudget.maxAttempts;
  const maxMs = options.maxMs ?? workspaceInput.searchBudget.maxMs, deadline = started + maxMs;
  const list = candidates(workspaceInput), selected = []; let attempts = 0, termination = 'candidate space ended';
  for (const c of list) {
    if (attempts >= budget) { termination = 'search attempt budget exhausted'; break; }
    if (performance.now() >= deadline) { termination = 'search time budget exhausted'; break; }
    attempts++; const seat = { id: `seat-${selected.length + 1}`, ...c };
    if (!canAdd(workspaceInput, selected, seat)) continue;
    selected.push(seat);
    if (selected.length >= workspaceInput.targetSeats) {
      const validation = validateLayout(workspaceInput, { seats: selected }, { deadline });
      if (validation.status === 'pass') return { found: true, status: 'found', attempts, budget, maxMs, elapsedMs: performance.now() - started, layout: { layoutId: `search-${workspaceInput.seed}`, seats: selected }, validation, termination: 'validated candidate found' };
      selected.pop();
      if (performance.now() >= deadline) { termination = 'search time budget exhausted during validation'; break; }
    }
  }
  if (attempts >= budget && termination === 'candidate space ended') termination = 'search attempt budget exhausted';
  return { found: false, status: 'budget-exhausted-or-candidates-ended', attempts, budget, maxMs, elapsedMs: performance.now() - started, termination, note: 'No candidate was found within this finite search; this is not a proof of impossibility.' };
}
