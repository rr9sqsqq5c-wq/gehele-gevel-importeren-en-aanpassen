// READ-ONLY DIAG — worden strippen HORIZONTAAL doorsneden door een paneelrand?
// Een strip wordt horizontaal geknipt als een steenrij [y, y+stripH] over een INTERNE paneel-boven/onderrand
// heen loopt (mag niet — dat kan alleen in een lintvoeg = tussen twee rijen). Meet dat per zone-paneel.
let FLAG_ON = false;
globalThis.localStorage = { getItem: (k) => (k === 'paneelOptimalisatie' && FLAG_ON) ? '1' : null, setItem() {}, removeItem() {} };
import { buildZoneBackingPanels } from '../src/lib/panelization.js';
import { buildStripZoneRegions, solidifyRows } from '../src/lib/zoneRegions.js';
import { buildFacePattern } from '../src/lib/pattern.js';

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, stripKg: 0.472 };
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, gewichtM2: 11.8, maxKg: 50 };
const stripH = mat.steenH;

function diag(naam, zone, openings, startLijn) {
  const fd = { groupWidth: zone.x + zone.width + 300, groupHeight: zone.y + zone.height + 300, groupOpenings: openings };
  const covBase = buildFacePattern(zone.width, zone.height, mat, 'halfsteens').map((r) => ({ y: r.y + zone.y, pieces: r.pieces.map((p) => ({ ...p, start: p.start + zone.x })) }));
  const cov = solidifyRows(covBase, mat.stoot + 2);
  const regions = buildStripZoneRegions({ ...fd, coverageRows: cov, rows: [] }, [zone], mat, 'geen', '#a64033', {});
  const rows = regions ? regions.flatMap((r) => r.rows ?? []) : covBase;
  const panels = buildZoneBackingPanels({ facadeData: fd, activeZones: [zone], panelen, latten: { enabled: true, maxInterval: 400 }, mat, verband: 'geen', startLijn });

  // interne horizontale paneelranden = een y die zowel boven- als onderrand van twee panelen is (zelfde x-overlap)
  const intern = [];
  for (const a of panels) for (const b of panels) {
    if (a === b) continue;
    if (Math.abs((a.y + a.height) - b.y) < 0.5 && a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1) intern.push(Math.round(b.y));
  }
  const internSet = [...new Set(intern)];
  // hoeveel steenrijen lopen over zo'n interne rand?
  let cut = 0;
  for (const B of internSet) for (const r of rows) { if (r.y < B - 0.5 && r.y + stripH > B + 0.5 && r.pieces.length) { cut++; break; } }
  console.log(`\n■ ${naam} [vlag ${FLAG_ON ? 'AAN' : 'uit'}]: ${panels.length} panelen, ${internSet.length} interne horizontale randen`);
  console.log(`   strippen horizontaal doorsneden op een interne rand: ${cut} ${cut > 0 ? '✗ (mag niet)' : '✓'}`);
  if (cut > 0) console.log(`   interne randen (y):`, internSet.slice(0, 12).join(', '));
}

for (const f of [false, true]) {
  FLAG_ON = f;
  diag('zone 2400×1600, geen opening, geen startlijn', { id: 'a', x: 0, y: 0, width: 2400, height: 1600, verband: 'halfsteens', bondAnchor: 'zoneBottomLeft', enabled: true }, [], null);
  diag('zone 2400×1600, startlijn -300', { id: 'b', x: 0, y: 0, width: 2400, height: 1600, verband: 'halfsteens', bondAnchor: 'zoneBottomLeft', enabled: true }, [], -300);
  diag('zone 5000×2800 met raam', { id: 'c', x: 0, y: 0, width: 5000, height: 2800, verband: 'halfsteens', bondAnchor: 'zoneBottomLeft', enabled: true }, [{ x: 1600, y: 600, width: 800, height: 1200, type: 'raam' }], null);
}
