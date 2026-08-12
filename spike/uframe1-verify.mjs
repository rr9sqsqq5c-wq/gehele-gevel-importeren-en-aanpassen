// READ-ONLY VERIFY — u-frame stap 1 (pattern.js): bond-reflectie WEG, OPENINGEN naar u gespiegeld,
// facadeData.mirrored gezet. Invarianten: (a) vlag UIT = byte-identiek; (b) mir=false-vlak ongewijzigd
// ook met vlag AAN; (c) mir=true → openingen gespiegeld (x→groupWidth−x−width), bond links-uitgelijnd
// (hele steen op start 0), en het opening-GAT landt via mapLen (mir ? groupMinX+groupWidth−u) op de
// ECHTE wereldpositie. Draai:  node spike/uframe1-verify.mjs
globalThis.window = { location: { search: '' } };
const { buildFullGroupFacadePattern, facadeNeedsMirror } = await import('../src/lib/pattern.js');

const mapLen = (groupMinX, groupWidth, u, mir) => mir ? (groupMinX + groupWidth - u) : (groupMinX + u);
const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const OP = { x: 500, y: 800, breedte: 1000, hoogte: 1200, type: 'raam', id: 'op1' };
const mkWall = (outsideDir, tAxis, nAxis) => ({
  expressID: 'synth', length: 3360, height: 2870,
  wallOrigin: {
    lengthStart: 0, lengthEnd: 3360, heightStart: 0, heightEnd: 2870, thicknessStart: 0, thicknessEnd: 272,
    lengthAxis: tAxis, heightAxis: 'y', thicknessAxis: nAxis,
    resolvedOutside: { outsideDir, confidence: 0.97, source: 'kliklijst' },
  },
  openings: [{ ...OP }],
});
const build = (wall, search) => { globalThis.window.location.search = search; return buildFullGroupFacadePattern([wall], MAT, 'halfsteens', null, null, null, 0, 0, null, null, false); };
// eerste (onderste) rij, pieces gesorteerd
const firstRow = (fd) => { const minY = Math.min(...fd.rows.map(r => r.y)); const r = fd.rows.find(x => x.y === minY); return [...r.pieces].sort((a, b) => a.start - b.start); };
// rij op ooghoogte van de opening → gat = ontbrekend interval [gapS, gapE]
const rowAtY = (fd, y) => { const r = [...fd.rows].sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0]; return [...r.pieces].sort((a, b) => a.start - b.start); };
const gapIn = (pieces, lo, hi) => { // grootste gat binnen [lo,hi]
  let best = null; for (let i = 0; i < pieces.length - 1; i++) { const e = pieces[i].start + pieces[i].length, s = pieces[i + 1].start; if (s - e > 50) { if (s >= lo - 300 && e <= hi + 300) best = [Math.round(e), Math.round(s)]; } } return best; };
const near = (a, b, t = 2) => Math.abs(a - b) <= t;

let allOK = true;
const check = (name, cond, extra = '') => { allOK = allOK && cond; console.log(`  ${cond ? '🟢' : '🔴'} ${name}${extra ? '  ' + extra : ''}`); };

// ── facadeNeedsMirror sanity (kliklijst-waarheid) ──
console.log('=== facadeNeedsMirror ===');
check('mir-wall (y,z,x,out=-1) → true',  facadeNeedsMirror('y', 'z', 'x', -1) === true);
check('nomir-wall (y,z,x,out=+1) → false', facadeNeedsMirror('y', 'z', 'x', +1) === false);

// ── (a) vlag UIT = byte-identiek (mir-wall) ──
console.log('\n=== (a) vlag UIT vs baseline (mir-wall out=-1) ===');
const off = build(mkWall(-1, 'x', 'z'), '');
check('mirrored falsy', !off.mirrored);
check('opening op natuurlijke x=500', near(off.groupOpenings[0].x, 500));

// ── (b) mir=false-vlak: vlag AAN == vlag UIT (byte-identiek voor niet-gespiegeld vlak) ──
console.log('\n=== (b) mir=false-vlak (out=+1): AAN == UIT ===');
const nomirOff = build(mkWall(+1, 'x', 'z'), '');
const nomirOn  = build(mkWall(+1, 'x', 'z'), '?gevelHandedness=1');
check('mirrored beide falsy', !nomirOff.mirrored && !nomirOn.mirrored);
check('groupOpenings identiek', JSON.stringify(nomirOff.groupOpenings) === JSON.stringify(nomirOn.groupOpenings));
check('rows identiek', JSON.stringify(nomirOff.rows) === JSON.stringify(nomirOn.rows));

// ── (c) mir=true + vlag AAN: openingen gespiegeld, bond links, gat→echte wereld ──
console.log('\n=== (c) mir-vlak (out=-1) + vlag AAN ===');
const on = build(mkWall(-1, 'x', 'z'), '?gevelHandedness=1');
const W = on.groupWidth, gMinX = on.groupMinX;
check('mirrored === true', on.mirrored === true, `(groupWidth=${W})`);
const expX = Math.round(W - 500 - 1000);
check('opening gespiegeld naar u = groupWidth−x−width', near(on.groupOpenings[0].x, expX), `(u=${Math.round(on.groupOpenings[0].x)}, verwacht ${expX})`);
const r0 = firstRow(on);
check('bond links-uitgelijnd: hele steen op start 0', r0[0].start === 0 && Math.round(r0[0].length) === MAT.steenL, `(start ${r0[0].start}, len ${Math.round(r0[0].length)})`);
// opening-gat in de bond op ooghoogte
const rMid = rowAtY(on, OP.y + OP.hoogte / 2);
const gap = gapIn(rMid, on.groupOpenings[0].x, on.groupOpenings[0].x + OP.breedte);
if (gap) {
  const worldL = mapLen(gMinX, W, gap[1], true);   // u=gap.hi → wereld-links
  const worldR = mapLen(gMinX, W, gap[0], true);   // u=gap.lo → wereld-rechts
  const trueL = gMinX + OP.x, trueR = gMinX + OP.x + OP.breedte;
  check('gat u-span mapLen → ECHTE wereldpositie', near(worldL, trueL, 60) && near(worldR, trueR, 60),
    `(mapLen→[${Math.round(worldL)},${Math.round(worldR)}], echt [${trueL},${trueR}])`);
} else {
  check('gat gevonden in bond op ooghoogte', false, '(geen gat gedetecteerd)');
}

console.log(`\n${allOK ? '🟢 ALLE INVARIANTEN GROEN' : '🔴 ER FAALDE IETS'}`);
process.exit(allOK ? 0 : 1);
