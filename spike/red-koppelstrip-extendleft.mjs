// READ-ONLY DIAGNOSE — Bug A: links verlengen (extendLeft) → om-en-om koppelstrippen worden koppelstrip op ELKE rij.
// Hypothese: buildFullGroupFacadePattern verschuift de strip-pieces met −extendLeft (pattern.js:718), maar de
// paneel-kolomnaad snapt op k·pitch vanaf bondOriginX=0 (panelization.js:738) → die schuift NIET mee → fase-mismatch.
const flags = { paneelOptimalisatie: '1', unifiedPanels: '1', paneelBanden: '1', gevelHandedness: '1' };
globalThis.localStorage = { getItem: (k) => flags[k] ?? null, setItem() {}, removeItem() {} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const { buildGroupPanels, detectKoppelstrippen } = await import('../src/lib/panelization.js');

const mat = { steenL: 221, steenH: 51, lint: 5.6, stoot: 5.6, brickWeightM2: 34 };
const pitch = mat.steenL + mat.stoot;                       // 226.6
const startLijn = 62;
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 };
const latten = { enabled: true, richting: 'horizontaal', breedte: 45, dikte: 28, maxInterval: 400 };
const wall = (W, H) => ({ expressID: 1, length: W, height: H, wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, thicknessStart: 0, thicknessEnd: 100 }, openings: [] });

function build(extendLeft) {
  const fd = buildFullGroupFacadePattern([wall(6000, 2800)], mat, 'halfsteens', null, null, startLijn, extendLeft, 0, null, null, false);
  const ee = { left: { strips: extendLeft, battens: 0, panels: 0 }, right: { strips: 0, battens: 0, panels: 0 } };
  const panels = buildGroupPanels({ groupWidth: fd.groupWidth, groupHeight: fd.groupHeight, groupOpenings: [], rows: fd.rows, penanten: [], baseMat: mat, stripArt: null, panelen, latten, verband: 'halfsteens', sparingRects: [], startLijn, endExtensions: ee }).panels;
  const koppel = detectKoppelstrippen(panels, fd.rows, mat, 'halfsteens');
  return { fd, panels, koppel };
}

function analyse(label, extendLeft) {
  const { fd, panels, koppel } = build(extendLeft);
  // interne paneel-kolomnaden (x = paneelrechterrand, niet de gevelrand)
  const seams = [...new Set(panels.map((p) => Math.round(p.x + p.width)))].filter((x) => x > 1 && x < Math.round(fd.groupWidth) - 1).sort((a, b) => a - b);
  const rowYs = [...new Set(fd.rows.map((r) => Math.round(r.y)))].sort((a, b) => a - b);
  console.log(`\n═══ ${label} (extendLeft=${extendLeft}, extendLeft mod pitch = ${(extendLeft % pitch).toFixed(1)}) ═══`);
  console.log(`groupWidth=${Math.round(fd.groupWidth)}  panelen=${panels.length}  interne naden=${seams.length}  koppelstrippen totaal=${koppel.length}`);
  for (const X of seams) {
    // hoeveel STRIP-rijen overlappen deze naad-x horizontaal (kandidaat), en op hoeveel zit een koppelstrip
    const rowsHere = fd.rows.filter((r) => (r.pieces ?? []).some((pc) => pc.start < X - 0.5 && pc.start + pc.length > X + 0.5));   // strip spant X
    const rowsBreak = fd.rows.filter((r) => (r.pieces ?? []).some((pc) => Math.abs(pc.start - X) < 1.5 || Math.abs(pc.start + pc.length - X) < 1.5));  // stootvoeg op X
    const kopHere = koppel.filter((k) => k.x < X - 0.5 && k.x + k.width > X + 0.5).length;
    const totRows = fd.rows.length;
    const ratio = (kopHere / totRows * 100).toFixed(0);
    const verdict = kopHere >= totRows * 0.9 ? '🔴 ELKE rij' : (kopHere <= totRows * 0.6 && kopHere >= totRows * 0.35 ? '🟢 om-en-om' : '🟠 ' + ratio + '%');
    console.log(`  naad x=${X}: strip-spant=${rowsHere.length}/${totRows} rijen, stootvoeg-op-x=${rowsBreak.length} rijen, koppelstrip op ${kopHere}/${totRows} → ${verdict}`);
  }
}

analyse('BASELINE — geen verlenging', 0);
analyse('LINKS VERLENGD 150mm', 150);
analyse('LINKS VERLENGD op hele steek (pitch)', Math.round(pitch));   // controle: multiple of pitch → zou weer om-en-om moeten
