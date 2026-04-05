import React from "react";
import { createRoot } from "react-dom/client";

// Expose React globally for third-party scripts/libraries (e.g. react-filerobot-image-editor)
window.React = window.React || React;
import Konva from "konva";
// @ts-ignore
window.Konva = window.Konva || Konva;
import { defineCustomElements } from "@ionic/pwa-elements/loader";
import { logger } from "./services/core/LoggerService";
// @ts-ignore
window.logger = logger;
import App from "./App";

// Call the element loader after the platform has been bootstrapped
defineCustomElements(window);

const container = document.getElementById("root");
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
