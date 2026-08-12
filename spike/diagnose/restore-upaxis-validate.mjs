// WEGWERP (spike/) — VALIDATE B: herstelt restoreUpAxisFromWalls de up-as naar 'y' op een
// project-state-restore (BIL-MOO Y-up)? Repliceert App.jsx:3933-3943 met de echte modules.
let FLAG = '0';
globalThis.localStorage = { getItem: (k) => (k === 'restoreUpAxis' ? FLAG : null), setItem(){}, removeItem(){} };
const { isRestoreUpAxis } = await import('../../src/lib/featureFlags.js');
const PC = await import('../../src/lib/projectCoordinates.js');

// restoreUpAxisFromWalls (kopie van App.jsx:3933-3943)
function restoreUpAxisFromWalls(walls) {
  if (!isRestoreUpAxis()) return;
  const vote = {};
  for (const w of (walls ?? [])) {
    const ha = w?.wallOrigin?.heightAxis;
    if (ha === 'y' || ha === 'z' || ha === 'z_neg') vote[ha] = (vote[ha] ?? 0) + 1;
  }
  const axis = Object.keys(vote).sort((a, b) => vote[b] - vote[a])[0];
  if (!axis) return;
  PC.registerIfcContext({ upAxis: axis }, 'project-restore (up-as afgeleid uit wanden)');
}

// herstelde BIL-MOO-wanden: allemaal heightAxis 'y' (fixture-matrix bevestigd)
const restoredWalls = Array.from({ length: 192 }, () => ({ wallOrigin: { heightAxis: 'y' } }));

function sim(flag) {
  FLAG = flag;
  PC.reset();                              // = verse sessie / loadProjectState start → _upAxis 'z'
  const before = PC.getProjectInfo().upAxis;
  restoreUpAxisFromWalls(restoredWalls);   // App.jsx:4324
  return { before, after: PC.getProjectInfo().upAxis };
}

console.log('# RESTORE-UP-AS VALIDATE (BIL-MOO Y-up, project-state-restore)\n');
const o2 = console.log; console.log = () => {};
const off = sim('0');
const on  = sim('1');
console.log = o2;
console.log(`  VLAG UIT: up '${off.before}' -> '${off.after}'   ${off.after === 'z' ? '🟢 byte-identiek (blijft z, oude gedrag = de bug)' : '🔴'}`);
console.log(`  VLAG AAN: up '${on.before}' -> '${on.after}'   ${on.after === 'y' ? '🟢 hersteld naar y (best-fit-waarschuwing weg)' : '🔴 niet hersteld'}`);
console.log(`\n=== VERDICT: ${off.after === 'z' && on.after === 'y' ? '🟢 promotie fixt de up-as op restore; vlag-uit ongewijzigd' : '🔴'} ===`);
process.exit(0);
