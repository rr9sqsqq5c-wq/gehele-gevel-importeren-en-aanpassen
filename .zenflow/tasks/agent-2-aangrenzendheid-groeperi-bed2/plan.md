# Agent 2 — Aangrenzendheid & Groepering

## Aanpak

Medium taak: meerdere bestanden, logica én UI. Opgebouwd als Vite + Svelte-app
omdat het project volledig leeg was.

Kernbeslissing: **Union-Find** (disjoint set union) voor groepering — O(n·α(n)),
eenvoudig aanpasbaar en deterministisch.

## Getroffen bestanden

- `package.json` + `vite.config.js` + `index.html` — project-setup
- `src/main.js` — Svelte-mountpunt
- `src/lib/ifc.js` — wanddatastructuur, `parseWalls()`, `demoWalls`
- `src/lib/adjacency.js` — `detectAdjacency`, `buildGroups`, `mergeGroups`, `splitGroup`, `renameGroup`
- `src/components/GroupingPanel.svelte` — groepeer-UI
- `src/App.svelte` — SVG-plattegrond + GroupingPanel
- `src/lib/adjacency.test.js` — 14 unit-tests (node, geen framework)

### [x] Step 1: Project opzetten (Vite + Svelte)
- package.json, vite.config.js, index.html, .gitignore
- npm install geslaagd

### [x] Step 2: src/lib/ifc.js — wandstructuur en demo-data
- `parseWalls(rawWalls)` normaliseert ruwe IFC-wandobjecten
- `demoWalls` — 10-wanden demo (rechthoekig gebouw + losstaande wand)

### [x] Step 3: src/lib/adjacency.js — aangrenzendheidsdetectie & groepering
- `detectAdjacency(walls, tol?)` → Map<id, Set<id>>
- `buildGroups(walls, tol?)` → WallGroup[] via Union-Find
- `mergeGroups(groups, a, b)` → handmatig samenvoegen
- `splitGroup(groups, groupId, ids)` → handmatig splitsen
- `renameGroup(groups, groupId, label)` → hernoemen

### [x] Step 4: GroupingPanel.svelte — UI
- Lijst van groepen met wand-chips
- Hernoemen (inline-edit)
- Samenvoegen via twee dropdowns
- Splitsen: kies groep → vink wanden aan → splitsen

### [x] Step 5: App.svelte — plattegrond + paneel
- SVG-bovenaanzicht, elke groep een eigen kleur
- Legenda
- "Hergroepeer automatisch"-knop

### [x] Step 6: Verificatie
- `npm run build` → ✓ geen fouten
- `node src/lib/adjacency.test.js` → 14/14 tests geslaagd
