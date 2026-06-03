// SPIKE validate TASK A — buiten/binnen-signalen per wand, over meerdere modellen.
// NL-SfB (typenaam + classificatie), IsExternal, Function (alle psets).
// Geen A/B-code. node signals2.mjs <model.ifc> <out.json>
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const A_ROOT = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A_ROOT + "/package.json"));
const WebIFC = require(resolve(A_ROOT, "node_modules/web-ifc/web-ifc-api-node.js"));

const [model, out] = process.argv.slice(2);
if (!model || !out) { console.error("usage: node signals2.mjs <model.ifc> <out.json>"); process.exit(1); }

const api = new WebIFC.IfcAPI();
await api.Init();
const buf = readFileSync(model);
const mid = api.OpenModel(new Uint8Array(buf), {});
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;

// props per object
const propsByObj = new Map();
{
  const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELDEFINESBYPROPERTIES);
  for (let i=0;i<rels.size();i++){ try{
    const rel=api.GetLine(mid,rels.get(i),false);
    const psetId=val(rel?.RelatingPropertyDefinition); if(psetId==null)continue;
    const pset=api.GetLine(mid,psetId,false);
    if(!Array.isArray(pset?.HasProperties))continue;
    const psetName=String(val(pset?.Name)??"");
    const props=[];
    for(const pr of pset.HasProperties){ try{
      const p=api.GetLine(mid,val(pr),false);
      const pn=String(val(p?.Name)??""); if(!pn)continue;
      props.push({psetName,propName:pn,value:val(p?.NominalValue)});
    }catch{} }
    for(const ro of (rel?.RelatedObjects??[])){ const id=val(ro); if(id==null)continue;
      if(!propsByObj.has(id))propsByObj.set(id,[]); propsByObj.get(id).push(...props); }
  }catch{} }
}
// classificatie per object
const classByObj = new Map();
{
  const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESCLASSIFICATION);
  for (let i=0;i<rels.size();i++){ try{
    const rel=api.GetLine(mid,rels.get(i),false);
    const refId=val(rel?.RelatingClassification); if(refId==null)continue;
    const ref=api.GetLine(mid,refId,false);
    const code=String(val(ref?.Identification)??val(ref?.ItemReference)??"").trim();
    const cname=String(val(ref?.Name)??"").trim();
    for(const ro of (rel?.RelatedObjects??[])){ const id=val(ro); if(id==null)continue;
      if(!classByObj.has(id))classByObj.set(id,[]); classByObj.get(id).push({code,name:cname}); }
  }catch{} }
}
// type per object
const typeOfObj = new Map();
{
  const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELDEFINESBYTYPE);
  for (let i=0;i<rels.size();i++){ try{
    const rel=api.GetLine(mid,rels.get(i),false);
    const tId=val(rel?.RelatingType); if(tId==null)continue;
    const t=api.GetLine(mid,tId,false);
    const tName=String(val(t?.Name)??"");
    for(const ro of (rel?.RelatedObjects??[])){ const id=val(ro); if(id==null)continue;
      typeOfObj.set(id,{typeId:tId,typeName:tName}); }
  }catch{} }
}

// NL-SfB code uit een string (typenaam of classificatie): pak leidende cijfergroep
function codeFromStr(s){
  if(!s)return null;
  const m=String(s).replace(/^Basic Wall:\s*/i,"").match(/(\d{2}(?:\.\d{2,3})*)/);
  if(!m)return null; const code=m[1]; const two=code.slice(0,2);
  return {code,two};
}
function findProp(list, re){ for(const p of (list??[])) if(re.test(p.propName)) return p; return null; }
function boolish(v){ if(v===true||v===1)return true; if(v===false||v===0)return false;
  const s=String(v).toUpperCase(); if(["T",".T.","TRUE","YES"].includes(s))return true;
  if(["F",".F.","FALSE","NO"].includes(s))return false; return null; }

const walls=[];
const present={functionProp:0, nlsfbAny:0, nlsfbFromTypeName:0, nlsfbFromClass:0, isExternal:0, none:0};
const nlsfbTwoDistrib={}; let consistent=0, conflict=0, with2=0;
let nlsfb21_isExtFalse=0, nlsfb21_isExtTrue=0;

for(const wType of [WebIFC.IFCWALLSTANDARDCASE, WebIFC.IFCWALL]){
  const ids=api.GetLineIDsWithType(mid,wType);
  for(let i=0;i<ids.size();i++){
    const eid=ids.get(i); let line; try{line=api.GetLine(mid,eid,false);}catch{continue;}
    const name=String(val(line?.Name)??"");
    const ti=typeOfObj.get(eid)||{};
    const allProps=[...(propsByObj.get(eid)||[]),...(ti.typeId!=null?(propsByObj.get(ti.typeId)||[]):[])];
    const allClass=[...(classByObj.get(eid)||[]),...(ti.typeId!=null?(classByObj.get(ti.typeId)||[]):[])];

    // NL-SfB: voorkeur typenaam, anders classificatie
    const fromType = codeFromStr(ti.typeName);
    const fromClass = allClass.map(c=>codeFromStr(c.code)||codeFromStr(c.name)).find(Boolean)||null;
    const nl = fromType || fromClass;
    const nlsfbSays = nl? (nl.two==="21"?"buiten": nl.two==="22"?"binnen": "anders") : null;

    // Function (alle psets)
    const fnProp=findProp(allProps,/^function$/i)||findProp(allProps,/functie/i)||findProp(allProps,/function/i);
    const functionVal=fnProp?String(val(fnProp.value)):null;

    // IsExternal
    const extProp=findProp(allProps,/^isexternal$/i);
    const isExternal=extProp?boolish(val(extProp.value)):null;
    const isExtSays=isExternal==null?null:(isExternal?"buiten":"binnen");

    if(functionVal!=null)present.functionProp++;
    if(nl){present.nlsfbAny++; if(fromType)present.nlsfbFromTypeName++; if(!fromType&&fromClass)present.nlsfbFromClass++; nlsfbTwoDistrib[nl.two]=(nlsfbTwoDistrib[nl.two]||0)+1;}
    if(isExternal!=null)present.isExternal++;
    if(!nl&&functionVal==null&&isExternal==null)present.none++;

    // consistentie NL-SfB(21/22) vs IsExternal
    if((nlsfbSays==="buiten"||nlsfbSays==="binnen")&&isExtSays!=null){ with2++; if(nlsfbSays===isExtSays)consistent++; else conflict++;
      if(nl.two==="21"){ if(isExternal===false)nlsfb21_isExtFalse++; else if(isExternal===true)nlsfb21_isExtTrue++; } }

    walls.push({expressId:eid, name, typeName:ti.typeName??null,
      nlsfbCode:nl?nl.code:null, nlsfbTwo:nl?nl.two:null, nlsfbFrom: fromType?"typeName":(fromClass?"classification":null),
      nlsfbSays, functionVal, isExternal, isExtSays});
  }
}

const summary={ model:basename(model), wallCount:walls.length, present,
  everyWallHasNlsfb: present.nlsfbAny===walls.length, nlsfbTwoDistrib,
  consistency:{ with2plus:with2, consistent, conflict, conflictPct: with2?Math.round(conflict/with2*100):null },
  nlsfb21_vs_isExternal:{ code21_butIsExternalFALSE:nlsfb21_isExtFalse, code21_andIsExternalTRUE:nlsfb21_isExtTrue },
};
writeFileSync(out, JSON.stringify({...summary, walls}, null, 2));
api.CloseModel(mid);
console.log(`[signals2] ${summary.model} walls=${walls.length} nlsfbAny=${present.nlsfbAny} everyWall=${summary.everyWallHasNlsfb} two=${JSON.stringify(nlsfbTwoDistrib)} func=${present.functionProp} isExt=${present.isExternal} conflict=${conflict}/${with2} 21&IsExtFALSE=${nlsfb21_isExtFalse} 21&IsExtTRUE=${nlsfb21_isExtTrue}`);
