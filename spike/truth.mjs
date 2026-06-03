// SPIKE ground-truth: leest de IFC void/fill-relaties DIRECT (web-ifc node).
// Geen A/B-code. Dit is de referentie: welke openingen HOREN er te zijn.
// node truth.mjs <model.ifc> <out.json>
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const A_ROOT = resolve(__dirname, "../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A_ROOT + "/package.json"));
const WebIFC = require(resolve(A_ROOT, "node_modules/web-ifc/web-ifc-api-node.js"));

const [model, out] = process.argv.slice(2);
if (!model || !out) { console.error("usage: node truth.mjs <model.ifc> <out.json>"); process.exit(1); }

function aabb(api, mid, eid) {
  let mesh; try { mesh = api.GetFlatMesh(mid, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity,ok=false;
  for (let gi=0; gi<mesh.geometries.size(); gi++){
    const pl=mesh.geometries.get(gi); let geom;
    try{ geom=api.GetGeometry(mid,pl.geometryExpressID);
      const v=api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize());
      const m=pl.flatTransformation;
      for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];
        const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12];
        const wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13];
        const wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        if(wx<minX)minX=wx;if(wx>maxX)maxX=wx;if(wy<minY)minY=wy;if(wy>maxY)maxY=wy;if(wz<minZ)minZ=wz;if(wz>maxZ)maxZ=wz;ok=true;}
    } finally { geom?.delete(); }
  }
  return ok?{minX,minY,minZ,maxX,maxY,maxZ}:null;
}

const api = new WebIFC.IfcAPI();
await api.Init();
const buf = readFileSync(model);
const mid = api.OpenModel(new Uint8Array(buf), {});

const typeName = (eid)=>{ try{ const raw=api.GetRawLineData(mid,eid); return api.GetNameFromTypeCode(raw.type);}catch{return "?";} };

// fills: opening -> filler type
const fillType = {};
const relFills = api.GetLineIDsWithType(mid, WebIFC.IFCRELFILLSELEMENT);
for (let i=0;i<relFills.size();i++){ try{
  const rel=api.GetLine(mid,relFills.get(i),false);
  const op=rel?.RelatingOpeningElement?.value, fil=rel?.RelatedBuildingElement?.value;
  if(!op||!fil)continue;
  const tn=typeName(fil).toLowerCase();
  fillType[op]= tn.includes("window")?"raam": tn.includes("door")?"deur":"sparing";
}catch{} }

// voids: host -> [opening]
const voids = [];
const hostTypeCount = {};
const relVoids = api.GetLineIDsWithType(mid, WebIFC.IFCRELVOIDSELEMENT);
for (let i=0;i<relVoids.size();i++){ try{
  const rel=api.GetLine(mid,relVoids.get(i),false);
  const host=rel?.RelatingBuildingElement?.value, op=rel?.RelatedOpeningElement?.value;
  if(!host||!op)continue;
  const ht=typeName(host);
  hostTypeCount[ht]=(hostTypeCount[ht]||0)+1;
  const ob=aabb(api,mid,op);
  let wMm=null,hMm=null;
  if(ob){ const dx=ob.maxX-ob.minX,dy=ob.maxY-ob.minY,dz=ob.maxZ-ob.minZ;
    // model is Z-up (A detecteerde Z_UP): hoogte=dz, breedte=horizontale extent langs wand
    hMm=Math.round(dz*1000); wMm=Math.round(Math.max(dx,dy)*1000);
  }
  voids.push({ host, hostType: ht, opening: op, type: fillType[op] ?? "sparing", wMm, hMm });
}catch{} }

const counts = {
  IFCRELVOIDSELEMENT: relVoids.size(),
  IFCRELFILLSELEMENT: relFills.size(),
  IFCOPENINGELEMENT: (()=>{try{return api.GetLineIDsWithType(mid,WebIFC.IFCOPENINGELEMENT).size();}catch{return 0;}})(),
  IFCWINDOW: (()=>{try{return api.GetLineIDsWithType(mid,WebIFC.IFCWINDOW).size();}catch{return 0;}})(),
  IFCDOOR: (()=>{try{return api.GetLineIDsWithType(mid,WebIFC.IFCDOOR).size();}catch{return 0;}})(),
  voidsResolved: voids.length,
};
const typeDistrib = {}; for(const v of voids) typeDistrib[v.type]=(typeDistrib[v.type]||0)+1;
// hoeveel voids zitten op IFCWALL(STANDARDCASE) (= wat B überhaupt verwerkt)
const onWall = voids.filter(v=>/IFCWALL/i.test(v.hostType)).length;

writeFileSync(out, JSON.stringify({ model: basename(model), counts, hostTypeCount, typeDistrib, voidsOnIfcWall: onWall, voidsOnOtherHost: voids.length-onWall, voids }, null, 2));
api.CloseModel(mid);
console.log(`[truth] voids=${voids.length} onIFCWALL=${onWall} otherHost=${voids.length-onWall} types=${JSON.stringify(typeDistrib)} hosts=${JSON.stringify(hostTypeCount)}`);
console.log(`[truth] counts=${JSON.stringify(counts)}`);
