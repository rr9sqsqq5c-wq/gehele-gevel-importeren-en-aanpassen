// WEGWERP (spike/) — VALIDATE halfsteens 5-strek-paneel + koppelsteen om-en-om.
// panelizeZone bepaalt de paneelvoegen; buildRowPiecesForWidth geeft de bond per rij-pariteit.
// Check: (1) paneelvoegen op groep-lokaal k·pitch−3 (pitch=5·(steenL+stoot)); (2) op elke voeg
// overspant precies één rij-pariteit een strip (koppelsteen) → nooit twee opeenvolgende rijen.
import { panelizeZone } from '../src/lib/panelization.js';
import { buildRowPiecesForWidth } from '../src/lib/pattern.js';

const material = { steenL: 210, steenH: 65, lint: 12, stoot: 10 };
const pitch = 5 * (material.steenL + material.stoot); // 1100
const zone = { id: 'z', x: 0, y: 0, width: 6000, height: 2000 };
const basePanel = { width: 1200, height: 1000, targetWidth: 1200, minHeight: 800, maxHeight: 1000, verspringen: true };

const res = panelizeZone(zone, [], basePanel, null, material, 'halfsteens');
const panels = res.panels.sort((a, b) => a.x - b.x);
console.log('=== G1 — paneelvoegen op k·pitch − 3 (5 strekken + stoot−3) ===');
// board-edges = rechterrand van elk niet-laatste paneel vóór PANEL_GAP: reconstrueer uit panel.x (na +3 gap)
// panel.x van niet-eerste paneel = k·pitch (start strek); board-edge (cut) = k·pitch − 3.
const contentStarts = [...new Set(panels.map((p) => p.x))].filter((x) => x > 0.5).sort((a, b) => a - b);
console.log(`  paneel-content start-X: ${contentStarts.join(', ')}`);
const okGrid = contentStarts.every((x) => Math.abs((x % pitch)) < 0.6 || Math.abs((x % pitch) - pitch) < 0.6);
console.log(`  ${okGrid ? '🟢' : '🔴'} elk volgend paneel begint op een veelvoud van pitch (${pitch}) = een strek`);

console.log('\n=== G2 — koppelsteen om-en-om op elke paneelvoeg ===');
const even = buildRowPiecesForWidth(6000, material, 'halfsteens', 0, 0);
const odd  = buildRowPiecesForWidth(6000, material, 'halfsteens', 1, 0);
const spans = (row, x) => row.some((p) => p.start + 0.6 < x && x < p.start + p.length - 0.6);
// board-edge (cut) = content-start − 3
const boardEdges = contentStarts.map((x) => Math.round(x - 3));
let allAlternate = true;
for (const be of boardEdges) {
  const e = spans(even, be), o = spans(odd, be);
  const alt = e !== o; // precies één pariteit overspant → koppelsteen zit in één rij-set
  if (!alt) allAlternate = false;
  console.log(`  voeg x=${be}: even-rij overspant=${e} · oneven-rij overspant=${o} → ${alt ? 'om-en-om ✓' : 'STAPELT ✗'}`);
}
console.log(`  ${allAlternate ? '🟢' : '🔴'} op elke paneelvoeg overspant precies één rij-pariteit (nooit twee opeenvolgende rijen)`);

console.log('\n=== G3 — volgend paneel begint met een strek ===');
// op de content-start moet in de even rij een strek BEGINNEN (piece.start == contentStart)
const startsWithStrek = contentStarts.every((x) => even.some((p) => Math.abs(p.start - x) < 0.6 && p.label === 'Strek'));
console.log(`  ${startsWithStrek ? '🟢' : '🔴'} elk volgend paneel begint (even rij) met een Strek op de content-rand`);
