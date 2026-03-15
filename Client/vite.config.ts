/// <reference types="vitest" />

import legacy from "@vitejs/plugin-legacy";
import react from "@vitejs/plugin-react";
import { defineConfig, Plugin } from "vite";
import { copyFileSync, mkdirSync } from "fs";
import { resolve } from "path";

// Copies ONNX Runtime WASM binaries from node_modules into public at dev/build time
// so they are served locally and no CDN requests are made.
function copyWasmPlugin(): Plugin {
  const wasmFiles = [
    "ort-wasm-simd.wasm",
    "ort-wasm-simd-threaded.wasm",
    "ort-wasm.wasm",
    "ort-wasm-threaded.wasm",
  ];
  const src = resolve(
    __dirname,
    "node_modules/@xenova/transformers/dist",
  );
  const dest = resolve(__dirname, "public");

  const copy = () => {
    mkdirSync(dest, { recursive: true });
    for (const f of wasmFiles) {
      try {
        copyFileSync(resolve(src, f), resolve(dest, f));
      } catch (e) {
        console.warn(`[copyWasm] Could not copy ${f}:`, e);
      }
    }
  };

  return {
    name: "copy-ort-wasm",
    buildStart: copy,
    configureServer: copy,
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    copyWasmPlugin(),
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
