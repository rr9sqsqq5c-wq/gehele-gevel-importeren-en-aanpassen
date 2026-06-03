# MEET-SPIKE — masker-kandidaatregel "doorlopend veld" op echte BIL-geometrie

READ-ONLY. Geen src-wijziging. Artefact: `spike/validate/mask-rule-meet.mjs`
(hergebruikt productie-`fitFacadePlane` voor het vlak-frame; up-as-fix toegepast →
vlak klopt: tAxis=z, uAxis=y, nAxis=x, residu 13 mm).

Kandidaat-regel getoetst: *per horizontale t-kolom het verticale bereik tussen het
LAAGSTE en HOOGSTE element-footprint vullen; openingen DAARNA aftrekken.*
Contrast: v1 = strikt footprint-masker (unie van element-rechthoeken).

Selectie: BIL buitengevel (40 wanden, NL-SfB 21) + dakrand-voorzijde (34 platen),
gevel-extent 27,7 m breed × 10 m hoog.

## Gemeten

### 2. Bestaat de band wand-boven → dakrand-onder?
- Ja, maar **16 mm**, mediaan=min=max=16, spreiding sd=0 → **schoon/constant**, maar
  **verwaarloosbaar klein**: wand en dakrand liggen in BIL praktisch **vlak tegen
  elkaar**. Er is dus géén zichtbare band om te vullen.

### 3a. Wordt de wand→dakrand-band gevuld? → **100% ✅** (maar het is 16 mm)
### 3b. Entree onder losstaande dakrand → **blijft LEEG ✅**
- Pure alleen-dakrand-kolom: zone eronder onbekleed (400 mm gemeten, 100% leeg).
- Losstaande dakrand-selectie: regel vult per kolom alleen [u0..u1] van de plaat →
  niets eronder (geen wand → geen `lo` omlaag). ✅
### 3c. Openingen: volgorde **veld vullen → daarna aftrekken** → **✅ en VERPLICHT**
- Raam-midden uitgesneden, boven/onder raam behouden. Zonder aftrekken zou de
  veldvulling het raam weer dichtzetten.
### 3d. Buitencontour → **✅** (per kolom alleen binnen [laagste..hoogste]; niets
  buiten de gevel-extent of boven/onder het uiterste element).

### 5. Contrast met v1 (strikt masker)
| | bekleed |
|---|---|
| v1 (unie footprints) | 270,0 m² |
| kandidaat (veld)     | 271,0 m² |
| **extra door kandidaat** | **1,01 m²** = band 0,43 m² (16 mm-sliver) + **overige brug 0,57 m²** |

### 4. Failure-mode
- **Horizontale gaten** (kolom zónder enig element): **75 mm** totaal van 27,7 m →
  praktisch **afwezig** (wanden zijn aaneengesloten, dakrand spant alles). De regel
  laat ze leeg — conform "net als de tussenruimtes".
- **Interne verticale brug** (0,57 m²): de leegte-hoogtes zijn **n=8 × 2870 mm
  (verdiepingshoogte)** — dus **raam/deur/entree-formaat**, smal (~200 mm breed),
  GEEN slivers. **De regel zou deze verdiepingshoge leegtes overbruggen/beleggen.**

## Jip-en-janneke oordeel

De regel doet drie dingen goed: de (piepkleine) band vullen, de **pure** entree leeg
laten, en de contour volgen. Maar twee dingen kloppen niet voor BIL:

1. **De band die de regel moet oplossen, bestaat nauwelijks** — wand en dakrand liggen
   16 mm uit elkaar (vlak). De wínst van "doorlopend veld" is op deze gevel ~0,4 m²
   van 270, ofwel niets zichtbaars. De oorspronkelijke "band niet bekleed"-klacht zat
   vrijwel zeker in de **up-as-bug** (verticaal verband), die nu al gefixt is.

2. **De regel is te gulzig bij entrees/glasvlakken.** "Vul tussen laagste en hoogste
   element" overbrugt **verdiepingshoge (2870 mm) leegtes** zodra er íéts onder zit
   (plint, dorpel, borstwering). Dan belegt hij de entree/het glasvlak. Dat blijft
   alleen leeg als er **letterlijk niets** onder de dakrand zit (de pure-entree-test).
   Op BIL gebeurt dit op 8 plekken (0,57 m²). Correct resultaat hangt dan **volledig**
   af van betrouwbare openings-/void-data om die zones terug uit te snijden — precies
   het deel dat v1 (strikt masker) juist NIET riskeert.

## Stoplicht: 🟡 ORANJE — regel haalt de eis NIET zonder aanvulling

**Wat ontbreekt voor groen:**
- **Begrens de overbrugging.** De band die we willen vullen is specifiek
  *wand-bovenkant → dakrand-onderkant*. Vul alleen díe band (en de horizontale
  tussenruimtes tussen co-planaire wandsegmenten), **niet** elke interne verticale
  leegte. Concreet: overbrug alleen gaten ≤ een drempel (bv. ≤ enkele steenlagen) óf
  alleen gaten die expliciet *wand-top↔dakrand-bottom* zijn — niet verdiepingshoge
  voids.
- **Koppel openings-data verplicht** (de `newOpenings`-pijplijn) als de regel wél
  verdiepingshoge zones vult, anders worden entrees/glasvlakken dichtgemetseld.
- **Heroverweeg de meerwaarde:** op BIL is de winst t.o.v. v1 ~0,4 m² (de 16 mm-band)
  tegen een reëel risico van 0,57 m² fout-belegde entrees. Met de up-as-fix erbij is
  v1 (strikt masker) op deze gevel waarschijnlijk al goed genoeg; "doorlopend veld"
  loont pas bij gevels met een échte, brede band tussen wand en dakrand — die in deze
  BIL-set niet voorkomt.

(Geen src gewijzigd; alleen `spike/validate/mask-rule-meet.mjs` + dit bestand
toegevoegd.)
