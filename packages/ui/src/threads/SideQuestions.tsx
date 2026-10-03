import { AnimatePresence, motion } from "motion/react"
import { Check, Copy, CornerDownLeft, MessageCircleDashed, RotateCw, X } from "lucide-react"
import { HARNESSES, isHarness } from "@meldshell/contracts"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { copyStatusText, useCopy } from "../ui/CopyButton"
import { IconButton } from "../ui/controls"
import { Markdown } from "../ui/Markdown"
import { Shimmer, Swap, useMotionPreference } from "../ui/motion"
import { type SideQuestion, useSideQuestions, useThreadSideQuestions } from "./side-questions"

function SideQuestionCard({
  entry,
  agent,
  onRetry,
  onAskAgent,
  onDismiss,
}: {
  readonly entry: SideQuestion
  readonly agent: string
  readonly onRetry: () => void
  readonly onAskAgent: () => void
  readonly onDismiss: () => void
}): React.JSX.Element {
  const [copyState, copy] = useCopy()
  return (
    <section
      aria-label={`Side question: ${entry.question}`}
      className="grid border-[1px] border-[color:var(--line-subtle)] border-l-[2px] border-l-[color:var(--text-tertiary)] rounded-[var(--radius-lg)] bg-[var(--surface-raised)] overflow-hidden"
    >
      <div className="flex items-center gap-[7px] [padding:4px_6px_4px_12px] border-b-[1px] border-b-[color:var(--line-subtle)] text-[11px]">
        <MessageCircleDashed
          size={12}
          strokeWidth={1.75}
          className="flex-none text-[var(--text-tertiary)]"
          aria-hidden="true"
        />
        <span className="text-[var(--text-secondary)] font-medium">Side question</span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-tertiary)]">
          {agent} won't see this
        </span>
        <span className="flex-1" />
        <span className="text-[var(--text-tertiary)]" role="status">
          {copyStatusText(copyState)}
        </span>
        {entry.answer !== null && (
          <IconButton label="Copy answer" onClick={() => void copy(entry.answer ?? "")}>
            <Swap id={copyState === "copied" ? "copied" : "copy"}>
              {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
            </Swap>
          </IconButton>
        )}
        <IconButton label={`Ask ${agent} instead`} onClick={onAskAgent}>
          <CornerDownLeft size={13} />
        </IconButton>
        <IconButton label="Dismiss side question" onClick={onDismiss}>
          <X size={13} />
        </IconButton>
      </div>
      <div className="grid gap-[6px] [padding:9px_14px_11px] max-h-[260px] overflow-y-auto text-[12.5px]">
        <p className="m-0 text-[var(--text-primary)] font-medium whitespace-pre-wrap [overflow-wrap:anywhere]">
          {entry.question}
        </p>
        {entry.status === "asking" && (
          <p className="m-0 text-[12px]" role="status">
            <Shimmer>Reading the conversation…</Shimmer>
          </p>
        )}
        {entry.status === "answered" && entry.answer !== null && (
          <div className="text-[var(--text-secondary)]">
            <Markdown text={entry.answer} />
          </div>
        )}
        {entry.status === "failed" && (
          <div
            className="flex items-center gap-[8px] text-[var(--text-secondary)] text-[12px]"
            role="alert"
          >
            <span className="min-w-0 flex-1">{entry.error}</span>
            <button
              type="button"
              className="motion-colors inline-flex flex-none items-center gap-[5px] [padding:2px_8px] border-0 rounded-[999px] bg-transparent text-[var(--text-secondary)] [font:inherit] cursor-pointer [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]"
              onClick={onRetry}
            >
              <RotateCw size={11} aria-hidden="true" />
              Try again
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Side questions asked with `/btw`, above the composer. They are answered apart from the thread,
 * so the agent keeps working undisturbed and never reads them.
 */
export function SideQuestions({
  scope,
  harness,
  onAskAgent,
}: {
  readonly scope: WorkspaceScope & { readonly threadId: string }
  readonly harness: string
  /** Moves the question into the composer, to ask the agent itself. */
  readonly onAskAgent: (question: string) => void
}): React.JSX.Element | null {
  const questions = useThreadSideQuestions(scope.threadId)
  const reduced = useMotionPreference()
  const agent = isHarness(harness) ? HARNESSES[harness].label : "The agent"
  if (questions.length === 0) return null
  const { ask, dismiss } = useSideQuestions.getState()
  return (
    <div className="grid gap-[6px] w-full max-w-[860px] [margin:0_auto_8px]">
      <AnimatePresence initial={false}>
        {questions.map((entry) => (
          <motion.div
            key={entry.id}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <SideQuestionCard
              entry={entry}
              agent={agent}
              onRetry={() => {
                dismiss(scope.threadId, entry.id)
                void ask(scope, entry.question)
              }}
              onAskAgent={() => {
                dismiss(scope.threadId, entry.id)
                onAskAgent(entry.question)
              }}
              onDismiss={() => dismiss(scope.threadId, entry.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
