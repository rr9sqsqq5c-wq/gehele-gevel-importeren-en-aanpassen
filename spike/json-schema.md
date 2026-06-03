# spike/json-schema.md — Schema van opgeslagen projecten (IndexedDB)

Bron: `src/lib/storage.js` (read-only gelezen). DB `ifc-planner`, versie 3.
Drie object-stores, elk met één record `id:'last'`.

## 1. `ifc-files` — `storage.js:32`
```
{ id:'last', name, size, data:ArrayBuffer, savedAt }
```
Het ruwe IFC-bestand. Niet relevant voor het contract.

## 2. `parsed-walls` — `storage.js:64,68`
```
{ id:'last', fileName, fileSize, walls:[ <wall> ], projectInfo, savedAt }
```
`walls[]` = exact de output van `parseIfc` (wallOrigin + openings + …).
Dit is een **cache** van de parse; wordt opnieuw opgebouwd bij herimport.

## 3. `project-state` — `storage.js:145,149`  ← het belangrijke schema
```
{ id:'last',
  groups:      [ { id:<gid>, wallIds:[ <expressID>, … ] }, … ],
  groupLinks:  {…},
  cornerConfigs:{…},
  settingsMap: { <gid>: <bekledingsinstellingen> },
  ifcFileName: string,
  wallDimOverrides: { <expressID>: {…} },
  allWalls:    [ <wall> ],
  savedAt }
```

### Welke velden gebruikt de groepering uit dit schema?
- `groups[].wallIds` → **lijst van `expressID`'s** per gevelgroep. Dit is de
  enige harde koppeling tussen een opgeslagen project en de wanden.
- `settingsMap[gid]` → bekledingsinstellingen per groep (op groeps-id, niet op wand).
- `wallDimOverrides[expressID]` → handmatige correcties per wand-`expressID`.
- `allWalls` → snapshot van de wandobjecten (herbouwbaar uit de IFC).

## Gevolg voor herbruikbaarheid (stap 7)

Een opgeslagen project blijft bruikbaar zolang **dezelfde `expressID` per wand**
behouden blijft, want `groups.wallIds`, `wallDimOverrides` en de koppeling met
`settingsMap` hangen allemaal aan `expressID`.

- A's **merged**-output (planeId, géén expressID): **past NIET** — de mapping naar
  opgeslagen `wallIds` is weg.
- A's **per-wand**-output (gekeyd op `expressID`): **past WEL qua identiteit** —
  `groups.wallIds` blijven geldig. Alleen de inhoud van `wallOrigin`/`openings`
  verandert; `allWalls` (snapshot) is sowieso herbouwbaar.

Kleinste migratie om oude projecten te behouden: nieuwe afleiding moet per wand
**hetzelfde `expressID`** teruggeven; dan zijn `groups`, `settingsMap` en
`wallDimOverrides` 1-op-1 herbruikbaar zonder conversie.
