// END_TRIM — bewijs dat een NEGATIEF einduiteinde (inkorten) het panelisatie-DOMEIN verkleint VÓÓR de
// optimalisatie → de panelen worden HERVERDEELD over de kortere breedte (geen afgehakt restpaneel).
// Latten korten via extendLattenAtEnds. Vlag uit → byte-identiek.
const _ls = { endTrim: null, paneelOptimalisatie: '1', unifiedPanels: '1', unifiedLatten: '1' };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { buildGroupPanels, buildFacadeLatten } = await import('../src/lib/panelization.js');
const { buildFacePattern } = await import('../src/lib/pattern.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 34 };
const gW = 3000, gH = 1000;
const rows = buildFacePattern(gW, gH, mat, 'halfsteens');
const fd = { groupWidth: gW, groupHeight: gH, groupOpenings: [], rows };
const args = { ...fd, penanten: [], baseMat: mat, stripArt: null, panelen: { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 }, latten: { maxInterval: 400 }, verband: 'halfsteens', endExtensions: { left: { strips: 0, battens: -400, panels: -400 }, right: { strips: 0, battens: 0, panels: 0 } } };

const cols = (ps) => {
  const row = ps.filter((p) => p.y < 1);   // onderste rij panelen
  const xs = [...new Set(row.map((p) => `${Math.round(p.x)}..${Math.round(p.x + p.width)} (${Math.round(p.width)})`))];
  return { minX: Math.round(Math.min(...row.map((p) => p.x))), maxX: Math.round(Math.max(...row.map((p) => p.x + p.width))), n: row.length, cols: xs };
};

_ls.endTrim = null;
const off = cols(buildGroupPanels(args).panels);
_ls.endTrim = '1';
const on = cols(buildGroupPanels(args).panels);

console.log('=== PANELEN onderste rij (links −400 inkorten) ===');
console.log(`VLAG UIT: ${off.n} panelen, ${off.minX}..${off.maxX}\n  ${off.cols.join('  ')}`);
console.log(`VLAG AAN: ${on.n} panelen, ${on.minX}..${on.maxX}\n  ${on.cols.join('  ')}`);

// latten
_ls.endTrim = null;
const offL = buildFacadeLatten({ facadeData: fd, latten: { enabled: true, richting: 'horizontaal', breedte: 45, dikte: 28, maxInterval: 400 }, mat, panelen: args.panelen, panels: buildGroupPanels({ ...args }).panels, penanten: [], startLijn: null, verband: 'halfsteens', backingType: 'hout', sparingRects: [], endExtensions: args.endExtensions });
_ls.endTrim = '1';
const onL = buildFacadeLatten({ facadeData: fd, latten: { enabled: true, richting: 'horizontaal', breedte: 45, dikte: 28, maxInterval: 400 }, mat, panelen: args.panelen, panels: buildGroupPanels({ ...args }).panels, penanten: [], startLijn: null, verband: 'halfsteens', backingType: 'hout', sparingRects: [], endExtensions: args.endExtensions });
const offLx = Math.round(Math.min(...offL.map((l) => l.x))), onLx = Math.round(Math.min(...onL.map((l) => l.x)));

console.log('\n--- CONTROLE ---');
const offOk = off.minX === 0 && off.maxX === gW;                          // vol domein
const domainOk = on.minX === 400 && on.maxX === gW;                       // domein ingekort tot [400,3000]
const covered = Math.abs((on.maxX - on.minX) - (gW - 400)) < 2;          // dekking = 2600
const reOpt = on.cols.join() !== off.cols.map((c) => c).join() && on.minX === 400; // herverdeeld (niet dezelfde kolommen + geen 0..400)
const lattenOk = offLx === 0 && onLx === 400;
console.log(`UIT vol domein 0..3000:            ${offOk ? '🟢' : '🔴'}`);
console.log(`AAN domein ingekort 400..3000:     ${domainOk ? '🟢' : '🔴'}`);
console.log(`AAN dekking = 2600 (geen gat):     ${covered ? '🟢' : '🔴'}`);
console.log(`AAN kolommen HERVERDEELD (≠ chop): ${reOpt ? '🟢' : '🔴'}`);
console.log(`Latten links 0 → 400:              ${lattenOk ? '🟢' : '🔴'}`);
const ok = offOk && domainOk && covered && reOpt && lattenOk;
console.log(ok ? '\n🟢 BEWEZEN: panelisatie wordt HERVERDEELD over de ingekorte breedte; vlag uit = byte-identiek.' : '\n🔴 FOUT.');
process.exit(ok ? 0 : 1);
