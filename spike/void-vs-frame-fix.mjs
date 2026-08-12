import { buildFullGroupFacadePattern } from '../src/lib/pattern.js';
const material = { steenL:210, steenH:50, lint:10, stoot:10 };
// opening: ruwe void = 2280 (0..2280), kozijn-frame = 2240 (20..2260)
const wall = { expressID:1, length:6000, height:3000,
  wallOrigin:{ lengthStart:0, heightStart:0, heightEnd:3000, lengthAxis:'x', heightAxis:'y', thicknessAxis:'z' },
  openings:[ { x:0, y:900, width:2280, height:1400, type:'raam', hasFill:true, polyPts:null,
               kozijnRect:{ x:20, y:900, breedte:2240, hoogte:1400, polyPts:null } } ] };
const w = (res)=>{ const o=res.groupOpenings[0]; return Math.round(o.width); };
const OFF = buildFullGroupFacadePattern([wall], material,'halfsteens',null,null,null,0,0,null);
const ON0 = buildFullGroupFacadePattern([wall], material,'halfsteens',null,null,null,0,0,{left:0,right:0,top:0,bottom:0});
const ON10= buildFullGroupFacadePattern([wall], material,'halfsteens',null,null,null,0,0,{left:10,right:10,top:25,bottom:25});
console.log('  offset UIT (volgt void) :', w(OFF), 'mm');
console.log('  offset AAN 0 (volgt frame):', w(ON0), 'mm  → moet 2240 zijn');
console.log('  offset AAN 10 (frame+10) :', w(ON10),'mm  → moet 2260 zijn');
