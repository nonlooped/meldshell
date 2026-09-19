import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import vm from "node:vm"
import ts from "typescript"
import * as effect from "effect"

test("opens the window with IPC registered while runtime initialization is pending", async () => {
  const app = new EventEmitter()
  app.requestSingleInstanceLock = () => true
  app.whenReady = async () => undefined
  app.quit = () => undefined
  const calls = []
  let finishStartup
  const pending = new Promise((resolve) => {
    finishStartup = resolve
  })
  const runtime = {
    runPromise: () => {
      calls.push("runtime")
      return pending
    },
    dispose: async () => undefined,
  }
  let fiber
  const modules = {
    "@electron-toolkit/utils": {
      electronApp: { setAppUserModelId: () => undefined },
      is: { dev: false },
      optimizer: {},
    },
    electron: { app, BrowserWindow: { getAllWindows: () => [] } },
    "electron-context-menu": { default: () => () => undefined },
    effect: {
      ...effect,
      Effect: {
        ...effect.Effect,
        runFork(program) {
          fiber = effect.Effect.runFork(program)
          return fiber
        },
      },
    },
    "./runtime/worker-provider": {},
    "./runtime/core-client": {},
    "./runtime/services": { runtime },
    "./runtime/startup-timing": { logStartupTiming: (name) => calls.push(name) },
    "./runtime/shutdown": {},
    "./window": { createWindow: () => calls.push("window") },
    "./ipc": { registerIpc: () => calls.push("ipc") },
  }
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  vm.runInNewContext(outputText, {
    exports: {},
    console,
    require: (name) => {
      assert.ok(name in modules, name)
      return modules[name]
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  try {
    assert.deepEqual(calls, ["whenReady", "ipc", "window", "runtime"])
    assert.equal(app.listenerCount("before-quit"), 1, "quit remains observable during startup")
  } finally {
    finishStartup()
    await effect.Effect.runPromise(effect.Fiber.interrupt(fiber))
  }
})
