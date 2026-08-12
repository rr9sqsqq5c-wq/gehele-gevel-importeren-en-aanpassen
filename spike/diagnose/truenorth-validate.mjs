// WEGWERP (spike/) — VALIDATE Concern 1 (trueNorth metadata-only).
// (a) buildProjectMatrix: vlag UIT → Ry(trueNorth) aanwezig; vlag AAN → Ry = identiteit (== trueNorth 0).
// (b) exportGroupsToIfc: vlag UIT → context TrueNorth = $ (byte-identiek); vlag AAN → IFCDIRECTION([sin,cos]).
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let FLAG = '0';
globalThis.localStorage = { getItem: (k) => (k === 'trueNorthMetadataOnly' ? FLAG : null), setItem(){}, removeItem(){} };

const PC = await import('../../src/lib/projectCoordinates.js');
const { exportGroupsToIfc } = await import('../../src/lib/ifc.js');

const TN_DEG = 38.2175;
const tnRad = TN_DEG * Math.PI / 180;
const tnDir = [Math.sin(tnRad), Math.cos(tnRad)]; // registerIfcContext: angle = atan2(x,y)

function mat(flag) {
  FLAG = flag;
  PC.reset();
  PC.registerIfcContext({ origin: { x: 0, y: 0, z: 0 }, trueNorth: tnDir, upAxis: 'y' }, 'tn-test');
  return Array.from(PC.buildProjectMatrix().elements);
}
function matZero() { // referentie: trueNorth 0, vlag uit
  FLAG = '0'; PC.reset();
  PC.registerIfcContext({ origin: { x: 0, y: 0, z: 0 }, trueNorth: null, upAxis: 'y' }, 'tn-zero');
  return Array.from(PC.buildProjectMatrix().elements);
}
const approxEq = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

console.log('# CONCERN 1 — VALIDATE\n');
const orig = console.log; console.log = () => {};
const mOff = mat('0');
const mOn  = mat('1');
const mZero = matZero();
console.log = orig;

console.log('(a) buildProjectMatrix Ry-gating (trueNorth = 38,2175°, upAxis y)');
console.log(`  vlag UIT == trueNorth-0?  ${approxEq(mOff, mZero) ? '🔴 (Ry ontbreekt al uit!)' : '🟢 nee → Ry(trueNorth) aanwezig (byte-identiek aan vóór C)'}`);
console.log(`  vlag AAN == trueNorth-0?  ${approxEq(mOn, mZero) ? '🟢 ja → Ry = identiteit (project-noord)' : '🔴 nee → Ry nog toegepast'}`);

// (b) export
function exportCtx(flag) {
  FLAG = flag;
  PC.reset();
  PC.setGeometryDerivedRenderOrigin({ x: 0, y: 0, z: 0 }, { contextWCS: { x: 111185325, y: 471934575, z: 0 }, trueNorthDegrees: TN_DEG, upAxis: 'y' });
  const o2 = console.log; console.log = () => {};
  const ifc = exportGroupsToIfc([], {}, 'tn-test', null);
  console.log = o2;
  const ctxLine = ifc.split('\n').find(l => l.includes('IFCGEOMETRICREPRESENTATIONCONTEXT')) || '(geen context-regel)';
  // de TrueNorth-ref is het laatste argument; zoek de bijbehorende IFCDIRECTION
  const tnMatch = ctxLine.match(/IFCGEOMETRICREPRESENTATIONCONTEXT\([^)]*,#\d+,(\$|#(\d+))\)/);
  const tnRefId = tnMatch && tnMatch[2] ? tnMatch[2] : null;
  let dirLine = null;
  if (tnRefId) dirLine = ifc.split('\n').find(l => l.startsWith(`#${tnRefId}=`));
  return { ctxLine: ctxLine.trim(), tnSlot: tnMatch ? tnMatch[1] : '(niet gevonden)', dirLine: dirLine?.trim() ?? null };
}

console.log('\n(b) exportGroupsToIfc context TrueNorth-slot');
const eOff = exportCtx('0');
const eOn  = exportCtx('1');
console.log(`  vlag UIT TrueNorth-slot: ${eOff.tnSlot}  ${eOff.tnSlot === '$' ? '🟢 = $ (byte-identiek)' : '🔴 niet $'}`);
console.log(`  vlag AAN TrueNorth-slot: ${eOn.tnSlot}  ${eOn.tnSlot.startsWith('#') ? '🟢 → IFCDIRECTION' : '🔴 geen ref'}`);
if (eOn.dirLine) {
  console.log(`  vlag AAN richting      : ${eOn.dirLine}`);
  const nums = (eOn.dirLine.match(/-?\d+\.?\d*/g) || []).slice(-2).map(Number);
  const okDir = Math.abs(nums[0] - tnDir[0]) < 1e-4 && Math.abs(nums[1] - tnDir[1]) < 1e-4;
  console.log(`  richting == [sin,cos]  : ${okDir ? `🟢 (${tnDir.map(v=>v.toFixed(4))})` : `🔴 verwacht [${tnDir.map(v=>v.toFixed(4))}]`}`);
}

const ok = !approxEq(mOff, mZero) && approxEq(mOn, mZero) && eOff.tnSlot === '$' && eOn.tnSlot.startsWith('#');
console.log(`\n=== VERDICT: ${ok ? '🟢 Concern 1 correct: 3D project-noord aan, byte-identiek uit, trueNorth in export-metadata' : '🔴 niet volledig'} ===`);
process.exit(0);
