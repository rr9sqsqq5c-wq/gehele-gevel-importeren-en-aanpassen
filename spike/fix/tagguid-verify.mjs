import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync("C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/Moos-Bilderdammerweg/BIL-SMS-L-ZZ-PBP.ifc")));
const types = ['IFCELEMENTASSEMBLY','IFCBEAM','IFCPLATE','IFCMECHANICALFASTENER','IFCCOLUMN'];
function run(FILT){ const hits=[];
  for (const tn of types){ const code=wi[tn]; if(code===undefined)continue; let vec; try{vec=api.GetLineIDsWithType(bid,code);}catch{continue;}
    for(let i=0;i<vec.size();i++){ const eID=vec.get(i); let tag=null,guid=null;
      try{const l=api.GetLine(bid,eID,false);const tv=l?.Tag?.value;if(tv!=null&&tv!=='')tag=String(tv);const gv=l?.GlobalId?.value;if(gv!=null&&gv!=='')guid=String(gv);}catch{}
      if(!FILT.has(tag)&&!FILT.has(guid))continue; hits.push(eID);
    } }
  return hits; }
const byTag = run(new Set(['5L5']));
const byGuid = run(new Set(['0$zSNfrhfDxPhNbPPOori0']));
console.log('Tag "5L5"  →', byTag.length, 'elementen (merk-groep)');
console.log('GUID       →', byGuid.length, 'element(en):', byGuid.join(','));
console.log(byGuid.length===1 && byGuid[0]===83565 ? '🟢 GUID = precies #83565 (de gevraagde ligger)' : '🔴');
api.CloseModel(bid);
