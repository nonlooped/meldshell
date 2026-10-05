import { HomeMark } from "../workspaces/WorkspaceLabel"
import type {
  AppSettings,
  AppSnapshot,
  Provider,
  ProviderStatus,
  SetAppSettingsInput,
} from "@meldshell/contracts"
import { RadioGroup } from "@base-ui-components/react/radio-group"
import { Radio } from "@base-ui-components/react/radio"
import { motion } from "motion/react"
import {
  Check,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Volume2,
  VolumeX,
} from "lucide-react"
import type { ReactNode } from "react"
import { BUILT_IN_THEMES, resolveColorTheme } from "../app/color-themes"
import { MeldMark } from "../ui/MeldMark"
import { TEXT_SIZES, THEMES, ThemePreview } from "../ui/ThemePreview"
import { ProviderIcon } from "../ui/ProviderIcon"
import { ActivitySpinner, useMotionPreference } from "../ui/motion"
import { cx } from "../ui/styles"
import { AGENT_STATES, agentDetail } from "./onboarding-model"

const ease = [0.2, 0.7, 0.2, 1] as const

/** Children rise in one after another as a step arrives. */
function Stagger({
  index,
  children,
  className,
}: {
  index: number
  children: ReactNode
  className?: string
}) {
  const reduced = useMotionPreference()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : 0.06 * index, ease }}
    >
      {children}
    </motion.div>
  )
}

function StepTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <Stagger index={0} className="grid justify-items-center gap-[8px] text-center mb-[36px]">
      <h1 className="m-0 [font-family:var(--font-display)] text-[30px] font-semibold tracking-[-0.022em] leading-[1.15]">
        {title}
      </h1>
      <p className="m-0 text-[var(--text-secondary)] text-[14px]">{hint}</p>
    </Stagger>
  )
}

/** Raised tiles share one surface so every step reads as part of the same canvas. */
const tileClasses = [
  "motion-colors relative border-[1px] border-[color:var(--line)] rounded-[var(--radius-lg)]",
  "bg-[var(--surface-raised)] [box-shadow:inset_0_1px_0_var(--edge-highlight)] text-[var(--text-primary)]",
  "cursor-default [&:hover:not(:disabled)]:[border-color:var(--line-strong)]",
  "[&[data-checked]]:[border-color:var(--accent)]",
  "[&[data-checked]]:[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent),inset_0_1px_0_var(--edge-highlight)]",
].join(" ")

/** The accent check that marks a chosen tile. */
function CheckBadge({ shown }: { shown: boolean }) {
  return (
    <motion.span
      aria-hidden="true"
      className="absolute top-[10px] right-[10px] grid w-[18px] h-[18px] place-items-center rounded-[50%] bg-[var(--accent)] text-[var(--accent-foreground)]"
      initial={false}
      animate={shown ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 28 }}
    >
      <Check size={11} strokeWidth={3} />
    </motion.span>
  )
}

/** The agents MeldShell drives, circling its mark. */
export function WelcomeStep({ providers }: { providers: readonly Provider[] }) {
  const reduced = useMotionPreference()
  const radius = 92
  return (
    <div className="grid justify-items-center text-center">
      <Stagger index={0} className="relative grid w-[240px] h-[240px] place-items-center">
        <div
          aria-hidden="true"
          className="absolute inset-[34px] rounded-full blur-[36px] opacity-[0.32] [background:conic-gradient(from_0deg,var(--spin-top),var(--spin-middle),var(--spin-bottom),var(--spin-top))]"
        />
        <div
          aria-hidden="true"
          className="absolute rounded-full border-[1px] border-dashed border-[color:var(--line-strong)]"
          style={{ inset: 120 - radius }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute inset-0"
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 48, ease: "linear", repeat: Infinity }}
        >
          {providers.map((provider, index) => {
            const angle = (index / providers.length) * Math.PI * 2 - Math.PI / 2
            return (
              <motion.span
                key={provider.id}
                className="absolute grid w-[40px] h-[40px] place-items-center rounded-[12px] border-[1px] border-[color:var(--line)] bg-[var(--surface-menu)] [box-shadow:var(--shadow-raised)]"
                style={{
                  left: 120 + Math.cos(angle) * radius - 20,
                  top: 120 + Math.sin(angle) * radius - 20,
                }}
                animate={reduced ? undefined : { rotate: -360 }}
                transition={{ duration: 48, ease: "linear", repeat: Infinity }}
              >
                <ProviderIcon provider={provider} size={18} />
              </motion.span>
            )
          })}
        </motion.div>
        <MeldMark className="relative w-[58px] h-[58px] text-[var(--text-primary)]" />
      </Stagger>
      <Stagger index={1}>
        <h1 className="[margin:28px_0_0] [font-family:var(--font-display)] text-[34px] font-semibold tracking-[-0.025em]">
          Welcome to MeldShell
        </h1>
      </Stagger>
      <Stagger index={2}>
        <p className="[margin:10px_0_0] text-[var(--text-secondary)] text-[14px]">
          Every coding agent, side by side. Let's get you ready.
        </p>
      </Stagger>
    </div>
  )
}

function StatusDot({ status }: { status: ProviderStatus | undefined }) {
  const availability = status?.availability ?? "probing"
  const state = AGENT_STATES[availability]
  return (
    <span
      className="inline-flex items-center gap-[6px] [padding:3px_9px] rounded-[999px] bg-[var(--surface-hover)] text-[12px] font-medium whitespace-nowrap"
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
  return (
    <>
      <StepTitle
        title="Your agents"
        hint="Signed in with your own accounts. Tap one to turn it off."
      />
      <div className="grid grid-cols-4 gap-[12px] [@container(max-width:_760px)]:grid-cols-2">
        {providers.map((provider, index) => {
          const status = statuses.get(provider.id)
          const ready = status?.availability === "ready"
          return (
            <Stagger key={provider.id} index={index + 1}>
              <button
                type="button"
                role="switch"
                aria-checked={provider.enabled}
                aria-label={`Use ${provider.displayName}`}
                title={agentDetail(provider.harness, status)}
                data-checked={provider.enabled && ready ? "" : undefined}
                onClick={() => onToggleProvider(provider, !provider.enabled)}
                className={cx(
                  tileClasses,
                  "grid w-full h-[168px] justify-items-center content-center gap-[14px] [padding:18px_12px]",
                  !provider.enabled && "opacity-[0.42] [filter:grayscale(1)]",
                )}
              >
                <CheckBadge shown={provider.enabled && ready} />
                <span className="grid w-[52px] h-[52px] place-items-center rounded-[16px] bg-[var(--surface-hover)]">
                  <ProviderIcon provider={provider} size={26} />
                </span>
                <span className="text-[14px] font-semibold">{provider.displayName}</span>
                {provider.enabled ? (
                  <StatusDot status={status} />
                ) : (
                  <span className="[padding:3px_9px] text-[var(--text-tertiary)] text-[12px] font-medium">
                    Off
                  </span>
                )}
              </button>
            </Stagger>
          )
        })}
      </div>
      <Stagger index={6} className="flex justify-center mt-[22px]">
        <button
          type="button"
          disabled={checking}
          onClick={onCheckAgain}
          className="motion-colors inline-flex items-center gap-[7px] [padding:6px_12px] border-0 rounded-[999px] bg-transparent text-[var(--text-tertiary)] text-[12px] cursor-default [&:hover:not(:disabled)]:bg-[var(--surface-hover)] [&:hover:not(:disabled)]:text-[var(--text-primary)]"
        >
          {checking ? <ActivitySpinner /> : <RefreshCw size={12} strokeWidth={2} />}
          {checking ? "Checking" : "Installed or signed in just now? Check again"}
        </button>
      </Stagger>
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
      <StepTitle
        title="Pick a project"
        hint="A folder your agents can read and change, or Home for general questions."
      />
      <div className="grid justify-items-center gap-[14px]">
        <Stagger index={1} className="w-[min(440px,_100%)]">
          <button
            type="button"
            disabled={adding}
            onClick={onAdd}
            className={cx(
              tileClasses,
              "group grid w-full h-[150px] place-items-center content-center gap-[12px] border-dashed bg-transparent [&:hover:not(:disabled)]:[border-color:var(--accent)] [&:hover:not(:disabled)]:bg-[var(--surface-hover)]",
            )}
          >
            <span className="motion-transform grid w-[52px] h-[52px] place-items-center rounded-[16px] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)] [.group:hover_&]:scale-[1.06]">
              {adding ? <ActivitySpinner /> : <FolderPlus size={24} strokeWidth={1.6} />}
            </span>
            <span className="text-[14px] font-semibold">
              {adding ? "Waiting for a folder…" : "Choose a folder"}
            </span>
          </button>
        </Stagger>
        {snapshot.workspaces.length > 0 && (
          <RadioGroup
            aria-label="Workspace"
            value={workspaceId ?? ""}
            onValueChange={(value) => {
              if (typeof value === "string" && value) onSelect(value)
            }}
            className="flex flex-wrap justify-center gap-[10px] w-[min(640px,_100%)]"
          >
            {snapshot.workspaces.map((workspace, index) => (
              <Stagger key={workspace.id} index={index + 2}>
                <Radio.Root
                  value={workspace.id}
                  title={workspace.path}
                  className={cx(
                    tileClasses,
                    "flex items-center gap-[10px] [padding:10px_38px_10px_12px] max-w-[300px]",
                  )}
                >
                  {workspace.home === true ? (
                    <HomeMark size={16} />
                  ) : (
                    <FolderOpen
                      size={16}
                      strokeWidth={1.75}
                      className="shrink-0 text-[var(--text-tertiary)]"
                    />
                  )}
                  <span className="overflow-hidden text-[13px] font-medium text-ellipsis whitespace-nowrap">
                    {workspace.name}
                  </span>
                  <CheckBadge shown={workspace.id === workspaceId} />
                </Radio.Root>
              </Stagger>
            ))}
          </RadioGroup>
        )}
      </div>
    </>
  )
}

/** An on/off preference drawn as a tile whose icon shows its state. */
function ToggleTile({
  label,
  hint,
  checked,
  on,
  off,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  on: ReactNode
  off: ReactNode
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-checked={checked ? "" : undefined}
      onClick={() => onChange(!checked)}
      className={cx(
        tileClasses,
        "flex w-full items-center gap-[12px] [padding:12px_14px] text-left",
      )}
    >
      <span
        className={cx(
          "motion-colors grid w-[34px] h-[34px] flex-[0_0_34px] place-items-center rounded-[10px]",
          checked
            ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]"
            : "bg-[var(--surface-hover)] text-[var(--text-tertiary)]",
        )}
      >
        {checked ? on : off}
      </span>
      <span className="grid gap-[1px]">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="text-[var(--text-tertiary)] text-[12px]">{hint}</span>
      </span>
    </button>
  )
}

export function LookStep({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (input: SetAppSettingsInput) => void
}) {
  const theme = settings.theme ?? "dark"
  const textSize = settings.transcriptSize ?? "medium"
  const colors = resolveColorTheme(settings)
  return (
    <>
      <StepTitle title="Make it yours" hint="Everything changes as you tap." />
      <div className="grid gap-[14px] w-[min(640px,_100%)] [margin:0_auto]">
        <Stagger index={1}>
          <RadioGroup
            aria-label="Theme"
            value={theme}
            onValueChange={(value) => {
              if (value === "dark" || value === "light" || value === "system")
                onChange({ theme: value })
            }}
            className="grid grid-cols-3 gap-[12px]"
          >
            {THEMES.map((option) => (
              <Radio.Root
                key={option.value}
                value={option.value}
                aria-label={option.label}
                className={cx(tileClasses, "grid gap-[10px] p-[8px] pb-[10px]")}
              >
                <span className="block h-[92px] overflow-hidden rounded-[9px] border-[1px] border-[color:var(--line-subtle)]">
                  <ThemePreview theme={option.value} colors={colors} />
                </span>
                <span className="flex items-center justify-center gap-[6px] text-[13px] font-medium">
                  {option.icon}
                  {option.label}
                </span>
                <CheckBadge shown={option.value === theme} />
              </Radio.Root>
            ))}
          </RadioGroup>
        </Stagger>
        <Stagger index={2}>
          <RadioGroup
            aria-label="Color theme"
            value={colors.id}
            onValueChange={(value) => {
              if (typeof value === "string") onChange({ colorTheme: value })
            }}
            className="flex flex-wrap items-center justify-center gap-[10px] [padding:2px_0]"
          >
            {BUILT_IN_THEMES.map((option) => (
              <Radio.Root
                key={option.id}
                value={option.id}
                aria-label={option.name}
                title={option.name}
                className="motion-colors grid h-[30px] w-[30px] place-items-center rounded-full border-[1px] border-[color:var(--line)] cursor-default [&:hover]:[border-color:var(--line-strong)] [&[data-checked]]:[border-color:var(--accent)] [&[data-checked]]:[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]"
                style={{
                  background: `linear-gradient(135deg, ${option.dark.background} 50%, ${option.light.background} 50%)`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="h-[12px] w-[12px] rounded-full"
                  style={{
                    background: `linear-gradient(135deg, ${option.dark.accent} 50%, ${option.light.accent} 50%)`,
                  }}
                />
              </Radio.Root>
            ))}
          </RadioGroup>
        </Stagger>
        <Stagger
          index={3}
          className="grid grid-cols-[1.15fr_1fr_1fr] gap-[12px] [@container(max-width:_760px)]:grid-cols-1"
        >
          <RadioGroup
            aria-label="Transcript text size"
            value={textSize}
            onValueChange={(value) => {
              if (value === "small" || value === "medium" || value === "large")
                onChange({ transcriptSize: value })
            }}
            className={cx(
              tileClasses,
              "grid grid-cols-3 items-end p-[4px] [&:hover]:[border-color:var(--line)]",
            )}
          >
            {TEXT_SIZES.map((option) => (
              <Radio.Root
                key={option.value}
                value={option.value}
                aria-label={`${option.label} text`}
                className="motion-colors grid h-[50px] place-items-center rounded-[9px] border-0 bg-transparent text-[var(--text-tertiary)] cursor-default [font-family:var(--font-display)] font-semibold [&:hover]:text-[var(--text-primary)] [&[data-checked]]:bg-[var(--surface-selected)] [&[data-checked]]:text-[var(--text-primary)]"
                style={{ fontSize: option.size }}
              >
                Aa
              </Radio.Root>
            ))}
          </RadioGroup>
          <ToggleTile
            label="Sounds"
            hint="Chime when needed"
            checked={settings.sounds ?? true}
            on={<Volume2 size={17} strokeWidth={1.75} />}
            off={<VolumeX size={17} strokeWidth={1.75} />}
            onChange={(sounds) => onChange({ sounds })}
          />
          <ToggleTile
            label="Full access"
            hint="Skip approvals"
            checked={settings.alwaysFullPermissions ?? false}
            on={<ShieldOff size={17} strokeWidth={1.75} />}
            off={<ShieldCheck size={17} strokeWidth={1.75} />}
            onChange={(alwaysFullPermissions) => onChange({ alwaysFullPermissions })}
          />
        </Stagger>
      </div>
    </>
  )
}
