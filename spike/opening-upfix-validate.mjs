import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectUp, detectUpRobust, buildFrame, deriveOpeningsCore } from "../src/lib/openingDerivation.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(pathToFileURL(resolve(__dirname, "../package.json")));
const W = require(resolve(__dirname, "../node_modules/web-ifc/web-ifc-api-node.js"));
const BIL = "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc";
const PROJ = "C:/Users/MurkAnneKooistraKooi/Downloads/BIL-MOO-A-ZZ-PBP_gevelbekleding (33).json";

const api = new W.IfcAPI(); await api.Init();
const modelID = api.OpenModel(new Uint8Array(readFileSync(BIL)), {});
const wallIds = [];
for (const t of ['IFCWALLSTANDARDCASE','IFCWALL']) { const c=api.GetTypeCodeFromName(t); const v=api.GetLineIDsWithType(modelID,c); for(let i=0;i<v.size();i++) wallIds.push(v.get(i)); }

// up-vectoren: vlag UIT = detectUp (kolomheuristiek); vlag AAN = model-up uit wand-skelet
const upOff = detectUp(api, modelID, wallIds);             // = wat applyProjectedOpenings nu kiest
const upOn  = [0,1,0];                                     // = modelUpFromWalls(walls) voor de Y-up BIL (heightAxis 'y')
const axName=(u)=>u[0]?'X':u[1]?'Y':'Z';
console.log(`vlag UIT up = ${axName(upOff)} (detectUp)  |  vlag AAN up = ${axName(upOn)} (model-up uit wand-skelet)`);

async function measure(up) {
  const { byHost } = await deriveOpeningsCore(api, W, modelID, wallIds, up);
  let total=0, floatOut=0, oversize=0; const byId=new Map();
  for (const [host, ops] of byHost) {
    const fr = buildFrame(api, modelID, host, up); if(!fr) continue;
    const wallLen=Math.round((fr.lMax-fr.lMin)*1000), wallHgt=Math.round((fr.hMax-fr.hMin)*1000);
    for (const o of ops) {
      total++;
      if (o.x<-50||o.y<-50||(o.x+o.breedte)>wallLen+50||(o.y+o.hoogte)>wallHgt+50) floatOut++;
      if (o.breedte>wallLen+50||o.hoogte>wallHgt+50) oversize++;
      byId.set(String(host)+":"+o.id, o);
    }
  }
  return { total, floatOut, oversize, byId };
}

const off = await measure(upOff);
const on  = await measure(upOn);
console.log(`\n--- A. VLAG UIT (regressie-waakhond) ---`);
console.log(`  openingen=${off.total} zwevend=${off.floatOut} oversize=${off.oversize}  → ${off.floatOut===25&&off.oversize===25?'GROEN ✅ ongewijzigd (25/25)':'CHECK: '+off.floatOut+'/'+off.oversize}`);
console.log(`--- B. VLAG AAN (oorzaak weg) ---`);
console.log(`  openingen=${on.total} zwevend=${on.floatOut} oversize=${on.oversize}  → ${on.floatOut===0&&on.oversize===0?'GROEN ✅ 0 zwevend / 0 oversize':'ROOD ❌'}`);

// --- C. CORRECTHEIDS-ANKER: vlag-AAN openingen ≡ bevroren legacy-openingen (33).json ---
const proj = JSON.parse(readFileSync(PROJ,"utf8"));
const frozen = new Map(); // host:openingId(native) → {x,y,breedte,hoogte}
for (const w of proj.walls) for (const o of (w.openings??[])) if(/^\d+$/.test(String(o.id))) frozen.set(String(w.expressID)+":"+o.id, o);
let matched=0, comparedN=0, mism=[];
for (const [k, oNew] of on.byId) {
  const oFro = frozen.get(k); if(!oFro) continue;
  comparedN++;
  const tol=60;
  const ok = Math.abs(oNew.x-oFro.x)<=tol && Math.abs(oNew.y-oFro.y)<=tol && Math.abs(oNew.breedte-oFro.breedte)<=tol && Math.abs(oNew.hoogte-oFro.hoogte)<=tol;
  if (ok) matched++; else if (mism.length<6) mism.push({k, neu:[oNew.x,oNew.y,oNew.breedte,oNew.hoogte], fro:[oFro.x,oFro.y,oFro.breedte,oFro.hoogte]});
}
console.log(`--- C. CORRECTHEIDS-ANKER vs bevroren (33).json ---`);
console.log(`  vergeleken (zelfde host:opening-id): ${comparedN} | match (±60mm): ${matched}`);
const ref = on.byId.get("53023:64199");
if (ref) console.log(`  host #53023 raam — vers: x=${ref.x} y=${ref.y} b=${ref.breedte} h=${ref.hoogte} | bevroren JSON: x=1940 y=840 b=1160 h=1740`);
for (const m of mism) console.log(`    mismatch ${m.k}: vers=${m.neu} bevroren=${m.fro}`);
console.log(`  → ${comparedN>0 && matched/comparedN>0.9 ? 'GROEN ✅ verse her-afleiding ≡ bevroren legacy (correct)' : 'CHECK'}`);
api.CloseModel(modelID);

// --- EXTRA: C-match onder VLAG UIT (up=Z) vs AAN (up=Y) + L-flip-detectie ---
console.log("\n=== EXTRA-analyse ===");
function cMatch(meas, up) {
  let comp=0, m=0, lflip=0, other=0;
  for (const [k,oNew] of meas.byId) {
    const oFro = frozen.get(k); if(!oFro) continue; comp++;
    const tol=60;
    const exact = Math.abs(oNew.x-oFro.x)<=tol && Math.abs(oNew.y-oFro.y)<=tol && Math.abs(oNew.breedte-oFro.breedte)<=tol && Math.abs(oNew.hoogte-oFro.hoogte)<=tol;
    if (exact) { m++; continue; }
    // y+maat goed maar x fout → L-flip-kandidaat?
    const sizeYok = Math.abs(oNew.y-oFro.y)<=tol && Math.abs(oNew.breedte-oFro.breedte)<=tol && Math.abs(oNew.hoogte-oFro.hoogte)<=tol;
    if (sizeYok && Math.abs(oNew.x-oFro.x)>tol) lflip++; else other++;
  }
  return { comp, m, lflip, other };
}
const cOff = cMatch(off);
const cOn  = cMatch(on);
console.log(`C-match VLAG UIT (up=Z): ${cOff.m}/${cOff.comp}  | L-flip-kandidaten: ${cOff.lflip} | overig fout: ${cOff.other}`);
console.log(`C-match VLAG AAN (up=Y): ${cOn.m}/${cOn.comp}  | L-flip-kandidaten: ${cOn.lflip} | overig fout: ${cOn.other}`);
console.log(`→ up-as-fix verbetert exacte match van ${cOff.m} naar ${cOn.m}; resterende ${cOn.lflip} = X gespiegeld (L-as-richting), ${cOn.other} overig.`);
