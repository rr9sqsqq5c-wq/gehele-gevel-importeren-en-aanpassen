// Test de voorgestelde fix voor het void-loze terugvalpad op Kubistisch:
//  (a) robuuste up-as uit window/door tall-axis (i.p.v. detectUp kolom-heuristiek),
//  (b) host moet wand-achtig zijn (verticale extent >= 1m) + absolute off-plane cap.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildFrame, projectWorldPoints } from "../../src/lib/openingDerivation.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A + "/package.json"));
const W = require(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const F = "C:/Users/MurkAnneKooistraKooi/AppData/Local/Microsoft/Windows/INetCache/Content.Outlook/2I1IYVNL/Kubistische woning export IFC.ifc";
const api = new W.IfcAPI(); await api.Init();
const mid = api.OpenModel(new Uint8Array(readFileSync(F)), {});
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function wv(eid){let m;try{m=api.GetFlatMesh(mid,eid);}catch{return null;}if(!m||!m.geometries.size())return null;const p=[];
  for(let gi=0;gi<m.geometries.size();gi++){const pl=m.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const t=pl.flatTransformation;
    for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];p.push([t[0]*lx+t[4]*ly+t[8]*lz+t[12],t[1]*lx+t[5]*ly+t[9]*lz+t[13],t[2]*lx+t[6]*ly+t[10]*lz+t[14]]);}}finally{g?.delete();}}return p.length?p:null;}
function ctr(p){const c=[0,0,0];for(const q of p){c[0]+=q[0];c[1]+=q[1];c[2]+=q[2];}return[c[0]/p.length,c[1]/p.length,c[2]/p.length];}

// (a) robuuste up: stem op de langste wereld-as van window/door-elementen
function detectUpRobust(){ const vote=[0,0,0];
  for(const t of [W.IFCWINDOW,W.IFCDOOR]){const v=api.GetLineIDsWithType(mid,t);
    for(let i=0;i<v.size();i++){const p=wv(v.get(i));if(!p)continue;let a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity];
      for(const q of p)for(let k=0;k<3;k++){if(q[k]<a[k])a[k]=q[k];if(q[k]>b[k])b[k]=q[k];}
      const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]]; let mx=0;for(let k=1;k<3;k++)if(d[k]>d[mx])mx=k; vote[mx]++;}}
  const ax=vote.indexOf(Math.max(...vote)); return [ax===0?1:0,ax===1?1:0,ax===2?1:0];
}
const up=detectUpRobust();
console.log("robuuste up-as =", up[0]?'X':up[1]?'Y':'Z', "(votes via window/door tall-axis)");

const wallIds=[]; for(const t of [W.IFCWALLSTANDARDCASE,W.IFCWALL]){const v=api.GetLineIDsWithType(mid,t);for(let i=0;i<v.size();i++)wallIds.push(v.get(i));}
const frames=new Map(); for(const id of wallIds){const f=buildFrame(api,mid,id,up);if(f)frames.set(id,f);}

const MIN_WALL_H=1.0, MAX_OFFPLANE=0.5;
function assignHost(c){let best=null,bs=Infinity;
  for(const [host,fr] of frames){ if((fr.hMax-fr.hMin)<MIN_WALL_H)continue;
    const dl=dot(sub(c,fr.O),fr.L),dh=dot(sub(c,fr.O),fr.H),dt=Math.abs(dot(sub(c,fr.O),fr.T));
    if(!(dl>=fr.lMin-0.3&&dl<=fr.lMax+0.3&&dh>=fr.hMin-0.3&&dh<=fr.hMax+0.3))continue;
    if(dt>MAX_OFFPLANE)continue; if(dt<bs){bs=dt;best=host;} } return best; }

let tot=0,big=0,drop=0;
for(const [t,typ] of [[W.IFCWINDOW,'raam'],[W.IFCDOOR,'deur']]){const v=api.GetLineIDsWithType(mid,t);
  for(let i=0;i<v.size();i++){const eid=v.get(i);const p=wv(eid);if(!p)continue;const c=ctr(p);const h=assignHost(c);
    if(h==null){drop++;continue;} const fr=frames.get(h);const dt=Math.round(Math.abs(dot(sub(c,fr.O),fr.T))*1000);const pr=projectWorldPoints(p,fr);
    tot++; if(dt>150)big++;
    console.log(`${typ} ${eid} → host ${h} | offset=${dt}mm hostH=${Math.round((fr.hMax-fr.hMin)*1000)}mm hostT=${Math.round((fr.tMax-fr.tMin)*1000)}mm | proj x=${pr.x} y=${pr.y} ${pr.breedte}x${pr.hoogte}mm`);
  }}
console.log(`\nGEKOPPELD=${tot} | offset>150mm(zwevend)=${big} | niet gekoppeld=${drop}`);
api.CloseModel(mid);
