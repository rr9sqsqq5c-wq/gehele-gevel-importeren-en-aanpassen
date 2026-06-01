# Current Orientation Flow

## Overzicht

De 3D viewer past een rotatie toe op de root group om IFC-coördinaten om te zetten naar
Three.js-schermruimte. De up-axis in IFC kan Z (standaard) of Y zijn.

---

## Stap 1 — forceOrientation (App.jsx → parseIfc)

```js
// App.jsx confirmImport()
const { forceOrientation } = ... // UI state, bijv. 'X_NEG90', 'NONE'
parseIfc(file, filter, progressCb, { forceOrientation })
```

`forceOrientation` wordt doorgegeven aan de IFC-parser. Als het niet ingesteld is,
detecteert `ifc.js` automatisch de up-axis en stuurt `onProgress({ phase: 'upaxis', ... })`.

---

## Stap 2 — detectUpAxis (Viewer3D.jsx)

```js
// src/Viewer3D.jsx regel 42
function detectUpAxis(walls) {
  let yCount = 0, zCount = 0;
  for (const w of walls) {
    const h = w.wallOrigin?.heightAxis;
    if (h === 'y') yCount++;
    else if (h === 'z') zCount++;
  }
  return yCount > zCount ? 'y' : 'z';
}
```

Telt `heightAxis` waarden in de geïmporteerde wanden. Meerderheidsstem.

---

## Stap 3 — orientationMode (App.jsx state)

```js
// App.jsx state
const [orientationMode, setOrientationMode] = useState('X_NEG90');
// of: 'NONE', 'X_POS90'
```

Drie mogelijke waarden:
| Mode | Omschrijving |
|------|-------------|
| `'NONE'` | Geen rotatie — IFC Z-as is Three.js Z-as |
| `'X_NEG90'` | -90° om X-as — IFC Z-as wordt Three.js Y-as (standaard instelling) |
| `'X_POS90'` | +90° om X-as — experimenteel |

---

## Stap 4 — orientationModeToRotX (Viewer3D.jsx)

```js
// src/Viewer3D.jsx regel 31
function orientationModeToRotX(mode) {
  if (mode === 'NONE') return 0;
  if (mode === 'X_POS90') return Math.PI / 2;
  return -Math.PI / 2;   // X_NEG90 = default
}
```

Elke render:
```js
const rotX = orientationModeToRotX(orientationMode);
console.log('[OrientationVerify] Viewer3D', { orientationMode, rotX });
```

---

## Stap 5 — ifcToThree (Viewer3D.jsx)

```js
// src/Viewer3D.jsx regel 27
function ifcToThree(ifcX, ifcY, ifcZ) {
  return [ifcX / 1000, ifcY / 1000, ifcZ / 1000];
}
```

Converteert IFC millimeter-coördinaten naar Three.js meter-coördinaten.
Nog geen rotatie — rotatie gebeurt op root group niveau.

---

## Stap 6 — Root Group Rotation (Viewer3D.jsx)

```jsx
// Viewer3D Canvas scene
<group rotation={[rotX, 0, 0]}>
  {walls.map(wall => <WallMesh ... />)}
  {walls.map(wall => wall.openings.map(o => <OpeningMesh ... />))}
</group>
```

De `rotX` wordt toegepast op de **root group** zodat alle wanden en openingen
uniform geroteerd worden zonder individuele transformaties.

---

## Coördinaat-mappings

### X_NEG90 (huidige instelling)

```
IFC X  →  Three.js X      (ongewijzigd)
IFC Y  →  Three.js -Z     (door -90° X-rotatie)
IFC Z  →  Three.js Y      (IFC hoogte = Three.js omhoog)
```

### Geen rotatie (NONE)

```
IFC X  →  Three.js X
IFC Y  →  Three.js Y
IFC Z  →  Three.js Z      (IFC hoogte = Three.js diepte)
```

---

## Debug

`[OrientationVerify]` wordt elke render gelogd:
```
[OrientationVerify] Viewer3D { orientationMode: 'X_NEG90', rotX: -1.5707963... }
```

Wordt ook gelogd als `{}` (object leeg) bij de eerste renders vóór props beschikbaar zijn.
