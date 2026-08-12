// WEGWERP (spike/) — §8.2 raycast/pick-precisie, headless (geen WebGL; THREE.Raycaster is
// pure double-precision JS-wiskunde). Meet de hitpoint-fout van een bekende ray tegen een
// box bij (0,0,0) vs. bij +485 km, in TWEE opstellingen:
//   A) APP-representatief: LOKALE box-geometrie (klein, float32) onder een parent-matrix met
//      de grote translatie (precies hoe Viewer3D rendert: root-group.matrix = projectMatrix,
//      kind-geometrie lokaal). three transformeert de ray naar lokale ruimte in DOUBLE.
//   B) PATHOLOGISCH (contrast): box-vertices GEBAKKEN op +485 km in float32 (wat de fix
//      juist vermijdt). Toont waarom geometrie lokaal houden ertoe doet.

import * as THREE from '../../node_modules/three/build/three.module.js';

const FAR = 485000; // m, ~de 485 km-scène
const SIZE = 0.05;  // 50 mm box (orde steenstrip)

function castLocalGeomUnderMatrix(offset) {
  // box rond lokale oorsprong; parent-matrix verschuift naar 'offset' (app-pad)
  const geo = new THREE.BoxGeometry(SIZE, SIZE, SIZE); // vertices ~±0.025 (float32, klein)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.matrix.makeTranslation(offset, 0, 0);
  group.add(mesh);
  group.updateMatrixWorld(true);
  // ray langs +X naar de voorkant van de box op wereld-x = offset+SIZE/2
  const ro = new THREE.Vector3(offset - 1, 0, 0);
  const rc = new THREE.Raycaster(ro, new THREE.Vector3(1, 0, 0), 0, 10);
  const hit = rc.intersectObject(mesh, true)[0];
  const expected = offset - SIZE / 2; // voorvlak
  return hit ? Math.abs(hit.point.x - expected) : null;
}

function castBakedFarGeom(offset) {
  // box-vertices GEBAKKEN op wereld-x≈offset (float32) — geen parent-matrix
  const geo = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  geo.translate(offset, 0, 0); // bakt offset in de float32 position-buffer
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  const ro = new THREE.Vector3(offset - 1, 0, 0);
  const rc = new THREE.Raycaster(ro, new THREE.Vector3(1, 0, 0), 0, 10);
  const hit = rc.intersectObject(mesh, true)[0];
  const expected = offset - SIZE / 2;
  return hit ? Math.abs(hit.point.x - expected) : null;
}

const fmt = (e) => e == null ? 'GEEN HIT' : `${(e * 1000).toFixed(6)} mm fout`;

console.log('=== §8.2 RAYCAST-PRECISIE (headless, double-precision CPU) ===');
console.log('\nA) APP-representatief (lokale geometrie onder parent-matrix):');
console.log('   bij (0,0,0)   :', fmt(castLocalGeomUnderMatrix(0)));
console.log('   bij +485 km   :', fmt(castLocalGeomUnderMatrix(FAR)));
console.log('\nB) PATHOLOGISCH (vertices gebakken op +485 km, float32):');
console.log('   bij (0,0,0)   :', fmt(castBakedFarGeom(0)));
console.log('   bij +485 km   :', fmt(castBakedFarGeom(FAR)));

console.log('\n=== DUIDING ===');
const a0 = castLocalGeomUnderMatrix(0), aF = castLocalGeomUnderMatrix(FAR);
const bF = castBakedFarGeom(FAR);
console.log(`  A: fout op 485 km = ${fmt(aF)} (vs ${fmt(a0)} bij origin).`);
console.log(`     ${aF != null && aF < 1e-3 ? '🟢' : '🟠'} Raycast in het APP-pad blijft sub-mm: three transformeert de ray naar`);
console.log('       lokale ruimte in DOUBLE; de float32-verliesbron (vertices) blijft klein.');
console.log(`  B: fout op 485 km = ${fmt(bF)} → ${bF != null && bF > 1 ? '🔴 mm–cm' : '🟠'} als je coords IN float32-vertices bakt.`);
console.log('  CONCLUSIE: de 485 km-scène treft vooral GPU-diepte/jitter, niet de CPU-pick —');
console.log('             MITS geometrie lokaal blijft (wat het geval is). De fix (render-origin)');
console.log('             haalt de scène sowieso naar (0,0,0) en elimineert beide risico-bronnen.');
process.exit(0);
