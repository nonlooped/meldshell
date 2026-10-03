import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DICTATION_MODELS,
  type AppSettings,
  type DictationModel,
  type DictationStatus,
  type SetAppSettingsInput,
} from "@meldshell/contracts"
import { Download } from "lucide-react"
import { ActivitySpinner } from "../ui/motion"
import { Button, SelectField } from "../ui/controls"
import { SettingRow } from "./SettingRow"
import { dictationStatusQuery } from "../threads/Dictation"
import { canRecord, dictationError } from "../threads/dictation-recorder"

const MODEL_OPTIONS = (Object.keys(DICTATION_MODELS) as DictationModel[]).map((model) => ({
  value: model,
  label: `${DICTATION_MODELS[model].label} · ${DICTATION_MODELS[model].size}`,
}))

function ModelState({ status }: { status: DictationStatus }): React.JSX.Element {
  const client = useQueryClient()
  const prepare = useMutation({
    mutationFn: () => window.meldshell.prepareDictation(),
    onSuccess: (next) => client.setQueryData(dictationStatusQuery(next.model).queryKey, next),
  })
  if (status.state === "ready")
    return (
      <span role="status" className={stateClasses}>
        <span aria-hidden="true" className="w-[7px] h-[7px] rounded-full bg-[var(--color-added)]" />
        On this computer
      </span>
    )
  if (status.state === "downloading") {
    const percent = Math.round((status.progress ?? 0) * 100)
    return (
      <span role="status" className="flex w-full flex-col items-end gap-[6px]">
        <span className={stateClasses}>
          <ActivitySpinner />
          Downloading {percent}%
        </span>
        <span
          className="block w-full h-[4px] overflow-hidden rounded-full bg-[var(--surface-active)]"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </span>
      </span>
    )
  }
  return (
    <Button
      icon={prepare.isPending ? <ActivitySpinner /> : <Download size={13} strokeWidth={1.75} />}
      disabled={prepare.isPending}
      onClick={() => prepare.mutate()}
    >
      {status.state === "error" ? "Try again" : "Download now"}
    </Button>
  )
}

export function DictationSettings({
  settings,
  pending,
  onChange,
}: {
  readonly settings: AppSettings
  readonly pending: boolean
  readonly onChange: (input: SetAppSettingsInput) => void
}): React.JSX.Element {
  const model = settings.dictationModel ?? "fast"
  const status = useQuery(dictationStatusQuery(model))
  if (status.isError)
    return (
      <p role="alert" className="text-[12px] text-[var(--text-secondary)]">
        Update MeldShell on the host computer to use dictation.
      </p>
    )
  if (!status.data)
    return (
      <div className="flex min-h-[76px] items-center">
        <ActivitySpinner />
      </div>
    )
  const current = status.data.model === model ? status.data : null
  return (
    <section className={groupClasses} aria-label="Dictation">
      <SettingRow
        label="How it works"
        description={
          canRecord()
            ? "Click the microphone in the composer, or press the dictation shortcut, then speak. What you say is written at the caret. Speech becomes text on the computer running MeldShell, so it is free, needs no account, and recordings never leave it."
            : "This browser cannot record audio here. Open MeldShell over HTTPS or in the desktop app."
        }
      />
      <SettingRow
        label="Speech model"
        description="Fast suits most dictation. Accurate catches more technical words and accents but takes a few seconds longer."
      >
        <SelectField
          label="Speech model"
          value={model}
          options={MODEL_OPTIONS}
          disabled={pending}
          onValueChange={(dictationModel) => onChange({ dictationModel })}
        />
      </SettingRow>
      <SettingRow
        label="Model download"
        description={
          current?.state === "error" && current.error
            ? dictationError(current.error)
            : "Downloads once from Hugging Face, the first time you dictate. You can fetch it now instead."
        }
      >
        {current ? <ModelState status={current} /> : <ActivitySpinner />}
      </SettingRow>
    </section>
  )
}

const stateClasses = "inline-flex items-center gap-[7px] text-[12px] text-[var(--text-secondary)]"

const groupClasses =
  "settings-group m-0 border-t-[1px] border-t-[color:var(--line-subtle)] border-b-[1px] border-b-[color:var(--line-subtle)]"
