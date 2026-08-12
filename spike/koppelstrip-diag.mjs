// READ-ONLY DIAG — waarom staan koppelstrippen in de werktekening NIET om-en-om?
// Reproduceert het werktekening-pad: panelen = buildZoneBackingPanels; strip-rijen = buildStripZoneRegions.
let FLAG_ON = false;
globalThis.localStorage = { getItem: (k) => (k === 'paneelOptimalisatie' && FLAG_ON) ? '1' : null, setItem() {}, removeItem() {} };
import { buildZoneBackingPanels, detectKoppelstrippen } from '../src/lib/panelization.js';
import { buildStripZoneRegions, solidifyRows } from '../src/lib/zoneRegions.js';
import { buildFacePattern } from '../src/lib/pattern.js';

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, stripKg: 0.472 };
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, gewichtM2: 11.8, maxKg: 50 };
const latten = { enabled: true, maxInterval: 400 };

function diag(naam, zone, openings) {
  const fd = { groupWidth: zone.x + zone.width + 300, groupHeight: zone.y + zone.height + 300, groupOpenings: openings };
  // strip-rijen zoals de werktekening ze maakt (buildStripZoneRegions, zone-anker doorlopend)
  const covBase = buildFacePattern(zone.width, zone.height, mat, 'halfsteens').map((r) => ({ y: r.y + zone.y, pieces: r.pieces.map((p) => ({ ...p, start: p.start + zone.x })) }));
  const cov = solidifyRows(covBase, mat.stoot + 2);
  const fdCov = { ...fd, coverageRows: cov, rows: [] };
  const regions = buildStripZoneRegions(fdCov, [zone], mat, 'geen', '#a64033', {});
  const rows = regions ? regions.flatMap((r) => r.rows ?? []) : covBase;
  const panels = buildZoneBackingPanels({ facadeData: fd, activeZones: [zone], panelen, latten, mat, verband: 'geen' });

  const kop = detectKoppelstrippen(panels, rows, mat, 'geen');
  // per interne kolom-naad: hoeveel courses hebben een koppelstrip? (alternerend = ~helft; elke rij = alle)
  const courses = [...new Set(rows.map((r) => Math.round(r.y)))].sort((a, b) => a - b);
  const edges = [...new Set(panels.map((p) => Math.round(p.x)))].filter((x) => x > zone.x + 1 && x < zone.x + zone.width - 1).sort((a, b) => a - b);
  const kopCourses = new Set(kop.map((k) => Math.round(k.y))).size;
  const gevelPct = Math.round((kopCourses / courses.length) * 100);
  // klassificeer: koppelstrip met HORIZONTALE component = de gedeelde panelen liggen op ≠ y (boven/onder-naad)
  const pById = new Map(panels.map((p) => [p.id, p]));
  // ECHTE horizontale snede = de steenrij loopt buiten de boven/onderrand van een paneel dat 'ie deelt.
  const stripH = mat.steenH;
  let horiz = 0;
  for (const k of kop) { if ((k.panelIds ?? []).some((id) => { const p = pById.get(id); return p && (k.y < p.y - 0.5 || k.y + stripH > p.y + p.height + 0.5); })) horiz++; }
  console.log(`\n■ ${naam} [vlag ${FLAG_ON ? 'AAN' : 'uit'}]: ${panels.length} panelen, ${kop.length} koppelstrippen, ${courses.length} courses`);
  console.log(`   HORIZONTALE-naad koppelstrippen: ${horiz} / ${kop.length}  ${horiz > 0 ? '✗ (mag niet — horizontaal snijd je in de lintvoeg)' : '✓ enkel verticaal'}`);
  console.log(`   GEVEL-BREED: koppelstrippen in ${kopCourses}/${courses.length} courses (${gevelPct}%) → ${gevelPct > 70 ? 'ELKE laag heeft koppelstrippen ✗ (openings breken de fase)' : 'om-en-om ✓'}`);
  const naadX = [...new Set(kop.map((k) => Math.round((k.x + k.x + k.width) / 2)))];  // hulp: fase-check
  for (const ex of edges) {
    const near = kop.filter((k) => k.x < ex - 0.5 && (k.x + k.width) > ex + 0.5);   // steen die de naad kruist
    const rowsHit = new Set(near.map((k) => Math.round(k.y))).size;
    const pct = Math.round((rowsHit / courses.length) * 100);
    console.log(`   naad x=${ex}: koppelstrip in ${rowsHit}/${courses.length} courses (${pct}%)  → ${pct > 70 ? 'ELKE RIJ ✗' : 'om-en-om ✓'}`);
  }
}

for (const flag of [false, true]) {
  FLAG_ON = flag;
  diag('zone 3000×2000 ZONDER opening', { id: 'a', x: 0, y: 0, width: 3000, height: 2000, verband: 'halfsteens', bondAnchor: 'zoneBottomLeft', enabled: true }, []);
  diag('zone 5000×2800 MET raam 1600–2400', { id: 'b', x: 0, y: 0, width: 5000, height: 2800, verband: 'halfsteens', bondAnchor: 'zoneBottomLeft', enabled: true }, [{ x: 1600, y: 600, width: 800, height: 1200, type: 'raam' }]);
}
