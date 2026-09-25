import { useState } from "react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { MessageCircleQuestion } from "lucide-react"
import type { AsyncQuestion } from "@meldshell/projection"
import { Button } from "../ui/controls"
import { questionOptionClasses, questionTextClasses } from "../ui/styles"

/** The reply that answers each chosen question on its own line. */
const replyText = (
  questions: ReadonlyArray<AsyncQuestion>,
  chosen: ReadonlyArray<string | undefined>,
): string =>
  questions
    .flatMap((question, index) => {
      const answer = chosen[index]
      return answer === undefined ? [] : [`${question.title} — ${answer}`]
    })
    .join("\n")

/**
 * Questions Codex asked without pausing its turn. Choosing an option sends it as the next message;
 * anything else is answered in the composer. Only the thread's latest idle turn takes answers.
 */
export function AsyncQuestions({
  questions,
  onAnswer,
}: {
  readonly questions: ReadonlyArray<AsyncQuestion>
  /** Absent when the question has been answered or the thread is busy. */
  readonly onAnswer?: (text: string) => void
}): React.JSX.Element {
  const [chosen, setChosen] = useState<ReadonlyArray<string | undefined>>([])
  const single = questions.length === 1
  const choose = (index: number, option: string): void => {
    if (onAnswer === undefined) return
    if (single) {
      onAnswer(option)
      return
    }
    setChosen((current) => questions.map((_, at) => (at === index ? option : current[at])))
  }
  // Questions without options are answered in the composer, so they never hold the reply back.
  const complete = questions.every(
    (question, index) => question.options.length === 0 || chosen[index] !== undefined,
  )
  const answered = chosen.some((answer) => answer !== undefined)
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
                  disabled={onAnswer === undefined}
                  aria-pressed={single ? undefined : chosen[index] === option}
                  onClick={() => choose(index, option)}
                >
                  {option}
                </BaseButton>
              ))}
            </div>
          )}
        </div>
      ))}
      {onAnswer !== undefined && (
        <div className="flex items-center justify-between gap-[12px]">
          <span className="text-[var(--text-tertiary)] text-[11.5px]">
            Or answer in your own words below.
          </span>
          {!single && (
            <Button
              variant="primary"
              size="sm"
              disabled={!complete || !answered}
              onClick={() => onAnswer(replyText(questions, chosen))}
            >
              Send answers
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
