// READ-ONLY DIAGNOSE — PENNANTS: cluster losse penanten (verticale kolommen) uit de
// geometrie, bepaal per penant de zijden (groeperen op normaal) en een uniek-signatuur.
import fs from 'node:fs';

const IFC = process.argv[2];
const text = fs.readFileSync(IFC, 'latin1');
const WANT = new Set(['IFCEXTRUDEDAREASOLID','IFCRECTANGLEPROFILEDEF','IFCARBITRARYCLOSEDPROFILEDEF','IFCPOLYLINE','IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBUILDINGELEMENTPART','IFCMEMBER','IFCAXIS2PLACEMENT3D','IFCAXIS2PLACEMENT2D','IFCDIRECTION','IFCLOCALPLACEMENT','IFCCARTESIANPOINT']);
function splitTop(s){const o=[];let d=0,q=false,c='';for(let i=0;i<s.length;i++){const ch=s[i];if(q){c+=ch;if(ch==="'")q=false;continue;}if(ch==="'"){q=true;c+=ch;continue;}if(ch==='('){d++;c+=ch;continue;}if(ch===')'){d--;c+=ch;continue;}if(ch===','&&d===0){o.push(c);c='';continue;}c+=ch;}o.push(c);return o;}
const ref=s=>{const m=String(s).match(/#(\d+)/);return m?+m[1]:null;};
const refsOf=s=>[...String(s).matchAll(/#(\d+)/g)].map(x=>+x[1]);
const unq=s=>String(s).trim().replace(/^'/,'').replace(/'$/,'');
const r1=v=>Math.round(v*10)/10;

const ent=new Map();{const lines=text.split(/\r?\n/);let buf='';for(const raw of lines){buf+=(buf?' ':'')+raw;if(!/;\s*$/.test(buf))continue;const m=buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/);buf='';if(!m)continue;const t=m[2].toUpperCase();if(!WANT.has(t))continue;ent.set(+m[1],{type:t,args:m[3]});}}
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
function profileInfo(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);const pos=p[2]!=='$'?axis2dLoc(ref(p[2])):[0,0];return{x:parseFloat(p[3]),y:parseFloat(p[4]),cx:pos[0],cy:pos[1],shape:'rect'};}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl&&pl.type==='IFCPOLYLINE'){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return{x:Math.max(...xs)-Math.min(...xs),y:Math.max(...ys)-Math.min(...ys),cx:(Math.max(...xs)+Math.min(...xs))/2,cy:(Math.max(...ys)+Math.min(...ys))/2,shape:'poly'};}}return null;}
const CAT={Board:'panelen',Slats:'latten',Bricks:'steenstrips'};

const items=[];
for(const [,e] of ent){
  if(e.type!=='IFCBUILDINGELEMENTPART'&&e.type!=='IFCMEMBER')continue;
  const p=splitTop(e.args); const guid=unq(p[0]); const name=unq(p[2]); const plId=ref(p[5]); const reprId=ref(p[6]); if(!reprId)continue;
  const cat=CAT[name]||name; const PM=localMatrix(plId); const pds=ent.get(reprId); if(!pds)continue; const pp=splitTop(pds.args);
  for(const rId of refsOf(pp[pp.length-1])){const sr=ent.get(rId);if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;const srP=splitTop(sr.args);
    for(const sid of refsOf(srP[3])){const se=ent.get(sid);if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;const sp=splitTop(se.args);const depth=parseFloat(sp[3]);const prof=profileInfo(ref(sp[0]));if(!prof)continue;const SM=mul(PM,axis3d(ref(sp[1])));const wc=apply(SM,[prof.cx,prof.cy,depth/2]);const n=nrm(applyR(SM,[0,0,1]));items.push({guid,cat,L:r1(Math.max(prof.x,prof.y)),B:r1(Math.min(prof.x,prof.y)),D:r1(depth),wc,n});}}
}
console.log(`totaal elementen: ${items.length}`);
const gz=[Math.min(...items.map(i=>i.wc[2])),Math.max(...items.map(i=>i.wc[2]))];
console.log(`Z-bereik (hoogte): ${gz[0].toFixed(0)} .. ${gz[1].toFixed(0)}  (${(gz[1]-gz[0]).toFixed(0)} mm)`);

// --- cluster op XY-voetafdruk via grid union-find ---
function clusterXY(thr){
  const parent=items.map((_,i)=>i); const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};const uni=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
  const cell=thr; const grid=new Map(); const key=(cx,cy)=>cx+','+cy;
  items.forEach((it,i)=>{const cx=Math.floor(it.wc[0]/cell),cy=Math.floor(it.wc[1]/cell);(grid.get(key(cx,cy))||grid.set(key(cx,cy),[]).get(key(cx,cy))).push(i);});
  items.forEach((it,i)=>{const cx=Math.floor(it.wc[0]/cell),cy=Math.floor(it.wc[1]/cell);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const arr=grid.get(key(cx+dx,cy+dy));if(!arr)continue;for(const j of arr){if(j<=i)continue;const ddx=it.wc[0]-items[j].wc[0],ddy=it.wc[1]-items[j].wc[1];if(ddx*ddx+ddy*ddy<=thr*thr)uni(i,j);}}});
  const groups=new Map();items.forEach((_,i)=>{const r=find(i);(groups.get(r)||groups.set(r,[]).get(r)).push(i);});
  return [...groups.values()];
}
console.log('\n=== cluster-aantal bij verschillende drempels (XY, mm) ===');
for(const thr of [150,250,350,500,700,1000]){const g=clusterXY(thr);const sizes=g.map(c=>c.length).sort((a,b)=>b-a);console.log(`  thr ${String(thr).padStart(4)}: ${String(g.length).padStart(4)} clusters | grootste: ${sizes.slice(0,6).join(',')} | kleinste: ${sizes.slice(-4).join(',')}`);}

// kies drempel en rapporteer per penant
const THR=Number(process.argv[3]||350);
const clusters=clusterXY(THR).filter(c=>c.length>=5); // filter ruis
console.log(`\n=== detail bij drempel ${THR} (clusters >=5 elementen: ${clusters.length}) ===`);

function sideKey(n){const q=v=>Math.round(v*20)/20;let a=[q(n[0]),q(n[1]),q(n[2])];return`${a[0].toFixed(2)},${a[1].toFixed(2)},${a[2].toFixed(2)}`;}
function analyzePenant(idxs){
  const els=idxs.map(i=>items[i]);
  const xs=els.map(e=>e.wc[0]),ys=els.map(e=>e.wc[1]),zs=els.map(e=>e.wc[2]);
  const foot=[r1(Math.max(...xs)-Math.min(...xs)),r1(Math.max(...ys)-Math.min(...ys))];
  const h=r1(Math.max(...zs)-Math.min(...zs));
  // zijden = horizontale normalen (|nz|<0.5)
  const sides=new Map();
  for(const e of els){if(Math.abs(e.n[2])>0.5)continue;const k=sideKey(e.n);const s=sides.get(k)||{k,strip:0,board:0,lat:0,other:0,stripHist:new Map()};if(e.cat==='steenstrips'){s.strip++;const sk=`${e.L}x${e.B}`;s.stripHist.set(sk,(s.stripHist.get(sk)||0)+1);}else if(e.cat==='panelen')s.board++;else if(e.cat==='latten')s.lat++;else s.other++;sides.set(k,s);}
  const cats={strip:els.filter(e=>e.cat==='steenstrips').length,board:els.filter(e=>e.cat==='panelen').length,lat:els.filter(e=>e.cat==='latten').length};
  return {n:els.length,foot,h,center:[r1((Math.min(...xs)+Math.max(...xs))/2),r1((Math.min(...ys)+Math.max(...ys))/2)],sides:[...sides.values()],cats};
}
const penants=clusters.map(analyzePenant);
// signatuur voor uniek: #zijden + gesorteerde strip-hist totaal + gesorteerde foot
function sig(p){const total=new Map();for(const s of p.sides)for(const [k,v] of s.stripHist)total.set(k,(total.get(k)||0)+v);const hist=[...total.entries()].sort().map(([k,v])=>`${k}:${v}`).join('|');return`sides=${p.sides.length};strips=${p.cats.strip};boards=${p.cats.board};lats=${p.cats.lat};hist=${hist}`;}
const uniq=new Map();
penants.forEach((p,i)=>{const s=sig(p);const g=uniq.get(s)||{sig:s,count:0,ex:p,idxs:[]};g.count++;g.idxs.push(i);uniq.set(s,g);});
const uniqArr=[...uniq.values()].sort((a,b)=>b.count-a.count);
console.log(`\nAantal penanten: ${penants.length}  |  UNIEKE types: ${uniqArr.length}`);
console.log(`zijden-verdeling: ${[...new Set(penants.map(p=>p.sides.length))].sort().map(s=>`${s}z:${penants.filter(p=>p.sides.length===s).length}`).join('  ')}`);
console.log('\n=== UNIEKE PENANT-TYPES ===');
uniqArr.forEach((u,ti)=>{const p=u.ex;console.log(`T${ti+1} (${u.count}x) | ${p.sides.length} zijden | voetafdruk ${p.foot[0]}x${p.foot[1]} | hoogte ${p.h} | strips ${p.cats.strip} boards ${p.cats.board} latten ${p.cats.lat}`);
  p.sides.forEach((s,si)=>{const hist=[...s.stripHist.entries()].sort().map(([k,v])=>`${k}(${v})`).join(' ');console.log(`     zijde ${si+1} n=${s.k} : ${s.strip} strips [${hist}] ${s.board?`, ${s.board} board`:''}${s.lat?`, ${s.lat} lat`:''}`);});
});

// ===== UITSLAG-SVG per uniek type =====
const OUTDIR=process.argv[4];
if(OUTDIR){
  fs.mkdirSync(OUTDIR,{recursive:true});
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const crossZ=(a,b)=>a[0]*b[1]-a[1]*b[0];
  const nameFor=ang=>{const d=ang*180/Math.PI;if(Math.abs(d)<1)return'Voorzijde';if(Math.abs(Math.abs(d)-180)<10)return'Achterzijde';return d<0?'Links':'Rechts';};
  function svgFor(els,title,sub){
    const strips=els.filter(e=>e.cat==='steenstrips'&&Math.abs(e.n[2])<0.5);
    const sideMap=new Map();
    for(const e of strips){const k=sideKey(e.n);(sideMap.get(k)||sideMap.set(k,{n:e.n,els:[]}).get(k)).els.push(e);}
    const sides=[...sideMap.values()];
    const voor=sides.reduce((m,s)=>s.els.length>m.els.length?s:m,sides[0]);
    for(const s of sides){s.ang=Math.atan2(crossZ(voor.n,s.n),dot(voor.n,s.n));const ua=[-s.n[1],s.n[0],0];const L=Math.hypot(ua[0],ua[1])||1;s.ua=[ua[0]/L,ua[1]/L,0];for(const e of s.els){e._u=e.wc[0]*s.ua[0]+e.wc[1]*s.ua[1];}s.uMin=Math.min(...s.els.map(e=>e._u-e.L/2));s.uMax=Math.max(...s.els.map(e=>e._u+e.L/2));s.width=s.uMax-s.uMin;}
    sides.sort((a,b)=>a.ang-b.ang);
    const allV=strips.flatMap(e=>[e.wc[2]-e.B/2,e.wc[2]+e.B/2]);const vMin=Math.min(...allV),vMax=Math.max(...allV),H=vMax-vMin;
    const S=0.1,gap=34,mL=66,mT=80,mR=28,mB=52;
    let x=mL;const cols=[];for(const sd of sides){cols.push({sd,x});x+=sd.width*S+gap;}
    const W=Math.round(x-gap+mR),Ht=Math.round(mT+H*S+mB);
    const Y=v=>mT+(vMax-v)*S;
    let body='';
    const vs=[...new Set(voor.els.map(e=>Math.round(e.wc[2])))].sort((a,b)=>a-b);
    for(let ci=0;ci<vs.length;ci++){if(ci!==0&&(ci+1)%10!==0&&ci!==vs.length-1)continue;const yy=Y(vs[ci]);body+=`<line x1="${mL-6}" y1="${yy.toFixed(1)}" x2="${mL-2}" y2="${yy.toFixed(1)}" stroke="#aaa"/><text x="${mL-9}" y="${(yy+3).toFixed(1)}" font-size="8" fill="#999" text-anchor="end">${ci+1}</text>`;}
    for(const {sd,x} of cols){
      const wpx=sd.width*S;
      body+=`<rect x="${x.toFixed(1)}" y="${mT}" width="${wpx.toFixed(1)}" height="${(H*S).toFixed(1)}" fill="none" stroke="#bbb"/>`;
      for(const e of sd.els){const rx=x+(e._u-e.L/2-sd.uMin)*S;const ry=Y(e.wc[2]+e.B/2);body+=`<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${(e.L*S).toFixed(1)}" height="${(e.B*S).toFixed(1)}" fill="#c96f4a" fill-opacity="0.55" stroke="#7a3b23" stroke-width="0.3"/>`;}
      const cx=(x+wpx/2).toFixed(1);
      body+=`<text x="${cx}" y="${mT-32}" font-size="12" font-weight="bold" text-anchor="middle">${nameFor(sd.ang)}</text>`;
      body+=`<text x="${cx}" y="${mT-18}" font-size="8.5" fill="#555" text-anchor="middle">n=${sd.n.map(v=>v.toFixed(0)).join(',')} · b=${Math.round(sd.width)}mm · ${sd.els.length} strips</text>`;
      body+=`<text x="${cx}" y="${(mT+H*S+16).toFixed(1)}" font-size="9" text-anchor="middle" fill="#333">${Math.round(sd.width)}</text>`;
    }
    const yc=(mT+H*S/2).toFixed(1);
    body+=`<text x="13" y="${yc}" font-size="10" fill="#333" transform="rotate(-90 13 ${yc})" text-anchor="middle">hoogte ${Math.round(H)} mm · ${vs.length} lagen</text>`;
    body+=`<text x="${mL}" y="26" font-size="15" font-weight="bold">${esc(title)}</text>`;
    body+=`<text x="${mL}" y="44" font-size="10" fill="#555">${esc(sub)}</text>`;
    body+=`<text x="${mL}" y="58" font-size="9" fill="#888">Laag-nummering links (onder→boven). Elke steen = 1 strip; voegen zichtbaar als tussenruimte.</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Ht}" viewBox="0 0 ${W} ${Ht}" font-family="Segoe UI,Arial,sans-serif"><rect width="${W}" height="${Ht}" fill="#fff"/>${body}</svg>`;
  }
  const sawRows=['type;zijde;normaal;breedte_mm;strip_maat;aantal'];
  uniqArr.forEach((u,ti)=>{
    const els=clusters[u.idxs[0]].map(i=>items[i]);const p=u.ex;
    const sub=`${u.count}x in dit bestand · ${p.sides.length} zijden · voetafdruk ${p.foot[0]}x${p.foot[1]}mm · ${p.cats.strip} strips totaal`;
    fs.writeFileSync(`${OUTDIR}/penant-T${ti+1}-uitslag.svg`,svgFor(els,`Penant T${ti+1} — uitslag`,sub),'utf8');
    // zaaglijst per zijde
    const strips=els.filter(e=>e.cat==='steenstrips'&&Math.abs(e.n[2])<0.5);const sm=new Map();
    for(const e of strips){const k=sideKey(e.n);(sm.get(k)||sm.set(k,{n:e.n,els:[]}).get(k)).els.push(e);}
    const voor=[...sm.values()].reduce((m,s)=>s.els.length>m.els.length?s:m,[...sm.values()][0]);
    [...sm.values()].sort((a,b)=>Math.atan2(crossZ(voor.n,a.n),dot(voor.n,a.n))-Math.atan2(crossZ(voor.n,b.n),dot(voor.n,b.n))).forEach(s=>{const ua=[-s.n[1],s.n[0],0];const uu=s.els.map(e=>e.wc[0]*(-s.n[1])+e.wc[1]*s.n[0]);const w=Math.round(Math.max(...s.els.map((e,i)=>uu[i]+e.L/2))-Math.min(...s.els.map((e,i)=>uu[i]-e.L/2)));const nm=nameFor(Math.atan2(crossZ(voor.n,s.n),dot(voor.n,s.n)));const h=new Map();for(const e of s.els){const k=`${e.L}x${e.B}x${e.D}`;h.set(k,(h.get(k)||0)+1);}for(const[k,v]of[...h.entries()].sort())sawRows.push([`T${ti+1}`,nm,s.n.map(x=>x.toFixed(0)).join('/'),w,k,v].join(';'));});
    console.log(`  geschreven: penant-T${ti+1}-uitslag.svg`);
  });
  fs.writeFileSync(`${OUTDIR}/penant-zaaglijst-per-zijde.csv`,sawRows.join('\r\n'),'utf8');
  console.log(`  geschreven: penant-zaaglijst-per-zijde.csv`);
}
