// READ-ONLY MEETSPIKE — waarom meldt fitFacadePlane "bijna-horizontaal vlak / normaal ∥ up-as"?
// Importeert de ECHTE fitFacadePlane. Toont: normaal-as (thin-vote), up-as, en of de
// guard (facadePlane.js:81) vuurt — voor 4 selectie-soorten. modelUpAxis wordt EXPLICIET
// meegegeven (geen projectcontext nodig), zodat we up='y' (correct, BIL) vs up='z'
// (misdetectie-simulatie) kunnen vergelijken.
import { fitFacadePlane } from "../../src/lib/facadePlane.js";

function wo(lAxis, hAxis, tAxis, ls, le, hs, he, ts, te, outDir = 1) {
  return { lengthAxis: lAxis, heightAxis: hAxis, thicknessAxis: tAxis, lengthStart: ls, lengthEnd: le, heightStart: hs, heightEnd: he, thicknessStart: ts, thicknessEnd: te, resolvedOutside: { outsideDir: outDir, outsidePos: outDir < 0 ? ts : te } };
}
const member = (id, w) => ({ expressID: id, name: id, openings: [], wallOrigin: w });

// Spreiding van de DUNSTE as over de selectie (= waar de normaal-stem op gebaseerd is).
function thinSpread(members) {
  const vote = { x: 0, y: 0, z: 0 };
  for (const m of members) {
    const A = m.wallOrigin;
    const e = {
      x: Math.abs((A.lengthAxis === 'x' ? A.lengthEnd - A.lengthStart : A.heightAxis === 'x' ? A.heightEnd - A.heightStart : A.thicknessEnd - A.thicknessStart)),
      y: Math.abs((A.lengthAxis === 'y' ? A.lengthEnd - A.lengthStart : A.heightAxis === 'y' ? A.heightEnd - A.heightStart : A.thicknessEnd - A.thicknessStart)),
      z: Math.abs((A.lengthAxis === 'z' ? A.lengthEnd - A.lengthStart : A.heightAxis === 'z' ? A.heightEnd - A.heightStart : A.thicknessEnd - A.thicknessStart)),
    };
    vote[['x', 'y', 'z'].reduce((a, b) => e[a] <= e[b] ? a : b)]++;
  }
  return vote;
}

const horiz = (w) => /bijna-horizontaal|valt samen met de model-up/.test(w);
function run(label, members, up) {
  const p = fitFacadePlane(members, up);
  const fired = p.warnings.some(horiz);
  console.log(`\n${label}  (up='${up}')`);
  console.log(`   thin-vote=${JSON.stringify(thinSpread(members))}  → nAxis=${p.nAxis}  uAxis=${p.uAxis} tAxis=${p.tAxis}  coFacing=${Math.round(p.coFacingFrac*100)}%`);
  console.log(`   guard "bijna-horizontaal" (nAxis==up)? ${fired ? '🔴 VUURT' : '🟢 nee'}`);
  if (p.warnings.length) console.log(`   warnings: ${p.warnings.map(w => '· ' + w.slice(0, 70)).join('\n             ')}`);
  return { nAxis: p.nAxis, uAxis: p.uAxis, fired };
}

// ── A) Normale verticale gevelwand, FACING z (Y-up model). thin = z. ──
// lengthAxis x (3000 breed), heightAxis y (2870 hoog), thicknessAxis z (250 dun).
const wallFacingZ = [member('w_z', wo('x', 'y', 'z', 0, 3000, 0, 2870, 0, 250))];
const A = run('A) verticale gevel (facing z), CORRECTE up=y', wallFacingZ, 'y');

// ── B) ZELFDE wand, maar up MISGEDETECTEERD als z (bv. forceOrientation/erf-vervuiling). ──
const B = run('B) ZELFDE wand, up MISGEDETECTEERD als z', wallFacingZ, 'z');

// ── B2) smalle penant (x smal, y hoog) met up fout op z → degradatie kiest uAxis=x → strips verticaal ──
const pier = [member('pier', wo('x', 'y', 'z', 0, 600, 0, 2870, 0, 250))];
const B2 = run('B2) smalle penant (x<y), up fout op z → uAxis-swap', pier, 'z');

// ── C) ECHT horizontaal element (dak/vloer/kap), thin = y, CORRECTE up=y → guard hoort te vuren ──
// platte plaat: lengthAxis x (9000), heightAxis z (40000 diep), thicknessAxis y (300 dun).
const slab = [member('slab', wo('x', 'z', 'y', 0, 9000, 0, 40000, 0, 300))];
const C = run('C) horizontaal dak/vloer (thin=y), CORRECTE up=y', slab, 'y');

// ── D) HOEK: twee loodrechte wanden (facing z + facing x), up=y → co-facing, NIET bijna-horizontaal ──
const corner = [member('wz', wo('x', 'y', 'z', 0, 3000, 0, 2870, 0, 250)), member('wx', wo('z', 'y', 'x', 0, 3000, 0, 2870, 0, 250))];
const D = run('D) hoek (2 loodrechte wanden), up=y', corner, 'y');

console.log(`\n── DISCRIMINATOR ──`);
console.log(`  A vuurt? ${A.fired}   B vuurt? ${B.fired}   C vuurt? ${C.fired}   D vuurt? ${D.fired}`);
console.log(`  → Guard vuurt ⇔ (nAxis == meegegeven up-as). A==B-geometrie identiek; alleen de up-as verschilt.`);
console.log(`  → SPURIOUS (B/B2): normale wand + up FOUT 'z' ⇒ verticale gevel als horizontaal geflagd, uAxis-swap.`);
console.log(`  → CORRECT (C): echt horizontaal element + up GOED 'y' ⇒ terecht "geen verticale gevel".`);
