import { useEffect, useState } from "react"
import { useQueries, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { errorMessage, type AppSnapshot, type Provider } from "@meldshell/contracts"
import { ArrowLeft } from "lucide-react"
import { queryKeys, replaceSnapshot } from "../data/cache"
import { providerStatusQuery, refreshProviderStatus } from "../data/providers"
import { Button } from "../ui/controls"
import { useMotionPreference } from "../ui/motion"
import { cx } from "../ui/styles"
import { useViewStore } from "../app/view-store"
import {
  ONBOARDING_STEPS,
  STEP_LABELS,
  onboardingProviders,
  startingAgentId,
  starterModelId,
  type OnboardingStep,
  type Platform,
} from "./onboarding-model"
import { AgentsStep, LookStep, StartStep, WelcomeStep, heroButtonClasses } from "./OnboardingSteps"

const ease = [0.2, 0.7, 0.2, 1] as const

/** How often the Agents page looks again for an install or sign-in made in a terminal. */
const POLL_SECONDS = 8

const platform: Platform =
  typeof navigator !== "undefined" && /Win/.test(navigator.platform) ? "windows" : "other"

/** Probes the given harnesses again. */
const probe = (harnesses: readonly string[]) => {
  for (const harness of harnesses) void refreshProviderStatus(harness).catch(() => undefined)
}

/**
 * Each agent's live status, keyed by provider id. While `watching`, agents that cannot run yet are
 * probed again on a timer, so an install or sign-in made in a terminal shows up without a click.
 */
function useAgentStatuses(providers: readonly Provider[], watching: boolean) {
  const results = useQueries({
    queries: providers.map((provider) => providerStatusQuery(provider.harness)),
  })
  const statuses = new Map(providers.map((provider, index) => [provider.id, results[index]?.data]))
  // Joined, so a status change restarts the timer and a re-render with the same list does not.
  const pending = [
    ...new Set(
      providers
        .filter((provider) => {
          const availability = statuses.get(provider.id)?.availability
          return provider.enabled && availability !== undefined && availability !== "ready"
        })
        .map((provider) => provider.harness),
    ),
  ].join(",")
  useEffect(() => {
    if (!watching || pending === "") return
    const timer = window.setInterval(() => probe(pending.split(",")), POLL_SECONDS * 1000)
    return () => window.clearInterval(timer)
  }, [watching, pending])
  return statuses
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

/** One mark per page after the welcome. Finished pages can be returned to. */
function StepDots({ index, onSelect }: { index: number; onSelect: (index: number) => void }) {
  return (
    <ol className="flex items-center gap-[6px] m-0 p-0 list-none" aria-label="Setup progress">
      {ONBOARDING_STEPS.map((step, position) => {
        if (position === 0) return null
        const done = position < index
        const current = position === index
        return (
          <li key={step} className="flex">
            <button
              type="button"
              disabled={!done}
              aria-label={STEP_LABELS[step]}
              aria-current={current ? "step" : undefined}
              title={STEP_LABELS[step]}
              onClick={() => onSelect(position)}
              className={cx(
                "motion-width block h-[4px] rounded-full border-0 p-0 cursor-default",
                current && "w-[22px] bg-[var(--text-primary)]",
                done && "w-[10px] bg-[var(--text-tertiary)] [&:hover]:bg-[var(--text-primary)]",
                !done && !current && "w-[10px] bg-[var(--line-strong)]",
              )}
            />
          </li>
        )
      })}
    </ol>
  )
}

/** The brand's three spinner colours, each a soft light that drifts on its own slow orbit. */
const GLOWS = [
  { color: "var(--spin-top)", x: -190, y: 40, size: 480, drift: 34, seconds: 23 },
  { color: "var(--spin-middle)", x: 0, y: -30, size: 540, drift: 26, seconds: 29 },
  { color: "var(--spin-bottom)", x: 200, y: 50, size: 460, drift: 38, seconds: 19 },
] as const

/**
 * The ambient glow behind every page: a wash of the brand's colours that sits behind the mark on
 * the welcome, then drifts up and dims so the later pages read cleanly.
 */
function Aurora({ welcome }: { welcome: boolean }) {
  const reduced = useMotionPreference()
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute left-1/2 top-0 h-0 w-0"
        initial={false}
        animate={
          welcome
            ? { y: "calc(50vh - 150px)", opacity: 0.26, scale: 1 }
            : { y: -120, opacity: 0.15, scale: 1.35 }
        }
        transition={{ duration: reduced ? 0 : 1.2, ease }}
      >
        {GLOWS.map((glow) => (
          <motion.div
            key={glow.color}
            className="absolute rounded-full"
            style={{
              width: glow.size,
              height: glow.size,
              left: glow.x - glow.size / 2,
              top: glow.y - glow.size / 2,
              background: `radial-gradient(closest-side, ${glow.color}, color-mix(in srgb, ${glow.color} 35%, transparent) 45%, transparent)`,
            }}
            initial={false}
            animate={
              reduced
                ? { x: 0, y: 0 }
                : { x: [0, glow.drift, 0, -glow.drift, 0], y: [0, -glow.drift, 0, glow.drift, 0] }
            }
            transition={
              reduced
                ? { duration: 0 }
                : { duration: glow.seconds, ease: "easeInOut", repeat: Infinity }
            }
          />
        ))}
      </motion.div>
    </div>
  )
}

/**
 * The first-run guide fills the window. It welcomes, shows the agents this computer already has
 * and which one to start with, lets the person pick a look, then opens a first thread wherever
 * they choose to work.
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
  const step: OnboardingStep = ONBOARDING_STEPS[index] ?? "welcome"
  const [pickedAgent, setPickedAgent] = useState<string | null>(null)
  /** What the Start page is opening: `project` or `home`. */
  const [opening, setOpening] = useState<string | null>(null)
  const [skipping, setSkipping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Opening the guide again from Settings starts from the host's current state.
  useEffect(() => {
    void client.invalidateQueries({ queryKey: queryKeys.snapshot })
  }, [client])

  const providers = onboardingProviders(snapshot.providers)
  const statuses = useAgentStatuses(providers, step === "agents")
  const readyIds = new Set(
    providers
      .filter((provider) => provider.enabled && statuses.get(provider.id)?.availability === "ready")
      .map((provider) => provider.id),
  )
  const agentId = startingAgentId(providers, readyIds, pickedAgent)
  const agent = providers.find((provider) => provider.id === agentId) ?? null
  const busy = opening !== null || skipping

  const goTo = (next: number) => {
    setError(null)
    setDirection(next > index ? 1 : -1)
    setIndex(Math.min(Math.max(next, 0), ONBOARDING_STEPS.length - 1))
  }

  const fail = (cause: unknown) => setError(errorMessage(cause))

  const changeSettings = (input: Parameters<typeof window.meldshell.setAppSettings>[0]) =>
    void host(() => window.meldshell.setAppSettings(input)).catch(fail)

  // The flag is stored before the guide leaves, so a quick restart never shows it again.
  const skip = () => {
    setSkipping(true)
    host(() => window.meldshell.setAppSettings({ onboarded: true }))
      .then(closeOnboarding)
      .catch((cause: unknown) => {
        fail(cause)
        setSkipping(false)
      })
  }

  /** Opens the first thread in a workspace, on the chosen agent, and hands over to its composer. */
  const startIn = async (current: AppSnapshot, workspaceId: string) => {
    let threadId = draftThreadIn(current, workspaceId)?.id
    if (threadId === undefined) {
      const known = new Set(current.threads.map((thread) => thread.id))
      const next = await host(() => window.meldshell.createThread({ workspaceId }))
      threadId = next.threads.find((thread) => !known.has(thread.id))?.id
    }
    const modelId = starterModelId(current, agentId)
    if (threadId !== undefined && modelId !== null) {
      const id = threadId
      await host(() => window.meldshell.setThreadSettings({ threadId: id, modelId }))
    }
    await host(() => window.meldshell.setAppSettings({ onboarded: true }))
    closeOnboarding()
    if (threadId !== undefined) {
      onOpenThread(threadId)
      focusComposer(threadId)
    }
  }

  const open = (key: string, choose: () => Promise<string | null>) => {
    setOpening(key)
    setError(null)
    choose()
      .then((workspaceId) => (workspaceId === null ? undefined : startIn(snapshot, workspaceId)))
      .catch(fail)
      .finally(() => setOpening(null))
  }

  const openProject = () =>
    open("project", async () => {
      const known = new Set(snapshot.workspaces.map((entry) => entry.id))
      const next = await host(() => window.meldshell.addWorkspace())
      // Cancelling the folder picker leaves the guide where it was.
      return next.workspaces.find((entry) => !known.has(entry.id))?.id ?? null
    })

  const startHome = () =>
    open("home", async () => {
      const home = snapshot.workspaces.find((entry) => entry.home === true)
      if (home === undefined) throw new Error("The Home workspace is not available yet.")
      return home.id
    })

  const welcome = step === "welcome"
  const last = step === "start"

  const body = (() => {
    switch (step) {
      case "welcome":
        return <WelcomeStep onStart={() => goTo(1)} />
      case "agents":
        return (
          <AgentsStep
            providers={providers}
            statuses={statuses}
            readyCount={readyIds.size}
            platform={platform}
            startingId={agentId}
            onPick={setPickedAgent}
          />
        )
      case "look":
        return <LookStep settings={snapshot.settings} onChange={changeSettings} />
      case "start":
        return (
          <StartStep
            agent={agent}
            busy={opening}
            onOpenProject={openProject}
            onStartHome={startHome}
          />
        )
    }
  })()

  return (
    <motion.main
      aria-label="Set up MeldShell"
      className="absolute inset-0 z-[40] grid grid-cols-[minmax(0,1fr)] grid-rows-[var(--titlebar-height)_minmax(0,_1fr)_auto] text-[var(--text-primary)] text-[13px] leading-[1.45] [container-type:inline-size]"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.3, ease } }}
      transition={{ duration: reduced ? 0 : 0.4, ease }}
    >
      <Aurora welcome={welcome} />
      {/* The window stays draggable above the guide, as it is above the launch screen. */}
      <div className="titlebar relative [-webkit-app-region:drag]" />
      <div className="relative flex min-h-0 flex-col overflow-y-auto overflow-x-hidden [padding:16px_32px_24px]">
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div
            key={step}
            className={cx(
              "w-full min-w-0 [margin:auto]",
              welcome ? "max-w-[640px] -translate-y-[14px]" : "max-w-[600px]",
            )}
            initial={reduced ? false : { opacity: 0, x: 20 * direction, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{
              opacity: 0,
              x: reduced ? 0 : -20 * direction,
              filter: reduced ? "blur(0px)" : "blur(4px)",
              transition: { duration: reduced ? 0 : 0.18, ease },
            }}
            transition={{ duration: reduced ? 0 : 0.34, ease }}
          >
            {body}
            {!welcome && !last && (
              <div className="mt-[32px] flex justify-center">
                <Button
                  variant="primary"
                  autoFocus
                  className={heroButtonClasses}
                  onClick={() => goTo(index + 1)}
                >
                  Continue
                </Button>
              </div>
            )}
            {error !== null && (
              <p
                role="alert"
                className="[margin:16px_0_0] text-center text-[12px] text-[var(--color-deleted)]"
              >
                {error}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <footer className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[16px] [padding:12px_20px_18px]">
        <div>
          {!welcome && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              icon={<ArrowLeft size={13} strokeWidth={1.75} />}
              onClick={() => goTo(index - 1)}
            >
              Back
            </Button>
          )}
        </div>
        {welcome ? <span /> : <StepDots index={index} onSelect={goTo} />}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" disabled={busy} onClick={skip}>
            Skip setup
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
