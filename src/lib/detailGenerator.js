export const DETAIL_TYPES = {
  SYSTEM_VERTICAL: 'SYSTEM_VERTICAL',
  SYSTEM_HORIZONTAL: 'SYSTEM_HORIZONTAL',
  OPENING_HEADER: 'OPENING_HEADER',
  OPENING_SILL: 'OPENING_SILL',
  OPENING_JAMB: 'OPENING_JAMB',
  CORNER_OUTSIDE: 'CORNER_OUTSIDE',
  CORNER_RETURN: 'CORNER_RETURN',
  GROUND_BASE: 'GROUND_BASE',
  TOP_PARAPET: 'TOP_PARAPET',
  PANEL_JOINT_V: 'PANEL_JOINT_V',
  PANEL_JOINT_H: 'PANEL_JOINT_H',
  SLIMFORT_EPS: 'SLIMFORT_EPS',
  SLIMFORT_BRACKET: 'SLIMFORT_BRACKET',
  SLIMFORT_PROFILE: 'SLIMFORT_PROFILE',
};

const DETAIL_PREFIX = {
  SYSTEM_VERTICAL: 'SYS',
  SYSTEM_HORIZONTAL: 'SYS',
  OPENING_HEADER: 'OPE',
  OPENING_SILL: 'OPE',
  OPENING_JAMB: 'OPE',
  CORNER_OUTSIDE: 'HOE',
  CORNER_RETURN: 'HOE',
  GROUND_BASE: 'MAA',
  TOP_PARAPET: 'DAK',
  PANEL_JOINT_V: 'PAN',
  PANEL_JOINT_H: 'PAN',
  SLIMFORT_EPS: 'SLF',
  SLIMFORT_BRACKET: 'SLF',
  SLIMFORT_PROFILE: 'SLF',
};

export function isSlimFortActive(settings) {
  return settings?.backingType === 'aluminium_slimfort';
}

export function getSystemInfo(settings) {
  const bt = settings?.backingType;
  if (isSlimFortActive(settings)) {
    const sf = settings?.slimFortSettings ?? {};
    const t = sf.totalThickness ?? 196;
    return {
      systemType: 'slimfort',
      label: `SlimFort XT® ${t}mm`,
      shortLabel: 'SlimFort XT®',
      badgeColor: '#ca8a04',
      badgeBg: '#fef9c3',
    };
  }
  if (bt === 'aluminium') {
    return {
      systemType: 'aluminium',
      label: 'Aluminium U-profiel',
      shortLabel: 'Aluminium',
      badgeColor: '#0369a1',
      badgeBg: '#e0f2fe',
    };
  }
  if (bt === 'hout') {
    return {
      systemType: 'hout',
      label: 'Hout achterconstructie',
      shortLabel: 'Hout',
      badgeColor: '#15803d',
      badgeBg: '#dcfce7',
    };
  }
  return {
    systemType: 'unknown',
    label: 'Systeem niet ingesteld',
    shortLabel: '—',
    badgeColor: '#64748b',
    badgeBg: '#f1f5f9',
  };
}

export function buildCanonicalFacadeLayerStack(settings) {
  const bt = settings.backingType ?? 'hout';
  const sf = settings.slimFortSettings ?? {};
  const isSlimFort = isSlimFortActive(settings);
  const isAluminium = bt === 'aluminium';
  const ccs = settings.concreteCladdingSettings ?? {};

  const brickD = settings.brickDepth ?? 20;
  const panelDikte = settings.panelen?.enabled ? (settings.panelen?.dikte ?? 8) : 0;
  const color = settings.color ?? '#dc6b4a';

  const cladOutIn = [];

  cladOutIn.push({ id: 'brick', label: `Strip ${brickD}mm`, thickness: brickD, color });

  if (panelDikte > 0) {
    cladOutIn.push({ id: 'panel', label: `Paneel ${panelDikte}mm`, thickness: panelDikte, color: '#93c5fd' });
  }

  if (isSlimFort) {
    const profileDepth = sf.profileDepth ?? 63;
    const profileInsertDepth = sf.profileInsertDepth ?? 33;
    const profileExt = profileDepth - profileInsertDepth;
    if (profileExt > 0) {
      cladOutIn.push({ id: 'profile_ext', label: `Profiel ${profileExt}mm`, thickness: profileExt, color: '#9ca3af' });
    }
    const sfTotal = sf.totalThickness ?? 196;
    cladOutIn.push({ id: 'eps', label: `EPS ${sfTotal}mm`, thickness: sfTotal, color: '#fde68a' });
  } else if (isAluminium) {
    const ventGap = ccs.panelVentilationGap ?? 20;
    if (ventGap > 0) {
      cladOutIn.push({ id: 'ventilation', label: `Spouw ${ventGap}mm`, thickness: ventGap, color: '#e0f2fe' });
    }
    const aluDepth = ccs.uProfileDepth ?? 30;
    cladOutIn.push({ id: 'alu_rail', label: `Alu profiel ${aluDepth}mm`, thickness: aluDepth, color: '#94a3b8' });
    const insulD = ccs.insulationThickness ?? 0;
    if (insulD > 0) {
      cladOutIn.push({ id: 'eps', label: `Isolatie ${insulD}mm`, thickness: insulD, color: '#fde68a' });
    }
  } else {
    const latDikte = settings.latten?.enabled ? (settings.latten?.dikte ?? 28) : 0;
    if (latDikte > 0) {
      cladOutIn.push({ id: 'lat', label: `Lat ${latDikte}mm`, thickness: latDikte, color: '#c4b5fd' });
    }
  }

  const totalCladdingDepth = cladOutIn.reduce((s, l) => s + l.thickness, 0);

  return {
    claddingOnlyOutsideToInside: cladOutIn,
    claddingOnlyInsideToOutside: [...cladOutIn].reverse(),
    totalCladdingDepth,
  };
}

export function buildSystemLayers(settings) {
  return buildCanonicalFacadeLayerStack(settings).claddingOnlyOutsideToInside;
}

function buildSystemSignature(settings) {
  const bt = settings.backingType ?? 'hout';
  const sf = settings.slimFortSettings ?? {};
  const isSlimFort = isSlimFortActive(settings);
  const brickD = settings.brickDepth ?? 20;
  const panelDikte = settings.panelen?.enabled ? (settings.panelen?.dikte ?? 8) : 0;
  const latDikte = settings.latten?.enabled ? (settings.latten?.dikte ?? 28) : 0;
  const sfTotal = isSlimFort ? (sf.totalThickness ?? 196) : 0;
  const ccs = settings.concreteCladdingSettings ?? {};
  const insulD = bt === 'aluminium' ? (ccs.insulationThickness ?? 0) : 0;
  const aluDepth = bt === 'aluminium' ? (ccs.uProfileDepth ?? 30) : 0;
  return `${bt}:${settings.wallSubstrateType ?? 'beton'}:${latDikte}:${panelDikte}:${brickD}:${isSlimFort ? 1 : 0}:${sfTotal}:${insulD}:${aluDepth}`;
}

function worldCenter(wallOrigin) {
  if (!wallOrigin) return null;
  const { lengthAxis, heightAxis, thicknessAxis, lengthStart, lengthEnd, heightStart, heightEnd, thicknessStart, thicknessEnd } = wallOrigin;
  if (!lengthAxis || !heightAxis || !thicknessAxis) return null;
  return {
    [lengthAxis]: Math.round((lengthStart + lengthEnd) / 2),
    [heightAxis]: Math.round((heightStart + heightEnd) / 2),
    [thicknessAxis]: Math.round((thicknessStart + thicknessEnd) / 2),
  };
}

function makeWallRef(wall, groupId, settings, detailType) {
  return {
    expressID: wall.expressID ?? null,
    ifcGlobalId: wall.wallOrigin?.globalId ?? null,
    wallName: wall.name ?? null,
    groupId,
    wallId: wall.expressID ?? wall.id ?? null,
    openingId: null,
    worldPosition: worldCenter(wall.wallOrigin),
    localPosition: null,
    backingType: settings.backingType ?? 'hout',
    wallSubstrateType: settings.wallSubstrateType ?? 'beton',
    detailType,
  };
}

function makeOpeningRef(wall, opening, groupId, settings, detailType) {
  return {
    expressID: wall.expressID ?? null,
    ifcGlobalId: wall.wallOrigin?.globalId ?? null,
    wallName: wall.name ?? null,
    groupId,
    wallId: wall.expressID ?? wall.id ?? null,
    openingId: opening.id ?? null,
    worldPosition: worldCenter(wall.wallOrigin),
    localPosition: { x: opening.x ?? 0, y: opening.y ?? 0 },
    backingType: settings.backingType ?? 'hout',
    wallSubstrateType: settings.wallSubstrateType ?? 'beton',
    detailType,
  };
}

function addDetail(detailMap, key, detailData) {
  if (!detailMap.has(key)) {
    detailMap.set(key, { ...detailData, groupIds: [], references: [] });
  }
  return detailMap.get(key);
}

function systemTitle(baseTitle, sysInfo) {
  return `${baseTitle} — ${sysInfo.shortLabel}`;
}

export function generateProjectDetailBook({ groups, walls, getSettings, allPatterns }) {
  const detailMap = new Map();
  const groupIndex = [];

  const wallById = Object.fromEntries((walls ?? []).map((w) => [w.expressID ?? w.id, w]));

  for (const group of (groups ?? [])) {
    const settings = getSettings(group.id) ?? {};
    const pattern = allPatterns?.[group.id];
    const groupWalls = (group.wallIds ?? []).map((id) => wallById[id]).filter(Boolean);
    const groupKeys = new Set();
    const layers = buildSystemLayers(settings);
    const sysSig = buildSystemSignature(settings);
    const substrate = settings.wallSubstrateType ?? 'beton';
    const sysInfo = getSystemInfo(settings);
    const isSlimFort = sysInfo.systemType === 'slimfort';
    const sf = settings.slimFortSettings ?? {};
    const hasPanels = settings.panelen?.enabled ?? false;
    const hasOpeningsInGroup = groupWalls.some((w) => (w.openings ?? []).length > 0);
    const hasReturnWalls = (pattern?.wallDecomposition?.returnWalls ?? []).length > 0;

    const common = { layers, settings, substrate, systemType: sysInfo.systemType };

    const svKey = `SYS_V:${sysSig}`;
    const svD = addDetail(detailMap, svKey, { type: DETAIL_TYPES.SYSTEM_VERTICAL, tab: 'systemen', title: systemTitle('Systeemdoorsnede — Verticaal', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
    svD.groupIds.push(group.id);
    groupKeys.add(svKey);
    for (const w of groupWalls) svD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.SYSTEM_VERTICAL));

    const shKey = `SYS_H:${sysSig}`;
    const shD = addDetail(detailMap, shKey, { type: DETAIL_TYPES.SYSTEM_HORIZONTAL, tab: 'systemen', title: systemTitle('Systeemdoorsnede — Horizontaal', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
    shD.groupIds.push(group.id);
    groupKeys.add(shKey);
    for (const w of groupWalls) shD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.SYSTEM_HORIZONTAL));

    if (hasOpeningsInGroup) {
      const ohKey = `OPE_H:${sysSig}`;
      const ohD = addDetail(detailMap, ohKey, { type: DETAIL_TYPES.OPENING_HEADER, tab: 'openingen', title: systemTitle('Opening — Lintelbalk (boven)', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
      ohD.groupIds.push(group.id);
      groupKeys.add(ohKey);
      for (const w of groupWalls) for (const op of (w.openings ?? [])) ohD.references.push(makeOpeningRef(w, op, group.id, settings, DETAIL_TYPES.OPENING_HEADER));

      const osKey = `OPE_S:${sysSig}`;
      const osD = addDetail(detailMap, osKey, { type: DETAIL_TYPES.OPENING_SILL, tab: 'openingen', title: systemTitle('Opening — Dorpel (onder)', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
      osD.groupIds.push(group.id);
      groupKeys.add(osKey);
      for (const w of groupWalls) for (const op of (w.openings ?? [])) osD.references.push(makeOpeningRef(w, op, group.id, settings, DETAIL_TYPES.OPENING_SILL));

      const ojKey = `OPE_J:${sysSig}`;
      const ojD = addDetail(detailMap, ojKey, { type: DETAIL_TYPES.OPENING_JAMB, tab: 'openingen', title: systemTitle('Opening — Dagkant', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
      ojD.groupIds.push(group.id);
      groupKeys.add(ojKey);
      for (const w of groupWalls) for (const op of (w.openings ?? [])) ojD.references.push(makeOpeningRef(w, op, group.id, settings, DETAIL_TYPES.OPENING_JAMB));
    }

    const coKey = `HOE_O:${sysSig}`;
    const coD = addDetail(detailMap, coKey, { type: DETAIL_TYPES.CORNER_OUTSIDE, tab: 'hoeken', title: systemTitle('Hoek — Buitenhoek', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
    coD.groupIds.push(group.id);
    groupKeys.add(coKey);
    for (const w of groupWalls) coD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.CORNER_OUTSIDE));

    if (hasReturnWalls) {
      const crKey = `HOE_R:${sysSig}`;
      const crD = addDetail(detailMap, crKey, { type: DETAIL_TYPES.CORNER_RETURN, tab: 'hoeken', title: systemTitle('Hoek — Teruggevel', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
      crD.groupIds.push(group.id);
      groupKeys.add(crKey);
      for (const w of groupWalls) crD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.CORNER_RETURN));
    }

    const maKey = `MAA:${sysSig}`;
    const maD = addDetail(detailMap, maKey, { type: DETAIL_TYPES.GROUND_BASE, tab: 'maaiveld', title: systemTitle('Maaiveld — Begindeel', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
    maD.groupIds.push(group.id);
    groupKeys.add(maKey);
    for (const w of groupWalls) maD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.GROUND_BASE));

    const dakKey = `DAK:${sysSig}`;
    const dakD = addDetail(detailMap, dakKey, { type: DETAIL_TYPES.TOP_PARAPET, tab: 'bovenzijde', title: systemTitle('Bovenzijde — Eindstuk / Dakrand', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
    dakD.groupIds.push(group.id);
    groupKeys.add(dakKey);
    for (const w of groupWalls) dakD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.TOP_PARAPET));

    if (hasPanels) {
      const pvKey = `PAN_V:${sysSig}`;
      const pvD = addDetail(detailMap, pvKey, { type: DETAIL_TYPES.PANEL_JOINT_V, tab: 'panelen', title: systemTitle('Paneelvoeg — Vertikaal', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
      pvD.groupIds.push(group.id);
      groupKeys.add(pvKey);
      for (const w of groupWalls) pvD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.PANEL_JOINT_V));

      const phKey = `PAN_H:${sysSig}`;
      const phD = addDetail(detailMap, phKey, { type: DETAIL_TYPES.PANEL_JOINT_H, tab: 'panelen', title: systemTitle('Paneelvoeg — Horizontaal', sysInfo), subtitle: `${sysInfo.shortLabel} / ${substrate}`, ...common });
      phD.groupIds.push(group.id);
      groupKeys.add(phKey);
      for (const w of groupWalls) phD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.PANEL_JOINT_H));
    }

    if (isSlimFort) {
      const sfEpsKey = `SLF_EPS:${sysSig}`;
      const sfEpsD = addDetail(detailMap, sfEpsKey, { type: DETAIL_TYPES.SLIMFORT_EPS, tab: 'slimfort', title: 'SlimFort XT® — EPS-element', subtitle: `${sf.totalThickness ?? 196}mm`, ...common });
      sfEpsD.groupIds.push(group.id);
      groupKeys.add(sfEpsKey);
      for (const w of groupWalls) sfEpsD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.SLIMFORT_EPS));

      const sfBrkKey = `SLF_BRK:${sysSig}`;
      const sfBrkD = addDetail(detailMap, sfBrkKey, { type: DETAIL_TYPES.SLIMFORT_BRACKET, tab: 'slimfort', title: 'SlimFort XT® — Bevestigingsbeugel', subtitle: `${sf.bracketDepth ?? 50}mm diep`, ...common });
      sfBrkD.groupIds.push(group.id);
      groupKeys.add(sfBrkKey);
      for (const w of groupWalls) sfBrkD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.SLIMFORT_BRACKET));

      const sfPrfKey = `SLF_PRF:${sysSig}`;
      const sfPrfD = addDetail(detailMap, sfPrfKey, { type: DETAIL_TYPES.SLIMFORT_PROFILE, tab: 'slimfort', title: 'SlimFort XT® — Verbindingsprofiel', subtitle: `${sf.profileDepth ?? 63}mm diep`, ...common });
      sfPrfD.groupIds.push(group.id);
      groupKeys.add(sfPrfKey);
      for (const w of groupWalls) sfPrfD.references.push(makeWallRef(w, group.id, settings, DETAIL_TYPES.SLIMFORT_PROFILE));
    }

    groupIndex.push({
      groupId: group.id,
      groupName: settings.name ?? group.id,
      systemType: sysInfo.systemType,
      systemLabel: sysInfo.label,
      detailKeys: [...groupKeys],
    });
  }

  const prefixCounts = {};
  const details = [];
  const keyToId = new Map();

  for (const [key, detail] of detailMap) {
    const prefix = DETAIL_PREFIX[detail.type] ?? 'DET';
    prefixCounts[prefix] = (prefixCounts[prefix] ?? 0) + 1;
    const id = `${prefix}-${String(prefixCounts[prefix]).padStart(3, '0')}`;
    const finalDetail = { ...detail, id, key };
    details.push(finalDetail);
    keyToId.set(key, id);
  }

  return { details, groupIndex, keyToId };
}
