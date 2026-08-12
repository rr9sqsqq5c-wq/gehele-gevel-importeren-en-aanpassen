// VERIFY — wildverband/groothuis subtractRect nu poly-bewust: concave L-void → notch bekleed,
// rechthoekige void → nog steeds geknipt (en byte-identiek pad).
import { buildTruthRows } from '../../src/lib/wildverbandKoppelstrip.js';
import { buildGroothuisRows } from '../../src/lib/groothuisWildverband.js';
import { buildGroothuis2Rows } from '../../src/lib/groothuisWildverband2.js';

const material = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const W = 3360, H = 2870;
const L = [{l:300,h:840},{l:300,h:2580},{l:3080,h:2580},{l:3080,h:60},{l:1960,h:60},{l:1960,h:840}];
const concaveOpening = { x:300, y:60, width:2780, height:2520, polyPts:L };
const rectOpening    = { x:300, y:60, width:2780, height:2520, polyPts:null };

// notch = massief onder de linkerhelft: x[300..1960] y[60..840]. Sample-venster iets binnenin.
const notch = { x1:360, x2:1900, y1:110, y2:780 };
// glas-zone (moet WEG zijn): rechterhelft x[2000..3060] y[200..2400]
const glas = { x1:2000, x2:3060, y1:200, y2:2400 };

function pieceSpan(p){ const s=p.start??p.x??p.x1; const len=p.length??p.width??((p.end??p.x2)!=null?((p.end??p.x2)-s):0); return [s, s+len]; }
function count(rows, zone){
  let n=0;
  for(const r of rows){ const y=r.y; if(y<zone.y1||y>zone.y2) continue;
    for(const p of (r.pieces||[])){ const [a,b]=pieceSpan(p); if(Math.min(b,zone.x2)-Math.max(a,zone.x1)>5) n++; } }
  return n;
}

let pass=0, fail=0; const ok=(n,c)=>{c?pass++:fail++;console.log(c?'🟢':'🔴',n);};
for (const [naam, fn] of [['wildverband(koppelstrip)', buildTruthRows], ['groothuis-1', buildGroothuisRows], ['groothuis-2', buildGroothuis2Rows]]) {
  const rc = fn(W, H, material, [concaveOpening]);
  const rr = fn(W, H, material, [rectOpening]);
  const notchClad = count(rc.rows, notch);
  const glasClad  = count(rc.rows, glas);
  const rectNotch = count(rr.rows, notch);
  ok(`${naam}: concave → notch BEKLEED (${notchClad} pieces)`, notchClad > 0);
  ok(`${naam}: concave → glas-zone LEEG (${glasClad} pieces)`, glasClad === 0);
  ok(`${naam}: rechthoek → notch GEKNIPT (${rectNotch} pieces, oud gedrag)`, rectNotch === 0);
}
console.log(`\n${fail===0?'🟢 ALLE':'🔴'} ${pass} groen, ${fail} rood`);
process.exit(fail?1:0);
