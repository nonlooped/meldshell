import type {
  AppSettings,
  AppSnapshot,
  Provider,
  ProviderStatus,
  SetAppSettingsInput,
} from "@meldshell/contracts"
import { RadioGroup } from "@base-ui-components/react/radio-group"
import { Radio as BaseRadio } from "@base-ui-components/react/radio"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import {
  Check,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Layers,
  Monitor,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
} from "lucide-react"
import type { ReactNode } from "react"
import { modelLabel } from "../data/model-label"
import { MeldMark } from "../ui/MeldMark"
import { ProviderIcon } from "../ui/ProviderIcon"
import { Button, Switch } from "../ui/controls"
import { ActivitySpinner } from "../ui/motion"
import { cx, segmentClasses, segmentGroupClasses } from "../ui/styles"
import { AGENT_STATES, agentDetail, type modelChoices } from "./onboarding-model"

/** A step's heading and lead, matching the Settings page header. */
function StepHeader({ title, lead }: { title: string; lead: ReactNode }) {
  return (
    <header className="[padding:0_0_20px]">
      <h2 className="m-0 [font-family:var(--font-display)] text-[21px] font-semibold tracking-[-0.012em] leading-[1.3]">
        {title}
      </h2>
      <p className="[margin:6px_0_0] text-[var(--text-secondary)] text-[12.5px] leading-[1.6]">
        {lead}
      </p>
    </header>
  )
}

const HIGHLIGHTS = [
  {
    icon: <Layers size={15} strokeWidth={1.75} />,
    title: "Every agent, side by side",
    detail: "Codex, Claude Code, Cursor, and Pi each run in their own thread and process.",
  },
  {
    icon: <GitBranch size={15} strokeWidth={1.75} />,
    title: "Work that never collides",
    detail: "Give a thread its own Git worktree so parallel changes stay apart.",
  },
  {
    icon: <ShieldCheck size={15} strokeWidth={1.75} />,
    title: "Local and yours",
    detail: "Threads stay on this device, and each agent signs in with your own account.",
  },
]

export function WelcomeStep() {
  return (
    <div className="grid justify-items-center text-center [padding:8px_0_4px]">
      <MeldMark className="w-[44px] h-[44px] text-[var(--text-primary)]" />
      <h1 className="[margin:18px_0_0] [font-family:var(--font-display)] text-[25px] font-semibold tracking-[-0.018em]">
        Welcome to MeldShell
      </h1>
      <p className="max-w-[400px] [margin:8px_0_0] text-[var(--text-secondary)] text-[13px] leading-[1.6]">
        A few quick choices and you'll be ready for your first prompt. You can change any of them
        later in Settings.
      </p>
      <ul className="grid w-full gap-[2px] [margin:26px_0_0] p-0 list-none text-left">
        {HIGHLIGHTS.map((item) => (
          <li
            key={item.title}
            className="flex items-start gap-[12px] [padding:10px_12px] rounded-[var(--radius-lg)]"
          >
            <span className="grid w-[30px] h-[30px] flex-[0_0_30px] place-items-center rounded-[var(--radius)] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-hover)] text-[var(--accent)]">
              {item.icon}
            </span>
            <span className="grid gap-[2px]">
              <span className="text-[13px] font-medium">{item.title}</span>
              <span className="text-[var(--text-secondary)] text-[12px] leading-[1.5]">
                {item.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A rounded list that groups rows, like the provider cards in Settings. */
const listClasses =
  "grid overflow-hidden border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-composer)] [&_>_*_+_*]:border-t-[1px] [&_>_*_+_*]:border-t-[color:var(--line-subtle)]"

function AgentState({ status }: { status: ProviderStatus | undefined }) {
  const availability = status?.availability ?? "probing"
  const state = AGENT_STATES[availability]
  return (
    <span
      className="inline-flex items-center gap-[6px] text-[11.5px] whitespace-nowrap"
      style={{ color: state.tone }}
    >
      {availability === "probing" ? (
        <ActivitySpinner />
      ) : (
        <span
          aria-hidden="true"
          className="w-[6px] h-[6px] rounded-[50%]"
          style={{ background: state.tone }}
        />
      )}
      {state.label}
    </span>
  )
}

export function AgentsStep({
  providers,
  statuses,
  checking,
  onCheckAgain,
  onToggleProvider,
}: {
  providers: readonly Provider[]
  statuses: ReadonlyMap<string, ProviderStatus | undefined>
  checking: boolean
  onCheckAgain: () => void
  onToggleProvider: (provider: Provider, enabled: boolean) => void
}) {
  const ready = providers.filter(
    (provider) => statuses.get(provider.id)?.availability === "ready",
  ).length
  return (
    <>
      <StepHeader
        title="Connect your agents"
        lead="MeldShell runs the coding agents already installed on this computer, signed in with your own accounts. Turn off any you don't plan to use."
      />
      <div className={listClasses} aria-label="Coding agents">
        {providers.map((provider) => {
          const status = statuses.get(provider.id)
          return (
            <div
              key={provider.id}
              className={cx(
                "motion-colors flex items-center gap-[12px] [padding:12px_14px]",
                !provider.enabled && "opacity-[0.55]",
              )}
            >
              <span className="grid w-[32px] h-[32px] flex-[0_0_32px] place-items-center rounded-[var(--radius)] bg-[var(--surface-hover)]">
                <ProviderIcon provider={provider} size={16} />
              </span>
              <span className="grid min-w-0 flex-1 gap-[2px]">
                <span className="flex items-center gap-[10px]">
                  <span className="text-[13px] font-medium">{provider.displayName}</span>
                  <AgentState status={status} />
                </span>
                <span className="overflow-hidden text-[var(--text-tertiary)] text-[11.5px] text-ellipsis whitespace-nowrap">
                  {agentDetail(provider.harness, status)}
                </span>
              </span>
              <Switch
                label={`Use ${provider.displayName}`}
                checked={provider.enabled}
                onCheckedChange={(enabled) => onToggleProvider(provider, enabled)}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-[12px] mt-[12px] text-[var(--text-tertiary)] text-[12px]">
        <span role="status">
          {ready === 0
            ? "No agent is ready yet. Install or sign in to one, then check again."
            : `${ready} of ${providers.length} ready to work.`}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={checking}
          icon={<RefreshCw size={13} strokeWidth={1.75} />}
          onClick={onCheckAgain}
        >
          {checking ? "Checking…" : "Check again"}
        </Button>
      </div>
    </>
  )
}

const choiceClasses = [
  "motion-colors flex w-full items-center gap-[12px] [padding:10px_14px] border-0 bg-transparent",
  "text-left text-[var(--text-primary)] cursor-default [&:hover]:bg-[var(--surface-hover)]",
  "[&[data-checked]]:bg-[var(--surface-selected)] [&:focus-visible]:[outline-offset:-2px]",
].join(" ")

/** The filled check that marks the chosen row in a radio list. */
function ChoiceMark() {
  return (
    <span className="grid w-[16px] h-[16px] flex-[0_0_16px] place-items-center rounded-[50%] border-[1px] border-[color:var(--line-strong)] text-[var(--accent-foreground)] [[data-checked]_&]:[border-color:var(--accent)] [[data-checked]_&]:bg-[var(--accent)]">
      <Check size={10} strokeWidth={3} className="opacity-0 [[data-checked]_&]:opacity-100" />
    </span>
  )
}

export function ModelStep({
  groups,
  anyReady,
  modelId,
  onSelect,
}: {
  groups: ReturnType<typeof modelChoices>
  anyReady: boolean
  modelId: string | null
  onSelect: (modelId: string) => void
}) {
  return (
    <>
      <StepHeader
        title="Pick a starting model"
        lead={
          anyReady
            ? "Your first thread starts here. New threads then follow whichever model you used last, and you can switch from the composer at any time."
            : "No agent is ready yet, so every enabled agent is listed. Sending waits until the agent you choose is signed in."
        }
      />
      {groups.length === 0 ? (
        <p className="m-0 [padding:24px] rounded-[var(--radius-lg)] border-[1px] border-dashed border-[color:var(--line)] text-center text-[var(--text-tertiary)] text-[12.5px]">
          Turn on an agent in the previous step to choose a model.
        </p>
      ) : (
        <RadioGroup
          aria-label="Starting model"
          value={modelId ?? ""}
          onValueChange={(value) => {
            if (typeof value === "string" && value) onSelect(value)
          }}
          className="grid gap-[14px] max-h-[min(46vh,_380px)] overflow-y-auto [scrollbar-gutter:stable]"
        >
          {groups.map(({ provider, models }) => (
            <section key={provider.id} className="grid gap-[6px]">
              <h3 className="flex items-center gap-[8px] m-0 [padding:0_2px] text-[var(--text-tertiary)] text-[11px] font-medium uppercase tracking-[0.06em]">
                <ProviderIcon provider={provider} size={12} />
                {provider.displayName}
              </h3>
              <div className={listClasses}>
                {models.map((model) => (
                  <BaseRadio.Root key={model.id} value={model.id} className={choiceClasses}>
                    <ChoiceMark />
                    <span className="grid min-w-0 flex-1 gap-[1px]">
                      <span className="flex items-center gap-[8px] text-[13px] font-medium">
                        {modelLabel(model.displayName)}
                        {model.isDefault && (
                          <span className="[padding:1px_6px] rounded-[999px] bg-[var(--surface-active)] text-[var(--text-secondary)] text-[10.5px] font-medium">
                            Recommended
                          </span>
                        )}
                      </span>
                      {model.description && (
                        <span className="overflow-hidden text-[var(--text-tertiary)] text-[11.5px] text-ellipsis whitespace-nowrap">
                          {model.description}
                        </span>
                      )}
                    </span>
                  </BaseRadio.Root>
                ))}
              </div>
            </section>
          ))}
        </RadioGroup>
      )}
    </>
  )
}

export function WorkspaceStep({
  snapshot,
  workspaceId,
  adding,
  onSelect,
  onAdd,
}: {
  snapshot: AppSnapshot
  workspaceId: string | null
  adding: boolean
  onSelect: (workspaceId: string) => void
  onAdd: () => void
}) {
  return (
    <>
      <StepHeader
        title="Choose where to work"
        lead="Pick a project folder, ideally a Git repository. Agents read and edit files there, and you can add more workspaces from the inbox later."
      />
      {snapshot.workspaces.length > 0 && (
        <RadioGroup
          aria-label="Workspace"
          value={workspaceId ?? ""}
          onValueChange={(value) => {
            if (typeof value === "string" && value) onSelect(value)
          }}
          className={cx(listClasses, "mb-[12px] max-h-[min(36vh,_280px)] overflow-y-auto")}
        >
          {snapshot.workspaces.map((workspace) => (
            <BaseRadio.Root key={workspace.id} value={workspace.id} className={choiceClasses}>
              <ChoiceMark />
              <FolderOpen
                size={15}
                strokeWidth={1.75}
                className="shrink-0 text-[var(--text-tertiary)]"
              />
              <span className="grid min-w-0 flex-1 gap-[1px]">
                <span className="text-[13px] font-medium">{workspace.name}</span>
                <span className="overflow-hidden text-[var(--text-tertiary)] text-[11.5px] [font-family:var(--font-mono)] text-ellipsis whitespace-nowrap">
                  {workspace.path}
                </span>
              </span>
            </BaseRadio.Root>
          ))}
        </RadioGroup>
      )}
      <button
        type="button"
        disabled={adding}
        onClick={onAdd}
        className="motion-colors flex w-full items-center gap-[12px] [padding:16px] border-[1px] border-dashed border-[color:var(--line-strong)] rounded-[var(--radius-lg)] bg-transparent text-left text-[var(--text-primary)] cursor-default [&:hover:not(:disabled)]:bg-[var(--surface-hover)] [&:hover:not(:disabled)]:[border-color:var(--accent)] [&:disabled]:opacity-[0.6]"
      >
        <span className="grid w-[32px] h-[32px] flex-[0_0_32px] place-items-center rounded-[var(--radius)] bg-[var(--surface-hover)] text-[var(--accent)]">
          {adding ? <ActivitySpinner /> : <FolderPlus size={16} strokeWidth={1.75} />}
        </span>
        <span className="grid gap-[2px]">
          <span className="text-[13px] font-medium">
            {snapshot.workspaces.length > 0 ? "Add another folder…" : "Choose a folder…"}
          </span>
          <span className="text-[var(--text-tertiary)] text-[11.5px]">
            {adding ? "Waiting for a folder…" : "Opens your system's folder picker."}
          </span>
        </span>
      </button>
    </>
  )
}

type Theme = NonNullable<AppSettings["theme"]>

const THEMES: ReadonlyArray<{ value: Theme; label: string; icon: ReactNode }> = [
  { value: "dark", label: "Dark", icon: <Moon size={13} strokeWidth={1.75} /> },
  { value: "light", label: "Light", icon: <Sun size={13} strokeWidth={1.75} /> },
  { value: "system", label: "System", icon: <Monitor size={13} strokeWidth={1.75} /> },
]

/** A miniature window in the theme's own colours, so the choice is visible before it is made. */
function ThemePreview({ theme }: { theme: Theme }) {
  const half = (variant: "dark" | "light") => (
    <span
      className={cx(
        "grid grid-cols-[30%_1fr] gap-[5px] h-full p-[6px]",
        variant === "dark" ? "bg-[#1c1c1e]" : "bg-[#ecebe8]",
      )}
    >
      <span className={cx("rounded-[3px]", variant === "dark" ? "bg-[#2a2a2d]" : "bg-[#dcdbd7]")} />
      <span className="grid content-end gap-[4px]">
        <span
          className={cx(
            "h-[4px] w-[70%] rounded-[2px]",
            variant === "dark" ? "bg-[#3a3a3e]" : "bg-[#c9c8c3]",
          )}
        />
        <span
          className={cx(
            "h-[12px] rounded-[3px] border-[1px]",
            variant === "dark" ? "border-[#3a3a3e]" : "border-[#c9c8c3]",
          )}
        />
      </span>
    </span>
  )
  if (theme === "system")
    return (
      <span className="grid grid-cols-2 h-full">
        <span className="overflow-hidden">{half("dark")}</span>
        <span className="overflow-hidden">{half("light")}</span>
      </span>
    )
  return half(theme)
}

export function PreferencesStep({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (input: SetAppSettingsInput) => void
}) {
  const theme = settings.theme ?? "dark"
  return (
    <>
      <StepHeader
        title="Make it yours"
        lead="Changes apply right away, so you can see them before you continue."
      />
      <RadioGroup
        aria-label="Theme"
        value={theme}
        onValueChange={(value) => {
          if (value === "dark" || value === "light" || value === "system")
            onChange({ theme: value })
        }}
        className="grid grid-cols-3 gap-[10px]"
      >
        {THEMES.map((option) => (
          <BaseRadio.Root
            key={option.value}
            value={option.value}
            className="motion-colors grid gap-[8px] p-[6px] border-[1px] border-[color:var(--line)] rounded-[var(--radius-lg)] bg-transparent text-[var(--text-secondary)] cursor-default [&:hover]:[border-color:var(--line-strong)] [&[data-checked]]:[border-color:var(--accent)] [&[data-checked]]:text-[var(--text-primary)] [&[data-checked]]:[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]"
          >
            <span className="block h-[62px] overflow-hidden rounded-[6px] border-[1px] border-[color:var(--line-subtle)]">
              <ThemePreview theme={option.value} />
            </span>
            <span className="flex items-center justify-center gap-[6px] pb-[2px] text-[12px] font-medium">
              {option.icon}
              {option.label}
            </span>
          </BaseRadio.Root>
        ))}
      </RadioGroup>
      <div className="mt-[10px]">
        <PreferenceRow
          label="Transcript text size"
          description="How large messages and replies read."
        >
          <ToggleGroup
            aria-label="Transcript text size"
            value={[settings.transcriptSize ?? "medium"]}
            onValueChange={(value) => {
              const size = value[0]
              if (size === "small" || size === "medium" || size === "large")
                onChange({ transcriptSize: size })
            }}
            className={segmentGroupClasses}
          >
            {(["small", "medium", "large"] as const).map((size) => (
              <Toggle key={size} value={size} className={segmentClasses}>
                {size[0]!.toUpperCase() + size.slice(1)}
              </Toggle>
            ))}
          </ToggleGroup>
        </PreferenceRow>
        <PreferenceRow
          label="Sounds"
          description="A soft chime when a thread you aren't watching finishes or needs you."
        >
          <Switch
            label="Sounds"
            checked={settings.sounds ?? true}
            onCheckedChange={(sounds) => onChange({ sounds })}
          />
        </PreferenceRow>
        <PreferenceRow
          label="Always full permissions"
          description="Agents run commands and edit files without asking. Leave off to approve risky steps."
        >
          <Switch
            label="Always full permissions"
            checked={settings.alwaysFullPermissions ?? false}
            onCheckedChange={(alwaysFullPermissions) => onChange({ alwaysFullPermissions })}
          />
        </PreferenceRow>
      </div>
    </>
  )
}

/** A compact preference: its label and note on the left, the control on the right. */
function PreferenceRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="preference-row flex items-center justify-between gap-[24px] [padding:12px_0] [&_+_.preference-row]:border-t-[1px] [&_+_.preference-row]:border-t-[color:var(--line-subtle)]">
      <span className="grid min-w-0 gap-[2px]">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-[var(--text-secondary)] text-[12px] leading-[1.5]">
          {description}
        </span>
      </span>
      <span className="flex shrink-0">{children}</span>
    </div>
  )
}

function SummaryRow({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[24px] [padding:12px_14px]">
      <span className="text-[var(--text-secondary)] text-[12.5px]">{label}</span>
      <span className="flex min-w-0 items-center gap-[8px] text-[12.5px] font-medium">
        {icon}
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{value}</span>
      </span>
    </div>
  )
}

export function ReadyStep({
  provider,
  modelName,
  workspaceName,
  theme,
}: {
  provider: Provider | undefined
  modelName: string | null
  workspaceName: string | null
  theme: Theme
}) {
  return (
    <>
      <StepHeader
        title="You're all set"
        lead="MeldShell opens a new thread with the composer ready. Describe what you want done and press Enter."
      />
      <div className={listClasses}>
        <SummaryRow
          label="Starting model"
          value={modelName === null ? "Choose later" : modelLabel(modelName)}
          icon={provider === undefined ? undefined : <ProviderIcon provider={provider} size={13} />}
        />
        <SummaryRow label="Workspace" value={workspaceName ?? "Add one from the inbox"} />
        <SummaryRow
          label="Theme"
          value={THEMES.find((entry) => entry.value === theme)?.label ?? ""}
        />
      </div>
    </>
  )
}
