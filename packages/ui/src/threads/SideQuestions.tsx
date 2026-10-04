import { useEffect, useRef } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, Copy, CornerDownLeft, MessageCircleDashed, RotateCw, X } from "lucide-react"
import { HARNESSES, isHarness } from "@meldshell/contracts"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { useCopy } from "../ui/CopyButton"
import { IconButton } from "../ui/controls"
import { Markdown } from "../ui/Markdown"
import { Shimmer, Swap, useMotionPreference } from "../ui/motion"
import { type SideQuestion, useSideQuestions, useThreadSideQuestions } from "./side-questions"

const actionClasses = [
  "motion-colors inline-flex items-center gap-[5px] [padding:2px_7px] border-0 rounded-[999px]",
  "bg-transparent text-[var(--text-tertiary)] text-[11px] [font-family:inherit] cursor-pointer",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]",
].join(" ")

function Exchange({
  entry,
  agent,
  onRetry,
  onAskAgent,
}: {
  readonly entry: SideQuestion
  readonly agent: string
  readonly onRetry: () => void
  readonly onAskAgent: () => void
}): React.JSX.Element {
  const [copyState, copy] = useCopy()
  return (
    <div className="grid gap-[8px]">
      <p className="m-0 justify-self-end max-w-[80%] [padding:7px_12px] rounded-[14px] rounded-br-[5px] bg-[var(--surface-active)] text-[var(--text-primary)] text-[12.5px] whitespace-pre-wrap [overflow-wrap:anywhere]">
        {entry.question}
      </p>
      {entry.status === "asking" && (
        <p className="m-0 text-[12.5px]" role="status">
          <Shimmer>Thinking about the conversation…</Shimmer>
        </p>
      )}
      {entry.status === "answered" && entry.answer !== null && (
        <div className="grid gap-[2px]">
          <div className="text-[var(--text-secondary)] text-[13px]">
            <Markdown text={entry.answer} />
          </div>
          <div className="flex gap-[2px] -ml-[7px]">
            <button
              type="button"
              className={actionClasses}
              onClick={() => void copy(entry.answer ?? "")}
            >
              <Swap id={copyState === "copied" ? "copied" : "copy"}>
                {copyState === "copied" ? <Check size={11} /> : <Copy size={11} />}
              </Swap>
              {copyState === "copied" ? "Copied" : "Copy"}
            </button>
            <button type="button" className={actionClasses} onClick={onAskAgent}>
              <CornerDownLeft size={11} aria-hidden="true" />
              Ask {agent} instead
            </button>
          </div>
        </div>
      )}
      {entry.status === "failed" && (
        <div
          className="flex items-center gap-[8px] text-[var(--text-secondary)] text-[12.5px]"
          role="alert"
        >
          <span className="min-w-0 flex-1">{entry.error}</span>
          <button type="button" className={actionClasses} onClick={onRetry}>
            <RotateCw size={11} aria-hidden="true" />
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Side questions asked with `/btw` float over the foot of the transcript, apart from it, the way
 * Claude Code shows them. They are answered outside the thread, so the agent keeps working
 * undisturbed and never reads them. Escape closes the sheet.
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
}): React.JSX.Element {
  const questions = useThreadSideQuestions(scope.threadId)
  const reduced = useMotionPreference()
  const body = useRef<HTMLDivElement>(null)
  const agent = isHarness(harness) ? HARNESSES[harness].label : "The agent"
  const open = questions.length > 0
  const { ask, dismiss, close } = useSideQuestions.getState()
  const threadId = scope.threadId

  // The newest exchange, and its answer when it arrives, stay in view.
  const latest = questions.at(-1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Scroll when the newest exchange changes.
  useEffect(() => {
    const element = body.current
    if (element !== null) element.scrollTop = element.scrollHeight
  }, [latest?.id, latest?.status])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      // Menus, completions, and dialogs handle their own Escape first.
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (document.activeElement?.closest('[role="dialog"], [role="menu"]')) return
      close(threadId)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, threadId, close])

  return (
    // Anchored at the composer's top edge without taking space, so the sheet floats over the
    // transcript instead of pushing it up.
    <div className="relative h-0 w-full max-w-[860px] mx-auto">
      <AnimatePresence>
        {open && (
          <motion.section
            aria-label="Side questions"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute bottom-[10px] inset-x-0 z-10 grid grid-rows-[auto_minmax(0,_1fr)] max-h-[min(360px,_45vh)] origin-bottom rounded-[16px] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-menu)] [backdrop-filter:blur(18px)_saturate(1.2)] shadow-[var(--shadow-popup)] overflow-hidden"
          >
            <header className="flex items-center gap-[7px] [padding:9px_8px_6px_14px] text-[11px]">
              <MessageCircleDashed
                size={13}
                strokeWidth={1.75}
                className="flex-none text-[var(--text-tertiary)]"
                aria-hidden="true"
              />
              <span className="text-[var(--text-secondary)] font-medium">Side question</span>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-tertiary)]">
                · {agent} won't see this
              </span>
              <span className="flex-1" />
              <kbd className="[padding:1px_5px] rounded-[5px] border-[1px] border-[color:var(--line)] text-[var(--text-tertiary)] text-[10px] [font-family:inherit]">
                Esc
              </kbd>
              <IconButton label="Close side questions" onClick={() => close(threadId)}>
                <X size={13} />
              </IconButton>
            </header>
            <div ref={body} className="grid gap-[14px] [padding:4px_16px_10px] overflow-y-auto">
              {questions.map((entry) => (
                <Exchange
                  key={entry.id}
                  entry={entry}
                  agent={agent}
                  onRetry={() => {
                    dismiss(threadId, entry.id)
                    void ask(scope, entry.question)
                  }}
                  onAskAgent={() => {
                    dismiss(threadId, entry.id)
                    onAskAgent(entry.question)
                  }}
                />
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
