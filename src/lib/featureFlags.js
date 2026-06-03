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

// Openingsafleiding gebruikt dezelfde model-up-as als het wand-skelet (één bron van
// waarheid) i.p.v. de kolom-heuristiek (detectUp) opnieuw te gokken in het void-pad.
// DEFAULT = false → exact het huidige (byte-identieke) gedrag.
// Aanzetten: ?openingUpAxisFix=1 of localStorage 'openingUpAxisFix'='1'.
export function isOpeningUpAxisFix() {
  return readFlag('openingUpAxisFix', false);
}
