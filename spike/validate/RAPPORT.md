# Validatie-rapport (stap 1) — generaliseren de bevindingen, en werkt de projectie?

Gewone taal, korte zinnen. Alles is **read-only** en wegwerp; niets aan A of B
gewijzigd, geen opgeslagen projecten aangeraakt. Code staat in `spike/validate/`.

## Wat is getest, en waarop

Twee dingen:
- **Taak A**: klopt "buiten = NL-SfB 21 / binnen = 22" en is IsExternal onbetrouwbaar?
- **Taak B**: werkt het projecteren van de echte opening-vorm op het wandvlak,
  en is dat beter dan het wereld-doosje (wat B nu doet)?

Geteste modellen (8, verschillende projecten/modelleurs):

| Model | Grootte | Wanden | Gaten via voids | Bruikbaar voor |
|---|---|---|---|---|
| BIL-MOO (basis) | 42,7 MB | 4128 | 2956 | Taak A + B |
| Helmond Toren | 19,9 MB | 499 | 556 | Taak A + B |
| Kubistische woning | 4,5 MB | 33 | **0** (wel 18 ramen + 11 deuren!) | Taak A; legt gat bloot |
| GFRC Dunea | 0,2 MB | 89 | 0 | Taak A (andere codes) |
| KGT Tegels | 22,4 MB | 22 | 0 | Taak A |
| MSHF / Demo | 4,2 / 0,1 MB | 0 | 0 | niet bruikbaar (geen wanden) |

> Eerlijk vooraf: maar **2** van de 8 modellen hebben echte wand-openingen via
> void-relaties (BIL, Helmond). En **geen enkel** model heeft gedraaide wanden
> (alles staat haaks). Het grote voordeel van projecteren bij gedraaide wanden
> kon ik dus **niet** op een echt bestand bewijzen — wel op schuine/ronde openingen.

---

## Taak A — buiten/binnen

### Heeft elke wand een NL-SfB-code?
**Ja, in elk model met wanden.** De code staat altijd vooraan in de type-naam
(bijv. `Basic Wall:21.10_WA_LB_HSB_272.5`). Gemeten: BIL 4128/4128, Helmond
499/499, Kubistisch 33/33, KGT 22/22, GFRC 89/89.

### Klopt 21 = buiten / 22 = binnen?
- Waar de modelleur 21/22 gebruikt (BIL, Helmond, Kubistisch, KGT): ja, dat is de
  NL-SfB-betekenis (21 = buitenwand, 22 = binnenwand).
- **Maar niet elk model gebruikt 21/22.** GFRC gebruikt heel andere codes
  (17, 25, 34, 61, 87) — dat zijn product-/elementcodes, geen wand-positiecodes.
  Daar zegt "21/22" dus niets. Een puur gevel-elementen-model valt buiten de regel.

### Hoe vaak is IsExternal het oneens met NL-SfB?
Heel wisselend per model — dat is het probleem:

| Model | Wanden met 21/22 én IsExternal | Oneens | 21-wanden met IsExternal=FALSE |
|---|---|---|---|
| BIL-MOO | 556 | **384 (69%)** | **192 van 193** (omgekeerd!) |
| Helmond | 420 | 132 (31%) | 23 van 213 |
| Kubistisch | 33 | **0** | 0 (hier juist allemaal TRUE) |
| KGT | 22 | 0 | 0 (allemaal TRUE) |

Dus IsExternal is in het ene model **omgekeerd** (BIL), in het andere **precies
goed** (Kubistisch, KGT), en in een derde **gemengd** (Helmond). Je kunt er niet
blind op bouwen.

### Komt "Function" ooit voor?
**Nee. In geen enkel model** (0 in alle 8). De Revit Function-parameter wordt niet
als property meegeëxporteerd.

### Conclusie Taak A
- **NL-SfB-code uit de type-naam is het beste anker**: overal aanwezig, door de
  modelleur bewust gezet. (`signals2.mjs`, dumps in `out/<model>.signals.json`.)
- **IsExternal is onbetrouwbaar** als losse bron: soms omgekeerd, soms goed.
- **Function bestaat niet** in deze bestanden.
- Let op twee dingen: de regel "21/22" geldt alleen als de modelleur die codes
  gebruikt; en het leunt op de naamafspraak. Voor een model zonder 21/22 (zoals
  GFRC) is een aparte afspraak nodig.

🟢 **NL-SfB als anker generaliseert** voor de bouwkundige modellen.
🟠 …met de kanttekening: niet elk model gebruikt 21/22, en IsExternal mag **niet**
het anker zijn.

---

## Taak B — projectie van de opening op het wandvlak

Aanpak (`projection.mjs`): per void-relatie de **echte vorm** van het
`IfcOpeningElement` ophalen, op het lokale wandvlak (lengte × hoogte) projecteren →
2D-omtrek + maat in wand-lokale mm. Daarnaast bereken ik het **naïeve wereld-doosje**
van diezelfde opening (wat B nu doet), zodat het een eerlijke vergelijking is —
zonder B te draaien. Alles gekoppeld aan `expressID` (opening én host-wand).

### Werkt het? (alleen BIL + Helmond hebben voids)

| | BIL-MOO | Helmond |
|---|---|---|
| Wand-openingen | 2677 | 490 |
| Nette omtrek ("clean") | **2179 (81%)** | 258 (53%) |
| Te klein (<50 mm, bewust te negeren) | 485 | 1 |
| "Groter dan host-wand" | 13 | 231 |
| Omtrek = echte veelhoek (geen doosje) | 38 (waarvan 24 rond) | **199** |
| Vloer-gaten apart geteld (slab) | 279 | 66 |

- De projectie geeft voor de meeste openingen een **strakke, juist geplaatste
  omtrek**, en — anders dan het doosje — voor honderden openingen een **echte
  veelhoek** (schuine/ronde kozijnen: Helmond 199, BIL o.a. 24 ronde openingen met
  24 hoekpunten). Het doosje kan dat principieel niet.
- De 485 "te klein" bij BIL zijn piepkleine sparingen (<50 mm); die negeert B nu
  ook (`pattern.js:335`). Het zijn dus geen fouten.

### Is het beter dan het doosje?
Op deze (haakse) gebouwen is het doosje vaak al prima: het oppervlak van doosje en
projectie is mediaan gelijk (factor 1,0). **Maar** voor een flinke minderheid is
het doosje veel te groot:

- BIL: **802 openingen** waar het doosje ≥1,2× groter is dan de projectie,
  **565** ≥1,5×, **327** ≥2× (tot 169× bij een enkele schuine sparing).
- Helmond: 95 ≥1,2×, 75 ≥1,5×, 67 ≥2×.

Dat zijn de schuine/ronde openingen. Daar wint de projectie duidelijk. Bij gewone
rechthoekige gaten in haakse wanden zijn beide gelijk.

### Wat breekt, en hoe erg?
- **"Opening groter dan host-wand"** (Helmond 231 = 47%). Niet de projectie is
  fout, maar de host: dat is vaak een **dunne horizontale band** (bijv. 32 m lang ×
  225 mm hoog) waar het kozijn dóór meerdere gestapelde elementen loopt. De
  opening-maat klopt (bijv. 1000 × 455 mm), maar is hoger dan dat ene bandje.
  → Oplossing: openingen **per gevelgroep samenvoegen** (dat doet B's groepering
  al), niet vertrouwen op één host-element. Dit is precies het "voids op een andere
  laag"-geval.
- **Geen void-relaties** (Kubistische woning): 18 ramen + 11 deuren, maar
  **0 IfcOpeningElement en 0 voids**. Dan vindt bron-(1) niets. → Nodig: een
  **terugval** op de plaatsing/vorm van `IfcWindow`/`IfcDoor` zelf wanneer voids
  ontbreken.
- **Andere NL-SfB-codes** (GFRC): geen 21/22 → buiten/binnen-regel valt weg.

### Eenheden / frame
Opening-geometrie en wandvlak zitten in hetzelfde frame: hoogte = echte verticaal
(model-up, hier overal Z), lengte = langste horizontale wand-as, dikte = loodrecht.
TrueNorth doet er niet toe, want we rekenen in het wand-eigen frame. Maten in mm
(web-ifc levert meters → ×1000). Vloer-gaten worden apart geteld zodat jullie
bewust kunnen kiezen of de gevel die nodig heeft.

🟢 **De projectie-techniek werkt** en levert iets dat het doosje niet kan (echte
veelhoeken, strak bij schuine/ronde gaten).
🟠 …mits twee dingen geregeld zijn: samenvoegen per gevelgroep (multi-band hosts)
en een terugval wanneer void-relaties ontbreken.

---

## Stoplichten

| Bevinding | Oordeel |
|---|---|
| NL-SfB-code aanwezig op elke wand | 🟢 Generaliseert |
| 21 = buiten / 22 = binnen | 🟢 waar 21/22 gebruikt wordt · 🟠 niet elk model doet dat (GFRC) |
| IsExternal als anker | 🔴 Onbetrouwbaar (soms omgekeerd) — niet gebruiken |
| Function-parameter | 🔴 Bestaat niet in deze bestanden |
| Projectie levert strakke/echte omtrek | 🟢 Ja (81% schoon op BIL; echte veelhoeken) |
| Projectie beter dan doosje | 🟢 bij schuine/ronde gaten · ⚪ gelijk bij haakse gaten |
| Bron (1): void-relaties overal aanwezig | 🟠 Niet altijd (Kubistisch: 0 voids bij 29 ramen/deuren) |
| Openingen door meerdere lagen | 🟠 Vereist samenvoegen per gevelgroep |

## Eindoordeel: 🟠 ORANJE

De richting klopt en de techniek werkt, maar **dit eerst regelen** vóór/bij stap 2:

1. **Buiten/binnen op NL-SfB-code** (type-naam), **niet** op IsExternal. Met een
   afgesproken terugval als 21/22 ontbreekt.
2. **Terugval voor openingen zonder void-relatie**: gebruik dan de plaatsing/vorm
   van `IfcWindow`/`IfcDoor` zelf (anders mist hele woningmodellen al hun ramen).
3. **Openingen samenvoegen per gevelgroep**, want één kozijn kan over meerdere
   dunne host-banden verdeeld zijn (anders: "opening groter dan wand").
4. Alles blijven koppelen aan **`expressID`** (host-wand én opening) — dat werkt in
   de prototypes en is nodig om opgeslagen projecten geldig te houden.

Als die vier punten in het ontwerp zitten, is het groen licht voor stap 2
(afleiding in B bouwen). Zonder punt 2 en 3 faalt het op een deel van de modellen.

## Wat ik niet kon / onzekerheden
- Maar **2** modellen met echte wand-voids; **geen** model met gedraaide wanden →
  het projectie-voordeel bij rotatie is **niet** op een echt bestand bewezen, alleen
  bij schuine/ronde openingen.
- B is **niet** gedraaid; het "doosje" is in dezelfde harness nagerekend (eerlijke
  appels-met-appels), niet uit een echte B-run.
- "Clean" en "te klein <50 mm" zijn eigen vuistregels om grofweg goed/fout te
  scheiden.
- De modellen komen uit losse projectmappen op de schijf (verschillende projecten);
  ik kon niet verifiëren of dit een representatieve doorsnede van jullie werk is.

## Bestanden
- `signals2.mjs` → `out/<model>.signals.json` (Taak A, per wand op expressID).
- `projection.mjs` → `out/<model>.projectie.json` (Taak B, per opening op expressID,
  met projectie én doosje).
- `_entcheck.mjs`, `_analyze.mjs`, `_analyze2.mjs` → hulpscripts voor de getallen.
