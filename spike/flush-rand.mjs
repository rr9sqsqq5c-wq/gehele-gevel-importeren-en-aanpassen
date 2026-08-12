import { buildFullGroupFacadePattern } from '../src/lib/pattern.js';
const material = { steenL:210, steenH:50, lint:10, stoot:10 };
// opening met SCHEVE polyPts (parallellogram, boven 20mm verschoven t.o.v. onder = trapjes-effect)
// + kozijnRect met polyPts:null (mijn parse-fix). Verwacht: knip volgt de RECHTE bbox, niet de scheve polygoon.
const wall = { expressID:1, length:6000, height:3000,
  wallOrigin:{ lengthStart:0, heightStart:0, heightEnd:3000, lengthAxis:'x', heightAxis:'y', thicknessAxis:'z' },
  openings:[{ x:1000, y:900, width:1790, height:1711, type:'raam', hasFill:true,
    polyPts:[{l:1020,h:900},{l:2810,h:900},{l:2790,h:2611},{l:1000,h:2611}],   // scheef
    kozijnRect:{ x:1000, y:900, breedte:1790, hoogte:1711, polyPts:null } }] };
const res = buildFullGroupFacadePattern([wall], material,'halfsteens',null,null,null,0,0,{left:10,right:10,top:10,bottom:10});
const o = res.groupOpenings[0];
console.log('  opening polyPts:', o.polyPts === null ? 'NULL → knip = rechte bbox (FLUSH) ✔' : 'scheve polygoon (getrapt) ✗ '+JSON.stringify(o.polyPts));
console.log('  bbox: x='+Math.round(o.x)+' breedte='+Math.round(o.width)+'  (1000-10 .. +1790+20 = rechte rand)');
