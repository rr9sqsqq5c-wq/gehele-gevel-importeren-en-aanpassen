// Nieuwe openingsafleiding (stap 2). Staat naast het oude pad, achter een flag.
// Drie bronnen (besluit uit de spikes, zie spike/validate/RAPPORT.md):
//  (1) WELKE openingen + host  = IfcRelVoidsElement/IfcRelFillsElement,
//      met terugval op IfcWindow/IfcDoor als voids ontbreken.
//  (2) BUITEN/BINNEN           = NL-SfB-code in de typenaam (NIET IsExternal).
//  (3) MAAT/PLEK               = eigen vorm van de opening, geprojecteerd op het
//      wandvlak (vervangt de grove wereld-bbox). Geport uit spike/validate/projection.mjs.
//
// HARDE REGELS:
//  - Output = exact het bevroren contract (zie spike/contract.md): walls[] met
//    wallOrigin + openings[{id,type,x,y,breedte,hoogte,polyPts,thicknessCenter}].
//  - Alles gekoppeld aan expressID (wand én opening). Niets samenvoegen — dat doet
//    de bestaande gevelgroepering (pattern.js).
//  - De kernfuncties krijgen (api, IFC, modelID) en zijn dus ook headless testbaar.

import { parseIfc, getApi, resolveOutsideDirections } from './ifc.js';

// ── (2) NL-SfB tabel ────────────────────────────────────────────────────────────
// Eerste twee cijfers van de NL-SfB-code. 21 = buitenwand, 22 = binnenwand.
// Expliciete tabel i.p.v. "begint met 21", met gedefinieerde fallback.
export const NLSFB_EXTERIOR = {
  '21': true,   // buitenwanden
  '22': false,  // binnenwanden
  '23': false,  // vloeren (binnen)
  '24': false,  // trappen/hellingen (binnen)
  '27': true,   // daken (buitenschil) — voor de volledigheid
  '28': false,  // dak/vloer-constructie (CLT e.d.) → niet de gevelhuid
};
// Codes die geen 21/22-stelsel volgen (bv. GFRC 17/25/34/61/87): onbekend.
// Fallback bij onbekende code: null = "weet niet" → laat downstream/geometrie beslissen.
export function classifyNlsfbExterior(typeName) {
  if (!typeName) return { code: null, two: null, isExterior: null, source: 'geen-typenaam' };
  const m = String(typeName).replace(/^Basic Wall:\s*/i, '').match(/(\d{2}(?:\.\d{2,3})*)/);
  if (!m) return { code: null, two: null, isExterior: null, source: 'geen-code' };
  const code = m[1], two = code.slice(0, 2);
  const known = Object.prototype.hasOwnProperty.call(NLSFB_EXTERIOR, two);
  return {
    code, two,
    isExterior: known ? NLSFB_EXTERIOR[two] : null,
    source: known ? `NL-SfB ${two}` : `NL-SfB ${two} (onbekend → null)`,
  };
}

// ── geometrie helpers (meters) ───────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const colv = (m, c) => [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];

function firstMatrix(api, modelID, eid) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  return mesh.geometries.get(0).flatTransformation;
}
function worldVerts(api, modelID, eid) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  const pts = [];
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const pl = mesh.geometries.get(gi); let g;
    try {
      g = api.GetGeometry(modelID, pl.geometryExpressID);
      const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
      const m = pl.flatTransformation;
      for (let i = 0; i < v.length; i += 6) {
        const lx = v[i], ly = v[i + 1], lz = v[i + 2];
        pts.push([
          m[0] * lx + m[4] * ly + m[8] * lz + m[12],
          m[1] * lx + m[5] * ly + m[9] * lz + m[13],
          m[2] * lx + m[6] * ly + m[10] * lz + m[14],
        ]);
      }
    } finally { g?.delete(); }
  }
  return pts.length ? pts : null;
}

export function detectUp(api, modelID, wallIds) {
  let sz = 0, sy = 0;
  for (const id of wallIds.slice(0, 200)) {
    const m = firstMatrix(api, modelID, id); if (!m) continue;
    for (const c of [0, 1, 2]) { const v = norm(colv(m, c)); sz += Math.abs(v[2]); sy += Math.abs(v[1]); }
  }
  return (sz >= sy) ? [0, 0, 1] : [0, 1, 0];
}

// Robuuste up-as voor het VOID-LOZE terugvalpad: stem op de langste wereld-as van
// de IfcWindow/IfcDoor-elementen zelf (hun hoogste maat = verticaal). Betrouwbaarder
// dan de kolom-heuristiek bij (bijna) kubische gebouwen waar de wand-extent ambigu
// is. Wordt ALLEEN in de fallback gebruikt → raakt het void-pad niet.
export function detectUpRobust(api, IFC, modelID) {
  const vote = [0, 0, 0];
  for (const t of [IFC.IFCWINDOW, IFC.IFCDOOR]) {
    let vec; try { vec = api.GetLineIDsWithType(modelID, t); } catch { continue; }
    for (let i = 0; i < vec.size(); i++) {
      const p = worldVerts(api, modelID, vec.get(i)); if (!p) continue;
      let a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
      for (const q of p) for (let k = 0; k < 3; k++) { if (q[k] < a[k]) a[k] = q[k]; if (q[k] > b[k]) b[k] = q[k]; }
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      let mx = 0; for (let k = 1; k < 3; k++) if (d[k] > d[mx]) mx = k;
      vote[mx]++;
    }
  }
  if (vote[0] + vote[1] + vote[2] === 0) return null; // geen ramen/deuren → geen stem
  const ax = vote.indexOf(Math.max(...vote));
  return [ax === 0 ? 1 : 0, ax === 1 ? 1 : 0, ax === 2 ? 1 : 0];
}

// Robuust wandframe: H = echte verticaal (up), L = langste horizontale wand-as,
// T = loodrecht (dikte). Plus de wand-bounds langs L,H (voor wand-lokale x/y).
export function buildFrame(api, modelID, hostId, up) {
  const m = firstMatrix(api, modelID, hostId);
  const wv = worldVerts(api, modelID, hostId);
  if (!m || !wv) return null;
  const axes = [norm(colv(m, 0)), norm(colv(m, 1)), norm(colv(m, 2))];
  const O = [m[12], m[13], m[14]];
  const H = norm(up);
  const vert = axes.map(a => Math.abs(dot(a, H)));
  const order = [0, 1, 2].sort((a, b) => vert[a] - vert[b]);
  const ext = (ax) => { let mn = Infinity, mx = -Infinity; for (const p of wv) { const d = dot(sub(p, O), ax); if (d < mn) mn = d; if (d > mx) mx = d; } return mx - mn; };
  const e0 = ext(axes[order[0]]), e1 = ext(axes[order[1]]);
  let L = e0 >= e1 ? axes[order[0]] : axes[order[1]];
  L = norm([L[0] - H[0] * dot(L, H), L[1] - H[1] * dot(L, H), L[2] - H[2] * dot(L, H)]);
  const T = [H[1] * L[2] - H[2] * L[1], H[2] * L[0] - H[0] * L[2], H[0] * L[1] - H[1] * L[0]];
  let lMin = Infinity, lMax = -Infinity, hMin = Infinity, hMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  for (const p of wv) {
    const dl = dot(sub(p, O), L), dh = dot(sub(p, O), H), dt = dot(sub(p, O), T);
    if (dl < lMin) lMin = dl; if (dl > lMax) lMax = dl;
    if (dh < hMin) hMin = dh; if (dh > hMax) hMax = dh;
    if (dt < tMin) tMin = dt; if (dt > tMax) tMax = dt;
  }
  return { O, L, H, T, lMin, lMax, hMin, hMax, tMin, tMax };
}

function hull2d(pts) {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = []; for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop(); return lo.concat(up);
}

// Pure projectie van wereld-punten op een wandframe → contract-maten (mm).
// Los testbaar (synthetische gedraaide wand) zonder web-ifc.
export function projectWorldPoints(ov, fr) {
  if (!ov || !ov.length) return null;
  const M = 1000;
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  const uv = [];
  let Xmn = Infinity, Xmx = -Infinity, Ymn = Infinity, Ymx = -Infinity, Zmn = Infinity, Zmx = -Infinity;
  for (const p of ov) {
    const u = dot(sub(p, fr.O), fr.L), v = dot(sub(p, fr.O), fr.H), t = dot(sub(p, fr.O), fr.T);
    uv.push([u, v]);
    if (u < uMin) uMin = u; if (u > uMax) uMax = u;
    if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    if (t < tMin) tMin = t; if (t > tMax) tMax = t;
    if (p[0] < Xmn) Xmn = p[0]; if (p[0] > Xmx) Xmx = p[0];
    if (p[1] < Ymn) Ymn = p[1]; if (p[1] > Ymx) Ymx = p[1];
    if (p[2] < Zmn) Zmn = p[2]; if (p[2] > Zmx) Zmx = p[2];
  }
  const breedte = Math.round((uMax - uMin) * M), hoogte = Math.round((vMax - vMin) * M);
  const x = Math.round((uMin - fr.lMin) * M), y = Math.round((vMin - fr.hMin) * M);
  const poly = hull2d(uv).map(([u, v]) => ({ l: Math.round((u - fr.lMin) * M), h: Math.round((v - fr.hMin) * M) }));
  return {
    x, y, breedte, hoogte, polyPts: poly,
    thkMm: Math.round((tMax - tMin) * M),
    worldAABB: { minX: Xmn, minY: Ymn, minZ: Zmn, maxX: Xmx, maxY: Ymx, maxZ: Zmx },
    _frameOffPlane: Math.round(((tMin + tMax) / 2) * M), // afstand midden t.o.v. wand-referentie
  };
}

// (3) Projecteer de eigen vorm van een element op het wandvlak → contract-opening.
export function projectElementOntoFrame(api, modelID, elemId, fr) {
  const ov = worldVerts(api, modelID, elemId);
  if (!ov) return null;
  return projectWorldPoints(ov, fr);
}

// ── (1) WELKE openingen + host, met terugval op window/door ───────────────────────
const val = (x) => (x && typeof x === 'object' && 'value' in x) ? x.value : x;

export async function deriveOpeningsCore(api, IFC, modelID, hostIds, up) {
  const hostSet = new Set(hostIds);
  const frames = new Map();
  for (const h of hostIds) { const f = buildFrame(api, modelID, h, up); if (f) frames.set(h, f); }

  const typeName = (eid) => { try { const raw = api.GetRawLineData(modelID, eid); return api.GetNameFromTypeCode(raw.type); } catch { return ''; } };

  // fills: opening → fillerType + fillerId (om dubbeltelling fallback te vermijden)
  const fillType = {}; const filledBy = new Set();
  { const rels = api.GetLineIDsWithType(modelID, IFC.IFCRELFILLSELEMENT);
    for (let i = 0; i < rels.size(); i++) { try {
      const r = api.GetLine(modelID, rels.get(i), false);
      const op = val(r?.RelatingOpeningElement), fil = val(r?.RelatedBuildingElement);
      if (!op || !fil) continue;
      const tn = typeName(fil).toLowerCase();
      fillType[op] = tn.includes('window') ? 'raam' : tn.includes('door') ? 'deur' : 'sparing';
      filledBy.add(fil);
    } catch {} }
  }
  // voids: host → [opening]
  const voidsByHost = {};
  { const rels = api.GetLineIDsWithType(modelID, IFC.IFCRELVOIDSELEMENT);
    for (let i = 0; i < rels.size(); i++) { try {
      const r = api.GetLine(modelID, rels.get(i), false);
      const host = val(r?.RelatingBuildingElement), op = val(r?.RelatedOpeningElement);
      if (!host || !op) continue;
      (voidsByHost[host] ||= []).push(op);
    } catch {} }
  }

  const byHost = new Map();
  let viaVoid = 0, viaFallback = 0, slabVoids = 0, noGeom = 0;
  const push = (host, op) => { (byHost.get(host) || byHost.set(host, []).get(host)).push(op); };

  // (1a) primair: void-relaties
  for (const host of Object.keys(voidsByHost).map(Number)) {
    const fr = frames.get(host);
    if (!fr) { if (!hostSet.has(host)) slabVoids += voidsByHost[host].length; continue; }
    for (const opId of voidsByHost[host]) {
      const proj = projectElementOntoFrame(api, modelID, opId, fr);
      if (!proj) { noGeom++; continue; }
      if (proj.breedte < 50 || proj.hoogte < 50) continue;
      push(host, mkOpening(opId, fillType[opId] ?? 'sparing', proj));
      viaVoid++;
    }
  }

  // (1b) terugval — ALLEEN als het model GEEN void-relaties heeft (twee-lagen-regel,
  // per model). Modellen mét voids (BIL/Helmond) vertrouwen volledig op de voids;
  // void-loze modellen (Kubistische woning: 18 ramen + 11 deuren, 0 voids) krijgen
  // de openingen uit de IfcWindow/IfcDoor-elementen zelf. Zo nooit dubbeltelling.
  const modelHasVoids = Object.keys(voidsByHost).length > 0;
  let fbUpAxis = null;
  if (!modelHasVoids) {
    // Eigen, robuustere up-as voor de fallback (uit window/door tall-axis). Bij
    // (bijna) kubische gebouwen faalt de wand-kolomheuristiek; de openingen zelf
    // geven de betrouwbaarste verticaal. Valt terug op de doorgegeven `up`.
    const upFb = detectUpRobust(api, IFC, modelID) ?? up;
    fbUpAxis = upFb[0] ? 'X' : upFb[1] ? 'Y' : 'Z';
    // Frames opnieuw opbouwen met die up-as (alleen hier — void-pad blijft ongemoeid).
    const framesFb = new Map();
    for (const h of hostIds) { const f = buildFrame(api, modelID, h, upFb); if (f) framesFb.set(h, f); }
    const noExclude = new Set();
    for (const [t, typ] of [[IFC.IFCWINDOW, 'raam'], [IFC.IFCDOOR, 'deur']]) {
      let vec; try { vec = api.GetLineIDsWithType(modelID, t); } catch { continue; }
      for (let i = 0; i < vec.size(); i++) {
        const eid = vec.get(i);
        if (filledBy.has(eid)) continue;
        const host = assignHost(api, modelID, eid, framesFb, noExclude);
        if (host == null) continue;
        const proj = projectElementOntoFrame(api, modelID, eid, framesFb.get(host));
        if (!proj || proj.breedte < 50 || proj.hoogte < 50) continue;
        push(host, mkOpening(eid, typ, proj));
        viaFallback++;
      }
    }
  }

  return { byHost, stats: { viaVoid, viaFallback, slabVoids, noGeom, hosts: frames.size, fbUpAxis } };
}

// Drempels voor het void-loze terugvalpad (window/door → host-wand).
const FALLBACK_MIN_WALL_HEIGHT = 1.0; // m — onder deze verticale extent = vloer/dak, geen host
const FALLBACK_MAX_OFFPLANE = 0.5;    // m — raam/deur-centrum moet binnen deze afstand van het wandvlak

function mkOpening(id, type, proj) {
  return {
    id, type,
    x: Math.max(0, proj.x), y: Math.max(0, proj.y),
    breedte: proj.breedte, hoogte: proj.hoogte,
    polyPts: proj.polyPts,
    thicknessCenter: null, // wordt in de orchestrator gezet (global thicknessAxis, B-conventie)
    _worldAABB: proj.worldAABB, _thkMm: proj.thkMm,
  };
}

// Wijs een window/door aan de host-wand toe: in-vlak (kleine afstand tot wandvlak)
// én binnen de lengte/hoogte-grenzen van de wand. Kies de best passende.
function assignHost(api, modelID, eid, frames, excludeHosts) {
  const ov = worldVerts(api, modelID, eid); if (!ov) return null;
  const c = [0, 0, 0]; for (const p of ov) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= ov.length; c[1] /= ov.length; c[2] /= ov.length;
  let best = null, bestScore = Infinity;
  for (const [host, fr] of frames) {
    if (excludeHosts.has(host)) continue;
    // (i) host moet een VERTICALE WAND zijn, geen vloer/dak. Vloeren/daken zitten ook
    //     in de IfcWall-set en hebben een kleine verticale extent. Zonder deze poort
    //     koppelde een raam/deur aan een horizontale plaat 1+ m verderop → zwevend.
    if ((fr.hMax - fr.hMin) < FALLBACK_MIN_WALL_HEIGHT) continue;
    const dl = dot(sub(c, fr.O), fr.L), dh = dot(sub(c, fr.O), fr.H), dt = Math.abs(dot(sub(c, fr.O), fr.T));
    const inL = dl >= fr.lMin - 0.3 && dl <= fr.lMax + 0.3;
    const inH = dh >= fr.hMin - 0.3 && dh <= fr.hMax + 0.3;
    if (!inL || !inH) continue;
    // (ii) absolute drempel i.p.v. de wanddikte: het raam/deur-centrum moet DICHT bij
    //      het wandvlak liggen. (Oude drempel = wanddikte liet bij dikke/diepe hosts
    //      meters toe.)
    if (dt > FALLBACK_MAX_OFFPLANE) continue;
    if (dt < bestScore) { bestScore = dt; best = host; }
  }
  return best;
}

// Gedeeld: vervang de openingen van een bestaand wand-skelet (uit parseIfc of
// parseIfcZoneElements) door de nieuw afgeleide openingen + NL-SfB-tag, op
// expressID. Wordt gebruikt door zowel enkel-import als merge-import, zodat beide
// onder de flag identiek werken. expressID's blijven ongemoeid.
export async function applyProjectedOpenings(file, walls, onProgress) {
  if (!walls || !walls.length) return walls;
  const { IFC, api } = await getApi();
  const data = new Uint8Array(await file.arrayBuffer());
  const modelID = api.OpenModel(data, {});
  try {
    const hostIds = walls.map(w => w.expressID);
    const up = detectUp(api, modelID, hostIds);
    const { byHost, stats } = await deriveOpeningsCore(api, IFC, modelID, hostIds, up);
    onProgress?.({ log: `[nieuwe afleiding] openingen: ${stats.viaVoid} via voids, ${stats.viaFallback} via window/door-terugval, ${stats.slabVoids} op vloeren (overgeslagen)` });

    for (const w of walls) {
      const ops = byHost.get(w.expressID) ?? [];
      const tAxis = w.wallOrigin?.thicknessAxis;
      for (const o of ops) {
        if (tAxis && o._worldAABB) {
          const a = o._worldAABB;
          const mn = tAxis === 'x' ? a.minX : tAxis === 'y' ? a.minY : a.minZ;
          const mx = tAxis === 'x' ? a.maxX : tAxis === 'y' ? a.maxY : a.maxZ;
          o.thicknessCenter = Math.round(((mn + mx) / 2) * 1000);
        }
        delete o._worldAABB; delete o._thkMm;
      }
      w.openings = ops;
      const nl = classifyNlsfbExterior(w.typeName);
      if (w.wallOrigin) { w.wallOrigin.nlsfbCode = nl.code; w.wallOrigin.nlsfbExterior = nl.isExterior; w.wallOrigin.nlsfbSource = nl.source; }
    }
  } finally {
    try { api.CloseModel(modelID); } catch {}
  }
  // outside-richting opnieuw bepalen met de NIEUWE openingen (B's eigen functie)
  resolveOutsideDirections(walls);
  return walls;
}

// ── browser-orchestrator: enkel-import = skelet (parseIfc) + nieuwe openingen ──────
export async function deriveWallsWithProjection(file, filter, onProgress, options) {
  const walls = await parseIfc(file, filter, onProgress, options); // skelet (geometrie/expressID)
  await applyProjectedOpenings(file, walls, onProgress);
  walls.projectInfo = walls.projectInfo ?? null;
  return walls;
}
