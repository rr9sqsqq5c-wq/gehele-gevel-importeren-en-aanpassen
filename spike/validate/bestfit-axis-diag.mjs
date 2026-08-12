// READ-ONLY: reproduceer de in-plane as-toekenning van de ECHTE fitFacadePlane
// (facadePlane.js) per gevelgroep op BIL-MOO (+VIA), met de CORRECTE up-as 'y'.
// Doel: welke groepen krijgen nAxis===up (guard) → uAxis/tAxis via span → bond-swap?
// Geen src-wijziging.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitFacadePlane } from '../../src/lib/facadePlane.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BB = resolve(__dirname, '../../');
const W = createRequire(pathToFileURL(BB + '/package.json'))(resolve(BB, 'node_modules/web-ifc/web-ifc-api-node.js'));
const MOO = 'C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc';
const DAK = 'C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc';
const UP = 'y';

function getBBox(api, mid, eid) {
  let mesh; try { mesh = api.GetFlatMesh(mid, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity,e=Infinity,f=-Infinity,ok=false;
  for (let gi=0; gi<mesh.geometries.size(); gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(mid,pl.geometryExpressID); const vs=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let i=0;i<vs.length;i+=6){ const x=vs[i]??0,y=vs[i+1]??0,z=vs[i+2]??0;
        const wx=m[0]*x+m[4]*y+m[8]*z+m[12],wy=m[1]*x+m[5]*y+m[9]*z+m[13],wz=m[2]*x+m[6]*y+m[10]*z+m[14];
        if(wx<a)a=wx;if(wx>b)b=wx;if(wy<c)c=wy;if(wy>d)d=wy;if(wz<e)e=wz;if(wz>f)f=wz;ok=true; } } finally { g?.delete(); } }
  return ok?{minX:a,maxX:b,minY:c,maxY:d,minZ:e,maxZ:f}:null;
}
function deriveWallAxes(dx,dy,dz){ const la=dx>=dz?'x':'z',ta=dx>=dz?'z':'x';
  return {heightAxis:'y',lengthAxis:la,thicknessAxis:ta}; }
const M=1000;
function toElem(api, mid, eid){ const bb=getBBox(api,mid,eid); if(!bb)return null;
  const dx=bb.maxX-bb.minX,dy=bb.maxY-bb.minY,dz=bb.maxZ-bb.minZ; const A=deriveWallAxes(dx,dy,dz);
  const mn={x:bb.minX*M,y:bb.minY*M,z:bb.minZ*M}, mx={x:bb.maxX*M,y:bb.maxY*M,z:bb.maxZ*M};
  const ext={x:dx,y:dy,z:dz}; const thin=['x','y','z'].reduce((p,q)=>ext[p]<=ext[q]?p:q);
  return {expressID:eid, length:0, height:Math.round(dy*M), openings:[], _thin:thin,
    wallOrigin:{lengthAxis:A.lengthAxis,heightAxis:'y',thicknessAxis:A.thicknessAxis,
      lengthStart:mn[A.lengthAxis],lengthEnd:mx[A.lengthAxis],heightStart:mn.y,heightEnd:mx.y,
      thicknessStart:mn[A.thicknessAxis],thicknessEnd:mx[A.thicknessAxis]}};
}
const bucket=(wo)=>`${wo.thicknessAxis}:${Math.round((wo.thicknessStart/1000)/50)*50*1000}`;

const api = new W.IfcAPI(); await api.Init();
const collect=(file,types)=>{ const mid=api.OpenModel(new Uint8Array(readFileSync(file)),{}); const out=[];
  for(const tn of types){ let code;try{code=api.GetTypeCodeFromName(tn);}catch{continue;} let v;try{v=api.GetLineIDsWithType(mid,code);}catch{continue;}
    for(let i=0;i<v.size();i++){ const el=toElem(api,mid,v.get(i)); if(el) out.push(el); } }
  api.CloseModel(mid); return out; };

const moo = collect(MOO,['IFCWALLSTANDARDCASE','IFCWALL']);
const via = collect(DAK,['IFCPLATE','IFCSLAB','IFCBUILDINGELEMENTPROXY','IFCCOVERING']);
console.log(`BIL-MOO wanden: ${moo.length} | VIA elementen: ${via.length}`);

function analyze(label, members){
  const groups={}; for(const m of members){ const k=bucket(m.wallOrigin); (groups[k]??=[]).push(m); }
  const rows=[];
  for(const [k,mem] of Object.entries(groups)){
    if(mem.length<3) continue;
    const tv={x:0,y:0,z:0}; for(const m of mem) tv[m._thin]++;
    const pl=fitFacadePlane(mem, UP);
    const guard = pl.nAxis===UP;             // nAxis===up → guard-tak (:80)
    const swap  = pl.uAxis!==UP;              // verticale gevel hoort uAxis=up; anders gewisseld
    rows.push({bucket:k, n:mem.length, thin:`x${tv.x}/y${tv.y}/z${tv.z}`,
      nAxis:pl.nAxis, uAxis:pl.uAxis, tAxis:pl.tAxis, coFacing:Math.round(pl.coFacingFrac*100),
      guard, swap});
  }
  rows.sort((a,b)=>b.n-a.n);
  console.log(`\n=== ${label} — ${rows.length} buckets (≥3 leden) ===`);
  console.log('bucket\tn\tthin(x/y/z)\tnAxis\tuAxis\ttAxis\tcoF%\tguard\tSWAP');
  for(const r of rows) console.log(`${r.bucket}\t${r.n}\t${r.thin}\t${r.nAxis}\t${r.uAxis}\t${r.tAxis}\t${r.coFacing}\t${r.guard?'JA':'-'}\t${r.swap?'⚠SWAP':'ok'}`);
  const swapped=rows.filter(r=>r.swap);
  console.log(`→ ${swapped.length}/${rows.length} buckets met uAxis≠up (bond-swap). Allemaal guard? ${swapped.every(r=>r.guard)}`);
}
analyze('BIL-MOO gevels ALLEEN', moo);
analyze('BIL-MOO + VIA samen (per bucket)', [...moo, ...via]);
