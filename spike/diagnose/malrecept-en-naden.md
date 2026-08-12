# READ-ONLY DIAGNOSE — handleExportMalRecept + paneelnaad-snapping + machine-crosscheck

**Worktree** `C:\dev\brickboard` @ **9130bba** (branch `brickboard`)
**Modus** READ-ONLY MEET — niets aan bestaande code gewijzigd, geen commit.
Spike: [spike/diagnose/kramatweg-crosscheck.mjs](spike/diagnose/kramatweg-crosscheck.mjs) (wegwerp).

---

## A — WAT DOET handleExportMalRecept AL?

### A1 — locatie, input, exact uitvoerformaat 🟢
Functie **`handleExportMalRecept()`** [App.jsx:4813](src/App.jsx#L4813-4905). Input: alle `groups`
met `s.panelen.enabled` (loopt over gevelgroepen [App.jsx:4817-4819](src/App.jsx#L4817)); per groep
`buildFullGroupFacadePattern` + `panelizeZone` + **`generateMoldRecipe`** ([panelization.js:653](src/lib/panelization.js#L653)).
**Uitvoer:** `.csv`, scheidingsteken **`;`**, **elk veld ge-quote** (`"..."`, ingebedde quotes verdubbeld),
regeleinde **CRLF** (`\r\n`), encoding **UTF-8 mét BOM** (`'﻿' + csv`), **één kopregel**
([App.jsx:4897-4903](src/App.jsx#L4897)); bestandsnaam `mal-recept.csv`. Kolommen (12,
[App.jsx:4814](src/App.jsx#L4814)): `Groep, Zone, Paneel, Breedte mm, Hoogte mm, Dikte mm,
Rijen totaal, Rijen per mal, Mal-doorgang, Doorgangen totaal, Lagenmaat mm, Slede posities in mal (mm)`.

### A2 — representatief fragment 🟢
**Geen fixture in de repo** (`mal-recept.csv` bestaat nergens; download-only). Fragment
**gegenereerd via de spike** (invoer Kramatweg 1972×434, halfsteens), in het exacte export-formaat:
```
"Groep";"Zone";"Paneel";"Breedte mm";"Hoogte mm";"Dikte mm";"Rijen totaal";"Rijen per mal";"Mal-doorgang";"Doorgangen totaal";"Lagenmaat mm";"Slede posities in mal (mm)"
"Kramatweg";"Z1";"Z1-P1";"990";"434";"8";"3";"2";"1";"2";"110";"50 | 160"
"Kramatweg";"Z1";"Z1-P1";"990";"434";"8";"3";"2";"2";"2";"110";"50"
"Kramatweg";"Z1";"Z1-P2";"877";"434";"8";"3";"2";"1";"2";"110";"50 | 160"
"Kramatweg";"Z1";"Z1-P2";"877";"434";"8";"3";"2";"2";"2";"110";"50"
"Kramatweg";"Z1";"Z1-P3";"99";"434";"8";"3";"2";"1";"2";"110";"50 | 160"
"Kramatweg";"Z1";"Z1-P3";"99";"434";"8";"3";"2";"2";"2";"110";"50"
```
De "Slede posities" komen uit `r*lagenmaat + round(steenH/2)`, **per maldoorgang teruggezet naar 0**
([panelization.js:670-671](src/lib/panelization.js#L670)).

### A3 — per groep/paneel? x of striplengtes? lagen? 🟢
Per **paneel** (loop over `panels`, [panelization.js:663](src/lib/panelization.js#L663)), gegroepeerd
per groep. Bevat **lagen als Y** (`slede posities` = rij-harten binnen de mal, mal-lokaal) maar
**GEEN x-posities en GEEN striplengtes** — de piece-`start`/`length` uit `facadeData.rows` komen er
niet in ([panelization.js:673-686](src/lib/panelization.js#L673) schrijft alleen tellingen + Y-slede).
Dit is dus een **mal-doorgang-/slede-schema (alleen Y)**, **geen** vulschema met stripposities.

### A4 — betekenis van "mal" 🟢
"Mal" = de **fysieke productie-mal/staalplaat** waarin strips per rij worden gelegd (slots, notches,
pinnen; `_moldGeometry` [panelization.js:732](src/lib/panelization.js#L732), notch-Xs 270…3070,
staalplaat 2 mm changelog [App.jsx:363](src/App.jsx#L363)) — **machine-gerelateerd**, niet
plaatmal/beplating. `rowsPerMold = min(3, floor(malHoogte/lagenmaat))` ([panelization.js:660](src/lib/panelization.js#L660))
= hoeveel strip-rijen tegelijk in de mal passen; `detectKoppelstrippen` ([panelization.js:608](src/lib/panelization.js#L608))
bewaakt strips die ná het malwerk over een paneelnaad heen gelijmd worden (onsite). "Mal" ≠ paneel.

### STOP-conditie A — NIET getriggerd 🟢
`handleExportMalRecept` schrijft **geen** striplengtes + x-posities per rij per paneel (A3). Er is dus
**geen bestaande exporter die het vulschema al levert** → we hoeven niet te stoppen; het huidige
recept is uit te breiden, niet te dupliceren.

---

## B — SNAPPEN DE PANEELNADEN?

### B1 — verticale naden 🟠 (gesnapt op stootvoeg, maar kruist tóch in halfsteens)
Paneelbreedte wordt **niet vrij** gekozen: `nCols = max(1, round(zone.width/targetW))`
([panelization.js:523](src/lib/panelization.js#L523)); bij `nCols>1` met materiaal+verband
(`hasStripAlign`) worden de x-breaks **gesnapt op stootvoeg-einden** via
`collectStootvoegBreaks`→`chooseBreaks` ([panelization.js:529-535, 449-462](src/lib/panelization.js#L529)).
**MAAR** `collectStootvoegBreaks` mengt de stootvoegen van **beide** halfsteens-rijen
(`rowCount = 2`, [panelization.js:451-453](src/lib/panelization.js#L451)); een naad die op de
stootvoeg van de éne rij valt, ligt **midden in de strek van de andere rij**. **Bewijs (spike):**
naad op x≈990 valt samen met rij-1 stootvoeg (980+10), maar in laag 0 loopt `start=880 len=210`
(→ 880…1090) dwars over 990 heen — dus **ja, een piece kruist een paneelnaad**. Bevestigd door het
bestaan van `detectKoppelstrippen` ([panelization.js:608](src/lib/panelization.js#L608)).

### B2 — horizontale naden 🟠 (batten-naden op laag; paneel-top/bodem niet)
Batten-gedreven Y-breaks landen **exact op laaggrens** — `_battenForN` geeft
`steenH + lint/2 + k·N·lagenmaat` = **hart van de lintvoeg boven een laag**
([panelization.js:207-217](src/lib/panelization.js#L207)); dus horizontale naden snappen op de
**lintvoeg** (niet op het hart van een laag). **Echter** de paneel-top/-bodem = zone-/gevelrand en de
extra `bpH`-/`maxHeight`-onderverdelingen in `panelizeZone` worden **niet** op lagenmaat gesnapt als
`snapFn=null` — en in het mal-recept-pad wordt `panelizeZone(zone, battenYs, basePanel, null, …)` met
**snapFn=null** aangeroepen ([App.jsx:4874](src/App.jsx#L4874); onderverdeling
[panelization.js:482-521](src/lib/panelization.js#L482)). Gevolg: paneelhoogte is **geen** heel aantal
lagen (spike: 434 mm ≠ n·110), en `generateMoldRecipe` telt `floor(434/110)=3` rijen terwijl de gevel
`ceil(434/110)=4` lagen heeft → **de 4e laag (hart 380) valt weg in het mal-recept** (zie C).

### B3 — verbergt 3D/2D/IFC de niet-snap? 🟢 (ja: panelen zijn een overlay; strip loopt over de naad)
De strips worden **doorlopend** getekend/geëxporteerd, niet per paneel geknipt: 2D tekent
`row.pieces` over de hele gevel ([View2D.jsx:1291-1298, 1338](src/View2D.jsx#L1291)) en gebruikt
panelen alleen als zichtbaarheids-overlay ([View2D.jsx:150-161](src/View2D.jsx#L150)). **IFC-export**
emit één proxy per `piece` over álle `facadeData.rows`, **zonder paneel-clip**
([ifc.js:2077-2079](src/lib/ifc.js#L2077)) — dus **een strip loopt in de IFC daadwerkelijk over de
paneelnaad**. Panelen zijn m.a.w. een tekening-/productie-laag bovenop één doorlopend stripveld.

### B4 — paneel-y van onderaf, v-as omhoog? 🟢 / 🟠
Ja, van onderaf: `groupMinH = min(heightStart)` = y-nul en `row.y = r·lagenmaat` loopt omhoog
([pattern.js:309, 460, 619](src/lib/pattern.js#L460)); consumptie plaatst op
`groupMinH + row.y` langs `heightAxis` ([Viewer3D.jsx:262](src/Viewer3D.jsx#L262),
[ifc.js:2063](src/lib/ifc.js#L2063)). De "omhoog"-richting = `refWallOrigin.heightAxis` (model-up-as,
robuust gestemd in `detectModelUpAxis`). **Kan v stil omgedraaid staan?** 🟠 Niet *stil* t.o.v. 2D:
2D leest dezelfde `row.y`, dus een omgekeerde up-as toont de gevel zichtbaar op z'n kop/gekanteld.
Wél een risico voor de **machine**: "van onderaf" steunt op een correct gedetecteerde up-as; is die
mis, dan is de fysieke onderkant fout — maar dat is dan óók in 2D zichtbaar, niet verborgen.

---

## C — NODE-SPIKE: reproductie machinepaneel 1972×434 (steen 210×100, voeg 10/10)

Volledige dump: [spike/diagnose/kramatweg-crosscheck.mjs](spike/diagnose/kramatweg-crosscheck.mjs).

### C1 — lagen + hart (paneel-lokaal, van onderaf) 🟢
`buildFacePattern(1972,434,…,'halfsteens')` → **4 lagen**, `lagen = ceil(434/110) = 4`
([pattern.js:616](src/lib/pattern.js#L616)):

| laag | row.y (onderkant) | hart (=row.y + steenH/2) |
|---|---|---|
| 0 | 0 | **50** |
| 1 | 110 | **160** |
| 2 | 220 | **270** |
| 3 | 330 | **380** |

→ **Reproduceert de referentie exact** (4 lagen, hart 50/160/270/380, pitch 110). ✅

### C2 — pieces per laag 🟢 (even rijen) / 🟠 (oneven rijen)
- **Even lagen 0 & 2:** 9× `Strek` 210 op x=0,220,…,1760 → **9 stenen + 8 stootvoegen = 1970** in 1972.
  **Exact de referentie.** ✅
- **Oneven lagen 1 & 3 (halfsteens-verspringing):** `Kop` 100 @0, dan 8× `Strek` 210, dan `Rest` 102 @1870
  → 1972. De referentie ("9 hele stenen") beschrijft **alleen de even rijen**; onze halfsteens legt de
  oneven rijen met kop+rest. Als het machinepaneel álle 4 rijen identiek (9 strek) wil, is dat
  **staand/stapelverband, niet halfsteens** — meetverschil, geen fout. 🟠
- **`staand_tegelverband`:** 2 lagen (lagenmaat 220), 18× `Tegel` 100 per rij = 1970 in 1972; harten
  105/325. Reproduceert de referentie-getallen **niet** (ander verband: 2 i.p.v. 4 rijen).

### C3 — herkomst hart eerste laag 🟢
Eerste laag onderkant `row.y = 0` (r=0), rechtstreeks op de paneelbodem — **geen lintvoeg eerst**;
`rowY = round2(r*lagenmaat)` ([pattern.js:619](src/lib/pattern.js#L619)). Het **hart** = halve
steenhoogte boven de bodem: `r*lagenmaat + round(steenH/2)` = 0+50 = 50
([panelization.js:671](src/lib/panelization.js#L671), en consumptie `row.y + steenH/2`
[Viewer3D.jsx:262](src/Viewer3D.jsx#L262)). Dus **halve laagmaat-hoogte vanaf de onderrand, lintvoeg
komt bóven elke laag**, niet eronder.

### C — MEETRESULTAAT samengevat
- `pattern.js` (`buildFacePattern`) **reproduceert de referentie byte-exact** voor de even rijen:
  4 lagen, harten 50/160/270/380, 9×210 + 8×10 = 1970. 🟢
- `generateMoldRecipe` (de huidige mal-recept-exporter) **wijkt af**: (i) splitst het 1972-paneel in
  **3 sub-panelen** 990/877/99 i.p.v. één 1972; (ii) telt **`floor`(434/110)=3 rijen i.p.v. 4** →
  **laat de 4e laag (hart 380) weg**; (iii) slede-Y's per maldoorgang teruggezet naar 0 (mal-lokaal),
  geen absolute gevel-Y, geen x/striplengte. Oorzaak (i): `nCols`/`targetWidth`-raster
  ([panelization.js:523,726](src/lib/panelization.js#L523)); oorzaak (ii): `floor` vs `ceil`
  ([panelization.js:664](src/lib/panelization.js#L664) vs [pattern.js:616](src/lib/pattern.js#L616)).

---

## Slot (1) — Is handleExportMalRecept het mal-vulschema?
**Nee, deels.** Het is een **mal-doorgang-/slede-schema (alleen Y-harten, mal-lokaal)** per paneel:
het levert rijen-totaal, rijen-per-mal, doorgangen en slede-Y's ([App.jsx:4814](src/App.jsx#L4814),
[panelization.js:653](src/lib/panelization.js#L653)), maar **mist x-posities én striplengtes per rij**
(A3), telt de rijen met `floor` waardoor de bovenste laag kan wegvallen (C), en snijdt niet op de
werkelijke `facadeData.rows`-pieces. Wat nog ontbreekt voor een echt vulschema: per paneel, per laag →
`yCenter` + geordende `{xStart, xEnd, length, label, isCut}` uit `facadeData.rows` geknipt op de
paneel-x — precies wat `generateMoldRecipe` nu níet doet.

## Slot (2) — Kan blok B nu byte-exact?
**Ja voor de rij-lijst zelf.** De ENE functie die per paneel `(yCenter, in paneel-lokale mm, van
onderaf)` byte-exact kan leveren is **`buildFacePattern` / `buildFullGroupFacadePattern`** in
[pattern.js](src/lib/pattern.js#L616): `row.y` (van onderaf, `ceil`-telling) + `steenH/2` reproduceert
50/160/270/380 exact (C1), en `row.pieces` geeft de x-segmenten (C2). **B2 en B4 blokkeren de x/y-lijst
niet, maar bepalen de paneel-grenzen:** B2 — paneelhoogte is nu geen heel aantal lagen (snapFn=null in
het mal-recept-pad, [App.jsx:4874](src/App.jsx#L4874)), dus vóór een byte-exacte per-paneel-uitsnede
moet de paneel-Y op lagenmaat gesnapt of de rij-telling op `ceil` (i.p.v. `floor`) gezet worden; B4 —
"van onderaf" is correct zolang de up-as goed staat (geen stille inversie t.o.v. 2D). De strip-x-lijst
komt dus al byte-exact uit `pattern.js`; het werk zit in **rijen × panelen snijden + de floor/ceil- en
snap-conventies gelijktrekken**, niet in een nieuwe generator.
