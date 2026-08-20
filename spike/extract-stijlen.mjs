// EXTRACTOR (read-only): modules-IFC → klein stijlen.json met de verticale-stijl-hartlijnen per gevelvlak.
// De 216MB blijft in Node; de app laadt straks alleen de kleine JSON. Dubbele randstijlen (module-naden)
// worden tot één hartlijn ('dubbel') gegroepeerd. Coördinaten in mm (web-ifc geeft meters → ×1000),
// zelfde frame als het Revit-gevelmodel (bewezen in red-modules-stijlen.mjs).
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WebIFC = require('web-ifc');

const F = 'C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/Moos-Bilderdammerweg/1.0 productievoorbereiding/BIL-MOO-A-ZZ-PBP_modules.ifc';
const OUT_SCRATCH = 'C:/Users/MURKAN~1/AppData/Local/Temp/claude/C--dev-brickboard/9b899544-59f4-4034-beb7-63a2c828568a/scratchpad/stijlen.json';
const OUT_DL = 'C:/Users/MurkAnneKooistraKooi/Downloads/BIL-MOO_stijlen.json';
const BIN = 200;          // gevelvlak-cluster (mm) op de normaal-as
const DBL = 120;          // ≤ deze afstand = dubbele stijl (koppel) → één hartlijn
const R = (n) => Math.round(n);

const api = new WebIFC.IfcAPI(); await api.Init();
const t0 = Date.now();
const modelID = api.OpenModel(new Uint8Array(fs.readFileSync(F)));
console.log(`modules-IFC geopend in ${((Date.now()-t0)/1000).toFixed(1)}s`);

function worldBBox(id){ let mn=[1e18,1e18,1e18],mx=[-1e18,-1e18,-1e18],has=false;
  try{ const flat=api.GetFlatMesh(modelID,id); const n=flat.geometries.size();
    for(let i=0;i<n;i++){ const pl=flat.geometries.get(i); const g=api.GetGeometry(modelID,pl.geometryExpressID);
      const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let k=0;k<v.length;k+=6){ const x=v[k],y=v[k+1],z=v[k+2];
        const wx=m[0]*x+m[4]*y+m[8]*z+m[12], wy=m[1]*x+m[5]*y+m[9]*z+m[13], wz=m[2]*x+m[6]*y+m[10]*z+m[14];
        if(wx<mn[0])mn[0]=wx;if(wy<mn[1])mn[1]=wy;if(wz<mn[2])mn[2]=wz;
        if(wx>mx[0])mx[0]=wx;if(wy>mx[1])mx[1]=wy;if(wz>mx[2])mx[2]=wz; has=true; } } }catch(e){}
  return has?{mn,mx}:null; }

// ── verticale stijlen (IfcColumn Name='STIJL' én 'VULSTIJL') → wereld-positie (mm) ──
// VULSTIJL = vólle-hoogte vulstijl in de penant (27×50, dus BREDER langs de gevel dan diep). De
// smalle-kant-heuristiek zou 'm verkeerd oriënteren → we nemen z'n as over van de dichtstbijzijnde STIJL.
const colIDs = api.GetLineIDsWithType(modelID, WebIFC.IFCCOLUMN);
const studs = []; const vuls = [];
for(let i=0;i<colIDs.size();i++){ const id=colIDs.get(i); const ln=api.GetLine(modelID,id);
  const nm = ln.Name?.value||''; const isStijl = nm==='STIJL', isVul = nm==='VULSTIJL';
  if(!isStijl && !isVul) continue;
  const b=worldBBox(id); if(!b) continue;
  const cx=R((b.mn[0]+b.mx[0])/2*1000), cz=R((b.mn[2]+b.mx[2])/2*1000);
  const y0=R(b.mn[1]*1000), y1=R(b.mx[1]*1000);
  const dx=R((b.mx[0]-b.mn[0])*1000), dz=R((b.mx[2]-b.mn[2])*1000), dy=R((b.mx[1]-b.mn[1])*1000);
  if(!(dy>500 && dy>dx && dy>dz)) continue;                 // alleen echte verticale stijlen (VULSTIJL h≈2594 past)
  const rec = { cx, cz, y0, y1, dy, profile: ln.ObjectType?.value||'', src: nm };
  if(isStijl){ rec.alongAxis = dx<=dz ? 'x' : 'z'; rec.constAxis = rec.alongAxis==='x'?'z':'x';   // smalle (38mm) kant = langs de gevel
    studs.push(rec); if(studs.length%1000===0) console.log(`  …${studs.length} stijlen`); }
  else vuls.push(rec);
}
// VULSTIJL de gevelvlak-oriëntatie van de dichtstbijzijnde STIJL geven (zodat ze in HETZELFDE vlak clusteren)
for(const v of vuls){ let best=null,bd=1e18;
  for(const s of studs){ const d=(s.cx-v.cx)**2+(s.cz-v.cz)**2+((s.y0-v.y0)*0.25)**2; if(d<bd){bd=d;best=s;} }
  if(best){ v.alongAxis=best.alongAxis; v.constAxis=best.constAxis; studs.push(v); } }
console.log(`verticale stijlen: ${studs.length} (waarvan VULSTIJL: ${vuls.length})`);

// ── cluster per gevelvlak: NABIJHEID op de normaal-as (niet vaste bins — anders splitst een dubbele
//    stijl, die op iets andere diepte staat, over twee vlakken). Gat > CLUSTER_GAP = nieuw vlak. ──
const CLUSTER_GAP = 350;
for(const s of studs){ s.cc = s.constAxis==='x'?s.cx:s.cz; s.along = s.alongAxis==='x'?s.cx:s.cz; }
const facMap = new Map(); let _fid=0;
for(const ax of ['x','z']){ const g = studs.filter(s=>s.constAxis===ax).sort((a,b)=>a.cc-b.cc); if(!g.length) continue;
  let cur=[g[0]];
  for(let i=1;i<g.length;i++){ if(g[i].cc - cur[cur.length-1].cc > CLUSTER_GAP){ facMap.set(ax+'#'+(_fid++), cur); cur=[g[i]]; } else cur.push(g[i]); }
  facMap.set(ax+'#'+(_fid++), cur); }

const median = arr => { const a=[...arr].sort((x,y)=>x-y); return a.length ? a[Math.floor(a.length/2)] : 0; };
const closestStud = (arr, tgt) => arr.reduce((a,b)=> Math.abs(b.along-tgt) < Math.abs(a.along-tgt) ? b : a);
const facades = [];
for(const [key,list] of facMap){ if(list.length<4) continue;
  // ── splits per VERDIEPING (cluster op y0; vloer-band-sprong > 1200mm) ──
  const byY = [...list].sort((a,b)=>a.y0-b.y0);
  const floorGroups=[]; let fg=[byY[0]];
  for(let i=1;i<byY.length;i++){ if(byY[i].y0 - fg[fg.length-1].y0 > 1200){ floorGroups.push(fg); fg=[byY[i]]; } else fg.push(byY[i]); }
  floorGroups.push(fg);
  const verdiepingen = floorGroups.map((fstuds, vi)=>{
    fstuds.sort((a,b)=>a.along-b.along);
    // clusters: stijlen binnen DBL = één cluster (enkele stijl óf dubbele stijl op een naad)
    const clusters=[]; let cur=[fstuds[0]];
    for(let i=1;i<fstuds.length;i++){ if(fstuds[i].along - cur[cur.length-1].along <= DBL) cur.push(fstuds[i]); else { clusters.push(cur); cur=[fstuds[i]]; } }
    clusters.push(cur);
    // veld-h.o.h. = mediaan van de reguliere gaten (400..800mm) tussen cluster-centra
    const cen = clusters.map(c=>c.reduce((a,s)=>a+s.along,0)/c.length);
    const gaps=[]; for(let i=1;i<cen.length;i++){ const g=cen[i]-cen[i-1]; if(g>=400&&g<=800) gaps.push(g); }
    const HOH = gaps.length ? median(gaps) : 600;
    // SCHROEFLIJN per cluster: enkel = die stijl; dubbel = de stijl die 't best in de gemiddelde h.o.h. valt
    // (NIET het midden tussen de twee). Greedy links→rechts: doel = vorige schroeflijn + h.o.h.
    const latten=[]; let prev=null;
    clusters.forEach((cl, ci)=>{ let chosen;
      if(prev===null){ if(ci+1<clusters.length){ const nc=clusters[ci+1].reduce((a,s)=>a+s.along,0)/clusters[ci+1].length; chosen=closestStud(cl, nc-HOH); } else chosen=cl[0]; }
      else chosen = closestStud(cl, prev+HOH);
      latten.push({ pos:R(chosen.along), type: cl.length>1?'dubbel':'enkel', y0:R(chosen.y0), y1:R(chosen.y1), stijlen: cl.map(s=>R(s.along)) });
      prev = chosen.along;
    });
    return { verdieping:vi, y0:R(Math.min(...fstuds.map(s=>s.y0))), y1:R(Math.max(...fstuds.map(s=>s.y1))), hoh:R(HOH), nLatten:latten.length, latten };
  });
  facades.push({ constAxis:list[0].constAxis, constCoord:R(list.reduce((a,s)=>a+s.cc,0)/list.length), alongAxis:list[0].alongAxis,
    nStuds:list.length, nVerdiepingen:verdiepingen.length, verdiepingen });
}
facades.sort((a,b)=>b.nStuds-a.nStuds);
api.CloseModel(modelID);

// ── schrijven ──
const out = { meta:{ bron:'BIL-MOO-A-ZZ-PBP_modules.ifc', eenheid:'mm', frame:'zelfde als Revit-gevelmodel',
  gegenereerd:'spike/extract-stijlen.mjs', nStijlen:studs.length, nGevelvlakken:facades.length,
  uitleg:'gevelvlak = constAxis/constCoord (het vlak) + alongAxis (lengte-richting). Per gevelvlak: verdiepingen[] (PER verdieping eigen stijlen). Per verdieping: latten[] = de verticale-lat-schroeflijnen. lat.pos = het CENTRUM van één echte stijl (schroeflijn); bij type "dubbel" is dat de best in de h.o.h. passende van de twee stijlen (lat.stijlen toont beide). Geen stijl → geen lat.' },
  gevelvlakken: facades };
fs.writeFileSync(OUT_SCRATCH, JSON.stringify(out,null,1));
try{ fs.writeFileSync(OUT_DL, JSON.stringify(out,null,1)); }catch(e){}
console.log(`\ngeschreven: ${OUT_SCRATCH}\n           ${OUT_DL}  (${(fs.statSync(OUT_SCRATCH).size/1024).toFixed(0)} kB)`);

// ── review ──
console.log(`\n=== OVERZICHT: ${facades.length} gevelvlakken, ${studs.length} stijlen ===`);
facades.slice(0,6).forEach((f,i)=>{ console.log(` ${i+1}. vlak ${f.constAxis}=${f.constCoord} (langs ${f.alongAxis}): ${f.nStuds} stijlen, ${f.nVerdiepingen} verdieping(en)`);
  f.verdiepingen.forEach(v=>{ const nDbl=v.latten.filter(l=>l.type==='dubbel').length;
    console.log(`      verd ${v.verdieping} (y ${v.y0}..${v.y1}): ${v.nLatten} latten (${nDbl} op dubbele stijl), h.o.h.≈${v.hoh}`); }); });

// GROEP 9-gevel (Revit: x-vlak ≈ -109, z -8963..1863) — per verdieping de lat-schroeflijnen
const g12 = facades.filter(f=>f.constAxis==='x' && Math.abs(f.constCoord-(-109))<300).sort((a,b)=>b.nStuds-a.nStuds)[0];
if(g12){ console.log(`\n=== GROEP 9 (vlak x=${g12.constCoord}) — verticale-lat schroeflijnen per verdieping (facade-x = z+8963) ===`);
  g12.verdiepingen.forEach(v=>{ const L=v.latten.filter(l=>l.pos>-9200&&l.pos<2100).sort((a,b)=>a.pos-b.pos);
    console.log(` VERDIEPING ${v.verdieping} (h.o.h.≈${v.hoh}): ${L.length} latten`);
    console.log('   facade-x: '+L.map(l=>`${l.pos+8963}${l.type==='dubbel'?'*':''}`).join(', '));
    const hoh=[]; for(let j=1;j<L.length;j++)hoh.push(L[j].pos-L[j-1].pos);
    console.log('   h.o.h.:   '+hoh.join(', ')+'   (* = op best-passende stijl van een dubbele)'); }); }
// DEBUG: RECHTER regio van Groep 9 (facade-x 8500..10800 = wereld-z -463..1837) — waarom zoveel stijlen?
const rawR = studs.filter(s=>Math.abs(s.cx-(-117))<200 && s.cz>-463 && s.cz<1837).sort((a,b)=>a.cz-b.cz);
console.log(`\n=== RECHTS naast deur (${rawR.length} rauwe stijlen) — facade-x, cx-diepte, y-bereik, dx×dz ===`);
rawR.forEach(s=>console.log(`  fx=${s.cz+8963}  cx=${s.cx}  y=${s.y0}..${s.y1} (h=${s.dy})  ${s.dx}×${s.dz}`));
// twee cx-vlakken?
const cxset={}; rawR.forEach(s=>{ const b=Math.round(s.cx/20)*20; cxset[b]=(cxset[b]||0)+1; });
console.log('  cx-diepte-verdeling:', cxset);
// hoogte-verdeling: vol (>8000) = wandstijl, kort = kozijn/opening
const tall=rawR.filter(s=>s.dy>7000).length, short=rawR.filter(s=>s.dy<=7000).length;
console.log(`  vol-hoog (>7000mm, wandstijl): ${tall}   korter (kozijn/opening): ${short}`);

console.log(`\nklaar in ${((Date.now()-t0)/1000).toFixed(1)}s`);
