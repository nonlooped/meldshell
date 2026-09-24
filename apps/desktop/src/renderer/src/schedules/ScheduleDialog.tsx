import { useState } from "react"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import { AlarmClock, CalendarClock, Repeat } from "lucide-react"
import { firstRun, type ScheduleCadence, type ScheduledPrompt } from "@meldshell/contracts"
import { AppDialog, Button, SelectField } from "../ui/controls"
import { segmentClasses, segmentGroupClasses, textInputClasses } from "../ui/styles"
import { describeMoment, localInputValue, WEEKDAYS } from "./schedule-format"
import { useMinuteClock, useScheduleActions } from "./schedule-queries"

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
const WORK_DAYS = [1, 2, 3, 4, 5]

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

/** When the form's schedule would first send its prompt, or why it would not. */
function firstRunNote(form: Form, now: Date): { text: string; problem: boolean } {
  const cadence = cadenceFrom(form)
  if (typeof cadence === "string") return { text: cadence, problem: true }
  const first = firstRun(cadence, now)
  if (first === null) return { text: "This time has passed. Choose a later one.", problem: true }
  return { text: `First run ${describeMoment(first, now)}`, problem: false }
}

const labelClasses = "block mb-[6px] text-[var(--text-secondary)] text-[11.5px] font-medium"
const fieldClasses = `motion-colors ${textInputClasses}`
const sameDays = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && right.every((day) => left.includes(day))

function DayPresets({
  weekdays,
  onChange,
}: {
  weekdays: readonly number[]
  onChange: (weekdays: readonly number[]) => void
}): React.JSX.Element {
  const presets = [
    { label: "Every day", days: ALL_DAYS },
    { label: "Weekdays", days: WORK_DAYS },
  ]
  return (
    <span className="flex gap-[4px]">
      {presets.map((preset) => (
        <Button
          key={preset.label}
          size="sm"
          variant="ghost"
          className={sameDays(weekdays, preset.days) ? "text-[var(--text-primary)]!" : ""}
          aria-pressed={sameDays(weekdays, preset.days)}
          onClick={() => onChange(preset.days)}
        >
          {preset.label}
        </Button>
      ))}
    </span>
  )
}

function CadenceFields({
  form,
  update,
}: {
  form: Form
  update: (patch: Partial<Form>) => void
}): React.JSX.Element {
  switch (form.repeat) {
    case "once":
      return (
        <label className="block">
          <span className={labelClasses}>Date and time</span>
          <input
            type="datetime-local"
            className={`${fieldClasses} w-[240px]!`}
            value={form.at}
            onChange={(event) => update({ at: event.target.value })}
          />
        </label>
      )
    case "interval":
      return (
        <div>
          <span className={labelClasses} id="schedule-every">
            Every
          </span>
          <div className="flex gap-[8px]" role="group" aria-labelledby="schedule-every">
            <input
              type="number"
              min={1}
              className={`${fieldClasses} w-[88px]!`}
              aria-label="Amount"
              value={form.amount}
              onChange={(event) => update({ amount: event.target.value })}
            />
            <div className="w-[132px]">
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
          </div>
        </div>
      )
    case "daily":
      return (
        <div className="flex flex-col gap-[14px]">
          <label className="block">
            <span className={labelClasses}>Time of day</span>
            <input
              type="time"
              className={`${fieldClasses} w-[132px]!`}
              value={form.time}
              onChange={(event) => update({ time: event.target.value || "09:00" })}
            />
          </label>
          <div>
            <span className="flex items-center justify-between gap-[8px] mb-[6px]">
              <span className={`${labelClasses} mb-[0]!`} id="schedule-days">
                On
              </span>
              <DayPresets weekdays={form.weekdays} onChange={(weekdays) => update({ weekdays })} />
            </span>
            <ToggleGroup
              multiple
              aria-labelledby="schedule-days"
              value={form.weekdays.map(String)}
              onValueChange={(value) => update({ weekdays: value.map(Number) })}
              className={`${segmentGroupClasses} w-full`}
            >
              {WEEKDAYS.map((label, day) => (
                <Toggle
                  key={label}
                  value={String(day)}
                  className={`${segmentClasses} flex-1 px-[0]!`}
                >
                  {label}
                </Toggle>
              ))}
            </ToggleGroup>
          </div>
        </div>
      )
  }
}

const REPEAT_CHOICES: ReadonlyArray<{ value: Repeat; label: string; icon: React.ReactNode }> = [
  { value: "once", label: "Once", icon: <AlarmClock size={13} strokeWidth={1.75} /> },
  { value: "interval", label: "Interval", icon: <Repeat size={13} strokeWidth={1.75} /> },
  { value: "daily", label: "Daily", icon: <CalendarClock size={13} strokeWidth={1.75} /> },
]

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
  const now = useMinuteClock()
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
  const paused = schedule !== null && !schedule.enabled
  const note = paused
    ? { text: "Paused. Resume it from the list to run it again.", problem: false }
    : firstRunNote(form, now)
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
          <span
            className={`mr-[auto] inline-flex min-w-0 items-center gap-[6px] text-[12px] ${
              note.problem ? "text-[var(--color-modified)]" : "text-[var(--text-secondary)]"
            }`}
            role="status"
          >
            <AlarmClock size={13} strokeWidth={1.75} className="flex-none" aria-hidden="true" />
            {note.text}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={submit}>
            {schedule === null ? "Schedule" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[16px] [padding:16px_20px_0]">
        <label className="block">
          <span className={labelClasses}>Prompt</span>
          <textarea
            className={`${fieldClasses} h-auto! min-h-[96px] max-h-[40vh] [padding:8px_10px]! leading-[1.5] resize-y`}
            placeholder="What should the agent do each time?"
            autoFocus={form.prompt === ""}
            value={form.prompt}
            onChange={(event) => update({ prompt: event.target.value })}
          />
        </label>
        <div>
          <span className={labelClasses} id="schedule-repeat">
            Repeat
          </span>
          <ToggleGroup
            aria-labelledby="schedule-repeat"
            value={[form.repeat]}
            onValueChange={(value) => {
              const next = value[0] as Repeat | undefined
              if (next !== undefined) update({ repeat: next })
            }}
            className={`${segmentGroupClasses} w-full`}
          >
            {REPEAT_CHOICES.map((choice) => (
              <Toggle
                key={choice.value}
                value={choice.value}
                className={`${segmentClasses} flex-1`}
              >
                {choice.icon}
                {choice.label}
              </Toggle>
            ))}
          </ToggleGroup>
        </div>
        <CadenceFields form={form} update={update} />
        <p className="m-0 text-[var(--text-tertiary)] text-[11.5px] leading-[1.55]">
          Sent to this thread with its current model while MeldShell is running, and queued if the
          thread is busy. A run missed while MeldShell was closed happens once when it starts.
          Attachments are not scheduled.
        </p>
      </div>
      {error !== null && (
        <p role="alert" className="text-[var(--color-deleted)]!">
          {error}
        </p>
      )}
    </AppDialog>
  )
}
