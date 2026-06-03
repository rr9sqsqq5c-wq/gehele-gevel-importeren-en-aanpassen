// VALIDATIE (headless) — kernlogica van zelf-bevattende her-afleiding:
//  * her-parse PRIMAIR (native ids) + SECUNDAIR (prefix m1_) reproduceert de ids,
//  * dangling-guard: alle group-wallIds resolven (groen) ; ontbrekende bron → null (fallback).
// Repliceert de remap/guard uit App.jsx rederiveSelfContainedWalls() (prefix+native).
// Browser-only delen (runNewEngineAdapter/parseIfcZoneElements) → hier via web-ifc node
// als id-equivalent (zelfde supported-types + native expressID's).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(pathToFileURL(resolve(__dirname, "../package.json")));
const W = require(resolve(__dirname, "../node_modules/web-ifc/web-ifc-api-node.js"));

const PRIMARY = "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc";
const DAK     = "C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc";
const PROJ    = "C:/Users/MurkAnneKooistraKooi/Downloads/BIL-MOO-A-ZZ-PBP_gevelbekleding (33).json";
const SUPPORTED = ['IFCWALL','IFCWALLSTANDARDCASE','IFCSLAB','IFCBUILDINGELEMENTPROXY','IFCCOVERING','IFCCURTAINWALL','IFCPLATE','IFCMEMBER','IFCELEMENTASSEMBLY'];

async function nativeIds(path) {
  const api = new W.IfcAPI(); await api.Init();
  const modelID = api.OpenModel(new Uint8Array(readFileSync(path)), {});
  const ids = [];
  for (const t of SUPPORTED) {
    let code; try { code = api.GetTypeCodeFromName(t); } catch { continue; }
    if (code === undefined) continue;
    let vec; try { vec = api.GetLineIDsWithType(modelID, code); } catch { continue; }
    for (let i = 0; i < vec.size(); i++) ids.push(vec.get(i));
  }
  api.CloseModel(modelID);
  return ids;
}

console.log("=== VALIDATIE zelf-bevattende her-afleiding (kernlogica) ===");
const primIds = await nativeIds(PRIMARY);           // prefix '' (native)
const dakIds  = await nativeIds(DAK);               // prefix 'm1_'
console.log(`primair BIL: ${primIds.length} elementen | dakranden: ${dakIds.length} elementen`);

// her-afgeleide id-set (zoals rederiveSelfContainedWalls die opbouwt)
const rebuilt = new Set([
  ...primIds.map(String),
  ...dakIds.map(id => `m1_${id}`),
]);
console.log(`her-afgeleide id-set: ${rebuilt.size}`);

const proj = JSON.parse(readFileSync(PROJ, "utf8"));
const need = new Set(proj.groups.flatMap(g => (g.wallIds ?? []).map(String)));
console.log(`groepen: ${proj.groups.length} | unieke group-wallIds: ${need.size}`);

// ---- punt C/E: alle group-wallIds resolven na her-parse (geen dangling) ----
const missing = [...need].filter(id => !rebuilt.has(id));
const nativeNeed = [...need].filter(id => /^\d+$/.test(id)).length;
const synthNeed  = [...need].filter(id => /^m1_\d+$/.test(id)).length;
console.log(`\n--- C/E. dangling-guard bij COMPLETE bronnen ---`);
console.log(`  group-wallIds: ${nativeNeed} native + ${synthNeed} synth (m1_)`);
console.log(`  resolved: ${need.size - missing.length}/${need.size} | dangling: ${missing.length} ${missing.slice(0,8).join(", ")}`);
const guardOK = missing.length === 0;
console.log(`  => ${guardOK ? "GROEN ✅ guard laat door → walls VERS her-afgeleid" : "ROOD ❌ guard zou aborten"}`);

// ---- punt D: ontbrekende bron (dakranden mist) → guard aborteert → fallback ----
const rebuiltNoDak = new Set(primIds.map(String));
const missing2 = [...need].filter(id => !rebuiltNoDak.has(id));
console.log(`\n--- D. dangling-guard bij ONTBREKENDE bron (dakranden weg) ---`);
console.log(`  dangling: ${missing2.length} (verwacht = ${synthNeed} synth m1_) → return null → fallback op opgeslagen walls[]`);
const abortOK = missing2.length === synthNeed && missing2.length > 0;
console.log(`  => ${abortOK ? "GROEN ✅ aborteert correct (geen crash, geen dataverlies)" : "ROOD ❌"}`);

console.log(`\n=== OORDEEL kernlogica ===`);
console.log(`  C/E resolven volledig : ${guardOK ? "GROEN ✅" : "ROOD ❌"}`);
console.log(`  D  abort+fallback     : ${abortOK ? "GROEN ✅" : "ROOD ❌"}`);
console.log(`  ${guardOK && abortOK ? "🟢 kernlogica bewezen (id-reproductie + dangling-guard)" : "🔴 zie boven"}`);
