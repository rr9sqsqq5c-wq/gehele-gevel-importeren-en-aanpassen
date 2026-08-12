// READ-ONLY VERIFY — penantTweeRijen-vlag op het penant-voorvlak (buildCenteredFacePattern).
// window-stub zodat readFlag() de vlag uit ?penantTweeRijen kan lezen.
globalThis.window = { location: { search: '' } };
const { buildCenteredFacePattern } = await import('../src/lib/pattern.js');

const mat = { steenL: 221, steenH: 50, lint: 6, stoot: 6 };
const W = 563, H = 200;

const lens = (row) => row.pieces.map((p) => Math.round(p.length * 10) / 10);
const rowStr = (row) => row.pieces.map((p) => `${p.label}(${Math.round(p.length * 10) / 10})`).join(' · ');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function run(label) {
  const rows = buildCenteredFacePattern(W, H, mat, 'halfsteens');
  console.log(`\n=== ${label} ===`);
  rows.slice(0, 2).forEach((row, i) => {
    const sum = row.pieces.reduce((s, p) => s + p.length, 0) + (row.pieces.length - 1) * mat.stoot;
    console.log(`  rij ${i} (${i % 2 === 0 ? 'even ' : 'oneven'}): ${rowStr(row)}   Σ+voeg = ${Math.round(sum * 10) / 10}`);
  });
  return rows;
}

globalThis.window.location.search = '';
const off = run('vlag UIT (huidig gedrag)');
globalThis.window.location.search = '?penantTweeRijen=1';
const on = run('vlag AAN (penantTweeRijen)');

console.log('\n=== CHECKS (alles moet true zijn) ===');
const checks = [
  ['OFF even   = 165·221·165',        eq(lens(off[0]), [165, 221, 165])],
  ['OFF oneven = 51,5·221·221·51,5',  eq(lens(off[1]), [51.5, 221, 221, 51.5])],
  ['ON  even   = 165·221·165 (ongewijzigd t.o.v. OFF)', eq(lens(on[0]), lens(off[0]))],
  ['ON  oneven = 221·109·221',        eq(lens(on[1]), [221, 109, 221])],
  ['symmetrie ON oneven (links == rechts)', lens(on[1])[0] === lens(on[1])[2]],
];
let allOk = true;
for (const [name, ok] of checks) { console.log(`  ${ok ? '🟢' : '🔴'} ${name}`); if (!ok) allOk = false; }
console.log(`\nRESULTAAT: ${allOk ? '🟢 ALLES GROEN' : '🔴 ER IS IETS MIS'}`);
process.exit(allOk ? 0 : 1);
