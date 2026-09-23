import { Effect, Schema } from "effect"
import * as C from "@meldshell/contracts"
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
import { requestGeneratedText } from "./generated-text"

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
const fileInput = Schema.Struct({ workspaceId: Schema.String, path: Schema.String })
const withWorkspace = <A>(workspaceId: string, run: (path: string) => Promise<A>) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const snapshot = yield* core.GetSnapshot()
    const workspace = snapshot.workspaces.find((entry) => entry.id === workspaceId)
    if (!workspace) return yield* Effect.fail(new Error("Workspace not found."))
    return yield* Effect.tryPromise({
      try: () => run(workspace.path),
      catch: (cause) => new Error(String(cause)),
    })
  })

export const hostOperations: Record<string, Operation> = {
  [C.IPC.getSnapshot]: coreCall(noInput, true, (core) => core.GetSnapshot()),
  [C.IPC.listThreads]: coreCall(C.ThreadPageQuery, true, (core, input) => core.ListThreads(input)),
  [C.IPC.getTranscript]: coreCall(C.TranscriptQuery, true, (core, input) =>
    core.GetTranscript(input),
  ),
  [C.IPC.searchTranscripts]: coreCall(C.SearchTranscriptsInput, true, (core, input) =>
    core.SearchTranscripts(input),
  ),
  [C.IPC.createThread]: coreCall(C.CreateThreadInput, false, (core, input) =>
    core.CreateThread(input),
  ),
  [C.IPC.renameWorkspace]: coreCall(C.RenameWorkspaceInput, false, (core, input) =>
    core.RenameWorkspace(input),
  ),
  [C.IPC.removeWorkspace]: coreCall(Schema.String, false, (core, id) =>
    core.RemoveWorkspace({ workspaceId: id }),
  ),
  [C.IPC.setThreadPinned]: coreCall(C.SetThreadPinnedInput, false, (core, input) =>
    core.SetThreadPinned(input),
  ),
  [C.IPC.setThreadStatus]: coreCall(C.SetThreadStatusInput, false, (core, input) =>
    core.SetThreadStatus(input),
  ),
  [C.IPC.deleteThread]: coreCall(Schema.String, false, (core, threadId) =>
    core.DeleteThread({ threadId }),
  ),
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
  [C.IPC.resetProviderCatalog]: coreCall(noInput, false, (core) => core.ResetProviderCatalog()),
  [C.IPC.submitTurn]: operation(C.SubmitTurnInput, false, submitTurn),
  [C.IPC.interruptTurn]: operation(Schema.String, false, interruptTurn),
  [C.IPC.resolveApproval]: operation(C.ResolveApprovalInput, false, resolveApproval),
  [C.IPC.listDirectory]: operation(fileInput, true, (input) =>
    withWorkspace(input.workspaceId, (path) => listDirectory(path, input.path)),
  ),
  [C.IPC.readWorkspaceFile]: operation(fileInput, true, (input) =>
    withWorkspace(input.workspaceId, (path) => readWorkspaceFile(path, input.path)),
  ),
  [C.IPC.getGitSnapshot]: operation(
    Schema.Struct({
      workspaceId: Schema.String,
      limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 2000)),
    }),
    true,
    (input) => withWorkspace(input.workspaceId, (path) => getGitSnapshot(path, input.limit)),
  ),
  [C.IPC.getGitDiff]: operation(
    Schema.Struct({
      workspaceId: Schema.String,
      path: Schema.String,
      side: Schema.optional(Schema.Literal("staged", "unstaged")),
      context: Schema.optional(Schema.Literal("full")),
    }),
    true,
    (input) =>
      withWorkspace(input.workspaceId, (path) =>
        getGitDiff(path, input.path, input.side, input.context),
      ),
  ),
  [C.IPC.getGitCommitDiff]: operation(
    Schema.Struct({ workspaceId: Schema.String, hash: Schema.String }),
    true,
    (input) => withWorkspace(input.workspaceId, (path) => getGitCommitDiff(path, input.hash)),
  ),
  [C.IPC.gitFileAction]: operation(
    Schema.Struct({
      workspaceId: Schema.String,
      path: Schema.String,
      action: Schema.Literal("stage", "unstage", "restore"),
    }),
    false,
    (input) =>
      withWorkspace(input.workspaceId, (path) => gitFileAction(path, input.path, input.action)),
  ),
  [C.IPC.gitCommit]: operation(
    Schema.Struct({ workspaceId: Schema.String, message: Schema.String }),
    false,
    (input) => withWorkspace(input.workspaceId, (path) => gitCommit(path, input.message)),
  ),
  [C.IPC.gitPush]: operation(Schema.String, false, (workspaceId) =>
    withWorkspace(workspaceId, gitPush),
  ),
}
hostOperations[C.IPC.generateCommitMessage] = operation(
  Schema.Struct({ workspaceId: Schema.String, threadId: Schema.optional(Schema.String) }),
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
      const prompt = yield* withWorkspace(input.workspaceId, commitMessagePrompt)
      const workspace = snapshot.workspaces.find((entry) => entry.id === input.workspaceId)!
      const service = yield* providerFor(provider.harness)
      return yield* Effect.tryPromise({
        try: () =>
          requestGeneratedText((threadId) =>
            Effect.runPromise(
              service.send({
                type: "generate-title",
                request: {
                  threadId,
                  workspacePath: workspace.path,
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

const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

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
      return { type: "result", id, ok: false, error: errorMessage(cause) }
    }
  }
  return { call, execute }
}
