import { MAT, MATERIAL_COLORS } from './systemDefinitions.js';

function houtLayers(settings) {
  const brickD  = settings.brickDepth ?? 20;
  const panelD  = settings.panelen?.enabled ? (settings.panelen?.dikte ?? 8) : 8;
  const latD    = settings.latten?.enabled  ? (settings.latten?.dikte  ?? 28) : 28;
  const color   = settings.color ?? '#dc6b4a';
  return [
    { id: 'ceramic',  label: `Strip ${brickD}mm`,        thickness: brickD,  material: MAT.CERAMIC,      color },
    { id: 'adhesive', label: 'Lijmlaag 4mm',              thickness: 4,       material: MAT.ADHESIVE,     color: MATERIAL_COLORS.adhesive },
    { id: 'fc_plate', label: `Vezelcement ${panelD}mm`,   thickness: panelD,  material: MAT.FIBER_CEMENT, color: MATERIAL_COLORS.fiber_cement },
    { id: 'cavity',   label: 'Ventilatiespouw 20mm',       thickness: 20,      material: MAT.AIR,          color: MATERIAL_COLORS.air },
    { id: 'lat',      label: `Lat ${latD}mm`,             thickness: latD,    material: MAT.WOOD,         color: MATERIAL_COLORS.wood },
  ];
}

function aluminiumLayers(settings) {
  const brickD  = settings.brickDepth ?? 20;
  const panelD  = settings.panelen?.enabled ? (settings.panelen?.dikte ?? 8) : 8;
  const ccs     = settings.concreteCladdingSettings ?? {};
  const ventGap = ccs.panelVentilationGap ?? 20;
  const aluD    = ccs.uProfileDepth ?? 30;
  const insulD  = ccs.insulationThickness ?? 0;
  const color   = settings.color ?? '#dc6b4a';
  const layers  = [
    { id: 'ceramic',  label: `Strip ${brickD}mm`,       thickness: brickD, material: MAT.CERAMIC,      color },
    { id: 'adhesive', label: 'Lijmlaag 4mm',             thickness: 4,      material: MAT.ADHESIVE,     color: MATERIAL_COLORS.adhesive },
    { id: 'fc_plate', label: `Vezelcement ${panelD}mm`,  thickness: panelD, material: MAT.FIBER_CEMENT, color: MATERIAL_COLORS.fiber_cement },
  ];
  if (ventGap > 0) layers.push({ id: 'cavity',   label: `Spouw ${ventGap}mm`,      thickness: ventGap, material: MAT.AIR,       color: MATERIAL_COLORS.air });
  layers.push(                  { id: 'alu_rail', label: `U-profiel ${aluD}mm`,     thickness: aluD,    material: MAT.ALUMINIUM, color: MATERIAL_COLORS.aluminium });
  if (insulD > 0) layers.push(  { id: 'insulation', label: `Isolatie ${insulD}mm`, thickness: insulD,  material: MAT.EPS,       color: MATERIAL_COLORS.eps });
  return layers;
}

function slimfortLayers(settings) {
  const brickD     = settings.brickDepth ?? 20;
  const sf         = settings.slimFortSettings ?? {};
  const panelD     = settings.panelen?.enabled ? (settings.panelen?.dikte ?? 8) : 0;
  const color      = settings.color ?? '#dc6b4a';
  const prfDepth   = sf.profileDepth ?? 63;
  const prfInsD    = sf.profileInsertDepth ?? 33;
  const profileExt = Math.max(0, prfDepth - prfInsD);
  const sfTotal    = sf.totalThickness ?? 196;
  const layers = [
    { id: 'ceramic',  label: `Strip ${brickD}mm`,  thickness: brickD,  material: MAT.CERAMIC,  color },
    { id: 'adhesive', label: 'Lijmlaag 4mm',        thickness: 4,       material: MAT.ADHESIVE, color: MATERIAL_COLORS.adhesive },
  ];
  if (panelD > 0) layers.push({ id: 'fc_plate',    label: `Vezelcement ${panelD}mm`, thickness: panelD,  material: MAT.FIBER_CEMENT, color: MATERIAL_COLORS.fiber_cement });
  if (profileExt > 0) layers.push({ id: 'profile_ext', label: `Profiel ${profileExt}mm`, thickness: profileExt, material: MAT.ALUMINIUM, color: MATERIAL_COLORS.aluminium });
  layers.push({ id: 'eps', label: `EPS ${sfTotal}mm`, thickness: sfTotal, material: MAT.EPS, color: MATERIAL_COLORS.eps });
  return layers;
}

export function buildExtendedLayerStack(settings) {
  const s  = settings ?? {};
  const bt = s.backingType ?? 'hout';
  const isSlimFort   = s.backingType === 'aluminium_slimfort';
  const isAluminium  = bt === 'aluminium';
  const layers       = isSlimFort ? slimfortLayers(s) : isAluminium ? aluminiumLayers(s) : houtLayers(s);
  const totalDepth   = layers.reduce((sum, l) => sum + l.thickness, 0);
  const outsideToIn  = layers;
  const insideToOut  = [...layers].reverse();
  return { layers: outsideToIn, claddingOnlyOutsideToInside: outsideToIn, claddingOnlyInsideToOutside: insideToOut, totalDepth, totalCladdingDepth: totalDepth };
}

export function buildWoodDetailGeometry(detailType, settings) {
  const latD   = settings.latten?.enabled ? (settings.latten?.dikte ?? 28) : 28;
  const latSpacing = 600;
  return {
    battenThicknessMm: latD,
    battenSpacingMm: latSpacing,
    screwEveryMm: latSpacing,
    hasMembrane: true,
    hasVentCavity: true,
    openingCompriband: true,
    cornerBattenContinuity: true,
    groundStartProfile: true,
    topClosureProfile: true,
    ventilationSlitsMm: 20,
  };
}

export function buildAluminiumDetailGeometry(detailType, settings) {
  const ccs = settings.concreteCladdingSettings ?? {};
  return {
    consolePitchMm: 600,
    consoleLengthMm: ccs.uProfileDepth ?? 30,
    railPitchMm: 600,
    thermalBreakMm: 6,
    fixPointEveryN: 2,
    hasVentCavity: true,
    openingThermalBreak: true,
    cornerProfileMm: 60,
    dilationJointMm: 4500,
    ventilationSlitsMm: 20,
  };
}

export function buildSlimFortDetailGeometry(detailType, settings) {
  const sf = settings.slimFortSettings ?? {};
  return {
    bracketPitchMm: 600,
    bracketDepthMm: sf.bracketDepth ?? 50,
    profileInsertMm: sf.profileInsertDepth ?? 33,
    tongueDepthMm: sf.tongueGrooveDepth ?? 41,
    tongueWidthMm: sf.tongueWidth ?? 25,
    rearZoneMm: sf.rearZoneThickness ?? 39,
    epsReturnMm: 100,
    openingEpsReveal: true,
    cornerEpsWrap: true,
  };
}

export function buildSystemDetailGeometry(systemType, detailType, settings) {
  if (systemType === 'aluminium') return buildAluminiumDetailGeometry(detailType, settings);
  if (systemType === 'slimfort')  return buildSlimFortDetailGeometry(detailType, settings);
  return buildWoodDetailGeometry(detailType, settings);
}
