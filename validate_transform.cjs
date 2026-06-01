#!/usr/bin/env node
// validate_transform.js — IFC coordinate transform validator (no dependencies)
// Usage: node validate_transform.js path/to/file.ifc

const fs = require('fs');
const path = require('path');

const ifcFile = process.argv[2];
if (!ifcFile) { console.error('Usage: node validate_transform.js <file.ifc>'); process.exit(1); }

// ─── Read file ────────────────────────────────────────────────────────────────
const raw = fs.readFileSync(ifcFile, 'utf8');
// Read ALL lines (we need LocalPlacement chains which can be far into the file)
const lines = raw.split('\n');
console.log(`\nFile: ${path.basename(ifcFile)} — ${lines.length} lines\n`);

// ─── Parse IFC lines into a map {id → {type, args}} ──────────────────────────
const entities = {};
const lineRe = /^#(\d+)\s*=\s*([A-Z0-9]+)\s*\(([^]*)\)\s*;?\s*$/;

for (const line of lines) {
  const m = line.trim().match(lineRe);
  if (!m) continue;
  entities[m[1]] = { type: m[2], raw: m[3] };
}

function getRef(val) {
  // val like '#123' → '123'
  if (typeof val === 'string' && val.startsWith('#')) return val.slice(1);
  return null;
}

function parseArgs(raw) {
  // Simple tokeniser: splits top-level commas, handles nested parens
  const result = [];
  let depth = 0, cur = '';
  for (const ch of raw) {
    if (ch === '(' ) { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) result.push(cur.trim());
  return result;
}

function getEntity(id) {
  if (!id) return null;
  const e = entities[id];
  if (!e) return null;
  if (!e.args) e.args = parseArgs(e.raw);
  return e;
}

function getNumber(s) {
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function getPoint(id) {
  const e = getEntity(id);
  if (!e || e.type !== 'IFCCARTESIANPOINT') return null;
  const coords = parseArgs(e.raw.replace(/^\(|\)$/g, ''));
  // args[0] is the list like (x,y,z)
  const listStr = e.args[0].replace(/^\(|\)$/g, '');
  const parts = listStr.split(',').map(s => getNumber(s.trim()));
  return parts;
}

function getDirection(id) {
  const e = getEntity(id);
  if (!e || e.type !== 'IFCDIRECTION') return null;
  const listStr = e.args[0].replace(/^\(|\)$/g, '');
  return listStr.split(',').map(s => getNumber(s.trim()));
}

// ─── Find IFCGEOMETRICREPRESENTATIONCONTEXT ───────────────────────────────────
console.log('═══ PROJECT TRANSFORM ═══════════════════════════════════════════');

let trueNorth = [0, 1];
let wcsOrigin = [0, 0, 0];
let wcsRefDir = [1, 0, 0];
let wcsAxis   = [0, 0, 1];

for (const [id, e] of Object.entries(entities)) {
  if (e.type !== 'IFCGEOMETRICREPRESENTATIONCONTEXT') continue;
  const args = parseArgs(e.raw);
  // IFCGEOMETRICREPRESENTATIONCONTEXT(Identifier, ContextType, CoordSpaceDimension, Precision, WorldCoordinateSystem, TrueNorth)
  const ctxType = args[1]?.replace(/'/g, '');
  if (ctxType && ctxType !== 'Model') continue;

  const wcsRef  = getRef(args[4]);
  const tnRef   = getRef(args[5]);

  console.log(`\nContext #${id} (type: ${ctxType ?? 'n/a'})`);

  // WCS
  if (wcsRef) {
    const wcs = getEntity(wcsRef);
    if (wcs && wcs.type === 'IFCAXIS2PLACEMENT3D') {
      const wcsArgs = parseArgs(wcs.raw);
      const originRef = getRef(wcsArgs[0]);
      const axisRef   = getRef(wcsArgs[1]);
      const rdRef     = getRef(wcsArgs[2]);

      if (originRef) wcsOrigin = getPoint(originRef) ?? wcsOrigin;
      if (axisRef)   wcsAxis   = getDirection(axisRef) ?? wcsAxis;
      if (rdRef)     wcsRefDir = getDirection(rdRef) ?? wcsRefDir;
    }
  }
  console.log(`  WCS origin    : (${wcsOrigin.map(v => v?.toFixed(3)).join(', ')}) mm`);
  console.log(`  WCS axis (Z)  : (${wcsAxis.map(v => v?.toFixed(4)).join(', ')})`);
  console.log(`  WCS refDir (X): (${wcsRefDir.map(v => v?.toFixed(4)).join(', ')})`);

  // TrueNorth
  if (tnRef && tnRef !== '$') {
    const tn = getDirection(tnRef);
    if (tn && tn.length >= 2) {
      const len = Math.sqrt(tn[0]**2 + tn[1]**2) || 1;
      trueNorth = [tn[0]/len, tn[1]/len];
    }
  }
  console.log(`  TrueNorth     : (${trueNorth.map(v => v.toFixed(4)).join(', ')})`);
  break;
}

const trueNorthAngle = Math.atan2(trueNorth[0], trueNorth[1]);
console.log(`\ntrueNorthAngle : ${(trueNorthAngle * 180 / Math.PI).toFixed(3)}°`);

// ─── Build transform matrix (column-major, like Three.js) ─────────────────────
// M = Ry(trueNorthAngle) * Rx(-90°)
// Rx(-90°): x→x, y→z, z→-y  (IFC Z-up → Three.js Y-up)
// Ry(α): rotates in XZ plane
const ca = Math.cos(trueNorthAngle), sa = Math.sin(trueNorthAngle);
// Combined M = Ry(α) * Rx(-90°):
//   IFC (x,y,z) →[Rx-90]→ (x, z, -y) →[Ry(α)]→ (x*ca + (-y)*sa, z, -x*sa + (-y)*ca)
// Wait, let me compute explicitly:
// Rx(-90°) * [x,y,z]^T = [x, z, -y]^T
// Ry(α) * [x,z,-y]^T = [x*ca + (-y)*sa, z, -x*sa + (-y)*ca]  — but that's wrong too
// Let me be explicit:
// Ry(α) = [[ca,0,sa],[0,1,0],[-sa,0,ca]]
// After Rx(-90°): p = (x, z, -y)
// After Ry(α): q = (ca*x + sa*(-y), z, -sa*x + ca*(-y)) — NO, p=(x,z,-y) so:
// q.x = ca*p.x + sa*p.z = ca*x + sa*(-y) = ca*x - sa*y
// q.y = p.y = z
// q.z = -sa*p.x + ca*p.z = -sa*x + ca*(-y) = -sa*x - ca*y

function ifcToThreeJS(ix, iy, iz) {
  // Step 1: mm → m
  const x = ix / 1000, y = iy / 1000, z = iz / 1000;
  // Step 2: Rx(-90°): (x,y,z) → (x, z, -y)
  const ax = x, ay = z, az = -y;
  // Step 3: Ry(trueNorthAngle): (ax,ay,az) → ...
  const tx = ca * ax - sa * az;  // Note: Ry: x' = ca*x + sa*z, but we had az
  // Ry(α) * (ax,ay,az): tx = ca*ax + sa*az, ty = ay, tz = -sa*ax + ca*az
  const tx2 = ca * ax + sa * az;
  const ty2 = ay;
  const tz2 = -sa * ax + ca * az;
  return { x: tx2, y: ty2, z: tz2,
           steps: { mm: [ix,iy,iz], m: [x,y,z], afterRx: [ax,ay,az], afterRy: [tx2,ty2,tz2] } };
}

console.log('\n─── Transformation steps for IFC point (1000, 0, 0): ───');
const test = ifcToThreeJS(1000, 0, 0);
console.log(`  mm→m       : (${test.steps.m.map(v=>v.toFixed(3)).join(', ')})`);
console.log(`  after Rx-90: (${test.steps.afterRx.map(v=>v.toFixed(3)).join(', ')})`);
console.log(`  after Ry(α): (${test.steps.afterRy.map(v=>v.toFixed(3)).join(', ')})`);

console.log('\n─── Transformation steps for TrueNorth vector: ───');
const tn3 = ifcToThreeJS(trueNorth[0]*1000, trueNorth[1]*1000, 0);
console.log(`  TrueNorth IFC   : (${trueNorth[0].toFixed(4)}, ${trueNorth[1].toFixed(4)}, 0)`);
console.log(`  After Rx-90     : (${tn3.steps.afterRx.map(v=>v.toFixed(4)).join(', ')})`);
console.log(`  After Ry(α)     : (${tn3.steps.afterRy.map(v=>v.toFixed(4)).join(', ')})  ← should be (0, 0, -1) for north=-Z`);

// ─── Find first 3 IFCWALLSTANDARDCASE or IFCWALL with LocalPlacement ─────────
console.log('\n═══ WALL POSITIONS ══════════════════════════════════════════════');

function resolveLocalPlacement(placementId, depth = 0) {
  if (depth > 20) return { origin: [0,0,0], xDir: [1,0,0], zDir: [0,0,1] };
  const e = getEntity(placementId);
  if (!e) return { origin: [0,0,0], xDir: [1,0,0], zDir: [0,0,1] };

  if (e.type === 'IFCLOCALPLACEMENT') {
    const args = parseArgs(e.raw);
    const parentRef = getRef(args[0]);
    const relRef    = getRef(args[1]);

    const parent = parentRef ? resolveLocalPlacement(parentRef, depth+1) : { origin:[0,0,0], xDir:[1,0,0], zDir:[0,0,1] };
    const rel    = relRef ? resolveAxis2Placement3D(relRef) : { origin:[0,0,0], xDir:[1,0,0], zDir:[0,0,1] };

    // Compose: world = parent.matrix * rel
    const composed = composeTransform(parent, rel);
    return composed;
  }
  return { origin: [0,0,0], xDir: [1,0,0], zDir: [0,0,1] };
}

function resolveAxis2Placement3D(id) {
  const e = getEntity(id);
  if (!e || e.type !== 'IFCAXIS2PLACEMENT3D') return { origin:[0,0,0], xDir:[1,0,0], zDir:[0,0,1] };
  const args = parseArgs(e.raw);
  const origin = getPoint(getRef(args[0])) ?? [0,0,0];
  const zDir   = getDirection(getRef(args[1])) ?? [0,0,1];
  const xDir   = getDirection(getRef(args[2])) ?? [1,0,0];
  return { origin, xDir, zDir };
}

function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function norm(v) {
  const l = Math.sqrt(v[0]**2+v[1]**2+v[2]**2)||1;
  return v.map(x=>x/l);
}

function composeTransform(parent, child) {
  // parent: {origin, xDir, zDir} defines a local frame
  // child: {origin, xDir, zDir} in parent frame
  // Compute parent's Y axis
  const pZ = norm(parent.zDir);
  const pX = norm(parent.xDir);
  const pY = norm(cross(pZ, pX));

  // Transform child origin into world
  const co = child.origin;
  const wo = [
    parent.origin[0] + co[0]*pX[0] + co[1]*pY[0] + co[2]*pZ[0],
    parent.origin[1] + co[0]*pX[1] + co[1]*pY[1] + co[2]*pZ[1],
    parent.origin[2] + co[0]*pX[2] + co[1]*pY[2] + co[2]*pZ[2],
  ];

  // Transform child axes
  const cx = norm(child.xDir);
  const cz = norm(child.zDir);
  const wxDir = [
    cx[0]*pX[0]+cx[1]*pY[0]+cx[2]*pZ[0],
    cx[0]*pX[1]+cx[1]*pY[1]+cx[2]*pZ[1],
    cx[0]*pX[2]+cx[1]*pY[2]+cx[2]*pZ[2],
  ];
  const wzDir = [
    cz[0]*pX[0]+cz[1]*pY[0]+cz[2]*pZ[0],
    cz[0]*pX[1]+cz[1]*pY[1]+cz[2]*pZ[1],
    cz[0]*pX[2]+cz[1]*pY[2]+cz[2]*pZ[2],
  ];
  return { origin: wo, xDir: wxDir, zDir: wzDir };
}

let wallCount = 0;
for (const [id, e] of Object.entries(entities)) {
  if (wallCount >= 3) break;
  if (e.type !== 'IFCWALLSTANDARDCASE' && e.type !== 'IFCWALL') continue;
  const args = parseArgs(e.raw);
  // IFCWALL(GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation, Tag, PredefinedType)
  const placementRef = getRef(args[5]);
  if (!placementRef) continue;

  const placement = resolveLocalPlacement(placementRef);
  const [ox, oy, oz] = placement.origin;

  const three = ifcToThreeJS(ox, oy, oz);

  wallCount++;
  const name = args[2]?.replace(/'/g,'') ?? `Wall #${id}`;
  console.log(`\nWall #${id} — ${name}`);
  console.log(`  IFC absolute (mm) : (${ox.toFixed(1)}, ${oy.toFixed(1)}, ${oz.toFixed(1)})`);
  console.log(`  → mm→m            : (${three.steps.m.map(v=>v.toFixed(3)).join(', ')})`);
  console.log(`  → after Rx(-90°)  : (${three.steps.afterRx.map(v=>v.toFixed(3)).join(', ')})`);
  console.log(`  → after Ry(${(trueNorthAngle*180/Math.PI).toFixed(1)}°): (${three.steps.afterRy.map(v=>v.toFixed(3)).join(', ')}) m  ← Three.js positie`);
}

console.log('\n═══ SUMMARY ═════════════════════════════════════════════════════');
console.log(`TrueNorth vector   : (${trueNorth.map(v=>v.toFixed(4)).join(', ')})`);
console.log(`TrueNorth angle    : ${(trueNorthAngle*180/Math.PI).toFixed(3)}°`);
console.log(`Matrix rotY (Ry)   : +${(trueNorthAngle*180/Math.PI).toFixed(3)}° (= atan2(tn_x, tn_y))`);
console.log(`\nMatrix M = Ry(${(trueNorthAngle*180/Math.PI).toFixed(1)}°) * Rx(-90°):`);
console.log(`  IFC X-axis → Three.js: (${ifcToThreeJS(1000,0,0).steps.afterRy.map(v=>v.toFixed(4)).join(', ')})`);
console.log(`  IFC Y-axis → Three.js: (${ifcToThreeJS(0,1000,0).steps.afterRy.map(v=>v.toFixed(4)).join(', ')})`);
console.log(`  IFC Z-axis → Three.js: (${ifcToThreeJS(0,0,1000).steps.afterRy.map(v=>v.toFixed(4)).join(', ')})`);
console.log(`\nNorth (-Z check)   : after transform, TrueNorth should be (0, 0, -1)`);
const northCheck = ifcToThreeJS(trueNorth[0]*1000, trueNorth[1]*1000, 0);
const nc = northCheck.steps.afterRy;
const ok = Math.abs(nc[0]) < 0.001 && Math.abs(nc[1]) < 0.001 && Math.abs(nc[2]+1) < 0.001;
console.log(`  Result: (${nc.map(v=>v.toFixed(4)).join(', ')}) — ${ok ? '✓ CORRECT' : '✗ FOUT'}`);
console.log('');
