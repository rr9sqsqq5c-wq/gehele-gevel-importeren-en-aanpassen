// ═══ CONGRUENTIE-REGRESSIE-WAAKHOND (zie CLAUDE.md §8b) ═══════════════════════════════════════════
// Draai NA elke paneel-/strip-/latten-/koppelstrip-wijziging:  node spike/congruent-final-verify.mjs
// Bewaakt dat 2D en werktekening voor een groep EXACT hetzelfde leveren via de gedeelde functies
// (buildGroupPanels / detectKoppelstrippen / buildFacadeLatten). EXIT-CODE 1 = eenheid gebroken.
// Beide views geven dezelfde gedeelde facadeData (rows/strips); View2D geeft buildGroupPanels baseMat=
// RAUWE mat + stripArt, Werktekening baseMat=ARTIKEL-mat + stripArt → beide zelfde effMat → zelfde panelen.
globalThis.localStorage = { getItem: (k) => (k === 'paneelOptimalisatie' || k === 'unifiedPanels') ? '1' : null, setItem() {}, removeItem() {} };
import { buildGroupPanels, detectKoppelstrippen, buildFacadeLatten } from '../src/lib/panelization.js';
import { buildFacePattern } from '../src/lib/pattern.js';

const rawMat = { steenL: 221, steenH: 51, lint: 5.6, stoot: 5.6, brickWeightM2: 34.6 };  // groep-materiaal
const art = { steenL: 210, steenH: 50 };                                                  // steenstrip-artikel
const effMat = { ...rawMat, steenL: art.steenL, steenH: art.steenH };                     // Werktekening's mat (na fix)
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, gewichtM2: 11.8, maxKg: 50, verspringen: false };
const latten = { maxInterval: 400 };
const gW = 10825, gH = 2870, verband = 'halfsteens';
const groupOpenings = [
  { x: 2328, y: 775, width: 1000, height: 1141, type: 'raam', polyPts: null },
  { x: 7488, y: 775, width: 1000, height: 1141, type: 'raam', polyPts: null },
  { x: 5000, y: 2100, width: 300, height: 150, type: 'ventilatie', polyPts: null },   // vent → beide filteren
];
// App's GEDEELDE facadeData: strips gebouwd met het ARTIKEL (zoals App.jsx:3482 effectiveMat3d)
const rows = buildFacePattern(gW, gH, effMat, verband);
const shared = { groupWidth: gW, groupHeight: gH, groupOpenings, rows, sparingRects: [] };

// View2D-aanroep: baseMat = RAUWE mat + stripArt (helper past artikel toe)
const p2d = buildGroupPanels({ ...shared, penanten: [], baseMat: rawMat, stripArt: art, panelen, latten, verband, startLijn: null, endExtensions: null }).panels;
// Werktekening-aanroep: baseMat = ARTIKEL-mat (mat is daar al effMat) + stripArt (idempotent)
const pWt = buildGroupPanels({ ...shared, penanten: [], baseMat: effMat, stripArt: art, panelen, latten, verband, startLijn: null, endExtensions: null }).panels;

const sig = (ps) => ps.map((p) => `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.width)},${Math.round(p.height)}`).sort();
const s2d = sig(p2d), sWt = sig(pWt);
const panelsEqual = s2d.length === sWt.length && s2d.every((v, i) => v === sWt[i]);
console.log(`\n1) PANELEN identiek? 2D=${p2d.length} panelen, werktekening=${pWt.length} panelen → ${panelsEqual ? '✓ BYTE-IDENTIEK' : '✗ VERSCHILLEND'}`);

// Koppelstrip-x: View2D = panelRightEdges (paneelrand binnen strip); Werktekening = detectKoppelstrippen
const rightEdges2d = [...new Set(p2d.map((p) => Math.round(p.x + p.width)))].filter((x) => x < gW - 1).sort((a, b) => a - b);
const kopWt = detectKoppelstrippen(pWt, rows, effMat, verband);
const seamWt = [...new Set(kopWt.map((k) => Math.round(k.x + k.width / 2)))];
// welke paneelnaden hebben een koppelstrip? (moeten samenvallen met de rechter-randen)
const naadHitsWt = rightEdges2d.filter((bx) => kopWt.some((k) => k.x < bx - 0.5 && (k.x + k.width) > bx + 0.5));
console.log(`2) KOPPELSTRIP-naden: 2D-paneelranden=${rightEdges2d.length}; werktekening detecteert koppelstrip op ${naadHitsWt.length} daarvan → ${naadHitsWt.length === rightEdges2d.length ? '✓ zelfde naden' : `(${rightEdges2d.length - naadHitsWt.length} rand(en) zonder — check)`}`);
console.log(`   paneelranden @ ${rightEdges2d.join(', ')}`);
// 3) LATTEN identiek? beide views: buildFacadeLatten met gedeelde facadeData + effMat + (byte-identieke) panelen
const lattenCfg = { enabled: true, richting: 'horizontaal', breedte: 45, dikte: 28, maxInterval: 400, minHOH: 370, maxHOH: 430 };
const fdForLat = { groupWidth: gW, groupHeight: gH, groupOpenings, rows };
const latArgs = (panels) => ({ facadeData: fdForLat, latten: lattenCfg, mat: effMat, panelen, panels, penanten: [], startLijn: null, verband, backingType: 'hout', sparingRects: [], endExtensions: null });
const lat2d = buildFacadeLatten(latArgs(p2d));
const latWt = buildFacadeLatten(latArgs(pWt));
const latSig = (ls) => ls.map((l) => `${Math.round(l.x)},${Math.round(l.y)},${Math.round(l.width)},${Math.round(l.height)}`).sort();
const sl2 = latSig(lat2d), slW = latSig(latWt);
const lattenEqual = sl2.length === slW.length && sl2.every((v, i) => v === slW[i]);
console.log(`3) LATTEN identiek? 2D=${lat2d.length} latten, werktekening=${latWt.length} latten → ${lattenEqual ? '✓ BYTE-IDENTIEK' : '✗ VERSCHILLEND'}`);
const ok = panelsEqual && lattenEqual;
console.log(`\n→ ${ok ? '2D EN WERKTEKENING CONGRUENT ✓ (zelfde facadeData + panelen + koppelstrippen + latten)' : 'EENHEID GEBROKEN ✗ — zie CLAUDE.md §8b'}`);
console.log('');
process.exit(ok ? 0 : 1);   // waakhond: exit-code 1 = congruentie gebroken
