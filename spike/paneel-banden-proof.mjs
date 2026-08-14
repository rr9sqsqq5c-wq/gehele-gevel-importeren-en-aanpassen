// PANEEL_BANDEN — bewijs dat met de vlag elke paneelrand op (voeg − 3mm zaagsnede) valt, de raam-banden op de
// coursing vol-breed doorlopen, en koppelstrippen heel blijven. Klant-maten: strip 221×51, lint=stoot=5,6, peil 62.
const _ls = { paneelOptimalisatie: '1', unifiedPanels: '1', paneelBanden: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const { buildGroupPanels, detectKoppelstrippen } = await import('../src/lib/panelization.js');

const mat = { steenL: 221, steenH: 51, lint: 5.6, stoot: 5.6, brickWeightM2: 34 };
const startLijn = 62;
const pitch = mat.steenL + mat.stoot;        // 226,6 (hele-steen-stootvoeg-steek)
const lagenmaat = mat.steenH + mat.lint;     // 56,6
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 };
const latten = { enabled: true, richting: 'horizontaal', breedte: 45, dikte: 28, maxInterval: 400 };

function panelsFor(gw, gh, openings) {
  const wall = { expressID: 1, length: gw, height: gh,
    wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, thicknessStart: 0, thicknessEnd: 100 }, openings: [] };
  const fd = buildFullGroupFacadePattern([wall], mat, 'halfsteens', null, null, startLijn, 0, 0, null, null, false);
  const rowYs = fd.rows.map((r) => r.y).sort((a, b) => a - b);
  const panels = buildGroupPanels({ groupWidth: fd.groupWidth, groupHeight: fd.groupHeight, groupOpenings: openings, rows: fd.rows, penanten: [], baseMat: mat, stripArt: null, panelen, latten, verband: 'halfsteens', sparingRects: [], startLijn, endExtensions: null }).panels;
  return { fd, rowYs, panels };
}

const onGridX = (x) => { const v = x + 3; const k = Math.round(v / pitch); return Math.abs(v - k * pitch) < 1.0; };  // x = k·pitch − 3
const near = (a, arr, tol = 0.6) => arr.some((r) => Math.abs(r - a) < tol);

// ── (1) GEEN raam: rechterranden op k·pitch−3, bovenranden op course−3 ──
{
  const { fd, rowYs, panels } = panelsFor(3200, 2500, []);
  const gw = fd.groupWidth, gh = fd.groupHeight;
  _ls.paneelBanden = '1';
  const { rowYs: rY, panels: ps } = panelsFor(3200, 2500, []);
  const rights = ps.map((p) => Math.round((p.x + p.width) * 10) / 10).filter((r) => r < gw - 0.5);
  const tops = ps.map((p) => Math.round((p.y + p.height) * 10) / 10).filter((t) => t < gh - 0.5);
  const rightsOK = rights.length && rights.every(onGridX);
  const topsOK = tops.length && tops.every((t) => near(t + 3, rY));
  console.log(`[1] geen raam (${ps.length} panelen): rechterranden op k·pitch−3 = ${rightsOK ? '🟢' : '🔴'} (bv ${rights.slice(0, 4).join(', ')}) · bovenranden op course−3 = ${topsOK ? '🟢' : '🔴'} (bv ${tops.slice(0, 4).join(', ')})`);
  globalThis.__t1 = rightsOK && topsOK;
}

// ── (2) 1 raam: banden op coursing, vol-breed doorgetrokken; koppelstrippen heel ──
{
  _ls.paneelBanden = '1';
  const opening = { x: 1100, y: 780, width: 600, height: 720 };   // dorpel 780, latei 1500
  const { fd, rowYs, panels } = panelsFor(3200, 2600, [opening]);
  const gw = fd.groupWidth;
  const S = [...rowYs].filter((c) => c <= opening.y + 0.5).pop();                     // course onder de dorpel
  const L = [...rowYs].filter((c) => c >= opening.y + opening.height - 0.5).shift();  // course boven de latei
  const belowTop = panels.filter((p) => Math.abs((p.y + p.height) - (S - 3)) < 1.2);  // toppen van de band-onder-raam
  const aboveBot = panels.filter((p) => Math.abs(p.y - L) < 1.2);                     // onderkanten band-boven-raam
  const cover = (ps) => ps.length ? { min: Math.min(...ps.map((p) => p.x)), max: Math.max(...ps.map((p) => p.x + p.width)) } : null;
  const cb = cover(belowTop), ca = cover(aboveBot);
  const belowFull = cb && cb.min < 5 && cb.max > gw - 5;      // band-onder-top loopt vol-breed door
  const aboveFull = ca && ca.min < 5 && ca.max > gw - 5;
  const kop = detectKoppelstrippen(panels, fd.rows, mat, 'halfsteens');
  console.log(`[2] 1 raam: S=${Math.round(S)}∈rows ${near(S, rowYs) ? '🟢' : '🔴'} · L=${Math.round(L)}∈rows ${near(L, rowYs) ? '🟢' : '🔴'}`);
  console.log(`    band-onder-raam top≈S−3=${Math.round(S - 3)} vol-breed(${cb ? Math.round(cb.min) + '..' + Math.round(cb.max) : '-'}/${Math.round(gw)}) ${belowFull ? '🟢' : '🔴'} · band-boven-raam onder≈L=${Math.round(L)} vol-breed(${ca ? Math.round(ca.min) + '..' + Math.round(ca.max) : '-'}) ${aboveFull ? '🟢' : '🔴'}`);
  console.log(`    koppelstrippen: ${kop.length} ${kop.length > 0 ? '🟢' : '🔴'}`);
  globalThis.__t2 = near(S, rowYs) && near(L, rowYs) && belowFull && aboveFull && kop.length > 0;
}

const ok = globalThis.__t1 && globalThis.__t2;
console.log(ok ? '\n🟢 BEWEZEN: paneelranden op (voeg−3); raam-banden op de coursing vol-breed; koppelstrippen heel.' : '\n🔴 FOUT — zie hierboven.');
process.exit(ok ? 0 : 1);
