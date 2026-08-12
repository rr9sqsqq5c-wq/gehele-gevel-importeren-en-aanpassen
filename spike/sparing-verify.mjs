import { projectElementToGroupRect, sparingRectsForGroup, clipRowsAroundRects } from '../src/lib/sparingElements.js';
const R=[]; const ok=(l,p,x='')=>R.push({l,p,x});

// Gevelgroep: lengte-as x [0..4000], hoogte-as z [0..3000], dikte-as y, wand-dikte y=[100..300].
const gf={ lengthAxis:'x', heightAxis:'z', thicknessAxis:'y', groupMinX:0, groupMinH:0, groupWidth:4000, groupHeight:3000, thickMin:100, thickMax:300 };

// element 1: leiding rond x=1000..1200, z=1000..1200, y=150..250 (in de wand) → sparing met offset 50
const b1={minX:1000,maxX:1200,minY:150,maxY:250,minZ:1000,maxZ:1200};
const r1=projectElementToGroupRect(b1,gf,50);
ok('projectie + offset 50: x=950,y=950,w=300,h=300', r1 && r1.x===950 && r1.y===950 && r1.width===300 && r1.height===300, JSON.stringify(r1));

// element 2: ver vóór de gevel (y=2000..2100) → buiten dikte-bereik → null
ok('diepte-check: element ver van gevel → null', projectElementToGroupRect({minX:1000,maxX:1200,minY:2000,maxY:2100,minZ:1000,maxZ:1200},gf,50)===null);

// element 3: footprint buiten gevel-extent (x=5000..5200) → null
ok('footprint buiten extent → null', projectElementToGroupRect({minX:5000,maxX:5200,minY:150,maxY:250,minZ:1000,maxZ:1200},gf,50)===null);

// sparingRectsForGroup filtert
const els=[{expressID:1,bbox:b1},{expressID:2,bbox:{minX:5000,maxX:5200,minY:150,maxY:250,minZ:1000,maxZ:1200}}];
const rects=sparingRectsForGroup(els,gf,50);
ok('sparingRectsForGroup: 1 van 2 elementen raakt de gevel', rects.length===1 && rects[0].expressID===1);

// clip: rij op z=990..1050 (rowH=60), één doorlopend stuk 0..4000, sparing 950..1250 → geknipt in 2
const rows=[{y:990,pieces:[{start:0,length:4000,label:'Strek'}]}];
const clipped=clipRowsAroundRects(rows, rects, 60);
const p=clipped[0].pieces;
ok('clip: doorlopend stuk geknipt rond sparing (2 stukken)', p.length===2 && p[0].start===0 && Math.round(p[0].length)===950 && p[1].start===1250, JSON.stringify(p.map(q=>[q.start,Math.round(q.length)])));

// clip: rij ver onder de sparing (z=100..160) → ongewijzigd
const rows2=[{y:100,pieces:[{start:0,length:4000}]}];
ok('clip: rij buiten sparing-hoogte → ongewijzigd', clipRowsAroundRects(rows2,rects,60)[0].pieces.length===1);

// byte-identiek: geen rects → zelfde referentie
ok('geen rects → rows onveranderd (zelfde ref)', clipRowsAroundRects(rows,[],60)===rows);

console.log('\n=== SPARING-ELEMENTEN — bewijs-spike ===\n');
let all=true; for(const {l,p,x} of R){ if(!p)all=false; console.log(`${p?'🟢':'🔴'} ${l}${x?'  — '+x:''}`); }
console.log(`\n${all?'🟢 ALLE CHECKS GROEN':'🔴 ROOD'}\n`); process.exit(all?0:1);
