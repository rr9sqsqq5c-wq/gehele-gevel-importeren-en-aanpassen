# Diagnose — waarom krijgen de HSB_272.5-wanden het bovenvlak als gevelvlak?

Read-only onderzoek, **geen** codewijziging. Model: BIL-MOO-A-ZZ-PBP.ifc.
Harnesses: `spike/validate/hsb-diag.mjs`, `spike/validate/upaxis-diag.mjs`
(verbatim kopieën van `detectModelUpAxis` + `deriveWallAxes` uit `src/lib/ifc.js`,
zodat de uitkomst exact het OUDE pad is).

## Korte conclusie

De oorzaak is **niet** een "twee grootste extents = gevelvlak"-heuristiek, maar de
**globale up-as die fout wordt gedetecteerd**. `detectModelUpAxis` kiest voor dit
model **heightAxis = `z`**, terwijl het model in werkelijkheid **Y-up** is (de
verticale richting is Y). Daardoor draait `deriveWallAxes` voor een deel van de
wanden hoogte en dikte om: de echte dikte (273 mm) wordt "hoogte" en de echte
hoogte (2870 mm) wordt "dikte". Voor die wanden wijst de dikte-as (= buitenrichting)
naar de échte verticaal → de bekleding komt op het horizontale (boven)vlak.

Dit treft **60 van de 108** `21.10_WA_LB_HSB_272.5`-wanden — precies de wanden die
in het grondvlak langs de X-richting lopen.

## De exacte codeplek + voorwaarde

1. **Up-as bepaald (de bron van de fout):**
   `detectModelUpAxis(...)` — `src/lib/ifc.js:542`, aangeroepen in `parseIfc` op
   `src/lib/ifc.js:1333-1334` (`_upAxis = _upAxisResult.axis`).
   Gemeten uitkomst (AUTO):
   ```
   axis:'z'  bboxVote:'z' bboxScore:0.896  normalVote:UNKNOWN (normY 0.455 / normZ 0.545)
   confidence:0.627  reason:"Alleen bbox: z"  yUpVotes:0 zUpVotes:0
   ```
   - De normaal-stem is onbeslist (beide < 0,6, `ifc.js:650-652`).
   - De bbox-stem valt in de **extent-ratio-tak** (`ifc.js:639-645`) omdat er 0
     "storey-height"-stemmen waren (`totalVotes=0`). In de **steekproef van 30
     wanden** (`sampleSize=30`, `ifc.js:556-562`) is de Z-extent-som groot t.o.v.
     de Y-extent-som → `bboxVote='z'`. De steekproef is dus niet representatief voor
     het hele (Y-up) gebouw.

2. **Assen toegewezen met die up-as:**
   `deriveWallAxes(dx, dy, dz, _upAxis)` — `src/lib/ifc.js:734`, aangeroepen op
   `src/lib/ifc.js:1368`. In de `z`-tak (`ifc.js:748-757`):
   ```
   lengthAxis    = dx >= dy ? 'x' : 'y';
   thicknessAxis = dx >= dy ? 'y' : 'x';     // ifc.js:749
   height        = Math.round(dz * 1000);    // ifc.js:755  ← hoogte = Z-extent
   thickness     = Math.round(min(dx,dy)*1000);
   ```
   **Voorwaarde die het laat omslaan:** met `heightAxis='z'` wordt `height = dz`.
   Voor een Y-up-wand die in het grondvlak langs X loopt is `dz` de **dikte**
   (≈273 mm) en niet de hoogte. Bovendien geldt dan `dx (3360) ≥ dy (2870)` → 
   `thicknessAxis='y'`. Y is de **echte verticaal**, dus de buitenrichting
   (dikte-as) wijst omhoog → bekleding op het bovenvlak.

## De gemeten extents (bewijs)

Eén representatieve HSB-wand die omslaat (`#53023`,
`Basic Wall:21.10_WA_LB_HSB_272.5`):

| | X | Y | Z |
|---|---|---|---|
| extent (mm) | **3360** | **2870** | **273** |

`deriveWallAxes('z')` →
`length=3360 (x)`, `height=273 (z)`, `thickness=2870 (y)`,
`lengthAxis=x, heightAxis=z, thicknessAxis=y`.
Dat reproduceert exact de tooltip **3360 × 273** (`{length}×{height}`,
`Viewer3D.jsx:1145`). `height (273) ≈ echte dikte`; `thickness (2870) ≈ echte
hoogte`; `thicknessAxis = y = echte verticaal` ⇒ buitenvlak omhoog.

Alle 108 HSB_272.5-wanden delen **dy = 2870 mm** als gemeenschappelijke maat (de
storey-hoogte). Dat is het bewijs dat **Y de verticaal** is. `dx`/`dz` wisselen
(3360 ↔ 273) afhankelijk van de looprichting van de wand in het grondvlak.

## Hypothese uit de opdracht getoetst

> "Hoogte ≈ dikte (~273) → heuristiek pakt de twee grootste extents als gevelvlak."

- **Symptoom klopt** (273 verschijnt als hoogte), **maar het mechanisme is anders.**
  `deriveWallAxes` pakt niet "de twee grootste extents"; het zet `height` hard op de
  extent langs de **gekozen up-as**. De fout zit in die up-as (`z` i.p.v. `y`), niet
  in een gevelvlak-heuristiek. De 273-als-hoogte is een *gevolg* van de verkeerde
  up-as bij wanden die dun zijn langs Z.

## Contrast-check (andere wanden in hetzelfde model)

- **HSB_272.5 die langs Z lopen (48 stuks):** `dz=3360, dx=273`. Met `up='z'` →
  `thicknessAxis='x'` (horizontaal) → buitenvlak zijwaarts → **gevelvlak verticaal,
  ziet er goed uit** (al staan length/height intern verwisseld). Dit zijn de "OK"
  HSB-wanden.
- **HSB_272.5 die langs X lopen (60 stuks):** `dx=3360, dz=273` → `thicknessAxis='y'`
  (= echte verticaal) → **bekleding op bovenvlak**. De kapotte helft.
- **Niet-HSB:** dezelfde regel. Bv. `90.10.02_WA_opsluitband` `#9087`
  (`dx=28230, dy=200, dz=50`) → `up='z'` → `height=dz=50`, `thicknessAxis='y'` →
  ook als platte band met buitenrichting omhoog. De fout is dus **niet
  HSB-specifiek**, maar treft elke wand die dun is langs de (verkeerd gekozen)
  Z-as. De HSB_272.5-gevelwanden zijn alleen de zichtbare, voor de bekleding
  relevante gevallen, en precies de helft ervan (de X-lopers) slaat om.

## Samengevat (oorzaak, hard)

1. `detectModelUpAxis` (`ifc.js:542`, beslissing via extent-ratio op een
   niet-representatieve steekproef, `ifc.js:639-645`) levert **`z`** voor een
   **Y-up** model. → `_upAxis='z'` (`ifc.js:1334`).
2. `deriveWallAxes` (`ifc.js:734`, aanroep `:1368`) zet daardoor `height = dz`
   (`:755`) en `thicknessAxis = dx>=dy ? 'y' : 'x'` (`:749`).
3. Voor de 60 X-lopende HSB_272.5-wanden is `dz` de dikte (273 mm) en `dx ≥ dy`, dus
   `height=273` en `thicknessAxis='y'` (de echte verticaal). De buitenrichting wijst
   omhoog → **bekleding op het bovenvlak**.

Nog **geen** fix doorgevoerd; dit document maakt alleen de oorzaak hard.

---

# FIX — detectModelUpAxis robuust gemaakt

**Scope:** alleen `detectModelUpAxis` (`src/lib/ifc.js:542`) gewijzigd. `deriveWallAxes`,
de gevelgroepering/bekleding en de openings-afleiding zijn **niet** aangeraakt — die
zijn correct zodra de up-as klopt.

## Waarom het opgeloste model Y-up is
BIL-MOO (en Helmond, Kubistisch) komen uit web-ifc met de verticaal langs **wereld-Y**
i.p.v. de IFC-conventie Z. Bewijs: alle 108 `HSB_272.5`-wanden delen **dy = 2870 mm**
als gemeenschappelijke maat (de verdiepingshoogte); `dx`/`dz` wisselen (3360 ↔ 273)
afhankelijk van de looprichting. De opgeloste geometrie heeft dus zijn hoogte langs Y.
(Oorzaak ligt in het project-/site-coördinatenstelsel van de Revit-export; we volgen
daarom de werkelijke verticaal van de **opgeloste** geometrie i.p.v. de Z-aanname.)

## Wat er is veranderd (`src/lib/ifc.js`)
De oude bbox-ratio over een steekproef van 30 wanden is vervangen door corroborerende
signalen (`ifc.js:556-665`):
1. **Gedeelde verdiepingshoogte** (primair, `:601-614`): histogram (50 mm-buckets) van
   wand-extents binnen storey-bereik [1,2–6,5 m] over een gespreide doorsnede van álle
   wanden. De verticaal heeft een scherpe modus (elke wand op een verdieping deelt de
   hoogte); horizontale assen niet.
2. **Lange-as van ramen/deuren** (`:616-630`): de hoogste maat van IfcWindow/IfcDoor =
   de verticaal. Sterkste signaal in echte gebouwmodellen.
3. **Beslissing** (`:632-665`), bewust veilig (liever niet flippen dan een Z-up model
   kantelen):
   - ramen/deuren-stem leidend (`:648`);
   - anders gedeelde hoogte, maar **alleen bij een duidelijke winnaar** (≥3× of
     verliezer ~0, `:646`) → voorkomt dat geclusterde paneel-**breedtes** (bv. GFRC:
     43 panelen 1700 mm breed) als hoogte gelezen worden;
   - anders ambigu → **'z' (IFC-conventie)** (`:661`), zodat Z-up modellen zonder
     corroboratie ongemoeid blijven.
   - De extent-som (ΣY/ΣZ) wordt **niet** als beslisser gebruikt (bevooroordeeld naar
     de breedste as — dat was mede de oude fout).

## Up-as tabel — OUD vs NIEUW (alle testmodellen)
Gemeten met verbatim kopieën, `spike/validate/upaxis-fix-validate.mjs`:

| Model | OUD | NIEUW | Bron NIEUW | Echt up? |
|---|---|---|---|---|
| BIL-MOO | z | **y** | ramen/deuren + gedeeld (y 276 vs 48) | Y ✓ |
| Helmond | z | **y** | ramen/deuren + gedeeld (y 157 vs 5) | Y ✓ |
| Kubistisch | y | y | ramen/deuren + gedeeld (y 13 vs 3) | Y ✓ |
| KGT Tegels | y | y | gedeelde hoogte (y 22 vs 0) | Y ✓ |
| GFRC Dunea | z | z | ambigu → default z (y 35 vs z 20, geen ramen/deuren) | **Z** ✓ (niet geflipt) |
| Demo / MSHF | z | z | geen wanden | n.v.t. |

Alleen de twee Y-up gebouwmodellen (BIL, Helmond) flippen; **geen** Z-up model kantelt.
GFRC is bewust beschermd: zijn 30 mm-dunne panelen delen een **breedte** van 1700 mm
in Y (geen hoogte), en zonder ramen/deuren is er geen corroboratie → de detectie houdt
veilig 'z' aan (panelhoogten variëren in Z → echt Z-up).

## Herstel bevestigd (BIL-MOO)
- `HSB_272.5` als platte slab behandeld (height < 1000 mm): **OUD 60/108 → NIEUW 0/108**.
- Wand **#53023** (extents dx=3360, dy=2870, dz=273): `deriveWallAxes`
  geeft nu **3360 × 2870** (up=y, `thicknessAxis=z` = horizontaal → gevelvlak verticaal)
  i.p.v. **3360 × 273** (up=z, `thicknessAxis=y` → bovenvlak). Daarmee liggen gevel,
  openingen én steenstrippen weer op het verticale gevelvlak (de 60 omklappende
  HSB-wanden + de opsluitbanden hersteld).
- Synthetische **Z-up getuige** (BIL met Y↔Z geswapt): detectie geeft correct **z** →
  de aanpak werkt symmetrisch voor echte Z-up modellen.
- `npm run build` groen.

## Opgeslagen projecten
De fix verandert alleen de up-as (en daarmee de wallOrigin-assen/maten), **niet de
`expressID`'s**. Opgeslagen projecten koppelen aan `expressID` (`groups.wallIds`,
`wallDimOverrides`, `settingsMap`); die blijven dus geldig en hergroeperen op de nu
correcte geometrie. Headless niet te testen (IndexedDB/browser) — handmatige
laad-check staat bij de gebruiker.

## detectUpRobust in het fallback-pad — redundant?
**Nog niet weghalen.** `detectUpRobust` zit in `src/lib/openingDerivation.js` en wordt
gebruikt door `deriveOpeningsCore` (het void-loze terugvalpad), dat zijn eigen
frame-up bepaalt en **niet** via `detectModelUpAxis` loopt. Deze fix maakt die patch
dus niet automatisch overbodig. Een latere opruiming zou `deriveOpeningsCore` de
gecorrigeerde up kunnen laten hergebruiken; pas weghalen ná bevestiging.

## Nog te doen (handmatig, gebruiker)
- Browsercheck BIL-MOO + Kubistisch: gevels/openingen/steenstrippen op het verticale
  vlak; en een bestaand opgeslagen project laden en correct laten hergroeperen.

Validatie-artefacten: `spike/validate/upaxis-fix-validate.mjs`,
`spike/validate/gfrc-probe.mjs`, `spike/validate/upaxis-diag.mjs`,
`spike/validate/hsb-diag.mjs`.

---

# FIX 2 — gebouw lag op zijn zijkant (globale scène-oriëntatie)

Na FIX 1 stonden de openingen op de juiste (verticale) vlakken per wand, maar het
hele gebouw kantelde in de 3D-scène. Oorzaak: "up" werd op twee plekken bepaald en
die waren inconsistent geworden.

## Waar de globale oriëntatie zat + de oude aanname
- De model-group in de viewer krijgt zijn matrix uit `buildProjectMatrix()`
  (`src/lib/projectCoordinates.js`), toegepast op de group in
  `src/Viewer3D.jsx:1509` (`g.matrix.copy(projectMatrix)`).
- Die matrix bevatte een **vaste** `Rx(-90°)` (oud: `projectCoordinates.js`, regel
  `makeRotationX(-Math.PI / 2)`), d.w.z. de aanname **"IFC is altijd Z-up"** → roteer
  Z-up naar three.js Y-up.
- `ifcMmToThree`/`threeToIfcMm` hadden dezelfde vaste aanname (maar hebben geen
  callers).

Waarom dat een Y-up model kantelt: de wand-meshes worden in IFC-coördinaten
opgebouwd via `wallOrigin.heightAxis` (na FIX 1 = **y** voor BIL) en alleen mm→m
geschaald (`ifcToThree`). De group-matrix paste daarna alsnog `Rx(-90°)` toe →
three (0,1,0) ↦ (0,0,-1): de verticaal (Y) gaat naar -Z → het gebouw ligt plat.
(Bewijs in `spike/validate/orientation-validate.mjs`: Y-up verticaal door de vaste
Rx(-90°) → `(0, 0, -1)`.)

## De fix (alleen de globale oriëntatie-bepaling)
De globale oriëntatie gebruikt nu **dezelfde gedetecteerde up-as** als de per-wand-
afleiding (`detectModelUpAxis`):
- `projectCoordinates.js:28` — nieuwe module-state `_upAxis` (default `'z'`).
- `projectCoordinates.js:44-49` — `registerIfcContext` accepteert `context.upAxis`.
- `projectCoordinates.js:117-133` — `buildProjectMatrix` kiest `Rx` op basis van de
  up-as: `'y'` → **identity** (geen rotatie, al Y-up); `'z'` → `Rx(-90°)` (Z-up→Y-up,
  oude gedrag); `'z_neg'` → `Rx(+90°)`. `ifcMmToThree`/`threeToIfcMm` idem.
- `src/lib/ifc.js:471,1586` — `_readAndRegisterIfcContext` geeft de gedetecteerde
  `_upAxis` door aan `registerIfcContext`. Zo komt dezelfde as in de scène-matrix als
  in `deriveWallAxes`.
- Cache-doorgifte: `getProjectInfo().upAxis` + `restoreProjectInfo()` nemen de up-as
  mee, zodat een cache-hit dezelfde oriëntatie herstelt.
- `src/App.jsx:3901` — `CACHE_SCHEMA_V` 12→**13**: oude caches (met de oude, foute
  per-wand-as én zonder `upAxis`) worden ongeldig → opnieuw parsen met de juiste as.

De per-wand-afleiding en de bekledingslogica zijn **niet** aangeraakt.

## Validatie (`spike/validate/orientation-validate.mjs`, echte projectCoordinates.js)
De model-verticaal (= `heightAxis`) moet na de matrix op three **+Y** uitkomen:

| Geval | up-as | model-verticaal → three | Resultaat |
|---|---|---|---|
| Z-up model (conventie, ongewijzigd) | z | (0,0,1) → (0,1,0) | ✅ rechtop |
| Y-up model (BIL/Kubistisch na FIX 1) | y | (0,1,0) → (0,1,0) | ✅ rechtop |
| Z-neg model | z_neg | (0,0,-1) → (0,1,0) | ✅ rechtop |
| Regressie-bewijs (oud, vast Rx-90 op Y-up) | — | (0,1,0) → (0,0,-1) | ❌ (was de bug) |
| Cache-hit (getProjectInfo→restoreProjectInfo) | y | (0,1,0) → (0,1,0) | ✅ rechtop |

- **Z-up modellen kantelen NIET** (default `'z'` = exact het oude gedrag).
- **Y-up modellen staan nu rechtop** (geen rotatie).
- `npm run build` groen.

Nog handmatig (gebruiker): BIL-MOO + Kubistisch in de browser openen en bevestigen
dat het gebouw rechtop staat met openingen/steenstrippen op de verticale gevels.

Validatie-artefact: `spike/validate/orientation-validate.mjs`.

---

# DIAGNOSE 3 — BIL-MOO valt buiten beeld na FIX 2 (read-only, geen wijziging)

Symptoom: het model staat nu rechtop (FIX 2 werkt), maar BIL-MOO valt buiten beeld
terwijl het wél in de scène zit. Dit is een **knock-on van de matrix-compositie**.

## De volledige matrix (projectCoordinates.js:117-137)
`M = Ry(trueNorth) · Rx(upAxis) · T(-origin_m)`, toegepast op een punt p:
`M·p = Ry·Rx·(p − origin)`. Dus de **origin-translatie T wordt EERST toegepast (in
het IFC-frame), vóór de Rx-rotatie** (`:122` T, `:127` Rx, `:132` Ry, `:135-136`
samenstelling). De mm→m-schaal zit alleen in de origin (`origin·0.001`, `:118-120`);
de wand-coördinaten komen al in meters binnen (Viewer3D `ifcToThree` = /1000) en de
group krijgt M als matrix (`Viewer3D.jsx:1509`).

Gevolg van "T vóór Rx": de origin-vector `(ox,oy,oz)` wordt in IFC-assen afgetrokken
en daarná geroteerd. Welke wéreld-as elke origin-component raakt, hangt dus af van Rx
— precies het vermoeden uit de opdracht.

## Gemeten (BIL-MOO, `spike/validate/placement-diag.mjs`)
- **WorldCoordinateSystem origin** (ifc.js:514-518): `(x=111.185, y=471.935, z=0)`
  **km** — dit zijn RD-coördinaten (Rijksdriehoek): X/Y = horizontale RD-waarden,
  **Z = 0 = maaiveld**. De origin is dus in een **Z-up RD-conventie** (verticaal = Z).
- **Geometrie** (web-ifc GetFlatMesh, raw): bbox `X[-2,2..38,9] Y[-0,4..9,1]
  Z[-38,2..2,1]` m → **lokaal** (rond 0) en **Y-up** (hoogte ≈ 9,5 m in Y).
  → De geometrie en de origin zitten in **verschillende frames**: lokale Y-up
  geometrie vs. een Z-up RD-origin.

Three-wereld-bbox na M (zelfde echte `buildProjectMatrix`):

| | three-X (m) | three-Y = verticaal (m) | three-Z (m) | CameraInit |
|---|---|---|---|---|
| **OUD** (up=z, Rx−90) | 204600..204638 | **−38,2 .. 2,1** | 439538..439570 | buildingHeight=2,1 ; target Y=0,8 → model in beeld (plat) |
| **NIEUW** (up=y, identity) | −87380..−87324 | **−471935 .. −471925** | 68749..68786 | buildingHeight=max(maxY,0,1)=**0,1** ; target Y=0,0 ; model-Y=−471930 → **471 km mis** |

## Waarom NIEUW het model wegslingert (placement)
- `three-Y = (geom_y − oy)` want Ry roteert Y niet en Rx = identity. `oy = 471.934 m`
  (de RD-**Northing**) → `three-Y ≈ −471.930 m`. De **enorme horizontale RD-Northing
  belandt op de verticale as**.
- Bij OUD ging dezelfde `oy` via `Rx(−90°)` naar een **horizontale** as (three-Z), en
  was de verticaal `three-Y = geom_z − oz` met `oz = 0` → klein en netjes. Daarom
  werkte het toevallig: de origin had `oz = 0`, dus de verticaal bleef schoon.
- Kort: de origin-aftrek was afgestemd op de Z-up-aanname (verticaal = Z, `oz≈0`).
  Zodra Rx identity wordt (Y-up), valt de grote `oy` recht op de verticaal.

## Waarom de camera het niet terugvindt (framing, secundair)
`CameraInit` (`Viewer3D.jsx:1384`) berekent de bbox wél ná de matrix (`:1411`) en
hertriggert op `[walls, projectMatrix]` (`:1443`). Maar de fit heeft een Y-up/grond-
aanname: `buildingHeight = Math.max(maxY, 0.1)` (`:1425`) en camera op
`(cx, buildingHeight·2, cz+dist)` kijkend naar `(cx, buildingHeight·0.4, cz)`
(`:1436-1442`). Bij NIEUW is `maxY ≈ −471.925` (negatief) → `buildingHeight` klemt op
**0,1**; de camera kijkt op `Y≈0` terwijl het model op `Y≈−471.930` ligt → het model
valt 472 km onder beeld. De fit kan een model met sterk negatieve Y dus niet vinden.

## Oordeel: PLAATSINGS-probleem (primair), FRAMING (secundair)
1. **Placement (oorzaak):** `buildProjectMatrix` trekt de origin af in een Z-up
   RD-conventie (`oz=0`, `ox/oy` = grote horizontale RD-waarden), terwijl de geometrie
   lokaal en Y-up is. Onder de nieuwe identity-Rx valt de grote `oy` (RD-Northing) op
   de verticale as → model 472 km naar beneden. (Z-up modellen hebben `oz≈0` op de
   verticaal en blijven daarom schoon — geen regressie.)
2. **Framing (versterkt):** `CameraInit`'s `Math.max(maxY, 0.1)` gaat uit van een
   grond-verankerd Y≥0 model; bij sterk negatieve Y klemt het en richt de camera
   nooit op het model.

Het model wordt dus opgebouwd vanaf de **lokale, Y-up wand-coördinaten** (klein, rond
0), maar de **transform M verschuift het met de RD-origin** — en die verschuiving
beland sinds FIX 2 op de verticale as. Nog **geen** fix; dit stelt alleen het
beginpunt en de transform vast.

Validatie-artefact: `spike/validate/placement-diag.mjs`.

---

# FIX 3 — model verticaal rond de grond + camera framet het echte centrum

Twee delen, conform DIAGNOSE 3.

## Deel 1 — frame-bewuste origin-aftrek (placement, primair)
`src/lib/projectCoordinates.js`:
- `buildProjectMatrix` (`:122-129`): voor `_upAxis === 'y'` wordt de origin geremapt
  naar het geometrie-frame zodat de **verticaal de elevatie (`oz`) aftrekt, niet de
  Northing (`oy`)**: `T = makeTranslation(-ox, -oz, -oy)`. Voor `'z'`/`'z_neg'`
  blijft `T = makeTranslation(-ox, -oy, -oz)` (Rx routeert `oz` naar de verticaal) —
  **byte-identiek aan vóór de fix → geen verschuiving voor Z-up**.
- `ifcMmToThree` (`:163-166`) en `threeToIfcMm` (`:216-219`) kregen dezelfde
  frame-bewuste aftrek (geen callers, maar coherent gehouden).

## Deel 2 — camera framet het werkelijke bbox-centrum (framing, secundair)
`src/Viewer3D.jsx` `CameraInit` (`:1423-1444`): vervangt de grond-aanname
`buildingHeight = max(maxY, 0.1)` door het **werkelijke centrum** `cy=(minY+maxY)/2`
en omvang over alle drie de assen; camera kijkt naar `(cx,cy,cz)` vanaf
`(cx, cy + span·0.5, cz + dist)`. Zo wordt het model gevonden waar de verticale
extent ook ligt (target == centrum).

## Gemeten (echte buildProjectMatrix, `spike/validate/placement-diag.mjs` + `place-check.mjs`)
WCS-origin BIL = `(111.185, 471.935, 0)` km (RD; `oz`=elevatie=0).

| Model | up | verticaal three-Y (m) | rond grond? |
|---|---|---|---|
| BIL-MOO — vóór FIX 3 | y | **−471.935 .. −471.925** | ❌ 472 km omlaag |
| BIL-MOO — ná FIX 3 | y | **−0,4 .. 9,1** | ✅ |
| Kubistisch (origin 0,0,0) | y | −0,1 .. 5,7 | ✅ |
| Z-up (oz=elevatie≠0), regressie | z | elevatie−oz = **0** | ✅ ongewijzigd |

- **BIL staat nu verticaal rond de grond** (−0,4..9,1 m) i.p.v. 472 km omlaag; camera
  target = centrum → in beeld, rechtop.
- **Z-up ongewijzigd**: het `'z'`-pad trekt nog steeds `oz` van de verticaal af
  (synthetische check: elevatie 5 m − `oz` 5 m → three-Y = 0). Geen regressie.
- De horizontale offset (Easting/Northing) blijft ~honderden km (zoals OUD: BIL
  ~485 km), maar dat is **horizontaal** en de camera volgt het centrum — geen
  zichtbaar probleem, gelijk aan het gedrag vóór FIX 2.

## Merge / federatie — bevestigd ongewijzigd
De origin-/translatiecomponent **valt weg in relatieve plaatsing**:
`M·p₂ − M·p₁ = R·(p₂−p₁)` (translatie cancelt). Gemeten verschil `1,2·10⁻¹¹`
(`placement-diag.mjs`). De origin (en de remap) is een **globale** verschuiving voor
álle wanden; relatieve posities tussen modellen bij merge blijven dus exact gelijk.

## Overige validatie
- `spike/validate/orientation-validate.mjs`: rotatie-checks nog steeds groen (alleen
  de translatie is aangepast, niet `Rx`).
- `npm run build` groen.

Nog handmatig (gebruiker): BIL-MOO + Kubistisch in de browser — rechtop, rond de
grond, in beeld, openingen/steenstrippen op de verticale gevels; en een merge van
twee modellen nog correct t.o.v. elkaar.

Validatie-artefacten: `spike/validate/placement-diag.mjs`, `spike/validate/place-check.mjs`.

---

# DIAGNOSE 4 — dakrand-elementen krijgen geen steenstrippen (read-only)

> Kanttekening: ik kon het specifieke "dakrand-IFC" niet lokaliseren (een tekst-zoek
> op "dakrand" in de gevonden IFC's gaf 0 treffers) en dus niet meten. Onderstaande
> is code-pad-analyse met file:line; waar meting nodig is om DE exacte gate te
> bevestigen, staat dat expliciet.

## Conclusie vooraf: GEEN cladding-type-filter; het is een TYPE-gate bij IMPORT + een GEOMETRIE/VLAK-gate bij de frame/gevel-afleiding
De bekleding/strip-stap zelf slaat niets over op type. De dakrand valt eerder uit:
bij het importeren (alleen bepaalde types) en/of bij de vlak-afleiding (bbox→hoogte).

## 1. Wat zijn de dakrand-elementen?
Niet te meten zonder het model, maar af te leiden uit de code-paden:
- De **hoofd-import** (`confirmImport → runNewEngineAdapter → parseIfc`) laadt
  **uitsluitend** `IFCWALLSTANDARDCASE` + `IFCWALL` (`src/lib/ifc.js:1316`). Een
  dakrand die als IfcWall is gemodelleerd komt hier binnen; een dakrand als
  IfcSlab/IfcCovering/IfcMember/IfcBuildingElementProxy/IfcPlate **niet**.
- De **zone-/merge-import** (`parseIfcZoneElements`) laadt een bredere set:
  `IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCBUILDINGELEMENTPROXY, IFCCOVERING,
  IFCCURTAINWALL, IFCPLATE, IFCMEMBER, IFCELEMENTASSEMBLY` (`ifc.js:2567-2571`),
  maar **alleen de door de gebruiker geselecteerde types** (`allowedTypes`,
  `ifc.js:2586-2588`).
→ Dat de dakrand überhaupt zichtbaar/gegroepeerd is, betekent dat hij via de
  zone-/merge-import is geladen (een niet-wand-type) **of** toch een IfcWall is.
  De NL-SfB-code staat in de typenaam (zelfde mechanisme als de wanden, bv. `27.x`
  dak / `21.2x`), maar zonder het model niet af te lezen.

## 2. Waar valt hij uit de strip-pijplijn?

### (a) Cladding-stap: GEEN type/classificatie-filter — bevestigd
In `App.jsx` `allPatterns` (`:3240`) wordt per groep alleen gefilterd op het
hebben van een `wallOrigin`:
- `:3246-3247` `const withOrigin = walls.filter(w => w.wallOrigin); if (!withOrigin.length) continue;`
- `:3268` `buildFullGroupFacadePattern(walls, …)` — geen check op IfcType of NL-SfB.

Idem in `pattern.js:293`: `if (!withOrigin.length || lagenmaat <= 0) return null;`.
**Dus een gegroepeerd dakrand-element met een geldige `wallOrigin` wordt WÉL
behandeld** — het wordt niet overgeslagen omdat het "geen wand" is.

### (b) Frame/gevel-afleiding: GEOMETRIE-gates (de waarschijnlijke oorzaak)
Het gevelvlak/strip-raster komt volledig uit `wallOrigin` (bbox → `deriveWallAxes`
→ hoogte → rijen). Twee plekken waar een dakrand degenereert:

1. **Parse-guard** (`ifc.js:2661`, zone) / (`:1370`, wand):
   `if (length < 100 || height < 100) continue;`. `height` = verticale extent via
   `deriveWallAxes` (`ifc.js:734`). Een dunne/platte dakrand-cap (verticale extent
   < 100 mm) wordt hier **helemaal niet geïmporteerd** → kan niet gegroepeerd/geclad
   worden. (Als de gebruiker tóch gegroepeerde dakrand-dozen ziet, is deze guard
   gepasseerd en is hoogte ≥ 100 mm.)

2. **Gevel-afleiding** `buildFullGroupFacadePattern` (`pattern.js:288`):
   - `refWall` = langste element; `refLengthAxis = refWall.wallOrigin.lengthAxis`;
     `axisWalls = withOrigin.filter(lengthAxis === refLengthAxis)` (`:296-299`).
     Dakrand-elementen die **een andere lengte-as** hebben dan de referentie (bv. een
     dakrand loopt langs X, de referentie langs Z) vallen uit `axisWalls` → tellen
     niet mee voor het gevelvlak.
   - Het strip-raster `rows` komt uit `groupHeight` (verticale extent van de
     `axisWalls`) en `lagenmaat` (`:307-316`, `:447`). Is de bruikbare verticale
     extent klein/degeneraat, dan collapse de rijen → (vrijwel) geen strippen.
   - De strippen worden bovendien op het **referentie-buitenvlak** geplaatst
     (`refWallOrigin.outsidePos`); ligt de dakrand op een andere dikte/diepte dan de
     wand, dan landen de strippen niet op het dakrand-oppervlak.

### (c) Up-as-afhankelijkheid (alleen relevant bij een dakrand-ZONDER-wanden-model)
`deriveWallAxes` gebruikt de model-up-as. Bij dit model staan er wél onderliggende
wanden (die krijgen strippen), dus `detectModelUpAxis` (`ifc.js:2596`, sampelt
`[IFCWALLSTANDARDCASE, IFCWALL]`) heeft wand-samples → up-as correct → de dakrand
gebruikt dezelfde (juiste) up-as. **Een verkeerde up-as is hier dus niet de
oorzaak** (dat zou alleen spelen bij een import zónder wanden, waar
`detectModelUpAxis` op `'z'` terugvalt).

## Oordeel
- **Geen cladding-type/filter-kwestie**: de strip-stap behandelt elk gegroepeerd
  element met `wallOrigin`, ongeacht IfcType/NL-SfB (`App.jsx:3240-3268`,
  `pattern.js:293`).
- **Wel een TYPE-gate bij IMPORT**: niet-wand-dakranden komen alleen binnen via de
  zone-/merge-import en alleen als hun type is geselecteerd (`ifc.js:1316` vs
  `:2567-2571`/`:2586-2588`).
- **Vooral een GEOMETRIE/VLAK-kwestie**: de strip-engine leidt het gevelvlak puur uit
  de bbox-hoogte van `wallOrigin` af. Dakrand-geometrie (dun/plat/schuin, vaak met
  afwijkende lengte-as of diepte) wordt óf door de `height < 100`-guard
  (`ifc.js:2661`) gedropt, óf levert via `buildFullGroupFacadePattern` (`pattern.js:288`,
  filter `:296-299`, rijen uit `groupHeight` `:307-316`) een degeneraat/leeg of
  verkeerd-geplaatst raster op → geen doorlopend gevelvlak → geen strippen. Dat sluit
  aan bij het vermoeden in de opdracht.

Te bevestigen met het model: IfcType + NL-SfB van een dakrand-element, zijn bbox
(dx,dy,dz) en de `deriveWallAxes`-uitkomst (height/lengthAxis), plus of zijn groep
`rows` oplevert in `buildFullGroupFacadePattern`. Nog **geen** fix.

---

# METING (DIAGNOSE 4 bevestigd) — `BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc`

Gemeten met `spike/validate/dakrand-meet.mjs` (verbatim `getBBox`, `deriveWallAxes`,
`getFacadePolygon` + de nieuwe up-as-logica). Read-only.

## 1. Wat zijn de dakrand-elementen?
Entity-types in het IFC: **IfcPlate 445, IfcBuildingElementProxy 181, IfcCovering 89,
IfcElementAssembly 50** — en **0 × IfcWall**, 0 × IfcWindow/IfcDoor.
Typenamen zijn Tekla-plaatprofielen: **`PL9*743`, `160*749`, `BRUTO_ELEMENT`** —
dit zijn **geen NL-SfB-codes** (geen `21`/`27`-prefix). Contrast: BIL-wanden heten
`21.10_WA_LB_HSB_…` (NL-SfB aanwezig).

## 2. DE OORZAAK (gemeten): up-as valt terug op 'z' omdat er geen wanden zijn
`parseIfcZoneElements` roept `detectModelUpAxis(api, modelID, [IFCWALLSTANDARDCASE,
IFCWALL])` aan (`src/lib/ifc.js:2596`). Dit IFC heeft **0 wanden** → de detectie
valt terug op **`axis:'z'` (bron `geen-wanden`)**. Maar de dakrand-geometrie is
Y-up (zoals de rest van het gebouw): de **gedeelde maat is ~743 mm in Y** (de
dakrand-hoogte), de variabele maat is de lengte in Z, en de dunne maat is X.

Gevolg via `deriveWallAxes(dx,dy,dz,'z')` (`ifc.js:692`) — **hoogte en lengte
verwisseld**:

| Element | type | bbox dx×dy×dz (mm) | deriveWallAxes('z') | had moeten zijn (up='y') |
|---|---|---|---|---|
| #10748 | PL9*743 | 9 × 743 × 2400 | height=**2400** length=743 thick=9 (hA=z, lA=y) | height=743 length=2400 |
| #10768 | 160*749 (BRUTO_ELEMENT) | 160 × 749 × 3284 | height=**3284** length=749 thick=160 | height=749 length=3284 |
| #10732 | PL9*743 | 9 × 743 × 954 | height=**954** length=743 thick=9 | height=743 length=954 |

De "hoogte" wordt dus de horizontale lengte (954–3284 mm) en het gevelvlak komt op
het verkeerde (horizontale) vlak te liggen — dezelfde klasse fout als de HSB-bovenvlak,
maar nu omdat de up-as op `'z'` terugvalt i.p.v. de geometrie te volgen.
`getFacadePolygon` geeft wél een geldige poly (4–8 hoekpunten), dus **facadePoly is
niet de blokkade**.

## 3. Compounderende geometrie-gates (ook gemeten)
- **Parse-guard `length<100 || height<100`** (`ifc.js:2661`): de **horizontale
  cap-platen** (dz≈9–12 mm) krijgen met up='z' `height=9` → **SKIP**. Een deel van de
  dakrand wordt dus niet eens geïmporteerd. (De verticale platen, dz=954–3284,
  passeren — vandaar dat er tóch groepeerbare dakrand-dozen zijn.)
- **`buildFullGroupFacadePattern` axisWalls-filter** (`pattern.js:296-299`): de
  dakrand loopt in twee richtingen → **lengte-as-verdeling y:224 / x:176**. De
  referentie pakt `lengthAxis='x'`, dus **224 van de 400 dakrand-platen vallen uit
  `axisWalls`** en tellen niet mee voor het gevelvlak.
- `groupHeight` = 40168 mm (door de verwisselde as) → `rows`-aantal is groot, dus de
  rijen **collapsen niet**; ze worden alleen op het **verkeerde vlak** en voor
  **slechts een deel** van de platen gegenereerd → visueel geen kloppende
  gevelstrippen op de dakrand.

## 4. Geen cladding-type-filter (herbevestigd)
De strip-stap (`App.jsx:3246-3268`, `pattern.js:293`) filtert niet op IfcType/NL-SfB;
elk gegroepeerd element met `wallOrigin` wordt behandeld. De dakrand valt dus **niet**
weg omdat het "geen wand" of "geen NL-SfB" is.

## Eindoordeel (gemeten)
**GEOMETRIE/VLAK-kwestie**, met als hoofdoorzaak de **up-as-terugval naar 'z' voor een
wand-loos dakrand-IFC** (`detectModelUpAxis`, aangeroepen op `[WALL,WALLSTANDARDCASE]`
in `ifc.js:2596`; dit bestand heeft 0 wanden). Daardoor verwisselt `deriveWallAxes`
hoogte/lengte op de Y-up dakrand-geometrie → gevelvlak op het verkeerde vlak. Daar
bovenop: de `height<100`-guard dropt de horizontale cap-platen, en het
`axisWalls`-filter laat 224/400 platen vallen. **Geen** type/NL-SfB-filter in de
bekleding. Nog **geen** fix.

Validatie-artefact: `spike/validate/dakrand-meet.mjs`.

---

# ANALYSE 5 — voldoet de groepering aan "losse elementen → één in lijn liggend gevelvlak"? (read-only)

Doel: meerdere losse elementen (evt. verschillende types/oriëntaties, kleine
verschillen in diepte/positie) groeperen tot **één coplanair, in lijn liggend
gevelvlak** met een doorlopend patroon. Analyse van `buildFullGroupFacadePattern`
(`src/lib/pattern.js`) + de groep-flow (`src/App.jsx:3240+`) en de groepering
(`src/lib/adjacency.js`).

## 1. Eén gemeenschappelijk (best-fit) vlak, of een referentie-element?
**Referentie-element, geen best-fit vlak.**
- `refWall = langste element` (`pattern.js:296`); zijn assen bepalen het frame:
  `refLengthAxis = refWall.wallOrigin.lengthAxis`, `refHeightAxis = …heightAxis`
  (`:297-298`).
- Het gevelvlak is één rechthoek in die **globale assen**: `groupMinX/groupMaxX`,
  `groupMinH/groupMaxH` uit de leden (`:301-304`); breedte/hoogte daaruit
  (`:306-307`). Er wordt **geen** vlak-normaal gefit en **geen** lid op een
  gemeenschappelijk vlak geprojecteerd — leden leveren alleen hun bbox-extents langs
  de globale ref-assen. De groep geeft één `refWallOrigin` terug (`:490`) als enige
  referentie (ook voor diepte/oriëntatie). Niet-as-uitgelijnde (geroteerde) leden
  degenereren dus, want `lengthAxis/heightAxis` zijn altijd `x|y|z`
  (`deriveWallAxes`, `ifc.js:692`).

## 2. axisWalls — afwijkende lengte-as: uitgelijnd of gefilterd?
**Gefilterd (niet bekleed), niet uitgelijnd.**
`axisWalls = withOrigin.filter(w => w.wallOrigin.lengthAxis === refLengthAxis)`
(`pattern.js:299`). `groupWidth/Height` en de rijen komen **alleen** uit `axisWalls`
(`:301-307`, `:447-449`). Leden met een andere lengte-as (bv. een dakrand/gevel die
de hoek omgaat, een loodrechte run) tellen **niet** mee en krijgen via deze groep
**geen** strippen. (Gemeten in ANALYSE-METING: 224 van 400 dakrand-platen vielen zo
weg.)

## 3. Diepte/offset — projectie op één vlak, of strippen op het referentievlak?
**Strippen op het referentievlak; geen projectie.** Het patroon wordt puur in het
`(lengthAxis × heightAxis)`-vlak gebouwd; de derde as (dikte/diepte) wordt
genegeerd. Bij het renderen plaatst `getGroupBrickPos` (`src/Viewer3D.jsx:247-254`)
álle strippen op de buitenzijde van de **ene** `refWallOrigin`
(`getOutsideFaceInfo(rwo, …)`, `Viewer3D.jsx:85-90`). Leden op een iets andere diepte
krijgen dus strippen op de ref-diepte en **missen hun eigen oppervlak**.
De groepering begrenst dit vooraf: `detectAdjacencies` eist
`thicknessAxis` gelijk én `|thicknessStart-verschil| ≤ TOL(25 mm)`
(`adjacency.js:15-16`, `:67-68`). Dus diepteverschillen > 25 mm leiden **niet** tot
projectie maar tot **aparte groepen** (geen eenwording).

## 4. Doorlopend patroon over de hele groep?
**Doorlopend en uitgelijnd, maar alleen over de gelijke-lengte-as-subset.**
Per rij bouwt `buildRowPiecesForWidth(effectiveWidth, material, verband, r, 0)`
(`pattern.js:449`) één verband over de **volledige** groepsbreedte; rij-index `r`
geeft de verticale verspringing → het patroon is continu en uitgelijnd over de hele
`axisWalls`-span (niet per element). Maar loodrechte/andere-as leden zitten in een
**andere groep** met een eigen patroon; over een hoek of richtingswissel loopt het
patroon dus **niet** door als één vlak (hoeken gaan apart via `cornerConfigs`/
`cornerWraps`, niet als één gefit vlak).

## Conclusie: DEELS
De engine ondersteunt "losse elementen → één in lijn liggend gevelvlak" **deels**:
- **Wel** voor leden die al (near-)coplanair zijn (≤ 25 mm), **dezelfde globale
  lengte-as** delen (parallel, op één lijn langs x/y/z) en as-uitgelijnd zijn → dan
  is het één continu, uitgelijnd gevelvlak.
- **Niet** voor het bredere doel. Wat ontbreekt:
  1. **Best-fit groepsvlak**: er wordt geen gemeenschappelijk vlak (normaal + 2D-frame)
     op álle leden gefit; in plaats daarvan dienen de globale assen van het langste
     element als referentie (`pattern.js:296-307`). Geroteerde/niet-as-uitgelijnde
     leden degenereren.
  2. **Insluiten ongeacht lengte-as/type**: leden met afwijkende `lengthAxis` worden
     weggefilterd i.p.v. op het gemeenschappelijke vlak geprojecteerd
     (`pattern.js:299`).
  3. **Diepte-normalisatie**: leden op verschillende diepte worden niet op één vlak
     geprojecteerd; strippen blijven op de ref-diepte (`Viewer3D.jsx:247-254`), en de
     groepering knipt alles > 25 mm uit elkaar (`adjacency.js:15-16,67-68`).
  4. **Groeperen van heterogene losse elementen**: `detectAdjacencies` eist
     gelijke `thicknessAxis/lengthAxis/heightAxis` **én** rakende randen
     (`adjacency.js:15-41`, `:67-94`). Losse elementen met gaten, andere oriëntatie of
     ander type vormen daardoor niet één groep.

Kort: de huidige aanpak is "langste-element-as als referentierooster + gelijke-as-
filter + ref-diepte", niet "best-fit coplanair vlak met projectie van alle leden".
Voor het gestelde doel ontbreekt de best-fit-vlak-afleiding met projectie (punt 1-3)
en een groeperings­criterium dat coplanaire leden ongeacht as/type/raking samenneemt
(punt 4). Geen fix.
