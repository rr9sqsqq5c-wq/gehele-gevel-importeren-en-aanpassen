// SPIKE — FASE 1 VERIFICATIE (wegwerp, herhaalbaar). Bewijst, niet beweert:
//  1. Een opgeslagen project ('last') ZONDER stripZones-veld laadt zonder crash en de
//     consumer-default ((settings.stripZones ?? [])) levert []. (DB_VERSION 3 blijft.)
//  2. stripZones is ADDITIEF: een nieuw record MET stripZones round-trip't intact.
//  3. Geen schema-bump nodig: stripZones zit IN de project-state-waarde, niet als store/index.
//
// Drijft de ECHTE src/lib/storage.js (geen kopie) via een minimale in-memory IndexedDB-shim
// (fake-indexeddb is niet geïnstalleerd; we voegen geen deps toe in een verifieer-fase).
// Exit ≠ 0 bij elke faal → bruikbaar als regressie-waakhond.

// ── minimale IndexedDB-shim: precies genoeg voor storage.js (open/upgrade/tx/put/get/delete)
function makeIndexedDBShim() {
  const dbs = new Map(); // naam → { version, stores: Map<storeName, Map<key,val>>, keyPaths }
  function fireAsync(fn) { setTimeout(fn, 0); }

  function makeStore(dataMap, keyPath) {
    return {
      put(value) {
        dataMap.set(value[keyPath], structuredClone(value));
        const req = {};
        fireAsync(() => req.onsuccess && req.onsuccess({ target: req }));
        return req;
      },
      get(key) {
        const req = {};
        fireAsync(() => { req.result = dataMap.has(key) ? structuredClone(dataMap.get(key)) : undefined; req.onsuccess && req.onsuccess({ target: req }); });
        return req;
      },
      delete(key) {
        dataMap.delete(key);
        const req = {};
        fireAsync(() => req.onsuccess && req.onsuccess({ target: req }));
        return req;
      },
    };
  }

  return {
    open(name, version) {
      const req = {};
      fireAsync(() => {
        let db = dbs.get(name);
        const isNew = !db || (version != null && version > db.version);
        if (!db) { db = { version: version ?? 1, stores: new Map(), keyPaths: new Map() }; dbs.set(name, db); }
        const dbHandle = {
          objectStoreNames: { contains: (n) => db.stores.has(n) },
          createObjectStore(n, opts) { db.stores.set(n, new Map()); db.keyPaths.set(n, opts.keyPath); return {}; },
          transaction(names, _mode) {
            const list = Array.isArray(names) ? names : [names];
            const tx = {
              objectStore: (n) => makeStore(db.stores.get(n), db.keyPaths.get(n)),
              oncomplete: null, onerror: null,
            };
            fireAsync(() => tx.oncomplete && tx.oncomplete());
            return tx;
          },
        };
        if (isNew && req.onupgradeneeded) { req.result = dbHandle; req.onupgradeneeded({ target: req }); }
        db.version = version ?? db.version;
        req.result = dbHandle;
        req.onsuccess && req.onsuccess({ target: req });
      });
      return req;
    },
  };
}

globalThis.indexedDB = makeIndexedDBShim();
globalThis.structuredClone = globalThis.structuredClone ?? ((o) => JSON.parse(JSON.stringify(o)));

const { saveProjectState, loadProjectState, clearProjectState } = await import('../src/lib/storage.js');

const fails = [];
const ok = [];
function check(name, cond, detail = '') { (cond ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`); }
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. LEGACY project: settingsMap-entries ZONDER stripZones-veld ──
const legacy = {
  groups: [{ id: 'g1', name: 'Gevel Noord', wallIds: [101, 102], manual: true }],
  groupLinks: [],
  cornerConfigs: {},
  settingsMap: {
    g1: { verband: 'halfsteens', color: '#a64033', maxHoogte: null }, // GEEN stripZones
  },
  ifcFileName: 'brickboard-a.ifc',
  wallDimOverrides: { 101: { length: 3000 } },
  allWalls: [],
};
await clearProjectState();
await saveProjectState(legacy);
const loaded = await loadProjectState();

check('legacy: load gaf een record terug', loaded != null);
check('legacy: settingsMap.g1 aanwezig', loaded?.settingsMap?.g1 != null);
check('legacy: stripZones-veld ONTBREEKT in opgeslagen entry (geen stille injectie)',
  loaded?.settingsMap?.g1 && !('stripZones' in loaded.settingsMap.g1),
  `keys=${Object.keys(loaded?.settingsMap?.g1 ?? {}).join(',')}`);
// consumer-default invariant — exact de access uit App.jsx:1467/6236
const resolvedZones = loaded?.settingsMap?.g1?.stripZones ?? [];
check('legacy: consumer-default (settings.stripZones ?? []) === []', Array.isArray(resolvedZones) && resolvedZones.length === 0);
// overige velden onaangetast → byte-identiek aan input
check('legacy: groups/settingsMap byte-identiek round-trip', deepEq(loaded.groups, legacy.groups) && deepEq(loaded.settingsMap, legacy.settingsMap));

// ── 2. ADDITIEF: nieuw record MET stripZones round-trip't intact ──
const withZones = structuredClone(legacy);
withZones.settingsMap.g1.stripZones = [
  { id: 'sz_101', x: 0, y: 0, width: 1000, height: 2000, verband: 'staand_tegelverband', enabled: true, label: 'Z1' },
];
await clearProjectState();
await saveProjectState(withZones);
const loaded2 = await loadProjectState();
check('additief: stripZones aanwezig na round-trip', (loaded2?.settingsMap?.g1?.stripZones ?? []).length === 1);
check('additief: stripZones byte-identiek', deepEq(loaded2?.settingsMap?.g1?.stripZones, withZones.settingsMap.g1.stripZones));

// ── 3. legacy-record dat ALLEEN sommige groepen zones heeft (gemengd) ──
const mixed = structuredClone(legacy);
mixed.groups.push({ id: 'g2', name: 'Gevel Oost', wallIds: [201], manual: true });
mixed.settingsMap.g2 = { verband: 'halfsteens', stripZones: [{ id: 'sz_201', x: 0, y: 0, width: 500, height: 500 }] };
await clearProjectState();
await saveProjectState(mixed);
const loaded3 = await loadProjectState();
check('gemengd: g1 zonder veld → []', (loaded3?.settingsMap?.g1?.stripZones ?? []).length === 0);
check('gemengd: g2 met veld → behouden', (loaded3?.settingsMap?.g2?.stripZones ?? []).length === 1);

await clearProjectState();

console.log('=== FASE 1 — PERSISTENTIE VERIFICATIE ===');
for (const o of ok) console.log('  ✅ ' + o);
for (const f of fails) console.log('  ❌ ' + f);
console.log(`\n  ${fails.length === 0 ? 'ALLE CHECKS GROEN ✅ — DB_VERSION 3 blijft; stripZones is additief, ontbrekend veld → []' : `${fails.length} FOUT(EN) ❌`}`);
process.exit(fails.length === 0 ? 0 : 1);
