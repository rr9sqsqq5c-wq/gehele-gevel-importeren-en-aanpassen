import { readFileSync } from "node:fs";
for (const [name, file] of [["BIL-MOO","out/BIL-MOO.projectie.json"],["Helmond","out/Helmond.projectie.json"]]) {
  const d = JSON.parse(readFileSync(file));
  const wo = d.openings.filter(o => !o.isSlab);
  // rotatie-verdeling van host-wanden
  const rot = {};
  for (const o of wo) { const b = o.wallRotDeg>=15?"15-45(schuin)": o.wallRotDeg>=5?"5-15":"0-5(recht)"; rot[b]=(rot[b]||0)+1; }
  // outline-vorm: aantal hoekpunten
  const polyPts = {}; let nonRect=0;
  for (const o of wo) { const n=o.proj.poly.length; polyPts[n]=(polyPts[n]||0)+1; if(n>5)nonRect++; }
  // hosts die meerdere openingen dragen (stapeling / multi-layer indicatie)
  const perHost={}; for(const o of wo) perHost[o.host]=(perHost[o.host]||0)+1;
  const multi=Object.values(perHost).filter(v=>v>1).length;
  console.log(`\n== ${name} ==`);
  console.log("host-rotatie:", JSON.stringify(rot));
  console.log("outline hoekpunten:", JSON.stringify(polyPts), "| niet-rechthoekig(>5):", nonRect);
  console.log("hosts:", Object.keys(perHost).length, "| hosts met >1 opening:", multi);
}
