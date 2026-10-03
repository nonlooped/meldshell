import { threadContentClasses } from "../ui/styles"
import { FadeDiv } from "../ui/motion"
import {
  errorMessage,
  type AppSnapshot,
  type FollowUpDelivery,
  type QueuedInput,
  type Thread,
  type TranscriptSearchResult,
} from "@meldshell/contracts"
import { useAppSettingsMutation, useConversationActions } from "../data/mutations"
import { refreshProviderStatus, useSelectedProvider } from "../data/providers"
import { workspaceScope } from "../data/workspace-scope"
import { emptyDraft, useThreadDrafts } from "../app/thread-drafts"
import { useViewStore } from "../app/view-store"
import { ErrorToast } from "../ui/Notice"
import { Composer } from "./Composer"
import { QueuedMessages } from "./QueuedMessages"
import { ReviewNotes } from "./ReviewNotes"
import { reviewNotesMessage } from "./review-notes"
import { skillAttachments } from "./composer-completion"
import { Transcript } from "./Transcript"
import { HandoffNotice } from "./Handoff"
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
  const {
    threadSettingsMutation,
    submitTurnMutation,
    removeQueuedInputMutation,
    steerQueuedInputMutation,
    interruptMutation,
  } = useConversationActions()
  const settingsMutation = useAppSettingsMutation()
  const followUp = snapshot.settings.followUpMode ?? "queue"
  const queued = snapshot.queuedInputs.filter((item) => item.threadId === thread.id)
  const queueBusy = removeQueuedInputMutation.isPending || steerQueuedInputMutation.isPending
  const busy = ["running", "queued", "approval"].includes(thread.activity)
  const send = async (delivery: FollowUpDelivery = followUp) => {
    const sent = useThreadDrafts.getState().drafts[thread.id] ?? emptyDraft
    if (sent.sending) return
    update(thread.id, { sending: true, error: null })
    try {
      const submitted = await submitTurnMutation.mutateAsync({
        threadId: thread.id,
        text: sent.text,
        attachments: [
          ...sent.attachments.map(({ type, value, name }) => ({ type, value, name })),
          ...skillAttachments(sent.text, sent.tokens),
        ],
        delivery,
      })
      useThreadDrafts.getState().finish(thread.id, sent)
      if (delivery === "steer" && submitted.disposition === "queued" && busy)
        update(thread.id, {
          error: "This turn can't be steered right now, so the message was queued instead.",
        })
    } catch (error) {
      update(thread.id, {
        sending: false,
        error: errorMessage(error),
      })
    }
  }
  /** Replies to a question Codex left in the transcript. */
  const answer = async (text: string, questionTurnId: string) => {
    try {
      await submitTurnMutation.mutateAsync({ threadId: thread.id, text, questionTurnId })
    } catch (error) {
      update(thread.id, { error: errorMessage(error) })
      throw error
    }
  }
  /** Moves a waiting follow-up back into the composer, ahead of whatever is being drafted. */
  const edit = (item: QueuedInput) => {
    removeQueuedInputMutation.mutate(item, {
      onSuccess: () => {
        const current = useThreadDrafts.getState().drafts[thread.id]?.text ?? ""
        update(thread.id, { text: current === "" ? item.text : `${item.text}\n\n${current}` })
      },
    })
  }
  const error =
    draft.error ??
    threadSettingsMutation.error?.message ??
    interruptMutation.error?.message ??
    removeQueuedInputMutation.error?.message ??
    steerQueuedInputMutation.error?.message
  /** Sends the notes left on diff lines as one follow-up, leaving the draft in the composer alone. */
  const sendNotes = async (notes: Parameters<typeof reviewNotesMessage>[0]) => {
    try {
      await submitTurnMutation.mutateAsync({
        threadId: thread.id,
        text: reviewNotesMessage(notes),
        delivery: followUp,
      })
    } catch (error) {
      update(thread.id, { error: errorMessage(error) })
      throw error
    }
  }
  return (
    <div className="grid h-full min-w-0 min-h-0 grid-rows-[minmax(0,_1fr)_auto]">
      <FadeDiv className={threadContentClasses}>
        <Transcript
          threadId={thread.id}
          revision={thread.historyRevision}
          onRewound={(text) => {
            const current = useThreadDrafts.getState().drafts[thread.id]?.text ?? ""
            update(thread.id, { text: current === "" ? text : `${text}\n\n${current}` })
            // The message is back in the composer, ready to be edited and sent again.
            useViewStore.getState().focusComposer(thread.id)
          }}
          onRewindUndone={(text) => {
            // The rewound message leaves again unless it was edited in the meantime.
            if ((useThreadDrafts.getState().drafts[thread.id]?.text ?? "") === text)
              update(thread.id, { text: "", tokens: [] })
          }}
          running={thread.activity === "running"}
          onAnswer={submitTurnMutation.isPending ? undefined : answer}
          scope={workspaceScope(thread)}
          onQuote={(text) => {
            const current = useThreadDrafts.getState().drafts[thread.id]?.text ?? ""
            const quote = text
              .split("\n")
              .map((line) => `> ${line}`)
              .join("\n")
            update(thread.id, { text: `${current}${current ? "\n\n" : ""}${quote}\n\n` })
          }}
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
          followUp={followUp}
          onFollowUpChange={(followUpMode) => settingsMutation.mutate({ followUpMode })}
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
          onSend={(delivery) => void send(delivery)}
          onInterrupt={() => interruptMutation.mutate(thread.id)}
          interrupting={interruptMutation.isPending}
          onSchedule={() => setScheduling(true)}
          accessory={
            <>
              <ReviewNotes
                threadId={thread.id}
                blocked={
                  !providerReady
                    ? "The agent is unavailable, so notes cannot be sent yet"
                    : thread.worktree?.setup === "running"
                      ? "Notes can be sent once the worktree is set up"
                      : null
                }
                onSend={sendNotes}
              />
              <HandoffNotice thread={thread} harness={harness} />
              <QueuedMessages
                items={queued}
                running={busy}
                pending={queueBusy}
                onEdit={edit}
                onSteer={(item) => steerQueuedInputMutation.mutate(item)}
                onRemove={(item) => removeQueuedInputMutation.mutate(item)}
                onClear={() => {
                  for (const item of queued) removeQueuedInputMutation.mutate(item)
                }}
              />
              <ThreadSchedules threadId={thread.id} />
            </>
          }
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
            removeQueuedInputMutation.reset()
            steerQueuedInputMutation.reset()
          }}
        />
      )}
    </div>
  )
}
