# Logica-regels per onderdeel — Overlappen en Specifiek gedrag

Voor elk onderdeel staat hieronder beschreven:
- **Wat het is**
- **Specifieke regels** (eigen gedrag)
- **Overlappende logica** (hoe het rekening houdt met andere onderdelen)

---

## 1. Steenstrippen — Vlakke Gevel

### Wat
De horizontale steenstrippen die de vlakke gevel vormen, gebaseerd op het metselverband.

### Specifieke regels
- Worden aangemaakt per rij op basis van het gekozen metselverband (halfsteens, kop, staand).
- Breedte per stuk = steenlengte (210mm standaard) of steenhoogte bij staand verband.
- Hoogte per stuk = steenhoogte (50mm standaard) of steenlengte bij staand verband.
- Stootvoeg = 10mm, Lintvoeg = 12mm.

### Overlappende logica

| Ander onderdeel | Regel |
|---|---|
| **Sparingen ramen/deuren (polygon)** | Strips worden geclipped door de exacte polygoon van de sparing — geen strips binnen de polygoon |
| **Sparingen ramen/deuren (bounding box)** | Bij niet-polygoon sparingen: strips worden geclipped door de rechthoekige bounding box |
| **Penant (zij-steenstrip)** | Strips lopen door **tot pX + brickD** (= achter de buitenkant van de zij-steenstrip van het penant) om **inkijk te voorkomen**. De zij-strip van het penant dekt dit stuk af. |
| **Penant (binnenruimte)** | Strips worden VOLLEDIG verwijderd tussen `pX + brickD` en `pX + breedte - brickD` (de binnenzijde van het penant) |
| **Max hoogte** | Geen strips boven de ingestelde max hoogte |
| **Min hoogte** | Geen strips onder de ingestelde min hoogte |
| **Zone-instellingen** | Per zone kunnen strippen een andere kleur/verband/materiaal hebben — zones worden altijd begrensd door penant-posities |

---

## 2. Steenstrippen — Penant Voorzijde

### Wat
De steenstrippen op de frontplaat van het penant.

### Specifieke regels
- Breedte = penant-breedte − 2 × brickDepth (de zij-strips gaan eraf).
- Hoogte begrensd door max hoogte van de groep.
- Metselverband: gecentreerd (symmetrisch t.o.v. het penant).

### Overlappende logica

| Ander onderdeel | Regel |
|---|---|
| **Max hoogte groep** | Penant hoogte wordt geclipped tot max hoogte |
| **Penant diepte** | Positie (diepte vanuit muur) is vast: latten-diepte + penant-verschuiving + brickDepth/2 |
| **Paneel kleur** | Kleur is gelijk aan de paneelkleur van de vlakke gevel (zelfde materiaal) |

---

## 3. Steenstrippen — Penant Zijkanten (Links en Rechts)

### Wat
De steenstrippen op de linker- en rechter-zijkant van het penant.

### Specifieke regels
- Diepte = penant-diepte − 6mm (de 6mm voeg aan de voorzijde wordt afgetrokken).
- Strips worden aan het einde geclipped: de laatste `max(stootvoeg, paneel-dikte)` mm wordt verwijderd zodat de hoek vrij blijft voor het paneelwerk.
- Rechter zijkant is gespiegeld ten opzichte van links.

### Overlappende logica

| Ander onderdeel | Regel |
|---|---|
| **Vlakke gevel strips** | De vlakke gevel eindigt op `pX + brickD` (linker zijkant) — de zij-strip begint precies daar |
| **Penant panelen (zijkant)** | Zij-strip en zijpaneel lopen tot dezelfde diepte (penant-diepte − 6mm) met een tussenruimte van 10mm |
| **Max hoogte** | Zij-strips worden geclipped tot max hoogte |
| **Kleur** | Zelfde kleur als de steenstrippen van de vlakke gevel |

---

## 4. Horizontale Latten (Achterconstructie)

### Wat
De horizontale houten latten waarop de steenstrippen (via panelen of direct) worden bevestigd.

### Specifieke regels
- Lopen over de **volledige groepsbreedte** (van hoek tot hoek).
- Maximale tussenafstand = 400mm (configureerbaar).
- Dikte en breedte komen uit het gekozen artikel in de catalogus.

### Overlappende logica

| Ander onderdeel | Regel |
|---|---|
| **Sparingen ramen/deuren** | Horizontale latten worden geclipped bij sparingen — NIET doorlopen door een opening |
| **Penant** | Horizontale latten lopen **DOOR het penant heen** — ze worden NIET geclipped. Reden: de verticale latten worden hierop gemonteerd |
| **Max hoogte** | Geen latten boven max hoogte |
| **Verticale latten** | Verticale latten worden geschroefd op de buitenkant (voorzijde) van de horizontale latten |

---

## 5. Verticale Latten (Achterconstructie)

### Wat
De verticale houten latten, geschroefd op de buitenzijde van de horizontale latten. Dienen als bevestiging voor de panelen.

### Specifieke regels
- Staan op de buitenkant (voorzijde) van de horizontale latten.
- Positie op basis van paneelranden.

### Overlappende logica

| Ander onderdeel | Regel |
|---|---|
| **Penant** | Verticale latten worden **NIET** geplaatst in de zone `[pX, pX + breedte]` van een penant |
| **Horizontale latten** | Verticale latten staan altijd voor (buitenkant van) de horizontale latten |
| **Max hoogte** | Geen verticale latten boven max hoogte |
| **Sparingen** | Geen verticale latten in sparingen |

---

## 6. Panelen (Backing Panels)

### Wat
De (aluminium/composiet) backing panelen achter de steenstrippen. Steunen op de latten.

### Specifieke regels
- Maximale breedte en hoogte configureerbaar.
- Maximale belasting (kg per paneel) configureerbaar — paneel wordt kleiner als het te zwaar wordt.

### Overlappende logica

| Ander onderdeel | Regel |
|---|---|
| **Sparingen ramen/deuren (polygon)** | Panelen worden geclipped door de exacte polygoon |
| **Sparingen ramen/deuren (bounding box)** | Panelen worden geclipped door de bounding box |
| **Penant** | Panelen worden volledig uitgesloten van de zone `[pX, pX + breedte]` van elk penant |
| **Boven penant (tot max hoogte)** | Panelen en strips boven een penant (van pX tot pX+breedte, vanaf penant hoogte tot max hoogte) worden ook geclipped |
| **Max hoogte** | Panelen worden geclipped tot max hoogte |

---

## 7. Zetwerk

### Wat
Horizontale profielen (zink/aluminium) aan de boven- of onderkant van de bekleding.

### Specifieke regels
- Breedte, dikte, horizontale offset en verticale offset zijn configureerbaar.
- Strip-offset bepaalt de afstand tussen het zetwerk en de eerste steenstrip.

### Overlappende logica

| Ander onderdeel | Regel |
|---|---|
| **Sparingen** | Zetwerk wordt geclipped bij sparingen |
| **Max hoogte** | Geen zetwerk boven max hoogte |

---

## 8. Penant — Geometrie & Positie

### Wat
Een verticaal uitstekend element (kolom-achtige uitsprong) op de gevel.

### Geometrie van voren naar achteren (vanuit buiten):

```
[BUITEN]
  Voeg 6mm
  Steenstrips voorzijde penant
  Hoeklatjes verticaal (voor op de horizontale latten)
  Verticale penant-latten ruimte
  Hoeklatjes verticaal (achter)
  10mm GAP (ruimte penant - vlakke gevel)
  Zij-steenstrip penant (brickDepth = 20mm)
  Vlakke gevel steenstrips eindigen hier (op pX + brickDepth)
[MUUR]
```

### Specifieke regels
- X-positie ondersteunt rekenkundige expressies (bijv. `3500 - 200`).
- Penant hoogte wordt automatisch begrensd door max hoogte van de groep.

### Overlappende logica

| Ander onderdeel | Regel |
|---|---|
| **Strips vlakke gevel** | Vlakke strips lopen door tot `pX + brickDepth` (achter buitenrand zij-strip) = inkijk-preventie |
| **Panelen vlakke gevel** | Volledig uitgesloten van de penant-zone |
| **Horizontale latten** | Lopen door het penant heen (niet geclipped) |
| **Verticale latten** | Worden NIET geplaatst in de penant-zone |
| **Zones** | Elke penant definieert een grens tussen twee zones |
| **Max hoogte** | Penant hoogte geclipped tot max hoogte; ook latten/strips/panelen boven penant worden geclipped |

---

## 9. Zone-indeling

### Wat
Penanten verdelen de gevel in zones (gebieden tussen penanten). Zones kunnen eigen instellingen hebben.

### Specifieke regels
- Zone 1 = linkerhoek → linkerkant eerste penant.
- Zone N (laatste) = rechterkant laatste penant → rechterhoek.
- Zones daartussenin = rechterkant vorige penant → linkerkant volgende penant.
- **Totaal zones = aantal penanten + 1.**
- Per zone: eigen kleur, verband, materiaal, max hoogte (optioneel).

### Overlappende logica

| Ander onderdeel | Regel |
|---|---|
| **Strips** | Zone-strips worden geclipped tot de zone-grenzen (penant-posities) |
| **Niet-zone strips (generiek)** | Alles buiten de ingeschakelde zones valt terug op de groepsinstellingen |
| **Penanten** | Penant-posities zijn altijd de harde grenzen van een zone — zones overlappen nooit met penanten |

---

## Samenvatting: Prioriteitsvolgorde bij conflicten

Als meerdere regels tegelijkertijd van toepassing zijn, geldt deze volgorde:

1. **Max hoogte** — alles boven max hoogte wordt altijd verwijderd (strips, latten, panelen, zetwerk)
2. **Penant-zone** — panelen en verticale latten worden volledig verwijderd; horizontale latten lopen door
3. **Sparing (polygon/bounding box)** — strips en panelen worden geclipped door opening
4. **Inkijk-preventie** — strips lopen een brickDepth (20mm) achter de buitenrand van het penant

---

## Visuele controle-regels

| Wat je ziet | Wat er mis kan zijn |
|---|---|
| Gat in de gevel naast penant | Strip-masking te agressief (controleer pX + brickDepth) |
| Strips door raam heen | Polygon-opening niet correct gedetecteerd |
| Latten in penant | Verticale latten zouden niet in penant mogen |
| Strips boven max hoogte | Max hoogte niet correct ingesteld |
| Penant zijkant niet aansluitend | clipOff (stoot/paneel) te groot of zij-strip diepte incorrect |
