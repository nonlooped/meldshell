import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import * as fs from "node:fs"
import { readFileSync } from "node:fs"
import * as path from "node:path"
import { test } from "node:test"
import vm from "node:vm"
import ts from "typescript"

class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  allowPrerelease = true
  allowDowngrade = false
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
      app: {
        isPackaged: false,
        getVersion: () => "0.1.0",
        getPath: () => path.join(import.meta.dirname, "missing-user-data"),
      },
    },
    "node:fs": fs,
    "node:path": path,
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

test("follows the nightly channel it is switched to and returns to stable", async () => {
  const UpdateService = loadUpdateService()
  const updater = new FakeUpdater()
  const service = new UpdateService(updater, {
    packaged: true,
    platform: "linux",
    version: "0.2.0-nightly.202609251447",
  })

  assert.equal(service.status.channel, "nightly")
  assert.equal(updater.allowPrerelease, true)
  assert.equal(updater.allowDowngrade, false)

  const status = await service.setChannel("stable")

  assert.equal(status.channel, "stable")
  assert.equal(updater.allowPrerelease, false)
  assert.equal(updater.allowDowngrade, true)
  assert.equal(updater.checks, 1)
})

test("a stable install follows stable releases until nightlies are chosen", async () => {
  const UpdateService = loadUpdateService()
  const updater = new FakeUpdater()
  const service = new UpdateService(updater, {
    packaged: true,
    platform: "win32",
    version: "0.1.0",
  })

  assert.equal(service.status.channel, "stable")
  assert.equal(updater.allowPrerelease, false)
  await service.setChannel("nightly")
  assert.equal(updater.allowPrerelease, true)
  assert.equal(updater.allowDowngrade, false)
})
