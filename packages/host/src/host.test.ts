import assert from "node:assert/strict"
import { test } from "node:test"
import { EventEmitter } from "node:events"
import { fork } from "node:child_process"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  AppSnapshot,
  SubmitTurnResult,
  TranscriptPage,
  TurnDispatch,
} from "@meldshell/contracts"
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
      const command = raw as { commandId: string; type?: string; dispatch?: TurnDispatch }
      queueMicrotask(() => {
        events.emit("message", { type: "command-ack", commandId: command.commandId })
        if (command.type === "start-turn" && command.dispatch !== undefined)
          for (const event of turnEvents(command.dispatch)) events.emit("message", event)
      })
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

/** What the fake workers report for each turn they start; empty unless a test sets it. */
let turnEvents: (dispatch: TurnDispatch) => readonly unknown[] = () => []

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
    const workspace = (await host.call(IPC.addWorkspacePath, [directory])) as AppSnapshot
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
    const initRepository = async (path: string) => {
      execFileSync("git", ["init", "-q", "-b", "main", path])
      run(path, "config", "user.email", "test@example.com")
      run(path, "config", "user.name", "Test")
      await writeFile(join(path, "a.txt"), "one\n")
      run(path, "add", ".")
      run(path, "commit", "-q", "-m", "first")
    }
    await initRepository(repository)

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
    const isolated = (await host.call(IPC.setDraftLocation, [
      { threadId: draftId, isolated: true },
    ])) as AppSnapshot
    const draftWorktree = isolated.threads.find((entry) => entry.id === draftId)!.worktree!
    assert.equal(draftWorktree.state, "ready")
    const shared = (await host.call(IPC.setDraftLocation, [
      { threadId: draftId, isolated: false },
    ])) as AppSnapshot
    assert.equal(shared.threads.find((entry) => entry.id === draftId)!.worktree, undefined)
    await assert.rejects(stat(draftWorktree.path))
    assert.equal(run(repository, "branch", "--list", draftWorktree.branch), "")

    // Moving a draft to another workspace recreates its worktree in that repository.
    const otherRepository = join(directory, "other")
    await initRepository(otherRepository)
    const otherWorkspaceId = (await host.addWorkspace(otherRepository)).workspaces.find(
      (entry) => entry.path === otherRepository,
    )!.id
    const reisolated = (await host.call(IPC.setDraftLocation, [
      { threadId: draftId, isolated: true },
    ])) as AppSnapshot
    const firstWorktree = reisolated.threads.find((entry) => entry.id === draftId)!.worktree!
    const moved = (await host.call(IPC.setDraftLocation, [
      { threadId: draftId, workspaceId: otherWorkspaceId },
    ])) as AppSnapshot
    const movedThread = moved.threads.find((entry) => entry.id === draftId)!
    assert.equal(movedThread.workspaceId, otherWorkspaceId)
    assert.notEqual(movedThread.worktree?.path, firstWorktree.path)
    await assert.rejects(stat(firstWorktree.path))
    assert.notEqual(run(otherRepository, "branch", "--list", movedThread.worktree!.branch), "")

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
      host.call(IPC.setDraftLocation, [{ threadId: thread.id, isolated: false }]),
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

test("the workspace setup script prepares new worktrees and holds turns until it finishes", {
  timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-setup-"))
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
    // Node runs the same script under every platform shell. It copies an ignored file from the
    // main checkout, then waits for `go` and exits with the code in `exit-code`, if any.
    await writeFile(
      join(repository, "setup.cjs"),
      [
        'const fs = require("node:fs")',
        'const path = require("node:path")',
        "const root = process.env.MELDSHELL_ROOT_PATH",
        'fs.copyFileSync(path.join(root, ".env"), ".env")',
        'fs.writeFileSync("port.txt", process.env.MELDSHELL_PORT)',
        'process.stdout.write("\\x1b[32mprepared\\x1b[0m\\n10%\\r100%\\n")',
        "const wait = () =>",
        '  fs.existsSync(path.join(root, "go"))',
        '    ? process.exit(Number(fs.readFileSync(path.join(root, "go"), "utf8") || 0))',
        "    : setTimeout(wait, 50)",
        "wait()",
      ].join("\n"),
    )
    await writeFile(join(repository, ".gitignore"), ".env\nport.txt\ngo\nmeldshell.json\n")
    run(repository, "add", ".")
    run(repository, "commit", "-q", "-m", "first")
    await writeFile(join(repository, ".env"), "SECRET=1\n")
    await writeFile(
      join(repository, "meldshell.json"),
      JSON.stringify({
        scripts: {
          setup: "node setup.cjs",
          run: { app: "npm run dev", docs: "npm run docs", unused: " " },
        },
      }),
    )

    host = await startHost(directory, platform)
    const current = host
    const workspaceId = (await host.addWorkspace(repository)).workspaces[0]!.id
    // Named run scripts keep the file's order; empty ones are left out.
    assert.deepEqual(await host.call(IPC.getWorkspaceScripts, [{ workspaceId }]), {
      setup: "node setup.cjs",
      run: [
        { name: "app", command: "npm run dev" },
        { name: "docs", command: "npm run docs" },
      ],
    })
    const created = (await host.call(IPC.createThread, [
      { workspaceId, title: "Setup", isolated: true },
    ])) as AppSnapshot
    const thread = created.threads.find((entry) => entry.title === "Setup")!
    const worktree = thread.worktree!
    assert.equal(worktree.setup, "running")

    const setupState = async () =>
      ((await current.call(IPC.getSnapshot, [])) as AppSnapshot).threads.find(
        (entry) => entry.id === thread.id,
      )?.worktree?.setup
    const waitFor = async (check: () => Promise<boolean>) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await check()) return
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      assert.fail(`Timed out waiting for the setup script: ${JSON.stringify(await log())}`)
    }
    const log = async () =>
      ((await current.call(IPC.getWorktreeSetupLog, [thread.id])) as { text: string }).text

    // Turns wait for the setup script; its output is readable while it runs.
    const provider = created.providers.find((entry) => entry.harness === "codex")!
    const catalog = (await host.call(IPC.upsertModel, [
      { providerId: provider.id, slug: "test-model", displayName: "Test model" },
    ])) as AppSnapshot
    await host.call(IPC.setThreadSettings, [
      { threadId: thread.id, providerId: provider.id, modelId: catalog.models[0]!.id },
    ])
    await assert.rejects(
      host.call(IPC.submitTurn, [{ threadId: thread.id, text: "Too soon" }]),
      /setup script is still running/,
    )
    await waitFor(async () => (await log()).includes("prepared"))
    const running = await log()
    assert.match(running, /^\$ node setup\.cjs\n/)
    assert.match(running, /\nprepared\n100%\n/)
    assert.ok(!running.includes("\u001b") && !running.includes("10%"))

    await writeFile(join(repository, "go"), "")
    await waitFor(async () => (await setupState()) === "succeeded")
    assert.equal(await readFile(join(worktree.path, ".env"), "utf8"), "SECRET=1\n")
    const port = Number(await readFile(join(worktree.path, "port.txt"), "utf8"))
    assert.ok(port >= 20_000 && port < 60_000 && port % 10 === 0)
    assert.match(await log(), /Exited with code 0\.\n$/)

    // A failing script is recorded as failed with its exit code, and can run again.
    await writeFile(join(repository, "go"), "3")
    await host.call(IPC.rerunWorktreeSetup, [thread.id])
    await waitFor(async () => (await setupState()) === "failed")
    assert.match(await log(), /Exited with code 3\.\n$/)

    // Stopping a running script records it as interrupted.
    await rm(join(repository, "go"))
    await host.call(IPC.rerunWorktreeSetup, [thread.id])
    await assert.rejects(
      host.call(IPC.rerunWorktreeSetup, [thread.id]),
      /setup script is already running/,
    )
    await host.call(IPC.stopWorktreeSetup, [thread.id])
    assert.equal(await setupState(), "interrupted")
    assert.match(await log(), /Stopped\.\n$/)

    // Once setup has ended, the thread starts turns in its prepared worktree.
    const submitted = (await host.call(IPC.submitTurn, [
      { threadId: thread.id, text: "Work here" },
    ])) as SubmitTurnResult
    assert.equal(submitted.dispatch?.workspacePath, worktree.path)
    await host.call(IPC.interruptTurn, [thread.id])

    // A lone run command is named `run`.
    await writeFile(
      join(repository, "meldshell.json"),
      JSON.stringify({ scripts: { run: "npm start" } }),
    )
    assert.deepEqual(await host.call(IPC.getWorkspaceScripts, [{ workspaceId }]), {
      setup: null,
      run: [{ name: "run", command: "npm start" }],
    })

    // A setup file that cannot be read fails the setup with the reason in its log.
    await writeFile(join(repository, "meldshell.json"), "{ not json")
    const broken = (await host.call(IPC.createThread, [
      { workspaceId, title: "Broken", isolated: true },
    ])) as AppSnapshot
    const brokenThread = broken.threads.find((entry) => entry.title === "Broken")!
    assert.equal(brokenThread.worktree?.setup, "failed")
    assert.match(
      ((await host.call(IPC.getWorktreeSetupLog, [brokenThread.id])) as { text: string }).text,
      /meldshell\.json is not valid JSON/,
    )

    // Removing a worktree removes its setup log too.
    await host.call(IPC.removeWorktree, [{ threadId: thread.id, deleteBranch: true }])
    await assert.rejects(stat(`${worktree.path}.setup.log`))
  } finally {
    await host?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test("typed worker events reach the transcript and settle the turn", {
  timeout: 30_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-events-"))
  const platform = {
    databasePath: join(directory, "meldshell.sqlite"),
    notify: () => undefined,
    fork: fakeProviders,
  }
  const event = (dispatch: TurnDispatch, method: string, params: unknown) => ({
    type: "runtime-event",
    input: {
      threadId: dispatch.threadId,
      turnId: dispatch.turnId,
      validated: true,
      method,
      params,
    },
  })
  turnEvents = (dispatch) => [
    event(dispatch, "item/agentMessage/delta", { itemId: "answer", delta: "Hel" }),
    event(dispatch, "item/agentMessage/delta", { itemId: "answer", delta: "lo" }),
    // A malformed event is refused as a whole; the worker's later events still arrive.
    { type: "runtime-event", input: { threadId: dispatch.threadId } },
    event(dispatch, "turn/completed", { turn: { status: "completed" } }),
  ]
  let host: Host | undefined
  try {
    host = await startHost(directory, platform)
    const workspace = await host.addWorkspace(directory)
    const created = (await host.call(IPC.createThread, [
      { workspaceId: workspace.workspaces[0]!.id, title: "Events" },
    ])) as AppSnapshot
    const provider = created.providers.find((entry) => entry.harness === "codex")!
    const catalog = (await host.call(IPC.upsertModel, [
      { providerId: provider.id, slug: "test-model", displayName: "Test model" },
    ])) as AppSnapshot
    const threadId = created.threads[0]!.id
    await host.call(IPC.setThreadSettings, [{ threadId, modelId: catalog.models[0]!.id }])
    await host.call(IPC.submitTurn, [{ threadId, text: "Say hello" }])
    let snapshot: AppSnapshot | undefined
    for (let attempt = 0; attempt < 100; attempt++) {
      snapshot = (await host.call(IPC.getSnapshot, [])) as AppSnapshot
      if (snapshot.threads[0]?.activity === "completed") break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(snapshot?.threads[0]?.activity, "completed")
    const transcript = (await host.call(IPC.getTranscript, [{ threadId }])) as TranscriptPage
    assert.equal(
      transcript.events
        .filter((entry) => entry.kind === "assistant")
        .map((entry) => entry.text)
        .join(""),
      "Hello",
    )
  } finally {
    turnEvents = () => []
    await host?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
