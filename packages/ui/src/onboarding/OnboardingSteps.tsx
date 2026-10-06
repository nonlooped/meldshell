import type {
  AppSettings,
  Provider,
  ProviderStatus,
  SetAppSettingsInput,
} from "@meldshell/contracts"
import { RadioGroup } from "@base-ui-components/react/radio-group"
import { Radio } from "@base-ui-components/react/radio"
import { motion } from "motion/react"
import { ArrowRight, Check, Copy } from "lucide-react"
import type { ReactNode } from "react"
import { BUILT_IN_THEMES, resolveColorTheme } from "../app/color-themes"
import { useCopy } from "../ui/CopyButton"
import { Button } from "../ui/controls"
import { MeldMark } from "../ui/MeldMark"
import { ProviderIcon } from "../ui/ProviderIcon"
import { ActivitySpinner, Swap, useMotionPreference } from "../ui/motion"
import { cx } from "../ui/styles"
import { THEMES, ThemePreview } from "../ui/ThemePreview"
import { themeTileClasses } from "../settings/ThemeSettings"
import {
  AGENT_STATES,
  agentGuidance,
  agentMaker,
  agentName,
  type Platform,
} from "./onboarding-model"

const ease = [0.2, 0.7, 0.2, 1] as const

/** The guide's one large button: the next step, said plainly. */
export const heroButtonClasses =
  "h-[40px]! min-w-[168px] [padding:0_20px]! rounded-[var(--radius-lg)]! text-[14px]!"

/** Each page settles one thing: a heading that names it and a line on why it matters. */
function PageHeader({ title, lead }: { title: string; lead: ReactNode }) {
  return (
    <header className="grid justify-items-center gap-[10px] mb-[28px] text-center">
      <h1 className="m-0 [font-family:var(--font-display)] text-[28px] font-semibold tracking-[-0.025em] leading-[1.15] [text-wrap:balance]">
        {title}
      </h1>
      <p className="m-0 max-w-[480px] text-[var(--text-secondary)] text-[14px] leading-[1.55] [text-wrap:balance]">
        {lead}
      </p>
    </header>
  )
}

/* ---------------------------------------------------------------------------------------------- */

/** The brand's first impression, picking up the launch screen's mark and halo where it left off. */
export function WelcomeStep({ onStart }: { onStart: () => void }) {
  const reduced = useMotionPreference()
  const enter = (delay: number) => ({
    initial: reduced ? false : { opacity: 0, y: 10, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: reduced ? 0 : 0.7, delay: reduced ? 0 : delay, ease },
  })
  return (
    <div className="grid justify-items-center text-center">
      <div className="relative grid place-items-center w-[96px] h-[96px]">
        <motion.div
          aria-hidden="true"
          className="absolute inset-[-28px] rounded-full blur-[32px] [background:conic-gradient(from_0deg,var(--spin-top),var(--spin-middle),var(--spin-bottom),var(--spin-top))]"
          initial={false}
          animate={reduced ? { opacity: 0.24 } : { rotate: 360, opacity: [0.18, 0.32, 0.18] }}
          transition={
            reduced
              ? { duration: 0 }
              : {
                  rotate: { duration: 14, ease: "linear", repeat: Infinity },
                  opacity: { duration: 3.6, ease: "easeInOut", repeat: Infinity },
                }
          }
        />
        <MeldMark className="relative block w-[60px] h-[60px]" />
      </div>
      <motion.p
        className="[margin:26px_0_0] text-[13px] font-medium tracking-[0.01em] text-[var(--text-tertiary)]"
        {...enter(0.05)}
      >
        Welcome to MeldShell
      </motion.p>
      <motion.h1
        className="[margin:12px_0_0] [font-family:var(--font-display)] text-[clamp(34px,6cqi,52px)] font-bold tracking-[-0.035em] leading-[1.02] [text-wrap:balance]"
        {...enter(0.12)}
      >
        Your coding agents,
        <br />
        side by side.
      </motion.h1>
      <motion.p
        className="[margin:18px_0_0] max-w-[460px] text-[15px] leading-[1.55] text-[var(--text-secondary)] [text-wrap:balance]"
        {...enter(0.22)}
      >
        Codex, Claude Code, Cursor and Pi in one window, each in its own native session, on the
        accounts you already use.
      </motion.p>
      <motion.div className="mt-[34px]" {...enter(0.34)}>
        <Button variant="primary" autoFocus className={heroButtonClasses} onClick={onStart}>
          Get started
          <ArrowRight size={15} strokeWidth={2} />
        </Button>
      </motion.div>
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- */

/** Opens a vendor page in the system browser; the guide never navigates its own window. */
function openPage(url: string) {
  const desktop = window.meldshell.desktop
  if (desktop !== undefined) void desktop.openExternal(url)
  else window.open(url, "_blank", "noopener")
}

/** A terminal command, copied with one click so it need not be retyped. */
function CommandChip({ command }: { command: string }) {
  const [state, copy] = useCopy()
  const copied = state === "copied"
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : `Copy ${command}`}
      title={copied ? "Copied" : command}
      onClick={() => void copy(command)}
      className="motion-colors flex w-full min-w-0 items-center gap-[8px] [padding:5px_8px] rounded-[var(--radius-sm)] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] cursor-default [&:hover]:[border-color:var(--line-strong)]"
    >
      <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[11px]">
        {command}
      </code>
      <span className="grid w-[12px] shrink-0 place-items-center text-[var(--text-tertiary)]">
        <Swap id={copied ? "copied" : "copy"}>
          {copied ? (
            <Check size={12} strokeWidth={2.5} className="text-[var(--color-added)]" />
          ) : (
            <Copy size={12} strokeWidth={1.75} />
          )}
        </Swap>
      </span>
    </button>
  )
}

const tileClasses = [
  "motion-colors relative grid content-start gap-[14px] [padding:16px] text-left",
  "rounded-[var(--radius-xl)] border-[1px] border-[color:var(--line)] bg-[var(--surface-card)]",
  "text-[var(--text-primary)] cursor-default",
].join(" ")

const choosableTileClasses = [
  "[&:hover]:[border-color:var(--line-strong)] [&:hover]:bg-[var(--surface-hover)]",
  "[&[data-checked]]:[border-color:var(--accent)]",
  "[&[data-checked]]:[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]",
  "[&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px]",
].join(" ")

/** The agent's mark on a small raised plate, so every vendor's logo sits on the same footing. */
function AgentPlate({ provider, dim }: { provider: Provider; dim: boolean }) {
  return (
    <span
      className={cx(
        "grid h-[40px] w-[40px] place-items-center rounded-[10px] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-hover)]",
        dim && "opacity-[0.55] [filter:grayscale(1)]",
      )}
    >
      <ProviderIcon provider={provider} size={22} />
    </span>
  )
}

/** The chosen agent's check: an empty ring until picked, then the accent fills it. */
function PickMark({ chosen }: { chosen: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "motion-colors grid h-[20px] w-[20px] place-items-center rounded-full border-[1.5px]",
        chosen
          ? "[border-color:var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
          : "[border-color:var(--line-strong)] text-transparent",
      )}
    >
      <Check size={12} strokeWidth={3} />
    </span>
  )
}

function AgentTile({
  provider,
  status,
  platform,
  chosen,
}: {
  provider: Provider
  status: ProviderStatus | undefined
  platform: Platform
  chosen: boolean
}) {
  const name = agentName(provider)
  const maker = agentMaker(provider.harness)
  const availability = status?.availability ?? "probing"
  const ready = provider.enabled && availability === "ready"
  const identity = (
    <span className="grid gap-[2px]">
      <span className="text-[15px] font-semibold tracking-[-0.01em]">{name}</span>
      {maker !== null && (
        <span className="text-[12px] text-[var(--text-tertiary)]">by {maker}</span>
      )}
    </span>
  )
  if (ready)
    return (
      <Radio.Root value={provider.id} className={cx(tileClasses, choosableTileClasses)}>
        <span className="flex items-start justify-between">
          <AgentPlate provider={provider} dim={false} />
          <PickMark chosen={chosen} />
        </span>
        {identity}
      </Radio.Root>
    )
  const guidance = provider.enabled ? agentGuidance(provider.harness, status, platform) : null
  const state = provider.enabled
    ? AGENT_STATES[availability]
    : { label: "Turned off", tone: "var(--text-tertiary)" }
  return (
    <div className={tileClasses}>
      <span className="flex items-start justify-between">
        <AgentPlate provider={provider} dim />
        <span
          className="inline-flex h-[20px] items-center gap-[6px] text-[12px] whitespace-nowrap"
          style={{ color: state.tone }}
        >
          {availability === "probing" && provider.enabled && <ActivitySpinner />}
          {state.label}
        </span>
      </span>
      {identity}
      {guidance !== null && (
        <span className="grid gap-[8px] text-[12px] text-[var(--text-secondary)]">
          {guidance.instruction !== null && <span>{guidance.instruction}</span>}
          {guidance.command !== null && <CommandChip command={guidance.command} />}
          {guidance.docs !== null && (
            <button
              type="button"
              onClick={() => openPage(guidance.docs ?? "")}
              className="motion-colors justify-self-start border-0 bg-transparent p-0 text-[12px] text-[var(--text-secondary)] cursor-default underline-offset-[3px] [&:hover]:text-[var(--text-primary)] [&:hover]:underline"
            >
              Install guide
            </button>
          )}
        </span>
      )}
    </div>
  )
}

export function AgentsStep({
  providers,
  statuses,
  readyCount,
  platform,
  startingId,
  onPick,
}: {
  providers: readonly Provider[]
  statuses: ReadonlyMap<string, ProviderStatus | undefined>
  readyCount: number
  platform: Platform
  startingId: string | null
  onPick: (providerId: string) => void
}) {
  const settled = providers.every((provider) => statuses.get(provider.id) !== undefined)
  const missing = providers.length - readyCount
  return (
    <>
      <PageHeader
        title={readyCount === 0 && settled ? "Connect a coding agent" : "Choose your first agent"}
        lead={
          readyCount === 0 && settled
            ? "MeldShell works with the agents installed on this computer. Set one up below and its tile lights up on its own."
            : "MeldShell runs the agents already on this computer, signed in as you, with no API keys. Switch between them any time, even mid-thread."
        }
      />
      <RadioGroup
        aria-label="First agent"
        value={startingId ?? ""}
        onValueChange={(value) => {
          if (typeof value === "string" && value) onPick(value)
        }}
        className="grid grid-cols-2 gap-[12px] [@container(max-width:_520px)]:grid-cols-1"
      >
        {providers.map((provider) => (
          <AgentTile
            key={provider.id}
            provider={provider}
            status={statuses.get(provider.id)}
            platform={platform}
            chosen={provider.id === startingId}
          />
        ))}
      </RadioGroup>
      {settled && missing > 0 && (
        <p className="[margin:18px_0_0] text-center text-[12px] leading-[1.5] text-[var(--text-tertiary)] [text-wrap:balance]">
          Install or sign in from any terminal and the tile updates by itself.
          {platform === "windows" &&
            " Agents that live in WSL show up once you switch MeldShell to WSL in Settings."}
        </p>
      )}
    </>
  )
}

/* ---------------------------------------------------------------------------------------------- */

const swatchClasses = [
  "motion-colors grid justify-items-center gap-[7px] w-[60px] [padding:6px_0] border-0 rounded-[var(--radius)]",
  "bg-transparent text-[11px] text-[var(--text-tertiary)] cursor-default",
  "[&:hover]:text-[var(--text-primary)] [&[data-checked]]:text-[var(--text-primary)]",
  "[&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)]",
].join(" ")

/** The mode and color theme, applied as they are picked, so the guide itself becomes the preview. */
export function LookStep({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (input: SetAppSettingsInput) => void
}) {
  const colors = resolveColorTheme(settings)
  // From the setting rather than the document, which only takes the new mode after this render.
  const mode =
    settings.theme === "light" ||
    (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches)
      ? "light"
      : "dark"
  return (
    <>
      <PageHeader
        title="Make it yours"
        lead="Pick a look. It changes here as you choose, and everything else lives in Settings."
      />
      <RadioGroup
        aria-label="Theme"
        value={settings.theme ?? "dark"}
        onValueChange={(value) => {
          const theme = THEMES.find((option) => option.value === value)?.value
          if (theme !== undefined) onChange({ theme })
        }}
        className="grid grid-cols-3 gap-[12px] [@container(max-width:_520px)]:grid-cols-1"
      >
        {THEMES.map((option) => (
          <Radio.Root
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className={cx(themeTileClasses, "p-[7px]! pb-[10px]!")}
          >
            <span className="block h-[104px] overflow-hidden rounded-[7px] border-[1px] border-[color:var(--line-subtle)]">
              <ThemePreview theme={option.value} colors={colors} />
            </span>
            <span className="flex items-center justify-center gap-[6px] text-[13px] font-medium">
              {option.icon}
              {option.label}
            </span>
          </Radio.Root>
        ))}
      </RadioGroup>
      <RadioGroup
        aria-label="Color theme"
        value={colors.id}
        onValueChange={(value) => {
          if (typeof value === "string") onChange({ colorTheme: value })
        }}
        className="mt-[22px] flex flex-wrap justify-center gap-[2px]"
      >
        {BUILT_IN_THEMES.map((theme) => {
          const palette = theme[mode]
          const chosen = theme.id === colors.id
          return (
            <Radio.Root
              key={theme.id}
              value={theme.id}
              aria-label={theme.name}
              className={swatchClasses}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "motion-colors grid h-[30px] w-[30px] place-items-center rounded-full border-[1px]",
                  chosen
                    ? "[box-shadow:0_0_0_2px_var(--scrim),0_0_0_3.5px_var(--accent)]"
                    : "[border-color:var(--line)]",
                )}
                style={{ background: palette.background }}
              >
                <span
                  className="h-[12px] w-[12px] rounded-full"
                  style={{ background: palette.accent }}
                />
              </span>
              {theme.name}
            </Radio.Root>
          )
        })}
      </RadioGroup>
    </>
  )
}

/* ---------------------------------------------------------------------------------------------- */

/** Where the first thread opens. Opening a project is the main action; Home sits beside it. */
export function StartStep({
  agent,
  busy,
  onOpenProject,
  onStartHome,
}: {
  /** The agent the thread opens on, when one is ready. */
  agent: Provider | null
  /** What is being opened: `project` or `home`. */
  busy: string | null
  onOpenProject: () => void
  onStartHome: () => void
}) {
  const waiting = busy !== null
  return (
    <>
      <PageHeader
        title="You're all set"
        lead={
          agent === null
            ? "Open a folder of code to start your first thread, or start in Home for anything else. Connect an agent from Settings whenever you're ready."
            : `Open a folder of code to work on it with ${agentName(agent)}, or start in Home for anything else.`
        }
      />
      <div className="flex flex-wrap items-center justify-center gap-[10px]">
        <Button
          variant="primary"
          autoFocus
          disabled={waiting}
          className={heroButtonClasses}
          onClick={onOpenProject}
        >
          {busy === "project" && <ActivitySpinner />}
          Open a project…
        </Button>
        <Button
          disabled={waiting}
          className={cx(heroButtonClasses, "min-w-[140px]")}
          onClick={onStartHome}
        >
          {busy === "home" && <ActivitySpinner />}
          Start in Home
        </Button>
      </div>
    </>
  )
}
