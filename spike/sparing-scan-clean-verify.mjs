// WEGWERP (spike/) — check dat de scan-lijst alleen ECHTE bouwelementen toont (GlobalId-regel) en dat
// DRAADEIND op SMS blijft. Getrouwe her-impl van de includable-regel uit scanIfcSparingTypes.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';

const DIR = 'C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/Moos-Bilderdammerweg/';
const MCB = DIR + 'BIL-MCB-L-ZZ-PBP.IFC.ifc';
const SMS = DIR + 'BIL-SMS-L-ZZ-PBP.ifc';

async function getApi() {
  const WebIFC = require('web-ifc'); const api = new WebIFC.IfcAPI();
  try { await api.Init(); } catch { api.SetWasmPath('./node_modules/web-ifc/', true); await api.Init(); }
  return { IFC: WebIFC, api };
}
function hasGeom(api, m, id) { try { const mesh = api.GetFlatMesh(m, id); return !!mesh && mesh.geometries.size() > 0; } catch { return false; } }

function scanTypes(IFC, api, buf) {
  const modelID = api.OpenModel(new Uint8Array(buf), {});
  const text = new TextDecoder('latin1').decode(buf); const di = text.indexOf('DATA;'); const body = di>=0?text.slice(di):text;
  const present = new Set(); let m; const re = /=\s*(IFC[A-Z0-9]+)/gi;
  while ((m = re.exec(body)) !== null) { const t = m[1].toUpperCase(); if (!t.endsWith('TYPE')) present.add(t); }
  const out = [];
  for (const name of present) {
    const code = IFC[name]; if (code === undefined) continue;
    let vec; try { vec = api.GetLineIDsWithType(modelID, code); } catch { continue; }
    const n = vec.size(); if (n === 0) continue;
    const isAssembly = name === 'IFCELEMENTASSEMBLY';
    let hasGlobalId = false; try { hasGlobalId = api.GetLine(modelID, vec.get(0), false)?.GlobalId?.value != null; } catch {}
    if (!isAssembly && !hasGlobalId) continue;
    let includable = isAssembly; for (let i=0;i<Math.min(n,3)&&!includable;i++) if (hasGeom(api,modelID,vec.get(i))) includable = true;
    if (!includable) continue;
    out.push({ ifcEntityType: name, count: n, isAssembly });
  }
  api.CloseModel(modelID);
  return out.sort((a,b)=>b.count-a.count);
}

(async () => {
  const { IFC, api } = await getApi();
  const JUNK = ['IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBOOLEANRESULT','IFCEXTRUDEDAREASOLID','IFCFACETEDBREP','IFCHALFSPACESOLID','IFCBOOLEANCLIPPINGRESULT','IFCCLOSEDSHELL','IFCMAPPEDITEM'];
  for (const [label, file] of [['MCB', MCB], ['SMS', SMS]]) {
    const types = scanTypes(IFC, api, readFileSync(file));
    const junkLeft = types.filter(t => JUNK.includes(t.ifcEntityType)).map(t=>t.ifcEntityType.replace(/^IFC/,''));
    console.log(`\n=== ${label} — schone scan-lijst ===`);
    console.log('  ' + types.map(t => `${t.ifcEntityType.replace(/^IFC/,'')}${t.isAssembly?'*':''}×${t.count}`).join(', '));
    console.log(`  ${junkLeft.length===0?'🟢':'🔴'} geen representatie-rommel meer${junkLeft.length?': '+junkLeft.join(', '):''}`);
  }
  console.log('\n(*=SAMENSTELLING/assembly · DRAADEIND-namen zitten ONDER SAMENSTELLING, zie andere spike)');
})();
