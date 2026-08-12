// READ-ONLY spike: meet herhaling/modulariteit in een IFC (STEP-tekst).
// Doel: is geometrie-hergebruik (IfcMappedItem->RepresentationMap) en type-hergebruik
// (IfcWallType via IfcRelDefinesByType) GECONCENTREERD (weinig def, vaak herbruikt = modulair)
// of vlak? Puur tekstscan, geen web-ifc. Niets wijzigen.
//
// Gebruik: node spike/diagnose/modulair-census.mjs <pad-naar.ifc>

import fs from 'node:fs';

const file = process.argv[2] || 'public/BIL-MOO-A-ZZ-PBP.ifc';
const txt = fs.readFileSync(file, 'utf8');
console.log(`# Modulariteit-census: ${file} (${(txt.length / 1e6).toFixed(1)} MB)\n`);

// --- 1) IfcMappedItem -> MappingSource (RepresentationMap) concentratie ---
const mapUse = new Map(); // repMapId -> count
let mappedTotal = 0;
for (const m of txt.matchAll(/=IFCMAPPEDITEM\((#\d+)/g)) {
  const src = m[1];
  mapUse.set(src, (mapUse.get(src) || 0) + 1);
  mappedTotal++;
}
const mapCounts = [...mapUse.values()].sort((a, b) => b - a);
const reusedMaps = mapCounts.filter((c) => c >= 2).length;
const reusedUses = mapCounts.filter((c) => c >= 2).reduce((s, c) => s + c, 0);
console.log('## Geometrie-hergebruik (IfcMappedItem -> RepresentationMap)');
console.log(`  mapped items:        ${mappedTotal}`);
console.log(`  distinct rep-maps:   ${mapUse.size}`);
console.log(`  maps herbruikt >=2x: ${reusedMaps}  (dekken ${reusedUses} van ${mappedTotal} mapped items)`);
console.log(`  top hergebruik-tellingen: ${mapCounts.slice(0, 15).join(', ')}`);
console.log('');

// --- 2) IfcWallType: naam + hoeveel wanden per type (via IfcRelDefinesByType) ---
// walltype id -> naam
const wallTypeName = new Map();
for (const m of txt.matchAll(/#(\d+)=IFCWALLTYPE\('[^']*',#\d+,'([^']*)'/g)) {
  wallTypeName.set('#' + m[1], m[2]);
}
// type id -> aantal leden (som over alle RelDefinesByType die naar dat type wijzen)
const typeMembers = new Map();
for (const m of txt.matchAll(/=IFCRELDEFINESBYTYPE\([^)]*?\(([^)]*)\),(#\d+)\)/g)) {
  const members = (m[1].match(/#\d+/g) || []).length;
  const typeId = m[2];
  typeMembers.set(typeId, (typeMembers.get(typeId) || 0) + members);
}
// alleen wandtypes
const wallTypeRows = [...wallTypeName.keys()]
  .map((id) => ({ id, name: wallTypeName.get(id), n: typeMembers.get(id) || 0 }))
  .sort((a, b) => b.n - a.n);
const totalWallTypeMembers = wallTypeRows.reduce((s, r) => s + r.n, 0);
console.log('## Type-hergebruik (IfcWallType, wanden per type)');
console.log(`  distinct IfcWallType:      ${wallTypeName.size}`);
console.log(`  wanden gekoppeld aan type:  ${totalWallTypeMembers}`);
console.log('  top 15 wandtypes (wanden | naam):');
for (const r of wallTypeRows.slice(0, 15)) {
  console.log(`    ${String(r.n).padStart(5)}  ${r.name}`);
}
console.log('');

// --- 3) IfcElementAssembly: naam + predefined type (units?) ---
console.log('## IfcElementAssembly (mogelijke units)');
let asmN = 0;
const asmNames = new Map();
for (const m of txt.matchAll(/#(\d+)=IFCELEMENTASSEMBLY\('[^']*',#\d+,'([^']*)'[^;]*/g)) {
  asmN++;
  const name = m[2] || '(leeg)';
  // strip eventuele trailing volgnummers om te bucketen op "soort"
  const kind = name.replace(/\s*\d+\s*$/, '').trim() || name;
  asmNames.set(kind, (asmNames.get(kind) || 0) + 1);
}
console.log(`  totaal: ${asmN}`);
for (const [k, v] of [...asmNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`    ${String(v).padStart(4)}  ${k}`);
}
