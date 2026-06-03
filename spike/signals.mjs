// SPIKE — buiten/binnen uit Revit-signalen (niet uit vorm).
// Leest per wand: (1) Function-property, (2) NL-SfB classificatie (21=buiten,22=binnen),
// (3) Pset_WallCommon.IsExternal. Zowel op de instance als op het wandTYPE.
// Geen A/B-code. node signals.mjs <model.ifc> <out.json>
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const A_ROOT = resolve(__dirname, "../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A_ROOT + "/package.json"));
const WebIFC = require(resolve(A_ROOT, "node_modules/web-ifc/web-ifc-api-node.js"));

const [model, out] = process.argv.slice(2);
if (!model || !out) { console.error("usage: node signals.mjs <model.ifc> <out.json>"); process.exit(1); }

const api = new WebIFC.IfcAPI();
await api.Init();
const buf = readFileSync(model);
const mid = api.OpenModel(new Uint8Array(buf), {});
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;
const typeName = (eid)=>{ try{ const raw=api.GetRawLineData(mid,eid); return api.GetNameFromTypeCode(raw.type);}catch{return "?";} };

// ── props per object-id: {psetName, propName, value}[] ─────────────────────────
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
      const pn=String(val(p?.Name)??"");
      const pv=val(p?.NominalValue);
      if(pn) props.push({psetName,propName:pn,value:pv});
    }catch{} }
    for(const ro of (rel?.RelatedObjects??[])){ const id=val(ro); if(id==null)continue;
      if(!propsByObj.has(id))propsByObj.set(id,[]); propsByObj.get(id).push(...props);
    }
  }catch{} }
}

// ── classificatie per object-id: {code, name, source}[] ────────────────────────
const classByObj = new Map();
{
  const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESCLASSIFICATION);
  for (let i=0;i<rels.size();i++){ try{
    const rel=api.GetLine(mid,rels.get(i),false);
    const refId=val(rel?.RelatingClassification); if(refId==null)continue;
    const ref=api.GetLine(mid,refId,false);
    const code=String(val(ref?.Identification)??val(ref?.ItemReference)??"").trim();
    const cname=String(val(ref?.Name)??"").trim();
    let source=""; try{ const sId=val(ref?.ReferencedSource); if(sId!=null){const s=api.GetLine(mid,sId,false); source=String(val(s?.Name)??val(s?.Source)??"");} }catch{}
    const entry={code,name:cname,source};
    for(const ro of (rel?.RelatedObjects??[])){ const id=val(ro); if(id==null)continue;
      if(!classByObj.has(id))classByObj.set(id,[]); classByObj.get(id).push(entry);
    }
  }catch{} }
}

// ── type per object-id ─────────────────────────────────────────────────────────
const typeOfObj = new Map();
{
  const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELDEFINESBYTYPE);
  for (let i=0;i<rels.size();i++){ try{
    const rel=api.GetLine(mid,rels.get(i),false);
    const tId=val(rel?.RelatingType); if(tId==null)continue;
    const t=api.GetLine(mid,tId,false);
    const tName=String(val(t?.Name)??"");
    for(const ro of (rel?.RelatedObjects??[])){ const id=val(ro); if(id==null)continue;
      typeOfObj.set(id,{typeId:tId,typeName:tName});
    }
  }catch{} }
}

function nlsfbFrom(list){
  for(const c of (list??[])){
    const code=c.code||"";
    const m=code.match(/(^|[^0-9])(2[12])[\.\s,]/) || code.match(/^(2[12])/);
    if(m){ const two=(m[2]||m[1]); if(two==="21"||two==="22") return {code,two,name:c.name,source:c.source}; }
    // soms staat de code in de naam
    const nm=(c.name||"").match(/\b(2[12])[\.\s,]/); if(nm) return {code:c.name,two:nm[1],name:c.name,source:c.source};
  }
  return null;
}
function nlsfbFromTypeName(tn){
  if(!tn)return null; const m=tn.match(/\b(2[12])[\.\s]/); return m?{code:tn,two:m[1],name:tn,source:"typeName"}:null;
}
function findProp(list, re){
  for(const p of (list??[])) if(re.test(p.propName)) return p;
  return null;
}
function boolish(v){
  if(v===true||v===1)return true; if(v===false||v===0)return false;
  const s=String(v).toUpperCase(); if(s===".T."||s==="T"||s==="TRUE"||s==="YES")return true;
  if(s===".F."||s==="F"||s==="FALSE"||s==="NO")return false; return null;
}

const walls=[];
const present={function:0,nlsfb:0,isExternal:0,none:0};
let consistentPairs=0, conflictPairs=0;
for(const wType of [WebIFC.IFCWALLSTANDARDCASE, WebIFC.IFCWALL]){
  const ids=api.GetLineIDsWithType(mid,wType);
  for(let i=0;i<ids.size();i++){
    const eid=ids.get(i);
    let line; try{ line=api.GetLine(mid,eid,false);}catch{continue;}
    const name=String(val(line?.Name)??"");
    const typeInfo=typeOfObj.get(eid)||{};
    const instProps=propsByObj.get(eid)||[];
    const typeProps=typeInfo.typeId!=null?(propsByObj.get(typeInfo.typeId)||[]):[];
    const allProps=[...instProps,...typeProps];
    const instClass=classByObj.get(eid)||[];
    const typeClass=typeInfo.typeId!=null?(classByObj.get(typeInfo.typeId)||[]):[];

    // 1. Function
    const fnProp=findProp(allProps,/^function$/i)||findProp(allProps,/function/i);
    const functionVal = fnProp?String(val(fnProp.value)):null;
    const functionSays = functionVal==null?null:(/exter|buiten|1/i.test(functionVal)?"buiten":/inter|binnen|0/i.test(functionVal)?"binnen":null);

    // 2. NL-SfB
    const nl = nlsfbFrom(instClass)||nlsfbFrom(typeClass)||nlsfbFromTypeName(typeInfo.typeName)||nlsfbFromTypeName(name);
    const nlsfbSays = nl? (nl.two==="21"?"buiten":nl.two==="22"?"binnen":null) : null;

    // 3. IsExternal
    const extProp=findProp(allProps,/^isexternal$/i);
    const isExternal = extProp?boolish(val(extProp.value)):null;
    const isExtSays = isExternal==null?null:(isExternal?"buiten":"binnen");

    if(functionVal!=null)present.function++;
    if(nlsfbSays!=null)present.nlsfb++;
    if(isExternal!=null)present.isExternal++;
    if(functionVal==null&&nlsfbSays==null&&isExternal==null)present.none++;

    // consistentie tussen aanwezige signalen
    const sigs=[functionSays,nlsfbSays,isExtSays].filter(s=>s!=null);
    if(sigs.length>=2){ if(sigs.every(s=>s===sigs[0]))consistentPairs++; else conflictPairs++; }

    // prioriteit: Function > NL-SfB > IsExternal
    const verdict = functionSays ?? nlsfbSays ?? isExtSays ?? null;
    const verdictSource = functionSays?"Function": nlsfbSays?"NL-SfB": isExtSays?"IsExternal": "GEEN (vorm nodig)";

    walls.push({ expressId:eid, name, typeName:typeInfo.typeName??null,
      functionVal, functionSays, nlsfb: nl?{code:nl.code,two:nl.two,source:nl.source}:null, nlsfbSays,
      isExternal, isExtSays, verdict, verdictSource });
  }
}

const verdictDistrib={}; for(const w of walls){const k=w.verdict??"onbekend"; verdictDistrib[k]=(verdictDistrib[k]||0)+1;}
const sourceDistrib={}; for(const w of walls){sourceDistrib[w.verdictSource]=(sourceDistrib[w.verdictSource]||0)+1;}

writeFileSync(out, JSON.stringify({
  model:basename(model), wallCount:walls.length,
  signalsPresent:present,
  consistency:{ wallsWith2plusSignals:consistentPairs+conflictPairs, consistent:consistentPairs, conflict:conflictPairs },
  verdictDistrib, verdictSource:sourceDistrib, walls
}, null, 2));
api.CloseModel(mid);
console.log(`[signals] walls=${walls.length} present=${JSON.stringify(present)}`);
console.log(`[signals] consistency=${JSON.stringify({with2plus:consistentPairs+conflictPairs,consistent:consistentPairs,conflict:conflictPairs})}`);
console.log(`[signals] verdict=${JSON.stringify(verdictDistrib)} source=${JSON.stringify(sourceDistrib)}`);
