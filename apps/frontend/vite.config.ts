import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Must run before the React plugin so generated route modules are
    // transformed too.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    // Bind on all interfaces: inside a container, localhost is not reachable
    // from the host.
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    sourcemap: true,
  },
});
