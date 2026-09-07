import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/domain/**/*.test.ts",
      "tests/validation/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/security/**/*.test.ts",
      "tests/architecture/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // El dominio es donde exigimos cobertura alta (SPEC V1 §21): funciones
      // puras, sin I/O, testeables exhaustivamente.
      include: ["src/domain/**/*.ts"],
    },
  },
});
