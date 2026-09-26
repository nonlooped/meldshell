import { threadContentClasses } from "../ui/styles"
import { FadeDiv } from "../ui/motion"
import {
  errorMessage,
  type AppSnapshot,
  type Thread,
  type TranscriptSearchResult,
} from "@meldshell/contracts"
import { useThreadActions } from "../data/mutations"
import { refreshProviderStatus, useSelectedProvider } from "../data/providers"
import { workspaceScope } from "../data/workspace-scope"
import { emptyDraft, useThreadDrafts } from "../app/thread-drafts"
import { ErrorToast } from "../ui/Notice"
import { Composer } from "./Composer"
import { skillAttachments } from "./composer-completion"
import { Transcript } from "./Transcript"
import { ThreadBranchToggle, ThreadOrigin } from "./ThreadOrigin"
import { useState } from "react"
import { ScheduleDialog } from "../schedules/ScheduleDialog"
import { ThreadSchedules } from "../schedules/ThreadSchedules"

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
  const [scheduling, setScheduling] = useState(false)
  const update = useThreadDrafts((state) => state.update)
  const { harness, providerStatus, providerReady } = useSelectedProvider(snapshot, thread.id)
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
        error: errorMessage(error),
      })
    }
  }
  const busy = ["running", "queued", "approval"].includes(thread.activity)
  /** Replies to a question Codex left in the transcript. */
  const answer = async (text: string, questionTurnId: string) => {
    try {
      await submitTurnMutation.mutateAsync({ threadId: thread.id, text, questionTurnId })
    } catch (error) {
      update(thread.id, { error: errorMessage(error) })
      throw error
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
          onAnswer={submitTurnMutation.isPending ? undefined : answer}
          scope={workspaceScope(thread)}
          origin={<ThreadOrigin thread={thread} workspaces={snapshot.workspaces} />}
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
          onRecheckProvider={() => void refreshProviderStatus(harness)}
          onChangeSettings={(input) => threadSettingsMutation.mutate(input)}
          running={busy}
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
          onSchedule={() => setScheduling(true)}
          accessory={<ThreadSchedules threadId={thread.id} />}
        />
        {thread.turnCount === 0 && <ThreadBranchToggle thread={thread} />}
      </FadeDiv>
      {scheduling && (
        <ScheduleDialog
          threadId={thread.id}
          schedule={null}
          prompt={draft.text}
          onClose={() => setScheduling(false)}
          // The scheduled text leaves the composer; attachments stay for a message sent now.
          onSaved={() => update(thread.id, { text: "", tokens: [] })}
        />
      )}
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
