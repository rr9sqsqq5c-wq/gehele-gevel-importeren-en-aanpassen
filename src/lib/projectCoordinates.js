/**
 * projectCoordinates.js — centrale coördinatenstelsel module voor BrickBoard
 *
 * Enige module die IFC↔Three.js transformatiematrices bouwt en beheert.
 * Alle andere modules importeren uitsluitend uit dit bestand.
 *
 * Coördinaatstelsels:
 *   IFC-mm  — absolute RD-coördinaten in millimeter (Revit Shared Coordinates)
 *   Three.js — rechtshandig Y-up, meters, gecentreerd rond projectorigine
 *
 * Transformatievolgorde (rechts-naar-links):
 *   M = Ry(trueNorthAngle) * Rx(-90°) * T(-origin_m)
 */

import * as THREE from 'three';
import { isGeometryDerivedOrigin, isTrueNorthMetadataOnly } from './featureFlags.js';

// ─── Module-level state ───────────────────────────────────────────────────────
// Wordt gezet door het eerste geladen IFC-bestand met een significante origin.

let _projectOrigin = null;   // { x, y, z } in mm — IFC world origin in RD-coördinaten
let _trueNorthAngle = 0;     // radialen — hoek voor Ry-rotatie om Y-as
let _hasTrueNorth = false;
let _originSource = null;    // bestandsnaam die de origin heeft bepaald
// Gedetecteerde verticale as van de OPGELOSTE geometrie (detectModelUpAxis).
// 'z' = IFC-conventie (Z-up → moet Rx(-90°) naar three Y-up); 'y' = al Y-up
// (geen rotatie); 'z_neg' = omgekeerd Z-up (Rx(+90°)). MOET overeenkomen met de
// per-wand-as (deriveWallAxes), anders kantelt het model in de scène.
let _upAxis = 'z';

// De LAATSTE up-as die uit een CONFIDENTE detectie kwam (>= drempel; zie
// detectModelUpAxis in ifc.js). Apart van _upAxis zodat een tussenliggend wand-loos
// model of de laadvolgorde de erf-bron niet kan vergiftigen. Persistent over een
// multi-model-import; gewist bij reset/start van een project.
let _lastConfidentUpAxis = null;

// GEOMETRY_DERIVED_ORIGIN (Stap 1, vlag-gated). Alleen gebruikt als de vlag AAN staat.
//   _renderOrigin — geometrie-afgeleide render-shift (AABB-center van de emitted-local
//                   geometrie), in mm, in HETZELFDE frame als de geometrie (IFC x/y/z).
//                   Bron voor de translatie in buildProjectMatrix bij vlag AAN.
//   _worldAnchor  — { contextWCS, refLatLong, trueNorthDegrees, upAxis } — metadata voor
//                   export (Stap 2). In Stap 1 alleen gevuld/gepersisteerd, NIET toegepast.
// Beide null bij vlag-uit én bij oude (schema<2) opgeslagen projecten → buildProjectMatrix
// valt dan terug op het ongewijzigde #20-pad (byte-identiek).
let _renderOrigin = null;
let _worldAnchor = null;

const SIGNIFICANT_MM = 1000; // minimale afstand van (0,0,0) voor "significante" origin

// ─── registerIfcContext ───────────────────────────────────────────────────────

/**
 * Verwerkt de context van een geladen IFC-bestand en werkt de module-state bij.
 *
 * @param {object} context
 *   { origin: {x,y,z},           // IFCCARTESIANPOINT uit WorldCoordinateSystem (mm)
 *     trueNorth: [x,y] | null,   // IFCDIRECTION TrueNorth (genormaliseerd 2D)
 *     unitScale: number }         // 0.001 voor mm, 1.0 voor m
 * @param {string} filename
 */
export function registerIfcContext(context, filename) {
  const { origin = { x: 0, y: 0, z: 0 }, trueNorth = null, upAxis = null } = context;

  // ── Up-as (verticaal van de opgeloste geometrie) ──
  if (upAxis === 'y' || upAxis === 'z' || upAxis === 'z_neg') {
    _upAxis = upAxis;
    console.log(`[ProjectCoords] Up-as uit "${filename}": ${upAxis}` + (upAxis === 'y' ? ' (Y-up → geen Rx-rotatie in scène)' : ''));
  }

  // ── Origin ──
  const dist = Math.sqrt(origin.x ** 2 + origin.y ** 2 + origin.z ** 2);
  const isSignificant = dist > SIGNIFICANT_MM;

  if (_projectOrigin === null) {
    if (isSignificant) {
      _projectOrigin = { x: origin.x, y: origin.y, z: origin.z };
      _originSource = filename;
      console.log(
        `[ProjectCoords] Origin bepaald door "${filename}":`,
        `(${origin.x.toFixed(0)}, ${origin.y.toFixed(0)}, ${origin.z.toFixed(0)}) mm`,
        `≈ (${(origin.x / 1000).toFixed(0)}, ${(origin.y / 1000).toFixed(0)}) m`,
      );
    } else {
      console.log(`[ProjectCoords] "${filename}": geen significante origin (Tekla/lokaal patroon) — geen aftrek`);
    }
  } else if (isSignificant) {
    const diff = Math.sqrt(
      (origin.x - _projectOrigin.x) ** 2 +
      (origin.y - _projectOrigin.y) ** 2 +
      (origin.z - _projectOrigin.z) ** 2,
    );
    if (diff > SIGNIFICANT_MM) {
      console.warn(
        `[ProjectCoords] ⚠ "${filename}" heeft afwijkende origin`,
        `(${(diff / 1000).toFixed(0)} m verschil t.o.v. "${_originSource}").`,
        `Origin van "${_originSource}" blijft gebruikt.`,
      );
    }
  }

  // ── TrueNorth ──
  if (!_hasTrueNorth && trueNorth != null) {
    const [tn_x, tn_y] = trueNorth;
    const len = Math.sqrt(tn_x ** 2 + tn_y ** 2) || 1;
    _trueNorthAngle = Math.atan2(tn_x / len, tn_y / len);
    _hasTrueNorth = true;
    console.log(
      `[ProjectCoords] TrueNorth bepaald door "${filename}":`,
      `(${(tn_x / len).toFixed(4)}, ${(tn_y / len).toFixed(4)})`,
      `→ ${(_trueNorthAngle * 180 / Math.PI).toFixed(2)}°`,
    );
  }
}

// ─── buildProjectMatrix ───────────────────────────────────────────────────────

/**
 * Bouwt de IFC-world → Three.js transformatiematrix.
 *
 * M = Ry(trueNorthAngle) * Rx(-90°) * T(-origin_m)
 *
 * Accepteert een optionele `projectInfo` snapshot (uit React state) zodat de
 * matrix correct blijft na Vite HMR-reloads (waarbij module-state gereset wordt).
 * Zonder argument: gebruikt de huidige module-state.
 *
 * @param {object} [projectInfo]  snapshot van getProjectInfo() — optioneel
 * @returns {THREE.Matrix4}
 */
/**
 * Bouwt de IFC→Three.js transformatiematrix.
 * Leest UITSLUITEND uit module-state (_projectOrigin, _trueNorthAngle).
 * Één bron van waarheid — geen fallbacks, geen parameters.
 * Module-state wordt gezet via registerIfcContext() of restoreProjectInfo().
 */
export function buildProjectMatrix() {
  // GEOMETRY_DERIVED_ORIGIN (Stap 1): render-tijd honoreert een AANWEZIGE render-origin
  // ALTIJD, ongeacht de vlagstand — de vlag bepaalt UITSLUITEND bij het PARSEN of er een
  // nieuwe render-origin wordt afgeleid (ifc.js). Zo rendert/exporteert een v2-project
  // (renderOrigin gezet) identiek met de vlag aan én uit; geen 485 km-terugval bij vlag-uit.
  // De render-origin ligt in HETZELFDE frame als de geometrie (IFC x/y/z), dus een RECHTE
  // aftrek voor élke up-as centreert correct; de 'y'-frame-remap in de UIT-tak compenseert
  // juist het RD/Z-up-frame van #20 en mag hier NIET. Geen render-origin (v1/schema<1 of
  // vlag-uit geparset) → ongewijzigd #20-pad (byte-identiek).
  let T;
  if (_renderOrigin != null) {
    const rx = (_renderOrigin.x ?? 0) * 0.001;
    const ry = (_renderOrigin.y ?? 0) * 0.001;
    const rz = (_renderOrigin.z ?? 0) * 0.001;
    T = new THREE.Matrix4().makeTranslation(-rx, -ry, -rz);
  } else {
    const ox = (_projectOrigin?.x ?? 0) * 0.001;
    const oy = (_projectOrigin?.y ?? 0) * 0.001;
    const oz = (_projectOrigin?.z ?? 0) * 0.001;

    // Frame-bewuste origin-aftrek. De WCS-origin is RD/Z-up: ox=Easting, oy=Northing,
    // oz=elevatie (≈0). De VERTICALE geometrie-as (afhankelijk van _upAxis) moet de
    // ELEVATIE (oz) afgetrokken krijgen, niet de Northing — anders belandt oy (≈472 km)
    // op de verticaal en valt het model omlaag (zie docs DIAGNOSE 3). Voor 'y' remappen
    // we de origin daarom naar het geometrie-frame: (Easting, elevatie, Northing).
    T = _upAxis === 'y'
      ? new THREE.Matrix4().makeTranslation(-ox, -oz, -oy)
      : new THREE.Matrix4().makeTranslation(-ox, -oy, -oz); // 'z'/'z_neg': Rx routeert oz naar de verticaal
  }
  // Rx hangt af van de gedetecteerde up-as (consistent met deriveWallAxes):
  //   'z'     → Rx(-90°): IFC Z-up naar three Y-up (conventie / oude gedrag)
  //   'y'     → identity: model is al Y-up, NIET roteren (anders ligt het op zijn kant)
  //   'z_neg' → Rx(+90°): omgekeerd Z-up
  const Rx = _upAxis === 'y'
    ? new THREE.Matrix4() // identity
    : _upAxis === 'z_neg'
      ? new THREE.Matrix4().makeRotationX(Math.PI / 2)
      : new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  // TRUENORTH_METADATA_ONLY (FIX C): vlag AAN → géén trueNorth-rotatie in de scène (3D =
  // project-noord, gelijk aan 2D/export); trueNorth leeft alleen als export-metadata. Vlag UIT →
  // Ry(trueNorth) zoals voorheen (byte-identiek).
  const Ry = isTrueNorthMetadataOnly()
    ? new THREE.Matrix4() // identity — project-noord
    : new THREE.Matrix4().makeRotationY(_trueNorthAngle);

  // M = Ry * Rx * T
  return new THREE.Matrix4()
    .multiplyMatrices(Ry, new THREE.Matrix4().multiplyMatrices(Rx, T));
}

// ─── ifcMmToThree ─────────────────────────────────────────────────────────────

/**
 * Converteert een absolute IFC-positie (mm, RD-coördinaten) naar Three.js-ruimte.
 * Gebruik voor losse punten: bounding boxes, opening-posities, camera-focus.
 *
 * @param {number} x  IFC absolute X in mm
 * @param {number} y  IFC absolute Y in mm
 * @param {number} z  IFC absolute Z in mm
 * @returns {[number, number, number]}  Three.js [x, y, z] in meters
 */
export function ifcMmToThree(x, y, z) {
  const ox = _projectOrigin?.x ?? 0;
  const oy = _projectOrigin?.y ?? 0;
  const oz = _projectOrigin?.z ?? 0;

  // Stap 1: frame-bewuste origin-aftrek + mm→m (zie buildProjectMatrix).
  // Voor 'y' trekt de verticaal (Y) de elevatie (oz) af, niet de Northing (oy).
  const sy = _upAxis === 'y' ? oz : oy;
  const sz = _upAxis === 'y' ? oy : oz;
  const xm = (x - ox) * 0.001;
  const ym = (y - sy) * 0.001;
  const zm = (z - sz) * 0.001;

  // Stap 2: Rx afhankelijk van up-as (zie buildProjectMatrix)
  let ax, ay, az;
  if (_upAxis === 'y') { ax = xm; ay = ym; az = zm; }                 // geen rotatie
  else if (_upAxis === 'z_neg') { ax = xm; ay = -zm; az = ym; }       // Rx(+90°)
  else { ax = xm; ay = zm; az = -ym; }                                // Rx(-90°), Z-up

  // Stap 3: Ry(trueNorthAngle)
  const ca = Math.cos(_trueNorthAngle);
  const sa = Math.sin(_trueNorthAngle);
  return [
    ca * ax + sa * az,
    ay,
    -sa * ax + ca * az,
  ];
}

// ─── threeToIfcMm ─────────────────────────────────────────────────────────────

/**
 * Inverse van ifcMmToThree. Converteert Three.js-positie terug naar
 * absolute IFC-mm (RD-coördinaten). Gebruik bij IFC-export.
 *
 * @param {number} x  Three.js X in m
 * @param {number} y  Three.js Y in m
 * @param {number} z  Three.js Z in m
 * @returns {[number, number, number]}  IFC absolute [x, y, z] in mm
 */
export function threeToIfcMm(x, y, z) {
  const ox = _projectOrigin?.x ?? 0;
  const oy = _projectOrigin?.y ?? 0;
  const oz = _projectOrigin?.z ?? 0;

  const ca = Math.cos(_trueNorthAngle);
  const sa = Math.sin(_trueNorthAngle);

  // Inverse Ry: roteer terug
  const bx = ca * x - sa * z;
  const by = y;
  const bz = sa * x + ca * z;

  // Inverse Rx, afhankelijk van up-as (inverse van ifcMmToThree-stap 2)
  let cx, cy, cz;
  if (_upAxis === 'y') { cx = bx; cy = by; cz = bz; }                 // geen rotatie
  else if (_upAxis === 'z_neg') { cx = bx; cy = bz; cz = -by; }       // inverse Rx(+90°)
  else { cx = bx; cy = -bz; cz = by; }                                // inverse Rx(-90°), Z-up

  // m → mm + origin (frame-bewust, inverse van ifcMmToThree-stap 1)
  const sy = _upAxis === 'y' ? oz : oy;
  const sz = _upAxis === 'y' ? oy : oz;
  return [
    cx * 1000 + ox,
    cy * 1000 + sy,
    cz * 1000 + sz,
  ];
}

// ─── reset ────────────────────────────────────────────────────────────────────

/**
 * Reset alle module-state. Aanroepen bij:
 *   - "Nieuw project" in App.jsx
 *   - Eerste bestand laden na een nieuw project
 */
/** Geeft de huidige TrueNorth-hoek terug in radialen. */
export function getTrueNorthAngle() { return _trueNorthAngle; }

/**
 * Herstelt de module-state vanuit een gecachede projectInfo snapshot.
 * Aanroepen bij een cache-hit zodat registerIfcContext niet nodig is.
 */
export function restoreProjectInfo(info) {
  if (!info) return;
  _projectOrigin  = info.origin ?? null;
  _trueNorthAngle = (info.trueNorthDegrees ?? 0) * Math.PI / 180;
  _hasTrueNorth   = info.hasTrueNorth ?? false;
  _originSource   = info.originSource ?? null;
  _upAxis         = (info.upAxis === 'y' || info.upAxis === 'z' || info.upAxis === 'z_neg') ? info.upAxis : 'z';
  // GEOMETRY_DERIVED_ORIGIN (Stap 1): render-origin/world-anchor uit een schema≥2 record.
  // Ontbreekt (oud project) → null → buildProjectMatrix valt terug op het #20-pad → identieke
  // render. GEEN her-derivatie: uitsluitend as-stored gelezen. Bij vlag-uit ongebruikt.
  _renderOrigin = info.renderOrigin ?? null;
  _worldAnchor  = info.worldAnchor ?? null;
  // Zaai de erf-bron met de herstelde up-as (alleen gelezen in de flag-gated geen-wanden-tak).
  if (info.upAxis === 'y' || info.upAxis === 'z' || info.upAxis === 'z_neg') _lastConfidentUpAxis = info.upAxis;
  console.log('[ProjectCoords] Hersteld uit cache:', {
    origin: _projectOrigin,
    trueNorthDegrees: info.trueNorthDegrees,
    originSource: _originSource,
    upAxis: _upAxis,
  });
}

export function reset() {
  _projectOrigin = null;
  _trueNorthAngle = 0;
  _hasTrueNorth = false;
  _originSource = null;
  _upAxis = 'z';
  _lastConfidentUpAxis = null;
  _renderOrigin = null;
  _worldAnchor = null;
  console.log('[ProjectCoords] Reset — project state gewist');
}

// ─── GEOMETRY_DERIVED_ORIGIN render-origin + world-anchor (Stap 1) ─────────────
/**
 * Zet de geometrie-afgeleide render-origin (mm, in het geometrie-frame = AABB-center van
 * de emitted-local geometrie) + world-anchor metadata. FIRST-WINS (spiegelt _projectOrigin):
 * een later submodel overschrijft de render-origin van het eerste wand-dragende model niet.
 * De aanroeper (parse-pad) gatet op isGeometryDerivedOrigin(); deze functie zelf niet.
 */
export function setGeometryDerivedRenderOrigin(renderOriginMm, worldAnchor) {
  if (_renderOrigin == null && renderOriginMm) {
    _renderOrigin = { x: renderOriginMm.x, y: renderOriginMm.y, z: renderOriginMm.z };
  }
  if (_worldAnchor == null && worldAnchor) _worldAnchor = { ...worldAnchor };
}
export function getRenderOrigin() { return _renderOrigin ? { ..._renderOrigin } : null; }
export function getWorldAnchor() { return _worldAnchor ? { ..._worldAnchor } : null; }

// ─── lastConfidentUpAxis (erf-bron voor wand-loze submodellen) ─────────────────
export function getLastConfidentUpAxis() { return _lastConfidentUpAxis; }
export function setLastConfidentUpAxis(axis) {
  if (axis === 'y' || axis === 'z' || axis === 'z_neg' || axis === 'x') _lastConfidentUpAxis = axis;
}

// ─── getProjectInfo ───────────────────────────────────────────────────────────

/**
 * Geeft een snapshot van de huidige state voor React-state-updates en debugging.
 * Elke aanroep retourneert een nieuw object (triggers React re-renders).
 *
 * @returns {{hasOrigin, originSource, origin, trueNorthDegrees, hasTrueNorth, isReady}}
 */
export function getProjectInfo() {
  const base = {
    hasOrigin: _projectOrigin !== null,
    originSource: _originSource,
    origin: _projectOrigin ? { ..._projectOrigin } : null,
    trueNorthDegrees: _trueNorthAngle * 180 / Math.PI,
    hasTrueNorth: _hasTrueNorth,
    upAxis: _upAxis,
    isReady: _hasTrueNorth, // werkt ook zonder origin (Tekla-first scenario)
  };
  // GEOMETRY_DERIVED_ORIGIN (Stap 1): vlag AAN → schema v2 met render-origin + world-anchor
  // (metadata; world-anchor pas in Stap 2 toegepast). Vlag UIT → EXACT het oude object
  // (geen extra velden) zodat de opgeslagen bytes byte-identiek blijven.
  if (!isGeometryDerivedOrigin()) return base;
  return {
    ...base,
    schemaVersion: 2,
    renderOrigin: _renderOrigin ? { ..._renderOrigin } : null,
    worldAnchor: _worldAnchor ? { ..._worldAnchor } : null,
  };
}
