# IFC Brickslip Planner — Handleiding

## Inhoudsopgave

1. [Overzicht](#overzicht)
2. [Twee instapscenario's](#twee-instapscenarios)
3. [Scenario A — Volledig nieuwe opzet (eigen IFC)](#scenario-a--volledig-nieuwe-opzet-eigen-ifc)
4. [Scenario B — Zone-import (klant levert vlakken)](#scenario-b--zone-import-klant-levert-vlakken)
5. [Groep configureren (beide scenario's)](#groep-configureren-beide-scenarios)
6. [Strip-zones handmatig tekenen in 2D](#strip-zones-handmatig-tekenen-in-2d)
7. [Maltekeningen](#maltekeningen)
8. [Werktekeningen & export](#werktekeningen--export)
9. [Schermindeling](#schermindeling)
10. [UI-groepen: Groep configuratie](#ui-groepen-groep-configuratie)
11. [Tips & sneltoetsen](#tips--sneltoetsen)

---

## Overzicht

De **IFC Brickslip Planner** is een tool voor het importeren van gevelelementen uit een IFC-bestand, het indelen van wanden in gevelgroepen, en het configureren en berekenen van een steenstripsysteem per gevelgroep. Het resultaat wordt als werktekeningen, maltekeningen, zaaglijst en IFC-export aangeboden.

**Kernconcept — groepen:**
Een groep is een verzameling van één of meer wandelementen die samen één gevelvlak vormen. Per groep stel je in welk brickslip-patroon, welk zetwerk, welke panelen en welke achterconstructie van toepassing zijn.

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
- Steenstrip afmetingen (lengte, hoogte, lintvoeg, stootvoeg)
- Zetwerk rondom openingen
- Panelen (basisplaat type en maximale afmetingen)
- Achterconstructie latten (horizontaal of verticaal)
- Penanten (als van toepassing)

Zie [Groep configureren](#groep-configureren-beide-scenarios) voor details.

---

### Stap 6 — Vergelijkbare groeperingen koppelen

Na het aanmaken van een groep controleert de applicatie automatisch of er vergelijkbare groeperingen elders voorkomen.

Als die worden gevonden, verschijnt een pop-up:
- Aangevinkte groeperingen worden automatisch aangemaakt en **gekoppeld** aan de brongroep.
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

Als naast de zone-elementen ook de constructieve wanden nodig zijn (bijv. voor het bepalen van de achterconstructie-diepte), kun je een tweede importactie uitvoeren **zonder** zone-modus en de wanden handmatig aan de bestaande groepen toevoegen.

---

### Stap 5 — Groep configureren en exporteren

Verder identiek aan Scenario A vanaf [Stap 5](#stap-5--groep-configureren).

---

## Groep configureren (beide scenario's)

Klik op een groep in de lijst links. Het **rechterpaneel** toont alle instellingen:

### Naam en kleur

- De **naam** verschijnt in de lijsten, werktekeningen en IFC-export.
- De **kleur** onderscheidt de groep in 3D en 2D.

---

### Metselverband

| Optie | Beschrijving |
|---|---|
| **Halfsteens** | Strekken verspringen een halve steenlengte per laag. Eerste laag begint links met een strek, tweede laag met een kop. |
| **Tegelverband** | Regelmatige verspinging per halve steen, zonder koppen. |
| **Staand tegelverband** | Stenen staan verticaal (90° gedraaid). |
| **Wildverband** | Onregelmatig, levend verband met strekken, koppen en drieklezooren. Herhaalt na 6 rijen. |

---

### Steenstrip afmetingen

| Veld | Standaard | Beschrijving |
|---|---|---|
| **Lengte mm** | 210 | Zichtbare lengte van de strip |
| **Hoogte mm** | 50 | Zichtbare hoogte van de strip |
| **Lintvoeg mm** | 12 | Horizontale voeg tussen lagen |
| **Stootvoeg mm** | 10 | Verticale voeg tussen stenen |

> Stapelmaat per laag = hoogte + lintvoeg (bijv. 50 + 12 = 62 mm).

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

Verdeelt de gevels in draagsysteem-panelen. Kies een **basisplaat type** uit de catalogus:

- Bluclad Proboard 10 mm (vezelcement)
- ROCKPANEL Natural Durable 8 mm / 10 mm
- ROCKPANEL Natural Xtreme 8 mm / 10 mm

De maximale paneelafmetingen worden automatisch ingesteld op basis van de gekozen plaat. Panelen worden gesnapt op steenstripvoegen voor minimaal snijverlies. Het **maximale gewicht** is instelbaar voor montage-eisen.

---

### Achterconstructie latten

Houten latten als drager achter de basisplaat.

- **Horizontale latten**: hartafstand wordt berekend op basis van maximale interval en steenstriprijhoogtes.
- **Verticale latten**: gesnapt op paneelgrenzen.

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

## Strip-zones handmatig tekenen in 2D

In het **2D Gevelaanzicht** kun je zones tekenen om aan te geven waar strips komen:

1. Schakel naar **2D Gevel**.
2. Klik op **▭ Teken zone** (linksboven in de 2D viewer). De cursor wordt een kruisje.
3. **Klik en sleep** om een rechthoek te tekenen op het gevelvlak.
4. Laat los — de zone verschijnt als cyaan stippelkader met label en afmetingen.
5. Herhaal voor meerdere zones.

**Zone-lijst** (linksboven):
- Klik op een zone om hem te selecteren (oranje kader).
- Klik **✕** naast een zone om hem te verwijderen.
- Klik **Alle zones wissen** om opnieuw te beginnen.

**Gedrag:**
- Zonder zones → strips over het hele gevelvlak.
- Met zones → strips alleen binnen de getekende kaders.

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
│            │                                 │                   │
│  LINKER-   │       3D VIEWER                 │  GROEP            │
│  ZIJBALK   │       of                        │  CONFIGURATIE     │
│            │       2D GEVELAANZICHT          │  (tabs:           │
│  · Acties  │                                 │   Instellingen    │
│  · Groepen │                                 │   Werktekeningen  │
│  · Zonder  │                                 │   Zaaglijst)      │
│    groep   │                                 │                   │
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
| Groepen | Lijst van alle aangemaakte groepen |
| Zonder groep | Elementen die nog niet ingedeeld zijn |

---

## UI-groepen: Groep configuratie

Zie [Groep configureren](#groep-configureren-beide-scenarios) hierboven voor alle velden.

---

## Tips & sneltoetsen

| Actie | Sneltoets / tip |
|---|---|
| Ongedaan maken | **Ctrl+Z** |
| Zone-import | Activeer "Zone-import modus" in het importdialoog |
| Strip-zone tekenen | **▭ Teken zone** knop in 2D viewer |
| Instellingen kopiëren naar gekoppelde groepen | **Sync instellingen →** |
| Wand uit groep verwijderen | Klik **✕** naast de wand in de groepslijst |
| Groep verwijderen | Klik 🗑 in het configuratiepaneel |
| Alle ongegroepeeerden selecteren | **Selecteer alle** in de sectie "Zonder groep" |
| Patroon tijdelijk verbergen | Vink **Patroon in 3D** uit in de topbalk |
| Bestand onthouden | Applicatie slaat het IFC-bestand automatisch op (IndexedDB); bij volgende sessie kun je direct opnieuw laden |
| Tooltip bekijken | Zweef over het **ⓘ** icoontje naast elk veld |
