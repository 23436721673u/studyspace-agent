export function rect(x, z, width, depth, id, kind = 'geometry') { return { x, z, width, depth, id, kind }; }
export function bounds(r) { return { minX: r.x - r.width / 2, maxX: r.x + r.width / 2, minZ: r.z - r.depth / 2, maxZ: r.z + r.depth / 2 }; }
export function rectOverlap(a, b, tolerance = 1e-6) { const A = bounds(a), B = bounds(b); return A.minX < B.maxX - tolerance && A.maxX > B.minX + tolerance && A.minZ < B.maxZ - tolerance && A.maxZ > B.minZ + tolerance; }
export function containsRect(room, r, tolerance = 1e-6) { const b = bounds(r); return b.minX >= -tolerance && b.minZ >= -tolerance && b.maxX <= room.width + tolerance && b.maxZ <= room.depth + tolerance; }
export function rotateSize(w, d, orientation) { return orientation === 90 ? { width: d, depth: w } : { width: w, depth: d }; }
export function buildOccupancy(workspace, seat) {
  const t = workspace.seatTemplate; const table = rotateSize(t.tableWidth, t.tableDepth, seat.orientation); const chair = rotateSize(t.chairWidth, t.chairDepth, seat.orientation); const gap = t.entityGap;
  const outward = seat.orientation === 0 ? { x: 0, z: -(table.depth / 2 + gap + chair.depth / 2) } : { x: -(table.width / 2 + gap + chair.width / 2), z: 0 };
  const chairRect = rect(seat.x + outward.x, seat.z + outward.z, chair.width, chair.depth, `${seat.id}:chair`, 'chair');
  const useSize = seat.orientation === 0 ? { width: Math.max(t.approachWidth, workspace.passageWidth), depth: Math.max(t.chairClearance, workspace.passageWidth) } : { width: Math.max(t.chairClearance, workspace.passageWidth), depth: Math.max(t.approachWidth, workspace.passageWidth) };
  const useOffset = seat.orientation === 0 ? { x: chairRect.x, z: chairRect.z - chair.depth / 2 - useSize.depth / 2 } : { x: chairRect.x - chair.width / 2 - useSize.width / 2, z: chairRect.z };
  const use = rect(useOffset.x, useOffset.z, useSize.width, useSize.depth, `${seat.id}:use`, 'use');
  const tableRect = rect(seat.x, seat.z, table.width, table.depth, `${seat.id}:table`, 'table');
  return { table: tableRect, chair: chairRect, use, approach: use, all: [tableRect, chairRect, use], entities: [tableRect, chairRect], routeTarget: { x: use.x, z: use.z }, clearance: t.chairClearance, entityGap: gap };
}
export function buildDoorKeepout(workspace) { const { room, door } = workspace; const w = door.width; const depth = w; if (door.wall === 'south') return rect(door.offset + w / 2, depth / 2, w, depth, 'door:keepout', 'door'); if (door.wall === 'north') return rect(door.offset + w / 2, room.depth - depth / 2, w, depth, 'door:keepout', 'door'); if (door.wall === 'west') return rect(depth / 2, door.offset + w / 2, depth, w, 'door:keepout', 'door'); return rect(room.width - depth / 2, door.offset + w / 2, depth, w, 'door:keepout', 'door'); }
export function doorEntry(workspace) { const { room, door } = workspace; const inset = workspace.passageWidth / 2; if (door.wall === 'south') return { x: door.offset + door.width / 2, z: inset }; if (door.wall === 'north') return { x: door.offset + door.width / 2, z: room.depth - inset }; if (door.wall === 'west') return { x: inset, z: door.offset + door.width / 2 }; return { x: room.width - inset, z: door.offset + door.width / 2 }; }
