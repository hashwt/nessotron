import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createApiMiddleware } from "./server/api";

// Fresh Moneyverse build (2026-11-08). .env is loaded into THIS process
// (Vite never puts .env vars into process.env on its own). The /api
// middleware below is the only code that ever reads the Nessie/Nemotron
// keys. The browser only ever talks to /api/* and never sees a key.
try {
  process.loadEnvFile();
} catch {
  /* No .env file — real environment variables win. */
}

function moneyverseApi(): Plugin {
  return {
    name: "moneyverse-api",
    configureServer(server) {
      server.middlewares.use(createApiMiddleware());
    },
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), moneyverseApi()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 8080,
  },
});
