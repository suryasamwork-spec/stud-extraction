import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build output goes to dist/, which the FastAPI backend serves in production.
// During `npm run dev`, /api calls are proxied to the FastAPI server on :8000.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
