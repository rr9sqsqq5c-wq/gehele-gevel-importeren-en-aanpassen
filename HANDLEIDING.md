# IFC Brickslip Planner — Handleiding

## Inhoudsopgave

1. [Overzicht](#overzicht)
2. [Twee instapscenario's](#twee-instapscenarios)
3. [Scenario A — Volledig nieuwe opzet (eigen IFC)](#scenario-a--volledig-nieuwe-opzet-eigen-ifc)
4. [Scenario B — Zone-import (klant levert vlakken)](#scenario-b--zone-import-klant-levert-vlakken)
5. [Aanvullen uit een tweede IFC-bestand](#aanvullen-uit-een-tweede-ifc-bestand)
6. [Groep configureren (beide scenario's)](#groep-configureren-beide-scenarios)
7. [Openingen, kozijnen & ventilatie](#openingen-kozijnen--ventilatie)
8. [Wandafmetingen overschrijven](#wandafmetingen-overschrijven)
9. [Strip-zones handmatig tekenen in 2D](#strip-zones-handmatig-tekenen-in-2d)
10. [Steenstrip kleurcodering in 2D](#steenstrip-kleurcodering-in-2d)
11. [Steenstrip artikelkeuze & catalogus](#steenstrip-artikelkeuze--catalogus)
12. [Artikelkeuze lattenwerk](#artikelkeuze-lattenwerk)
13. [Basisplaat catalogus](#basisplaat-catalogus)
14. [Panelen en paneeloptimalisatie](#panelen-en-paneeloptimalisatie)
15. [3D Viewer — groepen verbergen](#3d-viewer--groepen-verbergen)
16. [Groepen beheren](#groepen-beheren)
17. [Maltekeningen](#maltekeningen)
18. [Werktekeningen & export](#werktekeningen--export)
19. [Schermindeling](#schermindeling)
20. [Tips & sneltoetsen](#tips--sneltoetsen)

---

## Overzicht

De **IFC Brickslip Planner** is een tool voor het importeren van gevelelementen uit een IFC-bestand, het indelen van wanden in gevelgroepen, en het configureren en berekenen van een steenstripsysteem per gevelgroep. Het resultaat wordt als werktekeningen, maltekeningen, zaaglijst en IFC-export aangeboden.

**Kernconcept — groepen:**
Een groep is een verzameling van één of meer wandelementen die samen één gevelvlak vormen. Per groep stel je in welk brickslip-patroon (metselverband), welke panelen en welke achterconstructie van toepassing zijn.

**Congruentie — alle weergaven gelijk:**
De zes weergaven van een groep — 2D-gevel, 3D, werktekening, meetstaat (uittrekstaat), IFC-export en maltekening — tonen en tellen exact hetzelfde. Strips, panelen, koppelstrippen en latten komen uit één gedeelde bron, zodat er geen verschil kan ontstaan tussen wat je op het scherm ziet en wat er wordt geproduceerd.

---

## Twee instapscenario's

Er zijn twee manieren om het systeem op te zetten, afhankelijk van wat de klant aanlevert:

| | **Scenario A** | **Scenario B** |
|---|---|---|
| **Wat levert de klant?** | Een IFC met constructieve wanden | Een IFC waarbij vlakken met steenstrips al zijn aangeduid als aparte elementen (bijv. slabs of proxies) |
| **Hoe start je?** | Standaard wandimport → groepen aanmaken → strip-zones handmatig tekenen | Zone-import modus → alles wordt automatisch per vlak ingedeeld |
| **Voordeel** | Volle controle, flexibel | Snel, klantindeling wordt direct overgenomen |

---

## Scenario A — Volledig nieuwe opzet (eigen IFC)

### Stap 1 — IFC importeren

1. Klik op **📂 IFC importeren** in de bovenste balk.
2. Selecteer een `.ifc`-bestand (standaard bestandskiezer of drag-and-drop).
3. De applicatie scant het bestand en toont alle gevonden elementtypen per IFC-entiteitstype.
4. **Selecteer de wandtypen** die je wilt importeren (doorgaans alleen buitengevels).  
   Gebruik de knop **Alleen wanden** om snel te filteren op `IFCWALL`/`IFCWALLSTANDARDCASE`.
5. Laat **Zone-import modus** uitstaan.
6. Klik op **Importeren**.

> **Tip:** Importeer alleen de typen die je nodig hebt. Binnenafscheidingen en vloeren vertragen de berekening en zijn niet relevant.

---

### Stap 2 — Overzicht in 3D

Na het importeren verschijnen alle wanden in de **3D Viewer**.

- **Klik** op een wand om hem te selecteren (blauw gemarkeerd).
- **Slepen** = rondkijken (orbit).
- Geselecteerde elementen verschijnen ook in de lijst links onder **Zonder groep**.

> **Tip:** Gebruik de **👁 Zichtbaarheid** knop linksboven in de 3D viewer om groepen tijdelijk te verbergen. Handig bij tegenoverliggende wanden.

---

### Stap 3 — Groepen aanmaken

Er zijn drie manieren:

#### A — Auto-groeperen per windrichting (aanbevolen voor complete gebouwen)

Klik op **🧭 Auto-groeperen per windrichting (N/O/Z/W)**.

De applicatie groepeert alle wanden op basis van hun oriëntatie en positie en maakt per gevelvlak een aparte groep (`Gevel N`, `Gevel Z`, etc.). Losse secties op dezelfde gevel worden gesplitst als `Gevel N-1`, `Gevel N-2`.

#### B — Auto-groeperen op aangrenzendheid

Klik op **🔗 Auto-groeperen op aangrenzendheid**.

Detecteert automatisch welke wanden een gemeenschappelijke rand delen en maakt voor elke verbonden set een aparte groep. Handig als windrichting niet relevant is.

#### C — Handmatige selectie

1. Klik op individuele wanden in de 3D Viewer om ze te selecteren.
2. Klik op **+ Nieuwe groep van selectie**.

---

### Stap 4 — Strip-zones tekenen (optioneel)

In het **2D Gevelaanzicht** kun je met de knop **▭ Teken zone** een of meerdere rechthoeken tekenen die aangeven **waar** op de gevel steenstrips komen.

- Gebieden **binnen** de getekende zones krijgen strips.
- Gebieden **buiten** de zones blijven leeg (bijv. beton-accenten, luifels).

Zie ook: [Strip-zones handmatig tekenen in 2D](#strip-zones-handmatig-tekenen-in-2d).

---

### Stap 5 — Groep configureren

Klik op een groep in de lijst links om deze te activeren. Rechts verschijnt het **configuratiepaneel**.

Stel in:
- Metselverband (halfsteens, tegelverband, staand, wildverband)
- Steenstrip afmetingen (of kies een artikel uit de catalogus)
- Openingen: kozijn-offset & ventilatie (indien van toepassing)
- Panelen (basisplaat type, methode banden/raster en maximale afmetingen)
- Achterconstructie latten (horizontaal of verticaal, HOH-bandbreedte)
- Penanten (als van toepassing)

Zie [Groep configureren](#groep-configureren-beide-scenarios) voor details.

---

### Stap 6 — Vergelijkbare groeperingen koppelen

Na het aanmaken van een groep controleert de applicatie automatisch of er vergelijkbare groeperingen elders voorkomen.

Als die worden gevonden, verschijnt een pop-up:
- Aangevinkte groeperingen worden automatisch aangemaakt en **gekoppeld** aan de brongroep.
- Nieuwe gekoppelde groepen krijgen een unieke naam (bijv. `Gevel N-1`, `Gevel N-2`).
- Gebruik daarna **Sync instellingen →** om alle instellingen in één keer door te kopiëren.

---

### Stap 7 — Exporteren en tekeningen maken

- **Werktekeningen**: klik op het tabblad **Werktekeningen** in het rechterpaneel.
- **IFC exporteren**: klik op **⬇ Exporteer IFC** in de topbalk.
- **Zaaglijst**: beschikbaar via het **Zaaglijst** tabblad.
- **Maltekeningen**: tabblad **Maltekening** per zone.

---

## Scenario B — Zone-import (klant levert vlakken)

Dit scenario is van toepassing als de klant een IFC aanlevert waarbij de **vlakken met steenstrips reeds zijn aangeduid** als aparte IFC-elementen (bijv. `IfcBuildingElementProxy`, `IfcSlab`, `IfcCovering`, of een specifiek wandtype). De **achterzijde** van die elementen vormt het startpunt van het systeem (gezien van binnen naar buiten).

### Stap 1 — IFC importeren in zone-modus

1. Klik op **📂 IFC importeren**.
2. Selecteer het IFC-bestand van de klant.
3. De applicatie scant **alle** elementtypen (wanden, vloeren, proxies, bekledingen, etc.) en toont ze gegroepeerd per IFC-entiteitstype:
   - Blauwe badge = WALL
   - Paarse badge = SLAB
   - Oranje badge = BUILDINGELEMENTPROXY
   - Groene badge = COVERING
4. **Vink de elementtypen aan** die de strip-oppervlakken vertegenwoordigen.
5. **Activeer de checkbox "Zone-import modus"** bovenin het dialoogvenster.  
   De uitlegstekst bevestigt: *"De achterzijde = start van het systeem. Elk coplanair cluster wordt een gevelgroep; elk element wordt een strip-zone."*
6. Klik op **🗺 Als zones importeren**.

---

### Stap 2 — Automatische groepering

De applicatie:

1. Parset de geselecteerde elementen en haalt hun geometrie op.
2. **Clustert** alle coplanaire elementen op basis van as (X/Y/Z) en positie (50 mm tolerantie).
3. Maakt per cluster een **gevelgroep** aan (`Zone N`, `Zone Z`, `Zone O/W`, etc.).
4. Zet elk afzonderlijk element als **strip-zone** in het 2D gevelaanzicht van die groep.

Na het importeren is de situatie direct:
- Gevelgroepen zijn aangemaakt en zichtbaar in de lijst links.
- In de 2D view van elke groep zijn de geïmporteerde zone-vlakken als cyaan stippelkaders te zien.
- Strips worden **alleen** getekend binnen die kaders.

---

### Stap 3 — Controleer de indeling in 2D

Schakel naar **2D Gevel** en klik de groepen af om te controleren:

- Zijn alle zone-vlakken correct herkend?
- Kloppen de afmetingen?
- Zijn er zones gemist of ongewenst samengevoegd?

Gebruik de **▭ Teken zone** functie om handmatig zones toe te voegen of de **✕**-knop in de zone-lijst om zones te verwijderen.

---

### Stap 4 — Achterliggende constructieve wanden laden (optioneel)

Als naast de zone-elementen ook de constructieve wanden nodig zijn (bijv. voor het bepalen van de achterconstructie-diepte), gebruik dan de knop **➕ Aanvullen…** in de topbalk om het tweede IFC-bestand (met de wanden) toe te voegen zonder de bestaande zone-groepen te verwijderen. Zie [Aanvullen uit een tweede IFC-bestand](#aanvullen-uit-een-tweede-ifc-bestand).

---

### Stap 5 — Groep configureren en exporteren

Verder identiek aan Scenario A vanaf [Stap 5](#stap-5--groep-configureren).

---

## Aanvullen uit een tweede IFC-bestand

Soms levert de klant meerdere IFC-bestanden aan — bijv. één met de constructieve wanden en één met dakrandelementen of gevelbekleding. Met de **➕ Aanvullen…** knop laad je elementen uit een tweede (of derde) bestand **in hetzelfde project**, zonder de bestaande groepen te verwijderen.

### Wanneer gebruiken?

| Situatie | Aanpak |
|---|---|
| Dakranden als aparte `IFCELEMENTASSEMBLY` entiteiten | Aanvullen → ELEMENTASSEMBLY typen selecteren |
| Extra gevelbekleding-elementen in apart bestand | Aanvullen → gewenste typen selecteren |
| Constructieve wanden + zone-vlakken in aparte bestanden | Eerst normaal importeren, dan aanvullen in zone-modus |

### Stap-voor-stap

1. Importeer het hoofdbestand normaal via **📂 IFC kiezen** en stel groepen in.
2. Klik op **➕ Aanvullen…** in de topbalk (verschijnt zodra er wanden zijn geladen).
3. Selecteer het tweede IFC-bestand.
4. De applicatie scant alle elementtypen — inclusief `IFCELEMENTASSEMBLY` (bijv. dakranden uit Tekla).  
   Badge-kleuren in het dialoog:
   - Blauw = WALL
   - Paars = SLAB
   - Oranje = BUILDINGELEMENTPROXY
   - Groen = COVERING
   - Grijs = ELEMENTASSEMBLY / overige typen
5. **Vink de typen aan** die je wilt toevoegen.
6. Klik op **➕ Toevoegen** — de geselecteerde elementen worden aan de wandenlijst toegevoegd.
7. De bestaande groepen blijven **ongewijzigd**. De nieuwe elementen verschijnen in **Zonder groep**.
8. Voeg de nieuwe elementen toe aan een bestaande groep of maak een nieuwe groep aan.

> **Let op:** elementen uit een aanvullend bestand krijgen intern een uniek prefix (`m1_…`, `m2_…`) zodat ID-conflicten worden voorkomen. Dit is zichtbaar als je met de muisaanwijzer over een element hovert.

> **Tip:** Je kunt **Aanvullen…** meerdere keren uitvoeren met verschillende bestanden. Elk aanvulbestand telt op.

---

## Wandafmetingen overschrijven

Soms klopt de IFC-geometrie niet met de werkelijkheid, of wil je een wand groter of kleiner tekenen zonder het IFC-bronbestand te wijzigen. Met de **afmetingsoverschrijving** per wand pas je de breedte en hoogte lokaal aan.

### Gebruik

1. Klik op een groep in de groepslijst (linkerzijbalk) om hem uit te klappen.
2. Per wand in de groep zie je twee invoervelden: **breedte (mm)** × **hoogte (mm)**.
3. Wijzig de waarde — het veld kleurt **paars** als de originele IFC-waarde is overschreven.
4. Klik op **↺** naast een wand om de originele waarden te herstellen.

### Gedrag

- **Openingen blijven op hun positie**: sparingen, ramen en deuren staan opgeslagen in lokale wandcoördinaten. Het aanpassen van de wandgrootte verplaatst de openingen **niet** — ze blijven op hun absolute positie ten opzichte van de wandrand.
- **Patroonberekening** en alle tekeningen (2D, 3D, werktekening) gebruiken direct de overschreven afmetingen.
- **Opgeslagen** in het projectbestand (JSON via **💾 Opslaan**) en in de automatische sessie-opslag (IndexedDB).

> **Tip:** Als een wand in de IFC een afwijkende hoogte heeft door een schuindak of schuin atelier, kun je de hoogte hier corrigeren zonder het bronmodel te wijzigen.

---

## Groep configureren (beide scenario's)

Klik op een groep in de lijst links. Het **rechterpaneel** toont alle instellingen:

### Naam en kleur

- De **naam** verschijnt in de lijsten, werktekeningen en IFC-export.
- Wijzig de naam via het **Naam** invoerveld bovenaan het configuratiepaneel.
- Of **dubbelklik** direct op de groepsnaam in de groepslijst links voor inline bewerking (bevestig met Enter, annuleer met Escape).
- De **kleur** onderscheidt de groep in 3D en 2D.

---

### Metselverband

| Optie | Beschrijving |
|---|---|
| **Halfsteens** | Strekken verspringen een halve steenlengte per laag. Eerste laag begint links met een strek, tweede laag met een kop. |
| **Tegelverband** | Regelmatige verspinging per halve steen, zonder koppen. |
| **Staand tegelverband** | Stenen staan verticaal (90° gedraaid). |
| **Wildverband** | Onregelmatig, levend verband met strekken, koppen en driekwart. Herhaalt na 6 rijen. |

---

### Steenstrip afmetingen

| Veld | Standaard | Beschrijving |
|---|---|---|
| **Lengte mm** | 210 | Zichtbare lengte van de strip |
| **Hoogte mm** | 50 | Zichtbare hoogte van de strip |
| **Lintvoeg mm** | 12 | Horizontale voeg tussen lagen |
| **Stootvoeg mm** | 10 | Verticale voeg tussen stenen |

> Stapelmaat per laag = hoogte + lintvoeg (bijv. 50 + 12 = 62 mm).

> **Tip:** Gebruik de **Steenstrips artikelkeuze** sectie om een artikel uit de catalogus te kiezen. De afmetingen, dikte, voegmaten en gewicht worden dan automatisch ingevuld.

---

### Panelen (basisplaat)

Verdeelt de gevels in draagsysteem-panelen. Kies een **basisplaat type** uit de catalogus. Zie ook [Panelen en paneeloptimalisatie](#panelen-en-paneeloptimalisatie).

---

### Achterconstructie latten

Houten latten als drager achter de basisplaat.

- **Horizontale latten**: de hartafstand wordt berekend binnen een instelbare **HOH-bandbreedte** (standaard 370–430 mm); de optimale afstand daarbinnen wordt automatisch gekozen zodat paneelgrenzen zoveel mogelijk op latten vallen.
- **Verticale latten**: gesnapt op paneelgrenzen.
- **Lat-oriëntatie**: met **latten plat** ligt de lange zijde in het gevelvlak (aanzicht) en de korte als diepte — corrigeert een artikel met omgekeerde maten (vlag `lattenPlat`).
- **Onderlat**: de onderste gevelbrede lat kan 10 mm boven de startlijn liggen i.p.v. er precies op — ruimte voor het start-/lekprofiel (vlag `onderlatOffset`).
- **Latten op de paneelvoeg**: optioneel ligt er een lat op elke paneelvoeg + begin/eind + gelijkmatige tussenvulling (vlag `lattenPaneelvoeg`).
- **Bestelregels**: minimaal 0,5 pak per artikel, ideale lat-lengte 4500 mm.
- Kies een **latartikel** uit de Mclad catalogus. Zie [Artikelkeuze lattenwerk](#artikelkeuze-lattenwerk).

---

### Penanten

Uitstekende verticale lijsten (pilasters, dagkantverlengingen).

| Veld | Beschrijving |
|---|---|
| **X positie mm** | Afstand van de linker groepsrand |
| **Breedte mm** | Breedte van het penant |
| **Diepte mm** | Uitsteek ten opzichte van het gevelvlak |
| **Hoogte mm** | Hoogte van het penant |

#### Hoekaansluiting penant

Wanneer een penant op een hoek de aanzichtsgevel vormt, kan deze automatisch worden gepositioneerd op het geometrische hoekpunt met een aansluitende (haakse) gevel. De aansluitende gevel loopt dan door tot de voorzijde van het penant — net zoals een zijkant van het penant aansluit op de voorzijde.

Per penant beschikbaar onderaan de penant-kaart:

| Veld | Beschrijving |
|---|---|
| **Hoekaansluiting** | Aan/uit-schakelaar voor de automatische hoekpositionering |
| **Aansluitende gevel** | Kies de haakse gevelgroep die op deze hoek aansluit |
| **Linker / Rechter hoek** | Aan welke kant van de aanzichtsgevel zit de hoek |
| **Berekende penantpositie** | Read-only: `x` wordt automatisch berekend uit het snijpunt van beide gevelvlakken in modelSpace |
| **Toepassen op aansluitende gevel** | Schrijft een `endExtension` naar de aangrenzende groep gelijk aan `diepte + brickDepth` — strips, latten en panelen lopen door tot de penant-voorzijde |

**Geometrische regels:**
- Het hoekpunt wordt bepaald uit de **buitenste thickness-face** van de aansluitende wand (`resolvedOutside.outsidePos`), geprojecteerd op de lengte-as van de aanzichtsgevel.
- Penantpositie volgt de geometrische aansluiting, **niet** de groepsbreedte.
- Het uiteinde van de aansluitende gevel (`left` / `right`) waarop de `endExtension` wordt geschreven, wordt automatisch gedetecteerd op basis van afstand tot de buitenfacade van de aanzichtsgevel.
- View2D, Viewer3D en IFC-export pakken de `endExtension` automatisch op via de bestaande end-extension-clip — geen aparte rendercode.
- Bestaande penanten zonder hoekkoppeling blijven ongewijzigd.

---

## Openingen, kozijnen & ventilatie

Ramen, deuren en andere openingen worden uit de bekleding weggeknipt. Rondom kun je het gedrag fijn afstellen.

### Kozijn-offset

Een globale (hele-gebouw) marge per zijde — **links / rechts / boven / onder**, in mm — tussen de **kozijnrand** en de bekleding. Strips, panelen én latten volgen dezelfde opgerekte opening, dus één instelling raakt alle drie de lagen tegelijk. Valt een raam/deur-formaat opening zonder herkenbaar kozijn op, dan verschijnt een melding (⚠️). Aan te zetten met de vlag `kozijnOffset`.

### Kozijnen tonen

Met **Kozijnen tonen** verschijnt het echte raam/deur-kozijn als amber kader in 2D en als doos in 3D, ter controle van de uitlijning t.o.v. de strips (vlag `showKozijnen`).

### Ventilatiezone

Een klein ongevuld gat boven een raam (ventilatie) wordt open geknipt en krijgt een rechthoekige **zone met loodrecht verband** eromheen (halfsteens ↔ staand tegelverband). Hoogte × breedte is per groep instelbaar (vlag `ventilatieZone`). Het gat wordt uit één plaat gesneden — de plaat blijft heel en het gat is gemarkeerd voor de frees/zagerij.

### Sparing-onderdelen

Niet-wand IFC-onderdelen (leidingen, kanalen, proxies) kun je importeren, in 3D tonen en de bekleding er met een globale marge omheen sparen. In 2D verschijnt de maatvoering (onderdeel-breedte × hoogte + offset per zijde). Selecteer per type, naam of per exemplaar (Tag/GUID). Aan te zetten met de vlag `sparingElementen`.

### Concave openingen (raam + deur)

Staat een deur pal naast een raam, dan worden die twee tot hun echte L/U-vorm samengevoegd i.p.v. tot één rechthoek — zo blijft het massieve muurdeel onder het raam bekleed (vlag `concaveOpeningMerge`).

---

## Strip-zones handmatig tekenen in 2D

In het **2D Gevelaanzicht** kun je zones tekenen om aan te geven waar strips komen. Elke tekenzone heeft een eigen configuratiesectie in het zijpaneel, identiek van opzet als de penant-zones.

### Zone aanmaken

1. Schakel naar **2D Gevel**.
2. Klik op **▭ Teken zone** (linksboven in de 2D viewer). De cursor wordt een kruisje.
3. **Klik en sleep** om een rechthoek te tekenen op het gevelvlak.
4. Laat los — de zone verschijnt als cyaan stippelkader met label en afmetingen.
5. Herhaal voor meerdere zones.

> **Tip — snapping**: het start- en eindpunt snappen automatisch naar de **gevelbuitenzijdes** (links, rechts, boven, onder) zodra je cursor binnen 100 mm van de rand komt. Zo sluit een zone die de volle breedte of hoogte beslaat altijd nauwkeurig aan.

### Zone configureren (zijbalk)

Zodra er ≥1 tekenzone bestaat, verschijnt de sectie **Tekenzones (n)** automatisch in de zijbalk van de geselecteerde groep. Per zone:

| Instelling | Omschrijving |
|---|---|
| **Checkbox** | Zone-instellingen in- of uitschakelen (uitgeschakeld = groep standaard geldt) |
| **Kleur** | Eigen kleur voor de zone in het 2D-aanzicht |
| **→ kopieer** | Instellingen kopiëren naar een andere zone of alle zones |
| **✕** | Zone verwijderen |
| **Label** | Naam van de zone |
| **Metselverband** | halfsteens / halfsteens kop / staand tegelverband / wildverband |
| **Achterconstructie** | hout / aluminium / SlimFort XT® (of groep standaard) |
| **Panelisatie** | aan / uit (of groep standaard) |
| **Steenstrip afmetingen** | steenL, steenH, lintvoeg, stootvoeg — per zone overschrijfbaar; worden grijs als een groepsartikel is gekozen |
| **Max strip hoogte** | Optionele bovengrens voor het strippatroon binnen de zone (mm) |

Klik op een zone in het 2D-canvas om hem te selecteren (oranje kader). Een kleine indicator (`◆ Zone A — Instellingen → zijbalk`) bevestigt de selectie; de inhoudelijke instellingen staan in de zijbalk.

### Zone-lijst (linksboven in 2D viewer)

- Klik op een zone-rij om hem te selecteren.
- Klik **✕** naast een zone om hem te verwijderen.
- Klik **Alle zones wissen** om opnieuw te beginnen.

### Gedrag

- Zonder zones → strips over het hele gevelvlak.
- Met zones → strips alleen binnen de getekende kaders.
- Openingen die **achter** een tekenzone liggen worden automatisch uit die zone verwijderd.
- Zones met **enabled = uit** tonen geen eigen instellingen maar blijven als kader zichtbaar.

---

## Steenstrip kleurcodering in 2D

Het 2D gevelaanzicht kleurt elke steenstrip op basis van het type (de positie in het verband):

| Kleur | Type | Omschrijving |
|---|---|---|
| **Bruin** | Kop | Volledige kop (korte zijde zichtbaar) |
| **Blauw** | Strek | Volledige strek (= 1 volle steen) |
| **Paars** | Driekwart | Driekwart steen |
| **Rood** | Zaagmaat (groot) | Afwijkende maat, groter dan een kop — wordt op maat gezaagd |
| **Fel oranje + !** | Te klein | Kleiner dan een kop — let op: controleer of deze maat acceptabel is |

> **Tip:** Rode en oranje strips duiden op posities waar de gevel of opening niet opgaat in de steen-ritmiek. Overweeg het openingsmaat of de startpositie van het patroon aan te passen.

---

## Steenstrip artikelkeuze & catalogus

In de sectie **Steenstrips artikelkeuze** kies je één steenstriptype uit de catalogus. Het gekozen artikel vult automatisch de afmetingen, dikte, voegmaten en gewicht in.

### Filteren en zoeken

Gebruik de filters bovenaan de artikellijst om snel te vinden wat je zoekt:

- **Zoekbalk** — zoek op naam, kleur, kleuromschrijving of artikelnummer.
- **Leverancier-filter** — filterknop per leverancier:
  - `Wienerberger` — Handvorm Kortemark, Phaunis serie
  - `FRONT` — WasteBasedSlips (gerecycled)
  - `Generiek` — maatinvoer zonder vaste leverancier
- **Formaat-filter** — `WF` (Waalformaat), `EF` (Euroformaat), `DF` (Dikformaat), `NF`, `LF`
- **Teller** — toont hoeveel artikelen de filter oplevert.
- **✕ Wis filter** — zet alle filters in één klik terug.

### Beschikbare leveranciers en series

| Leverancier | Serie | Formaten | Artikelen |
|---|---|---|---|
| **Wienerberger — Handvorm Kortemark** | Phaunis | WF (210×50×18 mm), EF (210×65×18 mm) | 12 kleuren per formaat |
| **FRONT (formerly StoneCycling)** | WasteBasedSlips | WF (218×51×20 mm) | Pistachio, Radish |
| **Eigen keuze / nader te bepalen** | Generiek | WF, DF, NF, LF | Maatinvoer, prijs n.t.b. |

### Artikel selecteren

- Klik op een artikel om het te selecteren (paars kader).
- Klik nogmaals om de selectie op te heffen.
- De afmetingen in **Steenstrip afmetingen** worden direct overschreven door het gekozen artikel.

> **Tip:** De prijzen in de catalogus zijn af-fabriek, excl. BTW. Upload eigen prijzen via de prijslijst-upload (CSV) om projectspecifieke prijzen te gebruiken.

---

## Artikelkeuze lattenwerk

In de sectie **Achterconstructie latten → Latartikel** kies je één latprofiel uit de **Mclad catalogus**.

| Artikel | Brandklasse | Toepassing | Prijs |
|---|---|---|---|
| Mclad® V18 47×32 / 45×30 mm | D-s2,d0 | Open gevel | Zie catalogus |
| Mclad® V18 47×50 / 45×45 mm | D-s2,d0 | Open + gesloten gevel | Zie catalogus |
| Mclad® V18-NSG 47×50 / 45×45 mm | D-s2,d0 | Gesloten gevel | Zie catalogus |
| Mclad® V18-NSG 47×75 / 45×70 mm | B-s1,d0 | Gesloten gevel | Zie catalogus |
| Mclad® V18-NSG 47×75 / 45×70 mm RAL9005 | D-s2,d0 | Open + gesloten gevel | Zie catalogus |

Het gekozen artikel wordt meegenomen in de meetstaat en uittrekstaat.

---

## Basisplaat catalogus

In de sectie **Panelen → Basisplaat** kies je de paneerplaat:

| Artikel | Dikte | Gewicht | Max. afmeting |
|---|---|---|---|
| Bluclad Proboard 10 mm | 10 mm | 11,8 kg/m² | 1250 × 3000 mm |
| ROCKPANEL Natural Durable 8 mm | 8 mm | 8,4 kg/m² | 1250 × 3050 mm |
| ROCKPANEL Natural Durable 10 mm | 10 mm | 10,5 kg/m² | 1250 × 3050 mm |
| ROCKPANEL Natural Xtreme 8 mm | 8 mm | 9,6 kg/m² | 1250 × 3050 mm |
| ROCKPANEL Natural Xtreme 10 mm | 10 mm | 12,0 kg/m² | 1250 × 3050 mm |

---

## Panelen en paneeloptimalisatie

### Paneelindeling

De applicatie verdeelt elk gevelvlak automatisch in panelen op basis van:

1. **Maximale breedte** — begrensd door de gekozen basisplaat.
2. **Maximale hoogte** — begrensd door de gekozen basisplaat.
3. **Maximaal gewicht** — instelbaar (standaard 75 kg) voor montage-eisen.
4. **Snap op voeglijnen** — paneelgrenzen worden gesnapt op steenstripvoegen voor minimaal snijverlies.
5. **HOH-optimalisatie latten** — de hartafstand van horizontale latten wordt automatisch geoptimaliseerd binnen de ingestelde bandbreedte (standaard 370–430 mm) zodat paneelgrenzen zoveel mogelijk op latten vallen.

### Paneelmethode: banden of raster

Per groep kies je onder **Panelen → Paneelmethode** hoe de basisplaten worden ingedeeld (de rasterkeuze verschijnt alleen als de vlag `paneelRaster` aan staat):

- **Banden** (standaard) — de optimale, gewicht-gestuurde indeling: panelen zo groot mogelijk binnen plaatmaat en gewicht, grenzen gesnapt op de steenvoegen, met voeg-geleide banden rondom de openingen (vlag `paneelBanden`).
- **Raster** — een vast, uniform raster: rijen op een vaste hoogte (14 lagen, voor montagegemak van de achterconstructie) en kolommen 5 strekken breed. Rondom een raam stapt de paneelrand naar de raamzijkant (een klein paneel naast een raam wordt geaccepteerd; de veld-kolommen houden hun volle maat). Instelbaar via **Breedte** en **Hoogte** in mm.

**Koppelstrippen (om-en-om):** een steenstrip die over een paneelvoeg in een buurpaneel steekt heet een *koppelstrip* — die wordt op locatie geplaatst en apart geteld op de zaaglijst. Bij halfsteens vallen de paneelvoegen in de stootvoeg, zodat de koppelstrippen om-en-om liggen (nooit twee rijen pal boven elkaar). Tussen aangrenzende panelen zit 3 mm plaatsingsspeling.

### Halfsteen verspringen van paneelvoegen

Activeer de optie **Panelen halfsteen verspringen** (per groep/zone) om te voorkomen dat paneelvoegen verticaal boven elkaar liggen. De paneelindeling verspringt dan per rij een halve steenlengte, waardoor de voegen minder zichtbaar zijn in het eindresultaat.

### Paneelnummering

Elk paneel krijgt een uniek **EPC-code** (16 karakter) die ook op de zaaglijst en werktekeningen verschijnt. Panelen worden genummerd van links-onder naar rechts-boven.

### Werktekeningen per paneel

De werktekening toont alle info per paneel. Als de tekenzone te klein is voor alle informatie, wordt de hoeveelheden-tabel automatisch naar de tweede pagina verplaatst.

---

## 3D Viewer — groepen verbergen

Linksboven in de 3D viewer staat de knop **👁 Zichtbaarheid**. Hiermee kun je groepen tijdelijk verbergen, wat handig is bij:

- Tegenoverliggende wanden die elkaar overlappen in het beeld.
- Grote modellen waarbij je één gevel apart wilt bekijken.
- Het selecteren van wanden die achter andere wanden liggen.

### Gebruik

1. Klik op **👁 Zichtbaarheid** — het paneel klapt open.
2. Klik op een groepsnaam om die groep te verbergen (halftransparant weergegeven).
3. Klik nogmaals om de groep weer zichtbaar te maken.
4. Gebruik **Alles tonen** of **Alles verbergen** als snelknop.
5. **Ongegroepeerd** — verberg ook de wanden die nog geen groep hebben.

De knop kleurt **blauw** als er groepen verborgen zijn, zodat je altijd ziet of de weergave gefilterd is.

> **Let op:** Verbergen is puur visueel en tijdelijk. Selectie en configuratie van verborgen groepen is gewoon mogelijk via de lijst links.

---

## Groepen beheren

### Groepsnaam wijzigen

- Via het **Naam** veld bovenaan het configuratiepaneel (rechts).
- Of **dubbelklik** op de naam in de groepslijst (links) → typ de nieuwe naam → **Enter** bevestigt, **Escape** annuleert.

### Groep verwijderen

Klik op het 🗑-icoon rechtsboven in het configuratiepaneel.

### Wand uit groep verwijderen

Klik op **✕** naast de wand in de uitklapbare groepslijst links.

### Groepen koppelen

Na het aanmaken van een groep worden vergelijkbare groeperingen automatisch gesuggereerd. Nieuwe gekoppelde groepen krijgen automatisch unieke namen (bijv. `Gevel Z-1`, `Gevel Z-2`).

Gebruik **Sync instellingen →** om alle instellingen van de brongroep door te kopiëren naar alle gekoppelde groepen.

---

## Maltekeningen

Per gevelgroep worden automatisch **maltekeningen** gegenereerd voor MAL Links en MAL Rechts.

- Toegang via tabblad **Werktekeningen → tab Maltekening**.
- De mallen hebben een vaste contour met inkepingen aan boven- en onderkant.
- De indeling in steenstripvakjes past zich aan op de afmetingen van de strips en de ingestelde toleranties.
- De toleranties (lengte en hoogte) zijn instelbaar in de instellingen.

**Export:**
- **DXF** — voor de metaalzetterij (laser- of waterjetsnijden uit 2 mm plaatstaal).
- **PDF** — voor eigen inzicht en goedkeuring.

**Productielogica:**
- Twee identieke mallen (MAL Links / MAL Rechts) wisselen elkaar af.
- MAL Links wordt gevuld terwijl MAL Rechts wordt geleegd.
- Samen vormen ze een herhalend patroon van 6 rijen (3 rijen per mal).

---

## Werktekeningen & export

### Werktekeningen

Het tabblad **Werktekeningen** in het rechterpaneel bevat:

| Tab | Inhoud |
|---|---|
| **1 — Overzicht** | Zone-indeling en groepering op gevelniveau |
| **2 — Panelen** | Paneelplaatsing per gevel met afmetingen |
| **3 — Latten** | Lattenpatroon en hartafstanden |
| **4 — Penanten** | Penant-doorsneden en zijvlakdetails |
| **5 — Productie** | Paneeluitslag met strips voor productie |
| **6 — Maltekening** | MAL Links en MAL Rechts per zone |

Werktekeningen worden automatisch opgemaakt zodat alle informatie zichtbaar is. Als de tekenzone te klein is, wordt de hoeveelheden-tabel naar een tweede pagina verschoven.

### Zaaglijst

Het tabblad **Zaaglijst** toont alle panelen met:
- Uniek paneel-ID (16-karakter EPC-code)
- Afmetingen (breedte × hoogte)
- Aantallen per striptype (Vol / Kop / Driekwart / Rest)
- Gewicht

Exporteer als **CSV** voor gebruik in de fabriek.

### IFC exporteren

Klik op **⬇ Exporteer IFC** als alle groepen zijn geconfigureerd.

Het geëxporteerde bestand bevat per wand de individuele brickslip-objecten op de juiste positie en oriëntatie.

---

## Schermindeling

```
┌──────────────────────────────────────────────────────────────────┐
│  TOPBALK: IFC importeren · Undo · Patroon in 3D · 3D/2D · Export │
├────────────┬─────────────────────────────────┬───────────────────┤
│            │  [👁 Zichtbaarheid] (links)      │                   │
│  LINKER-   │                                 │  GROEP            │
│  ZIJBALK   │       3D VIEWER                 │  CONFIGURATIE     │
│            │       of                        │  (tabs:           │
│  · Acties  │       2D GEVELAANZICHT          │   Instellingen    │
│  · Groepen │                                 │   Werktekeningen  │
│  · Zonder  │       [⬚ Box] [Kompas]          │   Zaaglijst)      │
│    groep   │       (rechts)                  │                   │
└────────────┴─────────────────────────────────┴───────────────────┘
```

### Linkerzijbalk

| Onderdeel | Beschrijving |
|---|---|
| ⬡ aangrenzend banner | Aantal aangrenzende relaties gevonden |
| 🔗 Auto-groeperen aangrenzendheid | Groepen op basis van aanraking |
| 🧭 Auto-groeperen windrichting | Groepen per N/O/Z/W gevelvlak |
| + Nieuwe groep van selectie | Groep van geselecteerde elementen |
| Voeg toe aan [groep] | Element toevoegen aan bestaande groep |
| Groepen | Lijst van alle aangemaakte groepen (dubbelklik = naam wijzigen) |
| Zonder groep | Elementen die nog niet ingedeeld zijn |

---

## Tips & sneltoetsen

| Actie | Sneltoets / tip |
|---|---|
| Ongedaan maken | **Ctrl+Z** |
| Zone-import | Activeer "Zone-import modus" in het importdialoog |
| Elementen uit tweede IFC toevoegen | **➕ Aanvullen…** knop in de topbalk (verschijnt na eerste import) |
| Wandbreedte/hoogte aanpassen | Invoervelden per wand in de uitgeklapte groepslijst links |
| Wandafmeting herstellen naar IFC | **↺** knop naast de wand in de groepslijst |
| Strip-zone tekenen | **▭ Teken zone** knop in 2D viewer |
| Instellingen kopiëren naar gekoppelde groepen | **Sync instellingen →** |
| Wand uit groep verwijderen | Klik **✕** naast de wand in de groepslijst |
| Groep verwijderen | Klik 🗑 in het configuratiepaneel |
| Groepsnaam wijzigen | **Dubbelklik** op naam in groepslijst, of via Naam-veld in configuratiepaneel |
| Groep verbergen in 3D | **👁 Zichtbaarheid** knop linksboven in 3D viewer |
| Alle ongegroepeeerden selecteren | **Selecteer alle** in de sectie "Zonder groep" |
| Patroon tijdelijk verbergen | Vink **Patroon in 3D** uit in de topbalk |
| Steenstrip catalogus filteren | Leverancier- en formaatknoppen + zoekbalk in "Steenstrips artikelkeuze" |
| Paneelvoegen verspringen | Optie **Panelen halfsteen verspringen** per groep/zone activeren |
| Bestand onthouden | Applicatie slaat het IFC-bestand automatisch op (IndexedDB); bij volgende sessie kun je direct opnieuw laden |
