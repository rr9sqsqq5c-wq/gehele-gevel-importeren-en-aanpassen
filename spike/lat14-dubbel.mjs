globalThis.localStorage = { getItem: (k) => ({ paneel14Laag:'1', halfsteensPanel5Strek:'1' })[k] ?? null, setItem(){} };
const { computeHorizontalLatten, buildFacadeZones } = await import('../src/lib/panelization.js');
const mat = { steenH:50, lint:12, steenL:210, stoot:10 };
const lagenmaat = mat.steenH + mat.lint;
const gW = 10000, gH = 6000;
const ramen = [
  { x:2328, y:900, width:1010, height:1600 }, { x:7488, y:900, width:1010, height:1600 },   // verdieping 1: 900..2500
  { x:2328, y:3400, width:1010, height:1600 }, { x:7488, y:3400, width:1010, height:1600 },  // verdieping 2: 3400..5000
];
const rows = [];
for (let k = 0; k * lagenmaat < gH; k++) rows.push({ y: k * lagenmaat, pieces: [{ start:0, length:gW }] });
const facadeData = { groupWidth: gW, groupHeight: gH, groupOpenings: ramen, rows };
const latten = { enabled: true, breedte: 50, maxInterval: 400, richting: 'horizontaal' };

const zones = buildFacadeZones(gW, gH, ramen.map(r=>({...r,polyPts:null})));
console.log(`${zones.length} zones:`);
for (const z of zones) console.log(`  x${Math.round(z.x)}..${Math.round(z.x+z.width)}  y${Math.round(z.y)}..${Math.round(z.y+z.height)}`);

const lats = computeHorizontalLatten({ facadeData, latten, mat, panelen:{hoogte:1200}, startLijn:0, backingType:'hout', verband:'halfsteens' });
console.log(`\n${lats.length} latten (center-Y | x-bereik):`);
for (const l of [...lats].sort((a,b)=>(a.y+a.height/2)-(b.y+b.height/2))) console.log(`  ${Math.round(l.y+l.height/2)} | x${Math.round(l.x)}..${Math.round(l.x+l.width)}`);

console.log(`\nDUBBELINGEN (x-overlap + |Δcenter| < 150):`);
let n=0;
for (let i=0;i<lats.length;i++) for (let j=i+1;j<lats.length;j++){
  const a=lats[i],b=lats[j]; const xo=a.x<b.x+b.width&&a.x+a.width>b.x; const dy=Math.abs((a.y+a.height/2)-(b.y+b.height/2));
  if(xo&&dy<150){ n++; if(n<=12) console.log(`  ${Math.round(a.y+a.height/2)}(x${Math.round(a.x)}..${Math.round(a.x+a.width)}) ⨉ ${Math.round(b.y+b.height/2)}(x${Math.round(b.x)}..${Math.round(b.x+b.width)})  Δ${Math.round(dy)}`); }
}
console.log(`  totaal ${n}`);
