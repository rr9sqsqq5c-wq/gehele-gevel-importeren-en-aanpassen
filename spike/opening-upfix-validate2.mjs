import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectUp, buildFrame, deriveOpeningsCore } from "../src/lib/openingDerivation.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(pathToFileURL(resolve(__dirname, "../package.json")));
const W = require(resolve(__dirname, "../node_modules/web-ifc/web-ifc-api-node.js"));
const BIL = "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc";
const PROJ = "C:/Users/MurkAnneKooistraKooi/Downloads/BIL-MOO-A-ZZ-PBP_gevelbekleding (33).json";

const api = new W.IfcAPI(); await api.Init();
const modelID = api.OpenModel(new Uint8Array(readFileSync(BIL)), {});
const wallIds = [];
for (const t of ['IFCWALLSTANDARDCASE','IFCWALL']) { const c=api.GetTypeCodeFromName(t); const v=api.GetLineIDsWithType(modelID,c); for(let i=0;i<v.size();i++) wallIds.push(v.get(i)); }

const proj = JSON.parse(readFileSync(PROJ,"utf8"));
const woById = new Map(proj.walls.map(w=>[String(w.expressID), w.wallOrigin]));
const frozen = new Map();
for (const w of proj.walls) for (const o of (w.openings??[])) if(/^\d+$/.test(String(o.id))) frozen.set(String(w.expressID)+":"+o.id, o);

// FIX deel 2 — exacte replica van de skeleton-herprojectie in applyProjectedOpenings
function skeletonReproject(aabb, wo) {
  const M=1000;
  const lo=(ax)=>(ax==='x'?aabb.minX:ax==='y'?aabb.minY:aabb.minZ)*M;
  const hi=(ax)=>(ax==='x'?aabb.maxX:ax==='y'?aabb.maxY:aabb.maxZ)*M;
  const oLmin=lo(wo.lengthAxis), oLmax=hi(wo.lengthAxis), oHmin=lo(wo.heightAxis), oHmax=hi(wo.heightAxis);
  return { x:Math.max(0,Math.round(oLmin-wo.lengthStart)), y:Math.max(0,Math.round(oHmin-wo.heightStart)),
           breedte:Math.round(oLmax-oLmin), hoogte:Math.round(oHmax-oHmin), oLmin, oLmax };
}

// up=Y (deel-1) → openingen met _worldAABB
const { byHost } = await deriveOpeningsCore(api, W, modelID, wallIds, [0,1,0]);

let comp=0, match=0, residual=[];
for (const [host, ops] of byHost) {
  const wo = woById.get(String(host)); if(!wo || !wo.lengthAxis) continue;
  for (const o of ops) {
    const fro = frozen.get(String(host)+":"+o.id); if(!fro) continue;
    comp++;
    const r = skeletonReproject(o._worldAABB, wo);
    const tol=60;
    const ok = Math.abs(r.x-fro.x)<=tol && Math.abs(r.y-fro.y)<=tol && Math.abs(r.breedte-fro.breedte)<=tol && Math.abs(r.hoogte-fro.hoogte)<=tol;
    if (ok) match++; else residual.push({host, id:o.id, r, fro, wo});
  }
}
console.log(`=== B + C-anker (FIX deel 2: skeleton-frame) ===`);
console.log(`vergeleken: ${comp} | exacte match (±60mm): ${match} | rest: ${residual.length}`);
const ref = (byHost.get(53023)||[]).find(o=>String(o.id)==="64199");
if (ref) { const r=skeletonReproject(ref._worldAABB, woById.get("53023")); console.log(`host #53023 raam — deel2: x=${r.x} y=${r.y} b=${r.breedte} h=${r.hoogte} | bevroren: x=1940 y=840 b=1160 h=1740`); }

// --- C. karakteriseer het restant: echt-uitstekende void (IFC-extent > host-wand)? ---
console.log(`\n=== C. karakterisering restant (${residual.length}) ===`);
let trulyOversize=0, artefact=[];
for (const z of residual) {
  const wo=z.wo;
  const wallLen = Math.abs((wo.lengthEnd ?? (wo.lengthStart+ (z.r.breedte))) - wo.lengthStart);
  const wallLenMm = Math.abs((wo.lengthEnd ?? wo.lengthStart) - wo.lengthStart) || (wo.length? wo.length: null);
  // void-lengte-extent vs host-wandlengte
  const voidLen = z.r.breedte;
  const protrudes = (z.r.x < -1) || (z.r.x + voidLen > (wallLenMm??Infinity) + 60) || voidLen > (wallLenMm??Infinity)+60;
  if (protrudes) trulyOversize++; else artefact.push(z);
}
console.log(`  echt-uitstekend/over-host (IFC-geometrie > wand): ${trulyOversize}/${residual.length}`);
console.log(`  mogelijke frame-artefacten (binnen host maar geen match): ${artefact.length}`);
if (residual[0]) { const z=residual[0]; const wo=z.wo; const wl=Math.abs((wo.lengthEnd??wo.lengthStart)-wo.lengthStart);
  console.log(`  voorbeeld host#${z.host} id${z.id}: deel2 x=${z.r.x} b=${z.r.breedte} (wandlengte≈${Math.round(wl)}mm) | bevroren x=${z.fro.x} b=${z.fro.breedte}`); }
for (const z of artefact.slice(0,4)) { const wo=z.wo; const wl=Math.abs((wo.lengthEnd??wo.lengthStart)-wo.lengthStart);
  console.log(`   [artefact?] host#${z.host} id${z.id}: x=${z.r.x} b=${z.r.breedte} wand≈${Math.round(wl)} | bevroren x=${z.fro.x} b=${z.fro.breedte}`); }
api.CloseModel(modelID);
