import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/client",
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
  server: {
    port: parseInt(process.env.VITE_PORT || "5173", 10),
    proxy: {
      "/api": `http://localhost:${process.env.PORT || "3001"}`,
    },
  },
});
