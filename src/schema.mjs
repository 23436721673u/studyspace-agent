export const SCHEMA_VERSION = 'studyspace.v1';
export const LIMITS = Object.freeze({ maxObstacles: 3, maxSeats: 12, orientations: [0, 90], maxRoomDimension: 100, minGridSize: 0.02, maxGridNodes: 250000, maxSearchAttempts: 200000, maxSearchMs: 30000 });

const isFinitePositive = (value) => Number.isFinite(value) && value > 0;
const issue = (code, path, message, value) => ({ code, path, message, ...(value === undefined ? {} : { value }) });

export function normalizeAndValidate(input) {
  const issues = [];
  if (!input || typeof input !== 'object') return { ok: false, issues: [issue('input.type', '', 'input must be an object')] };
  const room = input.room ?? {};
  for (const key of ['width', 'depth']) if (!isFinitePositive(room[key])) issues.push(issue('room.dimension', `room.${key}`, 'must be a finite positive number', room[key]));
  const door = input.door ?? {};
  if (!['north', 'south', 'east', 'west'].includes(door.wall)) issues.push(issue('door.wall', 'door.wall', 'must be one of north,south,east,west', door.wall));
  if (!Number.isFinite(door.offset) || door.offset < 0) issues.push(issue('door.offset', 'door.offset', 'must be finite and non-negative', door.offset));
  if (!isFinitePositive(door.width)) issues.push(issue('door.dimension', 'door.width', 'must be finite and positive', door.width));
  if (door.hinge !== undefined && !['low', 'high'].includes(door.hinge)) issues.push(issue('door.hinge', 'door.hinge', 'must be low or high', door.hinge));
  if (!['inward'].includes(door.swing)) issues.push(issue('door.swing', 'door.swing', 'V1 requires inward swing', door.swing));
  const obstacles = Array.isArray(input.obstacles) ? input.obstacles : [];
  if (!Array.isArray(input.obstacles)) issues.push(issue('obstacles.type', 'obstacles', 'must be an array'));
  if (obstacles.length > LIMITS.maxObstacles) issues.push(issue('obstacles.count', 'obstacles', 'maximum is 3', obstacles.length));
  obstacles.forEach((o, i) => {
    if (!o || typeof o !== 'object') { issues.push(issue('obstacle.type', `obstacles[${i}]`, 'obstacle must be an object', o)); return; }
    for (const key of ['x', 'z', 'width', 'depth', 'height']) if (!Number.isFinite(o?.[key])) issues.push(issue('obstacle.number', `obstacles[${i}].${key}`, 'must be finite', o?.[key]));
    for (const key of ['width', 'depth', 'height']) if (Number.isFinite(o?.[key]) && o[key] <= 0) issues.push(issue('obstacle.dimension', `obstacles[${i}].${key}`, 'must be positive', o[key]));
  });
  const t = input.seatTemplate ?? {};
  for (const key of ['tableWidth', 'tableDepth', 'tableHeight', 'chairWidth', 'chairDepth', 'chairClearance', 'approachWidth']) if (!isFinitePositive(t[key])) issues.push(issue('template.dimension', `seatTemplate.${key}`, 'must be finite and positive', t[key]));
  if (t.entityGap !== undefined && (!Number.isFinite(t.entityGap) || t.entityGap < 0 || t.entityGap > 0.5)) issues.push(issue('template.entityGap', 'seatTemplate.entityGap', 'must be finite in [0,0.5]', t.entityGap));
  const requestedOrientations = input.orientations ?? [0, 90];
  if (!Array.isArray(requestedOrientations) || requestedOrientations.length < 1 || requestedOrientations.some(o => !LIMITS.orientations.includes(o))) issues.push(issue('constraint.orientations', 'orientations', 'must contain only 0 and/or 90', requestedOrientations));
  const targetSeats = input.targetSeats;
  if (!Number.isInteger(targetSeats) || targetSeats < 1 || targetSeats > LIMITS.maxSeats) issues.push(issue('seats.count', 'targetSeats', 'must be an integer from 1 to 12', targetSeats));
  if (input.requiredSeats !== undefined && (!Number.isInteger(input.requiredSeats) || input.requiredSeats < 1 || input.requiredSeats > LIMITS.maxSeats)) issues.push(issue('seats.required', 'requiredSeats', 'must be an integer from 1 to 12', input.requiredSeats));
  if (Number.isInteger(targetSeats) && Number.isInteger(input.requiredSeats) && input.requiredSeats > targetSeats) issues.push(issue('seats.relation', 'requiredSeats', 'V1 hard target requires requiredSeats <= targetSeats', { requiredSeats: input.requiredSeats, targetSeats }));
  for (const key of ['passageWidth', 'gridSize']) if (!isFinitePositive(input[key])) issues.push(issue('constraint.number', key, 'must be finite and positive', input[key]));
  if (Number.isFinite(room.width) && room.width > LIMITS.maxRoomDimension) issues.push(issue('room.limit', 'room.width', 'room dimension exceeds resource limit', room.width));
  if (Number.isFinite(room.depth) && room.depth > LIMITS.maxRoomDimension) issues.push(issue('room.limit', 'room.depth', 'room dimension exceeds resource limit', room.depth));
  if (Number.isFinite(input.gridSize) && input.gridSize < LIMITS.minGridSize) issues.push(issue('constraint.grid.limit', 'gridSize', 'gridSize is below resource limit', input.gridSize));
  if (Number.isFinite(room.width) && Number.isFinite(room.depth) && Number.isFinite(input.gridSize) && (Math.ceil(room.width / input.gridSize) + 1) * (Math.ceil(room.depth / input.gridSize) + 1) > LIMITS.maxGridNodes) issues.push(issue('constraint.grid.nodes', 'gridSize', 'grid would exceed node resource limit', input.gridSize));
  if (!Number.isFinite(input.tolerance) || input.tolerance < 0 || input.tolerance > 0.01) issues.push(issue('constraint.tolerance', 'tolerance', 'must be finite in [0,0.01]', input.tolerance));
  const normalized = {
    schemaVersion: SCHEMA_VERSION, scenarioLabel: String(input.scenarioLabel ?? '模拟场景'), userRequest: String(input.userRequest ?? ''),
    room: { width: Number(room.width), depth: Number(room.depth) },
    door: { wall: door.wall, offset: Number(door.offset), width: Number(door.width), swing: door.swing, hinge: door.hinge ?? 'low' },
    obstacles: obstacles.filter(o => o && typeof o === 'object').map((o, i) => ({ id: String(o.id ?? `obstacle-${i + 1}`), x: Number(o.x), z: Number(o.z), width: Number(o.width), depth: Number(o.depth), height: Number(o.height) })),
    seatTemplate: { ...Object.fromEntries(['tableWidth','tableDepth','tableHeight','chairWidth','chairDepth','chairClearance','approachWidth'].map(k => [k, Number(t[k])])), entityGap: Number(t.entityGap ?? 0.05) },
    targetSeats: Number(targetSeats), requiredSeats: Number(input.requiredSeats ?? targetSeats), orientations: [...new Set(requestedOrientations)].sort((a,b)=>a-b), passageWidth: Number(input.passageWidth), gridSize: Number(input.gridSize), tolerance: Number(input.tolerance), seed: String(input.seed ?? 'fixed-demo'), searchBudget: { maxAttempts: Number(input.searchBudget?.maxAttempts ?? 5000), maxMs: Number(input.searchBudget?.maxMs ?? 5000) }
  };
  if (!Number.isInteger(normalized.searchBudget.maxAttempts) || normalized.searchBudget.maxAttempts < 1 || normalized.searchBudget.maxAttempts > LIMITS.maxSearchAttempts) issues.push(issue('search.budget', 'searchBudget.maxAttempts', 'must be a positive integer within resource limit', normalized.searchBudget.maxAttempts));
  if (!Number.isFinite(normalized.searchBudget.maxMs) || normalized.searchBudget.maxMs < 1 || normalized.searchBudget.maxMs > LIMITS.maxSearchMs) issues.push(issue('search.budget', 'searchBudget.maxMs', 'must be a finite millisecond budget within resource limit', normalized.searchBudget.maxMs));
  if (Number.isFinite(normalized.door.offset) && Number.isFinite(normalized.door.width) && Number.isFinite(normalized.room.width) && ['north','south'].includes(normalized.door.wall) && normalized.door.offset + normalized.door.width > normalized.room.width + normalized.tolerance) issues.push(issue('door.bounds', 'door', 'door exceeds wall length', normalized.door));
  if (Number.isFinite(normalized.door.offset) && Number.isFinite(normalized.door.width) && Number.isFinite(normalized.room.depth) && ['east','west'].includes(normalized.door.wall) && normalized.door.offset + normalized.door.width > normalized.room.depth + normalized.tolerance) issues.push(issue('door.bounds', 'door', 'door exceeds wall length', normalized.door));
  for (const o of normalized.obstacles) if (Number.isFinite(normalized.room.width) && Number.isFinite(normalized.room.depth) && (o.x - o.width / 2 < -normalized.tolerance || o.z - o.depth / 2 < -normalized.tolerance || o.x + o.width / 2 > normalized.room.width + normalized.tolerance || o.z + o.depth / 2 > normalized.room.depth + normalized.tolerance)) issues.push(issue('obstacle.bounds', o.id, 'obstacle exceeds room bounds', o));
  return issues.length ? { ok: false, issues, normalized } : { ok: true, value: normalized };
}
