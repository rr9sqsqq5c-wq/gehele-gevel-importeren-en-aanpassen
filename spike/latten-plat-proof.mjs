// LATTEN_PLAT — legt de vlag de LANGE zijde in het gevelvlak (aanzicht) en de KORTE als diepte?
// Bewijs: (1) V18 45×95 → uit: aanzicht 45 / diepte 95 (op z'n kant), aan: aanzicht 95 / diepte 45 (plat).
//         (2) De gedeelde buildFacadeLatten emit lat-HOOGTE = de (evt. gewisselde) breedte → 3D/2D/export erven.
//         (3) Een NORMAAL artikel (45×28, breedte>dikte) blijft ONGEMOEID (geen swap) → byte-identiek.
//         (4) Ook robuust tegen een STALE opgeslagen latten.breedte (45) zolang het artikel gekozen is.
const _ls = { paneelOptimalisatie: '1', unifiedLatten: '1', lattenPlat: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { isLattenPlat } = await import('../src/lib/featureFlags.js');
const { BATTEN_CATALOG } = await import('../src/lib/battens.js');
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const { buildFacadeLatten } = await import('../src/lib/panelization.js');

// ─ Replica van de App-helpers (groupLattenDims/groupLattenDikte/groupLattenBreedte/effLatten) ─
function groupLattenDims(s) {
  const artId = (s?.lattenArtikelen ?? [])[0] ?? null;
  const art = artId ? BATTEN_CATALOG.find((a) => a.id === artId) : null;
  const breedte = art ? art.breedteMM : (s?.latten?.breedte ?? 50);
  const dikte = art ? art.dikteMM : (s?.latten?.dikte ?? 28);
  if (isLattenPlat() && dikte > breedte) return { breedte: dikte, dikte: breedte };
  return { breedte, dikte };
}
const groupLattenDikte = (s) => isLattenPlat() ? groupLattenDims(s).dikte : (() => { const a = BATTEN_CATALOG.find((x) => x.id === (s.lattenArtikelen ?? [])[0]); return a ? a.dikteMM : (s?.latten?.dikte ?? 28); })();
const groupLattenBreedte = (s) => isLattenPlat() ? groupLattenDims(s).breedte : (() => { const a = BATTEN_CATALOG.find((x) => x.id === (s.lattenArtikelen ?? [])[0]); return a ? a.breedteMM : (s?.latten?.breedte ?? 50); })();
function effLatten(s) {
  if (!isLattenPlat() || !s?.latten) return s?.latten;
  const { breedte, dikte } = groupLattenDims(s);
  return { ...s.latten, breedte, dikte };
}

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 34 };
const wall = { expressID: 1, length: 3000, height: 1000,
  wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, thicknessStart: 0, thicknessEnd: 100 }, openings: [] };
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 };

// STALE config: de opgeslagen latten.breedte staat nog op 45 (oude artikel-kopie); het artikel is wél gekozen.
function mkS(artId, staleBreedte, staleDikte) {
  return { lattenArtikelen: artId ? [artId] : [], latten: { enabled: true, richting: 'horizontaal', breedte: staleBreedte, dikte: staleDikte, maxInterval: 400, minHOH: 370, maxHOH: 430 } };
}

function latHeight(s) {
  const fd = buildFullGroupFacadePattern([wall], mat, 'halfsteens', null, null, null, 0, 0, null, null, false);
  const latten = buildFacadeLatten({ facadeData: fd, latten: effLatten(s), mat, panelen, panels: [], penanten: [], startLijn: null, verband: 'halfsteens', backingType: 'hout', sparingRects: [] });
  const h = latten.filter((l) => !l.richting || l.richting === 'horizontaal');
  return h.length ? Math.round(Math.max(...h.map((l) => l.height))) : 0;   // aanzicht-hoogte van de latten
}

const V18 = mkS('vl18s-47x100-SG', 45, 95);   // omgekeerde maten (breedte<dikte)
const NORM = mkS('lat-32x50-D', 45, 28);       // normaal (breedte>dikte)

// ── VLAG UIT ──
_ls.lattenPlat = null;
const v18_off = { breedte: groupLattenBreedte(V18), dikte: groupLattenDikte(V18), height: latHeight(V18) };
const norm_off = { breedte: groupLattenBreedte(NORM), dikte: groupLattenDikte(NORM), height: latHeight(NORM) };

// ── VLAG AAN ──
_ls.lattenPlat = '1';
const v18_on = { breedte: groupLattenBreedte(V18), dikte: groupLattenDikte(V18), height: latHeight(V18) };
const norm_on = { breedte: groupLattenBreedte(NORM), dikte: groupLattenDikte(NORM), height: latHeight(NORM) };

console.log('V18 45×95  UIT: aanzicht=%d diepte=%d lat-hoogte=%d  (verwacht 45/95/45 = op z\'n kant)', v18_off.breedte, v18_off.dikte, v18_off.height);
console.log('V18 45×95  AAN: aanzicht=%d diepte=%d lat-hoogte=%d  (verwacht 95/45/95 = plat)', v18_on.breedte, v18_on.dikte, v18_on.height);
console.log('45×28 norm UIT: aanzicht=%d diepte=%d lat-hoogte=%d', norm_off.breedte, norm_off.dikte, norm_off.height);
console.log('45×28 norm AAN: aanzicht=%d diepte=%d lat-hoogte=%d  (verwacht ONGEWIJZIGD)', norm_on.breedte, norm_on.dikte, norm_on.height);

const okOff  = v18_off.breedte === 45 && v18_off.dikte === 95 && v18_off.height === 45;   // uit = op z'n kant (byte-identiek)
const okOn   = v18_on.breedte === 95 && v18_on.dikte === 45 && v18_on.height === 95;       // aan = plat (lange zijde tegen wand)
const okNorm = norm_off.breedte === 45 && norm_off.dikte === 28 && norm_on.breedte === 45 && norm_on.dikte === 28 && norm_off.height === norm_on.height;  // normaal ongemoeid
const ok = okOff && okOn && okNorm;
console.log(`\nV18 uit (op z'n kant): ${okOff ? '🟢' : '🔴'} · V18 aan (plat): ${okOn ? '🟢' : '🔴'} · 45×28 ongemoeid: ${okNorm ? '🟢' : '🔴'}`);
console.log(ok ? "\n🟢 BEWEZEN: met de vlag ligt de lange zijde in het gevelvlak (plat); uit = op z'n kant (byte-identiek); normaal artikel ongemoeid." : '\n🔴 FOUT.');
process.exit(ok ? 0 : 1);
