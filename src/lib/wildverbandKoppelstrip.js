// WILDVERBAND KOPPELSTRIP (Fase 1 — kern, puur, geen React).
//
// MODEL (grondwaarheid uit "wildverband waarheid over twee panelen.docx"):
//   • Het verband is GEEN module-rotatie maar een VAST ontworpen 6-rij-paneel, vastgelegd
//     in WILDVERBAND_TRUTH (start- en volgpaneel). Herhaalt VERTICAAL elke 6 rijen.
//   • Horizontaal: 1× STARTPANEEL, daarna telkens een VOLGPANEEL.
//   • Start- en volgpaneel zijn identiek BEHALVE de eerste kolom op rij 2/4/6 (1-geïndexeerd
//     van onder): daar zit in het volgpaneel de KOPPELSTRIP — de in-situ strip die de naad
//     overbrugt. Er zijn precies 3 koppelstrippen per volgpaneel; de lengte varieert (S/D).
//
// De facade-generator (buildTruthFacade) legt deze waarheid stuk voor stuk neer (panelen
// stoten tegen elkaar met stootvoeg), rijen modulo 6 van onder af. Losgekoppeld van de UI:
// de spike test 'm, en Fase 2 (2D/3D/IFC) hergebruikt dezelfde kern.
// `material` volgt de bestaande vorm { steenL, steenH, lint, stoot }.

const r1 = (v) => Math.round(v * 10) / 10;
const TYPE_MAP = { S: 'Strek', D: 'Drieklezoor', K: 'Kop' };

export function getWildModule(material) {
  const S = material.steenL;
  const j = material.stoot;
  const K = Math.round((S - j) / 2);
  const D = Math.round((3 * S - j) / 4);
  return { S, j, K, D };
}

// Modulebreedte (incl. 6 stootvoegen) — referentiemaat van één paneel.
export function getModuleWidth(material) {
  const { S, j, K, D } = getWildModule(material);
  return 4 * S + D + K + 6 * j;
}

// Breedte van één strip-type (mm), pure steenmaat.
export function stripWidth(code, material) {
  const { S, K, D } = getWildModule(material);
  return code === 'K' ? K : code === 'D' ? D : S;
}

// VASTGELEGD uit "wildverband waarheid over twee panelen.docx" (de GRONDWAARHEID).
// 6 rijen, ONDER → BOVEN: index 0 = rij 1 = onderste laag van de gevel (doc-rij R7),
// index 5 = rij 6 = bovenste (doc-rij R2). 'S'/'D'/'K' = strek/drieklezoor/kop.
// Start- en volgpaneel zijn IDENTIEK behalve de eerste kolom op rij 2/4/6 (index 1/3/5):
// daar zit in het volgpaneel de KOPPELSTRIP (in het doc geel) — de in-situ brug-strip,
// één maat breder dan de startpaneel-steen (d→s, k→d, d→s). Precies 3 koppelstrippen.
export const WILDVERBAND_TRUTH = {
  start: [
    ['S', 'D', 'S', 'S', 'K', 'S'], // rij 1 (onder, R7)
    ['D', 'K', 'S', 'S', 'D', 'S'], // rij 2 (R6)
    ['S', 'S', 'D', 'S', 'S', 'K'], // rij 3 (R5)
    ['K', 'S', 'S', 'S', 'K', 'S'], // rij 4 (R4)
    ['S', 'S', 'D', 'S', 'K', 'S'], // rij 5 (R3)
    ['D', 'K', 'S', 'S', 'D', 'S'], // rij 6 (boven, R2)
  ],
  volg: [
    ['S', 'D', 'S', 'S', 'K', 'S'], // rij 1
    ['S', 'K', 'S', 'S', 'D', 'S'], // rij 2 — kol 0 = KOPPELSTRIP
    ['S', 'S', 'D', 'S', 'S', 'K'], // rij 3
    ['D', 'S', 'S', 'S', 'K', 'S'], // rij 4 — kol 0 = KOPPELSTRIP
    ['S', 'S', 'D', 'S', 'K', 'S'], // rij 5
    ['S', 'K', 'S', 'S', 'D', 'S'], // rij 6 — kol 0 = KOPPELSTRIP
  ],
  // De 3 koppelstrippen, als [rij, kolom] in het VOLGPANEEL (rij 0-geïndexeerd van onder):
  koppelstrips: [[1, 0], [3, 0], [5, 0]],
};

// CONCAVE-VOID: gedeelde POLY-BEWUSTE opening-subtractie (concave L/U-void → notch blijft bekleed;
// rechthoek → exact het oude bbox-gedrag). Vervangt de lokale bbox-only subtractRect.
import { subtractOpeningFromBrick as subtractRect } from './geometry.js';

// Volledige gevel: tegel WILDVERBAND_TRUTH. Per rij r (0 = onder): patroonrij = r % 6.
// Paneel 0 = startpaneel, paneel ≥ 1 = volgpaneel. De stenen liggen DOORLOPEND (stootvoeg
// tussen álle stenen, ook tussen panelen): zo OVERSPANT de KOPPELSTRIP de paneelnaad en
// koppelt de twee panelen. Op de volle rijen valt de naad schoon; op de koppel-rijen (2/4/6)
// is het startpaneel een maat smaller en kruist de bredere koppelstrip de rand.
// KAARSRECHTE PANEELRAND (board-snede): het volgende paneel begint op Σstrips(rij 1
// volgpaneel) + 6× stootvoeg (s+d+s+s+k+s + 6·j = 1155 bij S=210); de rand ligt panelVoeg
// mm (3) VÓÓR die eerste strip → boardEdge op k·pitch + (pitch − panelVoeg) = 1152, 2307, …
// Koppelstrippen (volg, kol 0 op rij 2/4/6) → koppelstrip:true. Geknipt rond openingen.
// Geeft bricks + horizontale paneelnaden + de kaarsrechte boardEdges (+ pitch/boardWidth).
export function buildTruthFacade(facadeWidth, facadeHeight, material, openings = [], panelVoeg = 3) {
  const H = material.steenH;
  const lint = material.lint ?? material.stoot;
  const j = material.stoot;
  const lagenmaat = H + lint;
  const rowsH = lagenmaat > 0 ? Math.floor(facadeHeight / lagenmaat) : 0;
  const koppelSet = new Set(WILDVERBAND_TRUTH.koppelstrips.map(([rr, cc]) => `${rr},${cc}`));

  // Het volgende paneel begint op Σstrips(rij 1 volgpaneel) + 6× stootvoeg (s+d+s+s+k+s+6·j).
  const refRow = WILDVERBAND_TRUTH.volg[0]; // rij 1 van het volgpaneel = referentie
  const boardSum = refRow.reduce((sum, c) => sum + stripWidth(c, material), 0);
  const pitch = boardSum + refRow.length * j;
  const boardWidth = pitch - panelVoeg; // kaarsrechte rand: 3 mm vóór de eerste strip volgpaneel

  const bricks = [];
  for (let r = 0; r < rowsH; r++) {
    const tr = ((r % 6) + 6) % 6;
    const rowY = r * lagenmaat;
    let x = 0;
    let panelIndex = 0;
    let guard = 0;
    while (x < facadeWidth - 0.5 && guard++ < 5000) {
      const codes = (panelIndex === 0 ? WILDVERBAND_TRUTH.start : WILDVERBAND_TRUTH.volg)[tr];
      for (let c = 0; c < codes.length; c++) {
        if (x >= facadeWidth - 0.5) break;
        const code = codes[c];
        const w = stripWidth(code, material);
        const clippedW = Math.min(w, facadeWidth - x);
        const isKoppel = panelIndex >= 1 && koppelSet.has(`${tr},${c}`);
        let segs = [{ x1: x, x2: x + clippedW, y1: rowY, y2: rowY + H }];
        for (const op of openings) {
          const nx = [];
          for (const sg of segs) nx.push(...subtractRect(sg, op));
          segs = nx;
        }
        for (const sg of segs) {
          bricks.push({ x: sg.x1, y: sg.y1, width: sg.x2 - sg.x1, height: sg.y2 - sg.y1, type: TYPE_MAP[code], koppelstrip: isKoppel, panelIndex });
        }
        x = r1(x + w + j); // doorlopend: stootvoeg tussen álle stenen (ook tussen panelen)
      }
      panelIndex++;
    }
  }

  const boardEdges = [];
  for (let k = 0; k * pitch + boardWidth < facadeWidth - 0.5; k++) boardEdges.push(r1(k * pitch + boardWidth));
  const horizontalSeams = [];
  for (let rr = 6; rr < rowsH; rr += 6) horizontalSeams.push(r1(rr * lagenmaat));
  return { bricks, horizontalSeams, boardEdges, pitch, boardWidth, rowsH, lagenmaat };
}

// Reshape naar de gedeelde facadeData.rows-vorm: { y, pieces:[{start,length,label,koppelstrip}] }.
// Dit is de bron die 3D (Viewer3D-batches), 2D (View2D) én de IFC-strip-export (ifc.js)
// allemaal consumeren — zo lopen de drie weergaven niet uiteen (Fase 2).
export function buildTruthRows(facadeWidth, facadeHeight, material, openings = [], panelVoeg = 3) {
  const fac = buildTruthFacade(facadeWidth, facadeHeight, material, openings, panelVoeg);
  const byY = new Map();
  for (const b of fac.bricks) {
    if (!byY.has(b.y)) byY.set(b.y, []);
    byY.get(b.y).push({ start: b.x, length: b.width, label: b.type, koppelstrip: b.koppelstrip });
  }
  const rows = [...byY.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, pieces]) => ({ y, pieces: pieces.sort((a, b) => a.start - b.start) }));
  return { rows, boardEdges: fac.boardEdges, pitch: fac.pitch, boardWidth: fac.boardWidth, lagenmaat: fac.lagenmaat };
}
