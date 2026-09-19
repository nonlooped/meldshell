import { electronApp, is, optimizer } from "@electron-toolkit/utils"
import { app, BrowserWindow, type Event } from "electron"
import contextMenu from "electron-context-menu"
import { Effect } from "effect"
import { CodexProvider, ClaudeProvider, CursorProvider } from "./runtime/worker-provider"
import { CoreClient } from "./runtime/core-client"

import { runtime } from "./runtime/services"
import { logStartupTiming } from "./runtime/startup-timing"
import { confirmAndClose, stopProviders, quitting, markQuitting } from "./runtime/shutdown"
import { createWindow, getMainWindow } from "./window"
import { registerIpc } from "./ipc"

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
    const onBrowserWindowCreated = (_event: Event, window: BrowserWindow): void => {
      optimizer.watchWindowShortcuts(window)
    }
    const onActivate = (): void => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow()
    }
    const onWindowAllClosed = (): void => app.quit()

    app.on("second-instance", onSecondInstance)
    app.on("browser-window-created", onBrowserWindowCreated)
    app.on("activate", onActivate)
    app.on("window-all-closed", onWindowAllClosed)

    return { onSecondInstance, onBrowserWindowCreated, onActivate, onWindowAllClosed }
  }),
  (listeners) =>
    Effect.sync(() => {
      app.off("second-instance", listeners.onSecondInstance)
      app.off("browser-window-created", listeners.onBrowserWindowCreated)
      app.off("activate", listeners.onActivate)
      app.off("window-all-closed", listeners.onWindowAllClosed)
    }),
)

const awaitQuitRequest = Effect.async<void>((resume) => {
  const onBeforeQuit = (event: Event): void => {
    event.preventDefault()
    markQuitting()
    resume(Effect.void)
  }
  app.once("before-quit", onBeforeQuit)
  return Effect.sync(() => app.off("before-quit", onBeforeQuit))
})

const startApplication = Effect.gen(function* () {
  yield* CoreClient
  yield* CodexProvider
  yield* ClaudeProvider
  yield* CursorProvider
})

const disposeRuntime = Effect.tryPromise({
  try: () => runtime.dispose(),
  catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
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
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    })
    yield* Effect.sync(() => {
      logStartupTiming("whenReady")
      electronApp.setAppUserModelId("com.meldshell.desktop")
      // Register handlers before loading the renderer. Their runtime calls wait for core safely.
      registerIpc()
      openWindow()
    })
    yield* Effect.raceFirst(
      awaitQuitRequest,
      Effect.tryPromise({
        try: () => runtime.runPromise(startApplication),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      }).pipe(Effect.andThen(Effect.never)),
    )
    yield* Effect.promise(() =>
      runtime.runPromise(
        Effect.gen(function* () {
          const core = yield* CoreClient
          yield* core.BeginShutdown()
          yield* stopProviders
        }),
      ),
    )
  }),
).pipe(
  Effect.tapErrorCause((cause) =>
    Effect.sync(() => console.error("MeldShell failed to start.", cause)),
  ),
  Effect.ensuring(Effect.sync(disposeContextMenu).pipe(Effect.andThen(disposeRuntime))),
)

Effect.runFork(desktopProgram)
