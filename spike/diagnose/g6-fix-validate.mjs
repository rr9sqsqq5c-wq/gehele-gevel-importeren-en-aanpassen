// WEGWERP (spike/) — VALIDATE dropOversizedOpenings.
// G1: opgeslagen-G6 (corrupte band-openingen), vlag AAN  → alle hoeken bekleed.
// G2: opgeslagen-G6, vlag UIT (noodrem)                  → 1e/2e falen (byte-identiek aan nu).
// G3: VERSE parse G3 + G6, vlag AAN == vlag UIT          → byte-identiek (geen legitieme opening geraakt).
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let FLAG_DROP='1';
globalThis.localStorage={getItem:(k)=>k==='reprojectOpeningPolygon'?'1':(k==='dropOversizedOpenings'?FLAG_DROP:null),setItem(){},removeItem(){}};
const WebIFC=require('web-ifc'); const a=new WebIFC.IfcAPI();
try{await a.Init();}catch{a.SetWasmPath(join(ROOT,'node_modules','web-ifc')+'/',true);await a.Init();}
const ap=new Proxy(a,{get(t,p){if(p==='Init')return async()=>{};const v=t[p];return typeof v==='function'?v.bind(t):v;}});
globalThis.window={WebIFC:new Proxy(WebIFC,{get(t,p){return p==='IfcAPI'?class{constructor(){return ap;}}:t[p];}})};
const {parseIfc}=await import('../../src/lib/ifc.js');
const {buildFullGroupFacadePattern}=await import('../../src/lib/pattern.js');
const {buildBestFitFacadePattern}=await import('../../src/lib/facadePlane.js');
const mat={steenL:210,steenH:50,lint:12,stoot:10};
const cover=(rows,X,Y)=>{for(const r of rows){if(Y<r.y-1||Y>r.y+mat.steenH+1)continue;if(r.pieces.some(p=>X>=p.start-1&&X<=p.start+p.length+1))return true;}return false;};

// ---- opgeslagen (corrupte) G6 ----
const L=[{l:280,h:840},{l:280,h:2580},{l:3080,h:2580},{l:3080,h:60},{l:1940,h:60},{l:1940,h:840}];
const win=(id,hS)=>({expressID:id,length:3360,height:2870,openings:[{id:id+1,type:'raam',x:280,y:60,breedte:2800,hoogte:2520,polyPts:L}],wallOrigin:{lengthAxis:'x',heightAxis:'y',thicknessAxis:'z',lengthStart:21305,lengthEnd:24665,heightStart:hS,heightEnd:hS+2870,thicknessStart:-110,thicknessEnd:163,resolvedOutside:{outsideDir:1}}});
const band=(id,hS)=>({expressID:id,length:3400,height:300,openings:[{id:id+1,type:'raam',x:280,y:60,breedte:2800,hoogte:2520,polyPts:L}],wallOrigin:{lengthAxis:'x',heightAxis:'y',thicknessAxis:'z',lengthStart:21285,lengthEnd:24685,heightStart:hS,heightEnd:hS+300,thicknessStart:-110,thicknessEnd:163,resolvedOutside:{outsideDir:1}}});
const savedG6=[win(555265,-65),win(180382,3105),win(462783,6275),band(175487,2805),band(457888,5975)];
const cornersSaved=()=>{const fd=buildBestFitFacadePattern(savedG6,mat,'halfsteens',null,null,null,null,0,0,'y');return ['bgg','1e','2e'].map((n,i)=>cover(fd.rows,1100,[0,3170,6340][i]+400));};

const q=console.log;console.log=()=>{};
FLAG_DROP='1'; const cOn=cornersSaved();
FLAG_DROP='0'; const cOff=cornersSaved();
console.log=q;
console.log('G1 opgeslagen-G6 vlag AAN  [bgg,1e,2e]:',cOn.map(b=>b?'🟢':'🔴').join(' '),'  (verwacht 🟢 🟢 🟢)');
console.log('G2 opgeslagen-G6 vlag UIT  [bgg,1e,2e]:',cOff.map(b=>b?'🟢':'🔴').join(' '),'  (verwacht 🟢 🔴 🔴 = huidig)');

// ---- VERSE parse: byte-identiek-check ----
const o=console.log;console.log=()=>{};
const buf=readFileSync(join(ROOT,'public','BIL-MOO-A-ZZ-PBP.ifc'));
const walls=await parseIfc({name:'b.ifc',size:buf.length,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)},null,null,{forceOrientation:'AUTO'});
console.log=o;
const sig=(ids)=>{const ws=ids.map(id=>walls.find(x=>x.expressID===id));const q2=console.log;console.log=()=>{};const fd=buildBestFitFacadePattern(ws,mat,'halfsteens',null,null,null,null);console.log=q2;return JSON.stringify(fd.rows);};
const G3=[60148,127375,438296,122591,433512], G6f=[555265,180382,462783,175487,457888];
FLAG_DROP='1'; const g3on=sig(G3), g6on=sig(G6f);
FLAG_DROP='0'; const g3off=sig(G3), g6off=sig(G6f);
console.log('G3 verse G3 byte-identiek (AAN==UIT):', g3on===g3off?'🟢 ja':'🔴 NEE');
console.log('G3 verse G6 byte-identiek (AAN==UIT):', g6on===g6off?'🟢 ja':'🔴 NEE');
process.exit(0);
