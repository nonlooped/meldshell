import { useEffect, useRef, useState } from "react"
import { CheckboxGroup } from "@base-ui-components/react/checkbox-group"
import { RadioGroup } from "@base-ui-components/react/radio-group"
import { Field } from "@base-ui-components/react/field"
import { Fieldset } from "@base-ui-components/react/fieldset"
import { skipToken, useQuery } from "@tanstack/react-query"
import { MessageCircleQuestion, ShieldCheck } from "lucide-react"
import type { ApprovalRequest, CanonicalEvent, ResolveApprovalInput } from "@meldshell/contracts"
import { Button, Checkbox, Radio, TextField } from "../ui/controls"
import { cx, questionHeaderClasses, questionOptionClasses, questionTextClasses } from "../ui/styles"
import { Markdown } from "../ui/Markdown"
import { ChangeDiff } from "../ui/ChangeDiff"
import { DiffReviewScope } from "../ui/DiffNotes"
import { queryKeys } from "../data/cache"
import type { TranscriptWindow } from "../data/transcript"
import { useResolveApprovalMutation } from "../data/mutations"
import {
  approvalCommand,
  approvalFields,
  approvalPatch,
  approvalSummary,
  type ToolField,
} from "./approval-details"

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
  onDraftChange,
}: {
  question: Question
  draft: Draft
  disabled: boolean
  onDraftChange: (draft: Draft) => void
}): React.JSX.Element {
  const options = question.options ?? []
  const choices = [
    ...options.map((option) => ({
      value: option.value ?? option.label,
      label: option.label,
      description: option.description,
    })),
    ...(options.length > 0 ? [{ value: OTHER, label: "Other", description: "" }] : []),
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

const acceptLabel = (request: ApprovalRequest): string => {
  if (request.kind === "user-input")
    return request.questions.length > 1 ? "Submit answers" : "Submit answer"
  return request.kind === "plan" ? "Approve plan" : "Allow once"
}

/** The events of the turn that raised a request, read from the open transcript. */
function useTurnEvents(
  threadId: string,
  revision: string | undefined,
  turnId: string,
): ReadonlyArray<CanonicalEvent> {
  // The transcript beside the card keeps this up to date; the card only reads it.
  const query = useQuery({
    queryKey: queryKeys.transcript(threadId, revision),
    queryFn: skipToken,
    select: (window: TranscriptWindow) => window.groups.get(turnId),
  })
  return query.data ?? []
}

function FieldList({ fields }: { fields: ReadonlyArray<ToolField> }): React.JSX.Element {
  return (
    <dl className="grid grid-cols-[minmax(64px,_max-content)_minmax(0,_1fr)] gap-x-[14px] gap-y-[6px] m-0 text-[12px]">
      {fields.map((field) => (
        <div key={field.label} className="contents">
          <dt className="text-[var(--text-tertiary)]">{field.label}</dt>
          <dd
            className={cx(
              "m-0 min-w-0 text-[var(--text-primary)] whitespace-pre-wrap [overflow-wrap:anywhere] max-h-[160px] overflow-y-auto",
              field.code && "[font-family:var(--font-mono)] text-[11.5px]",
            )}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * A request from the agent, shown above the composer of every pane that shows its thread: what it
 * wants to run or change, and the answer. A decline can carry a reason back to the agent.
 */
export function InteractionCard({
  request,
  revision,
  focused,
}: {
  readonly request: ApprovalRequest
  /** The thread's history revision, which keys its transcript. */
  readonly revision: string | undefined
  /** Whether this pane is the one the user is working in, which takes keyboard focus. */
  readonly focused: boolean
}): React.JSX.Element {
  const mutation = useResolveApprovalMutation()
  const pending = mutation.isPending
  const questions = request.kind === "user-input" ? request.questions : []
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(questions.map((question) => [question.id, initialDraft(question)])),
  )
  const [reason, setReason] = useState("")
  const turnEvents = useTurnEvents(request.threadId, revision, request.turnId)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    // Questions focus their own first field; approvals offer the primary answer to the keyboard.
    if (focused && !sectionRef.current?.contains(document.activeElement))
      (request.kind === "user-input" ? null : primaryRef.current)?.focus({ preventScroll: true })
  }, [focused, request.kind])
  const answers = Object.fromEntries(
    questions.map((question) => [
      question.id,
      draftAnswers(question, drafts[question.id] ?? emptyDraft),
    ]),
  )
  const userInput = request.kind === "user-input"
  const onResolve = (input: ResolveApprovalInput): void => mutation.mutate(input)
  const resolve = (decision: ResolveApprovalInput["decision"]): void =>
    onResolve({
      approvalId: request.id,
      decision,
      ...(userInput ? { answers } : {}),
      ...(decision === "decline" && reason.trim() ? { reason: reason.trim() } : {}),
    })
  const incomplete = questions.some(
    (question) => !answers[question.id]?.some((answer) => answer.trim()),
  )
  const patch = approvalPatch(request, turnEvents)
  const summary = approvalSummary(request)
  const command = approvalCommand(request)
  const fields = patch === null ? approvalFields(request) : []
  // Cursor answers with its own options, and questions are skipped rather than declined.
  const declinable = !userInput && request.kind !== "cursor-permission"
  const Icon = userInput ? MessageCircleQuestion : ShieldCheck
  return (
    <section
      ref={sectionRef}
      aria-label={request.title}
      className="interaction-card w-full max-w-[860px] [margin:0_auto_8px] grid border-[1px] border-[color:var(--line)] border-l-[2px] border-l-[color:var(--accent)] rounded-[var(--radius-lg)] bg-[var(--surface-raised)] [box-shadow:var(--shadow-raised)] overflow-hidden"
    >
      <header className="flex items-center gap-[8px] [padding:10px_14px_0]">
        <Icon
          size={15}
          strokeWidth={1.75}
          className="flex-none text-[var(--accent)]"
          aria-hidden="true"
        />
        <h3 className="m-0 flex-1 min-w-0 text-[13px] font-semibold leading-[1.4]">
          {request.title}
        </h3>
      </header>
      <div className="flex flex-col gap-[10px] max-h-[min(46vh,_440px)] overflow-y-auto [padding:8px_14px_12px] min-w-0">
        {summary !== null && (patch === null || request.kind !== "file-change") && (
          <p className="m-0 text-[var(--text-secondary)] text-[12.5px] [overflow-wrap:anywhere]">
            {summary}
          </p>
        )}
        {command !== null && (
          <pre className="m-0 max-h-[180px] overflow-auto [padding:8px_10px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] bg-[var(--surface-hover)] text-[var(--text-primary)] [font-family:var(--font-mono)] text-[11.5px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]">
            {command}
          </pre>
        )}
        {patch !== null && (
          // Notes belong to finished changes; this one is not written yet.
          <DiffReviewScope threadId={undefined}>
            <ChangeDiff path={request.title} patch={patch} />
          </DiffReviewScope>
        )}
        {fields.length > 0 && <FieldList fields={fields} />}
        {request.kind === "plan" && <Markdown className="plan-review" text={request.plan} />}
        {userInput && (
          <div className="flex flex-col [&_>_*_+_*]:mt-[16px] [&_>_*_+_*]:pt-[16px] [&_>_*_+_*]:border-t-[1px] [&_>_*_+_*]:border-t-[color:var(--line-subtle)]">
            {questions.map((question) => (
              <QuestionInput
                key={question.id}
                question={question}
                draft={drafts[question.id] ?? emptyDraft}
                disabled={pending}
                onDraftChange={(draft) =>
                  setDrafts((current) => ({ ...current, [question.id]: draft }))
                }
              />
            ))}
          </div>
        )}
      </div>
      {mutation.error && (
        <p
          role="alert"
          className="m-0 [padding:0_14px_10px] text-[var(--color-deleted)] text-[12px]"
        >
          {mutation.error.message}
        </p>
      )}
      <footer className="@container flex flex-wrap items-center justify-end gap-[8px] [padding:10px_14px] border-t-[1px] border-t-[color:var(--line-subtle)] bg-[var(--surface-hover)] [&_.button]:h-[30px]">
        {declinable && (
          <TextField
            className="flex-[1_1_100%] @[620px]:flex-[1_1_220px] min-w-0 h-[30px]"
            aria-label="Reason for declining"
            placeholder={
              request.kind === "plan"
                ? "What should change in the plan? (optional)"
                : "Tell the agent what to do instead (optional)"
            }
            disabled={pending}
            value={reason}
            onValueChange={setReason}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && reason.trim()) {
                event.preventDefault()
                resolve("decline")
              }
            }}
          />
        )}
        {request.kind === "cursor-permission" ? (
          request.options.map((option, index) => (
            <Button
              key={option.optionId}
              ref={index === 0 ? primaryRef : undefined}
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
              ref={primaryRef}
              variant="primary"
              disabled={pending || incomplete}
              onClick={() => resolve("accept")}
            >
              {acceptLabel(request)}
            </Button>
          </>
        )}
      </footer>
    </section>
  )
}
