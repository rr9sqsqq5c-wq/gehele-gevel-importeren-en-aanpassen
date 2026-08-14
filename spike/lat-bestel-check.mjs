// Verificatie latten-bestelregels (klant 2026-08-14): min 0,5 pak · 45/45=250, 45/95=125 per pak · ideale lengte 4500mm.
const { BATTEN_CATALOG, latBestelling, latPakAantal, LAT_MIN_BESTEL_PAK, LAT_IDEALE_BESTELLENGTE_MM } = await import('../src/lib/battens.js');
console.log(`min bestel = ${LAT_MIN_BESTEL_PAK} pak · ideale lengte = ${LAT_IDEALE_BESTELLENGTE_MM} mm`);
const a45 = BATTEN_CATALOG.find((a) => a.breedteMM === 45 && a.dikteMM === 45);
const a95 = BATTEN_CATALOG.find((a) => a.breedteMM === 45 && a.dikteMM === 95);
console.log(`45/45 pak-aantal = ${latPakAantal(a45)} · 45/95 = ${latPakAantal(a95)}`);
for (const [m, art, lbl] of [[45000, a45, '45/45'], [100000, a45, '45/45'], [1000000, a45, '45/45'], [500000, a95, '45/95']]) {
  const b = latBestelling(m, art);
  console.log(`  ${m / 1000} m lat @ ${lbl}: ${b.lattenNodig} latten van ${b.lengteMM} mm → ${b.pakken} pak (${b.lattenBesteld} latten)`);
}
const ok = latPakAantal(a45) === 250 && latPakAantal(a95) === 125 && latBestelling(45000, a45).pakken === 0.5 && latBestelling(1000000, a45).pakken === 1;
console.log(ok ? '\n🟢 OK — pak-aantallen + min 0,5 pak + 4500mm kloppen.' : '\n🔴 FOUT.');
process.exit(ok ? 0 : 1);
