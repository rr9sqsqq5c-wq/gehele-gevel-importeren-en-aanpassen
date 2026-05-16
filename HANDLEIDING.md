# IFC Brickslip Planner — Handleiding

## Inhoudsopgave

1. [Overzicht](#overzicht)
2. [Twee instapscenario's](#twee-instapscenarios)
3. [Scenario A — Volledig nieuwe opzet (eigen IFC)](#scenario-a--volledig-nieuwe-opzet-eigen-ifc)
4. [Scenario B — Zone-import (klant levert vlakken)](#scenario-b--zone-import-klant-levert-vlakken)
5. [Aanvullen uit een tweede IFC-bestand](#aanvullen-uit-een-tweede-ifc-bestand)
6. [Groep configureren (beide scenario's)](#groep-configureren-beide-scenarios)
7. [Wandafmetingen overschrijven](#wandafmetingen-overschrijven)
8. [Strip-zones handmatig tekenen in 2D](#strip-zones-handmatig-tekenen-in-2d)
9. [Steenstrip kleurcodering in 2D](#steenstrip-kleurcodering-in-2d)
10. [Steenstrip artikelkeuze & catalogus](#steenstrip-artikelkeuze--catalogus)
11. [Artikelkeuze lattenwerk](#artikelkeuze-lattenwerk)
12. [Basisplaat catalogus](#basisplaat-catalogus)
13. [Panelen en paneeloptimalisatie](#panelen-en-paneeloptimalisatie)
14. [3D Viewer — groepen verbergen](#3d-viewer--groepen-verbergen)
15. [Groepen beheren](#groepen-beheren)
16. [Aluminium SlimFort systeem](#aluminium-slimfort-systeem)
17. [Betonwand bekledingsvlakken](#betonwand-bekledingsvlakken)
18. [SlimFort — 2D uitgeslagen aanzicht](#slimfort--2d-uitgeslagen-aanzicht)
19. [DetailBoek](#detailboek)
20. [Maltekeningen](#maltekeningen)
21. [Werktekeningen & export](#werktekeningen--export)
22. [Schermindeling](#schermindeling)
23. [Tips & sneltoetsen](#tips--sneltoetsen)

---

## Overzicht

De **IFC Brickslip Planner** is een tool voor het importeren van gevelelementen uit een IFC-bestand, het indelen van wanden in gevelgroepen, en het configureren en berekenen van een steenstripsysteem per gevelgroep. Het resultaat wordt als werktekeningen, maltekeningen, zaaglijst en IFC-export aangeboden.

**Kernconcept — groepen:**
Een groep is een verzameling van één of meer wandelementen die samen één gevelvlak vormen. Per groep stel je in welk brickslip-patroon, welk zetwerk, welke panelen en welke achterconstructie van toepassing zijn.

**Backing types:**
- **Hout** — standaard houten lattenconstructie als drager.
- **Aluminium SlimFort** — aluminium draagsysteem voor betonnen gevels. Activeert uitgebreide SlimFort-berekeningen inclusief EPS-isolatie, profielen, beugels en een 2D uitgeslagen aanzicht.

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
- Zetwerk rondom openingen
- Panelen (basisplaat type en maximale afmetingen)
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

### Zetwerk rondom openingen

Aluminium of stalen randprofiel rondom ramen en deuren.

| Veld | Standaard | Beschrijving |
|---|---|---|
| **Breedte mm** | 50 | Breedte van het profiel |
| **Offset H mm** | 0 | Horizontale vrije ruimte |
| **Offset V mm** | 0 | Verticale vrije ruimte |
| **Strip gap mm** | 5 | Ruimte tussen profiel en strip |

---

### Panelen (basisplaat)

Verdeelt de gevels in draagsysteem-panelen. Kies een **basisplaat type** uit de catalogus. Zie ook [Panelen en paneeloptimalisatie](#panelen-en-paneeloptimalisatie).

---

### Achterconstructie latten

Houten latten als drager achter de basisplaat.

- **Horizontale latten**: hartafstand wordt berekend op basis van een instelbare **HOH-bandbreedte** (standaard 370–430 mm). De optimale hartafstand binnen deze bandbreedte wordt automatisch gekozen.
- **Verticale latten**: gesnapt op paneelgrenzen.
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

---

### Buitenzijde omdraaien en positie instellen

Soms wordt de "buitenzijde" van een wand fout bepaald vanuit het IFC (de gevel staat gespiegeld). Twee correctiemogelijkheden:

| Instelling | Werking |
|---|---|
| **Buitenzijde omdraaien** (checkbox) | Spiegelt de 2D en 3D weergave van de hele groep horizontaal. |
| **Positie 1 / Automatisch / Positie 2** | Forceert de buitenzijde naar links (-1), automatisch (op basis van geometrie), of rechts (+1). Bakt de instelling permanent in de wanddata — blijft behouden na samenvoegen. |

> **Workflow dakrandpanelen**: laad dakrandpanelen als "Zonder groep", maak een tijdelijke groep aan, stel de juiste positie in via "Positie 1 / Positie 2", gebruik vervolgens **"↗ Samenvoegen naar..."** om de wanden in de doelgroep te plaatsen. Zie [Groepen samenvoegen](#groepen-samenvoegen).

---

## Strip-zones handmatig tekenen in 2D

In het **2D Gevelaanzicht** kun je zones tekenen om aan te geven waar strips komen. Elke tekenzone heeft een eigen configuratiegroep in het zijpaneel.

### Zone aanmaken

1. Schakel naar **2D Gevel**.
2. Klik op **▭ Teken zone** (linksboven in de 2D viewer). De cursor wordt een kruisje.
3. **Klik en sleep** om een rechthoek te tekenen op het gevelvlak.
4. Laat los — de zone verschijnt als cyaan stippelkader met label en afmetingen.
5. Herhaal voor meerdere zones.

### Zone aanpassen

- **Verplaatsen**: sleep de zone naar een andere positie (los van overige elementen).
- **Breedte/hoogte handmatig invoeren**: gebruik de invoervelden in de zone-configuratiegroep in het zijpaneel.
- Openingen die **achter** een tekenzone liggen worden automatisch uit die zone verwijderd.

### Zone-lijst (linksboven in 2D viewer)

- Klik op een zone om hem te selecteren (oranje kader).
- Klik **✕** naast een zone om hem te verwijderen.
- Klik **Alle zones wissen** om opnieuw te beginnen.

### Gedrag

- Zonder zones → strips over het hele gevelvlak.
- Met zones → strips alleen binnen de getekende kaders.
- Elke zone heeft een **eigen UI-groep** in het configuratiepaneel rechts.

---

## Steenstrip kleurcodering in 2D

Het 2D gevelaanzicht kleurt elke steenstrip op basis van het type (de positie in het verband):

| Kleur | Type | Omschrijving |
|---|---|---|
| **Bruin** | Kop | Volledige kop (korte zijde) |
| **Blauw** | Strek | Volledige strek (lange zijde) |
| **Paars** | Driekwart | Afgekorte strek (¾ lengte) |
| **Rood** | Zaagmaat | Groter dan een kop, kleiner dan een strek |
| **Oranje + !** | Klein stuk | Kleiner dan een kop — let op bij productie |

---

## Steenstrip artikelkeuze & catalogus

In de sectie **Steenstrips artikelkeuze** in het configuratiepaneel kies je een specifiek artikel uit de catalogus.

### Filteropties

- **Zoekbalk** — vrije zoekterm op naam, kleur of leverancier.
- **Leverancier-filter** — knoppen:
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

Klik op het 🗑-icoon rechtsboven in het configuratiepaneel, of klik op **Groep verwijderen** in het uitklapbare groepsdetailpaneel.

### Wand uit groep verwijderen

Klik op **✕** naast de wand in de uitklapbare groepslijst links.

### Groepen samenvoegen

In het uitklapbare groepsdetailpaneel (klik op een groep in de lijst) staat een dropdown **"↗ Samenvoegen naar..."** met alle andere groepen.

**Gebruik:**
1. Klik op de brongroep in de groepslijst om hem uit te klappen.
2. Kies de doelgroep uit het dropdown **"↗ Samenvoegen naar..."**.
3. Alle wanden van de brongroep worden overgeplaatst naar de doelgroep; de brongroep verdwijnt.
4. De actieve groep wordt automatisch ingesteld op de doelgroep.

**Typische workflow voor dakrandpanelen met verkeerde richting:**
1. Selecteer de dakrandpanelen in de 3D viewer.
2. Klik **+ Nieuwe groep van selectie** → de groep wordt aangemaakt en direct actief.
3. Stel in het configuratiepaneel de juiste buitenzijde in via **Positie 1 / Positie 2**.
4. Verifieer de richting in 2D of 3D.
5. Klik in de groepslijst op de tijdelijke groep → kies **"↗ Samenvoegen naar... → [doelgroep]"**.
6. De gecorrigeerde oriëntatie blijft behouden in de doelgroep.

### Groepen koppelen

Na het aanmaken van een groep worden vergelijkbare groeperingen automatisch gesuggereerd. Nieuwe gekoppelde groepen krijgen automatisch unieke namen (bijv. `Gevel Z-1`, `Gevel Z-2`).

Gebruik **Sync instellingen →** om alle instellingen van de brongroep door te kopiëren naar alle gekoppelde groepen.

---

## Aluminium SlimFort systeem

Bij betonnen gevels wordt het **Aluminium SlimFort** draagsysteem gebruikt in plaats van houten latten. Dit systeem bestaat uit:

- **EPS isolatieplaten** — aangebracht over het betonoppervlak
- **Aluminium profielen** — horizontale draagprofielen op de EPS
- **Beugels** — metalen beugels die de profielen vastzetten op de beton

### Backing type instellen

In de sectie **Achterconstructie** van het configuratiepaneel:

1. Stel **Backing type** in op **Aluminium SlimFort**.
2. De SlimFort-instellingen worden zichtbaar (totale systeemdikte, beugeldiepte, profieldiepte, etc.).

### Automatische detectie

Bij het importeren van wanden detecteert de applicatie automatisch het wandsubstraat op basis van de IFC-naam:
- Woorden als `beton`, `concrete`, `prefab`, `rc-wand`, `sandwichpaneel` → backing type wordt automatisch voorgesteld als **Aluminium SlimFort**.
- Het detecteerde substraattype is zichtbaar als badge op de wandinformatie.

### SlimFort instellingen

| Instelling | Standaard | Beschrijving |
|---|---|---|
| **Totale systeemdikte** | 196 mm | Totale opbouwdikte van het SlimFort systeem (EPS + profiel + beugeldiepte) |
| **Beugeldiepte** | 50 mm | Diepte van de beugel in de beton |
| **Profieldiepte** | 63 mm | Diepte van het aluminium profiel |
| **Ventilatiespouw** | 20 mm | Ventilatiespouw achter de basisplaat |
| **Maximale hoogte** | (auto) | Maximale hoogte van een EPS-plaat |

---

## Betonwand bekledingsvlakken

Bij het **Aluminium SlimFort** backing type kan worden ingesteld welke vlakken van de betonwand bekleed worden. Dit is relevant bij vrijstaande betonwanden of hoekconstructies waarbij meerdere zijden zichtbaar zijn.

### Activeren

In het configuratiepaneel → sectie **Betonwand bekledingsvlakken** (zichtbaar als backing type = Aluminium SlimFort).

### Beschikbare vlakken

| Vlak | Positie | Beschrijving |
|---|---|---|
| **Linker langszijde** | Voor / buiten | Hoofdgevel, aan de buitenzijde van de linker langswand |
| **Rechter langszijde** | Achter / buiten | Achterzijde, aan de buitenzijde van de rechter langswand |
| **Linker kopse kant** | Eindvlak links | Het linker eindvlak van de wand (gezien van voren) |
| **Rechter kopse kant** | Eindvlak rechts | Het rechter eindvlak van de wand (gezien van voren) |

### Bereiken per vlak

Per actief vlak stel je in:
- **Hoekdiepte** — diepte van de hoekafwerking (standaard = systeemdiktte).
- **Startoffset** — begin van de bekleding gemeten vanaf de linker wandrand.
- **Eindoffset** — einde van de bekleding gemeten vanaf de rechter wandrand.

### Kopse kant breedte

De breedte van de EPS-isolatie en het steenstrippatroon op de kopse kant is gelijk aan:

```
Linker isolatiediepte + Betonwanddikte + Rechter isolatiediepte
```

Dit geldt cumulatief voor:
- De EPS isolatieplaten (gehele breedte)
- De aluminium profielen en beugels
- De steenstrips

De breedte wordt automatisch berekend en zichtbaar in het [2D uitgeslagen aanzicht](#slimfort--2d-uitgeslagen-aanzicht).

---

## SlimFort — 2D uitgeslagen aanzicht

Wanneer een groep betonwand bekledingsvlakken heeft geconfigureerd, vervangt het 2D gevelaanzicht het normale gevelvlak door een **uitgeslagen weergave** van alle actieve bekledingsvlakken naast elkaar.

### Wat wordt getoond

Elk vlak wordt als een rechthoekig paneel naast elkaar weergegeven, gescheiden door een **PLOOI-markering** (vouwlijn):

| Element | Weergave |
|---|---|
| EPS isolatieplaten | Lichtgrijs vlak met gestippelde rand |
| Aluminium profielen | Grijsblauwe rechthoeken |
| Beugels | Donkergrijze blokjes |
| Steenstrips | Baksteen in ingestelde kleur en verband |
| Niet-bekleed zone | Grijs transparant vlak met label "niet bekleed X mm" |
| PLOOI-markering | Verticale stippellijn met ruittekens |

### Kleurcodering vlakken

| Kleur | Vlak |
|---|---|
| Blauw | Linker langszijde |
| Paars | Linker kopse kant |
| Groen | Rechter langszijde |
| Roze | Rechter kopse kant |

### Volgorde van vlakken

De vlakken worden van links naar rechts weergegeven in de volgorde:
1. Linker langszijde (volledige wandlengte)
2. Linker kopse kant
3. Rechter langszijde (volledige wandlengte)
4. Rechter kopse kant

### Niet-bekleed zones

Op de lange wanden zijn de gedeelten buiten het geconfigureerde bereik gemarkeerd als "niet bekleed". Dit geeft direct inzicht in welk deel van de betonwand onbekleed blijft (bijv. door een startoffset of eindoffset).

---

## DetailBoek

Het **DetailBoek** tabblad bevat automatisch gegenereerde constructietekeningen per gevelgroep.

### Inhoud

- **Verticale coupe — maaiveldaansluiting**: doorsnede op de onderkant van het systeem (aansluiting op de sokkel of fundering).
- **Verticale coupe — bovenregel / dakrand**: doorsnede op de bovenkant van het systeem (aansluiting op dakrand of overstek).
- **Horizontale coupe — hoek**: detail van een buitenhoek of binnenhoek.
- **Horizontale coupe — dagkant**: detail van een opendraaiende opening of dagkant.

### Kanonieke laagsopbouw

Per systeem toont het DetailBoek de standaard laagsopbouw:

**Hout-systeem:**
Betonwand / steenachtig substraat → houten latten → basisplaat → luchtspouw → steenstrips

**Aluminium SlimFort:**
Betonwand → EPS-isolatie → aluminium profielen → basisplaat → ventilatiespouw → steenstrips

### Filteren per gevelzijde

Gebruik de tabs bovenin het DetailBoek om te filteren op gevelzijde (N / O / Z / W).

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

### SlimFort Werktekeningen

Bij het Aluminium SlimFort systeem zijn aanvullende werktekeningen beschikbaar via **SlimFort Werktekening**:

| Sheet | Inhoud |
|---|---|
| **Sheet 1** | Uitgeslagen gevelopbouw per vlak |
| **Sheet 2** | Paneelindeling per vlak met afmetingen |
| **Sheet 3** | Profiel- en beugelpatroon (hartafstanden) |
| **Sheet 4** | EPS isolatieraster |
| **Sheet 5** | Productie-aanwijzingen en materiaaltotalen |

### Zaaglijst

Het tabblad **Zaaglijst** toont alle panelen met:
- Uniek paneel-ID (16-karakter EPC-code)
- Afmetingen (breedte × hoogte)
- Aantallen per striptype (Vol / Kop / Driekwart / Rest)
- Gewicht

Exporteer als **CSV** voor gebruik in de fabriek.

### IFC exporteren

Klik op **⬇ Exporteer IFC** als alle groepen zijn geconfigureerd.

Het geëxporteerde bestand bevat per wand de individuele brickslip-objecten op de juiste positie en oriëntatie. Bij het Aluminium SlimFort systeem worden ook EPS-platen, profielen en beugels als IFC-objecten geëxporteerd.

---

## Schermindeling

```
┌──────────────────────────────────────────────────────────────────┐
│  TOPBALK: IFC importeren · Aanvullen · Undo · 3D/2D · Export     │
├────────────┬─────────────────────────────────┬───────────────────┤
│            │  [👁 Zichtbaarheid] (links)      │                   │
│  LINKER-   │                                 │  GROEP            │
│  ZIJBALK   │       3D VIEWER                 │  CONFIGURATIE     │
│            │       of                        │  (tabs:           │
│  · Acties  │       2D GEVELAANZICHT          │   Instellingen    │
│  · Groepen │       of                        │   Werktekeningen  │
│  · Zonder  │       SLIMFORT UITGESLAGEN      │   Zaaglijst       │
│    groep   │                                 │   DetailBoek)     │
│            │       [⬚ Box] [Kompas]          │                   │
└────────────┴─────────────────────────────────┴───────────────────┘
```

### Linkerzijbalk

| Onderdeel | Beschrijving |
|---|---|
| ⬡ aangrenzend banner | Aantal aangrenzende relaties gevonden |
| 🔗 Auto-groeperen aangrenzendheid | Groepen op basis van aanraking |
| 🧭 Auto-groeperen windrichting | Groepen per N/O/Z/W gevelvlak |
| + Nieuwe groep van selectie | Groep van geselecteerde elementen |
| Voeg toe aan [groep] | Geselecteerde (ongegroepeeerde) elementen toevoegen aan bestaande groep |
| ↗ Samenvoegen naar... | Huidige groep samenvoegen met een andere groep |
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
| Groep verwijderen | Klik 🗑 in het configuratiepaneel of **Groep verwijderen** in de groepslijst |
| Groepsnaam wijzigen | **Dubbelklik** op naam in groepslijst, of via Naam-veld in configuratiepaneel |
| Groep verbergen in 3D | **👁 Zichtbaarheid** knop linksboven in 3D viewer |
| Alle ongegroepeeerden selecteren | **Selecteer alle** in de sectie "Zonder groep" |
| Patroon tijdelijk verbergen | Vink **Patroon in 3D** uit in de topbalk |
| Steenstrip catalogus filteren | Leverancier- en formaatknoppen + zoekbalk in "Steenstrips artikelkeuze" |
| Paneelvoegen verspringen | Optie **Panelen halfsteen verspringen** per groep/zone activeren |
| Bestand onthouden | Applicatie slaat het IFC-bestand automatisch op (IndexedDB); bij volgende sessie kun je direct opnieuw laden |
| Dakrandpanelen met verkeerde richting toevoegen | Selecteer → nieuwe groep → Positie 1/2 instellen → **↗ Samenvoegen naar...** naar de doelgroep |
| SlimFort bekledingsvlakken instellen | Backing type = Aluminium SlimFort → sectie "Betonwand bekledingsvlakken" |
| SlimFort uitgeslagen aanzicht bekijken | 2D view actief + minstens één bekledingsvlak geconfigureerd |
| Kopse kant breedte | Automatisch: links isolatie + beton + rechts isolatie (instelbaar via hoekdiepte) |
