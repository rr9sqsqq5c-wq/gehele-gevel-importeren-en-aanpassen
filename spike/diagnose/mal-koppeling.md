FASE 0f — MAL-KOPPELING & DEDUP @ 9130bba
Dedup van identieke panelen bestaat: JA — [Uittrekstaat.jsx:134-137](src/Uittrekstaat.jsx#L134) (sleutel = bbox breedte×hoogte)

**Modus** READ-ONLY MEET — niets gewijzigd, geen commit.
Spike: [spike/diagnose/kramatweg-crosscheck.mjs](spike/diagnose/kramatweg-crosscheck.mjs) (FASE 0f-blok, wegwerp).

---

## K1 — dedup / uniek-paneel-concept? 🟠 (bestaat, maar NIET in het mal-pad)
De **panelize-/mal-recept-knop** (`handleExportMalRecept` → `generateMoldRecipe`) doet **géén** dedup:
`generateMoldRecipe` emit **één recipe-rij per paneel-exemplaar** (loop over `panels`,
[panelization.js:663](src/lib/panelization.js#L663)). Dedup bestaat wél elders: in de **Uittrekstaat**
(`panelGroups[key]` met `count++`, [Uittrekstaat.jsx:134-136](src/Uittrekstaat.jsx#L134)) en in
`computeWasteStats` (`uniqueSizes`, [panelization.js:694](src/lib/panelization.js#L694)). **Sleutel =
`${mm2(width)}x${mm2(height)}`** — dus de **bounding box (breedte×hoogte, mm-afgerond)**, **niet** de
volledige geometrie en **niet** de openingen ([Uittrekstaat.jsx:134](src/Uittrekstaat.jsx#L134)).

## K2 — MAL-SET-entiteit die panelen koppelt? 🟠 (mal-template-set bestaat, maar patroon-niveau, geen paneelkoppeling)
Er is een **mold-template-set** via **`getMoldTemplates(verband, mat, moldDims)`**
([panelization.js:1237](src/lib/panelization.js#L1237)): een array descriptors (id `Links`/`Rechts`/…,
`globalRows`, `rowsPerMold`, `molds` = aantal mallen in de cyclus) die de fysieke mallen van de
**verband-rijcyclus** beschrijft. **Capaciteit per mal = `rowsPerMold = min(3, floor((innerH+minRowGap)/(slotH+minRowGap)))`**
([panelization.js:1258](src/lib/panelization.js#L1258), ≤ 3 rijen). Deze set is **patroon-niveau** (één set
per verband/materiaal/mal-afmeting, hergebruikt voor álle panelen) en koppelt **geen specifieke panelen**;
`generateMoldRecipe` (de CSV) verwijst er niet naar en verwerkt elk paneel **onafhankelijk** in eigen passes.

## K3 — draagt een paneel een uitleesbare courses-lijst? 🔴 (nee)
Het paneel-object draagt **geen** courses: velden zijn
`["id","zoneId","row","col","x","y","width","height","area","orientation","staggered"]`
(spike-dump; `buildPanelsFromBreaks` [panelization.js:431-440](src/lib/panelization.js#L431)) — dus het
rijaantal wordt **elke keer opnieuw uit de hoogte berekend**. De rijen met hart binnen `[panel.y0, panel.y1]`
zijn **wél** zonder floor/ceil op te vragen — door `facadeData.rows[].y` te snijden met het interval — maar
het paneel houdt **geen verwijzing** naar `facadeData.rows`, en `generateMoldRecipe` **krijgt die rows niet**
(zie K4), dus die exacte lijst is nu niet beschikbaar in het mal-pad.

## K4 — datapad paneel → rijaantal in generateMoldRecipe 🔴 (uit de floor-formule, niet uit echte courses)
`generateMoldRecipe(panels, mat, verband, panelDikte, moldDims, groupLabel)`
([panelization.js:653](src/lib/panelization.js#L653)) ontvangt **alleen `panels`** — géén
`facadeData.rows`. Het rijaantal komt uit **`totalRows = Math.max(1, Math.floor(panel.height / lagenmaat))`**
([panelization.js:664](src/lib/panelization.js#L664)) en gaat als kolom de recipe in op
[panelization.js:680](src/lib/panelization.js#L680) (`totalRows,` in de row-array). Dus **de floor-formule
op `panel.height`, niet de echte courses** (K3-bewijs: spike toont dat geen rows worden meegegeven).

## K5 — paneel met méér courses dan mal-capaciteit? 🟢 (meerdere passes, herhalende slede)
`passes = Math.ceil(totalRows / rowsPerMold)` ([panelization.js:665](src/lib/panelization.js#L665)); de
lus over passes ([:666-672](src/lib/panelization.js#L666)) zet `rowsInPass = min(rowsPerMold, totalRows - startRow)`
en berekent de slede **per pass opnieuw vanaf `r=0`** (`r*lagenmaat + round(steenH/2)`,
[panelization.js:671](src/lib/panelization.js#L671)). **Bewijs (spike):** paneel H=1240 (laagmaat 62) →
totalRows=20, rowsPerMold=3, **passes=7**, met **identiek herhalende slede `[25 | 87 | 149]`** in elke volle
pass en `[25 | 87]` in de laatste — dus niet afgekapt, wel repeterende slede-posities.

---

## SLOT (exact drie zinnen)
(1) **Ja, dedup bestaat** — maar alleen in de Uittrekstaat/wastestats, op de **bounding-box-sleutel
`${mm2(width)}x${mm2(height)}`** ([Uittrekstaat.jsx:134](src/Uittrekstaat.jsx#L134)), zonder openingen/geometrie,
en **niet** in de mal-recept-knop (die emit één rij per exemplaar).
(2) **Het rijaantal komt uit de floor-formule**, niet uit de echte courses:
`totalRows = Math.max(1, Math.floor(panel.height / lagenmaat))` op [panelization.js:664](src/lib/panelization.js#L664),
de recipe in geschreven op [panelization.js:680](src/lib/panelization.js#L680).
(3) **De ENE wijziging:** `generateMoldRecipe` een reeds-gesneden rijenlijst per paneel laten **lezen** i.p.v.
tellen — dat haakt in op de functiesignatuur/`totalRows`-regel [panelization.js:653-664](src/lib/panelization.js#L653)
(een `rowsByPanel` meegeven vanuit de aanroep in `handleExportMalRecept` [App.jsx:4888](src/App.jsx#L4888),
gevoed door de nieuwe rijen×panelen-snijfunctie uit FASE 0d).
