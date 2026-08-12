// Verifieer dat web-ifc (de parser die brickboard gebruikt) het verrijkte IFC leest.
import * as WebIFC from 'web-ifc';
import fs from 'node:fs';
const F = process.argv[2];
const api = new WebIFC.IfcAPI();
api.SetWasmPath('C:/dev/brickboard/node_modules/web-ifc/', true);
await api.Init();
const data = new Uint8Array(fs.readFileSync(F));
const model = api.OpenModel(data);
console.log('OpenModel OK, modelID =', model);
const psv = api.GetLineIDsWithType(model, WebIFC.IFCPROPERTYSINGLEVALUE);
let paneelnr = 0, sample = null, gevels = new Set();
for (let i = 0; i < psv.size(); i++) {
  const line = api.GetLine(model, psv.get(i));
  const nm = line.Name && line.Name.value;
  if (nm === 'Paneelnummer') { paneelnr++; if (!sample) sample = line.NominalValue && line.NominalValue.value; }
  if (nm === 'Gevel') gevels.add(line.NominalValue && line.NominalValue.value);
}
const rels = api.GetLineIDsWithType(model, WebIFC.IFCRELDEFINESBYPROPERTIES);
console.log('IfcPropertySingleValue totaal =', psv.size(), '| Paneelnummer-props =', paneelnr, '| voorbeeld =', sample);
console.log('IfcRelDefinesByProperties totaal =', rels.size(), '| unieke gevels =', [...gevels].sort().join(','));
// echte property-lookup op 1 element
const parts = api.GetLineIDsWithType(model, WebIFC.IFCBUILDINGELEMENTPART);
try {
  const psets = await api.properties.getPropertySets(model, parts.get(0), true);
  const kgt = psets.find(p => p.Name && p.Name.value === 'KGT Paneelnummering');
  if (kgt) console.log('element #' + parts.get(0) + ' →', (kgt.HasProperties || []).map(h => h.Name.value + '=' + (h.NominalValue && h.NominalValue.value)).join(', '));
  else console.log('element #' + parts.get(0) + ': geen KGT pset gevonden op dit element');
} catch (e) { console.log('property-lookup fout:', e.message); }
api.CloseModel(model);
