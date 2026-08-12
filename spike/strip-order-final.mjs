// Eindberekening: Rood apart, Groen = GREEN-gevels + penanten samen (zelfde kleur).
// Best-fit zaagoptimalisatie + zaagschema per KLEUR. args: RED GREEN PENNANTS OUT
import fs from 'node:fs';
import path from 'node:path';
const [RED,GREEN,PEN,OUT]=process.argv.slice(2);
fs.mkdirSync(OUT,{recursive:true});
const WANT=new Set(['IFCEXTRUDEDAREASOLID','IFCRECTANGLEPROFILEDEF','IFCARBITRARYCLOSEDPROFILEDEF','IFCPOLYLINE','IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBUILDINGELEMENTPART','IFCCARTESIANPOINT']);
function splitTop(s){const o=[];let d=0,q=false,c='';for(let i=0;i<s.length;i++){const ch=s[i];if(q){c+=ch;if(ch==="'")q=false;continue;}if(ch==="'"){q=true;c+=ch;continue;}if(ch==='('){d++;c+=ch;continue;}if(ch===')'){d--;c+=ch;continue;}if(ch===','&&d===0){o.push(c);c='';continue;}c+=ch;}o.push(c);return o;}
const ref=s=>{const m=String(s).match(/#(\d+)/);return m?+m[1]:null;};
const refsOf=s=>[...String(s).matchAll(/#(\d+)/g)].map(x=>+x[1]);
const unq=s=>String(s).trim().replace(/^'/,'').replace(/'$/,'');
const STOCK=221,KERF=3,BIN=STOCK+KERF;
function lengthsOf(IFC){const text=fs.readFileSync(IFC,'latin1');const ent=new Map();{const lines=text.split(/\r?\n/);let buf='';for(const raw of lines){buf+=(buf?' ':'')+raw;if(!/;\s*$/.test(buf))continue;const m=buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/);buf='';if(!m)continue;const t=m[2].toUpperCase();if(!WANT.has(t))continue;ent.set(+m[1],{type:t,args:m[3]});}}
  const pt=id=>{const e=ent.get(id);if(!e)return[0,0];const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);return[n[0]||0,n[1]||0];};
  function prof(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);return[parseFloat(p[3]),parseFloat(p[4])];}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return[Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];}}return null;}
  const lens=[],afw=[];
  for(const [,e] of ent){if(e.type!=='IFCBUILDINGELEMENTPART')continue;const p=splitTop(e.args);if(unq(p[2])!=='Bricks')continue;const reprId=ref(p[6]);if(!reprId)continue;const pds=ent.get(reprId);if(!pds)continue;const pp=splitTop(pds.args);for(const rId of refsOf(pp[pp.length-1])){const sr=ent.get(rId);if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;const srP=splitTop(sr.args);for(const sid of refsOf(srP[3])){const se=ent.get(sid);if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;const sp=splitTop(se.args);const depth=parseFloat(sp[3]);const pr=prof(ref(sp[0]));if(!pr)continue;const[a,b]=pr;const h=Math.abs(a-51)<=Math.abs(b-51)?a:b;const len=(h===a)?b:a;if(Math.abs(h-51)<=4&&depth>=19&&depth<=27)lens.push(len);else afw.push(len);}}}
  return {lens,afw};}
function clusterLens(lens){const s=[...lens].sort((a,b)=>a-b);const clusters=[];let cur=[s[0]];for(let i=1;i<s.length;i++){if(s[i]-cur[cur.length-1]<=2)cur.push(s[i]);else{clusters.push(cur);cur=[];}cur.push(s[i]);}clusters.push(cur);const repOf=v=>{for(const c of clusters)if(v>=c[0]-1e-6&&v<=c[c.length-1]+1e-6)return Math.round(c[c.length-1]);return Math.round(v);};return lens.map(repOf);}
function pack(lens){const items=lens.map(l=>Math.round(l)).sort((a,b)=>b-a);const bins=[];const byRem=new Map();for(const len of items){const c=len+KERF;let r=-1;for(let x=c;x<=BIN;x++){const a=byRem.get(x);if(a&&a.length){r=x;break;}}if(r>=0){const idx=byRem.get(r).pop();const bn=bins[idx];bn.pieces.push(len);bn.rem=r-c;(byRem.get(bn.rem)||byRem.set(bn.rem,[]).get(bn.rem)).push(idx);}else{const idx=bins.length;bins.push({rem:BIN-c,pieces:[len]});(byRem.get(BIN-c)||byRem.set(BIN-c,[]).get(BIN-c)).push(idx);}}return bins;}
function fmtPattern(pieces){const h=new Map();for(const p of pieces)h.set(p,(h.get(p)||0)+1);return[...h.entries()].sort((a,b)=>b[0]-a[0]).map(([l,n])=>n>1?`${n}× ${l}`:`${l}`).join(' + ');}
function svgFor(label,arr,total){
  const S=2.3,STOCKPX=STOCK*S,rowH=32,mL=130,mR=80,mT=100;
  const wholeP=arr.find(p=>p.pieces.length===1&&p.pieces[0]>=STOCK-1);const wholeN=wholeP?wholeP.count:0;
  const cut=arr.filter(p=>p!==wholeP);
  const W=Math.round(mL+STOCKPX+mR),H=Math.round(mT+cut.length*rowH+40);
  let b=`<defs><pattern id="h" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#eee"/><line x1="0" y1="0" x2="0" y2="6" stroke="#c4c4c4" stroke-width="2"/></pattern></defs>`;
  b+=`<text x="${mL}" y="32" font-size="18" font-weight="bold">Zaagschema — ${label}</text>`;
  b+=`<text x="${mL}" y="52" font-size="11" fill="#555">Hele strip 221 mm · zaagsnede 3 mm · ${total} strippen, ${arr.length} patronen</text>`;
  b+=`<text x="${mL}" y="72" font-size="12.5" fill="#1a7f37" font-weight="bold">${wholeN} strippen: HEEL gebruiken (niet zagen)</text>`;
  b+=`<rect x="${mL}" y="82" width="13" height="11" fill="#cfe0f5" stroke="#33506e"/><text x="${mL+17}" y="91" font-size="10">strip (houden)</text>`;
  b+=`<rect x="${mL+108}" y="82" width="5" height="11" fill="#d64545"/><text x="${mL+117}" y="91" font-size="10">zaagsnede 3mm</text>`;
  b+=`<rect x="${mL+218}" y="82" width="13" height="11" fill="url(#h)"/><text x="${mL+235}" y="91" font-size="10">rest/afval</text>`;
  let y=mT;
  for(const p of cut){const yc=y+rowH/2;
    b+=`<text x="${mL-10}" y="${(yc+4).toFixed(1)}" font-size="11" text-anchor="end" font-weight="bold">${fmtPattern(p.pieces)}</text>`;
    let x=mL;
    for(let i=0;i<p.pieces.length;i++){const w=p.pieces[i]*S;b+=`<rect x="${x.toFixed(1)}" y="${y+6}" width="${w.toFixed(1)}" height="${rowH-13}" fill="#cfe0f5" stroke="#33506e" stroke-width="0.6"/>`;if(w>22)b+=`<text x="${(x+w/2).toFixed(1)}" y="${(yc+4).toFixed(1)}" font-size="10" text-anchor="middle">${p.pieces[i]}</text>`;x+=w;if(i<p.pieces.length-1){const kw=KERF*S;b+=`<rect x="${x.toFixed(1)}" y="${y+6}" width="${kw.toFixed(1)}" height="${rowH-13}" fill="#d64545"/>`;x+=kw;}}
    if(p.rest>0){const rw=p.rest*S;b+=`<rect x="${x.toFixed(1)}" y="${y+6}" width="${rw.toFixed(1)}" height="${rowH-13}" fill="url(#h)" stroke="#ccc" stroke-width="0.4"/>`;if(rw>24)b+=`<text x="${(x+rw/2).toFixed(1)}" y="${(yc+4).toFixed(1)}" font-size="8" text-anchor="middle" fill="#999">${p.rest}</text>`;}
    b+=`<rect x="${mL}" y="${y+6}" width="${STOCKPX.toFixed(1)}" height="${rowH-13}" fill="none" stroke="#333" stroke-width="0.9"/>`;
    b+=`<text x="${(mL+STOCKPX+8).toFixed(1)}" y="${(yc+4).toFixed(1)}" font-size="11" font-weight="bold">× ${p.count}</text>`;
    y+=rowH;}
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI,Arial"><rect width="${W}" height="${H}" fill="#fff"/>${b}</svg>`;
}
function schema(label,files){
  let lens=[],afw=0;for(const f of files){const r=lengthsOf(f);lens=lens.concat(r.lens);afw+=r.afw.length;}
  const rep=lens.map(l=>Math.round(l));const bins=pack(rep);
  const pat=new Map();for(const b of bins){const key=[...b.pieces].sort((a,b)=>b-a).join('+');const k=b.pieces.length;const sum=b.pieces.reduce((s,x)=>s+x,0);const rest=STOCK-sum-KERF*(k-1);const g=pat.get(key)||{pieces:[...b.pieces].sort((a,b)=>b-a),count:0,rest,k};g.count++;pat.set(key,g);}
  const arr=[...pat.values()].sort((a,b)=>b.count-a.count);
  const waste=arr.reduce((s,p)=>s+p.rest*p.count,0);
  console.log(`\n===== ${label} =====`);
  console.log(`  bronnen: ${files.map(f=>path.basename(f)).join(' + ')}`);
  console.log(`  ${rep.length} stukken -> ${bins.length} hele strippen | ${arr.length} patronen | afval ${(waste/1000).toFixed(1)} m (${(100*waste/(bins.length*STOCK)).toFixed(1)}%) | afwijkend ${afw}`);
  for(const p of arr.slice(0,14))console.log(`   ${fmtPattern(p.pieces).padEnd(30)} ${String(p.count).padStart(7)}   rest ${p.rest}mm`);
  if(arr.length>14)console.log(`   ... (+${arr.length-14}, zie CSV)`);
  const safe=label.replace(/[^A-Za-z0-9]+/g,'_');
  const csv=['patroon;stuks_per_strip;lengtes_mm;aantal_strippen;rest_mm'].concat(arr.map(p=>[fmtPattern(p.pieces),p.k,p.pieces.join(' '),p.count,p.rest].join(';')));
  fs.writeFileSync(path.join(OUT,safe+'-zaagschema.csv'),csv.join('\r\n'),'utf8');
  fs.writeFileSync(path.join(OUT,safe+'-zaagschema.svg'),svgFor(label,arr,bins.length),'utf8');
  return bins.length;
}
function count(files){let lens=[];for(const f of files)lens=lens.concat(lengthsOf(f).lens);return pack(lens.map(l=>Math.round(l))).length;}
console.log(`STOCK ${STOCK}mm, kerf ${KERF}mm (exacte lengtes, geen 2mm-samenvoeging)`);
const nRood=schema('Rood',[RED]);
const nGroen=schema('Groen (incl penanten)',[GREEN,PEN]);
const gAlone=count([GREEN]), pAlone=count([PEN]);
console.log(`\n================ BESTELLING ================`);
console.log(`  Rood : ${nRood} hele strippen`);
console.log(`  Groen (gevels + penanten samen): ${nGroen} hele strippen`);
console.log(`     -> apart zou zijn: groen ${gAlone} + penanten ${pAlone} = ${gAlone+pAlone}  |  bespaard door samen: ${gAlone+pAlone-nGroen}`);
console.log(`  TOTAAL te bestellen: ${nRood} rood + ${nGroen} groen = ${nRood+nGroen} hele strippen`);
