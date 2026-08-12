// READ-ONLY — plaat-indelingskaart per gevel. Tekent alle platen (Board) op ware schaal
// per gevelvlak, gekleurd per groep (platen verbonden via gap<=THR). Toont paneelstructuur.
import fs from 'node:fs';
import path from 'node:path';
const IFC=process.argv[2], OUT=process.argv[3], THR=Number(process.argv[4]||10);
fs.mkdirSync(OUT,{recursive:true});
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
const colX=M=>[M.R[0][0],M.R[1][0],M.R[2][0]];const colY=M=>[M.R[0][1],M.R[1][1],M.R[2][1]];const colZ=M=>[M.R[0][2],M.R[1][2],M.R[2][2]];
const plCache=new Map();
function localMatrix(id){if(id==null)return II;if(plCache.has(id))return plCache.get(id);const e=ent.get(id);if(!e||e.type!=='IFCLOCALPLACEMENT'){plCache.set(id,II);return II;}const p=splitTop(e.args);const parent=ref(p[0]);const rel=axis3d(ref(p[1]));const M=parent==null?rel:mul(localMatrix(parent),rel);plCache.set(id,M);return M;}
function axis2dLoc(id){const e=ent.get(id);if(!e)return[0,0];const p=splitTop(e.args);return pt(ref(p[0]));}
function profileInfo(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);const pos=p[2]!=='$'?axis2dLoc(ref(p[2])):[0,0];return{x:parseFloat(p[3]),y:parseFloat(p[4]),cx:pos[0],cy:pos[1]};}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return{x:Math.max(...xs)-Math.min(...xs),y:Math.max(...ys)-Math.min(...ys),cx:(Math.max(...xs)+Math.min(...xs))/2,cy:(Math.max(...ys)+Math.min(...ys))/2};}}return null;}
const V=[0,0,1];
// boards
const boards=[];
for(const [id,e] of ent){if(e.type!=='IFCBUILDINGELEMENTPART')continue;const p=splitTop(e.args);if(unq(p[2])!=='Board')continue;const plId=ref(p[5]);const reprId=ref(p[6]);if(!reprId)continue;const PM=localMatrix(plId);const pds=ent.get(reprId);if(!pds)continue;const pp=splitTop(pds.args);for(const rId of refsOf(pp[pp.length-1])){const sr=ent.get(rId);if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;const srP=splitTop(sr.args);for(const sid of refsOf(srP[3])){const se=ent.get(sid);if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;const sp=splitTop(se.args);const depth=parseFloat(sp[3]);const prof=profileInfo(ref(sp[0]));if(!prof)continue;const SM=mul(PM,axis3d(ref(sp[1])));const wc=apply(SM,[prof.cx,prof.cy,depth/2]);const n=nrm(colZ(SM));if(Math.abs(n[2])>0.5)continue;const uAx=nrm(cross(V,n));const lx=colX(SM),ly=colY(SM);const uHalf=Math.abs(prof.x/2*dot(lx,uAx))+Math.abs(prof.y/2*dot(ly,uAx));const vHalf=Math.abs(prof.x/2*dot(lx,V))+Math.abs(prof.y/2*dot(ly,V));boards.push({n,off:dot(wc,n),uc:dot(wc,uAx),vc:wc[2],uHalf,vHalf});}}}
// gevel-groep
const dk=n=>{const q=v=>Math.round(v*20)/20;const s=(n[0]||n[1]||n[2])<0?-1:1;return`${(q(n[0])*s).toFixed(2)},${(q(n[1])*s).toFixed(2)},${(q(n[2])*s).toFixed(2)}`;};
const gev=new Map();for(const b of boards){const s=(b.n[0]||b.n[1]||b.n[2])<0?-1:1;const k=`${dk(b.n)}@${Math.round(b.off*s/100)*100}`;(gev.get(k)||gev.set(k,[]).get(k)).push(b);}
const gevArr=[...gev.entries()].filter(([,bs])=>bs.length>=12).sort((a,b)=>b[1].length-a[1].length);
console.log(`${path.basename(IFC)}: ${boards.length} platen, ${gevArr.length} gevelvlakken (>=12 platen)`);

// clusteren binnen gevel: verbonden als rechthoeken elkaar raken binnen THR
function clusterBoards(bs){const par=bs.map((_,i)=>i);const f=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x];}return x;};const u=(a,b)=>{a=f(a);b=f(b);if(a!==b)par[a]=b;};
  for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const A=bs[i],B=bs[j];const uo=Math.min(A.uc+A.uHalf,B.uc+B.uHalf)-Math.max(A.uc-A.uHalf,B.uc-B.uHalf);const vo=Math.min(A.vc+A.vHalf,B.vc+B.vHalf)-Math.max(A.vc-A.vHalf,B.vc-B.vHalf);if(uo>-THR&&vo>-THR&&(uo>0||vo>0))u(i,j);}
  const g=new Map();bs.forEach((_,i)=>{const r=f(i);(g.get(r)||g.set(r,[]).get(r)).push(i);});return[...g.values()];}

const T1='#d7e3f4', T2='#f6e6d5';
const S=0.035, mL=70, gapY=52, labelH=38, mT=60, mR=30;
function drawGevel(key,bs,yTop){
  const uMin=Math.min(...bs.map(b=>b.uc-b.uHalf)),uMax=Math.max(...bs.map(b=>b.uc+b.uHalf));
  const vMin=Math.min(...bs.map(b=>b.vc-b.vHalf)),vMax=Math.max(...bs.map(b=>b.vc+b.vHalf));
  const W=(uMax-uMin)*S,H=(vMax-vMin)*S;
  const X=u=>mL+(u-uMin)*S, Yc=v=>yTop+labelH+(vMax-v)*S;
  let s=`<text x="${mL}" y="${yTop+20}" font-size="14" font-weight="bold">Gevel ${key}</text>`;
  s+=`<text x="${mL}" y="${yTop+35}" font-size="10" fill="#555">${bs.length} platen — bij 1 plaat = 1 paneel: <tspan font-weight="bold">${bs.length} panelen</tspan> · ${Math.round(uMax-uMin)} × ${Math.round(vMax-vMin)} mm</text>`;
  bs.forEach(b=>{const x=X(b.uc-b.uHalf),y=Yc(b.vc+b.vHalf),w=Math.max(1.5,2*b.uHalf*S),h=Math.max(1.5,2*b.vHalf*S);const par=(Math.round((b.uc-uMin)/450)+Math.round((vMax-b.vc)/450))%2;s+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${par?T1:T2}" stroke="#334155" stroke-width="0.5"/>`;});
  const sb=1000*S;s+=`<line x1="${mL}" y1="${(yTop+labelH+H+16).toFixed(1)}" x2="${(mL+sb).toFixed(1)}" y2="${(yTop+labelH+H+16).toFixed(1)}" stroke="#000" stroke-width="1.2"/><text x="${mL}" y="${(yTop+labelH+H+28).toFixed(1)}" font-size="9" fill="#333">1 m</text>`;
  return {svg:s, height:labelH+H+42, width:W};
}
let y=mT, maxW=0, body='';
for(const [key,bs] of gevArr){const d=drawGevel(key,bs,y);body+=d.svg;y+=d.height+gapY;maxW=Math.max(maxW,d.width);console.log(`  ${key.padEnd(20)}: ${bs.length} platen`);}
const Wtot=Math.round(mL+maxW+mR), Htot=Math.round(y);
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${Wtot}" height="${Htot}" viewBox="0 0 ${Wtot} ${Htot}" font-family="Segoe UI,Arial,sans-serif"><rect width="${Wtot}" height="${Htot}" fill="#fff"/><text x="${mL}" y="30" font-size="17" font-weight="bold">${path.basename(IFC)} — plaat-indelingskaart</text><text x="${mL}" y="46" font-size="10" fill="#666">Elk vakje = 1 plaat (Board) op ware schaal, 3 mm-paneelvoeg ertussen (te klein om los te zien). Schaakbord-kleur enkel om buren te onderscheiden. Grote openingen = ramen/sparingen.</text>${body}</svg>`;
const outName=path.basename(IFC).replace(/\.ifc$/i,'')+'-plaatkaart.svg';
fs.writeFileSync(path.join(OUT,outName),svg,'utf8');
console.log(`geschreven: ${outName}`);
