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

export async function detectAdjacenciesAsync(walls, onProgress) {
  const adjacencies = [];
  const YIELD_EVERY = 50;

  for (let i = 0; i < walls.length; i++) {
    if (i % YIELD_EVERY === 0 && i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (onProgress) onProgress(i, walls.length);
    }
    const wa = walls[i];
    const woA = wa.wallOrigin;
    if (!woA) continue;

    for (let j = i + 1; j < walls.length; j++) {
      const wb = walls[j];
      const woB = wb.wallOrigin;

      if (!woB) continue;

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
