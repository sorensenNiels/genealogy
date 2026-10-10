import { defineConfig } from "vite";

/**
 * The tree viewer: `src/viewer/main.ts` (the shared chart from
 * @genealogy/tree-chart, plus a little glue) bundled into one classic
 * script, `dist/viewer/tree.js`, and the site's stylesheet into
 * `dist/viewer/site.css`. Classic (IIFE) rather than an ES module because
 * browsers refuse module scripts from `file://`, and the site has to open
 * straight from the unzipped folder. `buildSite`'s caller copies both into
 * every export (see `readViewerAssets`).
 */
export default defineConfig({
  build: {
    outDir: "dist/viewer",
    emptyOutDir: true,
    lib: {
      entry: "src/viewer/main.ts",
      formats: ["iife"],
      name: "FamilyTreeViewer",
      fileName: () => "tree.js",
      cssFileName: "site",
    },
  },
});
