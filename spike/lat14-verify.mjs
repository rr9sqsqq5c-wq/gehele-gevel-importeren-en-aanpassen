globalThis.localStorage = { getItem: (k) => ({ paneel14Laag:'1' })[k] ?? null, setItem(){} };
const { generateBattenPositions } = await import('../src/lib/panelization.js');
const mat = { steenH:50, lint:12 };  // lagenmaat 62, pitchV 868
const ys = generateBattenPositions(3000, mat, 400, { verband: 'halfsteens' });
console.log('lat-Y\'s (14-laag, groupHeight 3000):');
let prev = null;
for (const y of ys) { console.log(`  y=${y}${prev!=null?`   (h.o.h. ${Math.round(y-prev)})`:'  ← onderlat (+10)'}`); prev = y; }
console.log('verwacht: onderlat 10, voeg-latten ~866.5/1734.5/2602.5, 1 tussenlat per gat, h.o.h. ~428-434');
