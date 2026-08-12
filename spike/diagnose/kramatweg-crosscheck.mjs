// READ-ONLY MEET — reproduceer het Kramatweg-machinepaneel (1972x434) headless.
// Wegwerpwerk. Geen browser, geen IFC. Draai: node spike/diagnose/kramatweg-crosscheck.mjs
import {
  buildFacePattern,
  buildRowPiecesForWidth,
} from '../../src/lib/pattern.js';
import {
  buildFacadeZones,
  panelizeZone,
  generateBattenPositions,
  computeEffectiveBasePanel,
  generateMoldRecipe,
} from '../../src/lib/panelization.js';

const mat = { steenL: 210, steenH: 100, lint: 10, stoot: 10 };
const W = 1972, H = 434;

function dumpFace(verband) {
  console.log(`\n================ verband = ${verband} ================`);
  const rows = buildFacePattern(W, H, mat, verband, 0);
  const lagenmaat = verband === 'staand_tegelverband' ? mat.steenL + mat.lint : mat.steenH + mat.lint;
  const brickExtH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
  console.log(`lagenmaat=${lagenmaat}  brickExtH(hoogte strip)=${brickExtH}  aantal lagen=${rows.length}`);
  console.log('--- C1: per laag onderkant(row.y) + hart(row.y+brickExtH/2), van onderaf ---');
  rows.forEach((row, i) => {
    console.log(`  laag ${i}: row.y=${row.y}  hart=${round1(row.y + brickExtH / 2)}  #pieces=${row.pieces.length}`);
  });
  console.log('--- C2: pieces per laag (start,length,label), oplopende x ---');
  rows.forEach((row, i) => {
    const sorted = [...row.pieces].sort((a, b) => a.start - b.start);
    const total = sorted.reduce((s, p) => s + p.length, 0);
    const stoten = sorted.length - 1;
    console.log(`  laag ${i} [y=${row.y}]:`);
    for (const p of sorted) console.log(`      start=${p.start}\tlen=${p.length}\t${p.label}`);
    console.log(`      => som striplengtes=${round1(total)} + ${stoten} stootvoegen*${mat.stoot}=${round1(total + stoten * mat.stoot)} (paneel ${W})`);
  });
  return rows;
}

function round1(v) { return Math.round(v * 10) / 10; }

const rowsHalf = dumpFace('halfsteens');
dumpFace('staand_tegelverband');

// --- Wat schrijft de MAL-RECEPT-exporter (generateMoldRecipe) voor dit paneel? ---
console.log('\n================ generateMoldRecipe (mal-recept CSV) — halfsteens ================');
const panelen = { enabled: true, breedte: W, hoogte: H, dikte: 8 };
const basePanel = computeEffectiveBasePanel(panelen, 40, mat);
console.log('basePanel:', JSON.stringify(basePanel));
const battenYs = generateBattenPositions(H, mat, 400, { targetPanelH: H, minPanelH: 800 });
console.log('battenYs:', JSON.stringify(battenYs));
const zones = buildFacadeZones(W, H, []);
console.log('zones:', JSON.stringify(zones));
let panels = [];
for (const zone of zones) {
  const res = panelizeZone(zone, battenYs, basePanel, null, mat, 'halfsteens');
  if (res.ok) panels.push(...res.panels);
}
console.log('panels:', JSON.stringify(panels.map(p => ({ id: p.id, x: p.x, y: p.y, w: p.width, h: p.height }))));
const moldDims = { hoogte: 270, lengte: 3400 };
const recipe = generateMoldRecipe(panels, mat, 'halfsteens', 8, moldDims, 'Kramatweg');
console.log('--- mal-recept rijen (kolommen: totalRows, rowsPerMold, pass, passes, lagenmaat, sledePosities) ---');
for (const r of recipe) {
  console.log(`  paneel=${r[2]} bxh=${r[3]}x${r[4]} | totalRows=${r[6]} rowsPerMold=${r[7]} pass=${r[8]}/${r[9]} lagenmaat=${r[10]} slede=[${r[11]}]`);
}

console.log('\n================ REFERENTIE (extern machinebestand) ================');
console.log('  lagen: 4 stuks, hart y = 50, 160, 270, 380 (pitch 110)');
console.log('  per rij: 9 hele stenen 210 + 8 stootvoegen 10 = 1970 in paneel 1972');

// ======================= FASE 0c — FORMULE-AUDIT (append) =======================
console.log('\n\n######################## FASE 0c FORMULE-AUDIT ########################');
console.log('434 mod 110 =', 434 % 110);

const STEENH = 100, LINT = 10, LAAG = STEENH + LINT; // 110
const matA = { steenL: 210, steenH: STEENH, lint: LINT, stoot: 10 };

function nPattern(H) { return buildFacePattern(1000, H, matA, 'halfsteens', 0).length; }
function nMold(H) {
  const rec = generateMoldRecipe([{ id: 'P', zoneId: 'Z', width: 1000, height: H }], matA, 'halfsteens', 8, { hoogte: 270, lengte: 3400 }, 'x');
  return rec.length ? rec[0][6] : 0; // kolom 6 = 'Rijen totaal'
}
const nRef  = (H) => Math.floor((H + LINT) / LAAG);
const nCeil = (H) => Math.ceil(H / LAAG);

// ---- V5 sweep ----
let patDiff = 0, patFirst = null, moldDiff = 0, moldFirst = null;
let ceilDiff = 0, ceilFirst = null, refViol = 0, refViolFirst = null;
let biCondFail = 0, biCondFailFirst = null;
for (let H = 50; H <= 1500; H++) {
  const np = nPattern(H), nm = nMold(H), nr = nRef(H), nc = nCeil(H);
  if (np !== nr) { patDiff++; if (patFirst === null) patFirst = [H, np, nr]; }
  if (nm !== nr) { moldDiff++; if (moldFirst === null) moldFirst = [H, nm, nr]; }
  if (nc !== nr) { ceilDiff++; if (ceilFirst === null) ceilFirst = [H, nc, nr]; }
  // V6: 110*nr-10 <= H < 110*(nr+1)-10
  if (!(LAAG * nr - LINT <= H && LAAG * (nr + 1) - LINT > H)) { refViol++; if (refViolFirst === null) refViolFirst = H; }
  // V7 biconditional: (nc==nr)  <=>  (H%110>=100)
  const lhs = (nc === nr), rhs = ((H % LAAG) >= 100);
  if (lhs !== rhs) { biCondFail++; if (biCondFailFirst === null) biCondFailFirst = [H, H % LAAG, nc, nr]; }
}
console.log('\n--- V5 sweep H=50..1500 ---');
console.log(`n_pattern != n_ref : count=${patDiff}  first=${JSON.stringify(patFirst)} [H, n_pattern, n_ref]`);
console.log(`n_mold    != n_ref : count=${moldDiff}  first=${JSON.stringify(moldFirst)} [H, n_mold, n_ref]`);
console.log(`n_ceil    != n_ref : count=${ceilDiff}  first=${JSON.stringify(ceilFirst)} [H, n_ceil, n_ref]`);
console.log('\n--- V6: n_ref window check ---');
console.log(`schendingen van 110*n_ref-10 <= H < 110*(n_ref+1)-10 : ${refViol}  firstBad=${refViolFirst}`);
console.log('\n--- V7: biconditional (n_ceil==n_ref) <=> (H%110>=100) ---');
console.log(`fails=${biCondFail}  first=${JSON.stringify(biCondFailFirst)} [H, H%110, n_ceil, n_ref]`);
console.log(`n_ceil != n_ref total = ${ceilDiff}`);

// ---- V8 eerste hart ----
console.log('\n--- V8: eerste hart voor H=434 ---');
const r434 = buildFacePattern(1972, 434, matA, 'halfsteens', 0);
console.log(`laag0 row.y=${r434[0].y}  hart=row.y+steenH/2=${r434[0].y + STEENH / 2}`);

// ---- V9 slede ----
console.log('\n--- V9: slede-Y 1972x434 (uit generateMoldRecipe, panelizeZone-panelen) ---');
const bp = computeEffectiveBasePanel({ enabled: true, breedte: 1972, hoogte: 434, dikte: 8 }, 40, matA);
const bY = generateBattenPositions(434, matA, 400, { targetPanelH: 434, minPanelH: 800 });
let pnls = [];
for (const z of buildFacadeZones(1972, 434, [])) { const rr = panelizeZone(z, bY, bp, null, matA, 'halfsteens'); if (rr.ok) pnls.push(...rr.panels); }
const rec434 = generateMoldRecipe(pnls, matA, 'halfsteens', 8, { hoogte: 270, lengte: 3400 }, 'K');
for (const rr of rec434) console.log(`  paneel=${rr[2]} ${rr[3]}x${rr[4]} totalRows=${rr[6]} rowsPerMold=${rr[7]} pass=${rr[8]}/${rr[9]} lagenmaat=${rr[10]} slede=[${rr[11]}]`);

// ---- V10 sub-panelen ----
console.log('\n--- V10: targetWidth + panelizeZone-split 1972 ---');
console.log(`targetWidth=${bp.targetWidth}  (5*steenL+4*stoot=${5 * matA.steenL + 4 * matA.stoot})  paneelbreedte w=${bp.width}`);
console.log('panelizeZone panelen:', JSON.stringify(pnls.map(p => ({ id: p.id, x: p.x, w: p.width }))));

// ---- V13 naad x=990 ----
console.log('\n--- V13: naad x=990, halfsteens 1972x434 — per laag doorlopend of stootvoeg? ---');
const NAAD = 990;
let cont = 0, joint = 0;
r434.forEach((row, i) => {
  const crossing = [...row.pieces].find(p => p.start < NAAD - 0.001 && p.start + p.length > NAAD + 0.001);
  if (crossing) { cont++; console.log(`  laag ${i} [y=${row.y}]: DOORLOPEND — steen (start=${crossing.start}, length=${crossing.length}, ${crossing.label})`); }
  else { joint++; const startsAt = row.pieces.find(p => Math.abs(p.start - NAAD) < 0.6); console.log(`  laag ${i} [y=${row.y}]: STOOTVOEG op 990 ${startsAt ? `(volgende steen start=${startsAt.start})` : ''}`); }
});
console.log(`  => doorlopend=${cont}  stootvoeg-op-990=${joint}`);

// ======================= FASE 0d — SNAP-AUDIT (append) =======================
console.log('\n\n######################## FASE 0d SNAP-AUDIT ########################');
const matD = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };  // DEFAULT_MATERIAL
const LAAGD = matD.steenH + matD.lint; // 62
const VERB = 'halfsteens';
// Realistische panelen; maxKg hoog gezet zodat de gewichtslimiet NIET de hoogte bepaalt
// (isoleert de snap-vraag). Breedte 2500 → meerdere kolommen.
const panelenD = { enabled: true, breedte: 1200, hoogte: 1200, maxKg: 500 };
const FWIDTH = 2500;
function panelsFor(H) {
  const bp = computeEffectiveBasePanel(panelenD, matD.brickWeightM2 ?? 40, matD);
  const bY = generateBattenPositions(H, matD, 400, { targetPanelH: panelenD.hoogte, minPanelH: 800 });
  const out = [];
  for (const z of buildFacadeZones(FWIDTH, H, [])) {
    const rr = panelizeZone(z, bY, bp, null, matD, VERB); // snapFn = null (zoals App.jsx:4874)
    if (rr.ok) out.push(...rr.panels);
  }
  return { panels: out, battenYs: bY, bp };
}
function rowsFor(H) { return buildFacePattern(FWIDTH, H, matD, VERB, 0); }

const REAL_H = [1000,1300,1500,1600,1900,2000,2100,2200,2300,2400,2600,3100,3200,3300,3400,3700,3900,4300,4500,4700,5200,5600,5700,5800,6400,6900,7700,7900,9600,10300,10800,12200];

// ---- S4/S5/S6 over de echte BIL-MOO-hoogtes ----
let nPanels=0, nFirstHartExact=0, cross_y1=0, cross_y0=0;
const firstHartCounter={}, topGapCounter={}, counterEx=[];
let crossEx=null, crossY0Ex=null;
for (const H of REAL_H) {
  const { panels } = panelsFor(H);
  const rows = rowsFor(H);
  const harts = rows.map(r => ({ ok: r.y, bk: r.y + matD.steenH, hart: r.y + matD.steenH/2 }));
  for (const p of panels) {
    nPanels++;
    const y0 = p.y, y1 = p.y + p.height;
    // S4: rijen met hart binnen [y0,y1]
    const inside = harts.filter(h => h.hart >= y0 - 0.001 && h.hart <= y1 + 0.001).sort((a,b)=>a.hart-b.hart);
    if (inside.length) {
      const localFirst = Math.round((inside[0].hart - y0)*10)/10;
      firstHartCounter[localFirst] = (firstHartCounter[localFirst]||0)+1;
      if (Math.abs(localFirst - matD.steenH/2) < 0.001) nFirstHartExact++;
      else if (counterEx.length < 3) counterEx.push({ H, panelY0:y0, localFirst });
    }
    // S5: laag kruist bovenrand? o.k. < y1 < b.k.
    for (const h of harts) {
      if (h.ok < y1 - 0.001 && y1 < h.bk - 0.001) { cross_y1++; if(!crossEx) crossEx={H, rowOK:h.ok, panelY1:y1}; }
      if (h.ok < y0 - 0.001 && y0 < h.bk - 0.001) { cross_y0++; if(!crossY0Ex) crossY0Ex={H, rowOK:h.ok, panelY0:y0}; }
    }
    // S6: y1 - (b.k. bovenste hele laag binnen paneel)
    const fullInside = harts.filter(h => h.ok >= y0 - 0.001 && h.bk <= y1 + 0.001);
    if (fullInside.length) {
      const topBk = Math.max(...fullInside.map(h=>h.bk));
      const gap = Math.round((y1 - topBk)*10)/10;
      topGapCounter[gap] = (topGapCounter[gap]||0)+1;
    }
  }
}
console.log(`\n--- S3 (echte BIL-MOO hoogtes als facade-H) --- material steenH=${matD.steenH} lint=${matD.lint} laagmaat=${LAAGD}`);
console.log(`  #facade-hoogtes=${REAL_H.length}  H mod ${LAAGD}==0: ${REAL_H.filter(h=>h%LAAGD===0).length}/${REAL_H.length} (${(100*REAL_H.filter(h=>h%LAAGD===0).length/REAL_H.length).toFixed(1)}%)`);
console.log(`\n--- S4: eerste paneel-lokale hart == steenH/2 (=${matD.steenH/2})? ---`);
console.log(`  panelen totaal=${nPanels}  exact steenH/2: ${nFirstHartExact} (${(100*nFirstHartExact/nPanels).toFixed(1)}%)`);
console.log(`  histogram eerste-lokale-hart:`, JSON.stringify(firstHartCounter));
console.log(`  3 tegenvoorbeelden:`, JSON.stringify(counterEx));
console.log(`\n--- S5: laag kruist horizontale paneelnaad? ---`);
console.log(`  o.k. < panel.y1 < b.k. : ${cross_y1}  voorbeeld=${JSON.stringify(crossEx)}`);
console.log(`  o.k. < panel.y0 < b.k. : ${cross_y0}  voorbeeld=${JSON.stringify(crossY0Ex)}`);
console.log(`\n--- S6: paneel-bovenkant minus b.k. bovenste hele laag (verdeling) ---`);
console.log(`  `, JSON.stringify(topGapCounter));

// ---- fijne sweep H=800..6000 stap 1 voor robuustheid van S4/S5 ----
let sN=0, sExact=0, sCross=0;
for (let H=800; H<=6000; H++){
  const { panels } = panelsFor(H); const rows = rowsFor(H);
  const harts = rows.map(r=>({ok:r.y,bk:r.y+matD.steenH,hart:r.y+matD.steenH/2}));
  for (const p of panels){ const y0=p.y,y1=p.y+p.height; sN++;
    const inside=harts.filter(h=>h.hart>=y0-0.001&&h.hart<=y1+0.001).sort((a,b)=>a.hart-b.hart);
    if(inside.length && Math.abs((inside[0].hart-y0)-matD.steenH/2)<0.001) sExact++;
    for(const h of harts) if(h.ok<y1-0.001&&y1<h.bk-0.001) sCross++;
  }
}
console.log(`\n--- fijne sweep H=800..6000 ---`);
console.log(`  panelen=${sN}  eerste-lokale-hart==steenH/2: ${sExact} (${(100*sExact/sN).toFixed(1)}%)  laag-kruist-y1: ${sCross}`);

// ======================= FASE 0f — MAL-KOPPELING & DEDUP (append) =======================
console.log('\n\n######################## FASE 0f MAL-KOPPELING & DEDUP ########################');
// K5: paneel met MEER courses dan mal-capaciteit → passes + herhalende slede?
const matF = { steenL: 210, steenH: 50, lint: 12, stoot: 10 }; // laagmaat 62
const tallPanel = [{ id: 'BIG', zoneId: 'Z', width: 1000, height: 1240 }]; // 1240/62 = 20 courses
const recF = generateMoldRecipe(tallPanel, matF, 'halfsteens', 8, { hoogte: 270, lengte: 3400 }, 'G');
console.log(`paneel H=1240, laagmaat=62 → totalRows=${recF[0][6]}, rowsPerMold=${recF[0][7]}, passes=${recF[0][9]}`);
recF.forEach(r => console.log(`  pass ${r[8]}/${r[9]}: slede=[${r[11]}]`));
console.log('K4-bewijs: generateMoldRecipe krijgt ALLEEN panels (geen facadeData.rows) → count uit floor(H/laagmaat).');
// K3: paneel-entiteit dragt geen courses
const bpF = computeEffectiveBasePanel({ enabled: true, breedte: 1000, hoogte: 1240, maxKg: 500 }, 40, matF);
const pF = panelizeZone({ id: 'Z1', x: 0, y: 0, width: 1000, height: 1240 }, [], bpF, null, matF, 'halfsteens').panels[0];
console.log('K3: paneel-velden =', JSON.stringify(Object.keys(pF)));
