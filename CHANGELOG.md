# IFC Brickslip Planner — Changelog

## [Niet gereleased] — 15-05-2026

### Toegevoegd
- **Groepen samenvoegen**: nieuw "↗ Samenvoegen naar..." dropdown in het uitklapbare groepsdetailpaneel (links in de groepslijst). Verplaatst alle wanden van de huidige groep naar een andere groep en verwijdert de brongroep. Handig voor de workflow: maak een tijdelijke groep van geselecteerde dakrandpanelen, corrigeer de richting via "Positie 1 / Positie 2", en voeg de wanden daarna toe aan een bestaande groep. De gecorrigeerde orientatie (outsideDir) blijft behouden na het samenvoegen.
- **SlimFort — Kopse kant breedte volledig**: het SlimFort isolatieraster (EPS-platen, profielen, beugels) op de kopse kant (eindvlak) beslaat nu de volledige displaybreedte: **linker isolatiediepte + betonwanddikte + rechter isolatiediepte**. Voorheen was dit beperkt tot de ruwe betonbreedte minus de hoekafsnede. Steenstrips op de kopse kant beslaan al de volledige displaybreedte (ongewijzigd).

---

## [Niet gereleased] — 14-05-2026

### Toegevoegd
- **SlimFort — 2D uitgeslagen aanzicht (uitgevouwen gevelopbouw)**: wanneer een groep SlimFort-bekledingsvlakken heeft geconfigureerd (betonwand bekledingsvlakken), toont het 2D gevelaanzicht een volledig uitgeslagen weergave van alle actieve bekledingsvlakken naast elkaar. Per vlak worden getoond:
  - EPS isolatiepanelen (lichtgrijs, gestippelde rand)
  - Aluminium profielen (grijsblauw) en beugels (donkergrijs)
  - Steenstrips (baksteen) in de ingestelde kleur en het verband
  - Kleurgecodeerde vlakcontouren: blauw (linker langszijde) · paars (linker kopse kant) · groen (rechter langszijde) · roze (rechter kopse kant)
  - PLOOI-markering met ruittekens op elke vouwlijn tussen vlakken
  - Vlakklabel en dimensietekst (breedte × hoogte in mm)
- **SlimFort — Niet-bekleed zones in uitgeslagen aanzicht**: de gedeelten van de lange wanden die buiten het geconfigureerde beklede bereik vallen, worden weergegeven als een grijs transparant vlak met het label "niet bekleed X mm". Zo is direct zichtbaar welk deel van de muur onbekleed blijft.
- **SlimFort — Betonwand bekledingsvlakken UI**: nieuwe sectie "Betonwand bekledingsvlakken" in het groepsconfiguratiepaneel (actief bij backing-type: Aluminium SlimFort). Stel per bekledingsvlak in welke vlakken actief zijn:
  - Linker langszijde (voor, buiten)
  - Rechter langszijde (achter, buiten)
  - Linker kopse kant (eindvlak links)
  - Rechter kopse kant (eindvlak rechts)
  Per actief vlak zijn de bereiken instelbaar (hoekdiepte, startoffset, eindoffset). De instellingen worden meegenomen in de berekening van het SlimFort-raster, de 2D weergave en de IFC-export.

---

## [Niet gereleased] — 12-05-2026

### Toegevoegd
- **SlimFort DetailBoek**: automatisch gegenereerd detailboek (`DetailBoek`-tabblad) met systeem-aware detailtekeningen per gevelzijde. Bevat:
  - Verticale coupes: maaiveldaansluiting (onderkant systeem) en bovenregel/dakrand
  - Horizontale coupes: hoekaansluiting en dagkantdetail
  - Kanonieke laagsopbouw per systeem (hout / aluminium SlimFort)
  - Tabfiltering per gevelzijde; SVG-componenten voor het genereren van de tekeningen
- **SlimFort Werktekeningen (5 sheets)**: de `SlimFortWerktekening` bevat vijf gedetailleerde sheets:
  - Sheet 1 — Uitgeslagen gevelopbouw per vlak
  - Sheet 2 — Paneelindeling per vlak met afmetingen
  - Sheet 3 — Profiel- en beugelpatroon (hartafstanden)
  - Sheet 4 — EPS isolatieraster
  - Sheet 5 — Productie-aanwijzingen en materiaaltotalen
- **Wandsubstraattype detectie** (`wallSubstrateType`): automatische herkenning van het wandmateriaal op basis van de naam en het elementtype uit het IFC (beton / HSB / staal / metselwerk / onbekend). Bij detectie van beton wordt het backing-type automatisch voorgesteld als "Aluminium SlimFort".
- **3D Viewer — SlimFort vlakken debug-overlay**: visuele debugweergave van de berekende SlimFort-bekledingsvlakken in de 3D-viewer. Toont vlakcontouren, EPS-platen, profielen en beugels per vlak.
- **View2D — perpendiculaire hint auto-berekening**: de perpendiculaire oriëntatiehint voor SlimFort-vlakken wordt nu automatisch berekend vanuit de geometrie, zonder handmatige invoer.

### Opgelost
- **IFC export fallback / envelope filter**: correcte geometrie bij ontbrekende of onvolledige wallOrigin-data; envelopefilter werkt nu ook in de fallback-tak.
- **3D fallback patroon**: correcte weergave van het steenstrippatroon in de 3D viewer bij ontbrekende facadeData.
- **View2D sfDebug scope**: variabele scope-fout in de 2D SlimFort debug-overlay gecorrigeerd (fout waarbij sfDebug buiten bereik was).
- **claddingDepthInward semantiek**: de betekenis van `claddingDepthInward` is omgedraaid zodat "inwaarts" overeenkomt met de fysieke interpretatie (diepte van de bekleding gemeten vanaf de muurkant).
- **Keyplan systeemdetectie**: incorrecte systeemdetectie in de keyplan-weergave gecorrigeerd; het juiste systeem per groep wordt nu herkend.
- **Continue wand fix in View2D**: sfFaceLayout-rendering was onterecht actief bij cfcs-configuratie; nu correct onderdrukt.
- **3D Viewer totalThickness auto-sync**: de totalThickness instelling synchroniseert nu automatisch na wijziging in de instellingen, zonder handmatige invalidatie.

---

## [Niet gereleased] — 30-04-2026

### Toegevoegd
- **Wandafmetingen overschrijven**: per wand in de groepslijst (linkerzijbalk) zijn twee invoervelden beschikbaar voor **breedte (mm)** en **hoogte (mm)**. Een overschreven waarde wordt paars/blauw gemarkeerd. Een **↺** knop verschijnt om de originele IFC-waarde te herstellen. Openingen blijven op hun absolute positie staan — alleen het wandoppervlak verandert. Overrides worden opgeslagen in het projectbestand (JSON) en de automatische sessie-opslag (IndexedDB).
- **Aanvullen uit tweede IFC-bestand**: nieuwe knop **➕ Aanvullen…** in de topbalk (verschijnt zodra er wanden zijn geladen). Hiermee kunnen elementen uit een aanvullend IFC-bestand worden toegevoegd aan het huidige project zonder de bestaande groepen te verwijderen. Elementen krijgen een intern prefix (`m1_`, `m2_`, …) zodat ID-conflicten worden voorkomen.
- **IFCELEMENTASSEMBLY ondersteuning**: het element-scannertje en de zone-importparser herkennen nu ook `IFCELEMENTASSEMBLY`-entiteiten (bijv. dakrand-elementen uit Tekla Structures). Ze worden gegroepeerd op de `Name`-waarde van de assembly (bijv. `ELEMENT`, `BOVENREK`). Beschikbaar in zowel de "Aanvullen"-modus als de reguliere zone-import.

## [Niet gereleased] — 28-04-2026

### Toegevoegd
- **Bestellijst totaal (Uittrekstaat)**: nieuwe sectie onderaan de uittrekstaat met een geaggregeerde bestellijst over alle groepen heen. Per materiaalsoort (steenstrips, basisplaten, latten) worden totalen opgeteld: totaal m², stuks, pallets, totaalprijs excl. en incl. BTW. Vermeldt bij elke post in welke groepen het materiaal is gebruikt.
- **Steenstrip artikelkeuze — leverancier-filter**: zoekbalk, leverancier-knoppen (Wienerberger / FRONT / Generiek) en formaat-knoppen (WF/EF/DF/NF/LF) boven de cataloguslijst. Teller toont aantal treffers. "✕ Wis filter" reset alles.
- **Groepsnaam inline bewerken**: dubbelklik op een groepsnaam in de groepslijst (linkerzijbalk) opent een invoerveld. Bevestig met Enter, annuleer met Escape.
- **3D viewer — groepen verbergen**: knop "👁 Zichtbaarheid" linksboven in de 3D viewer. Per groep in- of uitschakelbaar. Verbergt wanden, steenstrips, openingen en penanten van de verborgen groep. Knoppen "Alles tonen" / "Alles verbergen". Knop kleurt blauw als er iets verborgen is.

### Opgelost
- **IFC export coördinaten — boven/onder flip en rotatie**: twee oorzaken opgelost. (1) Element-placements werden geforceerd naar Z-up via `normalizeZUp`; nu worden `Axis` (heightAxis-richting) en `RefDirection` (lengthAxis-richting) per element expliciet ingesteld op de bronassen. (2) De `IfcGeometricRepresentationContext` (WCS) werd altijd als Z-up gedeclareerd, ongeacht het bronmodel; nu wordt de dominante `heightAxis` van de geïmporteerde wandgroepen gebruikt om de WCS-as correct in te stellen (bijv. Y-up bij Y-up bronmodellen). Hierdoor vallen steenstrips, panelen, latten, zetwerk en penanten correct samen met het brongebouw in een IFC-viewer.
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
