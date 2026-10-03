import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DEFAULT_DICTATION_ENDPOINT,
  DEFAULT_DICTATION_MODEL,
  type DictationStatus,
  type SetDictationSettingsInput,
} from "@meldshell/contracts"
import { ActivitySpinner } from "../ui/motion"
import { Button, SelectField, TextField } from "../ui/controls"
import { SettingRow } from "./SettingRow"
import { dictationStatusQuery } from "../threads/Dictation"
import { canRecord, dictationError } from "../threads/dictation-recorder"

type Service = "openai" | "custom"

const SERVICES = [
  { value: "openai", label: "OpenAI" },
  { value: "custom", label: "Other service" },
] as const satisfies ReadonlyArray<{ value: Service; label: string }>

const keyDescription = (status: DictationStatus): string => {
  switch (status.source) {
    case "settings":
      return `Using the key you saved, ending ${status.keyHint}. It stays on this computer.`
    case "environment":
      return `Using OPENAI_API_KEY from the environment, ending ${status.keyHint}. A key saved here takes its place.`
    case "codex":
      return `Using the API key Codex signed in with, ending ${status.keyHint}. A key saved here takes its place.`
    default:
      return status.endpoint === DEFAULT_DICTATION_ENDPOINT
        ? "Dictation needs an OpenAI API key; a ChatGPT sign-in does not include audio. The key stays on this computer."
        : "Leave empty if the service needs no key."
  }
}

function DictationForm({ status }: { status: DictationStatus }): React.JSX.Element {
  const client = useQueryClient()
  const [service, setService] = useState<Service>(
    status.endpoint === DEFAULT_DICTATION_ENDPOINT ? "openai" : "custom",
  )
  const [apiKey, setApiKey] = useState("")
  const [endpoint, setEndpoint] = useState(
    status.endpoint === DEFAULT_DICTATION_ENDPOINT ? "" : status.endpoint,
  )
  const [model, setModel] = useState(status.model === DEFAULT_DICTATION_MODEL ? "" : status.model)
  const save = useMutation({
    mutationFn: (input: SetDictationSettingsInput) => window.meldshell.setDictationSettings(input),
    onSuccess: (next) => {
      client.setQueryData(dictationStatusQuery.queryKey, next)
      setApiKey("")
    },
  })
  const custom = service === "custom"
  const changed =
    apiKey.trim() !== "" ||
    (custom ? endpoint.trim() : "") !==
      (status.endpoint === DEFAULT_DICTATION_ENDPOINT ? "" : status.endpoint) ||
    model.trim() !== (status.model === DEFAULT_DICTATION_MODEL ? "" : status.model)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate({
          ...(apiKey.trim() ? { apiKey } : {}),
          endpoint: custom ? endpoint : "",
          model,
        })
      }}
    >
      <section className={groupClasses} aria-label="Dictation">
        <SettingRow
          label="Status"
          description={
            canRecord()
              ? "Click the microphone in the composer, or press the dictation shortcut, then speak. What you say is written at the caret."
              : "This browser cannot record audio here. Open MeldShell over HTTPS or in the desktop app."
          }
        >
          <span
            role="status"
            className="inline-flex items-center gap-[7px] text-[12px] text-[var(--text-secondary)]"
          >
            <span
              aria-hidden="true"
              className="w-[7px] h-[7px] rounded-full"
              style={{
                background: status.ready ? "var(--color-added)" : "var(--color-modified)",
              }}
            />
            {status.ready ? "Ready" : "Needs an API key"}
          </span>
        </SettingRow>
        <SettingRow
          label="Transcription service"
          description="OpenAI by default. Any service that speaks OpenAI’s transcription API also works, including a Whisper server on your own network."
        >
          <SelectField
            label="Transcription service"
            value={service}
            options={SERVICES}
            onValueChange={setService}
          />
        </SettingRow>
        {custom && (
          <SettingRow
            label="Service address"
            description="The API’s base URL; MeldShell posts recordings to its /audio/transcriptions."
          >
            <TextField
              mono
              aria-label="Service address"
              placeholder="http://localhost:8000/v1"
              value={endpoint}
              onValueChange={setEndpoint}
            />
          </SettingRow>
        )}
        <SettingRow label="API key" description={keyDescription(status)}>
          <TextField
            mono
            type="password"
            aria-label="API key"
            placeholder={status.source === "settings" ? `Saved, ending ${status.keyHint}` : "sk-…"}
            value={apiKey}
            onValueChange={setApiKey}
          />
        </SettingRow>
        <SettingRow
          label="Model"
          description={`Leave empty to use ${DEFAULT_DICTATION_MODEL}${custom ? ", or name the model your service offers" : ""}.`}
        >
          <TextField
            mono
            aria-label="Model"
            placeholder={DEFAULT_DICTATION_MODEL}
            value={model}
            onValueChange={setModel}
          />
        </SettingRow>
      </section>
      <div className="flex flex-wrap items-center justify-end gap-[8px] [margin:14px_0_0]">
        {save.error && (
          <span role="alert" className="mr-auto text-[12px] text-[var(--color-deleted)]">
            {dictationError(save.error)}
          </span>
        )}
        {status.source === "settings" && (
          <Button disabled={save.isPending} onClick={() => save.mutate({ apiKey: "" })}>
            Remove saved key
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          icon={save.isPending ? <ActivitySpinner /> : undefined}
          disabled={save.isPending || !changed}
        >
          Save
        </Button>
      </div>
    </form>
  )
}

export function DictationSettings(): React.JSX.Element {
  const status = useQuery(dictationStatusQuery)
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
  return <DictationForm status={status.data} />
}

const groupClasses =
  "settings-group m-0 border-t-[1px] border-t-[color:var(--line-subtle)] border-b-[1px] border-b-[color:var(--line-subtle)]"
