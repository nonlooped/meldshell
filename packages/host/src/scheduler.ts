import { Effect, Either, Schedule } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { submitTurn } from "./operations"
import { errorMessage } from "@meldshell/contracts"

/*
 * Scheduled prompts. The host checks for due schedules every few seconds while it runs and sends
 * each one's prompt to its thread exactly as the composer would, so a busy thread queues it. The
 * core moves a schedule to its next run when handing it out, so a prompt is never sent twice.
 */

const CHECK_EVERY = "15 seconds"

const runDueSchedules = Effect.gen(function* () {
  const core = yield* CoreClient
  const due = yield* core.ClaimDueSchedules({ now: new Date().toISOString() })
  if (due.length === 0) return
  for (const schedule of due) {
    const sent = yield* submitTurn({ threadId: schedule.threadId, text: schedule.prompt }).pipe(
      Effect.either,
    )
    yield* core.RecordScheduleRun({
      scheduleId: schedule.id,
      error: Either.isLeft(sent) ? errorMessage(sent.left) : null,
    })
  }
  const events = yield* HostEvents
  yield* events.publish({ _tag: "RuntimeChanged", threadId: "" })
})

/** Runs until interrupted; a failed check is logged and the next one still happens. */
export const scheduleLoop = runDueSchedules.pipe(
  Effect.catchAllCause(Effect.logError),
  Effect.repeat(Schedule.spaced(CHECK_EVERY)),
)
