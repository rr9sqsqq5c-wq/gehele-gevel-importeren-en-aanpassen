// Genereert een MINIMALE Grasshopper-achtige IFC (4 platen 2×2 + wat strips) in public/, om het
// browser-import-pad end-to-end te testen. Self-test met parseGhCladding.
import fs from 'node:fs';
import { parseGhCladding } from '../src/lib/ghCladding.js';
let id = 20; const L = [];
const emit = (s) => { const i = ++id; L.push(`#${i}= ${s};`); return i; };
const P = (...c) => emit(`IFCCARTESIANPOINT((${c.join(',')}))`);
const D = (...c) => emit(`IFCDIRECTION((${c.join(',')}))`);
// solid gericht op +Y, wereld-centrum (cx,0,cz), vlak w×h, dikte depth
function solid(cx, cz, w, h, depth) {
  const a3 = emit(`IFCAXIS2PLACEMENT3D(#${P(cx, 0, cz)},#${D(0, 1, 0)},#${D(1, 0, 0)})`);
  const a2 = emit(`IFCAXIS2PLACEMENT2D(#${P(0, 0)},$)`);
  const prof = emit(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${a2},${w},${h})`);
  return emit(`IFCEXTRUDEDAREASOLID(#${prof},#${a3},#${D(0, 0, 1)},${depth})`);
}
function product(name, solids) {
  const shp = emit(`IFCSHAPEREPRESENTATION(#1,'Body','SweptSolid',(${solids.map((s) => '#' + s).join(',')}))`);
  const pds = emit(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shp}))`);
  const pl = emit(`IFCLOCALPLACEMENT($,$)`);
  return emit(`IFCBUILDINGELEMENTPART('${name}0000000000000000000',#7,'${name}',$,$,#${pl},#${pds},$)`);
}
const boards = [[0, 565], [792, 565], [0, 1698], [792, 1698]].map(([cx, cz]) => solid(cx, cz, 789, 1130, 10));
product('Board', boards);
const strips = [];
for (const cz of [520, 576, 632, 1653, 1709, 1765]) for (const cx of [120, 341, 562]) strips.push(solid(cx, cz, 221, 51, 23));
product('Bricks', strips);
const ifc = `ISO-10303-21;\r\nHEADER;\r\nFILE_DESCRIPTION((''),'2;1');\r\nFILE_NAME('gh-fixture.ifc','2026-01-01T00:00:00',(''),(''),'','','');\r\nFILE_SCHEMA(('IFC2X3'));\r\nENDSEC;\r\nDATA;\r\n#7= IFCOWNERHISTORY($,$,$,.ADDED.,0,$,$,0);\r\n${L.join('\r\n')}\r\nENDSEC;\r\nEND-ISO-10303-21;\r\n`;
fs.writeFileSync('public/gh-fixture.ifc', ifc, 'latin1');
const res = parseGhCladding(ifc);
console.log('bytes', ifc.length, '| ok', res.ok, '| panelen', res.totalPanels, '| gevels', res.gevels.length, '| unassigned', res.unassigned);
console.log('gevels:', res.gevels.map((g) => `${g.letter}: ${g.panels.length} panelen, ${g.strips.length} strips [${g.panels.map((p) => p.num).join(' ')}]`).join(' | '));
