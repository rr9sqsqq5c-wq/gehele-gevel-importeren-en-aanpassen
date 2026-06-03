# DIAGNOSE — de verticale onbeklede strook (≈40–45 mm) na de up-as-fix

READ-ONLY. Geen src-wijziging. Artefact: `spike/validate/gap-diagnose.mjs`
(hergebruikt productie-`fitFacadePlane`; meet op het echte BIL-vlak, t-as=z, u-as=y).

## Bevindingen

### Gat-breedte + flankerende elementen (NÁ-fix-vlak, t-as=z)
Twee smalle volle-hoogte stroken, samen 85 mm over 27,7 m (bij 5 mm-sampling; de
eerdere ~75 mm was bij 25 mm-sampling):

| gat @ z | breedte | links | rechts |
|---|---|---|---|
| ≈ −38061 | **45 mm** | dakrand **PLAAT** #20567 (t1=−38083) | wand #254424 `21.10_WA_LB_HSB_182.5` (t0=−38040) |
| ≈ −10819 | **40 mm** | wand #652945 `21.10_WA_LB_HSB_182.5` (t1=−10840) | dakrand **PLAAT** #19772 (t0=−10798) |

→ Telkens **twee APARTE model-elementen** (verschillende expressID's: een dakrand-plaat
naast een HSB-wand). Geen gesplitst/dubbel element.

### Model-voeg of projectie-artefact? → **ECHTE MODEL-VOEG**
De werkelijke afstand tussen de twee bounding-boxen langs z (uit de ruwe model-
geometrie, los van de kolom-sampling):
- gat 1: model-voeg **43 mm** ↔ geprojecteerd gat **45 mm** → gelijk.
- gat 2: model-voeg **42 mm** ↔ geprojecteerd gat **40 mm** → gelijk.

De voeg zit dus in de **model-geometrie zelf** (de plaat-rand en de wand-rand raken
elkaar niet), niet in de projectie/het beklede resultaat. (Op een ÁNDER minX-vlak
liggen wél 4 elementen over ditzelfde z-bereik — terugliggende/vleugel-geometrie —
maar op het geselecteerde gevelvlak is het een echte open voeg.)

### Vóór vs ná up-as-fix → **IDENTIEK**
Zelfde selectie, beide vlakken (ná = model-up 'y'; vóór = extent-gok): **2 gaten,
85 mm, breedtes 45/40 mm in beide gevallen.** Het gat is dus **niet door de fix
ontstaan**. (In dit brede selectiegeval resolveert zelfs de oude extent-heuristiek
toevallig dezelfde u/t-assen, dus de geometrie van het gat is in beide identiek.)

Waarom het nú pas opvalt: vóór de fix liep het verband **verticaal** (hele veld zag er
gestreept/fout uit), wat de twee dunne voegen maskeerde. Ná de fix loopt het verband
horizontaal en volgt het de contouren correct, dus deze twee echte ~40 mm-voegen
worden zichtbaar als dunne onbeklede verticale stroken.

## Conclusie — (a) ECHTE VOEG tussen twee wand-/plaat-segmenten

Eén aangewezen oorzaak: **de model-geometrie** — een dakrand-plaat en een HSB-wand
sluiten op het gevelvlak met een echte voeg van ~40–45 mm op elkaar aan. Het is
**geen artefact** van de up-as-fix of de projectie.

Het strikte contour-masker laat die voeg bewust leeg in
**`src/lib/facadePlane.js:161` `maskRowsToContours`** (knipt elke rij tot de unie van
element-footprints; `facadePlane.js:171` `if (!ivs.length) continue` → kolom zonder
element blijft onbekleed). Dat is correct gedrag voor "volg de contour".

Daarom is **"smalle voeg overbruggen" een bewuste SPEC-KEUZE**, geen symptoom-
bestrijding: wil je dat de strippen over een echte ≤ ~50 mm constructievoeg
doorlopen, dan voeg je dat als expliciete regel toe in `maskRowsToContours`
(merge-tolerantie tussen aangrenzende intervallen, bv. ≤ 1 stootvoeg/steen). De
oorzaak zit niet in een bug die je moet repareren.

## Stoplicht: 🟢 GROEN (diagnose helder)
- Oorzaak eenduidig: **echte model-voeg** (43/42 mm) tussen twee aparte elementen,
  identiek vóór/ná de fix → **geen fix-/projectie-artefact**.
- Beslispunt voor de spec: smalle voegen (≤ ~50 mm) wél of niet overbruggen in
  `maskRowsToContours` (`facadePlane.js:161`). Bewuste keuze, geen reparatie.

(Geen src gewijzigd; alleen `spike/validate/gap-diagnose.mjs` + dit bestand toegevoegd.)
