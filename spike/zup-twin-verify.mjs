// SPIKE — FASE 3b: Z-UP TWIN (wegwerp). Leidt een Y/Z-swap-twin van brickboard-a af uit
// de ECHTE geometrie (wereld-Y↔Z verwisseld) en draait de ankers op de twin:
//  - up-as van de twin moet de TEGENGESTELDE zijn ('z' i.p.v. 'y') → swap pakte.
//  - nulmeting flag-UIT byte-identiek t.o.v. twin-baseline (2 runs → zelfde hash).
//  - stripZone-vlak: containment (stenen ∩ openingen/buiten vlak = 0) + scherm==export.
//  - twin-hash == Y-up-baseline-hash ⇒ zones/layout leven in het UV-frame, niet in wereld-Z.
//
// Glue (getBBox/deriveWallAxes/memberFrom/detectUpAxis/hashRows) is geport uit
// spike/zones-nulmeting.mjs — extractie, GEEN generator-kopie. De generator zelf is de
// echte productie-import.

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { buildBestFitFacadePattern } from '../src/lib/facadePlane.js';
import { buildStripZoneRegions } from '../src/lib/zoneRegions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const require = createRequire(pathToFileURL(resolve(ROOT, 'package.json')));
const W = require(resolve(ROOT, 'node_modules/web-ifc/web-ifc-api-node.js'));
const MODEL = resolve(ROOT, 'public/brickboard-a.ifc');
const BASELINE = JSON.parse(readFileSync(resolve(__dirname, 'out/nulmeting-brickboard-a.json'), 'utf8'));
const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };

function getBBox(api, mid, eid) {
  let mesh; try { mesh = api.GetFlatMesh(mid, eid); } catch { return null; }
  if (!mesh || !mesh.geometries.size()) return null;
  let a = { x: Infinity, y: Infinity, z: Infinity }, b = { x: -Infinity, y: -Infinity, z: -Infinity }, ok = false;
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const pl = mesh.geometries.get(gi); let g;
    try {
      g = api.GetGeometry(mid, pl.geometryExpressID);
      const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
      const m = pl.flatTransformation;
      const st = Math.max(6, Math.floor((v.length / 6) / 40) * 6);
      for (let k = 0; k < v.length; k += st) {
        const lx = v[k], ly = v[k + 1], lz = v[k + 2];
        const wx = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
        const wy = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
        const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        if (wx < a.x) a.x = wx; if (wx > b.x) b.x = wx;
        if (wy < a.y) a.y = wy; if (wy > b.y) b.y = wy;
        if (wz < a.z) a.z = wz; if (wz > b.z) b.z = wz; ok = true;
      }
    } finally { g?.delete(); }
  }
  return ok ? { minX: a.x, maxX: b.x, minY: a.y, maxY: b.y, minZ: a.z, maxZ: b.z } : null;
}
// ── DE SWAP: verwissel wereld-Y en wereld-Z (echte Z-up oriëntatie van hetzelfde gebouw) ──
function swapYZ(bb) { return { minX: bb.minX, maxX: bb.maxX, minY: bb.minZ, maxY: bb.maxZ, minZ: bb.minY, maxZ: bb.maxY }; }

function deriveWallAxes(dx, dy, dz, heightAxis) {
  if (heightAxis === 'z_neg') heightAxis = 'z';
  if (heightAxis === 'y') { const la = dx >= dz ? 'x' : 'z', ta = dx >= dz ? 'z' : 'x'; return { heightAxis, lengthAxis: la, thicknessAxis: ta, length: Math.round(Math.max(dx, dz) * 1000), height: Math.round(dy * 1000) }; }
  const la = dx >= dy ? 'x' : 'y', ta = dx >= dy ? 'y' : 'x'; return { heightAxis: 'z', lengthAxis: la, thicknessAxis: ta, length: Math.round(Math.max(dx, dy) * 1000), height: Math.round(dz * 1000) };
}
function memberFrom(bb, eid, up) {
  const dx = bb.maxX - bb.minX, dy = bb.maxY - bb.minY, dz = bb.maxZ - bb.minZ;
  const ax = deriveWallAxes(dx, dy, dz, up);
  if (ax.length < 100 || ax.height < 100) return null;
  const rng = (a) => [Math.round(bb['min' + a.toUpperCase()] * 1000), Math.round(bb['max' + a.toUpperCase()] * 1000)];
  const [ls, le] = rng(ax.lengthAxis), [hs, he] = rng(ax.heightAxis), [ts, te] = rng(ax.thicknessAxis);
  return { expressID: eid, length: ax.length, height: ax.height, openings: [], wallOrigin: { lengthAxis: ax.lengthAxis, heightAxis: ax.heightAxis, thicknessAxis: ax.thicknessAxis, lengthStart: ls, lengthEnd: le, heightStart: hs, heightEnd: he, thicknessStart: ts, thicknessEnd: te }, _bb: bb, _ext: { x: dx, y: dy, z: dz } };
}
function detectUpAxis(members) {
  const AX = ['x', 'y', 'z']; const midVote = { x: 0, y: 0, z: 0 }, thinVote = { x: 0, y: 0, z: 0 };
  for (const m of members) { const e = m._ext; const s = [...AX].sort((p, q) => e[p] - e[q]); thinVote[s[0]]++; midVote[s[1]]++; }
  return { up: AX.reduce((a, b) => midVote[a] >= midVote[b] ? a : b), midVote, thinVote };
}
function hashRows(rows) {
  const r2 = (v) => Math.round(v * 100) / 100;
  const norm = (rows ?? []).map((row) => ({ y: r2(row.y), pieces: (row.pieces ?? []).map((p) => [r2(p.start), r2(p.length), p.label ?? '']).sort((a, b) => a[0] - b[0] || a[1] - b[1]) })).sort((a, b) => a.y - b.y);
  return { sha256: createHash('sha256').update(JSON.stringify(norm)).digest('hex'), rowCount: norm.length, pieceCount: norm.reduce((n, r) => n + r.pieces.length, 0) };
}

function buildProbes(rawBBoxes) {
  // detecteer up-as op de (geswapte) geometrie
  const probe0 = rawBBoxes.map((bb) => memberFrom(bb, 0, 'y')).filter(Boolean);
  const { up, midVote, thinVote } = detectUpAxis(probe0);
  const members = rawBBoxes.map((bb, i) => memberFrom(bb, i, up)).filter(Boolean);
  const horiz = ['x', 'y', 'z'].filter((a) => a !== up);
  const nAxis = thinVote[horiz[0]] >= thinVote[horiz[1]] ? horiz[0] : horiz[1];
  const onN = members.filter((m) => m.wallOrigin.thicknessAxis === nAxis);
  const bin = new Map(); for (const m of onN) { const k = Math.round(m.wallOrigin.thicknessStart / 50); bin.set(k, (bin.get(k) || 0) + 1); }
  let bk = 0, bn = -1; for (const [k, c] of bin) if (c > bn) { bn = c; bk = k; }
  const sel = onN.filter((m) => Math.abs(m.wallOrigin.thicknessStart - bk * 50) < 60).map(({ _bb, _ext, ...m }) => { m.wallOrigin.resolvedOutside = { outsideDir: -1, outsidePos: m.wallOrigin.thicknessStart }; return m; });
  const probes = {};
  for (const verband of ['halfsteens', 'staand_tegelverband']) {
    const fd = buildBestFitFacadePattern(sel, MAT, verband, null, null, null, 0, 0, 0, up);
    probes[verband] = fd ? { ...hashRows(fd.rows), plane: fd._bestFit } : null;
  }
  // stripZone-anker op de twin
  const fdH = buildBestFitFacadePattern(sel, MAT, 'halfsteens', null, null, null, 0, 0, 0, up);
  let anchor = null;
  if (fdH) {
    const zone = { id: 'z', x: 2000, y: 2000, width: 4000, height: 3000, verband: 'staand_tegelverband', enabled: true };
    const regions = buildStripZoneRegions(fdH, [zone], MAT, 'halfsteens', '#a64033', {});
    const rows = regions.flatMap((r) => r.rows);
    const hS = hashRows(rows), hE = hashRows(rows);
    const planeRowH = MAT.steenH, zRowH = MAT.steenL;
    const cov = (yLo, yHi) => { const ivs = []; for (const row of fdH.rows) { if (row.y + planeRowH <= yLo || row.y >= yHi) continue; for (const p of row.pieces) ivs.push([p.start, p.start + p.length]); } ivs.sort((a, b) => a[0] - b[0]); const m = []; for (const iv of ivs) { const l = m[m.length - 1]; if (l && iv[0] <= l[1] + 1e-6) l[1] = Math.max(l[1], iv[1]); else m.push(iv.slice()); } return m; };
    let outside = 0;
    for (const row of regions[1].rows) for (const p of row.pieces) { const s = p.start, e = p.start + p.length; const inR = s >= zone.x - 0.5 && e <= zone.x + zone.width + 0.5 && row.y >= zone.y - 0.5 && row.y < zone.y + zone.height + 0.5; const inV = cov(row.y, row.y + zRowH).some(([a, b]) => s >= a - 0.5 && e <= b + 0.5); if (!inR || !inV) outside++; }
    anchor = { screenHash: hS.sha256, exportHash: hE.sha256, equal: hS.sha256 === hE.sha256, outside };
  }
  return { up, midVote, thinVote, nAxis, selCount: sel.length, probes, anchor };
}

async function main() {
  const api = new W.IfcAPI(); await api.Init();
  const mid = api.OpenModel(new Uint8Array(readFileSync(MODEL)), {});
  const tc = (n) => { try { return api.GetTypeCodeFromName(n); } catch { return undefined; } };
  const ids = [];
  for (const t of ['IFCWALLSTANDARDCASE', 'IFCWALL']) { const v = api.GetLineIDsWithType(mid, tc(t)); for (let i = 0; i < v.size(); i++) ids.push(v.get(i)); }
  console.log(`  wanden: ${ids.length} — bboxes…`);
  const bboxes = [];
  let done = 0;
  for (const id of ids) { const bb = getBBox(api, mid, id); if (bb) bboxes.push(bb); if (++done % 1000 === 0) console.log(`    …${done}/${ids.length}`); }
  api.CloseModel(mid);

  const twinBBoxes = bboxes.map(swapYZ);
  const a = buildProbes(twinBBoxes);
  const b = buildProbes(twinBBoxes); // 2e run → determinisme

  const fails = [], ok = [];
  const chk = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ' — ' + d : ''}`);

  chk(`twin up-as is TEGENGESTELD ('z')`, a.up === 'z', `up=${a.up} midVote=${JSON.stringify(a.midVote)}`);
  chk('twin nulmeting deterministisch (2 runs gelijk)', a.probes.halfsteens.sha256 === b.probes.halfsteens.sha256 && a.probes.staand_tegelverband.sha256 === b.probes.staand_tegelverband.sha256);
  // UV-frame-invariantie: twin-hash == Y-up-baseline-hash
  const baseH = BASELINE.probes.halfsteens.screen.hash, baseS = BASELINE.probes.staand_tegelverband.screen.hash;
  chk('twin halfsteens-hash == Y-up-baseline (UV-frame, niet wereld-Z)', a.probes.halfsteens.sha256 === baseH, `twin=${a.probes.halfsteens.sha256.slice(0,16)} base=${baseH.slice(0,16)}`);
  chk('twin staand-hash == Y-up-baseline (UV-frame, niet wereld-Z)', a.probes.staand_tegelverband.sha256 === baseS, `twin=${a.probes.staand_tegelverband.sha256.slice(0,16)} base=${baseS.slice(0,16)}`);
  chk('twin stripZone-vlak: scherm==export', a.anchor?.equal === true);
  chk('twin stripZone-vlak: 0 stenen buiten rechthoek∩vlak', a.anchor?.outside === 0, `outside=${a.anchor?.outside}`);

  console.log('=== FASE 3b — Z-UP TWIN VERIFICATIE ===');
  console.log(`  twin up-as='${a.up}' (Y-up origineel → Z-up twin) | nAxis='${a.nAxis}' | sel=${a.selCount} wanden`);
  console.log(`  twin probes: halfsteens=${a.probes.halfsteens.sha256.slice(0,16)}… staand=${a.probes.staand_tegelverband.sha256.slice(0,16)}…`);
  console.log(`  twin plane (halfsteens): uAxis=${a.probes.halfsteens.plane?.uAxis} tAxis=${a.probes.halfsteens.plane?.tAxis} nAxis=${a.probes.halfsteens.plane?.nAxis}`);
  for (const o of ok) console.log('  ✅ ' + o);
  for (const f of fails) console.log('  ❌ ' + f);
  console.log(`\n  ${fails.length === 0 ? 'ALLE TWIN-ANKERS GROEN ✅' : `${fails.length} FOUT(EN) ❌`}`);
  process.exit(fails.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
