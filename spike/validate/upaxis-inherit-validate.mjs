// READ-ONLY VALIDATIE van de up-as-fix (geen-wanden-keten B→A→z).
// Gebruikt de ECHTE projectCoordinates-module-state (reset/get/setLastConfidentUpAxis
// uit de fix) + verbatim detectModelUpAxis/deriveWallAxes, en bootst de nieuwe ifc.js
// geen-wanden-tak EXACT na. Scenario's uit het validatie-plan.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { reset, getLastConfidentUpAxis, setLastConfidentUpAxis } from '../../src/lib/projectCoordinates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BB = resolve(__dirname, '../../');
const W = createRequire(pathToFileURL(BB + '/package.json'))(resolve(BB, 'node_modules/web-ifc/web-ifc-api-node.js'));
const MOO = 'C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc';
const DAK = 'C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc';
const _HIGH = 0.75; // _UPAXIS_CONFIDENCE_HIGH (ifc.js:464)

function detectAuto(api, modelID, wallTypes) {
  const _SMIN = 1.2, _SMAX = 6.5, _B = 0.05;
  const ext = (eid) => { let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; } if (!mesh || mesh.geometries.size() === 0) return null;
    let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity,e=Infinity,f=-Infinity,ok=false;
    for (let gi=0; gi<mesh.geometries.size(); gi++){ const p=mesh.geometries.get(gi); let g;
      try{ g=api.GetGeometry(modelID,p.geometryExpressID); const vs=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=p.flatTransformation;
        for(let i=0;i<vs.length;i+=6){ const x=vs[i]??0,y=vs[i+1]??0,z=vs[i+2]??0;
          const wx=m[0]*x+m[4]*y+m[8]*z+m[12],wy=m[1]*x+m[5]*y+m[9]*z+m[13],wz=m[2]*x+m[6]*y+m[10]*z+m[14];
          if(wx<a)a=wx;if(wx>b)b=wx;if(wy<c)c=wy;if(wy>d)d=wy;if(wz<e)e=wz;if(wz>f)f=wz;ok=true;}}finally{g?.delete();}}
    return ok?{dx:b-a,dy:d-c,dz:f-e}:null; };
  const ids=[]; for(const t of wallTypes){ const v=api.GetLineIDsWithType(modelID,t); for(let i=0;i<v.size();i++) ids.push(v.get(i)); }
  if(ids.length===0) return { axis:null, confidence:0, wallCount:0 };
  const stride=Math.max(1,Math.floor(ids.length/4000)); const bY=new Map(),bZ=new Map();
  for(let i=0;i<ids.length;i+=stride){ const e=ext(ids[i]); if(!e)continue;
    if(e.dy>=_SMIN&&e.dy<=_SMAX){const k=Math.round(e.dy/_B);bY.set(k,(bY.get(k)||0)+1);}
    if(e.dz>=_SMIN&&e.dz<=_SMAX){const k=Math.round(e.dz/_B);bZ.set(k,(bZ.get(k)||0)+1);}}
  const modal=(mp)=>{let c=0;for(const[,n]of mp)if(n>c)c=n;return c;};
  const yC=modal(bY),zC=modal(bZ),maxC=Math.max(yC,zC),minC=Math.min(yC,zC),win=yC>=zC?'y':'z';
  let dV=null;{const vote={x:0,y:0,z:0};for(const tn of['IFCWINDOW','IFCDOOR']){let code;try{code=api.GetTypeCodeFromName(tn);}catch{continue;}let v;try{v=api.GetLineIDsWithType(modelID,code);}catch{continue;}
    for(let i=0;i<v.size();i++){const e=ext(v.get(i));if(!e)continue;const mx=Math.max(e.dx,e.dy,e.dz);if(mx===e.dx)vote.x++;else if(mx===e.dy)vote.y++;else vote.z++;}}if(vote.y>0||vote.z>0)dV=vote.y>=vote.z?'y':'z';}
  const clear=maxC>=3&&(minC===0||maxC>=3*minC); let ax,conf;
  if(dV&&!(clear&&dV!==win)){ax=dV;conf=(clear&&dV===win)?0.95:0.8;}
  else if(clear&&dV&&dV!==win){ax=win;conf=0.6;}
  else if(clear){ax=win;conf=0.85;}
  else{ax='z';conf=0.4;}
  return { axis:ax, confidence:conf, wallCount:ids.length };
}

function extentUp(api, modelID) {
  const types=['IFCPLATE','IFCSLAB','IFCMEMBER','IFCCOVERING','IFCBUILDINGELEMENTPROXY','IFCCURTAINWALL'];
  let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity,e=Infinity,f=-Infinity,scanned=0;
  for(const tn of types){let code;try{code=api.GetTypeCodeFromName(tn);}catch{continue;}let v;try{v=api.GetLineIDsWithType(modelID,code);}catch{continue;}
    const n=v.size();if(!n)continue;const st=Math.max(1,Math.floor(n/400));
    for(let i=0;i<n;i+=st){let mesh;try{mesh=api.GetFlatMesh(modelID,v.get(i));}catch{continue;}if(!mesh||mesh.geometries.size()===0)continue;
      for(let gi=0;gi<mesh.geometries.size();gi++){const p=mesh.geometries.get(gi);let g;
        try{g=api.GetGeometry(modelID,p.geometryExpressID);const vs=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=p.flatTransformation;
          for(let j=0;j<vs.length;j+=6){const x=vs[j]??0,y=vs[j+1]??0,z=vs[j+2]??0;
            const wx=m[0]*x+m[4]*y+m[8]*z+m[12],wy=m[1]*x+m[5]*y+m[9]*z+m[13],wz=m[2]*x+m[6]*y+m[10]*z+m[14];
            if(wx<a)a=wx;if(wx>b)b=wx;if(wy<c)c=wy;if(wy>d)d=wy;if(wz<e)e=wz;if(wz>f)f=wz;}scanned++;}finally{g?.delete();}}}}
  if(!scanned)return null;
  const span={x:b-a,y:d-c,z:f-e};const up=['x','y','z'].reduce((p,q)=>span[p]<=span[q]?p:q);
  const others=['x','y','z'].filter(x=>x!==up);const flat=span[up]>1e-6&&others.every(x=>span[x]>=1.3*span[up]);
  return flat?{axis:up,span}:null;
}

function deriveWallAxes(dx,dy,dz,heightAxis){ if(heightAxis==='z_neg')heightAxis='z';
  if(heightAxis==='y'){return{heightAxis,height:Math.round(dy*1000)};}
  return{heightAxis:'z',height:Math.round(dz*1000)};}

// EXACTE nabootsing van de nieuwe ifc.js-flow per model
function resolveUpAxis(api, modelID, { flagOn }) {
  const det = detectAuto(api, modelID, [W.IFCWALLSTANDARDCASE, W.IFCWALL]);
  if (det.wallCount > 0) {
    if (det.confidence >= _HIGH) setLastConfidentUpAxis(det.axis);
    return { axis: det.axis, via: `detectie(conf ${det.confidence})`, wallCount: det.wallCount };
  }
  if (flagOn) {
    const inh = getLastConfidentUpAxis();
    if (inh) return { axis: inh, via: 'geërfd', wallCount: 0 };
    const ext = extentUp(api, modelID);
    if (ext) return { axis: ext.axis, via: `extent ${ext.span.x.toFixed(1)}/${ext.span.y.toFixed(1)}/${ext.span.z.toFixed(1)}m`, wallCount: 0 };
    return { axis: 'z', via: 'fallback-z(extent ambigu)', wallCount: 0 };
  }
  return { axis: 'z', via: 'fallback-z(vlag UIT)', wallCount: 0 };
}

const api = new W.IfcAPI(); await api.Init();
const open = (f) => api.OpenModel(new Uint8Array(readFileSync(f)), {});
const PASS=[],FAIL=[]; const check=(n,got,want)=>{const ok=got===want;(ok?PASS:FAIL).push(`${ok?'✅':'❌'} ${n}: ${got} (verwacht ${want})`);};

console.log('=== S1: vlag AAN, volgorde [BIL-MOO, dakranden] ===');
reset();
const r1moo=resolveUpAxis(api,open(MOO),{flagOn:true});
const mDak1=open(DAK); const r1dak=resolveUpAxis(api,mDak1,{flagOn:true});
console.log(`  BIL-MOO → ${r1moo.axis} (${r1moo.via}, walls=${r1moo.wallCount})`);
console.log(`  dakranden → ${r1dak.axis} (${r1dak.via})`);
check('S1 BIL-MOO=y',r1moo.axis,'y'); check('S1 dakranden geërfd=y',r1dak.axis,'y'); check('S1 via=geërfd',r1dak.via,'geërfd');
{ const v=api.GetLineIDsWithType(mDak1,api.GetTypeCodeFromName('IFCPLATE')); const s=[];
  for(let i=0;i<v.size()&&s.length<5;i+=Math.max(1,Math.floor(v.size()/40)))s.push(v.get(i));
  console.log('  deriveWallAxes height: y(fix) vs z(oud):');
  for(const eid of s){let mesh;try{mesh=api.GetFlatMesh(mDak1,eid);}catch{continue;}if(!mesh||mesh.geometries.size()===0)continue;
    let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity,e=Infinity,f=-Infinity;
    for(let gi=0;gi<mesh.geometries.size();gi++){const p=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(mDak1,p.geometryExpressID);const vs=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=p.flatTransformation;
      for(let j=0;j<vs.length;j+=6){const x=vs[j]??0,y=vs[j+1]??0,z=vs[j+2]??0;const wx=m[0]*x+m[4]*y+m[8]*z+m[12],wy=m[1]*x+m[5]*y+m[9]*z+m[13],wz=m[2]*x+m[6]*y+m[10]*z+m[14];
        if(wx<a)a=wx;if(wx>b)b=wx;if(wy<c)c=wy;if(wy>d)d=wy;if(wz<e)e=wz;if(wz>f)f=wz;}}finally{g?.delete();}}
    const dx=b-a,dy=d-c,dz=f-e;const hy=deriveWallAxes(dx,dy,dz,'y').height,hz=deriveWallAxes(dx,dy,dz,'z').height;
    console.log(`    #${eid}: dx=${Math.round(dx*1000)} dy=${Math.round(dy*1000)} dz=${Math.round(dz*1000)} → height(y)=${hy} height(z)=${hz} ${hy!==hz?'(gecorrigeerd)':''}`);}}

console.log('\n=== S2: vlag UIT, [BIL-MOO, dakranden] (byte-identiek) ===');
reset();
const r2moo=resolveUpAxis(api,open(MOO),{flagOn:false}); const r2dak=resolveUpAxis(api,open(DAK),{flagOn:false});
console.log(`  BIL-MOO → ${r2moo.axis} | dakranden → ${r2dak.axis} (${r2dak.via})`);
check('S2 BIL-MOO=y',r2moo.axis,'y'); check('S2 dakranden=z(als nu)',r2dak.axis,'z');

console.log('\n=== S3: vlag AAN, volgorde [dakranden, BIL-MOO] (laadvolgorde-test) ===');
reset();
const r3dak=resolveUpAxis(api,open(DAK),{flagOn:true}); const r3moo=resolveUpAxis(api,open(MOO),{flagOn:true});
console.log(`  dakranden(eerst) → ${r3dak.axis} (${r3dak.via}) | BIL-MOO → ${r3moo.axis}`);
check('S3 dakranden via extent=y',r3dak.axis,'y'); check('S3 BIL-MOO=y',r3moo.axis,'y');

console.log('\n=== S4: BIL-MOO alleen, vlag AAN ===');
reset(); const r4=resolveUpAxis(api,open(MOO),{flagOn:true});
console.log(`  BIL-MOO → ${r4.axis} (${r4.via})`); check('S4 BIL-MOO alleen=y',r4.axis,'y');

console.log('\n=== S4b: dakrand-only standalone ===');
reset(); const onB=resolveUpAxis(api,open(DAK),{flagOn:true});
reset(); const offB=resolveUpAxis(api,open(DAK),{flagOn:false});
console.log(`  vlag AAN → ${onB.axis} (${onB.via}) | vlag UIT → ${offB.axis}`);
check('S4b standalone AAN=y(extent)',onB.axis,'y'); check('S4b standalone UIT=z',offB.axis,'z');

console.log('\n=== regressie-waakhond: walls-pad vlag-onafhankelijk ===');
reset(); const wOn=resolveUpAxis(api,open(MOO),{flagOn:true});
reset(); const wOff=resolveUpAxis(api,open(MOO),{flagOn:false});
check('walls-pad AAN==UIT',wOn.axis,wOff.axis);

console.log('\n──────── RESULTAAT ────────');
for(const p of PASS)console.log(p); for(const f of FAIL)console.log(f);
console.log(`\n${FAIL.length===0?'🟢 ALLE CHECKS GROEN':'🔴 '+FAIL.length+' ROOD'}  (${PASS.length} groen)`);
