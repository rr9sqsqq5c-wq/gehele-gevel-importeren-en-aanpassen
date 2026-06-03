import { readFileSync } from "node:fs";
for (const [name, file] of [["BIL-MOO","out/BIL-MOO.projectie.json"],["Helmond","out/Helmond.projectie.json"]]) {
  const d = JSON.parse(readFileSync(file));
  const wo = d.openings.filter(o => !o.isSlab);
  const n = wo.length;
  // clean / niet-clean
  const clean = wo.filter(o => o.proj.wMm>50 && o.proj.hMm>50 && o.fitsInWall);
  const tooSmall = wo.filter(o => o.proj.wMm<=50 || o.proj.hMm<=50);
  const tooBig = wo.filter(o => (o.proj.wMm>50&&o.proj.hMm>50) && !o.fitsInWall);
  // oversize tail: AABB groter dan projectie
  const ovs = wo.map(o=>o.oversizeArea).filter(x=>x!=null).sort((a,b)=>a-b);
  const ge = (t)=>ovs.filter(x=>x>=t).length;
  // type verdeling
  const t={}; for(const o of wo) t[o.type]=(t[o.type]||0)+1;
  // sample tooBig
  console.log(`\n===== ${name} (${n} wand-openingen) =====`);
  console.log("types:", JSON.stringify(t));
  console.log(`clean: ${clean.length} (${Math.round(clean.length/n*100)}%) | te klein(<50mm): ${tooSmall.length} | groter dan wand: ${tooBig.length}`);
  console.log(`AABB/projectie oppervlak — median=${ovs[Math.floor(ovs.length/2)]} p90=${ovs[Math.floor(ovs.length*0.9)]} max=${ovs[ovs.length-1]}`);
  console.log(`openingen waar AABB >=1.2x projectie: ${ge(1.2)} | >=1.5x: ${ge(1.5)} | >=2x: ${ge(2)}  (= waar projectie duidelijk wint)`);
  console.log("sample 'groter dan wand':");
  for(const o of tooBig.slice(0,5)) console.log(`   op=${o.op} host=${o.host}(${o.hostType}) ${o.type} proj=${o.proj.wMm}x${o.proj.hMm}mm wand=${o.wallWmm}x${o.wallHmm}mm thk=${o.proj.thkMm}`);
}
