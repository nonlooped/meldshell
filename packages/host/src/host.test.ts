import assert from "node:assert/strict"
import { test } from "node:test"
import { EventEmitter } from "node:events"
import { fork } from "node:child_process"
import { fileURLToPath } from "node:url"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AppSnapshot, SubmitTurnResult, TranscriptPage } from "@meldshell/contracts"
import { IPC } from "@meldshell/contracts"
import type { HostProcess } from "./platform"
import { startHost, type Host } from "./host"

const coreProcesses: ReturnType<typeof fork>[] = []

const fakeProviders = (
  entry: string,
  _label: string,
  env?: Record<string, string>,
): HostProcess => {
  if (entry === "core-worker.js") {
    const child = fork(fileURLToPath(new URL("./fixtures/core.ts", import.meta.url)), [], {
      execArgv: ["--import", "tsx"],
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    })
    coreProcesses.push(child)
    return {
      get pid() {
        return child.pid
      },
      stdout: child.stdout,
      stderr: child.stderr,
      postMessage: (value) => {
        child.send(value as object)
      },
      kill: () => child.kill(),
      on: (_event, listener) => child.on("message", listener),
      once: (_event, listener) => child.once("exit", listener),
      off: (event: "message" | "exit", listener: (...args: unknown[]) => void) =>
        child.off(event, listener),
    } as HostProcess
  }
  const events = new EventEmitter()
  let killed = false
  return {
    pid: undefined,
    stdout: null,
    stderr: null,
    on: (event, listener) => events.on(event, listener),
    once: (event, listener) => events.once(event, listener),
    off: (event: "message" | "exit", listener: (...args: unknown[]) => void) =>
      events.off(event, listener),
    postMessage: (raw) => {
      const command = raw as { commandId: string }
      queueMicrotask(() =>
        events.emit("message", { type: "command-ack", commandId: command.commandId }),
      )
    },
    kill: () => {
      if (!killed) {
        killed = true
        events.emit("exit", 0)
      }
      return true
    },
  } as HostProcess
}

test("host state survives restart and remote commands run through the shared API", {
  timeout: 30_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-host-"))
  const platform = {
    databasePath: join(directory, "meldshell.sqlite"),
    notify: () => undefined,
    fork: fakeProviders,
  }
  let host: Host | undefined
  try {
    host = await startHost(directory, platform)
    const workspace = await host.addWorkspace(directory)
    const created = (await host.call(IPC.createThread, [
      { workspaceId: workspace.workspaces[0]!.id, title: "Remote thread" },
    ])) as AppSnapshot
    const provider = created.providers.find((entry) => entry.harness === "codex")!
    const catalog = (await host.call(IPC.upsertModel, [
      { providerId: provider.id, slug: "test-model", displayName: "Test model" },
    ])) as AppSnapshot
    const threadId = created.threads[0]!.id
    await host.call(IPC.setThreadSettings, [
      { threadId, providerId: provider.id, modelId: catalog.models[0]!.id },
    ])
    const submitted = (await host.call(IPC.submitTurn, [
      { threadId, text: "One submission" },
    ])) as SubmitTurnResult
    assert.equal(submitted.disposition, "started")
    const queued = await host.call(IPC.submitTurn, [{ threadId, text: "One queued message" }])
    assert.equal((queued as SubmitTurnResult).disposition, "queued")
    const transcript = (await host.call(IPC.getTranscript, [{ threadId }])) as TranscriptPage
    assert.equal(transcript.events.filter((event) => event.text === "One submission").length, 1)

    await host.close()
    // Windows cannot delete or reopen the database until the core process that holds it has exited.
    assert.ok(coreProcesses.every((child) => child.exitCode !== null || child.signalCode !== null))
    host = await startHost(directory, platform)
    const recovered = (await host.call(IPC.getSnapshot, [])) as AppSnapshot
    assert.equal(recovered.threads[0]!.turnCount, 1)
    assert.equal(recovered.threads[0]!.queuedCount, 1)
    await assert.rejects(host.call("meldshell:add-workspace", []), /only available/)
  } finally {
    await host?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
