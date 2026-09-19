import type { AppUpdateStatus } from "@meldshell/contracts"
import { app } from "electron"
import electronUpdater, {
  type AppUpdater,
  type ProgressInfo,
  type UpdateInfo,
} from "electron-updater"
import { IPC } from "@meldshell/contracts"
import { getMainWindow } from "./window"

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000
const { autoUpdater } = electronUpdater

type StatusListener = (status: AppUpdateStatus) => void

export class UpdateService {
  readonly #updater: AppUpdater
  readonly #enabled: boolean
  readonly #currentVersion: string
  readonly #listeners = new Set<StatusListener>()
  #interval: NodeJS.Timeout | null = null
  #status: AppUpdateStatus

  constructor(
    updater: AppUpdater,
    options: {
      readonly packaged: boolean
      readonly platform: NodeJS.Platform
      readonly version: string
    },
  ) {
    this.#updater = updater
    this.#currentVersion = options.version
    const supported = options.platform === "win32" || options.platform === "linux"
    this.#enabled = options.packaged && supported
    this.#status = {
      state: this.#enabled ? "idle" : "unavailable",
      currentVersion: this.#currentVersion,
      availableVersion: null,
      progressPercent: null,
      message: options.packaged
        ? supported
          ? null
          : "Updates are not available on this platform."
        : "Update checks are available in installed builds.",
    }

    if (!this.#enabled) return
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.allowPrerelease = false
    updater.on("checking-for-update", () => this.#setStatus("checking"))
    updater.on("update-available", (info: UpdateInfo) =>
      this.#setStatus("downloading", {
        availableVersion: info.version,
        message: `Downloading MeldShell ${info.version}...`,
      }),
    )
    updater.on("download-progress", (progress: ProgressInfo) =>
      this.#setStatus("downloading", {
        progressPercent: Math.max(0, Math.min(100, progress.percent)),
      }),
    )
    updater.on("update-not-available", () =>
      this.#setStatus("up-to-date", {
        availableVersion: null,
        progressPercent: null,
        message: "MeldShell is up to date.",
      }),
    )
    updater.on("update-downloaded", (info: UpdateInfo) =>
      this.#setStatus("ready", {
        availableVersion: info.version,
        progressPercent: 100,
        message: `MeldShell ${info.version} is ready to install.`,
      }),
    )
    updater.on("error", (error: Error) =>
      this.#setStatus("error", {
        progressPercent: null,
        message: error.message || "MeldShell could not check for updates.",
      }),
    )
  }

  get status(): AppUpdateStatus {
    return this.#status
  }

  subscribe(listener: StatusListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  start(): void {
    if (!this.#enabled || this.#interval !== null) return
    void this.check()
    this.#interval = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
    this.#interval.unref()
  }

  async check(): Promise<AppUpdateStatus> {
    if (!this.#enabled || ["checking", "downloading", "ready"].includes(this.#status.state)) {
      return this.#status
    }
    this.#setStatus("checking", {
      availableVersion: null,
      progressPercent: null,
      message: "Checking GitHub for updates...",
    })
    try {
      await this.#updater.checkForUpdates()
    } catch (cause) {
      this.#setStatus("error", {
        message: cause instanceof Error ? cause.message : "MeldShell could not check for updates.",
      })
    }
    return this.#status
  }

  install(): boolean {
    if (!this.#enabled || this.#status.state !== "ready") return false
    this.#updater.quitAndInstall(false, true)
    return true
  }

  #setStatus(
    state: AppUpdateStatus["state"],
    patch: Partial<Omit<AppUpdateStatus, "state" | "currentVersion">> = {},
  ): void {
    this.#status = { ...this.#status, ...patch, state, currentVersion: this.#currentVersion }
    for (const listener of this.#listeners) listener(this.#status)
  }
}

export const updateService = new UpdateService(autoUpdater, {
  packaged: app.isPackaged,
  platform: process.platform,
  version: app.getVersion(),
})

updateService.subscribe((status) => {
  const window = getMainWindow()
  if (window !== null && !window.isDestroyed()) {
    window.webContents.send(IPC.updateStatusChanged, status)
  }
})
