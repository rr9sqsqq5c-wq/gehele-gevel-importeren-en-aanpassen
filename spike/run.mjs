// Generic SPIKE runner: node run.mjs <entry.ts> <model.ifc> <out.json>
import { createRequire } from "node:module";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const A_ROOT = resolve(__dirname, "../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A_ROOT + "/package.json"));
const esbuild = require("esbuild");
const WEBIFC_DIR = resolve(A_ROOT, "node_modules/web-ifc");

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

const [entry, model, out] = process.argv.slice(2);
if (!entry || !model || !out) { console.error("usage: node run.mjs <entry.ts> <model.ifc> <out.json>"); process.exit(1); }

const buildDir = resolve(__dirname, "build");
mkdirSync(buildDir, { recursive: true });
const outfile = resolve(buildDir, basename(entry).replace(/\.ts$/, ".cjs"));

await esbuild.build({
  entryPoints: [resolve(__dirname, entry)],
  bundle: true, platform: "node", format: "cjs", target: "node20", outfile,
  alias: { "web-ifc": resolve(WEBIFC_DIR, "web-ifc-api-node.js") },
  plugins: [jsToTs], logLevel: "warning",
});
for (const w of ["web-ifc-node.wasm", "web-ifc.wasm", "web-ifc-mt.wasm"]) {
  const src = resolve(WEBIFC_DIR, w);
  if (existsSync(src)) copyFileSync(src, resolve(buildDir, w));
}
const mod = require(outfile);
await mod.run(model, out);
