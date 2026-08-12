// READ-ONLY MEET (wegwerp) — hoeveel ECHTE repeterende unit-rechthoeken zitten er in de
// gevelwanden? Filtert op de klant-eigen gevelcode (NL-SfB 21 / "buitengevel" in typeName),
// meet per wand de rechthoek (lengte x hoogte, mm) + opening-layout (raam/deur, x/breedte/hoogte),
// en bucketet op signature. Web-ifc NODE-API, geen app-pijplijn. Aanname: Z = up (Revit), zelf-check.
//
// node spike/diagnose/unit-repeat-meet.mjs <pad.ifc> [tolerantie-mm]

import { IfcAPI } from 'web-ifc';
import fs from 'fs';

const file = process.argv[2] || 'public/BIL-MOO-A-ZZ-PBP.ifc';
const T = Number(process.argv[3] || 50); // kwantiseer-tolerantie in mm
const api = new IfcAPI(); await api.Init();
const wi = await import('web-ifc');
const mid = api.OpenModel(new Uint8Array(fs.readFileSync(file)));
const mm = (v) => Math.round(v * 1000); // web-ifc geeft meters → mm
const q = (v) => Math.round(v / T);      // kwantiseer op T mm

console.log(`# Unit-herhaling meting: ${file}`);
console.log(`# tolerantie = ${T} mm; aanname up-as = Z\n`);

// --- wand -> typeName (IfcRelDefinesByType) ---
const wallType = {};
{
  const v = api.GetLineIDsWithType(mid, wi.IFCRELDEFINESBYTYPE);
  for (let i = 0; i < v.size(); i++) {
    const r = api.GetLine(mid, v.get(i), false);
    const tId = r?.RelatingType?.value;
    let tName = null;
    if (tId != null) { try { tName = api.GetLine(mid, tId, false)?.Name?.value ?? null; } catch {} }
    for (const o of (r?.RelatedObjects || [])) if (o?.value != null) wallType[o.value] = tName;
  }
}

// --- wand -> voids ; opening -> filler-type (raam/deur/sparing) ---
const wallVoids = {};
{
  const v = api.GetLineIDsWithType(mid, wi.IFCRELVOIDSELEMENT);
  for (let i = 0; i < v.size(); i++) {
    const r = api.GetLine(mid, v.get(i), false);
    const w = r?.RelatingBuildingElement?.value, o = r?.RelatedOpeningElement?.value;
    if (w && o) (wallVoids[w] ??= []).push(o);
  }
}
const openType = {};
{
  const v = api.GetLineIDsWithType(mid, wi.IFCRELFILLSELEMENT);
  for (let i = 0; i < v.size(); i++) {
    const r = api.GetLine(mid, v.get(i), false);
    const o = r?.RelatingOpeningElement?.value, f = r?.RelatedBuildingElement?.value;
    if (o && f) {
      let t = 'sparing';
      try { const nm = api.GetNameFromTypeCode(api.GetRawLineData(mid, f).type).toLowerCase();
            t = nm.includes('window') ? 'raam' : nm.includes('door') ? 'deur' : 'sparing'; } catch {}
      openType[o] = t;
    }
  }
}

// --- wereld-AABB helper ---
function bbox(eid) {
  let mesh; try { mesh = api.GetFlatMesh(mid, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const pl = mesh.geometries.get(gi); let g;
    try {
      g = api.GetGeometry(mid, pl.geometryExpressID);
      const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
      const m = pl.flatTransformation;
      for (let vi = 0; vi < v.length; vi += 6) {
        const x = v[vi], y = v[vi + 1], z = v[vi + 2];
        const w = [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
        for (let k = 0; k < 3; k++) { if (w[k] < b[k]) b[k] = w[k]; if (w[k] > b[k+3]) b[k+3] = w[k]; }
      }
    } catch {} finally { g?.delete(); }
  }
  return b[0] === Infinity ? null : b;
}

// --- gevelwanden selecteren op klant-code ---
const FACADE_RE = /(^|:)\s*21[_.\s]|buitengevel/i;
const wallIDs = [];
for (const tn of ['IFCWALL', 'IFCWALLSTANDARDCASE']) {
  const v = api.GetLineIDsWithType(mid, wi[tn]);
  for (let i = 0; i < v.size(); i++) wallIDs.push(v.get(i));
}
const facadeIDs = wallIDs.filter((id) => FACADE_RE.test(wallType[id] || ''));

// --- per gevelwand: rechthoek + openingen ---
const walls = [];
let skipped = 0;
for (const wid of facadeIDs) {
  const b = bbox(wid);
  if (!b) { skipped++; continue; }
  const dx = b[3]-b[0], dy = b[4]-b[1], dz = b[5]-b[2];
  // up = z → hoogte = dz ; horizontaal: length = max(dx,dy), thickness = min(dx,dy)
  const lenAx = dx >= dy ? 0 : 1;               // 0=x,1=y
  const length = mm(Math.max(dx, dy));
  const height = mm(dz);
  const thickness = mm(Math.min(dx, dy));
  const wMinLen = b[lenAx], wMinZ = b[2];
  const openings = [];
  for (const o of (wallVoids[wid] || [])) {
    const ob = bbox(o); if (!ob) continue;
    const ox = mm(ob[lenAx] - wMinLen);
    const ow = mm(ob[lenAx+3] - ob[lenAx]);
    const oy = mm(ob[2] - wMinZ);
    const oh = mm(ob[5] - ob[2]);
    openings.push({ t: openType[o] || 'sparing', x: ox, w: ow, y: oy, h: oh });
  }
  walls.push({ wid, typeName: wallType[wid] || '(geen)', length, height, thickness, openings });
}

// --- signatures (leesbaar in mm; kwantisatie op T mm houdt het bucketen deterministisch) ---
const Q = (v) => q(v) * T; // gekwantiseerd, terug naar mm
const sigOf = (w) => {
  const ops = w.openings.map((o) => `${o.t[0]}@${Q(o.x)},${Q(o.w)}x${Q(o.h)}`).sort().join(';');
  return `${Q(w.length)}x${Q(w.height)}mm${ops ? ' | ' + ops : ' | (dicht)'}`;
};

console.log(`## Selectie`);
console.log(`  gevelwanden (code 21 / buitengevel): ${facadeIDs.length}  (geometrie gelukt: ${walls.length}, overgeslagen: ${skipped})`);
// zelf-check up-as: hoogte-verdeling en dikte
const heights = walls.map((w) => w.height).sort((a, b) => a - b);
const thick = walls.map((w) => w.thickness).sort((a, b) => a - b);
const med = (a) => a.length ? a[Math.floor(a.length/2)] : 0;
console.log(`  zelf-check: mediaan hoogte(z)=${med(heights)}mm (verwacht ~verdiepingshoogte), mediaan dikte=${med(thick)}mm (verwacht dun)`);
const byLen = [...walls].sort((a, b) => b.length - a.length);
const cal = (w) => `L=${w.length} H=${w.height} dik=${w.thickness}mm (${w.openings.length} op) «${w.typeName}»`;
console.log(`  kalibratie grootste: ${cal(byLen[0])}`);
console.log(`  kalibratie kleinste: ${cal(byLen[byLen.length - 1])}\n`);

// --- histogram per gevel-typeName ---
const byType = new Map();
for (const w of walls) { (byType.get(w.typeName) ?? byType.set(w.typeName, []).get(w.typeName)).push(w); }
console.log(`## Per gevel-type: wanden → unieke unit-types (signature = rechthoek + openingen)\n`);
const typeRows = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [tname, ws] of typeRows) {
  const buckets = new Map();
  for (const w of ws) { const s = sigOf(w); (buckets.get(s) ?? buckets.set(s, []).get(s)).push(w); }
  const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
  const repeated = sorted.filter(([, v]) => v.length >= 2).length;
  const singles = sorted.filter(([, v]) => v.length === 1).length;
  console.log(`─ ${tname}`);
  console.log(`    ${ws.length} wanden → ${sorted.length} unit-types  (${repeated} repeterend ≥2×, ${singles} uniek)`);
  for (const [s, v] of sorted.slice(0, 6)) {
    console.log(`      ${String(v.length).padStart(3)}×  ${s}`);
  }
  if (sorted.length > 6) console.log(`      … +${sorted.length - 6} andere unit-types`);
  console.log('');
}

// --- overall ---
const allBuckets = new Map();
for (const w of walls) { const s = w.typeName + ' :: ' + sigOf(w); allBuckets.set(s, (allBuckets.get(s) || 0) + 1); }
const counts = [...allBuckets.values()];
const rep = counts.filter((c) => c >= 2).reduce((s, c) => s + c, 0);
console.log(`## Totaal`);
console.log(`  ${walls.length} gevelwanden → ${allBuckets.size} unieke unit-types`);
console.log(`  ${rep} wanden vallen in een repeterend type (≥2×) = ${Math.round(100*rep/walls.length)}% herhaling`);

api.CloseModel(mid);
