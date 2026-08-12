// READ-ONLY reproductie: roept de ECHTE fitFacadePlane (facadePlane.js) aan op
// SYNTHETISCHE verticale gevels (kijkend langs +X,-X,+Z,-Z) in een y-up model, en
// op een horizontaal-plaat-groep (contrast). Toont uAxis/tAxis/nAxis per geval.
// Geen src-wijziging. Verwacht: verticale gevel → uAxis='y' altijd (geen swap);
// horizontale plaat → guard-tak (nAxis===up) → uAxis via span.
import { fitFacadePlane } from '../../src/lib/facadePlane.js';

// Bouw een lid met expliciete wallOrigin. n = normaal-as (dun), L = lengte-as (horizontaal),
// up = 'y'. thickness 100 (dun), length 5000, height 3000. outsideDir voor ±-teken.
function member(id, nAxis, lengthAxis, outsideDir) {
  const dims = { x: [0, 0], y: [0, 3000], z: [0, 0] };
  dims[lengthAxis] = [0, 5000];
  dims[nAxis] = outsideDir > 0 ? [0, 100] : [-100, 0];
  const wo = {
    lengthAxis, heightAxis: 'y', thicknessAxis: nAxis,
    lengthStart: dims[lengthAxis][0], lengthEnd: dims[lengthAxis][1],
    heightStart: 0, heightEnd: 3000,
    thicknessStart: dims[nAxis][0], thicknessEnd: dims[nAxis][1],
    resolvedOutside: { outsideDir, outsidePos: outsideDir > 0 ? 100 : -100 },
  };
  return { expressID: id, length: 5000, height: 3000, openings: [], wallOrigin: wo };
}
// co-facing groep van n leden (zelfde oriëntatie) zodat thinVote unaniem is
const grp = (nAxis, lengthAxis, outsideDir) =>
  Array.from({ length: 5 }, (_, i) => member(100 + i, nAxis, lengthAxis, outsideDir));

const cases = [
  ['verticaal +X (normaal x, lengte z)', grp('x', 'z', +1)],
  ['verticaal -X (normaal x, lengte z)', grp('x', 'z', -1)],
  ['verticaal +Z (normaal z, lengte x)', grp('z', 'x', +1)],
  ['verticaal -Z (normaal z, lengte x)', grp('z', 'x', -1)],
];

console.log('=== VERTICALE GEVELS (model up = y) ===');
console.log('geval\t\t\t\t\tnAxis\tuAxis\ttAxis\toutsideDir\tguard?\tSWAP?');
let anySwap = false;
for (const [label, members] of cases) {
  const p = fitFacadePlane(members, 'y');
  const guard = p.nAxis === 'y';
  const swap = p.uAxis !== 'y'; // verticale gevel hoort uAxis=up=y; anders gewisseld
  if (swap) anySwap = true;
  console.log(`${label}\t${p.nAxis}\t${p.uAxis}\t${p.tAxis}\t${p.outsideDir}\t\t${guard ? 'JA' : '-'}\t${swap ? '⚠SWAP' : 'ok'}`);
}
console.log(`→ enige verticale gevel met swap? ${anySwap ? 'JA' : 'NEE'}`);

// CONTRAST: horizontale plaat (dun in y = up) → nAxis===up → guard-tak (:80-85)
console.log('\n=== CONTRAST: horizontale plaat (dun in y=up) ===');
function plate(id, dx, dz) { // dun in y (200), groot in x/z
  return { expressID: id, length: Math.max(dx, dz), height: 200, openings: [],
    wallOrigin: { lengthAxis: dx >= dz ? 'x' : 'z', heightAxis: 'y', thicknessAxis: dx >= dz ? 'z' : 'x',
      lengthStart: 0, lengthEnd: Math.max(dx, dz), heightStart: 0, heightEnd: 200,
      thicknessStart: 0, thicknessEnd: Math.min(dx, dz) } };
}
// plaat veel breder in x dan z → spanOf(x) > spanOf(z)
const plates = Array.from({ length: 5 }, (_, i) => plate(200 + i, 6000, 1200));
const pp = fitFacadePlane(plates, 'y');
console.log(`nAxis=${pp.nAxis} uAxis=${pp.uAxis} tAxis=${pp.tAxis} guard?=${pp.nAxis === 'y' ? 'JA' : '-'}`);
console.log('warnings:', JSON.stringify(pp.warnings));
console.log(`→ guard-tak kiest uAxis = kleinste-span-as (van x/z): uAxis=${pp.uAxis} (span-afhankelijk)`);
