// WEGWERP (spike/) — READ-ONLY. Meet de 3D-render-translatie (buildProjectMatrix) voor BIL-MOO
// met de ECHTE #20, vlag UIT vs AAN. Toont of het 3D-pad de oude #20 (485 km) of de
// renderOrigin (~9 m) aftrekt. Niets bedraad, niet committen.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// flag-shim: zet geometryDerivedOrigin via localStorage (featureFlags leest dit)
let FLAG = '0';
globalThis.localStorage = { getItem: (k) => (k === 'geometryDerivedOrigin' ? FLAG : null), setItem() {}, removeItem() {} };

const PC = await import('../../src/lib/projectCoordinates.js');

// #20 zoals gemeten in measure-coords-pipeline
const WCS = { x: 111185325.12550394, y: 471934574.99281204, z: 0 };
// emittedLocal AABB-center (mm) ≈ representatief renderOrigin (~9 m orde)
const RENDER_ORIGIN = { x: 9300, y: -100, z: -19000 };

function tOf(label) {
  const M = PC.buildProjectMatrix(); const a = Array.from(M.elements);
  // THREE Matrix4 is column-major: translatie = elements[12,13,14]
  console.log(`  ${label}: translatie three-units [${a[12].toFixed(1)}, ${a[13].toFixed(1)}, ${a[14].toFixed(1)}]  (|t|=${Math.hypot(a[12],a[13],a[14]).toFixed(0)} m)`);
}

console.log('### 3D buildProjectMatrix translatie — BIL-MOO (#20 = 485 km, geom ≈ 9 m)\n');

// vlag UIT
FLAG = '0';
PC.reset();
PC.registerIfcContext({ origin: WCS, upAxis: 'z' }, 'BIL-MOO');
console.log('VLAG UIT (geometryDerivedOrigin=0) — _renderOrigin null → #20-pad:');
tOf('3D translatie');
console.log('  → verwacht ~485 km (de scène wordt 485 km verschoven; geom zit op ~9 m)\n');

// vlag AAN
FLAG = '1';
PC.reset();
PC.registerIfcContext({ origin: WCS, upAxis: 'z' }, 'BIL-MOO');
PC.setGeometryDerivedRenderOrigin(RENDER_ORIGIN, { contextWCS: WCS, upAxis: 'z', trueNorthDegrees: 0 });
console.log('VLAG AAN (geometryDerivedOrigin=1) — _renderOrigin gezet → AABB-center-pad:');
tOf('3D translatie');
console.log('  → verwacht ~ tientallen m (scène bij ~0)\n');

console.log('worldAnchor bij vlag AAN:', JSON.stringify(PC.getWorldAnchor()));
process.exit(0);
