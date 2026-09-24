import { threadContentClasses } from "../ui/styles"
import { FadeDiv } from "../ui/motion"
import type { AppSnapshot, Thread, TranscriptSearchResult } from "@meldshell/contracts"
import { useThreadActions } from "../data/mutations"
import { useSelectedProvider } from "../data/providers"
import { workspaceScope } from "../data/workspace-scope"
import { emptyDraft, useThreadDrafts } from "../app/thread-drafts"
import { ErrorToast } from "../ui/Notice"
import { Composer } from "./Composer"
import { skillAttachments } from "./composer-completion"
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
        attachments: [
          ...sent.attachments.map(({ type, value, name }) => ({ type, value, name })),
          ...skillAttachments(sent.text, sent.tokens),
        ],
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
    <div className="grid h-full min-w-0 min-h-0 grid-rows-[minmax(0,_1fr)_auto]">
      <FadeDiv className={threadContentClasses}>
        <Transcript
          threadId={thread.id}
          running={thread.activity === "running"}
          workspace={snapshot.workspaces.find((workspace) => workspace.id === thread.workspaceId)}
          scope={workspaceScope(thread)}
          branch={thread.worktree?.branch}
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
          tokens={draft.tokens}
          onTokensChange={(tokens) => update(thread.id, { tokens })}
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
      </FadeDiv>
      {error && (
        <ErrorToast
          message={error}
          onDismiss={() => {
            update(thread.id, { error: null })
            threadSettingsMutation.reset()
            interruptMutation.reset()
          }}
        />
      )}
    </div>
  )
}
