// STRIP_SNIJLIJN — bewijs dat OOK het penant-zone-pad (buildFullGroupFacadePattern, App.jsx:3745) de
// bovenste staand-strip op de vlak-top snijdt. Dit was het gemiste pad ("klopt nog steeds niet in 3d").
const _ls = { stripSnijlijn: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
// minimale axis-aligned wand (Y-up): hoogte 500 (valt NIET op een hele staand-laag van 222)
const wall = {
  expressID: 1,
  length: 2000, height: 500,   // buildFullGroupFacadePattern leest w.length / w.height (top-level)
  wallOrigin: {
    lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z',
    lengthStart: 0, heightStart: 0, thicknessStart: 0, thicknessEnd: 100,
  },
  openings: [],
};

function topOf(rows) {
  const t = rows[rows.length - 1];
  const p0 = t.pieces[0] ?? {};
  const drawnTop = p0.yTop != null ? p0.yTop : t.y + mat.steenL;   // staand striphoogte = steenL
  return { rowY: t.y, drawnTop, isDeel: p0.yBot != null };
}

function run(label) {
  const fd = buildFullGroupFacadePattern([wall], mat, 'staand_tegelverband', null, null, null);
  if (!fd || !fd.rows?.length) { console.log(`${label}: geen rows (fixture faalt)`); return null; }
  const t = topOf(fd.rows);
  const over = Math.round((t.drawnTop - fd.groupHeight) * 10) / 10;
  console.log(`${label}: groupHeight=${fd.groupHeight} · bovenste rij y=${t.rowY} → strip tot ${t.drawnTop}  ${over > 0.5 ? `🔴 ${over} mm UIT` : `🟢 binnen (deel-steen=${t.isDeel})`}`);
  return { over, fd };
}

_ls.stripSnijlijn = null;
const off = run('VLAG UIT');
_ls.stripSnijlijn = '1';
const on = run('VLAG AAN');

const ok = off && on && off.over > 0.5 && on.over <= 0.5;
console.log(`\n${ok ? '🟢 BEWEZEN: het penant-zone-pad (buildFullGroupFacadePattern) klemt de bovenste staand-strip nu op de vlak-top.' : '🔴 FOUT / fixture onbruikbaar.'}`);
process.exit(ok ? 0 : 1);
