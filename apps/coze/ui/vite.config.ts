import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  build: { outDir: "../dist/ui", emptyOutDir: true, target: "es2022" },
  // Unit tests assert Chinese copy: pin the zh-CN locale the desktop tests use.
  test: { setupFiles: [fileURLToPath(new URL("../../../shared/i18n/testLocale.ts", import.meta.url))] },
});
