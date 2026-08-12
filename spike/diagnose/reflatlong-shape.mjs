// WEGWERP (spike/) — READ-ONLY V4. Dumpt de WERKELIJKE web-ifc-vorm van IfcSite.RefLatitude/
// RefLongitude op BIL-MOO, om te bepalen waarom _readSiteRefLatLong (Array.isArray) null geeft.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WebIFC = require('web-ifc');
const api = new WebIFC.IfcAPI();
try { await api.Init(); } catch { api.SetWasmPath(join(ROOT,'node_modules','web-ifc')+'/', true); await api.Init(); }
const buf = readFileSync(join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc'));
const id = api.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {});

const sc = api.GetTypeCodeFromName('IFCSITE');
const vec = api.GetLineIDsWithType(id, sc);
console.log('# RefLatLong-vorm — IFCSITE count =', vec.size());
let shown = 0;
for (let i = 0; i < vec.size() && shown < 3; i++) {
  const s = api.GetLine(id, vec.get(i), false);
  if (s?.RefLatitude == null && s?.RefLongitude == null) continue;
  shown++;
  const dump = (v) => ({
    isArray: Array.isArray(v),
    typeof: typeof v,
    ctor: v?.constructor?.name,
    json: JSON.stringify(v)?.slice(0, 160),
    hasValue: v && typeof v === 'object' && 'value' in v,
  });
  console.log(`\n IfcSite #${vec.get(i)}  Name=${s?.Name?.value ?? s?.Name}`);
  console.log('  RefLatitude :', dump(s.RefLatitude));
  console.log('  RefLongitude:', dump(s.RefLongitude));
  console.log('  RefElevation:', JSON.stringify(s.RefElevation));
}
if (!shown) console.log('  (geen site met RefLatitude/RefLongitude gevonden)');
api.CloseModel(id);
process.exit(0);
