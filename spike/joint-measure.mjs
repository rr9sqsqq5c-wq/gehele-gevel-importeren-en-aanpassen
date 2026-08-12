// READ-ONLY MEET — vind paneelvoeg (3mm) vs steenvoeg (5,6mm) in de geometrie.
// Meet gaps tussen naast/boven elkaar liggende strippen per gevelvlak.
import fs from 'node:fs';
const IFC=process.argv[2];
const text=fs.readFileSync(IFC,'latin1');
const WANT=new Set(['IFCEXTRUDEDAREASOLID','IFCRECTANGLEPROFILEDEF','IFCARBITRARYCLOSEDPROFILEDEF','IFCPOLYLINE','IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBUILDINGELEMENTPART','IFCMEMBER','IFCAXIS2PLACEMENT3D','IFCAXIS2PLACEMENT2D','IFCDIRECTION','IFCLOCALPLACEMENT','IFCCARTESIANPOINT']);
function splitTop(s){const o=[];let d=0,q=false,c='';for(let i=0;i<s.length;i++){const ch=s[i];if(q){c+=ch;if(ch==="'")q=false;continue;}if(ch==="'"){q=true;c+=ch;continue;}if(ch==='('){d++;c+=ch;continue;}if(ch===')'){d--;c+=ch;continue;}if(ch===','&&d===0){o.push(c);c='';continue;}c+=ch;}o.push(c);return o;}
const ref=s=>{const m=String(s).match(/#(\d+)/);return m?+m[1]:null;};
const refsOf=s=>[...String(s).matchAll(/#(\d+)/g)].map(x=>+x[1]);
const unq=s=>String(s).trim().replace(/^'/,'').replace(/'$/,'');
const ent=new Map();{const lines=text.split(/\r?\n/);let buf='';for(const raw of lines){buf+=(buf?' ':'')+raw;if(!/;\s*$/.test(buf))continue;const m=buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/);buf='';if(!m)continue;const t=m[2].toUpperCase();if(!WANT.has(t))continue;ent.set(+m[1],{type:t,args:m[3]});}}
const pt=id=>{const e=ent.get(id);if(!e)return[0,0,0];const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);return[n[0]||0,n[1]||0,n[2]||0];};
const dir=id=>{if(id==null)return null;const e=ent.get(id);if(!e)return null;const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);const v=[n[0]||0,n[1]||0,n[2]||0];const L=Math.hypot(...v)||1;return[v[0]/L,v[1]/L,v[2]/L];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const nrm=a=>{const L=Math.hypot(...a)||1;return[a[0]/L,a[1]/L,a[2]/L];};
const II={R:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0]};
function axis3d(id){const e=ent.get(id);if(!e||e.type!=='IFCAXIS2PLACEMENT3D')return II;const p=splitTop(e.args);const loc=pt(ref(p[0]));let z=dir(ref(p[1]))||[0,0,1];let x=dir(ref(p[2]))||[1,0,0];const zx=dot(z,x);x=nrm([x[0]-zx*z[0],x[1]-zx*z[1],x[2]-zx*z[2]]);const y=cross(z,x);return{R:[[x[0],y[0],z[0]],[x[1],y[1],z[1]],[x[2],y[2],z[2]]],t:loc};}
function mul(A,B){const R=[[0,0,0],[0,0,0],[0,0,0]];for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=A.R[i][k]*B.R[k][j];R[i][j]=s;}const t=[0,0,0];for(let i=0;i<3;i++){let s=A.t[i];for(let k=0;k<3;k++)s+=A.R[i][k]*B.t[k];t[i]=s;}return{R,t};}
const apply=(M,p)=>[M.R[0][0]*p[0]+M.R[0][1]*p[1]+M.R[0][2]*p[2]+M.t[0],M.R[1][0]*p[0]+M.R[1][1]*p[1]+M.R[1][2]*p[2]+M.t[1],M.R[2][0]*p[0]+M.R[2][1]*p[1]+M.R[2][2]*p[2]+M.t[2]];
const colX=M=>[M.R[0][0],M.R[1][0],M.R[2][0]];
const colY=M=>[M.R[0][1],M.R[1][1],M.R[2][1]];
const colZ=M=>[M.R[0][2],M.R[1][2],M.R[2][2]];
const plCache=new Map();
function localMatrix(id){if(id==null)return II;if(plCache.has(id))return plCache.get(id);const e=ent.get(id);if(!e||e.type!=='IFCLOCALPLACEMENT'){plCache.set(id,II);return II;}const p=splitTop(e.args);const parent=ref(p[0]);const rel=axis3d(ref(p[1]));const M=parent==null?rel:mul(localMatrix(parent),rel);plCache.set(id,M);return M;}
function axis2dLoc(id){const e=ent.get(id);if(!e)return[0,0];const p=splitTop(e.args);return pt(ref(p[0]));}
function profileInfo(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);const pos=p[2]!=='$'?axis2dLoc(ref(p[2])):[0,0];return{x:parseFloat(p[3]),y:parseFloat(p[4]),cx:pos[0],cy:pos[1]};}return null;}
const V=[0,0,1];
const CATARG=process.argv[3]||'Bricks';

const strips=[];
for(const [id,e] of ent){if(e.type!=='IFCBUILDINGELEMENTPART'&&e.type!=='IFCMEMBER')continue;const p=splitTop(e.args);if(unq(p[2])!==CATARG)continue;const plId=ref(p[5]);const reprId=ref(p[6]);if(!reprId)continue;const PM=localMatrix(plId);const pds=ent.get(reprId);if(!pds)continue;const pp=splitTop(pds.args);for(const rId of refsOf(pp[pp.length-1])){const sr=ent.get(rId);if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;const srP=splitTop(sr.args);for(const sid of refsOf(srP[3])){const se=ent.get(sid);if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;const sp=splitTop(se.args);const depth=parseFloat(sp[3]);const prof=profileInfo(ref(sp[0]));if(!prof)continue;const SM=mul(PM,axis3d(ref(sp[1])));const wc=apply(SM,[prof.cx,prof.cy,depth/2]);const n=nrm(colZ(SM));if(Math.abs(n[2])>0.5)continue;const uAx=nrm(cross(V,n));const lx=colX(SM),ly=colY(SM);const uHalf=Math.abs(prof.x/2*dot(lx,uAx))+Math.abs(prof.y/2*dot(ly,uAx));const vHalf=Math.abs(prof.x/2*dot(lx,V))+Math.abs(prof.y/2*dot(ly,V));strips.push({n,uc:dot(wc,uAx),vc:wc[2],off:dot(wc,n),uHalf,vHalf});}}}
console.log(`strippen (verticale vlakken): ${strips.length}`);

// groepeer per gevelvlak: normaal-richting (0.05) + offset (10mm)
const dk=n=>{const q=v=>Math.round(v*20)/20;const s=(n[0]||n[1]||n[2])<0?-1:1;return`${(q(n[0])*s).toFixed(2)},${(q(n[1])*s).toFixed(2)},${(q(n[2])*s).toFixed(2)}`;};
const planes=new Map();for(const s of strips){const sgn=(s.n[0]||s.n[1]||s.n[2])<0?-1:1;const k=`${dk(s.n)}@${Math.round(s.off*sgn/10)*10}`;(planes.get(k)||planes.set(k,[]).get(k)).push(s);}
const parr=[...planes.entries()].sort((a,b)=>b[1].length-a[1].length);

function cluster1D(vals,gap){const s=[...vals].sort((a,b)=>a-b);const out=[];let cur=[s[0]];for(let i=1;i<s.length;i++){if(s[i]-s[i-1]>gap){out.push(cur);cur=[];}cur.push(s[i]);}out.push(cur);return out;}
function hist(gaps,lo,hi,bin){const h=new Map();for(const g of gaps){if(g<lo||g>hi)continue;const b=(Math.round(g/bin)*bin).toFixed(1);h.set(b,(h.get(b)||0)+1);}return[...h.entries()].sort((a,b)=>parseFloat(a[0])-parseFloat(b[0]));}

for(const [pk,ss] of parr.slice(0,3)){
  console.log(`\n===== gevelvlak ${pk}  (${ss.length} strippen) =====`);
  // rijen (courses) op vc
  const rowsC=cluster1D(ss.map(s=>s.vc),25).map(c=>c.reduce((a,b)=>a+b,0)/c.length);
  const rowOf=vc=>{let bi=0,bd=1e9;rowsC.forEach((r,i)=>{const d=Math.abs(r-vc);if(d<bd){bd=d;bi=i;}});return bi;};
  const byRow=new Map();for(const s of ss){const r=rowOf(s.vc);(byRow.get(r)||byRow.set(r,[]).get(r)).push(s);}
  const hGaps=[];for(const [,row] of byRow){row.sort((a,b)=>a.uc-b.uc);for(let i=1;i<row.length;i++){const g=(row[i].uc-row[i].uHalf)-(row[i-1].uc+row[i-1].uHalf);if(g>0.1&&g<300)hGaps.push(g);}}
  // kolommen op uc
  const colsC=cluster1D(ss.map(s=>s.uc),25).map(c=>c.reduce((a,b)=>a+b,0)/c.length);
  const colOf=uc=>{let bi=0,bd=1e9;colsC.forEach((r,i)=>{const d=Math.abs(r-uc);if(d<bd){bd=d;bi=i;}});return bi;};
  const byCol=new Map();for(const s of ss){const c=colOf(s.uc);(byCol.get(c)||byCol.set(c,[]).get(c)).push(s);}
  const vGaps=[];for(const [,col] of byCol){col.sort((a,b)=>a.vc-b.vc);for(let i=1;i<col.length;i++){const g=(col[i].vc-col[i].vHalf)-(col[i-1].vc+col[i-1].vHalf);if(g>0.1&&g<300)vGaps.push(g);}}
  const near=(arr,x,tol)=>arr.filter(g=>Math.abs(g-x)<tol).length;
  console.log(`  HORIZONTALE gaps: n=${hGaps.length} | ~3,0mm: ${near(hGaps,3,0.8)} | ~5,6mm: ${near(hGaps,5.6,0.8)}`);
  console.log(`    histogram 0-30mm: ${hist(hGaps,0,30,0.5).map(([b,c])=>`${b}:${c}`).join('  ')}`);
  console.log(`  VERTICALE gaps:   n=${vGaps.length} | ~3,0mm: ${near(vGaps,3,0.8)} | ~5,6mm: ${near(vGaps,5.6,0.8)}`);
  console.log(`    histogram 0-30mm: ${hist(vGaps,0,30,0.5).map(([b,c])=>`${b}:${c}`).join('  ')}`);
}
