# Architectuur — Up-as, Camera & Hoekafhandeling

Status: **CONCEPT (ongecommit, ter review)**. Geverifieerde `file:line` per onderdeel.
Branches: werklijn = `multi-element-ifc-import-met-pat-f798` (@ `c2aceda`). Camera-fix
en hoek-gate staan op aparte, nog-niet-gemergde feature-branches (zie per sectie).

---

## 1. Up-as-detectie  (GEMERGED op werklijn @ `c2aceda`)

### Principe
Nooit Z-up aannemen. De verticale as wordt **signaal-gebaseerd** afgeleid uit de
opgeloste geometrie, en wand-loze (sub)modellen erven of schatten hem i.p.v. blind `z`.

### Detectie — `detectModelUpAxis` (`src/lib/ifc.js:544`)
- AUTO-modus (geen `forceOrientation`): histogram van wand-extents binnen
  verdiepingsbereik (modale verdiepingshoogte) + ramen/deuren-langeas als
  corroboratie → kiest `y`/`z`/`z_neg` met een **confidence**.
- Confidence-drempel `_UPAXIS_CONFIDENCE_HIGH = 0.75`.

### "Laatste confidente up-as" — erf-bron
- Module-state `_lastConfidentUpAxis` (`src/lib/projectCoordinates.js:34`), apart van
  `_upAxis`, zodat een tussenliggend wand-loos model of de laadvolgorde de bron niet
  vergiftigt. Getter/setter: `:274` / `:275`. Gewist in `reset()` (`:269`),
  gezaaid in `restoreProjectInfo()` (`:254`).
- Wordt UITSLUITEND bijgewerkt bij een confidente detectie:
  `if (confidence >= _UPAXIS_CONFIDENCE_HIGH) setLastConfidentUpAxis(detectedAxis)`
  (`src/lib/ifc.js:730`).

### Geen-wanden-keten B → A → z  (`src/lib/ifc.js:604-657`)
Bij 0 wanden, achter de vlag (zie onder):
1. **B (erven)** — `if (isUpAxisInheritFallback())` (`:604`) → `getLastConfidentUpAxis()`
   (`:606`) → indien aanwezig: erf die up-as, log `geërfde up-as` (`:608`).
2. **A (extent-heuristiek)** — kleinste overall-extent = up, mét vlakke-footprint-sanity
   (beide niet-up-extents ≥ 1.3× de up-extent); bron `extent-heuristiek(geen-wanden)`
   (`:653`).
3. **z (laatste redmiddel)** — `return { axis: 'z', source: 'geen-wanden' }` (`:657`)
   = exact het oude gedrag.

### Waar de up-as "inbakt" — `deriveWallAxes` (`src/lib/ifc.js:757`)
De z-tak hardcodet `height = Math.round(dz * 1000)` (`:778`): vandaar dat een foutieve
up-as zich uit als "breedte/diepte als hoogte". De keten hierboven repareert de bron.

### Vlag + default — `src/lib/featureFlags.js:58`
`isUpAxisInheritFallback()` → `readFlag('upAxisInherit', true)` (`:59`).
- **DEFAULT = true** (standaard aan; gevalideerd).
- **Noodrem:** `?upAxisInherit=0` (of `localStorage 'upAxisInherit'='0'`) → herstelt
  het oude geen-wanden→`z`-gedrag (byte-identiek pad).
- **Blast-radius:** uitsluitend modellen met 0 wanden; modellen met ≥1 wand lopen
  het ongewijzigde detectiepad.

---

## 2. Camera  (branch `camera-preset` @ `0d4a097` — NIET gemerged)

### Up-as → three-space (altijd Y-up) — `buildProjectMatrix` (`src/lib/projectCoordinates.js:123`)
- `M = Ry(trueNorth) · Rx(up-as) · T(-origin)`. De Rx hangt af van de gedetecteerde
  up-as: `'y'` → identity, `'z'` → Rx(−90°), `'z_neg'` → Rx(+90°) (`:140`). De
  origin-aftrek is frame-bewust (`:133`, `:170-171`).
- Deze matrix wordt op **zowel de geometrie** (rootGroup.matrix in `Viewer3D.jsx`) **als
  de camera-bounds** toegepast → in three-space is "up" **altijd Y**. De camera-up
  `(0,1,0)` is dus correct; up-as wordt niet in de camera zelf opnieuw aangenomen.

### Fit-to-bounds op het ECHTE centrum — `fitCameraPose` (`camera-preset:src/Viewer3D.jsx:1395`)
- `radius` = halve bbox-diagonaal; `dist = radius / sin(fov/2) · 1.15` (15% marge);
  `pos = center + _CAM_DIR_3Q · dist` met `_CAM_DIR_3Q = (0.9, 0.55, 1.0)` genormaliseerd
  (`:1394`) → licht-verhoogde 3/4-hoek, elevatie ≈ 22° voor elk model/grootte.
- `CameraInit` (`:1403`) berekent de wereld-bbox via `applyMatrix(projectMatrix, …)` en
  zet `pos: fitPos` rond het **echte** centrum incl. `cy` (`:1451`, `:1463`); slaat
  `_centerYRef`/`_fitDistRef` op (`:1457`, `:1459`).
- Presets (compass/Top/Home, `CameraPresetController` `:1250`) gebruiken nu het echte
  `cy` (`:1264`) en de fit-afstand (`:1266`); **Home = dezelfde 3/4-fit** als de
  initiële view (`:1280`). Oude waarden staan in `// OUD (revert)`-comments.
- **Eerdere bug:** presets namen aan dat het gebouw op `y=0` staat (`ty = h*0.4`) →
  target boven het echte centrum → "gebouw te laag in beeld". Opgelost door op `cy` te
  framen.

---

## 3. Hoekafhandeling  (branch `corner-butt-mode` @ `080ddaf` — NIET gemerged, GEPARKEERD)

### Cfg-gedreven rol
- Per hoek bepaalt een `cornerConfig` welke groep de **aanzichtgevel** is:
  `cfg.mainGroupId` (doorlopend) vs `cfg.secondaryGroupId` (sluit aan). Standaard de
  actieve groep; handmatig omwisselbaar. `detectMainInFront` (`App.jsx:81`) is enkel
  een UI-suggestie, **niet** de rolbepaling.
- `computeCornerOffsets` (`App.jsx:31`) levert `main.stripsExtend = d_sec`
  (opbouwdikte secundair) en `secondary.stripsTrim = stoot`. `computeGroupCornerTrims`
  (`App.jsx:193`) is in de huidige codebase **dode code** (geen call-sites); de live
  aansturing loopt via `endExtensions`.

### endExtensions = extend/trim
- De geometrie (extend in eigen vlak + trim aansluitende gevel) komt uit
  `endExtensions` → `endExtensionsToTrims` → `ctrims*` (extend/trim per groep-einde).
  Gevoed door de hoek-UI "toepassen"-knop.

### Wrap-keten (omslag op het loodrechte vlak) + `cornerButt`-gate
- Drie builder-sites produceren omslag-steenstrips op het **secundaire** vlak:
  `simpleCornerWraps` (3D realtime, `App.jsx:3325`), `cornerWraps` (3D fallback,
  `:3607`), `exportCornerWraps` (IFC-export, `:5292`). Consumenten: `Viewer3D.jsx`
  (`wrapBatches`) en `ifc.js` (`'… - Hoekwrap'`-proxy).
- **Gate** (stompe hoek): elke builder is omhuld met
  `if (!isCornerButtMode()) for (…)` (`App.jsx:3327`, `:3609`, `:5294`). Met de vlag
  AAN worden er **geen** omslagstrips meer geplaatst; de aanzichtgevel loopt door in
  eigen vlak, de aansluitende gevel butt ertegenaan via de bestaande trim.
- Vlag `isCornerButtMode()` → `readFlag('cornerButt', false)` (`corner-butt-mode:src/lib/featureFlags.js:56`).
  **DEFAULT = UIT** → wrap-keten exact als nu (byte-identiek). **Werkt alleen op
  geconfigureerde hoeken** (cfg); zonder cfg gebeurt er niets.

### DOEL-SPEC stompe naad (8 mm / 5 mm) — NIET geïmplementeerd
- De gewenste laag-voor-laag interlock (aansluitende steenstrip+paneel tot 8 mm achter
  de aanzichtstrip; lat 5 mm vrij) is bewust **niet** hard ingebouwd; die getallen
  komen nu uit de bestaande `endExtensions`-suggestie (`overgangsvoeg`, default 10).
  Een echte 8/5-interlock is een aparte vervolgstap (FASE 2b), geparkeerd.

---

## 4. Dakrand-band & onbeklede zone  (GEMETEN op werklijn @ `c2aceda`)

### Regel (vastgelegd met de klant)
- *Losstaand* = er zit een verticaal **gat** tussen de dakrand-band en de gevel eronder.
- De band **zelf** wordt bekleed (verticaal zichtvlak / fascia).
- De **hele tussenruimte** (het gat) blijft **onbekleed**; mag níét dichtgemaakt worden.

### Geometrie & groepering (gemeten)
- Dakrand-band = **verticale fascia**: thinnest as = diepte (zoals de gevel), **niet** de
  up-as. Gemeten op VIA-dakranden: **425/626 fascia** (thin≠y) vs **201 kap**
  (thin=y, bijna-horizontaal).
- De band **groepeert automatisch mee** met de gevel eronder via dezelfde diepte-bucket in
  `autoGroupByWindrichting` (`App.jsx:4344-4347`, sleutel
  `${thicknessAxis}:${round(thicknessStart/50)*50}`). Gemeten paar: gevel `#393382` en
  band `#12615` vallen **beide** in bucket `z:-50000` → één windrichting-groep.

### Waarom het gat onbekleed blijft (mechanisme)
- `maskRowsToContours` (`facadePlane.js:165-191`, kern `:174-175`) bekleedt een rij
  **alleen** waar op die hoogte een element-rechthoek actief is; geen element → `continue`
  → rij onbekleed. Het verticale band↔gevel-gat bevat geen element → blijft onbekleed.
- `SEAM_MERGE_TOL = 75` (`facadePlane.js:24-27`, toegepast `:179`) voegt **uitsluitend
  HORIZONTAAL** intervallen binnen één rij samen → raakt het **verticale** gat niet.

### Resultaat op echt model (BIL-MOO + VIA, via de echte `buildBestFitFacadePattern`)
- Band krijgt strips: **13 rijen** (bekleed ✅).
- Gat-rijen (volledig in het gat): **0** → gat **onbekleed** ✅.
- **Geen** "vlak-normaal ≈ up-as / bijna-horizontaal"-waarschuwing (band is fascia).
- ➡️ De regel wordt **al gehaald door het bestaande contour-mask-mechanisme** — **geen
  engine-fix nodig**.

### BEKENDE GRENZEN (niet alleen het succes)
- **(a) Echte gat is klein.** Gemeten gat = **41 mm** (band-onderkant 9186 mm boven
  gevel-top 9145 mm) — bijna aansluitend, in het gebied van de constructievoeg. De
  **grote** freestanding-gap is alleen **synthetisch** bewezen
  (`spike/validate/dakrand-gap-mask.mjs`, 300 mm → 0 gat-rijen), **niet** op echte data
  gezien.
- **(b) Depth-spread trade-off.** Samen-in-één-groep laat de band correct bekleden, maar
  het diepteverschil band↔gevel (~63 mm) wordt door best-fit op één mediaan-vlak geprojecteerd (de fascia verschuift tot ~de helft daarvan) en triggert de waarschuwing
  *"Diepte-spreiding 63 mm > tolerantie 50 mm — leden liggen niet op één vlak"*
  (`facadePlane.js:121`). **By-design; geen overtreding van de zone-regel.**
- **(c) "Kap"-elementen ongemeten.** De 201 kap-elementen (thin=y, bijna-horizontaal)
  vallen buiten de zone-regel, maar zouden — als ze ooit **alleen** gegroepeerd worden —
  een horizontaal-only groep + de bijna-horizontaal-waarschuwing kunnen triggeren. Apart
  toekomstpunt, **nu geen actie**.

### Regressie
- **Waakhond (self-contained):** `spike/validate/dakrand-gap-mask.mjs` — synthetisch, geen
  externe IFC's; assert: band bekleed **én** groot verticaal gat onbekleed.
- **Meetbewijs (géén CI):** `spike/validate/dakrand-real-measure.mjs` — vereist 44 MB
  BIL-MOO + VIA-dakranden, die **niet** in de repo zitten.

---

## 5. Bekende grenzen
- **Één globale up-as** (`_upAxis` / `_lastConfidentUpAxis`): veronderstelt dat alle
  geladen modellen dezelfde up-as delen (klopt voor dit gebouw). Twee modellen met écht
  verschillende up-assen vallen hier niet onder.
- **Extent-heuristiek (A)** is enkel het tertiaire vangnet (wand-loos + geen confidente
  erf-bron). De vlakke-footprint-sanity vangt de toren-val; een wand-loos
  verticaal-paneel-only submodel zónder hoofdmodel kan toch fout schatten → dan valt het
  terug op `z`.
- **Hoek**: `cornerButt` en de 8/5-interlock zijn geparkeerd op `corner-butt-mode`
  (niet gevalideerd in de live app; wrap komt in de huidige workflow niet voor).

---

## 6. Branch- & vlag-overzicht (peildatum review)
| Vlag | Branch | Default | Op werklijn? |
|---|---|---|---|
| `upAxisInherit` | werklijn (`c2aceda`) | **true** | ✅ gemerged (FF) |
| `cornerButt` | `corner-butt-mode` (`080ddaf`) | false | ❌ niet gemerged (geparkeerd) |
| (geen vlag) camera-fit | `camera-preset` (`0d4a097`) | n.v.t. | ❌ niet gemerged |

Wegwerp: `tmp-corner+upaxis` (`efb5a16`) — integratietest, kan verwijderd.
Oude `main` (`81b0e8d`) is een voorouder van de werklijn; **niet** als merge-target
voor losse features gebruiken (zou de hele feature-tak binnenhalen).
