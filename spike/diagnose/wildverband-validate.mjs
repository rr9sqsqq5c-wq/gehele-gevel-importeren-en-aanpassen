// WEGWERP (spike/) — VALIDATE: produceert buildTruthRows ECHTE wildverband (verspringend,
// strek/drieklezoor/kop) i.p.v. tegelverband (alle rijen uitgelijnd)?
import { buildTruthRows, getWildModule } from '../../src/lib/wildverbandKoppelstrip.js';

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const W = 3000, H = 600; // ~10 rijen, meerdere panelen breed
const { rows } = buildTruthRows(W, H, mat, []);

console.log('# WILDVERBAND-VALIDATE  (W=%d H=%d, %d rijen)', W, H, rows.length);
console.log('module:', getWildModule(mat));

// 1) verspringing: de start van de 2e steen per rij mag NIET constant zijn (tegelverband = wel)
const secondStarts = rows.map(r => r.pieces[1]?.start).filter(v => v != null);
const uniqSecond = [...new Set(secondStarts.map(v => Math.round(v)))];
const firstLens = rows.map(r => Math.round(r.pieces[0]?.length ?? 0));
const uniqFirstLen = [...new Set(firstLens)];

// 2) strip-type-variatie
const labels = new Set();
for (const r of rows) for (const p of r.pieces) labels.add(p.label);

// 3) koppelstrippen aanwezig?
let koppel = 0; for (const r of rows) for (const p of r.pieces) if (p.koppelstrip) koppel++;

console.log('\nEerste 6 rijen (start/lengte/label van eerste 4 stenen):');
for (let i = 0; i < Math.min(6, rows.length); i++) {
  const pcs = rows[i].pieces.slice(0, 4).map(p => `${Math.round(p.start)}:${Math.round(p.length)}${p.label?.[0] ?? '?'}${p.koppelstrip ? '*' : ''}`).join('  ');
  console.log(`  rij ${i} (y=${Math.round(rows[i].y)}): ${pcs}`);
}

console.log('\n— Checks —');
console.log(`  strip-types        : {${[...labels].join(', ')}}  ${labels.size >= 2 ? '🟢 variatie (S/D/K)' : '🔴 uniform → tegelverband'}`);
console.log(`  rij-verspringing   : 2e-steen-starts uniek=${uniqSecond.length}, 1e-lengtes uniek=${uniqFirstLen.length}  ${(uniqSecond.length > 1 || uniqFirstLen.length > 1) ? '🟢 verspringt (geen tegelverband)' : '🔴 alles uitgelijnd'}`);
console.log(`  koppelstrippen     : ${koppel}  ${koppel > 0 ? '🟢 aanwezig (overbruggen paneelnaad)' : '🟠 geen'}`);

const ok = labels.size >= 2 && (uniqSecond.length > 1 || uniqFirstLen.length > 1);
console.log(`\n=== VERDICT: ${ok ? '🟢 echte wildverband (verspringend, S/D/K) — NIET tegelverband' : '🔴 ziet eruit als tegelverband'} ===`);
process.exit(0);
