// WEGWERP (spike/) — READ-ONLY. Meet wand 26025424 (L-vorm): facadePoly (omtrek) vs bbox
// (wallOrigin) vs gedetecteerde openingen, om te bepalen waarom een massief stuk onbekleed blijft.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEBIFC_DIR = join(ROOT, 'node_modules', 'web-ifc');
globalThis.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
const WebIFC = require('web-ifc');
const realApi = new WebIFC.IfcAPI();
try { await realApi.Init(); } catch { realApi.SetWasmPath(WEBIFC_DIR + '/', true); await realApi.Init(); }
const apiProxy = new Proxy(realApi, { get(t,p){ if(p==='Init') return async()=>{}; const v=t[p]; return typeof v==='function'?v.bind(t):v; } });
class ShimIfcAPI { constructor(){ return apiProxy; } }
globalThis.window = { WebIFC: new Proxy(WebIFC, { get(t,p){ return p==='IfcAPI'?ShimIfcAPI:t[p]; } }) };
const { parseIfc } = await import('../../src/lib/ifc.js');

const buf = readFileSync(join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc'));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const file = { name: 'BIL-MOO-L.ifc', size: buf.length, arrayBuffer: async () => ab };
const orig = console.log; console.log = () => {};
const walls = await parseIfc(file, null, null, { forceOrientation: 'AUTO' });
console.log = orig;

let w = walls.find((x) => x.expressID === 60148)
     || walls.find((x) => String(x.name ?? '').endsWith(':26025424'));
if (!w) {
  console.log('Wand 26025424 niet gevonden. Kandidaten (272.5, ~3360x2870):');
  walls.filter(x => /272\.5/.test(x.name ?? '') && Math.abs((x.length??0)-3360)<50).slice(0,10)
    .forEach(x => console.log(`  expressID=${x.expressID} ${x.name} ${x.length}x${x.height} poly=${x.facadePoly?.length ?? 0}pt openings=${x.openings?.length ?? 0}`));
  process.exit(0);
}

const wo = w.wallOrigin;
console.log(`# WAND ${w.expressID}  ${w.name}  ${w.length}x${w.height} mm`);
console.log(`  assen: lengthAxis=${wo.lengthAxis} heightAxis=${wo.heightAxis} thicknessAxis=${wo.thicknessAxis}`);
console.log(`  BBOX (wallOrigin): length ${wo.lengthStart}..${wo.lengthEnd}  height ${wo.heightStart}..${wo.heightEnd}`);
const bw = wo.lengthEnd - wo.lengthStart, bh = wo.heightEnd - wo.heightStart;
console.log(`  bbox-afmeting: ${bw} x ${bh} mm  → bbox-oppervlak ${(bw*bh/1e6).toFixed(2)} m²`);

// facadePoly (omtrek) — in {l,h} (lokaal t.o.v. wand?) of absolute? dump rauw
console.log(`\n  facadePoly: ${w.facadePoly?.length ?? 0} punten`);
if (w.facadePoly?.length) {
  const ls = w.facadePoly.map(p => p.l), hs = w.facadePoly.map(p => p.h);
  console.log(`    l-bereik ${Math.min(...ls)}..${Math.max(...ls)}  h-bereik ${Math.min(...hs)}..${Math.max(...hs)}`);
  console.log(`    punten: ${w.facadePoly.map(p => `(${Math.round(p.l)},${Math.round(p.h)})`).join(' ')}`);
  // schat oppervlak (shoelace) → vergelijk met bbox: kleiner = concave/L
  let A = 0; const P = w.facadePoly; for (let i=0;i<P.length;i++){ const a=P[i], b=P[(i+1)%P.length]; A += a.l*b.h - b.l*a.h; }
  console.log(`    poly-oppervlak (shoelace) ${(Math.abs(A)/2/1e6).toFixed(2)} m²  → ${Math.abs(A)/2 < bw*bh*0.97 ? '🟠 KLEINER dan bbox = concave/L (hap zit in de omtrek)' : '🟢 ~rechthoek'}`);
}

console.log(`\n  openingen op deze wand: ${w.openings?.length ?? 0}`);
for (const o of (w.openings ?? [])) {
  const ww = o.breedte ?? o.width, hh = o.hoogte ?? o.height;
  console.log(`   id=${o.id ?? o.expressID ?? '?'} type=${o.type ?? '?'} x=${Math.round(o.x)} y=${Math.round(o.y)} ${Math.round(ww)}x${Math.round(hh)} mm  poly=${o.polyPts?.length ?? 0}pt`);
  if (o.polyPts?.length) {
    console.log(`     polyPts: ${o.polyPts.map(p => `(${Math.round(p.l)},${Math.round(p.h)})`).join(' ')}`);
    const ls = o.polyPts.map(p=>p.l), hs = o.polyPts.map(p=>p.h);
    let A=0; const P=o.polyPts; for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];A+=a.l*b.h-b.l*a.h;}
    console.log(`     poly-bbox: l ${Math.round(Math.min(...ls))}..${Math.round(Math.max(...ls))}  h ${Math.round(Math.min(...hs))}..${Math.round(Math.max(...hs))}  poly-opp ${(Math.abs(A)/2/1e6).toFixed(2)} m² vs rect-opp ${(ww*hh/1e6).toFixed(2)} m²`);
  }
}
// Alle wanden met poly!=4 of een mega-opening (>60% breedte) → schaal van het issue
console.log('\n# SCHAAL — wanden met een opening die >55% van de bbox-breedte beslaat:');
let n=0;
for (const x of walls) {
  const xo = x.wallOrigin; if (!xo) continue;
  const bwx = (xo.lengthEnd - xo.lengthStart) || 1;
  for (const o of (x.openings ?? [])) {
    const owv = o.breedte ?? o.width ?? 0;
    if (owv > 0.55 * bwx) { if (n<15) console.log(`  expressID=${x.expressID} ${x.name?.slice(-30)} opening ${Math.round(owv)}mm / bbox ${Math.round(bwx)}mm (${Math.round(owv/bwx*100)}%) poly=${o.polyPts?.length??0}pt type=${o.type}`); n++; break; }
  }
}
console.log(`  → totaal ${n} wanden met zo'n mega-opening (van ${walls.length})`);
process.exit(0);
