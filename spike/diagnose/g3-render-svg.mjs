// WEGWERP (spike/) — READ-ONLY. Render de ECHTE halfsteens-rijen van G3 (maxHoogte uit, vlag aan)
// naar een SVG (elke steen = rechthoek), met de opening-L's als rode contour en de massieve
// onderhoeken gemarkeerd. Schrijft naar public/g3-strips.svg (licht static-bestand).
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
globalThis.localStorage={getItem:(k)=>k==='reprojectOpeningPolygon'?'1':null,setItem(){},removeItem(){}};
const WebIFC=require('web-ifc'); const a=new WebIFC.IfcAPI();
try{await a.Init();}catch{a.SetWasmPath(join(ROOT,'node_modules','web-ifc')+'/',true);await a.Init();}
const ap=new Proxy(a,{get(t,p){if(p==='Init')return async()=>{};const v=t[p];return typeof v==='function'?v.bind(t):v;}});
globalThis.window={WebIFC:new Proxy(WebIFC,{get(t,p){return p==='IfcAPI'?class{constructor(){return ap;}}:t[p];}})};
const {parseIfc}=await import('../../src/lib/ifc.js');
const {buildBestFitFacadePattern}=await import('../../src/lib/facadePlane.js');
const buf=readFileSync(join(ROOT,'public','BIL-MOO-A-ZZ-PBP.ifc'));
const o=console.log;console.log=()=>{};
const walls=await parseIfc({name:'b.ifc',size:buf.length,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)},null,null,{forceOrientation:'AUTO'});
console.log=o;
const mat={steenL:210,steenH:50,lint:12,stoot:10};
const ws=[60148,127375,438296,122591,433512].map(id=>walls.find(x=>x.expressID===id));
const q=console.log;console.log=()=>{};
const fd=buildBestFitFacadePattern(ws,mat,'halfsteens',null,null,null,null);
console.log=q;

const W=fd.groupWidth, H=fd.groupHeight, rowH=mat.steenH;
const COL={Strek:'#c2703d',Kop:'#d98a52',Drieklezoor:'#9c5226',Tegel:'#b86a38'};
const Y=(gy)=>H-gy;       // flip: gevel y-up → svg y-down
const pad=140, sc=0.076;  // schaal naar pixels (heel de gevel past in één viewport)
const px=(x)=>Math.round((x+pad)*sc), py=(gy)=>Math.round((Y(gy)+pad)*sc);
const svgW=Math.round((W+2*pad)*sc), svgH=Math.round((H+2*pad)*sc);

let body=''; let n=0;
for(const r of fd.rows){const yTop=r.y+rowH;
  const ps=[...r.pieces].sort((a,b)=>a.start-b.start);
  const iv=[]; for(const p of ps){const s=p.start,e=p.start+p.length; const last=iv[iv.length-1]; if(last&&s<=last[1]+20)last[1]=Math.max(last[1],e); else iv.push([s,e]);}
  const y0=py(yTop), h=Math.max(2,Math.round(rowH*sc)-1);
  for(const [s,e] of iv){const x0=px(s), w=Math.max(1,Math.round((e-s)*sc)); body+=`<rect x="${x0}" y="${y0}" width="${w}" height="${h}"/>`; n++;}
}
let rects=`<g fill="#c2703d">${body}</g>`;
// opening-L-contouren + massieve-hoek-markers
let ovl='';
for(const op of fd.groupOpenings){
  if(op.polyPts?.length>=3){const pts=op.polyPts.map(p=>`${px(p.l)},${py(p.h)}`).join(' ');
    ovl+=`<polygon points="${pts}" fill="none" stroke="#e11d48" stroke-width="2"/>`;}
  // massieve onderhoek (bottom-left van de bbox, buiten de L): x op.x..op.x+1640, y op.y..op.y+780
  const cx0=px(op.x+20), cx1=px(op.x+1640), cy0=py(op.y+780), cy1=py(op.y+20);
  ovl+=`<rect x="${cx0}" y="${cy0}" width="${cx1-cx0}" height="${cy1-cy0}" fill="#16a34a22" stroke="#16a34a" stroke-width="2" stroke-dasharray="6 4"/>`;
  ovl+=`<text x="${cx0+6}" y="${cy0+18}" font-size="13" fill="#15803d" font-family="sans-serif">massieve hoek</text>`;
}
// verdieping-labels
const labels=[['bgg (#60148)',60],['1e verd. (#127375)',3230],['2e verd. (#438296)',6400]];
let lab='';
for(const [t,gy] of labels){lab+=`<text x="6" y="${py(gy+1300)}" font-size="15" fill="#0f172a" font-family="sans-serif" font-weight="bold">${t}</text>`;}
const legend=`<text x="6" y="22" font-size="15" font-family="sans-serif" font-weight="bold">G3 halfsteens — ${n} stenen, maxHoogte UIT, reproject AAN</text>`+
  `<text x="6" y="42" font-size="12" font-family="sans-serif" fill="#475569">rood = opening-L · groen streep = massieve hoek (moet bekleed zijn op ÉLKE verdieping)</text>`;

const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}"><rect width="100%" height="100%" fill="#ffffff"/>${rects}${ovl}${lab}${legend}</svg>`;
writeFileSync(join(ROOT,'public','g3-strips.svg'),svg);
console.log(`geschreven: public/g3-strips.svg  (${n} stenen, ${svg.length} bytes, ${svgW}x${svgH}px)`);
process.exit(0);
