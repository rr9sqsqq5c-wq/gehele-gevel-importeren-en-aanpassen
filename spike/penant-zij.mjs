const { buildPenantSidePattern } = await import('../src/lib/pattern.js');
const mat = { steenL:210, steenH:50, lint:12, stoot:10 };
for (const d of [150, 210, 226, 400]) {
  const rows = buildPenantSidePattern(d, 300, mat, 'halfsteens');
  const r0 = rows[0]?.pieces.map(p=>`${Math.round(p.start)}+${Math.round(p.length)}`).join(',');
  const r1 = rows[1]?.pieces.map(p=>`${Math.round(p.start)}+${Math.round(p.length)}`).join(',');
  const staggered = r0 !== r1;
  console.log(`diepte ${d}: rij0=[${r0}] rij1=[${r1}]  → ${staggered?'VERSPRINGT (verdeeld)':'gelijk (1 strip gestapeld)'}`);
}
