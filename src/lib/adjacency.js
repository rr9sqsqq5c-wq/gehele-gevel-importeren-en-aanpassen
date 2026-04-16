const TOL = 25;

export function detectAdjacencies(walls) {
  const adjacencies = [];

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const wa = walls[i];
      const wb = walls[j];
      const woA = wa.wallOrigin;
      const woB = wb.wallOrigin;

      if (!woA || !woB) continue;

      if (woA.thicknessAxis !== woB.thicknessAxis) continue;
      if (Math.abs(woA.thicknessStart - woB.thicknessStart) > TOL) continue;

      if (woA.lengthAxis !== woB.lengthAxis || woA.heightAxis !== woB.heightAxis) continue;

      const aLengthEnd = woA.lengthStart + wa.length;
      const bLengthEnd = woB.lengthStart + wb.length;
      const aHeightEnd = woA.heightStart + wa.height;
      const bHeightEnd = woB.heightStart + wb.height;

      const hOverlap = Math.min(aHeightEnd, bHeightEnd) - Math.max(woA.heightStart, woB.heightStart);
      if (hOverlap < TOL) continue;

      if (Math.abs(aLengthEnd - woB.lengthStart) < TOL) {
        adjacencies.push({ wallIdA: wa.expressID, wallIdB: wb.expressID, direction: 'right' });
      } else if (Math.abs(bLengthEnd - woA.lengthStart) < TOL) {
        adjacencies.push({ wallIdA: wb.expressID, wallIdB: wa.expressID, direction: 'right' });
      }

      const vOverlap = Math.min(aLengthEnd, bLengthEnd) - Math.max(woA.lengthStart, woB.lengthStart);
      if (vOverlap < TOL) continue;

      if (Math.abs(aHeightEnd - woB.heightStart) < TOL) {
        adjacencies.push({ wallIdA: wa.expressID, wallIdB: wb.expressID, direction: 'up' });
      } else if (Math.abs(bHeightEnd - woA.heightStart) < TOL) {
        adjacencies.push({ wallIdA: wb.expressID, wallIdB: wa.expressID, direction: 'up' });
      }
    }
  }

  return adjacencies;
}

export function buildConnectedComponents(walls, adjacencies) {
  const wallIds = walls.map((w) => w.expressID);
  const parent = {};
  wallIds.forEach((id) => { parent[id] = id; });

  function find(id) {
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  }

  function union(a, b) {
    parent[find(a)] = find(b);
  }

  adjacencies.forEach(({ wallIdA, wallIdB }) => {
    union(wallIdA, wallIdB);
  });

  const groups = {};
  wallIds.forEach((id) => {
    const root = find(id);
    if (!groups[root]) groups[root] = [];
    groups[root].push(id);
  });

  return Object.values(groups);
}

export function sortWallsInComponent(wallIds, walls, adjacencies) {
  const wallMap = Object.fromEntries(walls.map((w) => [w.expressID, w]));
  const hAdj = adjacencies.filter((a) => a.direction === 'right');

  if (wallIds.length === 1) return wallIds;

  const successorMap = {};
  hAdj.forEach(({ wallIdA, wallIdB }) => {
    if (wallIds.includes(wallIdA) && wallIds.includes(wallIdB)) {
      successorMap[wallIdA] = wallIdB;
    }
  });

  const hasIncoming = new Set(Object.values(successorMap));
  const starts = wallIds.filter((id) => !hasIncoming.has(id));

  const sorted = [];
  let current = starts[0] ?? wallIds[0];
  const visited = new Set();
  while (current && !visited.has(current)) {
    sorted.push(current);
    visited.add(current);
    current = successorMap[current];
  }

  const remaining = wallIds.filter((id) => !sorted.includes(id));
  return [...sorted, ...remaining];
}

// ─────────────────────────────────────────────
// Agent 2: endpoint-gebaseerde groepering
// ─────────────────────────────────────────────

const DEFAULT_TOLERANCE = 10;

function pointsClose(a, b, tol) {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

function wallsAdjacent(wallA, wallB, tol) {
  const endpoints = [
    [wallA.startPoint, wallB.startPoint],
    [wallA.startPoint, wallB.endPoint],
    [wallA.endPoint,   wallB.startPoint],
    [wallA.endPoint,   wallB.endPoint],
  ];
  return endpoints.some(([p, q]) => pointsClose(p, q, tol));
}

function makeUnionFind(ids) {
  const parent = Object.fromEntries(ids.map(id => [id, id]));
  const rank   = Object.fromEntries(ids.map(id => [id, 0]));
  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(x, y) {
    const rx = find(x); const ry = find(y);
    if (rx === ry) return;
    if (rank[rx] < rank[ry]) { parent[rx] = ry; }
    else if (rank[rx] > rank[ry]) { parent[ry] = rx; }
    else { parent[ry] = rx; rank[rx]++; }
  }
  return { find, union };
}

let _groupCounter = 0;
function newGroupId() { return `group-${++_groupCounter}`; }

export function wallsToGroupFormat(walls) {
  return walls.map(w => {
    const wo = w.wallOrigin;
    const la = wo?.lengthAxis ?? 'x';
    const startPt = {
      x: la === 'x' ? wo.lengthStart : (wo.lengthStart + w.length / 2),
      y: la === 'y' ? wo.lengthStart : (la === 'z' ? wo.heightStart : wo.thicknessStart),
    };
    const endPt = {
      x: la === 'x' ? wo.lengthStart + w.length : startPt.x,
      y: la === 'y' ? wo.lengthStart + w.length : startPt.y,
    };
    return {
      id: String(w.expressID),
      name: w.name ?? `Wand #${w.expressID}`,
      startPoint: startPt,
      endPoint: endPt,
    };
  });
}

export function buildGroups(walls, tolerance = DEFAULT_TOLERANCE) {
  if (walls.length === 0) return [];
  const ids = walls.map(w => w.id);
  const uf  = makeUnionFind(ids);
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      if (wallsAdjacent(walls[i], walls[j], tolerance)) {
        uf.union(walls[i].id, walls[j].id);
      }
    }
  }
  const buckets = new Map();
  for (const id of ids) {
    const root = uf.find(id);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(id);
  }
  const nameMap = Object.fromEntries(walls.map(w => [w.id, w.name]));
  let groupIndex = 1;
  return [...buckets.values()].map(wallIds => ({
    id:      newGroupId(),
    wallIds: wallIds.map(id => Number(id)),
    label:   wallIds.length === 1
               ? `Losstaand — ${nameMap[wallIds[0]]}`
               : `Groep ${groupIndex++} (${wallIds.length} wanden)`,
  }));
}

export function mergeGroups(groups, groupIdA, groupIdB) {
  if (groupIdA === groupIdB) return groups;
  const a = groups.find(g => g.id === groupIdA);
  const b = groups.find(g => g.id === groupIdB);
  if (!a || !b) return groups;
  const merged = {
    id:      newGroupId(),
    wallIds: [...a.wallIds, ...b.wallIds],
    label:   `Samengevoegd (${a.wallIds.length + b.wallIds.length} wanden)`,
  };
  return [...groups.filter(g => g.id !== groupIdA && g.id !== groupIdB), merged];
}

export function splitGroup(groups, groupId, idsToSplit) {
  const original = groups.find(g => g.id === groupId);
  if (!original || idsToSplit.length === 0) return groups;
  const splitSet  = new Set(idsToSplit);
  const remaining = original.wallIds.filter(id => !splitSet.has(id));
  if (remaining.length === 0) return groups;
  const newGroup = {
    id:      newGroupId(),
    wallIds: idsToSplit,
    label:   `Afgesplitst (${idsToSplit.length} wanden)`,
  };
  const updatedOriginal = { ...original, wallIds: remaining, label: `Groep (${remaining.length} wanden)` };
  return groups.map(g => g.id === groupId ? updatedOriginal : g).concat(newGroup);
}

export function renameGroup(groups, groupId, newLabel) {
  return groups.map(g => g.id === groupId ? { ...g, label: newLabel } : g);
}
