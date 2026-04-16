/**
 * src/lib/adjacency.js  —  Agent 2: aangrenzendheid & groepering
 *
 * Publieke API:
 *   detectAdjacency(walls)           → adjacency-matrix  (Map<id, Set<id>>)
 *   buildGroups(walls, tolerance?)   → WallGroup[]
 *   mergeGroups(groups, a, b)        → WallGroup[]   (handmatig samenvoegen)
 *   splitGroup(groups, groupId, ids) → WallGroup[]   (handmatig splitsen)
 */

/**
 * @typedef {{ id: string, name: string, startPoint: {x:number,y:number}, endPoint: {x:number,y:number} }} Wall
 * @typedef {{ id: string, wallIds: string[], label: string }} WallGroup
 */

const DEFAULT_TOLERANCE = 0.01;

// ─────────────────────────────────────────────
// Intern: punt-vergelijking
// ─────────────────────────────────────────────

/**
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {number} tol
 */
function pointsClose(a, b, tol) {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

/**
 * Twee wanden zijn aangrenzend als één van hun vier eindpunt-combinaties
 * binnen de tolerantie valt.
 *
 * @param {Wall} wallA
 * @param {Wall} wallB
 * @param {number} tol
 */
function wallsAdjacent(wallA, wallB, tol) {
  const endpoints = [
    [wallA.startPoint, wallB.startPoint],
    [wallA.startPoint, wallB.endPoint],
    [wallA.endPoint,   wallB.startPoint],
    [wallA.endPoint,   wallB.endPoint]
  ];
  return endpoints.some(([p, q]) => pointsClose(p, q, tol));
}

// ─────────────────────────────────────────────
// Intern: Union-Find (disjoint set)
// ─────────────────────────────────────────────

function makeUnionFind(ids) {
  const parent = Object.fromEntries(ids.map(id => [id, id]));
  const rank   = Object.fromEntries(ids.map(id => [id, 0]));

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(x, y) {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return;
    if (rank[rx] < rank[ry]) { parent[rx] = ry; }
    else if (rank[rx] > rank[ry]) { parent[ry] = rx; }
    else { parent[ry] = rx; rank[rx]++; }
  }

  return { find, union };
}

// ─────────────────────────────────────────────
// Publieke functies
// ─────────────────────────────────────────────

/**
 * Bereken voor elke wand welke andere wanden er direct aan grenzen.
 *
 * @param {Wall[]} walls
 * @param {number} [tolerance]
 * @returns {Map<string, Set<string>>}
 */
export function detectAdjacency(walls, tolerance = DEFAULT_TOLERANCE) {
  const adj = new Map(walls.map(w => [w.id, new Set()]));

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      if (wallsAdjacent(walls[i], walls[j], tolerance)) {
        adj.get(walls[i].id).add(walls[j].id);
        adj.get(walls[j].id).add(walls[i].id);
      }
    }
  }

  return adj;
}

let _groupCounter = 0;
function newGroupId() { return `group-${++_groupCounter}`; }

/**
 * Groepeer wanden automatisch op basis van aangrenzendheid.
 * Verbonden wanden vormen één groep; losstaande wanden krijgen een eigen groep.
 *
 * @param {Wall[]} walls
 * @param {number} [tolerance]
 * @returns {WallGroup[]}
 */
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
    wallIds,
    label:   wallIds.length === 1
               ? `Losstaand — ${nameMap[wallIds[0]]}`
               : `Groep ${groupIndex++} (${wallIds.length} wanden)`
  }));
}

/**
 * Voeg twee groepen handmatig samen tot één.
 *
 * @param {WallGroup[]} groups
 * @param {string} groupIdA
 * @param {string} groupIdB
 * @returns {WallGroup[]}
 */
export function mergeGroups(groups, groupIdA, groupIdB) {
  if (groupIdA === groupIdB) return groups;

  const a = groups.find(g => g.id === groupIdA);
  const b = groups.find(g => g.id === groupIdB);
  if (!a || !b) return groups;

  const merged = {
    id:      newGroupId(),
    wallIds: [...a.wallIds, ...b.wallIds],
    label:   `Samengevoegde groep (${a.wallIds.length + b.wallIds.length} wanden)`
  };

  return [...groups.filter(g => g.id !== groupIdA && g.id !== groupIdB), merged];
}

/**
 * Splits een groep: de opgegeven wand-IDs vormen een nieuwe groep,
 * de rest blijft in de originele groep.
 *
 * @param {WallGroup[]} groups
 * @param {string} groupId        – groep om te splitsen
 * @param {string[]} idsToSplit   – wand-IDs die naar de nieuwe groep gaan
 * @returns {WallGroup[]}
 */
export function splitGroup(groups, groupId, idsToSplit) {
  const original = groups.find(g => g.id === groupId);
  if (!original || idsToSplit.length === 0) return groups;

  const splitSet   = new Set(idsToSplit);
  const remaining  = original.wallIds.filter(id => !splitSet.has(id));

  if (remaining.length === 0) return groups;

  const newGroup = {
    id:      newGroupId(),
    wallIds: idsToSplit,
    label:   `Afgesplitste groep (${idsToSplit.length} wanden)`
  };

  const updatedOriginal = {
    ...original,
    wallIds: remaining,
    label:   `Groep (${remaining.length} wanden)`
  };

  return groups.map(g => g.id === groupId ? updatedOriginal : g).concat(newGroup);
}

/**
 * Hernoem de label van een groep.
 *
 * @param {WallGroup[]} groups
 * @param {string} groupId
 * @param {string} newLabel
 * @returns {WallGroup[]}
 */
export function renameGroup(groups, groupId, newLabel) {
  return groups.map(g => g.id === groupId ? { ...g, label: newLabel } : g);
}
