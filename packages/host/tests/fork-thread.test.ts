import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "effect/sql/SqlClient"
import { Effect } from "effect"
import type { TurnDispatch } from "@meldshell/contracts"
import {
  deleteThread,
  forkThread,
  getSnapshot,
  getTranscript,
  initializeDatabase,
  previewHandoff,
  recordRuntimeEvent,
  setProviderSession,
  submitTurn,
} from "@meldshell/core"
import {
  captureSnapshot,
  checkoutTurnSnapshot,
  copyTurnSnapshots,
  readTurnSnapshot,
  turnSnapshotRef,
} from "../src/turn-snapshots"
import { createWorktree } from "../src/worktrees"

const setup = Effect.gen(function* () {
  yield* initializeDatabase
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO workspaces (id, path, name, created_at, last_opened_at) VALUES ('workspace', '/tmp/fork-test', 'test', 'now', 'now')`
  yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at, title_locked) VALUES ('thread', 'workspace', 'Login page', 'active', 'now', 'now', 1)`
  const [provider] = yield* sql<{ id: string }>`SELECT id FROM providers WHERE harness = 'codex'`
  yield* sql`INSERT INTO provider_models (id, provider_id, slug, display_name) VALUES ('codex', ${provider!.id}, 'codex-model', 'Fixture')`
  yield* sql`INSERT INTO thread_settings (thread_id, provider_id, model_id, reasoning_effort) VALUES ('thread', ${provider!.id}, 'codex', 'high')`
})

const runTurn = (threadId: string, text: string, reply: string) =>
  Effect.gen(function* () {
    const dispatch = (yield* submitTurn({ threadId, text })).dispatch as TurnDispatch
    const event = (method: string, params: unknown) =>
      recordRuntimeEvent({
        threadId,
        turnId: dispatch.turnId,
        method,
        params,
        validated: true,
        promoteQueue: false,
      })
    yield* setProviderSession(threadId, `session-${dispatch.turnId}`, "codex")
    yield* event("item/completed", {
      item: { type: "agentMessage", id: `${dispatch.turnId}:m`, text: reply },
    })
    yield* event("turn/completed", { turn: { status: "completed" } })
    return dispatch
  })

const worktree = { path: "/tmp/fork-test-worktree", branch: "meldshell/fork", baseBranch: "main" }

const messages = (threadId: string) =>
  Effect.gen(function* () {
    const page = yield* getTranscript({ threadId })
    return page.events.filter((event) => event.kind === "user").map((event) => event.text)
  })

test("a fork copies the turns up to a point and starts its own session from a summary", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setup
      const first = yield* runTurn("thread", "Add a login page", "Added the login form.")
      const second = yield* runTurn("thread", "Use a modal instead", "Moved it into a modal.")
      yield* runTurn("thread", "Add tests", "Tests pass.")

      // From before a message: the turns before it, and the message itself to rewrite.
      const before = yield* forkThread({
        threadId: "thread",
        turnId: second.turnId,
        point: "before",
        worktree,
      })
      assert.equal(before.text, "Use a modal instead")
      assert.equal(before.turns.length, 1)
      assert.equal(before.turns[0]?.from, first.turnId)
      assert.deepEqual(yield* messages(before.threadId), ["Add a login page"])
      const fork = before.snapshot.threads.find((thread) => thread.id === before.threadId)!
      assert.deepEqual(fork.fork, { threadId: "thread", title: "Login page", fresh: true })
      assert.equal(fork.worktree?.path, worktree.path)
      assert.equal(fork.turnCount, 1)
      const settings = before.snapshot.threadSettings.find((entry) => entry.threadId === fork.id)
      assert.equal(settings?.reasoningEffort, "high")

      // The fork never shares the original's provider session.
      const preview = yield* previewHandoff(before.threadId)
      assert.equal(preview?.reason, "fork")
      assert.equal(preview?.forkedFrom, "Login page")
      const own = yield* runTurn(before.threadId, "Use a full page with a sidebar", "Done.")
      assert.equal(own.nativeThreadId, null)
      assert.equal(own.context, preview?.brief)
      assert.match(own.context ?? "", /forked from another conversation/)
      assert.match(own.context ?? "", /Add a login page/)
      assert.doesNotMatch(own.context ?? "", /modal/)
      const after = (yield* getSnapshot).threads.find((thread) => thread.id === before.threadId)
      assert.equal(after?.fork?.fresh, false)
      assert.equal(yield* previewHandoff(before.threadId), null)

      // From a reply: the whole turn is kept and nothing returns to the composer.
      const whole = yield* forkThread({
        threadId: "thread",
        turnId: second.turnId,
        point: "after",
        worktree: { ...worktree, path: `${worktree.path}-2` },
      })
      assert.equal(whole.text, "")
      assert.deepEqual(yield* messages(whole.threadId), ["Add a login page", "Use a modal instead"])
      // The original is left as it was.
      assert.deepEqual(yield* messages("thread"), [
        "Add a login page",
        "Use a modal instead",
        "Add tests",
      ])

      // The fork keeps its own copy of the turns once the original is deleted.
      const snapshot = yield* deleteThread("thread")
      const orphan = snapshot.threads.find((thread) => thread.id === whole.threadId)
      assert.deepEqual(orphan?.fork, { threadId: null, title: "Login page", fresh: true })
      assert.equal((yield* messages(whole.threadId)).length, 2)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  )
})

test("a fork from before the first message carries no turns", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setup
      const first = yield* runTurn("thread", "Add a login page", "Added the login form.")
      const fork = yield* forkThread({
        threadId: "thread",
        turnId: first.turnId,
        point: "before",
        worktree,
      })
      assert.equal(fork.turns.length, 0)
      assert.equal(fork.text, "Add a login page")
      assert.equal(yield* previewHandoff(fork.threadId), null)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  )
})

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim()

test("a fork's worktree starts with the files the original had at that point", async () => {
  const root = await mkdtemp(join(tmpdir(), "meldshell-fork-"))
  const worktrees = await mkdtemp(join(tmpdir(), "meldshell-fork-worktrees-"))
  try {
    git(root, "init", "--quiet")
    git(root, "config", "user.name", "Test")
    git(root, "config", "user.email", "test@example.com")
    await writeFile(join(root, "app.txt"), "one\n")
    git(root, "add", ".")
    git(root, "commit", "--quiet", "-m", "initial")

    const ref = (point: "before" | "after") => turnSnapshotRef("thread", "turn-1", point)
    assert.equal(await captureSnapshot(root, ref("before")), true)
    await writeFile(join(root, "app.txt"), "two\n")
    await writeFile(join(root, "notes.txt"), "uncommitted\n")
    assert.equal(await captureSnapshot(root, ref("after")), true)
    // Later work in the original must not reach a fork from this turn.
    await writeFile(join(root, "app.txt"), "three\n")
    git(root, "commit", "--quiet", "-am", "later")

    const made = await createWorktree(root, worktrees, undefined, root)
    assert.equal(git(made.path, "rev-parse", "HEAD"), git(root, "rev-parse", "HEAD"))
    assert.equal(await checkoutTurnSnapshot(made.path, "thread", "turn-1", "after"), true)
    assert.equal(await readFile(join(made.path, "app.txt"), "utf8"), "two\n")
    assert.equal(await readFile(join(made.path, "notes.txt"), "utf8"), "uncommitted\n")
    assert.equal(git(made.path, "diff", "--cached", "--name-only"), "")
    assert.equal(await readFile(join(root, "app.txt"), "utf8"), "three\n")

    const other = await createWorktree(root, worktrees, undefined, root)
    assert.equal(await checkoutTurnSnapshot(other.path, "thread", "turn-1", "before"), true)
    assert.equal(await readFile(join(other.path, "app.txt"), "utf8"), "one\n")
    assert.equal(existsSync(join(other.path, "notes.txt")), false)
    assert.equal(await checkoutTurnSnapshot(other.path, "thread", "missing", "before"), false)

    // The fork's copy of the turn restores from the same snapshots.
    await copyTurnSnapshots(root, "thread", "fork", [{ from: "turn-1", to: "copy-1" }])
    const copied = await readTurnSnapshot(made.path, "fork", "copy-1")
    assert.equal(copied.before && copied.after, true)
    assert.match(copied.patch ?? "", /\+two/)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(worktrees, { recursive: true, force: true })
  }
})
