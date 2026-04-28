# IFC Brickslip Planner — Changelog

## [Niet gereleased] — 28-04-2026

### Toegevoegd
- **Bestellijst totaal (Uittrekstaat)**: nieuwe sectie onderaan de uittrekstaat met een geaggregeerde bestellijst over alle groepen heen. Per materiaalsoort (steenstrips, basisplaten, latten) worden totalen opgeteld: totaal m², stuks, pallets, totaalprijs excl. en incl. BTW. Vermeldt bij elke post in welke groepen het materiaal is gebruikt.
- **Steenstrip artikelkeuze — leverancier-filter**: zoekbalk, leverancier-knoppen (Wienerberger / FRONT / Generiek) en formaat-knoppen (WF/EF/DF/NF/LF) boven de cataloguslijst. Teller toont aantal treffers. "✕ Wis filter" reset alles.
- **Groepsnaam inline bewerken**: dubbelklik op een groepsnaam in de groepslijst (linkerzijbalk) opent een invoerveld. Bevestig met Enter, annuleer met Escape.
- **3D viewer — groepen verbergen**: knop "👁 Zichtbaarheid" linksboven in de 3D viewer. Per groep in- of uitschakelbaar. Verbergt wanden, steenstrips, openingen en penanten van de verborgen groep. Knoppen "Alles tonen" / "Alles verbergen". Knop kleurt blauw als er iets verborgen is.

### Opgelost
- **IFC export coördinaten — boven/onder flip**: elementen werden geëxporteerd in een geforceerd Z-up coördinatenstelsel (`normalizeZUp`) dat afweek van het originele model. Nu worden element-placements uitgedrukt in hetzelfde coördinatenstelsel als de bronwanden: het `IfcAxis2Placement3D` van elk element krijgt de juiste `Axis` (heightAxis-richting) en `RefDirection` (lengthAxis-richting) mee. Hierdoor komen steenstrips, panelen, latten, zetwerk en penanten correct op de wanden te liggen wanneer het export-IFC samen met het brondbestand in een IFC-viewer geopend wordt.
- **Duplicaatnamen bij gekoppelde groepen**: nieuwe gekoppelde groepen kregen dezelfde naam als de brongroep. Nu krijgen ze unieke namen op basis van de brongroepnaam + volgnummer (bijv. `Gevel Z-1`, `Gevel Z-2`).

---

## [Niet gereleased] — 27-04-2026

### Toegevoegd
- **Steenstrip artikelkeuze catalogus**: volledige Wienerberger Phaunis WF- en EF-serie (24 artikelen met prijzen per 1000 stuks, prijslijst 01-05-2026), FRONT WasteBasedSlips (Pistachio + Radish, WF 218×51×20 mm), 5 generieke types (WF/DF/NF/LF). Selectie vult automatisch afmetingen, dikte, voegmaten en gewicht in.
- **Artikelkeuze lattenwerk — Mclad catalogus**: 5 latprofielen met brandklasse, toepassing en prijs per m¹.
- **Basisplaat catalogus**: Bluclad Proboard 10 mm en vier ROCKPANEL Natural varianten (Durable/Xtreme, 8/10 mm).

---

## [Niet gereleased] — 26-04-2026

### Toegevoegd
- **Panelen halfsteen verspringen**: optie per groep/zone om paneelvoegen een halve steenlengte te laten verspringen zodat verticale voegen niet boven elkaar liggen.
- **HOH-bandbreedte latten**: instelbare minimale en maximale hartafstand (standaard 370–430 mm). De optimale HOH binnen deze bandbreedte wordt automatisch berekend.
- **Paneeloptimalisatie strategie**: panelen worden zo breed mogelijk gemaakt zodat het aantal unieke paneelafmetingen minimaal is en de bezetting per m² optimaal.

---

## [Niet gereleased] — 25-04-2026

### Toegevoegd
- **Teken zones — eigen UI-groep**: elke tekenzone heeft een eigen configuratiesectie in het zijpaneel (breedte/hoogte-invoer, eigen verband en striptypes).
- **Teken zones — verplaatsbaar**: zones zijn nu vrij te verplaatsen, los van andere elementen.
- **Teken zones — opening-uitsluiting**: openingen die geometrisch achter een tekenzone liggen worden automatisch uit die zone verwijderd.

---

## [Niet gereleased] — 24-04-2026

### Toegevoegd
- **Steenstrip kleurcodering in 2D**: elk striptype krijgt een eigen kleur in het 2D gevelaanzicht:
  - Bruin = kop
  - Blauw = strek (volledige steen)
  - Paars = driekwart
  - Rood = zaagmaat (groter dan een kop)
  - Fel oranje + uitroepteken = kleiner dan een kop

### Opgelost
- **Lat-rendering boven maximale hoogte**: latten werden soms buiten de gevelzone geplaatst. Hoogtebegrenzing gecorrigeerd.
- **Linker- en rechterrand logica sparingen**: randstukken worden nu altijd ≥ 1 kop breed.

---

## [Niet gereleased] — 23-04-2026

### Toegevoegd
- **Werktekening tweede pagina**: als de tekenzone te klein is voor alle informatie inclusief hoeveelheden, wordt de hoeveelheden-tabel automatisch naar een tweede pagina verschoven.
- **Paneelnummering en EPC-codes**: elk paneel krijgt een unieke 16-karakter EPC-code zichtbaar op de werktekening en zaaglijst.
- **Kop naast opening**: eerste strip naast een opening is altijd een kop (niet smaller dan een kop).
- **Rode zaagmaten en oranje kleine maten**: strips kleiner dan een strek maar groter dan een kop worden rood weergegeven; strips kleiner dan een kop worden oranje weergegeven met uitroepteken.

---

## [Niet gereleased] — 22-04-2026

### Toegevoegd
- **Multi-element IFC import**: meerdere elementtypen tegelijk selecteerbaar bij het importeren (wanden, slabs, proxies, coverings).
- **Zone-import modus**: IFC-elementen direct als tekenzone importeren (achterzijde = gevelvlak).
- **Coplanaire clustering**: elementen op hetzelfde vlak worden automatisch samengevoegd tot één gevelgroep.
- **Patroonberekening per wand**: strips worden per individuele wand berekend op basis van geometrie, openingen en zetwerk.
- **Wildverband**: 6-rij herhalend onregelmatig verband naast halfsteens, tegelverband en staand tegelverband.
- **Penanten in 2D en 3D**: uitstekende lijsten configureerbaar per groep.
- **Vergelijkbare groeperingen suggestie**: na aanmaken van een groep worden automatisch vergelijkbare gevelvlakken gesuggereerd.
- **Sync instellingen**: alle instellingen van de brongroep in één klik doorkopiëren naar gekoppelde groepen.
- **Undo (Ctrl+Z)**: volledige ongedaan-maken-history voor groepswijzigingen.
- **Project opslaan en laden**: volledig projectbestand (JSON) inclusief groepen, instellingen en zones.
- **IFC export**: geëxporteerd IFC-bestand met individuele brickslip-objecten per wand.
- **Zaaglijst CSV export**: alle panelen met afmetingen, aantallen per striptype en gewicht.
- **Maltekening DXF en PDF export**: MAL Links / MAL Rechts per zone.
