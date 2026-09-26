import { useRef, useState } from "react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { MessageCircleQuestion } from "lucide-react"
import type { AsyncQuestion } from "@meldshell/projection"
import { Button, TextField } from "../ui/controls"
import { questionOptionClasses, questionTextClasses } from "../ui/styles"

/** Questions remain answerable while Codex works; failed sends preserve the draft. */
export function AsyncQuestions({
  questions,
  onAnswer,
}: {
  readonly questions: ReadonlyArray<AsyncQuestion>
  readonly onAnswer?: (text: string) => Promise<void>
}): React.JSX.Element {
  const [answers, setAnswers] = useState<ReadonlyArray<string>>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const inFlight = useRef(false)
  const single = questions.length === 1
  const disabled = onAnswer === undefined || sending || sent
  const complete = questions.every((_, index) => answers[index]?.trim())
  const choose = (index: number, answer: string): void => {
    setAnswers((current) => questions.map((_, at) => (at === index ? answer : (current[at] ?? ""))))
  }
  const submit = async (): Promise<void> => {
    if (disabled || !complete || inFlight.current) return
    inFlight.current = true
    setSending(true)
    try {
      await onAnswer(
        questions.map((question, index) => `${question.title} — ${answers[index]}`).join("\n"),
      )
      setSent(true)
    } catch {
      // ThreadView reports the delivery error. Keep these answers available for retry.
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }
  return (
    <section
      className="flex flex-col gap-[14px] [padding:14px_16px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-hover)]"
      aria-label={single ? "Codex's question" : "Codex's questions"}
    >
      <p className="m-0 flex items-center gap-[6px] text-[var(--text-tertiary)] text-[11px] font-medium">
        <MessageCircleQuestion size={13} strokeWidth={1.75} aria-hidden="true" />
        {single ? "Codex asked" : `Codex asked ${questions.length} questions`}
      </p>
      {questions.map((question, index) => (
        <div key={`${index}:${question.title}`} className="flex flex-col gap-[8px]">
          <p className={questionTextClasses}>{question.title}</p>
          {question.options.length > 0 && (
            <div className="flex flex-col gap-[6px]" role="group" aria-label={question.title}>
              {question.options.map((option) => (
                <BaseButton
                  key={option}
                  type="button"
                  className={questionOptionClasses}
                  disabled={disabled}
                  aria-pressed={answers[index] === option}
                  onClick={() => choose(index, option)}
                >
                  {option}
                </BaseButton>
              ))}
            </div>
          )}
          <TextField
            aria-label={`Your answer to: ${question.title}`}
            placeholder={
              question.options.length ? "Choose an option or type your answer" : "Your answer"
            }
            disabled={disabled}
            value={answers[index] ?? ""}
            onValueChange={(answer) => choose(index, answer)}
          />
        </div>
      ))}
      {(onAnswer !== undefined || sending || sent) && (
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            disabled={disabled || !complete}
            onClick={() => void submit()}
          >
            {sent ? "Answer sent" : sending ? "Sending…" : single ? "Send answer" : "Send answers"}
          </Button>
        </div>
      )}
    </section>
  )
}
