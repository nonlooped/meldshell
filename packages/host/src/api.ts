import { Effect, Schema } from "effect"
import * as C from "@meldshell/contracts"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { submitTurn, interruptTurn, resolveApproval } from "./operations"
import { providerFor } from "./worker-provider"
import type { HostRuntime, HostServices } from "./runtime"
import {
  getGitSnapshot,
  getGitDiff,
  getGitCommitDiff,
  gitFileAction,
  gitCommit,
  gitPush,
  commitMessagePrompt,
} from "./git"
import { listDirectory, readWorkspaceFile } from "./workspace-files"
import { searchWorkspacePaths } from "./workspace-search"
import { requestGeneratedText } from "./generated-text"
import { readWorkspaceScripts } from "./workspace-scripts"
import {
  createThread,
  deleteThread,
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
  schema: Schema.Schema<A, I, never>,
  read: boolean,
  run: (input: A) => Effect.Effect<unknown, unknown, HostServices>,
): Operation => ({
  read,
  execute: (input) => Schema.decodeUnknown(schema)(input).pipe(Effect.flatMap(run)),
})
const noInput = Schema.Unknown
const coreCall = <A, I>(
  schema: Schema.Schema<A, I, never>,
  read: boolean,
  run: (core: typeof CoreClient.Service, input: A) => Effect.Effect<unknown, unknown>,
) => operation(schema, read, (input) => Effect.flatMap(CoreClient, (core) => run(core, input)))
const scopeFields = { workspaceId: Schema.String, threadId: Schema.optional(Schema.String) }
const fileInput = Schema.Struct({ ...scopeFields, path: Schema.String })
const withWorkspace = <A>(scope: WorkspaceScope, run: (path: string) => Promise<A>) =>
  Effect.flatMap(scopePath(scope), (path) =>
    Effect.tryPromise({
      try: () => run(path),
      catch: (cause) => new Error(String(cause)),
    }),
  )

export const hostOperations: Record<string, Operation> = {
  [C.IPC.getSnapshot]: coreCall(noInput, true, (core) => core.GetSnapshot()),
  [C.IPC.listThreads]: coreCall(C.ThreadPageQuery, true, (core, input) => core.ListThreads(input)),
  [C.IPC.getTranscript]: coreCall(C.TranscriptQuery, true, (core, input) =>
    core.GetTranscript(input),
  ),
  [C.IPC.searchTranscripts]: coreCall(C.SearchTranscriptsInput, true, (core, input) =>
    core.SearchTranscripts(input),
  ),
  [C.IPC.createThread]: operation(C.CreateThreadInput, false, createThread),
  [C.IPC.renameWorkspace]: coreCall(C.RenameWorkspaceInput, false, (core, input) =>
    core.RenameWorkspace(input),
  ),
  [C.IPC.removeWorkspace]: operation(Schema.String, false, removeWorkspace),
  [C.IPC.getWorktreeStatus]: operation(Schema.String, true, getWorktreeStatus),
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
  [C.IPC.getWorkspaceScripts]: operation(Schema.Struct(scopeFields), true, (input) =>
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
  [C.IPC.setThreadSettings]: coreCall(C.SetThreadSettingsInput, false, (core, input) =>
    core.SetThreadSettings(input),
  ),
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
  [C.IPC.interruptTurn]: operation(Schema.String, false, interruptTurn),
  [C.IPC.resolveApproval]: operation(C.ResolveApprovalInput, false, resolveApproval),
  [C.IPC.listDirectory]: operation(fileInput, true, (input) =>
    withWorkspace(input, (path) => listDirectory(path, input.path)),
  ),
  [C.IPC.searchWorkspacePaths]: operation(
    Schema.Struct({
      ...scopeFields,
      query: Schema.String.pipe(Schema.maxLength(1024)),
      limit: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.between(1, 200))),
    }),
    true,
    (input) => withWorkspace(input, (path) => searchWorkspacePaths(path, input.query, input.limit)),
  ),
  [C.IPC.listComposerCommands]: operation(
    Schema.Struct({
      ...scopeFields,
      harness: Schema.Literal("codex", "claude-code", "cursor"),
    }),
    true,
    (input) =>
      Effect.gen(function* () {
        const path = yield* scopePath(input)
        const service = yield* providerFor(input.harness)
        return yield* service.commands(path)
      }),
  ),
  [C.IPC.readWorkspaceFile]: operation(fileInput, true, (input) =>
    withWorkspace(input, (path) => readWorkspaceFile(path, input.path)),
  ),
  [C.IPC.getGitSnapshot]: operation(
    Schema.Struct({
      ...scopeFields,
      limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 2000)),
    }),
    true,
    (input) => withWorkspace(input, (path) => getGitSnapshot(path, input.limit)),
  ),
  [C.IPC.getGitDiff]: operation(
    Schema.Struct({
      ...scopeFields,
      path: Schema.String,
      side: Schema.optional(Schema.Literal("staged", "unstaged")),
      context: Schema.optional(Schema.Literal("full")),
    }),
    true,
    (input) =>
      withWorkspace(input, (path) => getGitDiff(path, input.path, input.side, input.context)),
  ),
  [C.IPC.getGitCommitDiff]: operation(
    Schema.Struct({ ...scopeFields, hash: Schema.String }),
    true,
    (input) => withWorkspace(input, (path) => getGitCommitDiff(path, input.hash)),
  ),
  [C.IPC.gitFileAction]: operation(
    Schema.Struct({
      ...scopeFields,
      path: Schema.String,
      action: Schema.Literal("stage", "unstage", "restore"),
    }),
    false,
    (input) => withWorkspace(input, (path) => gitFileAction(path, input.path, input.action)),
  ),
  [C.IPC.gitCommit]: operation(
    Schema.Struct({ ...scopeFields, message: Schema.String }),
    false,
    (input) => withWorkspace(input, (path) => gitCommit(path, input.message)),
  ),
  [C.IPC.gitPush]: operation(Schema.Struct(scopeFields), false, (input) =>
    withWorkspace(input, gitPush),
  ),
}
hostOperations[C.IPC.generateCommitMessage] = operation(
  Schema.Struct(scopeFields),
  false,
  (input) =>
    Effect.gen(function* () {
      const core = yield* CoreClient
      const snapshot = yield* core.GetSnapshot()
      const thread = snapshot.threads.find(
        (entry) => entry.id === input.threadId && entry.workspaceId === input.workspaceId,
      )
      const selected = snapshot.threadSettings.find(
        (entry) => entry.threadId === thread?.id,
      )?.modelId
      const available = snapshot.models.filter(
        (entry) =>
          entry.enabled &&
          snapshot.providers.some(
            (provider) => provider.id === entry.providerId && provider.enabled,
          ),
      )
      const model =
        available.find((entry) => entry.id === snapshot.settings.titleModelId) ??
        available.find((entry) => entry.id === selected)
      const provider = snapshot.providers.find((entry) => entry.id === model?.providerId)
      if (!model || !provider || !["codex", "claude-code", "cursor"].includes(provider.harness))
        return yield* Effect.fail(
          new Error("Choose an available Title model or a model for this thread."),
        )
      const workspacePath = yield* scopePath(input)
      const prompt = yield* withWorkspace(input, commitMessagePrompt)
      const service = yield* providerFor(provider.harness)
      return yield* Effect.tryPromise({
        try: () =>
          requestGeneratedText((threadId) =>
            Effect.runPromise(
              service.send({
                type: "generate-title",
                request: {
                  threadId,
                  workspacePath,
                  model: model.slug,
                  harness: provider.harness as "codex" | "claude-code" | "cursor",
                  reasoningEffort: model.defaultReasoningEffort,
                  prompt,
                },
              }),
            ),
          ),
        catch: (cause) => new Error(String(cause)),
      })
    }),
)
for (const [harness, status, refresh, usage] of [
  ["codex", C.IPC.getCodexStatus, C.IPC.refreshCodexStatus, C.IPC.getCodexUsage],
  ["claude-code", C.IPC.getClaudeStatus, C.IPC.refreshClaudeStatus, C.IPC.getClaudeUsage],
  ["cursor", C.IPC.getCursorStatus, C.IPC.refreshCursorStatus, C.IPC.getCursorUsage],
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
  const execute = async (raw: unknown): Promise<C.RemoteResult> => {
    const id = String((raw as { id?: unknown } | null)?.id ?? "")
    try {
      const command = C.decodeCommand(raw)
      return { type: "result", id, ok: true, value: await call(command.method, command.args) }
    } catch (cause) {
      return { type: "result", id, ok: false, error: C.errorMessage(cause) }
    }
  }
  return { call, execute }
}
