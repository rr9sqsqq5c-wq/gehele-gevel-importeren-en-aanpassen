// READ-ONLY DIAGNOSE — is buildGroupPanels SPIEGEL-symmetrisch? (Groep 2 vs Groep 2-1 zouden spiegels moeten zijn)
// Test: gevel F met een off-center raam vs F' = de x-gespiegelde gevel. Zijn panels(F') == mirror(panels(F))?
// Zo NEE → twee gespiegelde gevels worden NIET vanzelf spiegel-panelen (links-verankerde bond/coursing/kerf).
async function run(flag) {
  const _ls = { paneelOptimalisatie: '1', unifiedPanels: '1', paneelBanden: flag };
  globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
  const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js?t=' + flag);
  const { buildGroupPanels } = await import('../src/lib/panelization.js?t=' + flag);

  const mat = { steenL: 221, steenH: 51, lint: 5.6, stoot: 5.6, brickWeightM2: 34 };
  const startLijn = 62, W = 3200, Hh = 2600;
  const panelen = { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 };
  const latten = { enabled: true, richting: 'horizontaal', breedte: 45, dikte: 28, maxInterval: 400 };
  const wall = () => ({ expressID: 1, length: W, height: Hh, wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, thicknessStart: 0, thicknessEnd: 100 }, openings: [] });

  function panels(op) {
    const fd = buildFullGroupFacadePattern([wall()], mat, 'halfsteens', null, null, startLijn, 0, 0, null, null, false);
    return buildGroupPanels({ groupWidth: fd.groupWidth, groupHeight: fd.groupHeight, groupOpenings: [op], rows: fd.rows, penanten: [], baseMat: mat, stripArt: null, panelen, latten, verband: 'halfsteens', sparingRects: [], startLijn, endExtensions: null }).panels;
  }
  const O = { x: 1100, y: 780, width: 600, height: 720 };
  const Om = { x: W - O.x - O.width, y: O.y, width: O.width, height: O.height };   // gespiegeld raam
  const F = panels(O);
  const Fm = panels(Om);

  // mirror F's panelen en zoek een match in Fm (op x/y/w/h, tol 1mm)
  const key = (p) => `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.width)},${Math.round(p.height)}`;
  const FmSet = new Set(Fm.map(key));
  const mir = (p) => ({ x: W - (p.x + p.width), y: p.y, width: p.width, height: p.height });
  const matched = F.filter((p) => FmSet.has(key(mir(p)))).length;
  const total = Math.max(F.length, Fm.length);
  const sym = matched === F.length && F.length === Fm.length;
  // voorbeeld van een niet-spiegelend paneel
  const bad = F.map(mir).find((m) => !FmSet.has(key(m)));
  return { flag: flag ? 'AAN' : 'UIT', nF: F.length, nFm: Fm.length, matched, sym, bad };
}

const off = await run(null);
const on = await run('1');
for (const r of [off, on]) {
  console.log(`paneelBanden ${r.flag}: F=${r.nF} panelen, F'=${r.nFm}, spiegel-match=${r.matched}/${r.nF} → ${r.sym ? '🟢 SPIEGELSYMMETRISCH' : '🔴 NIET SPIEGELSYMMETRISCH'}${r.bad ? ` (bv paneel ${JSON.stringify(r.bad)} heeft geen spiegel in F')` : ''}`);
}
console.log('\n→ Als NIET-symmetrisch: twee gespiegelde gevels (Groep 2 / 2-1) krijgen NIET vanzelf spiegel-panelen —');
console.log('  de bond/coursing/kolomnaad is links-verankerd (x=0) in BEIDE, dus de mal spiegelt niet mee.');
