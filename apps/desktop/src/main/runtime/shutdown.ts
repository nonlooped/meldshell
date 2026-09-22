import { app, dialog } from "electron"
import { Effect } from "effect"
import { desktopHost } from "./services"
import { getMainWindow } from "../window"

let closePromptOpen = false
export let quitting = false
export let installingUpdate = false
export const markQuitting = (): void => {
  quitting = true
}

export const stopProviders = Effect.promise(() => desktopHost.stop())

export const prepareToClose = Effect.gen(function* () {
  if (closePromptOpen) return false
  closePromptOpen = true

  return yield* Effect.gen(function* () {
    const mainWindow = getMainWindow()
    const host = yield* Effect.promise(() => desktopHost.start())
    const active = yield* Effect.promise(() => host.activeTurns())
    if (active > 0 && mainWindow !== null) {
      const currentWindow = mainWindow
      const answer = yield* Effect.tryPromise({
        try: () =>
          dialog.showMessageBox(currentWindow, {
            type: "warning",
            title: "Close MeldShell?",
            message: `${active} agent turn${active === 1 ? " is" : "s are"} still running.`,
            detail: "Closing now interrupts active work. Queued messages remain stored.",
            buttons: ["Keep working", "Interrupt and close"],
            defaultId: 0,
            cancelId: 0,
          }),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      })
      if (answer.response === 0) return false
    }
    yield* stopProviders
    return true
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        closePromptOpen = false
      }),
    ),
  )
})

export const confirmAndClose = prepareToClose.pipe(
  Effect.tap((ready) =>
    ready
      ? Effect.sync(() => {
          quitting = true
          app.quit()
        })
      : Effect.void,
  ),
)

export const markInstallingUpdate = (): void => {
  installingUpdate = true
  quitting = true
}
