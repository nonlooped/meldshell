import { useState } from "react"
import type { ScheduleCadence, ScheduledPrompt } from "@meldshell/contracts"
import { AppDialog, Button, SelectField } from "../ui/controls"
import { textInputClasses } from "../ui/styles"
import { localInputValue, WEEKDAYS } from "./schedule-format"
import { useScheduleActions } from "./schedule-queries"

type Repeat = ScheduleCadence["kind"]
type Unit = "minutes" | "hours"

interface Form {
  readonly prompt: string
  readonly repeat: Repeat
  /** `datetime-local` value for a one-time prompt. */
  readonly at: string
  readonly amount: string
  readonly unit: Unit
  readonly time: string
  /** Chosen weekdays; all seven means every day. */
  readonly weekdays: readonly number[]
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

function initialForm(schedule: ScheduledPrompt | null, prompt: string): Form {
  const inAnHour = new Date(Date.now() + 60 * 60_000)
  inAnHour.setMinutes(0, 0, 0)
  const form: Form = {
    prompt: schedule?.prompt ?? prompt,
    repeat: "daily",
    at: localInputValue(inAnHour),
    amount: "1",
    unit: "hours",
    time: "09:00",
    weekdays: ALL_DAYS,
  }
  const cadence = schedule?.cadence
  switch (cadence?.kind) {
    case undefined:
      return form
    case "once":
      return { ...form, repeat: "once", at: localInputValue(new Date(cadence.at)) }
    case "interval":
      return cadence.minutes % 60 === 0
        ? { ...form, repeat: "interval", amount: String(cadence.minutes / 60), unit: "hours" }
        : { ...form, repeat: "interval", amount: String(cadence.minutes), unit: "minutes" }
    case "daily":
      return {
        ...form,
        repeat: "daily",
        time: cadence.time,
        weekdays: cadence.weekdays.length === 0 ? ALL_DAYS : cadence.weekdays,
      }
  }
}

/** The cadence a form describes, or why it does not describe one yet. */
function cadenceFrom(form: Form): ScheduleCadence | string {
  switch (form.repeat) {
    case "once": {
      const at = new Date(form.at)
      return Number.isNaN(at.getTime())
        ? "Choose a date and time."
        : { kind: "once", at: at.toISOString() }
    }
    case "interval": {
      const amount = Number(form.amount)
      const minutes = form.unit === "hours" ? amount * 60 : amount
      if (!Number.isInteger(amount) || minutes < 5) return "Repeat at most every 5 minutes."
      if (minutes > 7 * 24 * 60) return "Repeat at least once a week."
      return { kind: "interval", minutes }
    }
    case "daily":
      if (form.weekdays.length === 0) return "Choose at least one day."
      return {
        kind: "daily",
        time: form.time,
        weekdays:
          form.weekdays.length === 7 ? [] : [...form.weekdays].sort((left, right) => left - right),
      }
  }
}

const fieldLabelClasses = "block [margin:14px_20px_6px] text-[var(--text-secondary)] text-[12px]"
const fieldClasses = `motion-colors ${textInputClasses}`

function CadenceFields({
  form,
  update,
}: {
  form: Form
  update: (patch: Partial<Form>) => void
}): React.JSX.Element | null {
  switch (form.repeat) {
    case "once":
      return (
        <div className="[padding:10px_20px_0]">
          <input
            type="datetime-local"
            className={fieldClasses}
            aria-label="Date and time"
            value={form.at}
            onChange={(event) => update({ at: event.target.value })}
          />
        </div>
      )
    case "interval":
      return (
        <div className="flex gap-[8px] [padding:10px_20px_0]">
          <input
            type="number"
            min={1}
            className={`${fieldClasses} w-[96px]!`}
            aria-label="Repeat every"
            value={form.amount}
            onChange={(event) => update({ amount: event.target.value })}
          />
          <SelectField<Unit>
            label="Unit"
            value={form.unit}
            options={[
              { value: "minutes", label: "minutes" },
              { value: "hours", label: "hours" },
            ]}
            onValueChange={(unit) => update({ unit })}
          />
        </div>
      )
    case "daily":
      return (
        <div className="flex flex-wrap items-center gap-[8px] [padding:10px_20px_0]">
          <input
            type="time"
            className={`${fieldClasses} w-[120px]!`}
            aria-label="Time of day"
            value={form.time}
            onChange={(event) => update({ time: event.target.value || "09:00" })}
          />
          <fieldset className="flex gap-[3px] m-0 p-0 border-0" aria-label="Days">
            {WEEKDAYS.map((label, day) => {
              const chosen = form.weekdays.includes(day)
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={chosen}
                  className={`motion-colors h-[30px] w-[38px] border-[1px] rounded-[var(--radius-sm)] cursor-default text-[11.5px] ${
                    chosen
                      ? "border-[color:var(--accent)] bg-[var(--surface-selected)] text-[var(--text-primary)]"
                      : "border-[color:var(--line)] bg-transparent text-[var(--text-tertiary)]"
                  }`}
                  onClick={() =>
                    update({
                      weekdays: chosen
                        ? form.weekdays.filter((entry) => entry !== day)
                        : [...form.weekdays, day],
                    })
                  }
                >
                  {label}
                </button>
              )
            })}
          </fieldset>
        </div>
      )
  }
}

/**
 * Creates or edits a scheduled prompt. `prompt` fills a new schedule, as when scheduling the
 * composer's draft; `onSaved` runs once the host has stored it.
 */
export function ScheduleDialog({
  threadId,
  schedule,
  prompt = "",
  onClose,
  onSaved,
}: {
  threadId: string
  schedule: ScheduledPrompt | null
  prompt?: string
  onClose: () => void
  onSaved?: () => void
}): React.JSX.Element {
  const [form, setForm] = useState(() => initialForm(schedule, prompt))
  const [problem, setProblem] = useState<string | null>(null)
  const { save } = useScheduleActions()
  const update = (patch: Partial<Form>) => {
    setProblem(null)
    save.reset()
    setForm((current) => ({ ...current, ...patch }))
  }
  const submit = () => {
    const cadence = cadenceFrom(form)
    if (typeof cadence === "string") return setProblem(cadence)
    if (form.prompt.trim() === "") return setProblem("Write the prompt to send.")
    save.mutate(
      {
        ...(schedule === null ? {} : { id: schedule.id }),
        threadId,
        prompt: form.prompt,
        cadence,
        // Saving a paused schedule keeps it paused; a new one starts at once.
        enabled: schedule?.enabled ?? true,
      },
      {
        onSuccess: () => {
          onSaved?.()
          onClose()
        },
      },
    )
  }
  const error = problem ?? save.error?.message ?? null
  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={schedule === null ? "Schedule a prompt" : "Edit scheduled prompt"}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={submit}>
            {schedule === null ? "Schedule" : "Save"}
          </Button>
        </>
      }
    >
      <p>
        MeldShell sends the prompt to this thread while MeldShell is running, with the thread's
        current model and settings. A run missed while it was closed happens once when it next
        starts. A thread that is busy queues it. Attachments are not scheduled.
      </p>
      <label className={fieldLabelClasses} htmlFor="schedule-prompt">
        Prompt
      </label>
      <div className="[padding:0_20px]">
        <textarea
          id="schedule-prompt"
          className={`${fieldClasses} h-auto! min-h-[88px] [padding:8px_10px]! resize-y`}
          value={form.prompt}
          onChange={(event) => update({ prompt: event.target.value })}
        />
      </div>
      <span className={fieldLabelClasses}>Repeat</span>
      <div className="[padding:0_20px]">
        <SelectField<Repeat>
          label="Repeat"
          value={form.repeat}
          options={[
            { value: "once", label: "Once" },
            { value: "interval", label: "Every few minutes or hours" },
            { value: "daily", label: "At a time of day" },
          ]}
          onValueChange={(repeat) => update({ repeat })}
        />
      </div>
      <CadenceFields form={form} update={update} />
      {error !== null && (
        <p role="alert" className="text-[var(--color-deleted)]!">
          {error}
        </p>
      )}
    </AppDialog>
  )
}
