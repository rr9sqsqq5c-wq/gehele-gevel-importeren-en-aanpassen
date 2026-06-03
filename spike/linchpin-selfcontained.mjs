// SPIKE (wegwerp) — bewijst de linchpin voor een zelf-bevattend project.
// Raakt NIETS buiten spike/ aan; gebruikt alleen de web-ifc node-API + de echte
// dakranden-IFC + het opgeslagen project-JSON (read-only).
//
// Synthetische id ontstaat in productie op:
//   src/App.jsx:4041  const prefix = `m${++_mergeCounterRef.current}_`;
//   src/App.jsx:4044  expressID: `${prefix}${el.expressID}`,   // el.expressID = native
// Parse-entry (waar native expressID's vandaan komen):
//   src/lib/ifc.js:2528 parseIfcZoneElements(...) → :2544 api.OpenModel(data)
// Hieronder repliceren we EXACT dat id-schema (prefix m1_ = eerste merge) bovenop
// de native web-ifc expressID's.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(pathToFileURL(resolve(__dirname, "../package.json")));
const W = require(resolve(__dirname, "../node_modules/web-ifc/web-ifc-api-node.js"));

const DAK = "C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc";
const PROJ = "C:/Users/MurkAnneKooistraKooi/Downloads/BIL-MOO-A-ZZ-PBP_gevelbekleding (33).json";

// Zelfde supported-types als parseIfcZoneElements (ifc.js:2567-2571)
const SUPPORTED = ['IFCWALL','IFCWALLSTANDARDCASE','IFCSLAB','IFCBUILDINGELEMENTPROXY','IFCCOVERING','IFCCURTAINWALL','IFCPLATE','IFCMEMBER','IFCELEMENTASSEMBLY'];

async function parseNativeIds(bytes) {
  const api = new W.IfcAPI(); await api.Init();
  const modelID = api.OpenModel(bytes, {});                 // ~ ifc.js:2544
  const val = (x)=> (x&&typeof x==='object'&&'value'in x)?x.value:x;
  const out = []; // {expressID(native), name, type}
  for (const t of SUPPORTED) {
    let code; try { code = api.GetTypeCodeFromName(t); } catch { continue; }
    if (code === undefined) continue;
    let vec; try { vec = api.GetLineIDsWithType(modelID, code); } catch { continue; }
    for (let i = 0; i < vec.size(); i++) {
      const eid = vec.get(i);
      let name=null; try { name = val(api.GetLine(modelID, eid, false)?.Name); } catch {}
      out.push({ expressID: eid, name, type: t });
    }
  }
  // bbox→wallOrigin (engine-equivalente as-afleiding, vgl. deriveWallAxes in ifc.js)
  function bbox(eid){let m;try{m=api.GetFlatMesh(modelID,eid);}catch{return null;}if(!m||!m.geometries.size())return null;let a={x:1/0,y:1/0,z:1/0},b={x:-1/0,y:-1/0,z:-1/0},ok=false;for(let gi=0;gi<m.geometries.size();gi++){const pl=m.geometries.get(gi);let g;try{g=api.GetGeometry(modelID,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const tr=pl.flatTransformation;const st=Math.max(6,Math.floor((v.length/6)/40)*6);for(let k=0;k<v.length;k+=st){const x=v[k],y=v[k+1],z=v[k+2];const wx=tr[0]*x+tr[4]*y+tr[8]*z+tr[12],wy=tr[1]*x+tr[5]*y+tr[9]*z+tr[13],wz=tr[2]*x+tr[6]*y+tr[10]*z+tr[14];if(wx<a.x)a.x=wx;if(wx>b.x)b.x=wx;if(wy<a.y)a.y=wy;if(wy>b.y)b.y=wy;if(wz<a.z)a.z=wz;if(wz>b.z)b.z=wz;ok=true;}}finally{g?.delete();}}return ok?a&&{minX:a.x,maxX:b.x,minY:a.y,maxY:b.y,minZ:a.z,maxZ:b.z}:null;}
  // NB: model bewust NIET sluiten — de bbox-closure heeft modelID/api nog nodig.
  return { elements: out, bbox };
}

// Replica van het PRODUCTIE-id-schema (App.jsx:4041/4044): eerste merge → prefix "m1_"
const MERGE_INDEX = 1;
const synthId = (nativeId) => `m${MERGE_INDEX}_${nativeId}`;

const dakBytes = new Uint8Array(readFileSync(DAK));

console.log("=== SPIKE linchpin — zelf-bevattend project ===");
console.log(`dakranden-IFC: ${DAK.split("/").pop()} (${dakBytes.length} bytes)\n`);

// ---------- 1. DETERMINISME (twee parse-runs van hetzelfde bestand) ----------
const runA = await parseNativeIds(new Uint8Array(dakBytes));
const runB = await parseNativeIds(new Uint8Array(dakBytes));
const setA = new Set(runA.elements.map(e => synthId(e.expressID)));
const setB = new Set(runB.elements.map(e => synthId(e.expressID)));
const onlyA = [...setA].filter(x => !setB.has(x));
const onlyB = [...setB].filter(x => !setA.has(x));
const matched = [...setA].filter(x => setB.has(x)).length;
console.log("--- 1. DETERMINISME (run A vs run B) ---");
console.log(`  run A: ${setA.size} synth-ids | run B: ${setB.size} synth-ids`);
console.log(`  gematcht: ${matched} | alleen-A: ${onlyA.length} | alleen-B: ${onlyB.length}`);
const det = setA.size === setB.size && onlyA.length === 0 && onlyB.length === 0 && setA.size > 0;
console.log(`  voorbeelden: ${[...setA].slice(0,4).join(", ")}`);
console.log(`  => ${det ? "GROEN ✅ identieke synthetische ids over beide runs" : "ROOD ❌"}\n`);

// ---------- 2. HER-PARSE UIT BYTES (blob-equivalent) + wallOrigin ----------
console.log("--- 2. HER-PARSE UIT BYTES (zoals uit IndexedDB-blob) ---");
const fromBytes = await parseNativeIds(dakBytes.slice()); // kopie = los van origineel
const plates = fromBytes.elements.filter(e => e.type === 'IFCPLATE');
let withGeom = 0, sample = null;
for (const p of plates.slice(0, 60)) { const bb = fromBytes.bbox(p.expressID); if (bb) { withGeom++; if (!sample) sample = { id: synthId(p.expressID), bb }; } }
console.log(`  IFCPLATE terug uit bytes: ${plates.length} | synth-id voorbeeld: ${synthId(plates[0]?.expressID)}`);
console.log(`  met geldige geometrie (steekproef 60): ${withGeom}`);
if (sample) { const e=sample.bb; const dx=e.maxX-e.minX,dy=e.maxY-e.minY,dz=e.maxZ-e.minZ; const thin=['x','y','z'][[dx,dy,dz].indexOf(Math.min(dx,dy,dz))]; console.log(`  wallOrigin-equiv ${sample.id}: dun in ${thin}-as (dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} dz=${dz.toFixed(0)} mm) → engine kan verse wallOrigin afleiden`); }
const reparse = plates.length > 0 && withGeom > 0;
console.log(`  => ${reparse ? "GROEN ✅ zelfde m1_-PLAAT-elementen terug, met verse geometrie" : "ROOD ❌"}\n`);

// ---------- 3. GROEP-GELDIGHEID (opgeslagen synth wallIds → bestaan na her-parse) ----------
console.log("--- 3. GROEP-GELDIGHEID (geen dangling na her-parse) ---");
const proj = JSON.parse(readFileSync(PROJ, "utf8"));
const nativeSet = new Set(fromBytes.elements.map(e => e.expressID));   // verse native ids
const byName = new Map(proj.walls.map(w => [String(w.expressID), w.name]));
// kies een groep met de meeste synthetische (m1_) leden
const synthLeden = (g) => g.wallIds.filter(id => /^m1_\d+$/.test(String(id)));
const cand = [...proj.groups].sort((a,b)=>synthLeden(b).length - synthLeden(a).length)[0];
const leden = synthLeden(cand);
console.log(`  groep ${cand.id}: ${cand.wallIds.length} leden, waarvan ${leden.length} synthetisch (m1_)`);
let resolved = 0, dangling = [];
for (const id of leden) {
  const native = parseInt(String(id).split("_")[1], 10);   // m1_<native> → native
  if (nativeSet.has(native)) resolved++; else dangling.push(id);
}
const nPlaat = leden.filter(id => String(byName.get(String(id))).toUpperCase()==="PLAAT").length;
console.log(`  (waarvan ${nPlaat}x PLAAT volgens opgeslagen namen)`);
console.log(`  na her-parse resolved: ${resolved}/${leden.length} | dangling: ${dangling.length} ${dangling.slice(0,5).join(", ")}`);
const grp = leden.length > 0 && dangling.length === 0;
console.log(`  => ${grp ? "GROEN ✅ elke synthetische wallId resolved naar bestaand element" : "ROOD ❌ dangling refs"}\n`);

console.log("=== EINDOORDEEL ===");
console.log(`  1 determinisme : ${det ? "GROEN ✅" : "ROOD ❌"}`);
console.log(`  2 her-parse    : ${reparse ? "GROEN ✅" : "ROOD ❌"}`);
console.log(`  3 groep-geldig : ${grp ? "GROEN ✅" : "ROOD ❌"}`);
console.log(`  LINCHPIN: ${det&&reparse&&grp ? "🟢 BEWEZEN — zelf-bevattend project is haalbaar via her-parse + id-remap" : "🔴 niet bewezen"}`);
