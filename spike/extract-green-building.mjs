// READ-ONLY EXTRACTIE — spike/throwaway
// Haalt alle panelen (Board), steenstrips (Bricks) en latten (Slats) met afmetingen
// uit een ggGHifc (Geometry Gym) IFC2X3-model. Wijzigt NIETS aan de app.
//
// Model-structuur (geverifieerd):
//   IfcElementAssembly #36
//     -> IfcBuildingElementPart 'Board'  (panelen)
//     -> IfcMember              'Slats'  (latten)
//     -> IfcBuildingElementPart 'Bricks' (steenstrips)
//   Elk product -> ProductDefinitionShape -> ShapeRepresentation -> N x ExtrudedAreaSolid
//   Elke ExtrudedAreaSolid = RectangleProfileDef(XDim,YDim) geëxtrudeerd over Depth.
//   (150 stuks gebruiken ArbitraryClosedProfileDef = niet-rechthoekig -> bbox + vlag)

import fs from 'node:fs';
import path from 'node:path';

const IFC = process.argv[2];
const OUTDIR = process.argv[3] || '.';
if (!IFC) { console.error('usage: node extract-green-building.mjs <file.ifc> [outdir]'); process.exit(1); }

const text = fs.readFileSync(IFC, 'latin1');

// --- STEP-parser: alleen entiteiten die we nodig hebben ---
const WANT = new Set([
  'IFCEXTRUDEDAREASOLID', 'IFCRECTANGLEPROFILEDEF', 'IFCSHAPEREPRESENTATION',
  'IFCPRODUCTDEFINITIONSHAPE', 'IFCBUILDINGELEMENTPART', 'IFCMEMBER',
  'IFCELEMENTASSEMBLY', 'IFCARBITRARYCLOSEDPROFILEDEF', 'IFCPOLYLINE',
  'IFCCARTESIANPOINT', 'IFCRELDEFINESBYPROPERTIES', 'IFCPROPERTYSET',
  'IFCPROPERTYSINGLEVALUE',
]);
const ent = new Map(); // id -> {type, args}
{
  const lines = text.split(/\r?\n/);
  let buf = '';
  for (let raw of lines) {
    buf += (buf ? ' ' : '') + raw;
    if (!/;\s*$/.test(buf)) continue;
    const m = buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/);
    buf = '';
    if (!m) continue;
    const type = m[2].toUpperCase();
    if (!WANT.has(type)) continue;
    ent.set(+m[1], { type, args: m[3] });
  }
}

// split op top-level komma's (respecteer haakjes en 'quotes')
function splitTop(s) {
  const out = []; let d = 0, q = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === "'") q = false; continue; }
    if (c === "'") { q = true; cur += c; continue; }
    if (c === '(') { d++; cur += c; continue; }
    if (c === ')') { d--; cur += c; continue; }
    if (c === ',' && d === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
const ref = (s) => { const m = String(s).match(/#(\d+)/); return m ? +m[1] : null; };
const refs = (s) => [...String(s).matchAll(/#(\d+)/g)].map(x => +x[1]);
const unq = (s) => String(s).trim().replace(/^'/, '').replace(/'$/, '');
const r1 = (v) => Math.round(v * 10) / 10;

// dims van één ExtrudedAreaSolid -> {x,y,depth,shape}
function solidDims(id) {
  const e = ent.get(id); if (!e || e.type !== 'IFCEXTRUDEDAREASOLID') return null;
  const p = splitTop(e.args);
  const depth = parseFloat(p[3]);
  const prof = ent.get(ref(p[0]));
  if (!prof) return null;
  if (prof.type === 'IFCRECTANGLEPROFILEDEF') {
    const pp = splitTop(prof.args);
    return { x: parseFloat(pp[3]), y: parseFloat(pp[4]), depth, shape: 'rect' };
  }
  if (prof.type === 'IFCARBITRARYCLOSEDPROFILEDEF') {
    const pp = splitTop(prof.args);
    const pl = ent.get(ref(pp[pp.length - 1]));
    if (pl && pl.type === 'IFCPOLYLINE') {
      const pts = refs(pl.args).map(pid => {
        const cp = ent.get(pid); if (!cp) return null;
        const nums = splitTop(cp.args.replace(/^\(|\)$/g, '')).map(parseFloat);
        return nums;
      }).filter(Boolean);
      const xs = pts.map(v => v[0]), ys = pts.map(v => v[1]);
      return { x: r1(Math.max(...xs) - Math.min(...xs)), y: r1(Math.max(...ys) - Math.min(...ys)), depth, shape: 'poly' };
    }
  }
  return { x: NaN, y: NaN, depth, shape: 'onbekend' };
}

// producten met geometrie verzamelen
const CAT = { Board: 'panelen', Slats: 'latten', Bricks: 'steenstrips' };
const buckets = {}; // catnaam -> [{x,y,depth,shape, prodId}]
for (const [id, e] of ent) {
  if (e.type !== 'IFCBUILDINGELEMENTPART' && e.type !== 'IFCMEMBER') continue;
  const p = splitTop(e.args);
  const name = unq(p[2]);
  const reprId = ref(p[6]);
  if (!reprId) continue; // leeg product (geen geometrie)
  const cat = CAT[name] || `overig(${name})`;
  const pds = ent.get(reprId);
  if (!pds || pds.type !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
  const pdsP = splitTop(pds.args);
  const repIds = refs(pdsP[pdsP.length - 1]);
  const arr = (buckets[cat] ||= []);
  for (const rId of repIds) {
    const sr = ent.get(rId);
    if (!sr || sr.type !== 'IFCSHAPEREPRESENTATION') continue;
    const srP = splitTop(sr.args);
    for (const sid of refs(srP[3])) {
      const d = solidDims(sid);
      if (d) { d.prodId = id; d.solidId = sid; arr.push(d); }
    }
  }
}

// property (Merk) info
const merken = [];
for (const [, e] of ent) {
  if (e.type !== 'IFCPROPERTYSINGLEVALUE') continue;
  const p = splitTop(e.args);
  merken.push(`${unq(p[0])} = ${unq(p[2]).replace(/^IFCLABEL\(|\)$/g, '')}`);
}

// --- rapport + CSV ---
fs.mkdirSync(OUTDIR, { recursive: true });
const pad = (s, n) => String(s).padStart(n);
const nl = (v) => String(v).replace('.', ','); // NL-Excel decimaal
console.log('================ EXTRACTIE ================');
console.log('Bestand:', path.basename(IFC));
if (merken.length) console.log('Merk/property:', merken.join(' ; '));
console.log('');

// normaliseer elk item -> lengte (grootste vlakmaat) x breedte (kleinste) x dikte (extrusie-diepte)
function norm(d) {
  const L = r1(Math.max(d.x, d.y)), B = r1(Math.min(d.x, d.y)), D = r1(d.depth);
  return { L, B, D, shape: d.shape };
}

const summaryRows = [];
const comboAll = ['categorie;aantal;lengte_mm;breedte_mm;dikte_mm;vorm']; // gecombineerde uittrekstaat
for (const cat of ['panelen', 'steenstrips', 'latten', ...Object.keys(buckets).filter(c => !['panelen', 'steenstrips', 'latten'].includes(c))]) {
  const arr = buckets[cat];
  if (!arr || !arr.length) continue;

  // groepeer op lengte x breedte x dikte (gedraaide vlakken vallen samen; dikte blijft dikte)
  const groups = new Map();
  let areaMm2 = 0, lenMm = 0;
  for (const d of arr) {
    const n = norm(d);
    areaMm2 += n.L * n.B;
    lenMm += n.L;
    const key = `${n.L}|${n.B}|${n.D}|${n.shape}`;
    const g = groups.get(key) || { ...n, n: 0 };
    g.n++; groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.n - a.n);
  const polyN = arr.filter(d => d.shape === 'poly').length;
  const m2 = (areaMm2 / 1e6), lm = (lenMm / 1000);

  console.log(`===== ${cat.toUpperCase()} =====`);
  console.log(`  aantal stuks : ${arr.length}   |  unieke maten : ${sorted.length}${polyN ? `  |  niet-rechthoekig (bbox): ${polyN}` : ''}`);
  console.log(`  totaal vlak  : ${m2.toFixed(1)} m²   |  totale lengte : ${lm.toFixed(1)} m`);
  console.log(`  maten (lengte x breedte x dikte mm  -> aantal):`);
  for (const g of sorted.slice(0, 30)) {
    console.log(`    ${pad(g.L, 8)} x ${pad(g.B, 7)} x ${pad(g.D, 5)}  ->  ${pad(g.n, 6)}${g.shape === 'poly' ? '  [poly]' : ''}`);
  }
  if (sorted.length > 30) console.log(`    ... (+${sorted.length - 30} maten, zie CSV)`);
  console.log('');
  summaryRows.push([cat, arr.length, sorted.length, m2, lm]);

  // CSV per item (ruwe X/Y + genormaliseerd L/B/D)
  const perItem = ['solidId;productId;lengte_mm;breedte_mm;dikte_mm;X_mm;Y_mm;vorm']
    .concat(arr.map(d => { const n = norm(d); return [d.solidId, d.prodId, nl(n.L), nl(n.B), nl(n.D), nl(r1(d.x)), nl(r1(d.y)), d.shape].join(';'); }));
  fs.writeFileSync(path.join(OUTDIR, `${cat}-per-stuk.csv`), perItem.join('\r\n'), 'utf8');
  // CSV uittrekstaat (gegroepeerd, meest voorkomend eerst)
  const perGroup = ['aantal;lengte_mm;breedte_mm;dikte_mm;vorm']
    .concat(sorted.map(g => [g.n, nl(g.L), nl(g.B), nl(g.D), g.shape].join(';')));
  fs.writeFileSync(path.join(OUTDIR, `${cat}-uittrekstaat.csv`), perGroup.join('\r\n'), 'utf8');
  for (const g of sorted) comboAll.push([cat, g.n, nl(g.L), nl(g.B), nl(g.D), g.shape].join(';'));
}
fs.writeFileSync(path.join(OUTDIR, `uittrekstaat-totaal.csv`), comboAll.join('\r\n'), 'utf8');

console.log('================ TOTAAL ================');
for (const [c, n, u, m2, lm] of summaryRows)
  console.log(`  ${pad(c, 12)} : ${pad(n, 6)} stuks | ${pad(u, 4)} maten | ${pad(m2.toFixed(1), 8)} m² | ${pad(lm.toFixed(1), 9)} m`);
console.log('');
console.log('CSV-bestanden geschreven naar:', OUTDIR);
