import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.{ts,js}", "src/**/*.test.{ts,js}"],
  },
});
