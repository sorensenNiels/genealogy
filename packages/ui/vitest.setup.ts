import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// RTL's auto-cleanup only self-registers when it detects Jest/Vitest globals;
// this project imports `describe`/`it`/`expect` explicitly instead of using
// `test.globals: true`, so it never fires without this.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement these, but React Aria's overlay positioning
// (Popover/Select/ComboBox) and list auto-scroll call them.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
