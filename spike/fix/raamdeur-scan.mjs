// READ-ONLY — bestaat er een wand met ZOWEL een IfcWindow als een IfcDoor (raam+deur op één wand)?
// Via IfcRelVoidsElement (wand→opening) + IfcRelFillsElement (opening→raam/deur).
import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));

// opening → fill-type (Window/Door)
const fillType = {}; // openingID → 'raam'|'deur'
const rf = api.GetLineIDsWithType(bid, wi.IFCRELFILLSELEMENT);
for (let i = 0; i < rf.size(); i++) {
  const r = api.GetLine(bid, rf.get(i), false);
  const opId = r?.RelatingOpeningElement?.value, beId = r?.RelatedBuildingElement?.value;
  if (!opId || !beId) continue;
  const be = api.GetLine(bid, beId, false);
  const t = api.GetLineType(bid, beId);
  fillType[opId] = (t === wi.IFCDOOR) ? 'deur' : (t === wi.IFCWINDOW) ? 'raam' : ('other:' + (be?.constructor?.name ?? t));
}

// wand → openingen
const rv = api.GetLineIDsWithType(bid, wi.IFCRELVOIDSELEMENT);
const wallOps = {}; // wallID → [type,...]
for (let i = 0; i < rv.size(); i++) {
  const r = api.GetLine(bid, rv.get(i), false);
  const wallId = r?.RelatingBuildingElement?.value, opId = r?.RelatedOpeningElement?.value;
  if (!wallId || !opId) continue;
  (wallOps[wallId] = wallOps[wallId] || []).push(fillType[opId] ?? 'leeg-void');
}

let raamEnDeur = 0, deurTotaal = 0, wandenMetDeur = [];
for (const [wallId, ops] of Object.entries(wallOps)) {
  const hasR = ops.includes('raam'), hasD = ops.includes('deur');
  if (hasD) { deurTotaal++; wandenMetDeur.push({ wall: wallId, ops }); }
  if (hasR && hasD) raamEnDeur++;
}
console.log('wanden met ≥1 opening:', Object.keys(wallOps).length);
console.log('wanden met een DEUR:', deurTotaal);
console.log('wanden met RAAM ÉN DEUR (het aangenomen concave-geval):', raamEnDeur);
console.log('\neerste 15 wanden met een deur:');
for (const w of wandenMetDeur.slice(0, 15)) console.log('  wand', w.wall, '→', w.ops.join(', '));
api.CloseModel(bid);
