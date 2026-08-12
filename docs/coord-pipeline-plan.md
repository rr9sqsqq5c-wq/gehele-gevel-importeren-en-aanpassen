# Coördinaten-pipeline — implementatieplan

> **Type:** FIX/FEATURE · **Worktree:** `C:\dev\brickboard` · **Diagnose-ref:** `764a490`
> **Bron-van-waarheid.** Werk de status-tracker (§9) bij. Vergrendelde beslissingen (§0)
> niet heropenen tenzij een meting ze weerlegt.
> **Grens:** `file:line`-verwijzingen komen uit de diagnose @`764a490` en moeten bij
> aanvang opnieuw geverifieerd worden (code kan zijn verschoven).

---

## §0 — Beslissingen-log (vergrendeld) 🔒

Staan vast zodat we niet in rondjes lopen:

1. **Render-origin uit de geometrie, niet uit `#20`.** Dit is de fix, exporteur-agnostisch.
2. **Splits `projectInfo.origin` → `renderOrigin` + `worldAnchor`.** Render gebruikt alleen
   `renderOrigin`; export alleen `worldAnchor`. Conflatie = de bug.
3. **Primair: AABB-center** (uit `getBBox`) als bron voor `renderOrigin`.
   `COORDINATE_TO_ORIGIN` is terugvaloptie, niet eerste keus.
4. **Feature-vlag default UIT, byte-identiek als uit, raakt alleen het parse-pad.**
5. **`IfcMapConversion` wordt gelezen→opgeslagen, nooit op de render toegepast.**
6. **Oude projecten worden bij laden niet opnieuw geparset** (load-pad ongemoeid).
   `expressID` blijft onaangeroerd.

---

## §1 — Probleem

web-ifc levert geometrie **lokaal** (boom-relatief; context-WCS `#20` niét toegepast —
empirisch gemeten). Brickboard trekt als origin echter `#20` af (Revit-shared/RD-orde,
≈ 485 km). Resultaat: voor Revit-bestanden verschuift de scène ~485 km; voor
Tekla-bestanden (offset zit in de boom, `#20` ≈ identiteit) blijft de RD-coord juist staan.
Eén oorzaak: render-origin uit de verkeerde bron.

## §2 — Doelarchitectuur

Twee gescheiden begrippen in `projectInfo`:

| Veld | Betekenis | Bron | Toegepast op |
|---|---|---|---|
| `renderOrigin` | Punt dat we aftrekken zodat de scène bij (0,0,0) ligt | AABB-center van de geometrie | **alleen render** |
| `worldAnchor` | Alles om de echte plaatsing te reconstrueren | `contextWCS`(#20) + `refLatLong` + `trueNorth` + `upAxis` (+ later `mapConversion`) | **alleen export** |

**Invariant** (de toets dat het klopt):

```
emittedLocal       = wat web-ifc default uitspuugt (boom toegepast, #20 NIET)
renderCoord        = emittedLocal − renderOrigin       → ~0 voor élk bestand
real_world(export) = renderCoord + renderOrigin + contextWCS(#20)
```

- Revit-shared: `emittedLocal` ≈ 0, `renderOrigin` ≈ 0, `#20` draagt de offset → klopt.
- Tekla: `emittedLocal` = RD, `renderOrigin` = RD-center, `#20` ≈ 0 → klopt.

Hierdoor is `GetCoordinationMatrix` niet nodig in de AABB-route — wij controleren de shift
zelf, en de enige externe georef-datum is `#20` (+ RefLat/Long).

## §3 — Feature-vlag

- Naam: `GEOMETRY_DERIVED_ORIGIN` — default `false`.
- Scope: **uitsluitend** de origin-bronkeuze in `buildProjectMatrix`
  (`projectCoordinates.js:123-135`).
- Vlag UIT = huidige `#20`-aftrek, byte-identiek. Vlag mag het laad-/restore-pad nooit raken.

## §4 — Gefaseerd plan

### Stap 0 — bevestig het geredeneerde (MEET, niet-blokkerend)

- Draai `spike/diagnose/measure-coords-pipeline.mjs` op een Tekla-/boom-offset-bestand →
  bevestig symmetrische faalrichting (`emittedLocal` = RD, `#20` = identiteit).
- Browser: meet pick-precisie bij de 485 km-scène (raycast loopt in object-lokale ruimte;
  impact mogelijk milder dan gedacht).
- Check multi-`IFCSITE`-contextkeuze (`registerIfcContext :74-87`).
- **Acceptatie:** drie open punten uit §8 beantwoord. Blokkeert de fix niet (oorzaak staat
  al vast), maar valideert de Tekla-tak van de invariant.

### Stap 1 — splits de origin, achter de vlag (de kern)

- Raakpunten: `buildProjectMatrix projectCoordinates.js:123-135` (origin-bron),
  `getProjectInfo :287-297` / `restoreProjectInfo :246-261` (schema),
  bron-AABB uit `getBBox ifc.js:415-461`.
- Vlag AAN: `renderOrigin` = AABB-center in **dezelfde ruimte/eenheid** als waar nu `#20`
  wordt afgetrokken (mm vs three-units alignen — zie §7). Rotatievolgorde (`Rx :140-144`)
  ongewijzigd laten → stap 5 blijft 🟢.
- `worldAnchor` vullen met `#20` + RefLat/Long + trueNorth + upAxis.
- **Acceptatie:** vlag-uit nul diff (§6); vlag-aan → wereld-AABB van Revit-bestand binnen
  paar honderd m van (0,0,0).

### Stap 2 — export gebruikt `worldAnchor`

- Raakpunt: export `ifc.js:1828` (schrijft nu `PT(0,0,0)`).
- Her-bed `contextWCS`(#20) in en emit coords via de invariant-formule.
- **Acceptatie:** round-trip — geëxporteerde IFC opnieuw inlezen plaatst geometrie op de
  oorspronkelijke real-world positie (±tolerantie). Lost idee *"uniform 3D/2D/IFC, geen
  mismatches"* op.

### Stap 3 — MapConversion (later, laag)

- Raakpunt: `_readAndRegisterIfcContext ifc.js:497-537`.
- `IfcMapConversion`/`IfcProjectedCRS` lezen→opslaan in `worldAnchor`. Niet op render toepassen.
- **Acceptatie:** IFC4-bestand mét MapConversion exporteert georef-correct; huidige bestanden
  (zonder) ongewijzigd.

## §5 — Data-model & migratie

- Nieuw schema:
  `projectInfo = { schemaVersion: 2, renderOrigin, worldAnchor:{ contextWCS, refLatLong, trueNorth, upAxis, mapConversion? } }`.
- `wallOrigin` in `saveParsedWalls storage.js:64-72` blijft **lokaal** — ongewijzigd.
- **Migratie-shim bij laden:** ontbreekt `renderOrigin` (schema 1) → behandel
  `projectInfo.origin` als legacy render-origin, **niet** her-deriven. Oud project + lokale
  `wallOrigin` blijven onderling consistent → identieke render (door diagnose bevestigd).
- Harde eis: vlag verandert nooit het laad-pad, alleen import.

## §6 — Regressie-waakhond

| Wat mag niet veranderen | Test | Verwacht |
|---|---|---|
| Render + export, vlag UIT | snapshot BIL-MOO + near-origin-model | byte-identiek (nul diff) |
| Oud opgeslagen project | laden met vlag aan én uit | identieke render |
| `expressID`-identiteit | laad-pad inspectie | onaangeroerd |
| Up-as / 90°-rotatie (🟢) | matrix-opbouwvolgorde | ongewijzigd |
| Nieuwe ON-pad (succescriterium) | wereld-AABB álle testmodellen | < paar honderd m van (0,0,0) |

## §7 — Risico-register

| Risico | Mitigatie |
|---|---|
| **Eenheid/ruimte-mismatch** `renderOrigin` (mm vs three-units) → kleinere offset herintroduceren | bereken in exact dezelfde ruimte als huidige `#20`-aftrek; assert via §6-succescriterium |
| Dubbel-shift bij per ongeluk ook `COORDINATE_TO_ORIGIN` aanzetten | niet combineren; AABB-route laat `OpenModel(data,{})` ongemoeid |
| Multi-`IFCSITE` kiest verkeerde context | uitkomst Stap 0; eventueel expliciete contextselectie |
| Migratie her-derivt per ongeluk oude coords | shim leest as-stored; schema-versie-guard |
| Tekla-tak van invariant onjuist | bevestigen in Stap 0 vóór Stap 2 |

## §8 — Open punten (beantwoorden in Stap 0)

1. Tekla-/boom-offset: is `emittedLocal` = RD en `#20` = identiteit? (invariant-symmetrie)
2. Zichtbare raycast-/pick-impact op 485 km — gemeten i.p.v. geredeneerd?
3. Multi-`IFCSITE`: welke context wordt origin-bron, en is dat robuust?

## §9 — Voortgang (monitor hier)

| Stap | Omschrijving | Status |
|---|---|---|
| 0 | Meet Tekla-case + raycast + multi-site | ⚪ niet gestart (geen Tekla-fixture in repo; dakrand-model = 0 wanden + #20≈0) |
| 1 | Origin-split achter vlag | 🟢 klaar + waakhond groen (2026-06-09) |
| 2 | Export gebruikt worldAnchor | 🟢 klaar + waakhond groen (2026-06-09); round-trip georef-fout 485 km → 0 mm (BIL-MOO), 0 → 0 (BOOM-MOO); no-anchor byte-identiek |
| 3 | MapConversion lezen→opslaan | ⚪ niet gestart |

Legenda: ⚪ niet gestart · 🟡 bezig · 🟢 klaar + waakhond groen · 🔴 geblokkeerd

## §10 — Definition of Done

Alle testmodellen renderen < paar honderd m van (0,0,0); vlag-uit byte-identiek; oude
projecten identiek; IFC-export round-trip op real-world positie; `expressID` onaangeroerd;
§9 volledig 🟢.
