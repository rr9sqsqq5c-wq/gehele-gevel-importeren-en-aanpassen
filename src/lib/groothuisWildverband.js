// GROOTHUIS WILDVERBAND — nieuw, generatief metselverband (puur, geen React).
//
// REGELS (zie docs/groothuis-wildverband-referentie.html):
//  • 6-rij repeterend. Rijstart om en om: oneven rij → drieklezoor (D), even rij → kop (K),
//    telkens gevolgd door een strek (S). Midden vrij met S/K (geen D in het midden).
//  • Elke rij sluit rechts met een DRIEKLEZOOR-pasmaat op de kaarsrechte paneelrand.
//  • Metselregels: max 4 strekken, max 2 koppen naast elkaar, max 1× "2 koppen" per rij.
//  • Wild: geen doorlopende stootvoeg tussen opeenvolgende rijen.
//
// GENERATIEF: steen (S) en voegen (stoot/lint) komen uit de groep-material; per paneelbreedte
// rolt een eigen 6-rij module uit dezelfde regels. PANELEN: vol met `maxPanelW` (2500) + 1
// restpaneel; verticaal loopt de 6-rij module door. Output = gedeelde rows-vorm (2D/3D/IFC).

const r1 = (v) => Math.round(v * 10) / 10;
const TYPE_MAP = { S: 'Strek', K: 'Kop', D: 'Drieklezoor' };
const MAX_S = 4, MAX_K = 2, MAX_KK_PER_ROW = 1;

export function getGroothuisDims(material) {
  const S = material.steenL;
  const stoot = material.stoot;
  const lint = material.lint ?? stoot;
  const K = Math.round((S - stoot) / 2);
  const D = Math.round((3 * S - stoot) / 4);
  return { S, K, D, stoot, lint, lagenmaat: material.steenH + lint, W: { S, K, D } };
}

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function trailingRun(cs) { const last = cs[cs.length - 1].t; let n = 0; for (let i = cs.length - 1; i >= 0; i--) { if (cs[i].t === last) n++; else break; } return { t: last, n }; }
function countKKpairs(cs) { let c = 0, run = 0; for (const s of cs) { if (s.t === 'K') { run++; if (run === 2) c++; } else run = 0; } return c; }
function perpends(cs, stoot) { const ps = []; let x = 0; for (const c of cs) { x += c.w; ps.push(Math.round(x)); x += stoot; } return ps; }

// CONCAVE-VOID: gedeelde POLY-BEWUSTE opening-subtractie (concave L/U-void → notch blijft bekleed;
// rechthoek → exact het oude bbox-gedrag). Vervangt de lokale bbox-only subtractRect.
import { subtractOpeningFromBrick as subtractRect } from './geometry.js';

// Eén rij voor paneelbreedte `panelW`, kaarsrecht sluitend met een drieklezoor-pasmaat.
// Backtracking houdt zich aan max 4 strek / max 2 kop / max 1× 2-koppen, en vermijdt
// uitlijning met de rij eronder (wild). Deterministisch (seed = rij + paneelbreedte).
function buildRow(panelW, dims, rowIndex, prevPerps) {
  const { S, K, D, stoot, W } = dims;
  const rng = mulberry32((0x9E3779B9 ^ (rowIndex * 2654435761) ^ (Math.round(panelW) * 40503)) >>> 0);
  const widthOf = (cs) => cs.reduce((s, c) => s + c.w, 0) + (cs.length - 1) * stoot;
  const startT = rowIndex % 2 === 0 ? 'D' : 'K';
  const base = [{ t: startT, w: W[startT] }, { t: 'S', w: S }];
  const CLOSER_MIN = K, CLOSER_MAX = S; // drieklezoor-pasmaat venster (~1 periode → altijd vulbaar)
  const remOf = (cs) => panelW - widthOf(cs) - stoot;
  function dfs(cs, depth) {
    const r = remOf(cs);
    if (r >= CLOSER_MIN && r <= CLOSER_MAX) return cs;
    if (r < CLOSER_MIN || depth > 80) return null;
    const tr = trailingRun(cs);
    let opts = ['S', 'K'].filter((t) => {
      if (t === 'S') return !(tr.t === 'S' && tr.n >= MAX_S);
      if (tr.t === 'K' && tr.n >= MAX_K) return false;
      if (tr.t === 'K' && tr.n === 1 && countKKpairs(cs) >= MAX_KK_PER_ROW) return false;
      return true;
    });
    if (rng() < 0.5) opts.reverse();
    opts.sort((a, b) => { const pa = widthOf(cs) + stoot + W[a], pb = widthOf(cs) + stoot + W[b]; return (prevPerps.some((p) => Math.abs(p - pa) < 8) ? 1 : 0) - (prevPerps.some((p) => Math.abs(p - pb) < 8) ? 1 : 0); });
    for (const t of opts) { const res = dfs([...cs, { t, w: W[t] }], depth + 1); if (res) return res; }
    return null;
  }
  const codes = dfs(base, 0) ?? base;
  const closerW = panelW - widthOf(codes) - stoot;
  codes.push({ t: 'D', w: Math.max(closerW, 1), pasmaat: Math.abs(closerW - D) > 2 });
  return codes;
}

// 6-rij module voor een paneelbreedte (rij 0 = onder), wild t.o.v. de vorige rij.
export function buildGroothuisModule(panelW, material) {
  const dims = getGroothuisDims(material);
  const module = []; let prev = [];
  for (let r = 0; r < 6; r++) { const row = buildRow(panelW, dims, r, prev); module.push(row); prev = perpends(row, dims.stoot); }
  return module;
}

// Horizontale paneelverdeling: vol met maxPanelW + 1 restpaneel (panelen butt met stootvoeg).
function panelLayout(facadeWidth, maxPanelW, stoot) {
  const panels = []; let x = 0;
  while (x < facadeWidth - 0.5) { const w = Math.min(maxPanelW, r1(facadeWidth - x)); panels.push({ x, w }); x = r1(x + w + stoot); }
  return panels;
}

// Volledige gevel: tegel het groothuis-verband. Geeft platte bricks
// {x,y,width,height,type,koppelstrip,pasmaat,panelIndex} + kaarsrechte boardEdges + paneelnaden.
export function buildGroothuisFacade(facadeWidth, facadeHeight, material, openings = [], maxPanelW = 2500) {
  const dims = getGroothuisDims(material);
  const { lagenmaat, stoot } = dims;
  const H = material.steenH;
  const rowsH = lagenmaat > 0 ? Math.floor(facadeHeight / lagenmaat) : 0;
  const panels = panelLayout(facadeWidth, maxPanelW, stoot);
  const moduleCache = new Map();
  const moduleFor = (w) => { const k = Math.round(w); if (!moduleCache.has(k)) moduleCache.set(k, buildGroothuisModule(w, material)); return moduleCache.get(k); };

  const bricks = [];
  for (let pi = 0; pi < panels.length; pi++) {
    const { x: px, w: pw } = panels[pi];
    const mod = moduleFor(pw);
    for (let r = 0; r < rowsH; r++) {
      const codes = mod[r % 6];
      const rowY = r * lagenmaat;
      let x = px;
      for (const c of codes) {
        const clippedW = Math.min(c.w, facadeWidth - x);
        if (clippedW <= 0.5) break;
        let segs = [{ x1: x, x2: x + clippedW, y1: rowY, y2: rowY + H }];
        for (const op of openings) { const nx = []; for (const sg of segs) nx.push(...subtractRect(sg, op)); segs = nx; }
        for (const sg of segs) bricks.push({ x: sg.x1, y: sg.y1, width: sg.x2 - sg.x1, height: sg.y2 - sg.y1, type: TYPE_MAP[c.t], koppelstrip: false, pasmaat: !!c.pasmaat, panelIndex: pi });
        x = r1(x + c.w + stoot);
      }
    }
  }
  const boardEdges = panels.slice(0, -1).map((p) => r1(p.x + p.w));
  const horizontalSeams = []; for (let rr = 6; rr < rowsH; rr += 6) horizontalSeams.push(r1(rr * lagenmaat));
  return { bricks, boardEdges, horizontalSeams, panels, rowsH, lagenmaat };
}

// Reshape naar de gedeelde facadeData.rows-vorm ({y, pieces:[{start,length,label,pasmaat}]}).
export function buildGroothuisRows(facadeWidth, facadeHeight, material, openings = [], maxPanelW = 2500) {
  const fac = buildGroothuisFacade(facadeWidth, facadeHeight, material, openings, maxPanelW);
  const byY = new Map();
  for (const b of fac.bricks) {
    if (!byY.has(b.y)) byY.set(b.y, []);
    byY.get(b.y).push({ start: b.x, length: b.width, label: b.type, pasmaat: b.pasmaat });
  }
  const rows = [...byY.entries()].sort((a, b) => a[0] - b[0]).map(([y, pieces]) => ({ y, pieces: pieces.sort((a, b) => a.start - b.start) }));
  return { rows, boardEdges: fac.boardEdges, horizontalSeams: fac.horizontalSeams, panels: fac.panels, lagenmaat: fac.lagenmaat };
}
