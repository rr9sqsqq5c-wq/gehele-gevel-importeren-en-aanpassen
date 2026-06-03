// READ-ONLY diagnose: extents + as-toewijzing voor HSB_272.5-wanden in BIL-MOO.
// Replica (1:1) van getBBox + deriveWallAxes uit src/lib/ifc.js, zodat de
// uitkomst exact het oude pad weergeeft. Geen codewijziging.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A + "/package.json"));
const W = require(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const F = "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc";
const api = new W.IfcAPI(); await api.Init();
const mid = api.OpenModel(new Uint8Array(readFileSync(F)), {});
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;

// ── 1:1 kopie van getBBox (ifc.js:414) ──────────────────────────────────────────
function getBBox(modelID, expressID) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, expressID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity,ok=false,localXDir=null,localYDir=null;
  for (let gi=0; gi<mesh.geometries.size(); gi++){ const placed=mesh.geometries.get(gi); let geom;
    try { geom=api.GetGeometry(modelID,placed.geometryExpressID); const verts=api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize()); const m=placed.flatTransformation;
      if(!localXDir) localXDir={x:m[0],y:m[1],z:m[2]};
      if(!localYDir) localYDir={x:m[4],y:m[5],z:m[6]};
      for(let vi=0; vi<verts.length; vi+=6){ const lx=verts[vi],ly=verts[vi+1],lz=verts[vi+2];
        const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12], wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13], wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        if(wx<minX)minX=wx;if(wx>maxX)maxX=wx;if(wy<minY)minY=wy;if(wy>maxY)maxY=wy;if(wz<minZ)minZ=wz;if(wz>maxZ)maxZ=wz;ok=true; } }
    finally { geom?.delete(); } }
  return ok ? { minX,maxX,minY,maxY,minZ,maxZ,localXDir,localYDir } : null;
}
// ── 1:1 kopie van deriveWallAxes (ifc.js:734) ────────────────────────────────────
function deriveWallAxes(dx, dy, dz, heightAxis) {
  if (heightAxis === 'z_neg') heightAxis = 'z';
  if (heightAxis === 'y') {
    const lengthAxis=dx>=dz?'x':'z', thicknessAxis=dx>=dz?'z':'x';
    return { heightAxis, lengthAxis, thicknessAxis, length:Math.round(Math.max(dx,dz)*1000), height:Math.round(dy*1000), thickness:Math.round(Math.min(dx,dz)*1000) };
  }
  const lengthAxis=dx>=dy?'x':'y', thicknessAxis=dx>=dy?'y':'x';
  return { heightAxis:'z', lengthAxis, thicknessAxis, length:Math.round(Math.max(dx,dy)*1000), height:Math.round(dz*1000), thickness:Math.round(Math.min(dx,dy)*1000) };
}

const typeMap = {}; // wallId → typeName via IFCRELDEFINESBYTYPE
{ const v=api.GetLineIDsWithType(mid,W.IFCRELDEFINESBYTYPE);
  for(let i=0;i<v.size();i++){try{const r=api.GetLine(mid,v.get(i),false);const tRef=val(r?.RelatingType);if(!tRef)continue;const t=api.GetLine(mid,tRef,false);const tn=val(t?.Name);const rel=r?.RelatedObjects;if(!rel||!tn)continue;for(const ro of rel){const id=val(ro);if(id)typeMap[id]=tn;}}catch{}} }

const wallIds=[]; for(const t of [W.IFCWALLSTANDARDCASE,W.IFCWALL]){const v=api.GetLineIDsWithType(mid,t);for(let i=0;i<v.size();i++)wallIds.push(v.get(i));}

// globale extent-som per as (benadering van detectModelUpAxis bbox-vote)
let SX=0,SY=0,SZ=0;
const samples={ hsb:[], other:[] };
for(const id of wallIds){ const bb=getBBox(mid,id); if(!bb)continue;
  const dx=bb.maxX-bb.minX, dy=bb.maxY-bb.minY, dz=bb.maxZ-bb.minZ; SX+=dx;SY+=dy;SZ+=dz;
  const tn=typeMap[id]||''; const isHSB=/272\.5/.test(tn);
  const rec={id,tn,dx:Math.round(dx*1000),dy:Math.round(dy*1000),dz:Math.round(dz*1000),
    lx:bb.localXDir,ly:bb.localYDir};
  if(isHSB&&samples.hsb.length<6)samples.hsb.push(rec);
  else if(!isHSB&&!/272\.5|182\.5/.test(tn)&&samples.other.length<4)samples.other.push(rec);
}
console.log(`globale wand-extent-som (mm): X=${Math.round(SX*1000)} Y=${Math.round(SY*1000)} Z=${Math.round(SZ*1000)} → grootste = vermoedelijke hoogte-as`);
const upAxis = (SZ>=SX&&SZ>=SY)?'z':(SY>=SX?'y':'x');
console.log(`→ benaderde model-up (grootste extent-som) = '${upAxis}'  (detectModelUpAxis, ifc.js:542, beslist dit echt)\n`);

function dump(label, recs){
  console.log(`=== ${label} ===`);
  for(const r of recs){
    const ax = deriveWallAxes(r.dx/1000, r.dy/1000, r.dz/1000, upAxis);
    const fmt=(d)=>`{x:${d.x.toFixed(2)},y:${d.y.toFixed(2)},z:${d.z.toFixed(2)}}`;
    console.log(`#${r.id} ${r.tn}`);
    console.log(`   extents mm: dx=${r.dx} dy=${r.dy} dz=${r.dz}`);
    console.log(`   localXDir=${fmt(r.lx)} localYDir=${fmt(r.ly)}`);
    console.log(`   → lengthAxis=${ax.lengthAxis} heightAxis=${ax.heightAxis} thicknessAxis=${ax.thicknessAxis}`);
    console.log(`   → length=${ax.length} height=${ax.height} thickness=${ax.thickness}  (tooltip toont length×height = ${ax.length}×${ax.height})`);
    console.log(`   gevelvlak = lengthAxis×heightAxis = ${ax.lengthAxis}×${ax.heightAxis}; normaal = thicknessAxis ${ax.thicknessAxis}`);
  }
  console.log("");
}
dump("HSB_272.5 (buitengevel)", samples.hsb);
dump("Andere wanden (контраст)", samples.other);
api.CloseModel(mid);
