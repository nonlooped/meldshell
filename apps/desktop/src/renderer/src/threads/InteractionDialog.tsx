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
    <Field.Item key={option.value ?? option.label} className="question-option">
      <Field.Label className="question-option-label">
        {question.multiSelect ? (
          <Checkbox value={option.value ?? option.label} />
        ) : (
          <Radio value={option.value ?? option.label} />
        )}
        <span>{option.label}</span>
      </Field.Label>
      {option.description && (
        <Field.Description className="question-option-description">
          {option.description}
        </Field.Description>
      )}
    </Field.Item>
  ))
  return (
    <Fieldset.Root className="question-fieldset" disabled={disabled}>
      <Fieldset.Legend className="field-label">{question.question}</Fieldset.Legend>
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
          className="interaction-editor"
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
                {userInput ? "Skip" : "Decline"}
              </Button>
              {!userInput && request.kind !== "cursor-plan" && (
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
                  : request.kind === "cursor-plan"
                    ? "Approve plan"
                    : "Allow once"}
              </Button>
            </>
          )}
        </>
      }
    >
      <p className="approval-detail">{request.detail}</p>
      {request.kind === "cursor-plan" && <Markdown className="cursor-plan" text={request.plan} />}
      {request.kind === "cursor-permission" && (
        <pre className="approval-detail">
          {JSON.stringify((request.params as { toolCall?: unknown }).toolCall, null, 2)}
        </pre>
      )}
      {request.kind === "permissions" && (
        <pre className="approval-detail">{JSON.stringify(request.permissions, null, 2)}</pre>
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
