# Agent 3 — Multi-element patroonberekening

## Aanpak

Middelgrote uitbreiding van `src/lib/pattern.js`. Plan opgesplitst in 4 stappen.

### [x] Step 1: Projectstructuur opzetten
- `.gitignore` en `package.json` aangemaakt
- `geometry.js` overgenomen van agent-1-branch
- `adjacency.js` en test overgenomen van agent-2-branch

### [x] Step 2: src/lib/pattern.js implementeren
- Nieuwe hoofdfunctie `buildAllGroupsPattern(groups, walls, groupSettings, defaultSettings)`
  - Per groep uit Agent 2: patroon als één doorlopend vlak
  - Verbandkoppeling: wanden geketend via startPoint/endPoint (hoekdetectie)
  - Losstaande wanden starten patroon opnieuw
  - Openingen (ramen/deuren) per wand uitgesloten
  - Per groep instelbaar: steenmaat, voegmaat, verband, kleur
  - Resultaat: per wand-id `{ rows, groupId, settings }`
- Nieuwe hulpfunctie `getWallChains(walls)` (ketenvolgorde voor UI)
- Verbandtypen: halfsteens, tegelverband, staand_tegelverband, **wild verband** (nieuw)
- Alle bestaande functies behouden (legacy API voor agent-1 compatibiliteit):
  - `buildGroupPattern`, `buildFullGroupFacadePattern`, `buildSingleWallPattern`
  - `buildFacePattern`, `buildCenteredFacePattern`, `buildSymmetricFacePattern`, `buildMirroredFacePattern`
  - `getGroupPatternLogic`, `getOpeningPoly`

### [x] Step 3: Tests schrijven
- `src/lib/pattern.test.js` — 36 tests, alle geslaagd
- Dekt: basisgedrag, verbandkoppeling, losstaande wanden, per-groep instellingen,
  openingen, ketens, single wall, legacy API, staand tegelverband, wild verband

### [x] Step 4: Commit
