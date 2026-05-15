const EPS_DENSITY_KG_M3 = 25;
const MAX_PANEL_WEIGHT_KG = 46;
const MAX_PROFILE_TRANSPORT_MM = 6000;
const MIN_PROFILE_SEGMENT_MM = 300;
const SHEET_WIDTH_MM = 3005;
const SHEET_HEIGHT_MM = 1200;
const MIN_PANEL_DIM_MM = 50;

function panelTypeCode(faceType, isClipped, col, row, numCols, numRows) {
  if (faceType === 'portal-left' || faceType === 'portal-right') return 'portal';
  if (faceType === 'side-left' || faceType === 'side-right') return 'return';
  if (isClipped) return 'clipped';
  if (col === 0 && row === 0) return 'start';
  if (col === numCols - 1 || row === numRows - 1) return 'end';
  return 'standard';
}

export function extractProductionPanels(slimFortFaces, cornerOwnershipMap = {}, sequenceStart = 1) {
  const panels = [];
  let seq = sequenceStart;

  const secondaryFaceIds = new Set(
    Object.values(cornerOwnershipMap).map((c) => c.secondaryFaceId)
  );

  const PORTAL_FACE_TYPES = new Set(['portal-left', 'portal-right', 'portalLeft', 'portalRight', 'portal']);

  for (const face of slimFortFaces) {
    if (PORTAL_FACE_TYPES.has(face.faceType)) continue;
    const grid = face.grid;
    if (!grid?.epsElements) continue;

    const { epsElements, numCols, numRows, settings } = grid;
    const sfSettings = settings ?? {};
    const orientation = sfSettings.orientation ?? 'horizontal';
    const cellW = orientation === 'horizontal' ? (sfSettings.elementLength ?? 1200) : (sfSettings.elementHeight ?? 600);
    const cellH = orientation === 'horizontal' ? (sfSettings.elementHeight ?? 600) : (sfSettings.elementLength ?? 1200);
    const thickness = sfSettings.totalThickness ?? 196;
    const isSecondary = secondaryFaceIds.has(face.faceId);

    for (const eps of epsElements) {
      const w = eps.width;
      const h = eps.height;
      if (w < MIN_PANEL_DIM_MM || h < MIN_PANEL_DIM_MM) continue;

      const isFullW = Math.abs(w - cellW) < 5;
      const isFullH = Math.abs(h - cellH) < 5;
      const isClipped = eps.clipped ?? (!isFullW || !isFullH);

      const pType = panelTypeCode(
        face.faceType, isClipped,
        eps.col ?? 0, eps.row ?? 0,
        numCols ?? 1, numRows ?? 1
      );

      const volM3 = (w / 1000) * (h / 1000) * (thickness / 1000);
      const weight = Math.round(volM3 * EPS_DENSITY_KG_M3 * 10) / 10;

      panels.push({
        panelId: `P${String(seq).padStart(4, '0')}`,
        faceId: face.faceId,
        faceType: face.faceType,
        wallId: face.wallId ?? null,
        panelType: pType,
        col: eps.col ?? 0,
        row: eps.row ?? 0,
        x: eps.x,
        y: eps.y,
        width: w,
        height: h,
        cutWidth: Math.round(w),
        cutHeight: Math.round(h),
        isFullSize: isFullW && isFullH && !eps.clipped,
        isClipped,
        isSecondaryFace: isSecondary,
        orientation: eps.orientation ?? orientation,
        sourceEpsId: eps.id,
        cornerOffset: face.cornerOffset ?? 0,
        thickness,
        weight,
        splitFrom: null,
        sheetId: null,
        sheetX: null,
        sheetY: null,
      });
      seq++;
    }
  }

  return panels;
}

export function validatePanelWeights(panels, settings = {}) {
  const maxWeight = settings.maxPanelWeightKg ?? MAX_PANEL_WEIGHT_KG;
  const density = settings.epsDensityKgM3 ?? EPS_DENSITY_KG_M3;
  const validated = [];
  const overweightOriginals = [];

  for (const panel of panels) {
    const thickness = panel.thickness ?? (settings.totalThickness ?? 196);
    const volM3 = (panel.width / 1000) * (panel.height / 1000) * (thickness / 1000);
    const weight = Math.round(volM3 * density * 10) / 10;

    if (weight <= maxWeight) {
      validated.push({ ...panel, weight });
    } else {
      overweightOriginals.push(panel);
      const maxH = (maxWeight / (density * (panel.width / 1000) * (thickness / 1000))) * 1000;
      const numParts = Math.ceil(panel.height / maxH);
      const partH = panel.height / numParts;
      for (let i = 0; i < numParts; i++) {
        const partVol = (panel.width / 1000) * (partH / 1000) * (thickness / 1000);
        const partWeight = Math.round(partVol * density * 10) / 10;
        validated.push({
          ...panel,
          panelId: `${panel.panelId}-S${i + 1}`,
          y: panel.y + i * partH,
          height: partH,
          cutHeight: Math.round(partH),
          weight: partWeight,
          splitFrom: panel.panelId,
        });
      }
    }
  }

  return { panels: validated, overweightOriginals };
}

export function segmentProfiles(slimFortFaces, settings = {}) {
  const maxLen = settings.maxProfileTransportMm ?? MAX_PROFILE_TRANSPORT_MM;
  const minSeg = settings.minProfileSegmentMm ?? MIN_PROFILE_SEGMENT_MM;
  const segments = [];
  let segSeq = 1;

  const PORTAL_FACE_TYPES_SEG = new Set(['portal-left', 'portal-right', 'portalLeft', 'portalRight', 'portal']);

  for (const face of slimFortFaces) {
    if (PORTAL_FACE_TYPES_SEG.has(face.faceType)) continue;
    const profiles = face.grid?.profiles ?? [];

    for (const prof of profiles) {
      const mainDim = prof.richting === 'horizontaal' ? prof.width : prof.height;
      const segSourceKey = `${face.faceId}-${prof.richting}-${prof.x}-${prof.y}`;

      if (mainDim <= maxLen) {
        segments.push({
          segmentId: `PS${String(segSeq++).padStart(4, '0')}`,
          faceId: face.faceId,
          wallId: face.wallId ?? null,
          faceType: face.faceType,
          richting: prof.richting,
          x: prof.x,
          y: prof.y,
          width: prof.width,
          height: prof.height,
          depth: prof.depth,
          length: mainDim,
          segmentOf: null,
          transportLength: mainDim,
        });
      } else {
        const numSegs = Math.ceil(mainDim / maxLen);
        const segLen = mainDim / numSegs;
        if (segLen < minSeg) continue;
        for (let i = 0; i < numSegs; i++) {
          const offset = i * segLen;
          segments.push({
            segmentId: `PS${String(segSeq++).padStart(4, '0')}`,
            faceId: face.faceId,
            wallId: face.wallId ?? null,
            faceType: face.faceType,
            richting: prof.richting,
            x: prof.richting === 'horizontaal' ? prof.x + offset : prof.x,
            y: prof.richting === 'verticaal' ? prof.y + offset : prof.y,
            width: prof.richting === 'horizontaal' ? segLen : prof.width,
            height: prof.richting === 'verticaal' ? segLen : prof.height,
            depth: prof.depth,
            length: segLen,
            segmentOf: segSourceKey,
            segmentIndex: i,
            transportLength: segLen,
          });
        }
      }
    }
  }

  return segments;
}

function guillotinePack(panels, sheetW, sheetH) {
  const sheets = [];
  const assignments = [];

  const sorted = [...panels].sort((a, b) => (b.cutWidth * b.cutHeight) - (a.cutWidth * a.cutHeight));

  for (const panel of sorted) {
    const pw = panel.cutWidth;
    const ph = panel.cutHeight;
    if (pw > sheetW || ph > sheetH) {
      if (ph <= sheetW && pw <= sheetH) {
        assignments.push({ panelId: panel.panelId, sheetId: null, sheetX: null, sheetY: null, rotated: true, unplaceable: true });
      } else {
        assignments.push({ panelId: panel.panelId, sheetId: null, sheetX: null, sheetY: null, unplaceable: true });
      }
      continue;
    }

    let placed = false;
    for (const sheet of sheets) {
      const pos = findFreeSpace(sheet.freeRects, pw, ph);
      if (pos) {
        assignments.push({ panelId: panel.panelId, sheetId: sheet.sheetId, sheetX: pos.x, sheetY: pos.y, rotated: false });
        splitFreeRect(sheet.freeRects, pos, pw, ph);
        sheet.usedArea += pw * ph;
        placed = true;
        break;
      }
      const posR = findFreeSpace(sheet.freeRects, ph, pw);
      if (posR) {
        assignments.push({ panelId: panel.panelId, sheetId: sheet.sheetId, sheetX: posR.x, sheetY: posR.y, rotated: true });
        splitFreeRect(sheet.freeRects, posR, ph, pw);
        sheet.usedArea += pw * ph;
        placed = true;
        break;
      }
    }

    if (!placed) {
      const sheetId = `S${String(sheets.length + 1).padStart(3, '0')}`;
      const newSheet = {
        sheetId,
        width: sheetW,
        height: sheetH,
        freeRects: [{ x: 0, y: 0, w: sheetW, h: sheetH }],
        usedArea: pw * ph,
      };
      const pos = findFreeSpace(newSheet.freeRects, pw, ph);
      splitFreeRect(newSheet.freeRects, pos, pw, ph);
      assignments.push({ panelId: panel.panelId, sheetId, sheetX: pos.x, sheetY: pos.y, rotated: false });
      sheets.push(newSheet);
    }
  }

  const totalSheetArea = sheets.length * sheetW * sheetH;
  const totalPanelArea = panels.reduce((s, p) => s + p.cutWidth * p.cutHeight, 0);
  const wastePercent = totalSheetArea > 0 ? Math.round((1 - totalPanelArea / totalSheetArea) * 1000) / 10 : 0;

  return {
    sheets: sheets.map(({ freeRects: _f, ...s }) => s),
    assignments,
    totalSheets: sheets.length,
    totalPanelArea,
    totalSheetArea,
    wastePercent,
  };
}

function findFreeSpace(freeRects, pw, ph) {
  let best = null;
  let bestScore = Infinity;
  for (const r of freeRects) {
    if (r.w >= pw && r.h >= ph) {
      const score = Math.min(r.w - pw, r.h - ph);
      if (score < bestScore) { bestScore = score; best = r; }
    }
  }
  return best;
}

function splitFreeRect(freeRects, rect, pw, ph) {
  const idx = freeRects.indexOf(rect);
  if (idx < 0) return;
  freeRects.splice(idx, 1);
  if (rect.w - pw > 0) {
    freeRects.push({ x: rect.x + pw, y: rect.y, w: rect.w - pw, h: ph });
  }
  if (rect.h - ph > 0) {
    freeRects.push({ x: rect.x, y: rect.y + ph, w: rect.w, h: rect.h - ph });
  }
}

export function optimizeSheetCutting(panels, settings = {}) {
  const sheetW = settings.sheetWidthMm ?? SHEET_WIDTH_MM;
  const sheetH = settings.sheetHeightMm ?? SHEET_HEIGHT_MM;

  const panelsOnly = panels.filter((p) => !p.unplaceable);
  if (!panelsOnly.length) return { sheets: [], assignments: [], totalSheets: 0, totalPanelArea: 0, totalSheetArea: 0, wastePercent: 0 };

  return guillotinePack(panelsOnly, sheetW, sheetH);
}

export function computeProductionData(stitchingResult, settings = {}) {
  if (!stitchingResult) return null;

  const { faces, cornerOwnership } = stitchingResult;

  const rawPanels = extractProductionPanels(faces, cornerOwnership ?? {});
  const { panels, overweightOriginals } = validatePanelWeights(rawPanels, settings);
  const profileSegments = segmentProfiles(faces, settings);
  const sheetPlan = optimizeSheetCutting(panels, settings);

  const assignMap = Object.fromEntries((sheetPlan.assignments ?? []).map((a) => [a.panelId, a]));
  const panelsWithSheets = panels.map((p) => {
    const a = assignMap[p.panelId];
    if (!a) return p;
    return { ...p, sheetId: a.sheetId ?? null, sheetX: a.sheetX ?? null, sheetY: a.sheetY ?? null, sheetRotated: a.rotated ?? false };
  });

  const byType = {};
  for (const p of panelsWithSheets) {
    byType[p.panelType] = (byType[p.panelType] ?? 0) + 1;
  }

  return {
    panels: panelsWithSheets,
    profileSegments,
    sheetPlan,
    overweightOriginals,
    summary: {
      totalPanels: panelsWithSheets.length,
      totalSheets: sheetPlan.totalSheets,
      wastePercent: sheetPlan.wastePercent,
      profileSegmentCount: profileSegments.length,
      overweightSplitCount: overweightOriginals.length,
      panelsByType: byType,
    },
  };
}
