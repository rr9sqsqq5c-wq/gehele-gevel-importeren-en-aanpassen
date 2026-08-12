// Repliceert de TAG-FILTER van parseIfcSparingElements: doorzoek alle kandidaat-types, houd elementen
// met eigen Tag in de set. Verwacht: tag '5L5' → precies 1 element (#83565, de LIGGER-samenstelling).
import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync("C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/Moos-Bilderdammerweg/BIL-SMS-L-ZZ-PBP.ifc")));
const TAGS = new Set(['5L5']);
const types = ['IFCELEMENTASSEMBLY','IFCBEAM','IFCPLATE','IFCMECHANICALFASTENER','IFCCOLUMN'];
const hits = [];
for (const tn of types) { const code = wi[tn]; if (code===undefined) continue;
  let vec; try{vec=api.GetLineIDsWithType(bid,code);}catch{continue;}
  for (let i=0;i<vec.size();i++){ const eID=vec.get(i); let tag=null;
    try{ const l=api.GetLine(bid,eID,false); const tv=l?.Tag?.value; if(tv!=null&&tv!=='')tag=String(tv);}catch{}
    if (tag==null || !TAGS.has(tag)) continue;
    let name=null; try{name=String(api.GetLine(bid,eID,false)?.Name?.value??'');}catch{}
    hits.push({ expressID:eID, type:tn.replace(/^IFC/,''), name, tag });
  } }
console.log('tag-filter { "5L5" } →', hits.length, 'element(en):');
for (const h of hits) console.log('  #'+h.expressID, h.type, 'name='+h.name, 'tag='+h.tag);
console.log(hits.length===1 && hits[0].expressID===83565 ? '\n🟢 PRECIES 1 element = #83565 (de gevraagde ligger)' : '\n🔴 onverwacht');
api.CloseModel(bid);
