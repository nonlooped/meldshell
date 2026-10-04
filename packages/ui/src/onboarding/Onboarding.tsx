import { useEffect, useState } from "react"
import { useQueries, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { errorMessage, type AppSnapshot, type Provider } from "@meldshell/contracts"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { queryKeys, replaceSnapshot } from "../data/cache"
import { providerStatusQuery, refreshProviderStatus } from "../data/providers"
import { Button, IconButton } from "../ui/controls"
import { useMotionPreference } from "../ui/motion"
import { cx } from "../ui/styles"
import { useViewStore } from "../app/view-store"
import {
  ONBOARDING_STEPS,
  onboardingProviders,
  starterModelId,
  type OnboardingStep,
} from "./onboarding-model"
import { AgentsStep, LookStep, WelcomeStep, WorkspaceStep } from "./OnboardingSteps"

const ease = [0.2, 0.7, 0.2, 1] as const

const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  agents: "Agents",
  workspace: "Project",
  look: "Appearance",
}

/** Each agent's live status, keyed by provider id. */
function useAgentStatuses(providers: readonly Provider[]) {
  const results = useQueries({
    queries: providers.map((provider) => providerStatusQuery(provider.harness)),
  })
  const statuses = new Map(providers.map((provider, index) => [provider.id, results[index]?.data]))
  const [checking, setChecking] = useState(false)
  const checkAgain = () => {
    setChecking(true)
    const harnesses = [...new Set(providers.map((provider) => provider.harness))]
    void Promise.allSettled(harnesses.map(refreshProviderStatus)).finally(() => setChecking(false))
  }
  return { statuses, checking, checkAgain }
}

/** Runs one snapshot-returning host call and keeps the shared cache in step with its answer. */
function useHostCall() {
  const client = useQueryClient()
  return async (call: () => Promise<AppSnapshot>): Promise<AppSnapshot> => {
    const next = await call()
    replaceSnapshot(client, next)
    return next
  }
}

/** A thread that has never carried work, which the guide reuses instead of adding another. */
const draftThreadIn = (snapshot: AppSnapshot, workspaceId: string) =>
  snapshot.threads.find(
    (thread) =>
      thread.workspaceId === workspaceId &&
      thread.status === "active" &&
      thread.turnCount === 0 &&
      thread.queuedCount === 0,
  )

function StepDots({ index }: { index: number }) {
  return (
    <ol className="flex items-center gap-[6px] m-0 p-0 list-none" aria-label="Setup progress">
      {ONBOARDING_STEPS.map((step, position) => (
        <li
          key={step}
          aria-label={STEP_LABELS[step]}
          aria-current={position === index ? "step" : undefined}
          className={cx(
            "motion-width motion-duration-280 h-[5px] rounded-[999px]",
            position === index ? "w-[28px] bg-[var(--accent)]" : "w-[12px]",
            position < index && "bg-[var(--text-tertiary)]",
            position > index && "bg-[var(--line-strong)]",
          )}
        />
      ))}
    </ol>
  )
}

/**
 * The first-run guide fills the window: it checks the installed agents, picks a workspace, sets the
 * look, then opens a new thread on a ready agent with its composer focused.
 */
function Onboarding({
  snapshot,
  onOpenThread,
}: {
  snapshot: AppSnapshot
  onOpenThread: (threadId: string) => void
}): React.JSX.Element {
  const reduced = useMotionPreference()
  const client = useQueryClient()
  const host = useHostCall()
  const closeOnboarding = useViewStore((state) => state.closeOnboarding)
  const focusComposer = useViewStore((state) => state.focusComposer)

  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const step = ONBOARDING_STEPS[index] ?? "welcome"
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Opening the guide again from Settings starts from the host's current state.
  useEffect(() => {
    void client.invalidateQueries({ queryKey: queryKeys.snapshot })
  }, [client])

  const providers = onboardingProviders(snapshot.providers)
  const agents = useAgentStatuses(providers)
  const readyIds = new Set(
    providers
      .filter((provider) => agents.statuses.get(provider.id)?.availability === "ready")
      .map((provider) => provider.id),
  )
  const modelId = starterModelId(snapshot, readyIds)
  // Until a folder is picked, the most recently used workspace is preselected.
  const workspace =
    snapshot.workspaces.find((entry) => entry.id === workspaceId) ?? snapshot.workspaces[0]

  const go = (delta: number) => {
    setError(null)
    setDirection(delta)
    setIndex((current) => Math.min(Math.max(current + delta, 0), ONBOARDING_STEPS.length - 1))
  }

  const fail = (cause: unknown) => setError(errorMessage(cause))

  const changeSettings = (input: Parameters<typeof window.meldshell.setAppSettings>[0]) =>
    void host(() => window.meldshell.setAppSettings(input)).catch(fail)

  const toggleProvider = (provider: Provider, enabled: boolean) =>
    void host(() => window.meldshell.updateProvider({ providerId: provider.id, enabled })).catch(
      fail,
    )

  const addWorkspace = () => {
    setAdding(true)
    setError(null)
    const known = new Set(snapshot.workspaces.map((entry) => entry.id))
    host(() => window.meldshell.addWorkspace())
      .then((next) => {
        const added = next.workspaces.find((entry) => !known.has(entry.id))
        if (added !== undefined) setWorkspaceId(added.id)
      })
      .catch(fail)
      .finally(() => setAdding(false))
  }

  // The flag is stored before the guide leaves, so a quick restart never shows it again.
  const skip = () => {
    setBusy(true)
    host(() => window.meldshell.setAppSettings({ onboarded: true }))
      .then(closeOnboarding)
      .catch((cause: unknown) => {
        fail(cause)
        setBusy(false)
      })
  }

  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      let threadId: string | undefined
      if (workspace !== undefined) {
        const existing = draftThreadIn(snapshot, workspace.id)
        if (existing === undefined) {
          const known = new Set(snapshot.threads.map((thread) => thread.id))
          const next = await host(() =>
            window.meldshell.createThread({ workspaceId: workspace.id }),
          )
          threadId = next.threads.find((thread) => !known.has(thread.id))?.id
        } else threadId = existing.id
        if (threadId !== undefined && modelId !== null) {
          const id = threadId
          await host(() => window.meldshell.setThreadSettings({ threadId: id, modelId }))
        }
      }
      await host(() => window.meldshell.setAppSettings({ onboarded: true }))
      closeOnboarding()
      if (threadId !== undefined) {
        onOpenThread(threadId)
        focusComposer(threadId)
      }
    } catch (cause) {
      fail(cause)
      setBusy(false)
    }
  }

  const canContinue = step !== "workspace" || workspace !== undefined
  const last = step === "look"

  const body = (() => {
    switch (step) {
      case "welcome":
        return <WelcomeStep providers={providers} />
      case "agents":
        return (
          <AgentsStep
            providers={providers}
            statuses={agents.statuses}
            checking={agents.checking}
            onCheckAgain={agents.checkAgain}
            onToggleProvider={toggleProvider}
          />
        )
      case "workspace":
        return (
          <WorkspaceStep
            snapshot={snapshot}
            workspaceId={workspace?.id ?? null}
            adding={adding}
            onSelect={setWorkspaceId}
            onAdd={addWorkspace}
          />
        )
      case "look":
        return <LookStep settings={snapshot.settings} onChange={changeSettings} />
    }
  })()

  const primary = (() => {
    if (step === "welcome") return "Get started"
    if (last) return busy ? "Opening…" : "Start your first thread"
    return "Continue"
  })()

  return (
    <motion.main
      aria-label="Set up MeldShell"
      className="absolute inset-0 z-[40] grid grid-rows-[var(--titlebar-height)_minmax(0,_1fr)_auto] text-[var(--text-primary)] text-[13px] leading-[1.45]"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.3, ease } }}
      transition={{ duration: reduced ? 0 : 0.4, ease }}
    >
      {/* The window stays draggable above the guide, as it is above the launch screen. */}
      <div className="[-webkit-app-region:drag]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[50%] top-[46%] w-[760px] h-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px] opacity-[0.1] [background:conic-gradient(from_200deg,var(--spin-top),var(--spin-middle),var(--spin-bottom),var(--spin-top))]"
      />
      <div className="relative grid min-h-0 overflow-y-auto overflow-x-hidden [padding:16px_32px] [container-type:inline-size]">
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div
            key={step}
            className="w-[min(760px,_100%)] [margin:auto]"
            initial={reduced ? false : { opacity: 0, x: 28 * direction, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{
              opacity: 0,
              x: reduced ? 0 : -28 * direction,
              filter: reduced ? "blur(0px)" : "blur(4px)",
              transition: { duration: reduced ? 0 : 0.18, ease },
            }}
            transition={{ duration: reduced ? 0 : 0.34, ease }}
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>
      <footer className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-[16px] [padding:18px_32px_26px]">
        <div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={skip}>
            Skip
          </Button>
        </div>
        <StepDots index={index} />
        <div className="flex items-center justify-end gap-[8px]">
          {error !== null && (
            <span role="alert" className="mr-[8px] text-[var(--color-deleted)] text-[12px]">
              {error}
            </span>
          )}
          {index > 0 && (
            <IconButton label="Back" disabled={busy} onClick={() => go(-1)}>
              <ArrowLeft size={16} strokeWidth={1.75} />
            </IconButton>
          )}
          <Button
            variant="primary"
            autoFocus
            className="h-[36px]! [padding:0_18px]!"
            disabled={!canContinue || busy}
            onClick={() => (last ? void finish() : go(1))}
          >
            {primary}
            <ArrowRight size={14} strokeWidth={2} />
          </Button>
        </div>
      </footer>
    </motion.main>
  )
}

/** The guide over the shared backdrop, once the launch screen has gone. */
export function OnboardingLayer({
  launching,
  snapshot,
  onOpenThread,
}: {
  launching: boolean
  snapshot: AppSnapshot
  onOpenThread: (threadId: string) => void
}): React.JSX.Element {
  const open = useViewStore((state) => state.onboardingOpen)
  return (
    <AnimatePresence>
      {open && !launching && (
        <Onboarding key="onboarding" snapshot={snapshot} onOpenThread={onOpenThread} />
      )}
    </AnimatePresence>
  )
}
