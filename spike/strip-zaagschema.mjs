// Zaagschema: aggregeer de best-fit zaagoptimalisatie tot zaagPATRONEN (welke stukken
// samen uit 1 strip van 221mm), met aantal strippen per patroon. Per bestand/kleur.
import fs from 'node:fs';
import path from 'node:path';
const FILES=process.argv.slice(2,-1); const OUT=process.argv[process.argv.length-1];
fs.mkdirSync(OUT,{recursive:true});
const WANT=new Set(['IFCEXTRUDEDAREASOLID','IFCRECTANGLEPROFILEDEF','IFCARBITRARYCLOSEDPROFILEDEF','IFCPOLYLINE','IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBUILDINGELEMENTPART','IFCCARTESIANPOINT']);
function splitTop(s){const o=[];let d=0,q=false,c='';for(let i=0;i<s.length;i++){const ch=s[i];if(q){c+=ch;if(ch==="'")q=false;continue;}if(ch==="'"){q=true;c+=ch;continue;}if(ch==='('){d++;c+=ch;continue;}if(ch===')'){d--;c+=ch;continue;}if(ch===','&&d===0){o.push(c);c='';continue;}c+=ch;}o.push(c);return o;}
const ref=s=>{const m=String(s).match(/#(\d+)/);return m?+m[1]:null;};
const refsOf=s=>[...String(s).matchAll(/#(\d+)/g)].map(x=>+x[1]);
const unq=s=>String(s).trim().replace(/^'/,'').replace(/'$/,'');
const STOCK=221, KERF=3, BIN=STOCK+KERF;
function lengthsOf(IFC){
  const text=fs.readFileSync(IFC,'latin1');const ent=new Map();{const lines=text.split(/\r?\n/);let buf='';for(const raw of lines){buf+=(buf?' ':'')+raw;if(!/;\s*$/.test(buf))continue;const m=buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/);buf='';if(!m)continue;const t=m[2].toUpperCase();if(!WANT.has(t))continue;ent.set(+m[1],{type:t,args:m[3]});}}
  const pt=id=>{const e=ent.get(id);if(!e)return[0,0];const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);return[n[0]||0,n[1]||0];};
  function prof(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);return[parseFloat(p[3]),parseFloat(p[4])];}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return[Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];}}return null;}
  const lens=[],afw=[];
  for(const [,e] of ent){if(e.type!=='IFCBUILDINGELEMENTPART')continue;const p=splitTop(e.args);if(unq(p[2])!=='Bricks')continue;const reprId=ref(p[6]);if(!reprId)continue;const pds=ent.get(reprId);if(!pds)continue;const pp=splitTop(pds.args);for(const rId of refsOf(pp[pp.length-1])){const sr=ent.get(rId);if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;const srP=splitTop(sr.args);for(const sid of refsOf(srP[3])){const se=ent.get(sid);if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;const sp=splitTop(se.args);const depth=parseFloat(sp[3]);const pr=prof(ref(sp[0]));if(!pr)continue;const[a,b]=pr;const h=Math.abs(a-51)<=Math.abs(b-51)?a:b;const len=(h===a)?b:a;if(Math.abs(h-51)<=4&&depth>=19&&depth<=27)lens.push(len);else afw.push(len);}}}
  return {lens,afw};
}
function clusterLens(lens){const s=[...lens].sort((a,b)=>a-b);const clusters=[];let cur=[s[0]];for(let i=1;i<s.length;i++){if(s[i]-cur[cur.length-1]<=2)cur.push(s[i]);else{clusters.push(cur);cur=[];}cur.push(s[i]);}clusters.push(cur);const repOf=v=>{for(const c of clusters)if(v>=c[0]-1e-6&&v<=c[c.length-1]+1e-6)return Math.round(c[c.length-1]);return Math.round(v);};return lens.map(repOf);}
// best-fit met bin-tracking
function pack(lens){const items=lens.map(l=>Math.round(l)).sort((a,b)=>b-a);const bins=[];const byRem=new Map();for(const len of items){const c=len+KERF;let r=-1;for(let x=c;x<=BIN;x++){const a=byRem.get(x);if(a&&a.length){r=x;break;}}if(r>=0){const idx=byRem.get(r).pop();const bn=bins[idx];bn.pieces.push(len);bn.rem=r-c;(byRem.get(bn.rem)||byRem.set(bn.rem,[]).get(bn.rem)).push(idx);}else{const idx=bins.length;bins.push({rem:BIN-c,pieces:[len]});(byRem.get(BIN-c)||byRem.set(BIN-c,[]).get(BIN-c)).push(idx);}}return bins;}
function fmtPattern(pieces){const h=new Map();for(const p of pieces)h.set(p,(h.get(p)||0)+1);return [...h.entries()].sort((a,b)=>b[0]-a[0]).map(([l,n])=>n>1?`${n}× ${l}`:`${l}`).join(' + ');}

for(const f of FILES){
  const {lens,afw}=lengthsOf(f);const rep=clusterLens(lens);const bins=pack(rep);
  // aggregeer patronen
  const pat=new Map();
  for(const b of bins){const key=[...b.pieces].sort((a,b)=>b-a).join('+');const k=b.pieces.length;const sum=b.pieces.reduce((s,x)=>s+x,0);const rest=STOCK-sum-KERF*(k-1);const g=pat.get(key)||{pieces:[...b.pieces].sort((a,b)=>b-a),count:0,rest,k};g.count++;pat.set(key,g);}
  const arr=[...pat.values()].sort((a,b)=>b.count-a.count);
  const totStrips=bins.length;const totPieces=rep.length;const totWaste=arr.reduce((s,p)=>s+p.rest*p.count,0);
  const base=path.basename(f).replace(/\.ifc$/i,'');
  console.log(`\n===== ${base} =====`);
  console.log(`  ${totPieces} stukken -> ${totStrips} hele strippen | ${arr.length} zaagpatronen | afval ${(totWaste/1000).toFixed(1)} m (${(100*totWaste/(totStrips*STOCK)).toFixed(1)}%)`);
  console.log(`  patroon                              strippen   rest/strip`);
  for(const p of arr.slice(0,18)){console.log(`   ${fmtPattern(p.pieces).padEnd(34)} ${String(p.count).padStart(7)}   ${p.rest} mm`);}
  if(arr.length>18)console.log(`   ... (+${arr.length-18} patronen, alle in CSV)`);
  // CSV
  const csv=['patroon;aantal_stukken_in_strip;stuklengtes_mm;aantal_strippen;rest_mm']
    .concat(arr.map(p=>[fmtPattern(p.pieces),p.k,p.pieces.join(' '),p.count,p.rest].join(';')));
  fs.writeFileSync(path.join(OUT,base+'-zaagschema.csv'),csv.join('\r\n'),'utf8');
  if(afw.length)console.log(`  (${afw.length} afwijkende stukjes buiten beschouwing)`);
}
console.log(`\nCSV-zaagschema's geschreven naar: ${OUT}`);
