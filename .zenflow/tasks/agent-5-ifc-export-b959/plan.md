# IFC Export — Agent 5

## Scope
Exporteer alle wandelementen met brickslip-positionering naar een geldig IFC-bestand, inclusief CSV uittrekstaat.

### [x] Step 1: Analyseer bestaande codebase
- Branches agent-3 en agent-4 gemerged
- Bestaande `exportGroupsToIfc` in `src/lib/ifc.js` exporteert al brickslip-proxies (IFCBUILDINGELEMENTPROXY) met positie, kleur en materiaalproperties
- CSV-uittrekstaat ontbrak nog

### [x] Step 2: Voeg IfcWall-entiteiten toe aan IFC-export
- Helper `wallIFCBBox(wall)` toegevoegd: berekent IFC-ruimte bounding box op basis van `wallOrigin` (lengthAxis/heightAxis/thicknessAxis) inclusief normalizeZUp correctie
- Per unieke wand een `IFCWALL`-entiteit aangemaakt met extruded box geometry (correct gepositioneerd en gedimensioneerd)
- Wanden toegevoegd aan `IFCRELCONTAINEDINSPATIALSTRUCTURE` in de verdieping
- Wanden krijgen neutraal grijs kleur (#c8c8c8) zodat ze visueel onderscheidbaar zijn van de brickslip-elementen

### [x] Step 3: CSV-export uittrekstaat
- `downloadCsv()` functie toegevoegd aan `Uittrekstaat.jsx`
- Exporteert: geïmporteerde wanden, totaaloverzicht groepen, per groep alle steenstrips (Vol/Kop/Driekwart/Rest/Tegel), panelen, latten
- BOM-marker (UTF-8) voor correcte weergave in Excel
- Knop "↓ CSV" toegevoegd in de header van de Uittrekstaat
- `filename` prop doorgegeven vanuit `App.jsx` (gebaseerd op IFC-bestandsnaam)
