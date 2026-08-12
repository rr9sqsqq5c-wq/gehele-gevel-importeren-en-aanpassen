// STRIP_SNIJLIJN — bewijs dat de IFC-EXPORT deel-stenen schrijft (kortere extrusie tot de snijlijn)
// i.p.v. de hele strip. Echte pijplijn: buildFacePattern → clipRowsAroundRects (vlag aan → yBot/yTop) →
// exportGroupsToIfc (headless: geen dirHandle, geen document → return content). We tellen de
// IFCEXTRUDEDAREASOLID-hoogtes van de strips: vol = steenH; deel-steen < steenH.

const _ls = { stripSnijlijn: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };

const { exportGroupsToIfc } = await import('../src/lib/ifc.js');
const { buildFacePattern } = await import('../src/lib/pattern.js');
const { clipRowsAroundRects } = await import('../src/lib/sparingElements.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const gW = 2000, gH = 1000, verband = 'halfsteens';
const stripH = mat.steenH;                                  // halfsteens strip-hoogte
const sparing = [{ x: 800, width: 400, y: 270, height: 250 }];   // onderrand 270 (midden strip 248–298), bovenrand 520 (midden strip 496–546)

function runExport() {
  const rows0 = buildFacePattern(gW, gH, mat, verband);
  const rows = clipRowsAroundRects(rows0, sparing, stripH);
  const rwo = {
    lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', thicknessStart: 0, thicknessEnd: 100,
    resolvedOutside: { outsidePos: 100, outsideDir: 1, source: 'test', confidence: 1 },
  };
  const group = {
    id: 'g1', name: 'Test', refWallOrigin: rwo, groupMinX: 0, groupMinH: 0,
    facadeData: { rows, groupWidth: gW, groupHeight: gH, groupMinX: 0, groupMinH: 0, mirrored: false },
    wallsWithRows: [],
    // alleen strips exporteren zodat álle extrusies steenstrips zijn (panelen/latten uit)
    layerVisibility: { panelen: false, latten: false, penanten: false, koppelstrippen: false },
  };
  const wallSettings = { g1: { material: mat, verband, panelen: { dikte: 8 }, outsideDirFlip: false } };
  return exportGroupsToIfc([group], wallSettings, 'test', null);
}

// pak de 4e parameter (extrusie-diepte) uit elke IFCEXTRUDEDAREASOLID
function extrusionHeights(ifc) {
  const out = [];
  const re = /IFCEXTRUDEDAREASOLID\(#\d+,#\d+,#\d+,([\d.]+)\)/g;
  let m;
  while ((m = re.exec(ifc)) !== null) out.push(Math.round(parseFloat(m[1]) * 100) / 100);
  return out;
}

function summarize(label) {
  const ifc = runExport();
  const hs = extrusionHeights(ifc);
  const vol = hs.filter((h) => Math.abs(h - stripH) < 0.5).length;
  const deel = hs.filter((h) => h > 0.5 && h < stripH - 0.5).length;
  const deelHoogtes = [...new Set(hs.filter((h) => h > 0.5 && h < stripH - 0.5))].sort((a, b) => a - b);
  console.log(`\n=== ${label} ===`);
  console.log(`  strip-extrusies: ${hs.length} totaal · ${vol} vol (${stripH} mm) · ${deel} deel-steen (< ${stripH} mm)`);
  if (deelHoogtes.length) console.log(`  deel-steen-hoogtes: ${deelHoogtes.join(', ')} mm`);
  return { deel, vol };
}

_ls.stripSnijlijn = null;
const off = summarize('VLAG UIT (huidige export: hele strip of niets)');
_ls.stripSnijlijn = '1';
const on = summarize('VLAG AAN (export schrijft deel-steen tot de snijlijn)');

console.log('\n--- CONCLUSIE ---');
console.log(`UIT: ${off.deel} deel-steen-extrusies (verwacht 0).`);
console.log(`AAN: ${on.deel} deel-steen-extrusies (verwacht > 0).`);
const ok = off.deel === 0 && on.deel > 0 && on.vol > 0;
console.log(ok ? '\n🟢 BEWEZEN: IFC-export snijdt strips op de werkelijke rand; vlag uit = ongewijzigd.' : '\n🔴 FOUT: verwachting niet gehaald.');
process.exit(ok ? 0 : 1);
