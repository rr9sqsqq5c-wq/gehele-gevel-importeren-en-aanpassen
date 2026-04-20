# Werkwijze Gevel Indeling – Stap voor Stap

## Stap 1: IFC bestand laden

- Laad het basis IFC-bestand met de wandelementen (muren).
- De applicatie herkent automatisch de wanden en hun oriëntatie.
- Controleer of alle wandelementen correct zijn ingelezen in de 3D-viewer.

---

## Stap 2: Groepen aanmaken per gevel

- Selecteer de wandelementen die samen één gevel vormen.
- Maak een groep aan. Een groep = één gevel.
- Geef de groep een logische naam (bijv. "Gevel Noord", "Gevel Oost").
- **Regel:** Alle wanden in één groep moeten in dezelfde vlakke richting liggen.
- **Regel:** Ruimtes tussen wandelementen (gaten die geen raam/deur zijn) worden automatisch behandeld als doorlopende gevel.

---

## Stap 3: Basisinstellingen per gevel

Voor elke groep stel je in:

| Instelling | Beschrijving |
|---|---|
| **Steenstrip kleur** | De kleur van de steenstrippen (hex-code of kleurenkiezer) |
| **Metselverband** | `Halfsteens`, `Halfsteens kop`, of `Staand tegelverband` |
| **Steen afmetingen** | Lengte × Hoogte × Stootvoeg × Lintvoeg (standaard 210×50×10×12 mm) |
| **Strip diepte** | Dikte van de steenstrip (standaard 20 mm) |
| **Max hoogte** | Alles boven deze hoogte wordt niet aangemaakt (strippen, latten, zetwerk, panelen) |
| **Min hoogte** | Startpunt van de bekleding (bijv. boven een plint) |

---

## Stap 4: Achterconstructie hout (latten)

- Activeer latten indien van toepassing.
- **Kies een lattenartikel** uit de catalogus (radio button per groep, slechts 1 keuze).
- Het systeem vult automatisch de afmetingen in vanuit het artikel.

**Logica regels latten:**

- **Horizontale latten** lopen over de volledige breedte van de gevel, met een maximale tussenafstand van 400 mm.
- **Verticale latten** worden gemonteerd op de buitenkant van de horizontale latten (aan de voorzijde/buitenkant).
- Verticale latten worden **niet** geplaatst op posities die samenvallen met een penant.
- Latten worden **niet** aangemaakt boven de ingestelde max hoogte.
- In sparingen (ramen/deuren) worden **geen** latten geplaatst.
- Boven een penant (tot aan de max hoogte) worden ook latten geclipped.

---

## Stap 5: Panelen

- Activeer panelen indien van toepassing.
- Stel in: breedte, hoogte, dikte, gewicht per m² en maximaal gewicht per paneel.
- Panelen worden automatisch ingedeeld op de gevel, rekening houdend met:
  - Sparingen (ramen/deuren)
  - Penanten (penant-zones worden uitgesloten)
  - Max hoogte

---

## Stap 6: Zetwerk

- Activeer zetwerk (de horizontale strip op de onderkant/bovenkant).
- Stel in: breedte, dikte, horizontale en verticale offset, strip-offset.

---

## Stap 7: Penanten configureren

Een **penant** is een verticaal uitstekend element op de gevel (kolom-achtige uitsprong).

### Per penant stel je in:

| Instelling | Beschrijving |
|---|---|
| **X-positie** | Afstand van de linkerkant van de gevel tot de hartlijn van het penant (ondersteunt +/- berekeningen t.o.v. hartlijn) |
| **Breedte** | Totale breedte van het penant (inclusief steenstrippen aan de zijkanten) |
| **Diepte** | Uitsteek van het penant t.o.v. de vlakke gevel |
| **Hoogte** | Hoogte van het penant (wordt automatisch beperkt tot max hoogte) |

### Geometrie van het penant (van muur naar buiten):

```
[MUUR]
  | Horizontale lat (28mm)
  | Paneel (8mm)
  | Zetwerk/steenstrip vlakke gevel (20mm)     ← vlakke gevel eindigt hier
  : 10mm GAP (ruimte tussen vlakke gevel en zij-steenstrip penant)
  | Zij-steenstrip penant (20mm)
  | Verticale latten (geschroefd op de buitenkant van de horizontale latten)
  | Steenstrippen voorzijde penant
  | 6mm voeg (tussen penant en vlakke gevel breedte)
```

### Logica regels penanten:

- **Vlakke gevel masking:** De steenstrippen van de vlakke gevel stoppen aan de buitenrand van de zij-steenstrip van het penant.
- **10mm gap:** Tussen de vlakke gevel en de zij-paneel/latten van het penant zit altijd 10mm speling.
- **6mm voeg:** Tussen de voorzijde van het penant en de belendende vlakke gevel is een voeg van 6mm.
- **Panelen en strippen vlakke gevel** worden volledig verwijderd in de breedte van het penant.
- **Horizontale latten** blijven doorlopen (worden NIET geclipped bij het penant, want de verticale latten worden hierop gemonteerd).
- **Verticale latten** worden NIET geplaatst binnen de breedte van het penant.
- Alles boven de max hoogte (ook bij penanten) wordt niet aangemaakt.

---

## Stap 8: Zone-indeling (als er penanten zijn)

Een penant verdeelt de gevel in **zones**. De numering is:

```
[HOEK] Zone 1 | PENANT 1 | Zone 2 | PENANT 2 | Zone 3 | ... | Zone N [HOEK]
```

- **Zone 1** = van de linkerhoek tot aan de linkerkant van het eerste penant.
- **Zone 2** = van de rechterkant van penant 1 tot aan de linkerkant van penant 2.
- etc.
- **Laatste zone** = van de rechterkant van het laatste penant tot de rechterhoek.

**Totaal aantal zones = aantal penanten + 1.**

### Per zone kun je instellen:

- Activeer/deactiveer zone
- Afwijkende steenkleur
- Afwijkend metselverband
- Afwijkende steen-afmetingen
- Afwijkende max hoogte

### Zone-instellingen kopiëren:

- Je kunt instellingen van de ene zone kopiëren naar een andere zone binnen dezelfde groep via het kopieerdropdown.

---

## Stap 9: Werkwijze gevel voor gevel

### Aanbevolen volgorde:

1. **Maak alle groepen aan** en geef ze namen.
2. **Stel per groep de basisinstellingen in** (verband, kleur, materiaal).
3. **Voeg penanten toe** (indien van toepassing).
4. **Controleer de zone-indeling** in de 2D-viewer — zones moeten kloppen van hoek tot hoek.
5. **Stel zone-specifieke instellingen in** (andere kleuren of verbanden).
6. **Kopieer zone-instellingen** naar andere zones waar dat wenselijk is.
7. **Activeer latten, panelen en zetwerk** indien van toepassing.
8. **Controleer in de 3D-viewer** of alles er correct uitziet.
9. **Klik op een groep** om de camera automatisch naar die gevel te navigeren.
10. **Exporteer het IFC-bestand** als alles klopt.

---

## Controle-checklist per gevel

Voordat je exporteert, controleer per gevel:

- [ ] Alle wandelementen zitten in de juiste groep
- [ ] Metselverband en kleur zijn correct
- [ ] Sparingen (ramen/deuren) worden correct overgeslagen
- [ ] Penanten staan op de juiste X-positie (controleer hartlijnen in 2D-viewer)
- [ ] Zones zijn correct genummerd en ingesteld
- [ ] Max hoogte is ingesteld (indien van toepassing)
- [ ] Latten zijn correct geconfigureerd (artikel gekozen)
- [ ] Panelen zijn correct (indien van toepassing)
- [ ] De 3D-viewer toont een doorlopende gevel zonder gaten
- [ ] Penant-steenstrippen sluiten aan op de vlakke gevel

---

## Exporteer IFC

- Klik op **Exporteer IFC**.
- Het bestand wordt gedownload en bevat alle geconfigureerde elementen:
  - Steenstrippen (per zone met eigen kleur/verband)
  - Zetwerk
  - Latten (horizontaal en verticaal)
  - Panelen
  - Penant-elementen (voorzijde + zijkanten + achterconstructie)
- Sla ook het project op via **Project opslaan** zodat instellingen bewaard blijven.

---

## Handige tips

- **Expressies in X-veld penant:** Je kunt rekenen in het X-veld, bijv. `3500 - 200` om 200mm links van hartlijn 3500 te zitten.
- **Camera navigeren:** Klik op een groep in de lijst om de 3D-camera automatisch naar die gevel te draaien.
- **HiDPI/scherpte 2D-viewer:** De 2D-tekening is op hoge resolutie voor duidelijke hartlijnen.
- **Projectbestand:** Sla het project op als JSON — dit bevat alle instellingen maar niet het IFC-bestand zelf. Zorg dat je het IFC-bestand apart bewaart.
