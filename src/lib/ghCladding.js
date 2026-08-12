// GH-CLADDING — leest een Grasshopper/Geometry-Gym IFC waarin de bekleding AL gemodelleerd staat
// (IfcBuildingElementPart 'Board'/'Bricks' + IfcMember 'Slats'), i.p.v. wanden. Zuivere functies
// (invoer = IFC-tekst), gebruikt in het browser-import-pad achter vlag `ghImport`. Geconsolideerd uit
// de gevalideerde spike-scripts (extract-buildings / flat-number-writeback / gevel-review / zaagschema).
// Raakt ifc.js of enig bestaand pad NIET.

// ── STEP-tekstparser (alleen benodigde typen) ───────────────────────────────────────────────
const WANT = new Set(['IFCEXTRUDEDAREASOLID', 'IFCRECTANGLEPROFILEDEF', 'IFCARBITRARYCLOSEDPROFILEDEF', 'IFCPOLYLINE', 'IFCSHAPEREPRESENTATION', 'IFCPRODUCTDEFINITIONSHAPE', 'IFCBUILDINGELEMENTPART', 'IFCMEMBER', 'IFCAXIS2PLACEMENT3D', 'IFCAXIS2PLACEMENT2D', 'IFCDIRECTION', 'IFCLOCALPLACEMENT', 'IFCCARTESIANPOINT']);
function splitTop(s) { const o = []; let d = 0, q = false, c = ''; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (q) { c += ch; if (ch === "'") q = false; continue; } if (ch === "'") { q = true; c += ch; continue; } if (ch === '(') { d++; c += ch; continue; } if (ch === ')') { d--; c += ch; continue; } if (ch === ',' && d === 0) { o.push(c); c = ''; continue; } c += ch; } o.push(c); return o; }
const ref = (s) => { const m = String(s).match(/#(\d+)/); return m ? +m[1] : null; };
const refsOf = (s) => [...String(s).matchAll(/#(\d+)/g)].map((x) => +x[1]);
const unq = (s) => String(s).trim().replace(/^'/, '').replace(/'$/, '');
const r1 = (v) => Math.round(v * 10) / 10;

function parseEntities(text) {
  const ent = new Map(); let maxId = 0;
  const lines = text.split(/\r?\n/); let buf = '';
  for (const raw of lines) {
    buf += (buf ? ' ' : '') + raw;
    if (!/;\s*$/.test(buf)) continue;
    const m = buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/); buf = '';
    if (!m) continue;
    const id = +m[1]; if (id > maxId) maxId = id;
    const t = m[2].toUpperCase(); if (!WANT.has(t)) continue;
    ent.set(id, { type: t, args: m[3] });
  }
  return { ent, maxId };
}

// ── geometrie ───────────────────────────────────────────────────────────────────────────────
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const L = Math.hypot(...a) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };
const I3 = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
const V = [0, 0, 1];

function makeGeo(ent) {
  const pt = (id) => { const e = ent.get(id); if (!e) return [0, 0, 0]; const n = splitTop(e.args.replace(/^\(|\)$/g, '')).map(parseFloat); return [n[0] || 0, n[1] || 0, n[2] || 0]; };
  const dir = (id) => { if (id == null) return null; const e = ent.get(id); if (!e) return null; const n = splitTop(e.args.replace(/^\(|\)$/g, '')).map(parseFloat); const v = [n[0] || 0, n[1] || 0, n[2] || 0]; const L = Math.hypot(...v) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
  const axis3d = (id) => { const e = ent.get(id); if (!e || e.type !== 'IFCAXIS2PLACEMENT3D') return I3; const p = splitTop(e.args); const loc = pt(ref(p[0])); let z = dir(ref(p[1])) || [0, 0, 1]; let x = dir(ref(p[2])) || [1, 0, 0]; const zx = dot(z, x); x = nrm([x[0] - zx * z[0], x[1] - zx * z[1], x[2] - zx * z[2]]); const y = cross(z, x); return { R: [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]], t: loc }; };
  const mul = (A, B) => { const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += A.R[i][k] * B.R[k][j]; R[i][j] = s; } const t = [0, 0, 0]; for (let i = 0; i < 3; i++) { let s = A.t[i]; for (let k = 0; k < 3; k++) s += A.R[i][k] * B.t[k]; t[i] = s; } return { R, t }; };
  const apply = (M, p) => [M.R[0][0] * p[0] + M.R[0][1] * p[1] + M.R[0][2] * p[2] + M.t[0], M.R[1][0] * p[0] + M.R[1][1] * p[1] + M.R[1][2] * p[2] + M.t[1], M.R[2][0] * p[0] + M.R[2][1] * p[1] + M.R[2][2] * p[2] + M.t[2]];
  const colX = (M) => [M.R[0][0], M.R[1][0], M.R[2][0]];
  const colY = (M) => [M.R[0][1], M.R[1][1], M.R[2][1]];
  const colZ = (M) => [M.R[0][2], M.R[1][2], M.R[2][2]];
  const plCache = new Map();
  const localMatrix = (id) => { if (id == null) return I3; if (plCache.has(id)) return plCache.get(id); const e = ent.get(id); if (!e || e.type !== 'IFCLOCALPLACEMENT') { plCache.set(id, I3); return I3; } const p = splitTop(e.args); const parent = ref(p[0]); const rel = axis3d(ref(p[1])); const M = parent == null ? rel : mul(localMatrix(parent), rel); plCache.set(id, M); return M; };
  const axis2dLoc = (id) => { const e = ent.get(id); if (!e) return [0, 0]; const p = splitTop(e.args); return pt(ref(p[0])); };
  const profileInfo = (id) => {
    const e = ent.get(id); if (!e) return null;
    if (e.type === 'IFCRECTANGLEPROFILEDEF') { const p = splitTop(e.args); const pos = p[2] !== '$' ? axis2dLoc(ref(p[2])) : [0, 0]; return { x: parseFloat(p[3]), y: parseFloat(p[4]), cx: pos[0], cy: pos[1], shape: 'rect' }; }
    if (e.type === 'IFCARBITRARYCLOSEDPROFILEDEF') { const p = splitTop(e.args); const pl = ent.get(ref(p[p.length - 1])); if (pl) { const pts = refsOf(pl.args).map(pt); const xs = pts.map((v) => v[0]), ys = pts.map((v) => v[1]); return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys), cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, shape: 'poly' }; } }
    return null;
  };
  return { axis3d, mul, apply, colX, colY, colZ, localMatrix, profileInfo };
}

const CAT = { Board: 'panelen', Slats: 'latten', Bricks: 'steenstrips' };

// ── elementen extraheren (verticale gevelvlakken) ───────────────────────────────────────────
function extractElements(ent) {
  const g = makeGeo(ent);
  const els = [];
  for (const [id, e] of ent) {
    if (e.type !== 'IFCBUILDINGELEMENTPART' && e.type !== 'IFCMEMBER') continue;
    const p = splitTop(e.args); const nm = unq(p[2]); const cat = CAT[nm]; if (!cat) continue;
    const plId = ref(p[5]); const reprId = ref(p[6]); if (!reprId) continue;
    const PM = g.localMatrix(plId); const pds = ent.get(reprId); if (!pds) continue; const pp = splitTop(pds.args);
    for (const rId of refsOf(pp[pp.length - 1])) {
      const sr = ent.get(rId); if (!sr || sr.type !== 'IFCSHAPEREPRESENTATION') continue; const srP = splitTop(sr.args);
      for (const sid of refsOf(srP[3])) {
        const se = ent.get(sid); if (!se || se.type !== 'IFCEXTRUDEDAREASOLID') continue;
        const sp = splitTop(se.args); const depth = parseFloat(sp[3]); const prof = g.profileInfo(ref(sp[0])); if (!prof) continue;
        const SM = g.mul(PM, g.axis3d(ref(sp[1])));
        const wc = g.apply(SM, [prof.cx, prof.cy, depth / 2]);
        const n = nrm(g.colZ(SM));
        if (Math.abs(n[2]) > 0.5) continue; // alleen verticale (gevel-)vlakken
        const sgn = (n[0] || n[1] || n[2]) < 0 ? -1 : 1; const nd = [n[0] * sgn, n[1] * sgn, n[2] * sgn];
        const uAx = nrm(cross(V, nd)); const lx = g.colX(SM), ly = g.colY(SM);
        const uHalf = Math.abs(prof.x / 2 * dot(lx, uAx)) + Math.abs(prof.y / 2 * dot(ly, uAx));
        const vHalf = Math.abs(prof.x / 2 * dot(lx, V)) + Math.abs(prof.y / 2 * dot(ly, V));
        els.push({ pid: id, cat, L: r1(Math.max(prof.x, prof.y)), B: r1(Math.min(prof.x, prof.y)), D: r1(depth), shape: prof.shape, wc, n: nd, ndk: `${nd[0].toFixed(2)},${nd[1].toFixed(2)},${nd[2].toFixed(2)}`, off: dot(wc, nd), uc: dot(wc, uAx), vc: wc[2], uHalf, vHalf });
      }
    }
  }
  return els;
}

// kolom-letter A..Z, AA, AB… (veilig voorbij 26 gevels)
function colLetter(i) { let s = '', n = i + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }

// 1D-cluster (gaten > gap = grens) → functie die een waarde op een index mapt
function cluster1D(vals, gap) {
  const s = [...new Set(vals)].sort((a, b) => a - b); if (!s.length) return () => 0;
  const edges = [s[0]]; for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > gap) edges.push((s[i] + s[i - 1]) / 2);
  return (v) => { let idx = 0; for (let i = 0; i < edges.length; i++) if (v >= edges[i]) idx = i; return idx; };
}

// ── gevels afleiden (platen-vlak) + panelen nummeren + strippen/latten toewijzen ─────────────
function buildGevels(els) {
  const boards = els.filter((e) => e.cat === 'panelen');
  const byDir = new Map(); for (const b of boards) (byDir.get(b.ndk) || byDir.set(b.ndk, []).get(b.ndk)).push(b);
  const meta = new Map();
  for (const [ndk, arr] of byDir) { const cl = cluster1D(arr.map((b) => b.off), 150); for (const b of arr) { const gid = `${ndk}#${cl(b.off)}`; b._gid = gid; if (!meta.has(gid)) meta.set(gid, { gid, ndk, nd: b.n, offs: [] }); meta.get(gid).offs.push(b.off); } }
  const gevels = [...meta.values()].map((g) => ({ ...g, off: g.offs.reduce((a, b) => a + b, 0) / g.offs.length, ang: Math.atan2(g.nd[1], g.nd[0]) })).sort((a, b) => a.ang - b.ang || a.off - b.off);
  gevels.forEach((g, i) => { g.letter = colLetter(i); });
  const letterOf = new Map(gevels.map((g) => [g.gid, g.letter]));
  // panelen (platen) per gevel nummeren
  const boardByGev = new Map(); for (const b of boards) (boardByGev.get(b._gid) || boardByGev.set(b._gid, []).get(b._gid)).push(b);
  for (const g of gevels) {
    const bs = boardByGev.get(g.gid); const rowIdx = cluster1D(bs.map((b) => b.vc), 250);
    bs.forEach((b) => { b._row = rowIdx(b.vc); }); bs.sort((a, b) => a._row - b._row || a.uc - b.uc);
    g.panels = bs.map((b, i) => { const pan = { num: `${g.letter}-${String(i + 1).padStart(3, '0')}`, seq: i + 1, board: b, memberPids: [b.pid] }; b._pan = pan; return pan; });
    g.strips = []; g.latten = [];
  }
  // strippen + latten toewijzen aan dichtstbijzijnde plaat (zelfde normaal, |offset|<300, in-vlak)
  const bByDir = new Map(); for (const b of boards) (bByDir.get(b.ndk) || bByDir.set(b.ndk, []).get(b.ndk)).push(b);
  const gevByGid = new Map(gevels.map((g) => [g.gid, g]));
  let unassigned = 0;
  for (const e of els) {
    if (e.cat === 'panelen') continue;
    const cand = bByDir.get(e.ndk) || []; let best = null, bd = Infinity;
    for (const b of cand) { if (Math.abs(e.off - b.off) > 300) continue; const du = Math.abs(e.uc - b.uc) - b.uHalf, dv = Math.abs(e.vc - b.vc) - b.vHalf; const inside = du <= 3 && dv <= 3; const cd = (e.uc - b.uc) ** 2 + (e.vc - b.vc) ** 2; const score = inside ? cd - 1e12 : cd; if (score < bd) { bd = score; best = b; } }
    if (best) { best._pan.memberPids.push(e.pid); const g = gevByGid.get(best._gid); if (g) { if (e.cat === 'steenstrips') g.strips.push(e); else g.latten.push(e); } } else unassigned++;
  }
  return { gevels, unassigned };
}

// ── totalen (uittrekstaat) ──────────────────────────────────────────────────────────────────
function computeTotals(els) {
  const sum = (cat) => els.filter((e) => e.cat === cat);
  const area = (arr) => arr.reduce((s, e) => s + e.L * e.B, 0) / 1e6;
  const len = (arr) => arr.reduce((s, e) => s + e.L, 0) / 1000;
  const pan = sum('panelen'), strip = sum('steenstrips'), lat = sum('latten');
  return {
    panelen: { count: pan.length, m2: r1(area(pan)) },
    steenstrips: { count: strip.length, m2: r1(area(strip)) },
    latten: { count: lat.length, m: r1(len(lat)) },
  };
}

// ── publieke entry ──────────────────────────────────────────────────────────────────────────
export function parseGhCladding(text) {
  const { ent, maxId } = parseEntities(text);
  const els = extractElements(ent);
  const hasBoard = els.some((e) => e.cat === 'panelen');
  const hasStrip = els.some((e) => e.cat === 'steenstrips');
  if (!hasBoard && !hasStrip) return { ok: false, isGh: false, reason: 'Geen Grasshopper-bekleding gevonden (geen Board/Bricks).' };
  const { gevels, unassigned } = buildGevels(els);
  const totals = computeTotals(els);
  const totalPanels = gevels.reduce((s, g) => s + g.panels.length, 0);
  return { ok: true, isGh: true, elements: els, gevels, totals, maxId, unassigned, totalPanels };
}

// ── gevel-beoordelingsaanzicht (SVG-string) ─────────────────────────────────────────────────
export function buildGevelSvg(gevel, colorHex = '#6f8a3f') {
  const boards = gevel.panels.map((p) => p.board);
  if (!boards.length) return '';
  const uMin = Math.min(...boards.map((b) => b.uc - b.uHalf)), uMax = Math.max(...boards.map((b) => b.uc + b.uHalf));
  const vMin = Math.min(...boards.map((b) => b.vc - b.vHalf)), vMax = Math.max(...boards.map((b) => b.vc + b.vHalf));
  const S = Math.min(1100 / Math.max(1, uMax - uMin), 780 / Math.max(1, vMax - vMin));
  const mL = 16, mT = 52, mB = 30;
  const W = Math.round((uMax - uMin) * S + 2 * mL), H = Math.round((vMax - vMin) * S + mT + mB);
  const X = (u) => mL + (u - uMin) * S, Y = (v) => mT + (vMax - v) * S;
  let b = `<rect width="${W}" height="${H}" fill="#f4f4f2"/>`;
  for (const s of gevel.strips) { const x = X(s.uc - s.uHalf), y = Y(s.vc + s.vHalf), w = 2 * s.uHalf * S, h = 2 * s.vHalf * S; b += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0.6, w).toFixed(1)}" height="${Math.max(0.6, h).toFixed(1)}" fill="${colorHex}" stroke="#00000022" stroke-width="0.2"/>`; }
  for (const p of gevel.panels) {
    const bo = p.board; const x = X(bo.uc - bo.uHalf), y = Y(bo.vc + bo.vHalf), w = 2 * bo.uHalf * S, h = 2 * bo.vHalf * S;
    b += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="#111" stroke-width="1"/>`;
    const num = p.num, cx = x + w / 2, cy = y + h / 2, st = 'fill="#fff" stroke="#000" stroke-width="2.2" paint-order="stroke" font-weight="bold"';
    if (h > w * 1.35 && h > 24) { const fs = Math.max(6, Math.min(11, h / (num.length * 0.7))); b += `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="${fs.toFixed(1)}" text-anchor="middle" ${st} transform="rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})">${num}</text>`; }
    else { const fs = Math.max(5.5, Math.min(12, w / (num.length * 0.62))); b += `<text x="${cx.toFixed(1)}" y="${(cy + fs / 3).toFixed(1)}" font-size="${fs.toFixed(1)}" text-anchor="middle" ${st}>${num}</text>`; }
  }
  b += `<text x="${mL}" y="22" font-size="15" font-weight="bold">Gevel ${gevel.letter}</text><text x="${mL}" y="40" font-size="10" fill="#555">${gevel.panels.length} panelen · onder→boven, links→rechts</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI,Arial">${b}</svg>`;
}

// ── genummerde IFC terugschrijven (Paneelnummer/Gevel/PlaatBreedte/PlaatHoogte per element) ───
const GUID_ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
function ifcGuid(n) { let s = '', x = n >>> 0; for (let i = 0; i < 21; i++) { s = GUID_ALPH[x & 63] + s; x = Math.floor(x / 64); } return '2' + s; }
export function buildNumberedIfc(text, result) {
  let nid = result.maxId + 1, g = 1; const lines = [];
  for (const gev of result.gevels) for (const p of gev.panels) {
    const b = p.board; const w = Math.round(2 * b.uHalf), h = Math.round(2 * b.vHalf);
    const pids = [...new Set(p.memberPids)];
    const pNum = nid++, pGev = nid++, pW = nid++, pH = nid++, pset = nid++, rel = nid++;
    lines.push(`#${pNum}= IFCPROPERTYSINGLEVALUE('Paneelnummer',$,IFCLABEL('${p.num}'),$);`);
    lines.push(`#${pGev}= IFCPROPERTYSINGLEVALUE('Gevel',$,IFCLABEL('${gev.letter}'),$);`);
    lines.push(`#${pW}= IFCPROPERTYSINGLEVALUE('PlaatBreedte',$,IFCINTEGER(${w}),$);`);
    lines.push(`#${pH}= IFCPROPERTYSINGLEVALUE('PlaatHoogte',$,IFCINTEGER(${h}),$);`);
    lines.push(`#${pset}= IFCPROPERTYSET('${ifcGuid(g++)}',#7,'KGT Paneelnummering',$,(#${pNum},#${pGev},#${pW},#${pH}));`);
    lines.push(`#${rel}= IFCRELDEFINESBYPROPERTIES('${ifcGuid(g++)}',#7,$,$,(${pids.map((x) => '#' + x).join(',')}),#${pset});`);
  }
  const marker = 'ENDSEC;'; const li = text.lastIndexOf(marker);
  if (li < 0) return text;
  return text.slice(0, li) + lines.join('\r\n') + '\r\n' + text.slice(li);
}
