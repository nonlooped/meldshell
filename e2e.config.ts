import type { E2EConfig } from "e2e"
import { controlEngine } from "./tests/e2e/control"
import { desktopEngine } from "./tests/e2e/desktop"

export default {
  projectId: "meldshell",
  tests: "tests/e2e/**/*.e2e.ts",
  targets: [
    { name: "electron", engine: desktopEngine() },
    { name: "control", engine: controlEngine() },
  ],
  workers: 1,
  retries: 0,
  timeout: 90_000,
  launchTimeout: 120_000,
  reporters: ["list", "junit", "markdown"],
} satisfies E2EConfig
