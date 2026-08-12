// STRIP_SNIJLIJN — bewijs dat de data-laag deel-stenen (yBot/yTop) produceert i.p.v. de hele
// steen weg te knippen. Test het EXPORTEERBARE sparing-pad (clipRowsAroundRects), dat voor
// BEIDE verbanden geldt — dus de halfsteens-sparing-casus die de klant wil ("snijden op de
// werkelijke snijlijn, niet de hele strip weg"). splitAroundOpenings (raam/deur, staand verband)
// deelt exact dezelfde _subtractRect-logica.
//
// De vlag leest URL/localStorage; in Node stubben we localStorage zodat we AAN↔UIT kunnen togglen.

const _ls = { stripSnijlijn: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem: () => {} };

const { clipRowsAroundRects } = await import('../src/lib/sparingElements.js');

// Halfsteens-achtige rijen: steenH 51 + lint 12 → lagenmaat 63. Vier lagen, elk één "steen" van 500 mm.
const rowH = 51;
const lagenmaat = 63;
const rows = [];
for (let i = 0; i < 5; i++) {
  rows.push({ y: i * lagenmaat, pieces: [{ start: 0, length: 1000, label: 'strek' }] });
}

// Eén sparing (bv. een kanaal-doorvoer): x 300..600, y 90..210 — snijdt MIDDEN door rij 1 (y63..114),
// rij 2 (y126..177) en rij 3 (y189..240). Onder-/bovenrand van de sparing liggen NIET op een laagrand.
const rects = [{ x: 300, width: 300, y: 90, height: 120 }];

function summarize(label) {
  const out = clipRowsAroundRects(rows, rects, rowH);
  console.log(`\n=== ${label} ===`);
  let deel = 0, verwijderd = 0, vol = 0;
  for (const row of out) {
    const parts = row.pieces.map((p) => {
      if (p.yBot != null || p.yTop != null) { deel++; return `DEEL[x${p.start}..${p.start + p.length} y${p.yBot}..${p.yTop}]`; }
      vol++; return `vol[x${p.start}..${p.start + p.length}]`;
    });
    console.log(`  rij y${row.y}: ${parts.join(' ')}`);
  }
  // tel hoeveel volle-hoogte X-segmenten er in de UIT-tak overblijven (steen helemaal weg waar hij de rand kruist)
  return { deel, vol };
}

_ls.stripSnijlijn = null;              // vlag UIT
const off = summarize('VLAG UIT (huidige gedrag: hele steen weg waar hij de sparing kruist)');

_ls.stripSnijlijn = '1';               // vlag AAN
const on = summarize('VLAG AAN (deel-steen tot de werkelijke snijlijn)');

console.log('\n--- CONCLUSIE ---');
console.log(`UIT: ${off.deel} deel-stenen (verwacht 0 — geen yBot/yTop, steen valt weg tot laagrand).`);
console.log(`AAN: ${on.deel} deel-stenen met yBot/yTop (verwacht > 0 — steen blijft tot de echte rand staan).`);
const ok = off.deel === 0 && on.deel > 0;
console.log(ok ? '\n🟢 BEWEZEN: deel-steen alleen met de vlag aan; vlag uit = ongewijzigd.' : '\n🔴 FOUT: verwachting niet gehaald.');
process.exit(ok ? 0 : 1);
