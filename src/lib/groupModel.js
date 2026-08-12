// groupModel.js — CONTRACT voor de "één waarheid" van een gevelgroep.
//
// Doel: 3D (Viewer3D), 2D (View2D), IFC-export (ifc.js), Werktekening en Uittrekstaat worden DUNNE
// consumenten van ÉÉN view-agnostisch model. Alle geometrie/knip/diepte-logica hoort in de builder,
// niet in de views. Dit bestand legt de VORM + het FRAME + de DIEPTE-STAPELING + het BELEID vast.
//
// Status: CONTRACT. Nog NERGENS bedraad (geen import in App/Viewer/ifc) → byte-identiek t.o.v. huidige
// output. `buildGroupModel` is een skelet met fase-markers; de diepte-helpers zijn wél al echt + testbaar
// (die vormen de kern die de penant/vent-bugs veroorzaakte).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FRAME & EENHEDEN (bindend voor het hele model)
//   • Alles in GROEP-LOKAAL PLANE-FRAME, in MILLIMETER.
//   • x = lengte-as   (0 = groupMinX, loopt langs de gevel)
//   • y = hoogte-as   (0 = groupMinH, omhoog)
//   • diepte = UITSTEEK loodrecht op het gevelvlak; + = naar buiten (van wand af, richting kijker).
//   • Dit is hetzelfde frame als facadeData.rows / sparingRects / panels / latten — geen conversie nodig
//     tussen subsystemen. Views mappen zelf van dit frame naar hun eigen ruimte (three-meters / canvas /
//     IFC-wereld) met de group.frame-info.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** @typedef {{ start:number, length:number, label?:string, koppelstrip?:boolean }} Piece */
/** @typedef {{ y:number, pieces:Piece[] }} Row */
/** @typedef {{ x:number, y:number, width:number, height:number }} Rect */

/**
 * @typedef {Object} FacadeData  — de doorlopende gevel-dekking (strippen), al sparing-geknipt.
 * @property {Row[]}   rows            steenstrip-rijen (plane-frame, mm)
 * @property {number}  groupWidth
 * @property {number}  groupHeight
 * @property {number}  groupMinX       wereld-minimum langs lengte-as (frame-oorsprong)
 * @property {number}  groupMinH       wereld-minimum langs hoogte-as
 * @property {Object[]} groupOpenings  ramen/deuren/ventilatie ({x,y,width,height,type,polyPts?})
 * @property {Object}  refWallOrigin   {lengthAxis,heightAxis,thicknessAxis,thicknessStart,thicknessEnd,...}
 * @property {Rect[]=} sparingRects     geïmporteerde onderdelen, plane-frame (mag leeg)
 */

/**
 * @typedef {Object} StripBatch  — één homogene set steenstrip-rijen met eigen kleur/verband/diepte.
 *   Dekt zowel het vlakke deel, de (penant/strip)zones, de ventilatie-grille ALS de penant-vlakken/-zijkanten.
 * @property {Row[]}    rows
 * @property {string}   color
 * @property {string}   verband
 * @property {Object=}  material        steen-maten voor dit batch (steenL/steenH); default = groep-materiaal
 * @property {number=}  brickH          rijhoogte (verband-afhankelijk); afleidbaar uit verband+material
 * @property {('flat'|'penantFront'|'penantSide'|'ventGrille')} kind
 * @property {number=}  depthCenter     diepte-hart (mm) van dit batch t.o.v. gevelvlak  ← ÉÉN diepte-bron
 * @property {('left'|'right')=} side   bij kind==='penantSide'
 * @property {number=}  penantX         penant-oorsprong x (bij penant-batches)
 * @property {number=}  penantB         penant-breedte  (bij penant-batches)
 */

/** @typedef {{ id:string, x:number, y:number, width:number, height:number, holes?:Rect[], zoneId?:string, row?:number, col?:number, type?:string }} Panel */
/** @typedef {{ id:string, richting:('horizontaal'|'verticaal'), x:number, y:number, width:number, height:number, forced?:boolean }} Lat */

/**
 * @typedef {Object} PenantModel — één penant, view-agnostisch (diepten uit de gedeelde diepte-stapeling).
 * @property {number}  x
 * @property {number}  breedte
 * @property {number}  diepteLinks
 * @property {number}  diepteRechts
 * @property {number}  hoogte
 * @property {Rect[]}  panelBoxes      front- + zijbeen-panelen (met diepte-info in .depth)
 * @property {Rect[]}  cornerBattens   hoeklatjes
 * @property {PenantDepths} depths      alle diepte-hart/uitsteek-waarden voor front/zij (mm)
 */

/**
 * @typedef {Object} VentZone — ephemere ventilatie-zone (grille + gat). Zie ventilationZonesFor().
 * @property {number} x @property {number} y @property {number} width @property {number} height
 * @property {string} verband @property {Object=} material @property {{x:number,y:number}=} clearMargin
 */

/**
 * @typedef {Object} GroupModel — DE één-waarheid van een groep. Consumers renderen hier ALLES uit.
 * @property {string}        groupId
 * @property {GroupFrame}    frame
 * @property {DepthStack}    depths          gedeelde diepte-stapeling (mm)
 * @property {FacadeData}    facadeData
 * @property {StripBatch[]}  stripBatches    general + zones + penant + vent-grille (alles, met diepte)
 * @property {PenantModel[]} penanten
 * @property {Panel[]}       panels          hoofdvlak-panelen (met holes[])
 * @property {Lat[]}         latten          hoofdvlak-latten
 * @property {Rect[]}        sparingRects
 * @property {VentZone[]}    ventZones
 */

/** @typedef {{ refWallOrigin:Object, groupMinX:number, groupMinH:number, groupWidth:number, groupHeight:number, outsideDirFlip:boolean }} GroupFrame */

/**
 * @typedef {Object} GroupModelCtx — één keer geresolvede context (materiaal + artikel + vlaggen).
 *   De aanroeper bepaalt deze; de builder doet GEEN vlag-lookups zelf → deterministisch + testbaar.
 * @property {Object}  material       geresolved materiaal INCL. steenstrip-artikel (steenL/steenH) = "effectiveMat"
 * @property {number}  brickDepth     steenstrip-dikte (mm)   — dikte uit steenstrip-artikel
 * @property {number}  panelDikte     paneeldikte (mm)
 * @property {number}  latDikte       lat-dikte/DIEPTE per laag (mm) — dikteMM uit lat-artikel
 * @property {number}  latBreedte     lat-BREEDTE/aanzicht (mm) — breedteMM uit lat-artikel
 * @property {('enkel'|'kruislaag')} lattenSysteem  hout-achterconstructie-systeem (Houtimport Rijssen):
 *   'enkel'     = enkele horizontale dubbelgeventileerde lat → 1 laag.
 *   'kruislaag' = lat-op-lat → 2 gekruiste lagen. Bepaalt de lat-DIEPTE (niet de richting!).
 * @property {number}  lattenLagen    afgeleid: enkel→1, kruislaag→2 (latDepthEff = lagen × latDikte)
 * @property {('horizontaal'|'verticaal')} lattenRichting  ORIËNTATIE van het zichtbare (paneel-dragende) lat
 * @property {number}  stoot          stootvoeg (mm)
 * @property {number}  startLijn      groep-startlijn (mm)
 * @property {number|null} maxHoogte
 * @property {Object=} kozijnOffset
 * @property {Object=} edgeStagger
 * @property {boolean} maxHoogteVullen
 * @property {Rect[]=} sparingRects   al geprojecteerd (of leeg)
 * @property {boolean} ventilatie     ventilatiezone-vlag
 * @property {boolean} featureZones
 * @property {('hout'|'aluminium'|'aluminium_slimfort')} backing
 * @property {number=} facadeBaseDepth  bij slimfort (vervangt latDikte in de stapeling)
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// DIEPTE-STAPELING — ÉÉN BRON. (Dit is de kern die de penant/vent-diepte-bugs veroorzaakte.)
//
// TWEE HOUT-SYSTEMEN (Houtimport Rijssen — beide in de artikeldatabase, per groep te kiezen):
//   • 'enkel'     → lattenLagen 1 → latDepthEff = 1 × latDikte   (enkele horizontale dubbelgeventileerde lat)
//   • 'kruislaag' → lattenLagen 2 → latDepthEff = 2 × latDikte   (lat-op-lat, gekruist)
//
// Vanaf het gevelvlak (wand-buitenkant) naar buiten, in mm:
//
//     0 ─ latDepthEff ──────── latten (1 of 2 lagen; systeem-afhankelijk)
//     latDepthEff ─────────── panelDikte ── panelen
//     latDepthEff+panelDikte ─ brickDepth ── steenstrips (vlak)   ← depthCenter = ...+brickDepth/2
//
// Penant (zelfde latDepthEff als het vlak → volgt het gekozen systeem; zie BELEID-P1):
//     penantFlatOuter = latDepthEff + panelDikte + brickDepth
//     zijstrip-achter  = penantFlatOuter + 6                       (6 mm-negge)
//     zijstrip-lengte  = diepte + stoot + brickDepth               (per zijde)
//     vóórstrip loopt VOORLANGS: vóórstrip-binnen = diepste-zij-voor; buiten = +1 stripdikte
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DepthStack
 * @property {number} latBack @property {number} latFront
 * @property {number} panelBack @property {number} panelFront
 * @property {number} flatStripCenter @property {number} flatStripOuter
 * @property {number} latDepthEff
 */
/**
 * De vlakke diepte-stapeling (latten → panelen → strips). Pure functie.
 * @param {GroupModelCtx} ctx
 * @returns {DepthStack}
 */
export function computeDepthStack(ctx) {
  const latDikte = ctx.backing === 'aluminium_slimfort' && ctx.facadeBaseDepth != null ? ctx.facadeBaseDepth : (ctx.latDikte ?? 28);
  const panelDikte = ctx.panelDikte ?? 8;
  const brickDepth = ctx.brickDepth ?? 20;
  const lagen = ctx.lattenLagen ?? (ctx.lattenSysteem === 'kruislaag' ? 2 : 1);
  const latDepthEff = lagen * latDikte;                              // 'enkel'→1×, 'kruislaag'→2×
  const panelBack = latDepthEff;
  const panelFront = latDepthEff + panelDikte;
  return {
    latBack: 0, latFront: latDikte, latDepthEff,
    panelBack, panelFront,
    flatStripCenter: panelFront + brickDepth / 2,   // = depthFromFace (general strips)
    flatStripOuter: panelFront + brickDepth,
  };
}

/**
 * @typedef {Object} PenantDepths
 * @property {number} sideBack        achterkant zijstrip (6 mm-negge)
 * @property {number} sideLenLeft @property {number} sideLenRight   (= diepte + stoot + brickDepth)
 * @property {number} frontCenter     vóórstrip-hart (voorlangs)
 * @property {number} frontInner @property {number} frontOuter
 */
/**
 * Penant-diepten. Vóórvlak loopt VOORLANGS over de zijkanten (vóórstrip-binnen sluit op diepste zij-voor).
 * Basis = latDepthEff → volgt het gekozen hout-systeem ('enkel' 1×, 'kruislaag' 2×). Bij 'enkel' identiek
 * aan de huidige 3D/IFC-penant (byte-identiek); bij 'kruislaag' schuift de penant mee met het vlak.
 * @param {number} pDL @param {number} pDR @param {GroupModelCtx} ctx
 * @returns {PenantDepths}
 */
export function penantDepths(pDL, pDR, ctx) {
  const latDikte = ctx.backing === 'aluminium_slimfort' && ctx.facadeBaseDepth != null ? ctx.facadeBaseDepth : (ctx.latDikte ?? 28);
  const panelDikte = ctx.panelDikte ?? 8;
  const brickDepth = ctx.brickDepth ?? 20;
  const stoot = ctx.stoot ?? 10;
  const lagen = ctx.lattenLagen ?? (ctx.lattenSysteem === 'kruislaag' ? 2 : 1);
  const latDepthEff = lagen * latDikte;
  const pDmax = Math.max(pDL, pDR);
  const penantFlatOuter = latDepthEff + panelDikte + brickDepth;
  const sideBack = penantFlatOuter + 6;
  const maxArm = pDmax + stoot + brickDepth;
  const frontInner = sideBack + maxArm;         // achterkant vóórstrip = voorkant diepste zijstrip
  return {
    sideBack,
    sideLenLeft: pDL + stoot + brickDepth,
    sideLenRight: pDR + stoot + brickDepth,
    frontInner,
    frontCenter: frontInner + brickDepth / 2,   // vóórstrip-hart
    frontOuter: frontInner + brickDepth,        // 1 stripdikte voorlangs
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// BELEID — de gekozen ÉÉN waarheid per aspect (target voor de migratie). ✅ = beslist, ❓ = jouw beslissing.
//
// STEENSTRIPS
//   ✅ Materiaal: overal `effectiveMat` (steenstrip-artikel steenL/steenH). Export stopt met plain `mat`.
//   ✅ 2D-penant-zones: via de GEDEELDE stripBatches (regionBatches), niet de aparte `zonePatterns`-tak.
//   ✅ Penant: één route (dit model: stripBatches met kind 'penantFront'/'penantSide' + depthCenter).
//   ✅ Zones/vent/sparing: reeds gedeeld (buildStripZoneRegions / applyVentZonesToBatches / clipRowsAroundRects).
//
// PANELEN
//   ✅ Ventilatie: uit de zone-splitsing gefilterd, daarna vent-cut (`cutVentHolesFromPanels`).
//   ✅ Rij-snap: AAN (snapToRowY met battenYs).
//   ✅ Filters: 200/10 + strip-dekkingsfilter.
//   ✅ Sparing: `attachHolesToPanels` (paneel heel + holes[]).
//   ✅ Materiaal: `effectiveMat` (net als strippen).
//   ✅ Contour-clip: `clipPanelToFacadePolys` als optioneel model-veld (nu alleen Werktekening) — view mag 'm toepassen.
//   ✅ P2 (beslist): de holes[] worden OVERAL uitgesneden — óók uit de IFC-geometrie én de 3D-paneeldozen
//      (boolean/segmentatie), niet alleen in tekening/lijst. Volledig consistent.
//
// LATTEN
//   ✅ Twee hout-systemen als groep-instelling (Houtimport Rijssen, uit de artikeldatabase):
//        'enkel'     = enkele horizontale dubbelgeventileerde lat  → 1 laag  → 1× latDikte.
//        'kruislaag' = lat-op-lat (gekruist)                       → 2 lagen → 2× latDikte.
//      Beide kunnen voorkomen → `ctx.lattenSysteem` / `lattenLagen` stuurt de diepte (NIET de richting).
//   ✅ Horizontale positionering: ÉÉN algoritme = `computeHorizontalLatten` (generateBattenPositions + brickTop-snap).
//      De paneelgrens-loop (export/uittrek) vervalt.
//   ✅ Opening-clip + paneel-extent-clip (INSET 5): overal (nu alleen Werktek/Uittrek).
//   ✅ Sparing-clip op latten: overal (nu alleen 2D/export).
//
// PENANT
//   ✅ P1 (beslist): penant-diepte-basis = latDepthEff → VOLGT het gekozen lat-systeem (achter hetzelfde vinkje).
//      'enkel' → identiek aan huidige penant (byte-identiek); 'kruislaag' → penant schuift mee met het vlak.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Vaste beleidskeuzes als constante — migratie leest hieruit i.p.v. per-view hard te coderen. */
export const GROUP_MODEL_POLICY = Object.freeze({
  strips:  { materiaal: 'effectiveMat', penantZones2D: 'sharedBatches', penantRoutes: 1 },
  panelen: { ventilatie: 'filterThenCut', rijSnap: true, filters: ['min200x10', 'stripDekking'], sparing: 'attachHoles', sparingSnijden: ['2d', 'werktek', 'uittrek', 'ifc', '3d'], materiaal: 'effectiveMat', contourClip: 'optional' },
  latten:  { horizAlgoritme: 'computeHorizontalLatten', openingClip: true, panelExtentClip: true, sparingClip: true, systemen: ['enkel', 'kruislaag'], diepteBron: 'lattenLagen' },
  penant:  { dieptePolicy: 'voorlangs', basis: 'latDepthEff', volgtLatSysteem: true },
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CONSUMER-MAPPING (hoe elke view uit het model rendert — geen eigen geometrie meer)
//   Viewer3D    : stripBatches → GroupBricks3D (depthCenter); penanten → PenantMesh3D; panels/latten → MainStructure3D (depthStack)
//   View2D      : facadeData.rows + stripBatches → canvas; penanten (schematisch); panels/latten → tekenlagen
//   ifc.js      : stripBatches → IFCEXTRUDEDAREASOLID (depthCenter); penanten → emitPenantBox; panels/latten → boxes
//   Werktekening: panels (+holes) → productiekaarten; latten → posities
//   Uittrekstaat: panels/latten → tellingen (zelfde bron ⇒ telling == tekening == export)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * DE builder — één bron voor 3D/2D/export/werktek/uittrek. SKELET (fase-markers); nog niet bedraad.
 * Migratie vult elk blok met de reeds-gedeelde functies volgens GROUP_MODEL_POLICY, byte-identiek per stap.
 * @param {Object} group @param {Object} settings @param {Object[]} walls @param {GroupModelCtx} ctx
 * @returns {GroupModel}
 */
export function buildGroupModel(group, settings, walls, ctx) {
  const depths = computeDepthStack(ctx);
  // FASE 0 — facadeData: buildBestFit/FullGroupFacadePattern(effectiveMat) + sparing-clip.           [reeds gedeeld]
  // FASE 3 — stripBatches: general + buildStripZoneRegions + penant + applyVentZonesToBatches.        [grotendeels gedeeld]
  // FASE 1 — latten: computeHorizontalLatten + opening/panel/ sparing-clip (POLICY.latten).            [migreren]
  // FASE 2 — panels: buildFacadeZones+panelizeZone + vent-cut + filters + attachHoles (POLICY.panelen). [migreren]
  // FASE P — penanten: penantDepths() → front/side batches + boxes + cornerBattens.                    [migreren]
  throw new Error('buildGroupModel: contract vastgelegd, implementatie volgt per migratie-fase (zie GROUP_MODEL_POLICY).');
  /* eslint-disable no-unreachable */
  // return { groupId: group.id, frame: {...}, depths, facadeData: null, stripBatches: [], penanten: [], panels: [], latten: [], sparingRects: ctx.sparingRects ?? [], ventZones: [] };
}
