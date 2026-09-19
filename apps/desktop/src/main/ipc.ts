import { listDirectory, readWorkspaceFile } from "./workspace-files"
import { getWebPageTitle } from "./web-page-title"
import { basename, dirname, extname } from "node:path"
import type { AppSnapshot, CoreError } from "@meldshell/contracts"
import type { ComposerAttachment } from "@meldshell/contracts/ipc"
import {
  CreateThreadInput,
  RenameWorkspaceInput,
  SetThreadPinnedInput,
  SearchTranscriptsInput,
  IPC,
  ResolveApprovalInput,
  SetAppSettingsInput,
  SetThreadSettingsInput,
  SetThreadStatusInput,
  SubmitTurnInput,
  ThreadPageQuery,
  TranscriptQuery,
  UpdateProviderInput,
  UpsertModelInput,
} from "@meldshell/contracts"
import { RpcClientError } from "@effect/rpc/RpcClientError"
import { dialog, ipcMain, nativeImage } from "electron"
import { Effect, ParseResult, Schema } from "effect"
import { CoreClient } from "./runtime/core-client"
import {
  getGitCommitDiff,
  getGitDiff,
  getGitSnapshot,
  gitFileAction,
  gitCommit,
  gitPush,
  commitMessagePrompt,
} from "./git"
import { requestGeneratedText } from "./runtime/generated-text"
import { DesktopEvents } from "./runtime/desktop-events"

import { runtime } from "./runtime/services"
import { confirmAndClose } from "./runtime/shutdown"
import { getMainWindow, applyAppearance } from "./window"
import { providerFor } from "./runtime/worker-provider"

const publishRuntimeChange = (threadId: string): Effect.Effect<void, never, DesktopEvents> =>
  Effect.flatMap(DesktopEvents, (events) => events.publish({ _tag: "RuntimeChanged", threadId }))

const decode = <A, I>(
  schema: Schema.Schema<A, I, never>,
  input: unknown,
): Effect.Effect<A, ParseResult.ParseError> => Schema.decodeUnknown(schema)(input)

type CoreService = Effect.Effect.Success<typeof CoreClient>
type CoreCallError = CoreError | RpcClientError

const handleSnapshotCall = <A, I>(
  channel: string,
  schema: Schema.Schema<A, I, never>,
  call: (core: CoreService, input: A) => Effect.Effect<AppSnapshot, CoreCallError>,
): void => {
  ipcMain.handle(channel, (_event, untrustedInput: unknown) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const input = yield* decode(schema, untrustedInput)
        const core = yield* CoreClient
        return yield* call(core, input)
      }),
    ),
  )
}

const selectAttachments = Effect.gen(function* () {
  const options: Electron.OpenDialogOptions = {
    title: "Attach files to this turn",
    buttonLabel: "Attach",
    properties: ["openFile", "multiSelections"],
  }
  const currentWindow = getMainWindow()
  const choice = yield* Effect.tryPromise({
    try: () =>
      currentWindow === null
        ? dialog.showOpenDialog(options)
        : dialog.showOpenDialog(currentWindow, options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  })
  if (choice.canceled) return []
  const imageExtensions = new Set([".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"])
  return yield* Effect.promise(() =>
    Promise.all(
      choice.filePaths.map(async (path): Promise<ComposerAttachment> => {
        if (basename(path).toLowerCase() === "skill.md") {
          return { type: "skill", value: path, name: basename(dirname(path)) }
        }
        if (imageExtensions.has(extname(path).toLowerCase())) {
          const previewUrl = await nativeImage
            .createThumbnailFromPath(path, { width: 160, height: 160 })
            .then((image) => (image.isEmpty() ? undefined : image.toDataURL()))
            .catch(() => undefined)
          return { type: "localImage", value: path, name: basename(path), previewUrl }
        }
        return { type: "mention", value: path, name: basename(path) }
      }),
    ),
  )
})

export const registerIpc = (): void => {
  ipcMain.handle(IPC.getWebPageTitle, (_event, url: unknown) =>
    typeof url === "string" ? getWebPageTitle(url) : null,
  )
  const workspacePathFor = async (workspaceId: string): Promise<string> => {
    const snapshot = await runtime.runPromise(
      Effect.flatMap(CoreClient, (core) => core.GetSnapshot()),
    )
    const workspace = snapshot.workspaces.find((entry) => entry.id === workspaceId)
    if (!workspace) throw new Error("Workspace not found.")
    return workspace.path
  }
  for (const [channel, handler] of [
    [IPC.listDirectory, listDirectory],
    [IPC.readWorkspaceFile, readWorkspaceFile],
  ] as const) {
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      const input = Schema.decodeUnknownSync(
        Schema.Struct({ workspaceId: Schema.String, path: Schema.String }),
      )(raw)
      return handler(await workspacePathFor(input.workspaceId), input.path)
    })
  }
  ipcMain.handle(IPC.gitFileAction, async (_event, raw: unknown) => {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({
        workspaceId: Schema.String,
        path: Schema.String,
        action: Schema.Literal("stage", "unstage", "restore"),
      }),
    )(raw)
    const path = await workspacePathFor(input.workspaceId)
    if (input.action === "restore") {
      const result = await dialog.showMessageBox({
        type: "warning",
        title: "Restore file?",
        message: `Discard unstaged changes to ${input.path}?`,
        detail:
          "Staged changes will be kept. Untracked files will be deleted. This cannot be undone.",
        buttons: ["Cancel", "Restore"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      if (result.response !== 1) return
    }
    await gitFileAction(path, input.path, input.action)
  })
  ipcMain.handle(IPC.gitCommit, async (_event, raw: unknown) => {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({ workspaceId: Schema.String, message: Schema.String }),
    )(raw)
    await gitCommit(await workspacePathFor(input.workspaceId), input.message)
  })
  ipcMain.handle(IPC.gitPush, async (_event, raw: unknown) => {
    const id = Schema.decodeUnknownSync(Schema.String)(raw)
    await gitPush(await workspacePathFor(id))
  })
  ipcMain.handle(IPC.generateCommitMessage, async (_event, raw: unknown) => {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({ workspaceId: Schema.String, threadId: Schema.optional(Schema.String) }),
    )(raw)
    const workspacePath = await workspacePathFor(input.workspaceId)
    const snapshot = await runtime.runPromise(
      Effect.flatMap(CoreClient, (core) => core.GetSnapshot()),
    )
    const thread = snapshot.threads.find(
      (entry) => entry.id === input.threadId && entry.workspaceId === input.workspaceId,
    )
    const currentModelId = snapshot.threadSettings.find(
      (entry) => entry.threadId === thread?.id,
    )?.modelId
    const enabledModels = snapshot.models.filter(
      (entry) =>
        entry.enabled &&
        snapshot.providers.some((provider) => provider.id === entry.providerId && provider.enabled),
    )
    const model =
      enabledModels.find((entry) => entry.id === snapshot.settings.titleModelId) ??
      enabledModels.find((entry) => entry.id === currentModelId)
    const provider = snapshot.providers.find(
      (entry) => entry.id === model?.providerId && entry.enabled,
    )
    if (!model || !provider || !["codex", "claude-code", "cursor"].includes(provider.harness))
      throw new Error(
        "Choose an available Title model in Settings > Threads, or select a model for this thread.",
      )
    const prompt = await commitMessagePrompt(workspacePath)
    return requestGeneratedText((threadId) =>
      runtime.runPromise(
        Effect.flatMap(providerFor(provider.harness), (service) =>
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
    )
  })
  ipcMain.handle(IPC.getGitSnapshot, async (_event, raw: unknown) => {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({
        workspaceId: Schema.String,
        limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 2000)),
      }),
    )(raw)
    return getGitSnapshot(await workspacePathFor(input.workspaceId), input.limit)
  })
  ipcMain.handle(IPC.getGitCommitDiff, async (_event, raw: unknown) => {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({ workspaceId: Schema.String, hash: Schema.String }),
    )(raw)
    return getGitCommitDiff(await workspacePathFor(input.workspaceId), input.hash)
  })
  ipcMain.handle(IPC.getGitDiff, async (_event, raw: unknown) => {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({
        workspaceId: Schema.String,
        path: Schema.String,
        side: Schema.optional(Schema.Literal("staged", "unstaged")),
      }),
    )(raw)
    return getGitDiff(await workspacePathFor(input.workspaceId), input.path, input.side)
  })
  ipcMain.handle(IPC.getSnapshot, () =>
    runtime.runPromise(
      Effect.flatMap(CoreClient, (core) => core.GetSnapshot()).pipe(
        Effect.tap((snapshot) => Effect.sync(() => applyAppearance(snapshot))),
      ),
    ),
  )
  ipcMain.handle(IPC.addWorkspace, () =>
    runtime.runPromise(
      Effect.gen(function* () {
        const options: Electron.OpenDialogOptions = {
          title: "Add a workspace",
          buttonLabel: "Add workspace",
          properties: ["openDirectory", "createDirectory"],
        }
        const currentWindow = getMainWindow()
        const choice = yield* Effect.tryPromise({
          try: () =>
            currentWindow === null
              ? dialog.showOpenDialog(options)
              : dialog.showOpenDialog(currentWindow, options),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        })
        const core = yield* CoreClient
        return choice.canceled || choice.filePaths[0] === undefined
          ? yield* core.GetSnapshot()
          : yield* core.AddWorkspace({ path: choice.filePaths[0] })
      }),
    ),
  )

  handleSnapshotCall(IPC.renameWorkspace, RenameWorkspaceInput, (core, input) =>
    core.RenameWorkspace(input),
  )
  handleSnapshotCall(IPC.removeWorkspace, Schema.String, (core, workspaceId) =>
    core.RemoveWorkspace({ workspaceId }),
  )
  handleSnapshotCall(IPC.setThreadPinned, SetThreadPinnedInput, (core, input) =>
    core.SetThreadPinned(input),
  )
  ipcMain.handle(IPC.searchTranscripts, (_event, untrustedInput: unknown) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const input = yield* decode(SearchTranscriptsInput, untrustedInput)
        const core = yield* CoreClient
        return yield* core.SearchTranscripts(input)
      }),
    ),
  )
  handleSnapshotCall(IPC.createThread, CreateThreadInput, (core, input) => core.CreateThread(input))
  handleSnapshotCall(IPC.setThreadStatus, SetThreadStatusInput, (core, input) =>
    core.SetThreadStatus(input),
  )
  handleSnapshotCall(IPC.deleteThread, Schema.String, (core, threadId) =>
    core.DeleteThread({ threadId }),
  )
  handleSnapshotCall(IPC.updateProvider, UpdateProviderInput, (core, input) =>
    core.UpdateProvider(input),
  )
  handleSnapshotCall(IPC.upsertModel, UpsertModelInput, (core, input) => core.UpsertModel(input))
  handleSnapshotCall(IPC.deleteModel, Schema.String, (core, modelId) =>
    core.DeleteModel({ modelId }),
  )
  handleSnapshotCall(IPC.setThreadSettings, SetThreadSettingsInput, (core, input) =>
    core.SetThreadSettings(input),
  )
  handleSnapshotCall(IPC.setAppSettings, SetAppSettingsInput, (core, input) =>
    core
      .SetAppSettings(input)
      .pipe(Effect.tap((snapshot) => Effect.sync(() => applyAppearance(snapshot)))),
  )
  ipcMain.handle(IPC.resetProviderCatalog, () =>
    runtime.runPromise(Effect.flatMap(CoreClient, (core) => core.ResetProviderCatalog())),
  )
  for (const [harness, status, refresh, usage] of [
    ["codex", IPC.getCodexStatus, IPC.refreshCodexStatus, IPC.getCodexUsage],
    ["claude-code", IPC.getClaudeStatus, IPC.refreshClaudeStatus, IPC.getClaudeUsage],
    ["cursor", IPC.getCursorStatus, IPC.refreshCursorStatus, IPC.getCursorUsage],
  ] as const) {
    const service = providerFor(harness)
    ipcMain.handle(status, () =>
      runtime.runPromise(Effect.flatMap(service, (provider) => provider.status)),
    )
    ipcMain.handle(refresh, () =>
      runtime.runPromise(Effect.flatMap(service, (provider) => provider.refresh)),
    )
    ipcMain.handle(usage, () =>
      runtime.runPromise(Effect.flatMap(service, (provider) => provider.usage)),
    )
  }
  ipcMain.handle(IPC.selectAttachments, () => runtime.runPromise(selectAttachments))
  ipcMain.handle(IPC.getTranscript, (_event, untrustedInput: unknown) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const input = yield* decode(TranscriptQuery, untrustedInput)
        const core = yield* CoreClient
        return yield* core.GetTranscript(input)
      }),
    ),
  )
  ipcMain.handle(IPC.listThreads, (_event, untrustedInput: unknown) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const input = yield* decode(ThreadPageQuery, untrustedInput)
        const core = yield* CoreClient
        return yield* core.ListThreads(input)
      }),
    ),
  )
  ipcMain.handle(IPC.submitTurn, (_event, untrustedInput: unknown) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const input = yield* decode(SubmitTurnInput, untrustedInput)
        const core = yield* CoreClient
        const result = yield* core.SubmitTurn(input)
        if (result.dispatch !== null) {
          const provider = yield* providerFor(result.dispatch.harness)
          yield* provider.send({ type: "start-turn", dispatch: result.dispatch })
        }
        if (result.titleRequest !== null) {
          const provider = yield* providerFor(result.titleRequest.harness)
          yield* provider
            .send({ type: "generate-title", request: result.titleRequest })
            .pipe(Effect.catchAll(Effect.logError))
        }
        yield* publishRuntimeChange(input.threadId)
        return result
      }),
    ),
  )
  ipcMain.handle(IPC.interruptTurn, (_event, untrustedInput: unknown) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const threadId = yield* decode(Schema.String, untrustedInput)
        const core = yield* CoreClient
        const turn = yield* core.InterruptTurn({ threadId })
        if (turn === null) return false
        const provider = yield* providerFor(turn.harness)
        yield* provider.interrupt(threadId, turn.id)
        return true
      }),
    ),
  )
  ipcMain.handle(IPC.resolveApproval, (_event, untrustedInput: unknown) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const input = yield* decode(ResolveApprovalInput, untrustedInput)
        const core = yield* CoreClient
        const snapshot = yield* core.GetSnapshot()
        const approval = snapshot.approvals.find((candidate) => candidate.id === input.approvalId)
        if (approval === undefined) return false
        const settings = snapshot.threadSettings.find(
          (setting) => setting.threadId === approval.threadId,
        )
        const harness = snapshot.providers.find(
          (candidate) => candidate.id === settings?.providerId,
        )?.harness
        if (harness === undefined) return false
        const provider = yield* providerFor(harness)
        yield* provider.send({
          type: "resolve-approval",
          requestId: approval.requestId,
          decision: input.decision,
          answers: input.answers,
          optionId: input.optionId,
        })
        yield* core.ResolveApproval({ approvalId: input.approvalId })
        yield* publishRuntimeChange(approval.threadId)
        return true
      }),
    ),
  )
  ipcMain.handle(IPC.closeApp, () => runtime.runPromise(confirmAndClose))
}
