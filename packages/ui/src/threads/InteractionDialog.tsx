import { useState } from "react"
import { CheckboxGroup } from "@base-ui-components/react/checkbox-group"
import { RadioGroup } from "@base-ui-components/react/radio-group"
import { Field } from "@base-ui-components/react/field"
import { Fieldset } from "@base-ui-components/react/fieldset"
import type { ApprovalRequest, ResolveApprovalInput } from "@meldshell/contracts"
import { AppDialog, Button, Checkbox, Radio, TextField } from "../ui/controls"
import { Markdown } from "../ui/Markdown"

function QuestionInput({
  question,
  name,
  value,
  disabled,
  allowFreeText,
  onValueChange,
}: {
  question: Extract<ApprovalRequest, { kind: "user-input" }>["questions"][number]
  name: string
  value: string[]
  disabled: boolean
  allowFreeText: boolean
  onValueChange: (value: string[]) => void
}): React.JSX.Element {
  const choices = question.options?.map((option) => (
    <Field.Item
      key={option.value ?? option.label}
      className="question-option [&_+_.question-option]:mt-[10px] [&[data-disabled]]:opacity-[0.5]"
    >
      <Field.Label className="flex items-center gap-[8px] text-[var(--text-primary)] text-[12px] leading-[1.5]">
        {question.multiSelect ? (
          <Checkbox value={option.value ?? option.label} />
        ) : (
          <Radio value={option.value ?? option.label} />
        )}
        <span>{option.label}</span>
      </Field.Label>
      {option.description && (
        <Field.Description className="[margin:3px_0_0_23px] text-[var(--text-secondary)] text-[12px] leading-[1.5]">
          {option.description}
        </Field.Description>
      )}
    </Field.Item>
  ))
  return (
    <Fieldset.Root
      className={
        "min-w-0 [margin:16px_0] p-0 border-0 [&_>_legend]:mb-[8px] [&_>_.field]:mt-[12px]"
      }
      disabled={disabled}
    >
      <Fieldset.Legend className="block mb-[6px] text-[var(--text-secondary)] text-[11.5px] font-medium">
        {question.question}
      </Fieldset.Legend>
      {choices && choices.length > 0 && (
        <Field.Root name={name} disabled={disabled}>
          {question.multiSelect ? (
            <CheckboxGroup
              value={value}
              onValueChange={onValueChange}
              aria-label={question.question}
            >
              {choices}
            </CheckboxGroup>
          ) : (
            <RadioGroup
              value={value[0] ?? null}
              onValueChange={(next) => onValueChange([String(next)])}
              aria-label={question.question}
            >
              {choices}
            </RadioGroup>
          )}
        </Field.Root>
      )}
      {allowFreeText && question.multiline ? (
        <textarea
          className="w-full [box-sizing:border-box] [resize:vertical] p-[10px] text-[var(--text-primary)] bg-[var(--surface-raised)] border-[1px] border-[color:var(--line)] rounded-[var(--radius)] [font:inherit]"
          aria-label={question.header}
          disabled={disabled}
          value={value[0] ?? ""}
          onChange={(event) => onValueChange([event.target.value])}
          rows={8}
        />
      ) : (
        allowFreeText && (
          <TextField
            label={question.options?.length ? "Your answer" : question.header}
            type={question.isSecret ? "password" : "text"}
            disabled={disabled}
            value={value.join(", ")}
            onValueChange={(next) => onValueChange([next])}
          />
        )
      )}
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
  const [answers, setAnswers] = useState<Record<string, string[]>>(() =>
    request.kind === "user-input"
      ? Object.fromEntries(
          request.questions
            .filter((question) => question.defaultValue !== undefined)
            .map((question) => [question.id, [question.defaultValue!]]),
        )
      : {},
  )
  const userInput = request.kind === "user-input"
  const resolve = (decision: ResolveApprovalInput["decision"]): void =>
    onResolve({
      approvalId: request.id,
      decision,
      ...(userInput ? { answers } : {}),
    })
  const incomplete =
    userInput &&
    request.questions.some((question) => !answers[question.id]?.some((answer) => answer.trim()))
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
                  ? "Submit answers"
                  : request.kind === "plan"
                    ? "Approve plan"
                    : "Allow once"}
              </Button>
            </>
          )}
        </>
      }
    >
      <p className="max-h-[220px] overflow-auto [padding:9px_10px] [margin:12px_20px_0] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] [background:rgba(0,_0,_0,_0.198)] text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[11.5px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]">
        {request.detail}
      </p>
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
      {request.kind === "user-input" &&
        request.questions.map((question) => (
          <QuestionInput
            key={question.id}
            question={question}
            name={`${request.id}-${question.id}`}
            disabled={pending}
            value={answers[question.id] ?? []}
            allowFreeText={request.method !== "cursor/ask_question"}
            onValueChange={(value) =>
              setAnswers((current) => ({ ...current, [question.id]: value }))
            }
          />
        ))}
      {error && <p role="alert">{error}</p>}
    </AppDialog>
  )
}
