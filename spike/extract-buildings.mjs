// READ-ONLY EXTRACTIE — per-element ggGHifc-bestanden (RED/GREEN/PENNANTS).
// Anders dan green-building-5: elk brick/board/lat is een EIGEN IfcBuildingElementPart/
// IfcMember met eigen GUID + placement + shape-rep. Trekt per element uit: GUID, categorie,
// maat (L>=B, dikte=extrusie-diepte), wereldpositie + gevelvlak-normaal. Wijzigt niets.
import fs from 'node:fs';
import path from 'node:path';

const FILES = process.argv.slice(2, -1);
const OUTDIR = process.argv[process.argv.length - 1];
if (FILES.length < 1) { console.error('usage: node extract-buildings.mjs <a.ifc> [b.ifc ...] <outdir>'); process.exit(1); }
fs.mkdirSync(OUTDIR, { recursive: true });

const WANT = new Set([
  'IFCEXTRUDEDAREASOLID','IFCRECTANGLEPROFILEDEF','IFCARBITRARYCLOSEDPROFILEDEF','IFCPOLYLINE',
  'IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBUILDINGELEMENTPART','IFCMEMBER',
  'IFCAXIS2PLACEMENT3D','IFCAXIS2PLACEMENT2D','IFCDIRECTION','IFCLOCALPLACEMENT','IFCCARTESIANPOINT',
]);
function splitTop(s){const o=[];let d=0,q=false,c='';for(let i=0;i<s.length;i++){const ch=s[i];if(q){c+=ch;if(ch==="'")q=false;continue;}if(ch==="'"){q=true;c+=ch;continue;}if(ch==='('){d++;c+=ch;continue;}if(ch===')'){d--;c+=ch;continue;}if(ch===','&&d===0){o.push(c);c='';continue;}c+=ch;}o.push(c);return o;}
const ref=s=>{const m=String(s).match(/#(\d+)/);return m?+m[1]:null;};
const refsOf=s=>[...String(s).matchAll(/#(\d+)/g)].map(x=>+x[1]);
const unq=s=>String(s).trim().replace(/^'/,'').replace(/'$/,'');
const r1=v=>Math.round(v*10)/10;

function parse(file){
  const text=fs.readFileSync(file,'latin1');
  const ent=new Map(); const lines=text.split(/\r?\n/); let buf='';
  for(const raw of lines){buf+=(buf?' ':'')+raw;if(!/;\s*$/.test(buf))continue;const m=buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/);buf='';if(!m)continue;const t=m[2].toUpperCase();if(!WANT.has(t))continue;ent.set(+m[1],{type:t,args:m[3]});}
  return ent;
}

// ---- geometrie-helpers (identiek aan diagnose-script) ----
function build(ent){
  const pt=id=>{const e=ent.get(id);if(!e)return[0,0,0];const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);return[n[0]||0,n[1]||0,n[2]||0];};
  const dir=id=>{if(id==null)return null;const e=ent.get(id);if(!e)return null;const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);const v=[n[0]||0,n[1]||0,n[2]||0];const L=Math.hypot(...v)||1;return[v[0]/L,v[1]/L,v[2]/L];};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>{const L=Math.hypot(...a)||1;return[a[0]/L,a[1]/L,a[2]/L];};
  const I={R:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0]};
  function axis3d(id){const e=ent.get(id);if(!e||e.type!=='IFCAXIS2PLACEMENT3D')return I;const p=splitTop(e.args);const loc=pt(ref(p[0]));let z=dir(ref(p[1]))||[0,0,1];let x=dir(ref(p[2]))||[1,0,0];const zx=z[0]*x[0]+z[1]*x[1]+z[2]*x[2];x=norm([x[0]-zx*z[0],x[1]-zx*z[1],x[2]-zx*z[2]]);const y=cross(z,x);return{R:[[x[0],y[0],z[0]],[x[1],y[1],z[1]],[x[2],y[2],z[2]]],t:loc};}
  function mul(A,B){const R=[[0,0,0],[0,0,0],[0,0,0]];for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=A.R[i][k]*B.R[k][j];R[i][j]=s;}const t=[0,0,0];for(let i=0;i<3;i++){let s=A.t[i];for(let k=0;k<3;k++)s+=A.R[i][k]*B.t[k];t[i]=s;}return{R,t};}
  const apply=(M,p)=>[M.R[0][0]*p[0]+M.R[0][1]*p[1]+M.R[0][2]*p[2]+M.t[0],M.R[1][0]*p[0]+M.R[1][1]*p[1]+M.R[1][2]*p[2]+M.t[1],M.R[2][0]*p[0]+M.R[2][1]*p[1]+M.R[2][2]*p[2]+M.t[2]];
  const applyR=(M,p)=>[M.R[0][0]*p[0]+M.R[0][1]*p[1]+M.R[0][2]*p[2],M.R[1][0]*p[0]+M.R[1][1]*p[1]+M.R[1][2]*p[2],M.R[2][0]*p[0]+M.R[2][1]*p[1]+M.R[2][2]*p[2]];
  const plCache=new Map();
  function localMatrix(id){if(id==null)return I;if(plCache.has(id))return plCache.get(id);const e=ent.get(id);if(!e||e.type!=='IFCLOCALPLACEMENT'){plCache.set(id,I);return I;}const p=splitTop(e.args);const parent=ref(p[0]);const rel=axis3d(ref(p[1]));const M=parent==null?rel:mul(localMatrix(parent),rel);plCache.set(id,M);return M;}
  function axis2dLoc(id){const e=ent.get(id);if(!e)return[0,0];const p=splitTop(e.args);return pt(ref(p[0]));}
  function profileInfo(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);const pos=p[2]!=='$'?axis2dLoc(ref(p[2])):[0,0];return{x:parseFloat(p[3]),y:parseFloat(p[4]),cx:pos[0],cy:pos[1],shape:'rect'};}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl&&pl.type==='IFCPOLYLINE'){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return{x:Math.max(...xs)-Math.min(...xs),y:Math.max(...ys)-Math.min(...ys),cx:(Math.max(...xs)+Math.min(...xs))/2,cy:(Math.max(...ys)+Math.min(...ys))/2,shape:'poly'};}}return null;}
  return {axis3d,mul,apply,applyR,norm,localMatrix,profileInfo};
}

const CAT={Board:'panelen',Slats:'latten',Bricks:'steenstrips'};

function extractFile(file){
  const ent=parse(file);
  const G=build(ent);
  const items=[]; // {guid,cat,L,B,D,shape,wc,n}
  for(const [,e] of ent){
    if(e.type!=='IFCBUILDINGELEMENTPART'&&e.type!=='IFCMEMBER')continue;
    const p=splitTop(e.args); const guid=unq(p[0]); const name=unq(p[2]); const plId=ref(p[5]); const reprId=ref(p[6]);
    if(!reprId)continue;
    const cat=CAT[name]||`overig(${name})`;
    const PM=G.localMatrix(plId);
    const pds=ent.get(reprId); if(!pds||pds.type!=='IFCPRODUCTDEFINITIONSHAPE')continue;
    const pp=splitTop(pds.args);
    for(const rId of refsOf(pp[pp.length-1])){
      const sr=ent.get(rId); if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;
      const srP=splitTop(sr.args);
      for(const sid of refsOf(srP[3])){
        const se=ent.get(sid); if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;
        const sp=splitTop(se.args); const depth=parseFloat(sp[3]);
        const prof=G.profileInfo(ref(sp[0])); if(!prof)continue;
        const SM=G.mul(PM,G.axis3d(ref(sp[1])));
        const wc=G.apply(SM,[prof.cx,prof.cy,depth/2]);
        const nrm=G.norm(G.applyR(SM,[0,0,1]));
        items.push({guid,cat,L:r1(Math.max(prof.x,prof.y)),B:r1(Math.min(prof.x,prof.y)),D:r1(depth),shape:prof.shape,wc,n:nrm});
      }
    }
  }
  return items;
}

// gevelvlak-sleutel
function planeKey(i){const q=v=>Math.round(v*100)/100;let n=[q(i.n[0]),q(i.n[1]),q(i.n[2])];const s=(n[0]||n[1]||n[2])<0?-1:1;n=[n[0]*s,n[1]*s,n[2]*s];const dist=Math.round((i.wc[0]*n[0]+i.wc[1]*n[1]+i.wc[2]*n[2])/50)*50;return`${n[0].toFixed(2)},${n[1].toFixed(2)},${n[2].toFixed(2)}@${dist}`;}

const pad=(s,n)=>String(s).padStart(n);
const nl=v=>String(v).replace('.',',');
const comboAll=['bestand;categorie;aantal;lengte_mm;breedte_mm;dikte_mm'];
const grandTot={};
console.log('================ EXTRACTIE (3 bestanden) ================\n');
for(const file of FILES){
  const base=path.basename(file);
  const items=extractFile(file);
  const byCat={};
  for(const i of items)(byCat[i.cat]||=[]).push(i);
  const planes=new Set(items.map(planeKey));
  console.log(`===== ${base} =====`);
  console.log(`  totaal elementen: ${items.length}  |  gevelvlak-clusters: ${planes.size}`);
  for(const cat of ['panelen','steenstrips','latten',...Object.keys(byCat).filter(c=>!['panelen','steenstrips','latten'].includes(c))]){
    const arr=byCat[cat]; if(!arr)continue;
    const groups=new Map();
    for(const d of arr){const k=`${d.L}|${d.B}|${d.D}`;const g=groups.get(k)||{L:d.L,B:d.B,D:d.D,n:0};g.n++;groups.set(k,g);}
    const sorted=[...groups.values()].sort((a,b)=>b.n-a.n);
    const m2=arr.reduce((s,d)=>s+d.L*d.B,0)/1e6, lm=arr.reduce((s,d)=>s+d.L,0)/1000;
    console.log(`   ${pad(cat,12)}: ${pad(arr.length,6)} st | ${pad(sorted.length,3)} maten | ${pad(m2.toFixed(1),7)} m² | ${pad(lm.toFixed(1),8)} m  | top: ${sorted.slice(0,3).map(g=>`${g.L}x${g.B}x${g.D}(${g.n})`).join('  ')}`);
    grandTot[cat]=(grandTot[cat]||0)+arr.length;
    for(const g of sorted)comboAll.push([base,cat,g.n,nl(g.L),nl(g.B),nl(g.D)].join(';'));
    // per-element detail (met GUID + wereldpositie) -> voor toekomstige nummering
    if(!extractFile._wrote)extractFile._wrote={};
  }
  // detail-CSV per bestand
  const det=['guid;categorie;lengte_mm;breedte_mm;dikte_mm;vorm;wx_mm;wy_mm;wz_mm;gevelvlak']
    .concat(items.map(i=>[i.guid,i.cat,nl(i.L),nl(i.B),nl(i.D),i.shape,i.wc[0].toFixed(1),i.wc[1].toFixed(1),i.wc[2].toFixed(1),planeKey(i)].join(';')));
  fs.writeFileSync(path.join(OUTDIR,base.replace(/\.ifc$/i,'')+'-elements.csv'),det.join('\r\n'),'utf8');
  console.log('');
}
fs.writeFileSync(path.join(OUTDIR,'uittrekstaat-3bestanden.csv'),comboAll.join('\r\n'),'utf8');
console.log('================ TOTAAL (alle 3) ================');
for(const [c,n] of Object.entries(grandTot))console.log(`  ${pad(c,12)}: ${pad(n,7)} stuks`);
console.log('\nCSV geschreven naar:',OUTDIR);
