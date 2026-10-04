import type {
  InterruptedTurn,
  QueuedInputContent,
  ResolveApprovalInput,
  SetThreadSettingsInput,
  SubmitTurnInput,
} from "@meldshell/contracts"
import { Effect, Semaphore } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { providerFor } from "./worker-provider"

const publishChange = (threadId: string) =>
  Effect.flatMap(HostEvents, (events) => events.publish({ _tag: "RuntimeChanged", threadId }))

/** These providers keep one process per thread rather than a shared app-server. */
const RETAINED_HARNESSES = ["claude-code", "cursor", "pi"] as const

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

/**
 * Redirects the running turn with a queued follow-up. Codex takes it into the same turn; the other
 * harnesses cannot, so their turn is interrupted and the follow-up runs right after. A turn that
 * cannot be redirected (a Codex review, say) leaves it queued ahead of the rest.
 */
const steerActiveTurn = (
  queuedInputId: number,
  content: QueuedInputContent,
  active: InterruptedTurn,
) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const provider = yield* providerFor(active.harness)
    if (active.harness === "codex") {
      if (active.native_thread_id === null || active.native_turn_id === null)
        return "queued" as const
      yield* provider.send({
        type: "steer-turn",
        nativeThreadId: active.native_thread_id,
        nativeTurnId: active.native_turn_id,
        text: content.text,
        attachments: content.attachments,
      })
      yield* core.RemoveQueuedInput({ id: queuedInputId })
      return "steered" as const
    }
    yield* core.PrioritizeQueuedInput({ id: queuedInputId })
    yield* provider.interrupt(content.threadId, active.id)
    return "steered" as const
  }).pipe(
    Effect.catch((cause) =>
      Effect.logError("Could not steer the running turn; the message stays queued.", cause).pipe(
        Effect.as("queued" as const),
      ),
    ),
  )

export const submitTurn = (input: SubmitTurnInput) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    if (input.questionTurnId !== undefined) {
      const steered = yield* answerActiveTurn(input)
      if (steered !== null) return steered
    }
    let result = yield* core.SubmitTurn(input)
    if (
      input.delivery === "steer" &&
      result.disposition === "queued" &&
      result.queuedInputId !== undefined
    ) {
      const queuedInputId = result.queuedInputId
      const content = yield* core.GetQueuedInput({ id: queuedInputId })
      const active = yield* core.InterruptTurn({ threadId: input.threadId })
      const disposition =
        content === null || active === null
          ? ("queued" as const)
          : yield* steerActiveTurn(queuedInputId, content, active)
      result = { ...result, disposition, snapshot: yield* core.GetSnapshot() }
    }
    if (result.dispatch !== null) {
      const provider = yield* providerFor(result.dispatch.harness)
      yield* provider.send({ type: "start-turn", dispatch: result.dispatch })
    }
    if (result.titleRequest !== null) {
      const provider = yield* providerFor(result.titleRequest.harness)
      yield* provider
        .send({ type: "generate-title", request: result.titleRequest })
        .pipe(Effect.catch(Effect.logError))
    }
    yield* publishChange(input.threadId)
    return result
  })

/** Stop retained sessions before deselecting their provider. */
export const setThreadSettings = (input: SetThreadSettingsInput) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const snapshot = yield* core.GetSnapshot()
    const current = snapshot.threadSettings.find((settings) => settings.threadId === input.threadId)
    const previous = snapshot.providers.find((provider) => provider.id === current?.providerId)
    const model = snapshot.models.find((model) => model.id === input.modelId)
    const next = snapshot.providers.find((provider) => provider.id === model?.providerId)
    if (
      previous &&
      RETAINED_HARNESSES.some((harness) => harness === previous.harness) &&
      next &&
      next.harness !== previous.harness
    ) {
      if (yield* core.InterruptTurn({ threadId: input.threadId }))
        return yield* Effect.fail(new Error("Stop the running turn before switching providers."))
      const provider = yield* providerFor(previous.harness)
      yield* provider.closeThreadSession(input.threadId)
    }
    return yield* core.SetThreadSettings(input)
  })

/** A deleted or rewound conversation must not leave a retained agent using its old context. */
export const closeThreadSessions = (threadId: string) =>
  Effect.forEach(
    RETAINED_HARNESSES,
    (harness) =>
      Effect.flatMap(providerFor(harness), (provider) => provider.closeThreadSession(threadId)),
    { discard: true },
  )

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
const approvalGate = Semaphore.makeUnsafe(1)
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
      const reason = input.decision === "decline" ? (input.reason?.trim() ?? "") : ""
      yield* provider.send({
        type: "resolve-approval",
        requestId: approval.requestId,
        decision: input.decision,
        answers: input.answers,
        optionId: input.optionId,
        ...(reason === "" ? {} : { reason }),
      })
      yield* core.ResolveApproval({ approvalId: input.approvalId })
      yield* publishChange(approval.threadId)
      // Claude Code reads the reason with the denial itself; the others hear it as a message,
      // which Codex takes into the running turn.
      if (reason !== "" && harness !== "claude-code")
        yield* submitTurn({
          threadId: approval.threadId,
          text: `I declined that request. ${reason}`,
          delivery: harness === "codex" ? "steer" : "queue",
        })
      return true
    }),
  )

export const removeQueuedInput = (id: number) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const threadId = yield* core.RemoveQueuedInput({ id })
    if (threadId !== null) yield* publishChange(threadId)
    return yield* core.GetSnapshot()
  })

/** Sends a waiting follow-up now: into the running turn, or as a new turn when none is running. */
export const steerQueuedInput = (id: number) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const content = yield* core.GetQueuedInput({ id })
    if (content === null) return yield* core.GetSnapshot()
    const active = yield* core.InterruptTurn({ threadId: content.threadId })
    if (active === null) {
      const started = yield* submitTurn(content)
      yield* core.RemoveQueuedInput({ id })
      return started.snapshot
    }
    yield* steerActiveTurn(id, content, active)
    yield* publishChange(content.threadId)
    return yield* core.GetSnapshot()
  })
