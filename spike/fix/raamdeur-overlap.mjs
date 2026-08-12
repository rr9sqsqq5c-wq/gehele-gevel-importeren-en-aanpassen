// READ-ONLY — meet voor de raam+deur-wanden of de RAAM-void en DEUR-void elkaar overlappen in de
// gevelvlak-assen (de merge-conditie is overlap>50 in BEIDE in-vlak-assen). Zo ja → mergeTwo draait
// en mijn unie-fix is relevant; zo nee → ze worden los geknipt (geen concave-bug).
import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const mm = v => Math.round(v * 1000);

function bbox(eID) {
  let mesh; try { mesh = api.GetFlatMesh(bid, eID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let b = [1/0,1/0,1/0,-1/0,-1/0,-1/0];
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const pl = mesh.geometries.get(gi); let g;
    try { g = api.GetGeometry(bid, pl.geometryExpressID);
      const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()); const m = pl.flatTransformation;
      for (let vi = 0; vi < v.length; vi += 6) { const x=v[vi],y=v[vi+1],z=v[vi+2];
        const w=[m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
        for (let k=0;k<3;k++){ if(w[k]<b[k])b[k]=w[k]; if(w[k]>b[k+3])b[k+3]=w[k]; } }
    } catch {} finally { g?.delete(); }
  }
  return b[0]===1/0?null:b;
}

const fillType = {};
const rf = api.GetLineIDsWithType(bid, wi.IFCRELFILLSELEMENT);
for (let i=0;i<rf.size();i++){ const r=api.GetLine(bid,rf.get(i),false);
  const opId=r?.RelatingOpeningElement?.value, beId=r?.RelatedBuildingElement?.value; if(!opId||!beId)continue;
  const t=api.GetLineType(bid,beId); fillType[opId]=(t===wi.IFCDOOR)?'deur':(t===wi.IFCWINDOW)?'raam':'?'; }

const rv = api.GetLineIDsWithType(bid, wi.IFCRELVOIDSELEMENT);
const wallVoids = {};
for (let i=0;i<rv.size();i++){ const r=api.GetLine(bid,rv.get(i),false);
  const wallId=r?.RelatingBuildingElement?.value, opId=r?.RelatedOpeningElement?.value; if(!wallId||!opId)continue;
  (wallVoids[wallId]=wallVoids[wallId]||[]).push({opId, type: fillType[opId] ?? 'leeg'}); }

const AX=['X','Y','Z'];
let n=0;
for (const [wallId, voids] of Object.entries(wallVoids)) {
  const rams = voids.filter(v=>v.type==='raam'), deuren = voids.filter(v=>v.type==='deur');
  if (!rams.length || !deuren.length) continue;
  if (n++ >= 6) break;
  console.log(`\n=== wand ${wallId}: ${rams.length} raam + ${deuren.length} deur ===`);
  const boxes = [...rams, ...deuren].map(v => ({ ...v, b: bbox(v.opId) })).filter(v=>v.b);
  for (const v of boxes) console.log(`  ${v.type} #${v.opId}  X[${mm(v.b[0])}..${mm(v.b[3])}] Y[${mm(v.b[1])}..${mm(v.b[4])}] Z[${mm(v.b[2])}..${mm(v.b[5])}]  (bxbyz ${mm(v.b[3]-v.b[0])}×${mm(v.b[4]-v.b[1])}×${mm(v.b[5]-v.b[2])})`);
  // overlap raam[0] vs deur[0] per as
  const R = boxes.find(v=>v.type==='raam')?.b, D = boxes.find(v=>v.type==='deur')?.b;
  if (R && D) {
    const ov = k => mm(Math.min(R[k+3],D[k+3]) - Math.max(R[k],D[k]));
    console.log(`  overlap raam↔deur:  X=${ov(0)}  Y=${ov(1)}  Z=${ov(2)}  → merge (twee in-vlak-assen >50)? de dunne as = dikte`);
  }
}
api.CloseModel(bid);
