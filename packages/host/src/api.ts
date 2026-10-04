import { Effect, Schema } from "effect"
import { browseHostFolders, workspaceFolder } from "./host-folders"
import * as C from "@meldshell/contracts"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { attempt } from "./attempt"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import {
  submitTurn,
  interruptTurn,
  resolveApproval,
  setThreadSettings,
  removeQueuedInput,
  steerQueuedInput,
} from "./operations"
import { providerFor } from "./worker-provider"
import { ProviderUpdates } from "./provider-updates"
import type { HostRuntime, HostServices } from "./runtime"
import {
  getGitSnapshot,
  getGitDiff,
  getGitCommitDiff,
  gitFileAction,
  gitBulkAction,
  gitCommit,
  gitPush,
  commitMessagePrompt,
} from "./git"
import {
  listDirectory,
  readWorkspaceFile,
  workspaceAbsolutePath,
  workspaceFileAction,
} from "./workspace-files"
import { searchWorkspacePaths } from "./workspace-search"
import { searchWorkspaceContents } from "./content-search"
import {
  hasTurnSnapshot,
  readTurnSnapshot,
  restoreTurnSnapshot,
  threadFolder,
  undoSnapshotRestore,
} from "./turn-snapshots"
import { requestGeneratedText } from "./generated-text"
import { HostPlatform } from "./platform"
import { hostDictation, type Dictation } from "./dictation"
import {
  createPullRequest,
  getPullRequestStatus,
  markPullRequestReady,
  parsePullRequestDraft,
  pullRequestPrompt,
} from "./pull-requests"
import { readWorkspaceScripts } from "./workspace-scripts"
import { listIssues } from "./issues"
import { importCliSession, listCliSessions } from "./cli-sessions"
import {
  createThread,
  deleteThread,
  forkThread,
  getWorktreeSetupLog,
  getWorktreeStatus,
  mergeThreadWorktree,
  rerunWorktreeSetup,
  stopThreadWorktreeSetup,
  removeThreadWorktree,
  removeWorkspace,
  scopePath,
  setDraftLocation,
} from "./thread-worktrees"

type Operation = {
  read: boolean
  execute: (input: unknown) => Effect.Effect<unknown, unknown, HostServices>
}
const operation = <A, I>(
  schema: Schema.Codec<A, I, never>,
  read: boolean,
  run: (input: A) => Effect.Effect<unknown, unknown, HostServices>,
): Operation => ({
  read,
  execute: (input) => Schema.decodeUnknownEffect(schema)(input).pipe(Effect.flatMap(run)),
})
const noInput = Schema.Unknown
const coreCall = <A, I>(
  schema: Schema.Codec<A, I, never>,
  read: boolean,
  run: (core: typeof CoreClient.Service, input: A) => Effect.Effect<unknown, unknown>,
) => operation(schema, read, (input) => Effect.flatMap(CoreClient, (core) => run(core, input)))
const withWorkspace = <A>(scope: WorkspaceScope, run: (path: string) => Promise<A>) =>
  Effect.flatMap(scopePath(scope), (path) => attempt(() => run(path)))

/** Restoring rewrites the whole folder, so nothing may be working in it at the time. */
const idleThreadFolder = (input: { workspaceId: string; threadId: string }) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const location = yield* core.GetThreadLocation({ threadId: input.threadId })
    if (location.workspaceId !== input.workspaceId)
      return yield* Effect.fail(new Error("Thread not found in this workspace."))
    if (location.busy)
      return yield* Effect.fail(new Error("Stop this thread's turn before restoring its files."))
    const folder = threadFolder(location)
    if (folder === null)
      return yield* Effect.fail(new Error("This thread's worktree is no longer available."))
    if (location.worktree === null) {
      const snapshot = yield* core.GetSnapshot()
      const sharing = snapshot.threads.some(
        (thread) =>
          thread.id !== input.threadId &&
          thread.workspaceId === input.workspaceId &&
          (thread.worktree === undefined || thread.worktree.state === "removed") &&
          (thread.activity === "running" || thread.activity === "approval"),
      )
      if (sharing)
        return yield* Effect.fail(
          new Error(
            "Another thread is working in this folder. Wait for it before restoring files.",
          ),
        )
    }
    return folder
  })

export const hostOperations: Record<string, Operation> = {
  [C.IPC.browseHostFolders]: operation(Schema.String, true, (path) =>
    attempt(() => browseHostFolders(path)),
  ),
  [C.IPC.addWorkspacePath]: operation(Schema.String, false, (path) =>
    Effect.gen(function* () {
      const folder = yield* attempt(() => workspaceFolder(path))
      const core = yield* CoreClient
      return yield* core.AddWorkspace({ path: folder })
    }),
  ),
  [C.IPC.getSnapshot]: coreCall(noInput, true, (core) => core.GetSnapshot()),
  [C.IPC.listThreads]: coreCall(C.ThreadPageQuery, true, (core, input) => core.ListThreads(input)),
  [C.IPC.getTranscript]: coreCall(C.TranscriptQuery, true, (core, input) =>
    core.GetTranscript(input),
  ),
  [C.IPC.searchTranscripts]: coreCall(C.SearchTranscriptsInput, true, (core, input) =>
    core.SearchTranscripts(input),
  ),
  [C.IPC.createThread]: operation(C.CreateThreadInput, false, createThread),
  [C.IPC.listCliSessions]: operation(Schema.String, true, listCliSessions),
  [C.IPC.importCliSession]: operation(C.ImportCliSessionInput, false, importCliSession),
  [C.IPC.renameWorkspace]: coreCall(C.RenameWorkspaceInput, false, (core, input) =>
    core.RenameWorkspace(input),
  ),
  [C.IPC.removeWorkspace]: operation(Schema.String, false, removeWorkspace),
  [C.IPC.getWorktreeStatus]: operation(Schema.String, true, getWorktreeStatus),
  [C.IPC.previewHandoff]: coreCall(Schema.String, true, (core, threadId) =>
    core.PreviewHandoff({ threadId }),
  ),
  [C.IPC.setDraftLocation]: operation(
    Schema.Struct({
      threadId: Schema.String,
      workspaceId: Schema.optional(Schema.String),
      isolated: Schema.optional(Schema.Boolean),
    }),
    false,
    setDraftLocation,
  ),
  [C.IPC.mergeWorktree]: operation(Schema.String, false, mergeThreadWorktree),
  // Scripts always come from the workspace's main checkout, never from a thread's worktree.
  [C.IPC.getWorkspaceScripts]: operation(C.WorkspaceScope, true, (input) =>
    withWorkspace({ workspaceId: input.workspaceId }, readWorkspaceScripts),
  ),
  [C.IPC.getWorktreeSetupLog]: operation(Schema.String, true, getWorktreeSetupLog),
  [C.IPC.rerunWorktreeSetup]: operation(Schema.String, false, rerunWorktreeSetup),
  [C.IPC.stopWorktreeSetup]: operation(Schema.String, false, stopThreadWorktreeSetup),
  [C.IPC.removeWorktree]: operation(
    Schema.Struct({ threadId: Schema.String, deleteBranch: Schema.Boolean }),
    false,
    removeThreadWorktree,
  ),
  [C.IPC.setThreadPinned]: coreCall(C.SetThreadPinnedInput, false, (core, input) =>
    core.SetThreadPinned(input),
  ),
  [C.IPC.setThreadStatus]: coreCall(C.SetThreadStatusInput, false, (core, input) =>
    core.SetThreadStatus(input),
  ),
  [C.IPC.renameThread]: coreCall(C.RenameThreadInput, false, (core, input) =>
    core.RenameThread(input),
  ),
  [C.IPC.deleteThread]: operation(Schema.String, false, deleteThread),
  [C.IPC.updateProvider]: coreCall(C.UpdateProviderInput, false, (core, input) =>
    core.UpdateProvider(input),
  ),
  [C.IPC.upsertModel]: coreCall(C.UpsertModelInput, false, (core, input) =>
    core.UpsertModel(input),
  ),
  [C.IPC.deleteModel]: coreCall(Schema.String, false, (core, modelId) =>
    core.DeleteModel({ modelId }),
  ),
  [C.IPC.setThreadSettings]: operation(C.SetThreadSettingsInput, false, setThreadSettings),
  [C.IPC.setAppSettings]: coreCall(C.SetAppSettingsInput, false, (core, input) =>
    core.SetAppSettings(input),
  ),
  [C.IPC.resetProviderCatalog]: coreCall(Schema.String, false, (core, providerId) =>
    core.ResetProviderCatalog({ providerId }),
  ),
  [C.IPC.listSchedules]: coreCall(
    Schema.Struct({ threadId: Schema.optional(Schema.String) }),
    true,
    (core, input) => core.ListSchedules(input),
  ),
  [C.IPC.saveSchedule]: coreCall(C.SaveScheduleInput, false, (core, input) =>
    core.SaveSchedule(input),
  ),
  [C.IPC.deleteSchedule]: coreCall(Schema.String, false, (core, scheduleId) =>
    core.DeleteSchedule({ scheduleId }),
  ),
  [C.IPC.submitTurn]: operation(C.SubmitTurnInput, false, submitTurn),
  [C.IPC.removeQueuedInput]: operation(Schema.Number, false, removeQueuedInput),
  [C.IPC.steerQueuedInput]: operation(Schema.Number, false, steerQueuedInput),
  [C.IPC.interruptTurn]: operation(Schema.String, false, interruptTurn),
  [C.IPC.resolveApproval]: operation(C.ResolveApprovalInput, false, resolveApproval),
  [C.IPC.listDirectory]: operation(C.WorkspaceFileInput, true, (input) =>
    withWorkspace(input, (path) => listDirectory(path, input.path)),
  ),
  [C.IPC.searchWorkspacePaths]: operation(C.SearchWorkspacePathsInput, true, (input) =>
    withWorkspace(input, (path) => searchWorkspacePaths(path, input.query, input.limit)),
  ),
  [C.IPC.searchWorkspaceContents]: operation(C.SearchWorkspaceContentsInput, true, (input) =>
    withWorkspace(input, (path) => searchWorkspaceContents(path, input)),
  ),
  [C.IPC.listComposerCommands]: operation(
    Schema.Struct({
      ...C.WorkspaceScope.fields,
      harness: C.Harness,
    }),
    true,
    (input) =>
      Effect.gen(function* () {
        const path = yield* scopePath(input)
        const service = yield* providerFor(input.harness)
        return yield* service.commands(path)
      }),
  ),
  [C.IPC.readWorkspaceFile]: operation(C.WorkspaceFileInput, true, (input) =>
    withWorkspace(input, (path) => readWorkspaceFile(path, input.path)),
  ),
  [C.IPC.workspaceAbsolutePath]: operation(C.WorkspaceFileInput, true, (input) =>
    withWorkspace(input, (path) => workspaceAbsolutePath(path, input.path)),
  ),
  [C.IPC.workspaceFileAction]: operation(C.WorkspaceFileActionInput, false, (input) =>
    withWorkspace(input, (path) => workspaceFileAction(path, input)),
  ),
  [C.IPC.getGitSnapshot]: operation(C.GitSnapshotInput, true, (input) =>
    withWorkspace(input, (path) => getGitSnapshot(path, input.limit)),
  ),
  [C.IPC.getGitDiff]: operation(C.GitDiffInput, true, (input) =>
    withWorkspace(input, (path) => getGitDiff(path, input.path, input.side, input.context)),
  ),
  [C.IPC.getGitCommitDiff]: operation(C.GitCommitDiffInput, true, (input) =>
    withWorkspace(input, (path) => getGitCommitDiff(path, input.hash)),
  ),
  [C.IPC.gitFileAction]: operation(C.GitFileActionInput, false, (input) =>
    withWorkspace(input, (path) => gitFileAction(path, input.path, input.action)),
  ),
  [C.IPC.gitBulkAction]: operation(C.GitBulkActionInput, false, (input) =>
    withWorkspace(input, (path) => gitBulkAction(path, input.action)),
  ),
  [C.IPC.gitCommit]: operation(C.GitCommitInput, false, (input) =>
    withWorkspace(input, (path) => gitCommit(path, input.message)),
  ),
  [C.IPC.gitPush]: operation(C.WorkspaceScope, false, (input) => withWorkspace(input, gitPush)),
  [C.IPC.getTurnSnapshot]: operation(C.TurnSnapshotInput, true, (input) =>
    withWorkspace(input, (path) => readTurnSnapshot(path, input.threadId, input.turnId)),
  ),
  [C.IPC.restoreTurnSnapshot]: operation(C.RestoreTurnSnapshotInput, false, (input) =>
    Effect.flatMap(idleThreadFolder(input), (path) =>
      attempt(() => restoreTurnSnapshot(path, input.threadId, input.turnId, input.point)),
    ),
  ),
  [C.IPC.undoSnapshotRestore]: operation(C.UndoSnapshotRestoreInput, false, (input) =>
    Effect.flatMap(idleThreadFolder(input), (path) =>
      attempt(() => undoSnapshotRestore(path, input.threadId)),
    ),
  ),
  [C.IPC.rewindThread]: operation(C.TurnSnapshotInput, false, (input) =>
    Effect.gen(function* () {
      const core = yield* CoreClient
      const path = yield* idleThreadFolder(input)
      // The files go back first, so the conversation never forgets work the folder still holds.
      const filesRestored = yield* attempt(async () => {
        if (!(await hasTurnSnapshot(path, input.threadId, input.turnId, "before"))) return false
        await restoreTurnSnapshot(path, input.threadId, input.turnId, "before")
        return true
      })
      return yield* core
        .RewindThread({ threadId: input.threadId, turnId: input.turnId, filesRestored })
        .pipe(
          Effect.tapError(() =>
            filesRestored
              ? attempt(() => undoSnapshotRestore(path, input.threadId)).pipe(
                  Effect.catch(Effect.logError),
                )
              : Effect.void,
          ),
        )
    }),
  ),
  [C.IPC.forkThread]: operation(C.ForkThreadInput, false, forkThread),
  [C.IPC.undoRewind]: operation(C.UndoSnapshotRestoreInput, false, (input) =>
    Effect.gen(function* () {
      const core = yield* CoreClient
      const path = yield* idleThreadFolder(input)
      const result = yield* core.UndoRewind({ threadId: input.threadId })
      if (result.filesRestored) yield* attempt(() => undoSnapshotRestore(path, input.threadId))
      return result
    }),
  ),
}
/**
 * Answers a one-off prompt with the Title model, or else the thread's own model. A side question
 * prefers the thread's model, which knows the work best.
 */
const generateText = (
  input: WorkspaceScope,
  prompt: (path: string) => Promise<string>,
  prefer: "title" | "thread" = "title",
) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const snapshot = yield* core.GetSnapshot()
    const thread = snapshot.threads.find(
      (entry) => entry.id === input.threadId && entry.workspaceId === input.workspaceId,
    )
    const selected = snapshot.threadSettings.find((entry) => entry.threadId === thread?.id)?.modelId
    const available = snapshot.models.filter(
      (entry) =>
        entry.enabled &&
        snapshot.providers.some((provider) => provider.id === entry.providerId && provider.enabled),
    )
    const title = available.find((entry) => entry.id === snapshot.settings.titleModelId)
    const own = available.find((entry) => entry.id === selected)
    const model = prefer === "thread" ? (own ?? title) : (title ?? own)
    const provider = snapshot.providers.find((entry) => entry.id === model?.providerId)
    const harness = provider?.harness
    if (!model || !C.isHarness(harness))
      return yield* Effect.fail(
        new Error(
          prefer === "thread"
            ? "Choose a model for this thread to ask a side question."
            : "Choose an available Title model or a model for this thread.",
        ),
      )
    const workspacePath = yield* scopePath(input)
    const text = yield* withWorkspace(input, prompt)
    const service = yield* providerFor(harness)
    return yield* attempt(() =>
      requestGeneratedText((threadId) =>
        Effect.runPromise(
          service.send({
            type: "generate-title",
            request: {
              threadId,
              workspacePath,
              model: model.slug,
              harness,
              reasoningEffort: model.defaultReasoningEffort,
              prompt: text,
            },
          }),
        ),
      ),
    )
  })
// The answer stays out of the thread and its provider session, so no stored state changes.
hostOperations[C.IPC.askSideQuestion] = operation(C.SideQuestionInput, true, (input) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const question = input.question.trim()
    if (question === "") return yield* Effect.fail(new Error("Type a question to ask."))
    const prompt = yield* core.SideQuestionPrompt({ threadId: input.threadId, question })
    return yield* generateText(input, async () => prompt, "thread")
  }),
)
hostOperations[C.IPC.generateCommitMessage] = operation(C.WorkspaceScope, false, (input) =>
  generateText(input, commitMessagePrompt),
)

/**
 * A thread's worktree targets the branch it started from, and a thread started from an issue links
 * its pull request back to it. Other checkouts use the default branch and link nothing.
 */
const pullRequestThread = (scope: WorkspaceScope) =>
  Effect.gen(function* () {
    if (scope.threadId === undefined) return { base: null, issue: null }
    const core = yield* CoreClient
    const location = yield* core.GetThreadLocation({ threadId: scope.threadId })
    return { base: location.worktree?.baseBranch ?? null, issue: location.issue }
  })
hostOperations[C.IPC.getPullRequest] = operation(C.WorkspaceScope, true, (input) =>
  Effect.flatMap(pullRequestThread(input), ({ base, issue }) =>
    withWorkspace(input, (path) => getPullRequestStatus(path, base, issue)),
  ),
)
hostOperations[C.IPC.markPullRequestReady] = operation(C.WorkspaceScope, false, (input) =>
  Effect.flatMap(pullRequestThread(input), ({ base, issue }) =>
    withWorkspace(input, (path) => markPullRequestReady(path, base, issue)),
  ),
)
hostOperations[C.IPC.generatePullRequest] = operation(C.WorkspaceScope, false, (input) =>
  Effect.gen(function* () {
    const { base, issue } = yield* pullRequestThread(input)
    const text = yield* generateText(input, (path) => pullRequestPrompt(path, base, issue))
    return yield* attempt(async () => parsePullRequestDraft(text))
  }),
)
hostOperations[C.IPC.listIssues] = operation(C.ListIssuesInput, true, (input) =>
  withWorkspace({ workspaceId: input.workspaceId }, (path) => listIssues(path, input.query)),
)
const withDictation = <A>(run: (dictation: Dictation, model: C.DictationModel) => Promise<A>) =>
  Effect.gen(function* () {
    const platform = yield* HostPlatform
    const snapshot = yield* Effect.flatMap(CoreClient, (core) => core.GetSnapshot())
    const dictation = hostDictation(platform.fork, platform.databasePath)
    return yield* attempt(() => run(dictation, snapshot.settings.dictationModel ?? "fast"))
  })
// Dictation changes no stored state, so other clients have nothing to reload.
hostOperations[C.IPC.getDictationStatus] = operation(noInput, true, () =>
  withDictation((dictation, model) => dictation.status(model)),
)
hostOperations[C.IPC.prepareDictation] = operation(noInput, true, () =>
  withDictation((dictation, model) => dictation.prepare(model)),
)
hostOperations[C.IPC.transcribeAudio] = operation(C.TranscribeAudioInput, true, (input) =>
  withDictation((dictation, model) => dictation.transcribe(model, input)),
)
hostOperations[C.IPC.createPullRequest] = operation(C.CreatePullRequestInput, false, (input) =>
  Effect.flatMap(pullRequestThread(input), ({ base, issue }) =>
    withWorkspace(input, (path) => createPullRequest(path, base, input, issue)),
  ),
)
for (const [harness, status, refresh, usage] of [
  ["codex", C.IPC.getCodexStatus, C.IPC.refreshCodexStatus, C.IPC.getCodexUsage],
  ["claude-code", C.IPC.getClaudeStatus, C.IPC.refreshClaudeStatus, C.IPC.getClaudeUsage],
  ["cursor", C.IPC.getCursorStatus, C.IPC.refreshCursorStatus, C.IPC.getCursorUsage],
  ["pi", C.IPC.getPiStatus, C.IPC.refreshPiStatus, C.IPC.getPiUsage],
] as const) {
  hostOperations[status] = operation(noInput, true, () =>
    Effect.flatMap(providerFor(harness), (service) => service.status),
  )
  hostOperations[refresh] = operation(noInput, false, () =>
    Effect.flatMap(providerFor(harness), (service) => service.refresh),
  )
  hostOperations[usage] = operation(noInput, true, () =>
    Effect.flatMap(providerFor(harness), (service) => service.usage),
  )
}
hostOperations[C.IPC.getProviderUpdate] = operation(C.Harness, true, (harness) =>
  Effect.flatMap(ProviderUpdates, (updates) => updates.status(harness)),
)
hostOperations[C.IPC.checkProviderUpdate] = operation(C.Harness, true, (harness) =>
  Effect.flatMap(ProviderUpdates, (updates) => updates.check(harness)),
)
// Updates change the harness install, not the stored state other clients would need to reload.
hostOperations[C.IPC.installProviderUpdate] = operation(C.Harness, true, (harness) =>
  Effect.flatMap(ProviderUpdates, (updates) => updates.install(harness)),
)

export function createHostApi(runtime: HostRuntime) {
  const call = async (method: string, args: readonly unknown[]) => {
    const operation = Object.hasOwn(hostOperations, method) ? hostOperations[method] : undefined
    if (!operation) throw new Error("This operation is only available on the workstation.")
    const value = await runtime.runPromise(operation.execute(args[0]))
    // Other clients refresh host-wide state after any change.
    if (!operation.read)
      await runtime.runPromise(
        Effect.flatMap(HostEvents, (events) =>
          events.publish({ _tag: "RuntimeChanged", threadId: "" }),
        ),
      )
    return value ?? null
  }
  return { call }
}
