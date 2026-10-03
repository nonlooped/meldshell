import { useEffect, useState } from "react"
import { useQueries, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { errorMessage, type AppSnapshot, type Provider } from "@meldshell/contracts"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { queryKeys, replaceSnapshot } from "../data/cache"
import { providerStatusQuery, refreshProviderStatus } from "../data/providers"
import { Button } from "../ui/controls"
import { useMotionPreference } from "../ui/motion"
import { cx } from "../ui/styles"
import { useViewStore } from "../app/view-store"
import {
  defaultModelId,
  modelChoices,
  ONBOARDING_STEPS,
  onboardingProviders,
  type OnboardingStep,
} from "./onboarding-model"
import {
  AgentsStep,
  ModelStep,
  PreferencesStep,
  ReadyStep,
  WelcomeStep,
  WorkspaceStep,
} from "./OnboardingSteps"

const ease = [0.2, 0.7, 0.2, 1] as const

const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  agents: "Agents",
  model: "Model",
  workspace: "Workspace",
  preferences: "Preferences",
  ready: "Ready",
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
            "motion-width motion-duration-280 h-[6px] rounded-[999px]",
            position === index ? "w-[22px] bg-[var(--accent)]" : "w-[6px]",
            position < index && "bg-[var(--text-tertiary)]",
            position > index && "bg-[var(--line-strong)]",
          )}
        />
      ))}
    </ol>
  )
}

/**
 * The first-run guide: it checks the installed agents, picks a starting model and workspace, sets
 * a few preferences, then opens a new thread with its composer focused.
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
  const [pickedModelId, setPickedModelId] = useState<string | null>(null)
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
  const anyReady = providers.some((provider) => provider.enabled && readyIds.has(provider.id))
  const offeredIds = anyReady
    ? readyIds
    : new Set(snapshot.providers.filter((provider) => provider.enabled).map(({ id }) => id))
  const groups = modelChoices(snapshot, offeredIds)
  const modelId = defaultModelId(groups, pickedModelId)
  const model = snapshot.models.find((entry) => entry.id === modelId)
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

  const canContinue =
    (step !== "model" || modelId !== null || groups.length === 0) &&
    (step !== "workspace" || workspace !== undefined)

  const body = (() => {
    switch (step) {
      case "welcome":
        return <WelcomeStep />
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
      case "model":
        return (
          <ModelStep
            groups={groups}
            anyReady={anyReady}
            modelId={modelId}
            onSelect={setPickedModelId}
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
      case "preferences":
        return <PreferencesStep settings={snapshot.settings} onChange={changeSettings} />
      case "ready":
        return (
          <ReadyStep
            provider={snapshot.providers.find((entry) => entry.id === model?.providerId)}
            modelName={model?.displayName ?? null}
            workspaceName={workspace?.name ?? null}
            theme={snapshot.settings.theme ?? "dark"}
          />
        )
    }
  })()

  const primary = (() => {
    if (step === "welcome") return "Get started"
    if (step === "ready") return busy ? "Opening…" : "Start your first thread"
    return "Continue"
  })()

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Set up MeldShell"
      className="absolute inset-0 z-[40] grid place-items-center overflow-y-auto [padding:calc(var(--titlebar-height)_+_8px)_24px_32px] text-[var(--text-primary)] text-[13px] leading-[1.45]"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.3, ease } }}
      transition={{ duration: reduced ? 0 : 0.4, ease }}
    >
      {/* The window stays draggable above the guide, as it is above the launch screen. */}
      <div className="absolute top-0 inset-x-0 h-[var(--titlebar-height)] [-webkit-app-region:drag]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[50%] top-[42%] w-[520px] h-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px] opacity-[0.13] [background:conic-gradient(from_200deg,var(--spin-top),var(--spin-middle),var(--spin-bottom),var(--spin-top))]"
      />
      <section className="relative grid w-[min(580px,_100%)] grid-rows-[auto_minmax(0,_1fr)_auto_auto] overflow-hidden border-[1px] border-[color:var(--line)] rounded-[var(--radius-xl)] bg-[var(--surface-overlay)] [backdrop-filter:blur(32px)_saturate(120%)] [box-shadow:var(--shadow-raised),_inset_0_1px_0_var(--edge-highlight)] [@media(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]">
        <div className="flex items-center justify-between [padding:16px_24px_0]">
          <StepDots index={index} />
          <span className="text-[var(--text-tertiary)] text-[11.5px] tabular-nums">
            {index + 1} of {ONBOARDING_STEPS.length}
          </span>
        </div>
        <div className="relative min-h-[392px] overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            <motion.div
              key={step}
              className="[padding:22px_24px_8px]"
              initial={reduced ? false : { opacity: 0, x: 18 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{
                opacity: 0,
                x: reduced ? 0 : -18 * direction,
                transition: { duration: reduced ? 0 : 0.16, ease },
              }}
              transition={{ duration: reduced ? 0 : 0.28, ease }}
            >
              {body}
            </motion.div>
          </AnimatePresence>
        </div>
        {error !== null && (
          <p
            role="alert"
            className="m-0 [padding:0_24px_12px] text-[var(--color-deleted)] text-[12px]"
          >
            {error}
          </p>
        )}
        <footer className="flex items-center justify-between gap-[8px] [padding:14px_24px] border-t-[1px] border-t-[color:var(--line-subtle)] bg-[var(--surface-hover)]">
          <Button variant="ghost" size="sm" disabled={busy} onClick={skip}>
            Skip setup
          </Button>
          <div className="flex items-center gap-[8px] [&_.button]:h-[32px]">
            {index > 0 && (
              <Button
                disabled={busy}
                icon={<ArrowLeft size={14} strokeWidth={1.75} />}
                onClick={() => go(-1)}
              >
                Back
              </Button>
            )}
            <Button
              variant="primary"
              autoFocus
              disabled={!canContinue || busy}
              onClick={() => (step === "ready" ? void finish() : go(1))}
            >
              {primary}
              {step !== "ready" && <ArrowRight size={14} strokeWidth={2} />}
            </Button>
          </div>
        </footer>
      </section>
    </motion.div>
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
