import { buildFullGroupFacadePattern } from '../src/lib/pattern.js';
const material = { steenL:210, steenH:50, lint:10, stoot:10 };
const wall = { expressID:1, length:6000, height:3000,
  wallOrigin:{ lengthStart:0, heightStart:0, heightEnd:3000, lengthAxis:'x', heightAxis:'y', thicknessAxis:'z' },
  openings:[
    { x:0,    y:0,   width:1112, height:2495, type:'deur', hasFill:true, kozijnRect:{ x:0,    y:0,   breedte:1112, hoogte:2495 } },
    { x:1112, y:784, width:1128, height:1711, type:'raam', hasFill:true, kozijnRect:{ x:1112, y:784, breedte:1128, hoogte:1711 } },
  ] };
const test = (L,R) => {
  const res = buildFullGroupFacadePattern([wall], material,'halfsteens',null,null,null,0,0,{ left:L, right:R, top:25, bottom:25, koppelnaad:10 });
  const d=res.groupOpenings.find(o=>o.type==='deur'), r=res.groupOpenings.find(o=>o.type==='raam');
  const deurLinks = 0 - Math.round(d.x);                     // buitenrand deur-links (= L)
  const deurRechtsNaad = Math.round(d.x+d.width) - 1112;     // naad deur-rechts
  const raamLinksNaad = 1112 - Math.round(r.x);              // naad raam-links
  const raamRechts = Math.round(r.x+r.width) - 2240;         // buitenrand raam-rechts (= R)
  console.log(`L=${L} R=${R}:  buitenrand[deur-links ${deurLinks}, raam-rechts ${raamRechts}]  naad[deur-rechts ${deurRechtsNaad}, raam-links ${raamLinksNaad}]  (verwacht naad max(10,R)=${Math.max(10,R)} / max(10,L)=${Math.max(10,L)})`);
};
test(0,0); test(5,20); test(20,5); test(25,25);
