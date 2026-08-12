// READ-ONLY DIAGNOSE — ruimtelijke structuur van het ggGHifc-model.
// Reconstrueert wereldposities + gevelvlak (normaal) per solid, om te zien of
// panelen/gevelvlakken betrouwbaar uit de geometrie af te leiden zijn.
import fs from 'node:fs';

const IFC = process.argv[2];
const text = fs.readFileSync(IFC, 'latin1');

const WANT = new Set([
  'IFCEXTRUDEDAREASOLID','IFCRECTANGLEPROFILEDEF','IFCARBITRARYCLOSEDPROFILEDEF','IFCPOLYLINE',
  'IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBUILDINGELEMENTPART','IFCMEMBER',
  'IFCAXIS2PLACEMENT3D','IFCAXIS2PLACEMENT2D','IFCDIRECTION','IFCLOCALPLACEMENT','IFCCARTESIANPOINT',
]);
const ent = new Map();
{
  const lines = text.split(/\r?\n/); let buf='';
  for (const raw of lines) {
    buf += (buf?' ':'')+raw;
    if (!/;\s*$/.test(buf)) continue;
    const m = buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/); buf='';
    if (!m) continue;
    const t=m[2].toUpperCase(); if(!WANT.has(t)) continue;
    ent.set(+m[1],{type:t,args:m[3]});
  }
}
function splitTop(s){const o=[];let d=0,q=false,c='';for(let i=0;i<s.length;i++){const ch=s[i];if(q){c+=ch;if(ch==="'")q=false;continue;}if(ch==="'"){q=true;c+=ch;continue;}if(ch==='('){d++;c+=ch;continue;}if(ch===')'){d--;c+=ch;continue;}if(ch===','&&d===0){o.push(c);c='';continue;}c+=ch;}o.push(c);return o;}
const ref=s=>{const m=String(s).match(/#(\d+)/);return m?+m[1]:null;};
const refsOf=s=>[...String(s).matchAll(/#(\d+)/g)].map(x=>+x[1]);

const pt=id=>{const e=ent.get(id);if(!e)return[0,0,0];const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);return[n[0]||0,n[1]||0,n[2]||0];};
const dir=id=>{if(id==null)return null;const e=ent.get(id);if(!e)return null;const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);const v=[n[0]||0,n[1]||0,n[2]||0];const L=Math.hypot(...v)||1;return[v[0]/L,v[1]/L,v[2]/L];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const norm=a=>{const L=Math.hypot(...a)||1;return[a[0]/L,a[1]/L,a[2]/L];};

// matrix = {R:[col x,col y,col z], t:[..]} ; transform p -> R*p + t
function axis3d(id){
  const e=ent.get(id); if(!e||e.type!=='IFCAXIS2PLACEMENT3D') return {R:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0]};
  const p=splitTop(e.args); const loc=pt(ref(p[0]));
  let z=dir(ref(p[1]))||[0,0,1]; let x=dir(ref(p[2]))||[1,0,0];
  // ortho-normaliseer x t.o.v. z
  const zx=z[0]*x[0]+z[1]*x[1]+z[2]*x[2]; x=norm([x[0]-zx*z[0],x[1]-zx*z[1],x[2]-zx*z[2]]);
  const y=cross(z,x);
  return {R:[[x[0],y[0],z[0]],[x[1],y[1],z[1]],[x[2],y[2],z[2]]],t:loc};
}
function mul(A,B){ // A∘B
  const R=[[0,0,0],[0,0,0],[0,0,0]];
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=A.R[i][k]*B.R[k][j];R[i][j]=s;}
  const t=[0,0,0];for(let i=0;i<3;i++){let s=A.t[i];for(let k=0;k<3;k++)s+=A.R[i][k]*B.t[k];t[i]=s;}
  return {R,t};
}
const apply=(M,p)=>[M.R[0][0]*p[0]+M.R[0][1]*p[1]+M.R[0][2]*p[2]+M.t[0],M.R[1][0]*p[0]+M.R[1][1]*p[1]+M.R[1][2]*p[2]+M.t[1],M.R[2][0]*p[0]+M.R[2][1]*p[1]+M.R[2][2]*p[2]+M.t[2]];
const applyR=(M,p)=>[M.R[0][0]*p[0]+M.R[0][1]*p[1]+M.R[0][2]*p[2],M.R[1][0]*p[0]+M.R[1][1]*p[1]+M.R[1][2]*p[2],M.R[2][0]*p[0]+M.R[2][1]*p[1]+M.R[2][2]*p[2]];

function localMatrix(id){ // IfcLocalPlacement chain -> world matrix
  const e=ent.get(id); if(!e||e.type!=='IFCLOCALPLACEMENT') return {R:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0]};
  const p=splitTop(e.args); const parent=ref(p[0]); const rel=axis3d(ref(p[1]));
  if(parent==null) return rel;
  return mul(localMatrix(parent),rel);
}

// profielafmeting + 2D center
function profileInfo(id){
  const e=ent.get(id); if(!e) return null;
  if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);const pos=p[2]!=='$'?axis2dLoc(ref(p[2])):[0,0];return {x:parseFloat(p[3]),y:parseFloat(p[4]),cx:pos[0],cy:pos[1],shape:'rect'};}
  if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl&&pl.type==='IFCPOLYLINE'){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return {x:Math.max(...xs)-Math.min(...xs),y:Math.max(...ys)-Math.min(...ys),cx:(Math.max(...xs)+Math.min(...xs))/2,cy:(Math.max(...ys)+Math.min(...ys))/2,shape:'poly'};}}
  return null;
}
function axis2dLoc(id){const e=ent.get(id);if(!e)return[0,0];const p=splitTop(e.args);return pt(ref(p[0]));}

// producten met geometrie
const CAT={Board:'panelen',Slats:'latten',Bricks:'steenstrips'};
const items=[]; // {cat, wc:[x,y,z], n:[..], L,B,D, shape}
for(const [id,e] of ent){
  if(e.type!=='IFCBUILDINGELEMENTPART'&&e.type!=='IFCMEMBER')continue;
  const p=splitTop(e.args); const name=String(p[2]).replace(/'/g,'').trim(); const reprId=ref(p[6]); const plId=ref(p[5]);
  if(!reprId)continue;
  const cat=CAT[name]||`overig(${name})`;
  const PM=plId?localMatrix(plId):{R:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0]};
  const pds=ent.get(reprId); const pp=splitTop(pds.args);
  for(const rId of refsOf(pp[pp.length-1])){
    const sr=ent.get(rId); if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;
    const srP=splitTop(sr.args);
    for(const sid of refsOf(srP[3])){
      const se=ent.get(sid); if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;
      const sp=splitTop(se.args); const depth=parseFloat(sp[3]);
      const prof=profileInfo(ref(sp[0])); if(!prof)continue;
      const SM=mul(PM,axis3d(ref(sp[1])));
      const center=apply(SM,[prof.cx,prof.cy,depth/2]);
      const nrm=norm(applyR(SM,[0,0,1]));
      items.push({cat,wc:center,n:nrm,L:Math.max(prof.x,prof.y),B:Math.min(prof.x,prof.y),D:depth,shape:prof.shape});
    }
  }
}

// globale bbox
const bb=(arr,f)=>{const v=arr.map(f);return[Math.min(...v),Math.max(...v)];};
const gx=bb(items,i=>i.wc[0]),gy=bb(items,i=>i.wc[1]),gz=bb(items,i=>i.wc[2]);
console.log('==== GLOBALE WERELD-BBOX (mm) ====');
console.log(`  X: ${gx[0].toFixed(0)} .. ${gx[1].toFixed(0)}  (${(gx[1]-gx[0]).toFixed(0)})`);
console.log(`  Y: ${gy[0].toFixed(0)} .. ${gy[1].toFixed(0)}  (${(gy[1]-gy[0]).toFixed(0)})`);
console.log(`  Z: ${gz[0].toFixed(0)} .. ${gz[1].toFixed(0)}  (${(gz[1]-gz[0]).toFixed(0)})`);
console.log(`  totaal solids: ${items.length}`);

// gevelvlakken: groepeer op (genormaliseerde normaal gekwantiseerd, afstand tot oorsprong)
function planeKey(i){
  const q=v=>Math.round(v*100)/100;
  let n=[q(i.n[0]),q(i.n[1]),q(i.n[2])];
  // richting-teken normaliseren zodat +n en -n samenvallen
  const s=(n[0]||n[1]||n[2])<0?-1:1; n=[n[0]*s,n[1]*s,n[2]*s];
  const dist=Math.round((i.wc[0]*n[0]+i.wc[1]*n[1]+i.wc[2]*n[2])/50)*50;
  return `${n[0].toFixed(2)},${n[1].toFixed(2)},${n[2].toFixed(2)} @ ${dist}`;
}
const planes=new Map();
for(const i of items){const k=planeKey(i);const g=planes.get(k)||{k,n:i.n,items:[],cats:{}};g.items.push(i);g.cats[i.cat]=(g.cats[i.cat]||0)+1;planes.set(k,g);}
const planeArr=[...planes.values()].sort((a,b)=>b.items.length-a.items.length);
console.log(`\n==== GEVELVLAKKEN (normaal @ afstand): ${planeArr.length} clusters ====`);
for(const g of planeArr.slice(0,20)){
  const c=g.cats;
  console.log(`  ${g.k.padEnd(26)} | solids ${String(g.items.length).padStart(6)} | pan ${String(c.panelen||0).padStart(4)} strip ${String(c.steenstrips||0).padStart(6)} lat ${String(c.latten||0).padStart(4)}`);
}
if(planeArr.length>20)console.log(`  ... (+${planeArr.length-20} kleine clusters)`);

// normaal-richtingen samenvatten (alleen richting, afstand negeren)
const dirs=new Map();
for(const i of items){const q=v=>Math.round(v*20)/20;let n=[q(i.n[0]),q(i.n[1]),q(i.n[2])];const s=(n[0]||n[1]||n[2])<0?-1:1;n=[n[0]*s,n[1]*s,n[2]*s];const k=`${n[0].toFixed(2)},${n[1].toFixed(2)},${n[2].toFixed(2)}`;dirs.set(k,(dirs.get(k)||0)+1);}
console.log(`\n==== UNIEKE GEVEL-RICHTINGEN (normaal, ${dirs.size} stuks) ====`);
for(const [k,v] of [...dirs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,16))console.log(`  ${k.padEnd(22)} : ${v}`);
