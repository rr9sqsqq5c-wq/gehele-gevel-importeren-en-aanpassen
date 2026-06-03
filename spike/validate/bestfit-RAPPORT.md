# SPIKE — best-fit gevelvlak + projectie op het echte dakrand-IFC (read-only)

Doel: bewijzen dat we losse elementen tot **één coplanair, uitgelijnd gevelvlak**
kunnen afleiden via een best-fit vlak + projectie, vóór we de engine aanraken.
Testset: `BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc` (445 × IfcPlate — het geval dat nu
faalt). Geen src-wijziging. Harness: `spike/validate/bestfit-spike.mjs`,
dump: `spike/validate/out/bestfit-spike.json`.

## In gewone taal: werkt het?

**Deels.** De best-fit-aanpak is duidelijk **beter** dan de huidige engine, maar dit
specifieke dakrand-bestand is **geen één plat vlak** — het zijn tientallen vlakken
(4 zijden × veel diepte-/hoogteniveaus), dus "alles op één gevelvlak" gaat hier per
definitie niet op. Wat wél lukt: de zijden netjes uit elkaar halen.

## Wat is gemeten

**Up-as (correct bepaald):** web-ifc gaf geen bruikbare vertex-normalen (~0), dus
up is afgeleid uit de overall-omvang: X=44,6 / **Y=11,1** / Z=46,4 m → **up = Y**
(kleinste extent). Dat bevestigt: de dakrand is Y-up, terwijl `detectModelUpAxis`
in de app op `'z'` terugvalt (geen wanden in dit bestand) — de eerder gemeten
oorzaak.

**Co-facing clustering (op vlak-normaal) — dit deel werkt goed:**
vier nette clusters = de vier gebouwzijden:

| cluster (richting) | aantal platen |
|---|---|
| ≈ −180° | 152 |
| ≈ 90° | 126 |
| ≈ −90° | 102 |
| ≈ 0° | 45 |

**Eén zijde op één best-fit vlak — hier wringt het:**
de grootste zijde (152 platen) dekt de lengte goed (40,5 m van 45,2 m, ~90 %),
**maar staat niet op één vlak**: residu loodrecht **gemiddeld 1412 mm, max 7169 mm**.
Reden: binnen die ene richting zitten **25 verschillende diepte-niveaus** (de dakrand
heeft profiel-diepte + meerdere niveaus/insteken). Eén plat vlak past daar niet op.

**Na ook op diepte te clusteren (normaal + offset):** het dominante vlak houdt
**29 van de 152 platen** (offset ±400 mm rond het drukste niveau), residu
**gem. 324 mm / max 944 mm**, dekking 14,8 m van 17,3 m. Strenger filteren
(RANSAC, residu < 150 mm) houdt maar **4 van 152** platen over. Dus zelfs binnen één
zijde-en-niveau zijn de platen niet echt coplanair (profiel-diepte ~sub-meter).

## Contrast met de huidige engine (axisWalls)
- axisWalls houdt **242/445** platen, **dropt 203** (op globale lengte-as); en
  splitst zelfs bínnen één zijde (lengte-as gemengd 144 `z` / 8 `x`).
- best-fit + projectie **houdt alle 152** platen van een zijde vast (ongeacht
  lengte-as) en scheidt de 4 zijden correct.
→ De best-fit-aanpak verliest dus geen elementen op een verkeerd as-criterium; dat is
  pure winst t.o.v. nu.

## Antwoord op de vier vragen
1. **Eén vlak waarop alles projecteert?** Per richting wél af te leiden, maar het
   bestand bevat **vele** vlakken; "alles op één vlak" is hier niet van toepassing.
2. **Absorbeert projectie het diepteverschil?** Tot ~enkele honderden mm wel, maar
   de zijden hebben **meters** diepteverschil (25 niveaus) → één vlak smeert dat uit.
   Je moet óók op diepte/niveau clusteren.
3. **Dekt de unie de hele gevel?** Langs de lengte ja (~90 %); in de diepte nee
   (meerdere parallelle vlakken).
4. **Normaal-spreiding — één vlak of waaier?** Waaier: vier duidelijke richtingen
   (de vier zijden), elk met meerdere diepte-niveaus.

## Wat ontbreekt voor het doel
- **Clusteren op het volledige VLAK** (normaal **én** offset/niveau), niet alleen op
  richting — anders worden parallelle, in diepte verschoven gevels samengevoegd.
- **De juiste bekleedbare subset kiezen** (de buitenhuid), niet "alle IfcPlates":
  425 van de 445 zijn gevel-facing maar verdeeld over ~25 diepteniveaus (profiel +
  beugels + retouren).
- Een **projectie-tolerantie**: de platen zijn niet mm-coplanair (sub-meter
  profiel-diepte), dus een drempel/aanvaardingsband is nodig.

## Stoplicht: 🟠 ORANJE
Best-fit-normaal-clustering werkt en is duidelijk beter dan het huidige
lengte-as-filter (geen elementen verloren, 4 zijden correct gescheiden). Maar
"losse elementen → één in lijn liggend gevelvlak" is op dit echte dakrand-bestand
**niet** bewezen met enkel best-fit + projectie: het bestand is intrinsiek
multi-planair (4 zijden × ~25 diepte-/hoogteniveaus, sub-meter profiel-diepte). Voor
het doel is extra nodig: clusteren op volledig vlak (normaal+offset) **en** selectie
van de bekleedbare buitenhuid. Pas met die twee stappen erbij levert de aanpak per
gevelzijde één uitgelijnd vlak.

> Kanttekening: de BIL-wanden zijn niet meegenomen — die zitten in een ander model
> (BIL-MOO) met een eigen coördinaten-/federatieframe; ze headless co-plaatsen viel
> buiten deze read-only proef. De dakrand-platen alleen zijn het falende geval en
> volstaan om bovenstaande te meten.
