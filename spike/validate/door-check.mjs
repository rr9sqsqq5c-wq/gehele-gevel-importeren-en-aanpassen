// Diagnose: welke Kubistisch-deur koppelt de terugval NIET, en waarom?
// Gebruikt de ECHTE buildFrame uit de module + dezelfde assignHost-criteria.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildFrame, detectUp } from "../../src/lib/openingDerivation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A + "/package.json"));
const W = require(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const F = "C:/Users/MurkAnneKooistraKooi/AppData/Local/Microsoft/Windows/INetCache/Content.Outlook/2I1IYVNL/Kubistische woning export IFC.ifc";

const api = new W.IfcAPI(); await api.Init();
const mid = api.OpenModel(new Uint8Array(readFileSync(F)), {});
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

function centroid(eid) {
  let mesh; try { mesh = api.GetFlatMesh(mid, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let cx=0,cy=0,cz=0,n=0;
  for (let gi=0; gi<mesh.geometries.size(); gi++){ const pl=mesh.geometries.get(gi); let g;
    try { g=api.GetGeometry(mid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];
        cx+=m[0]*lx+m[4]*ly+m[8]*lz+m[12]; cy+=m[1]*lx+m[5]*ly+m[9]*lz+m[13]; cz+=m[2]*lx+m[6]*ly+m[10]*lz+m[14]; n++;}
    } finally { g?.delete(); } }
  return n?[cx/n,cy/n,cz/n]:null;
}
const name=(eid)=>{try{return String(val(api.GetLine(mid,eid,false)?.Name)??"");}catch{return"";}};

const wallIds=[]; for(const t of [W.IFCWALLSTANDARDCASE,W.IFCWALL]){const v=api.GetLineIDsWithType(mid,t);for(let i=0;i<v.size();i++)wallIds.push(v.get(i));}
const up=detectUp(api,mid,wallIds);
const frames=new Map(); for(const id of wallIds){const f=buildFrame(api,mid,id,up); if(f)frames.set(id,f);}

const doors=[]; { const v=api.GetLineIDsWithType(mid,W.IFCDOOR); for(let i=0;i<v.size();i++)doors.push(v.get(i)); }
console.log(`deuren=${doors.length} wanden-met-frame=${frames.size}`);

for(const d of doors){
  const c=centroid(d); if(!c){console.log(`deur ${d} "${name(d)}": GEEN geometrie`);continue;}
  let matched=null, near=[];
  for(const [host,fr] of frames){
    const dl=dot(sub(c,fr.O),fr.L), dh=dot(sub(c,fr.O),fr.H), dt=Math.abs(dot(sub(c,fr.O),fr.T));
    const inL=dl>=fr.lMin-0.3&&dl<=fr.lMax+0.3, inH=dh>=fr.hMin-0.3&&dh<=fr.hMax+0.3;
    const thick=fr.tMax-fr.tMin;
    if(inL&&inH&&dt<=thick+0.5){ if(!matched||dt<matched.dt)matched={host,dt:+dt.toFixed(3)}; }
    else if(inL&&inH){ near.push({host,dt:+dt.toFixed(3),thick:+thick.toFixed(3)}); }
  }
  if(matched) continue; // gekoppeld → ok
  console.log(`NIET-GEKOPPELDE deur ${d} "${name(d)}": geen wand binnen criteria.`);
  near.sort((a,b)=>a.dt-b.dt);
  console.log(`  dichtstbijzijnde in-vlak wanden (te ver van vlak): ${JSON.stringify(near.slice(0,3))}`);
}
api.CloseModel(mid);
