// READ-ONLY DIAGNOSE — platte gevels (RED/GREEN): vlakken + of platen/latten een
// paneel-raster vormen dat we kunnen clusteren.
import fs from 'node:fs';
const IFC=process.argv[2];
const text=fs.readFileSync(IFC,'latin1');
const WANT=new Set(['IFCEXTRUDEDAREASOLID','IFCRECTANGLEPROFILEDEF','IFCARBITRARYCLOSEDPROFILEDEF','IFCPOLYLINE','IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBUILDINGELEMENTPART','IFCMEMBER','IFCAXIS2PLACEMENT3D','IFCAXIS2PLACEMENT2D','IFCDIRECTION','IFCLOCALPLACEMENT','IFCCARTESIANPOINT']);
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
const II={R:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0]};
function axis3d(id){const e=ent.get(id);if(!e||e.type!=='IFCAXIS2PLACEMENT3D')return II;const p=splitTop(e.args);const loc=pt(ref(p[0]));let z=dir(ref(p[1]))||[0,0,1];let x=dir(ref(p[2]))||[1,0,0];const zx=z[0]*x[0]+z[1]*x[1]+z[2]*x[2];x=nrm([x[0]-zx*z[0],x[1]-zx*z[1],x[2]-zx*z[2]]);const y=cross(z,x);return{R:[[x[0],y[0],z[0]],[x[1],y[1],z[1]],[x[2],y[2],z[2]]],t:loc};}
function mul(A,B){const R=[[0,0,0],[0,0,0],[0,0,0]];for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=A.R[i][k]*B.R[k][j];R[i][j]=s;}const t=[0,0,0];for(let i=0;i<3;i++){let s=A.t[i];for(let k=0;k<3;k++)s+=A.R[i][k]*B.t[k];t[i]=s;}return{R,t};}
const apply=(M,p)=>[M.R[0][0]*p[0]+M.R[0][1]*p[1]+M.R[0][2]*p[2]+M.t[0],M.R[1][0]*p[0]+M.R[1][1]*p[1]+M.R[1][2]*p[2]+M.t[1],M.R[2][0]*p[0]+M.R[2][1]*p[1]+M.R[2][2]*p[2]+M.t[2]];
const applyR=(M,p)=>[M.R[0][0]*p[0]+M.R[0][1]*p[1]+M.R[0][2]*p[2],M.R[1][0]*p[0]+M.R[1][1]*p[1]+M.R[1][2]*p[2],M.R[2][0]*p[0]+M.R[2][1]*p[1]+M.R[2][2]*p[2]];
const plCache=new Map();
function localMatrix(id){if(id==null)return II;if(plCache.has(id))return plCache.get(id);const e=ent.get(id);if(!e||e.type!=='IFCLOCALPLACEMENT'){plCache.set(id,II);return II;}const p=splitTop(e.args);const parent=ref(p[0]);const rel=axis3d(ref(p[1]));const M=parent==null?rel:mul(localMatrix(parent),rel);plCache.set(id,M);return M;}
function axis2dLoc(id){const e=ent.get(id);if(!e)return[0,0];const p=splitTop(e.args);return pt(ref(p[0]));}
function profileInfo(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);const pos=p[2]!=='$'?axis2dLoc(ref(p[2])):[0,0];return{x:parseFloat(p[3]),y:parseFloat(p[4]),cx:pos[0],cy:pos[1]};}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return{x:Math.max(...xs)-Math.min(...xs),y:Math.max(...ys)-Math.min(...ys),cx:(Math.max(...xs)+Math.min(...xs))/2,cy:(Math.max(...ys)+Math.min(...ys))/2};}}return null;}
const CAT={Board:'panelen',Slats:'latten',Bricks:'steenstrips'};
const items=[];
for(const [id,e] of ent){if(e.type!=='IFCBUILDINGELEMENTPART'&&e.type!=='IFCMEMBER')continue;const p=splitTop(e.args);const name=unq(p[2]);const plId=ref(p[5]);const reprId=ref(p[6]);if(!reprId)continue;const cat=CAT[name]||name;const PM=localMatrix(plId);const pds=ent.get(reprId);if(!pds)continue;const pp=splitTop(pds.args);for(const rId of refsOf(pp[pp.length-1])){const sr=ent.get(rId);if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;const srP=splitTop(sr.args);for(const sid of refsOf(srP[3])){const se=ent.get(sid);if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;const sp=splitTop(se.args);const depth=parseFloat(sp[3]);const prof=profileInfo(ref(sp[0]));if(!prof)continue;const SM=mul(PM,axis3d(ref(sp[1])));const wc=apply(SM,[prof.cx,prof.cy,depth/2]);const n=nrm(applyR(SM,[0,0,1]));items.push({pid:id,cat,L:r1(Math.max(prof.x,prof.y)),B:r1(Math.min(prof.x,prof.y)),D:r1(depth),wc,n});}}}
console.log(`totaal elementen: ${items.length}`);

// gevelvlak = normaal-richting (0.05) + grove offset (250mm bucket, houdt lagen samen)
const dirKey=n=>{const q=v=>Math.round(v*20)/20;let a=[q(n[0]),q(n[1]),q(n[2])];const s=(a[0]||a[1]||a[2])<0?-1:1;return`${(a[0]*s).toFixed(2)},${(a[1]*s).toFixed(2)},${(a[2]*s).toFixed(2)}`;};
const planes=new Map();
for(const it of items){if(Math.abs(it.n[2])>0.5)continue;const dk=dirKey(it.n);const s=(it.n[0]||it.n[1]||it.n[2])<0?-1:1;const off=Math.round((it.wc[0]*it.n[0]*s+it.wc[1]*it.n[1]*s+it.wc[2]*it.n[2]*s)/250)*250;const k=`${dk}@${off}`;const g=planes.get(k)||{k,n:it.n,items:[],cats:{}};g.items.push(it);g.cats[it.cat]=(g.cats[it.cat]||0)+1;planes.set(k,g);}
const parr=[...planes.values()].sort((a,b)=>b.items.length-a.items.length);
console.log(`\n=== GEVELVLAKKEN (normaal@offset, ${parr.length}) — top 12 ===`);
for(const g of parr.slice(0,12)){const c=g.cats;console.log(`  ${g.k.padEnd(20)} | tot ${String(g.items.length).padStart(5)} | pan ${String(c.panelen||0).padStart(4)} strip ${String(c.steenstrips||0).padStart(5)} lat ${String(c.latten||0).padStart(4)}`);}

// grid-analyse op de grootste 3 vlakken (met platen): u = langs gevel, v = hoogte
function uAxisFor(n){const ua=[-n[1],n[0],0];const L=Math.hypot(ua[0],ua[1])||1;return[ua[0]/L,ua[1]/L,0];}
function clU(vals,gap){const s=[...vals].sort((a,b)=>a-b);const cl=[];let cur=[s[0]];for(let i=1;i<s.length;i++){if(s[i]-s[i-1]>gap){cl.push(cur);cur=[];}cur.push(s[i]);}cl.push(cur);return cl.map(c=>r1((c[0]+c[c.length-1])/2));}
console.log(`\n=== PANEEL-RASTER op de 3 grootste vlakken (via PLATEN) ===`);
for(const g of parr.filter(p=>(p.cats.panelen||0)>=8).slice(0,3)){
  const ua=uAxisFor(g.n);
  const boards=g.items.filter(i=>i.cat==='panelen');
  const us=boards.map(b=>b.wc[0]*ua[0]+b.wc[1]*ua[1]);const vs=boards.map(b=>b.wc[2]);
  const uCols=clU(us,60), vRows=clU(vs,60);
  console.log(`  vlak ${g.k}: ${boards.length} platen | u-kolommen ${uCols.length} | v-rijen ${vRows.length}`);
  // typische kolom/rij-afstanden
  const du=uCols.slice(1).map((v,i)=>Math.round(v-uCols[i])).filter(d=>d>10);
  const dv=vRows.slice(1).map((v,i)=>Math.round(v-vRows[i])).filter(d=>d>10);
  const hist=a=>{const h=new Map();for(const x of a)h.set(x,(h.get(x)||0)+1);return[...h.entries()].sort((p,q)=>q[1]-p[1]).slice(0,5).map(([k,v])=>`${k}(${v})`).join(' ');};
  console.log(`     kolom-afstanden: ${hist(du)}`);
  console.log(`     rij-afstanden:   ${hist(dv)}`);
}

// LATTEN-cluster test op grootste vlak: vormen laten paneel-frames?
console.log(`\n=== LATTEN-cluster (2D u,v) op grootste vlak met latten ===`);
const gl=parr.find(p=>(p.cats.latten||0)>=8);
if(gl){const ua=uAxisFor(gl.n);const lat=gl.items.filter(i=>i.cat==='latten').map(i=>({u:i.wc[0]*ua[0]+i.wc[1]*ua[1],v:i.wc[2]}));
  function cl2(thr){const par=lat.map((_,i)=>i);const f=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x];}return x;};const u=(a,b)=>{a=f(a);b=f(b);if(a!==b)par[a]=b;};for(let i=0;i<lat.length;i++)for(let j=i+1;j<lat.length;j++){const dx=lat[i].u-lat[j].u,dy=lat[i].v-lat[j].v;if(dx*dx+dy*dy<=thr*thr)u(i,j);}const g=new Set(lat.map((_,i)=>f(i)));return g.size;}
  console.log(`  vlak ${gl.k}: ${lat.length} latten -> clusters bij thr: `+[300,600,1000,1500].map(t=>`${t}:${cl2(t)}`).join('  '));
}
