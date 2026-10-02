import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { MeldShellApi } from "@meldshell/contracts/ipc"
import { test as base } from "e2e"
import { defineEngine } from "e2e/engine"
import { _electron, type ElectronApplication, type Page } from "playwright"

declare global {
  interface Window {
    meldshell: MeldShellApi
  }
}

type Method = {
  [K in keyof MeldShellApi]-?: MeldShellApi[K] extends (...args: never[]) => Promise<unknown>
    ? K
    : never
}[keyof MeldShellApi]

export class Desktop {
  private application: ElectronApplication | undefined
  private window: Page | undefined
  directory = ""
  workspace = ""

  get page(): Page {
    if (!this.window) throw new Error("Desktop is not running")
    return this.window
  }

  async start(): Promise<void> {
    this.directory = await mkdtemp(join(tmpdir(), "meldshell-e2e-"))
    this.workspace = join(this.directory, "workspace with spaces")
    await mkdir(this.workspace)
    // Windows TEMP can use an 8.3 alias; the host stores the canonical folder path.
    this.workspace = await realpath(this.workspace)
    await writeFile(join(this.workspace, "README.md"), "# E2E workspace\n")
    execFileSync("git", ["init", this.workspace])
    execFileSync("git", ["-C", this.workspace, "add", "."])
    execFileSync("git", [
      "-C",
      this.workspace,
      "-c",
      "user.name=E2E",
      "-c",
      "user.email=e2e@example.invalid",
      "commit",
      "-m",
      "Initial workspace",
    ])
    await this.launch()
  }

  private async launch(): Promise<void> {
    const profile = join(this.directory, "profile")
    await mkdir(profile, { recursive: true })
    const bootstrap = join(this.directory, "electron-main.cjs")
    await writeFile(
      bootstrap,
      `const { app } = require("electron");\napp.setPath("userData", ${JSON.stringify(profile)});\nrequire(${JSON.stringify(resolve("apps/desktop/out/main/index.js"))});\n`,
    )
    this.application = await _electron.launch({
      args: [bootstrap, ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
      env: { ...process.env, MELDSHELL_DATA_DIR: join(this.directory, "data") },
      timeout: 30_000,
    })
    this.window = await this.application.firstWindow()
    this.window.setDefaultTimeout(10_000)
    await this.window.waitForFunction(() => typeof window.meldshell?.getSnapshot === "function")
    await this.call("getSnapshot")
  }

  async restart(): Promise<void> {
    await this.application?.close()
    await this.launch()
  }

  async stop(): Promise<void> {
    try {
      await this.application?.close()
    } finally {
      this.window = undefined
      this.application = undefined
      await rm(this.directory, { recursive: true, force: true })
    }
  }

  async call<K extends Method>(
    method: K,
    ...args: Parameters<Extract<MeldShellApi[K], (...args: never[]) => unknown>>
  ): Promise<Awaited<ReturnType<Extract<MeldShellApi[K], (...args: never[]) => unknown>>>> {
    return this.page.evaluate(
      async ({ method, args }) => {
        const api = window.meldshell
        const fn = api[method] as (...values: unknown[]) => Promise<unknown>
        return fn(...args)
      },
      { method, args },
    ) as Promise<Awaited<ReturnType<Extract<MeldShellApi[K], (...args: never[]) => unknown>>>>
  }

  async addWorkspace() {
    const snapshot = await this.call("addWorkspacePath", this.workspace)
    const workspace = snapshot.workspaces.find((item) => item.path === this.workspace)
    if (!workspace)
      throw new Error(
        `Added workspace missing from snapshot: expected ${this.workspace}, received ${snapshot.workspaces.map((item) => item.path).join(", ")}`,
      )
    return workspace
  }
}

export function desktopEngine() {
  let desktop = new Desktop()
  return defineEngine({
    name: "meldshell-electron",
    version: "1.0.0",
    spiVersion: 1,
    platform: "desktop",
    workers: 1,
    startAttempt: async () => {
      desktop = new Desktop()
      await desktop.start()
    },
    endAttempt: () => desktop.stop(),
    fixtures: {
      desktop: (context) =>
        context.fixture("desktop", desktop, {
          call: { kind: "resource", label: (...args) => `IPC ${args[0]}` },
          restart: { kind: "resource", timeout: 60_000 },
          addWorkspace: { kind: "resource" },
        }),
    },
  })
}

export const test = base.extend<{ desktop: Desktop }>()
