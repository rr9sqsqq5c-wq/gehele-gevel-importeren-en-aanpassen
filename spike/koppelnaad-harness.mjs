import { buildFullGroupFacadePattern } from '../src/lib/pattern.js';
const material = { steenL:210, steenH:50, lint:10, stoot:10 };
const wall = { expressID:1, length:6000, height:3000,
  wallOrigin:{ lengthStart:0, heightStart:0, heightEnd:3000, lengthAxis:'x', heightAxis:'y', thicknessAxis:'z' },
  openings:[
    { x:0,    y:0,   width:1112, height:2495, type:'deur', hasFill:true, kozijnRect:{ x:0,    y:0,   breedte:1112, hoogte:2495 } },
    { x:1112, y:784, width:1128, height:1711, type:'raam', hasFill:true, kozijnRect:{ x:1112, y:784, breedte:1128, hoogte:1711 } },
  ] };
const run = (off) => buildFullGroupFacadePattern([wall], material,'halfsteens',null,null,null,0,0,off);
const show = (label,off) => { const res=run(off);
  const d=res.groupOpenings.find(o=>o.type==='deur'), r=res.groupOpenings.find(o=>o.type==='raam');
  const naad = (Math.round(d.x+d.width)-1112) + (1112-Math.round(r.x));
  console.log(`${label.padEnd(22)}  buitenrand: deur-links ${String(Math.round(d.x)).padStart(4)} raam-rechts ${Math.round(r.x+r.width)}  |  koppelnaad-gat ${naad}mm (${Math.round(d.x+d.width)-1112}+${1112-Math.round(r.x)})`);
};
show('L/R 0',   { left:0,  right:0,  top:0,  bottom:0  });
show('L/R 5',   { left:5,  right:5,  top:25, bottom:25 });
show('L/R 10',  { left:10, right:10, top:25, bottom:25 });
show('L/R 15',  { left:15, right:15, top:25, bottom:25 });
console.log('\nverwacht: naad = max(10, L/R)*2 ; buitenrand volgt L/R');
