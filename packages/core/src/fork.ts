import * as SqlClient from "effect/sql/SqlClient"
import { randomUUID } from "node:crypto"
import {
  CoreProtocolError,
  type ForkPoint,
  type ForkRecord,
  type ThreadWorktree,
} from "@meldshell/contracts"
import { Effect } from "effect"
import { transaction } from "./database/transaction"
import { getSnapshot } from "./snapshots"

/**
 * A fork copies a thread's turns up to one point into a new thread, so another direction can be
 * tried while the original stays as it was. The copies keep their events, so the fork's transcript
 * and search read like the original's. No provider session is shared: the fork's first turn starts
 * a new one from a summary of the copied turns.
 */
export const forkThread = (input: {
  readonly threadId: string
  readonly turnId: string
  readonly point: ForkPoint
  readonly worktree: Omit<ThreadWorktree, "state" | "setup">
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [source] = yield* sql<{ readonly workspace_id: string; readonly title: string }>`
      SELECT workspace_id, title FROM threads WHERE id = ${input.threadId}
    `
    if (source === undefined)
      return yield* Effect.fail(new CoreProtocolError({ message: "Thread not found." }))
    const turns = yield* sql<{ readonly id: string; readonly status: string }>`
      SELECT id, status FROM turns WHERE thread_id = ${input.threadId} AND rewound_at IS NULL
      ORDER BY started_at, rowid
    `
    const index = turns.findIndex((turn) => turn.id === input.turnId)
    if (index < 0)
      return yield* Effect.fail(
        new CoreProtocolError({ message: "This turn is no longer part of the conversation." }),
      )
    if (input.point === "after" && turns[index]!.status === "running")
      return yield* Effect.fail(
        new CoreProtocolError({ message: "Wait for this turn to finish before forking from it." }),
      )
    const kept = turns.slice(0, input.point === "before" ? index : index + 1)
    const [message] =
      input.point === "before"
        ? yield* sql<{ readonly text: string | null }>`
            SELECT text FROM events WHERE turn_id = ${input.turnId} AND kind = 'user'
            ORDER BY sequence LIMIT 1
          `
        : []

    const threadId = randomUUID()
    const timestamp = new Date().toISOString()
    // The title is the original's until the fork's first message names its own direction.
    yield* sql`
      INSERT INTO threads (
        id, workspace_id, title, status, created_at, updated_at, title_locked, title_manual,
        worktree_path, worktree_branch, worktree_base, worktree_state,
        issue_number, issue_title, issue_url, issue_context,
        fork_thread_id, fork_title, fork_fresh
      )
      SELECT ${threadId}, workspace_id, title, 'active', ${timestamp}, ${timestamp}, 0, 0,
             ${input.worktree.path}, ${input.worktree.branch}, ${input.worktree.baseBranch}, 'ready',
             issue_number, issue_title, issue_url, issue_context,
             id, title, 1
      FROM threads WHERE id = ${input.threadId}
    `
    yield* sql`
      INSERT INTO thread_settings (
        thread_id, provider_id, model_id, reasoning_effort, speed, mode, sandbox, approval_policy
      )
      SELECT ${threadId}, provider_id, model_id, reasoning_effort, speed, mode, sandbox,
             approval_policy
      FROM thread_settings WHERE thread_id = ${input.threadId}
    `
    const copied = kept.map((turn) => ({ from: turn.id, to: randomUUID() }))
    for (const turn of copied) {
      yield* sql`
        INSERT INTO turns (
          id, thread_id, provider, harness, model, reasoning_effort, speed, status,
          native_turn_id, started_at, completed_at, error
        )
        SELECT ${turn.to}, ${threadId}, provider, harness, model, reasoning_effort, speed, status,
               native_turn_id, started_at, completed_at, error
        FROM turns WHERE id = ${turn.from}
      `
      // Events keep their sequence, so the fork's own turns continue after them.
      const events = yield* sql<{ readonly id: string }>`
        SELECT id FROM events WHERE turn_id = ${turn.from} ORDER BY sequence
      `
      for (const event of events)
        yield* sql`
          INSERT INTO events (
            id, thread_id, turn_id, sequence, kind, method, text, provider_data, created_at
          )
          SELECT ${randomUUID()}, ${threadId}, ${turn.to}, sequence, kind, method, text,
                 provider_data, created_at
          FROM events WHERE id = ${event.id}
        `
    }
    yield* sql`
      UPDATE workspaces SET last_opened_at = ${timestamp} WHERE id = ${source.workspace_id}
    `
    return {
      snapshot: yield* getSnapshot,
      threadId,
      text: message?.text ?? "",
      turns: copied,
    } satisfies ForkRecord
  }).pipe(transaction)
