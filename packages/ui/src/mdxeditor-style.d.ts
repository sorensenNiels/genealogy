// MDXEditor ships its CSS as a side-effect-only import with no bundled type
// declaration; this package is consumed as source by Vite (see tsconfig.json),
// which resolves the actual file at bundle time — this just satisfies `tsc`.
declare module "@mdxeditor/editor/style.css";
