import { bounds, buildDoorKeepout, buildOccupancy, containsRect, doorEntry, rect, rectOverlap } from './geometry.mjs';
import { normalizeAndValidate } from './schema.mjs';
import { findRoute } from './routing.mjs';
const issue = (code, objectId, message, details = {}) => ({ code, objectId, message, ...details });
const obstacleRect = o => rect(o.x, o.z, o.width, o.depth, o.id, 'obstacle');

export function validateLayout(input, layout, options = {}) {
  const parsed = normalizeAndValidate(input); if (!parsed.ok) return { status: 'fail', source: 'independent-validator', issues: parsed.issues, checks: {} };
  const w = { ...parsed.value, _deadline: options.deadline ?? null }; const issues = []; const checks = {}; const seats = Array.isArray(layout?.seats) ? layout.seats : [];
  if (w.requiredSeats > w.targetSeats) issues.push(issue('seats.relation', 'input', 'requiredSeats cannot exceed targetSeats'));
  const allowedOrientations = new Set(w.orientations);
  if (seats.length !== w.targetSeats) issues.push(issue('seat.count', 'layout', `expected ${w.targetSeats} seats, got ${seats.length}`));
  const ids = new Set(); const occupied = []; const doorZone = buildDoorKeepout(w); const obstacles = w.obstacles.map(obstacleRect);
  for (const seat of seats) {
    if (!seat || !Number.isFinite(seat.x) || !Number.isFinite(seat.z)) { issues.push(issue('seat.coordinate', seat?.id ?? 'unknown', 'seat coordinates must be finite')); continue; }
    if (!seat.id || ids.has(seat.id)) issues.push(issue('seat.id', seat.id ?? 'missing', 'seat id must be unique')); ids.add(seat.id);
    if (![0, 90].includes(seat.orientation)) { issues.push(issue('seat.orientation', seat.id, 'orientation must be 0 or 90')); continue; }
    if (!allowedOrientations.has(seat.orientation)) { issues.push(issue('seat.orientation.not-allowed', seat.id, `orientation ${seat.orientation} is not allowed by input`, { allowed: w.orientations })); continue; }
    const geo = buildOccupancy(w, seat); occupied.push({ seat, geo });
    for (const part of geo.all) { if (!containsRect(w.room, part, w.tolerance)) issues.push(issue('out-of-bounds', part.id, 'occupancy leaves room bounds', { bounds: bounds(part) })); for (const obstacle of obstacles) if (rectOverlap(part, obstacle, w.tolerance)) issues.push(issue('obstacle-overlap', part.id, `overlaps ${obstacle.id}`)); if (rectOverlap(part, doorZone, w.tolerance)) issues.push(issue('door-keepout', part.id, 'enters conservative rectangular door swing keepout')); }
  }
  for (let i = 0; i < occupied.length; i++) for (let j = 0; j < i; j++) for (const a of occupied[i].geo.all) for (const b of occupied[j].geo.all) if (rectOverlap(a, b, w.tolerance)) issues.push(issue('overlap', a.id, `overlaps ${b.id}`));
  for (let i = 0; i < obstacles.length; i++) for (let j = 0; j < i; j++) if (rectOverlap(obstacles[i], obstacles[j], w.tolerance)) issues.push(issue('obstacle-overlap', obstacles[i].id, `overlaps ${obstacles[j].id}`));
  if (w.door.width + w.tolerance < w.passageWidth) issues.push(issue('door-width', 'door', 'door width is less than required passage width', { doorWidth: w.door.width, passageWidth: w.passageWidth }));
  const forbiddenBase = [...obstacles, ...occupied.flatMap(x => x.geo.entities)];
  const seatReports = occupied.map(({ seat, geo }) => { const forbidden = forbiddenBase; const result = findRoute(w, doorEntry(w), geo.routeTarget, forbidden); if (!result.reachable) issues.push(issue('unreachable', seat.id, result.reason)); return { id: seat.id, status: result.reachable ? 'pass' : 'fail', ...result, target: geo.routeTarget }; });
  checks.seats = { status: seats.length === w.targetSeats && seats.length >= w.requiredSeats ? 'pass' : 'fail', accepted: seats.length, targetSeats: w.targetSeats, requiredSeats: w.requiredSeats, semantics: 'V1 targetSeats is exact; requiredSeats is a minimum and must not exceed targetSeats' };
  checks.geometry = { status: issues.some(x => ['out-of-bounds','overlap','obstacle-overlap','door-keepout'].includes(x.code)) ? 'fail' : 'pass', doorKeepout: doorZone, doorKeepoutModel: 'conservative rectangular approximation of inward swing; not an exact arc' };
  checks.access = { status: seatReports.every(x => x.status === 'pass') && w.door.width >= w.passageWidth ? 'pass' : 'fail', seatReports, gridSize: w.gridSize, requiredWidth: w.passageWidth, pathBodyRadius: w.passageWidth / 2 };
  return { status: issues.length ? 'fail' : 'pass', source: 'independent-validator', checks, issues, parameters: { tolerance: w.tolerance, gridSize: w.gridSize, passageWidth: w.passageWidth } };
}
