import { useContext } from "react"
import { useQuery } from "@tanstack/react-query"
import type { AppSettings, SetAppSettingsInput } from "@meldshell/contracts"
import { errorMessage } from "@meldshell/contracts"
import { AppInfoContext } from "../app/app-info"
import { useViewStore } from "../app/view-store"
import { MeldMark } from "../ui/MeldMark"
import { Button, SelectField } from "../ui/controls"
import { Environment } from "./Environment"
import { SettingRow } from "./SettingRow"
import { UpdateSettings } from "./UpdateSettings"
import { SettingsGroup } from "./SettingsGroup"

function DefaultEditor({
  settings,
  pending,
  onChange,
}: {
  readonly settings: AppSettings
  readonly pending: boolean
  readonly onChange: (input: SetAppSettingsInput) => void
}): React.JSX.Element | null {
  const api = window.meldshell.desktop
  const editors = useQuery({
    queryKey: ["external-editors"],
    queryFn: () => api!.listEditors!(),
    enabled: api?.listEditors !== undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: "always",
  })
  if (!api?.listEditors) return null
  const options = (editors.data ?? []).map((editor) => ({ value: editor.id, label: editor.name }))
  const preferred = settings.editor
  const available = options.some((option) => option.value === preferred)
  if (preferred && !available)
    options.unshift({ value: preferred, label: `${preferred} (unavailable)` })
  // An empty select reads as broken, so it says why it has nothing to offer.
  const empty = options.length === 0
  if (empty)
    options.push({ value: "", label: editors.isPending ? "Looking for editors…" : "None found" })
  return (
    <SettingRow
      label="Default editor"
      description={
        editors.isError
          ? errorMessage(editors.error, "Could not load installed editors.")
          : "Used by Open in editor and its shortcut. Choosing an application from that menu also updates this preference."
      }
    >
      <SelectField
        label="Default editor"
        value={preferred ?? options[0]?.value ?? ""}
        options={options}
        disabled={pending || editors.isPending || editors.isError || empty}
        onValueChange={(editor) => onChange({ editor })}
      />
    </SettingRow>
  )
}

function HostControls(): React.JSX.Element | null {
  const host = window.meldshell.hostControl
  if (!host) return null
  const run = (action: "restart" | "shutdown") => {
    void host[action]().catch((cause: unknown) => window.alert(errorMessage(cause)))
  }
  return (
    <SettingRow
      label="Host controls"
      description="Restart or shut down MeldShell on the host computer. Running work will be interrupted."
    >
      <div className="flex flex-wrap gap-[8px]">
        <Button onClick={() => run("restart")}>Restart host</Button>
        <Button onClick={() => run("shutdown")}>Shut down host</Button>
      </div>
    </SettingRow>
  )
}

const platformLabel = (): string =>
  window.meldshell.platform === "web"
    ? "Web browser"
    : window.meldshell.platform === "linux"
      ? "Linux desktop"
      : "Windows desktop"

export function AppSettingsPanel({
  settings,
  pending,
  onChange,
}: {
  readonly settings: AppSettings
  readonly pending: boolean
  readonly onChange: (input: SetAppSettingsInput) => void
}): React.JSX.Element {
  const appInfo = useContext(AppInfoContext)
  return (
    <>
      <SettingsGroup title="Updates">
        <UpdateSettings />
      </SettingsGroup>
      <SettingsGroup title="Runtime & applications">
        <Environment />
        <DefaultEditor settings={settings} pending={pending} onChange={onChange} />
        <HostControls />
      </SettingsGroup>
      <SettingsGroup title="About MeldShell">
        <div className="flex items-center gap-[14px] [padding:18px_16px]">
          <span className="grid w-[44px] h-[44px] flex-none place-items-center rounded-[var(--radius-lg)] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-hover)]">
            <MeldMark className="w-[28px] h-[28px] text-[var(--text-primary)]" />
          </span>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <span className="[font-family:var(--font-display)] text-[var(--text-primary)] text-[15px] font-semibold">
              MeldShell {appInfo.version}
            </span>
            <span className="text-[var(--text-tertiary)] text-[12px] tabular-nums">
              {[
                platformLabel(),
                appInfo.electronVersion ? `Electron ${appInfo.electronVersion}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>
        <SettingRow
          label="Storage"
          description="Threads and settings are stored on the computer running MeldShell. When remote access is linked, prompts, output, and file contents pass through the account service’s relay; provider credentials stay on the host computer."
        >
          <Button onClick={() => useViewStore.getState().selectSettingsSection("account")}>
            Remote access details
          </Button>
        </SettingRow>
        <SettingRow
          label="Setup guide"
          description="See which agents are ready, pick a look, and start a thread."
        >
          <Button onClick={() => useViewStore.getState().openOnboarding()}>Run setup again</Button>
        </SettingRow>
      </SettingsGroup>
    </>
  )
}
