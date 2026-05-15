export const SECTION_TYPES = {
  VERTICAL_CUT: 'VERTICAL_CUT',
  HORIZONTAL_CUT: 'HORIZONTAL_CUT',
  PLAN_VIEW: 'PLAN_VIEW',
};

export const RENDER_SIDES = {
  LEFT: 'left',
  RIGHT: 'right',
  TOP: 'top',
  BOTTOM: 'bottom',
  CENTER: 'center',
  PERIMETER: 'perimeter',
};

const DETAIL_SECTION_MAP = {
  SYSTEM_VERTICAL:   SECTION_TYPES.VERTICAL_CUT,
  SYSTEM_HORIZONTAL: SECTION_TYPES.HORIZONTAL_CUT,
  OPENING_HEADER:    SECTION_TYPES.VERTICAL_CUT,
  OPENING_SILL:      SECTION_TYPES.VERTICAL_CUT,
  OPENING_JAMB:      SECTION_TYPES.HORIZONTAL_CUT,
  CORNER_OUTSIDE:    SECTION_TYPES.PLAN_VIEW,
  CORNER_RETURN:     SECTION_TYPES.PLAN_VIEW,
  GROUND_BASE:       SECTION_TYPES.VERTICAL_CUT,
  TOP_PARAPET:       SECTION_TYPES.VERTICAL_CUT,
  PANEL_JOINT_V:     SECTION_TYPES.HORIZONTAL_CUT,
  PANEL_JOINT_H:     SECTION_TYPES.VERTICAL_CUT,
  SLIMFORT_EPS:      SECTION_TYPES.PLAN_VIEW,
  SLIMFORT_BRACKET:  SECTION_TYPES.VERTICAL_CUT,
  SLIMFORT_PROFILE:  SECTION_TYPES.VERTICAL_CUT,
};

export function buildSectionOrientation(context) {
  const {
    detailType = null,
    wallOrigin = null,
    outsideDir = null,
    layerStack = null,
    orientationPreference = 'standard',
  } = context ?? {};

  const sectionType = DETAIL_SECTION_MAP[detailType] ?? SECTION_TYPES.VERTICAL_CUT;
  const isPlanView = sectionType === SECTION_TYPES.PLAN_VIEW;
  const shouldMirrorGeometry = orientationPreference === 'mirrored';

  const physicalOutsideDir = _resolvePhysicalOutside(wallOrigin, outsideDir);
  const physicalInsideDir = _invertDir(physicalOutsideDir);

  const claddingSide = isPlanView
    ? RENDER_SIDES.PERIMETER
    : (shouldMirrorGeometry ? RENDER_SIDES.RIGHT : RENDER_SIDES.LEFT);

  const substrateSide = isPlanView
    ? RENDER_SIDES.CENTER
    : (shouldMirrorGeometry ? RENDER_SIDES.LEFT : RENDER_SIDES.RIGHT);

  const startFromInside = isPlanView || shouldMirrorGeometry;

  const layerRenderOrder = layerStack
    ? (startFromInside
        ? layerStack.claddingOnlyInsideToOutside
        : layerStack.claddingOnlyOutsideToInside)
    : null;

  const sectionNormal = _computeSectionNormal(sectionType, wallOrigin);
  const wallNormal = wallOrigin ? _axisToVec(wallOrigin.thicknessAxis, 1) : null;

  return {
    sectionType,
    insideDir: physicalInsideDir,
    outsideDir: physicalOutsideDir,
    renderStartSide: isPlanView ? null : RENDER_SIDES.LEFT,
    renderEndSide: isPlanView ? null : RENDER_SIDES.RIGHT,
    cutDirection: isPlanView ? 'top-down'
      : (sectionType === SECTION_TYPES.VERTICAL_CUT ? 'horizontal' : 'vertical'),
    viewerDirection: isPlanView ? 'down' : 'east',
    dimensionSide: RENDER_SIDES.BOTTOM,
    annotationSide: RENDER_SIDES.RIGHT,
    layerRenderOrder,
    substrateSide,
    claddingSide,
    shouldMirrorText: shouldMirrorGeometry,
    shouldMirrorGeometry,
    sectionNormal,
    wallNormal,
    outsideNormal: physicalOutsideDir,
    viewerNormal: null,
    debug: {
      detailType,
      sectionType,
      isPlanView,
      physicalOutsideDir,
      claddingSide,
      substrateSide,
      shouldMirrorGeometry,
      layerOrder: layerRenderOrder?.map(l => `${l.id}(${l.thickness}mm)`) ?? null,
    },
  };
}

export function buildLeaderAnchors(rects, options = {}) {
  const {
    minLabelWidth = 40,
    staggerStep = 14,
    maxStaggerLevels = 3,
  } = options;

  const anchors = [];
  let staggerLevel = 0;

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const cx = r.x + r.w / 2;

    if (r.w >= minLabelWidth) {
      anchors.push({ rectIndex: i, cx, labelX: cx, leaderX: null, stagger: 0, inline: true, dir: 0 });
    } else {
      const dir = i % 2 === 0 ? -1 : 1;
      const offset = 28 + staggerLevel * staggerStep;
      const labelX = cx + dir * offset;
      anchors.push({ rectIndex: i, cx, labelX, leaderX: cx, stagger: staggerLevel, inline: false, dir });
      staggerLevel = (staggerLevel + 1) % maxStaggerLevels;
    }
  }

  return anchors;
}

function _resolvePhysicalOutside(wallOrigin, outsideDir) {
  if (outsideDir) return outsideDir;
  if (!wallOrigin) return null;
  const { thicknessAxis } = wallOrigin;
  return thicknessAxis ? { axis: thicknessAxis, direction: 1 } : null;
}

function _invertDir(dir) {
  if (!dir) return null;
  return { ...dir, direction: -(dir.direction ?? 1) };
}

function _computeSectionNormal(sectionType, wallOrigin) {
  if (!wallOrigin) {
    if (sectionType === SECTION_TYPES.PLAN_VIEW) return { x: 0, y: 1, z: 0 };
    if (sectionType === SECTION_TYPES.VERTICAL_CUT) return { x: 0, y: 0, z: 1 };
    return { x: 1, y: 0, z: 0 };
  }
  const { lengthAxis, heightAxis, thicknessAxis } = wallOrigin;
  if (sectionType === SECTION_TYPES.PLAN_VIEW) return _axisToVec(heightAxis, 1);
  if (sectionType === SECTION_TYPES.VERTICAL_CUT) return _axisToVec(lengthAxis, 1);
  return _axisToVec(thicknessAxis, 1);
}

function _axisToVec(axis, sign = 1) {
  if (!axis) return null;
  if (axis === 'x') return { x: sign, y: 0, z: 0 };
  if (axis === 'y') return { x: 0, y: sign, z: 0 };
  if (axis === 'z') return { x: 0, y: 0, z: sign };
  return null;
}
