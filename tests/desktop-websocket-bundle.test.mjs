import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { resolveConfig } from "electron-vite"
import { build } from "vite"

test("desktop development bundle loads ws without optional native addons", async () => {
  const originalDirectory = process.cwd()
  const desktop = fileURLToPath(new URL("../apps/desktop/", import.meta.url))
  const directory = await mkdtemp(join(desktop, ".ws-bundle-test-"))
  try {
    process.chdir(desktop)
    const entry = join(directory, "entry.mjs")
    await writeFile(entry, 'import WebSocket from "ws"; export default WebSocket;\n')
    const { config } = await resolveConfig({ mode: "development" }, "serve")
    const output = await build({
      ...config.main,
      configFile: false,
      logLevel: "silent",
      build: {
        ...config.main.build,
        write: false,
        watch: null,
        rollupOptions: { ...config.main.build.rollupOptions, input: entry },
      },
    })
    const chunk = output.output.find((item) => item.type === "chunk" && item.isEntry)
    assert.ok(chunk)
    const module = { exports: {} }
    const require = createRequire(entry)
    new Function("require", "module", "exports", chunk.code)(require, module, module.exports)
    assert.equal(typeof (module.exports.default ?? module.exports), "function")
    assert.match(chunk.code, /require\(["']ws["']\)/)
    assert.doesNotMatch(chunk.code, /__viteOptionalPeerDep/)
  } finally {
    process.chdir(originalDirectory)
    await rm(directory, { recursive: true, force: true })
  }
})
