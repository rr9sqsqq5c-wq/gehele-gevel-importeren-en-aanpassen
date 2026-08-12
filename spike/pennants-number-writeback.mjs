// PROOF — importeer PENNANTS, nummer penanten per gevel, schrijf nummer terug als
// IFC-property op elk element (via express-id). Levert verrijkte IFC + mapping-CSV.
// Wijzigt NIETS aan de brickboard-app; leest/schrijft alleen IFC-bestanden.
import fs from 'node:fs';
import path from 'node:path';

const IFC = process.argv[2];
const OUTDIR = process.argv[3];
const THR = Number(process.argv[4] || 350);
fs.mkdirSync(OUTDIR, { recursive: true });
const text = fs.readFileSync(IFC, 'latin1');

const WANT = new Set(['IFCEXTRUDEDAREASOLID','IFCRECTANGLEPROFILEDEF','IFCARBITRARYCLOSEDPROFILEDEF','IFCPOLYLINE','IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBUILDINGELEMENTPART','IFCMEMBER','IFCAXIS2PLACEMENT3D','IFCAXIS2PLACEMENT2D','IFCDIRECTION','IFCLOCALPLACEMENT','IFCCARTESIANPOINT']);
function splitTop(s){const o=[];let d=0,q=false,c='';for(let i=0;i<s.length;i++){const ch=s[i];if(q){c+=ch;if(ch==="'")q=false;continue;}if(ch==="'"){q=true;c+=ch;continue;}if(ch==='('){d++;c+=ch;continue;}if(ch===')'){d--;c+=ch;continue;}if(ch===','&&d===0){o.push(c);c='';continue;}c+=ch;}o.push(c);return o;}
const ref=s=>{const m=String(s).match(/#(\d+)/);return m?+m[1]:null;};
const refsOf=s=>[...String(s).matchAll(/#(\d+)/g)].map(x=>+x[1]);
const unq=s=>String(s).trim().replace(/^'/,'').replace(/'$/,'');
const r1=v=>Math.round(v*10)/10;

let maxId=0;
const ent=new Map();{const lines=text.split(/\r?\n/);let buf='';for(const raw of lines){buf+=(buf?' ':'')+raw;if(!/;\s*$/.test(buf))continue;const m=buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/);buf='';if(!m)continue;const id=+m[1];if(id>maxId)maxId=id;const t=m[2].toUpperCase();if(!WANT.has(t))continue;ent.set(id,{type:t,args:m[3]});}}

// geometrie
const pt=id=>{const e=ent.get(id);if(!e)return[0,0,0];const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);return[n[0]||0,n[1]||0,n[2]||0];};
const dir=id=>{if(id==null)return null;const e=ent.get(id);if(!e)return null;const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);const v=[n[0]||0,n[1]||0,n[2]||0];const L=Math.hypot(...v)||1;return[v[0]/L,v[1]/L,v[2]/L];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const nrm=a=>{const L=Math.hypot(...a)||1;return[a[0]/L,a[1]/L,a[2]/L];};
const I={R:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0]};
function axis3d(id){const e=ent.get(id);if(!e||e.type!=='IFCAXIS2PLACEMENT3D')return I;const p=splitTop(e.args);const loc=pt(ref(p[0]));let z=dir(ref(p[1]))||[0,0,1];let x=dir(ref(p[2]))||[1,0,0];const zx=z[0]*x[0]+z[1]*x[1]+z[2]*x[2];x=nrm([x[0]-zx*z[0],x[1]-zx*z[1],x[2]-zx*z[2]]);const y=cross(z,x);return{R:[[x[0],y[0],z[0]],[x[1],y[1],z[1]],[x[2],y[2],z[2]]],t:loc};}
function mul(A,B){const R=[[0,0,0],[0,0,0],[0,0,0]];for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=A.R[i][k]*B.R[k][j];R[i][j]=s;}const t=[0,0,0];for(let i=0;i<3;i++){let s=A.t[i];for(let k=0;k<3;k++)s+=A.R[i][k]*B.t[k];t[i]=s;}return{R,t};}
const apply=(M,p)=>[M.R[0][0]*p[0]+M.R[0][1]*p[1]+M.R[0][2]*p[2]+M.t[0],M.R[1][0]*p[0]+M.R[1][1]*p[1]+M.R[1][2]*p[2]+M.t[1],M.R[2][0]*p[0]+M.R[2][1]*p[1]+M.R[2][2]*p[2]+M.t[2]];
const applyR=(M,p)=>[M.R[0][0]*p[0]+M.R[0][1]*p[1]+M.R[0][2]*p[2],M.R[1][0]*p[0]+M.R[1][1]*p[1]+M.R[1][2]*p[2],M.R[2][0]*p[0]+M.R[2][1]*p[1]+M.R[2][2]*p[2]];
const plCache=new Map();
function localMatrix(id){if(id==null)return I;if(plCache.has(id))return plCache.get(id);const e=ent.get(id);if(!e||e.type!=='IFCLOCALPLACEMENT'){plCache.set(id,I);return I;}const p=splitTop(e.args);const parent=ref(p[0]);const rel=axis3d(ref(p[1]));const M=parent==null?rel:mul(localMatrix(parent),rel);plCache.set(id,M);return M;}
function axis2dLoc(id){const e=ent.get(id);if(!e)return[0,0];const p=splitTop(e.args);return pt(ref(p[0]));}
function profileInfo(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);const pos=p[2]!=='$'?axis2dLoc(ref(p[2])):[0,0];return{x:parseFloat(p[3]),y:parseFloat(p[4]),cx:pos[0],cy:pos[1]};}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return{x:Math.max(...xs)-Math.min(...xs),y:Math.max(...ys)-Math.min(...ys),cx:(Math.max(...xs)+Math.min(...xs))/2,cy:(Math.max(...ys)+Math.min(...ys))/2};}}return null;}
const CAT={Board:'panelen',Slats:'latten',Bricks:'steenstrips'};

// items per solid, MET express-id van de part
const items=[];
for(const [id,e] of ent){
  if(e.type!=='IFCBUILDINGELEMENTPART'&&e.type!=='IFCMEMBER')continue;
  const p=splitTop(e.args); const name=unq(p[2]); const plId=ref(p[5]); const reprId=ref(p[6]); if(!reprId)continue;
  const cat=CAT[name]||name; const PM=localMatrix(plId); const pds=ent.get(reprId); if(!pds)continue; const pp=splitTop(pds.args);
  for(const rId of refsOf(pp[pp.length-1])){const sr=ent.get(rId);if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;const srP=splitTop(sr.args);
    for(const sid of refsOf(srP[3])){const se=ent.get(sid);if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;const sp=splitTop(se.args);const depth=parseFloat(sp[3]);const prof=profileInfo(ref(sp[0]));if(!prof)continue;const SM=mul(PM,axis3d(ref(sp[1])));const wc=apply(SM,[prof.cx,prof.cy,depth/2]);const n=nrm(applyR(SM,[0,0,1]));items.push({pid:id,cat,L:r1(Math.max(prof.x,prof.y)),B:r1(Math.min(prof.x,prof.y)),D:r1(depth),wc,n});}}
}

// cluster op XY-voetafdruk
function clusterXY(thr){const parent=items.map((_,i)=>i);const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};const uni=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};const grid=new Map();const key=(cx,cy)=>cx+','+cy;items.forEach((it,i)=>{const cx=Math.floor(it.wc[0]/thr),cy=Math.floor(it.wc[1]/thr);const k=key(cx,cy);(grid.get(k)||grid.set(k,[]).get(k)).push(i);});items.forEach((it,i)=>{const cx=Math.floor(it.wc[0]/thr),cy=Math.floor(it.wc[1]/thr);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const arr=grid.get(key(cx+dx,cy+dy));if(!arr)continue;for(const j of arr){if(j<=i)continue;const ddx=it.wc[0]-items[j].wc[0],ddy=it.wc[1]-items[j].wc[1];if(ddx*ddx+ddy*ddy<=thr*thr)uni(i,j);}}});const g=new Map();items.forEach((_,i)=>{const r=find(i);(g.get(r)||g.set(r,[]).get(r)).push(i);});return[...g.values()].filter(c=>c.length>=5);}
const clusters=clusterXY(THR);

const sideKey=n=>{const q=v=>Math.round(v*20)/20;let a=[q(n[0]),q(n[1]),q(n[2])];return`${a[0].toFixed(2)},${a[1].toFixed(2)},${a[2].toFixed(2)}`;};
function analyze(idxs){
  const els=idxs.map(i=>items[i]);const xs=els.map(e=>e.wc[0]),ys=els.map(e=>e.wc[1]);
  const sides=new Map();
  for(const e of els){if(Math.abs(e.n[2])>0.5)continue;if(e.cat!=='steenstrips')continue;const k=sideKey(e.n);const s=sides.get(k)||{k,n:e.n,cnt:0,hist:new Map()};s.cnt++;const sk=`${e.L}x${e.B}`;s.hist.set(sk,(s.hist.get(sk)||0)+1);sides.set(k,s);}
  const sarr=[...sides.values()];
  const front=sarr.reduce((m,s)=>s.cnt>m.cnt?s:m,sarr[0]||{n:[1,0,0],cnt:0});
  const pids=[...new Set(els.map(e=>e.pid))];
  const cats={strips:els.filter(e=>e.cat==='steenstrips').length,boards:els.filter(e=>e.cat==='panelen').length,lats:els.filter(e=>e.cat==='latten').length};
  return {center:[ (Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2 ],front:front.n,nSides:sarr.length,pids,cats,sarr};
}
const pen=clusters.map(analyze);

// TYPE per penant (signatuur)
function sig(p){const hist=new Map();for(const s of p.sarr)for(const[k,v]of s.hist)hist.set(k,(hist.get(k)||0)+v);const h=[...hist.entries()].sort().map(([k,v])=>`${k}:${v}`).join('|');return`z${p.nSides};s${p.cats.strips};b${p.cats.boards};l${p.cats.lats};${h}`;}
const typeMap=new Map();pen.forEach(p=>{const s=sig(p);typeMap.set(s,(typeMap.get(s)||0)+1);});
const typeOrder=[...typeMap.entries()].sort((a,b)=>b[1]-a[1]).map(([s],i)=>[s,`T${i+1}`]);
const typeOf=new Map(typeOrder);

// GEVEL per penant: front-normaal richting + grove loodrechte offset
const dirKey=n=>{const q=v=>Math.round(v);return`${q(n[0])},${q(n[1])},${q(n[2])}`;};
pen.forEach(p=>{p.gevelDir=dirKey(p.front);p.offset=Math.round((p.center[0]*p.front[0]+p.center[1]*p.front[1])/3000)*3000;p.gkey=`${p.gevelDir}@${p.offset}`;});
// gevel-letters op hoek-volgorde (rond het gebouw)
const gevels=[...new Set(pen.map(p=>p.gkey))].map(k=>{const ex=pen.find(p=>p.gkey===k);return{k,n:ex.front};}).sort((a,b)=>Math.atan2(a.n[1],a.n[0])-Math.atan2(b.n[1],b.n[0]));
const gevelLetter=new Map(gevels.map((g,i)=>[g.k,String.fromCharCode(65+i)]));
// nummering per gevel: sorteer langs de gevel-as (loodrecht op normaal, horizontaal)
const perGevel=new Map();
pen.forEach((p,i)=>{const L=gevelLetter.get(p.gkey);(perGevel.get(L)||perGevel.set(L,[]).get(L)).push(i);});
const numberOf=new Map();
for(const[L,idxs]of perGevel){const fa=p=>[-p.front[1],p.front[0]];idxs.sort((ia,ib)=>{const a=pen[ia],b=pen[ib];const aa=a.center[0]*fa(a)[0]+a.center[1]*fa(a)[1];const bb=b.center[0]*fa(b)[0]+b.center[1]*fa(b)[1];return aa-bb;});idxs.forEach((pi,k)=>numberOf.set(pi,`${L}-${String(k+1).padStart(2,'0')}`));}

// ===== rapport =====
console.log(`penanten: ${pen.length} | types: ${typeOrder.length} | gevels: ${gevels.length}`);
for(const[L,idxs]of[...perGevel.entries()].sort()){console.log(`  gevel ${L} (n=${pen[idxs[0]].front.map(v=>v.toFixed(0)).join(',')}): ${idxs.length} penanten -> ${idxs.map(i=>numberOf.get(i)).join(', ')}`);}

// ===== IFC write-back =====
const ALPH="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function ifcGuid(n){let s='';let x=n>>>0;for(let i=0;i<21;i++){s=ALPH[x&63]+s;x=Math.floor(x/64);}return '2'+s;}
let nid=maxId+1; let gseed=1;
const newLines=[];
const map=['paneelnummer;gevel;type;aantal_zijden;n_elementen;center_x;center_y'];
pen.forEach((p,i)=>{
  const num=numberOf.get(i); const type=typeOf.get(sig(p)); const L=gevelLetter.get(p.gkey);
  const pNum=nid++, pGev=nid++, pType=nid++, pZ=nid++, pset=nid++, rel=nid++;
  newLines.push(`#${pNum}= IFCPROPERTYSINGLEVALUE('Paneelnummer',$,IFCLABEL('${num}'),$);`);
  newLines.push(`#${pGev}= IFCPROPERTYSINGLEVALUE('Gevel',$,IFCLABEL('${L}'),$);`);
  newLines.push(`#${pType}= IFCPROPERTYSINGLEVALUE('PenantType',$,IFCLABEL('${type}'),$);`);
  newLines.push(`#${pZ}= IFCPROPERTYSINGLEVALUE('AantalZijden',$,IFCINTEGER(${p.nSides}),$);`);
  newLines.push(`#${pset}= IFCPROPERTYSET('${ifcGuid(gseed++)}',#7,'KGT Paneelnummering',$,(#${pNum},#${pGev},#${pType},#${pZ}));`);
  newLines.push(`#${rel}= IFCRELDEFINESBYPROPERTIES('${ifcGuid(gseed++)}',#7,$,$,(${p.pids.map(x=>'#'+x).join(',')}),#${pset});`);
  map.push([num,L,type,p.nSides,p.pids.length,r1(p.center[0]),r1(p.center[1])].join(';'));
});

// invoegen vóór de laatste ENDSEC;
const marker='ENDSEC;';
const li=text.lastIndexOf(marker);
const out=text.slice(0,li)+newLines.join('\r\n')+'\r\n'+text.slice(li);
const outName=path.basename(IFC).replace(/\.ifc$/i,'')+'-genummerd.ifc';
fs.writeFileSync(path.join(OUTDIR,outName),out,'latin1');
fs.writeFileSync(path.join(OUTDIR,'penant-nummering-map.csv'),map.join('\r\n'),'utf8');
console.log(`\ngeschreven: ${outName} (+${newLines.length} regels, ${pen.length} penanten getagd)`);
console.log(`nieuwe express-ids: ${maxId+1}..${nid-1}`);
console.log(`mapping: penant-nummering-map.csv`);
