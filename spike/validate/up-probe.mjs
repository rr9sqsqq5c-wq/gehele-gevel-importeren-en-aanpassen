import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectUp } from "../../src/lib/openingDerivation.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A + "/package.json"));
const W = require(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const api = new W.IfcAPI(); await api.Init();
const MODELS = {
  "BIL-MOO": "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc",
  "Helmond": "C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/je-bent-een-senior-software-arch-72bb/backend/uploads/7d0f61bd-a89a-4912-8304-7d872a2caa11/M2502_Helmond Toren Gevel studie.ifc",
  "Kubistisch": "C:/Users/MurkAnneKooistraKooi/AppData/Local/Microsoft/Windows/INetCache/Content.Outlook/2I1IYVNL/Kubistische woning export IFC.ifc",
};
function dims(api,mid,eid){ let m;try{m=api.GetFlatMesh(mid,eid);}catch{return null;} if(!m||!m.geometries.size())return null;
  let a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity];
  for(let gi=0;gi<m.geometries.size();gi++){const pl=m.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const t=pl.flatTransformation;
    for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];const w=[t[0]*lx+t[4]*ly+t[8]*lz+t[12],t[1]*lx+t[5]*ly+t[9]*lz+t[13],t[2]*lx+t[6]*ly+t[10]*lz+t[14]];for(let k=0;k<3;k++){if(w[k]<a[k])a[k]=w[k];if(w[k]>b[k])b[k]=w[k];}}}finally{g?.delete();}}
  return [b[0]-a[0],b[1]-a[1],b[2]-a[2]]; }
for(const [name,f] of Object.entries(MODELS)){
  const mid=api.OpenModel(new Uint8Array(readFileSync(f)),{});
  const wallIds=[]; for(const t of [W.IFCWALLSTANDARDCASE,W.IFCWALL]){const v=api.GetLineIDsWithType(mid,t);for(let i=0;i<v.size();i++)wallIds.push(v.get(i));}
  // som van verticale extent per as over walls = welke as is "hoogte"
  let sx=0,sy=0,sz=0,n=0;
  for(const id of wallIds.slice(0,150)){const d=dims(api,mid,id);if(!d)continue;sx+=d[0];sy+=d[1];sz+=d[2];n++;}
  const up=detectUp(api,mid,wallIds);
  // doors: welke as is hun langste (hoogte)?
  let dyTall=0,dzTall=0,dn=0; const dv=api.GetLineIDsWithType(mid,W.IFCDOOR);
  for(let i=0;i<Math.min(20,dv.size());i++){const d=dims(api,mid,dv.get(i));if(!d)continue;dn++;if(d[1]>=d[2]&&d[1]>=d[0])dyTall++;else if(d[2]>=d[1]&&d[2]>=d[0])dzTall++;}
  console.log(`${name}: detectUp=${up[2]===1?'Z':'Y'} | wand-extent som X=${sx.toFixed(1)} Y=${sy.toFixed(1)} Z=${sz.toFixed(1)} (grootste=hoogte) | deuren tall-in-Y=${dyTall} tall-in-Z=${dzTall} van ${dn}`);
  api.CloseModel(mid);
}
