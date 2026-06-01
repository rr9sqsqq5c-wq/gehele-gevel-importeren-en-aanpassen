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

// ─── Module-level state ───────────────────────────────────────────────────────
// Wordt gezet door het eerste geladen IFC-bestand met een significante origin.

let _projectOrigin = null;   // { x, y, z } in mm — IFC world origin in RD-coördinaten
let _trueNorthAngle = 0;     // radialen — hoek voor Ry-rotatie om Y-as
let _hasTrueNorth = false;
let _originSource = null;    // bestandsnaam die de origin heeft bepaald

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
  const { origin = { x: 0, y: 0, z: 0 }, trueNorth = null } = context;

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
export function buildProjectMatrix(projectInfo) {
  // Gebruik projectInfo snapshot als beschikbaar, anders module-state
  const origin = projectInfo?.origin ?? _projectOrigin;
  const trueNorthAngle = projectInfo?.hasTrueNorth
    ? (projectInfo.trueNorthDegrees * Math.PI / 180)
    : _trueNorthAngle;

  const ox = (origin?.x ?? 0) * 0.001; // mm → m
  const oy = (origin?.y ?? 0) * 0.001;
  const oz = (origin?.z ?? 0) * 0.001;

  const T  = new THREE.Matrix4().makeTranslation(-ox, -oy, -oz);
  const Rx = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const Ry = new THREE.Matrix4().makeRotationY(trueNorthAngle);

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

  // Stap 1: aftrek origin + mm→m
  const xm = (x - ox) * 0.001;
  const ym = (y - oy) * 0.001;
  const zm = (z - oz) * 0.001;

  // Stap 2: Rx(-90°): (xm, ym, zm) → (xm, zm, -ym)
  const ax = xm, ay = zm, az = -ym;

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

  // Inverse Rx(-90°) = Rx(+90°): (bx, by, bz) → (bx, -bz, by)
  const cx = bx, cy = -bz, cz = by;

  // m → mm + origin
  return [
    cx * 1000 + ox,
    cy * 1000 + oy,
    cz * 1000 + oz,
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

export function reset() {
  _projectOrigin = null;
  _trueNorthAngle = 0;
  _hasTrueNorth = false;
  _originSource = null;
  console.log('[ProjectCoords] Reset — project state gewist');
}

// ─── getProjectInfo ───────────────────────────────────────────────────────────

/**
 * Geeft een snapshot van de huidige state voor React-state-updates en debugging.
 * Elke aanroep retourneert een nieuw object (triggers React re-renders).
 *
 * @returns {{hasOrigin, originSource, origin, trueNorthDegrees, hasTrueNorth, isReady}}
 */
export function getProjectInfo() {
  return {
    hasOrigin: _projectOrigin !== null,
    originSource: _originSource,
    origin: _projectOrigin ? { ..._projectOrigin } : null,
    trueNorthDegrees: _trueNorthAngle * 180 / Math.PI,
    hasTrueNorth: _hasTrueNorth,
    isReady: _hasTrueNorth, // werkt ook zonder origin (Tekla-first scenario)
  };
}
