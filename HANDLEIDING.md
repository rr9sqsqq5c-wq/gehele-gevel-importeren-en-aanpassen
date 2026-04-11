# IFC Brickslip Planner — Handleiding

## Inhoudsopgave

1. [Overzicht](#overzicht)
2. [Workflow stap voor stap](#workflow-stap-voor-stap)
3. [Schermindeling](#schermindeling)
4. [UI-groepen: Groep configuratie](#ui-groepen-groep-configuratie)
5. [2D Gevelaanzicht](#2d-gevelaanzicht)
6. [Exporteren](#exporteren)
7. [Tips & sneltoetsen](#tips--sneltoetsen)

---

## Overzicht

De **IFC Brickslip Planner** is een tool voor het importeren van gevelelementen uit een IFC-bestand, het indelen van wanden in gevelgroepen, en het configureren en berekenen van een brickslip-patroon (steenstrip systeem) per gevelgroep. Het resultaat kan worden geëxporteerd als een nieuw IFC-bestand met alle steenstrip-elementen op de juiste positie.

**Kernconcept — groepen:**
Een groep is een verzameling van één of meer wandelementen die samen één gevelvlak vormen. Per groep stel je in welk brickslip-patroon, welk zetwerk, welke panelen en welke achterconstructie van toepassing zijn. Aangrenzende wanden in een groep krijgen een doorlopend patroon.

---

## Workflow stap voor stap

### Stap 1 — IFC importeren

Klik op **📂 IFC importeren** in de bovenste balk.

- Er verschijnt een bestandskiezer. Selecteer een `.ifc`-bestand.
- De applicatie scant het bestand en toont een lijst van **wandtypen** (Basic Wall typen).
- Vink de typen aan die je wilt importeren. Gebruik **Alle selecteren** of **Geen selecteren** voor bulk-acties.
- Klik op **Importeren** om de geselecteerde wanden in te laden.

> **Tip:** Importeer alleen de wandtypen die je nodig hebt (bijv. buitengevels). Grote bestanden laden sneller als je onnodige binnenafscheidingen uitvinkt.

---

### Stap 2 — Overzicht in 3D

Na het importeren verschijnen alle wanden in de **3D Viewer**.

- **Klik** op een wand om hem te selecteren (blauw gemarkeerd).
- **Slepen** = rondkijken (orbit).
- Geselecteerde elementen verschijnen ook in de lijst links onder **Zonder groep**.
- Met de checkbox **Patroon in 3D** kun je het berekende steenstrippatroon aan/uitzetten.

---

### Stap 3 — Groepen aanmaken

Er zijn drie manieren om groepen te maken:

#### A — Auto-groeperen (aanbevolen voor complete gebouwen)

Klik op **🔗 Auto-groeperen op aangrenzendheid**.

De applicatie detecteert automatisch welke wanden een gemeenschappelijke rand delen en maakt voor elke verbonden set een aparte groep. Dit is de snelste manier voor een volledig gebouw.

#### B — Handmatige selectie

1. Klik op individuele wanden in de 3D Viewer om ze te selecteren.
2. Klik op **+ Nieuwe groep van selectie** om een groep te maken van de geselecteerde elementen.

> Meerdere elementen selecteren: klik achtereenvolgens op de elementen.

#### C — Toevoegen aan bestaande groep

Als er al groepen bestaan, kun je geselecteerde elementen toevoegen via **Voeg toe aan [groepnaam]**.

---

### Stap 4 — Vergelijkbare groeperingen koppelen

Na het aanmaken van een groep controleert de applicatie automatisch of er **vergelijkbare groeperingen** elders in het gebouw voorkomen (zelfde samenstelling, zelfde onderlinge afmetingen en posities).

Als die worden gevonden, verschijnt een pop-up:

- Aangevinkte groeperingen worden automatisch aangemaakt en **gekoppeld** aan de brongroep.
- Gekoppelde groepen kunnen later in één keer worden gesynchroniseerd via **Sync instellingen →**.

> **Gebruik:** Stel de brongroep volledig in (patroon, kleur, zetwerk, etc.) en klik daarna op **Sync instellingen →** om alle instellingen door te kopiëren naar de gekoppelde groepen.

---

### Stap 5 — Groep configureren

Klik op een groep in de lijst links om deze te activeren. Rechts verschijnt het **configuratiepaneel** met alle instellingen (zie [UI-groepen](#ui-groepen-groep-configuratie) hieronder).

Schakel naar **2D Gevel** via de knop rechtsbovenaan om het gevelaanzicht te bekijken en te verfijnen.

---

### Stap 6 — Exporteren

Klik op **⬇ Exporteer IFC** als alle groepen zijn geconfigureerd.

Er wordt een IFC-bestand gegenereerd met voor elke wand de individuele brickslip-objecten op de juiste positie en oriëntatie.

---

## Schermindeling

```
┌──────────────────────────────────────────────────────────────────┐
│  TOPBALK: IFC importeren · Undo · Patroon in 3D · 3D/2D · Export │
├────────────┬─────────────────────────────────┬───────────────────┤
│            │                                 │                   │
│  LINKERZIJ │         3D VIEWER               │  GROEP            │
│  BALK      │         of                      │  CONFIGURATIE     │
│            │         2D GEVELAANZICHT        │  PANEEL           │
│  · Acties  │                                 │                   │
│  · Groepen │                                 │  (rechts, alleen  │
│  · Zonder  │                                 │  als groep actief)│
│    groep   │                                 │                   │
└────────────┴─────────────────────────────────┴───────────────────┘
```

### Linkerzijbalk

| Onderdeel | Beschrijving |
|---|---|
| ⬡ aangrenzend banner | Geeft aan hoeveel aangrenzende relaties zijn gevonden |
| Auto-groeperen | Maakt groepen op basis van aangrenzendheid |
| Nieuwe groep van selectie | Groep van geselecteerde elementen |
| Voeg toe aan [groep] | Toevoegen aan bestaande groep |
| Deselecteer alles | Heft selectie op |
| Groepen | Lijst van alle aangemaakte groepen |
| Zonder groep | Elementen die nog niet ingedeeld zijn |

---

## UI-groepen: Groep configuratie

Het rechterpaneel verschijnt zodra een groep is geselecteerd. Het bevat de volgende secties:

---

### Naam

De naam van de groep. Zichtbaar in de lijst, in de 2D viewer en bij de IFC-export.

---

### Kleur

De herkenningskleur van de groep in de 3D Viewer en het 2D gevelaanzicht. Gekoppelde groepen krijgen dezelfde naam maar een andere kleur.

---

### Metselverband

Bepaalt hoe de brickslips per rij verspringen:

| Optie | Beschrijving |
|---|---|
| **Halfsteens** | Stenen verspringen een halve steenlengte per laag. Meest gebruikelijk. |
| **Staand** | Stenen lopen verticaal door, geen verspinging. |

---

### Steenstrip afmetingen

De maatvoering van de individuele brickslip (steenstrip):

| Veld | Standaard | Beschrijving |
|---|---|---|
| **Lengte mm** | 210 | Zichtbare lengte van de strip |
| **Hoogte mm** | 50 | Zichtbare hoogte van de strip |
| **Lintvoeg mm** | 12 | Horizontale voeg tussen lagen |
| **Stootvoeg mm** | 10 | Verticale voeg tussen stenen |

> De **stapelmaat** per laag = hoogte + lintvoeg (bijv. 50 + 12 = 62 mm per laag).

---

### Strip dikte IFC (mm)

De uitsteek van de strip op de wand, zoals opgenomen in het IFC-exportbestand. Dit is de fysieke dikte van de brickslip (standaard 20 mm).

---

### Maximale strip hoogte

Optioneel. Begrenst het patroon tot een bepaalde hoogte gemeten vanaf de onderkant van de groep. Handig voor:
- Een waterslag (strook steen onderin, bijv. 300 mm)
- Gevels die niet tot de bovenkant worden bekleed

Vink in en voer de maximale hoogte in mm in.

---

### Penanten

Een penant is een uitstekende verticale lijst in de gevel (bijvoorbeeld een pilaster of dagkant-verlenging).

| Veld | Beschrijving |
|---|---|
| **X positie mm** | Afstand van de linker groepsrand tot de linkerrand van het penant |
| **Breedte mm** | Breedte van het penant |
| **Diepte mm** | Uitsteek ten opzichte van het gevelvlak |
| **Hoogte mm** | Hoogte van het penant |
| **Patroon volgt gevel** | Als aangevinkt, lopen de strips door als op de achterliggende gevel. Anders krijgt het penant een eigen patroon. |

Meerdere penanten per groep zijn mogelijk via **+ Toevoegen**.

In de 2D-view worden penanten getekend als blauwe vlakken met een 3D-schaduweffect.

---

### Zetwerk rondom openingen

Aluminium of stalen randprofiel rondom ramen en deuren. Het zetwerk creëert een nette afwerking en houdt de strips op afstand van de opening.

| Veld | Standaard | Beschrijving |
|---|---|---|
| **Breedte mm** | 50 | Breedte van het zetwerk-profiel |
| **Offset H mm** | 0 | Horizontale ruimte tussen openingsrand en profiel |
| **Offset V mm** | 0 | Verticale ruimte boven/onder de opening |
| **Strip gap mm** | 5 | Extra vrije ruimte tussen profiel en de strips |

In de 2D-view wordt het zetwerk getekend als grijze balken rondom elke sparing. Het steenstrippatroon houdt automatisch rekening met deze ruimte.

---

### Panelen (basisplaat)

Verdeelt de geveloppervlakte in draagsysteem-panelen (basisplaten) waarop de brickslips worden gelijmd of geklikt. De paneelgrenzen worden gesnapt op steenstripvoegen voor optimaal snijverlies.

| Veld | Standaard | Beschrijving |
|---|---|---|
| **Breedte mm** | 3005 | Maximale breedte van een basispaneel |
| **Hoogte mm** | 1200 | Maximale hoogte van een basispaneel |

In de 2D-view worden panelen afwisselend in lichtgrijs en lichtblauw getekend met hun afmetingen als label.

> De panelen houden rekening met de openingen (ramen/deuren) en het zetwerk: ze worden nooit over een sparing getekend.

---

### Achterconstructie hout

Houten latten als dragerstructuur achter de basisplaat. Twee richtingen zijn mogelijk:

#### Horizontale latten

Latten lopen horizontaal over de volledige gevelbreedte.

| Veld | Standaard | Beschrijving |
|---|---|---|
| **Breedte mm** | 50 | Zichtbare breedte van de lat in het gevelaanzicht |
| **Dikte mm** | 28 | Dikte van de lat loodrecht op de gevel |
| **Max interval mm** | 400 | Maximale hartafstand tussen opeenvolgende latten |

Positioneringsregels:
- Altijd een lat **boven en onder** elke raam- of deuropening
- Tussenpositie gesnapt op steenstriprijgrenzen
- Maximale hartafstand wordt gerespecteerd

#### Verticale latten

Latten lopen verticaal over de volledige gevelhoogte. Posities worden bepaald op de paneelgrenzen (links, midden en rechts van elk paneel). Activeer **Panelen** voor optimale positionering.

In de 2D-view worden latten getekend als oranje-bruine balken. Geforceerde latten (boven/onder openingen) zijn iets donkerder.

---

## 2D Gevelaanzicht

Schakel via de **2D Gevel** knop bovenaan. Selecteer een groep links in de lijst om het aanzicht te tonen.

### Navigatie

| Actie | Resultaat |
|---|---|
| Scrollen | Inzoomen / uitzoomen |
| Slepen | Pannen (verschuiven) |
| **⊡ Passend maken** | Past de weergave aan de groep aan |

### Wat je ziet (van achter naar voor)

1. **Achtergrondvlak** — licht gekleurde rechthoek van de volledige groep
2. **Panelen** — afwisselend lichtgrijs/lichtblauw met afmetingen
3. **Latten** — oranje-bruine horizontale of verticale balken
4. **Steenstrips** — het berekende brickslip-patroon in de groepskleur
5. **Zetwerk** — grijze profielen rondom openingen
6. **Openingen** — lichtblauwe vlakken (ramen/deuren), met X-coördinaten
7. **Penanten** — blauwe vlakken met 3D-diepte-effect
8. **Max hoogte lijn** — oranje stippellijn als maximale strip hoogte is ingesteld
9. **Patroonlogica** — tekstuele uitleg van de patroonberekening (rechtsonder in 2D modus)

### X-labels bij openingen

Boven elke raam- of deuropening worden de X-coördinaten (in mm) van de linker- en rechterkant weergegeven, gemeten vanaf de linkerrand van de groep.

---

## Exporteren

Klik op **⬇ Exporteer IFC** als alle groepen naar wens zijn geconfigureerd.

Het geëxporteerde IFC-bestand bevat:
- Alle originele wandelementen
- Per wand de individuele brickslip-objecten (IfcBuildingElementProxy) op de juiste positie en oriëntatie
- Groepsnaam en kleur als attribuut

Het bestand wordt automatisch gedownload als `[originele bestandsnaam]_brickslip.ifc`.

---

## Tips & sneltoetsen

| Actie | Sneltoets / tip |
|---|---|
| Ongedaan maken | **Ctrl+Z** |
| Groepskleur aanpassen | Klik de kleurenkiezer in het configuratiepaneel |
| Instellingen kopiëren | **Sync instellingen →** (alleen bij gekoppelde groepen) |
| Wand uit groep verwijderen | Klik **✕** naast de wand in de groepslijst |
| Groep verwijderen | Klik 🗑 in het configuratiepaneel, of **Groep verwijderen** in de lijst |
| Alle ongegroepeeerden selecteren | **Selecteer alle** in de sectie "Zonder groep" |
| Patroon tijdelijk verbergen | Vink **Patroon in 3D** uit in de topbalk |
| Tooltip bekijken | Zweef over het **ⓘ** icoontje naast elk veld |
