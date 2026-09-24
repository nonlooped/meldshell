import { type ChildProcess, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createWriteStream } from "node:fs"
import { open, readFile } from "node:fs/promises"
import { join } from "node:path"
import { Effect, Either, Schema } from "effect"
import type { ThreadLocation } from "@meldshell/contracts"
import type { RunScript, WorkspaceScripts, WorktreeSetupLog } from "@meldshell/contracts/ipc"
import { stopProcessTree } from "@meldshell/provider-runtime/process-tree"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { git } from "./git"
import { setupLogPath } from "./worktrees"

/*
 * Workspace scripts come from `meldshell.json` at the root of the workspace's repository:
 *
 *   { "scripts": { "setup": "npm install", "run": { "app": "npm run dev", "docs": "npm run docs" } } }
 *
 * The setup script prepares each new thread worktree, which starts with tracked files only. Run
 * scripts are started on request in a thread's terminal; `run` is one command, or named commands to
 * choose from. All of them run through the platform shell with the variables from
 * `scriptEnvironment`.
 */

const SCRIPTS_FILE = "meldshell.json"

const ScriptsFile = Schema.Struct({
  scripts: Schema.optional(
    Schema.Struct({
      setup: Schema.optional(Schema.String),
      run: Schema.optional(
        Schema.Union(Schema.String, Schema.Record({ key: Schema.String, value: Schema.String })),
      ),
    }),
  ),
})

const script = (value: string | undefined) =>
  value === undefined || value.trim() === "" ? null : value

/** A lone command is named `run`; named commands keep the file's order, and empty ones are skipped. */
const runScripts = (value: string | Readonly<Record<string, string>> | undefined): RunScript[] => {
  if (value === undefined) return []
  const entries: [string, string][] =
    typeof value === "string" ? [["run", value]] : Object.entries(value)
  return entries.flatMap(([name, command]) =>
    name.trim() === "" || script(command) === null ? [] : [{ name: name.trim(), command }],
  )
}

/** The main checkout, where scripts and ignored files such as `.env` live. */
const repositoryRoot = (workspacePath: string): Promise<string> =>
  git(workspacePath, ["rev-parse", "--show-toplevel"]).then(
    (value) => value.trim(),
    () => workspacePath,
  )

export async function readWorkspaceScripts(workspacePath: string): Promise<WorkspaceScripts> {
  const root = await repositoryRoot(workspacePath)
  const text = await readFile(join(root, SCRIPTS_FILE), "utf8").catch(
    (cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT") return null
      throw cause
    },
  )
  if (text === null) return { setup: null, run: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new Error(`${SCRIPTS_FILE} is not valid JSON: ${(cause as Error).message}`)
  }
  const decoded = Schema.decodeUnknownEither(ScriptsFile)(parsed)
  if (Either.isLeft(decoded))
    throw new Error(
      `In ${SCRIPTS_FILE}, "scripts.setup" must be a command, and "scripts.run" a command or an object of named commands.`,
    )
  return {
    setup: script(decoded.right.scripts?.setup),
    run: runScripts(decoded.right.scripts?.run),
  }
}

/**
 * The first of ten ports for a thread's servers. It is derived from the thread, so it stays the same
 * across restarts and is unlikely, though not certain, to match another thread's.
 */
const threadPort = (threadId: string): number =>
  20_000 + (createHash("sha256").update(threadId).digest().readUInt32BE(0) % 4_000) * 10

/** Variables every workspace script and thread terminal receives. */
export async function scriptEnvironment(
  location: Pick<ThreadLocation, "threadId" | "workspacePath" | "worktree">,
): Promise<Record<string, string>> {
  const worktree = location.worktree?.state === "removed" ? null : location.worktree
  return {
    MELDSHELL_THREAD_ID: location.threadId,
    MELDSHELL_ROOT_PATH: await repositoryRoot(location.workspacePath),
    MELDSHELL_WORKSPACE_PATH: worktree?.path ?? location.workspacePath,
    MELDSHELL_PORT: String(threadPort(location.threadId)),
    ...(worktree ? { MELDSHELL_BRANCH: worktree.branch } : {}),
  }
}

/** Electron's own switches would change how the script's Node or Electron processes start. */
const inheritedEnvironment = () =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("ELECTRON_")))

interface RunningSetup {
  readonly child: ChildProcess
  readonly done: Promise<void>
  stopped: boolean
}

// Setup processes belong to this host; one per thread at most.
const running = new Map<string, RunningSetup>()

export const setupRunning = (threadId: string): boolean => running.has(threadId)

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  })

const killTree = (child: ChildProcess, signal: NodeJS.Signals) => {
  const pid = child.pid
  if (pid === undefined) return Promise.resolve()
  if (process.platform === "win32") return stopProcessTree(pid)
  try {
    // The script leads its own process group, so package managers and servers it started end too.
    process.kill(-pid, signal)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ESRCH") throw cause
  }
  return Promise.resolve()
}

const exitNote = (code: number | null, signal: NodeJS.Signals | null) =>
  code !== null ? `Exited with code ${code}.` : `Ended by ${signal ?? "an unknown signal"}.`

/**
 * Starts the workspace setup script in a thread's new worktree and records its progress on the
 * thread; turns wait until it finishes. Does nothing when the workspace has no setup script. A
 * `meldshell.json` that cannot be read fails the setup with the reason in its log.
 */
export const beginWorktreeSetup = (
  location: Pick<ThreadLocation, "threadId" | "workspacePath" | "worktree">,
) =>
  Effect.gen(function* () {
    const worktree = location.worktree
    if (worktree === null || worktree.state !== "ready") return
    if (running.has(location.threadId))
      return yield* Effect.fail(new Error("This thread's setup script is already running."))
    const core = yield* CoreClient
    const events = yield* HostEvents
    const { threadId } = location
    const logPath = setupLogPath(worktree.path)
    const record = (setup: "running" | "succeeded" | "failed" | "interrupted") =>
      core
        .SetWorktreeSetup({ threadId, setup })
        .pipe(Effect.zipRight(events.publish({ _tag: "RuntimeChanged", threadId })))
    const scripts = yield* attempt(() => readWorkspaceScripts(location.workspacePath)).pipe(
      Effect.either,
    )
    if (Either.isLeft(scripts)) {
      yield* attempt(async () => {
        const log = createWriteStream(logPath)
        await new Promise<void>((resolve) => log.end(`${scripts.left.message}\n`, resolve))
      }).pipe(Effect.catchAll(Effect.logError))
      return yield* record("failed")
    }
    const command = scripts.right.setup
    if (command === null) return
    const env = yield* attempt(() => scriptEnvironment(location))
    yield* record("running")

    const log = createWriteStream(logPath)
    log.write(`$ ${command}\n\n`)
    const child = spawn(command, {
      cwd: worktree.path,
      shell: true,
      env: { ...inheritedEnvironment(), ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    })
    child.stdout?.pipe(log, { end: false })
    child.stderr?.pipe(log, { end: false })
    let entry: RunningSetup
    const done = new Promise<void>((resolve) => {
      let settled = false
      const finish = (note: string, outcome: "succeeded" | "failed") => {
        if (settled) return
        settled = true
        const stopped = entry.stopped
        log.end(`\n${stopped ? "Stopped." : note}\n`, () => {
          running.delete(threadId)
          Effect.runPromise(
            record(stopped ? "interrupted" : outcome).pipe(Effect.catchAll(Effect.logError)),
          ).finally(resolve)
        })
      }
      child.once("error", (cause) => finish(`Could not start: ${cause.message}`, "failed"))
      child.once("close", (code, signal) =>
        finish(exitNote(code, signal), code === 0 ? "succeeded" : "failed"),
      )
    })
    entry = { child, done, stopped: false }
    running.set(threadId, entry)
  })

/** Ends a running setup script and everything it started, and waits until it has exited. */
export const stopWorktreeSetup = (threadId: string) =>
  attempt(async () => {
    const entry = running.get(threadId)
    if (entry === undefined) return
    entry.stopped = true
    await killTree(entry.child, "SIGTERM")
    const exited = await Promise.race([
      entry.done.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 5_000)),
    ])
    if (!exited) {
      await killTree(entry.child, "SIGKILL")
      await entry.done
    }
  })

/** Ends every setup script; their threads read as interrupted when the host next starts. */
export const stopAllWorktreeSetups = Effect.suspend(() =>
  Effect.forEach([...running.keys()], stopWorktreeSetup, { discard: true }),
)

const LOG_LIMIT = 256 * 1024
// Colour and cursor sequences mean nothing outside a terminal.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI escape sequences.
const ansi = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g

/** The end of a worktree's setup log; empty when no setup has run there. */
export async function readSetupLog(worktreePath: string): Promise<WorktreeSetupLog> {
  const file = await open(setupLogPath(worktreePath)).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return null
    throw cause
  })
  if (file === null) return { text: "", truncated: false }
  try {
    const { size } = await file.stat()
    const length = Math.min(size, LOG_LIMIT)
    const buffer = Buffer.alloc(length)
    await file.read(buffer, 0, length, size - length)
    return {
      text: buffer
        .toString("utf8")
        .replace(ansi, "")
        .split("\n")
        // A carriage return redraws its line, as progress bars do; keep what was drawn last.
        .map((line) => line.replace(/\r+$/, "").split("\r").at(-1))
        .join("\n"),
      truncated: size > length,
    }
  } finally {
    await file.close()
  }
}
