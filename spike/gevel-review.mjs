// Gevel-beoordelingsaanzicht: steenstrips in kleur (echt verband) + paneelgrenzen + nummers.
// args: IFC KLEURHEX OUT [gevelIndex]
import fs from 'node:fs';
import path from 'node:path';
const [IFC,COL,OUT,GIDX]=process.argv.slice(2);
fs.mkdirSync(OUT,{recursive:true});
const gi=Number(GIDX||0);
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
const colZ=M=>[M.R[0][2],M.R[1][2],M.R[2][2]];const colX=M=>[M.R[0][0],M.R[1][0],M.R[2][0]];const colY=M=>[M.R[0][1],M.R[1][1],M.R[2][1]];
const plc=new Map();function localMatrix(id){if(id==null)return II;if(plc.has(id))return plc.get(id);const e=ent.get(id);if(!e||e.type!=='IFCLOCALPLACEMENT'){plc.set(id,II);return II;}const p=splitTop(e.args);const parent=ref(p[0]);const rel=axis3d(ref(p[1]));const M=parent==null?rel:mul(localMatrix(parent),rel);plc.set(id,M);return M;}
function a2d(id){const e=ent.get(id);if(!e)return[0,0];const p=splitTop(e.args);return pt(ref(p[0]));}
function prof(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);const pos=p[2]!=='$'?a2d(ref(p[2])):[0,0];return{x:parseFloat(p[3]),y:parseFloat(p[4]),cx:pos[0],cy:pos[1]};}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return{x:Math.max(...xs)-Math.min(...xs),y:Math.max(...ys)-Math.min(...ys),cx:(Math.max(...xs)+Math.min(...xs))/2,cy:(Math.max(...ys)+Math.min(...ys))/2};}}return null;}
const V=[0,0,1];
const els=[];
for(const [,e] of ent){if(e.type!=='IFCBUILDINGELEMENTPART')continue;const p=splitTop(e.args);const nm=unq(p[2]);if(nm!=='Bricks'&&nm!=='Board')continue;const cat=nm==='Board'?'board':'strip';const plId=ref(p[5]);const reprId=ref(p[6]);if(!reprId)continue;const PM=localMatrix(plId);const pds=ent.get(reprId);if(!pds)continue;const pp=splitTop(pds.args);for(const rId of refsOf(pp[pp.length-1])){const sr=ent.get(rId);if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;const srP=splitTop(sr.args);for(const sid of refsOf(srP[3])){const se=ent.get(sid);if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;const sp=splitTop(se.args);const depth=parseFloat(sp[3]);const pr=prof(ref(sp[0]));if(!pr)continue;const SM=mul(PM,axis3d(ref(sp[1])));const wc=apply(SM,[pr.cx,pr.cy,depth/2]);const n=nrm(colZ(SM));if(Math.abs(n[2])>0.5)continue;const sgn=(n[0]||n[1]||n[2])<0?-1:1;const nd=[n[0]*sgn,n[1]*sgn,n[2]*sgn];const uAx=nrm(cross(V,nd));const lx=colX(SM),ly=colY(SM);const uH=Math.abs(pr.x/2*dot(lx,uAx))+Math.abs(pr.y/2*dot(ly,uAx));const vH=Math.abs(pr.x/2*dot(lx,V))+Math.abs(pr.y/2*dot(ly,V));els.push({cat,ndk:`${nd[0].toFixed(2)},${nd[1].toFixed(2)},${nd[2].toFixed(2)}`,off:dot(wc,nd),uc:dot(wc,uAx),vc:wc[2],uH,vH,px:pr.x,py:pr.y,depth,lx,ly});}}}
// gevels uit boards
function cl1(vals,gap){const s=[...new Set(vals)].sort((a,b)=>a-b);const edges=[s[0]];for(let i=1;i<s.length;i++)if(s[i]-s[i-1]>gap)edges.push((s[i]+s[i-1])/2);return v=>{let idx=0;for(let i=0;i<edges.length;i++)if(v>=edges[i])idx=i;return idx;};}
const boards=els.filter(e=>e.cat==='board');
const byDir=new Map();for(const b of boards)(byDir.get(b.ndk)||byDir.set(b.ndk,[]).get(b.ndk)).push(b);
const gmeta=new Map();for(const [ndk,arr] of byDir){const cl=cl1(arr.map(b=>b.off),150);for(const b of arr){const gid=`${ndk}#${cl(b.off)}`;b.gid=gid;if(!gmeta.has(gid))gmeta.set(gid,{gid,ndk,offs:[]});gmeta.get(gid).offs.push(b.off);}}
const gevs=[...gmeta.values()].map(g=>({...g,off:g.offs.reduce((a,b)=>a+b,0)/g.offs.length,nd:g.ndk.split(',').map(Number)})).sort((a,b)=>Math.atan2(a.nd[1],a.nd[0])-Math.atan2(b.nd[1],b.nd[0])||a.off-b.off);
gevs.forEach((g,i)=>g.letter=String.fromCharCode(65+i));
const bySize=[...gevs].sort((a,b)=>boards.filter(x=>x.gid===b.gid).length-boards.filter(x=>x.gid===a.gid).length);
const G=bySize[gi]||gevs[0];
const gb=boards.filter(b=>b.gid===G.gid);
// nummer onder->boven, links->rechts
const rowc=cl1(gb.map(b=>b.vc),250);gb.forEach(b=>b.row=rowc(b.vc));gb.sort((a,b)=>a.row-b.row||a.uc-b.uc);gb.forEach((b,i)=>b.num=i+1);
// strips van deze gevel
const gs=els.filter(e=>e.cat==='strip'&&e.ndk===G.ndk&&Math.abs(e.off-G.off)<300);
console.log(`${path.basename(IFC)} gevel ${G.letter} (idx ${gi}): ${gb.length} panelen, ${gs.length} strips`);
// DIAGNOSE oriëntatie
const vS=gs.filter(s=>s.vH>s.uH+3), hS=gs.length-vS.length;
console.log(`  strips: horizontaal ${hS}, VERTICAAL ${vS.length}`);
if(vS.length)console.log(`    verticale-strip afm (breedte×hoogte mm):`,[...new Set(vS.map(s=>`${Math.round(2*s.uH)}x${Math.round(2*s.vH)}`))].slice(0,6).join('  '));
const tB=gb.filter(b=>b.vH>b.uH);
console.log(`  panelen STAAND (hoger dan breed) ${tB.length}: nrs`,tB.map(b=>b.num).join(','));
console.log(`  paneel-afm vb:`,gb.slice(0,5).map(b=>`#${b.num}=${Math.round(2*b.uH)}x${Math.round(2*b.vH)}`).join('  '));
const uAxG=nrm(cross(V,G.nd));
for(const [lbl,s] of [['VERTICAAL',vS[0]],['HORIZONT.',gs.find(x=>x.uH>=x.vH)]]){if(!s)continue;
  console.log(`  RUW ${lbl}: profiel ${s.px.toFixed(0)}×${s.py.toFixed(0)} depth ${s.depth.toFixed(0)} | localX·horiz=${dot(s.lx,uAxG).toFixed(2)} localX·vert=${dot(s.lx,V).toFixed(2)} | localY·horiz=${dot(s.ly,uAxG).toFixed(2)} localY·vert=${dot(s.ly,V).toFixed(2)}`);}

// tekenen
const uMin=Math.min(...gb.map(b=>b.uc-b.uH)),uMax=Math.max(...gb.map(b=>b.uc+b.uH));
const vMin=Math.min(...gb.map(b=>b.vc-b.vH)),vMax=Math.max(...gb.map(b=>b.vc+b.vH));
const S=Math.min(1100/(uMax-uMin),820/(vMax-vMin));
const mL=20,mT=64,mB=20;
const W=Math.round((uMax-uMin)*S+2*mL),H=Math.round((vMax-vMin)*S+mT+mB);
const X=u=>mL+(u-uMin)*S,Y=v=>mT+(vMax-v)*S;
let b=`<rect width="${W}" height="${H}" fill="#f4f4f2"/>`;
// strips
for(const s of gs){const x=X(s.uc-s.uH),y=Y(s.vc+s.vH),w=2*s.uH*S,h=2*s.vH*S;b+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0.6,w).toFixed(1)}" height="${Math.max(0.6,h).toFixed(1)}" fill="${COL}" stroke="#00000022" stroke-width="0.2"/>`;}
// paneelgrenzen + nummers
for(const p of gb){const x=X(p.uc-p.uH),y=Y(p.vc+p.vH),w=2*p.uH*S,h=2*p.vH*S;b+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="#111" stroke-width="1"/>`;
  // ALTIJD nummeren; staand-smal -> verticaal label
  const num=`${G.letter}-${String(p.num).padStart(3,'0')}`;const cx=x+w/2,cy=y+h/2;const st=`fill="#fff" stroke="#000" stroke-width="2.2" paint-order="stroke" font-weight="bold"`;
  if(h>w*1.35&&h>24){const fsz=Math.max(6,Math.min(11,h/(num.length*0.7)));b+=`<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="${fsz.toFixed(1)}" text-anchor="middle" ${st} transform="rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})">${num}</text>`;}
  else{const fsz=Math.max(5.5,Math.min(12,w/(num.length*0.62)));b+=`<text x="${cx.toFixed(1)}" y="${(cy+fsz/3).toFixed(1)}" font-size="${fsz.toFixed(1)}" text-anchor="middle" ${st}>${num}</text>`;}}
b+=`<text x="${mL}" y="26" font-size="17" font-weight="bold">Gevel ${G.letter} — beoordelingsaanzicht</text><text x="${mL}" y="46" font-size="11" fill="#555">${gb.length} panelen · steenstrips in kleur (echt verband) · zwarte kaders = panelen met nummer</text>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI,Arial">${b}</svg>`;
fs.writeFileSync(path.join(OUT,path.basename(IFC).replace(/\.ifc$/i,'')+`-gevel${G.letter}-review.svg`),svg,'utf8');
console.log(`geschreven: gevel${G.letter}-review.svg (${W}x${H})`);
