# Spike-rapport — Kan App A de openingen en wanddata leveren?

Geschreven in gewone taal. Dit is een wegwerp-onderzoek; er is **niets** veranderd
aan App A of App B. Alle losse code staat in de map `spike/`.

## Wat heb ik gedaan?

Ik heb App A's eigen "geometrie-manier" om openingen te vinden los van het scherm
laten draaien op jullie testmodel **BIL-MOO-A-ZZ-PBP.ifc** (44 MB, uit Revit).
Daarnaast heb ik recht uit het IFC-bestand de "waarheid" gehaald: welke openingen
er volgens het model écht in zitten. Die twee heb ik vergeleken.

> Let op: er was maar **één** testmodel beschikbaar. De moeilijke gevallen
> (gedraaide wanden, schuine daken, gaten op een andere laag) kon ik dus niet op
> meerdere bestanden testen. De conclusie geldt hard voor dit model.

## De waarheid in dit bestand (de meetlat)

- Er zitten **2956 gaten** (voids) in het model.
- Daarvan **2677 in wanden** en **279 in vloeren** (slabs).
- Van die gaten zijn er **123 ramen** en ongeveer **163 deuren**; de rest (2670)
  zijn kale sparingen (kleine doorvoeren e.d.).
- De échte **buitengevel-wanden** (NL-SfB code 21) zijn er **193**. Daarop zitten
  **208 gaten** (123 ramen, 28 deuren, 57 sparingen), verdeeld over **116** wanden.

## 1. Werkt A's manier van openingen vinden? → **NEE (grotendeels niet)**

App A draait wél headless (het start en geeft uitvoer). Maar de gevonden openingen
deugen niet:

- A's standaard-manier (alle gevelvlakken samenvoegen) gaf **731 "openingen"**,
  waarvan na controle maar **19% een normaal formaat** had. Voorbeelden: een "deur"
  van **102 m²**, gaten met een negatieve hoogte, gaten van 0 m². Bovendien raakt
  bij deze manier de koppeling "welk gat hoort bij welke wand" kwijt, omdat allerlei
  losse wanden tot één groot vlak worden samengevoegd.
- A's nettere variant (per wand apart, de **fallback uit stap 5**) gaf **80 openingen**.
  Beter dan 731, maar nog steeds: een "deur" van **2870 × 3360 mm** op een wandvlak
  van maar **1723 × 1800 mm** — het gat is groter dan de wand zelf. Ook hier maar
  **19%** met een geloofwaardig formaat, en bij 69 van de 80 een negatieve hoogte.

Waarom gaat het mis? De gaten ván de open-cascade-snede zitten wél in de 3D-mesh,
maar A's code die daar een nette 2D-omtrek + gaten uit moet halen
(`detectPlaneBoundaries` / `detectOpenings`) loopt vast op een echt, rommelig model:
voor **315 van de 345** vlakken (en **585 van de 687** wanden) valt A terug op een
simpele rechthoek **zonder gaten**.

## 2. Op welke modellen wél / niet?

- Getest op één model (BIL-MOO). Daarop werkt het **niet** betrouwbaar.
- A vond op de buitengevel-wanden maar voor **49 van de 193** wanden een echte
  omtrek; de andere 144 werden platte rechthoeken zonder gaten.

## 3. Vindt A de openingen die B nu mist of fout plaatst?

Kort: **nee, A vindt er juist veel mínder.**

- Op de 193 buitengevel-wanden horen **208 gaten** te zitten. A vond er **49** —
  ongeveer **een kwart** — en die 49 waren ook nog meestal verkeerd van maat.
- App B leest de gaten daarentegen **rechtstreeks uit de IFC-relaties**
  (`IFCRELVOIDSELEMENT`, B-code `ifc.js:1227`). Daardoor "ziet" B in principe
  **alle** wand-gaten; B's probleem zit niet in het vínden, maar in het netjes
  **plaatsen/maatvoeren** (de bbox-methode wordt te groot bij gedraaide wanden) en
  in het feit dat B alleen wanden bekijkt en de **279 gaten in vloeren mist**.
- Belangrijke nuance: B draait in de browser en kon ik niet los laten draaien. De
  uitspraken over B komen uit de B-code zelf, niet uit een headless run.

Met andere woorden: de aanname uit het eerdere onderzoek — dat A's "echte
geometrie" robuuster zou zijn voor openingen — klopt **niet** voor dit model.
A's geometrie-detectie is juist de zwakste schakel.

## 4. Kan A alles leveren wat de gevelgroepering nodig heeft?

De gevelgroepering en bekleding hebben per wand een vaste set velden nodig
(zie `spike/contract.md`): lengte/hoogte, de assen, begin-coördinaten, en per
opening type + plek + maat (in mm, in het IFC-frame, per `expressID`).

- De **wand**-basis (afmeting, ligging) zou A in principe kunnen leveren.
- De **openingen** kan A **niet** betrouwbaar leveren: te weinig gevonden, en wat
  gevonden wordt klopt qua maat/plek meestal niet.
- Ook past A's standaard-uitvoer slecht op het contract omdat A per *vlak* werkt
  (samengevoegde wanden), terwijl het contract per *wand* (`expressID`) is.

## 5. Blijven onze opgeslagen projecten bruikbaar?

**Ja, mits één voorwaarde.** Opgeslagen projecten koppelen alles aan het
**`expressID`** van een wand (`groups.wallIds`, instellingen per groep,
handmatige correcties — zie `spike/json-schema.md`). Zolang een nieuwe manier per
wand **hetzelfde `expressID`** teruggeeft, blijven bestaande projecten werken.

- A's **per-wand**-aanpak behoudt `expressID` → projecten blijven geldig.
- A's **samengevoegde** aanpak gebruikt eigen vlak-id's → dan **breken** projecten.

Kleinste migratie: nieuwe afleiding moet per wand het oorspronkelijke `expressID`
meegeven. Verder is geen conversie nodig.

---

## EXTRA — Buiten/binnen uit Revit-signalen

Ik heb per wand (4128 stuks) uitgelezen welke signalen aanwezig zijn. Resultaat
staat in `spike/out/BIL-MOO.signals.json`.

### Welke van de drie signalen zitten in dit bestand?

| Signaal | Aanwezig? | Details |
|---|---|---|
| **Function** (Revit-parameter) | **NEE** | Geen enkele wand heeft een property "Function". Niet meegeëxporteerd. |
| **NL-SfB** (21=buiten, 22=binnen) | **JA, overal** | Staat in **elke** wand-type­naam (bv. `Basic Wall:21.10_WA_LB_HSB_272.5`). Daarnaast als losse classificatie op 556 wanden. Codes: 21.x (193), 22.x (363), en verder 28.20 / 42.10 / 90.10 (constructie/afwerking). |
| **IsExternal** (Pset_WallCommon) | **JA, overal** | Op alle 4128 wanden ingevuld. Maar slechts **267** staan op TRUE. |

### Zijn ze consistent?

**Nee.** Waar NL-SfB én IsExternal allebei iets zeggen (556 wanden), zijn ze het
**in 385 gevallen oneens** (69%). En het allerbelangrijkste:

- **Alle 193 buitengevel-wanden (code 21) hebben IsExternal = FALSE.**
- Er is **geen enkele** wand met tegelijk code 21 én IsExternal = TRUE.

Oftewel: in dit Revit-model staat `IsExternal` precies **omgekeerd/onbetrouwbaar**
op de wanden die juist de buitengevel vormen (de HSB-spouwbladen). Wie op
`IsExternal = TRUE` zou filteren, gooit precies de gevelwanden weg.

### Welk signaal is het betrouwbare anker?

De **NL-SfB-code in de type-naam** (`21` = buiten, `22` = binnen). Die zit op
**100%** van de wanden, is door de modelleur bewust gezet, en komt overeen met de
echte gevelopbouwen (`21.10_WA_LB_HSB_272.5` = de buitenwand). `Function` ontbreekt;
`IsExternal` is hier misleidend.

### Conclusie: hard te bepalen, of gokwerk?

Voor dit model is buiten/binnen **hard en veilig te bepalen** — maar **alleen via
de NL-SfB-code (type-naam)**, niet via IsExternal en niet via de vorm. Filteren op
`type-naam begint met "21"` geeft schoon de 193 buitengevel-wanden. Dat is geen
gokwerk. Wel een waarschuwing: dit leunt op de naamafspraak van deze modelleur;
op een model zonder NL-SfB in de naam zou je terugvallen op gokwerk (want
IsExternal is daar mogelijk net zo onbetrouwbaar).

---

## Eindoordeel (stoplicht)

### 🔴 ROOD — voor de oorspronkelijke vraag

**App A's geometrie-manier om openingen te vinden lost het niet op.** Op het echte
model vindt A maar ~24% van de openingen en die kloppen meestal niet van maat/plek.
Robuuste **opening-detectie uit de vorm** zit dus in géén van beide apps goed in
elkaar en moet sowieso opnieuw gebouwd worden.

**Belangrijke nuance (de constructieve kant):**
- *Wélke* openingen er zijn, is wél betrouwbaar te krijgen — niet uit A's geometrie,
  maar uit de **IFC void/fill-relaties** (precies wat B al doet, en wat mijn
  `truth.mjs` schoon op 2956 gaten kreeg). Dat is de robuuste basis.
- *Buiten/binnen* is voor dit model **hard** te bepalen via de **NL-SfB-type-code**.
- Wat nog **vers gebouwd** moet worden is de **nauwkeurige maat/plek per opening**:
  A's projectie-code is kapot, B's bbox is te grof bij gedraaide wanden. De beste
  route is: voor elke (via de relatie bekende) opening de échte, door OpenCASCADE
  gesneden mesh **per wand** op het wandvlak projecteren — maar dan met nieuwe,
  robuuste code, niet die van A.

Kort samengevat: **A als donor van openingen → nee.** De winst zit in de
IFC-relaties + NL-SfB-codes, plus nieuw te bouwen plaatsingslogica.

---

## Wat ik niet kon doen / onzekerheden

- Maar **één** testmodel; de moeilijke randgevallen niet op meerdere bestanden getest.
- **App B niet headless gedraaid** (browser-gebonden via een IIFE-loader). B's
  cijfers zijn afgeleid uit de B-code (`ifc.js`), niet uit een run. De vergelijking
  met B is daardoor deels op redenering gebaseerd, niet op meting.
- A's pipeline draaide ik via een eigen harness (esbuild-bundel + web-ifc node).
  De opening-detectie zelf is 100% A's eigen code; alleen het inlezen van de IFC
  gebeurde met de node-versie van web-ifc.
- "Plausibel formaat" is mijn eigen vuistregel (raam 0,2–8 m², deur 1,2–5 m²),
  bedoeld om grofweg goed/fout te scheiden, geen exacte maat-check.

## Bestanden in deze spike
- `contract.md` — wat de gevelgroepering/bekleding per wand+opening nodig heeft.
- `json-schema.md` — schema opgeslagen projecten + herbruikbaarheid.
- `a-harness.ts` + `run.mjs` — A's volledige pipeline headless (merged).
- `a-fallback.ts` — A per wand (stap 5).
- `truth.mjs` — waarheid uit IFC void/fill-relaties.
- `signals.mjs` — buiten/binnen-signalen per wand.
- `out/*.json` — alle ruwe uitvoer + `BIL-MOO.compare.json` (head-to-head).
