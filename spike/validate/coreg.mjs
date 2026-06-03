// SPIKE STAP 0 — co-registratie: delen dakrand- en wand-IFC één coördinaatbasis?
// Leest IfcMapConversion / IfcProjectedCRS / WCS-origin + geometrie-wereldbbox.
// READ-ONLY. node coreg.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const W = createRequire(pathToFileURL(A + "/package.json"))(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;
const api = new W.IfcAPI(); await api.Init();

const FILES = {
  dakrand: "C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc",
  wand:    "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc",
};

function tc(name){ try { return api.GetTypeCodeFromName(name); } catch { return undefined; } }

function readGeoref(mid){
  const r = { mapConv:null, projCRS:null, wcsOrigin:null, geomBbox:null };
  // IfcMapConversion
  const mcCode = tc('IFCMAPCONVERSION');
  if (mcCode!==undefined){ const v=api.GetLineIDsWithType(mid,mcCode);
    if(v.size()>0){ const m=api.GetLine(mid,v.get(0),false);
      r.mapConv = { E:Number(val(m?.Eastings)??0), N:Number(val(m?.Northings)??0), H:Number(val(m?.OrthogonalHeight)??0),
        Xabs:val(m?.XAxisAbscissa)!=null?Number(val(m.XAxisAbscissa)):null, Xord:val(m?.XAxisOrdinate)!=null?Number(val(m.XAxisOrdinate)):null,
        scale:val(m?.Scale)!=null?Number(val(m.Scale)):null };
      const tgt=val(m?.TargetCRS); if(tgt!=null){ try{const c=api.GetLine(mid,tgt,false); r.projCRS=String(val(c?.Name)??'');}catch{} }
    } }
  // IfcProjectedCRS (apart, mocht TargetCRS niet gevuld zijn)
  if(!r.projCRS){ const pc=tc('IFCPROJECTEDCRS'); if(pc!==undefined){const v=api.GetLineIDsWithType(mid,pc); if(v.size()>0){try{r.projCRS=String(val(api.GetLine(mid,v.get(0),false)?.Name)??'');}catch{}}} }
  // WCS origin uit IfcGeometricRepresentationContext (Model)
  const ctxV=api.GetLineIDsWithType(mid, tc('IFCGEOMETRICREPRESENTATIONCONTEXT'));
  for(let i=0;i<ctxV.size();i++){ const ctx=api.GetLine(mid,ctxV.get(i),false); const ctxType=val(ctx?.ContextType);
    if(typeof ctxType==='string' && ctxType!=='Model') continue;
    const wcsRef=val(ctx?.WorldCoordinateSystem); if(wcsRef!=null){const wcs=api.GetLine(mid,wcsRef,false);const oRef=val(wcs?.Location);
      if(oRef!=null){const pt=api.GetLine(mid,oRef,false);const c=pt?.Coordinates;if(Array.isArray(c))r.wcsOrigin={x:Number(val(c[0])??0),y:Number(val(c[1])??0),z:Number(val(c[2])??0)};}}
    break;
  }
  return r;
}

function geomBbox(mid, typeNames){
  let a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity],n=0;
  for(const tn of typeNames){ const code=tc(tn); if(code===undefined)continue; const v=api.GetLineIDsWithType(mid,code);
    const stride=Math.max(1,Math.floor(v.size()/300));
    for(let i=0;i<v.size();i+=stride){ let mesh;try{mesh=api.GetFlatMesh(mid,v.get(i));}catch{continue;} if(!mesh||!mesh.geometries.size())continue;
      for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const vv=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;
        const st=Math.max(6,Math.floor(vv.length/60)*6); // grof
        for(let k=0;k<vv.length;k+=st){const lx=vv[k],ly=vv[k+1],lz=vv[k+2];const w=[m[0]*lx+m[4]*ly+m[8]*lz+m[12],m[1]*lx+m[5]*ly+m[9]*lz+m[13],m[2]*lx+m[6]*ly+m[10]*lz+m[14]];for(let d=0;d<3;d++){if(w[d]<a[d])a[d]=w[d];if(w[d]>b[d])b[d]=w[d];}n++;}
      }finally{g?.delete();}}}
  }
  return n? {min:a,max:b,size:[b[0]-a[0],b[1]-a[1],b[2]-a[2]]} : null;
}

const res={};
for(const [k,f] of Object.entries(FILES)){
  const mid=api.OpenModel(new Uint8Array(readFileSync(f)),{});
  const gr=readGeoref(mid);
  gr.geomBbox = geomBbox(mid, k==='dakrand'?['IFCPLATE','IFCCOVERING','IFCBUILDINGELEMENTPROXY']:['IFCWALLSTANDARDCASE','IFCWALL']);
  res[k]=gr;
  console.log(`\n=== ${k}: ${f.split('/').pop()} ===`);
  console.log(`  IfcProjectedCRS: ${gr.projCRS ?? '(geen)'}`);
  console.log(`  IfcMapConversion: ${gr.mapConv ? `E=${gr.mapConv.E} N=${gr.mapConv.N} H=${gr.mapConv.H} Xabs=${gr.mapConv.Xabs} Xord=${gr.mapConv.Xord} scale=${gr.mapConv.scale}` : '(geen)'}`);
  console.log(`  WCS-origin (mm): ${gr.wcsOrigin ? `(${Math.round(gr.wcsOrigin.x)}, ${Math.round(gr.wcsOrigin.y)}, ${Math.round(gr.wcsOrigin.z)})` : '(geen)'}`);
  console.log(`  geometrie-wereldbbox (m): ${gr.geomBbox ? `min(${gr.geomBbox.min.map(x=>x.toFixed(1))}) max(${gr.geomBbox.max.map(x=>x.toFixed(1))}) size(${gr.geomBbox.size.map(x=>x.toFixed(1))})` : '(geen)'}`);
  api.CloseModel(mid);
}

// ── vergelijk ──
console.log(`\n=== CO-REGISTRATIE-OORDEEL ===`);
const d=res.dakrand, w=res.wand;
const crsSame = (d.projCRS||'')===(w.projCRS||'') && !!d.projCRS;
const mc=(g)=>g.mapConv?`${Math.round(g.mapConv.E)}/${Math.round(g.mapConv.N)}/${Math.round(g.mapConv.H)}`:'(geen)';
const mcSame = d.mapConv && w.mapConv && Math.abs(d.mapConv.E-w.mapConv.E)<1 && Math.abs(d.mapConv.N-w.mapConv.N)<1 && Math.abs(d.mapConv.H-w.mapConv.H)<1;
// overlap van geometrie-wereldbbox?
let overlap=null;
if(d.geomBbox&&w.geomBbox){ overlap=[0,1,2].every(i=> d.geomBbox.min[i] <= w.geomBbox.max[i]+5 && w.geomBbox.min[i] <= d.geomBbox.max[i]+5 ); }
console.log(`  CRS gelijk?  dakrand='${d.projCRS}' vs wand='${w.projCRS}' → ${crsSame?'JA':'NEE/onbekend'}`);
console.log(`  MapConversion gelijk (E/N/H)?  dakrand=${mc(d)} vs wand=${mc(w)} → ${mcSame?'JA':'NEE/onbekend'}`);
console.log(`  WCS-origin gelijk?  ${d.wcsOrigin&&w.wcsOrigin?(Math.abs(d.wcsOrigin.x-w.wcsOrigin.x)<1&&Math.abs(d.wcsOrigin.y-w.wcsOrigin.y)<1?'JA':'NEE'):'onbekend'}  (dakrand ${d.wcsOrigin?`${Math.round(d.wcsOrigin.x)}/${Math.round(d.wcsOrigin.y)}`:'-'} vs wand ${w.wcsOrigin?`${Math.round(w.wcsOrigin.x)}/${Math.round(w.wcsOrigin.y)}`:'-'})`);
console.log(`  geometrie-wereldbbox overlapt?  ${overlap===null?'onbekend':overlap?'JA (zelfde modelruimte)':'NEE (verschillende modelruimte)'}`);
console.log(`\n  → Overlay geldig zonder handmatige uitlijning? ${ (mcSame||crsSame||overlap) ? 'JA' : 'NEE — co-registratie ontbreekt; in-lijn niet zonder handmatige uitlijning te bewijzen' }`);
