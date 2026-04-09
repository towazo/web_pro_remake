import { createRoot } from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "./app.css";

createRoot(document.querySelector("#content")).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
