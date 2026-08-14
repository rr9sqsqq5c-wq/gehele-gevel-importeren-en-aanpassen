// PANEEL_STARTLIJN — starten de GROEP-brede panelen op de projectstart (positieve startlijn), net als de strips?
// Nu doet buildGroupPanels dat alleen bij startLijn<0. Met de vlag ook bij startLijn>0.
const _ls = { paneelOptimalisatie: '1', unifiedPanels: '1', paneelStartLijn: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { buildGroupPanels } = await import('../src/lib/panelization.js');
const { buildFacePattern } = await import('../src/lib/pattern.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 34 };
const rows = buildFacePattern(3000, 1000, mat, 'halfsteens');
const fd = { groupWidth: 3000, groupHeight: 1000, groupOpenings: [], rows };
const startLijn = 62;   // projectstart / peil (positief)

function minPanelY() {
  const panels = buildGroupPanels({ ...fd, penanten: [], baseMat: mat, stripArt: null, panelen: { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 }, latten: { maxInterval: 400 }, verband: 'halfsteens', startLijn }).panels;
  return Math.round(Math.min(...panels.map((p) => p.y)));
}

_ls.paneelStartLijn = null;
const off = minPanelY();
_ls.paneelStartLijn = '1';
const on = minPanelY();

console.log(`VLAG UIT: onderste paneel begint op y=${off}  (verwacht 0 = gevelonderkant)`);
console.log(`VLAG AAN: onderste paneel begint op y=${on}  (verwacht ${startLijn} = projectstart)`);
const ok = off === 0 && on === startLijn;
console.log(ok ? '\n🟢 BEWEZEN: met de vlag starten de groep-panelen op de projectstartlijn; vlag uit = byte-identiek (y=0).' : `\n🔴 FOUT (uit=${off}, aan=${on}).`);
process.exit(ok ? 0 : 1);
