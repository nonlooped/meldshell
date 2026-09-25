import { useState } from "react"
import { CheckboxGroup } from "@base-ui-components/react/checkbox-group"
import { RadioGroup } from "@base-ui-components/react/radio-group"
import { Field } from "@base-ui-components/react/field"
import { Fieldset } from "@base-ui-components/react/fieldset"
import type { ApprovalRequest, ResolveApprovalInput } from "@meldshell/contracts"
import { AppDialog, Button, Checkbox, Radio, TextField } from "../ui/controls"
import { questionHeaderClasses, questionOptionClasses, questionTextClasses } from "../ui/styles"
import { Markdown } from "../ui/Markdown"

type Question = Extract<ApprovalRequest, { kind: "user-input" }>["questions"][number]

/** The option that stands for an answer in the user's own words. */
const OTHER = "\u0000other"

interface Draft {
  /** Chosen option values, with `OTHER` when the user writes their own answer. */
  readonly selected: ReadonlyArray<string>
  readonly other: string
}

const emptyDraft: Draft = { selected: [], other: "" }

/** What a question's draft answers: chosen options, then the user's own words when chosen. */
const draftAnswers = (question: Question, draft: Draft): string[] => {
  const typed = draft.other.trim()
  if (!question.options?.length) return typed ? [draft.other] : []
  return [
    ...draft.selected.filter((value) => value !== OTHER),
    ...(draft.selected.includes(OTHER) && typed ? [draft.other] : []),
  ]
}

const initialDraft = (question: Question): Draft => {
  const value = question.defaultValue
  if (value === undefined) return emptyDraft
  const option = question.options?.find((choice) => (choice.value ?? choice.label) === value)
  if (option) return { selected: [value], other: "" }
  return question.options?.length
    ? { selected: [OTHER], other: value }
    : { selected: [], other: value }
}

function QuestionInput({
  question,
  draft,
  disabled,
  allowOther,
  onDraftChange,
}: {
  question: Question
  draft: Draft
  disabled: boolean
  allowOther: boolean
  onDraftChange: (draft: Draft) => void
}): React.JSX.Element {
  const options = question.options ?? []
  const choices = [
    ...options.map((option) => ({
      value: option.value ?? option.label,
      label: option.label,
      description: option.description,
    })),
    ...(allowOther && options.length > 0
      ? [{ value: OTHER, label: "Other", description: "" }]
      : []),
  ]
  const writing = options.length === 0 || draft.selected.includes(OTHER)
  const rows = choices.map((choice) => (
    <Field.Item key={choice.value}>
      <Field.Label className={questionOptionClasses}>
        <span className="flex pt-[2px]">
          {question.multiSelect ? (
            <Checkbox value={choice.value} />
          ) : (
            <Radio value={choice.value} />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-[2px]">
          <span>{choice.label}</span>
          {choice.description && (
            <span className="text-[var(--text-secondary)] text-[12px]">{choice.description}</span>
          )}
        </span>
      </Field.Label>
    </Field.Item>
  ))
  const hasHeader = question.header.trim() && question.header.trim() !== question.question.trim()
  return (
    <Fieldset.Root className="m-0 min-w-0 p-0 border-0" disabled={disabled}>
      <Fieldset.Legend className="mb-[10px] p-0">
        {hasHeader && <span className={questionHeaderClasses}>{question.header}</span>}
        <span className={questionTextClasses}>{question.question}</span>
      </Fieldset.Legend>
      {rows.length > 0 && (
        <Field.Root disabled={disabled}>
          {question.multiSelect ? (
            <CheckboxGroup
              className="flex flex-col gap-[6px]"
              value={[...draft.selected]}
              onValueChange={(selected) => onDraftChange({ ...draft, selected })}
              aria-label={question.question}
            >
              {rows}
            </CheckboxGroup>
          ) : (
            <RadioGroup
              className="flex flex-col gap-[6px]"
              value={draft.selected[0] ?? null}
              onValueChange={(next) => onDraftChange({ ...draft, selected: [String(next)] })}
              aria-label={question.question}
            >
              {rows}
            </RadioGroup>
          )}
        </Field.Root>
      )}
      {writing &&
        (question.multiline ? (
          <textarea
            className="mt-[8px] w-full [box-sizing:border-box] [resize:vertical] p-[10px] text-[var(--text-primary)] text-[12.5px] bg-[var(--surface-raised)] border-[1px] border-[color:var(--line)] rounded-[var(--radius)] [font-family:inherit] outline-none [&:focus]:[border-color:var(--line-strong)]"
            aria-label={question.question}
            disabled={disabled}
            value={draft.other}
            onChange={(event) => onDraftChange({ ...draft, other: event.target.value })}
            rows={6}
          />
        ) : (
          <TextField
            className="mt-[8px]"
            aria-label={options.length ? `Your answer to: ${question.question}` : question.question}
            placeholder={options.length ? "Type your answer" : "Your answer"}
            type={question.isSecret ? "password" : "text"}
            disabled={disabled}
            autoFocus={options.length > 0}
            value={draft.other}
            onValueChange={(other) => onDraftChange({ ...draft, other })}
          />
        ))}
    </Fieldset.Root>
  )
}

const declineLabel = (request: ApprovalRequest): string => {
  if (request.kind === "user-input") return "Skip"
  return request.kind === "plan" ? "Keep planning" : "Decline"
}

export function InteractionDialog({
  request,
  pending,
  error,
  onResolve,
}: {
  readonly request: ApprovalRequest
  readonly pending: boolean
  readonly error: string | null
  readonly onResolve: (input: ResolveApprovalInput) => void
}): React.JSX.Element {
  const questions = request.kind === "user-input" ? request.questions : []
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(questions.map((question) => [question.id, initialDraft(question)])),
  )
  const answers = Object.fromEntries(
    questions.map((question) => [
      question.id,
      draftAnswers(question, drafts[question.id] ?? emptyDraft),
    ]),
  )
  const userInput = request.kind === "user-input"
  const resolve = (decision: ResolveApprovalInput["decision"]): void =>
    onResolve({
      approvalId: request.id,
      decision,
      ...(userInput ? { answers } : {}),
    })
  const incomplete = questions.some(
    (question) => !answers[question.id]?.some((answer) => answer.trim()),
  )
  return (
    <AppDialog
      alert={!userInput}
      open
      onOpenChange={(open) => {
        if (!open && !pending) resolve("cancel")
      }}
      title={request.title}
      actions={
        <>
          {request.kind === "cursor-permission" ? (
            request.options.map((option) => (
              <Button
                key={option.optionId}
                disabled={pending}
                onClick={() =>
                  onResolve({
                    approvalId: request.id,
                    decision: "accept",
                    optionId: option.optionId,
                  })
                }
              >
                {option.name}
              </Button>
            ))
          ) : (
            <>
              <Button disabled={pending} onClick={() => resolve("decline")}>
                {declineLabel(request)}
              </Button>
              {!userInput && request.kind !== "plan" && (
                <Button disabled={pending} onClick={() => resolve("acceptForSession")}>
                  {request.approvalScope === "turn"
                    ? "Allow for this turn"
                    : "Allow for this session"}
                </Button>
              )}
              <Button
                variant="primary"
                disabled={pending || incomplete}
                onClick={() => resolve("accept")}
              >
                {userInput
                  ? questions.length > 1
                    ? "Submit answers"
                    : "Submit answer"
                  : request.kind === "plan"
                    ? "Approve plan"
                    : "Allow once"}
              </Button>
            </>
          )}
        </>
      }
    >
      {!userInput && (
        <p className="max-h-[220px] overflow-auto [padding:9px_10px] [margin:12px_20px_0] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] [background:rgba(0,_0,_0,_0.198)] text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[11.5px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {request.detail}
        </p>
      )}
      {request.kind === "plan" && <Markdown className="plan-review" text={request.plan} />}
      {request.kind === "cursor-permission" && (
        <pre className="max-h-[220px] overflow-auto [padding:9px_10px] [margin:12px_20px_0] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] [background:rgba(0,_0,_0,_0.198)] text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[11.5px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {JSON.stringify((request.params as { toolCall?: unknown }).toolCall, null, 2)}
        </pre>
      )}
      {request.kind === "permissions" && (
        <pre className="max-h-[220px] overflow-auto [padding:9px_10px] [margin:12px_20px_0] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] [background:rgba(0,_0,_0,_0.198)] text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[11.5px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {JSON.stringify(request.permissions, null, 2)}
        </pre>
      )}
      {userInput && (
        <div className="flex flex-col [padding:14px_20px_0] [&_>_*_+_*]:mt-[16px] [&_>_*_+_*]:pt-[16px] [&_>_*_+_*]:border-t-[1px] [&_>_*_+_*]:border-t-[color:var(--line-subtle)]">
          {questions.map((question) => (
            <QuestionInput
              key={question.id}
              question={question}
              draft={drafts[question.id] ?? emptyDraft}
              disabled={pending}
              allowOther={question.isOther !== false}
              onDraftChange={(draft) =>
                setDrafts((current) => ({ ...current, [question.id]: draft }))
              }
            />
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </AppDialog>
  )
}
