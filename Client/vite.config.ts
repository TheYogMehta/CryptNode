/// <reference types="vitest" />

import legacy from "@vitejs/plugin-legacy";
import react from "@vitejs/plugin-react";
import { defineConfig, Plugin } from "vite";
import { copyFileSync, mkdirSync } from "fs";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    dedupe: ["konva"],
  },
  plugins: [

    react(),
    legacy({
      targets: [
        "chrome >= 64",
        "edge >= 79",
        "firefox >= 67",
        "safari >= 11.1",
      ],
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
      renderLegacyChunks: false,
      modernPolyfills: true,
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          ui: [
            "@mui/material",
            "@emotion/react",
            "@emotion/styled",
            "lucide-react",
          ],
          utils: ["lodash.debounce", "crypto-js"],
          virtuoso: ["react-virtuoso"],
          emoji: ["emoji-picker-react"],
        },
      },
    },
  },
});
