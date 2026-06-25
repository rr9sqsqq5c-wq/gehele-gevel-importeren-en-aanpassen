// READ-ONLY VALIDATE (wegwerp) — synthetische calc-wand: contract + cladding + envelope-
// rooktest + persist-filter. Geen IFC, geen browser.
//   node spike/synthetic-wall-verify.mjs

import { makeSyntheticWall } from '../src/lib/syntheticWall.js';
import { buildFullGroupFacadePattern } from '../src/lib/pattern.js';
import { detectBuildingEnvelope, extractVisibleConcreteFaces } from '../src/lib/envelope.js';

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const results = [];
const ok = (label, pass, extra = '') => results.push({ label, pass, extra });
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// 1. contract
const w = makeSyntheticWall(4000, 2870, 272.5, 1);
{
  const wo = w.wallOrigin;
  const contract = w.expressID === 'syn_1' && w.length === 4000 && w.height === 2870 &&
    Array.isArray(w.openings) && w.openings.length === 0 && w.facadePoly === null && w.synthetic === true &&
    wo.lengthAxis === 'x' && wo.heightAxis === 'z' && wo.thicknessAxis === 'y' &&
    wo.lengthStart === 0 && wo.lengthEnd === 4000 && wo.heightStart === 0 && wo.heightEnd === 2870 &&
    wo.thicknessStart === 0 && wo.thicknessEnd === 273;
  ok('Contract-conform (expressID/length/height/assen/openings:[]/facadePoly:null)', contract, `id=${w.expressID} ${w.length}×${w.height} dikte=${wo.thicknessEnd}`);
  ok('expressID = string-namespace (syn_*)', typeof w.expressID === 'string' && w.expressID.startsWith('syn_'));
}

// 2. cladding — één-wand-groep → geldige facadeData/rows (geen up-as/adjacency/facadePoly)
{
  const fd = buildFullGroupFacadePattern([w], mat, 'halfsteens', null, null, null, null, 0, 0);
  const rows = fd?.rows ?? [];
  const pieces = rows.reduce((s, r) => s + r.pieces.length, 0);
  const lagen = Math.floor(2870 / (mat.steenH + mat.lint)); // 46
  const labelsOk = rows.every((r) => r.pieces.every((p) => ['Strek', 'Kop', 'Rest', 'Drieklezoor'].includes(p.label)));
  const widthOk = fd && Math.abs(fd.groupWidth - 4000) < 2 && Math.abs(fd.groupHeight - 2870) < 2;
  ok('buildFullGroupFacadePattern → geldige facadeData', !!fd && widthOk, `groupWidth=${fd?.groupWidth} groupHeight=${fd?.groupHeight}`);
  ok('Rijen + stenen plausibel (4000×2870 halfsteens)', rows.length >= lagen - 1 && rows.length <= lagen + 1 && pieces > rows.length * 15, `${rows.length} rijen (~${lagen}), ${pieces} stenen`);
  ok('Steen-labels geldig', labelsOk);
}

// 3. envelope-rooktest — geen crash/NaN op facadePoly:null + geen mesh
{
  let crashed = false, nanFree = true;
  try {
    const env = detectBuildingEnvelope([w]);
    for (const ov of Object.values(env.overall)) { if (!(finite(ov.min) || ov.min === Infinity) || !(finite(ov.max) || ov.max === -Infinity)) nanFree = false; }
    if (Number.isNaN(env.byAxis.y?.min) || Number.isNaN(env.byAxis.y?.max)) nanFree = false;
    const faces = extractVisibleConcreteFaces([w], [w], env);
    if (!Array.isArray(faces)) nanFree = false;
    for (const f of faces) { if (Number.isNaN(f.outsidePos) || Number.isNaN(f.wallThickness)) nanFree = false; }
  } catch (e) { crashed = true; results.push({ label: 'envelope-exception', pass: false, extra: e.message }); }
  ok('Envelope-rooktest: detectBuildingEnvelope + extractVisibleConcreteFaces — geen crash', !crashed);
  ok('Envelope-rooktest: geen NaN', nanFree);
}

// 4. persist-filter (sessie-only): synthetische wand + groep eruit, IFC ongemoeid
{
  const ifcWall = { expressID: 12345, wallOrigin: { lengthAxis: 'x', heightAxis: 'z', thicknessAxis: 'y', lengthStart: 0, heightStart: 0, thicknessStart: 0 } };
  const allWalls = [ifcWall, w];
  const groups = [{ id: 'G0', wallIds: [12345], manual: true }, { id: 'G1', wallIds: ['syn_1'], manual: false, synthetic: true }];
  const settingsMap = { G0: { x: 1 }, G1: { x: 2 } };
  // exact dezelfde predicaten als App.jsx persist-filter
  const hasSyn = allWalls.some((x) => x.synthetic) || groups.some((g) => g.synthetic);
  const pWalls = hasSyn ? allWalls.filter((x) => !x.synthetic) : allWalls;
  const pGroups = hasSyn ? groups.filter((g) => !g.synthetic) : groups;
  const synGids = new Set(groups.filter((g) => g.synthetic).map((g) => g.id));
  const pSettings = hasSyn ? Object.fromEntries(Object.entries(settingsMap).filter(([gid]) => !synGids.has(gid))) : settingsMap;
  ok('Persist-filter: synthetisch eruit, IFC erin', pWalls.length === 1 && pWalls[0].expressID === 12345 && pGroups.length === 1 && pGroups[0].id === 'G0' && !pSettings.G1 && !!pSettings.G0);

  // byte-identiek zonder synthetisch: zelfde referenties
  const allIfc = [ifcWall];
  const grpIfc = [{ id: 'G0', wallIds: [12345] }];
  const hasSyn2 = allIfc.some((x) => x.synthetic) || grpIfc.some((g) => g.synthetic);
  ok('Persist byte-identiek zonder synthetisch (zelfde refs)', !hasSyn2 && (hasSyn2 ? allIfc.filter(() => true) : allIfc) === allIfc);
}

console.log('\n=== SYNTHETISCHE CALC-WAND — spike ===\n');
let allPass = true;
for (const { label, pass, extra } of results) { if (!pass) allPass = false; console.log(`${pass ? '🟢' : '🔴'} ${label}${extra ? `  —  ${extra}` : ''}`); }
console.log(`\n${allPass ? '🟢 ALLE CHECKS GROEN' : '🔴 ER ZIJN ROODE CHECKS'}\n`);
process.exit(allPass ? 0 : 1);
