import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import vm from "node:vm"
import ts from "typescript"

class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  allowPrerelease = true
  checks = 0
  installArguments = null

  async checkForUpdates() {
    this.checks += 1
    this.emit("checking-for-update")
    this.emit("update-available", { version: "0.2.0" })
    this.emit("download-progress", { percent: 64.4 })
    this.emit("update-downloaded", { version: "0.2.0" })
    return null
  }

  quitAndInstall(...args) {
    this.installArguments = args
  }
}

const loadUpdateService = () => {
  const defaultUpdater = new FakeUpdater()
  const modules = {
    electron: {
      app: { isPackaged: false, getVersion: () => "0.1.0" },
    },
    "electron-updater": {
      default: { autoUpdater: defaultUpdater },
    },
    "@meldshell/contracts": {
      IPC: { updateStatusChanged: "meldshell:update-status-changed" },
    },
    "./window": { getMainWindow: () => null },
  }
  const source = readFileSync(new URL("./updater.ts", import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => {
      assert.ok(name in modules, name)
      return modules[name]
    },
    process,
    setInterval,
  })
  return exports.UpdateService
}

test("downloads an available update and exposes install readiness", async () => {
  const UpdateService = loadUpdateService()
  const updater = new FakeUpdater()
  const service = new UpdateService(updater, {
    packaged: true,
    platform: "win32",
    version: "0.1.0",
  })
  const states = []
  service.subscribe((status) => states.push(status.state))

  const status = await service.check()

  assert.equal(updater.checks, 1)
  assert.equal(updater.autoDownload, true)
  assert.equal(updater.allowPrerelease, false)
  assert.deepEqual(states, ["checking", "checking", "downloading", "downloading", "ready"])
  assert.equal(status.state, "ready")
  assert.equal(status.availableVersion, "0.2.0")
  assert.equal(status.progressPercent, 100)
  assert.equal(service.install(), true)
  assert.deepEqual(updater.installArguments, [false, true])
})

test("keeps development builds offline", async () => {
  const UpdateService = loadUpdateService()
  const updater = new FakeUpdater()
  const service = new UpdateService(updater, {
    packaged: false,
    platform: "linux",
    version: "0.1.0",
  })

  const status = await service.check()

  assert.equal(status.state, "unavailable")
  assert.equal(updater.checks, 0)
  assert.equal(service.install(), false)
})
