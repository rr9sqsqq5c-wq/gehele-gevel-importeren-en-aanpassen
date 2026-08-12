// WEGWERP (spike/) — READ-ONLY. Reproduceer de LIVE berekening met de OPGESLAGEN G6-wanden
// (incl. de corrupte band-openingen 175487/457888). Bewijst: band-opening merget met de
// venster-opening erboven → rechthoek → hoek weg op 1e/2e, bgg overleeft.
const ROOT = process.cwd();
globalThis.localStorage={getItem:(k)=>k==='reprojectOpeningPolygon'?'1':null,setItem(){},removeItem(){}};
const {buildFullGroupFacadePattern}=await import('../../src/lib/pattern.js');
const {buildBestFitFacadePattern}=await import('../../src/lib/facadePlane.js');

const L=[{l:280,h:840},{l:280,h:2580},{l:3080,h:2580},{l:3080,h:60},{l:1940,h:60},{l:1940,h:840}];
const win=(id,hStart)=>({expressID:id,length:3360,height:2870,
  openings:[{id:id+1,type:'raam',x:280,y:60,breedte:2800,hoogte:2520,polyPts:L}],
  wallOrigin:{lengthAxis:'x',heightAxis:'y',thicknessAxis:'z',lengthStart:21305,lengthEnd:24665,heightStart:hStart,heightEnd:hStart+2870,thicknessStart:-110,thicknessEnd:163,resolvedOutside:{outsideDir:1}}});
// band: 300mm hoog, MAAR met de corrupte 2520mm L-opening (zoals opgeslagen)
const band=(id,hStart)=>({expressID:id,length:3400,height:300,
  openings:[{id:id+1,type:'raam',x:280,y:60,breedte:2800,hoogte:2520,polyPts:L}],
  wallOrigin:{lengthAxis:'x',heightAxis:'y',thicknessAxis:'z',lengthStart:21285,lengthEnd:24685,heightStart:hStart,heightEnd:hStart+300,thicknessStart:-110,thicknessEnd:163,resolvedOutside:{outsideDir:1}}});

const saved=[win(555265,-65),win(180382,3105),win(462783,6275),band(175487,2805),band(457888,5975)];
const mat={steenL:210,steenH:50,lint:12,stoot:10};

const isRect=(pts)=>{const xs=[...new Set(pts.map(p=>Math.round(p.l)))],ys=[...new Set(pts.map(p=>Math.round(p.h)))];return xs.length===2&&ys.length===2;};
const run=(naam,fd)=>{
  console.log(`\n## ${naam}`);
  console.log('  groupOpenings na merge:');
  for(const op of fd.groupOpenings){console.log(`    y${Math.round(op.y)} ${Math.round(op.width)}x${Math.round(op.height)} polyPts=${op.polyPts?.length??'-'} ${op.polyPts?(isRect(op.polyPts)?'→ RECHTHOEK (L weg!)':'→ L'):''}`);}
  const cover=(rows,X,Y)=>{for(const r of rows){if(Y<r.y-1||Y>r.y+mat.steenH+1)continue;if(r.pieces.some(p=>X>=p.start-1&&X<=p.start+p.length+1))return true;}return false;};
  for(const [n,hStart] of [['bgg',-65],['1e',3105],['2e',6275]]){const off=hStart-(-65);console.log(`    hoek ${n} (off=${off}): ${cover(fd.rows,1100,off+400)?'🟢 bekleed':'🔴 NIET bekleed'}`);}
};

const q=console.log;console.log=()=>{};
const fdBF=buildBestFitFacadePattern(saved,mat,'halfsteens',null,null,null,null,0,0,'y');
const fdFull=buildFullGroupFacadePattern(saved,mat,'halfsteens',null,null,null);
console.log=q;
run('best-fit (manual-groep pad)',fdBF);
run('direct (buildFullGroupFacadePattern)',fdFull);
process.exit(0);
