import { resolve } from "node:path"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const bundledMainPackages = [
  "@meldshell/contracts",
  "@meldshell/projection",
  "@meldshell/core",
  "@meldshell/host",
  "@meldshell/provider-runtime",
  "@meldshell/provider-codex",
  "@meldshell/provider-claude",
  "@meldshell/provider-cursor",
  // ESM-only. Externalizing it would turn the default import into a CommonJS module object.
  "electron-context-menu",
  "htmlparser2",
  "p-limit",
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledMainPackages })],
    build: {
      rollupOptions: {
        external: ["@anthropic-ai/claude-agent-sdk"],
        input: {
          index: resolve("src/main/index.ts"),
          "core-worker": resolve("src/main/workers/core.ts"),
          "codex-worker": resolve("src/main/workers/codex.ts"),
          "claude-worker": resolve("src/main/workers/claude.ts"),
          "cursor-worker": resolve("src/main/workers/cursor.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ["@meldshell/contracts", "@meldshell/contracts/ipc"],
      }),
    ],
  },
  renderer: {
    build: {
      // The renderer CSP permits bundled fonts, not data: font URLs.
      assetsInlineLimit: (path) => (/\.(?:woff2?|ttf)$/i.test(path) ? false : undefined),
    },
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [
      tailwindcss(),
      react({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
    ],
  },
})
