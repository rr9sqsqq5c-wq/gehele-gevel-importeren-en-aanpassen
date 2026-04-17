# Clash Detectie & Zone Aanpassing

## Geïmplementeerde stappen

### [x] Step 1: Codebase onderzoek
- Bestaande ifc.js API bestudeerd (getApi, getBBoxFromMesh patronen)
- App.jsx structuur begrepen: state, toolbar, sidebar, groepslijst, View2D integratie
- View2D.jsx canvas rendering patronen begrepen

### [x] Step 2: src/lib/clash.js aanmaken
- `loadClashElements(file, onProgress)`: laadt IfcSlab, IfcBeam, IfcColumn, IfcPlate, IfcRoof
  - BBox in mm (meter × 1000) via GetFlatMesh + GetGeometry
  - Filtert elementen kleiner dan 100×100mm
  - Sorteert op prioriteit (Slab > Beam > Column > Plate > Roof)
- `detectClashesForGroup(group, walls, clashElements, pakketdikte, thicknessAxis, outerFacePos, outDir)`:
  - Bepaalt outer face via `outDir` (+1 of -1)
  - Checkt depth: positief = element steekt door de gevel
  - Berekent zoneX/Y/Width/Height in gevelcoördinaten (mm)
- `buildClashExclusions(clashes, zetwerk)`: voegt optionele offset toe rondom clash-zone
- `getGroupOuterFaceInfo(group, wallMap, allWalls)`: berekent thicknessAxis, outerFacePos en outDir per gevelgroep

### [x] Step 3: App.jsx integratie
- State: `clashFiles`, `clashExclusions`, `clashLoadStatus`
- Import: `loadClashElements`, `detectClashesForGroup`, `buildClashExclusions`, `getGroupOuterFaceInfo`
- `runClashDetectionForAllGroups`: loopt over alle groepen, berekent clashes
- `handleClashFileLoad`: laadt IFC, slaat op in clashFiles, triggert automatisch detectie
- `applyClashExclusionsToGroup`: zet clashes om naar sparingen (clashOpenings) in groupSettings
- `removeClashFile`: verwijdert bestand en herberekent
- Toolbar: "⚠ Extra IFC laden" knop (oranje)
- Sidebar: clash-bestanden lijst met element-aantallen en verwijder-knop
- Groepslijst: oranje badge "⚠ N" per groep met clashes
- Actieve groep: clash-details panel met "Pas zones aan" knop
- View2D: `clashZones` prop doorgegeven

### [x] Step 4: View2D.jsx - oranje clash-zones
- `clashZones` prop geaccepteerd (default `[]`)
- Oranje gevulde rechthoeken met stippelrand voor elke clash
- Label met element-naam op de zone
- Toegevoegd aan dependency array van useCallback draw functie
