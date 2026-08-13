// READ-ONLY DIAGNOSE — werkt de groep-"Optrekken naar maxlijn" (maxHoogteVullen → fillToMax)?
// Test buildFullGroupFacadePattern (directe pad) op een wand van 500mm hoog met maxHoogte 800.
//   - fillToMax=false → bekleding stopt op de wandtop (500).
//   - fillToMax=true  → bekleding loopt DOOR tot 800 (optrekken).
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const wall = {
  expressID: 1, length: 2000, height: 500,
  wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, thicknessStart: 0, thicknessEnd: 100 },
  openings: [],
};

function topRowY(fd) {
  const t = fd.rows[fd.rows.length - 1];
  return { groupHeight: fd.groupHeight, topRowY: t.y, nRows: fd.rows.length };
}

// maxHoogte=800 (> wand 500)
const off = buildFullGroupFacadePattern([wall], mat, 'halfsteens', 800, null, null, 0, 0, null, null, false);
const on  = buildFullGroupFacadePattern([wall], mat, 'halfsteens', 800, null, null, 0, 0, null, null, true);

const o = topRowY(off), n = topRowY(on);
console.log(`fillToMax=FALSE: groupHeight=${o.groupHeight}, ${o.nRows} rijen, bovenste rij y=${o.topRowY}  → ${o.groupHeight <= 501 ? '🟢 stopt op wandtop (500)' : '?'}`);
console.log(`fillToMax=TRUE : groupHeight=${n.groupHeight}, ${n.nRows} rijen, bovenste rij y=${n.topRowY}  → ${n.groupHeight >= 799 ? '🟢 trekt op naar 800' : '🔴 trekt NIET op (blijft ' + n.groupHeight + ')'}`);

const werkt = o.groupHeight <= 501 && n.groupHeight >= 799 && n.nRows > o.nRows;
console.log(`\n${werkt ? '🟢 Optrekken WERKT in het directe pad (buildFullGroupFacadePattern).' : '🔴 Optrekken werkt hier NIET — fix nodig.'}`);
console.log('LET OP: de meeste handmatige groepen lopen via best-fit (facadePlane.js) — dat pad gebruikt fillTop in maskRowsToContours; apart te checken met echte walls.');
