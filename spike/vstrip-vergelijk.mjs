// READ-ONLY DIAG (spike) — vergelijk 3 paneel-decomposities op koppelstrip-fase + mini-panelen.
//  A = huidige horizontale banden + oud panelize (vlag UIT)
//  B = huidige horizontale banden + optimaal panelize (vlag AAN)
//  C = VERTICALE stroken + optimaal panelize (voorstel)
let FLAG_ON = false;
globalThis.localStorage = { getItem: (k) => (k === 'paneelOptimalisatie' && FLAG_ON) ? '1' : null, setItem() {}, removeItem() {} };
import { buildFacadeZones, panelizeZone, computeEffectiveBasePanel, generateBattenPositions, detectKoppelstrippen } from '../src/lib/panelization.js';
import { buildFacePattern } from '../src/lib/pattern.js';

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, stripKg: 0.472, brickWeightM2: 34.6 };
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, gewichtM2: 11.8, maxKg: 50, verspringen: true };
const latten = { enabled: true, maxInterval: 400 };
const pitch = mat.steenL + mat.stoot;
const groupWidth = 9340, groupHeight = 2800;
const openings = [
  { x: 200,  y: 300, width: 1180, height: 1600 },
  { x: 1400, y: 300, width: 1140, height: 1600 },
  { x: 3600, y: 600, width: 1820, height: 2000 },
  { x: 6600, y: 700, width: 1140, height: 1500 },
].map((o, i) => ({ id: `op${i}`, ...o, polyPts: null }));

// VOORSTEL: verticale stroken — knip alleen op raam-x-randen; binnen een strook alleen op de ramen DIE die strook raken.
function buildVerticalStrips(W, H, ops, minStripW = 60) {
  const xset = new Set([0, W]);
  for (const o of ops) { xset.add(Math.max(0, Math.min(W, o.x))); xset.add(Math.max(0, Math.min(W, o.x + o.width))); }
  const xs = [...xset].sort((a, b) => a - b);
  const zones = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const xL = xs[i], xR = xs[i + 1], w = xR - xL;
    if (w <= 0.001) continue;
    const midX = (xL + xR) / 2;
    const opsIn = ops.filter((o) => o.x <= midX + 0.001 && o.x + o.width >= midX - 0.001);
    const yset = new Set([0, H]);
    for (const o of opsIn) { if (o.y > 0.001) yset.add(o.y); if (o.y + o.height < H - 0.001) yset.add(o.y + o.height); }
    const ys = [...yset].sort((a, b) => a - b);
    for (let j = 0; j < ys.length - 1; j++) {
      const yB = ys[j], yT = ys[j + 1], h = yT - yB;
      if (h <= 0.001) continue;
      const midY = (yB + yT) / 2;
      const covered = opsIn.some((o) => o.y <= midY + 0.001 && o.y + o.height >= midY - 0.001);
      if (!covered) { if (w < minStripW) continue; zones.push({ x: xL, y: yB, width: w, height: h }); }
    }
  }
  return zones.sort((a, b) => a.x - b.x || a.y - b.y).map((z, i) => ({ ...z, id: `Z${i + 1}`, kind: 'zone' }));
}

// VOORSTEL D: post-merge — voeg verticaal-gestapelde panelen in DEZELFDE kolom samen (P6+P7),
// mits ze raken, er geen raam tussen zit, en samen binnen hoogte- en gewichtsgrens blijven.
function postMergeStacks(panels, ops, mat, basePanel, kgM2, maxKg = 60) {
  const maxH = basePanel.maxHeight ?? basePanel.height ?? 1200;
  const key = (p) => `${Math.round(p.x)}_${Math.round(p.width)}`;
  const cols = new Map();
  for (const p of panels) { const k = key(p); if (!cols.has(k)) cols.set(k, []); cols.get(k).push({ ...p }); }
  const out = [];
  for (const [, ps] of cols) {
    ps.sort((a, b) => a.y - b.y);
    let cur = ps[0];
    for (let i = 1; i < ps.length; i++) {
      const nx = ps[i];
      const touch = Math.abs(nx.y - (cur.y + cur.height)) < 4;              // raken (±PANEL_GAP)
      const uH = (nx.y + nx.height) - cur.y;
      const uKg = (uH * cur.width * kgM2) / 1e6;
      const blocked = ops.some((o) => o.x < cur.x + cur.width - 1 && o.x + o.width > cur.x + 1 && o.y < nx.y - 0.5 && o.y + o.height > cur.y + cur.height + 0.5);
      if (touch && !blocked && uH <= maxH + 0.5 && uKg <= maxKg + 0.01) {
        cur = { ...cur, height: uH, area: cur.width * uH };
      } else { out.push(cur); cur = nx; }
    }
    out.push(cur);
  }
  return out;
}

function measure(name, flag, zoneFn, doMerge = false) {
  FLAG_ON = flag;
  const basePanel = computeEffectiveBasePanel(panelen, mat.brickWeightM2, mat);
  const battenYs = generateBattenPositions(groupHeight, mat, latten.maxInterval, { targetPanelH: panelen.hoogte, minPanelH: 800 });
  const zones = zoneFn();
  let panels = [];
  for (const zone of zones) { const res = panelizeZone(zone, battenYs, basePanel, null, mat, 'halfsteens'); if (res.ok) panels.push(...res.panels); }
  panels = panels.filter((p) => p.height >= 200 && p.width >= 10);
  if (doMerge) panels = postMergeStacks(panels, openings, mat, basePanel, (mat.brickWeightM2 ?? 40) + (panelen.gewichtM2 ?? 0));
  const rows = buildFacePattern(groupWidth, groupHeight, mat, 'halfsteens');
  const kop = detectKoppelstrippen(panels, rows, mat, 'halfsteens');
  const courses = [...new Set(rows.map((r) => Math.round(r.y)))].sort((a, b) => a - b);

  // every-row seams
  const seams = [...new Set(panels.map((p) => Math.round(p.x)))].filter((x) => x > 1 && x < groupWidth - 1).sort((a, b) => a - b);
  let elke = 0, omom = 0;
  for (const sx of seams) {
    const near = kop.filter((k) => k.x < sx - 0.5 && (k.x + k.width) > sx + 0.5);
    if (!near.length) continue;
    const adj = panels.filter((p) => Math.abs(p.x - sx) < 1 || Math.abs(p.x + p.width - sx) < 1);
    const yLo = Math.min(...adj.map((p) => p.y)), yHi = Math.max(...adj.map((p) => p.y + p.height));
    const ch = courses.filter((c) => c >= yLo - 0.5 && c + mat.steenH <= yHi + 0.5).length || courses.length;
    const pct = new Set(near.map((k) => Math.round(k.y))).size / ch;
    if (pct > 0.7) elke++; else omom++;
  }
  // mini-stacks: kolommen (x+breedte) met ≥2 panelen waarvan er één < 500mm hoog
  const byCol = new Map();
  for (const p of panels) { const k = `${Math.round(p.x)}_${Math.round(p.width)}`; if (!byCol.has(k)) byCol.set(k, []); byCol.get(k).push(p); }
  let miniStacks = 0, thin = 0;
  for (const [, ps] of byCol) if (ps.length >= 2 && ps.some((p) => p.height < 500)) miniStacks++;
  for (const p of panels) if (p.height < 400) thin++;
  const slivers = panels.filter((p) => p.width < 200).length;

  console.log(`${name.padEnd(34)} panelen=${String(panels.length).padStart(3)}  koppel=${String(kop.length).padStart(3)}  elke-rij-naden=${elke}  om-en-om-naden=${omom}  mini-stacks=${miniStacks}  <400mm-panelen=${thin}  slivers<200=${slivers}`);
  return { panels, kop };
}

console.log('');
measure('A huidig (banden, vlag UIT)', false, () => buildFacadeZones(groupWidth, groupHeight, openings));
measure('B banden + optimaal (vlag AAN)', true, () => buildFacadeZones(groupWidth, groupHeight, openings));
measure('C VERTICALE stroken + optimaal', true, () => buildVerticalStrips(groupWidth, groupHeight, openings));
measure('D banden + optimaal + POST-MERGE', true, () => buildFacadeZones(groupWidth, groupHeight, openings), true);
console.log('');
