import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QuickMenu } from "./components/QuickMenu";
import { applyThemeMode, loadThemeMode } from "./utils/themeMode";

applyThemeMode(loadThemeMode());
createRoot(document.getElementById("root")!).render(<StrictMode><QuickMenu /></StrictMode>);
