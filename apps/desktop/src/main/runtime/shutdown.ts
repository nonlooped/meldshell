import { app, dialog } from "electron"
import { Effect } from "effect"
import { CoreClient } from "./core-client"
import { CodexProvider, ClaudeProvider, CursorProvider, providerFor } from "./worker-provider"
import { getMainWindow } from "../window"

let closePromptOpen = false
export let quitting = false
export const markQuitting = (): void => {
  quitting = true
}

export const stopProviders = Effect.gen(function* () {
  const codex = yield* CodexProvider
  const claude = yield* ClaudeProvider
  const cursor = yield* CursorProvider
  yield* Effect.all([codex.shutdown, claude.shutdown, cursor.shutdown], {
    concurrency: 3,
  })
  const core = yield* CoreClient
  yield* core.FinishShutdown()
})

export const confirmAndClose = Effect.gen(function* () {
  if (closePromptOpen) return false
  closePromptOpen = true
  const core = yield* CoreClient

  return yield* Effect.gen(function* () {
    const mainWindow = getMainWindow()
    const active = yield* core.GetActiveTurnCount()
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
    const turns = yield* core.BeginShutdown()
    yield* Effect.forEach(
      turns,
      (turn) =>
        turn.nativeTurnId !== null && turn.nativeThreadId !== null
          ? Effect.flatMap(providerFor(turn.harness), (provider) =>
              provider
                .send({
                  type: "interrupt-turn",
                  nativeThreadId: turn.nativeThreadId!,
                  nativeTurnId: turn.nativeTurnId!,
                })
                .pipe(Effect.catchAll(Effect.logError)),
            )
          : Effect.void,
      { concurrency: 1, discard: true },
    )
    yield* stopProviders
    quitting = true
    yield* Effect.sync(() => app.quit())
    return true
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        closePromptOpen = false
      }),
    ),
  )
})
