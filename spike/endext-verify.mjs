// BEWIJS-SPIKE — extendPanelsAtEnds/extendLattenAtEnds (handmatige einduiteinde-extensie).
import { extendPanelsAtEnds, extendLattenAtEnds } from '../src/lib/panelization.js';
const GW = 2000;
const results = []; const ok = (l, p, x='') => results.push({ l, p, x });

// PANELEN
const panels = [
  { x: 0,    width: 600, y: 0,   height: 800 }, // linkerrand
  { x: 700,  width: 600, y: 0,   height: 800 }, // midden
  { x: 1400, width: 600, y: 0,   height: 800 }, // rechterrand (1400+600=2000)
  { x: 0,    width: 600, y: 800, height: 800 }, // linkerrand, 2e rij (stapel)
];
// byte-identiek als eL=eR=0
ok('panelen eL=eR=0 → zelfde referentie (byte-identiek)', extendPanelsAtEnds(panels, GW, 0, 0) === panels);
const pe = extendPanelsAtEnds(panels, GW, 100, 150);
ok('links-rand paneel schuift -100 en +100 breed', pe[0].x === -100 && pe[0].width === 700, `x=${pe[0].x} w=${pe[0].width}`);
ok('midden-paneel onveranderd', pe[1].x === 700 && pe[1].width === 600);
ok('rechts-rand paneel +150 breed, x gelijk', pe[2].x === 1400 && pe[2].width === 750, `w=${pe[2].width}`);
ok('2e linker-rij paneel schuift ook mee (hele kolom)', pe[3].x === -100 && pe[3].width === 700);

// LATTEN
const latten = [
  { x: 0, width: 2000, y: 100, height: 50, richting: 'horizontaal' }, // volle breedte
  { x: 0, width: 50, y: 0, height: 2000, richting: 'verticaal' },     // verticaal → ongemoeid
];
ok('latten eL=eR=0 → zelfde referentie', extendLattenAtEnds(latten, GW, 0, 0) === latten);
const le = extendLattenAtEnds(latten, GW, 80, 120);
ok('horizontale latte: -80 links, +120 rechts → breedte 2200', le[0].x === -80 && le[0].width === 2200, `x=${le[0].x} w=${le[0].width}`);
ok('verticale latte onveranderd', le[1].x === 0 && le[1].width === 50);

// alleen rechts
const pr = extendPanelsAtEnds(panels, GW, 0, 200);
ok('alleen eR: linkerrand onveranderd', pr[0].x === 0 && pr[0].width === 600);
ok('alleen eR: rechterrand +200', pr[2].width === 800);

console.log('\n=== EINDUITEINDE-EXTENSIE — bewijs-spike ===\n');
let all = true;
for (const { l, p, x } of results) { if (!p) all = false; console.log(`${p ? '🟢' : '🔴'} ${l}${x ? '  — ' + x : ''}`); }
console.log(`\n${all ? '🟢 ALLE CHECKS GROEN' : '🔴 ROOD'}\n`);
process.exit(all ? 0 : 1);
