FASE 0d — SNAP-AUDIT @ 9130bba
snapFn op App.jsx:4874 = null

**Modus** READ-ONLY MEET — niets aan bestaande code gewijzigd, geen commit.
Spike: [spike/diagnose/kramatweg-crosscheck.mjs](spike/diagnose/kramatweg-crosscheck.mjs) (FASE 0d-blok) +
[spike/diagnose/bilmoo-extract.cjs](spike/diagnose/bilmoo-extract.cjs) (web-ifc node-extractie). Wegwerp.

**Route-keuze (S3–S6):** De app-pijplijn (`parseIfc` → groeperen → best-fit-vlak → `facadeData`) is
browser-gekoppeld (`getApi()` steunt op `window.WebIFC`, [ifc.js:414](src/lib/ifc.js#L414)) en niet
headless te reproduceren; de vaste import-route met native bestandskiezer + type-filter "21" is hier
niet betrouwbaar te automatiseren. Ik koos een **hybride**: (a) **echte** WallStandardCase-hoogtes uit
`public/BIL-MOO-A-ZZ-PBP.ifc` via de **web-ifc node-API** (ruwe bbox), en (b) die hoogtes door de
**echte `panelizeZone` + `buildFacePattern`** halen (dezelfde functies, `snapFn=null` zoals
[App.jsx:4874](src/App.jsx#L4874)). Materiaal = `DEFAULT_MATERIAL` (steenH 50, lint 12 → **laagmaat 62**,
[App.jsx:34](src/App.jsx#L34)). Grens: dit zijn per-instantie-bbox-hoogtes, niet de 4 app-gevelgroep-
hoogtes (die = ONBEKEND headless), maar voor de structurele ja/nee-claims is de exhaustieve sweep sterker.

---

## S1 — waar wordt de paneelhoogte gekozen; wat is snapFn 🟢
`snapFn` = **`null`** op [App.jsx:4874](src/App.jsx#L4874) (`panelizeZone(zone, battenYs, basePanel, null, mat, verband)`).
Het is een **echte parameter** (default `null`, [panelization.js:464](src/lib/panelization.js#L464)),
**alleen toegepast op de Y-break-subverdelingen** — `snapFn ? round2(snapFn(raw)) : raw` op
[panelization.js:491](src/lib/panelization.js#L491) en [:515](src/lib/panelization.js#L515) — dus op de
**hoogte**, niet de breedte. Gevuld (zoals de drie andere callers: [App.jsx:5068](src/App.jsx#L5068),
[View2D.jsx:127](src/View2D.jsx#L127), [Werktekening.jsx:424](src/Werktekening.jsx#L424), allen
`snapToRowY` = snap naar dichtstbijzijnde `facadeData.rows[].y`) snapt het de interne horizontale
paneelbreuken op een laag-o.k.; **alleen de mal-recept-caller laat hem `null`** → interne breuken
ongesnapt.

## S2 — grenzen op de paneelhoogte 🟢
`basePanel` uit **`computeEffectiveBasePanel`** ([panelization.js:704-730](src/lib/panelization.js#L704)):
`height = min(panelen.hoogte, gewichtslimiet)` ([:712](src/lib/panelization.js#L712), harde max via
`maxAreaMM2 = (maxKg/totalW)·1e6` [:711](src/lib/panelization.js#L711)), `maxHeight = panelen.hoogte`
(**doel**), `minHeight = 800` (**hard**, [:725](src/lib/panelization.js#L725)). In `panelizeZone` komen
de Y-breaks uit `battenYs` + zone-randen, gesubdivideerd op `bpH`/`maxH` ([:482-521](src/lib/panelization.js#L482)).
De **plaatmaat 3400** (`moldLengte`) begrenst de hoogte **niet** — dat is de mal-lengterichting
([:659](src/lib/panelization.js#L659)). Dus: UI `panelen.hoogte` (doel) + gewichtslimiet (harde max) +
`minHeight 800` (harde min); doelwaarden, geen strak veelvoud van laagmaat.

## S3 — echte BIL-MOO-hoogtes, H mod laagmaat 🟢
Web-ifc node telt **4048 WallStandardCase-instanties** (de app importeert er via type-filter maar 4);
**455** met verticale extent ≥ 1000 mm. Van die 455 heeft **2,6 %** `H mod 62 == 0`; over de 32 unieke
hoogtes (1000…12200 mm) **1/32 = 3,1 %**. **Vrijwel geen enkele echte gevelhoogte is een heel veelvoud
van de laagmaat.**

## S4 — eerste paneel-lokale hart == steenH/2? 🔴 (meestal niet)
Over 532 panelen (echte hoogtes): eerste paneel-lokale hart == `steenH/2` (25 mm) bij **slechts
24,1 %**; fijne sweep H=800..6000 (64.436 panelen): **32,3 %**. Histogram wordt gedomineerd door **31 mm**
(344 panelen) = `lint/2 (6) + steenH/2 (25)` — want `panel.y0` valt op een **batten (lintvoeg-midden)**,
niet op een laag-o.k.; drie tegenvoorbeelden: `{H:1600, panelY0:800, localFirst:31}` (×3). De aanname
"strip-o.k. = paneel-o.k." klopt dus alleen voor het **onderste** paneel (`y0=0`) en toevalstreffers.

## S5 — kruist een laag een horizontale paneelnaad? 🔴 JA
`o.k. < panel.y1 < b.k.`: **140** gevallen (echte hoogtes), bv. `H=1000, rowOK=992, panelY1=1000` — de
**bovenrand** knipt de laatste (ceil-)laag. `o.k. < panel.y0 < b.k.`: **56** gevallen, bv.
`H=9600, rowOK=1178, panelY0=1200` — een **interne naad op 1200 mm** (subdivisie-break, `1200 mod 62 = 22`)
snijdt laag r=19 middendoor. Fijne sweep: **16.460** laag-kruist-bovenrand-gevallen. Interne naden
snijden dus courses **omdat `snapFn=null`** ([App.jsx:4874](src/App.jsx#L4874)) de breuk niet op een
`row.y` snapt.

## S6 — lintvoeg-reservering bovenaan een paneel? 🟠 wisselend
Verdeling `panel.y1 − (b.k. bovenste hele laag)`: dominant **6 mm** (348 panelen) = `lint/2` (panelen die
op een batten/lintvoeg-midden eindigen), maar de rest is **willekeurig** (0,2,4,8,…,60 mm) voor de
gevel-bovenrand en de subdivisie-panelen. Dus **geen** consistente reservering van één lintvoeg of 0 —
het hangt af van of `panel.y1` op een batten of op de (ongesnapte) gevelrand/subdivisie valt.

## S7 — kunnen twee zones verschillende LAAGMAAT hebben? 🟠 JA
`buildStripZoneRegions` bouwt elke zone met **eigen materiaal** `zoneMat = {...mat, ...zone.material}`
([zoneRegions.js:145](src/lib/zoneRegions.js#L145)) via `buildZoneBondRows(zW, zH, zoneMat, …)`
([:150,160](src/lib/zoneRegions.js#L160)) → `buildFacePattern` gebruikt `getLagenmaat(zoneMat) =
zoneMat.steenH + zoneMat.lint`; verschillende `steenH`/`lint` per zone ⇒ **verschillende laagmaat**
(achter `featureZones`, default **AAN**, [featureFlags.js:183](src/lib/featureFlags.js#L183)). Panelen
komen uit `buildFacadeZones`/`panelizeZone` die de stripZones **niet kennen**, dus **één paneel kan twee
laagmaat-zones overlappen**; laagmaat is **niet** gegarandeerd constant per gevelvlak. (Kanttekening: de
mal-recept zelf gebruikt de groep-`mat` en negeert per-zone laagmaat — een aparte divergentie.)

## S8 — 12-koloms kopregel (letterlijk) 🟢
```
Groep;Zone;Paneel;Breedte mm;Hoogte mm;Dikte mm;Rijen totaal;Rijen per mal;Mal-doorgang;Doorgangen totaal;Lagenmaat mm;Slede posities in mal (mm)
```
(bron-array [App.jsx:4814](src/App.jsx#L4814); scheidingsteken `;`, elk veld ge-quote, CRLF, UTF-8+BOM).

## S9 — `max(1,` in het generateMoldRecipe-pad 🟢
Twee plekken, beide in `generateMoldRecipe`: `rowsPerMold = Math.min(3, Math.max(1, Math.floor(moldHoogte/lagenmaat)))`
([panelization.js:660](src/lib/panelization.js#L660)) en `totalRows = Math.max(1, Math.floor(panel.height/lagenmaat))`
([panelization.js:664](src/lib/panelization.js#L664)). (Upstream in `computeEffectiveBasePanel` staat
`Math.max(100, …)` [:705-706](src/lib/panelization.js#L705); geen `|| 1`.) Alleen gelokaliseerd, niet gewijzigd.

---

## SLOT (exact drie zinnen)
(1) **yCenter[k] = steenH/2 + k·laagmaat geldt paneel-lokaal alleen soms — gemeten 24,1 % van de panelen
(fijne sweep 32,3 %)** — namelijk enkel wanneer `panel.y0` op een laag-o.k. valt (vooral het onderste
paneel); voor de bovenliggende panelen begint de eerste laag op `lint/2 + steenH/2` (31 mm) omdat
`panel.y0` op een lintvoeg-midden ligt, dus de biconditional "waar dan en slechts dan als H een veelvoud
van laagmaat is" is te zwak (het vereist óók `panel.y0` op een laag-o.k.).
(2) **Ja, een laag snijdt een paneelnaad**: 56 interne naad-sneden (`o.k. < panel.y0 < b.k.`) + 140
bovenrand-sneden op de echte hoogtes (16.460 in de fijne sweep).
(3) **snapFn moet gevuld worden op [App.jsx:4874](src/App.jsx#L4874)** (met een `snapToRowY` zoals de
andere drie callers [App.jsx:5068](src/App.jsx#L5068)/[View2D.jsx:127](src/View2D.jsx#L127)/[Werktekening.jsx:424](src/Werktekening.jsx#L424)),
en **er moet een nieuwe functie de `facadeData.rows[]` op de paneelgrenzen snijden** — die bestaat nu
niet (`detectKoppelstrippen` [panelization.js:608](src/lib/panelization.js#L608) tagt alleen, snijdt
niet; `View2D` [View2D.jsx:154-156](src/View2D.jsx#L154) knipt alleen in X en alleen voor weergave),
logische plek: naast `panelizeZone`/`detectKoppelstrippen` in [panelization.js](src/lib/panelization.js),
aangeroepen vanuit `handleExportMalRecept` ([App.jsx:4867-4889](src/App.jsx#L4867)).
