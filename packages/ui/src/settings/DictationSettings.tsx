import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DICTATION_MODELS,
  type AppSettings,
  type DictationModel,
  type DictationStatus,
  type SetAppSettingsInput,
} from "@meldshell/contracts"
import { Radio } from "@base-ui-components/react/radio"
import { RadioGroup } from "@base-ui-components/react/radio-group"
import { Check, Download, Gauge, Sparkles } from "lucide-react"
import { ActivitySpinner } from "../ui/motion"
import { Button, ChordKeys } from "../ui/controls"
import { useViewStore } from "../app/view-store"
import { SettingRow } from "./SettingRow"
import { SettingsGroup } from "./SettingsGroup"
import { useKeybindings } from "../app/keybindings"
import { dictationStatusQuery } from "../threads/Dictation"
import { canRecord, dictationError } from "../threads/dictation-recorder"

const MODELS = Object.keys(DICTATION_MODELS) as DictationModel[]

const MODEL_DETAILS: Record<DictationModel, { icon: React.ReactNode; blurb: string }> = {
  fast: {
    icon: <Gauge size={13} strokeWidth={1.75} />,
    blurb: "Quick, and right for most dictation.",
  },
  accurate: {
    icon: <Sparkles size={13} strokeWidth={1.75} />,
    blurb: "Catches more technical words and accents, a few seconds slower.",
  },
}

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
  const shortcut = useKeybindings((state) => state.bindings.dictate)
  const description = canRecord()
    ? "Click the microphone in the composer, then speak; what you say is written at the caret. Speech becomes text on the computer running MeldShell, so it is free, needs no account, and recordings never leave it."
    : "This browser cannot record audio here. Open MeldShell over HTTPS or in the desktop app."
  if (status.isError)
    return (
      <SettingsGroup title="Dictation" description={description}>
        <p
          role="alert"
          className="m-0 [padding:18px_16px] text-[12px] text-[var(--text-secondary)]"
        >
          Update MeldShell on the host computer to use dictation.
        </p>
      </SettingsGroup>
    )
  if (!status.data)
    return (
      <SettingsGroup title="Dictation" description={description}>
        <div className="flex min-h-[62px] items-center [padding:0_16px] text-[var(--text-tertiary)]">
          <ActivitySpinner />
        </div>
      </SettingsGroup>
    )
  const current = status.data.model === model ? status.data : null
  return (
    <SettingsGroup title="Dictation" description={description}>
      <SettingRow
        label="Dictation shortcut"
        description={
          shortcut ? (
            <span className="inline-flex flex-wrap items-center gap-x-[6px] gap-y-[2px]">
              <ChordKeys chord={shortcut} className="text-[11px]" />
              starts and stops dictation anywhere in MeldShell.
            </span>
          ) : (
            "No shortcut assigned."
          )
        }
      >
        <Button
          onClick={() =>
            useViewStore.getState().selectSettingsSection("keyboard", "Start or stop dictation")
          }
        >
          Change shortcut
        </Button>
      </SettingRow>
      <SettingRow
        label="Speech model"
        description="Both are free and run on this computer. You can switch at any time."
        stacked
      >
        <RadioGroup
          aria-label="Speech model"
          value={model}
          disabled={pending}
          onValueChange={(value) => {
            const next = MODELS.find((option) => option === value)
            if (next !== undefined) onChange({ dictationModel: next })
          }}
          className="grid grid-cols-2 gap-[10px] [@container(max-width:_540px)]:grid-cols-1"
        >
          {MODELS.map((option) => (
            <Radio.Root key={option} value={option} className={modelTileClasses}>
              <span className="flex items-center gap-[7px] text-[12.5px] font-medium text-[var(--text-primary)]">
                {MODEL_DETAILS[option].icon}
                {DICTATION_MODELS[option].label}
                <span className="ml-auto text-[11px] font-normal tabular-nums text-[var(--text-tertiary)]">
                  {status.data.downloaded.includes(option) ? (
                    <span className="inline-flex items-center gap-[4px] text-[var(--color-added)]">
                      <Check size={11} strokeWidth={2.25} />
                      Downloaded
                    </span>
                  ) : (
                    DICTATION_MODELS[option].size
                  )}
                </span>
              </span>
              <span className="text-[11.5px] leading-[16px]">{MODEL_DETAILS[option].blurb}</span>
            </Radio.Root>
          ))}
        </RadioGroup>
      </SettingRow>
      <SettingRow
        label="Model download"
        description={
          current?.state === "error" && current.error
            ? dictationError(current.error)
            : current?.state === "ready"
              ? "Ready. Dictation now works even without an internet connection."
              : `Downloads ${DICTATION_MODELS[model].size} once from Hugging Face, the first time you dictate. You can fetch it now instead.`
        }
      >
        {current ? <ModelState status={current} /> : <ActivitySpinner />}
      </SettingRow>
    </SettingsGroup>
  )
}

const stateClasses = "inline-flex items-center gap-[7px] text-[12px] text-[var(--text-secondary)]"

const modelTileClasses = [
  "motion-colors grid content-start gap-[5px] [padding:10px_12px_11px] border-[1px] border-[color:var(--line)] text-left",
  "rounded-[var(--radius-lg)] bg-transparent text-[var(--text-secondary)] cursor-default",
  "[&:hover]:[border-color:var(--line-strong)]",
  "[&[data-checked]]:[border-color:var(--accent)]",
  "[&[data-checked]]:[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]",
  "[&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px]",
  "[&[data-disabled]]:opacity-[0.6]",
].join(" ")
