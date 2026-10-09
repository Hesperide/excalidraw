import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["excalidraw-app/dev/*.test.ts"],
    environment: "node",
  },
});
