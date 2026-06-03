// SPIKE harness — throwaway. Draait App A's ECHTE pipeline headless.
// Geen wijziging aan A of B. Importeert A's src direct (read-only).
// A_SRC = sibling worktree.
import { importIfc } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/import/ifcImporter.js";
import { runNormalizePipeline } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/normalize/pipeline.js";
import { buildLoadedIfcModel } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/project/projectManager.js";
import { detectAllWallPlanes } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/geometry/detectWallPlanes.js";
import { buildTopologyGraph } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/geometry/buildTopologyGraph.js";
import { DEFAULT_TOPOLOGY_CONFIG } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/types/topology.js";
import * as WebIFC from "web-ifc";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

export async function run(modelPath: string, outPath: string): Promise<void> {
  const buf = readFileSync(modelPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const file = {
    name: basename(modelPath),
    arrayBuffer: async () => ab,
  } as unknown as File;

  const ifcApi = new WebIFC.IfcAPI();
  // node build laadt wasm naast de module; geen SetWasmPath nodig
  await ifcApi.Init();

  const t0 = Date.now();
  const rawModel = await importIfc(file, ifcApi);
  const tImport = Date.now() - t0;

  const normalized = runNormalizePipeline({
    rawMeshes: rawModel.meshes,
    sourceFile: rawModel.sourceFile,
    unitScale: rawModel.unitScale,
    forceOrientation: "AUTO",
  });
  const model = buildLoadedIfcModel(rawModel, normalized);

  const t1 = Date.now();
  const planes = detectAllWallPlanes([model], DEFAULT_TOPOLOGY_CONFIG);
  const graph = buildTopologyGraph(planes, "spike", DEFAULT_TOPOLOGY_CONFIG);
  const tTopo = Date.now() - t1;

  // Compacte dump: planes + openings in contract-achtige termen.
  const planeDump = graph.planes.map((p: any) => ({
    planeId: p.planeId,
    boundarySource: p.boundarySource,
    worldNormal: p.worldNormal,
    areaM2: round(p.areaM2),
    widthM: round(p.widthM),
    heightM: round(p.heightM),
    bbox: roundBox(p.bbox),
    sourceTriangleCount: p.sourceTriangleCount,
    sourceMeshIds: p.sourceMeshIds,
    holeCount: p.holes.length,
    semantic: p.semanticHint ? {
      name: p.semanticHint.elementName,
      objectType: p.semanticHint.objectType,
      confidence: p.semanticHint.semanticConfidence,
      source: p.semanticHint.semanticSource,
    } : null,
    openings: p.openings.map((o: any) => ({
      openingId: o.openingId,
      type: o.type,
      areaM2: round(o.areaM2),
      bottomHeightM: round(o.bottomHeightM),
      topHeightM: round(o.topHeightM),
      isFullHeight: o.isFullHeight,
      // 2D-contour in plane-local frame (u=horizontaal langs gevel, v=hoogte) in meters
      boundary2D: o.boundary2D.points.map((pt: any) => ({ u: round(pt.u), v: round(pt.v) })),
    })),
    // express-ids van de bronwanden (via meshId→expressId)
    sourceExpressIds: [...new Set(p.sourceMeshIds.map((mid: number) => meshExpress(rawModel, normalized, mid)).filter((x: any) => x != null))],
  }));

  const out = {
    model: file.name,
    timings: { importMs: tImport, topoMs: tTopo },
    counts: {
      rawMeshes: rawModel.meshes.length,
      normalizedMeshes: normalized.meshes.length,
      planes: graph.planes.length,
      planesTopology: graph.planes.filter((p: any) => p.boundarySource === "topology").length,
      planesFallbackBbox: graph.planes.filter((p: any) => p.boundarySource === "fallback-bbox").length,
      facadeGroups: graph.facadeGroups.length,
      totalOpenings: graph.planes.reduce((s: number, p: any) => s + p.openings.length, 0),
      totalHoles: graph.planes.reduce((s: number, p: any) => s + p.holes.length, 0),
    },
    orientation: {
      detectedUpAxis: normalized.orientationMetadata.detectedUpAxis,
      appliedRotation: normalized.orientationMetadata.appliedRotation,
      confidence: normalized.orientationMetadata.confidence,
    },
    boundingBoxM: roundBox(normalized.boundingBox as any),
    facadeGroups: graph.facadeGroups.map((g: any) => ({
      groupId: g.groupId, name: g.name, groupType: g.groupType,
      orientationLabel: g.orientationLabel, faceCount: g.faceIds.length,
      totalAreaM2: round(g.totalAreaM2), openingCount: g.openingCount,
      confidence: g.confidence,
    })),
    planes: planeDump,
  };

  writeFileSync(outPath, JSON.stringify(out, null, 2));
  ifcApi.CloseModel(0);
  console.log(`[A-harness] OK → ${outPath} | planes=${out.counts.planes} openings=${out.counts.totalOpenings} groups=${out.counts.facadeGroups}`);
}

function round(n: number): number { return typeof n === "number" ? Math.round(n * 1000) / 1000 : n; }
function roundBox(b: any) {
  return { min: vround(b.min), max: vround(b.max), center: vround(b.center) };
}
function vround(v: any) { return { x: round(v.x), y: round(v.y), z: round(v.z) }; }

// mesh.id → expressId map opbouwen uit normalized meshes
let _m2e: Map<number, number> | null = null;
function meshExpress(_raw: any, normalized: any, meshId: number): number | null {
  if (!_m2e) {
    _m2e = new Map();
    for (const m of normalized.meshes) _m2e.set(m.id, m.expressId);
  }
  return _m2e.get(meshId) ?? null;
}

// (CLI entry zit in run-a.mjs — geen auto-exec hier om dubbele run te voorkomen)
