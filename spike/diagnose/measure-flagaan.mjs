// WEGWERP (spike/) — meet flag-UIT vs flag-AAN wereld-afstand voor een willekeurig model.
// Gebruikt de ECHTE projectCoordinates.js. flag-UIT = #20-aftrek; flag-AAN = renderOrigin
// (geometrie-AABB-center). Bewijst dat de geometrie-afgeleide origin BEIDE offset-conventies
// (context-WCS én plaatsings-boom) bij (0,0,0) brengt.
//   node spike/diagnose/measure-flagaan.mjs <ifc-pad>

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import * as THREE from '../../node_modules/three/build/three.module.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARG = process.argv[2] || 'public/BIL-MOO-A-ZZ-PBP.ifc';
const MODEL = ARG.match(/^[A-Za-z]:|^[\\/]/) ? ARG : join(ROOT, ARG);

globalThis.localStorage = { _on: false, getItem(k){ return (this._on && k === 'geometryDerivedOrigin') ? '1' : null; }, setItem(){}, removeItem(){} };
const PC = await import('../../src/lib/projectCoordinates.js');

async function api() { const W = require('web-ifc'); const a = new W.IfcAPI(); try { await a.Init(); } catch { a.SetWasmPath(join(ROOT,'node_modules','web-ifc')+'/', true); await a.Init(); } return { W, a }; }
function wallAABB(a, id, eid) { let m; try { m = a.GetFlatMesh(id, eid); } catch { return null; } if (!m||m.geometries.size()===0) return null;
  let M={mnX:1/0,mxX:-1/0,mnY:1/0,mxY:-1/0,mnZ:1/0,mxZ:-1/0},ok=false;
  for (let g=0; g<m.geometries.size(); g++){ const p=m.geometries.get(g); let geo; try{ geo=a.GetGeometry(id,p.geometryExpressID); const v=a.GetVertexArray(geo.GetVertexData(),geo.GetVertexDataSize()); const t=p.flatTransformation;
    for(let i=0;i<v.length;i+=6){const x=v[i],y=v[i+1],z=v[i+2];const wx=t[0]*x+t[4]*y+t[8]*z+t[12],wy=t[1]*x+t[5]*y+t[9]*z+t[13],wz=t[2]*x+t[6]*y+t[10]*z+t[14];
      if(wx<M.mnX)M.mnX=wx;if(wx>M.mxX)M.mxX=wx;if(wy<M.mnY)M.mnY=wy;if(wy>M.mxY)M.mxY=wy;if(wz<M.mnZ)M.mnZ=wz;if(wz>M.mxZ)M.mxZ=wz;ok=true;} } finally { geo?.delete(); } }
  return ok?M:null; }

const { W, a } = await api();
if (!existsSync(MODEL)) { console.log('ontbreekt:', MODEL); process.exit(1); }
const buf = readFileSync(MODEL);
const id = a.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {});

// context #20 + trueNorth
const cv = a.GetLineIDsWithType(id, a.GetTypeCodeFromName('IFCGEOMETRICREPRESENTATIONCONTEXT'));
let origin={x:0,y:0,z:0}, trueNorth=null;
for (let i=0;i<cv.size();i++){ const c=a.GetLine(id,cv.get(i),false); const ct=c?.ContextType?.value??c?.ContextType; if(typeof ct==='string'&&ct!=='Model')continue;
  const w=a.GetLine(id,c?.WorldCoordinateSystem?.value,false); const pt=a.GetLine(id,w?.Location?.value,false); const k=pt?.Coordinates;
  if(Array.isArray(k))origin={x:+(k[0]?.value??k[0]),y:+(k[1]?.value??k[1]),z:+(k[2]?.value??k[2])};
  const tn=c?.TrueNorth?.value!=null?a.GetLine(id,c.TrueNorth.value,false):null; const d=tn?.DirectionRatios; if(Array.isArray(d))trueNorth=[+(d[0]?.value??d[0]),+(d[1]?.value??d[1])]; break; }

// emitted AABB
let G={mnX:1/0,mxX:-1/0,mnY:1/0,mxY:-1/0,mnZ:1/0,mxZ:-1/0},n=0;
for (const tn of ['IFCWALLSTANDARDCASE','IFCWALL']){ const v=a.GetLineIDsWithType(id,W[tn]); for(let i=0;i<v.size();i++){const bb=wallAABB(a,id,v.get(i));if(!bb)continue;
  if(Math.max(bb.mxX-bb.mnX,bb.mxY-bb.mnY,bb.mxZ-bb.mnZ)*1000<100)continue;
  G.mnX=Math.min(G.mnX,bb.mnX);G.mxX=Math.max(G.mxX,bb.mxX);G.mnY=Math.min(G.mnY,bb.mnY);G.mxY=Math.max(G.mxY,bb.mxY);G.mnZ=Math.min(G.mnZ,bb.mnZ);G.mxZ=Math.max(G.mxZ,bb.mxZ);n++;} }
a.CloseModel(id);
if (!n) { console.log('geen wanden in', MODEL); process.exit(0); }

const center = { x: Math.round((G.mnX+G.mxX)/2*1000), y: Math.round((G.mnY+G.mxY)/2*1000), z: Math.round((G.mnZ+G.mxZ)/2*1000) };
function maxDist() { const M=PC.buildProjectMatrix();
  const cs=[[G.mnX,G.mnY,G.mnZ],[G.mxX,G.mxY,G.mxZ],[G.mnX,G.mxY,G.mnZ],[G.mxX,G.mnY,G.mxZ],[G.mnX,G.mnY,G.mxZ],[G.mxX,G.mxY,G.mnZ],[G.mnX,G.mxY,G.mxZ],[G.mxX,G.mnY,G.mnZ]];
  let d=0; for(const c of cs){const v=new THREE.Vector3(...c).applyMatrix4(M); d=Math.max(d,Math.hypot(v.x,v.y,v.z));} return d; }

console.log(`\n=== FLAG-AAN op ${MODEL.split(/[\\/]/).pop()} (n=${n} wanden) ===`);
console.log(`  emitted-AABB-center (mm): (${center.x}, ${center.y}, ${center.z}) | #20: (${origin.x}, ${origin.y})`);
// FLAG OFF
localStorage._on=false; PC.reset(); PC.registerIfcContext({origin,trueNorth,upAxis:'y'},MODEL);
const off = maxDist();
// FLAG ON
localStorage._on=true; PC.reset(); PC.registerIfcContext({origin,trueNorth,upAxis:'y'},MODEL);
PC.setGeometryDerivedRenderOrigin(center, { contextWCS: origin, upAxis:'y' });
const on = maxDist();
console.log(`  flag-UIT maxDist van (0,0,0): ${(off/1000).toFixed(1)} km  ${off>1e5?'← de bug':''}`);
console.log(`  flag-AAN maxDist van (0,0,0): ${on.toFixed(1)} m  ${on<500?'🟢 <500m':'🔴'}`);
process.exit(0);
