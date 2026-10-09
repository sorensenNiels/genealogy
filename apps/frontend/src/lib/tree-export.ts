/**
 * Exporting the tree chart as a file — SVG, PNG or PDF of the whole chart,
 * not just what's on screen. Browser-only (DOM, canvas); called from a
 * click handler, never during SSR.
 *
 * The chart's look comes from CSS classes and theme tokens in styles.css,
 * which a standalone file doesn't have, so `standaloneSvg` copies each
 * element's computed style onto it inline. Photos are fetched and embedded
 * as data URLs: an SVG must be self-contained to be useful as a file, and a
 * canvas with an external image is "tainted" and refuses to export a PNG.
 * The export uses the theme on screen (a dark export comes out dark).
 */

export type TreeExportFormat = "svg" | "png" | "pdf";

/** The CSS properties that carry the cards' and lines' look. */
const INLINED_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "display",
  "visibility",
  "filter",
  "font-family",
  "font-size",
  "font-weight",
  "font-variant-numeric",
] as const;

/** Browsers cap canvas size (Chrome ~16k px a side, ~268M px total); a big tree is scaled down to fit. */
const MAX_CANVAS_SIDE = 16_000;
const MAX_CANVAS_AREA = 120_000_000;
/** Sharper than screen resolution, for printing. */
const PNG_SCALE = 2;

export interface ChartSnapshot {
  /** The svg topola draws into — its children are the chart. */
  chart: SVGSVGElement;
  /** Clip paths the cards reference by id. */
  defs: SVGDefsElement;
  width: number;
  height: number;
  /** The canvas colour behind the chart. */
  background: string;
}

/** A self-contained SVG document of the chart: inlined styles, embedded photos, no "+" buttons. */
export async function standaloneSvg(snapshot: ChartSnapshot): Promise<string> {
  const { chart, defs, width, height, background } = snapshot;
  const svgNs = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(svgNs, "svg");
  root.setAttribute("xmlns", svgNs);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const backdrop = document.createElementNS(svgNs, "rect");
  backdrop.setAttribute("width", "100%");
  backdrop.setAttribute("height", "100%");
  backdrop.setAttribute("fill", background);
  root.append(backdrop, defs.cloneNode(true));

  for (const child of chart.children) {
    const copy = child.cloneNode(true) as Element;
    inlineStyles(child, copy);
    root.append(copy);
  }

  await Promise.all([...root.querySelectorAll("image")].map(embedImage));
  return new XMLSerializer().serializeToString(root);
}

/**
 * Copies computed styles from `source` onto `target`, walking both trees in
 * step (they're clones, so the same shape). Drops the cards' "+" buttons on
 * the way — controls, not content — which has to happen here, while the
 * class names that identify them are still on the source.
 */
function inlineStyles(source: Element, target: Element) {
  if (source.classList.contains("card-add")) {
    target.remove();
    return;
  }
  const computed = getComputedStyle(source);
  const style = INLINED_PROPERTIES.map(
    (property) => `${property}:${computed.getPropertyValue(property)}`,
  ).join(";");
  target.setAttribute("style", style);
  target.removeAttribute("class");
  // Snapshots of both lists, since a removal above would shift live indices.
  const targetChildren = [...target.children];
  [...source.children].forEach((sourceChild, index) => {
    const targetChild = targetChildren[index];
    if (targetChild) inlineStyles(sourceChild, targetChild);
  });
}

/** Replaces an `<image>`'s URL with the image itself; drops it if it can't be fetched, so the export never fails over one photo. */
async function embedImage(image: SVGImageElement) {
  const href = image.getAttribute("href");
  if (!href || href.startsWith("data:")) return;
  try {
    const response = await fetch(href);
    if (!response.ok) throw new Error(String(response.status));
    image.setAttribute("href", await blobToDataUrl(await response.blob()));
  } catch {
    image.remove();
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.addEventListener(
      "error",
      () => reject(reader.error ?? new Error("Could not read the image")),
      { once: true },
    );
    reader.readAsDataURL(blob);
  });
}

/** Renders an SVG document to a PNG, as large as the browser allows up to 2× for print. */
export async function svgToPng(
  svg: string,
  width: number,
  height: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(
    PNG_SCALE,
    MAX_CANVAS_SIDE / width,
    MAX_CANVAS_SIDE / height,
    Math.sqrt(MAX_CANVAS_AREA / (width * height)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't draw the image");

  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser can't save the image");
  return { blob, width: canvas.width, height: canvas.height };
}

/** One page the size of the chart, with the chart as a PNG on it. jsPDF is loaded only here. */
export async function pngToPdf(png: Blob, width: number, height: number): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
    hotfixes: ["px_scaling"],
  });
  pdf.addImage(await blobToDataUrl(png), "PNG", 0, 0, width, height);
  return pdf.output("blob");
}

/** The tree as a file in `format`, from a snapshot of the chart. */
export async function exportTree(snapshot: ChartSnapshot, format: TreeExportFormat): Promise<Blob> {
  const svg = await standaloneSvg(snapshot);
  if (format === "svg") return new Blob([svg], { type: "image/svg+xml" });
  const png = await svgToPng(svg, snapshot.width, snapshot.height);
  if (format === "png") return png.blob;
  // The page is sized in the chart's own units; the PNG's extra pixels
  // just make it sharper when printed.
  return pngToPdf(png.blob, snapshot.width, snapshot.height);
}

/** Hands a file to the browser as a download. */
export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** "family-tree-anders-jensen-2026-10-09.png" — safe for any filesystem. */
export function exportFilename(name: string, format: TreeExportFormat, date = new Date()): string {
  const slug = name
    .toLowerCase()
    .replaceAll("ø", "o")
    .replaceAll("æ", "ae")
    .replaceAll("å", "a")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const day = date.toISOString().slice(0, 10);
  return `family-tree${slug ? `-${slug}` : ""}-${day}.${format}`;
}
