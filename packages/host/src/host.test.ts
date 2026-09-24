import assert from "node:assert/strict"
import { test } from "node:test"
import { EventEmitter } from "node:events"
import { fork } from "node:child_process"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AppSnapshot, SubmitTurnResult, TranscriptPage } from "@meldshell/contracts"
import { IPC } from "@meldshell/contracts"
import type { GitSnapshot, WorktreeStatus } from "@meldshell/contracts/ipc"
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

test("isolated threads work in their own worktree until merged or removed", {
  timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-worktree-"))
  const repository = join(directory, "repo")
  const run = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
  const platform = {
    databasePath: join(directory, "data", "meldshell.sqlite"),
    notify: () => undefined,
    fork: fakeProviders,
  }
  let host: Host | undefined
  try {
    execFileSync("git", ["init", "-q", "-b", "main", repository])
    run(repository, "config", "user.email", "test@example.com")
    run(repository, "config", "user.name", "Test")
    await writeFile(join(repository, "a.txt"), "one\n")
    run(repository, "add", ".")
    run(repository, "commit", "-q", "-m", "first")

    host = await startHost(directory, platform)
    const workspaceId = (await host.addWorkspace(repository)).workspaces[0]!.id
    const created = (await host.call(IPC.createThread, [
      { workspaceId, title: "Isolated", isolated: true },
    ])) as AppSnapshot
    const thread = created.threads.find((entry) => entry.title === "Isolated")!
    const worktree = thread.worktree!
    assert.equal(worktree.state, "ready")
    assert.equal(worktree.baseBranch, "main")
    assert.match(worktree.branch, /^meldshell\/[0-9a-f]{8}$/)
    assert.ok((await stat(join(worktree.path, "a.txt"))).isFile())

    // A draft thread can move onto its own branch and back until it sends its first message.
    const drafted = (await host.call(IPC.createThread, [
      { workspaceId, title: "Draft" },
    ])) as AppSnapshot
    const draftId = drafted.threads.find((entry) => entry.title === "Draft")!.id
    const isolated = (await host.call(IPC.setThreadIsolated, [
      { threadId: draftId, isolated: true },
    ])) as AppSnapshot
    const draftWorktree = isolated.threads.find((entry) => entry.id === draftId)!.worktree!
    assert.equal(draftWorktree.state, "ready")
    const shared = (await host.call(IPC.setThreadIsolated, [
      { threadId: draftId, isolated: false },
    ])) as AppSnapshot
    assert.equal(shared.threads.find((entry) => entry.id === draftId)!.worktree, undefined)
    await assert.rejects(stat(draftWorktree.path))
    assert.equal(run(repository, "branch", "--list", draftWorktree.branch), "")

    // Turns and Git requests for the thread use its worktree rather than the workspace folder.
    const provider = created.providers.find((entry) => entry.harness === "codex")!
    const catalog = (await host.call(IPC.upsertModel, [
      { providerId: provider.id, slug: "test-model", displayName: "Test model" },
    ])) as AppSnapshot
    await host.call(IPC.setThreadSettings, [
      { threadId: thread.id, providerId: provider.id, modelId: catalog.models[0]!.id },
    ])
    const submitted = (await host.call(IPC.submitTurn, [
      { threadId: thread.id, text: "Work here" },
    ])) as SubmitTurnResult
    assert.equal(submitted.dispatch?.workspacePath, worktree.path)
    await assert.rejects(
      host.call(IPC.setThreadIsolated, [{ threadId: thread.id, isolated: false }]),
      /before its first message/,
    )
    const git = (await host.call(IPC.getGitSnapshot, [
      { workspaceId, threadId: thread.id, limit: 10 },
    ])) as GitSnapshot
    assert.equal(git.branch, worktree.branch)

    await writeFile(join(worktree.path, "a.txt"), "two\n")
    await assert.rejects(host.call(IPC.mergeWorktree, [thread.id]), /Commit or discard/)
    run(worktree.path, "commit", "-q", "-am", "second")
    const status = (await host.call(IPC.getWorktreeStatus, [thread.id])) as WorktreeStatus
    assert.deepEqual(status, {
      branch: worktree.branch,
      baseBranch: "main",
      changes: 0,
      unmerged: 1,
    })
    await host.call(IPC.mergeWorktree, [thread.id])
    assert.equal(run(repository, "log", "-1", "--format=%s"), "second")

    // A conflicting merge is undone rather than left in the workspace.
    await writeFile(join(worktree.path, "a.txt"), "three\n")
    run(worktree.path, "commit", "-q", "-am", "third")
    await writeFile(join(repository, "a.txt"), "conflict\n")
    run(repository, "commit", "-q", "-am", "main change")
    await assert.rejects(host.call(IPC.mergeWorktree, [thread.id]), /conflicts with main/)
    assert.equal(run(repository, "status", "--porcelain"), "")

    // Interrupting settles the running turn so the worktree can be removed.
    await host.call(IPC.interruptTurn, [thread.id])
    const removed = (await host.call(IPC.removeWorktree, [
      { threadId: thread.id, deleteBranch: true },
    ])) as AppSnapshot
    assert.equal(
      removed.threads.find((entry) => entry.id === thread.id)?.worktree?.state,
      "removed",
    )
    await assert.rejects(stat(worktree.path))
    assert.equal(run(repository, "branch", "--list", worktree.branch), "")
    await assert.rejects(
      host.call(IPC.submitTurn, [{ threadId: thread.id, text: "Again" }]),
      /worktree was removed/,
    )

    // A worktree deleted outside MeldShell is marked missing on the next start.
    const other = (await host.call(IPC.createThread, [
      { workspaceId, title: "Other", isolated: true },
    ])) as AppSnapshot
    const otherThread = other.threads.find((entry) => entry.title === "Other")!
    const otherWorktree = otherThread.worktree!
    await writeFile(join(otherWorktree.path, "draft.txt"), "unsaved\n")
    await assert.rejects(host.call(IPC.deleteThread, [otherThread.id]), /uncommitted changes/)
    await host.close()
    await rm(otherWorktree.path, { recursive: true, force: true })
    host = await startHost(directory, platform)
    let state: string | undefined
    for (let attempt = 0; attempt < 50 && state !== "missing"; attempt++) {
      const snapshot = (await host.call(IPC.getSnapshot, [])) as AppSnapshot
      state = snapshot.threads.find((entry) => entry.title === "Other")?.worktree?.state
      if (state !== "missing") await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(state, "missing")
  } finally {
    await host?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
