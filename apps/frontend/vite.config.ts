import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Must run before the React plugin so generated route modules are
    // transformed too — same ordering requirement as apps/frontend's
    // tanstackRouter() plugin, which this supersedes.
    tanstackStart(),
    react(),
    tailwindcss(),
  ],
  server: {
    // Bind on all interfaces: inside a container, localhost is not reachable
    // from the host.
    host: true,
    // apps/frontend (the old SPA) is retired — this is now the sole frontend,
    // on the port it used to run alongside during the migration.
    port: 5173,
    strictPort: true,
  },
  build: {
    sourcemap: true,
  },
});
