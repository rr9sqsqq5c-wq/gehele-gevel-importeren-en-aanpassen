// STRIP_SNIJLIJN — bovenste staand-strip van een penant-vlak: steekt zonder de vlag boven de penant-hoogte
// uit (ceil(height/lagenmaat)); met de vlag wordt die bovenste rij op `height` gesneden (deel-steen yBot/yTop).
const _ls = { stripSnijlijn: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { buildCenteredFacePattern } = await import('../src/lib/pattern.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };

function topStrip(rows, stripH) {
  const top = rows[rows.length - 1];
  const p0 = top.pieces[0] ?? {};
  const drawnTop = p0.yTop != null ? p0.yTop : top.y + stripH;   // wat de tekenaar/export gebruikt
  return { rowY: top.y, drawnTop, isDeel: p0.yBot != null && p0.yTop != null };
}

for (const H of [500, 1500]) {
  console.log(`\n═══ penant-hoogte ${H} mm · STAAND (striphoogte=steenL=${mat.steenL}) ═══`);
  _ls.stripSnijlijn = null;
  const off = topStrip(buildCenteredFacePattern(600, H, mat, 'staand_tegelverband'), mat.steenL);
  const overOff = Math.round((off.drawnTop - H) * 10) / 10;
  console.log(`  VLAG UIT: bovenste rij y=${off.rowY} → strip tot ${off.drawnTop}  ${overOff > 0.5 ? `🔴 ${overOff} mm UIT` : '🟢 binnen'}`);
  _ls.stripSnijlijn = '1';
  const on = topStrip(buildCenteredFacePattern(600, H, mat, 'staand_tegelverband'), mat.steenL);
  const overOn = Math.round((on.drawnTop - H) * 10) / 10;
  console.log(`  VLAG AAN: bovenste rij y=${on.rowY} → strip tot ${on.drawnTop}  ${Math.abs(overOn) <= 0.5 ? `🟢 geklemd op ${H} (deel-steen=${on.isDeel})` : `🔴 nog ${overOn} mm UIT`}`);
}

// eindoordeel 1: geen oversteek meer
_ls.stripSnijlijn = '1';
let ok = true;
for (const H of [500, 1500, 777, 2650]) {
  const t = topStrip(buildCenteredFacePattern(600, H, mat, 'staand_tegelverband'), mat.steenL);
  if (t.drawnTop > H + 0.5) ok = false;
}
console.log(`\n🟢 GEEN OVERSTEEK: ${ok ? 'ja' : 'NEE 🔴'}`);

// eindoordeel 2: shiftPenY-consistentie — na verschuiving (penSL) moet de deel-steen mee schuiven,
// zodat yTop = absolute penant-top (penSL+penEffPH) en yBot = row.y (strip start op rij-onderkant).
const shiftPenY = (rows, penSL) => penSL > 0 ? rows.map((row) => ({
  ...row, y: Math.round((row.y + penSL) * 100) / 100,
  pieces: row.pieces.map((p) => p.yBot != null
    ? { ...p, yBot: Math.round((p.yBot + penSL) * 100) / 100, yTop: Math.round((p.yTop + penSL) * 100) / 100 } : p),
})) : rows;
const penEffPH = 500, penSL = 200;                       // startlijn 200 → zichtbare penant-hoogte 500, top op 700
const shifted = shiftPenY(buildCenteredFacePattern(600, penEffPH, mat, 'staand_tegelverband'), penSL);
const topR = shifted[shifted.length - 1], tp = topR.pieces[0];
const absTop = penSL + penEffPH;                          // 700
const shiftOk = Math.abs(tp.yTop - absTop) < 0.5 && Math.abs(tp.yBot - topR.y) < 0.5;
console.log(`🟢 SHIFT-CONSISTENT: na +${penSL} → row.y=${topR.y}, deel-steen yBot=${tp.yBot} yTop=${tp.yTop} (verwacht yBot=${topR.y}, yTop=${absTop}) → ${shiftOk ? 'ja' : 'NEE 🔴'}`);

const allOk = ok && shiftOk;
console.log(`\n${allOk ? '🟢 BEWEZEN: bovenste strip geklemd op de vlak-top én schuift correct mee met de penant-startlijn.' : '🔴 FOUT.'}`);
process.exit(allOk ? 0 : 1);
