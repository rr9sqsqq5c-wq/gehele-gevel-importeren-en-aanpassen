// WEGWERP (spike/) — READ-ONLY. Bewijst dat de GEOMETRY_DERIVED_ORIGIN-flip de openingsafleiding
// NIET raakt: parse BIL-MOO met het exacte 4-WallStandardCase-filter, flag-UIT vs flag-AAN, en
// vergelijk de openingen-telling per wand. Gelijk → de flip is orthogonaal aan G3.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const WEBIFC_DIR = join(ROOT, 'node_modules', 'web-ifc');

let FLAG = '0';
globalThis.localStorage = { getItem: (k) => (k === 'geometryDerivedOrigin' ? FLAG : null), setItem(){}, removeItem(){} };

const WebIFC = require('web-ifc');
const realApi = new WebIFC.IfcAPI();
try { await realApi.Init(); } catch { realApi.SetWasmPath(WEBIFC_DIR + '/', true); await realApi.Init(); }
const apiProxy = new Proxy(realApi, { get(t,p){ if(p==='Init') return async()=>{}; const v=t[p]; return typeof v==='function'?v.bind(t):v; } });
class ShimIfcAPI { constructor(){ return apiProxy; } }
globalThis.window = { WebIFC: new Proxy(WebIFC, { get(t,p){ return p==='IfcAPI'?ShimIfcAPI:t[p]; } }) };

const PC = await import('../../src/lib/projectCoordinates.js');
const { parseIfc } = await import('../../src/lib/ifc.js');

const FILTER = new Set([
  'Basic Wall:21.10_WA_LB_HSB_272.5',
  'Basic Wall:21.10_WA_LB_HSB_182.5',
  'Basic Wall:21.10_WA_LB_HSB kopsegevel_257.5',
  'Basic Wall:21.10_WA_multiplex',
]);

function mkFile() {
  const buf = readFileSync(join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  // unieke naam per run zodat parseIfc's _cachedModel niet hergebruikt over de flag-wissel
  return (tag) => ({ name: 'BIL-MOO-' + tag + '.ifc', size: buf.length, arrayBuffer: async () => ab });
}
const fileFor = mkFile();

async function run(flag, tag) {
  FLAG = flag;
  PC.reset();
  const orig = console.log; console.log = () => {};
  const walls = await parseIfc(fileFor(tag), FILTER, null, { forceOrientation: 'AUTO' });
  console.log = orig;
  let openTot = 0, wallsWithOpen = 0;
  for (const w of walls) { const n = (w.openings ?? []).length; openTot += n; if (n) wallsWithOpen++; }
  return { nWalls: walls.length, openTot, wallsWithOpen, schema: PC.getProjectInfo().schemaVersion ?? '(geen)', renderOrigin: !!PC.getRenderOrigin() };
}

console.log('# OPENINGEN-FLAG-INVARIANTIE (4 WallStandardCase, filter "21")\n');
const off = await run('0', 'off');
const on  = await run('1', 'on');
console.log('  FLAG UIT :', JSON.stringify(off));
console.log('  FLAG AAN :', JSON.stringify(on));
const same = off.nWalls === on.nWalls && off.openTot === on.openTot && off.wallsWithOpen === on.wallsWithOpen;
console.log(`\n  wanden gelijk    : ${off.nWalls === on.nWalls ? '🟢' : '🔴'} (${off.nWalls} vs ${on.nWalls})`);
console.log(`  openingen gelijk : ${off.openTot === on.openTot ? '🟢' : '🔴'} (${off.openTot} vs ${on.openTot})`);
console.log(`  flag-effect      : UIT renderOrigin=${off.renderOrigin} schema=${off.schema} | AAN renderOrigin=${on.renderOrigin} schema=${on.schema}`);
console.log(`\n=== VERDICT: ${same ? '🟢 flip is orthogonaal aan openingen (G3-invariantie)' : '🔴 flip raakt openingen'} ===`);
process.exit(0);
