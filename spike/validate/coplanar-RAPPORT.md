# SPIKE — liggen dakrand-VOORzijde en onderliggende wand in lijn? (read-only)

Bestanden: dakrand = `BIL-VIA-L-ZZ-PBP_dakranden.IFC`, wand = `BIL-MOO-A-ZZ-PBP.ifc`.
Harnessen: `spike/validate/coreg.mjs` (stap 0), `spike/validate/coplanar-meet.mjs`
(stap 1-4). Dumps in `spike/validate/out/`. Geen src-wijziging.

## In gewone taal
**Ja — de voorkant van de dakrand en de gevel eronder liggen op één vlak** (≈1 cm,
max 2 cm) over de volle lengte van de gevel. Groeperen tot één doorlopend gevelvlak
is dus geometrisch correct. En dakranden zónder gevel eronder (bv. boven de entree)
vormen netjes hun eigen vlak — die worden niet ten onrechte met een wand versmolten.

## STAP 0 — co-registratie (vorige spike sloeg dit over): GELDIG
- Géén formele georeferentie in beide bestanden (geen `IfcMapConversion`/
  `IfcProjectedCRS`).
- WCS-origin verschilt: dakrand `(0,0,0)`; wand `(111.185.325, 471.934.575, 0)` mm
  (RD) — maar dat is **metadata**; de geometrie zelf staat in beide in dezelfde
  **lokale modelruimte**:
  - dakrand wereldbbox: X[-6,0..38,6] Y[-0,6..10,5] Z[-38,3..8,1] m
  - wand wereldbbox:    X[-2,1..38,4] Y[-0,4..9,1] Z[-38,6..1,9] m
  → zelfde footprint, **beide Y-up** (kleinste extent = Y). Overlay is geldig zonder
  handmatige uitlijning. (Bevestiging achteraf: de gemeten 11 mm-pasvorm over 27 m
  in stap 3 kán alleen als de frames kloppen.)

## STAP 1-2 — gemeenschappelijk frame + één gevel
- Up unified op **Y** voor beide. Beide modellen in hetzelfde lokale frame
  (rechtstreeks vergelijkbaar; geen transform nodig).
- Buitenwanden gefilterd op **NL-SfB 21.x**: 193 van 4128 wanden.
- Wand-zijden (op normaalrichting): −180°:83, 90°:68, −89°:38, 0°:4. Binnen de
  grootste richting zaten **4 offset-niveaus** (gebouw met vleugels) → via
  normaal+offset-clustering **één facade-vlak geïsoleerd: 40 buitenwanden**,
  dikte **280 mm**, lengte **27,2 m**, normaal ≈ −X.

## STAP 3 — coplanariteit dakrand-VOORzijde ↔ wand-buitenvlak (de bewijsvraag)
Alleen de **voorzijde** van de dakrand gemeten (front-face langs de buitennormaal;
profiel-diepte telt niet mee). Dakrand-platen op dit vlak: 34 (front-offset 0 mm en
−200 mm t.o.v. het wand-buitenvlak; een parallelle vleugel op −10,8 m werd correct
apart gehouden).

| meting | waarde |
|---|---|
| loodrechte afstand voorzijde → wand-buitenvlak | **gem. 11 mm, max 20 mm** |
| lengte-dekking dakrand-voorzijde | **27.272 mm van 27.200 mm (≈100 %)** |
| gecombineerde best-fit (wand-buiten + dakrand-voor) residu | **gem. 4 mm, max 8 mm** |

→ Ruim binnen praktische tolerantie (≤ enkele cm). **Stoplicht STAP 3: 🟢 GROEN.**
Wat de feature zou opleveren (één gecombineerd best-fit vlak) past wand én
dakrand-voorzijde samen op **≤ 8 mm**.

## STAP 4 — losstaande dakrand (eigen vlak)
Per dakrand-VLAK (normaal + offset) gecheckt of er een coplanaire buitenwand is:
- **16 dakrand-vlakken MÉT buitenwand eronder** → versmelten terecht tot één gevel.
- **6 dakrand-vlakken ZONDER wand** → eigen groep/vlak (bv. richting −180°, offset
  5 m, 16 platen, 926 mm; en 90°, offset 7-8 m). Deze worden dus **niet** met een
  wand versmolten — precies het gewenste gedrag voor de losstaande dakrand (entree).

## Eindoordeel: 🟢 GROEN
- Co-registratie is geldig (zelfde lokale frame, beide Y-up).
- De dakrand-**voorzijde** en de buitenwand eronder liggen **in lijn**: gem. 11 mm
  (max 20 mm), 100 % lengte-dekking; een gezamenlijk best-fit vlak past beide op
  ≤ 8 mm. Groeperen → één doorlopend gevelvlak is dus geometrisch onderbouwd.
- Losstaande dakranden vormen aantoonbaar hun eigen vlak.

### Waarom dit lukt waar de vorige spike op ORANJE bleef
De vorige spike fitte **alle** platen incl. profiel-diepte/soffit/beugels en
**alle** richtingen samen → 7 m residu. Hier is de aanpak gericht: (1) co-registreren,
(2) per **facade-vlak** clusteren op **normaal + offset** (niet alleen richting),
(3) buitenwanden filteren op **NL-SfB 21**, en (4) alleen de **voorzijde** meten.
Dat zijn meteen de bouwstenen die de engine nodig heeft.

## Beperkingen / eerlijk
- Geen `IfcMapConversion` in de bestanden; de overlay leunt op de (sterk
  onderbouwde, maar niet door CRS-metadata bevestigde) gedeelde lokale modelruimte.
  De 11 mm-pasvorm over 27 m is het beste bewijs dat de frames samenvallen.
- Eén gevelzijde gemeten (grootste). De aanpak is generiek per zijde; andere zijden
  niet afzonderlijk uitgedraaid.
- Geometrie grof gesampled (snelheid); maten zijn indicatief op ~mm-niveau.

Dumps: `spike/validate/out/coplanar-meet.json`, `spike/validate/out/bestfit-spike.json`.
