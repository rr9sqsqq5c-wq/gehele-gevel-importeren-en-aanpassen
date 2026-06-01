/**
 * Phase 1.5 — Adapter contract smoke test
 *
 * Run with: node src/lib/__tests__/adapterSmokeTest.js
 *
 * Coordinate system:
 *   X_NEG90 model orientation (standard Revit IFC export):
 *     Three.js X = IFC X
 *     Three.js Y = IFC Z  (height)
 *     Three.js Z = -IFC Y
 *
 * Three WallPlane objects:
 *   Wall 1: HSB_272.5  — lengthAxis='y', 2 semantic windows
 *   Wall 2: HSB_182.5  — lengthAxis='y', 2 inherited windows (co-located with wall 1)
 *   Wall 3: Kopsegevel — lengthAxis='x', 1 semantic window
 */

import { adaptWallPlanesToBrickBoard } from '../ifcAdapter.js';

// ---------------------------------------------------------------------------
// Helper: build a simple rectangular PolygonRing in (u,v)
// ---------------------------------------------------------------------------
function ring(pts) { return { points: pts }; }

function bbox2D(minU, maxU, minV, maxV) {
  return { minU, maxU, minV, maxV, widthU: maxU - minU, heightV: maxV - minV };
}

// ---------------------------------------------------------------------------
// WALL 1 — HSB_272.5 — lengthAxis='y'
//
// IFC space (mm):
//   lengthAxis  Y : 1000 → 7000   (length 6000mm)
//   heightAxis  Z : 0    → 2700   (height 2700mm)
//   thicknessAxis X: 500 → 772    (thickness 272mm, exterior face at min-X)
//   worldNormal IFC: {x:-1, y:0, z:0}  → exterior faces negative IFC X
//
// Three.js world space (m):
//   x: [0.500, 0.772]
//   y: [0.000, 2.700]
//   z: [-7.000, -1.000]   (IFC Y=1000mm → z=-1.000m,  IFC Y=7000mm → z=-7.000m)
//   worldNormal: {x:-1, y:0, z:0}
//
// localFrame:
//   centroid : {x:0.636, y:1.350, z:-4.000}
//   uAxis    : cross({0,1,0},{-1,0,0}) = {0,0,1}
//   vAxis    : {0,1,0}
//   normal   : {x:-1, y:0, z:0}
//
// uAxisSign = -uAxis.z = -1 → MIRROR formula
//
// Opening 1 (semantic window):
//   IFC: x=1500 from start (IFC Y 2500→3700), y=900, w=1200, h=1350
//   Three.js z: -2.500 → -3.700
//   local u: 1.500 → 0.300   (decreasing with IFC Y due to mirror)
//   local v: -0.450 → 0.900
//   MIRROR check: x = (3.000 - 1.500) × 1000 = 1500mm ✓
//
// Opening 2 (semantic window):
//   IFC: x=4500 from start (IFC Y 5500→6700), y=900, w=1200, h=1350
//   Three.js z: -5.500 → -6.700
//   local u: -1.500 → -2.700
//   MIRROR check: x = (3.000 - (-1.500)) × 1000 = 4500mm ✓
// ---------------------------------------------------------------------------
const wall1_opening1 = {
  openingId: 'opening-0',
  type: 'window',
  source: 'semantic',
  boundary2D: ring([
    { u: 1.500, v: -0.450 },
    { u: 0.300, v: -0.450 },
    { u: 0.300, v:  0.900 },
    { u: 1.500, v:  0.900 },
  ]),
  bbox2D: bbox2D(0.300, 1.500, -0.450, 0.900),
  areaM2: 1.200 * 1.350,
  bottomHeightM: 0.900,
  topHeightM: 2.250,
  isFullHeight: false,
};

const wall1_opening2 = {
  openingId: 'opening-1',
  type: 'window',
  source: 'semantic',
  boundary2D: ring([
    { u: -1.500, v: -0.450 },
    { u: -2.700, v: -0.450 },
    { u: -2.700, v:  0.900 },
    { u: -1.500, v:  0.900 },
  ]),
  bbox2D: bbox2D(-2.700, -1.500, -0.450, 0.900),
  areaM2: 1.200 * 1.350,
  bottomHeightM: 0.900,
  topHeightM: 2.250,
  isFullHeight: false,
};

const wall1 = {
  planeId: 'plane-001',
  sourceIfcModelId: 'model-0',
  sourceFileName: 'test.ifc',
  sourceMeshIds: [371040],
  worldNormal: { x: -1, y: 0, z: 0 },
  planeEquation: { normal: { x: -1, y: 0, z: 0 }, d: -0.636 },
  localFrame: {
    origin: { x: 0.636, y: 1.350, z: -4.000 },
    uAxis:  { x: 0, y: 0, z: 1 },
    vAxis:  { x: 0, y: 1, z: 0 },
    normal: { x: -1, y: 0, z: 0 },
    planeEquationD: -0.636,
  },
  outerBoundary: ring([
    { u: -3.000, v: -1.350 },
    { u:  3.000, v: -1.350 },
    { u:  3.000, v:  1.350 },
    { u: -3.000, v:  1.350 },
  ]),
  holes: [],
  openings: [wall1_opening1, wall1_opening2],
  projectedVertices2D: [],
  sourceTriangleCount: 12,
  areaM2: 6.0 * 2.7,
  widthM: 6.0,
  heightM: 2.7,
  bbox: {
    min:    { x: 0.500, y: 0.000, z: -7.000 },
    max:    { x: 0.772, y: 2.700, z: -1.000 },
    center: { x: 0.636, y: 1.350, z: -4.000 },
  },
  isExterior: true,
  boundarySource: 'topology',
  semanticHint: null,
};

// ---------------------------------------------------------------------------
// WALL 2 — HSB_182.5 — inherited openings (co-located with wall 1)
//
// IFC space (mm):
//   Same Y/Z range as wall 1; X: 772 → 954 (inner layer, 182mm)
//   worldNormal same: {x:-1, y:0, z:0}
//   resolvedOutside: dir=-1, outsidePos=thicknessStart=772mm
//     (this inner layer's "exterior" face touches wall 1's interior face)
//
// Three.js bbox: x=[0.772, 0.954], y=[0,2.700], z=[-7.000,-1.000]
// centroid: {x:0.863, y:1.350, z:-4.000}
// uAxis/vAxis: same as wall 1 (same normal)
//
// Inherited openings: same u,v coords (origins share same y,z)
// Expected adapter output:
//   opening.x = 1500mm, 4500mm (same as wall 1 because same u coords)
//   opening._source = 'inherited'
// ---------------------------------------------------------------------------
const wall2_inh1 = {
  openingId: 'opening-0-inh-plane-001',
  type: 'window',
  source: 'inherited',
  boundary2D: ring([
    { u: 1.500, v: -0.450 },
    { u: 0.300, v: -0.450 },
    { u: 0.300, v:  0.900 },
    { u: 1.500, v:  0.900 },
  ]),
  bbox2D: bbox2D(0.300, 1.500, -0.450, 0.900),
  areaM2: 1.200 * 1.350,
  bottomHeightM: 0.900,
  topHeightM: 2.250,
  isFullHeight: false,
};

const wall2_inh2 = {
  openingId: 'opening-1-inh-plane-001',
  type: 'window',
  source: 'inherited',
  boundary2D: ring([
    { u: -1.500, v: -0.450 },
    { u: -2.700, v: -0.450 },
    { u: -2.700, v:  0.900 },
    { u: -1.500, v:  0.900 },
  ]),
  bbox2D: bbox2D(-2.700, -1.500, -0.450, 0.900),
  areaM2: 1.200 * 1.350,
  bottomHeightM: 0.900,
  topHeightM: 2.250,
  isFullHeight: false,
};

const wall2 = {
  planeId: 'plane-002',
  sourceIfcModelId: 'model-0',
  sourceFileName: 'test.ifc',
  sourceMeshIds: [119751],
  worldNormal: { x: -1, y: 0, z: 0 },
  planeEquation: { normal: { x: -1, y: 0, z: 0 }, d: -0.863 },
  localFrame: {
    origin: { x: 0.863, y: 1.350, z: -4.000 },
    uAxis:  { x: 0, y: 0, z: 1 },
    vAxis:  { x: 0, y: 1, z: 0 },
    normal: { x: -1, y: 0, z: 0 },
    planeEquationD: -0.863,
  },
  outerBoundary: ring([
    { u: -3.000, v: -1.350 },
    { u:  3.000, v: -1.350 },
    { u:  3.000, v:  1.350 },
    { u: -3.000, v:  1.350 },
  ]),
  holes: [],
  openings: [wall2_inh1, wall2_inh2],
  projectedVertices2D: [],
  sourceTriangleCount: 12,
  areaM2: 6.0 * 2.7,
  widthM: 6.0,
  heightM: 2.7,
  bbox: {
    min:    { x: 0.772, y: 0.000, z: -7.000 },
    max:    { x: 0.954, y: 2.700, z: -1.000 },
    center: { x: 0.863, y: 1.350, z: -4.000 },
  },
  isExterior: true,
  boundarySource: 'topology',
  semanticHint: null,
};

// ---------------------------------------------------------------------------
// WALL 3 — Kopsegevel — lengthAxis='x'
//
// IFC space (mm):
//   lengthAxis  X: 500  → 6500  (length 6000mm)
//   heightAxis  Z: 0    → 2700  (height 2700mm)
//   thicknessAxis Y: 0  → 258   (thickness 258mm ≈ 257.5mm kopsegevel)
//   worldNormal IFC: {x:0, y:+1, z:0} → exterior faces positive IFC Y
//
// Three.js world space (m):
//   x: [0.500, 6.500]
//   y: [0.000, 2.700]
//   z: [-0.258, 0.000]   (IFC Y=0 → z=0, IFC Y=258mm → z=-0.258m)
//   worldNormal: {x:0, y:0, z:-1}  (IFC Y+ → Three.js Z-)
//
// localFrame:
//   centroid : {x:3.500, y:1.350, z:-0.129}
//   uAxis    : cross({0,1,0},{0,0,-1}) = {-1,0,0}
//   vAxis    : {0,1,0}
//
// uAxisSign = uAxis.x = -1 → MIRROR formula
//
// Opening (semantic window):
//   IFC: X=1500→2700 (x=1000mm from start at X=500, w=1200), Z=900→2250 (y=900, h=1350)
//   Three.js: x=[1.500,2.700], y=[0.900,2.250]
//   local u: -(x-3.500)   →  u at x=1.500: 2.000,  u at x=2.700: 0.800
//   local v: y-1.350       →  v at y=0.900: -0.450, v at y=2.250: 0.900
//   MIRROR check: x = (3.000 - 2.000) × 1000 = 1000mm ✓
// ---------------------------------------------------------------------------
const wall3_opening = {
  openingId: 'opening-2',
  type: 'window',
  source: 'semantic',
  boundary2D: ring([
    { u: 2.000, v: -0.450 },
    { u: 0.800, v: -0.450 },
    { u: 0.800, v:  0.900 },
    { u: 2.000, v:  0.900 },
  ]),
  bbox2D: bbox2D(0.800, 2.000, -0.450, 0.900),
  areaM2: 1.200 * 1.350,
  bottomHeightM: 0.900,
  topHeightM: 2.250,
  isFullHeight: false,
};

const wall3 = {
  planeId: 'plane-003',
  sourceIfcModelId: 'model-0',
  sourceFileName: 'test.ifc',
  sourceMeshIds: [61389],
  worldNormal: { x: 0, y: 0, z: -1 },
  planeEquation: { normal: { x: 0, y: 0, z: -1 }, d: 0.129 },
  localFrame: {
    origin: { x: 3.500, y: 1.350, z: -0.129 },
    uAxis:  { x: -1, y: 0, z: 0 },
    vAxis:  { x:  0, y: 1, z: 0 },
    normal: { x: 0, y: 0, z: -1 },
    planeEquationD: 0.129,
  },
  outerBoundary: ring([
    { u: -3.000, v: -1.350 },
    { u:  3.000, v: -1.350 },
    { u:  3.000, v:  1.350 },
    { u: -3.000, v:  1.350 },
  ]),
  holes: [],
  openings: [wall3_opening],
  projectedVertices2D: [],
  sourceTriangleCount: 12,
  areaM2: 6.0 * 2.7,
  widthM: 6.0,
  heightM: 2.7,
  bbox: {
    min:    { x: 0.500, y: 0.000, z: -0.258 },
    max:    { x: 6.500, y: 2.700, z:  0.000 },
    center: { x: 3.500, y: 1.350, z: -0.129 },
  },
  isExterior: true,
  boundarySource: 'topology',
  semanticHint: null,
};

// ---------------------------------------------------------------------------
// Run adapter
// ---------------------------------------------------------------------------
const planes = [wall1, wall2, wall3];
const { walls, diagnostics } = adaptWallPlanesToBrickBoard(planes);

// ---------------------------------------------------------------------------
// Expected values (computed manually above)
// ---------------------------------------------------------------------------
const EXPECTED = [
  {
    expressID:      371040,
    lengthAxis:     'y',
    heightAxis:     'z',
    thicknessAxis:  'x',
    lengthStart:    1000,
    lengthEnd:      7000,
    heightStart:    0,
    heightEnd:      2700,
    thicknessStart: 500,
    thicknessEnd:   772,
    resolvedOutside_dir: -1,
    resolvedOutside_pos: 500,
    length:         6000,
    height:         2700,
    openingCount:   2,
    openings: [
      { x: 1500, y: 900, breedte: 1200, hoogte: 1350, source: 'semantic', polyPtsCount: 4 },
      { x: 4500, y: 900, breedte: 1200, hoogte: 1350, source: 'semantic', polyPtsCount: 4 },
    ],
    facadePolyCount: 4,
  },
  {
    expressID:      119751,
    lengthAxis:     'y',
    heightAxis:     'z',
    thicknessAxis:  'x',
    lengthStart:    1000,
    lengthEnd:      7000,
    heightStart:    0,
    heightEnd:      2700,
    thicknessStart: 772,
    thicknessEnd:   954,
    resolvedOutside_dir: -1,
    resolvedOutside_pos: 772,
    length:         6000,
    height:         2700,
    openingCount:   2,
    openings: [
      { x: 1500, y: 900, breedte: 1200, hoogte: 1350, source: 'inherited', polyPtsCount: 4 },
      { x: 4500, y: 900, breedte: 1200, hoogte: 1350, source: 'inherited', polyPtsCount: 4 },
    ],
    facadePolyCount: 4,
  },
  {
    expressID:      61389,
    lengthAxis:     'x',
    heightAxis:     'z',
    thicknessAxis:  'y',
    lengthStart:    500,
    lengthEnd:      6500,
    heightStart:    0,
    heightEnd:      2700,
    thicknessStart: 0,
    thicknessEnd:   258,
    resolvedOutside_dir: 1,
    resolvedOutside_pos: 258,
    length:         6000,
    height:         2700,
    openingCount:   1,
    openings: [
      { x: 1000, y: 900, breedte: 1200, hoogte: 1350, source: 'semantic', polyPtsCount: 4 },
    ],
    facadePolyCount: 4,
  },
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function checkNoNaN(label, val) {
  const ok = typeof val === 'number' && !isNaN(val);
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL NaN/missing ${label}: got ${JSON.stringify(val)}`);
  }
}

function checkInRange(label, val, min, max) {
  const ok = typeof val === 'number' && val >= min && val <= max;
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL range ${label}: expected [${min}, ${max}], got ${JSON.stringify(val)}`);
  }
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  Phase 1.5 — ifcAdapter Smoke Test');
console.log('══════════════════════════════════════════════════════════════\n');

for (let i = 0; i < 3; i++) {
  const wall = walls[i];
  const exp  = EXPECTED[i];
  const wo   = wall.wallOrigin;
  const wallLabel = `Wall[${i}] (#${exp.expressID})`;

  console.log(`─────────────────────────────────────────────`);
  console.log(`${wallLabel}`);
  console.log(`─────────────────────────────────────────────`);

  check(`${wallLabel} expressID`,          wall.expressID,              exp.expressID);
  check(`${wallLabel} lengthAxis`,         wo.lengthAxis,               exp.lengthAxis);
  check(`${wallLabel} heightAxis`,         wo.heightAxis,               exp.heightAxis);
  check(`${wallLabel} thicknessAxis`,      wo.thicknessAxis,            exp.thicknessAxis);
  check(`${wallLabel} lengthStart`,        wo.lengthStart,              exp.lengthStart);
  check(`${wallLabel} lengthEnd`,          wo.lengthEnd,                exp.lengthEnd);
  check(`${wallLabel} heightStart`,        wo.heightStart,              exp.heightStart);
  check(`${wallLabel} heightEnd`,          wo.heightEnd,                exp.heightEnd);
  check(`${wallLabel} thicknessStart`,     wo.thicknessStart,           exp.thicknessStart);
  check(`${wallLabel} thicknessEnd`,       wo.thicknessEnd,             exp.thicknessEnd);
  check(`${wallLabel} resolvedOutside.dir`,wo.resolvedOutside?.outsideDir, exp.resolvedOutside_dir);
  check(`${wallLabel} resolvedOutside.pos`,wo.resolvedOutside?.outsidePos, exp.resolvedOutside_pos);
  check(`${wallLabel} length`,             wall.length,                 exp.length);
  check(`${wallLabel} height`,             wall.height,                 exp.height);
  check(`${wallLabel} openingCount`,       wall.openings.length,        exp.openingCount);
  check(`${wallLabel} facadePolyCount`,    wall.facadePoly?.length ?? 0, exp.facadePolyCount);

  checkNoNaN(`${wallLabel} length`,  wall.length);
  checkNoNaN(`${wallLabel} height`,  wall.height);

  for (let j = 0; j < exp.openings.length; j++) {
    const op    = wall.openings[j];
    const expOp = exp.openings[j];
    const opLabel = `${wallLabel} opening[${j}]`;

    check(`${opLabel} x`,        op?.x,       expOp.x);
    check(`${opLabel} y`,        op?.y,       expOp.y);
    check(`${opLabel} breedte`,  op?.breedte, expOp.breedte);
    check(`${opLabel} hoogte`,   op?.hoogte,  expOp.hoogte);
    check(`${opLabel} _source`,  op?._source, expOp.source);
    check(`${opLabel} polyPts count`, op?.polyPts?.length ?? 0, expOp.polyPtsCount);

    checkNoNaN(`${opLabel} x`,       op?.x);
    checkNoNaN(`${opLabel} y`,       op?.y);
    checkNoNaN(`${opLabel} breedte`, op?.breedte);
    checkNoNaN(`${opLabel} hoogte`,  op?.hoogte);

    // Opening must lie within wall dimensions
    checkInRange(`${opLabel} x within wall length`, op?.x, 0, wall.length);
    checkInRange(`${opLabel} y within wall height`,  op?.y, 0, wall.height);
    checkInRange(`${opLabel} x+breedte within wall length`, (op?.x ?? 0) + (op?.breedte ?? 0), 0, wall.length + 1);
    checkInRange(`${opLabel} y+hoogte within wall height`,  (op?.y ?? 0) + (op?.hoogte  ?? 0), 0, wall.height + 1);

    // polyPts must all lie within wall dimensions
    for (const pt of (op?.polyPts ?? [])) {
      checkInRange(`${opLabel} polyPts.l`, pt.l, 0, wall.length);
      checkInRange(`${opLabel} polyPts.h`, pt.h, 0, wall.height);
    }
  }

  // facadePoly points must lie within wall dimensions
  for (const pt of (wall.facadePoly ?? [])) {
    checkInRange(`${wallLabel} facadePoly.l`, pt.l, 0, wall.length);
    checkInRange(`${wallLabel} facadePoly.h`, pt.h, 0, wall.height);
  }

  // Print actual values
  console.log(`  expressID        : ${wall.expressID}`);
  console.log(`  lengthAxis       : ${wo.lengthAxis}`);
  console.log(`  heightAxis       : ${wo.heightAxis}`);
  console.log(`  thicknessAxis    : ${wo.thicknessAxis}`);
  console.log(`  lengthStart      : ${wo.lengthStart}mm`);
  console.log(`  lengthEnd        : ${wo.lengthEnd}mm`);
  console.log(`  heightStart      : ${wo.heightStart}mm`);
  console.log(`  heightEnd        : ${wo.heightEnd}mm`);
  console.log(`  thicknessStart   : ${wo.thicknessStart}mm`);
  console.log(`  thicknessEnd     : ${wo.thicknessEnd}mm`);
  console.log(`  resolvedOutside  :`, JSON.stringify(wo.resolvedOutside));
  console.log(`  length           : ${wall.length}mm`);
  console.log(`  height           : ${wall.height}mm`);
  console.log(`  openingCount     : ${wall.openings.length}`);
  console.log(`  facadePolyPoints : ${wall.facadePoly?.length ?? 0}`);
  for (const op of wall.openings) {
    console.log(`  opening ${op.id}:`);
    console.log(`    type    : ${op.type}`);
    console.log(`    x       : ${op.x}mm`);
    console.log(`    y       : ${op.y}mm`);
    console.log(`    breedte : ${op.breedte}mm`);
    console.log(`    hoogte  : ${op.hoogte}mm`);
    console.log(`    polyPts : ${op.polyPts?.length ?? 0} points`);
    console.log(`    _source : ${op._source}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Defaults check
// ---------------------------------------------------------------------------
console.log('─────────────────────────────────────────────');
console.log('Defaults report');
console.log('─────────────────────────────────────────────');
for (const d of diagnostics.defaults) console.warn(' ⚠', d);
console.log();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('══════════════════════════════════════════════════════════════');
if (failures.length > 0) {
  console.error('FAILURES:');
  for (const f of failures) console.error(f);
  console.log();
}
const total = passed + failed;
const status = failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILURES`;
console.log(`Result: ${status}  (${passed}/${total} checks passed)`);
console.log('══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
