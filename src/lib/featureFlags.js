// Feature-flags. Stap 2: het nieuwe openingsafleidingspad staat hier achter een
// schakelaar. DEFAULT = false → het bestaande (oude) pad blijft de standaard.
// Aanzetten zonder build: ?newOpenings=1 in de URL, of localStorage 'newOpenings'='1'.

function readFlag(name, def) {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const p = new URLSearchParams(window.location.search);
      if (p.has(name)) { const v = p.get(name); return v !== '0' && v !== 'false'; }
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(name);
      if (v != null) return v === '1' || v === 'true';
    }
  } catch {}
  return def;
}

export function isNewOpeningDerivation() {
  return readFlag('newOpenings', false);
}

// Stap: best-fit gevelvlak voor HANDMATIG aangemaakte groepen. DEFAULT = false.
// Aanzetten: ?bestFitGroups=1 of localStorage 'bestFitGroups'='1'.
export function isBestFitGroups() {
  return readFlag('bestFitGroups', false);
}

// Zelf-bevattende projecten: bron-IFC-bytes worden in IndexedDB bewaard en de walls
// worden bij laden VERS her-afgeleid (i.p.v. de bevroren opgeslagen walls[]). DEFAULT
// = false → exact het bestaande save/load-gedrag (vlag-uit byte-identiek).
// Aanzetten: ?selfContainedProjects=1 of localStorage 'selfContainedProjects'='1'.
export function isSelfContainedProjects() {
  return readFlag('selfContainedProjects', false);
}
