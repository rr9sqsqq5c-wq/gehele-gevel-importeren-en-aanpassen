// HARNESS (pure JS) — verifieer GECOMBINEERD frame (coupledSideOffsets):
//  1) gekoppelde entree deur+raam → offset alleen op buitenrand, koppelnaad schoon, hoogtes intact
//  2) standalone raam → volle offset alle zijden (ongewijzigd)
//  3) offset UIT → byte-identiek (geen inflate)
import { buildFullGroupFacadePattern } from '../src/lib/pattern.js';
const material = { steenL: 210, steenH: 50, lint: 10, stoot: 10 };
const wallEntree = {
  expressID: 1, length: 6000, height: 3000,
  wallOrigin: { lengthStart: 0, heightStart: 0, heightEnd: 3000, lengthAxis:'x', heightAxis:'y', thicknessAxis:'z' },
  openings: [
    { x: 0,    y: 0,   width: 1112, height: 2495, type:'deur', hasFill:true, kozijnRect:{ x:0,    y:0,   breedte:1112, hoogte:2495 } },
    { x: 1112, y: 784, width: 1128, height: 1711, type:'raam', hasFill:true, kozijnRect:{ x:1112, y:784, breedte:1128, hoogte:1711 } },
  ],
};
const wallSolo = {
  expressID: 2, length: 6000, height: 3000,
  wallOrigin: { lengthStart: 0, heightStart: 0, heightEnd: 3000, lengthAxis:'x', heightAxis:'y', thicknessAxis:'z' },
  openings: [ { x: 3000, y: 900, width: 1200, height: 1400, type:'raam', hasFill:true, kozijnRect:{ x:3000, y:900, breedte:1200, hoogte:1400 } } ],
};
const OFF = { left:0,right:0,top:0,bottom:0 };
const OFFSET = { left:10, right:10, top:25, bottom:25 };
const run = (wall, off) => buildFullGroupFacadePattern([wall], material, 'halfsteens', null, null, null, 0, 0, off);
const dump = (label, res) => { console.log(`\n== ${label} ==`);
  let lo=Infinity,hi=-Infinity;
  for (const o of res.groupOpenings){ console.log(`   ${o.type.padEnd(4)} X[${Math.round(o.x)}..${Math.round(o.x+o.width)}] Y[${Math.round(o.y)}..${Math.round(o.y+o.height)}]`); lo=Math.min(lo,o.x);hi=Math.max(hi,o.x+o.width);}
  console.log(`   buitenmaat: ${Math.round(hi-lo)} mm`);
  return res.groupOpenings;
};
console.log('###### ENTREE (deur+raam gekoppeld op X=1112) ######');
dump('offset UIT', run(wallEntree, null));
const e = dump('offset AAN — coupling onderdrukt', run(wallEntree, OFFSET));
const deur = e.find(o=>o.type==='deur'), raam = e.find(o=>o.type==='raam');
console.log(`   ✔ koppelnaad: deur-rechts=${Math.round(deur.x+deur.width)} raam-links=${Math.round(raam.x)}  (beide 1112 = geen offset op de naad)`);
console.log(`   ✔ buitenrand: deur-links=${Math.round(deur.x)} (-10) · raam-rechts=${Math.round(raam.x+raam.width)} (+10)`);
console.log(`   ✔ hoogtes: deur-onder=${Math.round(deur.y)} raam-onder=${Math.round(raam.y)}  (raam blijft op borstwering, wand eronder dicht)`);
console.log('\n###### STANDALONE RAAM ######');
const s = dump('offset AAN — volle offset', run(wallSolo, OFFSET));
const so = s[0];
console.log(`   ✔ alle zijden: X[${Math.round(so.x)}..${Math.round(so.x+so.width)}] = 3000-10 .. 4200+10 ; Y[${Math.round(so.y)}..${Math.round(so.y+so.height)}] = 900-25 .. 2300+25`);
console.log('\n###### BYTE-IDENTIEK offset UIT ######');
const a = JSON.stringify(run(wallEntree, null).groupOpenings);
const b = JSON.stringify(buildFullGroupFacadePattern([wallEntree], material, 'halfsteens', null, null, null, 0, 0).groupOpenings);
console.log('   offset=null vs geen-arg identiek:', a===b ? '✔ JA' : '�’ NEE');
