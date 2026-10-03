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
        disabled={pending || editors.isPending || editors.isError || options.length === 0}
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
      <SettingsGroup title="Runtime & applications">
        <Environment />
        <DefaultEditor settings={settings} pending={pending} onChange={onChange} />
        <HostControls />
      </SettingsGroup>
      <SettingsGroup title="MeldShell updates">
        <UpdateSettings />
      </SettingsGroup>
      <SettingsGroup title="Setup">
        <SettingRow
          label="Setup guide"
          description="Check your agents, pick a project, and revisit the basics."
        >
          <Button onClick={() => useViewStore.getState().openOnboarding()}>Run setup again</Button>
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup title="About MeldShell">
        <section className="max-w-[720px]">
          <div className="flex items-center gap-[14px] [padding:4px_0_28px] [&_h3]:m-0 [&_h3]:[font-family:var(--font-display)] [&_h3]:text-[15px] [&_h3]:font-semibold [&_p]:[margin:3px_0_0] [&_p]:text-[var(--text-tertiary)] [&_p]:text-[11.5px]">
            <MeldMark className="w-[36px] h-[36px] flex-[0_0_36px] text-[var(--text-primary)]" />
            <div>
              <h3>MeldShell</h3>
              <p>A local desktop workspace for coding-agent threads.</p>
            </div>
          </div>
          <div className="border-t-[1px] border-t-[color:var(--line-subtle)]">
            <div className="flex min-h-[48px] items-center justify-between gap-[40px] [padding:12px_0] border-b-[1px] border-b-[color:var(--line-subtle)]">
              <span className="setting-label text-[var(--text-primary)] text-[13px] font-medium">
                App version
              </span>
              <span className="max-w-[52%] overflow-hidden text-[var(--text-secondary)] text-[12px] text-right text-ellipsis whitespace-nowrap">
                {appInfo.version}
              </span>
            </div>
            <div className="flex min-h-[48px] items-center justify-between gap-[40px] [padding:12px_0] border-b-[1px] border-b-[color:var(--line-subtle)]">
              <span className="setting-label text-[var(--text-primary)] text-[13px] font-medium">
                Platform
              </span>
              <span className="max-w-[52%] overflow-hidden text-[var(--text-secondary)] text-[12px] text-right text-ellipsis whitespace-nowrap">
                {window.meldshell.platform === "web"
                  ? "Web browser"
                  : window.meldshell.platform === "linux"
                    ? "Linux desktop"
                    : "Windows desktop"}
              </span>
            </div>
            <div className="flex min-h-[48px] items-center justify-between gap-[40px] [padding:12px_0] border-b-[1px] border-b-[color:var(--line-subtle)]">
              <span className="setting-label text-[var(--text-primary)] text-[13px] font-medium">
                Runtime
              </span>
              <span className="max-w-[52%] overflow-hidden text-[var(--text-secondary)] text-[12px] text-right text-ellipsis whitespace-nowrap">
                {appInfo.electronVersion ? `Electron ${appInfo.electronVersion}` : "Web"}
              </span>
            </div>
          </div>
        </section>
        <SettingRow
          label="Storage"
          description="Threads and settings are stored on the computer running MeldShell. When remote access is linked, prompts, output, and file contents pass through the account service’s relay; provider credentials stay on the host computer."
        >
          <Button onClick={() => useViewStore.getState().selectSettingsSection("account")}>
            Remote access details
          </Button>
        </SettingRow>
      </SettingsGroup>
    </>
  )
}
