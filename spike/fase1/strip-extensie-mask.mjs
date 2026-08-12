// FASE 1 VALIDATIE (untracked) — strips behouden handmatige einduiteinde-extensie.
// Importeert ECHTE productie-modules. Vlag keepEndExtension via localStorage-shim (node).
// Synthetisch: één wand [0..3000], opening [1000..1400], groupWidth=3000, ext L=R=200.
import { buildBestFitFacadePattern } from "../../src/lib/facadePlane.js";

// ── localStorage-shim zodat readFlag() in node de vlag kan lezen ──
let _flag = null; // null = niet gezet (default), '1' = aan, '0' = uit (noodrem)
globalThis.localStorage = { getItem: (k) => (k === 'keepEndExtension' ? _flag : null) };
const setFlag = (v) => { _flag = v; };

const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
function wo(lAxis, hAxis, tAxis, ls, le, hs, he, ts, te, outDir) {
  return { lengthAxis: lAxis, heightAxis: hAxis, thicknessAxis: tAxis, lengthStart: ls, lengthEnd: le, heightStart: hs, heightEnd: he, thicknessStart: ts, thicknessEnd: te, resolvedOutside: { outsideDir: outDir, outsidePos: outDir < 0 ? ts : te } };
}
const wall = { expressID: 'w1', length: 3000, height: 2870, openings: [{ id: 'o1', type: 'raam', x: 1000, y: 800, breedte: 400, hoogte: 1200 }], wallOrigin: wo('z', 'y', 'x', 0, 3000, 0, 2870, 0, 300, -1) };
const members = [wall];
const GW = 3000, EXT = 200;

function extent(rows) {
  let min = Infinity, max = -Infinity, n = 0;
  for (const r of rows) for (const p of r.pieces) { min = Math.min(min, p.start); max = Math.max(max, p.start + p.length); n++; }
  return { min, max, n };
}
// dekking op (t,y): zit er een strip-piece over punt t op rijhoogte ~y?
function coveredAt(rows, t, y) {
  const r = rows.find(rw => Math.abs(rw.y - y) < 30) ?? rows.reduce((b, rw) => Math.abs(rw.y - y) < Math.abs((b?.y ?? 1e9) - y) ? rw : b, null);
  if (!r) return false;
  return r.pieces.some(p => p.start <= t + 0.01 && p.start + p.length >= t - 0.01);
}
const ok = (b) => b ? '🟢' : '🔴';
let allGreen = true;
const check = (name, cond, detail) => { if (!cond) allGreen = false; console.log(`${ok(cond)} ${name}${detail ? '  — ' + detail : ''}`); };

// ── G1: vlag UIT → [0..3000], opening behouden als gat ──
setFlag('0'); // noodrem-equivalent (G7 dekt dit ook)
const off = buildBestFitFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, EXT, EXT, 'y');
const eOff = extent(off.rows);
const openOpen_off = !coveredAt(off.rows, 1200, 1000); // raam-midden y~1000
console.log(`\n[meting] vlag UIT  : strip-X = [${eOff.min}..${eOff.max}]  pieces=${eOff.n}`);
check('G1 vlag UIT → strips tot rand [0..3000]', Math.abs(eOff.min - 0) < 0.5 && Math.abs(eOff.max - GW) < 0.5, `[${eOff.min}..${eOff.max}]`);
check('G1 vlag UIT → opening [1000..1400] blijft gat', openOpen_off);

// ── G7: vlag null (default false) == UIT (byte-identiek) ──
setFlag(null);
const def = buildBestFitFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, EXT, EXT, 'y');
const eDef = extent(def.rows);
check('G7 default(false)==UIT byte-identiek', eDef.min === eOff.min && eDef.max === eOff.max && eDef.n === eOff.n, `[${eDef.min}..${eDef.max}] n=${eDef.n}`);

// ── G2/G3: vlag AAN → [-200..3200], opening ongemoeid ──
setFlag('1');
const on = buildBestFitFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, EXT, EXT, 'y');
const eOn = extent(on.rows);
console.log(`[meting] vlag AAN  : strip-X = [${eOn.min}..${eOn.max}]  pieces=${eOn.n}`);
check('G2 vlag AAN → strips voorbij rand [-200..3200]', Math.abs(eOn.min + EXT) < 0.5 && Math.abs(eOn.max - (GW + EXT)) < 0.5, `[${eOn.min}..${eOn.max}]`);
// Werktekening/Uittrekstaat-bereik (eerder gemeten in ssot-domein-meet.mjs) = [-200..3200] → convergentie
check('G2 convergentie met Werktekening/Uittrekstaat-bereik [-200..3200]', Math.abs(eOn.min + EXT) < 0.5 && Math.abs(eOn.max - (GW + EXT)) < 0.5);
const openOpen_on = !coveredAt(on.rows, 1200, 1000);
const openEdgesIntact = !coveredAt(on.rows, 1000 - 1, 1000) === false; // rand vlak vóór opening MOET bekleed zijn
check('G3 vlag AAN → opening [1000..1400] blijft gat (alleen buitenrand beweegt)', openOpen_on);
check('G3 vlag AAN → strip nog steeds aanwezig vlak vóór opening (t=999)', coveredAt(on.rows, 999, 1000));
check('G3 vlag AAN → strip aanwezig in linker-extensie (t=-100)', coveredAt(on.rows, -100, 1000));
check('G3 vlag AAN → strip aanwezig in rechter-extensie (t=3100)', coveredAt(on.rows, 3100, 1000));

// ── G4: IFC-pad (_applyCornerToRows) op de vlag-AAN rows → zelfde bereik ──
// Repliceert App.jsx:5236-5252 met ctrimsExport = endExtensionsToTrims({left:{strips:+200},right:{strips:+200}})
// → extensie-only: tL=tR=0, eL=eR=200. Guard (regel 5239) → return rows ongewijzigd.
const ctr = { trimLeft: 0, trimRight: 0, extendLeft: EXT, extendRight: EXT };
const applyCornerToRows = (rws, gW) => {
  const tL = ctr.trimLeft, tR = ctr.trimRight, eL = ctr.extendLeft, eR = ctr.extendRight;
  if (!tL && !tR) return rws; // guard: extensie-only → ongewijzigd
  const xMin = tL - eL, xMax = gW + eR - tR;
  return rws.map((row) => ({ ...row, pieces: row.pieces.flatMap((p) => {
    let ps = p.start, pe = p.start + p.length;
    if (pe <= xMin || ps >= xMax) return [];
    ps = Math.max(ps, xMin); pe = Math.min(pe, xMax);
    return pe - ps < 1 ? [] : [{ ...p, start: ps, length: pe - ps }];
  }) }));
};
const ifcRows = applyCornerToRows(on.rows, GW);
const eIfc = extent(ifcRows);
check('G4 IFC-pad == scherm (geen dubbel/terugtrim)', eIfc.min === eOn.min && eIfc.max === eOn.max && eIfc.n === eOn.n, `IFC=[${eIfc.min}..${eIfc.max}] scherm=[${eOn.min}..${eOn.max}]`);

console.log(`\n${allGreen ? '🟢 ALLE GATES GROEN' : '🔴 GATE(S) ROOD'}`);
process.exit(allGreen ? 0 : 1);
