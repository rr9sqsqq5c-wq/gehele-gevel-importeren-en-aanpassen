// FIX-VALIDATIE (untracked) — up-as bij project-restore afgeleid uit wanden.
// Echte projectCoordinates + featureFlags. Repliceert de App.jsx-helper restoreUpAxisFromWalls
// (1:1) en drijft de ECHTE registerIfcContext. Vlag via localStorage-shim (node).
import { reset as resetCoordinates, registerIfcContext, getProjectInfo } from "../../src/lib/projectCoordinates.js";
import { isRestoreUpAxis } from "../../src/lib/featureFlags.js";

let _flag = null;
globalThis.localStorage = { getItem: (k) => (k === 'restoreUpAxis' ? _flag : null) };
const setFlag = (v) => { _flag = v; };
const up = () => getProjectInfo().upAxis;

// 1:1 kopie van App.jsx restoreUpAxisFromWalls
function restoreUpAxisFromWalls(walls) {
  if (!isRestoreUpAxis()) return;
  const vote = {};
  for (const w of (walls ?? [])) {
    const ha = w?.wallOrigin?.heightAxis;
    if (ha === 'y' || ha === 'z' || ha === 'z_neg') vote[ha] = (vote[ha] ?? 0) + 1;
  }
  const axis = Object.keys(vote).sort((a, b) => vote[b] - vote[a])[0];
  if (!axis) return;
  registerIfcContext({ upAxis: axis }, 'project-restore (up-as afgeleid uit wanden)');
}

const wallsY = [{ wallOrigin: { heightAxis: 'y' } }, { wallOrigin: { heightAxis: 'y' } }, { wallOrigin: { heightAxis: 'y' } }];
const wallsZ = [{ wallOrigin: { heightAxis: 'z' } }, { wallOrigin: { heightAxis: 'z' } }];
let ok = true;
const chk = (name, val, expect) => { const p = val === expect; if (!p) ok = false; console.log(`   ${p ? '🟢' : '🔴'} ${name}: up='${val}' (verwacht '${expect}')`); };

// ── G1: vlag UIT → restore laat up='z' (byte-identiek); verse import 'y' ──
console.log(`\nG1) vlag UIT`);
setFlag('0');
resetCoordinates();                         // verse sessie/module-default
restoreUpAxisFromWalls(wallsY);             // helper = no-op
chk('restore (Y-wanden) → ongemoeid', up(), 'z');
resetCoordinates(); registerIfcContext({ origin: {x:0,y:0,z:0}, upAxis: 'y' }, 'verse-import');
chk('verse import', up(), 'y');

// ── G2: vlag AAN → restore met Y-wanden, geen opgeslagen upAxis → 'y' (scenario 2 gerepareerd) ──
console.log(`\nG2) vlag AAN — restore repareert`);
setFlag('1');
resetCoordinates();                         // verse sessie → 'z'
console.log(`   na reset (verse sessie): up='${up()}'`);
restoreUpAxisFromWalls(wallsY);
chk('restore (Y-wanden) → afgeleid', up(), 'y');

// ── G3: vlag AAN → verse import nog steeds 'y' (werkend pad ongemoeid) ──
console.log(`\nG3) vlag AAN — verse import ongemoeid`);
setFlag('1');
resetCoordinates(); registerIfcContext({ origin: {x:0,y:0,z:0}, upAxis: 'y' }, 'verse-import');
chk('verse import', up(), 'y');

// ── G6: noodrem ?restoreUpAxis=0 == UIT ──
console.log(`\nG6) noodrem '0' == UIT`);
setFlag('0');
resetCoordinates(); restoreUpAxisFromWalls(wallsY);
chk('restore met noodrem', up(), 'z');

// ── extra correctheid: echt Z-up project → 'z' (niet geforceerd naar y); geen wanden → ongemoeid ──
console.log(`\nEXTRA) correctheid`);
setFlag('1');
resetCoordinates(); restoreUpAxisFromWalls(wallsZ);
chk('restore echt-Z-up wanden → z', up(), 'z');
setFlag('1');
resetCoordinates(); restoreUpAxisFromWalls([]);   // geen wanden
chk('restore zonder wanden → default ongemoeid', up(), 'z');

console.log(`\n${ok ? '🟢 ALLE CHECKS GROEN' : '🔴 CHECK(S) ROOD'}`);
process.exit(ok ? 0 : 1);
