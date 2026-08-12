// SPIKE — verifieer getKliklijstRect-logica: dunste sub-geom aan het buitenste dikte-vlak → L/H-rand rondom.
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const { IFCWINDOW } = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const modelID = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));

// axis-index helper
const AX = { x:0, y:1, z:2 };

function getKliklijstRect(eID, lAxis, hAxis, tAxis, wallMins) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, eID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  const lI=AX[lAxis], hI=AX[hAxis], tI=AX[tAxis];
  const subs = []; let allTmin=Infinity, allTmax=-Infinity;
  for (let gi=0; gi<mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    let geom; const b={lmin:Infinity,lmax:-Infinity,hmin:Infinity,hmax:-Infinity,tmin:Infinity,tmax:-Infinity};
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;
      for (let vi=0; vi<v.length; vi+=6) {
        const x=v[vi],y=v[vi+1],z=v[vi+2];
        const w=[m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
        const L=w[lI],H=w[hI],T=w[tI];
        if(L<b.lmin)b.lmin=L; if(L>b.lmax)b.lmax=L; if(H<b.hmin)b.hmin=H; if(H>b.hmax)b.hmax=H; if(T<b.tmin)b.tmin=T; if(T>b.tmax)b.tmax=T;
      }
    } catch {} finally { geom?.delete(); }
    if (b.tmin===Infinity) continue;
    subs.push(b); if(b.tmin<allTmin)allTmin=b.tmin; if(b.tmax>allTmax)allTmax=b.tmax;
  }
  if (subs.length < 2) return null;
  const depth = allTmax - allTmin; if (depth<=0) return null;
  const span = b => b.tmax-b.tmin;
  const thinnest = subs.reduce((a,b)=>span(b)<span(a)?b:a);
  if (span(thinnest) >= depth*0.6) return null;                    // geen duidelijk dun profiel
  const faceMax = (allTmax - thinnest.tmax) <= (thinnest.tmin - allTmin);
  const TOL = Math.max(depth*0.15, 0.003);
  const klik = subs.filter(b => span(b) < depth*0.6 && (faceMax ? (allTmax-b.tmax)<=TOL : (b.tmin-allTmin)<=TOL));
  if (!klik.length) return null;
  const lmin=Math.min(...klik.map(b=>b.lmin)), lmax=Math.max(...klik.map(b=>b.lmax));
  const hmin=Math.min(...klik.map(b=>b.hmin)), hmax=Math.max(...klik.map(b=>b.hmax));
  const kw=Math.round((lmax-lmin)*1000), kh=Math.round((hmax-hmin)*1000);
  if (kw<50||kh<50) return null;
  return { x: Math.round((lmin-wallMins[lAxis])*1000), breedte: kw, hoogte: kh,
           Lmin: Math.round(lmin*1000), Lmax: Math.round(lmax*1000), outsideFace: faceMax?'max':'min',
           outsideT: Math.round((faceMax?allTmax:allTmin)*1000), nKlik: klik.length };
}

// #63430: dikte=X, length=Z, height=Y. wallMins onbekend → gebruik 0 (we checken breedte + L-extent-delta)
for (const [wID, l, h, t] of [[63430,'z','y','x'], [60470,'x','y','z'], [60649,'x','y','z']]) {
  const r = getKliklijstRect(wID, l, h, t, {x:0,y:0,z:0});
  console.log(`raam #${wID}:`, r ? `kliklijst breedte ${r.breedte}mm, L[${r.Lmin}..${r.Lmax}], buitenvlak=${r.outsideFace}(T${r.outsideT}), #beads=${r.nKlik}` : 'FALLBACK (geen dun buitenprofiel)');
}
api.CloseModel(modelID);
