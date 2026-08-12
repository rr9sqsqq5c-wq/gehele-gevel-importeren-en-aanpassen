// READ-ONLY — repliceert de children-enumeratie van scanIfcSparingTypes (ifc.js) op een echt model:
// per IfcElementAssembly de directe onderdelen (IfcRelAggregates), gegroepeerd op Name. Toont of het
// 3e-niveau (unieke onderdelen) daadwerkelijk gevuld wordt — de basis van "sparen op unieke elementen".
import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const path = process.argv[2] || 'public/BIL-MOO-A-ZZ-PBP.ifc';
const bid = api.OpenModel(new Uint8Array(fs.readFileSync(path)));
console.log('MODEL:', path);

// _buildAggregatesMap: relatingObject → [relatedObject...]
const agg = new Map();
{ const v = api.GetLineIDsWithType(bid, wi.IFCRELAGGREGATES);
  for (let i=0;i<v.size();i++){ const r=api.GetLine(bid,v.get(i),false);
    const ro=r?.RelatingObject?.value; const rel=r?.RelatedObjects;
    if(ro==null||!rel)continue; const kids=(Array.isArray(rel)?rel:[rel]).map(o=>o?.value).filter(x=>x!=null);
    agg.set(ro,(agg.get(ro)||[]).concat(kids)); } }

const codeToName = {}; // bouw type-code → naam voor de onderdeel-badges (klein subset volstaat)
for (const nm of ['IFCBEAM','IFCPLATE','IFCMEMBER','IFCMECHANICALFASTENER','IFCFASTENER','IFCDISCRETEACCESSORY','IFCBUILDINGELEMENTPROXY','IFCELEMENTASSEMBLY']) {
  const c = wi[nm]; if (c!==undefined) codeToName[c]=nm; }

const asmVec = api.GetLineIDsWithType(bid, wi.IFCELEMENTASSEMBLY);
const n = asmVec.size();
console.log('IfcElementAssembly instances:', n);
// groepeer assemblies op Name; per naam de children-namen tellen (zoals scanIfcSparingTypes)
const byName = new Map(); // asmName → {count, children: Map(childName→count)}
for (let i=0;i<n;i++){ const eID=asmVec.get(i);
  let nm=null; try{ const v=api.GetLine(bid,eID,false)?.Name?.value; if(v!=null&&v!=='')nm=String(v);}catch{}
  const rec = byName.get(nm) ?? {count:0, children:new Map(), childTypes:new Map()};
  rec.count++;
  for (const kid of (agg.get(eID)||[])){ let cName=null,cType=null;
    try{ const cl=api.GetLine(bid,kid,false); const cv=cl?.Name?.value; if(cv!=null&&cv!=='')cName=String(cv); cType=codeToName[cl?.type]??('code'+cl?.type);}catch{}
    rec.children.set(cName,(rec.children.get(cName)||0)+1);
    rec.childTypes.set(cName, cType);
  }
  byName.set(nm, rec);
}
console.log('\n=== assemblies gegroepeerd op Name, met 3e-niveau onderdelen ===');
for (const [nm, rec] of [...byName.entries()].sort((a,b)=>b[1].count-a[1].count)) {
  const kids=[...rec.children.entries()].sort((a,b)=>b[1]-a[1]);
  console.log(`\nSAMENSTELLING "${nm ?? '<naamloos>'}"  ×${rec.count}`);
  if (!kids.length) { console.log('   ⚠️ GEEN onderdelen via IfcRelAggregates → geen 3e niveau → alleen hele samenstelling'); continue; }
  for (const [cn,cc] of kids) console.log(`   ⌊ ${cn ?? '<naamloos>'}  (${rec.childTypes.get(cn)})  ×${cc}`);
}
api.CloseModel(bid);
