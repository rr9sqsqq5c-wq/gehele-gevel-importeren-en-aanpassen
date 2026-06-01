# File Structure

```
multi-element-ifc-import-met-pat-f798/
├── index.html
├── vite.config.js
├── package.json
├── package-lock.json
├── HANDLEIDING.md
├── CHANGELOG.md
├── OPSTARTEN.md
├── LOGICA_REGELS_PER_ONDERDEEL.md
├── WERKWIJZE_GEVEL_INDELING.md
├── brickboard.bat               (untracked) start-script dev server
├── start-5174.bat
├── start-app.bat
├── start-server.bat
├── v2d_base.jsx
├── public/
│   └── ...                      (static assets, WASM files)
└── src/
    ├── App.jsx                  (6726 regels — hoofdcomponent)
    ├── main.jsx
    ├── index.css
    ├── Viewer3D.jsx             (1920 regels — 3D viewer, OpeningMesh)
    ├── View2D.jsx
    ├── Werktekening.jsx
    ├── Uittrekstaat.jsx
    ├── DetailBoek.jsx
    ├── SlimFortWerktekening.jsx
    ├── WildverbandPanel.jsx
    └── lib/
        ├── ifc.js               (2753 regels — legacy IFC parser, parseIfc)
        ├── ifcAdapter.js        (227 regels) [untracked] WallPlane → BrickBoard
        ├── newEngineRunner.js   (359 regels) [untracked] inheritance layer
        ├── adjacency.js         detectAdjacencies / buildConnectedComponents
        ├── battens.js           BATTEN_CATALOG / BASISPLAAT_CATALOG
        ├── detailGenerator.js
        ├── detailGeometry.js
        ├── envelope.js          detectBuildingEnvelope / extractVisibleConcreteFaces
        ├── geometry.js          openingXRangesAtY / polyXRangesAtY
        ├── panelization.js      buildFacadeZones / panelizeZone
        ├── pattern.js           buildGroupPattern / buildFacePattern
        ├── production.js
        ├── sectionOrientation.js
        ├── slimfort.js          generateSlimFortGrid / applyCornerTrimToSlimFort
        ├── stitching.js         computeGroupStitching
        ├── storage.js           saveProjectState / loadProjectState / saveFileHandle
        ├── systemDefinitions.js
        ├── wallDecomposition.js decomposeAndConnect
        └── __tests__/
            └── adapterSmokeTest.js [untracked]
```
