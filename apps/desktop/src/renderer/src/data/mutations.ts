import type { AppSnapshot, Thread } from "@meldshell/contracts"
import type { InvokeApi } from "@meldshell/contracts/ipc"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { forgetThreads, invalidateThread, queryKeys, replaceSnapshot } from "./cache"

type Input<Key extends keyof InvokeApi> = Parameters<InvokeApi[Key]>[0]

function useSnapshotMutation<Input = void>(
  mutationFn: (input: Input) => Promise<AppSnapshot>,
  onSuccess?: (snapshot: AppSnapshot, input: Input) => void,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (snapshot, input) => {
      onSuccess?.(snapshot, input)
      replaceSnapshot(client, snapshot)
    },
  })
}

export function useWorkspaceActions(
  snapshot: AppSnapshot,
  callbacks: {
    added: (workspaceId: string) => void
    removed: (workspaceId: string, threadIds: readonly string[]) => void
  },
) {
  const client = useQueryClient()
  const addWorkspaceMutation = useSnapshotMutation(
    () => window.meldshell.addWorkspace(),
    (next) => {
      const added = next.workspaces.find(
        (workspace) => !snapshot.workspaces.some((current) => current.id === workspace.id),
      )
      if (added) callbacks.added(added.id)
    },
  )
  const manageAddWorkspaceMutation = useSnapshotMutation(() => window.meldshell.addWorkspace())
  const renameWorkspaceMutation = useSnapshotMutation((input: Input<"renameWorkspace">) =>
    window.meldshell.renameWorkspace(input),
  )
  const removeWorkspaceMutation = useSnapshotMutation(
    (id: string) => window.meldshell.removeWorkspace(id),
    (next, workspaceId) => {
      const retained = new Set(next.threadSettings.map((settings) => settings.threadId))
      const removedIds = snapshot.threadSettings
        .map((settings) => settings.threadId)
        .filter((id) => !retained.has(id))
      forgetThreads(client, removedIds)
      callbacks.removed(workspaceId, removedIds)
    },
  )
  return {
    addWorkspaceMutation,
    manageAddWorkspaceMutation,
    renameWorkspaceMutation,
    removeWorkspaceMutation,
  }
}

export function useThreadActions(
  snapshot: AppSnapshot,
  callbacks: {
    created: (threadId?: string) => void
    deleted: (threadId: string) => void
    submitted: () => void
  },
) {
  const client = useQueryClient()
  const pinMutation = useSnapshotMutation((thread: Thread) =>
    window.meldshell.setThreadPinned({ threadId: thread.id, pinned: !thread.pinned }),
  )
  const createThreadMutation = useSnapshotMutation(
    (workspaceId: string) => window.meldshell.createThread({ workspaceId }),
    (next) => {
      const existing = new Set([
        ...snapshot.threadSettings.map((settings) => settings.threadId),
        ...snapshot.threads.map((thread) => thread.id),
      ])
      callbacks.created(next.threads.find((thread) => !existing.has(thread.id))?.id)
    },
  )
  const setStatusMutation = useSnapshotMutation((input: Input<"setThreadStatus">) =>
    window.meldshell.setThreadStatus(input),
  )
  const deleteThreadMutation = useSnapshotMutation(
    (id: string) => window.meldshell.deleteThread(id),
    (_next, id) => {
      forgetThreads(client, [id])
      callbacks.deleted(id)
    },
  )
  const threadSettingsMutation = useSnapshotMutation((input: Input<"setThreadSettings">) =>
    window.meldshell.setThreadSettings(input),
  )
  const submitTurnMutation = useMutation({
    mutationFn: (input: Input<"submitTurn">) => window.meldshell.submitTurn(input),
    onSuccess: (result, input) => {
      replaceSnapshot(client, result.snapshot)
      void client.invalidateQueries({ queryKey: queryKeys.transcript(input.threadId) })
      callbacks.submitted()
    },
  })
  const interruptMutation = useMutation({
    mutationFn: (id: string) => window.meldshell.interruptTurn(id),
    onSettled: (_result, _error, id) => invalidateThread(client, id),
  })
  const resolveApprovalMutation = useMutation({
    mutationFn: (input: Input<"resolveApproval">) => window.meldshell.resolveApproval(input),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.snapshot }),
  })
  return {
    pinMutation,
    createThreadMutation,
    setStatusMutation,
    deleteThreadMutation,
    threadSettingsMutation,
    submitTurnMutation,
    interruptMutation,
    resolveApprovalMutation,
  }
}

export function useCatalogActions() {
  const updateProviderMutation = useSnapshotMutation((input: Input<"updateProvider">) =>
    window.meldshell.updateProvider(input),
  )
  const upsertModelMutation = useSnapshotMutation((input: Input<"upsertModel">) =>
    window.meldshell.upsertModel(input),
  )
  const deleteModelMutation = useSnapshotMutation((id: string) => window.meldshell.deleteModel(id))
  const resetCatalogMutation = useSnapshotMutation((providerId: string) =>
    window.meldshell.resetProviderCatalog(providerId),
  )
  return { updateProviderMutation, upsertModelMutation, deleteModelMutation, resetCatalogMutation }
}

export const useAppSettingsMutation = () =>
  useSnapshotMutation((input: Input<"setAppSettings">) => window.meldshell.setAppSettings(input))
