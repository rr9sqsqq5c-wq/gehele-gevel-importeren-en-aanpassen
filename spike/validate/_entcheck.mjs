import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const req = createRequire(pathToFileURL(A + "/package.json"));
const W = req(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const api = new W.IfcAPI(); await api.Init();
const models = [
  ["GFRC", "C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/je-bent-een-senior-software-arch-72bb/backend/uploads/c316820b-943c-40e1-85a4-2d85ea64420f/250361_GFRC-elementen-Dunea-SPS.ifc"],
  ["Kubistisch", "C:/Users/MurkAnneKooistraKooi/AppData/Local/Microsoft/Windows/INetCache/Content.Outlook/2I1IYVNL/Kubistische woning export IFC.ifc"],
  ["KGT", "C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/prompt-d3b5/uploads/44fbf233-2dd7-4ec1-bec4-2ca217f80728/KGT Tegels - V5.ifc"],
  ["MSHF", "C:/Users/MurkAnneKooistraKooi/AppData/Local/Microsoft/Olk/Attachments/ooa-5b0a484f-97bb-42a1-8562-737dd2aa8c42/722a19249fb4a15994fd8d65b6de5ed11e64f8763747654c373eacd62270fe40/MSHF_DM.ifc"],
  ["Demo", "C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/prompt-d3b5/output_demo/Demo_Gevel_substructure.ifc"],
];
for (const [n, f] of models) {
  const mid = api.OpenModel(new Uint8Array(readFileSync(f)), {});
  const c = (t) => { try { return api.GetLineIDsWithType(mid, t).size(); } catch { return 0; } };
  console.log(n, "win=" + c(W.IFCWINDOW), "door=" + c(W.IFCDOOR), "opening=" + c(W.IFCOPENINGELEMENT),
    "voids=" + c(W.IFCRELVOIDSELEMENT), "fills=" + c(W.IFCRELFILLSELEMENT),
    "wallStd=" + c(W.IFCWALLSTANDARDCASE), "wall=" + c(W.IFCWALL), "curtain=" + c(W.IFCCURTAINWALL));
  api.CloseModel(mid);
}
