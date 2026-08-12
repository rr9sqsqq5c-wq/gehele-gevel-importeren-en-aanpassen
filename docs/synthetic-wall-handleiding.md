# Handleiding — Synthetische calc-wand (L×H)

Een **calc-wand** is een wand die je zélf intikt (lengte × hoogte × dikte in mm), **zonder
IFC-bestand**. Hij wordt een gewone, bekleedbare groep: je ziet 'm in 3D, in de 2D-gevel
en in de uittrekstaat. Handig om snel een bekleding/materiaalstaat door te rekenen voordat
er een model is.

> Achter een **feature-vlag**, standaard **UIT**. Sessie-only (wordt niet opgeslagen).

---

## 1. Aanzetten

Open de app met de vlag in de URL:

```
http://localhost:5173/?syntheticWall=1
```

(Of zet in de browser-console `localStorage.setItem('syntheticWall','1')` en herlaad.)
Pas dan verschijnt de control. **Uitzetten / noodrem:** `?syntheticWall=0`.

---

## 2. Een wand maken

1. Open het **groep-paneel** in de zijbalk (waar ook "Auto-groeperen" en "+ Nieuwe groep
   van selectie" staan).
2. Je ziet nu een rij met drie velden + een knop:

   | veld | betekenis | default |
   |---|---|---|
   | **L** | lengte van de gevel (mm) | 4000 |
   | **H** | hoogte van de gevel (mm) | 2870 |
   | **dikte** | wanddikte (mm) | 272.5 |

3. Vul je maten in (alles in **mm**, moet > 0 zijn).
4. Klik **`+ Wand (L×H)`**.

Er verschijnt meteen een nieuwe groep **"Calc-wand 1"** (de tweede heet "Calc-wand 2",
enzovoort) die automatisch geselecteerd wordt. Elke klik maakt **één** nieuwe wand + groep.

---

## 2b. Maten achteraf aanpassen (live)

Selecteer de calc-wand-groep. Onder de **`+ Wand (L×H)`**-rij verschijnt een paarse
balk **`✏️ Calc-wand 1: L [..] H [..] dikte [..] mm`**. Wijzig een veld en de bekleding
**beweegt direct mee** — in 3D, in de 2D-gevel, in de uittrekstaat én in de IFC-export.
Geen nieuwe wand, geen extra klik: dezelfde wand met nieuwe maten.

> De velden tonen de huidige maten van de geselecteerde wand. Een leeg/0/ongeldig veld
> laat die maat ongemoeid. Wissel je van wand, dan vullen de velden zich opnieuw.

---

## 3. Wat je krijgt

De calc-wand gedraagt zich als een normale groep:

- **3D**: de wand staat als blok in de viewer en krijgt steenstrips.
- **2D Gevel**: het gevelaanzicht met het verband.
- **📋 Uittrekstaat**: de wand telt mee in de materiaal-/zaaglijst.
- **Instellingen**: kies materiaal, kleur en **verband** (standaard halfsteens; ook
  wildverband / groothuis wildverband\* mogelijk) net als bij een geïmporteerde groep.

\* Groothuis wildverband heeft z'n eigen vlag (`?groothuisWildverband=1`).

---

## 4. Belangrijk om te weten (grenzen v1)

- **Sessie-only** — de calc-wand wordt **niet opgeslagen** in het project. Bij herladen of
  "Nieuw project" is hij weg. (Bewust: zo botst hij nooit met een echte IFC-import.)
- **Geen IFC** nodig en **geen IFC-terug-export** — de calc-wand komt nooit in een
  IFC-export of georeferentie terecht.
- **Eén losse wand per actie**, **vaste dikte**, **geen openingen** (ramen/deuren) en
  **geen hoeken/aansluitingen**. Dat zijn bewuste latere stappen.
- **Niet combineren met een IFC-model** — de calc-wand gebruikt een Z-up-oriëntatie die
  klopt zónder IFC; samen met een (niet-Z-up) IFC-model kan de stand verkeerd uitvallen.
  Gebruik 'm voor losse calc's.

---

## 5. Snel checken of het werkt

`?syntheticWall=1` → `+ Wand (L×H)` met **4000 × 2870 × 272.5** → er komt een groep
"Calc-wand 1" met steenstrips in 3D en 2D, en een regel in de uittrekstaat. Geen IFC nodig.

---

*Technisch: de wand krijgt een interne id `syn_<n>` (string-namespace, botst nooit met
IFC-id's) en wordt vóór het opslaan uit de projectstaat gefilterd. Bron:
`src/lib/syntheticWall.js`, vlag in `src/lib/featureFlags.js`, handler in `src/App.jsx`.*
