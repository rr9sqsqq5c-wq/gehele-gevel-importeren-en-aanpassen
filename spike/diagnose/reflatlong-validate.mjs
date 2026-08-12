// WEGWERP (spike/) — VALIDATE Concern B. parseIfc (default A-aan) → worldAnchor.refLatLong =
// Amsterdam (meerderheid), niet Boston/null. export → IfcSite RefLat/Long erin. no-anchor → $,$.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEBIFC_DIR = join(ROOT, 'node_modules', 'web-ifc');

globalThis.localStorage = { getItem: () => null, setItem(){}, removeItem(){} }; // default flags (A aan)
const WebIFC = require('web-ifc');
const realApi = new WebIFC.IfcAPI();
try { await realApi.Init(); } catch { realApi.SetWasmPath(WEBIFC_DIR + '/', true); await realApi.Init(); }
const apiProxy = new Proxy(realApi, { get(t,p){ if(p==='Init') return async()=>{}; const v=t[p]; return typeof v==='function'?v.bind(t):v; } });
class ShimIfcAPI { constructor(){ return apiProxy; } }
globalThis.window = { WebIFC: new Proxy(WebIFC, { get(t,p){ return p==='IfcAPI'?ShimIfcAPI:t[p]; } }) };

const PC = await import('../../src/lib/projectCoordinates.js');
const { parseIfc, exportGroupsToIfc } = await import('../../src/lib/ifc.js');

const buf = readFileSync(join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc'));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const file = { name: 'BIL-MOO-rll.ifc', size: buf.length, arrayBuffer: async () => ab };

PC.reset();
const orig = console.log; console.log = () => {};
const walls = await parseIfc(file, null, null, { forceOrientation: 'AUTO' });
console.log = orig;

const ll = PC.getWorldAnchor()?.refLatLong;
const AMS = [52,20,51,905822], BOS = [42,24,53,508911];
const isAms = ll && JSON.stringify(ll.lat) === JSON.stringify(AMS);
const isBos = ll && JSON.stringify(ll.lat) === JSON.stringify(BOS);
console.log('# CONCERN B — VALIDATE\n');
console.log(`  #wanden                 : ${walls.length}`);
console.log(`  worldAnchor.refLatLong  : ${ll ? `lat=[${ll.lat}] long=[${ll.long}]` : 'null'}`);
console.log(`  = Amsterdam?            : ${isAms ? '🟢  JA' : '🔴 nee'}  | = Boston? ${isBos ? '🔴 JA (fout!)' : '🟢 nee'}`);

// export met anchor → IfcSite-regel
const o2 = console.log; console.log = () => {};
const ifcOn = exportGroupsToIfc([], {}, 'rll-on', null);
console.log = o2;
const siteOn = ifcOn.split('\n').find(l => l.includes('IFCSITE(')) || '(geen)';
const hasLat = /IFCSITE\([^;]*\.ELEMENT\.,\(52,20,51,905822\),\(4,54,49,572715\)/.test(siteOn);
console.log(`\n  export IfcSite (anchor)  : ${siteOn.trim().slice(0, 120)}`);
console.log(`  bevat Amsterdam RefLat/Long: ${hasLat ? '🟢 JA' : '🔴 nee'}`);

// no-anchor → byte-identiek ($,$)
PC.reset();
const o3 = console.log; console.log = () => {};
const ifcOff = exportGroupsToIfc([], {}, 'rll-off', null);
console.log = o3;
const siteOff = ifcOff.split('\n').find(l => l.includes('IFCSITE(')) || '(geen)';
const offBlank = /\.ELEMENT\.,\$,\$,\$,\$,\$\)/.test(siteOff);
console.log(`\n  export IfcSite (no-anchor): ${siteOff.trim().slice(0, 90)}`);
console.log(`  no-anchor = $,$,$,$,$ (byte-identiek): ${offBlank ? '🟢 JA' : '🔴 nee'}`);

const ok = isAms && !isBos && hasLat && offBlank;
console.log(`\n=== VERDICT: ${ok ? '🟢 Concern B correct: Amsterdam (meerderheid), export draagt het, no-anchor byte-identiek' : '🔴 niet volledig'} ===`);
process.exit(0);
