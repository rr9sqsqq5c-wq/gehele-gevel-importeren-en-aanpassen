import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A + "/package.json"));
const W = require(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const api = new W.IfcAPI(); await api.Init();
function bb(mid,eid){let m;try{m=api.GetFlatMesh(mid,eid);}catch{return null;}if(!m||!m.geometries.size())return null;let a=[Infinity,Infinity,Infinity],c=[-Infinity,-Infinity,-Infinity],ok=false;for(let gi=0;gi<m.geometries.size();gi++){const pl=m.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const t=pl.flatTransformation;for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];const w=[t[0]*lx+t[4]*ly+t[8]*lz+t[12],t[1]*lx+t[5]*ly+t[9]*lz+t[13],t[2]*lx+t[6]*ly+t[10]*lz+t[14]];for(let k=0;k<3;k++){if(w[k]<a[k])a[k]=w[k];if(w[k]>c[k])c[k]=w[k];}ok=true;}}finally{g?.delete();}}return ok?{dx:Math.round((c[0]-a[0])*1000),dy:Math.round((c[1]-a[1])*1000),dz:Math.round((c[2]-a[2])*1000),ng:m.geometries.size()}:null;}

// 1) GFRC: welke as is de hoogte? extents van de 89 wanden + slab-normalen
const GFRC = "C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/je-bent-een-senior-software-arch-72bb/backend/uploads/c316820b-943c-40e1-85a4-2d85ea64420f/250361_GFRC-elementen-Dunea-SPS.ifc";
let mid = api.OpenModel(new Uint8Array(readFileSync(GFRC)), {});
const ids=[];for(const t of [W.IFCWALLSTANDARDCASE,W.IFCWALL]){const v=api.GetLineIDsWithType(mid,t);for(let i=0;i<v.size();i++)ids.push(v.get(i));}
console.log("GFRC wanden:",ids.size?ids.size:ids.length);
let sy=0,sz=0,sx=0; const histY={},histZ={};
for(const id of ids){const d=bb(mid,id);if(!d)continue;sx+=d.dx;sy+=d.dy;sz+=d.dz;
  const by=Math.round(d.dy/100)*100, bz=Math.round(d.dz/100)*100; histY[by]=(histY[by]||0)+1; histZ[bz]=(histZ[bz]||0)+1;}
console.log("GFRC extent-som mm: X=",sx,"Y=",sy,"Z=",sz);
console.log("GFRC eerste 8 wand-extents (dx,dy,dz mm):");
for(const id of ids.slice?ids.slice(0,8):ids.slice(0,8)){const d=bb(mid,id);console.log("  #"+id,d);}
const top=(h)=>Object.entries(h).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`${k}mm×${v}`).join(", ");
console.log("GFRC top Y-extents:",top(histY));
console.log("GFRC top Z-extents:",top(histZ));
// slabs?
const slabN=(()=>{try{return api.GetLineIDsWithType(mid,W.IFCSLAB).size();}catch{return 0;}})();
console.log("GFRC IFCSLAB count:",slabN);
api.CloseModel(mid);

// 2) #53023 raw extents (BIL) — controleer de 'verdubbeling'
const BIL="C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc";
mid=api.OpenModel(new Uint8Array(readFileSync(BIL)),{});
console.log("\nBIL #53023 raw bb:",bb(mid,53023));
api.CloseModel(mid);
