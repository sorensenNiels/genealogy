import { readFile } from "node:fs/promises";

/**
 * The tree viewer bundle and the site stylesheet, built by this package's
 * `vite build` into `dist/viewer/` (see vite.config.ts) — the files every
 * export ships under `assets/`. Read from beside this module, so it works
 * wherever the package is installed. Throws if the package hasn't been
 * built, which `pnpm build`/`pnpm dev` always do first.
 */
export async function readViewerAssets(): Promise<Map<string, Uint8Array>> {
  const [script, styles] = await Promise.all([readBuilt("tree.js"), readBuilt("site.css")]);
  return new Map([
    ["assets/tree.js", script],
    ["assets/site.css", styles],
  ]);
}

function readBuilt(name: string): Promise<Uint8Array> {
  return readFile(new URL(`./viewer/${name}`, import.meta.url));
}
