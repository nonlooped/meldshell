import type { ResolveApprovalInput, SubmitTurnInput } from "@meldshell/contracts"
import { Effect } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { providerFor } from "./worker-provider"

const publishChange = (threadId: string) =>
  Effect.flatMap(HostEvents, (events) => events.publish({ _tag: "RuntimeChanged", threadId }))

const answerActiveTurn = (input: SubmitTurnInput) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    if (!input.text.trim() || input.attachments?.length)
      return yield* Effect.fail(new Error("A question reply needs text and no attachments."))
    // InterruptTurn only reads the active turn; cancellation is a separate provider command.
    const active = yield* core.InterruptTurn({ threadId: input.threadId })
    if (active !== null) {
      if (active.id !== input.questionTurnId || active.harness !== "codex")
        return yield* Effect.fail(new Error("This question no longer belongs to the active turn."))
      if (active.native_thread_id === null || active.native_turn_id === null)
        return yield* Effect.fail(new Error("Codex is not ready to receive this answer yet."))
      const provider = yield* providerFor(active.harness)
      yield* provider.send({
        type: "steer-turn",
        nativeThreadId: active.native_thread_id,
        nativeTurnId: active.native_turn_id,
        text: input.text,
      })
      yield* publishChange(input.threadId)
      return {
        snapshot: yield* core.GetSnapshot(),
        disposition: "steered" as const,
        dispatch: null,
        titleRequest: null,
      }
    }
    return null
  })

export const submitTurn = (input: SubmitTurnInput) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    if (input.questionTurnId !== undefined) {
      const steered = yield* answerActiveTurn(input)
      if (steered !== null) return steered
    }
    const result = yield* core.SubmitTurn(input)
    if (result.dispatch !== null) {
      const provider = yield* providerFor(result.dispatch.harness)
      yield* provider.send({ type: "start-turn", dispatch: result.dispatch })
    }
    if (result.titleRequest !== null) {
      const provider = yield* providerFor(result.titleRequest.harness)
      yield* provider
        .send({ type: "generate-title", request: result.titleRequest })
        .pipe(Effect.catchAll(Effect.logError))
    }
    yield* publishChange(input.threadId)
    return result
  })

export const interruptTurn = (threadId: string) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const turn = yield* core.InterruptTurn({ threadId })
    if (turn === null) return false
    const provider = yield* providerFor(turn.harness)
    yield* provider.interrupt(threadId, turn.id)
    return true
  })

// All clients of one host share this gate. The second response observes the removal
// only after the first delivery completes, so a native approval cannot be answered twice.
// The row is removed only after delivery, so a failed delivery leaves the approval answerable.
const approvalGate = Effect.runSync(Effect.makeSemaphore(1))
export const resolveApproval = (input: ResolveApprovalInput) =>
  approvalGate.withPermits(1)(
    Effect.gen(function* () {
      const core = yield* CoreClient
      const snapshot = yield* core.GetSnapshot()
      const approval = snapshot.approvals.find((candidate) => candidate.id === input.approvalId)
      if (approval === undefined) return false
      const harness = yield* core.GetApprovalHarness({ approvalId: input.approvalId })
      if (harness === null) return false
      const provider = yield* providerFor(harness)
      yield* provider.send({
        type: "resolve-approval",
        requestId: approval.requestId,
        decision: input.decision,
        answers: input.answers,
        optionId: input.optionId,
      })
      yield* core.ResolveApproval({ approvalId: input.approvalId })
      yield* publishChange(approval.threadId)
      return true
    }),
  )
