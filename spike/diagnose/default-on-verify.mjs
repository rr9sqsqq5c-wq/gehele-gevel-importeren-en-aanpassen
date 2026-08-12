// WEGWERP (spike/) — READ-ONLY. Bevestigt dat NA de flip de DEFAULT van GEOMETRY_DERIVED_ORIGIN
// AAN is (geen URL/localStorage-override) en dat een verse parseIfc dan renderOrigin + worldAnchor
// zet met contextWCS == #20. Geen override: localStorage geeft null → readFlag valt op de default.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const WEBIFC_DIR = join(ROOT, 'node_modules', 'web-ifc');

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; // GEEN override → default geldt

const WebIFC = require('web-ifc');
const realApi = new WebIFC.IfcAPI();
try { await realApi.Init(); } catch { realApi.SetWasmPath(WEBIFC_DIR + '/', true); await realApi.Init(); }
const apiProxy = new Proxy(realApi, { get(t,p){ if(p==='Init') return async()=>{}; const v=t[p]; return typeof v==='function'?v.bind(t):v; } });
class ShimIfcAPI { constructor(){ return apiProxy; } }
globalThis.window = { WebIFC: new Proxy(WebIFC, { get(t,p){ return p==='IfcAPI'?ShimIfcAPI:t[p]; } }) };

const flags = await import('../../src/lib/featureFlags.js');
const PC = await import('../../src/lib/projectCoordinates.js');
const { parseIfc } = await import('../../src/lib/ifc.js');

console.log('# DEFAULT-ON VERIFY (geen override)\n');
const def = flags.isGeometryDerivedOrigin();
console.log(`  isGeometryDerivedOrigin() default = ${def}  ${def === true ? '🟢' : '🔴 (flip mislukt)'}`);

const path = join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc');
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const file = { name: 'BIL-MOO-A-ZZ-PBP.ifc', size: buf.length, arrayBuffer: async () => ab };

PC.reset();
const orig = console.log; console.log = () => {};                 // demp parse-ruis
const walls = await parseIfc(file, null, null, { forceOrientation: 'AUTO' });
console.log = orig;

const pi = PC.getProjectInfo();
const wa = PC.getWorldAnchor();
const ro = PC.getRenderOrigin();
const wcs = wa?.contextWCS;
const wcsMatchesO = wcs && pi.origin && Math.abs((wcs.x||0)-(pi.origin.x||0)) < 1 && Math.abs((wcs.y||0)-(pi.origin.y||0)) < 1;
const roMag = ro ? Math.hypot(ro.x||0, ro.y||0, ro.z||0)/1000 : null;

console.log(`\n  #wanden               : ${walls.length}`);
console.log(`  projectInfo.schemaVersion: ${pi.schemaVersion}  ${pi.schemaVersion === 2 ? '🟢' : '🔴'}`);
console.log(`  renderOrigin (mm)     : ${ro ? `(${ro.x}, ${ro.y}, ${ro.z}) → ~${roMag.toFixed(0)} m` : 'null 🔴'}  ${ro ? '🟢 gezet' : ''}`);
console.log(`  worldAnchor.contextWCS: ${wcs ? `(${wcs.x.toFixed(0)}, ${wcs.y.toFixed(0)}, ${wcs.z.toFixed(0)})` : 'null 🔴'}`);
console.log(`  contextWCS == #20     : ${wcsMatchesO ? '🟢 ja (georef vastgelegd)' : '🔴 nee'}`);
console.log(`  worldAnchor.upAxis/tn : ${wa?.upAxis} / ${(wa?.trueNorthDegrees ?? 0).toFixed(3)}°`);
console.log(`  worldAnchor.refLatLong: ${wa?.refLatLong ? 'aanwezig 🟢' : 'null'}`);

console.log('\n=== VERDICT ===');
const ok = def === true && pi.schemaVersion === 2 && ro && wcsMatchesO;
console.log(ok ? '  🟢 DEFAULT-ON werkt end-to-end: verse import zet renderOrigin + worldAnchor(#20).' : '  🔴 default-on niet volledig.');
process.exit(0);
