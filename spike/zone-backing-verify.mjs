// READ-ONLY VERIFY — zone-scoped achterconstructie (panelen + latten volgen de tekenzones).
import { buildZoneBackingPanels, clipLattenToZones } from '../src/lib/panelization.js';

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 40 };
const facadeData = {
  groupWidth: 3000, groupHeight: 2000,
  groupOpenings: [{ x: 1000, y: 500, width: 600, height: 800, type: 'raam' }],
};
// Eén zone [200..1400] × [200..1700], overlapt de opening [1000..1600]×[500..1300] gedeeltelijk.
const activeZones = [{ id: 'z1', x: 200, y: 200, width: 1200, height: 1500, verband: 'halfsteens', enabled: true }];
const panelen = { enabled: true, breedte: 1200, hoogte: 1200, gewichtM2: 9.4 };
const latten = { enabled: true, maxInterval: 400, breedte: 50, richting: 'horizontaal' };

const Z = { x1: 200, y1: 200, x2: 1400, y2: 1700 };
const OP = { x1: 1000, y1: 500, x2: 1600, y2: 1300 };
let ok = true;
const fail = (m) => { ok = false; console.log('🔴 ' + m); };

const panels = buildZoneBackingPanels({ facadeData, activeZones, panelen, latten, mat, verband: 'geen' });
console.log(`panelen: ${panels.length}`);
if (!panels.length) fail('geen panelen gegenereerd');

let outside = 0, inOpening = 0;
for (const p of panels) {
  const px1 = p.x, py1 = p.y, px2 = p.x + p.width, py2 = p.y + p.height;
  if (px1 < Z.x1 - 0.5 || px2 > Z.x2 + 0.5 || py1 < Z.y1 - 0.5 || py2 > Z.y2 + 0.5) outside++;
  // overlap met opening-binnenkant (strikt) = fout
  const ox = Math.max(0, Math.min(px2, OP.x2) - Math.max(px1, OP.x1));
  const oy = Math.max(0, Math.min(py2, OP.y2) - Math.max(py1, OP.y1));
  if (ox > 1 && oy > 1) inOpening++;
}
if (outside === 0) console.log('🟢 alle panelen binnen de zone-rechthoek'); else fail(`${outside} panelen buiten de zone`);
if (inOpening === 0) console.log('🟢 geen paneel over de opening'); else fail(`${inOpening} panelen overlappen de opening`);

// PANEELVOEGEN OP COURSES — aparte HOGE zone zonder opening, zodat panelen intern gesplitst worden.
// courses op 100 + k·(50+12); elke INTERNE paneel-Y-rand (niet de zonerand 100/2700) moet op een course.
const tallZones = [{ id: 'zt', x: 0, y: 100, width: 1000, height: 2600, verband: 'halfsteens', bondAnchor: 'zoneBottomLeft', enabled: true }];
const tallFacade = { groupWidth: 1200, groupHeight: 3000, groupOpenings: [] };
const tallPanels = buildZoneBackingPanels({ facadeData: tallFacade, activeZones: tallZones, panelen, latten, mat, verband: 'geen' });
const lagenmaat = 50 + 12;
const onCourse = (y) => { const k = Math.round((y - 100) / lagenmaat); return Math.abs(100 + k * lagenmaat - y) < 2; };
let internalEdges = 0, offCourse = 0;
for (const p of tallPanels) {
  for (const edge of [p.y, p.y + p.height]) {
    if (Math.abs(edge - 100) < 1 || Math.abs(edge - 2700) < 1) continue;  // zonerand
    internalEdges++;
    if (!onCourse(edge)) { offCourse++; console.log('   off-course rand:', edge); }
  }
}
console.log(`hoge zone: ${tallPanels.length} panelen, ${internalEdges} interne Y-randen`);
if (internalEdges > 0 && offCourse === 0) console.log('🟢 alle interne paneelvoegen op een steenrij (course)');
else fail(`${offCourse}/${internalEdges} interne paneelvoegen NIET op een course`);

// Latten: volle-breedte banden op y=300 (in zone), y=1800 (buiten zone) → clip.
const rawLatten = [
  { id: 'a', richting: 'horizontaal', x: 0, y: 300, width: 3000, height: 50 },   // in zone-y
  { id: 'b', richting: 'horizontaal', x: 0, y: 1800, width: 3000, height: 50 },  // buiten zone-y → weg
];
const clipped = clipLattenToZones(rawLatten, activeZones);
console.log(`latten na clip: ${clipped.length}`);
const inZoneLat = clipped.filter((l) => l.x >= Z.x1 - 0.5 && l.x + l.width <= Z.x2 + 0.5 && l.y >= Z.y1 - 0.5 && l.y + l.height <= Z.y2 + 0.5);
if (clipped.length === 1 && inZoneLat.length === 1) console.log('🟢 lat in zone geklipt naar [200,1400], lat buiten zone verwijderd');
else fail(`lat-clip onverwacht: ${JSON.stringify(clipped.map((l) => ({ x: l.x, w: l.width, y: l.y })))}`);

console.log(ok ? '\n✅ ALLES GROEN' : '\n❌ ER ZIJN FOUTEN');
process.exit(ok ? 0 : 1);
