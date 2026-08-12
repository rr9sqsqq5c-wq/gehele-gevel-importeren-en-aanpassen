// Zaagoptimalisatie: hoeveel HELE strippen (221mm) bestellen?
// Model: stuk verbruikt (lengte+3mm) kerf; hele strip = 224mm (=221+3). Best-Fit-Decreasing.
// Standaardstrip = hoogte ~51mm, dikte ~23mm. Lengtes binnen 2mm = 1 maat.
import fs from 'node:fs';
import path from 'node:path';
const FILES=process.argv.slice(2);
const WANT=new Set(['IFCEXTRUDEDAREASOLID','IFCRECTANGLEPROFILEDEF','IFCARBITRARYCLOSEDPROFILEDEF','IFCPOLYLINE','IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBUILDINGELEMENTPART','IFCCARTESIANPOINT']);
function splitTop(s){const o=[];let d=0,q=false,c='';for(let i=0;i<s.length;i++){const ch=s[i];if(q){c+=ch;if(ch==="'")q=false;continue;}if(ch==="'"){q=true;c+=ch;continue;}if(ch==='('){d++;c+=ch;continue;}if(ch===')'){d--;c+=ch;continue;}if(ch===','&&d===0){o.push(c);c='';continue;}c+=ch;}o.push(c);return o;}
const ref=s=>{const m=String(s).match(/#(\d+)/);return m?+m[1]:null;};
const refsOf=s=>[...String(s).matchAll(/#(\d+)/g)].map(x=>+x[1]);
const unq=s=>String(s).trim().replace(/^'/,'').replace(/'$/,'');
const STOCK=221, KERF=3, BIN=STOCK+KERF; // 224

function strengthsOf(IFC){
  const text=fs.readFileSync(IFC,'latin1');
  const ent=new Map();{const lines=text.split(/\r?\n/);let buf='';for(const raw of lines){buf+=(buf?' ':'')+raw;if(!/;\s*$/.test(buf))continue;const m=buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/);buf='';if(!m)continue;const t=m[2].toUpperCase();if(!WANT.has(t))continue;ent.set(+m[1],{type:t,args:m[3]});}}
  const pt=id=>{const e=ent.get(id);if(!e)return[0,0];const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);return[n[0]||0,n[1]||0];};
  function prof(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);return[parseFloat(p[3]),parseFloat(p[4])];}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return[Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];}}return null;}
  const lens=[]; const afwijkend=[];
  for(const [,e] of ent){if(e.type!=='IFCBUILDINGELEMENTPART')continue;const p=splitTop(e.args);if(unq(p[2])!=='Bricks')continue;const reprId=ref(p[6]);if(!reprId)continue;const pds=ent.get(reprId);if(!pds)continue;const pp=splitTop(pds.args);for(const rId of refsOf(pp[pp.length-1])){const sr=ent.get(rId);if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;const srP=splitTop(sr.args);for(const sid of refsOf(srP[3])){const se=ent.get(sid);if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;const sp=splitTop(se.args);const depth=parseFloat(sp[3]);const pr=prof(ref(sp[0]));if(!pr)continue;
    // hoogte = maat dichtst bij 51; lengte = de andere
    const [a,b]=pr; const h=Math.abs(a-51)<=Math.abs(b-51)?a:b; const len=(h===a)?b:a;
    if(Math.abs(h-51)<=4 && depth>=19 && depth<=27) lens.push(len); else afwijkend.push({len,h,depth});
  }}}
  return {lens,afwijkend};
}

// cluster lengtes binnen 2mm -> representatief (max, veilig)
function clusterLens(lens){const s=[...lens].sort((a,b)=>a-b);const rep=[];let grpStart=s[0],grpMax=s[0],out=[];const map=[];
  // bepaal clusters
  const clusters=[];let cur=[s[0]];for(let i=1;i<s.length;i++){if(s[i]-cur[cur.length-1]<=2)cur.push(s[i]);else{clusters.push(cur);cur=[];}cur.push(s[i]);}clusters.push(cur);
  const repOf=v=>{for(const c of clusters)if(v>=c[0]-1e-6&&v<=c[c.length-1]+1e-6)return Math.round(c[c.length-1]);return Math.round(v);};
  return lens.map(repOf);
}

// Best-Fit-Decreasing: items = lengte+3 (mm, int), bin = 224
function bfd(lens){
  const items=lens.map(l=>Math.round(l)+KERF).sort((a,b)=>b-a);
  const over=items.filter(s=>s>BIN).length;
  const buckets=new Array(BIN+1).fill(0); let bins=0, used=0;
  for(const s of items){if(s>BIN){bins++;continue;} used+=s; let r=-1;for(let x=s;x<=BIN;x++){if(buckets[x]>0){r=x;break;}} if(r>=0){buckets[r]--;buckets[r-s]++;}else{bins++;buckets[BIN-s]++;}}
  const lower=Math.ceil(used/BIN);
  return {bins,over,lower};
}
function naive(lens){const h=new Map();for(const l of lens){const k=Math.round(l);h.set(k,(h.get(k)||0)+1);}let tot=0;for(const [len,cnt] of h){const per=Math.max(1,Math.floor(BIN/(len+KERF)));tot+=Math.ceil(cnt/per);}return tot;}

console.log(`STOCK=${STOCK}mm  KERF=${KERF}mm  (stuk verbruikt lengte+${KERF}; hele strip=${BIN})\n`);
let grandBins=0;
for(const f of FILES){
  const {lens,afwijkend}=strengthsOf(f);
  const rep=clusterLens(lens);
  const whole=rep.filter(l=>l>=STOCK-1).length;
  const short=rep.filter(l=>l<STOCK-1);
  const r=bfd(rep); const nv=naive(rep);
  const maxLen=Math.max(...lens);
  console.log(`===== ${path.basename(f)} =====`);
  console.log(`  standaard strippen: ${lens.length} (max lengte ${maxLen.toFixed(1)}mm) | afwijkend (geen 51-hoog/23-dik): ${afwijkend.length}`);
  console.log(`  waarvan hele 221: ${whole}  |  korte (te zagen): ${short.length}`);
  console.log(`  >> HELE STRIPPEN NODIG (best-fit zaag): ${r.bins}   [ondergrens ${r.lower}, naïef zonder mengen ${nv}]`);
  console.log(`     bespaard door slim zagen: ${nv-r.bins} strippen t.o.v. naïef\n`);
  grandBins+=r.bins;
}
console.log(`TOTAAL hele strippen (alle opgegeven bestanden, per kleur apart geteld): ${grandBins}`);
