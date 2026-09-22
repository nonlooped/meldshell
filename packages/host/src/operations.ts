import type { ResolveApprovalInput, SubmitTurnInput } from "@meldshell/contracts"
import { Effect } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { providerFor } from "./worker-provider"

const publishChange = (threadId: string) =>
  Effect.flatMap(HostEvents, (events) => events.publish({ _tag: "RuntimeChanged", threadId }))

export const submitTurn = (input: SubmitTurnInput) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
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
