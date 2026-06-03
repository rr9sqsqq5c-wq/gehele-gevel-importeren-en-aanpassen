// SPIKE runner — bundelt a-harness.ts met esbuild (uit A's node_modules) en draait het.
// Throwaway. Wijzigt niets aan A of B.
import { createRequire } from "node:module";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const A_ROOT = resolve(__dirname, "../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A_ROOT + "/package.json"));
const esbuild = require("esbuild");

const WEBIFC_DIR = resolve(A_ROOT, "node_modules/web-ifc");
const WEBIFC_NODE = resolve(WEBIFC_DIR, "web-ifc-api-node.js");

// Plugin: TS NodeNext gebruikt ".js" specifiers die naar ".ts" bestanden wijzen.
const jsToTs = {
  name: "js-to-ts",
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.path.startsWith(".")) return;
      const tsPath = resolve(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
      if (existsSync(tsPath)) return { path: tsPath };
      return;
    });
  },
};

const buildDir = resolve(__dirname, "build");
mkdirSync(buildDir, { recursive: true });
const outfile = resolve(buildDir, "a-bundle.cjs");

await esbuild.build({
  entryPoints: [resolve(__dirname, "a-harness.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile,
  alias: { "web-ifc": WEBIFC_NODE },
  plugins: [jsToTs],
  logLevel: "warning",
});

// web-ifc node laadt wasm naast __dirname (= build/). Kopieer de wasm-bestanden ernaast.
for (const w of ["web-ifc-node.wasm", "web-ifc.wasm", "web-ifc-mt.wasm"]) {
  const src = resolve(WEBIFC_DIR, w);
  if (existsSync(src)) copyFileSync(src, resolve(buildDir, w));
}

const model = process.argv[2];
const out = process.argv[3] ?? resolve(__dirname, "out/model.A.json");
if (!model) { console.error("usage: node run-a.mjs <model.ifc> [out.json]"); process.exit(1); }

const mod = require(outfile);
await mod.run(model, out);
