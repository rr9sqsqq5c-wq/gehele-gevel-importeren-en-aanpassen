// GROOTHUIS WILDVERBAND 2 — VASTE 6-rij mal (productiemal), NÁÁST groothuis 1.
// De klant heeft de 6 rijen handmatig vastgelegd (rij 1 = ONDER). Regels die erin zitten:
//  • om-en-om drieklezoor/kop-start (rij 1/3/5 = drieklezoor, rij 2/4/6 = kop);
//  • sluitsteen om-en-om (drieklezoor-rij eindigt kop, kop-rij eindigt drieklezoor);
//  • max 5 strekken achter elkaar; koppen verdeeld, geen twee koppen pal boven elkaar;
//  • muizentrap ≤ 6 banen; geen doorgaande stootvoegen. Elke rij = 2511 mm (steen 210, K=103,
//    D=157, stoot 4) → rechthoekige tegel. Verticaal herhaalt de 6-rij tegel; horizontaal
//    getegeld (paneelbreedte = de module, naad = 1 stootvoeg). Zie spike/groothuis2-verify-scenarios.mjs.
// Output = gedeelde facadeData.rows-vorm (voedt 2D/3D/IFC/uittrekstaat/werktekening).

const r1 = (v) => Math.round(v * 10) / 10;
const TYPE_MAP = { S: 'Strek', K: 'Kop', D: 'Drieklezoor' };

// De VASTE mal (letter-rijen; rij 1 = onder). d=drieklezoor, k=kop, s=strek.
const MOLD = [
  'd,s,k,s,k,s,k,s,s,s,s,k,s,k,k', // rij 1 (onder)
  'k,s,s,k,s,k,s,s,s,s,k,s,s,d',   // rij 2
  'd,s,s,s,s,s,k,s,s,s,s,s,k',     // rij 3
  'k,s,k,s,k,s,s,s,s,k,s,s,s,d',   // rij 4
  'd,k,s,s,s,s,k,s,s,k,s,s,s,k',   // rij 5
  'k,k,s,s,s,s,k,s,s,s,s,k,s,d',   // rij 6
].map((r) => r.split(','));

export function getGroothuis2Dims(material) {
  const S = material.steenL;
  const stoot = material.stoot;
  const lint = material.lint ?? stoot;
  const K = Math.round((S - stoot) / 2);
  const D = Math.round((3 * S - stoot) / 4);
  return { S, K, D, stoot, lint, lagenmaat: material.steenH + lint };
}

// 6 mal-rijen als codes-arrays met nominale breedtes (geen pasmaat — vaste, handgelegde rijen).
export function buildGroothuis2Module(material) {
  const { S, K, D } = getGroothuis2Dims(material);
  const WMAP = { s: S, k: K, d: D };
  return MOLD.map((row) => row.map((t) => ({ t: t.toUpperCase(), w: WMAP[t], pasmaat: false })));
}

// modulebreedte (rechteredge van een rij) — alle 6 rijen zijn even breed.
function moduleWidth(mod, stoot) { const row = mod[0]; return row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * stoot; }

// CONCAVE-VOID: gedeelde POLY-BEWUSTE opening-subtractie (concave L/U-void → notch blijft bekleed;
// rechthoek → exact het oude bbox-gedrag). Vervangt de lokale bbox-only subtractRect.
import { subtractOpeningFromBrick as subtractRect } from './geometry.js';

function panelLayout(facadeWidth, moduleW, stoot) {
  const panels = []; let x = 0;
  while (x < facadeWidth - 0.5) { const w = Math.min(moduleW, r1(facadeWidth - x)); panels.push({ x, w }); x = r1(x + moduleW + stoot); }
  return panels;
}

export function buildGroothuis2Facade(facadeWidth, facadeHeight, material, openings = [], _maxPanelW) {
  const dims = getGroothuis2Dims(material);
  const { lagenmaat, stoot } = dims;
  const H = material.steenH;
  const rowsH = lagenmaat > 0 ? Math.floor(facadeHeight / lagenmaat) : 0;
  const mod = buildGroothuis2Module(material);
  const moduleW = moduleWidth(mod, stoot);
  const panels = panelLayout(facadeWidth, moduleW, stoot);

  const bricks = [];
  for (let pi = 0; pi < panels.length; pi++) {
    const { x: px } = panels[pi];
    for (let r = 0; r < rowsH; r++) {
      const codes = mod[r % 6]; // r = 0 (onder) = rij 1
      const rowY = r * lagenmaat;
      let x = px;
      for (const c of codes) {
        const clippedW = Math.min(c.w, facadeWidth - x);
        if (clippedW <= 0.5) break;
        let segs = [{ x1: x, x2: x + clippedW, y1: rowY, y2: rowY + H }];
        for (const op of openings) { const nx = []; for (const sg of segs) nx.push(...subtractRect(sg, op)); segs = nx; }
        for (const sg of segs) bricks.push({ x: sg.x1, y: sg.y1, width: sg.x2 - sg.x1, height: sg.y2 - sg.y1, type: TYPE_MAP[c.t], koppelstrip: false, pasmaat: false, panelIndex: pi });
        x = r1(x + c.w + stoot);
      }
    }
  }
  const boardEdges = panels.slice(0, -1).map((p) => r1(p.x + moduleW));
  const horizontalSeams = []; for (let rr = 6; rr < rowsH; rr += 6) horizontalSeams.push(r1(rr * lagenmaat));
  return { bricks, boardEdges, horizontalSeams, panels, rowsH, lagenmaat, moduleWidth: moduleW };
}

// Reshape naar de gedeelde facadeData.rows-vorm ({y, pieces:[{start,length,label,pasmaat}]}).
export function buildGroothuis2Rows(facadeWidth, facadeHeight, material, openings = [], maxPanelW) {
  const fac = buildGroothuis2Facade(facadeWidth, facadeHeight, material, openings, maxPanelW);
  const byY = new Map();
  for (const b of fac.bricks) {
    if (!byY.has(b.y)) byY.set(b.y, []);
    byY.get(b.y).push({ start: b.x, length: b.width, label: b.type, pasmaat: b.pasmaat });
  }
  const rows = [...byY.entries()].sort((a, b) => a[0] - b[0]).map(([y, pieces]) => ({ y, pieces: pieces.sort((a, b) => a.start - b.start) }));
  return { rows, boardEdges: fac.boardEdges, horizontalSeams: fac.horizontalSeams, panels: fac.panels, lagenmaat: fac.lagenmaat };
}
