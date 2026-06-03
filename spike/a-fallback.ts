// SPIKE Step 5 — fallback: leid openingen PER WAND af uit A's ECHTE (OpenCASCADE-
// gesneden) wandmesh, zonder cross-wand coplanar-merge. Hergebruikt A's eigen
// detectWallPlanes door het per wand (één expressId) te draaien. Throwaway.
import { importIfc } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/import/ifcImporter.js";
import { runNormalizePipeline } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/normalize/pipeline.js";
import { buildLoadedIfcModel } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/project/projectManager.js";
import { detectWallPlanes } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/geometry/detectWallPlanes.js";
import { DEFAULT_TOPOLOGY_CONFIG } from "../../stap-1-maak-eerst-een-vast-proje-62cf/src/types/topology.js";
import * as WebIFC from "web-ifc";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

export async function run(modelPath: string, outPath: string): Promise<void> {
  const origDebug = console.debug; console.debug = () => {};
  const buf = readFileSync(modelPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const file = { name: basename(modelPath), arrayBuffer: async () => ab } as unknown as File;

  const ifcApi = new WebIFC.IfcAPI();
  await ifcApi.Init();
  const rawModel = await importIfc(file, ifcApi);
  const normalized = runNormalizePipeline({
    rawMeshes: rawModel.meshes, sourceFile: rawModel.sourceFile,
    unitScale: rawModel.unitScale, forceOrientation: "AUTO",
  });
  const model = buildLoadedIfcModel(rawModel, normalized);

  // groepeer normalized meshes per expressId (= per wand-element)
  const byExpress = new Map<number, any[]>();
  for (const m of normalized.meshes) {
    if (!byExpress.has(m.expressId)) byExpress.set(m.expressId, []);
    byExpress.get(m.expressId)!.push(m);
  }

  const wallsOut: any[] = [];
  let wallsWithOpenings = 0, totalOpenings = 0, topoWalls = 0, fallbackWalls = 0;

  for (const [expressId, meshes] of byExpress) {
    const subModel = { ...model, normalizedModel: { ...normalized, meshes } };
    let planes: any[] = [];
    try { planes = detectWallPlanes(subModel as any, DEFAULT_TOPOLOGY_CONFIG); } catch { planes = []; }
    if (!planes.length) continue;
    // kies de grootste plane als de facade-face van deze wand
    planes.sort((a, b) => b.areaM2 - a.areaM2);
    const face = planes[0];
    const isTopo = face.boundarySource === "topology";
    if (isTopo) topoWalls++; else fallbackWalls++;
    const openings = face.openings.map((o: any) => ({
      type: o.type, areaM2: r(o.areaM2),
      bottomHeightM: r(o.bottomHeightM), topHeightM: r(o.topHeightM),
      isFullHeight: o.isFullHeight,
      // wand-lokale rechthoek (mm) in plane-frame: u=lengte, v=hoogte
      uvBounds: uvBounds(o.boundary2D.points),
      pts: o.boundary2D.points.length,
    }));
    if (openings.length) wallsWithOpenings++;
    totalOpenings += openings.length;
    wallsOut.push({
      expressId,
      meshCount: meshes.length,
      boundarySource: face.boundarySource,
      faceWidthM: r(face.widthM), faceHeightM: r(face.heightM), faceAreaM2: r(face.areaM2),
      planeCount: planes.length,
      openings,
    });
  }

  const out = {
    model: file.name,
    method: "per-wall detectWallPlanes (no cross-wall merge)",
    counts: {
      wallElements: byExpress.size,
      wallsWithFace: wallsOut.length,
      wallsTopology: topoWalls, wallsFallbackBbox: fallbackWalls,
      wallsWithOpenings, totalOpenings,
    },
    walls: wallsOut,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.debug = origDebug;
  console.log(`[A-fallback] OK → ${outPath} | wallElements=${out.counts.wallElements} wallsWithOpenings=${wallsWithOpenings} totalOpenings=${totalOpenings} topo=${topoWalls} fallbackBbox=${fallbackWalls}`);
}

function r(n: number) { return typeof n === "number" ? Math.round(n * 1000) / 1000 : n; }
function uvBounds(pts: any[]) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of pts) { if (p.u < minU) minU = p.u; if (p.u > maxU) maxU = p.u; if (p.v < minV) minV = p.v; if (p.v > maxV) maxV = p.v; }
  return { wMm: Math.round((maxU - minU) * 1000), hMm: Math.round((maxV - minV) * 1000), uMm: Math.round(minU * 1000), vMm: Math.round(minV * 1000) };
}
