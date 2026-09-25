import { electronApp, is } from "@electron-toolkit/utils"
import { app, BrowserWindow, type Event } from "electron"
import contextMenu from "electron-context-menu"
import { Effect } from "effect"

import { runtime, desktopHost } from "./runtime/services"
import { logStartupTiming } from "./runtime/startup-timing"
import {
  confirmAndClose,
  stopProviders,
  quitting,
  installingUpdate,
  markQuitting,
} from "./runtime/shutdown"
import { createWindow, getMainWindow, installApplicationMenu } from "./window"
import { registerIpc } from "./ipc"
import { updateService } from "./updater"
import { toError } from "@meldshell/contracts"

const openWindow = (): void =>
  createWindow((event) => {
    if (quitting) return
    event.preventDefault()
    void runtime.runPromise(confirmAndClose).catch((cause: unknown) => {
      console.error("Could not close MeldShell cleanly.", cause)
    })
  })

const disposeContextMenu = contextMenu({
  showInspectElement: is.dev,
  showLookUpSelection: false,
  showSearchWithGoogle: false,
})

const appListeners = Effect.acquireRelease(
  Effect.sync(() => {
    const onSecondInstance = (): void => {
      const mainWindow = getMainWindow()
      if (mainWindow?.isMinimized()) mainWindow.restore()
      mainWindow?.focus()
    }
    const onActivate = (): void => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow()
    }
    const onWindowAllClosed = (): void => app.quit()

    app.on("second-instance", onSecondInstance)
    app.on("activate", onActivate)
    app.on("window-all-closed", onWindowAllClosed)

    return { onSecondInstance, onActivate, onWindowAllClosed }
  }),
  (listeners) =>
    Effect.sync(() => {
      app.off("second-instance", listeners.onSecondInstance)
      app.off("activate", listeners.onActivate)
      app.off("window-all-closed", listeners.onWindowAllClosed)
    }),
)

const awaitQuitRequest = Effect.async<void>((resume) => {
  const onBeforeQuit = (event: Event): void => {
    if (installingUpdate) return
    event.preventDefault()
    markQuitting()
    resume(Effect.void)
  }
  app.once("before-quit", onBeforeQuit)
  return Effect.sync(() => app.off("before-quit", onBeforeQuit))
})

const startApplication = Effect.promise(() => desktopHost.start())

const disposeRuntime = Effect.tryPromise({
  try: () => runtime.dispose(),
  catch: toError,
}).pipe(
  Effect.catchAll((cause) =>
    Effect.sync(() => console.error("MeldShell runtime cleanup failed.", cause)),
  ),
  Effect.andThen(
    Effect.sync(() => {
      app.quit()
    }),
  ),
)

const desktopProgram = Effect.scoped(
  Effect.gen(function* () {
    const hasInstanceLock = yield* Effect.sync(() => app.requestSingleInstanceLock())
    if (!hasInstanceLock) {
      yield* Effect.sync(() => app.quit())
      return
    }

    yield* appListeners
    yield* Effect.tryPromise({
      try: () => app.whenReady(),
      catch: toError,
    })
    yield* Effect.sync(() => {
      logStartupTiming("whenReady")
      electronApp.setAppUserModelId("com.meldshell.desktop")
      // Register handlers before loading the renderer. Their runtime calls wait for core safely.
      registerIpc()
      installApplicationMenu()
      openWindow()
      updateService.start()
    })
    yield* Effect.raceFirst(
      awaitQuitRequest,
      Effect.tryPromise({
        try: () => runtime.runPromise(startApplication),
        catch: toError,
      }).pipe(Effect.andThen(Effect.never)),
    )
    yield* stopProviders
  }),
).pipe(
  Effect.tapErrorCause((cause) =>
    Effect.sync(() => console.error("MeldShell failed to start.", cause)),
  ),
  Effect.ensuring(Effect.sync(disposeContextMenu).pipe(Effect.andThen(disposeRuntime))),
)

Effect.runFork(desktopProgram)
