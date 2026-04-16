# Agent 4 — UI Integratie

## Aanpak
Alle bestanden van de `multi-element-ifc-import-met-pat-e7f1` referentiebranch overgenomen als basis (React + Vite setup, View2D.jsx, Viewer3D.jsx, Uittrekstaat.jsx). Vervolgens de nieuwe logica van Agent 1 en Agent 2 geïntegreerd in de bestaande UI.

### [x] Step 1: Bestanden kopiëren van multi-element branch
- git checkout + npm install

### [x] Step 2: Agent 1 loadWalls integreren in src/lib/ifc.js
- `loadWalls(file, onProgress)` toegevoegd — laadt alle IFCWALL/IFCWALLSTANDARDCASE elementen
- `convertToAppWall(rawWall)` helper — converteert Agent 1 formaat naar app formaat (met wallOrigin)

### [x] Step 3: Agent 2 groeperingsfuncties integreren in src/lib/adjacency.js
- `wallsToGroupFormat(walls)` — converteert app-wanden naar Agent 2's {id, startPoint, endPoint} formaat
- `buildGroups(walls, tolerance?)` — endpoint-gebaseerde groepering via Union-Find
- `mergeGroups(groups, a, b)` — samenvoegen van twee groepen
- `splitGroup(groups, groupId, ids)` — splitsen van geselecteerde wanden
- `renameGroup(groups, groupId, label)` — hernoemen

### [x] Step 4: App.jsx verbinden met nieuwe logica
- `startScan` gerefactored: gebruikt nu `loadWalls` (Agent 1) direct na bestandskeuze
- Type-selectiestap vervalt: alle wanden worden geladen
- Na laden: automatisch groeperen via `buildGroups` (Agent 2)
- `autoGroup` knop updated naar Agent 2's `buildGroups`
- Merge/split knoppen per groep in de groepen-lijst:
  - "+ [andere groep]" knoppen om samen te voegen
  - "✂ Splitsen" knop voor geselecteerde wanden

### [x] Step 5: Build verificatie
- `npm run build` — ✓ geen fouten (578 modules getransformeerd)

## UI-schermen aanwezig
- **IFC upload knop** → triggert Agent 1's `loadWalls` direct
- **Wandenlijst** → links paneel met groepen en wanden (uitklapbaar)
- **Groepen** → automatisch aangemaakt door Agent 2's `buildGroups`
- **Handmatig aanpassen** → merge/split knoppen per groep
- **Configuratiepaneel** → kleur, verband, steenmaat, voegmaat per groep (rechts paneel)
- **2D preview** → View2D.jsx per groep/wand
- **3D overzicht** → Viewer3D.jsx van gehele gevel
- **Uittrekstaat** → Uittrekstaat.jsx per groep
