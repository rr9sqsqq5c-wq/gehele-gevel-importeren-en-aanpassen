// READ-ONLY VERIFY — gevelHandedness NA de fix: (1) gecorrigeerd teken van facadeNeedsMirror
// (mirror ⟺ outsideDir·ε < 0), (2) de bond-reflectie. Buitenrichtingen = de KLIKLIJST-waarheid.
globalThis.window = { location: { search: '' } };
const { buildFullGroupFacadePattern, facadeNeedsMirror } = await import('../src/lib/pattern.js');

console.log('=== (1) facadeNeedsMirror (teken outsideDir·ε < 0) ===');
const hcases = [
  ['272.5 langsgevel, kliklijst-buiten −z  (up=y,n=z,t=x,out=-1)', ['y','z','x',-1], true],
  ['kopse gevel 257.5, kliklijst-buiten +x (up=y,n=x,t=z,out=+1)', ['y','x','z', 1], true],
  ['272.5 met FOUTE heuristiek-buiten +z   (out=+1)',              ['y','z','x', 1], false],
  ['kopse met omgekeerde buiten −x         (out=-1)',              ['y','x','z',-1], false],
  ['geen outsideDir (null)',                                       ['y','z','x', null], false],
];
let ok = true;
for (const [name, [u,n,t,o], exp] of hcases) {
  const got = facadeNeedsMirror(u,n,t,o); const pass = got === exp; ok = ok && pass;
  console.log(`  ${pass?'🟢':'🔴'} ${name} → ${got} (verwacht ${exp})`);
}

// bond-reflectie: synthetische 272.5-wand met de KLIKLIJST-buitenrichting (out=-1) → mir=true → flip
const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const mkWall = (outsideDir) => ({
  expressID: 'synth', length: 3360, height: 2870,
  wallOrigin: { lengthStart: 0, lengthEnd: 3360, heightStart: 0, heightEnd: 2870, thicknessStart: 0, thicknessEnd: 272,
    lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', resolvedOutside: { outsideDir, confidence: 0.97, source: 'kliklijst' } },
  openings: [],
});
const firstRow = (fd) => { const minY = Math.min(...fd.rows.map(r=>r.y)); const r = fd.rows.find(x=>x.y===minY); return [...r.pieces].sort((a,b)=>a.start-b.start).map(p=>({s:Math.round(p.start),l:Math.round(p.length),lab:p.label})); };
const fmt = (r)=>r.map(p=>`${p.lab[0]}${p.l}@${p.s}`).join(' ');

globalThis.window.location.search = '';
const off = buildFullGroupFacadePattern([mkWall(-1)], MAT, 'halfsteens', null, null, null, 0, 0, null, null, false);
globalThis.window.location.search = '?gevelHandedness=1';
const on  = buildFullGroupFacadePattern([mkWall(-1)], MAT, 'halfsteens', null, null, null, 0, 0, null, null, false);
const W = off.groupWidth, rOff = firstRow(off), rOn = firstRow(on);
console.log(`\n=== (2) bond 272.5-synth (out=-1 kliklijst, groupWidth=${W}) ===`);
console.log(`  UIT : ${fmt(rOff)}`);
console.log(`  AAN : ${fmt(rOn)}`);
const offLeftWhole = rOff[0].s === 0 && rOff[0].l === MAT.steenL;
const last = rOn[rOn.length-1]; const onRightWhole = (last.s+last.l===W) && last.l===MAT.steenL;
const mset = new Set(rOff.map(p=>`${W-p.s-p.l}:${p.l}:${p.lab}`));
const isMirror = rOn.length===mset.size && rOn.every(p=>mset.has(`${p.s}:${p.l}:${p.lab}`));
for (const [name, pass] of [['UIT hele Strek links-verankerd', offLeftWhole], ['AAN hele Strek rechts-verankerd', onRightWhole], ['AAN = spiegeling van UIT', isMirror]]) { console.log(`  ${pass?'🟢':'🔴'} ${name}`); ok = ok && pass; }
console.log(`\nRESULTAAT: ${ok ? '🟢 ALLES GROEN' : '🔴 ER IS IETS MIS'}`);
process.exit(ok ? 0 : 1);
