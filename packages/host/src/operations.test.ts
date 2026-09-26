import assert from "node:assert/strict"
import { test } from "node:test"
import { Deferred, Effect, Layer, ManagedRuntime } from "effect"
import type { AppSnapshot } from "@meldshell/contracts"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { resolveApproval, submitTurn } from "./operations"
import {
  CodexProvider,
  ClaudeProvider,
  CursorProvider,
  type ProviderService,
} from "./worker-provider"

const approvalSnapshot = (pending: boolean) =>
  ({
    approvals: pending ? [{ id: "approval", threadId: "thread", requestId: "native" }] : [],
    threadSettings: [{ threadId: "thread", providerId: "provider" }],
    providers: [{ id: "provider", harness: "codex" }],
  }) as unknown as AppSnapshot

test("competing approval responses deliver once and the second observes resolution", async () => {
  let pending = true
  let deliveries = 0
  const delivered = Effect.runSync(Deferred.make<void>())
  const release = Effect.runSync(Deferred.make<void>())
  const provider = {
    send: () =>
      Effect.gen(function* () {
        deliveries++
        yield* Deferred.succeed(delivered, undefined)
        yield* Deferred.await(release)
      }),
  } as unknown as ProviderService
  const core = {
    GetSnapshot: () => Effect.sync(() => approvalSnapshot(pending)),
    GetApprovalHarness: () => Effect.sync(() => (pending ? "codex" : null)),
    ResolveApproval: () =>
      Effect.sync(() => {
        pending = false
        return approvalSnapshot(false)
      }),
  } as unknown as CoreClient
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(CoreClient, core),
      Layer.succeed(CodexProvider, provider),
      Layer.succeed(ClaudeProvider, provider),
      Layer.succeed(CursorProvider, provider),
      HostEvents.Default,
    ),
  )
  try {
    const first = runtime.runPromise(
      resolveApproval({ approvalId: "approval", decision: "accept" }),
    )
    await Effect.runPromise(Deferred.await(delivered))
    const second = runtime.runPromise(
      resolveApproval({ approvalId: "approval", decision: "decline" }),
    )
    await Effect.runPromise(Deferred.succeed(release, undefined))
    assert.deepEqual(await Promise.all([first, second]), [true, false])
    assert.equal(deliveries, 1)
  } finally {
    await runtime.dispose()
  }
})

test("a failed approval delivery leaves the approval pending", async () => {
  let resolved = false
  const provider = {
    send: () => Effect.fail(new Error("worker unavailable")),
  } as unknown as ProviderService
  const core = {
    GetSnapshot: () => Effect.succeed(approvalSnapshot(true)),
    GetApprovalHarness: () => Effect.succeed("codex"),
    ResolveApproval: () =>
      Effect.sync(() => {
        resolved = true
        return approvalSnapshot(false)
      }),
  } as unknown as CoreClient
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(CoreClient, core),
      Layer.succeed(CodexProvider, provider),
      Layer.succeed(ClaudeProvider, provider),
      Layer.succeed(CursorProvider, provider),
      HostEvents.Default,
    ),
  )
  try {
    await assert.rejects(
      runtime.runPromise(resolveApproval({ approvalId: "approval", decision: "accept" })),
    )
    assert.equal(resolved, false)
  } finally {
    await runtime.dispose()
  }
})

test("a host-queued prompt does not dispatch a second provider turn", async () => {
  let deliveries = 0
  const result = { dispatch: null, titleRequest: null }
  const provider = {
    send: () =>
      Effect.sync(() => {
        deliveries++
      }),
  } as unknown as ProviderService
  const core = { SubmitTurn: () => Effect.succeed(result) } as unknown as CoreClient
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(CoreClient, core),
      Layer.succeed(CodexProvider, provider),
      Layer.succeed(ClaudeProvider, provider),
      Layer.succeed(CursorProvider, provider),
      HostEvents.Default,
    ),
  )
  try {
    assert.equal(
      await runtime.runPromise(submitTurn({ threadId: "thread", text: "queued" })),
      result,
    )
    assert.equal(deliveries, 0)
  } finally {
    await runtime.dispose()
  }
})

for (const scenario of ["running", "finished", "stale", "failed"] as const) {
  test(`async question reply: ${scenario}`, async () => {
    const deliveries: unknown[] = []
    let submitted = false
    const active =
      scenario === "finished"
        ? null
        : {
            id: scenario === "stale" ? "another-turn" : "turn",
            harness: "codex",
            native_thread_id: "native-thread",
            native_turn_id: "native-turn",
          }
    const core = {
      InterruptTurn: () => Effect.succeed(active),
      GetSnapshot: () => Effect.succeed(approvalSnapshot(false)),
      SubmitTurn: () =>
        Effect.sync(() => {
          submitted = true
          return { disposition: "started", dispatch: null, titleRequest: null }
        }),
    } as unknown as CoreClient
    const provider = {
      send: (message: unknown) =>
        Effect.suspend(() => {
          deliveries.push(message)
          return scenario === "failed" ? Effect.fail(new Error("steer rejected")) : Effect.void
        }),
    } as unknown as ProviderService
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        Layer.succeed(CoreClient, core),
        Layer.succeed(CodexProvider, provider),
        Layer.succeed(ClaudeProvider, provider),
        Layer.succeed(CursorProvider, provider),
        HostEvents.Default,
      ),
    )
    try {
      const result = runtime.runPromise(
        submitTurn({ threadId: "thread", text: "Custom answer", questionTurnId: "turn" }),
      )
      if (scenario === "stale" || scenario === "failed") await assert.rejects(result)
      else assert.equal((await result).disposition, scenario === "running" ? "steered" : "started")
      assert.equal(submitted, scenario === "finished")
      assert.deepEqual(
        deliveries,
        scenario === "running" || scenario === "failed"
          ? [
              {
                type: "steer-turn",
                nativeThreadId: "native-thread",
                nativeTurnId: "native-turn",
                text: "Custom answer",
              },
            ]
          : [],
      )
    } finally {
      await runtime.dispose()
    }
  })
}
