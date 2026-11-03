import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app-router";
import "./index.css";
import { captureLegacyStorageBeforeAppStart } from "./lib/legacy-storage";

captureLegacyStorageBeforeAppStart();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
