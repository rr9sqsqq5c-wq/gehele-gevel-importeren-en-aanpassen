// READ-ONLY MEET (wegwerp) — valideer de koppeling UNIT (dragend HSB-paneel) <-> FINISH
// (baksteen/hout buitengevel). Per verdiepingshoog HSB-paneel: welke co-planaire buitengevel-
// elementen liggen er net buiten, en hoeveel van het paneelvlak dekken ze? → materiaal-split.
// Web-ifc NODE-API. Aanname: Z = up (Revit). node spike/diagnose/unit-finish-pairing.mjs <pad.ifc>

import { IfcAPI } from 'web-ifc';
import fs from 'fs';

const file = process.argv[2] || 'public/BIL-MOO-A-ZZ-PBP.ifc';
const api = new IfcAPI(); await api.Init();
const wi = await import('web-ifc');
const mid = api.OpenModel(new Uint8Array(fs.readFileSync(file)));
const mm = (v) => Math.round(v * 1000);
console.log(`# Unit<->finish koppeling: ${file}\n`);

// wand -> typeName
const wallType = {};
{
  const v = api.GetLineIDsWithType(mid, wi.IFCRELDEFINESBYTYPE);
  for (let i = 0; i < v.size(); i++) {
    const r = api.GetLine(mid, v.get(i), false); const tId = r?.RelatingType?.value;
    let n = null; if (tId != null) { try { n = api.GetLine(mid, tId, false)?.Name?.value ?? null; } catch {} }
    for (const o of (r?.RelatedObjects || [])) if (o?.value != null) wallType[o.value] = n;
  }
}
// wand -> #voids
const wallVoids = {};
{
  const v = api.GetLineIDsWithType(mid, wi.IFCRELVOIDSELEMENT);
  for (let i = 0; i < v.size(); i++) { const r = api.GetLine(mid, v.get(i), false); const w = r?.RelatingBuildingElement?.value, o = r?.RelatedOpeningElement?.value; if (w && o) (wallVoids[w] ??= []).push(o); }
}
// AABB
function aabb(eid) {
  let mesh; try { mesh = api.GetFlatMesh(mid, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const pl = mesh.geometries.get(gi); let g;
    try { g = api.GetGeometry(mid, pl.geometryExpressID); const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()); const m = pl.flatTransformation;
      for (let vi = 0; vi < v.length; vi += 6) { const x = v[vi], y = v[vi+1], z = v[vi+2]; const w = [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]]; for (let k = 0; k < 3; k++) { if (w[k]<b[k]) b[k]=w[k]; if (w[k]>b[k+3]) b[k+3]=w[k]; } }
    } catch {} finally { g?.delete(); }
  }
  return b[0] === Infinity ? null : b;
}
// geometrie-descriptor: thickness-as (dunste horizontaal), plaatas-1 (andere horizontaal), z
function facade(eid) {
  const b = aabb(eid); if (!b) return null;
  const ex = [b[3]-b[0], b[4]-b[1], b[5]-b[2]];
  const tA = ex[0] <= ex[1] ? 0 : 1;          // dunste horizontale as (x of y) = dikte
  const a1 = tA === 0 ? 1 : 0;                 // andere horizontale as = langs de gevel
  return { b, tA, a1, len: mm(ex[a1]), h: mm(ex[2]), thick: mm(ex[tA]),
    t0: b[tA], t1: b[tA+3], p1min: b[a1], p1max: b[a1+3], zmin: b[2], zmax: b[5] };
}
const overlap = (amin, amax, bmin, bmax) => Math.max(0, Math.min(amax, bmax) - Math.max(amin, bmin));
const intervalDist = (amin, amax, bmin, bmax) => (amax < bmin) ? bmin - amax : (bmax < amin) ? amin - bmax : 0;

const MAT = (tn) => /buitengevel_baksteen/i.test(tn) ? (/vertikaal/i.test(tn) ? 'baksteen-vert' : 'baksteen-hor')
  : /buitengevel_hout/i.test(tn) ? 'hout' : /buitengevel/i.test(tn) ? 'buitengevel-overig' : null;

// verzamel alle wanden
const wallIDs = [];
for (const tn of ['IFCWALL', 'IFCWALLSTANDARDCASE']) { const v = api.GetLineIDsWithType(mid, wi[tn]); for (let i = 0; i < v.size(); i++) wallIDs.push(v.get(i)); }

// finish-elementen (buitengevel) met geometrie
const finishes = [];
for (const id of wallIDs) { const m = MAT(wallType[id] || ''); if (!m) continue; const f = facade(id); if (f) finishes.push({ id, mat: m, f }); }

// unit-panelen: dragend HSB, verdiepingshoog (h>=2500) en paneel-breed (len>=1500)
const panels = [];
for (const id of wallIDs) { const tn = wallType[id] || ''; if (!/_LB_HSB|_LB_CLT/i.test(tn)) continue; const f = facade(id); if (!f) continue; if (f.h >= 2500 && f.len >= 1500) panels.push({ id, tn, f, nOp: (wallVoids[id] || []).length }); }

console.log(`## Selectie`);
console.log(`  dragende unit-panelen (LB HSB/CLT, h>=2500 & len>=1500): ${panels.length}`);
console.log(`  finish-elementen (buitengevel): ${finishes.length}\n`);

// koppel per paneel
const CO_TOL = 250; // mm: finish ligt binnen 250mm van paneel-buitenvlak
let brick = 0, timber = 0, bare = 0;
const covs = [];
const examples = [];
for (const p of panels) {
  const pf = p.f; const pArea = pf.len * pf.h;
  let ovBrickV = 0, ovBrickH = 0, ovTimber = 0; const matched = [];
  for (const fi of finishes) {
    if (fi.f.tA !== pf.tA) continue;                              // zelfde gevelvlak-oriëntatie
    if (intervalDist(pf.t0, pf.t1, fi.f.t0, fi.f.t1) > CO_TOL / 1000) continue; // net buiten/tegen paneel
    const o1 = overlap(pf.p1min, pf.p1max, fi.f.p1min, fi.f.p1max);
    const oz = overlap(pf.zmin, pf.zmax, fi.f.zmin, fi.f.zmax);
    const ov = mm(o1) * mm(oz); if (ov <= 0) continue;
    matched.push({ mat: fi.mat, ov });
    if (fi.mat === 'baksteen-vert') ovBrickV += ov; else if (fi.mat === 'baksteen-hor') ovBrickH += ov; else if (fi.mat === 'hout') ovTimber += ov;
  }
  const brickCov = Math.min(1, (ovBrickV + ovBrickH) / pArea);
  const timberCov = Math.min(1, ovTimber / pArea);
  if (brickCov >= 0.4) { brick++; covs.push(brickCov); }
  else if (timberCov >= 0.4) timber++;
  else bare++;
  if (examples.length < 4 && brickCov >= 0.4) examples.push({ p, brickCov, bond: ovBrickV > ovBrickH ? 'verticaal' : 'horizontaal', nMatched: matched.length });
}
const mean = covs.length ? Math.round(100 * covs.reduce((a, b) => a + b, 0) / covs.length) : 0;
console.log(`## Koppeling paneel -> finish`);
console.log(`  baksteen-bekleed (dekking >=40%): ${brick}   gem. dekking ${mean}%`);
console.log(`  hout-bekleed:                     ${timber}`);
console.log(`  kaal / geen finish gevonden:      ${bare}\n`);
console.log(`## Voorbeeld-koppelingen (paneel → baksteen)`);
for (const e of examples) {
  console.log(`  paneel ${e.p.id} «${e.p.tn.replace('Basic Wall:', '')}» ${e.p.f.len}x${e.p.f.h}mm, ${e.p.nOp} opening(en)`);
  console.log(`     → ${e.nMatched} baksteen-strook(en), dekking ${Math.round(100*e.brickCov)}%, verband ${e.bond}`);
}
api.CloseModel(mid);
