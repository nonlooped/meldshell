import { Tabs } from "@base-ui-components/react/tabs"
import type { AppSnapshot, Thread, TranscriptSearchResult } from "@meldshell/contracts"
import { useThreadActions } from "../data/mutations"
import { useSelectedProvider } from "../data/providers"
import { emptyDraft, useThreadDrafts } from "../app/thread-drafts"
import { Button } from "../ui/controls"
import { Composer } from "./Composer"
import { Transcript } from "./Transcript"

export function ThreadView({
  snapshot,
  thread,
  searchTarget,
}: {
  snapshot: AppSnapshot
  thread: Thread
  searchTarget: TranscriptSearchResult | null
}) {
  const draft = useThreadDrafts((state) => state.drafts[thread.id] ?? emptyDraft)
  const update = useThreadDrafts((state) => state.update)
  const { isClaude, isCursor, providerStatus, providerReady } = useSelectedProvider(
    snapshot,
    thread.id,
  )
  const { threadSettingsMutation, submitTurnMutation, interruptMutation } = useThreadActions(
    snapshot,
    {
      created: () => {
        // App handles thread creation.
      },
      deleted: () => {
        // App handles thread deletion.
      },
      submitted: () => {
        // send clears only the submitted draft contents.
      },
    },
  )
  const send = async () => {
    const sent = useThreadDrafts.getState().drafts[thread.id] ?? emptyDraft
    if (sent.sending) return
    update(thread.id, { sending: true, error: null })
    try {
      await submitTurnMutation.mutateAsync({
        threadId: thread.id,
        text: sent.text,
        attachments: sent.attachments.map(({ type, value, name }) => ({ type, value, name })),
      })
      useThreadDrafts.getState().finish(thread.id, sent)
    } catch (error) {
      update(thread.id, {
        sending: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const error =
    draft.error ?? threadSettingsMutation.error?.message ?? interruptMutation.error?.message
  return (
    <Tabs.Panel value={thread.id} className="thread-view">
      <div className="thread-content">
        <Transcript
          threadId={thread.id}
          workspace={snapshot.workspaces.find((workspace) => workspace.id === thread.workspaceId)}
          targetTurnId={
            searchTarget?.thread.id === thread.id
              ? (searchTarget.turnId ?? `event:${searchTarget.eventId}`)
              : undefined
          }
        />
        <Composer
          snapshot={snapshot}
          threadId={thread.id}
          draft={draft.text}
          onDraftChange={(text) => update(thread.id, { text })}
          providerReady={providerReady}
          providerDetail={providerStatus.detail}
          onRecheckProvider={() =>
            void (isCursor
              ? window.meldshell.refreshCursorStatus()
              : isClaude
                ? window.meldshell.refreshClaudeStatus()
                : window.meldshell.refreshCodexStatus())
          }
          onChangeSettings={(input) => threadSettingsMutation.mutate(input)}
          running={["running", "queued", "approval"].includes(thread.activity)}
          queuedCount={thread.queuedCount}
          sending={draft.sending}
          attachments={draft.attachments}
          onAddAttachments={(selected) => {
            const current = useThreadDrafts.getState().drafts[thread.id] ?? emptyDraft
            update(thread.id, { attachments: [...current.attachments, ...selected] })
          }}
          onRemoveAttachment={(index) =>
            update(thread.id, {
              attachments: draft.attachments.filter((_, itemIndex) => itemIndex !== index),
            })
          }
          onSend={() => void send()}
          onInterrupt={() => interruptMutation.mutate(thread.id)}
          interrupting={interruptMutation.isPending}
        />
      </div>
      {error && (
        <div className="app-error" role="alert">
          {error}
          <Button
            size="sm"
            onClick={() => {
              update(thread.id, { error: null })
              threadSettingsMutation.reset()
              interruptMutation.reset()
            }}
          >
            Dismiss
          </Button>
        </div>
      )}
    </Tabs.Panel>
  )
}
