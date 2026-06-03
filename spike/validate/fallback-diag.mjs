// Diagnose void-loos terugvalpad (Kubistisch). Voor ELK meetellend raam/deur:
// ruwe placement, opgeloste wereldpositie, gekozen host, offset tot wandvlak,
// en de geprojecteerde plek. Gebruikt de ECHTE buildFrame/projectWorldPoints.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildFrame, detectUp, projectWorldPoints } from "../../src/lib/openingDerivation.js";

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

function firstMatrix(eid){ let m;try{m=api.GetFlatMesh(mid,eid);}catch{return null;} return (m&&m.geometries.size())?m.geometries.get(0).flatTransformation:null; }
function worldVerts(eid){ let mesh;try{mesh=api.GetFlatMesh(mid,eid);}catch{return null;} if(!mesh||!mesh.geometries.size())return null;
  const pts=[]; for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;
    try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;
      for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];pts.push([m[0]*lx+m[4]*ly+m[8]*lz+m[12],m[1]*lx+m[5]*ly+m[9]*lz+m[13],m[2]*lx+m[6]*ly+m[10]*lz+m[14]]);}}finally{g?.delete();}}
  return pts.length?pts:null; }
function centroid(pts){const c=[0,0,0];for(const p of pts){c[0]+=p[0];c[1]+=p[1];c[2]+=p[2];}return [c[0]/pts.length,c[1]/pts.length,c[2]/pts.length];}

const wallIds=[]; for(const t of [W.IFCWALLSTANDARDCASE,W.IFCWALL]){const v=api.GetLineIDsWithType(mid,t);for(let i=0;i<v.size();i++)wallIds.push(v.get(i));}
const up=detectUp(api,mid,wallIds);
const frames=new Map(); for(const id of wallIds){const f=buildFrame(api,mid,id,up);if(f)frames.set(id,f);}

// OUD (huidige module): off-plane drempel = wanddikte (te ruim → vloeren als host)
function assignHostOld(c){ let best=null,bestScore=Infinity;
  for(const [host,fr] of frames){
    const dl=dot(sub(c,fr.O),fr.L),dh=dot(sub(c,fr.O),fr.H),dt=Math.abs(dot(sub(c,fr.O),fr.T));
    const inL=dl>=fr.lMin-0.3&&dl<=fr.lMax+0.3, inH=dh>=fr.hMin-0.3&&dh<=fr.hMax+0.3;
    if(!inL||!inH)continue; const thick=fr.tMax-fr.tMin; if(dt>thick+0.5)continue;
    if(dt<bestScore){bestScore=dt;best=host;} }
  return best; }
// NIEUW (voorstel): host moet wand-achtig zijn (verticale extent >= 1m → geen
// vloer/dak) en het raam/deur moet dicht bij het wandvlak liggen (absolute cap).
const MIN_WALL_H = 1.0, MAX_OFFPLANE = 0.5;
function assignHost(c){ let best=null,bestScore=Infinity;
  for(const [host,fr] of frames){
    if((fr.hMax-fr.hMin) < MIN_WALL_H) continue;        // geen vloer/dak als host
    const dl=dot(sub(c,fr.O),fr.L),dh=dot(sub(c,fr.O),fr.H),dt=Math.abs(dot(sub(c,fr.O),fr.T));
    const inL=dl>=fr.lMin-0.3&&dl<=fr.lMax+0.3, inH=dh>=fr.hMin-0.3&&dh<=fr.hMax+0.3;
    if(!inL||!inH)continue; if(dt>MAX_OFFPLANE)continue; // absolute drempel
    if(dt<bestScore){bestScore=dt;best=host;} }
  return best; }

let totalOld=0,bigOld=0,totalNew=0,bigNew=0,changed=0,dropped=0;
for(const [t,typ] of [[W.IFCWINDOW,'raam'],[W.IFCDOOR,'deur']]){
  const v=api.GetLineIDsWithType(mid,t);
  for(let i=0;i<v.size();i++){const eid=v.get(i);
    const ov=worldVerts(eid); if(!ov)continue;
    const c=centroid(ov);
    const ho=assignHostOld(c), hn=assignHost(c);
    if(ho!=null){totalOld++; const dt=Math.abs(dot(sub(c,frames.get(ho).O),frames.get(ho).T)); if(dt*1000>150)bigOld++;}
    if(hn!=null){totalNew++; const fr=frames.get(hn); const dt=Math.abs(dot(sub(c,fr.O),fr.T)); const offMm=Math.round(dt*1000); if(offMm>150)bigNew++;
      const proj=projectWorldPoints(ov,fr);
      console.log(`${typ} ${eid} → host ${hn} | offset=${offMm}mm hostH=${Math.round((fr.hMax-fr.hMin)*1000)}mm hostT=${Math.round((fr.tMax-fr.tMin)*1000)}mm | proj x=${proj.x} y=${proj.y} ${proj.breedte}x${proj.hoogte}mm`);
    }
    if(ho!==hn){ if(hn==null)dropped++; else changed++; }
  }
}
console.log(`\nOUD: gekoppeld=${totalOld}, offset>150mm=${bigOld}`);
console.log(`NIEUW: gekoppeld=${totalNew}, offset>150mm=${bigNew} | gewijzigde host=${changed}, niet meer gekoppeld=${dropped}`);
api.CloseModel(mid);
