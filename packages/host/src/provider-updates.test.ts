import assert from "node:assert/strict"
import { test } from "node:test"
import { Effect, Fiber, Layer, ManagedRuntime, Ref } from "effect"
import type { ProviderStatus, ProviderUpdateStatus } from "@meldshell/contracts"
import type { CommandResult } from "@meldshell/provider-runtime/command"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import {
  compareVersions,
  cursorInstallerVersion,
  lastLine,
  makeProviderUpdates,
  npmVersion,
  planUpdate,
  ProviderUpdates,
  type UpdatePlan,
} from "./provider-updates"
import {
  ClaudeProvider,
  CodexProvider,
  CursorProvider,
  type ProviderService,
} from "./worker-provider"

test("versions compare by their numbers, and Cursor builds from one day by their text", () => {
  assert.equal(compareVersions("0.156.1", "0.157.0"), "behind")
  assert.equal(compareVersions("0.9.1", "0.10.0"), "behind")
  assert.equal(compareVersions("0.157.0", "0.157.0"), "current")
  assert.equal(compareVersions("0.158.0", "0.157.0"), "ahead")
  assert.equal(compareVersions("2026.09.18-9a7762b", "2026.09.23-86fc751"), "behind")
  assert.equal(compareVersions("2026.09.23-86fc751", "2026.09.23-86fc751"), "current")
  assert.equal(compareVersions("2026.09.23-11aa22b", "2026.09.23-86fc751"), "behind")
})

test("release feeds are read from npm documents and the Cursor installer", () => {
  assert.equal(npmVersion('{"name":"@openai/codex","version":"0.157.0"}'), "0.157.0")
  assert.equal(npmVersion("<html>"), null)
  assert.equal(npmVersion('{"version":""}'), null)
  assert.equal(
    cursorInstallerVersion(
      'DOWNLOAD_URL="https://downloads.cursor.com/lab/2026.09.23-86fc751/${OS}/${ARCH}/agent-cli-package.tar.gz"',
    ),
    "2026.09.23-86fc751",
  )
  assert.equal(cursorInstallerVersion("echo nothing"), null)
})

test("the updater follows how the executable was installed", () => {
  assert.deepEqual(
    planUpdate(
      "codex",
      "/home/me/.local/bin/codex",
      "/home/me/.codex/packages/standalone/bin/codex",
    ),
    { plan: { file: "/home/me/.local/bin/codex", args: ["update"], display: "codex update" } },
  )
  assert.deepEqual(
    planUpdate(
      "claude-code",
      "/opt/homebrew/bin/claude",
      "/opt/homebrew/Caskroom/claude-code@latest/2.1.282/claude",
    ),
    {
      plan: {
        file: "brew",
        args: ["upgrade", "--cask", "claude-code@latest"],
        display: "brew upgrade --cask claude-code@latest",
      },
    },
  )
  assert.deepEqual(
    planUpdate("codex", "/usr/local/bin/codex", "/usr/local/Cellar/codex/0.157.0/bin/codex"),
    {
      plan: {
        file: "brew",
        args: ["upgrade", "--formula", "codex"],
        display: "brew upgrade --formula codex",
      },
    },
  )
  const system = planUpdate("claude-code", "/usr/bin/claude", "/usr/bin/claude")
  assert.ok("manual" in system && /system package manager/.test(system.manual))
  assert.deepEqual(
    planUpdate(
      "cursor",
      "C:\\Users\\me\\AppData\\Local\\cursor-agent\\node.exe",
      "C:\\Users\\me\\AppData\\Local\\cursor-agent\\node.exe",
    ),
    {
      plan: {
        file: "C:\\Users\\me\\AppData\\Local\\cursor-agent\\node.exe",
        args: ["C:\\Users\\me\\AppData\\Local\\cursor-agent\\index.js", "update"],
        display: "agent update",
        env: { CURSOR_INVOKED_AS: "cursor-agent" },
      },
    },
  )
  assert.equal(
    lastLine({ stdout: "Updating...\n\u001b[32mDone 0.157.0\u001b[0m\n", stderr: "" }),
    "Done 0.157.0",
  )
})

const codexStatus = (version: string | null): ProviderStatus => ({
  provider: "openai",
  harness: "codex",
  availability: version === null ? "missing" : "ready",
  executablePath: version === null ? null : "/home/me/.local/bin/codex",
  version,
  detail: "",
  checkedAt: new Date(0).toISOString(),
})

/** The service over a fake Codex worker whose probe, after an update, reports `afterUpdate`. */
const harness = async (world: {
  readonly latest: string
  readonly run?: (plan: UpdatePlan) => Promise<CommandResult>
  readonly afterUpdate?: string
  readonly activeTurns?: number
}) => {
  const version = await Effect.runPromise(Ref.make<string | null>("0.156.1"))
  const published: ProviderUpdateStatus[] = []
  const reloads: string[] = []
  const ran: UpdatePlan[] = []
  let events: typeof HostEvents.Service | undefined
  const reload = (how: string) =>
    Effect.gen(function* () {
      reloads.push(how)
      const next = world.afterUpdate ?? null
      yield* Ref.set(version, next)
      yield* events!.publish({ _tag: "ProviderStatusChanged", status: codexStatus(next) })
    })
  const provider = {
    status: Ref.get(version).pipe(Effect.map(codexStatus)),
    restart: reload("restart"),
    refresh: reload("refresh"),
  } as unknown as ProviderService
  const core = {
    GetActiveTurnCount: () => Effect.succeed(world.activeTurns ?? 0),
  } as unknown as CoreClient
  const base = Layer.mergeAll(
    Layer.succeed(CodexProvider, provider),
    Layer.succeed(ClaudeProvider, provider),
    Layer.succeed(CursorProvider, provider),
    Layer.succeed(CoreClient, core),
    HostEvents.Default,
  )
  const runtime = ManagedRuntime.make(
    Layer.scoped(
      ProviderUpdates,
      makeProviderUpdates({
        fetchText: async () => JSON.stringify({ version: world.latest }),
        run:
          world.run ??
          (async (plan) => {
            ran.push(plan)
            return { exitCode: 0, stdout: "Codex updated.", stderr: "" }
          }),
        resolvePath: async (path) => path,
        now: () => 1_000,
      }),
    ).pipe(Layer.provideMerge(base)),
  )
  events = await runtime.runPromise(HostEvents)
  const listener = runtime.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        const queue = yield* events!.subscribe
        yield* Effect.forever(
          Effect.flatMap(queue.take, (event) =>
            Effect.sync(() => {
              if (event._tag === "ProviderUpdateChanged") published.push(event.status)
            }),
          ),
        )
      }),
    ),
  )
  const service = await runtime.runPromise(ProviderUpdates)
  const dispose = async () => {
    await Effect.runPromise(Fiber.interrupt(listener))
    await runtime.dispose()
  }
  return { service, published, reloads, ran, runtime, dispose }
}

const waitFor = async (
  published: ProviderUpdateStatus[],
  matches: (status: ProviderUpdateStatus) => boolean,
): Promise<ProviderUpdateStatus> => {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const found = published.find(matches)
    if (found !== undefined) return found
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`No published status matched. Saw: ${published.map((s) => s.state).join(", ")}`)
}

test("a check compares the installed version with the release feed", async () => {
  const { service, runtime, dispose } = await harness({ latest: "0.157.0" })
  try {
    const status = await runtime.runPromise(service.check("codex"))
    assert.equal(status.state, "available")
    assert.equal(status.installedVersion, "0.156.1")
    assert.equal(status.latestVersion, "0.157.0")
    assert.equal(status.command, "codex update")
    assert.equal(status.canUpdate, true)
    assert.match(status.message, /Codex 0\.157\.0 is available/)
    assert.deepEqual(await runtime.runPromise(service.status("codex")), status)
  } finally {
    await dispose()
  }
})

test("an install runs the updater, reloads the idle harness, and reports the new version", async () => {
  const { service, published, reloads, ran, runtime, dispose } = await harness({
    latest: "0.157.0",
    afterUpdate: "0.157.0",
  })
  try {
    await runtime.runPromise(service.check("codex"))
    const started = await runtime.runPromise(service.install("codex"))
    assert.equal(started.state, "updating")
    assert.match(started.message, /Running codex update/)
    const final = await waitFor(published, (status) => status.state === "current")
    assert.deepEqual(
      ran.map((plan) => plan.args),
      [["update"]],
    )
    assert.deepEqual(reloads, ["restart"])
    assert.equal(final.installedVersion, "0.157.0")
    assert.match(final.message, /Codex 0\.157\.0 is installed\./)
  } finally {
    await dispose()
  }
})

test("a failed updater reports its last line and leaves the harness alone", async () => {
  const { service, published, reloads, runtime, dispose } = await harness({
    latest: "0.157.0",
    run: async () => ({ exitCode: 1, stdout: "", stderr: "npm ERR! EACCES permission denied" }),
  })
  try {
    await runtime.runPromise(service.install("codex"))
    const final = await waitFor(published, (status) => status.state === "error")
    assert.match(final.message, /codex update failed: npm ERR! EACCES permission denied/)
    assert.deepEqual(reloads, [])
  } finally {
    await dispose()
  }
})

test("running turns keep the harness alive and the outcome says so", async () => {
  const { service, published, reloads, runtime, dispose } = await harness({
    latest: "0.157.0",
    afterUpdate: "0.157.0",
    activeTurns: 2,
  })
  try {
    await runtime.runPromise(service.install("codex"))
    const final = await waitFor(published, (status) => status.state === "current")
    assert.deepEqual(reloads, ["refresh"])
    assert.match(final.message, /Turns that were running keep the previous version/)
  } finally {
    await dispose()
  }
})

test("an updater that changes nothing reports what it said", async () => {
  const { service, published, runtime, dispose } = await harness({
    latest: "0.157.0",
    afterUpdate: "0.156.1",
    run: async () => ({ exitCode: 0, stdout: "Claude is up to date!", stderr: "" }),
  })
  try {
    await runtime.runPromise(service.install("codex"))
    const final = await waitFor(published, (status) => status.state === "available")
    assert.match(
      final.message,
      /still 0\.156\.1 after the update; its updater said: Claude is up to date!/,
    )
  } finally {
    await dispose()
  }
})
